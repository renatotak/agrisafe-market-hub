/**
 * Phase 24D — CVM agro/rural/FIAGRO/CPR scraper.
 *
 * Walks the CVM legislacao index pages directly (no search engine):
 *
 *   1. Fetch https://conteudo.cvm.gov.br/legislacao/instrucoes.html and
 *      .../resolucoes.html — both are static HTML pages with ~20-25 links
 *      each to individual inst###.html / resol###.html files.
 *
 *   2. For each unique linked doc, Cheerio-load the page, extract title +
 *      body, regex-match against the agro keyword set, and insert into
 *      regulatory_norms only when the body actually mentions FIAGRO/CPR/
 *      crédito rural/etc. URL-only matches are too noisy.
 *
 * Why direct walk and not DuckDuckGo: DDG aggressively rate-limits and
 * served 202 + anomaly pages on the very first probe. Walking the two
 * index pages is a fixed ~45 fetches per run, runs in <60s, and doesn't
 * depend on third-party search availability. Re-runs are idempotent
 * (upsert by id=cvm-<inst-number>).
 *
 * Algorithms-only path. Pure regex on body text; no LLM. Wrapped in
 * runScraper() so the Health tab on Ingestão de Dados surfaces the
 * scraper if CVM ever changes their HTML structure.
 */

import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { createAdminClient } from '@/utils/supabase/admin'
import { runScraper, type ScraperFn } from '@/lib/scraper-runner'
import { classifyCnaes } from '@/lib/cnae-classifier'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)'

// CVM index pages — both list curated subsets of instructions/resolutions
// inline as <a href="inst###.html"> links.
const CVM_INDEX_PAGES = [
  'https://conteudo.cvm.gov.br/legislacao/instrucoes.html',
  'https://conteudo.cvm.gov.br/legislacao/resolucoes.html',
] as const

// Body must match at least one of these for the doc to count as "agro".
// Tightened in Phase 24G2 — the previous `fundo.{0,30}agro` clause matched
// generic "fundo de investimento" rules that mention agro businesses in
// passing (e.g. CVM 165, CVM 600), surfacing them as agro-flavored when
// they're really just fund-structure rules. We now require explicit FIAGRO
// or one of the other agribusiness-specific keywords.
const BODY_AGRO_PATTERN =
  /agroneg[óo]cio|crédito rural|fiagro|\bcpr\b|c[ée]dula de produto rural|\bcra\b\s+(?:do\s+)?agroneg|barter agr[íi]col|cadeia agr[íi]col|insumo agr[íi]col|cooperativa agr[íi]col|defensivo agr[íi]col|fertilizant|sement[se]\s+(?:fiscaliz|registro)|FII[\s-]*agro/i

// Stable id: "cvm-<inst-number>" so re-runs idempotently upsert the
// same row. The id collides intentionally with rows the cron-fed
// `sync-regulatory` route might already have for the same doc — both
// scrapers want one CVM instrução = one regulatory_norms row.
function makeId(instNumber: string): string {
  return `cvm-${instNumber}`
}

// Pull the inst number out of a CVM URL like:
//   /legislacao/instrucoes/inst578.html
//   /legislacao/resolucoes/resol175.html
function extractDocNumber(url: string): { kind: 'instrucao' | 'resolucao'; number: string } | null {
  const inst = url.match(/inst(\d+)\.html/i)
  if (inst) return { kind: 'instrucao', number: inst[1] }
  const resol = url.match(/resol(\d+)\.html/i)
  if (resol) return { kind: 'resolucao', number: resol[1] }
  return null
}

// ─── Index page walker (collects candidate URLs) ──────────────────────────

