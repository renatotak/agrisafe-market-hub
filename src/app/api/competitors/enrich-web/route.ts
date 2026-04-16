import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { createAdminClient } from "@/utils/supabase/admin";
import { logSync } from "@/lib/sync-logger";
import { summarizeText, isGeminiConfigured } from "@/lib/gemini";

/**
 * Phase 21 — On-demand competitor web enrichment.
 *
 * Two modes:
 *
 * A) POST { id }  → looks up the competitor, runs an algorithmic web search
 *                   (DuckDuckGo + optional Google CSE), optionally scrapes the
 *                   competitor's official website with Cheerio for a clean
 *                   meta-description / OG title, and returns a structured
 *                   "findings" payload that the UI can append to the notes
 *                   field.
 *
 * B) POST { url } → Phase 4a "URL paste + AI categorize". Scrapes the given
 *                   URL with Cheerio to extract meta tags, then uses Vertex AI
 *                   to return structured fields (name, segment, summary,
 *                   hq_city, main_lines) for the Add-Competitor form.
 *
 * GUARDRAIL — algorithms first:
 *   • Search results: deterministic HTML / JSON parsing.
 *   • Page scrape:    Cheerio selectors only (title, og:title, meta
 *                     description, h1).
 *   • LLM:            ONE optional call at the end, gated on OPENAI_API_KEY
 *                     (mode A) or Vertex AI (mode B), for a prose summary or
 *                     structured extraction. Never used to extract raw data
 *                     that Cheerio can get.
 */

