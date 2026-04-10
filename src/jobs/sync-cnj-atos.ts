/**
 * Phase 25 — sync-cnj-atos job module.
 *
 * Logic moved from src/app/api/cron/sync-cnj-atos/route.ts (Phase 24F).
 * The scraper emits regulatory_norms-shaped rows directly so we hand
 * the result to runScraperJob without any post-processing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import { classifyCnaes } from '@/lib/cnae-classifier'
import type { JobResult } from '@/jobs/types'

const CNJ_API_BASE = 'https://atos.cnj.jus.br/api/atos'
const PAGES_TO_WALK = 10
const PER_PAGE = 20
const UA = 'AgriSafe-MarketHub/1.0 (CNJ atos scraper)'

const AGRO_PATTERN =
  /\bagroneg[óo]cio|\brura(?:l|is)\b|\bagr[íi]col|\bsafra\b|\bproduto[rs]e?s?\s+rura(?:l|is)|\bcooperativ(?:a)?\s+agr|\bcpr\b|c[ée]dula de produto rural|\bfiagro|\bcr[ée]dito\s+rural|recupera[çc][ãa]o\s+judicial.{0,80}(?:rura(?:l|is)|agro|produto[rs]|fazend)|\bfal[êe]ncia.{0,80}(?:rura(?:l|is)|agro|produto[rs])|fazend[ae]|terras?\s+ind[íi]gen|reforma\s+agr[áa]ri/i

interface CNJAto {
  id: number
  tipo: string
  numero: number
  data_publicacao: string
  situacao: string
  assunto: string | null
  ementa: string | null
  url_ato: string | null
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
    .replace(/&nbsp;/g, ' ').replace(/&ordm;/gi, 'º').replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í').replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú').replace(/&atilde;/gi, 'ã').replace(/&otilde;/gi, 'õ')
    .replace(/&ccedil;/gi, 'ç').replace(/&ecirc;/gi, 'ê').replace(/&ocirc;/gi, 'ô')
    .replace(/&acirc;/gi, 'â').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim()
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
  if (/recupera[çc][ãa]o judicial|fal[êe]ncia|cr[ée]dito rural|cpr|fiagro|patrim[ôo]nio rural/.test(t)) return 'high'
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

const cnjAtosScraper: ScraperFn<CNJNormRow> = async () => {
  const hits: CNJNormRow[] = []

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
    if (!res.ok) throw new Error(`CNJ API returned http ${res.status} on page ${page}`)
    const json = await res.json()
    const items = (json.data as CNJAto[]) || []
    if (items.length === 0) break

    for (const ato of items) {
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
    await new Promise((r) => setTimeout(r, 250))
  }

  return { rows: hits, httpStatus: 200, targetPeriod: new Date().toISOString().slice(0, 10) }
}

export function runSyncCnjAtos(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-cnj-atos',
    scraperFn: cnjAtosScraper as ScraperFn<Record<string, unknown>>,
    targetTable: 'regulatory_norms',
    conflictKey: 'id',
  })
}
