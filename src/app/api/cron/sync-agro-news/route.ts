/**
 * Phase 25 — thin route wrapper for sync-agro-news.
 * Job logic lives in src/jobs/sync-agro-news.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncAgroNews } from '@/jobs/sync-agro-news'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncAgroNews(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok ? 'Agro news synchronized' : 'Failed to sync news',
      timestamp: result.finishedAt,
      duration_ms: result.durationMs,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
