import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/crm/similar-targets?entity_uid=<uuid>
 *
 * Pure-algorithm similarity search over v_entity_crm_profile (mig 056).
 * Given a seed entity, return the top N other entities whose competitor_tech
 * and service_interest tag sets overlap the seed, ranked by weighted
 * Jaccard similarity. Zero LLM — guardrail #1.
 *
 *   similarity = 0.6 * jaccard(competitor_tech)
 *              + 0.4 * jaccard(service_interest)
 *              + role-match boost (+0.10 if any entity_role overlaps)
 *
 * Query params:
 *   entity_uid   — required, seed entity
 *   limit        — default 10, max 50
 *   min_score    — default 0.10, skip anything below
 *   same_role    — "true" → require at least one shared entity_role
 *                   (e.g. only suggest retailers when the seed is a retailer)
 *
 * Returns: [{ entity_uid, display_name, score, shared_tech, shared_service,
 *             roles, meeting_count, last_meeting_date, lead_stage }]
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function jaccard(a: string[] | null, b: string[] | null): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const v of setA) if (setB.has(v)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function sharedItems(a: string[] | null, b: string[] | null): string[] {
  if (!a || !b) return [];
  const setB = new Set(b);
  return a.filter((v) => setB.has(v));
}

interface Profile {
  entity_uid: string;
  display_name: string | null;
  legal_name: string | null;
  meeting_count: number;
  last_meeting_date: string | null;
  competitor_tech_tags: string[] | null;
  service_interest_tags: string[] | null;
  mood_counts: Record<string, number> | null;
  key_person_count: number;
  lead_stage: string | null;
  lead_service_interest: string | null;
  lead_estimated_value_brl: number | null;
  roles: string[] | null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const seedUid = sp.get("entity_uid");
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "10", 10), 1), 50);
  const minScore = Math.max(parseFloat(sp.get("min_score") || "0.10"), 0);
  const sameRole = sp.get("same_role") === "true";

  if (!seedUid) {
    return NextResponse.json({ error: "entity_uid required" }, { status: 400 });
  }

  // Seed profile
  const { data: seed, error: seedErr } = await supabaseAdmin
    .from("v_entity_crm_profile")
    .select("*")
    .eq("entity_uid", seedUid)
    .maybeSingle();

  if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 });
  if (!seed) {
    return NextResponse.json({
      seed: null,
      matches: [],
      note: "Seed entity has no CRM footprint (no meetings, key persons, or leads). Similarity search needs at least one meeting or tag.",
    });
  }

  const seedProfile = seed as unknown as Profile;
  const seedTech = seedProfile.competitor_tech_tags || [];
  const seedService = seedProfile.service_interest_tags || [];
  const seedRoles = seedProfile.roles || [];

  // If the seed has no tags AND no roles there's nothing to match on.
  if (seedTech.length === 0 && seedService.length === 0 && seedRoles.length === 0) {
    return NextResponse.json({
      seed: seedProfile,
      matches: [],
      note: "Seed entity has no competitor_tech / service_interest tags and no roles — nothing to match on yet. Log meetings with tags to enable similarity search.",
    });
  }

  // Candidate pool — paginate past the PostgREST 1000-row cap.
  const candidates: Profile[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabaseAdmin
      .from("v_entity_crm_profile")
      .select("*")
      .neq("entity_uid", seedUid)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    candidates.push(...(data as unknown as Profile[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Score every candidate
  const scored = candidates
    .map((c) => {
      const tech = c.competitor_tech_tags || [];
      const service = c.service_interest_tags || [];
      const roles = c.roles || [];
      const jTech = jaccard(seedTech, tech);
      const jService = jaccard(seedService, service);
      const roleOverlap = sharedItems(seedRoles, roles);
      const roleBoost = roleOverlap.length > 0 ? 0.10 : 0;
      const score = 0.6 * jTech + 0.4 * jService + roleBoost;

      return {
        entity_uid: c.entity_uid,
        display_name: c.display_name,
        legal_name: c.legal_name,
        score,
        j_tech: jTech,
        j_service: jService,
        shared_tech: sharedItems(seedTech, tech),
        shared_service: sharedItems(seedService, service),
        shared_roles: roleOverlap,
        roles,
        meeting_count: c.meeting_count,
        last_meeting_date: c.last_meeting_date,
        key_person_count: c.key_person_count,
        lead_stage: c.lead_stage,
        lead_service_interest: c.lead_service_interest,
        lead_estimated_value_brl: c.lead_estimated_value_brl,
      };
    })
    .filter((r) => r.score >= minScore)
    .filter((r) => !sameRole || r.shared_roles.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({
    seed: {
      entity_uid: seedProfile.entity_uid,
      display_name: seedProfile.display_name,
      competitor_tech_tags: seedTech,
      service_interest_tags: seedService,
      roles: seedRoles,
      meeting_count: seedProfile.meeting_count,
    },
    matches: scored,
    candidates_scanned: candidates.length,
  });
}
