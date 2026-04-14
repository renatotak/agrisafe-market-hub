-- ============================================================
-- Migration 061: industries.entity_uid — link curated catalog to legal_entities
-- ============================================================
-- The `industries` table predates the 5-entity model. It carries the
-- original 18 curated brand profiles (Syngenta, BASF, Bayer, etc.)
-- with rich metadata (description_pt, agrofit_holder_names, segment).
-- Same companies were later inserted into `legal_entities` with
-- role='industry' via the AGROFIT crawler and CSV imports — so the
-- Diretório de Indústrias renders TWO cards for the same actor.
--
-- Adding `entity_uid` lets us link the curated brand-profile to its
-- canonical legal_entity. /api/industries can then return one merged
-- card per entity instead of unioning blindly.
-- ============================================================

ALTER TABLE industries
  ADD COLUMN IF NOT EXISTS entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_industries_entity_uid
  ON industries(entity_uid)
  WHERE entity_uid IS NOT NULL;

COMMENT ON COLUMN industries.entity_uid IS
  'Link from the curated brand-profile to the canonical legal_entity (mig 061). When set, /api/industries treats this curated row as the rich-data twin of the imported entity_uid row and returns a single merged card.';
