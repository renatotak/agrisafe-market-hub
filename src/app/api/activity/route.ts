/**
 * Phase 24G2 — /api/activity read endpoint.
 *
 * GET /api/activity                       → recent 50 entries (default)
 * GET /api/activity?limit=200             → up to 500
 * GET /api/activity?source_kind=manual    → filter by kind
 * GET /api/activity?target_table=leads    → filter by table
 * GET /api/activity?source=sync-cnj-atos  → filter by exact source
 *
 * Returns rows ordered by created_at desc. Tier-aware: filters out
 * agrisafe_confidential entries when the caller can't see them.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { resolveCallerTier, visibleTiers } from "@/lib/confidentiality"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50", 10), 500)
  const sourceKind = req.nextUrl.searchParams.get("source_kind")
  const targetTable = req.nextUrl.searchParams.get("target_table")
  const source = req.nextUrl.searchParams.get("source")

  const callerTier = await resolveCallerTier(supabaseAdmin, req)
  const visible = visibleTiers(callerTier)

  let query = supabaseAdmin
    .from("activity_log")
    .select("*")
    .in("confidentiality", visible)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (sourceKind) query = query.eq("source_kind", sourceKind)
  if (targetTable) query = query.eq("target_table", targetTable)
  if (source) query = query.eq("source", source)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggregate counts for the UI's filter chips
  const summary = {
    total: data?.length || 0,
    by_source_kind: {} as Record<string, number>,
    by_target_table: {} as Record<string, number>,
    by_action: {} as Record<string, number>,
  }
  for (const row of data || []) {
    summary.by_source_kind[row.source_kind] = (summary.by_source_kind[row.source_kind] || 0) + 1
    summary.by_target_table[row.target_table] = (summary.by_target_table[row.target_table] || 0) + 1
    summary.by_action[row.action] = (summary.by_action[row.action] || 0) + 1
  }

  return NextResponse.json({
    activities: data || [],
    summary,
    caller_tier: callerTier,
  })
}
