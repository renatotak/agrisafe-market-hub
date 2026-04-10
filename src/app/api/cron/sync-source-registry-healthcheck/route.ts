/**
 * Phase 25 — thin route wrapper for sync-source-registry-healthcheck.
 * Job logic lives in src/jobs/sync-source-registry-healthcheck.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncSourceRegistryHealthcheck } from '@/jobs/sync-source-registry-healthcheck'

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

  const result = await runSyncSourceRegistryHealthcheck(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      status: result.status,
      probed: result.recordsFetched,
      duration_ms: result.durationMs,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
