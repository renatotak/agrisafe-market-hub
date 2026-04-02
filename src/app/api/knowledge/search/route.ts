import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Semantic search across the knowledge base.
 * GET /api/knowledge/search?q=credito+rural&tier=1,2&limit=10
 *
 * When embeddings are available (Phase 17), this will use pgvector similarity search.
 * For now, uses keyword-based text search across knowledge_items.
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

    // Keyword-based search (until embeddings are available)
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
      search_type: 'keyword', // will be 'semantic' when embeddings are active
    })
  } catch (error: any) {
    return NextResponse.json(
      { results: [], total: 0, error: error.message },
      { status: 500 }
    )
  }
}
