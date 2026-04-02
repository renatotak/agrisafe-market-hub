import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { createAdminClient } from '@/utils/supabase/admin'
import { logSync } from '@/lib/sync-logger'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://www.noticiasagricolas.com.br'
const EVENTS_URL = `${BASE_URL}/eventos/`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AgriSafe Bot (Event Aggregation System)'

// Infer event type from name keywords
function inferType(name: string): string {
  const lower = name.toLowerCase()
  if (/feira|show rural|expo|field day|agrishow|tecnoshow|coplacampo/.test(lower)) return 'fair'
  if (/workshop|oficina|capacitação|treinamento/.test(lower)) return 'workshop'
  if (/webinar|online|live|palestra/.test(lower)) return 'webinar'
  if (/summit|cúpula|fórum/.test(lower)) return 'summit'
  return 'conference'
}

// Parse DD/MM/YYYY from article date strings
function parseBrDate(str: string): Date | null {
  const match = str.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null
  const [, day, month, year] = match
  return new Date(`${year}-${month}-${day}T12:00:00`)
}

// Fetch a page with our user-agent
async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

// Scrape an individual event detail page for article dates and description
async function scrapeDetailPage(url: string): Promise<{
  dates: Date[]
  description: string
  location: string
}> {
  const html = await fetchPage(url)
  if (!html) return { dates: [], description: '', location: '' }

  const $ = cheerio.load(html)

  // Collect all dates from article items on the page (coverage dates)
  const dates: Date[] = []
  $('span.data, .data, time').each((_, el) => {
    const text = $(el).text().trim()
    const d = parseBrDate(text)
    if (d && !isNaN(d.getTime())) dates.push(d)
  })

  // Also look for dates in article links (common pattern: DD/MM/YYYY in list items)
  $('a').each((_, el) => {
    const text = $(el).text().trim()
    const d = parseBrDate(text)
    if (d && !isNaN(d.getTime())) dates.push(d)
  })

  // Extract text content that might contain dates
  const bodyText = $('#content').text() || $('main').text() || $('body').text()
  const dateMatches = bodyText.match(/\d{2}\/\d{2}\/\d{4}/g) || []
  for (const m of dateMatches) {
    const d = parseBrDate(m)
    if (d && !isNaN(d.getTime())) dates.push(d)
  }

  // Try to extract description from meta or first paragraph
  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('#content p').first().text().trim() ||
    ''

  // Try to infer location from page content
  let location = ''
  const locationPatterns = [
    /(?:em|in)\s+([\w\s]+(?:,\s*[A-Z]{2}))/i,
    /([\w\s]+(?:,\s*(?:SP|RJ|MG|PR|SC|RS|MT|MS|GO|BA|PE|CE|PA|AM|MA|TO|RO|AC|AP|RR|SE|AL|PB|PI|RN|ES|DF)))/,
  ]
  // Check the page title and first heading for location clues
  const pageTitle = $('h1').text() + ' ' + $('h2').first().text() + ' ' + description
  for (const pattern of locationPatterns) {
    const match = pageTitle.match(pattern)
    if (match) {
      location = match[1].trim()
      break
    }
  }

  return { dates, description, location }
}

export async function GET(request: Request) {
  const started_at = new Date().toISOString()
  const supabase = createAdminClient()

  try {
    // Auth check
    const authHeader = request.headers.get('authorization')
    if (
      process.env.NODE_ENV === 'production' &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Step 1: Scrape the events list page
    const listHtml = await fetchPage(EVENTS_URL)
    if (!listHtml) {
      throw new Error('Failed to fetch NA events list page')
    }

    const $ = cheerio.load(listHtml)
    const eventItems: { title: string; slug: string; url: string; image: string }[] = []

    $('ul.lista-de-eventos li').each((_, el) => {
      const anchor = $(el).find('a').first()
      const href = anchor.attr('href') || ''
      const title = anchor.find('h4').text().trim()
      const image = anchor.find('img').attr('data-src') || anchor.find('img').attr('src') || ''

      if (title && href) {
        // Extract slug from URL like /eventos/femagri-2026/
        const slug = href.replace(/^\/eventos\//, '').replace(/\/$/, '')
        eventItems.push({
          title,
          slug,
          url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
          image,
        })
      }
    })

    if (eventItems.length === 0) {
      throw new Error('No events found on list page — selectors may have changed')
    }

    // Step 2: Scrape each event detail page (limit concurrency to 3)
    const events: any[] = []
    const batchSize = 3

    for (let i = 0; i < eventItems.length; i += batchSize) {
      const batch = eventItems.slice(i, i + batchSize)
      const details = await Promise.all(
        batch.map((item) => scrapeDetailPage(item.url))
      )

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        const detail = details[j]

        // Determine dates from the detail page coverage articles
        let dateStart: string | null = null
        let dateEnd: string | null = null

        if (detail.dates.length > 0) {
          const sorted = detail.dates.sort((a, b) => a.getTime() - b.getTime())
          // Earliest article date ≈ event start; latest ≈ event end
          dateStart = sorted[0].toISOString().split('T')[0]
          dateEnd = sorted[sorted.length - 1].toISOString().split('T')[0]
        } else {
          // Fallback: extract year from slug or title, use Jan 1
          const yearMatch = item.title.match(/20\d{2}/) || item.slug.match(/20\d{2}/)
          const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString()
          dateStart = `${year}-01-01`
        }

        const eventId = `na-${item.slug}`
        const descPt = detail.description || `Evento com cobertura do Notícias Agrícolas.`
        const descEn = `Event covered by Notícias Agrícolas.`

        events.push({
          id: eventId,
          name: item.title,
          date: dateStart,
          end_date: dateEnd,
          location: detail.location || 'Brasil',
          type: inferType(item.title),
          description_pt: descPt,
          description_en: descEn,
          content_opportunity_pt: `Acompanhe a cobertura completa no Notícias Agrícolas.`,
          content_opportunity_en: `Follow full coverage on Notícias Agrícolas.`,
          website: item.url,
          upcoming: dateStart ? new Date(dateStart) >= new Date() : false,
        })
      }
    }

    // Step 3: Upsert to Supabase events table
    const { error } = await supabase
      .from('events')
      .upsert(events, { onConflict: 'id' })

    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`)
    }

    // Step 4: Log sync
    await logSync(supabase, {
      source: 'sync-events-na',
      started_at,
      finished_at: new Date().toISOString(),
      records_fetched: eventItems.length,
      records_inserted: events.length,
      errors: 0,
      status: 'success',
    })

    return NextResponse.json({
      success: true,
      message: `Scraped ${events.length} events from Notícias Agrícolas`,
      count: events.length,
    })
  } catch (error: any) {
    console.error('Error syncing events from NA:', error)

    await logSync(supabase, {
      source: 'sync-events-na',
      started_at,
      finished_at: new Date().toISOString(),
      records_fetched: 0,
      records_inserted: 0,
      errors: 1,
      status: 'error',
      error_message: error.message,
    })

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
