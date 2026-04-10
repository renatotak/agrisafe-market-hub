/**
 * Phase 25 — thin route wrapper.
 *
 * The full BCB SGS sync logic now lives in `src/jobs/sync-market-data.ts`
 * so it can be invoked from BOTH this Next.js cron route AND the launchd
 * CLI wrapper at `src/scripts/cron/sync-market-data.ts`. This route stays
 * useful for manual triggers from the dashboard, the Vercel fallback
 * cron, and ad-hoc curl tests.
 *
 * The job module owns its own logging (sync_logs + activity_log), so the
 * route only handles auth + the HTTP envelope.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncMarketData } from '@/jobs/sync-market-data'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createAdminClient()
  const result = await runSyncMarketData(supabase)

  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok ? 'Market data synchronized from BCB SGS' : 'Failed to sync data',
      timestamp: result.finishedAt,
      duration_ms: result.durationMs,
      records_updated: result.recordsUpdated,
      results: result.stats?.results,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
