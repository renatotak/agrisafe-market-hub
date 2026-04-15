-- ============================================================
-- Migration 064 — RLS audit fix (idempotent)
-- ============================================================
-- Five tables were created without ENABLE ROW LEVEL SECURITY,
-- leaving them fully readable AND writable via the anon key
-- from the browser.  This migration enables RLS on each and
-- adds the standard "public read / service-role write" policy
-- pair used across the codebase (see 043, 052, 063).
--
-- Tables fixed:
--   company_enrichment   (011) — Receita Federal cache: CNPJ, QSA, capital social
--   company_notes        (012) — user-editable notes per company
--   company_research     (012) — web research / AI summaries per company
--   executive_briefings  (047) — daily executive briefing content
--   cron_freshness       (051) — orchestrator freshness cache
-- ============================================================

-- 1. company_enrichment
ALTER TABLE company_enrichment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_company_enrichment" ON company_enrichment;
CREATE POLICY "public_read_company_enrichment"
  ON company_enrichment FOR SELECT USING (true);
DROP POLICY IF EXISTS "service_role_write_company_enrichment" ON company_enrichment;
CREATE POLICY "service_role_write_company_enrichment"
  ON company_enrichment FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. company_notes
ALTER TABLE company_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_company_notes" ON company_notes;
CREATE POLICY "public_read_company_notes"
  ON company_notes FOR SELECT USING (true);
DROP POLICY IF EXISTS "service_role_write_company_notes" ON company_notes;
CREATE POLICY "service_role_write_company_notes"
  ON company_notes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. company_research
ALTER TABLE company_research ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_company_research" ON company_research;
CREATE POLICY "public_read_company_research"
  ON company_research FOR SELECT USING (true);
DROP POLICY IF EXISTS "service_role_write_company_research" ON company_research;
CREATE POLICY "service_role_write_company_research"
  ON company_research FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. executive_briefings
ALTER TABLE executive_briefings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_executive_briefings" ON executive_briefings;
CREATE POLICY "public_read_executive_briefings"
  ON executive_briefings FOR SELECT USING (true);
DROP POLICY IF EXISTS "service_role_write_executive_briefings" ON executive_briefings;
CREATE POLICY "service_role_write_executive_briefings"
  ON executive_briefings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 5. cron_freshness
ALTER TABLE cron_freshness ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_cron_freshness" ON cron_freshness;
CREATE POLICY "public_read_cron_freshness"
  ON cron_freshness FOR SELECT USING (true);
DROP POLICY IF EXISTS "service_role_write_cron_freshness" ON cron_freshness;
CREATE POLICY "service_role_write_cron_freshness"
  ON cron_freshness FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
