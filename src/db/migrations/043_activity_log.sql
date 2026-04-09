-- ============================================================
-- Migration 043 — Activity log (Phase 24G2)
-- Depends on: nothing (additive, no FKs)
-- ============================================================
--
-- Per-record activity log. Captures every row added/edited across the
-- system regardless of source (cron scraper, manual UI insert, Chrome
-- extension, backfill script). Distinct from:
--
--   - sync_logs       — one row per cron RUN (totals only)
--   - scraper_runs    — one row per scraper run (telemetry, validation)
--   - scraper_knowledge — narrative failures + fixes
--
-- This table answers a different question: "what specific data was
-- added today, where did it come from, and where does it live?". The
-- user wants to browse the latest changes from Settings → Activity Log
-- to verify scrapers and crawlers are doing what they should.
--
-- Design decisions:
--
--   1. NO foreign keys to target tables. The `target_table` and
--      `target_id` columns are loose pointers because:
--      - target rows can be deleted (we want the log to outlive them)
--      - target_id type varies per table (uuid, text, int)
--   2. `source` is a free-text label (e.g. 'sync-cnj-atos',
--      'reading-room-extension', 'manual:regulatory_upload') so any
--      caller can stamp its own provenance without us having to
--      enumerate sources upfront.
--   3. `actor` is also free-text (cron / user email / 'system'). When
--      multi-user RBAC lands, populate from the auth session.
--   4. Indexed on (created_at desc) for the Settings → recent feed
--      and on (target_table, target_id) for "show me the history of
--      this specific row".
--   5. RLS public read so the Settings UI can fetch without elevated
--      auth; service-role write so only server-side code can append.
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What changed
  action          text NOT NULL                       -- 'insert' | 'update' | 'delete' | 'upsert'
                    CHECK (action IN ('insert','update','delete','upsert')),
  target_table    text NOT NULL,                      -- 'regulatory_norms' | 'agro_news' | 'leads' | ...
  target_id       text,                               -- string form so it covers uuid / text / int PKs
  -- Where it came from
  source          text NOT NULL,                      -- 'sync-cnj-atos' | 'reading-room-extension' | 'manual:regulatory_upload' | 'sync-agro-news' | ...
  source_kind     text NOT NULL DEFAULT 'cron'        -- 'cron' | 'manual' | 'extension' | 'backfill' | 'system'
                    CHECK (source_kind IN ('cron','manual','extension','backfill','system')),
  actor           text,                               -- cron name, user email, or null
  -- Optional context
  summary         text,                               -- 1-line description for the UI ("CNJ Provimento 216/2026")
  metadata        jsonb DEFAULT '{}'::jsonb,          -- arbitrary additional context (counts, diffs, error msgs)
  -- Confidentiality (Phase 24G alignment) — defaults to public so the
  -- Settings → Activity Log feed shows everything to logged-in users.
  -- A future RBAC layer can flip CRM-related rows to agrisafe_confidential.
  confidentiality text NOT NULL DEFAULT 'public'
                    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_target ON activity_log(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_source ON activity_log(source);
CREATE INDEX IF NOT EXISTS idx_activity_log_source_kind ON activity_log(source_kind);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read activity_log"
  ON activity_log FOR SELECT USING (true);

CREATE POLICY "Service role write activity_log"
  ON activity_log FOR INSERT WITH CHECK (true);

COMMENT ON TABLE activity_log IS
  'Phase 24G2 — per-record activity log for the Settings → Activity Log panel. Captures inserts/updates/deletes from crons, manual endpoints, the Chrome extension, and backfill scripts. Loose foreign keys (target_table + target_id text) so the log outlives target rows.';
