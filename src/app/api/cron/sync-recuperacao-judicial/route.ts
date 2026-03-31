import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Parser from 'rss-parser'
import { RJ_NEWS_SOURCES, RJ_KEYWORDS } from '@/data/recuperacao'

export const dynamic = 'force-dynamic'

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'AgriSafe-MarketHub/1.0 (RSS Reader)',
  },
})

const RJ_PATTERN = /recupera[çc][ãa]o judicial/i
const AGRO_PATTERN = /produtor rural|agroneg[óo]cio|usina|cooperativa|agropecuári|agroind[úu]stri|cana-de-a[çc][úu]car|soja|milho|algod[ãa]o|caf[ée]/i

function classifyEntityType(text: string): string {
  const lower = text.toLowerCase()
  if (/produtor rural|produtores rurais/.test(lower)) return 'produtor_rural'
  if (/cooperativa/.test(lower)) return 'cooperativa'
  if (/usina/.test(lower)) return 'usina'
  if (/agro|agríc|pecuári/.test(lower)) return 'empresa_agro'
  return 'outros'
}

function extractState(text: string): string | null {
  const statePatterns: Record<string, RegExp> = {
    'SP': /s[ãa]o paulo|tjsp/i,
    'MT': /mato grosso(?! do sul)|tjmt/i,
    'MS': /mato grosso do sul|tjms/i,
    'GO': /goi[áa]s|tjgo/i,
    'MG': /minas gerais|tjmg/i,
    'PR': /paran[áa]|tjpr/i,
    'RS': /rio grande do sul|tjrs/i,
    'BA': /bahia|tjba/i,
    'TO': /tocantins|tjto/i,
    'MA': /maranh[ãa]o|tjma/i,
    'PA': /par[áa](?! do)|tjpa/i,
    'PI': /piau[ií]|tjpi/i,
  }
  for (const [uf, pattern] of Object.entries(statePatterns)) {
    if (pattern.test(text)) return uf
  }
  return null
}

function generateId(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i)
    hash |= 0
  }
  return `rj-${Math.abs(hash).toString(36)}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    let totalNew = 0
    let totalFiltered = 0
    const errors: string[] = []

    for (const source of RJ_NEWS_SOURCES) {
      try {
        const feed = await parser.parseURL(source.rss)
        const items = feed.items.slice(0, 50) // Check more items since most won't match

        for (const item of items) {
          if (!item.link) continue

          const title = item.title?.trim() || ''
          const content = item.contentSnippet?.slice(0, 1000) || item.content?.slice(0, 1000) || ''
          const fullText = `${title} ${content}`

          // Must mention recuperação judicial AND have agro context
          if (!RJ_PATTERN.test(fullText) || !AGRO_PATTERN.test(fullText)) {
            totalFiltered++
            continue
          }

          const rjItem = {
            id: generateId(item.link),
            entity_name: title.slice(0, 200),
            entity_cnpj: null,
            entity_type: classifyEntityType(fullText),
            court: null,
            case_number: null,
            status: 'em_andamento',
            filing_date: item.isoDate ? item.isoDate.split('T')[0] : null,
            summary: content.slice(0, 500) || null,
            source_url: item.link,
            source_name: source.name,
            state: extractState(fullText),
          }

          const { error } = await supabase
            .from('recuperacao_judicial')
            .upsert(rjItem, { onConflict: 'id', ignoreDuplicates: true })

          if (!error) totalNew++
        }
      } catch (e: any) {
        errors.push(`${source.name}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Recuperação judicial data synchronized',
      timestamp: new Date().toISOString(),
      stats: { new: totalNew, filtered: totalFiltered },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error syncing RJ data:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync RJ data' },
      { status: 500 }
    )
  }
}
