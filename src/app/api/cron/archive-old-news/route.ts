import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

const ARCHIVE_THRESHOLD_MONTHS = 3
const EMBEDDING_MODEL = 'text-embedding-3-small'
const SUMMARY_MODEL = 'gpt-4o-mini'

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
  const month = row.published_at.slice(0, 7) // "2026-01"
  return `${row.category || 'general'}|${row.source_name}|${month}`
}

async function summarizeGroup(
  openai: OpenAI,
  articles: NewsRow[],
  category: string,
  source: string,
  period: string
): Promise<{ summary: string; key_topics: string[] }> {
  const articleList = articles
    .map((a) => `- ${a.title}${a.summary ? `: ${a.summary.slice(0, 150)}` : ''}`)
    .join('\n')

  const response = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    temperature: 0.3,
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content:
          'You are an agribusiness market analyst. Summarize news articles into a concise knowledge entry. ' +
          'Output JSON with "summary" (2-3 paragraph overview in Portuguese) and "key_topics" (array of 5-10 key topic strings in Portuguese).',
      },
      {
        role: 'user',
        content: `Summarize these ${articles.length} articles from ${source} in category "${category}" for ${period}:\n\n${articleList}`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  try {
    const parsed = JSON.parse(response.choices[0].message.content || '{}')
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

async function generateEmbedding(openai: OpenAI, text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  })
  return response.data[0].embedding
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey || openaiKey.includes('your_')) {
    return NextResponse.json({
      success: false,
      message: 'OPENAI_API_KEY not configured — skipping archival',
    })
  }

  try {
    const supabase = createAdminClient()
    const openai = new OpenAI({ apiKey: openaiKey })
    const cutoff = getArchiveCutoff()

    // 1. Fetch old news
    const { data: oldNews, error: fetchError } = await supabase
      .from('agro_news')
      .select('id, title, summary, source_name, category, published_at, tags')
      .lt('published_at', cutoff)
      .order('published_at')

    if (fetchError) throw fetchError
    if (!oldNews || oldNews.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No news older than 3 months to archive',
        archived: 0,
        deleted: 0,
      })
    }

    // 2. Group by category + source + month
    const groups = new Map<string, NewsRow[]>()
    for (const row of oldNews) {
      const key = groupKey(row)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    let archived = 0
    let deleted = 0
    const errors: string[] = []

    // 3. Summarize each group, embed, and store
    for (const [key, articles] of groups) {
      try {
        const [category, source, month] = key.split('|')
        const dates = articles.map((a) => a.published_at).sort()
        const periodStart = dates[0].split('T')[0]
        const periodEnd = dates[dates.length - 1].split('T')[0]

        // Summarize with LLM
        const { summary, key_topics } = await summarizeGroup(openai, articles, category, source, month)

        // Generate embedding from summary
        const embeddingText = `${category} ${source} ${month}: ${summary} ${key_topics.join(', ')}`
        const embedding = await generateEmbedding(openai, embeddingText)

        // Store knowledge entry
        const knowledgeId = `knowledge-${category}-${source}-${month}`.toLowerCase().replace(/\s+/g, '-')
        const { error: insertError } = await supabase.from('news_knowledge').upsert({
          id: knowledgeId,
          period_start: periodStart,
          period_end: periodEnd,
          category,
          source_name: source,
          summary,
          key_topics: key_topics,
          article_count: articles.length,
          embedding: `[${embedding.join(',')}]`,
        }, { onConflict: 'id' })

        if (insertError) {
          errors.push(`Store ${key}: ${insertError.message}`)
          continue
        }

        archived += articles.length

        // 4. Delete archived news rows
        const ids = articles.map((a) => a.id)
        const { error: deleteError } = await supabase
          .from('agro_news')
          .delete()
          .in('id', ids)

        if (deleteError) {
          errors.push(`Delete ${key}: ${deleteError.message}`)
        } else {
          deleted += ids.length
        }
      } catch (e: any) {
        errors.push(`${key}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'News archival completed',
      timestamp: new Date().toISOString(),
      stats: {
        total_old: oldNews.length,
        groups: groups.size,
        archived,
        deleted,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error archiving news:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to archive news' },
      { status: 500 }
    )
  }
}
