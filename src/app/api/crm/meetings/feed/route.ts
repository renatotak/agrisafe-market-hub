import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/crm/meetings/feed
 *
 * Cross-entity meeting log. Powers the "Reuniões" sidebar module so the
 * user can browse every meeting logged across every retailer / industry /
 * competitor in one place, filterable by date range, entity name,
 * meeting_type, outcome, mood, competitor_tech tag, service_interest tag,
 * and confidentiality tier.
 *
 * Reads v_meetings_enriched (mig 056) — that view already flattens the
 * meetings.metadata jsonb into real columns, so Postgres can actually
 * index + filter on tags rather than the UI re-parsing jsonb per row.
 *
 * Query params (all optional):
 *   q                — free-text ilike over entity_name / agenda / summary
 *   from / to        — meeting_date range (YYYY-MM-DD)
 *   type             — meeting_type (comercial / tecnica / ...)
 *   outcome          — pending / positive / neutral / negative
 *   mood             — positive / neutral / cautious / negative / excited
 *   tech             — competitor_tech tag (array contains)
 *   service          — service_interest tag (array contains)
 *   entity_uid       — scope to a single entity
 *   confidentiality  — public / agrisafe_published / agrisafe_confidential
 *   limit / offset   — pagination (default 25 / 0)
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || null;
  const from = sp.get("from");
  const to = sp.get("to");
  const type = sp.get("type");
  const outcome = sp.get("outcome");
  const mood = sp.get("mood");
  const tech = sp.get("tech");
  const service = sp.get("service");
  const entityUid = sp.get("entity_uid");
  const confidentiality = sp.get("confidentiality");
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "25", 10), 1), 200);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10), 0);

  // Sort — whitelist of allowed columns so callers can't inject
  const sortField = sp.get("sort") || "meeting_date";
  const sortDir = (sp.get("dir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const ALLOWED_SORTS = new Set([
    "meeting_date", "entity_name", "meeting_type", "outcome",
    "created_at", "mood", "confidentiality",
  ]);
  const effectiveSort = ALLOWED_SORTS.has(sortField) ? sortField : "meeting_date";

  let query = supabaseAdmin
    .from("v_meetings_enriched")
    .select(
      "id, entity_uid, entity_name, entity_tax_id, entity_roles, meeting_date, meeting_type, attendees, agenda, summary, next_steps, outcome, source, external_id, confidentiality, competitor_tech, service_interest, financial_info, mood, plans, created_at",
      { count: "exact" },
    )
    .order(effectiveSort, { ascending: sortDir === "asc", nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (entityUid) query = query.eq("entity_uid", entityUid);
  if (from) query = query.gte("meeting_date", from);
  if (to) query = query.lte("meeting_date", to);
  if (type) query = query.eq("meeting_type", type);
  if (outcome) query = query.eq("outcome", outcome);
  if (mood) query = query.eq("mood", mood);
  if (confidentiality) query = query.eq("confidentiality", confidentiality);
  if (tech) query = query.contains("competitor_tech", [tech]);
  if (service) query = query.contains("service_interest", [service]);
  if (q) {
    const esc = q.replace(/[%_]/g, "\\$&");
    query = query.or(`entity_name.ilike.%${esc}%,agenda.ilike.%${esc}%,summary.ilike.%${esc}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Surface the set of known tags so the UI can show chip suggestions
  // without a second roundtrip. Uses v_entity_crm_profile's aggregate
  // arrays — already deduped per entity, so unioning stays cheap.
  let tagCatalog: { competitor_tech: string[]; service_interest: string[]; moods: string[] } | null = null;
  if (sp.get("with_tags") === "true") {
    const { data: profiles } = await supabaseAdmin
      .from("v_entity_crm_profile")
      .select("competitor_tech_tags, service_interest_tags, mood_counts");
    const techSet = new Set<string>();
    const serviceSet = new Set<string>();
    const moodSet = new Set<string>();
    for (const p of profiles || []) {
      for (const t of (p as any).competitor_tech_tags || []) techSet.add(t);
      for (const t of (p as any).service_interest_tags || []) serviceSet.add(t);
      const counts = (p as any).mood_counts || {};
      for (const k of Object.keys(counts)) moodSet.add(k);
    }
    tagCatalog = {
      competitor_tech: Array.from(techSet).sort(),
      service_interest: Array.from(serviceSet).sort(),
      moods: Array.from(moodSet).sort(),
    };
  }

  return NextResponse.json({
    meetings: data || [],
    total: count || 0,
    limit,
    offset,
    tag_catalog: tagCatalog,
  });
}
