/**
 * Phase 25 — thin route wrapper for sync-agrofit-bulk.
 * Job logic lives in src/jobs/sync-agrofit-bulk.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncAgrofitBulk } from '@/jobs/sync-agrofit-bulk'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncAgrofitBulk(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      run_id: result.stats?.runId,
      status: result.status,
      products_fetched: result.recordsFetched,
      duration_ms: result.durationMs,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
