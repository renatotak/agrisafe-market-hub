/**
 * Phase 25 — sync-cvm-agro job module.
 * Logic moved from src/app/api/cron/sync-cvm-agro/route.ts (Phase 24D + 24G2 fixes).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import { classifyCnaes } from '@/lib/cnae-classifier'
import type { JobResult } from '@/jobs/types'

const UA = 'Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)'

const CVM_INDEX_PAGES = [
  'https://conteudo.cvm.gov.br/legislacao/instrucoes.html',
  'https://conteudo.cvm.gov.br/legislacao/resolucoes.html',
] as const

const BODY_AGRO_PATTERN =
  /agroneg[óo]cio|crédito rural|fiagro|\bcpr\b|c[ée]dula de produto rural|\bcra\b\s+(?:do\s+)?agroneg|barter agr[íi]col|cadeia agr[íi]col|insumo agr[íi]col|cooperativa agr[íi]col|defensivo agr[íi]col|fertilizant|sement[se]\s+(?:fiscaliz|registro)|FII[\s-]*agro/i

function makeId(instNumber: string): string {
  return `cvm-${instNumber}`
}

function extractDocNumber(url: string): { kind: 'instrucao' | 'resolucao'; number: string } | null {
  const inst = url.match(/inst(\d+)\.html/i)
  if (inst) return { kind: 'instrucao', number: inst[1] }
  const resol = url.match(/resol(\d+)\.html/i)
  if (resol) return { kind: 'resolucao', number: resol[1] }
  return null
}

async function fetchCVMIndexLinks(indexUrl: string): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(indexUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
  } catch {
    return []
  }
  if (!res.ok) return []
  const html = await res.text()
  const linkPattern = /href=["']([^"']*\/legislacao\/(?:instrucoes|resolucoes)\/(?:inst|resol)\d+\.html)["']/gi
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

const PT_MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

function extractDate(body: string): string | null {
  const t = body.toLowerCase()
  const footerMarkers = [
    'atualizado em', 'última atualização', 'última modificação',
    'data da última modificação', 'arquivos relacionados',
  ]
  let cut = t.length
  for (const marker of footerMarkers) {
    const idx = t.indexOf(marker)
    if (idx > 0 && idx < cut) cut = idx
  }
  const head = body.slice(0, cut)
  const slashRe = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g
  let m: RegExpExecArray | null
  while ((m = slashRe.exec(head)) !== null) {
    const day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10)
    if (day < 1 || day > 31 || month < 1 || month > 12) continue
    if (year < 1976 || year > 2099) continue
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const ptDateRe = /(\d{1,2})\s+de\s+([a-zçãéí]+)\s+de\s+(\d{4})/gi
  const lower = head.toLowerCase()
  while ((m = ptDateRe.exec(lower)) !== null) {
    const day = parseInt(m[1], 10), month = PT_MONTHS[m[2]], year = parseInt(m[3], 10)
    if (!month || year < 1976 || year > 2099) continue
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
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

  let title = ($('title').first().text() || $('h1').first().text() || '').trim()
  title = title.replace(/\s*[-—|]\s*comissão de valores mobiliários.*/i, '').trim()
  if (!title) return null

  $('script,style,nav,header,footer').remove()
  const body = $('body').text().replace(/\s+/g, ' ').trim()
  const summary = body.slice(0, 500)

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

const cvmAgroScraper: ScraperFn<CVMNorm> = async () => {
  const seen = new Set<string>()
  const results: CVMNorm[] = []

  for (const indexUrl of CVM_INDEX_PAGES) {
    const links = await fetchCVMIndexLinks(indexUrl)
    for (const url of links) seen.add(url)
    await new Promise((r) => setTimeout(r, 500))
  }

  let count = 0
  for (const url of seen) {
    if (count >= 60) break
    const norm = await fetchCVMNorm(url)
    if (norm) results.push(norm)
    count++
    await new Promise((r) => setTimeout(r, 400))
  }

  return { rows: results, httpStatus: 200, targetPeriod: new Date().toISOString().slice(0, 10) }
}

export function runSyncCvmAgro(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-cvm-agro',
    scraperFn: cvmAgroScraper as ScraperFn<Record<string, unknown>>,
    targetTable: 'regulatory_norms',
    conflictKey: 'id',
  })
}
