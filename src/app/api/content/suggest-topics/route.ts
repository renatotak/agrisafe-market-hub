/**
 * Phase 6b — Content suggestion engine.
 *
 *   POST /api/content/suggest-topics
 *   Body: { lang?: "pt" | "en" }
 *
 * 1. Pipeline-status sweep: scans `published_articles` rows that have a
 *    matching `published_article_links` entry and flips status to 'published'.
 *
 * 2. Gathers last 14 days of:
 *    - agro_news (top 30 by published_at)
 *    - regulatory_norms (top 15)
 *    - recuperacao_judicial (top 10)
 *    - price anomalies (via v_commodity_price_stats)
 *    - entity_mentions clusters (top 10 most-mentioned entities)
 *
 * 3. Sends the aggregated context to Vertex AI (gemini-2.5-flash) to
 *    generate 5-10 ranked LinkedIn article angles.
 *
 * 4. Returns suggestions array + pipeline sweep count.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { summarizeText, isGeminiConfigured } from "@/lib/gemini"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

interface Suggestion {
  rank: number
  title: string
  thesis: string
  sources: string[]
  relevance_score: number
  tags: string[]
  channel: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const lang = body.lang === "en" ? "en" : "pt"
  const supabase = createAdminClient()

  // ── 1. Pipeline-status sweep ─────────────────────────────────────
  let statusFlipped = 0
  try {
    // Find published_articles rows that are NOT 'published' but DO have a link
    const { data: links } = await supabase
      .from("published_article_links")
      .select("article_id")

    if (links && links.length > 0) {
      const linkedIds = links.map((l: any) => l.article_id)
      const { data: toFlip } = await supabase
        .from("published_articles")
        .select("id")
        .in("id", linkedIds)
        .neq("status", "published")

      if (toFlip && toFlip.length > 0) {
        const ids = toFlip.map((r: any) => r.id)
        await supabase
          .from("published_articles")
          .update({ status: "published" })
          .in("id", ids)
        statusFlipped = ids.length

        await logActivity(supabase, {
          action: "update",
          target_table: "published_articles",
          source: "manual:content_suggest_sweep",
          source_kind: "manual",
          summary: `Pipeline sweep: flipped ${statusFlipped} article(s) to published (had linked URLs)`,
          metadata: { ids, statusFlipped },
        })
      }
    }
  } catch (e) {
    console.error("[suggest-topics] pipeline sweep error:", (e as Error).message)
  }

  // ── 2. Gather signals (last 14 days) ────────────────────────────
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()

  const [newsRes, normsRes, rjRes, anomalyRes, mentionsRes] = await Promise.all([
    supabase
      .from("agro_news")
      .select("title, source_name, category, published_at")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(30),
    supabase
      .from("regulatory_norms")
      .select("title, body, norm_type, impact_level, published_at")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(15),
    supabase
      .from("recuperacao_judicial")
      .select("company_name, state, debt_amount, filing_date")
      .gte("filing_date", since)
      .order("filing_date", { ascending: false })
      .limit(10),
    supabase
      .from("commodity_prices")
      .select("id, name_pt, name_en, price, change_24h, unit"),
    supabase
      .from("entity_mentions")
      .select("entity_uid, mention_type, source_table")
      .gte("created_at", since)
      .limit(200),
  ])

  const news = newsRes.data || []
  const norms = normsRes.data || []
  const rjCases = rjRes.data || []
  const prices = anomalyRes.data || []
  const mentions = mentionsRes.data || []

  // Compute entity mention clusters
  const mentionCounts: Record<string, number> = {}
  for (const m of mentions) {
    const key = m.entity_uid || "unknown"
    mentionCounts[key] = (mentionCounts[key] || 0) + 1
  }
  const topMentions = Object.entries(mentionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([uid, count]) => ({ entity_uid: uid, mentions: count }))

  // Price anomalies — simple 2-sigma filter
  const priceAnomalies = prices.filter((p: any) => {
    const change = Math.abs(parseFloat(p.change_24h || "0"))
    return change > 3 // >3% absolute change as a simple heuristic
  }).map((p: any) => ({
    commodity: lang === "en" ? p.name_en : p.name_pt,
    price: p.price,
    change: p.change_24h,
    unit: p.unit,
  }))

  // ── 3. Check Gemini availability ────────────────────────────────
  if (!isGeminiConfigured()) {
    return NextResponse.json({
      suggestions: [],
      statusFlipped,
      error: "Vertex AI not configured — cannot generate suggestions",
    }, { status: 200 })
  }

  // No data at all? Skip the AI call
  if (news.length === 0 && norms.length === 0 && rjCases.length === 0) {
    return NextResponse.json({
      suggestions: [],
      statusFlipped,
      error: lang === "pt"
        ? "Dados insuficientes nos últimos 14 dias para gerar sugestões"
        : "Insufficient data in the last 14 days to generate suggestions",
    }, { status: 200 })
  }

  // ── 4. Vertex AI prompt ─────────────────────────────────────────
  const systemPrompt = `You are a senior content strategist at AgriSafe, a Brazilian agribusiness intelligence consultancy.
Your task: analyze the recent market signals below and propose 5-10 compelling LinkedIn article topics for the AgriSafe company page.

Each suggestion must be:
- Relevant to AgriSafe's audience (agribusiness executives, rural credit professionals, cooperatives, trading companies)
- Based on concrete data from the signals provided (cite specific news, norms, or price movements)
- Actionable and timely — something that should be published within the next 2 weeks

Output JSON array. Each element:
{
  "rank": <1-10>,
  "title": "<article title in ${lang === "pt" ? "Portuguese" : "English"}>",
  "thesis": "<2-3 sentence thesis statement in ${lang === "pt" ? "Portuguese" : "English"}>",
  "sources": ["<which input signals support this>"],
  "relevance_score": <0.0-1.0>,
  "tags": ["<3-5 topic tags>"],
  "channel": "linkedin"
}

Sort by relevance_score descending. Be specific — avoid generic topics. Reference the actual data points.`

  const signalsPayload = JSON.stringify({
    recent_news: news.slice(0, 20).map((n: any) => ({
      title: n.title,
      source: n.source_name,
      category: n.category,
      date: n.published_at,
    })),
    regulatory_changes: norms.slice(0, 10).map((n: any) => ({
      title: n.title,
      body: n.body,
      type: n.norm_type,
      impact: n.impact_level,
      date: n.published_at,
    })),
    judicial_recovery: rjCases.slice(0, 5).map((r: any) => ({
      company: r.company_name,
      state: r.state,
      debt: r.debt_amount,
      date: r.filing_date,
    })),
    price_anomalies: priceAnomalies.slice(0, 10),
    entity_mention_clusters: topMentions.slice(0, 5),
    existing_campaigns: [
      "Xadrez Virtudes", "Virtudes Agro", "Dinheiro ou Conhecimento",
      "Safra 26/27 Trend", "Novo Ciclo"
    ],
  }, null, 2)

  try {
    const raw = await summarizeText(systemPrompt, signalsPayload, 3000)
    let suggestions: Suggestion[] = []
    try {
      const parsed = JSON.parse(raw)
      suggestions = (Array.isArray(parsed) ? parsed : parsed.suggestions || [])
        .filter((s: any) => s.title && s.thesis)
        .map((s: any, i: number) => ({
          rank: s.rank || i + 1,
          title: String(s.title),
          thesis: String(s.thesis),
          sources: Array.isArray(s.sources) ? s.sources : [],
          relevance_score: typeof s.relevance_score === "number" ? s.relevance_score : 0.5,
          tags: Array.isArray(s.tags) ? s.tags : [],
          channel: s.channel || "linkedin",
        }))
        .sort((a: Suggestion, b: Suggestion) => b.relevance_score - a.relevance_score)
    } catch {
      return NextResponse.json({
        suggestions: [],
        statusFlipped,
        error: "Failed to parse AI response",
        raw_response: raw.slice(0, 500),
      })
    }

    await logActivity(supabase, {
      action: "insert",
      target_table: "content_topics",
      source: "manual:content_suggest_topics",
      source_kind: "manual",
      summary: `Generated ${suggestions.length} article suggestions via Vertex AI (${news.length} news, ${norms.length} norms, ${rjCases.length} RJ, ${priceAnomalies.length} anomalies)`,
      metadata: {
        suggestion_count: suggestions.length,
        input_counts: {
          news: news.length,
          norms: norms.length,
          rj: rjCases.length,
          anomalies: priceAnomalies.length,
          mentions: mentions.length,
        },
        statusFlipped,
      },
    })

    return NextResponse.json({ suggestions, statusFlipped })
  } catch (e: any) {
    console.error("[suggest-topics] AI error:", e.message)
    return NextResponse.json({
      suggestions: [],
      statusFlipped,
      error: `AI generation failed: ${e.message}`,
    }, { status: 500 })
  }
}
