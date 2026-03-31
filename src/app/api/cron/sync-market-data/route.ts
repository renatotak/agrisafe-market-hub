import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

// BCB SGS series codes
const COMMODITY_SERIES: Record<string, { series: number; unit: string; source: string }> = {
  soy:    { series: 11752, unit: 'R$/sc 60kg', source: 'CEPEA/BCB' },
  corn:   { series: 11753, unit: 'R$/sc 60kg', source: 'CEPEA/BCB' },
  coffee: { series: 11754, unit: 'R$/sc 60kg', source: 'CEPEA/BCB' },
  sugar:  { series: 11755, unit: 'R$/sc 50kg', source: 'CEPEA/BCB' },
  cotton: { series: 11756, unit: '¢/lb',       source: 'CEPEA/BCB' },
  citrus: { series: 11757, unit: 'R$/cx 40.8kg', source: 'CEPEA/BCB' },
}

const INDICATOR_SERIES: Record<string, { series: number; format: (v: string) => string }> = {
  usd_brl: { series: 1,   format: (v) => `R$ ${parseFloat(v).toFixed(4)}` },
  selic:   { series: 432, format: (v) => `${parseFloat(v).toFixed(2)}%` },
}

async function fetchBCB(seriesCode: number, count = 2): Promise<{ data: string; valor: string }[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados/ultimos/${count}?formato=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`BCB series ${seriesCode}: HTTP ${res.status}`)
  return res.json()
}

function parseBCBDate(dateStr: string): string {
  const [day, month, year] = dateStr.split('/')
  return `${year}-${month}-${day}`
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
    const results: Record<string, unknown> = {}
    const errors: string[] = []

    // Sync commodity prices
    for (const [id, config] of Object.entries(COMMODITY_SERIES)) {
      try {
        const data = await fetchBCB(config.series, 2)
        if (data.length === 0) continue

        const latest = data[data.length - 1]
        const previous = data.length > 1 ? data[data.length - 2] : null
        const price = parseFloat(latest.valor)
        const prevPrice = previous ? parseFloat(previous.valor) : null
        const change24h = prevPrice ? parseFloat(((price - prevPrice) / prevPrice * 100).toFixed(2)) : 0

        const { error } = await supabase
          .from('commodity_prices')
          .update({
            price,
            change_24h: change24h,
            unit: config.unit,
            source: config.source,
            last_update: parseBCBDate(latest.data),
          })
          .eq('id', id)

        if (error) throw error
        results[id] = { price, change24h, date: latest.data }
      } catch (e: any) {
        errors.push(`${id}: ${e.message}`)
      }
    }

    // Sync macro indicators (USD/BRL, Selic)
    for (const [id, config] of Object.entries(INDICATOR_SERIES)) {
      try {
        const data = await fetchBCB(config.series, 2)
        if (data.length === 0) continue

        const latest = data[data.length - 1]
        const previous = data.length > 1 ? data[data.length - 2] : null
        const currentVal = parseFloat(latest.valor)
        const prevVal = previous ? parseFloat(previous.valor) : null

        let trend: 'up' | 'down' | 'stable' = 'stable'
        if (prevVal !== null) {
          if (currentVal > prevVal) trend = 'up'
          else if (currentVal < prevVal) trend = 'down'
        }

        const { error } = await supabase
          .from('market_indicators')
          .update({
            value: config.format(latest.valor),
            trend,
            source: 'BCB',
          })
          .eq('id', id)

        if (error) throw error
        results[id] = { value: config.format(latest.valor), trend }
      } catch (e: any) {
        errors.push(`${id}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Market data synchronized from BCB SGS',
      timestamp: new Date().toISOString(),
      results,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error syncing market data:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync data' },
      { status: 500 }
    )
  }
}
