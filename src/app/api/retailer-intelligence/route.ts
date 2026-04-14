import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/retailer-intelligence?cnpj_raiz=12345678
 *      /api/retailer-intelligence?entity_uid=<uuid>
 *
 * Returns AI intelligence, industry relationships, and recent news for a
 * retailer. Phase 17E: news lookup is now driven by `entity_mentions`
 * (deterministic JOIN) instead of an ILIKE substring scan over agro_news.
 * Either query parameter is accepted; entity_uid takes precedence.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const entityUidParam = searchParams.get('entity_uid')
  const cnpjRaiz = searchParams.get('cnpj_raiz')

  if (!entityUidParam && !cnpjRaiz) {
    return NextResponse.json({ error: 'entity_uid or cnpj_raiz required' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    // ─── Resolve entity_uid up front ────────────────────────
    // Caller may pass either key. We prefer entity_uid; otherwise look up
    // legal_entities by tax_id (= cnpj_raiz). The legacy cnpj_raiz column
    // on satellite tables is still used as a fallback when the row hasn't
    // been re-keyed yet.
    let entityUid: string | null = entityUidParam ?? null
    if (!entityUid && cnpjRaiz) {
      const { data: ent } = await supabase
        .from('legal_entities')
        .select('entity_uid')
        .eq('tax_id', cnpjRaiz)
        .maybeSingle()
      entityUid = ent?.entity_uid ?? null
    }

    // Fetch intelligence — using entity_uid lookup
    let intelligence: any = null
    if (entityUid) {
      const { data } = await supabase
        .from('retailer_intelligence')
        .select('*')
        .eq('entity_uid', entityUid)
        .maybeSingle()
      intelligence = data
    }

    // ─── Industry relationships ─────────────────────────────
    let indRels: any[] = []
    if (entityUid) {
      const { data } = await supabase
        .from('retailer_industries')
        .select('industry_id, relationship_type, source, confidence')
        .eq('retailer_entity_uid', entityUid)
      indRels = data || []
    }

    const industryIds = indRels.map((r: any) => r.industry_id)
    const industryDetails: Record<string, any> = {}
    if (industryIds.length > 0) {
      const { data: indData } = await supabase
        .from('industries')
        .select('id, name, name_display, segment, website')
        .in('id', industryIds)
      for (const ind of indData || []) {
        industryDetails[ind.id] = ind
      }
    }
    const productCounts: Record<string, number> = {}
    if (industryIds.length > 0) {
      const { data: counts } = await supabase
        .from('industry_products')
        .select('industry_id')
        .in('industry_id', industryIds)
      for (const c of counts || []) {
        productCounts[c.industry_id] = (productCounts[c.industry_id] || 0) + 1
      }
    }

    // ─── News mentions (Phase 17E: entity_mentions-driven) ──
    // Replace the legacy ILIKE substring scan over agro_news with a clean
    // JOIN through entity_mentions. The matcher cron has already done the
    // hard work; we just look up rows by entity_uid.
    let liveNews: any[] = []
    if (entityUid) {
      const { data: mentions } = await supabase
        .from('entity_mentions')
        .select('source_id')
        .eq('entity_uid', entityUid)
        .eq('source_table', 'agro_news')
      const newsIds = (mentions || []).map((m: any) => m.source_id)
      if (newsIds.length > 0) {
        const { data: news } = await supabase
          .from('agro_news')
          .select('id, title, published_at, source_name, source_url')
          .in('id', newsIds)
          .order('published_at', { ascending: false })
          .limit(10)
        liveNews = news || []
      }
    }

    return NextResponse.json({
      entity_uid: entityUid,
      intelligence: intelligence || null,
      industries: indRels.map((r: any) => ({
        ...(industryDetails[r.industry_id] || { id: r.industry_id, name: r.industry_id }),
        relationship_type: r.relationship_type,
        source: r.source,
        confidence: r.confidence,
        product_count: productCounts[r.industry_id] || 0,
      })),
      live_news: liveNews,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
