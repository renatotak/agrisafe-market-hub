import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity-log";

/**
 * /api/rj-add — manually add a Recuperação Judicial row by CNPJ (Phase 24C).
 *
 * Companion to /api/rj-scan (the broad DuckDuckGo crawl that picks up new
 * RJ filings from agro news). The user often knows about an RJ case that
 * the broad scan missed and wants to add it directly. This endpoint:
 *
 *   1. Takes a CNPJ (8 or 14 digits) + optional overrides
 *   2. Calls BrasilAPI to resolve razao_social, state from estabelecimento
 *   3. (optional) Runs a focused DuckDuckGo search for "<entity_name>
 *      recuperação judicial dívida" and tries to extract a debt amount
 *      from the snippets — scrape, no LLM (Guardrail #1)
 *   4. Upserts a row into recuperacao_judicial with id="manual:<cnpj>"
 *
 * The user can override entity_name, state, status, debt_value, etc. in
 * the request body — useful when BrasilAPI is incomplete or the user
 * wants to correct the auto-extracted debt.
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── BrasilAPI lookup ──────────────────────────────────────────────────────

function computeCnpjDv(base12: string): string {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d = base12.split("").map(Number);
  const s1 = d.reduce((s, v, i) => s + v * w1[i], 0);
  const d1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);
  d.push(d1);
  const s2 = d.reduce((s, v, i) => s + v * w2[i], 0);
  const d2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);
  return `${d1}${d2}`;
}

function buildMatrizCnpj(cnpjRaiz: string): string {
  const base12 = cnpjRaiz.padStart(8, "0") + "0001";
  return base12 + computeCnpjDv(base12);
}

async function fetchBrasilApi(fullCnpj: string): Promise<any | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${fullCnpj}`, {
      headers: { "User-Agent": "AgriSafeMarketHub/1.0", Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Focused debt-amount scraper ───────────────────────────────────────────
//
// Strategy: search DuckDuckGo for "<entity_name> recuperação judicial dívida"
// then scan the result snippets for currency patterns:
//   - "R$ 123 milhões"
//   - "R$ 1,2 bi"
//   - "dívida de 450 milhões"
//   - "passivo de R$ 2.5 bilhões"
//
// Return the largest plausible value found (in BRL). Zero LLM. Pure regex —
// matches the algorithms-first guardrail. The user can override the result
// in the modal before saving.

const CURRENCY_PATTERNS = [
  // R$ N (mi|bi|mil)
  /R\$\s*([\d.,]+)\s*(bi|bilh[õo][eê]s?|bi\b|milh[õo][eê]s?|mi\b|mil\b)/gi,
  // dívida/passivo de N (milhões/bilhões)
  /(?:d[íi]vida|passivo|exposição|pendência|d[ée]bito)[^0-9]{0,40}([\d.,]+)\s*(bi|bilh[õo][eê]s?|milh[õo][eê]s?|mi\b)/gi,
];

function parseAmountToBRL(amount: string, unit: string): number | null {
  // Brazilian thousand separator is ".", decimal is ","
  const normalized = amount.replace(/\./g, "").replace(",", ".");
  const value = parseFloat(normalized);
  if (Number.isNaN(value)) return null;

  const u = unit.toLowerCase();
  if (/bi/.test(u)) return value * 1_000_000_000;
  if (/mi(?!l)/.test(u) || /milh/.test(u)) return value * 1_000_000;
  if (/mil/.test(u)) return value * 1_000;
  return value;
}

async function scrapeDebtAmount(entityName: string): Promise<{ debt: number | null; source_url?: string; snippet?: string }> {
  try {
    const query = `"${entityName}" recuperação judicial dívida R$`;
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { debt: null };
    const html = await res.text();

    // Walk result blocks; collect the largest plausible value across ALL
    // snippets — most agro-distress headlines lead with the headline
    // figure (e.g. "JBS pede recuperação judicial com dívida de R$ 23 bi").
    let best = { value: 0, snippet: "", url: "" };
    const blocks = html.split(/class="result results_links/);
    for (let i = 1; i < Math.min(blocks.length, 8); i++) {
      const block = blocks[i];
      if (block.includes("result--ad")) continue;

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
      const uddgMatch = block.match(/href="[^"]*uddg=([^&"]+)/);
      const haystack = `${titleMatch?.[1] || ""} ${snippetMatch?.[1] || ""}`.replace(/<[^>]+>/g, "");

      for (const pattern of CURRENCY_PATTERNS) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(haystack)) !== null) {
          const val = parseAmountToBRL(m[1], m[2]);
          if (val && val > best.value && val < 1e12) {
            // 1e12 cap rejects nonsense numbers like CNPJs / phone digits
            let url = "";
            if (uddgMatch?.[1]) {
              try { url = decodeURIComponent(uddgMatch[1]); } catch { /* skip */ }
            }
            best = { value: val, snippet: haystack.slice(0, 240).trim(), url };
          }
        }
      }
    }

    if (best.value > 0) {
      return { debt: best.value, source_url: best.url, snippet: best.snippet };
    }
    return { debt: null };
  } catch {
    return { debt: null };
  }
}

