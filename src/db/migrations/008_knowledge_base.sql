-- ============================================================
-- Knowledge Base — 4-Tier Hierarchy
-- Implements the Knowledge Architecture from docs/KNOWLEDGE_ARCHITECTURE.md
-- ============================================================

-- Unified knowledge items table (all 4 tiers in one table for simpler querying)
CREATE TABLE IF NOT EXISTS knowledge_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Tier classification
  tier integer NOT NULL CHECK (tier BETWEEN 1 AND 4),
    -- 1 = Market Data (recurring numerical)
    -- 2 = News & Events (non-recurring qualitative)
    -- 3 = Static Definitions (persistent truth tables, regulations)
    -- 4 = Curated Insights (AgriSafe proprietary)

  -- Core content
  title text NOT NULL,
  content text,                          -- full text content
  summary text,                          -- AI-generated or manual summary

  -- Source tracking
  source_type text NOT NULL,             -- 'commodity_price', 'news', 'regulatory_norm', 'event', 'article', 'manual'
  source_table text,                     -- originating Supabase table
  source_id text,                        -- ID in the source table
  source_url text,

  -- Dynamic metadata tags (from Knowledge Architecture doc)
  data_origin text DEFAULT 'tier_1_public',  -- 'tier_1_public', 'agrisafe_proprietary', 'partner'
  timing text DEFAULT 'recurring',           -- 'persistent', 'recurring', 'non_recurring'
  purpose text[] DEFAULT '{}',               -- 'marketing', 'commercial', 'credit_analysis'
  lgpd_clear boolean DEFAULT true,

  -- Value chain positioning
  value_chain text[] DEFAULT '{}',       -- 'tradings', 'agro_industries', 'financial_institutions', 'retailers', 'rural_producers'

  -- Categorization
  category text,                         -- 'commodities', 'credit', 'technology', 'policy', 'sustainability', 'judicial', etc.
  tags text[] DEFAULT '{}',
  keywords text[] DEFAULT '{}',          -- for search matching

  -- Embedding (pgvector)
  embedding vector(1536),                -- text-embedding-3-small

  -- Timestamps
  published_at timestamptz,
  indexed_at timestamptz DEFAULT now(),
  expires_at timestamptz,                -- for recurring data that becomes stale

  created_at timestamptz DEFAULT now()
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_ki_tier ON knowledge_items(tier);
CREATE INDEX IF NOT EXISTS idx_ki_source_type ON knowledge_items(source_type);
CREATE INDEX IF NOT EXISTS idx_ki_category ON knowledge_items(category);
CREATE INDEX IF NOT EXISTS idx_ki_indexed ON knowledge_items(indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ki_source ON knowledge_items(source_table, source_id);

-- Vector similarity search index (IVFFlat — good for <100K items)
CREATE INDEX IF NOT EXISTS idx_ki_embedding ON knowledge_items
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- RLS
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkthub_public_read_ki" ON knowledge_items FOR SELECT USING (true);
CREATE POLICY "mkthub_service_write_ki" ON knowledge_items FOR ALL USING (auth.role() = 'service_role');
