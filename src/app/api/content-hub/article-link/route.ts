import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { logActivity } from "@/lib/activity-log";

/**
 * /api/content-hub/article-link
 *
 *   GET                       — list all known links (used by ContentHub UI)
 *   GET ?article_id=ag-07     — fetch one
 *   POST { article_id, url }  — set/update; auto-fetches og:meta
 *   DELETE ?article_id=...    — remove
 *
 * The og:meta fetch is best-effort: failure to fetch never blocks the
 * URL save. LinkedIn returns og:title / og:description / og:image
 * for public posts.
 */

export const dynamic = "force-dynamic";

interface OgMeta {
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
}

function detectChannel(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("twitter.com") || u.includes("x.com")) return "x";
  if (u.includes("facebook.com")) return "facebook";
  return "other";
}

async function fetchOg(url: string): Promise<OgMeta> {
  const result: OgMeta = { og_title: null, og_description: null, og_image: null };
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return result;
    const html = await res.text();
    const pick = (prop: string): string | null => {
      // og: tags; allow either property=... or name=... ordering
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
      const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
      const m = html.match(re) || html.match(re2);
      return m ? decodeHtmlEntities(m[1]) : null;
    };
    result.og_title = pick("og:title");
    result.og_description = pick("og:description");
    result.og_image = pick("og:image");
  } catch {
    // fail-soft
  }
  return result;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const articleId = req.nextUrl.searchParams.get("article_id");
  let q = supabase
    .from("published_article_links")
    .select("article_id, url, channel, og_title, og_description, og_image, og_fetched_at, notes, updated_at");
  if (articleId) q = q.eq("article_id", articleId).limit(1);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (articleId) return NextResponse.json({ link: data?.[0] || null });
  return NextResponse.json({ links: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const articleId = String(body.article_id || "").trim();
  const url = String(body.url || "").trim();
  if (!articleId || !url) {
    return NextResponse.json({ error: "article_id and url required" }, { status: 400 });
  }
  let urlObj: URL;
  try { urlObj = new URL(url); } catch { return NextResponse.json({ error: "invalid url" }, { status: 400 }); }
  if (!/^https?:$/.test(urlObj.protocol)) {
    return NextResponse.json({ error: "url must be http(s)" }, { status: 400 });
  }

  const channel = body.channel ? String(body.channel) : detectChannel(url);
  const skipOg = body.skip_og === true;
  const og: OgMeta = skipOg ? { og_title: null, og_description: null, og_image: null } : await fetchOg(url);

  const row: Record<string, any> = {
    article_id: articleId,
    url,
    channel,
    notes: body.notes ?? null,
  };
  if (og.og_title || og.og_description || og.og_image) {
    row.og_title = og.og_title;
    row.og_description = og.og_description;
    row.og_image = og.og_image;
    row.og_fetched_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("published_article_links")
    .upsert(row, { onConflict: "article_id" })
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabase, {
    action: "upsert",
    target_table: "published_article_links",
    target_id: articleId,
    source: "manual:content_hub_link",
    source_kind: "manual",
    summary: `${articleId} → ${channel} ${og.og_title ? `· "${og.og_title.slice(0, 80)}"` : ""}`.slice(0, 200),
    metadata: { url, channel, og_fetched: !!(og.og_title || og.og_image) },
  });

  return NextResponse.json({ link: data, og_fetched: !!(og.og_title || og.og_image) });
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminClient();
  const articleId = req.nextUrl.searchParams.get("article_id");
  if (!articleId) return NextResponse.json({ error: "article_id required" }, { status: 400 });
  const { error } = await supabase.from("published_article_links").delete().eq("article_id", articleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(supabase, {
    action: "delete",
    target_table: "published_article_links",
    target_id: articleId,
    source: "manual:content_hub_link",
    source_kind: "manual",
    summary: `Removed link for ${articleId}`,
  });
  return NextResponse.json({ ok: true });
}
