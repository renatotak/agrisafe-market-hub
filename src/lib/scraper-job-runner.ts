/**
 * Phase 25 — adapter that turns a `runScraper()` invocation + an upsert
 * into a `JobResult`.
 *
 * The 9 runScraper-based cron routes (sync-cnj-atos, sync-cvm-agro,
 * sync-bcb-rural, sync-key-agro-laws, sync-worldbank-prices,
 * sync-events-agroadvance, sync-faostat, sync-agrofit-bulk,
 * sync-scraper-healthcheck) all share the same shape:
 *
 *   1. Define a ScraperFn that fetches + validates a list of rows
 *   2. Call runScraper() — this writes scraper_runs + activity_log
 *   3. Upsert the rows into the target table
 *   4. Return a structured response
 *
 * This helper collapses steps 2-4 into one call so each job module
 * stays small (~30 lines + the scraper function body).
 *
 * Why this lives separately from `runScraper()`:
 *   - `runScraper()` is the protocol-level wrapper (validation, health,
 *     scraper_runs ledger). It doesn't know about target tables.
 *   - This helper is the JOB-level adapter — it knows the upsert target
 *     and produces the unified `JobResult` shape consumed by the
 *     dispatcher and the HTTP route wrappers.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { runScraper, type ScraperFn, type ValidationError } from '@/lib/scraper-runner'
import type { JobResult } from '@/jobs/types'

function formatValidationErrors(errs: ValidationError[]): string[] {
  return errs.map((e) => `row ${e.row_index} ${e.key}: expected ${e.expected}, got ${e.got}`)
}

export interface RunScraperJobOptions {
  /** Supabase admin client */
  supabase: SupabaseClient
  /** Scraper id as registered in `scraper_registry` */
  scraperId: string
  /** ScraperFn implementation */
  scraperFn: ScraperFn<Record<string, unknown>>
  /** Target table to upsert returned rows into */
  targetTable: string
  /** Column name(s) used as conflict key for the upsert */
  conflictKey: string
  /** Skip the upsert step entirely (probe-style scrapers like healthcheck) */
  skipUpsert?: boolean
}

export async function runScraperJob(opts: RunScraperJobOptions): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    const outcome = await runScraper(opts.scraperId, opts.scraperFn, { supabase: opts.supabase })
    const finishedAt = new Date().toISOString()
    const durationMs = Date.now() - startedAtDate.getTime()

    if (!outcome.ok) {
      return {
        ok: false,
        status: 'error',
        startedAt,
        finishedAt,
        durationMs,
        recordsFetched: outcome.rowsFetched,
        recordsUpdated: 0,
        errors: [outcome.errorMessage || 'scraper failed', ...formatValidationErrors(outcome.validationErrors || [])],
        stats: { runId: outcome.runId, scraperStatus: outcome.status },
      }
    }

    let upserted = 0
    if (!opts.skipUpsert && outcome.rows.length > 0) {
      const { error: upErr, count } = await opts.supabase
        .from(opts.targetTable)
        .upsert(outcome.rows, { onConflict: opts.conflictKey, count: 'exact' })
      if (upErr) {
        return {
          ok: false,
          status: 'error',
          startedAt,
          finishedAt,
          durationMs,
          recordsFetched: outcome.rowsFetched,
          recordsUpdated: 0,
          errors: [`upsert into ${opts.targetTable}: ${upErr.message}`],
          stats: { runId: outcome.runId },
        }
      }
      upserted = count ?? outcome.rows.length
    }

    return {
      ok: true,
      status: outcome.status === 'success' ? 'success' : 'partial',
      startedAt,
      finishedAt,
      durationMs,
      recordsFetched: outcome.rowsFetched,
      recordsUpdated: upserted,
      errors: formatValidationErrors(outcome.validationErrors || []),
      stats: { runId: outcome.runId, scraperStatus: outcome.status },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
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
