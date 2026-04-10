/**
 * Phase 25 — archive-old-news job module.
 * Logic moved from src/app/api/cron/archive-old-news/route.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isGeminiConfigured, generateEmbedding, summarizeText } from '@/lib/gemini'
import { logActivity } from '@/lib/activity-log'
import type { JobResult } from '@/jobs/types'

const ARCHIVE_THRESHOLD_MONTHS = 3

interface NewsRow {
  id: string
  title: string
  summary: string | null
  source_name: string
  category: string | null
  published_at: string
  tags: string[]
}

function getArchiveCutoff(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - ARCHIVE_THRESHOLD_MONTHS)
  return d.toISOString()
}

function groupKey(row: NewsRow): string {
  const month = row.published_at.slice(0, 7)
  return `${row.category || 'general'}|${row.source_name}|${month}`
}

async function summarizeGroup(
  articles: NewsRow[],
  category: string,
  source: string,
  period: string,
): Promise<{ summary: string; key_topics: string[] }> {
  const articleList = articles
    .map((a) => `- ${a.title}${a.summary ? `: ${a.summary.slice(0, 150)}` : ''}`)
    .join('\n')
  const systemPrompt =
    'You are an agribusiness market analyst. Summarize news articles into a concise knowledge entry. ' +
    'Output JSON with "summary" (2-3 paragraph overview in Portuguese) and "key_topics" (array of 5-10 key topic strings in Portuguese).'
  const userPrompt = `Summarize these ${articles.length} articles from ${source} in category "${category}" for ${period}:\n\n${articleList}`
  try {
    const raw = await summarizeText(systemPrompt, userPrompt)
    const parsed = JSON.parse(raw)
    return {
      summary: parsed.summary || `${articles.length} articles from ${source} in ${category} (${period})`,
      key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics : [],
    }
  } catch {
    return {
      summary: `Archived ${articles.length} articles from ${source} in category ${category} for period ${period}.`,
      key_topics: [...new Set(articles.flatMap((a) => a.tags || []))].slice(0, 10),
    }
  }
}

export async function runArchiveOldNews(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  if (!isGeminiConfigured()) {
    return {
      ok: true,
      status: 'success',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [],
      stats: { skipped: 'GEMINI_API_KEY not configured' },
    }
  }

  try {
    const cutoff = getArchiveCutoff()
    const { data: oldNews, error: fetchError } = await supabase
      .from('agro_news')
      .select('id, title, summary, source_name, category, published_at, tags')
      .lt('published_at', cutoff)
      .order('published_at')

    if (fetchError) throw fetchError
    if (!oldNews || oldNews.length === 0) {
      return {
        ok: true, status: 'success', startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtDate.getTime(),
        recordsFetched: 0, recordsUpdated: 0, errors: [],
        stats: { archived: 0, deleted: 0 },
      }
    }

    const groups = new Map<string, NewsRow[]>()
    for (const row of oldNews) {
      const key = groupKey(row)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    let archived = 0
    let deleted = 0
    const errors: string[] = []

    for (const [key, articles] of groups) {
      try {
        const [category, source, month] = key.split('|')
        const dates = articles.map((a) => a.published_at).sort()
        const periodStart = dates[0].split('T')[0]
        const periodEnd = dates[dates.length - 1].split('T')[0]
        const { summary, key_topics } = await summarizeGroup(articles, category, source, month)
        const embeddingText = `${category} ${source} ${month}: ${summary} ${key_topics.join(', ')}`
        const embedding = await generateEmbedding(embeddingText)
        const knowledgeId = `knowledge-${category}-${source}-${month}`.toLowerCase().replace(/\s+/g, '-')
        const { error: insertError } = await supabase.from('news_knowledge').upsert({
          id: knowledgeId,
          period_start: periodStart,
          period_end: periodEnd,
          category,
          source_name: source,
          summary,
          key_topics,
          article_count: articles.length,
          embedding: `[${embedding.join(',')}]`,
        }, { onConflict: 'id' })

        if (insertError) {
          errors.push(`Store ${key}: ${insertError.message}`)
          continue
        }
        archived += articles.length

        const ids = articles.map((a) => a.id)
        const { error: deleteError } = await supabase
          .from('agro_news')
          .delete()
          .in('id', ids)

        if (deleteError) errors.push(`Delete ${key}: ${deleteError.message}`)
        else deleted += ids.length
      } catch (e: any) {
        errors.push(`${key}: ${e.message}`)
      }
    }

    const finishedAt = new Date().toISOString()
    const status = errors.length === 0 ? 'success' : 'partial'

    await logActivity(supabase, {
      action: 'upsert',
      target_table: 'news_knowledge',
      source: 'archive-old-news',
      source_kind: 'cron',
      actor: 'cron',
      summary: `Arquivo: ${groups.size} grupo(s) resumido(s) cobrindo ${archived} artigo(s)`,
      metadata: { status, groups: groups.size, archived, errors: errors.length },
    })
    if (deleted > 0) {
      await logActivity(supabase, {
        action: 'delete',
        target_table: 'agro_news',
        source: 'archive-old-news',
        source_kind: 'cron',
        actor: 'cron',
        summary: `Arquivo: ${deleted} notícia(s) antigas removidas após resumo`,
        metadata: { deleted },
      })
    }

    return {
      ok: true,
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: oldNews.length,
      recordsUpdated: archived,
      errors,
      stats: { total_old: oldNews.length, groups: groups.size, archived, deleted },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logActivity(supabase, {
        action: 'upsert',
        target_table: 'news_knowledge',
        source: 'archive-old-news',
        source_kind: 'cron',
        actor: 'cron',
        summary: `archive-old-news falhou: ${message}`.slice(0, 200),
        metadata: { status: 'error', error: message },
      })
    } catch {}
    return {
      ok: false,
      status: 'error',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [message],
    }
  }
}
