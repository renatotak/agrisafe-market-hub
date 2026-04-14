-- ============================================================
-- Migration 054: meetings metadata + leads source enum update
-- ============================================================
-- Adds metadata jsonb to meetings for storing structured extracted
-- data (competitor tech, service interests, financial info) from
-- OneNote imports without schema changes per field.
-- Also adds unique index on external_id for idempotent re-import.

-- 1. Add metadata column
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- 2. Unique index on external_id (enables idempotent re-import)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_external_id
  ON meetings(external_id) WHERE external_id IS NOT NULL;

-- 3. Add 'onenote_import' to leads.source CHECK constraint
-- (meetings.source already has it from migration 041)
DO $$ BEGIN
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
  ALTER TABLE leads ADD CONSTRAINT leads_source_check
    CHECK (source IN ('manual','campaign','inbound','referral','event','partner','onenote_import'));
END $$;
