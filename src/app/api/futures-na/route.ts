import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

/**
 * GET /api/futures-na?slug=etanol|acucar
 *
 * Scrapes Notícias Agrícolas's sucroenergético sub-pages to surface
 * the **forward curve** of B3 (Brazilian exchange) ethanol and NY11
 * sugar futures.
 *
 * Why NA instead of Yahoo: Yahoo doesn't carry B3 ethanol contracts
 * with reliable data, and NA already publishes the full curve as
 * a clean HTML table (Contrato-Mês | Fechamento | Variação) with
 * one row per expiry month. That's exactly the shape we need for a
 * "curve" visualization.
 *
 * The scraper takes the FIRST `table.cot-fisicas` on the page (the
 * canonical contract series). Some sources publish multiple variants
 * (anidro / hidratado / outros) — we surface only the canonical
 * one for now; richer variant breakdown is a follow-up.
 */

export const revalidate = 600; // 10 min — futures move slowly

interface FuturesCurveResponse {
  success: boolean;
  slug: string;
  name: string;
  source: string;
  exchange: string;
  unit: string;
  asOf: string | null;
  contracts: Array<{
    label: string;        // "Junho/2026"
    expiry_month: number; // 6
    expiry_year: number;  // 2026
    expiry_date: string;  // "2026-06-15" (mid-month proxy; B3 last-trading day varies)
    close: number;        // last price
    change_pct: number | null;
  }>;
  source_url: string;
  error?: string;
}

const SLUG_TO_PAGE: Record<string, { name: string; source: string; exchange: string; path: string; unit: string }> = {
  etanol: {
    name: "Etanol Hidratado (Pregão Regular)",
    source: "B3",
    exchange: "B3",
    path: "/cotacoes/sucroenergetico/etanol-b3-prego-regular",
    unit: "R$/m³",
  },
  acucar: {
    name: "Açúcar — NY 11",
    source: "ICE NY",
    exchange: "ICE NY",
    path: "/cotacoes/sucroenergetico/acucar-bolsa-de-nova-iorque-nybot",
    unit: "US¢/lb",
  },
};

const PT_MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, "março": 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function parsePtMonthYear(label: string): { month: number; year: number } | null {
  // Examples: "Junho/2026", "Julho / 2026", "Maio/26"
  const m = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/([a-z]+)\s*[\/\-]\s*(\d{2,4})/);
  if (!m) return null;
  const month = PT_MONTHS[m[1]];
  if (!month) return null;
  let year = parseInt(m[2], 10);
  // Two-digit year → assume 2000s; coerce 00-79 → 20xx, 80-99 → 19xx
  if (year < 100) year = year < 80 ? 2000 + year : 1900 + year;
  return { month, year };
}

function parseBrazilianNumber(s: string): number | null {
  // "2.445,00" → 2445.00
  const cleaned = s.replace(/[^\d.,\-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function midMonthIso(year: number, month: number): string {
  // Mid-month proxy for the curve X-axis. Each contract's actual
  // last-trading day varies (B3 ETH expires near the end of the
  // month, NY11 near the 15th-end of the prior month). Mid-month
  // is good enough for visualization.
  const m = String(month).padStart(2, "0");
  return `${year}-${m}-15`;
}

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") || "etanol").toLowerCase();
  const config = SLUG_TO_PAGE[slug];
  if (!config) {
    return NextResponse.json(
      { success: false, slug, error: `Slug "${slug}" not supported. Available: ${Object.keys(SLUG_TO_PAGE).join(", ")}` },
      { status: 400 },
    );
  }

  const url = `https://www.noticiasagricolas.com.br${config.path}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return NextResponse.json<FuturesCurveResponse>({
        success: false, slug, name: config.name, source: config.source, exchange: config.exchange,
        unit: config.unit, asOf: null, contracts: [], source_url: url,
        error: `NA returned ${res.status}`,
      }, { status: 502 });
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Date — first ".fechamento" within first .cotacao block
    const asOfRaw = $(".cotacao .fechamento").first().text().trim();
    const asOfMatch = asOfRaw.match(/(\d{2}\/\d{2}\/\d{4})/);
    const asOf = asOfMatch ? asOfMatch[1].split("/").reverse().join("-") : null;

    // First futures table
    const table = $("table.cot-fisicas").first();
    const contracts: FuturesCurveResponse["contracts"] = [];
    table.find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td").toArray();
      if (tds.length < 2) return;
      const label = $(tds[0]).text().trim();
      const closeStr = $(tds[1]).text().trim();
      const variStr = tds[2] ? $(tds[2]).text().trim() : "";
      const ym = parsePtMonthYear(label);
      const close = parseBrazilianNumber(closeStr);
      if (!ym || close == null) return;
      const variNum = parseBrazilianNumber(variStr);
      contracts.push({
        label,
        expiry_month: ym.month,
        expiry_year: ym.year,
        expiry_date: midMonthIso(ym.year, ym.month),
        close,
        change_pct: variNum ?? null,
      });
    });

    contracts.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));

    return NextResponse.json<FuturesCurveResponse>({
      success: true,
      slug,
      name: config.name,
      source: config.source,
      exchange: config.exchange,
      unit: config.unit,
      asOf,
      contracts,
      source_url: url,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json<FuturesCurveResponse>({
      success: false, slug, name: config.name, source: config.source, exchange: config.exchange,
      unit: config.unit, asOf: null, contracts: [], source_url: url,
      error: msg,
    }, { status: 500 });
  }
}
