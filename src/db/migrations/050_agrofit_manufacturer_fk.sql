-- ============================================================
-- Migration 050 — AGROFIT manufacturer FK to legal_entities
-- Depends on: 049 (agrofit unique), 030 (industry_products schema)
-- ============================================================

-- 1. Add titular_registro and manufacturer_entity_uid to industry_products
ALTER TABLE industry_products
  ADD COLUMN IF NOT EXISTS titular_registro text,
  ADD COLUMN IF NOT EXISTS manufacturer_entity_uid uuid REFERENCES legal_entities(entity_uid);

CREATE INDEX IF NOT EXISTS idx_ip_titular ON industry_products(titular_registro);
CREATE INDEX IF NOT EXISTS idx_ip_manufacturer ON industry_products(manufacturer_entity_uid);

-- 2. Recreate Oracle view with manufacturer columns
DROP VIEW IF EXISTS v_oracle_brand_alternatives;
CREATE VIEW v_oracle_brand_alternatives
WITH (security_invoker=on) AS
SELECT
  ai.ingredient_id,
  ai.name           AS ingredient_name,
  ai.name_display   AS ingredient_display,
  ai.category       AS ingredient_category,
  ai.holder_count,
  ai.brand_count,
  ipu.culture_slug,
  ipu.culture,
  ipu.pest_slug,
  ipu.pest,
  ip.id             AS product_id,
  ip.product_name,
  ip.industry_id,
  ip.titular_registro,
  ip.manufacturer_entity_uid,
  ip.toxicity_class,
  ip.environmental_class,
  ip.formulation,
  ip.url_agrofit,
  COALESCE(le.display_name, ind.name_display, ip.titular_registro) AS manufacturer_display,
  ind.headquarters_country AS manufacturer_country
FROM active_ingredients ai
JOIN industry_product_ingredients ipi USING (ingredient_id)
JOIN industry_products ip            ON ip.id = ipi.product_id
JOIN industry_product_uses ipu       ON ipu.product_id = ip.id
LEFT JOIN industries ind             ON ind.id = ip.industry_id
LEFT JOIN legal_entities le          ON le.entity_uid = ip.manufacturer_entity_uid
WHERE ip.source_dataset IN ('agrofit_federal','bioinsumos_federal',
                            'state_secretaria_mt','state_secretaria_ms',
                            'state_secretaria_go','state_secretaria_pr',
                            'state_secretaria_rs','state_secretaria_sp',
                            'state_secretaria_mg','state_secretaria_ba');
