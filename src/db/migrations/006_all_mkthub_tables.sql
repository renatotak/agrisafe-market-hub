-- ============================================================
-- AgriSafe Market Hub — ALL Tables (Consolidated)
-- Run this ONCE in Supabase Dashboard > SQL Editor
-- Creates all Market Hub tables that don't exist yet
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS
-- ============================================================

-- Enable pgvector extension (for knowledge embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- MARKET DATA
-- ============================================================

CREATE TABLE IF NOT EXISTS commodity_prices (
  id text PRIMARY KEY,
  name_pt text NOT NULL,
  name_en text NOT NULL,
  price numeric(12,4) NOT NULL DEFAULT 0,
  unit text NOT NULL,
  change_24h numeric(6,2) DEFAULT 0,
  source text DEFAULT 'CEPEA/BCB',
  last_update date DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS market_indicators (
  id text PRIMARY KEY,
  name_pt text NOT NULL,
  name_en text NOT NULL,
  value text NOT NULL,
  trend text DEFAULT 'stable',
  source text DEFAULT 'BCB'
);

CREATE TABLE IF NOT EXISTS commodity_price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  commodity_id text NOT NULL,
  price numeric(12,4) NOT NULL,
  change_24h numeric(6,2) DEFAULT 0,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(commodity_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_price_history_commodity ON commodity_price_history(commodity_id, recorded_at DESC);

-- ============================================================
-- NEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS agro_news (
  id text PRIMARY KEY,
  title text NOT NULL,
  summary text,
  source_name text NOT NULL,
  source_url text UNIQUE NOT NULL,
  image_url text,
  published_at timestamptz NOT NULL,
  category text,
  tags text[] DEFAULT '{}',
  mentions_producer boolean DEFAULT false,
  producer_names text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agro_news_published_at ON agro_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_agro_news_category ON agro_news(category);

CREATE TABLE IF NOT EXISTS highlighted_producers (
  id text PRIMARY KEY,
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  active boolean DEFAULT true
);

-- ============================================================
-- COMPETITORS
-- ============================================================

CREATE TABLE IF NOT EXISTS competitors (
  id text PRIMARY KEY,
  name text NOT NULL,
  segment text,
  website text,
  description_pt text,
  description_en text
);

CREATE TABLE IF NOT EXISTS competitor_signals (
  id text PRIMARY KEY,
  competitor_id text REFERENCES competitors(id),
  type text NOT NULL,
  title_pt text NOT NULL,
  title_en text,
  date date NOT NULL,
  source text
);

-- ============================================================
-- EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  name text NOT NULL,
  date date NOT NULL,
  end_date date,
  location text,
  type text DEFAULT 'conference',
  description_pt text,
  description_en text,
  content_opportunity_pt text,
  content_opportunity_en text,
  website text,
  upcoming boolean DEFAULT true
);

-- ============================================================
-- CAMPAIGNS & CONTENT (legacy)
-- ============================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  status text DEFAULT 'draft',
  channels text[] DEFAULT '{}',
  start_date date,
  end_date date,
  pillar text,
  content_pieces integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_ideas (
  id text PRIMARY KEY,
  title_pt text NOT NULL,
  title_en text,
  type text DEFAULT 'blog',
  pillar text,
  description_pt text,
  description_en text,
  keywords text[] DEFAULT '{}',
  trend_score integer DEFAULT 50,
  suggested_date date,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- RECUPERAÇÃO JUDICIAL
-- ============================================================

CREATE TABLE IF NOT EXISTS recuperacao_judicial (
  id text PRIMARY KEY,
  entity_name text NOT NULL,
  entity_cnpj text,
  entity_type text,
  court text,
  case_number text,
  status text DEFAULT 'em_andamento',
  filing_date date,
  summary text,
  source_url text,
  source_name text,
  state text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rj_filing_date ON recuperacao_judicial(filing_date DESC);

-- ============================================================
-- RETAILERS
-- ============================================================

CREATE TABLE IF NOT EXISTS retailers (
  id serial PRIMARY KEY,
  cnpj_raiz text UNIQUE NOT NULL,
  consolidacao text,
  razao_social text NOT NULL,
  nome_fantasia text,
  grupo_acesso text,
  tipo_acesso text,
  faixa_faturamento text,
  industria_1 text,
  industria_2 text,
  industria_3 text,
  classificacao text,
  possui_loja_fisica text,
  capital_social numeric,
  porte text,
  porte_name text,
  active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS retailer_locations (
  id serial PRIMARY KEY,
  cnpj text UNIQUE,
  cnpj_raiz text,
  razao_social text,
  nome_fantasia text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cep text,
  uf text,
  municipio text,
  latitude numeric,
  longitude numeric,
  situacao_cadastral text DEFAULT 'ATIVA'
);

-- ============================================================
-- KNOWLEDGE BASE (vector storage)
-- ============================================================

CREATE TABLE IF NOT EXISTS news_knowledge (
  id text PRIMARY KEY,
  period_start date NOT NULL,
  period_end date NOT NULL,
  category text,
  source_name text,
  summary text NOT NULL,
  key_topics text[] DEFAULT '{}',
  article_count integer DEFAULT 0,
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- SYNC LOGS (Phase 10 — Data Ingestion)
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  records_fetched integer DEFAULT 0,
  records_inserted integer DEFAULT 0,
  errors integer DEFAULT 0,
  status text DEFAULT 'success',
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_source ON sync_logs(source);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON sync_logs(started_at DESC);

-- ============================================================
-- CONTENT HUB (Phase 12)
-- ============================================================

CREATE TABLE IF NOT EXISTS published_articles (
  id text PRIMARY KEY,
  title text NOT NULL,
  channel text NOT NULL,
  url text,
  published_at date NOT NULL,
  summary text,
  thesis text,
  historical_reference text,
  engagement_views integer DEFAULT 0,
  engagement_likes integer DEFAULT 0,
  engagement_comments integer DEFAULT 0,
  engagement_shares integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  campaign_id text,
  status text DEFAULT 'published',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_published_articles_published ON published_articles(published_at DESC);

CREATE TABLE IF NOT EXISTS content_topics (
  id text PRIMARY KEY,
  thesis_pt text NOT NULL,
  thesis_en text,
  supporting_data text[] DEFAULT '{}',
  historical_angle_pt text,
  historical_angle_en text,
  suggested_week text,
  target_channel text DEFAULT 'linkedin',
  status text DEFAULT 'suggested',
  keywords text[] DEFAULT '{}',
  published_article_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_topics_status ON content_topics(status);

-- ============================================================
-- REGULATORY NORMS (Phase 12-13)
-- ============================================================

CREATE TABLE IF NOT EXISTS regulatory_norms (
  id text PRIMARY KEY,
  body text NOT NULL,
  norm_type text NOT NULL,
  norm_number text,
  title text NOT NULL,
  summary text,
  published_at date NOT NULL,
  effective_at date,
  impact_level text DEFAULT 'medium',
  affected_areas text[] DEFAULT '{}',
  source_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regulatory_norms_published ON regulatory_norms(published_at DESC);

-- ============================================================
-- RLS POLICIES (public read, service role write)
-- ============================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'commodity_prices', 'commodity_price_history', 'market_indicators',
      'agro_news', 'highlighted_producers', 'competitors', 'competitor_signals',
      'events', 'campaigns', 'content_ideas', 'recuperacao_judicial',
      'retailers', 'retailer_locations', 'news_knowledge',
      'sync_logs', 'published_articles', 'content_topics', 'regulatory_norms'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "mkthub_public_read_%s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "mkthub_public_read_%s" ON %I FOR SELECT USING (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "mkthub_service_write_%s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "mkthub_service_write_%s" ON %I FOR ALL USING (auth.role() = ''service_role'')', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================
-- SEED: Base commodity prices and indicators
-- ============================================================

INSERT INTO commodity_prices (id, name_pt, name_en, price, unit, change_24h, source, last_update) VALUES
  ('soy', 'Soja', 'Soybean', 138.42, 'R$/sc 60kg', 1.8, 'CEPEA/BCB', '2026-03-31'),
  ('corn', 'Milho', 'Corn', 72.15, 'R$/sc 60kg', -0.6, 'CEPEA/BCB', '2026-03-31'),
  ('coffee', 'Café Arábica', 'Arabica Coffee', 1287.50, 'R$/sc 60kg', 3.2, 'CEPEA/BCB', '2026-03-31'),
  ('sugar', 'Açúcar Cristal', 'Crystal Sugar', 142.80, 'R$/sc 50kg', 0.4, 'CEPEA/BCB', '2026-03-31'),
  ('cotton', 'Algodão', 'Cotton', 82.35, '¢/lb', -1.1, 'CEPEA/BCB', '2026-03-31'),
  ('citrus', 'Laranja', 'Orange', 38.90, 'R$/cx 40.8kg', 0.0, 'CEPEA/BCB', '2026-03-28')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_indicators (id, name_pt, name_en, value, trend, source) VALUES
  ('usd_brl', 'Câmbio USD/BRL', 'USD/BRL Exchange', 'R$ 5.7284', 'up', 'BCB'),
  ('selic', 'Taxa Selic', 'Selic Rate', '14.25%', 'stable', 'BCB'),
  ('agro_exports', 'Exportações Agro 2026', 'Agro Exports 2026', 'US$ 42.3 bi', 'up', 'MAPA'),
  ('rural_credit', 'Crédito Rural', 'Rural Credit', 'R$ 400.6 bi', 'stable', 'BNDES/BCB'),
  ('crop_soy', 'Safra Soja 25/26', 'Soy Crop 25/26', '172.4 mi ton', 'up', 'CONAB')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Done! Verify: SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'car_%' AND tablename NOT LIKE 'biome_%' ORDER BY tablename;
-- ============================================================
