/**
 * Company name matcher for OneNote import.
 *
 * Matches raw company names from the parsed DOCX against legal_entities
 * using exact + Jaro-Winkler fuzzy matching. No LLM.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────

export type MatchTier = "exact" | "likely" | "uncertain" | "unmatched";

export interface CompanyCandidate {
  entity_uid: string;
  display_name: string;
  legal_name: string | null;
  score: number;
}

export interface CompanyMatch {
  rawName: string;
  confidence: number;
  tier: MatchTier;
  candidates: CompanyCandidate[];
  selectedEntityUid: string | null;
  meetingCount: number;
}

// ─── Normalization ────────────────────────────────────────────────────

const SUFFIX_RE = /\b(ltda|s\.?a\.?|eireli|me|epp|ss|s\/s|s\/a|comercio|com[eé]rcio|ind[uú]stria|industria|agr[ií]cola|agricola|agroneg[oó]cio|agronegocio|do\s+brasil)\b/g;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(SUFFIX_RE, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Jaro-Winkler ─────────────────────────────────────────────────────

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const j = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return j + prefix * p * (1 - j);
}

// ─── Matcher ──────────────────────────────────────────────────────────

function tierFromScore(score: number): MatchTier {
  if (score >= 0.95) return "exact";
  if (score >= 0.70) return "likely";
  if (score >= 0.40) return "uncertain";
  return "unmatched";
}

interface EntityRow {
  entity_uid: string;
  display_name: string | null;
  legal_name: string | null;
}

export async function matchCompanies(
  supabase: SupabaseClient,
  rawNames: string[],
  meetingCountMap: Map<string, number>,
): Promise<CompanyMatch[]> {
  // Load all legal entities (paginate past PostgREST 1000 cap)
  const entities: EntityRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase
      .from("legal_entities")
      .select("entity_uid, display_name, legal_name")
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    entities.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Build normalized lookup: normalized_name → entity
  const exactLookup = new Map<string, EntityRow>();
  const normalizedEntities: { entity: EntityRow; normDisplay: string; normLegal: string }[] = [];
  for (const e of entities) {
    const nd = normalize(e.display_name || "");
    const nl = normalize(e.legal_name || "");
    if (nd) exactLookup.set(nd, e);
    if (nl && nl !== nd) exactLookup.set(nl, e);
    normalizedEntities.push({ entity: e, normDisplay: nd, normLegal: nl });
  }

  const results: CompanyMatch[] = [];

  for (const raw of rawNames) {
    const norm = normalize(raw);
    const meetingCount = meetingCountMap.get(raw) || 0;

    // 1. Exact match
    const exact = exactLookup.get(norm);
    if (exact) {
      results.push({
        rawName: raw,
        confidence: 1.0,
        tier: "exact",
        candidates: [{ entity_uid: exact.entity_uid, display_name: exact.display_name || "", legal_name: exact.legal_name, score: 1.0 }],
        selectedEntityUid: exact.entity_uid,
        meetingCount,
      });
      continue;
    }

    // 2. Fuzzy match via Jaro-Winkler
    if (norm.length < 3) {
      results.push({ rawName: raw, confidence: 0, tier: "unmatched", candidates: [], selectedEntityUid: null, meetingCount });
      continue;
    }

    const scored: CompanyCandidate[] = [];
    for (const { entity, normDisplay, normLegal } of normalizedEntities) {
      const s1 = normDisplay ? jaroWinkler(norm, normDisplay) : 0;
      const s2 = normLegal ? jaroWinkler(norm, normLegal) : 0;
      const best = Math.max(s1, s2);
      if (best >= 0.40) {
        scored.push({ entity_uid: entity.entity_uid, display_name: entity.display_name || "", legal_name: entity.legal_name, score: best });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 5);
    const bestScore = top[0]?.score || 0;
    const tier = tierFromScore(bestScore);

    results.push({
      rawName: raw,
      confidence: bestScore,
      tier,
      candidates: top,
      selectedEntityUid: tier === "exact" || tier === "likely" ? top[0]?.entity_uid || null : null,
      meetingCount,
    });
  }

  // Sort: unmatched first (need attention), then uncertain, likely, exact
  const tierOrder: Record<MatchTier, number> = { unmatched: 0, uncertain: 1, likely: 2, exact: 3 };
  results.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.meetingCount - a.meetingCount);

  return results;
}
