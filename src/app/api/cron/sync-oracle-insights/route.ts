/**
 * Phase 6a — thin route wrapper for sync-oracle-insights.
 * Job logic lives in src/jobs/sync-oracle-insights.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncOracleInsights } from '@/jobs/sync-oracle-insights'

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

  try {
    const result = await runSyncOracleInsights(createAdminClient())
    return NextResponse.json(
      {
        success: result.ok,
        status: result.status,
        duration_ms: result.durationMs,
        fetched: result.recordsFetched,
        updated: result.recordsUpdated,
        errors: result.errors.length > 0 ? result.errors : undefined,
        stats: result.stats,
      },
      { status: result.ok ? 200 : 500 },
    )
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 });
  }
}
