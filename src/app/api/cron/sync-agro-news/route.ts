import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Parser from 'rss-parser'
import { NEWS_SOURCES } from '@/data/news'

export const dynamic = 'force-dynamic'

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'AgriSafe-MarketHub/1.0 (RSS Reader)',
  },
})

function categorize(title: string, summary: string): string {
  const text = `${title} ${summary}`.toLowerCase()
  if (/soja|milho|café|açúcar|algodão|commodity|cotaç/.test(text)) return 'commodities'
  if (/crédito|financ|banco|selic|juro/.test(text)) return 'credit'
  if (/tecnolog|ia|inovaç|startup|digital|drone|satelit/.test(text)) return 'technology'
  if (/polític|govern|lei|regulament|ministér|mapa|conab/.test(text)) return 'policy'
  if (/sustentab|ambient|carbono|esg|desmat/.test(text)) return 'sustainability'
  if (/recuperação judicial|falência|judicial|tribunal/.test(text)) return 'judicial'
  return 'general'
}

function generateId(sourceUrl: string): string {
  // Simple hash from URL
  let hash = 0
  for (let i = 0; i < sourceUrl.length; i++) {
    const char = sourceUrl.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `news-${Math.abs(hash).toString(36)}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    let totalNew = 0
    let totalSkipped = 0
    const errors: string[] = []

    // Fetch highlighted producers for matching
    const { data: producers } = await supabase
      .from('highlighted_producers')
      .select('*')
      .eq('active', true)

    const producerKeywords = (producers || []).flatMap((p: any) =>
      p.keywords.map((kw: string) => ({ name: p.name, keyword: kw.toLowerCase() }))
    )

    for (const source of NEWS_SOURCES) {
      try {
        const feed = await parser.parseURL(source.rss)
        const items = feed.items.slice(0, 20) // Latest 20 per source

        for (const item of items) {
          if (!item.link) continue

          const title = item.title?.trim() || ''
          const summary = item.contentSnippet?.slice(0, 500) || item.content?.slice(0, 500) || ''
          const textForMatch = `${title} ${summary}`.toLowerCase()

          // Check producer mentions
          const matchedProducers = producerKeywords
            .filter((pk: { keyword: string }) => textForMatch.includes(pk.keyword))
            .map((pk: { name: string }) => pk.name)
          const uniqueProducers = [...new Set(matchedProducers)]

          const newsItem = {
            id: generateId(item.link),
            title,
            summary: summary || null,
            source_name: source.name,
            source_url: item.link,
            image_url: item.enclosure?.url || null,
            published_at: item.isoDate || new Date().toISOString(),
            category: categorize(title, summary),
            tags: item.categories?.slice(0, 5) || [],
            mentions_producer: uniqueProducers.length > 0,
            producer_names: uniqueProducers,
          }

          const { error } = await supabase
            .from('agro_news')
            .upsert(newsItem, { onConflict: 'source_url', ignoreDuplicates: true })

          if (error) {
            totalSkipped++
          } else {
            totalNew++
          }
        }
      } catch (e: any) {
        errors.push(`${source.name}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Agro news synchronized',
      timestamp: new Date().toISOString(),
      stats: { new: totalNew, skipped: totalSkipped },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error syncing agro news:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync news' },
      { status: 500 }
    )
  }
}
