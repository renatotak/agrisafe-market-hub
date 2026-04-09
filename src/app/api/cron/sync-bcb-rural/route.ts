/**
 * Phase 24D — BCB Crédito Rural reference catalog.
 *
 * The user asked us to "evaluate websites to feed notícias and laws"
 * starting from these two BCB pages:
 *   - https://www.bcb.gov.br/estabilidadefinanceira/creditorural
 *   - https://www.bcb.gov.br/estabilidadefinanceira/sicornoticias
 *
 * Reality check from probing both:
 *
 *   1. Both pages are SharePoint single-page apps. A plain Cheerio fetch
 *      returns the empty SPA shell, never the body content.
 *   2. The /api/servico/sitebcb/* SharePoint REST endpoints all return
 *      400 Bad Request without internal credentials.
 *   3. DuckDuckGo HTML search rate-limits us aggressively (anomaly page
 *      on the very first request). Google Custom Search API is disabled
 *      on this project.
 *   4. Olinda OData (https://olinda.bcb.gov.br/olinda/servico/SICOR/...)
 *      exposes credit-operation **statistics** but not news/normativos.
 *
 * So the algorithmically-honest implementation is: maintain a curated
 * static catalog of the canonical BCB rural-credit landing pages and
 * upsert each one into regulatory_norms as a reference entry. The user
 * lands on the right BCB page in one click. When BCB ships a real RSS
 * feed for these sub-sites we'll replace this with a feed parser.
 *
 * Per Guardrail #1: no headless browser, no fragile search-engine
 * fallback, no LLM. Just a curated list with stable IDs.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runScraper, type ScraperFn } from '@/lib/scraper-runner'
import { classifyCnaes } from '@/lib/cnae-classifier'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Curated BCB rural credit reference catalog ────────────────────────────
//
// Each entry maps to a regulatory_norms row with body='BCB', a stable id,
// and a source_url that the Marco Regulatório page can deep-link to. The
// titles and summaries are AgriSafe-curated descriptions of what each
// landing page actually contains; they don't pretend to be official text.

interface BCBReference extends Record<string, unknown> {
  id: string
  title: string
  summary: string
  source_url: string
  affected_areas: string[]
  impact_level: 'high' | 'medium' | 'low'
  norm_type: string
}

const BCB_REFERENCES: BCBReference[] = [
  {
    id: 'bcb-creditorural-portal',
    title: 'BCB — Portal do Crédito Rural',
    summary:
      'Página oficial do Banco Central do Brasil sobre o crédito rural. Reúne resoluções, circulares, manuais (MCR), comunicados e o Sistema de Operações do Crédito Rural e do Proagro (SICOR). Ponto de partida para acompanhar normas e parâmetros operacionais do crédito rural brasileiro.',
    source_url: 'https://www.bcb.gov.br/estabilidadefinanceira/creditorural',
    affected_areas: ['credito_rural', 'proagro'],
    impact_level: 'high',
    norm_type: 'outros',
  },
  {
    id: 'bcb-sicornoticias-portal',
    title: 'BCB — SICOR Notícias',
    summary:
      'Boletim de notícias e atualizações operacionais do Sistema de Operações do Crédito Rural e do Proagro (SICOR). Inclui notas técnicas sobre parâmetros, alterações de tabelas e comunicados aos agentes financeiros que operam crédito rural.',
    source_url: 'https://www.bcb.gov.br/estabilidadefinanceira/sicornoticias',
    affected_areas: ['credito_rural'],
    impact_level: 'medium',
    norm_type: 'comunicado',
  },
  {
    id: 'bcb-mcr',
    title: 'BCB — Manual de Crédito Rural (MCR)',
    summary:
      'Manual de Crédito Rural do BCB — referência consolidada das normas operacionais do crédito rural no Brasil. Atualizado continuamente; é a base normativa para todos os contratos enquadrados no SNCR.',
    source_url: 'https://www3.bcb.gov.br/mcr/Manual/Inicial',
    affected_areas: ['credito_rural', 'proagro', 'seguro_rural'],
    impact_level: 'high',
    norm_type: 'instrucao_normativa',
  },
  {
    id: 'bcb-cmn-resolucoes',
    title: 'BCB — Buscador de Normativos do CMN/BCB',
    summary:
      'Ferramenta de busca oficial do BCB para resoluções do Conselho Monetário Nacional, circulares do BCB, cartas-circulares e demais atos normativos. Cobre toda a hierarquia regulatória que afeta crédito rural, FIAGRO, CRA, LCA e instrumentos correlatos.',
    source_url: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas',
    affected_areas: ['credito_rural', 'fiagro', 'cra', 'lca', 'cpr'],
    impact_level: 'high',
    norm_type: 'outros',
  },
  {
    id: 'bcb-sicor-olinda',
    title: 'BCB — SICOR Open Data (Olinda OData)',
    summary:
      'API pública Olinda do BCB que expõe a Matriz de Dados do Crédito Rural (MDCR) — operações de crédito rural agregadas por município, produto, cultura e instituição financeira, atualizadas mensalmente. Base para análises quantitativas de financiamento rural.',
    source_url: 'https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/swagger-ui3',
    affected_areas: ['credito_rural'],
    impact_level: 'medium',
    norm_type: 'outros',
  },
]

// ─── Scraper function ──────────────────────────────────────────────────────

const bcbRuralScraper: ScraperFn<BCBReference> = async () => {
  // Pure curated catalog — no network fetch. Every run produces the same
  // 5 rows. Re-runs are idempotent via stable id.
  return {
    rows: BCB_REFERENCES,
    httpStatus: 200,
    targetPeriod: new Date().toISOString().slice(0, 10),
  }
}

// ─── HTTP entry point ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    const outcome = await runScraper<BCBReference>(
      'sync-bcb-rural',
      bcbRuralScraper,
      { supabase },
    )

    if (!outcome.ok) {
      return NextResponse.json({
        success: false,
        run_id: outcome.runId,
        status: outcome.status,
        rows_fetched: outcome.rowsFetched,
        validation_errors: outcome.validationErrors,
        error: outcome.errorMessage,
      })
    }

    // Map to regulatory_norms shape with body='BCB'.
    const today = new Date().toISOString().slice(0, 10)
    const normRows = outcome.rows.map((r) => ({
      id: r.id,
      body: 'BCB',
      norm_type: r.norm_type,
      norm_number: null,
      title: r.title,
      summary: r.summary,
      published_at: today,
      effective_at: null,
      impact_level: r.impact_level,
      affected_areas: r.affected_areas,
      // Phase 24G2 — auto-classify CNAEs from title/summary/areas
      affected_cnaes: classifyCnaes({
        title: r.title,
        summary: r.summary,
        affected_areas: r.affected_areas,
      }),
      source_url: r.source_url,
    }))

    const { error, count } = await supabase
      .from('regulatory_norms')
      .upsert(normRows, { onConflict: 'id', count: 'exact' })

    if (error) {
      return NextResponse.json({
        success: false,
        run_id: outcome.runId,
        upsert_error: error.message,
      })
    }

    return NextResponse.json({
      success: true,
      run_id: outcome.runId,
      status: outcome.status,
      rows_fetched: outcome.rowsFetched,
      norms_upserted: count ?? normRows.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
