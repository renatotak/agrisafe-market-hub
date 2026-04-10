/**
 * Phase 25 — thin route wrapper for sync-events-na.
 * Job logic lives in src/jobs/sync-events-na.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncEventsNA } from '@/jobs/sync-events-na'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncEventsNA(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok
        ? `Scraped ${result.recordsUpdated} events from Notícias Agrícolas`
        : 'Failed to sync events',
      count: result.recordsUpdated,
      duration_ms: result.durationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
