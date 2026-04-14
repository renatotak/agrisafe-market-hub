import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Industry / legal_entity duplicate detection + merge.
 *
 * AGROFIT crawler created legal_entities rows with synthetic tax_ids
 * like "AGROFIT_<hash>" because at scrape time the manufacturer's CNPJ
 * wasn't known. A separate CSV import then created the proper rows
 * keyed by real CNPJ. Result: ~143 dup industries with the same
 * normalized name as a real-CNPJ counterpart.
 *
 * Detection is pure algorithm (Jaro-Winkler on a normalized name —
 * same recipe as onenote-company-matcher). Merge is a deterministic
 * FK rewrite + delete, recorded in entity_merge_log for audit.
 *
 * No LLM. Guardrail #1 (algorithms first).
 */

// ─── Name normalization ──────────────────────────────────────

const SUFFIX_RE = /\b(ltda|s\.?a\.?|eireli|me|epp|ss|s\/s|s\/a|comercio|com[eé]rcio|ind[uú]stria|industria|agr[ií]cola|agricola|agroneg[oó]cio|agronegocio|do\s+brasil|brasil)\b/g;

export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(SUFFIX_RE, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Jaro-Winkler ────────────────────────────────────────────

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const s1m = new Array(len1).fill(false);
  const s2m = new Array(len2).fill(false);
  let matches = 0;
  let trans = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue;
      s1m[i] = true; s2m[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1m[i]) continue;
    while (!s2m[k]) k++;
    if (s1[i] !== s2[k]) trans++;
    k++;
  }
  return (matches / len1 + matches / len2 + (matches - trans / 2) / matches) / 3;
}

export function jaroWinkler(a: string, b: string, p = 0.1): number {
  const j = jaro(a, b);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
    if (a[i] === b[i]) prefix++; else break;
  }
  return j + prefix * p * (1 - j);
}

// ─── Duplicate detection ─────────────────────────────────────

export interface EntityRow {
  entity_uid: string;
  tax_id: string | null;
  display_name: string | null;
  legal_name: string | null;
}

export interface DupCandidate {
  canonical: EntityRow;     // row with real CNPJ + richer metadata
  dup: EntityRow;           // synthetic AGROFIT_ row (or weaker variant)
  similarity: number;
  reason: string;
  // Per-table FK row counts so the user sees blast radius before merging.
  fk_counts_dup: Record<string, number>;
  fk_counts_canonical: Record<string, number>;
}

const SYNTHETIC_PREFIX = "AGROFIT_";

function isSynthetic(taxId: string | null): boolean {
  return !!taxId && taxId.startsWith(SYNTHETIC_PREFIX);
}

/** Key a row's "completeness" so we can pick the canonical winner deterministically. */
function completeness(r: EntityRow): number {
  let s = 0;
  if (r.tax_id && !isSynthetic(r.tax_id)) s += 100;     // real CNPJ wins above all
  if (r.display_name) s += 1;
  if (r.legal_name) s += 1;
  return s;
}

/**
 * Find dup candidates among entities that carry the 'industry' role.
 * Strategy:
 *   1. Pull every legal_entity that has role_type='industry'.
 *   2. Normalize names → bucket by normalized key.
 *   3. Within each bucket of >1 row, pair the synthetic AGROFIT_ rows
 *      against the real-CNPJ rows. If no real-CNPJ row exists in the
 *      bucket, still surface synthetic-vs-synthetic pairs above the
 *      Jaro-Winkler threshold (rare but possible).
 *   4. Score each pair, attach FK counts, return sorted by similarity.
 */
