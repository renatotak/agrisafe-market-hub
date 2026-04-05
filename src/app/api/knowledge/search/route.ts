import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isGeminiConfigured, generateEmbedding } from '@/lib/gemini'

export const dynamic = 'force-dynamic'

/**
 * Knowledge Base search with semantic + keyword fallback.
 * GET /api/knowledge/search?q=credito+rural&tier=1,2&limit=10
 *
 * When GEMINI_API_KEY is configured, embeds the query and runs
 * pgvector cosine similarity search. Falls back to keyword search.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  const tierFilter = searchParams.get('tier') // comma-separated: "1,2,3"
  const categoryFilter = searchParams.get('category')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [], total: 0, message: 'Query too short' })
  }

  try {
    const supabase = createAdminClient()

    // Semantic search when Gemini is available
    if (isGeminiConfigured()) {
      try {
        const embedding = await generateEmbedding(query)
        const embeddingStr = `[${embedding.join(',')}]`

        // Search knowledge_items via pgvector
        const { data: kiResults, error: kiError } = await supabase.rpc(
          'match_knowledge_items',
          {
            query_embedding: embeddingStr,
            match_threshold: 0.3,
            match_count: limit,
            filter_tiers: tierFilter ? tierFilter.split(',').map(Number) : null,
            filter_category: categoryFilter || null,
          }
        )

        // Also search news_knowledge
        const { data: nkResults } = await supabase.rpc(
          'match_news_knowledge',
          {
            query_embedding: embeddingStr,
            match_threshold: 0.3,
            match_count: Math.min(limit, 10),
          }
        )

        const results = [
          ...((kiResults || []) as any[]).map((r: any) => ({
            ...r,
            _source: 'knowledge_items',
          })),
          ...((nkResults || []) as any[]).map((r: any) => ({
            id: r.id,
            tier: 2,
            title: `${r.category} — ${r.source_name} (${r.period_start} → ${r.period_end})`,
            summary: r.summary,
            source_type: 'archived_news',
            category: r.category,
            tags: r.key_topics || [],
            published_at: r.period_end,
            source_url: null,
            similarity: r.similarity,
            _source: 'news_knowledge',
          })),
        ]

        // Sort by similarity descending
        results.sort((a: any, b: any) => (b.similarity || 0) - (a.similarity || 0))

        if (!kiError && results.length > 0) {
          return NextResponse.json({
            results: results.slice(0, limit),
            total: results.length,
            query,
            search_type: 'semantic',
          })
        }
      } catch (e: any) {
        console.warn('Semantic search failed, falling back to keyword:', e.message)
      }
    }

    // Keyword-based fallback
    let dbQuery = supabase
      .from('knowledge_items')
      .select('id, tier, title, summary, source_type, category, tags, published_at, source_url, data_origin, timing, purpose', { count: 'exact' })
      .or(`title.ilike.%${query}%,content.ilike.%${query}%,summary.ilike.%${query}%`)
      .order('indexed_at', { ascending: false })
      .limit(limit)

    if (tierFilter) {
      const tiers = tierFilter.split(',').map(Number).filter(n => n >= 1 && n <= 4)
      if (tiers.length > 0) dbQuery = dbQuery.in('tier', tiers)
    }

    if (categoryFilter) {
      dbQuery = dbQuery.eq('category', categoryFilter)
    }

    const { data, count, error } = await dbQuery

    if (error) throw error

    return NextResponse.json({
      results: data || [],
      total: count || 0,
      query,
      search_type: 'keyword',
    })
  } catch (error: any) {
    return NextResponse.json(
      { results: [], total: 0, error: error.message },
      { status: 500 }
    )
  }
}
