-- ============================================================
-- Data Sources Registry
-- Consolidated catalog of all public data sources used by AgriSafe
-- Imported from 25-0325 crawler lists (4 files)
-- ============================================================

CREATE TABLE IF NOT EXISTS data_sources_registry (
  id text PRIMARY KEY,
  name text NOT NULL,                    -- e.g. "CAR Poligonos", "CAFIR", "Embargos IBAMA"
  source_org text NOT NULL,              -- e.g. "INCRA", "IBAMA", "Receita Federal", "BCB"
  category text NOT NULL,                -- normalized: fiscal, socioambiental, financeiro, agropecuaria, logistica, geografias, agronomico
  data_type text,                        -- csv, xls, shapefile, txt, json, api, pdf, kmz
  description text,
  frequency text,                        -- diaria, semanal, mensal, trimestral, anual, safra, realtime, sob_demanda, nao_informado
  url text,
  url_secondary text,
  last_known_update date,                -- last known data update date from the source
  last_checked_at timestamptz,           -- when we last checked if URL is alive
  url_status text DEFAULT 'unchecked',   -- active, inactive, redirect, unchecked
  http_status integer,                   -- last HTTP status code
  server text,                           -- internal server: dbmaster.sicar, mongodb, etc.
  automated boolean DEFAULT false,       -- whether download is automated
  notes text,
  origin_file text,                      -- which crawler list file this came from
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsr_category ON data_sources_registry(category);
CREATE INDEX IF NOT EXISTS idx_dsr_source_org ON data_sources_registry(source_org);
CREATE INDEX IF NOT EXISTS idx_dsr_frequency ON data_sources_registry(frequency);

ALTER TABLE data_sources_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkthub_public_read_dsr" ON data_sources_registry FOR SELECT USING (true);
CREATE POLICY "mkthub_service_write_dsr" ON data_sources_registry FOR ALL USING (auth.role() = 'service_role');
