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
    // Industry profiles — Sunday only (heavier AGROFIT API usage)
    ...(new Date().getDay() === 0
      ? [{ name: 'industry-profiles', path: '/api/cron/sync-industry-profiles' }]
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
