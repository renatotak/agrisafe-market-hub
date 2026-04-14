-- ============================================================
-- Migration 054: Retailers — formalize cnpj_raiz drop + rebuild views
-- ============================================================
-- The `retailers.cnpj_raiz` column was already dropped in the live
-- database (likely via CASCADE from migration 053 execution). This
-- migration formalizes that state and rebuilds the three views that
-- depended on the column — they were collateral-dropped by CASCADE
-- and have been silently missing in production ever since.
--
-- After this migration:
--   - retailers has no `cnpj_raiz` column. Canonical key is `entity_uid`.
--   - CNPJ raiz is resolved through `legal_entities.tax_id` via the
--     entity_uid FK (legal_entities.entity_uid ← retailers.entity_uid).
--   - v_retailer_profile / v_retailers_in_rj / v_entity_profile
--     re-expose `cnpj_raiz` via `le.tax_id AS cnpj_raiz` so existing
--     API consumers keep working.
-- ============================================================

-- 1. Drop the column if it still exists (idempotent)
ALTER TABLE retailers DROP COLUMN IF EXISTS cnpj_raiz CASCADE;

-- 2. Rebuild v_retailer_profile (joins retailers → legal_entities via entity_uid)

DROP VIEW IF EXISTS v_retailer_profile;

CREATE VIEW v_retailer_profile
WITH (security_invoker = on) AS
SELECT
  le.entity_uid,
  le.tax_id AS cnpj_raiz,
  r.razao_social,
  r.nome_fantasia,
  r.classificacao,
  r.faixa_faturamento,
  r.porte_name,
  r.grupo_acesso,
  r.tipo_acesso,
  ce.cnae_fiscal,
  ce.cnae_fiscal_descricao,
  ce.situacao_cadastral,
  ce.capital_social AS rf_capital_social,
  ri.market_position,
  ri.executive_summary,
  ri.news_mentions,
  ri.branch_count_current,
  le.confidentiality
FROM retailers r
JOIN legal_entities le            ON le.entity_uid = r.entity_uid
LEFT JOIN company_enrichment   ce ON ce.entity_uid = le.entity_uid
LEFT JOIN retailer_intelligence ri ON ri.entity_uid = le.entity_uid;

COMMENT ON VIEW v_retailer_profile IS
  'Canonical retailer profile (mig 054 rebuild). Keyed on entity_uid; cnpj_raiz re-exposed from legal_entities.tax_id.';

-- 3. Rebuild v_retailers_in_rj

DROP VIEW IF EXISTS v_retailers_in_rj;

CREATE VIEW v_retailers_in_rj
WITH (security_invoker = on) AS
SELECT DISTINCT ON (le.entity_uid)
  le.entity_uid,
  le.tax_id AS cnpj_raiz,
  r.razao_social,
  r.nome_fantasia,
  r.classificacao,
  r.faixa_faturamento,
  r.porte_name,
  r.grupo_acesso,
  rj.status       AS rj_status,
  rj.filing_date  AS rj_filing_date,
  rj.summary      AS rj_summary,
  rj.source_name  AS rj_source,
  rj.debt_value   AS rj_debt_value,
  rj.state        AS rj_state,
  rj.entity_type  AS rj_entity_type
FROM retailers r
JOIN legal_entities le ON le.entity_uid = r.entity_uid
JOIN recuperacao_judicial rj
  ON rj.entity_cnpj LIKE le.tax_id || '%'
ORDER BY le.entity_uid, rj.filing_date DESC NULLS LAST;

COMMENT ON VIEW v_retailers_in_rj IS
  'Retailers intersected with recuperacao judicial filings (mig 054 rebuild). Keyed on entity_uid.';

-- 4. Rebuild v_entity_profile

DROP VIEW IF EXISTS v_entity_profile;

CREATE VIEW v_entity_profile
WITH (security_invoker = on) AS
SELECT
  le.entity_uid,
  le.tax_id,
  le.tax_id_type,
  le.legal_name,
  le.display_name,
  le.confidentiality,
  le.source_ref,
  (SELECT array_agg(er.role_type ORDER BY er.role_type)
     FROM entity_roles er WHERE er.entity_uid = le.entity_uid) AS roles,
  r.classificacao      AS retailer_classificacao,
  r.faixa_faturamento  AS retailer_faixa_faturamento,
  r.porte_name         AS retailer_porte,
  r.grupo_acesso       AS retailer_grupo,
  r.tipo_acesso        AS retailer_tipo_acesso,
  ce.cnae_fiscal,
  ce.cnae_fiscal_descricao,
  ce.situacao_cadastral,
  ce.capital_social    AS rf_capital_social,
  ri.market_position,
  ri.executive_summary,
  ri.news_mentions,
  ri.branch_count_current,
  (SELECT rj.status FROM recuperacao_judicial rj
    WHERE rj.entity_cnpj LIKE le.tax_id || '%'
    ORDER BY rj.filing_date DESC NULLS LAST LIMIT 1) AS rj_status,
  (SELECT rj.filing_date FROM recuperacao_judicial rj
    WHERE rj.entity_cnpj LIKE le.tax_id || '%'
    ORDER BY rj.filing_date DESC NULLS LAST LIMIT 1) AS rj_filing_date,
  (SELECT rj.debt_value FROM recuperacao_judicial rj
    WHERE rj.entity_cnpj LIKE le.tax_id || '%'
    ORDER BY rj.filing_date DESC NULLS LAST LIMIT 1) AS rj_debt_value
FROM legal_entities le
LEFT JOIN retailers r               ON r.entity_uid  = le.entity_uid
LEFT JOIN company_enrichment ce     ON ce.entity_uid = le.entity_uid
LEFT JOIN retailer_intelligence ri  ON ri.entity_uid = le.entity_uid;

COMMENT ON VIEW v_entity_profile IS
  'Canonical one-entity lookup (mig 054 rebuild). retailers joined via entity_uid; cnpj_raiz exposed as tax_id.';
