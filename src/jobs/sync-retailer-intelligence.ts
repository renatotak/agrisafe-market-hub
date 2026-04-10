/**
 * Phase 25 — sync-retailer-intelligence job module.
 * Logic moved from src/app/api/cron/sync-retailer-intelligence/route.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isGeminiConfigured, analyzeRetailer, generateEmbedding } from '@/lib/gemini'
import { logActivity } from '@/lib/activity-log'
import type { JobResult } from '@/jobs/types'

const BATCH_SIZE = 20

export async function runSyncRetailerIntelligence(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  if (!isGeminiConfigured()) {
    return {
      ok: true,
      status: 'success',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [],
      stats: { skipped: 'GEMINI_API_KEY not configured' },
    }
  }

  try {
    const { data: batch, error: batchError } = await supabase
      .from('retailers')
      .select('cnpj_raiz, razao_social, nome_fantasia, consolidacao, grupo_acesso, classificacao, faixa_faturamento, capital_social, porte_name')
      .order('classificacao', { ascending: true })
      .limit(BATCH_SIZE * 3)

    if (batchError) throw batchError
    if (!batch?.length) {
      return {
        ok: true, status: 'success', startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtDate.getTime(),
        recordsFetched: 0, recordsUpdated: 0, errors: [],
        stats: { message: 'no retailers' },
      }
    }

    const cnpjs = batch.map((r) => r.cnpj_raiz)
    const { data: existing } = await supabase
      .from('retailer_intelligence')
      .select('cnpj_raiz, analyzed_at')
      .in('cnpj_raiz', cnpjs)

    const recentlyAnalyzed = new Set(
      (existing || [])
        .filter((e) => e.analyzed_at && Date.now() - new Date(e.analyzed_at).getTime() < 30 * 86400000)
        .map((e) => e.cnpj_raiz),
    )
    const toAnalyze = batch.filter((r) => !recentlyAnalyzed.has(r.cnpj_raiz)).slice(0, BATCH_SIZE)

    let analyzed = 0
    const errors: string[] = []

    for (const retailer of toAnalyze) {
      try {
        const name = retailer.nome_fantasia || retailer.consolidacao || retailer.razao_social

        const { data: newsMatches } = await supabase
          .from('agro_news')
          .select('id, title, published_at, source_name')
          .or(`title.ilike.%${name}%,summary.ilike.%${name}%`)
          .order('published_at', { ascending: false })
          .limit(10)

        const { data: eventMatches } = await supabase
          .from('events')
          .select('id, name, date, location')
          .or(`name.ilike.%${name}%,description_pt.ilike.%${name}%`)
          .limit(5)

        const { count: branchCount } = await supabase
          .from('retailer_locations')
          .select('id', { count: 'exact', head: true })
          .eq('cnpj_raiz', retailer.cnpj_raiz)

        const { data: prevIntel } = await supabase
          .from('retailer_intelligence')
          .select('branch_count_current')
          .eq('cnpj_raiz', retailer.cnpj_raiz)
          .maybeSingle()

        const prevBranches = prevIntel?.branch_count_current || 0
        const currentBranches = branchCount || 0
        const branchDelta = currentBranches - prevBranches

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

        const { data: research } = await supabase
          .from('company_research')
          .select('findings, summary')
          .eq('cnpj_basico', retailer.cnpj_raiz)
          .order('searched_at', { ascending: false })
          .limit(1)
        const webFindings = (research?.[0]?.findings || [])
          .map((f: any) => `${f.title}: ${f.snippet}`)
          .slice(0, 5)

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
          newsHeadlines: (newsMatches || []).map((n) => `[${n.published_at?.slice(0, 10)}] ${n.title} (${n.source_name})`),
          events: (eventMatches || []).map((e) => `${e.name} — ${e.date} — ${e.location}`),
          branchCount: currentBranches,
          branchDelta,
          webFindings,
        })

        const embeddingText = `${name} ${retailer.grupo_acesso || ''} ${analysis.executive_summary}`.slice(0, 8000)
        const embedding = await generateEmbedding(embeddingText)

        let newBranches: any[] = []
        if (branchDelta > 0 && prevBranches > 0) {
          const { data: allLocs } = await supabase
            .from('retailer_locations')
            .select('cnpj, municipio, uf')
            .eq('cnpj_raiz', retailer.cnpj_raiz)
            .order('id', { ascending: false })
            .limit(branchDelta)
          newBranches = (allLocs || []).map((l) => ({
            cnpj: l.cnpj, municipio: l.municipio, uf: l.uf,
            detected_at: new Date().toISOString(),
          }))
        }

        const { error: upsertError } = await supabase.from('retailer_intelligence').upsert({
          cnpj_raiz: retailer.cnpj_raiz,
          executive_summary: analysis.executive_summary,
          market_position: analysis.market_position,
          risk_signals: analysis.risk_signals,
          growth_signals: analysis.growth_signals,
          news_mentions: newsMatches?.length || 0,
          recent_news: (newsMatches || []).slice(0, 5).map((n) => ({
            news_id: n.id, title: n.title, date: n.published_at,
          })),
          event_connections: (eventMatches || []).map((e) => ({
            event_id: e.id, name: e.name, date: e.date,
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

        if (upsertError) errors.push(`${retailer.cnpj_raiz}: ${upsertError.message}`)
        else analyzed++
      } catch (e: any) {
        errors.push(`${retailer.cnpj_raiz}: ${e.message}`)
      }
    }

    const finishedAt = new Date().toISOString()
    const status = errors.length === 0 ? 'success' : 'partial'

    await logActivity(supabase, {
      action: 'upsert',
      target_table: 'retailer_intelligence',
      source: 'sync-retailer-intelligence',
      source_kind: 'cron',
      actor: 'cron',
      summary: `Inteligência de revendas: ${analyzed} analisada(s) (lote ${toAnalyze.length}, ${recentlyAnalyzed.size} já recente)`,
      metadata: { status, analyzed, batch_size: toAnalyze.length, errors: errors.length },
    })

    return {
      ok: true,
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: toAnalyze.length,
      recordsUpdated: analyzed,
      errors,
      stats: { batch_size: toAnalyze.length, analyzed, skipped_recent: recentlyAnalyzed.size },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logActivity(supabase, {
        action: 'upsert',
        target_table: 'retailer_intelligence',
        source: 'sync-retailer-intelligence',
        source_kind: 'cron',
        actor: 'cron',
        summary: `sync-retailer-intelligence falhou: ${message}`.slice(0, 200),
        metadata: { status: 'error', error: message },
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
