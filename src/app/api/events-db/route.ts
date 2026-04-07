/**
 * Phase 23 — Read endpoint for the unified events table.
 *
 * Replaces the EventTracker UI's previous reliance on /api/events-na
 * (which only proxies AgroAgenda live). This endpoint reads from the
 * Supabase `events` table where ALL sources land:
 *   • AgroAgenda  — populated by /api/cron/sync-events-na (daily)
 *   • AgroAdvance — populated by /api/cron/sync-events-agroadvance (weekly, Sun)
 *   • Manual      — initial seed data + future CRUD-added events
 *   • (future)    — baldebranco / others
 *
 * Returns events in a shape compatible with the EventTracker AgroEvent
 * interface so the existing UI rendering keeps working with minimal
 * changes. Adds source_name, enriched_at, and enrichment_summary so the
 * UI can show source provenance + the Enrich button state.
 *
 * Public read, ISR cached 10 minutes.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 600 // 10 min

interface EventDbRow {
  id: string
  name: string
  date: string
  end_date: string | null
  location: string | null
  type: string
  description_pt: string | null
  description_en: string | null
  website: string | null
  source_name: string | null
  source_url: string | null
  organizer_cnpj: string | null
  latitude: number | null
  longitude: number | null
  enriched_at: string | null
  enrichment_summary: string | null
}

// Map a Supabase events row to the AgroEvent shape the EventTracker UI expects.
// Pulls city/state out of the `location` text where possible (e.g. "Cascavel, PR").
function mapToAgroEvent(row: EventDbRow) {
  let cidade: string | null = null
  let estado: string | null = null
  if (row.location) {
    const parts = row.location.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) {
      cidade = parts.slice(0, -1).join(', ')
      const last = parts[parts.length - 1]
      estado = last.length === 2 ? last.toUpperCase() : last
    } else {
      cidade = parts[0] || null
    }
  }
  return {
    id: row.id,
    nome: row.name,
    dataInicio: row.date,
    dataFim: row.end_date,
    cidade,
    estado,
    imagemUrl: null, // events table doesn't store cover images yet
    tipo: prettyType(row.type),
    formato: 'Presencial', // most events default to in-person; future enhancement: detect from description
    slug: row.id,
    secao: row.source_name || 'Outros',
    // Phase 23 fields surfaced for the new UI
    source_name: row.source_name,
    source_url: row.source_url,
    website: row.website,
    description_pt: row.description_pt,
    description_en: row.description_en,
    enriched_at: row.enriched_at,
    enrichment_summary: row.enrichment_summary,
    latitude: row.latitude,
    longitude: row.longitude,
  }
}

function prettyType(t: string): string {
  switch (t) {
    case 'fair': return 'Feiras Agro'
    case 'conference': return 'Congressos'
    case 'workshop': return 'Workshop'
    case 'webinar': return 'Webinar'
    case 'summit': return 'Fóruns'
    default: return 'Outros'
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const sourceFilter = url.searchParams.get('source')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10), 1000)

  try {
    const supabase = createAdminClient()
    let query = supabase
      .from('events')
      .select('id, name, date, end_date, location, type, description_pt, description_en, website, source_name, source_url, organizer_cnpj, latitude, longitude, enriched_at, enrichment_summary')
      .order('date', { ascending: true })
      .limit(limit)

    if (sourceFilter) query = query.eq('source_name', sourceFilter)

    const { data, error } = await query
    if (error) throw error

    const events = (data || []).map((r) => mapToAgroEvent(r as EventDbRow))

    // Distinct source counts for the UI to show source filter chips
    const sourceCounts: Record<string, number> = {}
    for (const e of events) {
      const s = e.source_name || 'Manual'
      sourceCounts[s] = (sourceCounts[s] || 0) + 1
    }

    return NextResponse.json({
      success: true,
      count: events.length,
      sources: sourceCounts,
      data: events,
      fetched_at: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('events-db error:', message)
    return NextResponse.json(
      { success: false, error: message, count: 0, data: [] },
      { status: 500 },
    )
  }
}
