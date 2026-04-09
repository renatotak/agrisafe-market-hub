-- ============================================================
-- Migration 040 — Tier-aware semantic search (Phase 24G)
-- Depends on: 008 (knowledge_items), 013 (match_knowledge_items),
--             022 (confidentiality column on knowledge_items)
-- ============================================================
--
-- The chat / RAG endpoint at /api/knowledge/chat retrieves knowledge_items
-- via the match_knowledge_items() RPC defined in migration 013. That
-- function had no `confidentiality` filter — every chat call could
-- surface rows tagged `agrisafe_confidential` (CRM notes, lead pipeline,
-- meeting summaries) regardless of the caller's tier.
--
-- Phase 24G fixes this by adding a `filter_tiers_text` argument and
-- defaulting it to ['public'] when not provided. The chat API now
-- resolves the caller's tier via src/lib/confidentiality.ts and passes
-- the visible tier list explicitly. Service-role contexts (cron) can
-- still pass NULL to bypass the filter.
--
-- Backward compat: the function signature is REPLACED (not added as a
-- new overload) because Postgres can't disambiguate two functions with
-- the same name and a single nullable text[] arg without explicit casts
-- at every call site. Existing callers that don't pass the new arg
-- get the safest default (public-only).
-- ============================================================

-- Drop the old signature explicitly so we can change the default tier
-- behavior without leaving a phantom overload around.
DROP FUNCTION IF EXISTS match_knowledge_items(vector, float, int, int[], text);

CREATE OR REPLACE FUNCTION match_knowledge_items(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20,
  filter_tiers int[] DEFAULT NULL,
  filter_category text DEFAULT NULL,
  filter_confidentiality text[] DEFAULT ARRAY['public']::text[]
)
RETURNS TABLE (
  id uuid,
  tier int,
  title text,
  summary text,
  content text,
  source_type text,
  category text,
  tags text[],
  published_at timestamptz,
  source_url text,
  data_origin text,
  timing text,
  purpose text[],
  confidentiality text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    ki.id,
    ki.tier,
    ki.title,
    ki.summary,
    ki.content,
    ki.source_type,
    ki.category,
    ki.tags,
    ki.published_at,
    ki.source_url,
    ki.data_origin,
    ki.timing,
    ki.purpose,
    ki.confidentiality,
    1 - (ki.embedding <=> query_embedding) AS similarity
  FROM knowledge_items ki
  WHERE ki.embedding IS NOT NULL
    AND 1 - (ki.embedding <=> query_embedding) > match_threshold
    AND (filter_tiers IS NULL OR ki.tier = ANY(filter_tiers))
    AND (filter_category IS NULL OR ki.category = filter_category)
    -- NEW: confidentiality filter. NULL means "all tiers" (service role
    -- bypass). Default at the function level is public-only so any caller
    -- that forgets to pass it gets the safest behavior.
    AND (filter_confidentiality IS NULL OR ki.confidentiality = ANY(filter_confidentiality))
  ORDER BY ki.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_knowledge_items IS
  'Phase 24G — semantic search over knowledge_items with deterministic confidentiality filtering. Default filter_confidentiality is [public] so any caller that omits the arg gets the safest behavior. Pass NULL to bypass (service role only).';

-- ─── Index to make the new filter cheap ──────────────────────
-- The composite index covers the common chat path: filter on
-- confidentiality first (small, low cardinality), then ORDER BY
-- embedding similarity. The existing per-column embedding index already
-- handles the vector search portion.

CREATE INDEX IF NOT EXISTS idx_ki_confidentiality
  ON knowledge_items(confidentiality);
