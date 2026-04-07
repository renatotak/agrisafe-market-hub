-- ============================================================
-- Migration 030: Inteligência de Insumos — Oracle foundation (Phase 20)
-- Depends on: 014 (industries / industry_products), 020 (legal_entities backfill), 027 (scraper_registry)
-- ============================================================
--
-- Phase 20 turns AgInputIntelligence.tsx from a live AGROFIT search
-- wrapper into an "oracle" — a normalized local database of registered
-- ag-input products that supports substitution queries (give me cheaper
-- alternatives to brand X for culture Y).
--
-- Design choice: REUSE the existing `industry_products` table from
-- migration 014 (currently 0 rows). It already has product_name,
-- active_ingredients[], product_type, target_cultures[], agrofit_registro
-- and the right RLS policies. We extend it with a few AGROFIT-specific
-- columns and ADD two new normalized helper tables for the Oracle queries:
--
--   1. active_ingredients      — molecule master (one row per active ingredient)
--   2. industry_product_uses   — junction normalizing AGROFIT's indicacao_uso[]
--                                into (product_id, culture, pest) rows so the
--                                Oracle can JOIN-query "all brands targeting
--                                culture X for pest Y" without array scans
--
-- Plus: a UNIQUE constraint on agrofit_registro for idempotent upserts,
-- and a scraper_registry seed row for the new sync-agrofit-bulk cron.
--
-- Algorithms first: the bulk scraper iterates over a fixed seed-query list
-- (major Brazilian cultures + common active ingredients) and dedupes by
-- numero_registro. NO LLM is used to "extract" data from anywhere —
-- AGROFIT's JSON response shape is mapped algorithmically.
-- ============================================================

-- ─── 1. Extend industry_products with AGROFIT-specific columns ────

ALTER TABLE industry_products
  ADD COLUMN IF NOT EXISTS formulation       text,
  ADD COLUMN IF NOT EXISTS url_agrofit       text,
  ADD COLUMN IF NOT EXISTS source_dataset    text DEFAULT 'manual'
    CHECK (source_dataset IN ('manual','agrofit_federal','bioinsumos_federal',
                              'state_secretaria_mt','state_secretaria_ms',
                              'state_secretaria_go','state_secretaria_pr',
                              'state_secretaria_rs','state_secretaria_sp',
                              'state_secretaria_mg','state_secretaria_ba','other')),
  ADD COLUMN IF NOT EXISTS scraped_at        timestamptz,
  ADD COLUMN IF NOT EXISTS confidentiality   text NOT NULL DEFAULT 'public'
    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential'));

-- Idempotent upsert key. Allow multiple rows when agrofit_registro is null
-- (manual products and pre-Phase-20 rows from migration 014 have no registro).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_agrofit_registro_unique
  ON industry_products(agrofit_registro)
  WHERE agrofit_registro IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ip_source_dataset
  ON industry_products(source_dataset);

COMMENT ON COLUMN industry_products.source_dataset IS
  'Provenance of this row. agrofit_federal = MAPA AGROFIT bulk import via /api/cron/sync-agrofit-bulk. state_secretaria_* = per-state ag input lists (Phase 20 follow-up).';

-- ─── 2. active_ingredients — normalized molecule master ──────────

