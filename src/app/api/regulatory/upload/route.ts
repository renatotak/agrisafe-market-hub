import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyCnaes } from "@/lib/cnae-classifier";
import { logActivity } from "@/lib/activity-log";

/**
 * /api/regulatory/upload — manual norm submission (Phase 24C).
 *
 * The Marco Regulatório chapter is otherwise fed by the sync-regulatory
 * cron (3 legal RSS feeds → keyword-classified). This endpoint lets a
 * user manually insert a norm they've come across — typically pasted from
 * a Diário Oficial PDF, a regulator's site, or an article they've read.
 *
 * Storage decision: we don't host the PDF here. The user provides a URL
 * (the Diário Oficial / regulator landing page / law portal) and we store
 * that in `source_url`. This is consistent with how the cron-fed rows
 * already work, avoids needing a Supabase Storage bucket, and respects
 * Guardrail #3 (public data only). The user is on the hook for keeping
 * the upstream link alive.
 *
 * Auth: service-role only via the server-side client. The Settings page
 * is already a privileged surface (single-user app); when multi-user RBAC
 * lands, gate this with a bearer-token check.
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const VALID_BODIES = new Set(["CMN", "CVM", "BCB", "MAPA", "OUTROS"]);
const VALID_TYPES = new Set([
  "resolucao",
  "circular",
  "instrucao_normativa",
  "decreto",
  "medida_provisoria",
  "portaria",
  "outros",
]);
const VALID_IMPACT = new Set(["high", "medium", "low"]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Required fields
  const title = String(body.title || "").trim();
  const bodyName = String(body.body || "").trim().toUpperCase();
  const normType = String(body.norm_type || "").trim();
  const publishedAt = String(body.published_at || "").trim(); // ISO date

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!VALID_BODIES.has(bodyName)) {
    return NextResponse.json(
      { error: `body must be one of: ${Array.from(VALID_BODIES).join(", ")}` },
      { status: 400 },
    );
  }
  if (!VALID_TYPES.has(normType)) {
    return NextResponse.json(
      { error: `norm_type must be one of: ${Array.from(VALID_TYPES).join(", ")}` },
      { status: 400 },
    );
  }
  if (!publishedAt || !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
    return NextResponse.json({ error: "published_at must be ISO date YYYY-MM-DD" }, { status: 400 });
  }

  // Optional fields
  const normNumber = body.norm_number ? String(body.norm_number).trim() : null;
  const summary = body.summary ? String(body.summary).trim() : null;
  const effectiveAt = body.effective_at && /^\d{4}-\d{2}-\d{2}$/.test(body.effective_at) ? body.effective_at : null;
  const impact = VALID_IMPACT.has(body.impact_level) ? body.impact_level : "medium";
  const sourceUrl = body.source_url ? String(body.source_url).trim() : null;
  const affectedAreas = Array.isArray(body.affected_areas)
    ? body.affected_areas.map((a: any) => String(a).trim().toLowerCase()).filter(Boolean)
    : [];

  // Build a stable id: body_type_number_yyyymmdd_slug
  // Same scheme the cron uses, with a "manual:" prefix so a future audit
  // can tell hand-curated rows from RSS-classified ones.
  const id = `manual:${bodyName}_${normType}_${normNumber || "x"}_${publishedAt}_${slugify(title)}`.slice(0, 200);

  // Phase 24G2 — auto-classify affected CNAEs from title + summary + areas
  const affectedCnaes = classifyCnaes({ title, summary, affected_areas: affectedAreas });

  const row = {
    id,
    body: bodyName,
    norm_type: normType,
    norm_number: normNumber,
    title,
    summary,
    published_at: publishedAt,
    effective_at: effectiveAt,
    impact_level: impact,
    affected_areas: affectedAreas,
    affected_cnaes: affectedCnaes,
    source_url: sourceUrl,
  };

  const { data, error } = await supabaseAdmin
    .from("regulatory_norms")
    .upsert(row, { onConflict: "id" })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Phase 24G2 — log to activity feed (fail-soft)
  await logActivity(supabaseAdmin, {
    action: "upsert",
    target_table: "regulatory_norms",
    target_id: id,
    source: "manual:regulatory_upload",
    source_kind: "manual",
    summary: `${bodyName} ${normType} ${normNumber || ""} — ${title}`.slice(0, 200),
    metadata: { affected_areas: affectedAreas, affected_cnaes: affectedCnaes, impact: impact },
  });

  return NextResponse.json({ ok: true, norm: data });
}
