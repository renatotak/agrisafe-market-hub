/**
 * Phase 24G2 — Activity log helper.
 *
 * Centralized writer for the `activity_log` table (migration 043).
 * Every cron route, manual API endpoint, and backfill script that
 * inserts/updates/deletes a row in a user-visible table should call
 * `logActivity()` after the write succeeds.
 *
 * The helper is FAIL-SOFT: if the activity_log insert errors out
 * (table doesn't exist, RLS blocks, etc.), the caller proceeds
 * normally. The activity log is observability, not source of truth.
 *
 * Two convenience helpers:
 *   - logActivity(supabase, entry)  — single record
 *   - logActivityBatch(supabase, entries) — many records in one round-trip
 *
 * Source naming convention:
 *   - cron scrapers:        'sync-cnj-atos', 'sync-cvm-agro', etc. (matches cron name)
 *   - manual API endpoints: 'manual:regulatory_upload', 'manual:rj_add', 'manual:crm_lead'
 *   - chrome extension:     'reading-room-extension'
 *   - backfill scripts:     'backfill:cvm-historical', 'backfill:cnpj-establishments'
 *   - system events:        'system:migration_apply', 'system:health_check'
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type ActivityAction = "insert" | "update" | "delete" | "upsert"
export type ActivitySourceKind = "cron" | "manual" | "extension" | "backfill" | "system"

export interface ActivityLogEntry {
  /** What kind of write happened */
  action: ActivityAction
  /** Target Supabase table name */
  target_table: string
  /** Stringified primary key of the affected row (uuid, text id, int) */
  target_id?: string | number | null
  /** Provenance label — see naming convention in the file header */
  source: string
  /** Source category (used for grouping in the UI) */
  source_kind: ActivitySourceKind
  /** Optional human label — shown as the headline in the activity feed */
  summary?: string | null
  /** Optional cron name / user email / 'system' */
  actor?: string | null
  /** Arbitrary additional context */
  metadata?: Record<string, unknown> | null
  /** Confidentiality tier override (defaults to 'public') */
  confidentiality?: "public" | "agrisafe_published" | "agrisafe_confidential" | "client_confidential"
}

export async function logActivity(
  supabase: SupabaseClient,
  entry: ActivityLogEntry,
): Promise<void> {
  try {
    await supabase.from("activity_log").insert({
      action: entry.action,
      target_table: entry.target_table,
      target_id: entry.target_id != null ? String(entry.target_id) : null,
      source: entry.source,
      source_kind: entry.source_kind,
      summary: entry.summary ?? null,
      actor: entry.actor ?? null,
      metadata: entry.metadata ?? {},
      confidentiality: entry.confidentiality ?? "public",
    })
  } catch (e) {
    // Fail soft — the activity log is observability, not the write path
    console.error("[activity-log] insert failed:", (e as Error).message)
  }
}

export async function logActivityBatch(
  supabase: SupabaseClient,
  entries: ActivityLogEntry[],
): Promise<void> {
  if (entries.length === 0) return
  try {
    await supabase.from("activity_log").insert(
      entries.map((e) => ({
        action: e.action,
        target_table: e.target_table,
        target_id: e.target_id != null ? String(e.target_id) : null,
        source: e.source,
        source_kind: e.source_kind,
        summary: e.summary ?? null,
        actor: e.actor ?? null,
        metadata: e.metadata ?? {},
        confidentiality: e.confidentiality ?? "public",
      })),
    )
  } catch (e) {
    console.error("[activity-log] batch insert failed:", (e as Error).message)
  }
}
