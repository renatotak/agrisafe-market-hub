/**
 * Phase 29 — thin route wrapper for sync-events-agrural.
 * Job logic lives in src/jobs/sync-events-agrural.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncEventsAgrural } from '@/jobs/sync-events-agrural'

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
    const result = await runSyncEventsAgrural(createAdminClient())
    return NextResponse.json(
      {
        success: result.ok,
        status: result.status,
        rows_fetched: result.recordsFetched,
        rows_upserted: result.recordsUpdated,
        duration_ms: result.durationMs,
        errors: result.errors.length > 0 ? result.errors : undefined,
        stats: result.stats,
      },
      { status: result.ok ? 200 : 500 },
    )
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 });
  }
}
