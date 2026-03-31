// Recuperação Judicial monitoring — sourced from public court records and legal news
// NO proprietary data

export interface RecuperacaoJudicial {
  id: string;
  entity_name: string;
  entity_cnpj: string | null;
  entity_type: string | null;
  court: string | null;
  case_number: string | null;
  status: string | null;
  filing_date: string | null;
  summary: string | null;
  source_url: string | null;
  source_name: string | null;
  state: string | null;
  created_at: string;
}

export const ENTITY_TYPES = {
  produtor_rural: { pt: 'Produtor Rural', en: 'Rural Producer' },
  empresa_agro: { pt: 'Empresa Agro', en: 'Agro Company' },
  cooperativa: { pt: 'Cooperativa', en: 'Cooperative' },
  usina: { pt: 'Usina', en: 'Sugar Mill / Plant' },
  outros: { pt: 'Outros', en: 'Other' },
} as const;

export const RJ_STATUS = {
  deferido: { pt: 'Deferido', en: 'Granted', color: 'bg-red-100 text-red-800' },
  em_andamento: { pt: 'Em Andamento', en: 'In Progress', color: 'bg-amber-100 text-amber-800' },
  encerrado: { pt: 'Encerrado', en: 'Closed', color: 'bg-emerald-100 text-emerald-800' },
  indeferido: { pt: 'Indeferido', en: 'Denied', color: 'bg-slate-100 text-slate-700' },
} as const;

export const RJ_NEWS_SOURCES = [
  { id: 'conjur', name: 'ConJur', rss: 'https://www.conjur.com.br/rss.xml' },
  { id: 'migalhas', name: 'Migalhas', rss: 'https://www.migalhas.com.br/rss/quentes.xml' },
] as const;

// Keywords used to filter relevant articles
export const RJ_KEYWORDS = [
  'recuperação judicial',
  'recuperacao judicial',
  'falência',
  'produtor rural',
  'agronegócio',
  'usina',
  'cooperativa agrícola',
  'agropecuária',
] as const;
