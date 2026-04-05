import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isGeminiConfigured, analyzeRetailer, generateEmbedding } from '@/lib/gemini'

export const dynamic = 'force-dynamic'

const BATCH_SIZE = 20

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json({
      success: false,
      message: 'GEMINI_API_KEY not configured — skipping retailer intelligence',
    })
  }

  try {
    const supabase = createAdminClient()

    // 1. Pick batch: prioritize A/B classification, oldest analyzed_at first
    const { data: batch, error: batchError } = await supabase
      .from('retailers')
      .select('cnpj_raiz, razao_social, nome_fantasia, consolidacao, grupo_acesso, classificacao, faixa_faturamento, capital_social, porte_name')
      .order('classificacao', { ascending: true })
      .limit(BATCH_SIZE * 3) // oversample to filter

    if (batchError) throw batchError
    if (!batch?.length) {
      return NextResponse.json({ success: true, message: 'No retailers to analyze', analyzed: 0 })
    }

    // Filter to those not recently analyzed (last 30 days)
    const cnpjs = batch.map(r => r.cnpj_raiz)
    const { data: existing } = await supabase
      .from('retailer_intelligence')
      .select('cnpj_raiz, analyzed_at')
      .in('cnpj_raiz', cnpjs)

    const recentlyAnalyzed = new Set(
      (existing || [])
        .filter(e => e.analyzed_at && Date.now() - new Date(e.analyzed_at).getTime() < 30 * 86400000)
        .map(e => e.cnpj_raiz)
    )

    const toAnalyze = batch.filter(r => !recentlyAnalyzed.has(r.cnpj_raiz)).slice(0, BATCH_SIZE)

    let analyzed = 0
    const errors: string[] = []

    for (const retailer of toAnalyze) {
      try {
        const name = retailer.nome_fantasia || retailer.consolidacao || retailer.razao_social

        // Gather context: news mentions
        const { data: newsMatches } = await supabase
          .from('agro_news')
          .select('id, title, published_at, source_name')
          .or(`title.ilike.%${name}%,summary.ilike.%${name}%`)
          .order('published_at', { ascending: false })
          .limit(10)

        // Gather context: events
        const { data: eventMatches } = await supabase
          .from('events')
          .select('id, name, date, location')
          .or(`name.ilike.%${name}%,description_pt.ilike.%${name}%`)
          .limit(5)

        // Branch count
        const { count: branchCount } = await supabase
          .from('retailer_locations')
          .select('id', { count: 'exact', head: true })
          .eq('cnpj_raiz', retailer.cnpj_raiz)

        // Previous branch count from intelligence record
        const { data: prevIntel } = await supabase
          .from('retailer_intelligence')
          .select('branch_count_current')
          .eq('cnpj_raiz', retailer.cnpj_raiz)
          .maybeSingle()

        const prevBranches = prevIntel?.branch_count_current || 0
        const currentBranches = branchCount || 0
        const branchDelta = currentBranches - prevBranches

        // Industry relationships
        const { data: indRels } = await supabase
          .from('retailer_industries')
          .select('industry_id')
          .eq('cnpj_raiz', retailer.cnpj_raiz)

        const industryIds = (indRels || []).map((r: any) => r.industry_id)
        let industries: string[] = []
        if (industryIds.length > 0) {
          const { data: indNames } = await supabase
            .from('industries')
            .select('id, name_display')
            .in('id', industryIds)
          industries = (indNames || []).map((i: any) => i.name_display || i.id)
        }

        // Web search for financial instruments (lightweight — just search titles from research)
        const { data: research } = await supabase
          .from('company_research')
          .select('findings, summary')
          .eq('cnpj_basico', retailer.cnpj_raiz)
          .order('searched_at', { ascending: false })
          .limit(1)

        const webFindings = (research?.[0]?.findings || [])
          .map((f: any) => `${f.title}: ${f.snippet}`)
          .slice(0, 5)

        // Gemini analysis
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

        // Generate embedding from summary
        const embeddingText = `${name} ${retailer.grupo_acesso || ''} ${analysis.executive_summary}`.slice(0, 8000)
        const embedding = await generateEmbedding(embeddingText)

        // Detect new branches
        let newBranches: any[] = []
        if (branchDelta > 0 && prevBranches > 0) {
          const { data: allLocs } = await supabase
            .from('retailer_locations')
            .select('cnpj, municipio, uf')
            .eq('cnpj_raiz', retailer.cnpj_raiz)
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
        const { error: upsertError } = await supabase.from('retailer_intelligence').upsert({
          cnpj_raiz: retailer.cnpj_raiz,
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
        }, { onConflict: 'cnpj_raiz' })

        if (upsertError) {
          errors.push(`${retailer.cnpj_raiz}: ${upsertError.message}`)
        } else {
          analyzed++
        }
      } catch (e: any) {
        errors.push(`${retailer.cnpj_raiz}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Retailer intelligence sync completed',
      timestamp: new Date().toISOString(),
      stats: { batch_size: toAnalyze.length, analyzed, skipped_recent: recentlyAnalyzed.size },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error in sync-retailer-intelligence:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync retailer intelligence' },
      { status: 500 }
    )
  }
}
