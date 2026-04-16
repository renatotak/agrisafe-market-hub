/**
 * Phase 6d — /api/regulatory/refresh
 *
 * On-demand endpoint that triggers all 4 regulatory scrapers sequentially
 * and returns a combined summary. Called by the "Atualizar Agora" button
 * in the RegulatoryFramework UI.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { logActivity } from '@/lib/activity-log'
import type { JobResult } from '@/jobs/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface JobEntry {
  name: string
  run: () => Promise<JobResult>
}

export async function POST() {
  try {
  const supabase = createAdminClient()
  const start = Date.now()

  // Lazy-import to avoid bundling all scraper code in every route
  const [
    { runSyncCvmAgro },
    { runSyncBcbRural },
    { runSyncCnjAtos },
    { runSyncKeyAgroLaws },
  ] = await Promise.all([
    import('@/jobs/sync-cvm-agro'),
    import('@/jobs/sync-bcb-rural'),
    import('@/jobs/sync-cnj-atos'),
    import('@/jobs/sync-key-agro-laws'),
  ])

  const jobs: JobEntry[] = [
    { name: 'sync-cvm-agro', run: () => runSyncCvmAgro(supabase) },
    { name: 'sync-bcb-rural', run: () => runSyncBcbRural(supabase) },
    { name: 'sync-cnj-atos', run: () => runSyncCnjAtos(supabase) },
    { name: 'sync-key-agro-laws', run: () => runSyncKeyAgroLaws(supabase) },
  ]

  const results: Record<string, { ok: boolean; status: string; updated: number; errors: string[] }> = {}
  let totalUpdated = 0
  let totalErrors = 0

  for (const job of jobs) {
    try {
      const r = await job.run()
      results[job.name] = {
        ok: r.ok,
        status: r.status,
        updated: r.recordsUpdated,
        errors: r.errors,
      }
      totalUpdated += r.recordsUpdated
      totalErrors += r.errors.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results[job.name] = { ok: false, status: 'error', updated: 0, errors: [msg] }
      totalErrors++
    }
  }

  const durationMs = Date.now() - start

  await logActivity(supabase, {
    action: 'upsert',
    target_table: 'regulatory_norms',
    source: 'manual:regulatory_refresh',
    source_kind: 'manual',
    summary: `On-demand regulatory refresh: ${totalUpdated} updated, ${totalErrors} errors, ${durationMs}ms`,
    metadata: { results, durationMs },
  }).catch(() => {})

  return NextResponse.json({
    ok: totalErrors === 0,
    durationMs,
    totalUpdated,
    totalErrors,
    jobs: results,
  })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 });
  }
}
