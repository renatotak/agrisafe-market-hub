/**
 * Phase 25 — thin route wrapper for sync-recuperacao-judicial.
 * Job logic lives in src/jobs/sync-recuperacao-judicial.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncRecuperacaoJudicial } from '@/jobs/sync-recuperacao-judicial'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncRecuperacaoJudicial(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok ? 'Recuperação judicial data synchronized' : 'Failed to sync RJ data',
      timestamp: result.finishedAt,
      duration_ms: result.durationMs,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
