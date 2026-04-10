/**
 * Phase 25 — sync-events-agroadvance job module.
 * Logic moved from src/app/api/cron/sync-events-agroadvance/route.ts (Phase 23).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import type { JobResult } from '@/jobs/types'

const SOURCE_URL = 'https://agroadvance.com.br/blog-feiras-e-eventos-agro-2026/'
const UA = 'Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)'

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
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function parseBrDateRange(text: string): { start: string; end: string | null } | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim()
  const cleaned = t.replace(/^data:\s*/i, '')

  let m = cleaned.match(/(\d{1,2})\s*a\s*(\d{1,2})\s*de\s+([a-zçãéí]+)\s+de\s+(\d{4})/i)
  if (m) {
    const startDay = parseInt(m[1], 10), endDay = parseInt(m[2], 10)
    const month = MONTHS_PT[m[3]], year = parseInt(m[4], 10)
    if (month) return {
      start: `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
      end:   `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    }
  }
  m = cleaned.match(/(\d{1,2})\s*de\s+([a-zçãéí]+)\s*a\s*(\d{1,2})\s*de\s+([a-zçãéí]+)\s+de\s+(\d{4})/i)
  if (m) {
    const startDay = parseInt(m[1], 10), startMonth = MONTHS_PT[m[2]]
    const endDay = parseInt(m[3], 10), endMonth = MONTHS_PT[m[4]], year = parseInt(m[5], 10)
    if (startMonth && endMonth) return {
      start: `${year}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
      end:   `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    }
  }
  m = cleaned.match(/(\d{1,2})\s*de\s+([a-zçãéí]+)\s+de\s+(\d{4})/i)
  if (m) {
    const day = parseInt(m[1], 10), month = MONTHS_PT[m[2]], year = parseInt(m[3], 10)
    if (month) return {
      start: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      end: null,
    }
  }
  return null
}

function parseLocation(text: string): { location: string; uf: string | null } {
  const cleaned = text.replace(/^local:\s*/i, '').replace(/\.$/, '').trim()
  const lower = cleaned.toLowerCase()
  for (const [stateName, uf] of Object.entries(STATE_BY_NAME)) {
    if (lower.endsWith(stateName)) {
      const cityPart = cleaned.slice(0, cleaned.length - stateName.length).replace(/[,\s]+$/, '')
      return { location: cityPart ? `${cityPart}, ${uf}` : uf, uf }
    }
  }
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

  $('h4').each((_, h4El) => {
    const name = $(h4El).text().trim()
    if (!name || name.length < 3) return

    let dateStr = '', locationStr = '', websiteUrl: string | null = null
    let descriptionStr = '', descriptionCaptured = false
    let sibling = $(h4El).next()
    while (sibling.length && !sibling.is('h4')) {
      const text = sibling.text().trim()
      if (!descriptionCaptured && sibling.is('p') && text && !text.match(/^(data|local|site oficial|dados):/i)) {
        descriptionStr = text
        descriptionCaptured = true
      }
      const strongs = sibling.find('strong')
      strongs.each((_, strongEl) => {
        const label = $(strongEl).text().trim().toLowerCase()
        if (label.startsWith('data')) {
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

    const parsedDate = parseBrDateRange(dateStr)
    if (!parsedDate) return
    const { location } = parseLocation(locationStr)
    const id = `agroadvance-${slugify(name)}`
    rows.push({
      id, name,
      date: parsedDate.start, end_date: parsedDate.end,
      location: location || null, type: inferType(name),
      description_pt: descriptionStr || null, description_en: null,
      content_opportunity_pt: null, content_opportunity_en: null,
      website: websiteUrl,
      upcoming: parsedDate.start >= today,
      source_name: 'AgroAdvance', source_url: SOURCE_URL,
      confidentiality: 'public',
    })
  })

  return { rows, httpStatus: res.status, bytesFetched: bytes, targetPeriod: today }
}

export function runSyncEventsAgroadvance(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-events-agroadvance',
    scraperFn: fetchAgroAdvance as ScraperFn<Record<string, unknown>>,
    targetTable: 'events',
    conflictKey: 'id',
  })
}
