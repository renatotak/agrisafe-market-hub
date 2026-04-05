import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** GET — fetch saved research for a company */
export async function GET(req: NextRequest) {
  const cnpjBasico = req.nextUrl.searchParams.get("cnpj_basico")?.replace(/\D/g, "");
  if (!cnpjBasico) return NextResponse.json({ error: "cnpj_basico required" }, { status: 400 });

  const root = cnpjBasico.padStart(8, "0");
  const { data } = await supabaseAdmin
    .from("company_research")
    .select("*")
    .eq("cnpj_basico", root)
    .order("searched_at", { ascending: false })
    .limit(5);

  return NextResponse.json({ cnpj_basico: root, research: data || [] });
}

// ─── Web search providers (ordered by priority) ─────────────────────────────

/** DuckDuckGo HTML search — always free, no key needed */
async function searchDuckDuckGo(query: string): Promise<{ title: string; snippet: string; url: string; source: string }[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
  });
  if (!res.ok) return [];
  const html = await res.text();

  const findings: { title: string; snippet: string; url: string; source: string }[] = [];
  // Split by result blocks for better pairing
  const blocks = html.split(/class="result results_links/);
  for (let i = 1; i < Math.min(blocks.length, 9); i++) {
    const block = blocks[i];
    // Skip ads
    if (block.includes("result--ad")) continue;
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    // Get real URL from result__url or uddg param
    const realUrlMatch = block.match(/class="result__url"[^>]*href="[^"]*uddg=([^&"]+)/);
    const uddgMatch = block.match(/href="[^"]*uddg=([^&"]+)/);

    if (!titleMatch) continue;
    const title = titleMatch[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
    const snippet = (snippetMatch?.[1] || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
    let url = "";
    const rawUrl = realUrlMatch?.[1] || uddgMatch?.[1];
    if (rawUrl) { try { url = decodeURIComponent(rawUrl); } catch { /* skip */ } }
    let source = "";
    try { source = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { /* skip */ }
    findings.push({ title, snippet, url, source });
  }
  return findings;
}

/** Google Custom Search — 100 free/day, requires API key + CX */
async function searchGoogle(query: string): Promise<{ title: string; snippet: string; url: string; source: string }[] | null> {
  const key = process.env.GOOGLE_CUSTOM_SEARCH_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (!key || !cx) return null;

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=8&lr=lang_pt`);
  if (!res.ok) return null; // fall through to next provider
  const data = await res.json();
  if (!data.items) return null;

  return data.items.map((item: any) => ({
    title: item.title || "",
    snippet: item.snippet || "",
    url: item.link || "",
    source: item.link ? new URL(item.link).hostname.replace(/^www\./, "") : "",
  }));
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const cnpjBasico = body.cnpj_basico?.replace(/\D/g, "");
  const razaoSocial = body.razao_social || "";
  const nomeFantasia = body.nome_fantasia || "";

  if (!cnpjBasico || !razaoSocial) {
    return NextResponse.json({ error: "cnpj_basico e razao_social são obrigatórios" }, { status: 400 });
  }

  const root = cnpjBasico.padStart(8, "0");
  const companyName = nomeFantasia || razaoSocial;
  const searchQuery = `${companyName} agronegócio Brasil`;

  // Try Google first, fall back to DuckDuckGo (always works, no key needed)
  let findings = await searchGoogle(searchQuery);
  let searchSource = "Google";
  if (!findings || findings.length === 0) {
    findings = await searchDuckDuckGo(searchQuery);
    searchSource = "DuckDuckGo";
  }

  if (findings.length === 0) {
    return NextResponse.json({ error: "Nenhum resultado encontrado na busca web" }, { status: 404 });
  }

  // Optional AI summary (if OpenAI key available)
  let summary: string | null = null;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && findings.length > 0) {
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiKey });
      const snippetsText = findings.map((f, i) => `${i + 1}. ${f.title}: ${f.snippet}`).join("\n");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Você é um analista de inteligência do agronegócio brasileiro. Com base nos resultados de busca, escreva um resumo executivo de 3-5 frases sobre a empresa, sua posição no mercado e relevância no agro. Seja conciso e factual." },
          { role: "user", content: `Empresa: ${razaoSocial}\nNome fantasia: ${companyName}\n\nResultados:\n${snippetsText}` },
        ],
        temperature: 0.3,
        max_tokens: 300,
      });
      summary = completion.choices[0]?.message?.content || null;
    } catch {
      // AI summary is optional
    }
  }

  const row = {
    cnpj_basico: root,
    razao_social: razaoSocial,
    search_query: searchQuery,
    findings,
    summary,
    searched_at: new Date().toISOString(),
  };

  await supabaseAdmin.from("company_research").insert(row);
  return NextResponse.json(row);
}
