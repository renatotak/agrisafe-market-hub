import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { logSync } from '@/lib/sync-logger'
import Parser from 'rss-parser'

export const dynamic = 'force-dynamic'

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (RSS Reader)' },
})

/**
 * Regulatory data sources:
 * - Legal news RSS (ConJur, Migalhas, JOTA) filtered for regulatory keywords
 * - BCB SGS API doesn't expose normativos via REST, so we monitor via news
 *
 * Keywords that indicate regulatory content:
 * - Body references: CMN, CVM, BCB, Banco Central, MAPA, Conselho Monetário
 * - Document types: resolução, circular, instrução normativa, decreto, lei
 * - Agro-regulatory topics: crédito rural, CPR, Proagro, seguro rural, Fiagro, CRA, LCA
 */

const REGULATORY_SOURCES = [
  { name: 'ConJur', rss: 'https://www.conjur.com.br/rss.xml' },
  { name: 'Migalhas', rss: 'https://www.migalhas.com.br/rss/quentes.xml' },
  { name: 'JOTA', rss: 'https://www.jota.info/feed' },
]

// Must match at least one regulatory body OR document type
const BODY_PATTERN = /\b(CMN|CVM|BCB|Banco Central|BACEN|Conselho Monetário|MAPA|Ministério da Agricultura)\b/i
const DOC_PATTERN = /\b(resolução|circular|instrução normativa|decreto|medida provisória|lei complementar|portaria)\b/i

// Must also match agro/financial relevance
const AGRO_FINANCE_PATTERN = /crédito rural|agroneg[óo]cio|agropecu[áa]ri|CPR|cédula de produto rural|Proagro|seguro rural|Fiagro|CRA|LCA|barter|financiamento agr[íi]cola|plano safra|cooperativa de crédito|revendas? de insumos|defensivos/i

function extractBody(text: string): string {
  if (/\bCMN\b|Conselho Monetário/i.test(text)) return 'CMN'
  if (/\bCVM\b|Comissão de Valores/i.test(text)) return 'CVM'
  if (/\bBCB\b|\bBACEN\b|Banco Central/i.test(text)) return 'BCB'
  if (/\bMAPA\b|Ministério da Agricultura/i.test(text)) return 'MAPA'
  return 'BCB' // default
}

function extractNormType(text: string): string {
  if (/resolução/i.test(text)) return 'resolucao'
  if (/circular/i.test(text)) return 'circular'
  if (/instrução normativa/i.test(text)) return 'instrucao_normativa'
  if (/decreto/i.test(text)) return 'decreto'
  if (/medida provisória/i.test(text)) return 'medida_provisoria'
  if (/portaria/i.test(text)) return 'portaria'
  return 'outros'
}

function extractNormNumber(text: string): string | null {
  // Match patterns like "Resolução 5.234", "Circular 3.998", "IN 78"
  const match = text.match(/(?:resolução|circular|instrução normativa|IN|decreto|portaria)\s*(?:n[ºo°.]?\s*)?(\d[\d.]*)/i)
  return match ? match[1] : null
}

function classifyImpact(text: string): string {
  const lower = text.toLowerCase()
  // High impact: affects credit granting, CPR, insurance programs
  if (/crédito rural|proagro|seguro rural|financiamento|concessão de crédito|taxa de juro|limite|obrigatóri/i.test(lower)) return 'high'
  // Medium: affects market infrastructure, registries, reporting
  if (/registro|registradora|CERC|CRA|LCA|Fiagro|reporting|transparência/i.test(lower)) return 'medium'
  return 'low'
}

function extractAffectedAreas(text: string): string[] {
  const areas: string[] = []
  const lower = text.toLowerCase()
  if (/crédito rural|financiamento agr/i.test(lower)) areas.push('credito_rural')
  if (/\bCPR\b|cédula de produto/i.test(lower)) areas.push('cpr')
  if (/seguro rural|proagro/i.test(lower)) areas.push('seguro_rural')
  if (/\bCRA\b|certificado de recebíveis/i.test(lower)) areas.push('cra')
  if (/\bLCA\b|letra de crédito/i.test(lower)) areas.push('lca')
  if (/\bFiagro\b/i.test(lower)) areas.push('fiagro')
  if (/cooperativa/i.test(lower)) areas.push('cooperativas')
  if (/registro|registradora|CERC/i.test(lower)) areas.push('registro')
  if (/defensivo|agrotóxico|insumo/i.test(lower)) areas.push('defensivos')
  if (/rastreabilidade/i.test(lower)) areas.push('rastreabilidade')
  if (/\bESG\b|ambient|sustentab/i.test(lower)) areas.push('esg')
  return areas.length > 0 ? areas : ['geral']
}

function generateId(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i)
    hash |= 0
  }
  return `reg-${Math.abs(hash).toString(36)}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const startedAt = new Date().toISOString()

  try {
    const supabase = createAdminClient()
    let totalNew = 0
    let totalFiltered = 0
    const errors: string[] = []

    for (const source of REGULATORY_SOURCES) {
      try {
        const feed = await parser.parseURL(source.rss)
        const items = feed.items.slice(0, 50)

        for (const item of items) {
          if (!item.link) continue

          const title = item.title?.trim() || ''
          const content = item.contentSnippet?.slice(0, 1000) || item.content?.slice(0, 1000) || ''
          const fullText = `${title} ${content}`

          // Must reference a regulatory body or document type
          const hasBody = BODY_PATTERN.test(fullText)
          const hasDoc = DOC_PATTERN.test(fullText)
          if (!hasBody && !hasDoc) { totalFiltered++; continue }

          // Must have agro/finance relevance
          if (!AGRO_FINANCE_PATTERN.test(fullText)) { totalFiltered++; continue }

          const normItem = {
            id: generateId(item.link),
            body: extractBody(fullText),
            norm_type: extractNormType(fullText),
            norm_number: extractNormNumber(fullText),
            title: title.slice(0, 300),
            summary: content.slice(0, 500) || null,
            published_at: item.isoDate ? item.isoDate.split('T')[0] : new Date().toISOString().split('T')[0],
            effective_at: null, // would need to parse from content
            impact_level: classifyImpact(fullText),
            affected_areas: extractAffectedAreas(fullText),
            source_url: item.link,
          }

          const { error } = await supabase
            .from('regulatory_norms')
            .upsert(normItem, { onConflict: 'id', ignoreDuplicates: true })

          if (!error) totalNew++
        }
      } catch (e: any) {
        errors.push(`${source.name}: ${e.message}`)
      }
    }

    await logSync(supabase, {
      source: 'sync-regulatory',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      records_fetched: totalNew + totalFiltered,
      records_inserted: totalNew,
      errors: errors.length,
      status: errors.length === 0 ? 'success' : totalNew > 0 ? 'partial' : 'error',
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
    })

    return NextResponse.json({
      success: true,
      message: 'Regulatory norms synchronized',
      timestamp: new Date().toISOString(),
      stats: { new: totalNew, filtered: totalFiltered },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error syncing regulatory data:', error)
    try {
      const supabase = createAdminClient()
      await logSync(supabase, {
        source: 'sync-regulatory',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        records_fetched: 0, records_inserted: 0, errors: 1,
        status: 'error',
        error_message: error.message,
      })
    } catch {}
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync regulatory data' },
      { status: 500 }
    )
  }
}
