/**
 * Phase 28 — Price anomaly detection endpoint.
 *
 * Compares latest commodity_prices.change_24h against rolling stddev
 * from v_commodity_price_stats. Returns commodities where
 * |change| > threshold * stddev (default threshold = 2).
 *
 *   GET /api/price-anomalies              → current anomalies
 *   GET /api/price-anomalies?threshold=1.5 → lower threshold
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"

export const revalidate = 600

export async function GET(req: NextRequest) {
  const threshold = parseFloat(req.nextUrl.searchParams.get("threshold") || "2")
  const supabase = createAdminClient()

  const [{ data: prices }, { data: stats }] = await Promise.all([
    supabase.from("commodity_prices").select("id, name_pt, name_en, price, change_24h, unit"),
    supabase.from("v_commodity_price_stats").select("*"),
  ])

  if (!prices || !stats) {
    return NextResponse.json({ anomalies: [], threshold })
  }

  const statsMap = new Map(stats.map((s: any) => [s.commodity_id, s]))
  const anomalies: any[] = []

  for (const p of prices) {
    const s = statsMap.get(p.id)
    if (!s || !s.stddev_change || parseFloat(s.stddev_change) === 0) continue
    const change = parseFloat(p.change_24h || "0")
    const stddev = parseFloat(s.stddev_change)
    const sigma = Math.abs(change) / stddev
    if (sigma >= threshold) {
      anomalies.push({
        commodity: p.id,
        name_pt: p.name_pt,
        name_en: p.name_en,
        price: parseFloat(p.price),
        change_pct: change,
        avg_change: parseFloat(s.avg_change),
        stddev,
        sigma: Math.round(sigma * 10) / 10,
        unit: p.unit,
        obs_count: s.obs_count,
      })
    }
  }

  anomalies.sort((a, b) => b.sigma - a.sigma)
  return NextResponse.json({ anomalies, threshold })
}