async function fetchCVMIndexLinks(indexUrl: string): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(indexUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
  } catch {
    return []
  }
  if (!res.ok) return []
  const html = await res.text()

  // Collect every <a href> pointing to an inst###.html or resol###.html
  // file under /legislacao/. Both relative and absolute forms appear in
  // the wild on CVM pages.
  const linkPattern =
    /href=["']([^"']*\/legislacao\/(?:instrucoes|resolucoes)\/(?:inst|resol)\d+\.html)["']/gi
  const links = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = linkPattern.exec(html)) !== null) {
    let href = m[1]
    if (href.startsWith('/')) href = `https://conteudo.cvm.gov.br${href}`
    else if (!href.startsWith('http')) href = `https://conteudo.cvm.gov.br/${href}`
    links.add(href)
  }
  return Array.from(links)
}

// ─── Page fetcher (Cheerio) ────────────────────────────────────────────────

interface CVMNorm extends Record<string, unknown> {
  id: string
  body: 'CVM'
  norm_type: 'instrucao' | 'resolucao'
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

function classifyImpact(text: string): 'high' | 'medium' | 'low' {
  const t = text.toLowerCase()
  if (/fiagro|cra.*agroneg|c[ée]dula de produto rural|cpr/.test(t)) return 'high'
  if (/cooperativa|registro|fundo de investimento/.test(t)) return 'medium'
  return 'low'
}

function extractAffectedAreas(text: string): string[] {
  const areas: string[] = []
  const t = text.toLowerCase()
  if (/fiagro/.test(t)) areas.push('fiagro')
  if (/c[ée]dula de produto rural|\bcpr\b/.test(t)) areas.push('cpr')
  if (/\bcra\b/.test(t)) areas.push('cra')
  if (/cr[ée]dito rural|financiamento agr/.test(t)) areas.push('credito_rural')
  if (/cooperativa/.test(t)) areas.push('cooperativas')
  if (/defensivo|agrot[óo]xico/.test(t)) areas.push('defensivos')
  if (/sement[se]/.test(t)) areas.push('sementes')
  if (/registro/.test(t)) areas.push('registro')
  if (/fundo de investimento|FII|FIP/.test(t)) areas.push('fundos')
  return areas.length > 0 ? areas : ['mercado_capitais']
}

// CVM dates appear in many forms. Most reliable: "DD de MONTH de YYYY"
// in the page header. Fall back to ISO if present.
const PT_MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

// Phase 24G2 — fixed CVM date extractor.
//
// CVM legacy HTML pages put the publication date in DD/MM/YYYY format
// IMMEDIATELY after the title, e.g.:
//
//   "Instrução CVM 422 (Revogada) 08/09/2005 Dispõe acerca de..."
//   "Resolução CVM 175 23/12/2022 Dispõe sobre a constituição..."
//
// The earlier extractor only knew about "DD de MONTH de YYYY" and ISO
// dates, neither of which matched, so it fell through to the
// `new Date().toISOString()` default and stamped every Revogada page
// with today's date.
//
// New strategy: prefer slash-format dates that appear in the first 200
// chars of body text — that's where CVM consistently puts the
// publication date. Fall back to PT-month and ISO formats. Reject
// dates that appear AFTER common footer markers ("atualizado em").
function extractDate(body: string): string | null {
  const t = body.toLowerCase()

  const footerMarkers = [
    'atualizado em',
    'última atualização',
    'última modificação',
    'data da última modificação',
    'arquivos relacionados',
  ]
  let cut = t.length
  for (const marker of footerMarkers) {
    const idx = t.indexOf(marker)
    if (idx > 0 && idx < cut) cut = idx
  }
  const head = body.slice(0, cut)

  // Pass 1 (preferred): first DD/MM/YYYY in the head, valid year range.
  // CVM pages put this 30-200 chars in, right after the title.
  const slashRe = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g
  let m: RegExpExecArray | null
  while ((m = slashRe.exec(head)) !== null) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10)
    const year = parseInt(m[3], 10)
    if (day < 1 || day > 31 || month < 1 || month > 12) continue
    if (year < 1976 || year > 2099) continue
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Pass 2: "DD de MONTH de YYYY" anywhere in the head.
  const ptDateRe = /(\d{1,2})\s+de\s+([a-zçãéí]+)\s+de\s+(\d{4})/gi
  const lower = head.toLowerCase()
  while ((m = ptDateRe.exec(lower)) !== null) {
    const day = parseInt(m[1], 10)
    const month = PT_MONTHS[m[2]]
    const year = parseInt(m[3], 10)
    if (!month || year < 1976 || year > 2099) continue
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Pass 3: ISO date.
  const isoMatch = head.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10)
    if (y >= 1976 && y <= 2099) return isoMatch[0]
  }

  return null
}

