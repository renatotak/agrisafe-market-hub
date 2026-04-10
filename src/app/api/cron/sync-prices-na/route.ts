/**
 * Phase 25 — thin route wrapper for sync-prices-na.
 * Job logic lives in src/jobs/sync-prices-na.ts.
 *
 * NOTE: this scraper is currently a stub that fetches but doesn't persist.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncPricesNA } from '@/jobs/sync-prices-na'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runSyncPricesNA(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok
        ? `Scraped ${result.recordsFetched} price records from Notícias Agrícolas`
        : 'Failed to sync prices',
      duration_ms: result.durationMs,
      data: result.stats?.sample,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
