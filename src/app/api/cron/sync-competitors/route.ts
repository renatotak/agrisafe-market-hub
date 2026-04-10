/**
 * Phase 25 — thin route wrapper for sync-competitors.
 * Job logic lives in src/jobs/sync-competitors.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncCompetitors } from '@/jobs/sync-competitors'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncCompetitors(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      signals_created: result.recordsUpdated,
      mentions_found: result.recordsFetched,
      duration_ms: result.durationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
