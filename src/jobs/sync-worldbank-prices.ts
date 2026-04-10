/**
 * Phase 25 — sync-worldbank-prices job module.
 *
 * Logic moved verbatim from src/app/api/cron/sync-worldbank-prices/route.ts
 * (Phase 24E).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import type { JobResult } from '@/jobs/types'

const PINK_SHEET_URL =
  'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Annual.xlsx'

const SHEET_NAME = 'Annual Prices (Nominal)'
const HEADER_ROW = 4
const UNIT_ROW = 5
const DATA_START_ROW = 6

const COMMODITY_COLUMNS: { col: number; slug: string; expectedNamePrefix: string; expectedUnit: string }[] = [
  { col: 12, slug: 'cafe',     expectedNamePrefix: 'Coffee, Arabica', expectedUnit: '$/kg' },
  { col: 24, slug: 'soja',     expectedNamePrefix: 'Soybeans',        expectedUnit: '$/mt' },
  { col: 28, slug: 'milho',    expectedNamePrefix: 'Maize',           expectedUnit: '$/mt' },
  { col: 34, slug: 'trigo',    expectedNamePrefix: 'Wheat, US SRW',   expectedUnit: '$/mt' },
  { col: 45, slug: 'acucar',   expectedNamePrefix: 'Sugar, world',    expectedUnit: '$/kg' },
  { col: 52, slug: 'algodao',  expectedNamePrefix: 'Cotton, A Index', expectedUnit: '$/kg' },
]

const RECENT_YEARS = 15

interface PriceRow extends Record<string, unknown> {
  source_id: 'worldbank_pinksheet'
  category: 'price_index'
  commodity: string
  region: 'World'
  indicator: 'price'
  value: number
  unit: string
  period: string
  reference_date: string
  metadata: { wb_column_label: string }
}

const worldbankPricesScraper: ScraperFn<PriceRow> = async () => {
  const res = await fetch(PINK_SHEET_URL, {
    headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (World Bank Pink Sheet scraper)' },
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) throw new Error(`World Bank Pink Sheet returned http ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const bytes = buf.length

  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[SHEET_NAME]
  if (!ws) throw new Error(`World Bank workbook missing expected sheet "${SHEET_NAME}"`)

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
  if (aoa.length < DATA_START_ROW + 5) {
    throw new Error(`World Bank sheet has only ${aoa.length} rows — schema may have changed`)
  }
  const headers = aoa[HEADER_ROW] as unknown[]
  const units = aoa[UNIT_ROW] as unknown[]

  for (const map of COMMODITY_COLUMNS) {
    const headerVal = String(headers[map.col] || '')
    const unitVal = String(units[map.col] || '')
    if (!headerVal.startsWith(map.expectedNamePrefix)) {
      throw new Error(`Pink Sheet column drift: col ${map.col} expected "${map.expectedNamePrefix}*" but got "${headerVal}"`)
    }
    if (!unitVal.includes(map.expectedUnit)) {
      throw new Error(`Pink Sheet unit drift: col ${map.col} (${map.slug}) expected unit "${map.expectedUnit}" but got "${unitVal}"`)
    }
  }

  const rows: PriceRow[] = []
  let yearsCollected = 0
  for (let rowIdx = aoa.length - 1; rowIdx >= DATA_START_ROW; rowIdx--) {
    const row = aoa[rowIdx]
    const yearCell = row[0]
    if (typeof yearCell !== 'number' || yearCell < 1900 || yearCell > 2100) continue
    const year = yearCell

    for (const map of COMMODITY_COLUMNS) {
      const cell = row[map.col]
      if (cell == null || cell === '…' || cell === '') continue
      const value = typeof cell === 'number' ? cell : parseFloat(String(cell))
      if (!Number.isFinite(value)) continue

      const headerVal = String(headers[map.col])
      const unitVal = String(units[map.col])

      rows.push({
        source_id: 'worldbank_pinksheet',
        category: 'price_index',
        commodity: map.slug,
        region: 'World',
        indicator: 'price',
        value,
        unit: unitVal,
        period: String(year),
        reference_date: `${year}-12-31`,
        metadata: { wb_column_label: headerVal },
      })
    }

    yearsCollected++
    if (yearsCollected >= RECENT_YEARS) break
  }

  return {
    rows,
    httpStatus: res.status,
    bytesFetched: bytes,
    targetPeriod: new Date().toISOString().slice(0, 10),
  }
}

export function runSyncWorldbankPrices(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-worldbank-prices',
    scraperFn: worldbankPricesScraper as ScraperFn<Record<string, unknown>>,
    targetTable: 'macro_statistics',
    conflictKey: 'source_id,commodity,region,indicator,period',
  })
}