export async function findIndustryDuplicates(
  supabase: SupabaseClient,
  opts: { minSimilarity?: number; max?: number } = {},
): Promise<DupCandidate[]> {
  const minSim = opts.minSimilarity ?? 0.92;
  const cap = opts.max ?? 500;

  // 1. Industry entities
  const { data: roles } = await supabase
    .from("entity_roles")
    .select("entity_uid")
    .eq("role_type", "industry");
  const uids = (roles || []).map((r: any) => r.entity_uid);
  if (uids.length === 0) return [];

  const entities: EntityRow[] = [];
  for (let i = 0; i < uids.length; i += 200) {
    const slice = uids.slice(i, i + 200);
    const { data } = await supabase
      .from("legal_entities")
      .select("entity_uid, tax_id, display_name, legal_name")
      .in("entity_uid", slice);
    if (data) entities.push(...(data as EntityRow[]));
  }

  // 2. Bucket by normalized name (display_name first, fall back to legal_name)
  const buckets = new Map<string, EntityRow[]>();
  for (const e of entities) {
    const n = normalizeName(e.display_name) || normalizeName(e.legal_name);
    if (!n) continue;
    if (!buckets.has(n)) buckets.set(n, []);
    buckets.get(n)!.push(e);
  }

  // 3. Generate candidate pairs
  const pairs: { a: EntityRow; b: EntityRow; score: number; reason: string }[] = [];
  for (const [, rows] of buckets) {
    if (rows.length < 2) {
      // Still try fuzzy pairing within this single-row bucket against
      // others — but that's O(N²). Skip for now: exact-normalized hits
      // catch the AGROFIT vs CSV case 1:1.
      continue;
    }
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        const reason = isSynthetic(a.tax_id) || isSynthetic(b.tax_id)
          ? "agrofit_synthetic_vs_real"
          : "exact_normalized_name";
        pairs.push({ a, b, score: 1, reason });
      }
    }
  }

  // 4. Add fuzzy pairs across buckets that have a synthetic row
  // (catches "Vittia" vs "Vittia Brasil" type variations).
  const synthetics = entities.filter((e) => isSynthetic(e.tax_id));
  const reals = entities.filter((e) => !isSynthetic(e.tax_id));
  const seenPair = new Set<string>(pairs.map((p) => keyPair(p.a, p.b)));
  for (const s of synthetics) {
    const sn = normalizeName(s.display_name) || normalizeName(s.legal_name);
    if (!sn) continue;
    for (const r of reals) {
      const k = keyPair(s, r);
      if (seenPair.has(k)) continue;
      const rn = normalizeName(r.display_name) || normalizeName(r.legal_name);
      if (!rn) continue;
      const score = jaroWinkler(sn, rn);
      if (score >= minSim) {
        pairs.push({ a: s, b: r, score, reason: "fuzzy_jaro_winkler" });
        seenPair.add(k);
      }
    }
  }

  // 5. Placeholder-vs-real CNPJ pairing.
  //   The original 18 curated brand profiles created legal_entities rows
  //   with NO tax_id (e.g. display_name="Syngenta") that hold the curated
  //   slug. AGROFIT/CSV imports later created the real RF row with the
  //   official razão social ("SYNGENTA PROTECAO DE CULTIVOS LTDA"). The
  //   names share a stem but Jaro-Winkler scores them under 0.92 — so
  //   they slip past the fuzzy check. Catch them with a stem-prefix rule:
  //   placeholder's normalized name must be a prefix or substring of the
  //   real entity's normalized name.
  const placeholders = entities.filter((e) => !e.tax_id);   // no CNPJ at all
  const realsWithCnpj = entities.filter((e) => e.tax_id && !isSynthetic(e.tax_id));
  for (const p of placeholders) {
    // Try both name variants — the curated placeholders sometimes
    // carry a brand-style display_name ("Bayer CropScience") and a
    // shorter legal_name ("BAYER") that's actually the prefix the
    // real RF rows start with. Use whichever produces a containment
    // match, prefer the SHORTER stem first so we hug the real names.
    const pNames = Array.from(new Set([
      normalizeName(p.legal_name),
      normalizeName(p.display_name),
    ].filter((s) => s && s.length >= 3))).sort((a, b) => a.length - b.length);
    if (pNames.length === 0) continue;
    let best: { entity: EntityRow; score: number } | null = null;
    for (const pn of pNames) {
      for (const r of realsWithCnpj) {
        const rn = normalizeName(r.display_name) || normalizeName(r.legal_name);
        if (!rn) continue;
        const isPrefix = rn.startsWith(pn + " ") || rn === pn;
        const isContained = rn.includes(" " + pn + " ") || rn.endsWith(" " + pn);
        if (!isPrefix && !isContained) continue;
        const score = pn.length / rn.length;
        if (!best || score > best.score) best = { entity: r, score };
      }
      if (best) break; // first stem that matches wins
    }
    if (!best) continue;
    const k = keyPair(p, best.entity);
    if (seenPair.has(k)) continue;
    pairs.push({ a: p, b: best.entity, score: best.score, reason: "placeholder_vs_real_cnpj" });
    seenPair.add(k);
  }

  // 5. Resolve canonical winner per pair
  const draft: { canonical: EntityRow; dup: EntityRow; similarity: number; reason: string }[] = [];
  for (const p of pairs) {
    const [canonical, dup] = completeness(p.a) >= completeness(p.b) ? [p.a, p.b] : [p.b, p.a];
    if (canonical.entity_uid === dup.entity_uid) continue;
    draft.push({ canonical, dup, similarity: p.score, reason: p.reason });
  }

  // 6. Bulk-fetch FK counts in one query per table (with all dup + canonical
  // uids in a single IN clause). Way faster than 22 queries per candidate.
  const allUids = Array.from(new Set(draft.flatMap((d) => [d.canonical.entity_uid, d.dup.entity_uid])));
  const counts = await bulkFkCounts(supabase, allUids);

  const out: DupCandidate[] = draft.map((d) => ({
    canonical: d.canonical,
    dup: d.dup,
    similarity: d.similarity,
    reason: d.reason,
    fk_counts_dup: counts.get(d.dup.entity_uid) || {},
    fk_counts_canonical: counts.get(d.canonical.entity_uid) || {},
  }));

  // Sort: synthetic-vs-real first (cleanest merges), then by similarity desc
  out.sort((a, b) => {
    const aSyn = a.reason === "agrofit_synthetic_vs_real" ? 1 : 0;
    const bSyn = b.reason === "agrofit_synthetic_vs_real" ? 1 : 0;
    if (aSyn !== bSyn) return bSyn - aSyn;
    return b.similarity - a.similarity;
  });

  return out.slice(0, cap);
}

