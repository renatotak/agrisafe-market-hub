/**
 * Phase 23 — Per-event AI enrichment endpoint.
 *
 * Given an event id, fetches the event's `website` URL via Cheerio,
 * extracts a clean text excerpt + meta description (algorithmic, no LLM),
 * optionally calls Gemini to produce a 2-3 paragraph executive summary
 * in PT-BR, and writes the result back to events.enrichment_summary
 * + enriched_at + enrichment_source.
 *
 * Algorithmic-first per guardrail #1: the LLM step is at the END of the
 * pipeline and only generates prose — it never decides what to extract.
 * Without GEMINI_API_KEY the endpoint still works, returning the raw
 * scraped excerpt instead of a polished summary.
 *
 * POST /api/events/enrich
 * Body: { id: string }
 * Response: { success, enrichment_summary, enrichment_source, enriched_at }
 */

import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { createAdminClient } from '@/utils/supabase/admin'
import { isGeminiConfigured, summarizeText } from '@/lib/gemini'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const UA = 'Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; event-enrich; +https://agsf-mkthub.vercel.app)'

interface EnrichBody {
  id?: string
}

function extractMainText($: cheerio.CheerioAPI): string {
  // Strategy: try the most specific selectors first, fall back to broader ones.
  const selectors = [
    'article p',
    'main p',
    '[role="main"] p',
    '.entry-content p',
    '.post-content p',
    '.event-description p',
    '.content p',
    'body p',
  ]
  for (const sel of selectors) {
    const els = $(sel)
    if (els.length > 0) {
      const paragraphs: string[] = []
      els.each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ')
        if (text.length > 40) paragraphs.push(text)
      })
      if (paragraphs.length > 0) {
        return paragraphs.slice(0, 8).join('\n\n').slice(0, 4000)
      }
    }
  }
  return ''
}

function extractMeta($: cheerio.CheerioAPI): { title: string; description: string } {
  const ogTitle = $('meta[property="og:title"]').attr('content') || ''
  const ogDesc = $('meta[property="og:description"]').attr('content') || ''
  const metaDesc = $('meta[name="description"]').attr('content') || ''
  const twDesc = $('meta[name="twitter:description"]').attr('content') || ''
  return {
    title: (ogTitle || $('h1').first().text() || $('title').text() || '').trim().slice(0, 200),
    description: (ogDesc || metaDesc || twDesc || '').trim().slice(0, 500),
  }
}

export async function POST(req: NextRequest) {
  let body: EnrichBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ─── 1. Load the event row ─────────────────────────────────
  const { data: event, error: loadErr } = await supabase
    .from('events')
    .select('id, name, website, source_name, location, date, description_pt')
    .eq('id', body.id)
    .maybeSingle()

  if (loadErr) {
    return NextResponse.json({ success: false, error: loadErr.message }, { status: 500 })
  }
  if (!event) {
    return NextResponse.json({ success: false, error: 'event not found' }, { status: 404 })
  }
  if (!event.website) {
    return NextResponse.json(
      { success: false, error: 'event has no website to enrich from' },
      { status: 400 },
    )
  }

  // ─── 2. Fetch + Cheerio-parse the event website ────────────
  let html: string
  let httpStatus = 0
  try {
    const res = await fetch(event.website, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    })
    httpStatus = res.status
    if (!res.ok) throw new Error(`fetch returned http ${res.status}`)
    html = await res.text()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { success: false, error: `fetch failed: ${msg}`, http_status: httpStatus },
      { status: 502 },
    )
  }

  const $ = cheerio.load(html)
  const meta = extractMeta($)
  const mainText = extractMainText($)

  if (!meta.description && !mainText) {
    return NextResponse.json(
      { success: false, error: 'could not extract any text from the event website' },
      { status: 422 },
    )
  }

  // ─── 3. Optional Gemini summary (LLM step at the very end) ──
  let summary: string
  let enrichmentSource: 'gemini' | 'manual' = 'manual'

  if (isGeminiConfigured() && mainText.length > 200) {
    try {
      const systemPrompt = `Você é um analista sênior de mercado agro da AgriSafe. Resume páginas de eventos do agronegócio brasileiro em português, formato markdown, 2-3 parágrafos curtos. Foque em: (1) o que é o evento, (2) público / temas / programação relevante, (3) por que vale a pena para a equipe AgriSafe (oportunidades de conteúdo, networking, sinais de mercado). NÃO invente fatos — use apenas o conteúdo fornecido. Retorne JSON com a chave "summary" contendo o markdown.`
      const userPrompt = `Evento: ${event.name}\nLocal: ${event.location || '?'}\nData: ${event.date}\nFonte: ${event.source_name || '?'}\nMeta descrição: ${meta.description}\n\nConteúdo da página (truncado):\n${mainText.slice(0, 3000)}`
      const raw = await summarizeText(systemPrompt, userPrompt, 800)
      try {
        const parsed = JSON.parse(raw)
        if (parsed.summary && typeof parsed.summary === 'string') {
          summary = parsed.summary
          enrichmentSource = 'gemini'
        } else {
          summary = raw
          enrichmentSource = 'gemini'
        }
      } catch {
        // Gemini returned non-JSON despite the responseMimeType — use the raw
        summary = raw.slice(0, 2000)
        enrichmentSource = 'gemini'
      }
    } catch (err) {
      // Fall through to manual summary on Gemini error
      console.error('[events/enrich] Gemini failed, using manual summary:', err)
      summary = `**${meta.title || event.name}**\n\n${meta.description || mainText.slice(0, 600)}`
      enrichmentSource = 'manual'
    }
  } else {
    // No Gemini → algorithmic summary using meta + first paragraph
    summary = `**${meta.title || event.name}**\n\n${meta.description || mainText.slice(0, 600)}`
    enrichmentSource = 'manual'
  }

  // ─── 4. Write back to the events row ───────────────────────
  const enrichedAt = new Date().toISOString()
  const { error: upErr } = await supabase
    .from('events')
    .update({
      enrichment_summary: summary,
      enriched_at: enrichedAt,
      enrichment_source: enrichmentSource,
    })
    .eq('id', event.id)

  if (upErr) {
    return NextResponse.json(
      { success: false, error: `db update failed: ${upErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success: true,
    enrichment_summary: summary,
    enrichment_source: enrichmentSource,
    enriched_at: enrichedAt,
    event_id: event.id,
  })
}