interface Finding {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function searchDuckDuckGo(query: string): Promise<Finding[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const findings: Finding[] = [];
    const blocks = html.split(/class="result results_links/);
    for (let i = 1; i < Math.min(blocks.length, 9); i++) {
      const block = blocks[i];
      if (block.includes("result--ad")) continue;
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const realUrlMatch = block.match(/class="result__url"[^>]*href="[^"]*uddg=([^&"]+)/);
      const uddgMatch = block.match(/href="[^"]*uddg=([^&"]+)/);
      if (!titleMatch) continue;
      const title = titleMatch[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
      const snippet = (snippetMatch?.[1] || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
      let url = "";
      const rawUrl = realUrlMatch?.[1] || uddgMatch?.[1];
      if (rawUrl) { try { url = decodeURIComponent(rawUrl); } catch { /* skip */ } }
      let source = "";
      try { source = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { /* skip */ }
      findings.push({ title, snippet, url, source });
    }
    return findings;
  } catch {
    return [];
  }
}

async function searchGoogle(query: string): Promise<Finding[] | null> {
  const key = process.env.GOOGLE_CUSTOM_SEARCH_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (!key || !cx) return null;
  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=8`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items) return null;
    return data.items.map((item: { title?: string; snippet?: string; link?: string }) => ({
      title: item.title || "",
      snippet: item.snippet || "",
      url: item.link || "",
      source: item.link ? new URL(item.link).hostname.replace(/^www\./, "") : "",
    }));
  } catch {
    return null;
  }
}

interface SiteMeta {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  h1: string | null;
}

async function scrapeSiteMeta(website: string): Promise<SiteMeta | null> {
  if (!website) return null;
  // Normalize URL
  let url = website.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    return {
      title: $("title").first().text().trim() || null,
      description: $('meta[name="description"]').attr("content")?.trim() || null,
      ogTitle: $('meta[property="og:title"]').attr("content")?.trim() || null,
      h1: $("h1").first().text().trim() || null,
    };
  } catch {
    return null;
  }
}

// ─── Phase 4a: URL categorize (Cheerio + Vertex AI) ──────────────────────

interface CategorizeResult {
  name: string;
  segment: string;
  summary_pt: string;
  summary_en: string;
  hq_city: string;
  main_lines: string;
  website: string;
}

async function categorizeFromUrl(rawUrl: string): Promise<CategorizeResult> {
  // 1. Normalize and scrape
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const siteMeta = await scrapeSiteMeta(url);
  const hostname = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
  })();

  // 2. Cheerio: extract visible text for context (first ~3000 chars)
  let pageText = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      $("script, style, noscript, svg, nav, footer, header").remove();
      pageText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 3000);
    }
  } catch { /* timeout or network error */ }

  // 3. Build algorithmic defaults from meta tags
  const algoName = siteMeta?.ogTitle || siteMeta?.title || siteMeta?.h1 || hostname;
  const algoDesc = siteMeta?.description || "";

  // 4. If Vertex AI is available, use it for structured extraction
  if (isGeminiConfigured() && (pageText || algoDesc)) {
    try {
      const systemPrompt = [
        "Você é um analista de inteligência competitiva no agronegócio brasileiro.",
        "Dada a URL, meta-tags e texto visível de um site, extraia campos estruturados sobre a empresa.",
        "Responda APENAS com um JSON válido com estes campos:",
        '  "name": nome da empresa (curto, sem slogan),',
        '  "segment": vertical/segmento (ex: Agrifintech, Plataforma de Crédito, Agtech, Seguro Rural, Trading...),',
        '  "summary_pt": resumo de 2-3 frases em PT-BR sobre o que a empresa faz,',
        '  "summary_en": mesmo resumo em inglês,',
        '  "hq_city": cidade-sede se mencionada (ex: "São Paulo, SP"), ou "" se não encontrada,',
        '  "main_lines": linhas de produto/serviço principais separadas por vírgula.',
        "Seja factual — não invente dados que não apareçam no texto.",
      ].join("\n");

      const userPrompt = [
        `URL: ${url}`,
        `Hostname: ${hostname}`,
        `Title: ${siteMeta?.title || "—"}`,
        `OG Title: ${siteMeta?.ogTitle || "—"}`,
        `Meta Description: ${algoDesc || "—"}`,
        `H1: ${siteMeta?.h1 || "—"}`,
        "",
        "Texto visível (primeiros 3000 chars):",
        pageText || "(não disponível)",
      ].join("\n");

      const raw = await summarizeText(systemPrompt, userPrompt, 600);
      const parsed = JSON.parse(raw);
      return {
        name: parsed.name || algoName,
        segment: parsed.segment || "",
        summary_pt: parsed.summary_pt || algoDesc,
        summary_en: parsed.summary_en || "",
        hq_city: parsed.hq_city || "",
        main_lines: parsed.main_lines || "",
        website: hostname,
      };
    } catch {
      // Vertex AI failed — fall through to algorithmic defaults
    }
  }

  // 5. Algorithmic-only fallback (no LLM available)
  return {
    name: algoName,
    segment: "",
    summary_pt: algoDesc,
    summary_en: "",
    hq_city: "",
    main_lines: "",
    website: hostname,
  };
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startedAt = new Date().toISOString();
  const supabase = createAdminClient();

  let body: { id?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Mode B: Phase 4a URL categorize ──
  const pastedUrl = body.url?.trim();
  if (pastedUrl) {
    try {
      const result = await categorizeFromUrl(pastedUrl);
      return NextResponse.json({ mode: "categorize", ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Mode A: existing enrichment by competitor id ──
  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "id or url is required" }, { status: 400 });
  }

  const { data: competitor, error: fetchErr } = await supabase
    .from("competitors")
    .select("id, name, website, vertical, segment")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !competitor) {
    return NextResponse.json({ error: "competitor not found" }, { status: 404 });
  }

  const query = `${competitor.name} ${competitor.vertical || competitor.segment || ""} agronegócio Brasil`.trim();

  // 1. Algorithmic search
  let findings = await searchGoogle(query);
  let provider = "google";
  if (!findings || findings.length === 0) {
    findings = await searchDuckDuckGo(query);
    provider = "duckduckgo";
  }
  findings = findings || [];

  // 2. Algorithmic site scrape (Cheerio, no LLM)
  const siteMeta = competitor.website ? await scrapeSiteMeta(competitor.website) : null;

  // 3. Optional LLM prose summary (only if key present)
  let summary: string | null = null;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && (findings.length > 0 || siteMeta)) {
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiKey });
      const snippetsText = findings.map((f, i) => `${i + 1}. ${f.title}: ${f.snippet}`).join("\n");
      const siteText = siteMeta
        ? `Site title: ${siteMeta.title || siteMeta.ogTitle || "—"}\nSite description: ${siteMeta.description || "—"}`
        : "";
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Você é um analista de inteligência competitiva no agronegócio brasileiro. Com base nos resultados de busca e nos meta-dados do site, escreva um parágrafo executivo de 3-5 frases sobre a empresa, posicionamento, vertical e diferenciais. Seja factual; não invente dados.",
          },
          {
            role: "user",
            content: `Empresa: ${competitor.name}\nVertical: ${competitor.vertical || competitor.segment || "—"}\n\n${siteText}\n\nResultados de busca:\n${snippetsText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 320,
      });
      summary = completion.choices[0]?.message?.content?.trim() || null;
    } catch {
      // Optional — silent failure.
    }
  }

  const finishedAt = new Date().toISOString();

  // 4. Persist provenance on the competitor row.
  await supabase
    .from("competitors")
    .update({ last_web_enrichment_at: finishedAt })
    .eq("id", id);

  // 5. Log to sync_logs (so it shows up alongside cron sources)
  await logSync(supabase, {
    source: "enrich-competitor-web",
    started_at: startedAt,
    finished_at: finishedAt,
    records_fetched: findings.length + (siteMeta ? 1 : 0),
    records_inserted: 0,
    errors: 0,
    status: "success",
  });

  return NextResponse.json({
    competitor_id: id,
    provider,
    query,
    findings,
    site_meta: siteMeta,
    summary,
    enriched_at: finishedAt,
  });
}
