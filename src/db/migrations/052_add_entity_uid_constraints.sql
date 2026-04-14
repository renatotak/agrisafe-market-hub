-- ============================================================
-- Migration 052: Add entity_uid UNIQUE constraints (Phase 28)
-- ============================================================
-- Step 1 of the legacy-column cleanup. Adds entity_uid-based UNIQUE
-- constraints to tables that still use cnpj_basico / cnpj_raiz as their
-- primary dedup key. This lets the code switch upsert onConflict to
-- entity_uid while keeping the legacy columns alive for read fallback.
--
-- A future migration (053) will drop the legacy columns once the code
-- has been deployed and verified stable on entity_uid-only paths.
--
-- Safe to apply against the current schema — every table below already
-- has an entity_uid column populated by ensureLegalEntityUid().

-- 1. company_enrichment: UNIQUE on entity_uid
--    (current PK is cnpj_basico — kept until 053)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'company_enrichment'
      AND constraint_name = 'company_enrichment_entity_uid_key'
  ) THEN
    ALTER TABLE company_enrichment
      ADD CONSTRAINT company_enrichment_entity_uid_key UNIQUE (entity_uid);
  END IF;
END $$;

-- 2. company_notes: UNIQUE on (entity_uid, field_key)
--    (current unique is (cnpj_basico, field_key) — kept until 053)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'company_notes'
      AND constraint_name = 'company_notes_entity_uid_field_key_key'
  ) THEN
    ALTER TABLE company_notes
      ADD CONSTRAINT company_notes_entity_uid_field_key_key UNIQUE (entity_uid, field_key);
  END IF;
END $$;

-- 3. retailer_intelligence: UNIQUE on entity_uid
--    (current unique is cnpj_raiz — kept until 053)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'retailer_intelligence'
      AND constraint_name = 'retailer_intelligence_entity_uid_key'
  ) THEN
    ALTER TABLE retailer_intelligence
      ADD CONSTRAINT retailer_intelligence_entity_uid_key UNIQUE (entity_uid);
  END IF;
END $$;

-- 4. retailers: UNIQUE on entity_uid (may already exist from earlier migration)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'retailers'
      AND constraint_name = 'retailers_entity_uid_key'
  ) THEN
    ALTER TABLE retailers
      ADD CONSTRAINT retailers_entity_uid_key UNIQUE (entity_uid);
  END IF;
END $$;
