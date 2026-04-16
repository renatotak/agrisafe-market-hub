/**
 * Phase 2a — thin route wrapper for sync-mfrural-fertilizers.
 * Job logic lives in src/jobs/sync-mfrural-fertilizers.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncMfruralFertilizers } from '@/jobs/sync-mfrural-fertilizers'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const result = await runSyncMfruralFertilizers(createAdminClient())
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
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 });
  }
}
