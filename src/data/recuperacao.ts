// Recuperação Judicial monitoring — sourced from public court records and legal news
// NO proprietary data

export type DebtValueSource = 'legal_rss' | 'ddg_scrape' | 'serasa' | 'manual';

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
  debt_value: number | null;
  debt_value_source: DebtValueSource | null;
  created_at: string;
}

export const DEBT_SOURCE_LABELS: Record<DebtValueSource, { pt: string; en: string; color: string }> = {
  legal_rss:  { pt: 'RSS Jurídico',  en: 'Legal RSS',  color: 'bg-indigo-100 text-indigo-800' },
  ddg_scrape: { pt: 'Web Scan',      en: 'Web Scan',   color: 'bg-purple-100 text-purple-800' },
  serasa:     { pt: 'Serasa',         en: 'Serasa',     color: 'bg-sky-100 text-sky-800' },
  manual:     { pt: 'Manual',         en: 'Manual',     color: 'bg-neutral-100 text-neutral-700' },
};

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
  { id: 'conjur', name: 'ConJur', rss: 'https://www.conjur.com.br/feed/' },
  // Migalhas RSS discontinued (404 since ~Apr 2026).
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
