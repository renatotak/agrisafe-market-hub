// News knowledge base — summarized + embedded archives of old news
// Stored with pgvector embeddings for semantic search

export interface NewsKnowledge {
  id: string;
  period_start: string;
  period_end: string;
  category: string | null;
  source_name: string | null;
  summary: string;
  key_topics: string[];
  article_count: number;
  embedding: number[] | null;
  created_at: string;
}