// ─── POST handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Required: CNPJ (any length 8-14 digits)
  const cnpjRaw = String(body.cnpj || "").replace(/\D/g, "");
  if (cnpjRaw.length < 8 || cnpjRaw.length > 14) {
    return NextResponse.json({ error: "cnpj must have 8-14 digits" }, { status: 400 });
  }
  const cnpjRaiz = cnpjRaw.slice(0, 8).padStart(8, "0");
  const fullCnpj = cnpjRaw.length === 14 ? cnpjRaw : buildMatrizCnpj(cnpjRaiz);

  // Try to enrich entity_name + state from BrasilAPI unless caller passes them
  let entityName = String(body.entity_name || "").trim();
  let state = String(body.state || "").trim().toUpperCase();
  let entityType = String(body.entity_type || "").trim();
  let court = String(body.court || "").trim() || null;
  let caseNumber = String(body.case_number || "").trim() || null;
  let filingDate = String(body.filing_date || "").trim();
  let summary = String(body.summary || "").trim() || null;
  let sourceUrl = String(body.source_url || "").trim() || null;
  let sourceName = String(body.source_name || "").trim() || "manual";
  let status = String(body.status || "em_andamento").trim();
  let debtValue: number | null = body.debt_value != null ? Number(body.debt_value) : null;

  let brasilApi: any = null;
  if (!entityName || !state) {
    brasilApi = await fetchBrasilApi(fullCnpj);
    if (brasilApi) {
      if (!entityName) entityName = brasilApi.razao_social || brasilApi.nome_fantasia || "";
      if (!state && brasilApi.uf) state = String(brasilApi.uf).toUpperCase();
    }
  }

  if (!entityName) {
    return NextResponse.json(
      { error: "Could not resolve entity_name from CNPJ — provide it explicitly" },
      { status: 400 },
    );
  }

  // Auto-scrape debt amount if caller didn't provide one and asked for it
  let scrapedDebt: { debt: number | null; source_url?: string; snippet?: string } = { debt: null };
  if (debtValue == null && body.scrape_debt !== false) {
    scrapedDebt = await scrapeDebtAmount(entityName);
    if (scrapedDebt.debt) {
      debtValue = scrapedDebt.debt;
      if (!sourceUrl && scrapedDebt.source_url) sourceUrl = scrapedDebt.source_url;
      if (!summary && scrapedDebt.snippet) summary = scrapedDebt.snippet;
    }
  }

  // Default filing date to today if not given (the row needs SOMETHING for
  // the date column to render correctly in the timeline)
  if (!filingDate || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) {
    filingDate = new Date().toISOString().slice(0, 10);
  }

  const id = `manual:${cnpjRaiz}`;

  const row = {
    id,
    entity_name: entityName,
    entity_cnpj: fullCnpj,
    entity_type: entityType || "outros",
    court,
    case_number: caseNumber,
    status,
    filing_date: filingDate,
    summary,
    source_url: sourceUrl,
    source_name: sourceName,
    state: state || null,
    debt_value: debtValue,
  };

  const { data, error } = await supabaseAdmin
    .from("recuperacao_judicial")
    .upsert(row, { onConflict: "id" })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Phase 24G2 — log to activity feed (fail-soft)
  await logActivity(supabaseAdmin, {
    action: "upsert",
    target_table: "recuperacao_judicial",
    target_id: id,
    source: "manual:rj_add",
    source_kind: "manual",
    summary: `${entityName} (${state || "—"}) — ${status}${debtValue ? ` · R$ ${debtValue.toLocaleString("pt-BR")}` : ""}`.slice(0, 200),
    metadata: {
      cnpj: fullCnpj,
      enriched_brasilapi: !!brasilApi,
      enriched_debt_scraped: scrapedDebt.debt != null,
    },
  });

  return NextResponse.json({
    ok: true,
    rj: data,
    enriched_from: {
      brasilapi: !!brasilApi,
      debt_scraped: scrapedDebt.debt != null,
      debt_snippet: scrapedDebt.snippet,
    },
  });
}
