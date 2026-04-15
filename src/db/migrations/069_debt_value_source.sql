-- ============================================================
-- Migration 069: debt_value_source — track provenance of RJ debt values
-- ============================================================
-- Each recuperacao_judicial row can have its debt_value populated
-- from different pipelines:
--
--   legal_rss  → scraped from ConJur / Migalhas RSS feeds (sync-recuperacao-judicial)
--   ddg_scrape → extracted via DuckDuckGo web scan (/api/rj-scan, /api/rj-add)
--   serasa     → imported from Serasa CSV exports (backfill-serasa-rj)
--   manual     → entered manually via the Add CNPJ modal
--
-- Exposed as a colored chip on each RJ card so analysts know
-- where a debt figure originated and how much to trust it.
-- ============================================================

ALTER TABLE recuperacao_judicial
  ADD COLUMN IF NOT EXISTS debt_value_source text
  CHECK (debt_value_source IN ('legal_rss', 'ddg_scrape', 'serasa', 'manual'));

COMMENT ON COLUMN recuperacao_judicial.debt_value_source IS
  'Provenance of the debt_value figure — legal_rss | ddg_scrape | serasa | manual.';

-- Backfill existing rows: infer source from source_name where possible
UPDATE recuperacao_judicial
SET debt_value_source = CASE
  WHEN source_name ILIKE '%conjur%' OR source_name ILIKE '%migalhas%' THEN 'legal_rss'
  WHEN source_name ILIKE '%ddg%' OR source_name ILIKE '%duckduck%' OR source_name ILIKE '%web scan%' THEN 'ddg_scrape'
  ELSE NULL
END
WHERE debt_value_source IS NULL AND debt_value IS NOT NULL;
