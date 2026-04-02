-- ============================================================
-- AgriSafe Market Hub — Content Tables
-- For ContentHub module (published articles + topic pipeline)
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- Published articles (LinkedIn, Instagram, Blog, etc.)
CREATE TABLE IF NOT EXISTS published_articles (
  id text PRIMARY KEY,
  title text NOT NULL,
  channel text NOT NULL,              -- 'linkedin', 'instagram', 'blog', 'website'
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
  status text DEFAULT 'published',    -- 'draft', 'scheduled', 'published'
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_published_articles_channel ON published_articles(channel);
CREATE INDEX IF NOT EXISTS idx_published_articles_published ON published_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_articles_status ON published_articles(status);

ALTER TABLE published_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read on published_articles" ON published_articles FOR SELECT USING (true);
CREATE POLICY "Service role write on published_articles" ON published_articles FOR ALL USING (auth.role() = 'service_role');

-- Content topic pipeline
CREATE TABLE IF NOT EXISTS content_topics (
  id text PRIMARY KEY,
  thesis_pt text NOT NULL,
  thesis_en text,
  supporting_data text[] DEFAULT '{}',
  historical_angle_pt text,
  historical_angle_en text,
  suggested_week text,                -- ISO week: '2026-W15'
  target_channel text DEFAULT 'linkedin',
  status text DEFAULT 'suggested',    -- 'suggested', 'approved', 'in_progress', 'published'
  keywords text[] DEFAULT '{}',
  published_article_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_topics_status ON content_topics(status);
CREATE INDEX IF NOT EXISTS idx_content_topics_week ON content_topics(suggested_week);

ALTER TABLE content_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read on content_topics" ON content_topics FOR SELECT USING (true);
CREATE POLICY "Service role write on content_topics" ON content_topics FOR ALL USING (auth.role() = 'service_role');
