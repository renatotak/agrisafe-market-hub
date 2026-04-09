-- ============================================================
-- Migration 042 — CNAE classification on regulatory norms (Phase 24G2)
-- Depends on: 005 (regulatory_norms table)
-- ============================================================
--
-- The norm-extractor lib (src/lib/extract-norms-from-news.ts) and the
-- CVM/CNJ/BCB scrapers already tag every regulatory_norms row with an
-- `affected_areas text[]` array (e.g. ['cpr','fiagro','credito_rural']).
-- That's the AgriSafe-internal taxonomy. The user follow-up: ALSO tag
-- each norm with the CNAE codes it actually affects, so we can join
-- norms to legal_entities by CNAE and surface "this CMN resolution
-- affects companies in CNAE 2051700 / 4683400 / ...".
--
-- Schema-side this is just a `text[]` column. The classification logic
-- lives in src/lib/cnae-classifier.ts (pure regex, no LLM, guardrail #1)
-- and is invoked by:
--   - /api/regulatory/upload   (manual insert)
--   - sync-cvm-agro            (CVM walker)
--   - sync-cnj-atos            (CNJ JSON)
--   - sync-key-agro-laws       (curated laws)
--   - sync-bcb-rural           (BCB landing-page catalog)
--   - extract-norms-from-news  (inline norm extractor in sync-agro-news)
-- ============================================================

ALTER TABLE regulatory_norms
  ADD COLUMN IF NOT EXISTS affected_cnaes text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_regulatory_norms_cnaes
  ON regulatory_norms USING gin (affected_cnaes);

COMMENT ON COLUMN regulatory_norms.affected_cnaes IS
  'Phase 24G2 — array of 7-digit CNAE codes the norm affects, classified deterministically from affected_areas + title + summary by src/lib/cnae-classifier.ts. Used to JOIN regulatory_norms to legal_entities via CNAE.';
