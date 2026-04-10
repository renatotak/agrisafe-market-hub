/**
 * Phase 25 — sync-events-na job module.
 * Logic moved from src/app/api/cron/sync-events-na/route.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import { logSync } from '@/lib/sync-logger'
import { logActivity } from '@/lib/activity-log'
import { loadMatchableEntities, matchEntitiesInText, writeEntityMentions } from '@/lib/entity-matcher'
import type { JobResult } from '@/jobs/types'

const BASE_URL = 'https://www.noticiasagricolas.com.br'
const EVENTS_URL = `${BASE_URL}/eventos/`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AgriSafe Bot (Event Aggregation System)'

function inferType(name: string): string {
  const lower = name.toLowerCase()
  if (/feira|show rural|expo|field day|agrishow|tecnoshow|coplacampo/.test(lower)) return 'fair'
  if (/workshop|oficina|capacitação|treinamento/.test(lower)) return 'workshop'
  if (/webinar|online|live|palestra/.test(lower)) return 'webinar'
  if (/summit|cúpula|fórum/.test(lower)) return 'summit'
  return 'conference'
}

function parseBrDate(str: string): Date | null {
  const match = str.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null
  const [, day, month, year] = match
  return new Date(`${year}-${month}-${day}T12:00:00`)
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function scrapeDetailPage(url: string): Promise<{
  dates: Date[]
  description: string
  location: string
}> {
  const html = await fetchPage(url)
  if (!html) return { dates: [], description: '', location: '' }
  const $ = cheerio.load(html)
  const dates: Date[] = []
  $('span.data, .data, time').each((_, el) => {
    const text = $(el).text().trim()
    const d = parseBrDate(text)
    if (d && !isNaN(d.getTime())) dates.push(d)
  })
  $('a').each((_, el) => {
    const text = $(el).text().trim()
    const d = parseBrDate(text)
    if (d && !isNaN(d.getTime())) dates.push(d)
  })
  const bodyText = $('#content').text() || $('main').text() || $('body').text()
  const dateMatches = bodyText.match(/\d{2}\/\d{2}\/\d{4}/g) || []
  for (const m of dateMatches) {
    const d = parseBrDate(m)
    if (d && !isNaN(d.getTime())) dates.push(d)
  }
  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('#content p').first().text().trim() || ''
  let location = ''
  const locationPatterns = [
    /(?:em|in)\s+([\w\s]+(?:,\s*[A-Z]{2}))/i,
    /([\w\s]+(?:,\s*(?:SP|RJ|MG|PR|SC|RS|MT|MS|GO|BA|PE|CE|PA|AM|MA|TO|RO|AC|AP|RR|SE|AL|PB|PI|RN|ES|DF)))/,
  ]
  const pageTitle = $('h1').text() + ' ' + $('h2').first().text() + ' ' + description
  for (const pattern of locationPatterns) {
    const match = pageTitle.match(pattern)
    if (match) { location = match[1].trim(); break }
  }
  return { dates, description, location }
}

export async function runSyncEventsNA(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    const listHtml = await fetchPage(EVENTS_URL)
    if (!listHtml) throw new Error('Failed to fetch NA events list page')

    const $ = cheerio.load(listHtml)
    const eventItems: { title: string; slug: string; url: string; image: string }[] = []
    $('ul.lista-de-eventos li').each((_, el) => {
      const anchor = $(el).find('a').first()
      const href = anchor.attr('href') || ''
      const title = anchor.find('h4').text().trim()
      const image = anchor.find('img').attr('data-src') || anchor.find('img').attr('src') || ''
      if (title && href) {
        const slug = href.replace(/^\/eventos\//, '').replace(/\/$/, '')
        eventItems.push({
          title, slug,
          url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
          image,
        })
      }
    })

    if (eventItems.length === 0) throw new Error('No events found on list page — selectors may have changed')

    const events: any[] = []
    const batchSize = 3
    for (let i = 0; i < eventItems.length; i += batchSize) {
      const batch = eventItems.slice(i, i + batchSize)
      const details = await Promise.all(batch.map((item) => scrapeDetailPage(item.url)))
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        const detail = details[j]
        let dateStart: string | null = null
        let dateEnd: string | null = null
        if (detail.dates.length > 0) {
          const sorted = detail.dates.sort((a, b) => a.getTime() - b.getTime())
          dateStart = sorted[0].toISOString().split('T')[0]
          dateEnd = sorted[sorted.length - 1].toISOString().split('T')[0]
        } else {
          const yearMatch = item.title.match(/20\d{2}/) || item.slug.match(/20\d{2}/)
          const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString()
          dateStart = `${year}-01-01`
        }
        const eventId = `na-${item.slug}`
        const descPt = detail.description || `Evento com cobertura do Notícias Agrícolas.`
        const descEn = `Event covered by Notícias Agrícolas.`
        events.push({
          id: eventId, name: item.title,
          date: dateStart, end_date: dateEnd,
          location: detail.location || 'Brasil', type: inferType(item.title),
          description_pt: descPt, description_en: descEn,
          content_opportunity_pt: `Acompanhe a cobertura completa no Notícias Agrícolas.`,
          content_opportunity_en: `Follow full coverage on Notícias Agrícolas.`,
          website: item.url,
          upcoming: dateStart ? new Date(dateStart) >= new Date() : false,
          source_name: 'AgroAgenda', source_url: EVENTS_URL,
        })
      }
    }

    const { error } = await supabase.from('events').upsert(events, { onConflict: 'id' })
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`)

    // Phase 25 — entity_mentions for events. An event title + description
    // often names the organizer or featured retailers/cooperatives; routing
    // through the algorithm-first matcher links them to legal_entities so
    // the chapter shows "Comigo aparece em 3 eventos próximos".
    let totalMentions = 0
    try {
      const matchableEntities = await loadMatchableEntities(supabase)
      for (const ev of events) {
        const haystack = `${ev.name} ${ev.description_pt || ''} ${ev.location || ''}`
        const entityUids = matchEntitiesInText(haystack, matchableEntities)
        if (entityUids.length > 0) {
          totalMentions += await writeEntityMentions(supabase, {
            entityUids,
            sourceTable: 'events',
            sourceId: ev.id,
            mentionType: 'mentioned',
            extractedBy: 'regex_v1',
          })
        }
      }
    } catch (e) {
      console.error('[sync-events-na] entity-matcher failed:', (e as Error).message)
    }

    const finishedAt = new Date().toISOString()
    await logSync(supabase, {
      source: 'sync-events-na',
      started_at: startedAt,
      finished_at: finishedAt,
      records_fetched: eventItems.length,
      records_inserted: events.length,
      errors: 0,
      status: 'success',
    })

    await logActivity(supabase, {
      action: 'upsert',
      target_table: 'events',
      source: 'sync-events-na',
      source_kind: 'cron',
      actor: 'cron',
      summary: `AgroAgenda (NA): ${events.length} evento(s) sincronizados${totalMentions ? `, ${totalMentions} entidades vinculadas` : ''}`,
      metadata: { status: 'success', upserted: events.length, fetched: eventItems.length, entity_mentions: totalMentions },
    })

    return {
      ok: true,
      status: 'success',
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: eventItems.length,
      recordsUpdated: events.length,
      errors: [],
      stats: { entity_mentions: totalMentions },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logSync(supabase, {
        source: 'sync-events-na',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        records_fetched: 0, records_inserted: 0, errors: 1,
        status: 'error',
        error_message: message,
      })
      await logActivity(supabase, {
        action: 'upsert',
        target_table: 'events',
        source: 'sync-events-na',
        source_kind: 'cron',
        actor: 'cron',
        summary: `sync-events-na falhou: ${message}`.slice(0, 200),
        metadata: { status: 'error', error: message },
      })
    } catch {}
    return {
      ok: false,
      status: 'error',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [message],
    }
  }
}
