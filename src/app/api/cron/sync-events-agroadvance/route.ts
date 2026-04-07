/**
 * Phase 23 — AgroAdvance events scraper.
 *
 * Scrapes the curated annual list at
 *   https://agroadvance.com.br/blog-feiras-e-eventos-agro-2026/
 * and upserts each event into the `events` table with source_name='AgroAdvance'.
 *
 * The page structure (verified 2026-04-07) is:
 *   <h4>Event Name</h4>
 *   <p>Free-text description...</p>
 *   <p><strong>Dados da edição de 2025 (37ª edição)</strong></p>
 *   <ul><li>Público: ...</li>...</ul>
 *   <p><strong>Data:</strong> 09 a 13 de fevereiro de 2026.</p>
 *   <p><strong>Local:</strong> Cascavel, Paraná.</p>
 *   <p><strong>Site Oficial:</strong> <a href="https://...">...</a></p>
 *
 * Algorithmic only — Cheerio selectors + Portuguese date/state regex.
 * No LLM in the parsing path. Built on the Phase 19A runScraper() wrapper.
 */

import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { createAdminClient } from '@/utils/supabase/admin'
import { runScraper, type ScraperFn } from '@/lib/scraper-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SOURCE_URL = 'https://agroadvance.com.br/blog-feiras-e-eventos-agro-2026/'
const UA = 'Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)'

// ─── Helpers ──────────────────────────────────────────────────

const MONTHS_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

const STATE_BY_NAME: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
  'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES', 'goiás': 'GO',
  'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
  'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondônia': 'RO',
  'roraima': 'RR', 'santa catarina': 'SC', 'são paulo': 'SP', 'sergipe': 'SE',
  'tocantins': 'TO',
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Parse Portuguese date strings like:
 *   "09 a 13 de fevereiro de 2026"
 *   "27 de abril a 1 de maio de 2026"
 *   "25 de abril a 3 de maio de 2026"
 *   "11 de maio de 2026"
 * Returns { start, end } as YYYY-MM-DD or null if unparseable.
 */
function parseBrDateRange(text: string): { start: string; end: string | null } | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim()
  // Strip the leading "Data:" label if it's still there
  const cleaned = t.replace(/^data:\s*/i, '')

  // Pattern A: "DD a DD de MONTH de YYYY"
  let m = cleaned.match(/(\d{1,2})\s*a\s*(\d{1,2})\s*de\s+([a-zçãéí]+)\s+de\s+(\d{4})/i)
  if (m) {
    const startDay = parseInt(m[1], 10)
    const endDay = parseInt(m[2], 10)
    const month = MONTHS_PT[m[3]]
    const year = parseInt(m[4], 10)
    if (month) {
      return {
        start: `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
        end:   `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
      }
    }
  }

  // Pattern B: "DD de MONTH a DD de MONTH de YYYY" (cross-month)
  m = cleaned.match(/(\d{1,2})\s*de\s+([a-zçãéí]+)\s*a\s*(\d{1,2})\s*de\s+([a-zçãéí]+)\s+de\s+(\d{4})/i)
  if (m) {
    const startDay = parseInt(m[1], 10)
    const startMonth = MONTHS_PT[m[2]]
    const endDay = parseInt(m[3], 10)
    const endMonth = MONTHS_PT[m[4]]
    const year = parseInt(m[5], 10)
    if (startMonth && endMonth) {
      return {
        start: `${year}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
        end:   `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
      }
    }
  }

  // Pattern C: "DD de MONTH de YYYY" (single day)
  m = cleaned.match(/(\d{1,2})\s*de\s+([a-zçãéí]+)\s+de\s+(\d{4})/i)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = MONTHS_PT[m[2]]
    const year = parseInt(m[3], 10)
    if (month) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return { start: iso, end: null }
    }
  }

  return null
}

/**
 * Extract location like "Cascavel, Paraná" → "Cascavel, PR".
 * Returns the location string + a 2-letter UF if recognized.
 */
function parseLocation(text: string): { location: string; uf: string | null } {
  const cleaned = text.replace(/^local:\s*/i, '').replace(/\.$/, '').trim()
  // Try to find a known state name (case-insensitive, possibly accented)
  const lower = cleaned.toLowerCase()
  for (const [stateName, uf] of Object.entries(STATE_BY_NAME)) {
    if (lower.endsWith(stateName)) {
      // Replace the trailing state name with the 2-letter UF
      const cityPart = cleaned.slice(0, cleaned.length - stateName.length).replace(/[,\s]+$/, '')
      return { location: cityPart ? `${cityPart}, ${uf}` : uf, uf }
    }
  }
  // Fallback: return the cleaned text as-is, no UF
  return { location: cleaned, uf: null }
}

