-- ============================================================
-- Retailer & Industry Intelligence System
-- AI-first enrichment for retailers and industry deep profiles
-- ============================================================

-- 1. Normalized industry (manufacturer) master table
CREATE TABLE IF NOT EXISTS industries (
  id text PRIMARY KEY,                        -- slug: 'syngenta', 'basf', 'bayer'
  name text NOT NULL UNIQUE,                  -- canonical: 'SYNGENTA', 'BASF', 'BAYER'
  name_display text,                          -- display: 'Syngenta', 'BASF CropScience'
  headquarters_country text,
  website text,
  segment text[] DEFAULT '{}',                -- ['defensivos','sementes','fertilizantes']
  description_pt text,
  description_en text,
  agrofit_holder_names text[] DEFAULT '{}',   -- AGROFIT titular_registro variants for matching
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE industries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_industries" ON industries FOR SELECT USING (true);
CREATE POLICY "service_write_industries" ON industries FOR ALL USING (auth.role() = 'service_role');

-- 2. Retailer-Industry junction (replaces free-text industria_1/2/3)
CREATE TABLE IF NOT EXISTS retailer_industries (
  id serial PRIMARY KEY,
  cnpj_raiz text NOT NULL,                   -- FK to retailers.cnpj_raiz
  industry_id text NOT NULL,                  -- FK to industries.id
  relationship_type text DEFAULT 'distributor', -- 'distributor','reseller','exclusive','cooperative_member'
  source text DEFAULT 'imported',             -- 'imported','ai_detected','manual'
  confidence numeric(3,2) DEFAULT 1.0,        -- 0.0-1.0 for AI-detected
  detected_at timestamptz DEFAULT now(),
  UNIQUE(cnpj_raiz, industry_id)
);

CREATE INDEX IF NOT EXISTS idx_ri_cnpj ON retailer_industries(cnpj_raiz);
CREATE INDEX IF NOT EXISTS idx_ri_industry ON retailer_industries(industry_id);

ALTER TABLE retailer_industries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_retailer_industries" ON retailer_industries FOR SELECT USING (true);
CREATE POLICY "service_write_retailer_industries" ON retailer_industries FOR ALL USING (auth.role() = 'service_role');

-- 3. Industry product catalog (from AGROFIT + web research)
CREATE TABLE IF NOT EXISTS industry_products (
  id serial PRIMARY KEY,
  industry_id text NOT NULL,                  -- FK to industries.id
  product_name text NOT NULL,                 -- commercial name
  active_ingredients text[] DEFAULT '{}',     -- molecules
  product_type text,                          -- 'herbicida','inseticida','fungicida','semente','fertilizante','biologico'
  target_cultures text[] DEFAULT '{}',        -- ['soja','milho','algodao']
  agrofit_registro text,                      -- AGROFIT numero_registro if found
  toxicity_class text,
  environmental_class text,
  competitor_products jsonb DEFAULT '[]',      -- [{industry:'basf', product:'Opera'}]
  price_estimate_range text,                  -- 'R$ 150-200/L'
  price_source text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(industry_id, product_name)
);

CREATE INDEX IF NOT EXISTS idx_ip_industry ON industry_products(industry_id);
CREATE INDEX IF NOT EXISTS idx_ip_type ON industry_products(product_type);

ALTER TABLE industry_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_industry_products" ON industry_products FOR SELECT USING (true);
CREATE POLICY "service_write_industry_products" ON industry_products FOR ALL USING (auth.role() = 'service_role');

-- 4. Retailer AI intelligence (the core "brain" table)
CREATE TABLE IF NOT EXISTS retailer_intelligence (
  id serial PRIMARY KEY,
  cnpj_raiz text UNIQUE NOT NULL,            -- FK to retailers.cnpj_raiz

  -- AI-generated analysis
  executive_summary text,                     -- 2-3 paragraph AI summary
  market_position text,                       -- 'regional_leader','expanding','niche_player','stable','declining'

  -- Signals
  risk_signals jsonb DEFAULT '[]',            -- [{type,detail,date}]
  growth_signals jsonb DEFAULT '[]',          -- [{type,detail,date}]

  -- News correlation
  news_mentions integer DEFAULT 0,
  recent_news jsonb DEFAULT '[]',             -- [{news_id,title,date,sentiment,relevance_score}]

  -- Events correlation
  event_connections jsonb DEFAULT '[]',       -- [{event_id,name,date,connection_type}]

  -- Financial intelligence
  financial_instruments jsonb DEFAULT '[]',   -- [{type:'CRA'|'LCA'|'FIDC',detail,amount,date}]

  -- Branch dynamics
  branch_count_current integer,
  branch_count_previous integer,              -- for delta detection
  branch_expansion_detected boolean DEFAULT false,
  new_branches jsonb DEFAULT '[]',            -- [{cnpj,municipio,uf,detected_at}]

  -- Embedding for semantic queries
  embedding vector(1536),

  -- Timestamps
  analyzed_at timestamptz,
  news_scanned_at timestamptz,
  branches_scanned_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rint_embedding ON retailer_intelligence
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_rint_analyzed ON retailer_intelligence(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_rint_position ON retailer_intelligence(market_position);

ALTER TABLE retailer_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_retailer_intelligence" ON retailer_intelligence FOR SELECT USING (true);
CREATE POLICY "service_write_retailer_intelligence" ON retailer_intelligence FOR ALL USING (auth.role() = 'service_role');

-- 5. Semantic search for retailer intelligence
CREATE OR REPLACE FUNCTION match_retailer_intelligence(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  cnpj_raiz text,
  executive_summary text,
  market_position text,
  news_mentions integer,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    ri.cnpj_raiz,
    ri.executive_summary,
    ri.market_position,
    ri.news_mentions,
    1 - (ri.embedding <=> query_embedding) AS similarity
  FROM retailer_intelligence ri
  WHERE ri.embedding IS NOT NULL
    AND 1 - (ri.embedding <=> query_embedding) > match_threshold
  ORDER BY ri.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON TABLE industries IS 'Normalized industry master — ag input manufacturers and major players';
COMMENT ON TABLE retailer_industries IS 'Retailer-Industry junction — replaces free-text industria_1/2/3';
COMMENT ON TABLE industry_products IS 'Product catalog per industry — from AGROFIT + web research';
COMMENT ON TABLE retailer_intelligence IS 'AI-generated intelligence per retailer — news, events, financials, branch dynamics';
