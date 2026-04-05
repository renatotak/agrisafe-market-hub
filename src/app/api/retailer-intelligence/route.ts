import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/retailer-intelligence?cnpj_raiz=12345678
 * Returns AI intelligence, industry relationships, and recent news for a retailer.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cnpjRaiz = searchParams.get('cnpj_raiz')

  if (!cnpjRaiz) {
    return NextResponse.json({ error: 'cnpj_raiz required' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    // Fetch intelligence
    const { data: intelligence } = await supabase
      .from('retailer_intelligence')
      .select('*')
      .eq('cnpj_raiz', cnpjRaiz)
      .maybeSingle()

    // Fetch industry relationships
    const { data: indRels } = await supabase
      .from('retailer_industries')
      .select('industry_id, relationship_type, source, confidence')
      .eq('cnpj_raiz', cnpjRaiz)

    // Resolve industry details
    const industryIds = (indRels || []).map((r: any) => r.industry_id)
    let industryDetails: Record<string, any> = {}
    if (industryIds.length > 0) {
      const { data: indData } = await supabase
        .from('industries')
        .select('id, name, name_display, segment, website')
        .in('id', industryIds)
      for (const ind of indData || []) {
        industryDetails[ind.id] = ind
      }
    }
    let productCounts: Record<string, number> = {}
    if (industryIds.length > 0) {
      const { data: counts } = await supabase
        .from('industry_products')
        .select('industry_id')
        .in('industry_id', industryIds)

      for (const c of counts || []) {
        productCounts[c.industry_id] = (productCounts[c.industry_id] || 0) + 1
      }
    }

    // Real-time news check (supplement the cached intelligence)
    const { data: retailer } = await supabase
      .from('retailers')
      .select('nome_fantasia, consolidacao, razao_social')
      .eq('cnpj_raiz', cnpjRaiz)
      .maybeSingle()

    const name = retailer?.nome_fantasia || retailer?.consolidacao || retailer?.razao_social || ''
    let liveNews: any[] = []
    if (name.length > 2) {
      const { data: news } = await supabase
        .from('agro_news')
        .select('id, title, published_at, source_name, source_url')
        .or(`title.ilike.%${name}%,summary.ilike.%${name}%`)
        .order('published_at', { ascending: false })
        .limit(10)
      liveNews = news || []
    }

    return NextResponse.json({
      intelligence: intelligence || null,
      industries: (indRels || []).map((r: any) => ({
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