async function fetchCVMNorm(url: string): Promise<CVMNorm | null> {
  const meta = extractDocNumber(url)
  if (!meta) return null

  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
  } catch {
    return null
  }
  if (!res.ok) return null
  const html = await res.text()
  const $ = cheerio.load(html)

  // CVM pages are simple legacy HTML. Title is usually in <title> or <h1>.
  let title = ($('title').first().text() || $('h1').first().text() || '').trim()
  // Strip the boilerplate "Comissão de Valores Mobiliários" suffix some
  // pages add to the <title> tag.
  title = title.replace(/\s*[-—|]\s*comissão de valores mobiliários.*/i, '').trim()
  if (!title) return null

  // Body text — strip scripts/styles and grab the first ~2000 chars of text.
  $('script,style,nav,header,footer').remove()
  const body = $('body').text().replace(/\s+/g, ' ').trim()
  const summary = body.slice(0, 500)

  // Re-validate the agro hit: title + first 4000 chars of body
  const haystack = `${title} ${body.slice(0, 4000)}`
  if (!BODY_AGRO_PATTERN.test(haystack)) return null

  const publishedAt = extractDate(body) || new Date().toISOString().slice(0, 10)
  const affectedAreas = extractAffectedAreas(haystack)
  const affectedCnaes = classifyCnaes({ title, summary, affected_areas: affectedAreas })

  return {
    id: makeId(meta.number),
    body: 'CVM',
    norm_type: meta.kind === 'instrucao' ? 'instrucao' : 'resolucao' as any,
    norm_number: meta.number,
    title: title.slice(0, 300),
    summary,
    published_at: publishedAt,
    effective_at: null,
    impact_level: classifyImpact(haystack),
    affected_areas: affectedAreas,
    affected_cnaes: affectedCnaes,
    source_url: url,
  }
}

// ─── Scraper function ──────────────────────────────────────────────────────

const cvmAgroScraper: ScraperFn<CVMNorm> = async () => {
  const seen = new Set<string>()
  const results: CVMNorm[] = []

  // Stage 1: walk both index pages, collect every linked doc URL
  for (const indexUrl of CVM_INDEX_PAGES) {
    const links = await fetchCVMIndexLinks(indexUrl)
    for (const url of links) seen.add(url)
    await new Promise((r) => setTimeout(r, 500))
  }

  // Stage 2: fetch each unique doc and extract structured fields. Hard
  // cap at 60 to bound runtime; current page yields ~43 today.
  let count = 0
  for (const url of seen) {
    if (count >= 60) break
    const norm = await fetchCVMNorm(url)
    if (norm) results.push(norm)
    count++
    await new Promise((r) => setTimeout(r, 400)) // gentle pace
  }

  return {
    rows: results,
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
    const outcome = await runScraper<CVMNorm>(
      'sync-cvm-agro',
      cvmAgroScraper,
      { supabase },
    )

    if (!outcome.ok || outcome.rows.length === 0) {
      return NextResponse.json({
        success: false,
        run_id: outcome.runId,
        status: outcome.status,
        rows_fetched: outcome.rowsFetched,
        validation_errors: outcome.validationErrors,
        error: outcome.errorMessage,
      })
    }

    const { error: upErr, count } = await supabase
      .from('regulatory_norms')
      .upsert(outcome.rows, { onConflict: 'id', count: 'exact' })

    if (upErr) {
      return NextResponse.json({
        success: false,
        run_id: outcome.runId,
        rows_fetched: outcome.rowsFetched,
        upsert_error: upErr.message,
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
