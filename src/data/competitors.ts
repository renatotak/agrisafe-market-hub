// Public competitor data - sourced from public news, websites, and filings only
// NO proprietary intelligence or confidential client data

export interface Competitor {
  id: string;
  name: string;
  segment: string;
  website: string;
  description_pt: string;
  description_en: string;
  signals: CompetitorSignal[];
}

export interface CompetitorSignal {
  id: string;
  type: "product_launch" | "funding" | "partnership" | "hiring" | "news";
  title_pt: string;
  title_en: string;
  date: string;
  source: string;
  url?: string;
}

export const competitors: Competitor[] = [
  {
    id: "comp1",
    name: "TerraMagna",
    segment: "Agrifintech / Credit",
    website: "terramagna.com.br",
    description_pt: "Plataforma de crédito rural com análise de risco por satélite",
    description_en: "Rural credit platform with satellite-based risk analysis",
    signals: [
      { id: "s1", type: "funding", title_pt: "Rodada Series B captada", title_en: "Series B round raised", date: "2025-09-15", source: "Public filing" },
      { id: "s2", type: "product_launch", title_pt: "Novo módulo de monitoramento de CPR", title_en: "New CPR monitoring module launched", date: "2026-01-20", source: "Company blog" },
    ],
  },
  {
    id: "comp2",
    name: "Traive",
    segment: "Agrifintech / Credit",
    website: "traive.com",
    description_pt: "Soluções de crédito digital para o agronegócio",
    description_en: "Digital credit solutions for agribusiness",
    signals: [
      { id: "s3", type: "partnership", title_pt: "Parceria com banco digital anunciada", title_en: "Digital bank partnership announced", date: "2025-11-10", source: "Press release" },
    ],
  },
  {
    id: "comp3",
    name: "Agrotools",
    segment: "Agtech / Data",
    website: "agrotools.com.br",
    description_pt: "Inteligência territorial e análise de compliance ambiental",
    description_en: "Territorial intelligence and environmental compliance analysis",
    signals: [
      { id: "s4", type: "product_launch", title_pt: "Plataforma de due diligence ambiental atualizada", title_en: "Environmental due diligence platform updated", date: "2026-02-05", source: "Company website" },
    ],
  },
  {
    id: "comp4",
    name: "Bart Digital",
    segment: "Agrifintech / Sales",
    website: "bartdigital.com",
    description_pt: "CRM e gestão de vendas para distribuidores de insumos",
    description_en: "CRM and sales management for input distributors",
    signals: [
      { id: "s5", type: "hiring", title_pt: "Expandindo time de vendas (10+ vagas)", title_en: "Expanding sales team (10+ openings)", date: "2026-01-30", source: "LinkedIn" },
    ],
  },
  {
    id: "comp5",
    name: "Agrosafety",
    segment: "Agtech / Insurance",
    website: "agrosafety.com.br",
    description_pt: "Soluções de monitoramento agrícola e análise de risco para seguradoras",
    description_en: "Agricultural monitoring and risk analysis for insurers",
    signals: [
      { id: "s6", type: "news", title_pt: "Cobertura expandida para novas culturas", title_en: "Coverage expanded to new crops", date: "2026-02-15", source: "Industry news" },
    ],
  },
];
