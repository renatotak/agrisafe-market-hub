import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/crm/meetings/by-entity
 *
 * Patient-record feed: one card per company, each holding the full
 * meeting list. Same filter vocabulary as /api/crm/meetings/feed so
 * toggling filters narrows both the entity list AND the meetings
 * inside each card.
 *
 * Strategy:
 *   1. Pull the filtered meetings from v_meetings_enriched (the same
 *      view the flat feed uses — filtering stays in one place).
 *   2. Group client-side per entity_uid, aggregate tags / mood /
 *      last-meeting / confidentiality mix.
 *   3. Join optional lead + key-person stats per entity via
 *      v_entity_crm_profile.
 *   4. Sort entities by the chosen key (last_meeting_date default).
 *   5. Paginate at the ENTITY level so a big company doesn't blow
 *      past the limit just because it has lots of meetings.
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Meeting {
  id: string;
  entity_uid: string;
  entity_name: string | null;
  entity_tax_id: string | null;
  entity_roles: string[] | null;
  meeting_date: string;
  meeting_type: string;
  attendees: string[] | null;
  agenda: string | null;
  summary: string | null;
  next_steps: string | null;
  outcome: string;
  source: string;
  confidentiality: string;
  competitor_tech: string[];
  service_interest: string[];
  financial_info: string | null;
  mood: string | null;
  plans: string | null;
  created_at: string;
  external_id: string | null;
}

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

  const sort = sp.get("sort") || "last_meeting_date";
  const dir = (sp.get("dir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "50", 10), 1), 500);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10), 0);

  // ─── 1. Pull filtered meetings ────────────────────────────
  // Use a generous hard cap — if a single filter combo returns > 10k
  // meetings the UX is broken anyway and pagination at the entity
  // level is what actually matters.
  let query = supabaseAdmin
    .from("v_meetings_enriched")
    .select(
      "id, entity_uid, entity_name, entity_tax_id, entity_roles, meeting_date, meeting_type, attendees, agenda, summary, next_steps, outcome, source, external_id, confidentiality, competitor_tech, service_interest, financial_info, mood, plans, created_at",
    )
    .order("meeting_date", { ascending: false })
    .limit(5000);

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

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const meetings = (data as unknown as Meeting[]) || [];

  // ─── 2. Group by entity ───────────────────────────────────
  type EntityBucket = {
    entity_uid: string;
    entity_name: string | null;
    entity_tax_id: string | null;
    entity_roles: string[];
    meetings: Meeting[];
    last_meeting_date: string | null;
    first_meeting_date: string | null;
    competitor_tech: Set<string>;
    service_interest: Set<string>;
    mood_counts: Record<string, number>;
    outcome_counts: Record<string, number>;
    confidentiality_counts: Record<string, number>;
    onenote_count: number;
  };

  const buckets = new Map<string, EntityBucket>();
  for (const m of meetings) {
    let b = buckets.get(m.entity_uid);
    if (!b) {
      b = {
        entity_uid: m.entity_uid,
        entity_name: m.entity_name,
        entity_tax_id: m.entity_tax_id,
        entity_roles: m.entity_roles || [],
        meetings: [],
        last_meeting_date: null,
        first_meeting_date: null,
        competitor_tech: new Set(),
        service_interest: new Set(),
        mood_counts: {},
        outcome_counts: {},
        confidentiality_counts: {},
        onenote_count: 0,
      };
      buckets.set(m.entity_uid, b);
    }
    b.meetings.push(m);
    if (!b.last_meeting_date || m.meeting_date > b.last_meeting_date) b.last_meeting_date = m.meeting_date;
    if (!b.first_meeting_date || m.meeting_date < b.first_meeting_date) b.first_meeting_date = m.meeting_date;
    for (const t of m.competitor_tech || []) b.competitor_tech.add(t);
    for (const s of m.service_interest || []) b.service_interest.add(s);
    if (m.mood) b.mood_counts[m.mood] = (b.mood_counts[m.mood] || 0) + 1;
    b.outcome_counts[m.outcome] = (b.outcome_counts[m.outcome] || 0) + 1;
    b.confidentiality_counts[m.confidentiality] = (b.confidentiality_counts[m.confidentiality] || 0) + 1;
    if (m.source === "onenote_import") b.onenote_count++;
  }

  // ─── 3. Attach lead + key-person stats ────────────────────
  const entityUids = Array.from(buckets.keys());
  const profiles = new Map<string, any>();
  if (entityUids.length > 0) {
    const { data: profRows } = await supabaseAdmin
      .from("v_entity_crm_profile")
      .select("entity_uid, key_person_count, lead_stage, lead_service_interest, lead_estimated_value_brl")
      .in("entity_uid", entityUids);
    for (const p of profRows || []) profiles.set((p as any).entity_uid, p);
  }

  // ─── 4. Sort entities ─────────────────────────────────────
  const entities = Array.from(buckets.values()).map((b) => {
    const prof = profiles.get(b.entity_uid) || {};
    return {
      entity_uid: b.entity_uid,
      entity_name: b.entity_name,
      entity_tax_id: b.entity_tax_id,
      entity_roles: b.entity_roles,
      meeting_count: b.meetings.length,
      last_meeting_date: b.last_meeting_date,
      first_meeting_date: b.first_meeting_date,
      competitor_tech: Array.from(b.competitor_tech).sort(),
      service_interest: Array.from(b.service_interest).sort(),
      mood_counts: b.mood_counts,
      outcome_counts: b.outcome_counts,
      confidentiality_counts: b.confidentiality_counts,
      onenote_count: b.onenote_count,
      key_person_count: prof.key_person_count || 0,
      lead_stage: prof.lead_stage || null,
      lead_service_interest: prof.lead_service_interest || null,
      lead_estimated_value_brl: prof.lead_estimated_value_brl || null,
      meetings: b.meetings.sort((x, y) => (x.meeting_date > y.meeting_date ? -1 : 1)),
    };
  });

  entities.sort((a, b) => {
    let va: any;
    let vb: any;
    switch (sort) {
      case "entity_name":
        va = (a.entity_name || "").toLowerCase();
        vb = (b.entity_name || "").toLowerCase();
        break;
      case "meeting_count":
        va = a.meeting_count; vb = b.meeting_count; break;
      case "first_meeting_date":
        va = a.first_meeting_date || ""; vb = b.first_meeting_date || ""; break;
      case "last_meeting_date":
      default:
        va = a.last_meeting_date || ""; vb = b.last_meeting_date || ""; break;
    }
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });

  // ─── 5. Tag catalog for filter chips (optional) ──────────
  let tagCatalog: { competitor_tech: string[]; service_interest: string[]; moods: string[] } | null = null;
  if (sp.get("with_tags") === "true") {
    const { data: profAll } = await supabaseAdmin
      .from("v_entity_crm_profile")
      .select("competitor_tech_tags, service_interest_tags, mood_counts");
    const techSet = new Set<string>();
    const serviceSet = new Set<string>();
    const moodSet = new Set<string>();
    for (const p of profAll || []) {
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

  const totalEntities = entities.length;
  const paged = entities.slice(offset, offset + limit);

  return NextResponse.json({
    entities: paged,
    total_entities: totalEntities,
    total_meetings: meetings.length,
    limit,
    offset,
    tag_catalog: tagCatalog,
  });
}
