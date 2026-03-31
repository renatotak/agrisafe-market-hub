-- ============================================================
-- AgriSafe Market Hub — New Module Tables
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- Enable pgvector extension (for knowledge embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. Agro News
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
CREATE INDEX IF NOT EXISTS idx_agro_news_source ON agro_news(source_name);
CREATE INDEX IF NOT EXISTS idx_agro_news_mentions_producer ON agro_news(mentions_producer) WHERE mentions_producer = true;

ALTER TABLE agro_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on agro_news" ON agro_news FOR SELECT USING (true);
CREATE POLICY "Allow service role write on agro_news" ON agro_news FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 2. Highlighted Producers (config table for news matching)
-- ============================================================
CREATE TABLE IF NOT EXISTS highlighted_producers (
  id text PRIMARY KEY,
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  active boolean DEFAULT true
);

ALTER TABLE highlighted_producers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on highlighted_producers" ON highlighted_producers FOR SELECT USING (true);
CREATE POLICY "Allow service role write on highlighted_producers" ON highlighted_producers FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 3. Retailers Directory
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

CREATE INDEX IF NOT EXISTS idx_retailers_grupo ON retailers(grupo_acesso);
CREATE INDEX IF NOT EXISTS idx_retailers_classificacao ON retailers(classificacao);
CREATE INDEX IF NOT EXISTS idx_retailers_razao ON retailers(razao_social);
CREATE INDEX IF NOT EXISTS idx_retailers_cnpj ON retailers(cnpj_raiz);

ALTER TABLE retailers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on retailers" ON retailers FOR SELECT USING (true);
CREATE POLICY "Allow service role write on retailers" ON retailers FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 4. Retailer Locations (establishments)
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_retailer_locations_cnpj_raiz ON retailer_locations(cnpj_raiz);
CREATE INDEX IF NOT EXISTS idx_retailer_locations_uf ON retailer_locations(uf);

ALTER TABLE retailer_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on retailer_locations" ON retailer_locations FOR SELECT USING (true);
CREATE POLICY "Allow service role write on retailer_locations" ON retailer_locations FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 5. Recuperação Judicial
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

CREATE INDEX IF NOT EXISTS idx_rj_status ON recuperacao_judicial(status);
CREATE INDEX IF NOT EXISTS idx_rj_entity_type ON recuperacao_judicial(entity_type);
CREATE INDEX IF NOT EXISTS idx_rj_state ON recuperacao_judicial(state);
CREATE INDEX IF NOT EXISTS idx_rj_filing_date ON recuperacao_judicial(filing_date DESC);

ALTER TABLE recuperacao_judicial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on recuperacao_judicial" ON recuperacao_judicial FOR SELECT USING (true);
CREATE POLICY "Allow service role write on recuperacao_judicial" ON recuperacao_judicial FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 6. News Knowledge Base (vector storage for archived news)
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

CREATE INDEX IF NOT EXISTS idx_news_knowledge_period ON news_knowledge(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_news_knowledge_category ON news_knowledge(category);
CREATE INDEX IF NOT EXISTS idx_news_knowledge_embedding ON news_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

ALTER TABLE news_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on news_knowledge" ON news_knowledge FOR SELECT USING (true);
CREATE POLICY "Allow service role write on news_knowledge" ON news_knowledge FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- Done! Verify with: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- ============================================================
