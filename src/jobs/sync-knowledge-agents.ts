/**
 * Backlog — Knowledge Agents.
 *
 * Cron-driven enrichment of entity_mentions beyond the inline
 * algorithmic matcher that runs during the news/events/norms sync jobs.
 *
 * Strategy (algorithm-first, per CLAUDE.md guardrail #1):
 *   1. Find source rows (agro_news, regulatory_norms, events) that have
 *      NO entity_mentions yet — the inline matcher either missed them
 *      or the legal_entities grew since the original run (e.g. 2,549
 *      CVM funds added in Phase 7d, 631 SICOR banks in Phase 7a).
 *   2. Re-run the same algorithmic matcher against these stale rows.
 *   3. Write any new matches via `writeEntityMentions`.
 *
 * LLM fallback is NOT used here — per guardrail #1, we prefer the
 * deterministic matcher. The `Backlog` note about "LLM enrichment" can
 * be enabled later by adding a second pass that calls Vertex AI on rows
 * that still have zero matches AFTER the algorithmic pass.
 *
 * Cadence: weekly Sunday 14:00 (after the week's CVM/SICOR imports).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "@/lib/sync-logger";
import { logActivity } from "@/lib/activity-log";
import {
  loadMatchableEntities,
  matchEntitiesInText,
  writeEntityMentions,
} from "@/lib/entity-matcher";
import type { JobResult } from "@/jobs/types";

const BATCH_SIZE = 200;

async function enrichTable(
  supabase: SupabaseClient,
  opts: {
    table: string;
    idCol: string;
    textCols: string[];
    entities: Awaited<ReturnType<typeof loadMatchableEntities>>;
  },
): Promise<{ scanned: number; enriched: number; mentionsAdded: number }> {
  // Find rows in `table` that have NO entity_mentions
  const { data: covered } = await supabase
    .from("entity_mentions")
    .select("source_id")
    .eq("source_table", opts.table)
    .limit(50000);

  const coveredIds = new Set((covered || []).map((r) => r.source_id));

  // Fetch rows not covered — page through to avoid 1000-row cap
  let scanned = 0;
  let enriched = 0;
  let mentionsAdded = 0;
  let from = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from(opts.table)
      .select([opts.idCol, ...opts.textCols].join(","))
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      console.error(`[knowledge-agents] ${opts.table} fetch error:`, error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as unknown as Record<string, unknown>[]) {
      const id = String(row[opts.idCol]);
      if (coveredIds.has(id)) continue;

      scanned++;

      const text = opts.textCols
        .map((c) => (row[c] ? String(row[c]) : ""))
        .join(" ");
      if (!text.trim()) continue;

      const matches = matchEntitiesInText(text, opts.entities);
      if (matches.length === 0) continue;

      const added = await writeEntityMentions(supabase, {
        entityUids: matches,
        sourceTable: opts.table,
        sourceId: id,
        mentionType: "mentioned",
        extractedBy: "knowledge_agents_v1",
      });

      enriched++;
      mentionsAdded += added;
    }

    if (rows.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return { scanned, enriched, mentionsAdded };
}

export async function runSyncKnowledgeAgents(supabase: SupabaseClient): Promise<JobResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  try {
    // Load entities once
    const entities = await loadMatchableEntities(supabase);
    if (entities.length === 0) {
      throw new Error("No matchable entities loaded");
    }

    // Enrich each target table
    const newsStats = await enrichTable(supabase, {
      table: "agro_news",
      idCol: "id",
      textCols: ["title", "summary"],
      entities,
    });

    const normsStats = await enrichTable(supabase, {
      table: "regulatory_norms",
      idCol: "id",
      textCols: ["title", "summary", "body"],
      entities,
    });

    const eventsStats = await enrichTable(supabase, {
      table: "events",
      idCol: "id",
      textCols: ["name", "description_pt", "description_en", "source_name"],
      entities,
    });

    const totalScanned = newsStats.scanned + normsStats.scanned + eventsStats.scanned;
    const totalEnriched = newsStats.enriched + normsStats.enriched + eventsStats.enriched;
    const totalMentions = newsStats.mentionsAdded + normsStats.mentionsAdded + eventsStats.mentionsAdded;

    const finishedAt = new Date().toISOString();
    const status = errors.length === 0 ? "success" : totalMentions > 0 ? "partial" : "error";

    await logSync(supabase, {
      source: "sync-knowledge-agents",
      started_at: startedAt,
      finished_at: finishedAt,
      status,
      records_fetched: totalScanned,
      records_inserted: totalMentions,
      errors: errors.length,
      error_message: errors.length > 0 ? errors.join("; ") : undefined,
    }).catch(() => {});

    await logActivity(supabase, {
      action: "insert",
      source: "sync-knowledge-agents",
      source_kind: "cron",
      target_table: "entity_mentions",
      summary: `Knowledge Agents: scanned ${totalScanned} uncovered rows, enriched ${totalEnriched}, added ${totalMentions} mentions`,
      metadata: {
        entities_loaded: entities.length,
        news: newsStats,
        norms: normsStats,
        events: eventsStats,
      },
    }).catch(() => {});

    return {
      ok: status !== "error",
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      recordsFetched: totalScanned,
      recordsUpdated: totalMentions,
      errors,
      stats: {
        entities_loaded: entities.length,
        news: newsStats,
        norms: normsStats,
        events: eventsStats,
      },
    };
  } catch (e: any) {
    const finishedAt = new Date().toISOString();
    return {
      ok: false,
      status: "error",
      startedAt,
      finishedAt,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [...errors, e.message],
    };
  }
}
