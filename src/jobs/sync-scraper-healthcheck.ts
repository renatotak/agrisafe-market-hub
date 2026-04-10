/**
 * Phase 25 — sync-scraper-healthcheck job module.
 *
 * Trivial probe scraper. Pings GitHub /zen and writes one row to
 * scraper_runs via runScraper(). No upsert (skipUpsert).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import type { JobResult } from '@/jobs/types'

interface ZenRow extends Record<string, unknown> {
  source: string
  message: string
  fetched_at: string
}

const fetchZen: ScraperFn<ZenRow> = async () => {
  const res = await fetch('https://api.github.com/zen', {
    headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (scraper-healthcheck)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`github zen returned http ${res.status}`)
  const text = (await res.text()).trim()
  const bytes = Number(res.headers.get('content-length')) || text.length
  return {
    rows: [{ source: 'github-zen', message: text, fetched_at: new Date().toISOString() }],
    httpStatus: res.status,
    bytesFetched: bytes,
  }
}

export function runSyncScraperHealthcheck(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-scraper-healthcheck',
    scraperFn: fetchZen as ScraperFn<Record<string, unknown>>,
    targetTable: '__none__',
    conflictKey: '',
    skipUpsert: true,
  })
}
