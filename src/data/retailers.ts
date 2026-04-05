// Ag input retailers directory — sourced from AgriSafe's public channel mapping
// NO proprietary client relationship data

export interface Retailer {
  id: number;
  cnpj_raiz: string;
  consolidacao: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  grupo_acesso: string | null;
  tipo_acesso: string | null;
  faixa_faturamento: string | null;
  industria_1: string | null;
  industria_2: string | null;
  industria_3: string | null;
  classificacao: string | null;
  possui_loja_fisica: string | null;
  capital_social: number | null;
  porte: string | null;
  porte_name: string | null;
}

export interface RetailerLocation {
  id: number;
  cnpj: string | null;
  cnpj_raiz: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  uf: string | null;
  municipio: string | null;
  latitude: number | null;
  longitude: number | null;
}

// --- Industry & Intelligence types ---

export interface Industry {
  id: string;
  name: string;
  name_display: string | null;
  headquarters_country: string | null;
  website: string | null;
  segment: string[];
  description_pt: string | null;
  description_en: string | null;
  agrofit_holder_names: string[];
}

export interface RetailerIndustry {
  id: number;
  cnpj_raiz: string;
  industry_id: string;
  relationship_type: string;
  source: string;
  confidence: number;
  // joined
  industry?: Industry;
}

export interface IndustryProduct {
  id: number;
  industry_id: string;
  product_name: string;
  active_ingredients: string[];
  product_type: string | null;
  target_cultures: string[];
  agrofit_registro: string | null;
  toxicity_class: string | null;
  environmental_class: string | null;
  competitor_products: { industry: string; product: string }[];
  price_estimate_range: string | null;
  price_source: string | null;
}

export interface RetailerIntelligence {
  cnpj_raiz: string;
  executive_summary: string | null;
  market_position: string | null;
  risk_signals: { type: string; detail: string; date?: string }[];
  growth_signals: { type: string; detail: string; date?: string }[];
  news_mentions: number;
  recent_news: { news_id: string; title: string; date: string; sentiment?: string; relevance_score?: number }[];
  event_connections: { event_id: string; name: string; date: string; connection_type?: string }[];
  financial_instruments: { type: string; detail: string; amount?: string; date?: string }[];
  branch_count_current: number | null;
  branch_count_previous: number | null;
  branch_expansion_detected: boolean;
  new_branches: { cnpj: string; municipio: string; uf: string; detected_at: string }[];
  analyzed_at: string | null;
}

export const GRUPO_ACESSO_OPTIONS = ['CANAL RD', 'DISTRIBUIDOR', 'PLATAFORMA', 'COOPERATIVA'] as const;
export const CLASSIFICACAO_OPTIONS = ['A', 'B', 'C', 'D'] as const;
export const UF_OPTIONS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
] as const;
