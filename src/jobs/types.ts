/**
 * Phase 25 — shared JobResult shape.
 *
 * Every cron job under src/jobs/ returns this. The dispatcher
 * (src/scripts/cron/run-job.ts) and the per-route HTTP wrappers both
 * read it the same way.
 */

export type JobStatus = 'success' | 'partial' | 'error'

export interface JobResult {
  ok: boolean
  status: JobStatus
  startedAt: string
  finishedAt: string
  durationMs: number
  recordsFetched: number
  recordsUpdated: number
  errors: string[]
  /** Free-form per-job stats — never load-bearing, just useful in HTTP responses. */
  stats?: Record<string, unknown>
}

export function emptyResult(startedAtIso: string): JobResult {
  const now = new Date().toISOString()
  return {
    ok: false,
    status: 'error',
    startedAt: startedAtIso,
    finishedAt: now,
    durationMs: 0,
    recordsFetched: 0,
    recordsUpdated: 0,
    errors: [],
  }
}
