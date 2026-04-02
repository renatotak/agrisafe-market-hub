import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const revalidate = 600; // 10 min cache

const BASE = "https://www.noticiasagricolas.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0";

export interface NANewsItem {
  title: string;
  url: string;
  time: string;
  date: string;
  category: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "";
  const limit = Math.min(Number(searchParams.get("limit") || "12"), 35);

  const targetUrl = category ? `${BASE}/noticias/${category}/` : `${BASE}/noticias/`;

  try {
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "pt-BR,pt;q=0.9" },
      signal: AbortSignal.timeout(12000),
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `HTTP ${res.status}`, data: [] }, { status: 502 });
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const items: NANewsItem[] = [];

    // DOM: div.noticias li > a[href*="/noticias/{cat}/{id}-slug"]
    $(".noticias li").each((_i, li) => {
      if (items.length >= limit) return false;

      const anchor = $(li)
        .find('a[href*="/noticias/"]')
        .filter((_j, el) => /\/noticias\/[^/]+\/\d+/.test($(el).attr("href") || ""))
        .first();
      if (!anchor.length) return;

      const href = anchor.attr("href") || "";
      const rawText = anchor.text().trim().replace(/\s+/g, " ");

      // Title has time prefix like "17:53 Headline here..."
      const timeMatch = rawText.match(/^(\d{1,2}:\d{2})\s+(.+)/);
      const time = timeMatch ? timeMatch[1] : "";
      const title = timeMatch ? timeMatch[2] : rawText;
      if (!title || title.length < 5) return;

      const fullUrl = href.startsWith("http") ? href : `${BASE}${href}`;
      const catMatch = href.match(/\/noticias\/([^/]+)\//);
      const cat = catMatch ? catMatch[1] : category || "agronegocio";

      // Build ISO date from time (today)
      const today = new Date().toISOString().split("T")[0];
      const date = time ? `${today}T${time}:00` : new Date().toISOString();

      items.push({ title, url: fullUrl, time, date, category: cat });
    });

    return NextResponse.json({
      success: true,
      data: items,
      count: items.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Scrape failed", data: [] },
      { status: 500 },
    );
  }
}
