-- ============================================================
-- Migration 053: Drop legacy CNPJ columns (Phase 28 capstone)
-- ============================================================
-- Drops cnpj_basico / cnpj_raiz from 4 tables that now use
-- entity_uid exclusively. Migration 052 already added the
-- UNIQUE constraints on entity_uid that the code now uses.
--
-- NOT dropping: retailers.cnpj_raiz (still used for search/display)
--               retailer_locations.cnpj_raiz (still used by some queries)
--               cnpj_establishments.cnpj_raiz (location-level identifier)

-- 1. company_enrichment: drop cnpj_basico (was PK, now entity_uid is UNIQUE)
ALTER TABLE company_enrichment DROP COLUMN IF EXISTS cnpj_basico CASCADE;

-- 2. company_notes: drop cnpj_basico (was part of composite unique)
ALTER TABLE company_notes DROP COLUMN IF EXISTS cnpj_basico CASCADE;

-- 3. company_research: drop cnpj_basico (no constraint, just a data column)
ALTER TABLE company_research DROP COLUMN IF EXISTS cnpj_basico CASCADE;

-- 4. retailer_intelligence: drop cnpj_raiz (was UNIQUE, now entity_uid is UNIQUE)
ALTER TABLE retailer_intelligence DROP COLUMN IF EXISTS cnpj_raiz CASCADE;
