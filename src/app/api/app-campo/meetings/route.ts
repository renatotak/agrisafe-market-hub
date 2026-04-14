import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifyApiKey, logApiAccess, extractClientIp } from "@/lib/api-key-auth";

/**
 * GET /api/app-campo/meetings — meetings feed for field reps.
 *
 *   Default: upcoming meetings (next 30 days) across all entities the
 *   rep has access to. Optional filters narrow scope:
 *
 *     ?entity_uid=UUID   — meetings for a single company
 *     ?state=UF          — meetings whose entity HQ is in that UF
 *     ?from=YYYY-MM-DD   — override from-date
 *     ?to=YYYY-MM-DD     — override to-date
 *     ?days=N            — default window length when no explicit range
 *     ?include_past=true — include past meetings too
 *
 * Tier filter: only `public` + `agrisafe_published` by default. Set
 * `?include_confidential=true` AND pass a key with the right
 * permission to see confidential rows.
 *
 * Auth: optional `x-api-key`. Missing → anonymous (returns public +
 * published only). Invalid → 401.
 */

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  const sp = request.nextUrl.searchParams;
  const entityUid = sp.get("entity_uid");
  const state = (sp.get("state") || "").trim().toUpperCase() || null;
  const days = Math.min(Math.max(parseInt(sp.get("days") || "30", 10), 1), 180);
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "100", 10), 1), 500);
  const includePast = sp.get("include_past") === "true";
  const includeConfidential = sp.get("include_confidential") === "true";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + days);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);
  const from = sp.get("from") || (includePast ? null : todayStr);
  const to = sp.get("to") || (entityUid || state ? null : windowEndStr);

  const supabase = createAdminClient();
  const hasKeyHeader = !!(request.headers.get("x-api-key") || request.headers.get("authorization"));
  const keyMeta = hasKeyHeader ? await verifyApiKey(supabase, request).catch(() => null) : null;
  if (hasKeyHeader && !keyMeta) {
    return NextResponse.json({ success: false, error: "Invalid or inactive API key" }, { status: 401 });
  }

  try {
    // v_meetings_enriched already has entity_name + tag flattening.
    let q = supabase
      .from("v_meetings_enriched")
      .select("id, entity_uid, entity_name, entity_tax_id, entity_roles, meeting_date, meeting_type, attendees, agenda, summary, next_steps, outcome, source, confidentiality, competitor_tech, service_interest, mood")
      .order("meeting_date", { ascending: true })
      .limit(limit);

    if (entityUid) q = q.eq("entity_uid", entityUid);
    if (from) q = q.gte("meeting_date", from);
    if (to) q = q.lte("meeting_date", to);

    // Tier filter — default to public + agrisafe_published; only include
    // confidential rows when explicitly asked AND key is present.
    if (!(includeConfidential && keyMeta)) {
      q = q.in("confidentiality", ["public", "agrisafe_published"]);
    }

    const { data, error } = await q;
    if (error) throw error;

    let rows = data || [];

    // State filter → resolve to entity_uids whose matriz is in that UF.
    if (state) {
      const taxIds = Array.from(new Set(rows.map((r: any) => r.entity_tax_id).filter(Boolean)));
      if (taxIds.length > 0) {
        const { data: locs } = await supabase
          .from("retailer_locations")
          .select("cnpj_raiz, uf")
          .in("cnpj_raiz", taxIds)
          .eq("uf", state);
        const ufTaxIds = new Set((locs || []).map((l: any) => l.cnpj_raiz));
        rows = rows.filter((r: any) => r.entity_tax_id && ufTaxIds.has(r.entity_tax_id));
      } else {
        rows = [];
      }
    }

    if (keyMeta) {
      logApiAccess(supabase, {
        apiKeyId: keyMeta.id,
        endpoint: "/api/app-campo/meetings",
        method: "GET",
        statusCode: 200,
        ip: extractClientIp(request),
        userAgent: request.headers.get("user-agent"),
        responseTimeMs: Date.now() - startMs,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      scope: {
        entity_uid: entityUid || null,
        state,
        from,
        to,
        include_past: includePast,
        include_confidential: includeConfidential && !!keyMeta,
      },
      count: rows.length,
      meetings: rows,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message, count: 0, meetings: [] }, { status: 500 });
  }
}
