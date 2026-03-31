// Agro news — aggregated from public RSS feeds and news sites
// NO proprietary data

export interface AgroNews {
  id: string;
  title: string;
  summary: string | null;
  source_name: string;
  source_url: string;
  image_url: string | null;
  published_at: string;
  category: string | null;
  tags: string[];
  mentions_producer: boolean;
  producer_names: string[];
  created_at: string;
}

export interface HighlightedProducer {
  id: string;
  name: string;
  keywords: string[];
  active: boolean;
}

export const NEWS_CATEGORIES = [
  'commodities',
  'policy',
  'technology',
  'credit',
  'sustainability',
  'judicial',
  'general',
] as const;

export const NEWS_SOURCES = [
  { id: 'canal-rural', name: 'Canal Rural', rss: 'https://www.canalrural.com.br/feed/' },
  { id: 'sucesso-no-campo', name: 'Sucesso no Campo', rss: 'https://sucessonocampo.com.br/feed/' },
  { id: 'agrolink', name: 'Agrolink', rss: 'https://www.agrolink.com.br/rss/noticias.xml' },
  { id: 'cna-noticias', name: 'CNA Notícias', rss: 'https://cnabrasil.org.br/noticias/rss' },
] as const;
