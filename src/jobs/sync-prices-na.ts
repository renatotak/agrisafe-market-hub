/**
 * Phase 25 — sync-prices-na job module.
 *
 * NOTE: this scraper is currently a STUB that fetches but doesn't
 * persist (the original route had a TODO to insert into
 * `commodity_prices_regional`). Logged as such in the activity feed
 * so the operator can see runs even though writes are zero.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import { logActivity } from '@/lib/activity-log'
import type { JobResult } from '@/jobs/types'

export async function runSyncPricesNA(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    const response = await fetch('https://www.noticiasagricolas.com.br/cotacoes/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AgriSafe Bot (Market Data System)' },
    })
    if (!response.ok) throw new Error(`Failed to fetch NA prices: ${response.statusText}`)

    const html = await response.text()
    const $ = cheerio.load(html)
    const scrapedData: any[] = []

    $('.cotacao').each((_, el) => {
      const title = $(el).find('h2').text().trim()
      $(el).find('table tbody tr').each((_, row) => {
        const columns = $(row).find('td')
        if (columns.length >= 2) {
          const locationOrType = $(columns[0]).text().trim()
          const price = $(columns[1]).text().trim()
          const variation = $(columns[2]).text().trim()
          if (locationOrType && price) {
            scrapedData.push({
              commodity_title: title,
              location: locationOrType,
              price,
              variation,
              source: 'Notícias Agrícolas',
              timestamp: new Date().toISOString(),
            })
          }
        }
      })
    })

    const count = scrapedData.length
    const finishedAt = new Date().toISOString()

    await logActivity(supabase, {
      action: 'upsert',
      target_table: 'commodity_prices_regional',
      source: 'sync-prices-na',
      source_kind: 'cron',
      actor: 'cron',
      summary: `NA cotações: ${count} linha(s) extraídas (não persistido — stub)`,
      metadata: { status: 'success', scraped: count, persisted: 0, note: 'scraper stub — does not write' },
    })

    return {
      ok: true,
      status: 'success',
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: count,
      recordsUpdated: 0,
      errors: [],
      stats: { scraped: count, persisted: 0, sample: scrapedData.slice(0, 50) },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logActivity(supabase, {
        action: 'upsert',
        target_table: 'commodity_prices_regional',
        source: 'sync-prices-na',
        source_kind: 'cron',
        actor: 'cron',
        summary: `sync-prices-na falhou: ${message}`.slice(0, 200),
        metadata: { status: 'error', error: message },
      })
    } catch {}
    return {
      ok: false,
      status: 'error',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [message],
    }
  }
}
