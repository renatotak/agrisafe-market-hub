import { NextRequest, NextResponse } from "next/server";

export const revalidate = 900; // cache 15 min

/**
 * Proxy for Yahoo Finance v8 chart API — fetches international commodity
 * futures (CBOT, ICE) for the Pulso do Mercado culture analysis chart.
 *
 * Yahoo blocks browser cross-origin requests but allows server-side fetches.
 *
 * Usage: GET /api/intl-futures?slug=soja&range=3mo
 */

// Slug → Yahoo Finance symbol + display metadata
const FUTURES_MAP: Record<string, {
  yahoo: string;
  name: string;
  exchange: string;
  unit: string;
  unitFull: string;
  currency: string;
  /** Yahoo returns prices in cents for grain futures (USX). Multiply to get dollars. */
  isCents: boolean;
}> = {
  soja:       { yahoo: "ZS=F", name: "Soybean Futures",  exchange: "CBOT",  unit: "US¢/bu", unitFull: "US cents per bushel",  currency: "USD", isCents: true },
  milho:      { yahoo: "ZC=F", name: "Corn Futures",     exchange: "CBOT",  unit: "US¢/bu", unitFull: "US cents per bushel",  currency: "USD", isCents: true },
  cafe:       { yahoo: "KC=F", name: "Coffee C Futures", exchange: "ICE",   unit: "US¢/lb", unitFull: "US cents per pound",   currency: "USD", isCents: true },
  algodao:    { yahoo: "CT=F", name: "Cotton Futures",   exchange: "ICE",   unit: "US¢/lb", unitFull: "US cents per pound",   currency: "USD", isCents: true },
  trigo:      { yahoo: "ZW=F", name: "Wheat Futures",    exchange: "CBOT",  unit: "US¢/bu", unitFull: "US cents per bushel",  currency: "USD", isCents: true },
  "boi-gordo":{ yahoo: "LE=F", name: "Live Cattle",      exchange: "CME",   unit: "US¢/lb", unitFull: "US cents per pound",   currency: "USD", isCents: true },
};

interface ChartPoint {
  t: number;       // unix timestamp (seconds)
  date: string;    // ISO date YYYY-MM-DD
  close: number;   // close price in display units
  high: number | null;
  low: number | null;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "soja";
  const range = req.nextUrl.searchParams.get("range") || "3mo";
  const config = FUTURES_MAP[slug];
  if (!config) {
    return NextResponse.json({
      error: `Slug "${slug}" not supported. Available: ${Object.keys(FUTURES_MAP).join(", ")}`,
    }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.yahoo)}?interval=1d&range=${encodeURIComponent(range)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: "No chart data returned" }, { status: 502 });
    }

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const closes: (number | null)[] = quote.close || [];
    const highs: (number | null)[] = quote.high || [];
    const lows: (number | null)[] = quote.low || [];

    // Yahoo reports grain futures in "USX" (US cents). Display values stay in cents
    // since the user asked for "US$ per bushel" — but the standard CME quote IS
    // in cents/bushel (e.g. ZS = 1167.00 cents = $11.67/bu). We keep cents/bu
    // for grains and cents/lb for soft commodities, matching CME conventions.

    const points: ChartPoint[] = timestamps.map((t, i) => {
      const close = closes[i];
      if (close === null || close === undefined) return null;
      return {
        t,
        date: new Date(t * 1000).toISOString().slice(0, 10),
        close,
        high: highs[i] ?? null,
        low: lows[i] ?? null,
      };
    }).filter((p): p is ChartPoint => p !== null);

    if (points.length === 0) {
      return NextResponse.json({ error: "No valid data points" }, { status: 502 });
    }

    // Daily change = last point vs second-to-last point in the time series.
    // Note: Yahoo's `chartPreviousClose` field is the close BEFORE the first
    // data point in the requested range — that's the period return (e.g.
    // 3-month return for range=3mo), not the daily change. Don't use it.
    const lastPoint = points[points.length - 1];
    const prevPoint = points.length >= 2 ? points[points.length - 2] : lastPoint;
    const lastPrice = result.meta?.regularMarketPrice ?? lastPoint.close;
    const prevClose = prevPoint.close;
    const change = lastPrice - prevClose;
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    // Period return (for context)
    const firstPoint = points[0];
    const periodChange = lastPrice - firstPoint.close;
    const periodChangePct = firstPoint.close !== 0 ? (periodChange / firstPoint.close) * 100 : 0;

    return NextResponse.json({
      success: true,
      slug,
      symbol: config.yahoo,
      name: config.name,
      exchange: config.exchange,
      unit: config.unit,
      unitFull: config.unitFull,
      currency: config.currency,
      lastPrice,
      prevClose,
      change,
      changePct,
      periodChange,
      periodChangePct,
      range,
      regularMarketTime: result.meta?.regularMarketTime,
      fiftyTwoWeekHigh: result.meta?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: result.meta?.fiftyTwoWeekLow,
      points,
      tradingViewLink: `https://www.tradingview.com/symbols/${config.exchange}-${config.yahoo.replace("=F", "1!")}/`,
      yahooLink: `https://finance.yahoo.com/quote/${encodeURIComponent(config.yahoo)}`,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: `Fetch failed: ${err.message?.slice(0, 200) || "unknown"}`,
    }, { status: 502 });
  }
}
