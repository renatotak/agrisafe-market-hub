import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/industries — list all industries with stats
 * GET /api/industries?id=syngenta — single industry with products + retailers
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  try {
    const supabase = createAdminClient()

    if (id) {
      // Single industry detail
      const { data: industry, error } = await supabase
        .from('industries')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error || !industry) {
        return NextResponse.json({ error: 'Industry not found' }, { status: 404 })
      }

      // Products
      const { data: products } = await supabase
        .from('industry_products')
        .select('*')
        .eq('industry_id', id)
        .order('product_name')

      // Retailer links
      const { data: retailerLinks } = await supabase
        .from('retailer_industries')
        .select('cnpj_raiz, relationship_type')
        .eq('industry_id', id)
        .limit(100)

      // Resolve retailer details
      const cnpjs = (retailerLinks || []).map((r: any) => r.cnpj_raiz)
      let retailerDetails: Record<string, any> = {}
      if (cnpjs.length > 0) {
        const { data: retData } = await supabase
          .from('retailers')
          .select('cnpj_raiz, razao_social, nome_fantasia, consolidacao, grupo_acesso, classificacao')
          .in('cnpj_raiz', cnpjs)
        for (const ret of retData || []) {
          retailerDetails[ret.cnpj_raiz] = ret
        }
      }
      let ufCoverage: string[] = []
      if (cnpjs.length > 0) {
        const { data: locs } = await supabase
          .from('retailer_locations')
          .select('uf')
          .in('cnpj_raiz', cnpjs.slice(0, 200))
          .not('uf', 'is', null)

        ufCoverage = [...new Set((locs || []).map(l => l.uf).filter(Boolean))]
      }

      return NextResponse.json({
        industry,
        products: products || [],
        retailers: (retailerLinks || []).map((r: any) => ({
          cnpj_raiz: r.cnpj_raiz,
          relationship_type: r.relationship_type,
          ...(retailerDetails[r.cnpj_raiz] || {}),
        })),
        stats: {
          product_count: products?.length || 0,
          retailer_count: retailerLinks?.length || 0,
          uf_coverage: ufCoverage,
        },
      })
    }

    // List all industries with counts
    const { data: industries, error: listError } = await supabase
      .from('industries')
      .select('id, name, name_display, segment, headquarters_country, website')
      .order('name')

    if (listError) throw listError

    // Counts per industry
    const { data: prodCounts } = await supabase
      .from('industry_products')
      .select('industry_id')

    const { data: retCounts } = await supabase
      .from('retailer_industries')
      .select('industry_id')

    const prodMap: Record<string, number> = {}
    for (const p of prodCounts || []) {
      prodMap[p.industry_id] = (prodMap[p.industry_id] || 0) + 1
    }
    const retMap: Record<string, number> = {}
    for (const r of retCounts || []) {
      retMap[r.industry_id] = (retMap[r.industry_id] || 0) + 1
    }

    return NextResponse.json({
      industries: (industries || []).map(ind => ({
        ...ind,
        product_count: prodMap[ind.id] || 0,
        retailer_count: retMap[ind.id] || 0,
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
