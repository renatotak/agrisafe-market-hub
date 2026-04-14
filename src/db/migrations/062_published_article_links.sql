-- ============================================================
-- Migration 062: published_article_links — public URL per article
-- ============================================================
-- The published-articles catalog (src/data/published-articles.ts) is
-- a hardcoded TS file with no URL column. Since LinkedIn now exposes
-- public post URLs, we need a place to store them per article without
-- forcing a code edit + redeploy on every new article.
--
-- This table is keyed by `article_id` (the same string id used in
-- `published-articles.ts`) and carries the public URL plus an
-- optional og:title / og:description / og:image snapshot fetched
-- once on save so cards can render LinkedIn covers without an
-- extra round-trip per render.
-- ============================================================

CREATE TABLE IF NOT EXISTS published_article_links (
  article_id      text PRIMARY KEY,                       -- mirrors published-articles.ts ids (e.g. 'ag-07')
  url             text NOT NULL,
  channel         text,                                   -- 'linkedin' | 'instagram' | 'blog' | 'other'
  og_title        text,
  og_description  text,
  og_image        text,
  og_fetched_at   timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pal_channel ON published_article_links(channel);
CREATE INDEX IF NOT EXISTS idx_pal_updated ON published_article_links(updated_at DESC);

ALTER TABLE published_article_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read published_article_links" ON published_article_links;
CREATE POLICY "Public read published_article_links" ON published_article_links FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service write published_article_links" ON published_article_links;
CREATE POLICY "Service write published_article_links" ON published_article_links FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION trg_pal_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pal_touch ON published_article_links;
CREATE TRIGGER pal_touch BEFORE UPDATE ON published_article_links
  FOR EACH ROW EXECUTE FUNCTION trg_pal_touch();

COMMENT ON TABLE published_article_links IS
  'Public URLs for AgriSafe published articles (LinkedIn etc.). Decoupled from the hardcoded TS catalog so new URLs can be added via UI without a code change.';
