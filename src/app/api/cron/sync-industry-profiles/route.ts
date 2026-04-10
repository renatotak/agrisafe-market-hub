/**
 * Phase 25 — thin route wrapper for sync-industry-profiles.
 * Job logic lives in src/jobs/sync-industry-profiles.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncIndustryProfiles } from '@/jobs/sync-industry-profiles'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncIndustryProfiles(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok ? 'Industry profiles sync completed' : 'Failed to sync industry profiles',
      timestamp: result.finishedAt,
      duration_ms: result.durationMs,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
