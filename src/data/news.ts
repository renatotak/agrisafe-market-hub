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
  'livestock',
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
  { id: 'portal-agronegocio', name: 'Portal do Agronegócio', rss: 'https://www.portaldoagronegocio.com.br/feed' },
  { id: 'sna', name: 'SNA', rss: 'https://www.sna.agr.br/feed/' },
  { id: 'beefpoint', name: 'BeefPoint', rss: 'https://www.beefpoint.com.br/feed/' },
] as const;
