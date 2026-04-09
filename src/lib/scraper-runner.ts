/**
 * Scraper Runner — Phase 19A foundation for the AgriSafe scraper resilience protocol.
 *
 * Every new scraper from Phase 19 onward should call `runScraper()` instead of
 * writing to the target table directly. The wrapper:
 *
 *   1. Looks up the scraper definition in `scraper_registry` (the single source
 *      of truth — definitions live in the DB, not inline in route files).
 *   2. Opens a `scraper_runs` row with timing, attempt, git_sha.
 *   3. Calls the user-supplied scraper function inside try/catch.
 *   4. Validates the returned rows DETERMINISTICALLY against the registered
 *      schema_check (required keys, types, numeric ranges, enum values, row
 *      count). NO LLM is involved — guardrail #1 from CLAUDE.md.
 *   5. Updates the registry row's health (last_success_at, consecutive_failures,
 *      status) with cadence-aware grace periods.
 *   6. On any failure, writes a `scraper_knowledge` row of kind=`failure` with
 *      the diagnostic so a human can read the history when fixing it.
 *   7. Calls the legacy `logSync()` internally so the existing DataSources UI
 *      keeps working unchanged.
 *
 * The auto-correction loop is HUMAN-DRIVEN. See documentation/SCRAPER_PROTOCOL.md for
 * the full design rationale.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/utils/supabase/admin'
import { logSync } from '@/lib/sync-logger'
import { logActivity } from '@/lib/activity-log'

// ─── Types ────────────────────────────────────────────────────

export type ScraperKind = 'rss' | 'html' | 'api' | 'csv' | 'pdf' | 'json' | 'xlsx'
export type ScraperCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'manual'
export type ScraperStatus = 'healthy' | 'degraded' | 'broken' | 'disabled'
export type RunStatus = 'success' | 'partial' | 'validation_failed' | 'fetch_error' | 'parse_error'
export type TriggeredBy = 'cron' | 'manual' | 'retry' | 'test'

export interface SchemaCheck {
  required_keys: string[]
  sample_row: Record<string, 'string' | 'number' | 'boolean' | 'object'>
  numeric_ranges?: Record<string, { min?: number; max?: number }>
  enum_values?: Record<string, string[]>
}

export interface ScraperRegistryRow {
  scraper_id: string
  name: string
  kind: ScraperKind
  target_table: string | null
  cadence: ScraperCadence
  grace_period_hours: number
  schema_check: SchemaCheck
  expected_min_rows: number
  status: ScraperStatus
  consecutive_failures: number
  last_success_at: string | null
  last_failure_at: string | null
}

export interface ValidationError {
  row_index: number
  key: string
  expected: string
  got: string
}

export interface ScraperResult<T> {
  rows: T[]
  httpStatus?: number
  bytesFetched?: number
  targetPeriod?: string
}

export interface ScraperContext {
  scraperId: string
  supabase: SupabaseClient
  gitSha?: string
  registry: ScraperRegistryRow
}

export type ScraperFn<T> = (ctx: ScraperContext) => Promise<ScraperResult<T>>

export interface RunOptions {
  triggeredBy?: TriggeredBy
  attemptNumber?: number
  supabase?: SupabaseClient
}

export interface RunOutcome<T = Record<string, unknown>> {
  ok: boolean
  runId: string
  status: RunStatus
  rowsFetched: number
  rowsInserted: number
  /**
   * Validated rows ready for upsert. Empty when ok=false. The wrapper
   * does NOT write to the target_table itself — that's the caller's
   * job (lets the route choose its own onConflict key).
   */
  rows: T[]
  validationErrors: ValidationError[]
  errorMessage?: string
}

// ─── Pure helpers (deterministic, exported for testing) ──────

/**
 * Validate a batch of scraped rows against the registered schema_check.
 * Returns an array of ValidationError. Empty array = pass.
 *
 * Checks performed (all algorithmic, no LLM):
 *   - rows.length >= expected_min_rows
 *   - every required_key present on every row
 *   - typeof every key matches sample_row entry
 *   - numeric values within numeric_ranges (if defined)
 *   - enum-typed values in enum_values allowlist (if defined)
 */
