-- ============================================================
-- AgriSafe Market Hub — Regulatory Norms Table
-- For RegulatoryFramework module
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS regulatory_norms (
  id text PRIMARY KEY,
  body text NOT NULL,                 -- 'CMN', 'CVM', 'BCB', 'MAPA'
  norm_type text NOT NULL,            -- 'resolucao', 'circular', 'instrucao_normativa'
  norm_number text,
  title text NOT NULL,
  summary text,
  published_at date NOT NULL,
  effective_at date,
  impact_level text DEFAULT 'medium', -- 'high', 'medium', 'low'
  affected_areas text[] DEFAULT '{}', -- 'credito_rural', 'cpr', 'seguro', etc.
  source_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regulatory_norms_body ON regulatory_norms(body);
CREATE INDEX IF NOT EXISTS idx_regulatory_norms_published ON regulatory_norms(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_regulatory_norms_impact ON regulatory_norms(impact_level);

ALTER TABLE regulatory_norms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read on regulatory_norms"
  ON regulatory_norms FOR SELECT USING (true);

CREATE POLICY "Service role write on regulatory_norms"
  ON regulatory_norms FOR ALL USING (auth.role() = 'service_role');
