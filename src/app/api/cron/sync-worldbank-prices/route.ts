/**
 * Phase 25 — thin route wrapper for sync-worldbank-prices.
 * Job logic lives in src/jobs/sync-worldbank-prices.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncWorldbankPrices } from '@/jobs/sync-worldbank-prices'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncWorldbankPrices(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      run_id: result.stats?.runId,
      status: result.status,
      rows_fetched: result.recordsFetched,
      rows_upserted: result.recordsUpdated,
      duration_ms: result.durationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
