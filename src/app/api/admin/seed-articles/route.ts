import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Seed published_articles table with article data.
 * POST /api/admin/seed-articles
 * Body: { articles: [...] } or no body to use defaults
 *
 * To add your real LinkedIn articles, POST with:
 * {
 *   "articles": [
 *     {
 *       "id": "pa1",
 *       "title": "Your article title",
 *       "channel": "linkedin",
 *       "url": "https://linkedin.com/pulse/...",
 *       "published_at": "2026-03-28",
 *       "summary": "Brief summary",
 *       "thesis": "Core thesis angle",
 *       "historical_reference": "What historical context was used",
 *       "engagement_views": 3420,
 *       "engagement_likes": 187,
 *       "engagement_comments": 42,
 *       "engagement_shares": 28,
 *       "tags": ["credito rural", "revendas"],
 *       "status": "published"
 *     }
 *   ]
 * }
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    let articles: any[]

    try {
      const body = await request.json()
      articles = body.articles
    } catch {
      // No body or invalid JSON — use defaults from mock
      const { mockPublishedArticles } = await import('@/data/mock')
      articles = mockPublishedArticles
    }

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ success: false, error: 'No articles provided' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('published_articles')
      .upsert(articles, { onConflict: 'id' })

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `${articles.length} articles seeded`,
      count: articles.length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
