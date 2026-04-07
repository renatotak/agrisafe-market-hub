import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  loadMatchableEntities,
  matchEntitiesInText,
  writeEntityMentions,
} from "@/lib/entity-matcher";

/**
 * Phase 22 — Reading Room Chrome extension ingest endpoint.
 *
 * The Chrome extension at C:\Users\renat\.gemini\antigravity\projects\1 personal\reading-room
 * POSTs articles here instead of localhost. Requests are authenticated with
 * a shared secret in the `x-reading-room-secret` header (env READING_ROOM_SECRET).
 *
 * Contract:
 *   POST /api/reading-room/ingest
 *   Headers: { x-reading-room-secret: <secret> }
 *   Body: {
 *     url:         string  (required, http(s))
 *     title:       string  (required)
 *     content:     string  (required, full article text)
 *     source_name: string  (optional, defaults to "Reading Room")
 *     fetched_at:  string  (optional ISO timestamp, defaults to now())
 *     tags?:       string[]
 *   }
 *
 * Returns:
 *   200 → { success: true, news_id, entity_mentions, category, mentions_producer }
 *   400 → missing/invalid fields
 *   401 → bad or missing secret
 *   500 → DB error
 *
 * Behavior:
 *   - Inserts row into agro_news (upsert by source_url, ignoreDuplicates).
 *   - Runs the algorithm-first entity-matcher (no LLMs) and writes
 *     entity_mentions rows for any legal_entity that appears in title+content.
 *   - Marks mentions_producer=true if a highlighted_producers keyword matches.
 *   - Categorizes via the same regex used by sync-agro-news.
 *   - Tier: 'agrisafe_published' (came in via internal AgriSafe extension).
 */

export const dynamic = "force-dynamic";

// Same regex as sync-agro-news/route.ts (kept in sync — not extracted because
// extracting would touch a shared file outside the per-route scope).
//
// Order matters: the FIRST match wins. credit/judicial precede livestock so that
// articles mentioning the institutional name "Ministério da Agricultura e Pecuária"
// in a credit or RJ context don't get tagged livestock by accident.
function categorize(title: string, summary: string): string {
  const text = `${title} ${summary}`.toLowerCase();
  if (/soja|milho|café|açúcar|algodão|commodity|cotaç/.test(text)) return "commodities";
  if (/recuperação judicial|falência|judicial|tribunal/.test(text)) return "judicial";
  if (/crédito|financ|banco|selic|juro|cpr|lca|cra|fidc|fiagro|barter/.test(text)) return "credit";
  if (/boi|vaca|bezerro|gado|pecuarista|suíno|frango|aves|leite|carne|pastagem/.test(text)) return "livestock";
  if (/tecnolog|inovaç|startup|digital|drone|satelit/.test(text)) return "technology";
  if (/polític|govern|lei|regulament|mapa|conab/.test(text)) return "policy";
  if (/sustentab|ambient|carbono|esg|desmat/.test(text)) return "sustainability";
  return "general";
}

function generateId(sourceUrl: string): string {
  let hash = 0;
  for (let i = 0; i < sourceUrl.length; i++) {
    const char = sourceUrl.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `rr-${Math.abs(hash).toString(36)}`;
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // ─── 1. Authenticate via shared secret ──────────────────────
  const expected = process.env.READING_ROOM_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Reading Room ingest is not configured (READING_ROOM_SECRET env var missing)" },
      { status: 401 },
    );
  }
  const provided = req.headers.get("x-reading-room-secret");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ─── 2. Parse + validate body ───────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { url, title, content } = body;
  if (!isValidUrl(url)) {
    return NextResponse.json({ error: "url is required and must be a valid http(s) URL" }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const sourceName = (typeof body.source_name === "string" && body.source_name.trim())
    ? body.source_name.trim()
    : "Reading Room";
  const fetchedAt = (typeof body.fetched_at === "string" && body.fetched_at)
    ? body.fetched_at
    : new Date().toISOString();
  const tags: string[] = Array.isArray(body.tags)
    ? body.tags.filter((t: unknown) => typeof t === "string").slice(0, 10)
    : [];

  const cleanTitle = title.trim();
  const cleanContent = content.trim();
  const summary = cleanContent.slice(0, 500);

  // ─── 3. Insert into agro_news ───────────────────────────────
  const supabase = createAdminClient();

  // Highlighted-producer keyword scan (same shape as sync-agro-news)
  const { data: producers } = await supabase
    .from("highlighted_producers")
    .select("name, keywords")
    .eq("active", true);

  const producerKeywords = (producers || []).flatMap((p: any) =>
    (p.keywords || []).map((kw: string) => ({ name: p.name, keyword: kw.toLowerCase() }))
  );
  const textForMatch = `${cleanTitle} ${cleanContent}`.toLowerCase();
  const matchedProducers = [...new Set(
    producerKeywords
      .filter((pk: { keyword: string }) => textForMatch.includes(pk.keyword))
      .map((pk: { name: string }) => pk.name)
  )];

  const newsId = generateId(url);
  const newsRow = {
    id: newsId,
    title: cleanTitle,
    summary: summary || null,
    source_name: sourceName,
    source_url: url,
    image_url: null,
    published_at: fetchedAt,
    category: categorize(cleanTitle, cleanContent),
    tags,
    mentions_producer: matchedProducers.length > 0,
    producer_names: matchedProducers,
    confidentiality: "agrisafe_published",
  };

  const { error: insertError } = await supabase
    .from("agro_news")
    .upsert(newsRow, { onConflict: "source_url", ignoreDuplicates: false });

  if (insertError) {
    return NextResponse.json(
      { error: `db insert failed: ${insertError.message}` },
      { status: 500 },
    );
  }

  // ─── 4. Algorithm-first entity-mention detection ────────────
  let entityMentionsWritten = 0;
  try {
    const matchable = await loadMatchableEntities(supabase);
    const entityUids = matchEntitiesInText(`${cleanTitle} ${cleanContent}`, matchable);
    if (entityUids.length > 0) {
      entityMentionsWritten = await writeEntityMentions(supabase, {
        entityUids,
        sourceTable: "agro_news",
        sourceId: newsId,
        mentionType: "mentioned",
        extractedBy: "regex_v1_reading_room",
      });
    }
  } catch (e: any) {
    // Don't fail the whole request just because entity matching crashed.
    console.error("[reading-room/ingest] entity matcher failed:", e?.message);
  }

  // ─── 5. Touch the news_sources sentinel row (best-effort) ───
  try {
    await supabase
      .from("news_sources")
      .update({ last_fetched_at: new Date().toISOString(), last_error: null })
      .eq("id", "reading-room");
  } catch {
    // not fatal
  }

  return NextResponse.json({
    success: true,
    news_id: newsId,
    entity_mentions: entityMentionsWritten,
    category: newsRow.category,
    mentions_producer: newsRow.mentions_producer,
  });
}
