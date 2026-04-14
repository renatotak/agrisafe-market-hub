import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { findIndustryDuplicates, mergeLegalEntity } from "@/lib/entity-merge";
import { logActivity } from "@/lib/activity-log";

/**
 * /api/industries/duplicates — review + merge industry dups.
 *
 * GET ?min_similarity=0.92 — list candidate pairs (canonical, dup,
 *     similarity, fk_counts). Sorted by reason (synthetic-vs-real
 *     first) then similarity desc.
 *
 * POST { canonical_uid, dup_uid, similarity?, reason? } — merge a
 *     single pair. Re-points FKs, deletes the dup, writes
 *     entity_merge_log + activity_log.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const sp = req.nextUrl.searchParams;
  const minSim = parseFloat(sp.get("min_similarity") || "0.92");
  const max = Math.min(Math.max(parseInt(sp.get("max") || "200", 10), 1), 1000);

  const candidates = await findIndustryDuplicates(supabase, { minSimilarity: minSim, max });

  // Group by reason for the UI summary strip
  const summary: Record<string, number> = {};
  for (const c of candidates) summary[c.reason] = (summary[c.reason] || 0) + 1;

  return NextResponse.json({
    candidates,
    total: candidates.length,
    summary,
    parameters: { min_similarity: minSim, max },
  });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const action = req.nextUrl.searchParams.get("action");

  // Bulk mode: re-run detection and merge every surfaced pair. Caller may
  // restrict to specific reasons (default: all reasons currently active in
  // the algorithm). Pairs that conflict with an earlier merge in this same
  // batch (e.g. canonical row already deleted) are skipped, not retried.
  if (action === "bulk") {
    const body = await req.json().catch(() => ({}));
    const minSim = parseFloat(body.min_similarity ?? "0.92");
    const reasonsAllowed: Set<string> | null = Array.isArray(body.reasons) && body.reasons.length > 0
      ? new Set(body.reasons)
      : null;
    const dryRun = body.dry_run === true;

    const candidates = await findIndustryDuplicates(supabase, { minSimilarity: minSim, max: 1000 });
    const eligible = reasonsAllowed
      ? candidates.filter((c) => reasonsAllowed.has(c.reason))
      : candidates;

    if (dryRun) {
      return NextResponse.json({ ok: true, dry_run: true, count: eligible.length, candidates: eligible });
    }

    let merged = 0;
    let skipped = 0;
    let failed = 0;
    let totalRepointed = 0;
    let totalConflicts = 0;
    const errors: string[] = [];
    const merged_pairs: Array<{ canonical_uid: string; dup_uid: string; reason: string }> = [];

    // Track which uids have already been deleted in this batch so we can
    // short-circuit subsequent pairs that point at them.
    const deleted = new Set<string>();

    for (const cand of eligible) {
      if (deleted.has(cand.dup.entity_uid) || deleted.has(cand.canonical.entity_uid)) {
        skipped++;
        continue;
      }
      const result = await mergeLegalEntity(supabase, cand.canonical.entity_uid, cand.dup.entity_uid, {
        similarity: cand.similarity,
        reason: cand.reason,
        performedBy: "admin:bulk",
      });
      if (result.ok || (Object.values(result.repointed).length > 0 && result.errors.length === 0)) {
        merged++;
        deleted.add(cand.dup.entity_uid);
        totalRepointed += Object.values(result.repointed).reduce((s, n) => s + n, 0);
        totalConflicts += Object.values(result.skipped).reduce((s, n) => s + n, 0);
        merged_pairs.push({ canonical_uid: cand.canonical.entity_uid, dup_uid: cand.dup.entity_uid, reason: cand.reason });
      } else {
        failed++;
        errors.push(`${cand.dup.entity_uid.slice(0, 8)} → ${cand.canonical.entity_uid.slice(0, 8)}: ${result.errors.join("; ") || "unknown"}`);
      }
    }

    await logActivity(supabase, {
      action: "delete",
      target_table: "legal_entities",
      source: "manual:industry_dedupe_bulk",
      source_kind: "manual",
      summary: `Bulk merge: ${merged} mescladas, ${skipped} ignoradas, ${failed} falharam · ${totalRepointed} FKs reapontadas, ${totalConflicts} conflitos`,
      metadata: { merged, skipped, failed, totalRepointed, totalConflicts, errors_count: errors.length, min_similarity: minSim, reasons: reasonsAllowed ? Array.from(reasonsAllowed) : "all" },
    });

    return NextResponse.json({
      ok: failed === 0,
      mode: "bulk",
      total_candidates: candidates.length,
      eligible: eligible.length,
      merged,
      skipped,
      failed,
      total_repointed: totalRepointed,
      total_conflicts: totalConflicts,
      errors: errors.slice(0, 50),
      merged_pairs,
    });
  }

  // Single-pair mode (existing behavior)
  const body = await req.json().catch(() => ({}));
  const canonicalUid = String(body.canonical_uid || "").trim();
  const dupUid = String(body.dup_uid || "").trim();
  if (!canonicalUid || !dupUid) {
    return NextResponse.json({ error: "canonical_uid and dup_uid required" }, { status: 400 });
  }

  const result = await mergeLegalEntity(supabase, canonicalUid, dupUid, {
    similarity: body.similarity,
    reason: body.reason || "manual",
    performedBy: "admin",
  });

  // Mirror the merge into activity_log so the Settings → Atividade panel
  // surfaces it next to other writes.
  await logActivity(supabase, {
    // No dedicated "merge" action in ActivityAction; "delete" reflects what
    // happens to the dup row, which is the side-effect surfaced in feeds.
    action: "delete",
    target_table: "legal_entities",
    target_id: canonicalUid,
    source: "manual:industry_dedupe",
    source_kind: "manual",
    summary: `Merged ${dupUid.slice(0, 8)}… → ${canonicalUid.slice(0, 8)}… · ${
      Object.values(result.repointed).reduce((s, n) => s + n, 0)
    } FKs repointed, ${
      Object.values(result.skipped).reduce((s, n) => s + n, 0)
    } conflicts resolved`,
    metadata: {
      canonical_uid: canonicalUid,
      dup_uid: dupUid,
      reason: result.repointed,
      skipped: result.skipped,
      errors: result.errors.length ? result.errors : undefined,
    },
  });

  return NextResponse.json(result);
}
