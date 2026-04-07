import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { logSync } from '@/lib/sync-logger'
import { loadMatchableEntities, matchEntitiesInText, writeEntityMentions } from '@/lib/entity-matcher'
import { isGeminiConfigured, generateEmbeddingBatch } from '@/lib/gemini'
import Parser from 'rss-parser'

export const dynamic = 'force-dynamic'

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'AgriSafe-MarketHub/1.0 (RSS Reader)',
  },
})

// Order matters: the FIRST match wins. credit/judicial precede livestock so that
// articles mentioning the institutional name "Ministério da Agricultura e Pecuária"
// in a credit or RJ context don't get tagged livestock by accident. Kept in sync
// with the duplicate inside src/app/api/reading-room/ingest/route.ts.
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
  // Simple hash from URL
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

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const startedAt = new Date().toISOString()

  try {
    const supabase = createAdminClient()
    let totalNew = 0
    let totalSkipped = 0
    let totalMentions = 0
    const errors: string[] = []
    // Phase 18: collect new articles for batch embedding (gated on Gemini config)
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

    // ─── Phase 22: load source list from news_sources table ──
    // Replaces the old hardcoded `NEWS_SOURCES` import. Only RSS sources
    // with enabled=true are polled here; the Reading Room sentinel row
    // is fed via /api/reading-room/ingest from the Chrome extension.
    const { data: sources, error: sourcesError } = await supabase
      .from('news_sources')
      .select('id, name, rss_url, source_type, enabled')
      .eq('enabled', true)
      .eq('source_type', 'rss')

    if (sourcesError) {
      throw new Error(`failed to load news_sources: ${sourcesError.message}`)
    }
    const rssSources = (sources || []) as NewsSourceRow[]

    // Fetch highlighted producers for matching
    const { data: producers } = await supabase
      .from('highlighted_producers')
      .select('*')
      .eq('active', true)

    const producerKeywords = (producers || []).flatMap((p: any) =>
      p.keywords.map((kw: string) => ({ name: p.name, keyword: kw.toLowerCase() }))
    )

    // Load all matchable legal_entities once for entity_mentions detection
    // (Phase 17D — algorithm-first name matching, no LLM).
    const matchableEntities = await loadMatchableEntities(supabase)

    for (const source of rssSources) {
      if (!source.rss_url) continue
      try {
        const feed = await parser.parseURL(source.rss_url)
        const items = feed.items.slice(0, 20) // Latest 20 per source

        for (const item of items) {
          if (!item.link) continue

          const title = item.title?.trim() || ''
          const summary = item.contentSnippet?.slice(0, 500) || item.content?.slice(0, 500) || ''
          const textForMatch = `${title} ${summary}`.toLowerCase()

          // Check producer mentions
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
            // Phase 18: queue for batch embedding into knowledge_items
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
            // Algorithm-first entity mention detection: find known legal_entities
            // whose names appear in the article text, write to entity_mentions.
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
          }
        }

        // ─── Phase 22: mark source healthy ───────────────────
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
        // ─── Phase 22: bump error counter ────────────────────
        try {
          // Read current count to increment atomically-ish (Hobby plan: no
          // pg_function call needed for a single counter on a tiny table).
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
        } catch {
          // not fatal
        }
      }
    }

    // Phase 18: Hot Knowledge Ingestion — embed and write to knowledge_items
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

    await logSync(supabase, {
      source: 'sync-agro-news',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      records_fetched: totalNew + totalSkipped,
      records_inserted: totalNew,
      errors: errors.length,
      status: errors.length === 0 ? 'success' : totalNew > 0 ? 'partial' : 'error',
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
    })

    return NextResponse.json({
      success: true,
      message: 'Agro news synchronized',
      timestamp: new Date().toISOString(),
      stats: {
        new: totalNew,
        skipped: totalSkipped,
        knowledge_ingested: knowledgeCount,
        entity_mentions: totalMentions,
        sources: rssSources.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error syncing agro news:', error)
    try {
      const supabase = createAdminClient()
      await logSync(supabase, {
        source: 'sync-agro-news',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        records_fetched: 0, records_inserted: 0, errors: 1,
        status: 'error',
        error_message: error.message,
      })
    } catch {}
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync news' },
      { status: 500 }
    )
  }
}
