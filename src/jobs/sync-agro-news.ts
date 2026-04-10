/**
 * Phase 25 — sync-agro-news job module.
 *
 * Logic moved verbatim from src/app/api/cron/sync-agro-news/route.ts.
 * Owns its own logSync + logActivity calls (the route is now a thin
 * wrapper).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logSync } from '@/lib/sync-logger'
import { loadMatchableEntities, matchEntitiesInText, writeEntityMentions } from '@/lib/entity-matcher'
import { isGeminiConfigured, generateEmbeddingBatch } from '@/lib/gemini'
import { extractNormsFromNews } from '@/lib/extract-norms-from-news'
import { logActivityBatch } from '@/lib/activity-log'
import Parser from 'rss-parser'
import type { JobResult } from '@/jobs/types'

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (RSS Reader)' },
})

function categorize(title: string, summary: string): string {
  const text = `${title} ${summary}`.toLowerCase()
  if (/soja|milho|café|açúcar|algodão|commodity|cotaç/.test(text)) return 'commodities'
  if (/recuperação judicial|falência|judicial|tribunal/.test(text)) return 'judicial'
  if (/crédito|financ|banco|selic|juro|cpr|lca|cra|fidc|fiagro|barter/.test(text)) return 'credit'
  if (/boi|vaca|bezerro|gado|pecuarista|suíno|frango|aves|leite|carne|pastagem/.test(text)) return 'livestock'
  if (/tecnolog|inovaç|startup|digital|drone|satelit/.test(text)) return 'technology'
  if (/polític|govern|lei|regulament|mapa|conab/.test(text)) return 'policy'
  if (/sustentab|ambient|carbono|esg|desmat/.test(text)) return 'sustainability'
  return 'general'
}

function generateId(sourceUrl: string): string {
  let hash = 0
  for (let i = 0; i < sourceUrl.length; i++) {
    const char = sourceUrl.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `news-${Math.abs(hash).toString(36)}`
}

interface NewsSourceRow {
  id: string
  name: string
  rss_url: string | null
  source_type: string
  enabled: boolean
}

export async function runSyncAgroNews(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    let totalNew = 0
    let totalSkipped = 0
    let totalMentions = 0
    let totalNormsDetected = 0
    const errors: string[] = []
    const newItemsToEmbed: Array<{
      id: string
      title: string
      summary: string | null
      source_url: string
      category: string
      tags: string[]
      published_at: string
      confidentiality?: string
      textToEmbed: string
    }> = []
    const hasGemini = isGeminiConfigured()

    const { data: sources, error: sourcesError } = await supabase
      .from('news_sources')
      .select('id, name, rss_url, source_type, enabled')
      .eq('enabled', true)
      .eq('source_type', 'rss')

    if (sourcesError) throw new Error(`failed to load news_sources: ${sourcesError.message}`)
    const rssSources = (sources || []) as NewsSourceRow[]

    const { data: producers } = await supabase
      .from('highlighted_producers')
      .select('*')
      .eq('active', true)

    const producerKeywords = (producers || []).flatMap((p: any) =>
      p.keywords.map((kw: string) => ({ name: p.name, keyword: kw.toLowerCase() })),
    )

    const matchableEntities = await loadMatchableEntities(supabase)

    for (const source of rssSources) {
      if (!source.rss_url) continue
      try {
        const feed = await parser.parseURL(source.rss_url)
        const items = feed.items.slice(0, 20)

        for (const item of items) {
          if (!item.link) continue
          const title = item.title?.trim() || ''
          const summary = item.contentSnippet?.slice(0, 500) || item.content?.slice(0, 500) || ''
          const textForMatch = `${title} ${summary}`.toLowerCase()

          const matchedProducers = producerKeywords
            .filter((pk: { keyword: string }) => textForMatch.includes(pk.keyword))
            .map((pk: { name: string }) => pk.name)
          const uniqueProducers = [...new Set(matchedProducers)]

          const newsItem = {
            id: generateId(item.link),
            title,
            summary: summary || null,
            source_name: source.name,
            source_url: item.link,
            image_url: item.enclosure?.url || null,
            published_at: item.isoDate || new Date().toISOString(),
            category: categorize(title, summary),
            tags: item.categories?.slice(0, 5) || [],
            mentions_producer: uniqueProducers.length > 0,
            producer_names: uniqueProducers,
          }

          const { error } = await supabase
            .from('agro_news')
            .upsert(newsItem, { onConflict: 'source_url', ignoreDuplicates: true })

          if (error) {
            totalSkipped++
          } else {
            totalNew++
            if (hasGemini) {
              newItemsToEmbed.push({
                id: newsItem.id,
                title: newsItem.title,
                summary: newsItem.summary,
                source_url: newsItem.source_url,
                category: newsItem.category,
                tags: newsItem.tags,
                published_at: newsItem.published_at,
                textToEmbed: `${newsItem.title} ${newsItem.summary || ''}`,
              })
            }
            const entityUids = matchEntitiesInText(`${title} ${summary}`, matchableEntities)
            if (entityUids.length > 0) {
              totalMentions += await writeEntityMentions(supabase, {
                entityUids,
                sourceTable: 'agro_news',
                sourceId: newsItem.id,
                mentionType: 'mentioned',
                extractedBy: 'regex_v1',
              })
            }

            const normCandidates = extractNormsFromNews({
              title,
              summary,
              source_url: item.link,
              published_at: item.isoDate,
            })
            if (normCandidates.length > 0) {
              const normRows = normCandidates.map((c) => ({
                id: c.id,
                body: c.body,
                norm_type: c.norm_type,
                norm_number: c.norm_number,
                title: c.title,
                summary: c.summary,
                published_at: c.published_at,
                effective_at: null,
                impact_level: c.impact_level,
                affected_areas: c.affected_areas,
                affected_cnaes: c.affected_cnaes,
                source_url: c.source_url,
              }))
              const { error: normErr } = await supabase
                .from('regulatory_norms')
                .upsert(normRows, { onConflict: 'id', ignoreDuplicates: false })
              if (!normErr) {
                totalNormsDetected += normRows.length
                await logActivityBatch(supabase, normRows.map((nr) => ({
                  action: 'upsert' as const,
                  target_table: 'regulatory_norms',
                  target_id: nr.id,
                  source: 'sync-agro-news:norm_extractor',
                  source_kind: 'cron' as const,
                  actor: 'cron',
                  summary: `${nr.title} (detected in news)`.slice(0, 200),
                  metadata: { news_url: item.link, body: nr.body, norm_type: nr.norm_type },
                })))
              }
            }
          }
        }

        await supabase
          .from('news_sources')
          .update({
            last_fetched_at: new Date().toISOString(),
            last_error: null,
            error_count: 0,
          })
          .eq('id', source.id)
      } catch (e: any) {
        const msg = e?.message || String(e)
        errors.push(`${source.name}: ${msg}`)
        try {
          const { data: cur } = await supabase
            .from('news_sources')
            .select('error_count')
            .eq('id', source.id)
            .maybeSingle()
          await supabase
            .from('news_sources')
            .update({
              last_error: msg.slice(0, 500),
              error_count: ((cur?.error_count as number | undefined) ?? 0) + 1,
              last_fetched_at: new Date().toISOString(),
            })
            .eq('id', source.id)
        } catch {}
      }
    }

    let knowledgeCount = 0
    if (newItemsToEmbed.length > 0 && hasGemini) {
      try {
        const batchSize = 20
        for (let i = 0; i < newItemsToEmbed.length; i += batchSize) {
          const batch = newItemsToEmbed.slice(i, i + batchSize)
          const embeddings = await generateEmbeddingBatch(batch.map((it) => it.textToEmbed))
          const knowledgeItems = batch.map((it, idx) => ({
            tier: 2,
            title: it.title,
            summary: it.summary,
            source_type: 'news',
            source_table: 'agro_news',
            source_id: it.id,
            source_url: it.source_url,
            category: it.category,
            tags: it.tags,
            published_at: it.published_at,
            embedding: `[${embeddings[idx].join(',')}]`,
            confidentiality: it.confidentiality || 'public',
          }))
          const { error: kError } = await supabase
            .from('knowledge_items')
            .upsert(knowledgeItems, { onConflict: 'source_table,source_id' })
          if (!kError) knowledgeCount += batch.length
        }
      } catch (e: any) {
        errors.push(`Knowledge Base Ingestion: ${e.message}`)
      }
    }

    const finishedAt = new Date().toISOString()
    const status = errors.length === 0 ? 'success' : totalNew > 0 ? 'partial' : 'error'

    await logSync(supabase, {
      source: 'sync-agro-news',
      started_at: startedAt,
      finished_at: finishedAt,
      records_fetched: totalNew + totalSkipped,
      records_inserted: totalNew,
      errors: errors.length,
      status,
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
    })

    return {
      ok: status !== 'error',
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: totalNew + totalSkipped,
      recordsUpdated: totalNew,
      errors,
      stats: {
        new: totalNew,
        skipped: totalSkipped,
        knowledge_ingested: knowledgeCount,
        entity_mentions: totalMentions,
        norms_detected: totalNormsDetected,
        sources: rssSources.length,
      },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logSync(supabase, {
        source: 'sync-agro-news',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        records_fetched: 0, records_inserted: 0, errors: 1,
        status: 'error',
        error_message: message,
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
