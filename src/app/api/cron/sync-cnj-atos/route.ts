/**
 * Phase 24F — CNJ Atos scraper.
 *
 * The CNJ (Conselho Nacional de Justiça) publishes Provimentos, Resoluções,
 * Portarias, Recomendações, and Instruções Normativas via a real JSON API
 * at https://atos.cnj.jus.br/api/atos. Many of these touch agribusiness
 * (e.g. Provimento 216/2026 on judicial recovery of rural producers) and
 * the existing sync-regulatory ConJur/Migalhas/JOTA RSS pass misses them
 * because the news outlets only cover them when there's wider commentary.
 *
 * Strategy:
 *   1. Walk the first N pages of /api/atos (paginated, 20 atos per page).
 *      The endpoint returns chronological-most-recent-first regardless of
 *      filter params (we tested ?tipo=, ?busca=, ?q= — all ignored), so
 *      filtering happens client-side here.
 *   2. For each ato, regex-match `ementa` against agro keywords. Hits get
 *      mapped to a regulatory_norms row with body='CNJ', stable id =
 *      `cnj-<ato_id>`.
 *   3. Upsert via runScraper() so the Health tab tracks the run.
 *
 * Pure regex over JSON fields. No LLM. Pages walked: 10 (200 atos), enough
 * to catch ~2 weeks of fresh atos at typical CNJ velocity.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runScraper, type ScraperFn } from '@/lib/scraper-runner'
import { classifyCnaes } from '@/lib/cnae-classifier'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CNJ_API_BASE = 'https://atos.cnj.jus.br/api/atos'
const PAGES_TO_WALK = 10
const PER_PAGE = 20
const UA = 'AgriSafe-MarketHub/1.0 (CNJ atos scraper)'

// Match regulatory_norms.affected_areas vocabulary used elsewhere.
// Portuguese plurals: "rural"→"rurais", "produtor"→"produtores".
const AGRO_PATTERN =
  /\bagroneg[óo]cio|\brura(?:l|is)\b|\bagr[íi]col|\bsafra\b|\bproduto[rs]e?s?\s+rura(?:l|is)|\bcooperativ(?:a)?\s+agr|\bcpr\b|c[ée]dula de produto rural|\bfiagro|\bcr[ée]dito\s+rural|recupera[çc][ãa]o\s+judicial.{0,80}(?:rura(?:l|is)|agro|produto[rs]|fazend)|\bfal[êe]ncia.{0,80}(?:rura(?:l|is)|agro|produto[rs])|fazend[ae]|terras?\s+ind[íi]gen|reforma\s+agr[áa]ri/i

// CNJ API row → regulatory_norms shape
interface CNJAto {
  id: number
  tipo: string                // 'Provimento' | 'Resolução' | 'Portaria' | ...
  numero: number
  data_publicacao: string     // 'YYYY-MM-DD'
  situacao: string
  assunto: string | null
  ementa: string | null       // HTML
  url_ato: string | null      // PDF filename — needs base URL prefix
  url_txt_compilado: string | null
}

interface CNJNormRow extends Record<string, unknown> {
  id: string
  body: 'CNJ'
  norm_type: string
  norm_number: string
  title: string
  summary: string | null
  published_at: string
  effective_at: null
  impact_level: 'high' | 'medium' | 'low'
  affected_areas: string[]
  affected_cnaes: string[]
  source_url: string
}

function stripHtml(html: string | null): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ordm;/gi, 'º')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&otilde;/gi, 'õ')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&ecirc;/gi, 'ê')
    .replace(/&ocirc;/gi, 'ô')
    .replace(/&acirc;/gi, 'â')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeNormType(tipo: string): string {
  const t = tipo.toLowerCase()
  if (t.includes('provimento')) return 'provimento'
  if (t.includes('resolução') || t.includes('resolucao')) return 'resolucao'
  if (t.includes('portaria')) return 'portaria'
  if (t.includes('recomendação') || t.includes('recomendacao')) return 'recomendacao'
  if (t.includes('instrução normativa') || t.includes('instrucao normativa')) return 'instrucao_normativa'
  if (t.includes('parecer')) return 'parecer'
  return 'outros'
}

function classifyImpact(text: string): 'high' | 'medium' | 'low' {
  const t = text.toLowerCase()
  if (
    /recupera[çc][ãa]o judicial|fal[êe]ncia|cr[ée]dito rural|cpr|fiagro|patrim[ôo]nio rural/.test(t)
  ) return 'high'
  if (/registro|reporting|atualiza|prorrog|amplia|reduz|altera/.test(t)) return 'medium'
  return 'low'
}

function extractAffectedAreas(text: string): string[] {
  const areas: string[] = []
  const t = text.toLowerCase()
  if (/recupera[çc][ãa]o judicial|fal[êe]ncia/.test(t)) areas.push('risco')
  if (/cr[ée]dito rural|financiamento agr/.test(t)) areas.push('credito_rural')
  if (/\bcpr\b|c[ée]dula de produto rural/.test(t)) areas.push('cpr')
  if (/fiagro/.test(t)) areas.push('fiagro')
  if (/cooperativa/.test(t)) areas.push('cooperativas')
  if (/registro/.test(t)) areas.push('registro')
  if (/cart[óo]rio|registro de im[óo]veis/.test(t)) areas.push('registro')
  return areas.length > 0 ? areas : ['geral']
}

// ─── Scraper function ──────────────────────────────────────────────────────

const cnjAtosScraper: ScraperFn<CNJNormRow> = async () => {
  const hits: CNJNormRow[] = []
  let totalWalked = 0

  for (let page = 1; page <= PAGES_TO_WALK; page++) {
    let res: Response
    try {
      res = await fetch(`${CNJ_API_BASE}?per_page=${PER_PAGE}&page=${page}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      })
    } catch (e: any) {
      throw new Error(`CNJ API fetch failed on page ${page}: ${e.message}`)
    }
    if (!res.ok) {
      throw new Error(`CNJ API returned http ${res.status} on page ${page}`)
    }
    const json = await res.json()
    const items = (json.data as CNJAto[]) || []
    if (items.length === 0) break

    for (const ato of items) {
      totalWalked++
      const ementaText = stripHtml(ato.ementa)
      const haystack = `${ato.tipo} ${ato.assunto || ''} ${ementaText}`
      if (!AGRO_PATTERN.test(haystack)) continue

      const normType = normalizeNormType(ato.tipo)
      const year = (ato.data_publicacao || '').slice(0, 4)
      const numberLabel = year ? `${ato.numero}/${year}` : String(ato.numero)
      const sourceUrl = `https://atos.cnj.jus.br/atos/detalhar/${ato.id}`
      const title = `CNJ ${ato.tipo} ${numberLabel}`
      const summary = ementaText.slice(0, 500)
      const affectedAreas = extractAffectedAreas(haystack)
      const affectedCnaes = classifyCnaes({ title, summary, affected_areas: affectedAreas })

      hits.push({
        id: `cnj-${ato.id}`,
        body: 'CNJ',
        norm_type: normType,
        norm_number: numberLabel,
        title,
        summary,
        published_at: ato.data_publicacao,
        effective_at: null,
        impact_level: classifyImpact(haystack),
        affected_areas: affectedAreas,
        affected_cnaes: affectedCnaes,
        source_url: sourceUrl,
      })
    }

    // Pace: CNJ doesn't enforce a strict limit but a 250ms gap between
    // pages keeps us friendly.
    await new Promise((r) => setTimeout(r, 250))
  }

  return {
    rows: hits,
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
    const outcome = await runScraper<CNJNormRow>(
      'sync-cnj-atos',
      cnjAtosScraper,
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

    if (outcome.rows.length === 0) {
      return NextResponse.json({
        success: true,
        run_id: outcome.runId,
        status: outcome.status,
        rows_fetched: 0,
        rows_upserted: 0,
        message: 'No agro-related CNJ atos in the most recent batch',
        timestamp: new Date().toISOString(),
      })
    }

    const { error, count } = await supabase
      .from('regulatory_norms')
      .upsert(outcome.rows, { onConflict: 'id', count: 'exact' })

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
      rows_upserted: count ?? outcome.rows.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
