import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Consolidated cron job that dispatches all sync tasks.
 * Keeps cron count to 1 for Vercel Hobby plan compatibility.
 * Schedule: daily at 08:00 UTC (configured in vercel.json)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const token = process.env.CRON_SECRET || ''
  const results: Record<string, unknown> = {}

  const jobs = [
    { name: 'market-data', path: '/api/cron/sync-market-data' },
    { name: 'agro-news', path: '/api/cron/sync-agro-news' },
    { name: 'recuperacao-judicial', path: '/api/cron/sync-recuperacao-judicial' },
    { name: 'archive-old-news', path: '/api/cron/archive-old-news' },
    { name: 'regulatory', path: '/api/cron/sync-regulatory' },
    { name: 'events-na', path: '/api/cron/sync-events-na' },
    { name: 'competitors', path: '/api/cron/sync-competitors' },
    { name: 'retailer-intelligence', path: '/api/cron/sync-retailer-intelligence' },
    // Phase 19A — runScraper() smoke test. Pings GitHub zen, no DB writes
    // outside scraper_runs / scraper_registry. Safe to delete after FAOSTAT
    // (Phase 19B) has been green for 2+ weeks.
    { name: 'scraper-healthcheck', path: '/api/cron/sync-scraper-healthcheck' },
    // Phase 19B — FAOSTAT crop production for Pulso do Mercado Contexto Macro.
    // Source is monthly but the upsert is idempotent, so daily runs cost only
    // a few hundred KB and let runScraper() exercise the protocol every cycle.
    { name: 'faostat', path: '/api/cron/sync-faostat' },
    // Industry profiles — Sunday only (heavier AGROFIT API usage)
    // Phase 20 — AGROFIT bulk catalog also Sunday-only (weekly cadence,
    // ~18 seed queries × ≤8 pages = up to 144 API calls per run)
    ...(new Date().getDay() === 0
      ? [
          { name: 'industry-profiles', path: '/api/cron/sync-industry-profiles' },
          { name: 'agrofit-bulk', path: '/api/cron/sync-agrofit-bulk' },
        ]
      : []),
  ]

  for (const job of jobs) {
    try {
      const res = await fetch(`${baseUrl}${job.path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(55000), // 55s timeout per job
      })
      results[job.name] = await res.json()
    } catch (e: any) {
      results[job.name] = { success: false, error: e.message }
    }
  }

  return NextResponse.json({
    success: true,
    message: 'All sync jobs completed',
    timestamp: new Date().toISOString(),
    results,
  })
}