function keyPair(a: EntityRow, b: EntityRow): string {
  return [a.entity_uid, b.entity_uid].sort().join("|");
}

// ─── FK counts (preview blast radius) ────────────────────────

const FK_TABLES: Array<{ table: string; column: string }> = [
  { table: "industries",          column: "entity_uid" },                  // mig 061 — curated brand profile link
  { table: "industry_products",  column: "manufacturer_entity_uid" },
  { table: "retailer_industries", column: "industry_entity_uid" },
  { table: "retailer_industries", column: "retailer_entity_uid" },
  { table: "entity_roles",       column: "entity_uid" },
  { table: "entity_mentions",    column: "entity_uid" },
  { table: "key_persons",        column: "entity_uid" },
  { table: "meetings",           column: "entity_uid" },
  { table: "leads",              column: "entity_uid" },
  { table: "company_enrichment", column: "entity_uid" },
  { table: "company_notes",      column: "entity_uid" },
  { table: "company_research",   column: "entity_uid" },
  { table: "competitors",        column: "entity_uid" },
  { table: "retailers",          column: "entity_uid" },
  { table: "retailer_intelligence", column: "entity_uid" },
  { table: "recuperacao_judicial", column: "entity_uid" },
  { table: "asset_parties",      column: "entity_uid" },
  { table: "farm_ownership",     column: "entity_uid" },
  { table: "group_members",      column: "entity_uid" },
  { table: "chat_threads",       column: "entity_uid" },
  { table: "chat_messages",      column: "entity_uid" },
  { table: "campaign_sends",     column: "entity_uid" },
  { table: "entity_features",    column: "entity_uid" },
];

