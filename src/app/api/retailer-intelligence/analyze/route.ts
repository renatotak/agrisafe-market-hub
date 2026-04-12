import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isGeminiConfigured, analyzeRetailer, generateEmbedding } from '@/lib/gemini'

export const dynamic = 'force-dynamic'

/**
 * POST /api/retailer-intelligence/analyze
 * On-demand AI analysis for a single retailer (bypasses batch queue).
 * Body: { cnpj_raiz: string, entity_uid?: string }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { cnpj_raiz, entity_uid } = body

  if (!cnpj_raiz && !entity_uid) {
    return NextResponse.json({ error: 'cnpj_raiz or entity_uid required' }, { status: 400 })
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  try {
    const supabase = createAdminClient()

    // Load retailer — prefer entity_uid lookup
    let retQuery = supabase
      .from('retailers')
      .select('cnpj_raiz, entity_uid, razao_social, nome_fantasia, consolidacao, grupo_acesso, classificacao, faixa_faturamento, capital_social, porte_name')
    if (entity_uid) retQuery = retQuery.eq('entity_uid', entity_uid)
    else retQuery = retQuery.eq('cnpj_raiz', cnpj_raiz)

    const { data: retailer, error: retError } = await retQuery.maybeSingle()

    if (retError || !retailer) {
      return NextResponse.json({ error: 'Retailer not found' }, { status: 404 })
    }

    // Resolve both keys for downstream queries
    const resolvedCnpjRaiz = retailer.cnpj_raiz
    const resolvedEntityUid = retailer.entity_uid

    const name = retailer.nome_fantasia || retailer.consolidacao || retailer.razao_social

    // Gather context
    const [
      { data: newsMatches },
      { data: eventMatches },
      { count: branchCount },
      { data: prevIntel },
      { data: indRels },
      { data: research },
    ] = await Promise.all([
      supabase.from('agro_news')
        .select('id, title, published_at, source_name')
        .or(`title.ilike.%${name}%,summary.ilike.%${name}%`)
        .order('published_at', { ascending: false })
        .limit(10),
      supabase.from('events')
        .select('id, name, date, location')
        .or(`name.ilike.%${name}%,description_pt.ilike.%${name}%`)
        .limit(5),
      supabase.from('retailer_locations')
        .select('id', { count: 'exact', head: true })
        .eq('cnpj_raiz', resolvedCnpjRaiz),
      supabase.from('retailer_intelligence')
        .select('branch_count_current')
        .eq('cnpj_raiz', cnpj_raiz)
        .maybeSingle(),
      supabase.from('retailer_industries')
        .select('industry_id')
        .eq('cnpj_raiz', resolvedCnpjRaiz),
      supabase.from('company_research')
        .select('findings, summary')
        .eq('cnpj_basico', resolvedCnpjRaiz)
        .order('searched_at', { ascending: false })
        .limit(1),
    ])

    const prevBranches = prevIntel?.branch_count_current || 0
    const currentBranches = branchCount || 0
    const branchDelta = currentBranches - prevBranches

    // Resolve industry names from IDs
    const industryIds = (indRels || []).map((r: any) => r.industry_id)
    let industries: string[] = []
    if (industryIds.length > 0) {
      const { data: indNames } = await supabase
        .from('industries')
        .select('id, name_display')
        .in('id', industryIds)
      industries = (indNames || []).map((i: any) => i.name_display || i.id)
    }
    const webFindings = (research?.[0]?.findings || [])
      .map((f: any) => `${f.title}: ${f.snippet}`)
      .slice(0, 5)

    // Run Gemini analysis
    const analysis = await analyzeRetailer({
      retailer: {
        name,
        razao_social: retailer.razao_social,
        grupo: retailer.grupo_acesso,
        classificacao: retailer.classificacao,
        faturamento: retailer.faixa_faturamento,
        capital_social: retailer.capital_social,
        porte: retailer.porte_name,
      },
      industries,
      newsHeadlines: (newsMatches || []).map(n => `[${n.published_at?.slice(0, 10)}] ${n.title} (${n.source_name})`),
      events: (eventMatches || []).map(e => `${e.name} — ${e.date} — ${e.location}`),
      branchCount: currentBranches,
      branchDelta,
      webFindings,
    })

    // Generate embedding
    const embeddingText = `${name} ${retailer.grupo_acesso || ''} ${analysis.executive_summary}`.slice(0, 8000)
    const embedding = await generateEmbedding(embeddingText)

    // Detect new branches
    let newBranches: any[] = []
    if (branchDelta > 0 && prevBranches > 0) {
      const { data: allLocs } = await supabase
        .from('retailer_locations')
        .select('cnpj, municipio, uf')
        .eq('cnpj_raiz', cnpj_raiz)
        .order('id', { ascending: false })
        .limit(branchDelta)
      newBranches = (allLocs || []).map(l => ({
        cnpj: l.cnpj,
        municipio: l.municipio,
        uf: l.uf,
        detected_at: new Date().toISOString(),
      }))
    }

    // Upsert intelligence
    const record = {
      cnpj_raiz: resolvedCnpjRaiz,
      entity_uid: resolvedEntityUid,
      executive_summary: analysis.executive_summary,
      market_position: analysis.market_position,
      risk_signals: analysis.risk_signals,
      growth_signals: analysis.growth_signals,
      news_mentions: newsMatches?.length || 0,
      recent_news: (newsMatches || []).slice(0, 5).map(n => ({
        news_id: n.id,
        title: n.title,
        date: n.published_at,
      })),
      event_connections: (eventMatches || []).map(e => ({
        event_id: e.id,
        name: e.name,
        date: e.date,
      })),
      financial_instruments: analysis.financial_instruments,
      branch_count_current: currentBranches,
      branch_count_previous: prevBranches,
      branch_expansion_detected: branchDelta > 0,
      new_branches: newBranches,
      embedding: `[${embedding.join(',')}]`,
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase
      .from('retailer_intelligence')
      .upsert(record, { onConflict: 'cnpj_raiz' })

    if (upsertError) throw upsertError

    return NextResponse.json({
      success: true,
      cnpj_raiz: resolvedCnpjRaiz,
      entity_uid: resolvedEntityUid,
      intelligence: record,
    })
  } catch (error: any) {
    console.error('Error analyzing retailer:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Analysis failed' },
      { status: 500 }
    )
  }
}
