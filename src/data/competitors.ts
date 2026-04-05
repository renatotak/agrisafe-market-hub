// Public competitor data - sourced from public news, websites, and filings only
// NO proprietary intelligence or confidential client data

export type CompetitorVertical = 'Credit' | 'Intelligence' | 'Consulting' | 'Regulatory' | 'Agtech / Insurance';

export interface CompetitorSignal {
  id: string;
  competitor_id: string;
  type: "product_launch" | "funding" | "partnership" | "hiring" | "news";
  title_pt: string;
  title_en: string;
  date: string;
  source: string;
  url?: string;
}

export interface Competitor {
  id: string;
  name: string;
  vertical: CompetitorVertical;
  website: string;
  description_pt: string;
  description_en: string;
  scores: {
    depth: number;      // 0-4
    precision: number;  // 0-4
    pulse: number;      // 0-4
    regulatory: number; // 0-4
    ux: number;         // 0-4
    credit: number;     // 0-4
  };
  signals: CompetitorSignal[];
}

export const competitors: Competitor[] = [
  {
    id: "agrisafe",
    name: "AgriSafe",
    vertical: "Intelligence",
    website: "agrisafe.com.br",
    description_pt: "Intelig\u00eancia executiva e estrutura\u00e7\u00e3o financeira para o agroneg\u00f3cio",
    description_en: "Executive intelligence and financial structuring for agribusiness",
    scores: { depth: 4, precision: 4, pulse: 4, regulatory: 4, ux: 4, credit: 4 },
    signals: [],
  },
  {
    id: "traive",
    name: "Traive",
    vertical: "Credit",
    website: "traive.com",
    description_pt: "IA para an\u00e1lise de risco e estrutura\u00e7\u00e3o de cr\u00e9dito. Pioneira em 'digital twins' de especialistas de cr\u00e9dito.",
    description_en: "AI for risk analysis and credit structuring. Pioneer in 'digital twins' of credit specialists.",
    scores: { depth: 2, precision: 4, pulse: 2, regulatory: 1, ux: 2, credit: 4 },
    signals: [
      { id: "tr1", competitor_id: "traive", type: "product_launch", title_pt: "Expans\u00e3o da plataforma de r\u00e9plicas digitais para an\u00e1lise de risco", title_en: "Expansion of digital twin platform for risk analysis", date: "2026-02-10", source: "InfoMoney" },
      { id: "tr2", competitor_id: "traive", type: "partnership", title_pt: "Parceria com Fiagros para cust\u00f3dia digital de receb\u00edveis", title_en: "Partnership with Fiagros for digital receivable custody", date: "2025-11-15", source: "Exame" },
    ],
  },
  {
    id: "terramagna",
    name: "TerraMagna",
    vertical: "Credit",
    website: "terramagna.com.br",
    description_pt: "Foco em revendas de insumos. Lan\u00e7ou a plataforma TM Digital para gest\u00e3o de risco de terceiros.",
    description_en: "Focus on input retailers. Launched TM Digital platform for third-party risk management.",
    scores: { depth: 3, precision: 4, pulse: 2, regulatory: 1, ux: 2, credit: 4 },
    signals: [
      { id: "tm1", competitor_id: "terramagna", type: "product_launch", title_pt: "Lan\u00e7amento oficial do TM Digital para revendas e cooperativas", title_en: "Official launch of TM Digital for retailers and cooperatives", date: "2025-10-20", source: "AgFeed" },
      { id: "tm2", competitor_id: "terramagna", type: "news", title_pt: "Redu\u00e7\u00e3o de 30% na inadimpl\u00eancia de carteiras monitoradas via sat\u00e9lite", title_en: "30% reduction in delinquency for satellite-monitored portfolios", date: "2026-01-05", source: "Valor" },
    ],
  },
  {
    id: "agrolend",
    name: "Agrolend",
    vertical: "Credit",
    website: "agrolend.com.br",
    description_pt: "Institui\u00e7\u00e3o financeira digital (SCD) focada em cr\u00e9dito r\u00e1pido para produtores via revendas.",
    description_en: "Digital financial institution (SCD) focused on fast credit for farmers via retailers.",
    scores: { depth: 1, precision: 3, pulse: 3, regulatory: 3, ux: 4, credit: 4 },
    signals: [
      { id: "al1", competitor_id: "agrolend", type: "funding", title_pt: "Capta\u00e7\u00e3o de R$ 500M em FIDC liderado por grandes bancos", title_en: "R$ 500M FIDC funding led by major banks", date: "2025-12-12", source: "CNN Brasil" },
    ],
  },
  {
    id: "agrotools",
    name: "Agrotools",
    vertical: "Intelligence",
    website: "agrotools.com.br",
    description_pt: "L\u00edder em intelig\u00eancia territorial e compliance socioambiental (EUDR).",
    description_en: "Leader in territorial intelligence and socio-environmental compliance (EUDR).",
    scores: { depth: 3, precision: 3, pulse: 1, regulatory: 3, ux: 3, credit: 2 },
    signals: [
      { id: "at1", competitor_id: "agrotools", type: "product_launch", title_pt: "Nova ferramenta de conformidade autom\u00e1tica com regramento EUDR", title_en: "New automatic compliance tool for EUDR regulation", date: "2026-03-01", source: "MundoCoop" },
    ],
  },
  {
    id: "sette",
    name: "Sette",
    vertical: "Credit",
    website: "sette.ag",
    description_pt: "Nascida da fus\u00e3o entre Bart Digital e A de Agro, a Sette combina monitoramento territorial via IA com digitaliza\u00e7\u00e3o de garantias e t\u00edtulos agr\u00edcolas (CPR).",
    description_en: "Formed by the merger of Bart Digital and A de Agro, Sette combines AI-driven field monitoring with the digitalization of agricultural guarantees and bonds (CPR).",
    scores: { depth: 2, precision: 3, pulse: 1, regulatory: 4, ux: 2, credit: 3 },
    signals: [
      { id: "bd1", competitor_id: "sette", type: "partnership", title_pt: "Integra\u00e7\u00e3o com B3 para registro simplificado de CPRs", title_en: "Integration with B3 for simplified CPR registration", date: "2026-01-25", source: "Press release" },
    ],
  },
  {
    id: "agrosafety",
    name: "Agrosafety",
    vertical: "Agtech / Insurance",
    website: "agrosafety.com.br",
    description_pt: "Solu\u00e7\u00f5es de monitoramento agr\u00edcola e an\u00e1lise de risco para seguradoras.",
    description_en: "Agricultural monitoring and risk analysis for insurers.",
    scores: { depth: 2, precision: 3, pulse: 2, regulatory: 2, ux: 2, credit: 2 },
    signals: [],
  },
];