export function validatePayload(
  rows: unknown[],
  schema: SchemaCheck,
  expectedMinRows: number
): ValidationError[] {
  const errors: ValidationError[] = []

  if (rows.length < expectedMinRows) {
    errors.push({
      row_index: -1,
      key: '__row_count__',
      expected: `>= ${expectedMinRows}`,
      got: String(rows.length),
    })
    return errors
  }

  rows.forEach((rawRow, idx) => {
    if (rawRow === null || typeof rawRow !== 'object') {
      errors.push({ row_index: idx, key: '__row__', expected: 'object', got: typeof rawRow })
      return
    }
    const row = rawRow as Record<string, unknown>

    for (const key of schema.required_keys) {
      if (!(key in row) || row[key] === null || row[key] === undefined) {
        errors.push({ row_index: idx, key, expected: 'present', got: 'missing' })
      }
    }

    for (const [key, expectedType] of Object.entries(schema.sample_row)) {
      if (!(key in row)) continue // already reported by required_keys check
      const got = typeof row[key]
      if (got !== expectedType) {
        errors.push({ row_index: idx, key, expected: expectedType, got })
      }
    }

    if (schema.numeric_ranges) {
      for (const [key, range] of Object.entries(schema.numeric_ranges)) {
        const v = row[key]
        if (typeof v !== 'number') continue
        if (range.min !== undefined && v < range.min) {
          errors.push({ row_index: idx, key, expected: `>= ${range.min}`, got: String(v) })
        }
        if (range.max !== undefined && v > range.max) {
          errors.push({ row_index: idx, key, expected: `<= ${range.max}`, got: String(v) })
        }
      }
    }

    if (schema.enum_values) {
      for (const [key, allowed] of Object.entries(schema.enum_values)) {
        const v = row[key]
        if (typeof v !== 'string') continue
        if (!allowed.includes(v)) {
          errors.push({ row_index: idx, key, expected: `one of [${allowed.join(',')}]`, got: v })
        }
      }
    }
  })

  return errors
}

/**
 * Cadence-aware status transition.
 * - 1 failure within grace_period → stays healthy
 * - 1 failure beyond grace_period → degraded
 * - 3+ consecutive failures → broken
 * Disabled scrapers stay disabled regardless.
 */
export function computeNextStatus(
  current: ScraperStatus,
  consecutiveFailures: number,
  gracePeriodHours: number,
  hoursSinceLastSuccess: number | null
): ScraperStatus {
  if (current === 'disabled') return 'disabled'
  if (consecutiveFailures === 0) return 'healthy'
  if (consecutiveFailures >= 3) return 'broken'
  if (hoursSinceLastSuccess !== null && hoursSinceLastSuccess > gracePeriodHours) return 'degraded'
  return 'healthy'
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return ms / (1000 * 60 * 60)
}

function classifyError(err: Error): RunStatus {
  const msg = (err.message || '').toLowerCase()
  if (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('http') ||
    msg.includes('404') ||
    msg.includes('500')
  ) {
    return 'fetch_error'
  }
  return 'parse_error'
}

// ─── Main wrapper ────────────────────────────────────────────