function inferType(name: string): string {
  const lower = name.toLowerCase()
  if (/feira|show rural|expo|field day|agrishow|tecnoshow|coplacampo|farm show/.test(lower)) return 'fair'
  if (/workshop|oficina|capacitação|treinamento/.test(lower)) return 'workshop'
  if (/webinar|online|live|palestra/.test(lower)) return 'webinar'
  if (/summit|cúpula|fórum|congresso/.test(lower)) return 'summit'
  return 'conference'
}

// ─── Scraper function ────────────────────────────────────────

interface AgroAdvanceEventRow extends Record<string, unknown> {
  id: string
  name: string
  date: string
  end_date: string | null
  location: string | null
  type: string
  description_pt: string | null
  description_en: string | null
  content_opportunity_pt: string | null
  content_opportunity_en: string | null
  website: string | null
  upcoming: boolean
  source_name: string
  source_url: string
  confidentiality: string
}

const fetchAgroAdvance: ScraperFn<AgroAdvanceEventRow> = async () => {
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`AgroAdvance returned http ${res.status}`)
  const html = await res.text()
  const bytes = html.length

  const $ = cheerio.load(html)
  const rows: AgroAdvanceEventRow[] = []
  const today = new Date().toISOString().slice(0, 10)

  // Walk every h4 in the article body. Each h4 is an event name.
  // The next few <p> elements (until the next h4) carry the metadata.
  $('h4').each((_, h4El) => {
    const name = $(h4El).text().trim()
    if (!name || name.length < 3) return // skip empty / placeholder h4s

    // Walk forward siblings until we hit another h4 or run out
    let dateStr = ''
    let locationStr = ''
    let websiteUrl: string | null = null
    let descriptionStr = ''
    let descriptionCaptured = false

    let sibling = $(h4El).next()
    while (sibling.length && !sibling.is('h4')) {
      const text = sibling.text().trim()

      // First non-strong-prefixed paragraph after the h4 = description
      if (!descriptionCaptured && sibling.is('p') && text && !text.match(/^(data|local|site oficial|dados):/i)) {
        descriptionStr = text
        descriptionCaptured = true
      }

      // Look for labeled fields inside <strong>
      const strongs = sibling.find('strong')
      strongs.each((_, strongEl) => {
        const label = $(strongEl).text().trim().toLowerCase()
        if (label.startsWith('data')) {
          // Date is in the rest of the parent text after the strong
          dateStr = sibling.text().replace($(strongEl).text(), '').trim()
        } else if (label.startsWith('local')) {
          locationStr = sibling.text().replace($(strongEl).text(), '').trim()
        } else if (label.startsWith('site oficial')) {
          const link = sibling.find('a').first()
          if (link.length) websiteUrl = link.attr('href') || null
        }
      })

      sibling = sibling.next()
    }

    // Skip events we couldn't date
    const parsedDate = parseBrDateRange(dateStr)
    if (!parsedDate) return

    const { location } = parseLocation(locationStr)
    const id = `agroadvance-${slugify(name)}`

    rows.push({
      id,
      name,
      date: parsedDate.start,
      end_date: parsedDate.end,
      location: location || null,
      type: inferType(name),
      description_pt: descriptionStr || null,
      description_en: null,
      content_opportunity_pt: null,
      content_opportunity_en: null,
      website: websiteUrl,
      upcoming: parsedDate.start >= today,
      source_name: 'AgroAdvance',
      source_url: SOURCE_URL,
      confidentiality: 'public',
    })
  })

  return {
    rows,
    httpStatus: res.status,
    bytesFetched: bytes,
    targetPeriod: new Date().toISOString().slice(0, 10),
  }
}

// ─── Route handler ───────────────────────────────────────────

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
    const outcome = await runScraper<AgroAdvanceEventRow>(
      'sync-events-agroadvance',
      fetchAgroAdvance,
      { supabase },
    )

    if (!outcome.ok || outcome.rows.length === 0) {
      return NextResponse.json({
        success: false,
        run_id: outcome.runId,
        status: outcome.status,
        rows_validated: outcome.rowsFetched,
        validation_errors: outcome.validationErrors,
        error: outcome.errorMessage,
      })
    }

    // Upsert into events. The validated rows already have the right shape.
    const { error: upErr, count } = await supabase
      .from('events')
      .upsert(outcome.rows, { onConflict: 'id', count: 'exact' })

    if (upErr) {
      return NextResponse.json({
        success: false,
        run_id: outcome.runId,
        rows_validated: outcome.rowsFetched,
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
