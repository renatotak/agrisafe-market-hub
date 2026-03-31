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

export const GRUPO_ACESSO_OPTIONS = ['CANAL RD', 'DISTRIBUIDOR', 'PLATAFORMA', 'COOPERATIVA'] as const;
export const CLASSIFICACAO_OPTIONS = ['A', 'B', 'C', 'D'] as const;
export const UF_OPTIONS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
] as const;
