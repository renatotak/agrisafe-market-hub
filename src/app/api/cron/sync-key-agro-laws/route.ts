/**
 * Phase 24D — Seed + monitor key agribusiness laws.
 *
 * Curated list of foundational Brazilian agribusiness statutes the user
 * always wants present in regulatory_norms, regardless of what the broad
 * cron-fed sync-regulatory feed picks up:
 *
 *   - Lei nº 8.929/1994 — Lei da CPR (Cédula de Produto Rural) + revisões
 *   - Lei nº 11.101/2005 — Lei das Falências e da Recuperação Judicial
 *   - Lei nº 13.986/2020 — "Nova Lei do Agro" (Patrimônio rural em afetação,
 *     CPR cambial, sec. mais flexível, marco legal do FIAGRO)
 *
 * On each run, idempotently upsert each law into regulatory_norms with
 * its Planalto URL, real norm_number, and a short summary. Stable id =
 * "lei-<num>-<year>" so re-runs don't duplicate.
 *
 * Phase 24D first-pass also tried a DuckDuckGo follow-up to surface news
 * commentary on each law, but DDG aggressively rate-limits and returned
 * zero results consistently — code removed (Guardrail #1: no fragile
 * fallbacks). The cron-fed sync-regulatory + sync-agro-news feeds already
 * surface law commentary via ConJur/Migalhas/JOTA, so this scraper is
 * deliberately narrow: just the canonical 3 laws.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runScraper, type ScraperFn } from '@/lib/scraper-runner'
import { classifyCnaes } from '@/lib/cnae-classifier'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Curated law catalog ───────────────────────────────────────────────────

interface KeyLaw {
  id: string
  norm_number: string
  norm_type: 'lei' | 'lei_complementar'
  body: 'PRES_REPUBLICA' | 'CONGRESSO'
  published_at: string // ISO date
  title: string
  summary: string
  source_url: string
  affected_areas: string[]
  impact_level: 'high' | 'medium' | 'low'
}

const KEY_LAWS: KeyLaw[] = [
  {
    id: 'lei-8929-1994',
    norm_number: '8.929/1994',
    norm_type: 'lei',
    body: 'CONGRESSO',
    published_at: '1994-08-22',
    title: 'Lei da CPR — Lei nº 8.929/1994',
    summary:
      'Institui a Cédula de Produto Rural (CPR), título de crédito vinculado à entrega futura de produtos agropecuários. Marco original do financiamento privado da safra brasileira; objeto de revisões posteriores que ampliaram seu alcance (Lei 13.986/2020 entre outras).',
    source_url: 'https://www.planalto.gov.br/ccivil_03/leis/l8929.htm',
    affected_areas: ['cpr', 'credito_rural', 'mercado_capitais'],
    impact_level: 'high',
  },
  {
    id: 'lei-11101-2005',
    norm_number: '11.101/2005',
    norm_type: 'lei',
    body: 'CONGRESSO',
    published_at: '2005-02-09',
    title: 'Lei das Falências e da Recuperação Judicial — Lei nº 11.101/2005',
    summary:
      'Regula a recuperação judicial, a recuperação extrajudicial e a falência do empresário e da sociedade empresária. Base legal de todos os pedidos de recuperação judicial monitorados na chapter Recuperação Judicial.',
    source_url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2005/lei/l11101.htm',
    affected_areas: ['risco', 'credito_rural'],
    impact_level: 'high',
  },
  {
    id: 'lei-13986-2020',
    norm_number: '13.986/2020',
    norm_type: 'lei',
    body: 'CONGRESSO',
    published_at: '2020-04-07',
    title: 'Nova Lei do Agro — Lei nº 13.986/2020',
    summary:
      'Cria o Fundo de Investimento nas Cadeias Produtivas Agroindustriais (FIAGRO), institui o patrimônio rural em afetação, e amplia/modulariza a CPR (incluindo CPR cambial). É o marco legal contemporâneo do financiamento privado e securitizado do agro brasileiro.',
    source_url: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l13986.htm',
    affected_areas: ['fiagro', 'cpr', 'credito_rural', 'mercado_capitais', 'fundos'],
    impact_level: 'high',
  },
]

// ─── Scraper function ──────────────────────────────────────────────────────

interface ScraperRow extends Record<string, unknown> {
  source_url: string
  title: string
  summary: string
  published_at: string
  law: KeyLaw
}

const keyLawsScraper: ScraperFn<ScraperRow> = async () => {
  // One row per curated law. The cron-fed sync-regulatory + sync-agro-news
  // feeds already pick up commentary from ConJur/Migalhas/JOTA — no need
  // for a fragile DDG search here.
  const rows: ScraperRow[] = KEY_LAWS.map((law) => ({
    source_url: law.source_url,
    title: law.title,
    summary: law.summary,
    published_at: law.published_at,
    law,
  }))

  return {
    rows,
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
    const outcome = await runScraper<ScraperRow>(
      'sync-key-agro-laws',
      keyLawsScraper,
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

    const lawRows = outcome.rows.map((r) => ({
      id: r.law.id,
      body: r.law.body,
      norm_type: r.law.norm_type,
      norm_number: r.law.norm_number,
      title: r.law.title,
      summary: r.law.summary,
      published_at: r.law.published_at,
      effective_at: null,
      impact_level: r.law.impact_level,
      affected_areas: r.law.affected_areas,
      // Phase 24G2 — auto-classify CNAEs from title/summary/areas
      affected_cnaes: classifyCnaes({
        title: r.law.title,
        summary: r.law.summary,
        affected_areas: r.law.affected_areas,
      }),
      source_url: r.law.source_url,
    }))

    const { error, count } = await supabase
      .from('regulatory_norms')
      .upsert(lawRows, { onConflict: 'id', count: 'exact' })

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
      laws_upserted: count ?? lawRows.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
