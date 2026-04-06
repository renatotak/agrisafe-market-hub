-- ============================================================
-- Migration 024: Add entity_uid to retailers (Phase 17C)
-- Depends on: 018, 019, 020
-- ============================================================
--
-- Adds a direct FK from `retailers` to `legal_entities` so UI queries
-- can carry entity_uid without an extra JOIN. The legacy `cnpj_raiz`
-- text column is kept as the current PK/UNIQUE and as the backwards-
-- compatible lookup key.
-- ============================================================

ALTER TABLE retailers
  ADD COLUMN IF NOT EXISTS entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL;

UPDATE retailers r
SET entity_uid = le.entity_uid
FROM legal_entities le
WHERE r.entity_uid IS NULL
  AND le.tax_id = r.cnpj_raiz;

CREATE INDEX IF NOT EXISTS idx_retailers_entity_uid ON retailers(entity_uid);

COMMENT ON COLUMN retailers.entity_uid IS
  'FK to legal_entities. Populated in Phase 17C migration 024 from tax_id=cnpj_raiz match. Legacy cnpj_raiz column kept as stable text key.';
