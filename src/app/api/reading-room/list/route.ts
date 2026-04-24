import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Reading Room — list endpoint for the Chrome extension's "Pull from
 * Market Hub" button. Returns every agro_news row with source_name =
 * 'Reading Room' so the extension can backfill its local library with
 * anything that was pushed from a different device.
 *
 * Auth: shared secret in `x-reading-room-secret` (same as /ingest).
 *
 * Response: { articles: [{ id, url, title, summary, category, tags,
 * published_at }], count }
 *
 * The config-probe row (source_name = 'Reading Room (config test)') is
 * excluded by the exact match.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.READING_ROOM_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "not configured" }, { status: 401 });
  }
  const provided = req.headers.get("x-reading-room-secret");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agro_news")
    .select("id, source_url, title, summary, category, tags, published_at")
    .eq("source_name", "Reading Room")
    .order("published_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const articles = (data || []).map((r: any) => ({
    id:           r.id,
    url:          r.source_url,
    title:        r.title,
    summary:      r.summary || "",
    category:     r.category || "general",
    tags:         Array.isArray(r.tags) ? r.tags : [],
    published_at: r.published_at,
  }));

  return NextResponse.json({ articles, count: articles.length });
}
