/**
 * Phase 6d — sync-regulatory-digest job module.
 *
 * Reads regulatory_norms from the last 7 days, uses Vertex AI to generate
 * a bilingual digest (PT-BR + EN) with citations, and upserts into
 * regulatory_digests.
 *
 * Scheduled weekly on Sunday via the orchestrator.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobResult } from '@/jobs/types'
import { logActivity } from '@/lib/activity-log'

interface NormRow {
  id: string
  title: string
  body: string
  norm_type: string
  norm_number: string | null
  summary: string | null
  published_at: string
  impact_level: string
  affected_areas: string[]
  source_url: string | null
}

interface Citation {
  norm_id: string
  title: string
  body: string
  impact_level: string
  source_url: string | null
}

async function fetchRecentNorms(supabase: SupabaseClient, periodStart: string, periodEnd: string): Promise<NormRow[]> {
  const { data, error } = await supabase
    .from('regulatory_norms')
    .select('id, title, body, norm_type, norm_number, summary, published_at, impact_level, affected_areas, source_url')
    .gte('published_at', periodStart)
    .lte('published_at', periodEnd)
    .order('published_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`Failed to fetch norms: ${error.message}`)
  return (data || []) as NormRow[]
}

function buildCitations(norms: NormRow[]): Citation[] {
  return norms.map((n) => ({
    norm_id: n.id,
    title: n.title,
    body: n.body,
    impact_level: n.impact_level,
    source_url: n.source_url,
  }))
}

async function generateDigest(
  norms: NormRow[],
  periodStart: string,
  periodEnd: string,
): Promise<{ pt: string; en: string }> {
  if (norms.length === 0) {
    return {
      pt: `Nenhuma norma regulatória relevante ao agronegócio foi publicada no período de ${periodStart} a ${periodEnd}.`,
      en: `No agribusiness-relevant regulatory norms were published in the period from ${periodStart} to ${periodEnd}.`,
    }
  }

  try {
    const { summarizeText } = await import('@/lib/gemini')

    const systemPrompt = `You are a senior regulatory analyst at AgriSafe, specializing in Brazilian agribusiness regulation. Generate a weekly regulatory digest.

Output a JSON object with exactly these fields:
{
  "digest_pt": "Full digest in Portuguese (PT-BR). 3-5 paragraphs covering: (1) overview of the period's regulatory activity, (2) high-impact changes with specific norm references, (3) implications for agribusiness stakeholders. Reference specific norms by body + type + number.",
  "digest_en": "Full English translation of the same digest. Same structure, same citations."
}

Rules:
- Cite norms by their body and number (e.g., "BCB Resolução 5.234/2025")
- Group related norms by theme (crédito rural, CPR, FIAGRO, etc.)
- Highlight high-impact norms first
- Be specific about who is affected (cooperativas, revendas, produtores, fundos)
- Do not invent norms — only reference what is provided in the data`

    const context = JSON.stringify({
      period: `${periodStart} to ${periodEnd}`,
      norm_count: norms.length,
      norms: norms.map((n) => ({
        id: n.id,
        body: n.body,
        type: n.norm_type,
        number: n.norm_number,
        title: n.title,
        summary: n.summary?.slice(0, 300),
        impact: n.impact_level,
        areas: n.affected_areas,
        published: n.published_at,
      })),
    })

    const raw = await summarizeText(systemPrompt, context, 2000)
    const parsed = JSON.parse(raw)
    return {
      pt: parsed.digest_pt || parsed.digest_text_pt || raw,
      en: parsed.digest_en || parsed.digest_text_en || '',
    }
  } catch {
    // Algorithmic fallback — no LLM available
    const highImpact = norms.filter((n) => n.impact_level === 'high')
    const bodies = [...new Set(norms.map((n) => n.body))]
    const areas = [...new Set(norms.flatMap((n) => n.affected_areas))]

    const pt = [
      `Resumo regulatório do período ${periodStart} a ${periodEnd}.`,
      `${norms.length} norma(s) identificada(s), sendo ${highImpact.length} de alto impacto.`,
      `Órgãos: ${bodies.join(', ')}. Áreas afetadas: ${areas.join(', ')}.`,
      highImpact.length > 0
        ? `Destaques: ${highImpact.slice(0, 3).map((n) => n.title).join('; ')}.`
        : '',
    ].filter(Boolean).join(' ')

    const en = [
      `Regulatory digest for ${periodStart} to ${periodEnd}.`,
      `${norms.length} norm(s) identified, ${highImpact.length} high-impact.`,
      `Bodies: ${bodies.join(', ')}. Affected areas: ${areas.join(', ')}.`,
      highImpact.length > 0
        ? `Highlights: ${highImpact.slice(0, 3).map((n) => n.title).join('; ')}.`
        : '',
    ].filter(Boolean).join(' ')

    return { pt, en }
  }
}

export async function runSyncRegulatoryDigest(supabase: SupabaseClient): Promise<JobResult> {
  const startIso = new Date().toISOString()
  const start = Date.now()
  const errors: string[] = []

  const today = new Date()
  const periodEnd = today.toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const periodStart = sevenDaysAgo.toISOString().slice(0, 10)

  try {
    const norms = await fetchRecentNorms(supabase, periodStart, periodEnd)
    const digest = await generateDigest(norms, periodStart, periodEnd)
    const citations = buildCitations(norms)

    const row = {
      digest_date: periodEnd,
      period_start: periodStart,
      period_end: periodEnd,
      digest_text_pt: digest.pt,
      digest_text_en: digest.en,
      citations,
    }

    const { error } = await supabase
      .from('regulatory_digests')
      .upsert(row, { onConflict: 'digest_date' })

    if (error) {
      errors.push(error.message)
    }

    await logActivity(supabase, {
      action: 'upsert',
      target_table: 'regulatory_digests',
      target_id: periodEnd,
      source: 'sync-regulatory-digest',
      source_kind: 'cron',
      summary: `Regulatory digest ${periodStart}→${periodEnd}: ${norms.length} norms, ${citations.length} citations`,
      metadata: { norm_count: norms.length, citation_count: citations.length },
    }).catch(() => {})

    const duration = Date.now() - start
    return {
      ok: errors.length === 0,
      status: errors.length > 0 ? 'error' : 'success',
      startedAt: startIso,
      finishedAt: new Date().toISOString(),
      durationMs: duration,
      recordsFetched: norms.length,
      recordsUpdated: errors.length > 0 ? 0 : 1,
      errors,
      stats: { norm_count: norms.length, citation_count: citations.length },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(msg)
    return {
      ok: false,
      status: 'error',
      startedAt: startIso,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      recordsFetched: 0,
      recordsUpdated: 0,
      errors,
    }
  }
}
