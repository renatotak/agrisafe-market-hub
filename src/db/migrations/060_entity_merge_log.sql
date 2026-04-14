-- ============================================================
-- Migration 060: entity_merge_log — audit trail for dup merges
-- ============================================================
-- Records every legal_entity merge so we can see who collapsed
-- which dup into which canonical, when, and which FK rows were
-- repointed vs skipped. Critical for undo (we can recover the
-- dup's identity from the log even after the row is gone).
-- ============================================================

CREATE TABLE IF NOT EXISTS entity_merge_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_uid   uuid NOT NULL,                          -- intentionally NOT a FK: the row may be later
  dup_uid         uuid NOT NULL,                          --   deleted/altered; we want history regardless
  canonical_snapshot jsonb NOT NULL,                      -- legal_entities row at merge time
  dup_snapshot    jsonb NOT NULL,
  similarity      numeric,                                 -- algorithm score that surfaced the pair
  reason          text,                                    -- 'agrofit_synthetic' | 'fuzzy_name' | 'manual'
  repointed       jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {"industry_products": 12, "meetings": 3, ...}
  skipped         jsonb NOT NULL DEFAULT '{}'::jsonb,      -- conflicts that needed manual care
  performed_by    text,                                    -- 'admin@agrisafe' | api key prefix
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_merge_log_canonical ON entity_merge_log(canonical_uid);
CREATE INDEX IF NOT EXISTS idx_entity_merge_log_dup       ON entity_merge_log(dup_uid);
CREATE INDEX IF NOT EXISTS idx_entity_merge_log_created   ON entity_merge_log(created_at DESC);

ALTER TABLE entity_merge_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read entity_merge_log" ON entity_merge_log;
CREATE POLICY "Public read entity_merge_log" ON entity_merge_log FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service write entity_merge_log" ON entity_merge_log;
CREATE POLICY "Service write entity_merge_log" ON entity_merge_log FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE entity_merge_log IS
  'Audit trail of legal_entity merges. Snapshots survive even after the dup row is deleted, enabling undo + provenance.';