async function fkCounts(supabase: SupabaseClient, uid: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(FK_TABLES.map(async ({ table, column }) => {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(column, uid);
    if (count && count > 0) out[`${table}.${column}`] = count;
  }));
  return out;
}

/**
 * Fetch FK counts for many uids in batched queries (one per FK table,
 * select `column` with rows for all uids, then count client-side).
 * Far cheaper than 22 head:'exact' counts per uid.
 */
async function bulkFkCounts(
  supabase: SupabaseClient,
  uids: string[],
): Promise<Map<string, Record<string, number>>> {
  const result = new Map<string, Record<string, number>>();
  for (const uid of uids) result.set(uid, {});
  if (uids.length === 0) return result;

  await Promise.all(FK_TABLES.map(async ({ table, column }) => {
    // Paginate past the PostgREST 1000-row cap — chat_messages can blow it
    // for a single popular entity, but in practice industry entities have
    // tiny FK fan-outs. 5k is a safe ceiling.
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .in(column, uids)
      .limit(5000);
    if (error || !data) return;
    for (const row of data as any[]) {
      const v = row[column];
      if (!v) continue;
      const bucket = result.get(v);
      if (!bucket) continue;
      const key = `${table}.${column}`;
      bucket[key] = (bucket[key] || 0) + 1;
    }
  }));

  return result;
}

// ─── Merge ───────────────────────────────────────────────────

export interface MergeResult {
  ok: boolean;
  canonical_uid: string;
  dup_uid: string;
  repointed: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
  log_id?: string;
}

/**
 * Merge `dupUid` into `canonicalUid`:
 *   1. Snapshot both rows for entity_merge_log.
 *   2. Re-point every FK column from dup → canonical.
 *      Some tables have unique constraints (entity_roles PK, etc.)
 *      that can fail — those rows are deleted from the dup side
 *      instead, since the canonical already carries the equivalent.
 *   3. Delete the dup legal_entities row.
 *   4. Write the audit log.
 *
 * Wraps everything in a single SQL transaction would be ideal but
 * Supabase JS client doesn't expose explicit transactions. We accept
 * eventual consistency: if a step partway fails, the audit log row
 * still records what got repointed and what didn't.
 */
