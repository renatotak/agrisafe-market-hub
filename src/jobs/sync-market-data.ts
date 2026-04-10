/**
 * Phase 25 — Mac-as-server cron extraction.
 *
 * Pure job logic for sync-market-data, framework-agnostic. Both the
 * Next.js cron route AND the standalone launchd CLI wrapper call
 * `runSyncMarketData()` so the BCB SGS pipeline lives in exactly one place.
 *
 * Why this layer exists:
 *   - Vercel Hobby caps cron at one daily entry, so the original route
 *     could only run inside `sync-all` at 08:00 UTC.
 *   - Moving ingestion to a 24/7 Mac via launchd lets every scraper have
 *     its own cadence without ditching the existing Next.js cron route
 *     (still useful for manual triggers + Vercel fallback).
 *   - Extracting the body into a job module keeps the route AND the CLI
 *     wrapper trivial — they just create a Supabase admin client and
 *     hand it to `runSyncMarketData()`.
 *
 * The function never throws — it catches everything and returns a
 * structured `JobResult` so callers (route handler, CLI script, future
 * orchestrator) can decide how to surface the outcome.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logSync } from '@/lib/sync-logger'
import { logActivity } from '@/lib/activity-log'
import type { JobResult, JobStatus } from '@/jobs/types'

// BCB SGS series codes (same as before — single source of truth lives here now)
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

/**
 * Run the BCB SGS sync end-to-end.
 *
 * - Pulls latest 2 datapoints for 6 commodities and 2 macro indicators
 * - Updates `commodity_prices` (latest) + upserts `commodity_price_history` (daily)
 * - Updates `market_indicators` (USD/BRL, Selic)
 * - Writes a `sync_logs` row + an `activity_log` row (fail-soft)
 *
 * Never throws. Caller inspects `result.ok` / `result.status`.
 */
export async function runSyncMarketData(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()
  const results: Record<string, unknown> = {}
  const errors: string[] = []
  let updated = 0

  try {
    // ─── Commodity prices ──────────────────────────────────────────
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

        await supabase
          .from('commodity_price_history')
          .upsert(
            {
              commodity_id: id,
              price,
              change_24h: change24h,
              recorded_at: parseBCBDate(latest.data),
            },
            { onConflict: 'commodity_id,recorded_at' },
          )

        results[id] = { price, change24h, date: latest.data }
        updated++
      } catch (e: any) {
        errors.push(`${id}: ${e.message}`)
      }
    }

    // ─── Macro indicators ──────────────────────────────────────────
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
        updated++
      } catch (e: any) {
        errors.push(`${id}: ${e.message}`)
      }
    }

    const finishedAtDate = new Date()
    const finishedAt = finishedAtDate.toISOString()
    const durationMs = finishedAtDate.getTime() - startedAtDate.getTime()
    const status: JobStatus = errors.length === 0 ? 'success' : updated > 0 ? 'partial' : 'error'

    // Logging — both rails (legacy sync_logs + Phase 24G2 activity_log)
    await logSync(supabase, {
      source: 'sync-market-data',
      started_at: startedAt,
      finished_at: finishedAt,
      records_fetched: Object.keys(COMMODITY_SERIES).length + Object.keys(INDICATOR_SERIES).length,
      records_inserted: updated,
      errors: errors.length,
      status,
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
    })

    await logActivity(supabase, {
      action: 'update',
      target_table: 'commodity_prices',
      source: 'sync-market-data',
      source_kind: 'cron',
      actor: 'cron',
      summary: `BCB SGS: ${updated} commodities/indicators atualizados${errors.length ? ` (${errors.length} erro(s))` : ''}`,
      metadata: { status, updated, errors: errors.length, duration_ms: durationMs },
    })

    return {
      ok: status !== 'error',
      status,
      startedAt,
      finishedAt,
      durationMs,
      recordsFetched: Object.keys(COMMODITY_SERIES).length + Object.keys(INDICATOR_SERIES).length,
      recordsUpdated: updated,
      errors,
      stats: { results },
    }
  } catch (error: any) {
    const finishedAt = new Date().toISOString()
    const durationMs = Date.now() - startedAtDate.getTime()
    const message = error?.message || 'unknown error'

    try {
      await logSync(supabase, {
        source: 'sync-market-data',
        started_at: startedAt,
        finished_at: finishedAt,
        records_fetched: 0,
        records_inserted: 0,
        errors: 1,
        status: 'error',
        error_message: message,
      })
      await logActivity(supabase, {
        action: 'update',
        target_table: 'commodity_prices',
        source: 'sync-market-data',
        source_kind: 'cron',
        actor: 'cron',
        summary: `sync-market-data falhou: ${message}`.slice(0, 200),
        metadata: { status: 'error', error: message },
      })
    } catch {
      // logging is best-effort
    }

    return {
      ok: false,
      status: 'error',
      startedAt,
      finishedAt,
      durationMs,
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [message],
      stats: { results },
    }
  }
}
