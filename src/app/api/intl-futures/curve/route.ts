import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/intl-futures/curve?slug=soja|milho|cafe|algodao|trigo|boi-gordo
 *
 * Builds a forward curve for an international commodity by enumerating
 * the next ~12 active contract months and batch-fetching them via
 * Yahoo Finance's `/v7/finance/quote` (multi-symbol endpoint).
 *
 * Returns one row per contract with last price, daily change,
 * traded volume, and open interest (when Yahoo carries it). Contracts
 * with zero traded volume are filtered out by default — those are
 * back-months no one's actually pricing yet, and including them
 * makes the curve look noisy.
 *
 * No LLM. Pure algorithm — guardrail #1.
 */

export const revalidate = 600; // 10 min — futures move slowly

// CME futures month codes
const MONTH_CODES = "FGHJKMNQUVXZ"; // Jan..Dec → F G H J K M N Q U V X Z

interface CommodityConfig {
  yahooRoot: string;       // e.g. "ZS" for soybean
  yahooSuffix: string;     // ".CBT" | ".NYB" | ".CME" — exchange-specific Yahoo suffix
  exchange: string;        // shown in UI
  name: string;
  unit: string;
  isCents: boolean;
  /** Active contract months by month-number (1-12). Empty array → every month. */
  activeMonths: number[];
}

const COMMODITY_MAP: Record<string, CommodityConfig> = {
  soja:       { yahooRoot: "ZS", yahooSuffix: ".CBT", exchange: "CBOT",   name: "Soybean",     unit: "US¢/bu", isCents: true,  activeMonths: [1, 3, 5, 7, 8, 9, 11] },
  milho:      { yahooRoot: "ZC", yahooSuffix: ".CBT", exchange: "CBOT",   name: "Corn",        unit: "US¢/bu", isCents: true,  activeMonths: [3, 5, 7, 9, 12] },
  trigo:      { yahooRoot: "ZW", yahooSuffix: ".CBT", exchange: "CBOT",   name: "Wheat",       unit: "US¢/bu", isCents: true,  activeMonths: [3, 5, 7, 9, 12] },
  cafe:       { yahooRoot: "KC", yahooSuffix: ".NYB", exchange: "ICE NY", name: "Coffee C",    unit: "US¢/lb", isCents: true,  activeMonths: [3, 5, 7, 9, 12] },
  algodao:    { yahooRoot: "CT", yahooSuffix: ".NYB", exchange: "ICE NY", name: "Cotton",      unit: "US¢/lb", isCents: true,  activeMonths: [3, 5, 7, 10, 12] },
  "boi-gordo":{ yahooRoot: "LE", yahooSuffix: ".CME", exchange: "CME",    name: "Live Cattle", unit: "US¢/lb", isCents: true,  activeMonths: [2, 4, 6, 8, 10, 12] },
};

interface CurveContract {
  label: string;          // "Jul 2026"
  code: string;           // "ZSN26.CME"
  expiry_month: number;
  expiry_year: number;
  expiry_date: string;    // "2026-07-15" mid-month proxy
  last: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
  open_interest: number | null;
}

function midMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-15`;
}

function shortMonthLabel(month: number, year: number, lang = "pt"): string {
  const ptShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const enShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = (lang === "pt" ? ptShort : enShort)[month - 1];
  return `${m} ${year}`;
}

function buildSymbols(cfg: CommodityConfig, monthsAhead = 14): { code: string; month: number; year: number }[] {
  // Enumerate the next N calendar months, keep only active ones, build the
  // CME contract symbol root + month-code + 2-digit year. Yahoo accepts
  // both `ZSN26` and `ZSN26.CME` — `.CME` suffix improves accuracy when
  // the root collides with another exchange.
  const out: { code: string; month: number; year: number }[] = [];
  const today = new Date();
  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    if (cfg.activeMonths.length > 0 && !cfg.activeMonths.includes(month)) continue;
    const code = `${cfg.yahooRoot}${MONTH_CODES[month - 1]}${String(year).slice(-2)}${cfg.yahooSuffix}`;
    out.push({ code, month, year });
  }
  return out;
}

/**
 * Fetch one quote-like record per symbol via Yahoo's `/v8/finance/chart`
 * — the only Yahoo endpoint that doesn't require an auth crumb. Slower
 * than `/v7/finance/quote` (one round-trip per symbol) but works
 * unauthenticated, which matters for serverless without secret rotation.
 */
async function fetchYahooQuotes(symbols: string[]): Promise<any[]> {
  if (symbols.length === 0) return [];
  const out = await Promise.all(symbols.map(async (sym) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { symbol: sym, _missing: true };
      const data = await res.json();
      const r = data?.chart?.result?.[0];
      if (!r) return { symbol: sym, _missing: true };
      const meta = r.meta || {};
      const quote = r.indicators?.quote?.[0] || {};
      const closes = (quote.close as (number | null)[]) || [];
      const volumes = (quote.volume as (number | null)[]) || [];
      // Use the last non-null close as `last`, second-last as prevClose
      const lastIdx = (() => {
        for (let i = closes.length - 1; i >= 0; i--) if (closes[i] != null) return i;
        return -1;
      })();
      if (lastIdx < 0) return { symbol: sym, _missing: true };
      const last = meta.regularMarketPrice ?? closes[lastIdx];
      const prev = lastIdx > 0 ? closes[lastIdx - 1] : (meta.chartPreviousClose ?? null);
      const change = last != null && prev != null ? Number(last) - Number(prev) : null;
      const changePct = change != null && prev ? (change / Number(prev)) * 100 : null;
      return {
        symbol: sym,
        regularMarketPrice: last,
        regularMarketPreviousClose: prev,
        regularMarketChange: change,
        regularMarketChangePercent: changePct,
        regularMarketVolume: meta.regularMarketVolume ?? volumes[lastIdx] ?? null,
        // Yahoo doesn't expose openInterest via /v8/chart; leave null.
        openInterest: null,
      };
    } catch {
      return { symbol: sym, _missing: true };
    }
  }));
  return out;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "soja";
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "pt";
  const includeIlliquid = req.nextUrl.searchParams.get("include_illiquid") === "true";
  const cfg = COMMODITY_MAP[slug];
  if (!cfg) {
    return NextResponse.json({
      success: false,
      error: `Slug "${slug}" not supported. Available: ${Object.keys(COMMODITY_MAP).join(", ")}`,
    }, { status: 400 });
  }

  try {
    const symbols = buildSymbols(cfg, 18);
    const quotes = await fetchYahooQuotes(symbols.map((s) => s.code));
    const byCode = new Map<string, any>();
    for (const q of quotes) byCode.set(q.symbol, q);

    const contracts: CurveContract[] = symbols.map(({ code, month, year }) => {
      const q = byCode.get(code);
      const last = q?.regularMarketPrice ?? null;
      const prev = q?.regularMarketPreviousClose ?? null;
      const change = q?.regularMarketChange ?? (last != null && prev != null ? last - prev : null);
      const changePct = q?.regularMarketChangePercent ?? (last != null && prev != null && prev !== 0 ? ((last - prev) / prev) * 100 : null);
      return {
        label: shortMonthLabel(month, year, lang),
        code,
        expiry_month: month,
        expiry_year: year,
        expiry_date: midMonthIso(year, month),
        last,
        change,
        change_pct: changePct,
        volume: q?.regularMarketVolume ?? null,
        open_interest: q?.openInterest ?? null,
      };
    });

    // Volume filter — drop contracts Yahoo couldn't price OR whose
    // traded volume is zero. Caller can opt out via include_illiquid.
    let filtered = contracts.filter((c) => c.last != null);
    if (!includeIlliquid) filtered = filtered.filter((c) => (c.volume ?? 0) > 0);

    // Provide a "front-month" hint — first liquid contract by date.
    const front = filtered[0] || null;

    return NextResponse.json({
      success: true,
      slug,
      source: "Yahoo Finance",
      exchange: cfg.exchange,
      name: cfg.name,
      unit: cfg.unit,
      front_month: front ? { code: front.code, label: front.label, last: front.last } : null,
      contracts: filtered,
      contracts_dropped: contracts.length - filtered.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, slug, error: msg, contracts: [] }, { status: 502 });
  }
}