export async function mergeLegalEntity(
  supabase: SupabaseClient,
  canonicalUid: string,
  dupUid: string,
  opts: { performedBy?: string; reason?: string; similarity?: number } = {},
): Promise<MergeResult> {
  if (canonicalUid === dupUid) {
    return {
      ok: false, canonical_uid: canonicalUid, dup_uid: dupUid,
      repointed: {}, skipped: {}, errors: ["canonical and dup are the same row"],
    };
  }

  // Snapshot
  const { data: canonRow } = await supabase
    .from("legal_entities").select("*").eq("entity_uid", canonicalUid).maybeSingle();
  const { data: dupRow } = await supabase
    .from("legal_entities").select("*").eq("entity_uid", dupUid).maybeSingle();
  if (!canonRow) return { ok: false, canonical_uid: canonicalUid, dup_uid: dupUid, repointed: {}, skipped: {}, errors: ["canonical row not found"] };
  if (!dupRow)   return { ok: false, canonical_uid: canonicalUid, dup_uid: dupUid, repointed: {}, skipped: {}, errors: ["dup row not found"] };

  const repointed: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const errors: string[] = [];

  for (const { table, column } of FK_TABLES) {
    // Skip self-row tables that need special handling
    if (table === "legal_entities") continue;
    try {
      // Try the bulk re-point
      const { data: updated, error } = await supabase
        .from(table)
        .update({ [column]: canonicalUid })
        .eq(column, dupUid)
        .select(column);
      if (error) {
        // Likely a unique-constraint violation — fall back to per-row
        // re-point with conflict tolerance: try each row, on conflict
        // delete it (canonical already has the equivalent row).
        const fallback = await perRowRepoint(supabase, table, column, dupUid, canonicalUid);
        repointed[`${table}.${column}`] = fallback.repointed;
        if (fallback.deleted > 0) skipped[`${table}.${column}`] = fallback.deleted;
        if (fallback.error) errors.push(`${table}.${column}: ${fallback.error}`);
      } else if (updated && updated.length > 0) {
        repointed[`${table}.${column}`] = updated.length;
      }
    } catch (e: any) {
      errors.push(`${table}.${column}: ${e.message}`);
    }
  }

  // Delete the dup
  const { error: delErr } = await supabase.from("legal_entities").delete().eq("entity_uid", dupUid);
  if (delErr) errors.push(`delete legal_entities: ${delErr.message}`);

  // Audit log (best-effort — we don't want a logging failure to mask the merge)
  let logId: string | undefined;
  try {
    const { data: log } = await supabase.from("entity_merge_log").insert({
      canonical_uid: canonicalUid,
      dup_uid: dupUid,
      canonical_snapshot: canonRow,
      dup_snapshot: dupRow,
      similarity: opts.similarity ?? null,
      reason: opts.reason || "manual",
      repointed,
      skipped,
      performed_by: opts.performedBy || "admin",
    }).select("id").maybeSingle();
    logId = log?.id;
  } catch { /* ignore */ }

  return { ok: errors.length === 0, canonical_uid: canonicalUid, dup_uid: dupUid, repointed, skipped, errors, log_id: logId };
}

/** Per-row fallback: try to update; if it errors (unique conflict), delete the dup row. */
async function perRowRepoint(
  supabase: SupabaseClient,
  table: string,
  column: string,
  dupUid: string,
  canonicalUid: string,
): Promise<{ repointed: number; deleted: number; error?: string }> {
  let repointed = 0;
  let deleted = 0;
  let lastError: string | undefined;
  // We need a stable per-row identifier. Most FK tables have an `id`
  // column; entity_roles uses (entity_uid, role_type); chat_participants
  // (thread_id, actor_kind, actor_ref). For unknown PKs we just attempt
  // a generic update and leave conflicts to surface in errors.
  const { data: rows } = await supabase.from(table).select("*").eq(column, dupUid);
  for (const row of rows || []) {
    const { error } = await supabase
      .from(table)
      .update({ [column]: canonicalUid })
      .match(rowKey(table, row));
    if (!error) {
      repointed++;
    } else {
      // Conflict — delete the dup row
      const { error: delErr } = await supabase.from(table).delete().match(rowKey(table, row));
      if (!delErr) deleted++;
      else lastError = delErr.message;
    }
  }
  return { repointed, deleted, error: lastError };
}

function rowKey(table: string, row: any): Record<string, any> {
  // Use composite PKs where they exist; fall back to id.
  if (table === "entity_roles")        return { entity_uid: row.entity_uid, role_type: row.role_type };
  if (table === "chat_participants")   return { thread_id: row.thread_id, actor_kind: row.actor_kind, actor_ref: row.actor_ref };
  if (table === "farm_ownership")      return { farm_uid: row.farm_uid, entity_uid: row.entity_uid, ownership_type: row.ownership_type };
  if (table === "asset_parties")       return { asset_uid: row.asset_uid, entity_uid: row.entity_uid, party_role: row.party_role };
  if (table === "group_members")       return { group_uid: row.group_uid, entity_uid: row.entity_uid };
  if (table === "entity_features")     return { entity_uid: row.entity_uid };
  // Generic id-based PK
  if ("id" in row && row.id != null)   return { id: row.id };
  // Last resort — match all columns we have
  return row;
}
