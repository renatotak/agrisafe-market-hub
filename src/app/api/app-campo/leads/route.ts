import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifyApiKey, logApiAccess, extractClientIp } from "@/lib/api-key-auth";

/**
 * GET /api/app-campo/leads — pipeline snapshot for the mobile rep.
 *
 *   ?owner=<name>          — filter by lead owner (free-text today)
 *   ?stage=<stage>         — filter by stage
 *   ?state=UF              — restrict to leads whose entity HQ is in UF
 *   ?entity_uid=UUID       — single entity
 *   ?include_lost=true     — include lost/dormant stages (default: excluded)
 *
 * Returns leads joined with entity display name + tax_id + roles.
 * Lost/dormant are hidden by default so the app shows actionable
 * pipeline only.
 */

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  const sp = request.nextUrl.searchParams;
  const owner = sp.get("owner");
  const stage = sp.get("stage");
  const state = (sp.get("state") || "").trim().toUpperCase() || null;
  const entityUid = sp.get("entity_uid");
  const includeLost = sp.get("include_lost") === "true";
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "200", 10), 1), 500);

  const supabase = createAdminClient();
  const hasKeyHeader = !!(request.headers.get("x-api-key") || request.headers.get("authorization"));
  const keyMeta = hasKeyHeader ? await verifyApiKey(supabase, request).catch(() => null) : null;
  if (hasKeyHeader && !keyMeta) {
    return NextResponse.json({ success: false, error: "Invalid or inactive API key" }, { status: 401 });
  }

  try {
    let q = supabase
      .from("leads")
      .select("id, entity_uid, stage, service_interest, estimated_value_brl, probability_pct, expected_close_date, owner, notes, updated_at, legal_entities(display_name, legal_name, tax_id)")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (entityUid) q = q.eq("entity_uid", entityUid);
    if (owner) q = q.eq("owner", owner);
    if (stage) q = q.eq("stage", stage);
    if (!includeLost) q = q.not("stage", "in", "(lost,dormant)");

    const { data, error } = await q;
    if (error) throw error;

    let rows = (data || []).map((r: any) => ({
      id: r.id,
      entity_uid: r.entity_uid,
      entity_name: r.legal_entities?.display_name || r.legal_entities?.legal_name || null,
      entity_tax_id: r.legal_entities?.tax_id || null,
      stage: r.stage,
      service_interest: r.service_interest,
      estimated_value_brl: r.estimated_value_brl,
      probability_pct: r.probability_pct,
      expected_close_date: r.expected_close_date,
      owner: r.owner,
      notes: r.notes,
      updated_at: r.updated_at,
    }));

    if (state) {
      const taxIds = Array.from(new Set(rows.map((r) => r.entity_tax_id).filter(Boolean))) as string[];
      if (taxIds.length > 0) {
        const { data: locs } = await supabase
          .from("retailer_locations")
          .select("cnpj_raiz, uf")
          .in("cnpj_raiz", taxIds)
          .eq("uf", state);
        const ufTaxIds = new Set((locs || []).map((l: any) => l.cnpj_raiz));
        rows = rows.filter((r) => r.entity_tax_id && ufTaxIds.has(r.entity_tax_id));
      } else {
        rows = [];
      }
    }

    if (keyMeta) {
      logApiAccess(supabase, {
        apiKeyId: keyMeta.id,
        endpoint: "/api/app-campo/leads",
        method: "GET",
        statusCode: 200,
        ip: extractClientIp(request),
        userAgent: request.headers.get("user-agent"),
        responseTimeMs: Date.now() - startMs,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      scope: { entity_uid: entityUid || null, owner, stage, state, include_lost: includeLost },
      count: rows.length,
      leads: rows,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message, count: 0, leads: [] }, { status: 500 });
  }
}