export async function runScraper<T extends Record<string, unknown>>(
  scraperId: string,
  fn: ScraperFn<T>,
  opts: RunOptions = {}
): Promise<RunOutcome<T>> {
  const supabase = opts.supabase || createAdminClient()
  const triggeredBy = opts.triggeredBy || 'cron'
  const attemptNumber = opts.attemptNumber || 1
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || undefined

  const startedAt = new Date()
  const startedAtIso = startedAt.toISOString()

  // 1. Load registry row (the single source of truth)
  const { data: registry, error: regErr } = await supabase
    .from('scraper_registry')
    .select('*')
    .eq('scraper_id', scraperId)
    .single()

  if (regErr || !registry) {
    throw new Error(
      `runScraper: scraper "${scraperId}" not found in scraper_registry. ` +
        `Add it via a migration before calling runScraper().`
    )
  }

  // 2. Open the run row
  const { data: runRow, error: runErr } = await supabase
    .from('scraper_runs')
    .insert({
      scraper_id: scraperId,
      started_at: startedAtIso,
      triggered_by: triggeredBy,
      attempt_number: attemptNumber,
      git_sha: gitSha,
      status: 'success', // optimistic, overwritten below
    })
    .select('run_id')
    .single()

  if (runErr || !runRow) {
    // We could not even open a run row. Surface the error to the caller —
    // bubbling means the cron route's existing try/catch handles it.
    throw new Error(`runScraper: failed to open scraper_runs row: ${runErr?.message}`)
  }
  const runId = runRow.run_id as string

  let result: ScraperResult<T> | undefined
  let caught: Error | null = null

  try {
    result = await fn({ scraperId, supabase, gitSha, registry: registry as ScraperRegistryRow })
  } catch (e) {
    caught = e instanceof Error ? e : new Error(String(e))
  }

  const finishedAt = new Date()
  const durationMs = finishedAt.getTime() - startedAt.getTime()
  const samplePayload = result?.rows?.slice(0, 3) ?? null

  // 3. Determine status
  let status: RunStatus
  let validationErrors: ValidationError[] = []
  let errorMessage: string | undefined

  if (caught) {
    status = classifyError(caught)
    errorMessage = caught.message
  } else if (!result) {
    status = 'parse_error'
    errorMessage = 'scraper function returned undefined'
  } else {
    validationErrors = validatePayload(
      result.rows,
      registry.schema_check as SchemaCheck,
      registry.expected_min_rows
    )
    if (validationErrors.length > 0) {
      status = 'validation_failed'
      errorMessage = `${validationErrors.length} validation error(s) — see scraper_runs.validation_errors`
    } else {
      status = 'success'
    }
  }

  // 4. Close the run row
  await supabase
    .from('scraper_runs')
    .update({
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      http_status: result?.httpStatus,
      bytes_fetched: result?.bytesFetched,
      target_period: result?.targetPeriod,
      rows_fetched: result?.rows?.length ?? 0,
      rows_inserted: status === 'success' ? result?.rows?.length ?? 0 : 0,
      validation_errors: validationErrors,
      sample_payload: samplePayload,
      status,
      error_message: errorMessage,
    })
    .eq('run_id', runId)

  // 5. Update the registry row's health
  const isSuccess = status === 'success'
  const newConsecutiveFailures = isSuccess ? 0 : (registry.consecutive_failures || 0) + 1
  const hoursSinceSuccess = hoursSince(registry.last_success_at)
  const newStatus = computeNextStatus(
    registry.status as ScraperStatus,
    newConsecutiveFailures,
    registry.grace_period_hours,
    hoursSinceSuccess
  )

  await supabase
    .from('scraper_registry')
    .update({
      last_success_at: isSuccess ? finishedAt.toISOString() : registry.last_success_at,
      last_failure_at: isSuccess ? registry.last_failure_at : finishedAt.toISOString(),
      consecutive_failures: newConsecutiveFailures,
      status: newStatus,
    })
    .eq('scraper_id', scraperId)

  // 6. On failure, write a knowledge row
  if (!isSuccess) {
    const knowledgeBody = errorMessage
      ? `${errorMessage}\n\nValidation errors:\n${JSON.stringify(validationErrors, null, 2)}\n\nSample payload:\n${JSON.stringify(samplePayload, null, 2)}`
      : `Scraper failed with status ${status}.`
    await supabase.from('scraper_knowledge').insert({
      scraper_id: scraperId,
      kind: 'failure',
      title: `${status} on ${startedAtIso.slice(0, 10)} (run ${runId.slice(0, 8)})`,
      body: knowledgeBody,
      severity: status === 'fetch_error' ? 'error' : 'warn',
      related_run_id: runId,
      created_by: 'system',
    })
  }

  // 7. Backward-compat: also write to legacy sync_logs for the DataSources UI
  await logSync(supabase, {
    source: scraperId,
    started_at: startedAtIso,
    finished_at: finishedAt.toISOString(),
    records_fetched: result?.rows?.length ?? 0,
    records_inserted: isSuccess ? result?.rows?.length ?? 0 : 0,
    errors: isSuccess ? 0 : 1,
    status: isSuccess ? 'success' : 'error',
    error_message: errorMessage,
  })

  // 8. Phase 24G2 — write to activity_log so the Settings → Activity Log
  // panel surfaces every scraper run with its row count and status. The
  // helper is fail-soft, so a missing/locked activity_log doesn't break
  // the scraper.
  await logActivity(supabase, {
    action: 'upsert',
    target_table: registry.target_table || 'unknown',
    target_id: null, // a single run touches many rows; the run_id is the granular pointer
    source: scraperId,
    source_kind: 'cron',
    actor: 'cron',
    summary: isSuccess
      ? `${scraperId}: ${result?.rows?.length ?? 0} rows fetched in ${durationMs}ms`
      : `${scraperId} ${status}: ${errorMessage || 'unknown error'}`,
    metadata: {
      run_id: runId,
      status,
      duration_ms: durationMs,
      rows_fetched: result?.rows?.length ?? 0,
      consecutive_failures: newConsecutiveFailures,
      validation_error_count: validationErrors.length,
    },
  })

  return {
    ok: isSuccess,
    runId,
    status,
    rowsFetched: result?.rows?.length ?? 0,
    rowsInserted: isSuccess ? result?.rows?.length ?? 0 : 0,
    rows: isSuccess ? result?.rows ?? [] : [],
    validationErrors,
    errorMessage,
  }
}
