/**
 * Phase 25 — thin route wrapper for sync-scraper-healthcheck.
 * Job logic lives in src/jobs/sync-scraper-healthcheck.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncScraperHealthcheck } from '@/jobs/sync-scraper-healthcheck'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncScraperHealthcheck(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      message: 'Scraper healthcheck completed',
      run_id: result.stats?.runId,
      status: result.status,
      rows_fetched: result.recordsFetched,
      duration_ms: result.durationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
