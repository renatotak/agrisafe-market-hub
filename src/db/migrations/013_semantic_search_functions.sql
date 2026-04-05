-- Semantic search RPC functions for pgvector similarity queries
-- Used by /api/knowledge/search when GEMINI_API_KEY is configured

-- Match knowledge_items by embedding similarity
CREATE OR REPLACE FUNCTION match_knowledge_items(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20,
  filter_tiers int[] DEFAULT NULL,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  tier int,
  title text,
  summary text,
  source_type text,
  category text,
  tags text[],
  published_at timestamptz,
  source_url text,
  data_origin text,
  timing text,
  purpose text[],
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
    ki.source_type,
    ki.category,
    ki.tags,
    ki.published_at,
    ki.source_url,
    ki.data_origin,
    ki.timing,
    ki.purpose,
    1 - (ki.embedding <=> query_embedding) AS similarity
  FROM knowledge_items ki
  WHERE ki.embedding IS NOT NULL
    AND 1 - (ki.embedding <=> query_embedding) > match_threshold
    AND (filter_tiers IS NULL OR ki.tier = ANY(filter_tiers))
    AND (filter_category IS NULL OR ki.category = filter_category)
  ORDER BY ki.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Match news_knowledge by embedding similarity
CREATE OR REPLACE FUNCTION match_news_knowledge(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  category text,
  source_name text,
  summary text,
  key_topics text[],
  period_start date,
  period_end date,
  article_count int,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    nk.id,
    nk.category,
    nk.source_name,
    nk.summary,
    nk.key_topics,
    nk.period_start,
    nk.period_end,
    nk.article_count,
    1 - (nk.embedding <=> query_embedding) AS similarity
  FROM news_knowledge nk
  WHERE nk.embedding IS NOT NULL
    AND 1 - (nk.embedding <=> query_embedding) > match_threshold
  ORDER BY nk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