CREATE TABLE IF NOT EXISTS active_ingredients (
  ingredient_id    text PRIMARY KEY,            -- slug: 'glifosato', '2-4-d-amina', 'imazapyr'
  name             text NOT NULL UNIQUE,        -- canonical: 'GLIFOSATO', '2,4-D AMINA'
  name_display     text,                        -- 'Glifosato', '2,4-D Amina'
  molecule_class   text,                        -- 'organofosforado','imidazolinona','triazol'
  mode_of_action   text,                        -- 'inibidor de EPSPS','auxina sintética'
  category         text CHECK (category IN ('herbicida','inseticida','fungicida','acaricida','nematicida','reguladora','biologico','fertilizante','outro')),
  toxicity_class   text,
  environmental_class text,
  brand_count      integer NOT NULL DEFAULT 0,  -- denormalized cache, refreshed by scraper
  holder_count     integer NOT NULL DEFAULT 0,  -- # of distinct titular_registro = competitive proxy
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  confidentiality  text NOT NULL DEFAULT 'public'
    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_ingredients_category
  ON active_ingredients(category);
CREATE INDEX IF NOT EXISTS idx_active_ingredients_holder_count
  ON active_ingredients(holder_count DESC);

ALTER TABLE active_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active_ingredients"
  ON active_ingredients FOR SELECT USING (true);

CREATE POLICY "Service role write active_ingredients"
  ON active_ingredients FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE active_ingredients IS
  'Normalized molecule master. holder_count is the proxy for "how competitive is this molecule" — more holders = more brands = the cheaper-alternative angle of the Oracle UX.';

-- ─── 3. industry_product_uses — normalized indicacao_uso[] ───────

CREATE TABLE IF NOT EXISTS industry_product_uses (
  use_id           bigserial PRIMARY KEY,
  product_id       integer NOT NULL REFERENCES industry_products(id) ON DELETE CASCADE,
  culture          text NOT NULL,                -- e.g. 'soja', 'milho', 'algodão'
  culture_slug     text NOT NULL,                -- slugified for joins (lowercase ASCII)
  pest             text,                          -- e.g. 'ferrugem asiática', 'lagarta-da-soja'
  pest_slug        text,
  source_dataset   text NOT NULL DEFAULT 'agrofit_federal',
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Postgres does not allow expressions in inline UNIQUE constraints, so we
  -- use NULLS NOT DISTINCT (PG 15+, supported by Supabase) to make NULL
  -- pest_slug values be treated as equal — that way the bulk scraper's
  -- onConflict='product_id,culture_slug,pest_slug' upsert dedupes correctly.
  UNIQUE NULLS NOT DISTINCT (product_id, culture_slug, pest_slug)
);

CREATE INDEX IF NOT EXISTS idx_ipu_culture_slug
  ON industry_product_uses(culture_slug);
CREATE INDEX IF NOT EXISTS idx_ipu_pest_slug
  ON industry_product_uses(pest_slug);
CREATE INDEX IF NOT EXISTS idx_ipu_product
  ON industry_product_uses(product_id);

ALTER TABLE industry_product_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read industry_product_uses"
  ON industry_product_uses FOR SELECT USING (true);

CREATE POLICY "Service role write industry_product_uses"
  ON industry_product_uses FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE industry_product_uses IS
  'Junction normalizing AGROFIT indicacao_uso[] into (product_id, culture, pest) rows so the Oracle endpoint can JOIN instead of array-scanning industry_products.target_cultures.';

-- ─── 4. industry_product_ingredients — normalized active_ingredients[] ───

CREATE TABLE IF NOT EXISTS industry_product_ingredients (
  product_id       integer NOT NULL REFERENCES industry_products(id) ON DELETE CASCADE,
  ingredient_id    text NOT NULL REFERENCES active_ingredients(ingredient_id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_ipi_ingredient
  ON industry_product_ingredients(ingredient_id);

ALTER TABLE industry_product_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read industry_product_ingredients"
  ON industry_product_ingredients FOR SELECT USING (true);

CREATE POLICY "Service role write industry_product_ingredients"
  ON industry_product_ingredients FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE industry_product_ingredients IS
  'Junction normalizing the denormalized industry_products.active_ingredients[] array. Used by the Oracle JOIN to find substitutes (same ingredient_id, different product_id).';

-- ─── 5. v_oracle_brand_alternatives view — the Oracle query primitive ───

CREATE OR REPLACE VIEW v_oracle_brand_alternatives
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
  ip.toxicity_class,
  ip.environmental_class,
  ip.formulation,
  ip.url_agrofit,
  ind.name_display  AS manufacturer_display,
  ind.headquarters_country
FROM active_ingredients ai
JOIN industry_product_ingredients ipi USING (ingredient_id)
JOIN industry_products ip            ON ip.id = ipi.product_id
JOIN industry_product_uses ipu       ON ipu.product_id = ip.id
LEFT JOIN industries ind             ON ind.id = ip.industry_id
WHERE ip.source_dataset IN ('agrofit_federal','bioinsumos_federal',
                            'state_secretaria_mt','state_secretaria_ms',
                            'state_secretaria_go','state_secretaria_pr',
                            'state_secretaria_rs','state_secretaria_sp',
                            'state_secretaria_mg','state_secretaria_ba');

COMMENT ON VIEW v_oracle_brand_alternatives IS
  'Phase 20 Oracle query primitive. Returns one row per (ingredient × product × use) so the /api/inputs/oracle endpoint can group by ingredient_id and culture_slug to surface "give me all brands targeting culture X with the same molecule".';

-- ─── 6. Seed scraper_registry for the AGROFIT bulk cron ──────────

INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-agrofit-bulk',
  'AGROFIT Bulk Product Catalog',
  'Iterates over a seed-query list (major Brazilian cultures + common active ingredients) and pages through Embrapa AGROFIT JSON, deduping by numero_registro and normalizing into industry_products / active_ingredients / industry_product_uses. Backs the Pulso de Insumos Oracle UX.',
  'embrapa_agroapi_agrofit',
  'json',
  'industry_products',
  'weekly',
  72,
  '{
    "required_keys": ["numero_registro","marca_comercial","titular_registro","ingrediente_ativo","indicacao_uso"],
    "sample_row": {
      "numero_registro": "string",
      "marca_comercial": "string",
      "titular_registro": "string",
      "ingrediente_ativo": "string",
      "indicacao_uso": "string"
    },
    "enum_values": {
      "produto_biologico": ["true","false","yes","no","sim","nao",""]
    }
  }'::jsonb,
  20,
  'agrisafe-mkthub',
  'Embrapa AGROFIT v1 search/produtos-formulados endpoint. Iterates seed queries (cultures + ingredients) since the API requires a query parameter — there is no list-all endpoint. Schema_check intentionally relaxed because AGROFIT returns mixed types (some array fields collapsed to strings on serialization).'
)
ON CONFLICT (scraper_id) DO NOTHING;
