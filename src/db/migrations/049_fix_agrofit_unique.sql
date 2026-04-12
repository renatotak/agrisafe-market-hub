-- ============================================================
-- Migration 049 — Fix industry_products unique constraint for AGROFIT upsert
-- Depends on: 030 (input_oracle — added agrofit_registro column + index)
-- ============================================================
-- The sync-agrofit-bulk job uses .upsert({ onConflict: 'agrofit_registro' })
-- but migration 030 only created a regular index, not a UNIQUE constraint.

-- PostgREST requires a real UNIQUE constraint (not partial index) for onConflict.
DROP INDEX IF EXISTS idx_ip_agrofit_registro;
ALTER TABLE industry_products ADD CONSTRAINT uq_ip_agrofit_registro UNIQUE (agrofit_registro);

-- AGROFIT products are keyed by agrofit_registro, not (industry_id, product_name).
-- The titular_registro holder may not match any existing industry row, so
-- industry_id must be nullable for AGROFIT-sourced rows.
ALTER TABLE industry_products ALTER COLUMN industry_id DROP NOT NULL;
