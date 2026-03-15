// Campaign planning data - NO client names or proprietary data
// Only campaign concepts, timelines, and public-facing content plans

export type CampaignStatus = "draft" | "planned" | "active" | "completed";
export type ContentType = "blog" | "social" | "newsletter" | "press" | "webinar" | "ebook";
export type Channel = "linkedin" | "instagram" | "blog" | "email" | "whatsapp" | "website";

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  channels: Channel[];
  startDate: string;
  endDate: string;
  pillar: string;
  contentPieces: number;
}

export interface ContentIdea {
  id: string;
  title_pt: string;
  title_en: string;
  type: ContentType;
  pillar: string;
  description_pt: string;
  description_en: string;
  keywords: string[];
  trendScore: number;
  suggestedDate?: string;
}

export const sampleCampaigns: Campaign[] = [
  {
    id: "c1",
    name: "Safra 25/26 Market Intelligence",
    description: "Series on crop forecasts and market trends for the 25/26 season",
    status: "active",
    channels: ["linkedin", "blog", "email"],
    startDate: "2026-02-01",
    endDate: "2026-04-30",
    pillar: "Market Trends",
    contentPieces: 12,
  },
  {
    id: "c2",
    name: "Credit Risk in Agro - Educational Series",
    description: "Educational content on credit risk management for agricultural resellers",
    status: "planned",
    channels: ["blog", "linkedin", "whatsapp"],
    startDate: "2026-04-01",
    endDate: "2026-06-30",
    pillar: "Credit Risk",
    contentPieces: 8,
  },
  {
    id: "c3",
    name: "Digital Twin & Precision Agriculture",
    description: "Thought leadership on digital twin technology in crop monitoring",
    status: "draft",
    channels: ["blog", "linkedin", "website"],
    startDate: "2026-05-01",
    endDate: "2026-07-31",
    pillar: "Crop Monitoring",
    contentPieces: 6,
  },
  {
    id: "c4",
    name: "CERC & CPR Awareness",
    description: "Awareness campaign about receivables registry and rural credit instruments",
    status: "completed",
    channels: ["linkedin", "email", "blog"],
    startDate: "2025-11-01",
    endDate: "2026-01-31",
    pillar: "Credit Risk",
    contentPieces: 10,
  },
];

export const contentIdeas: ContentIdea[] = [
  {
    id: "i1",
    title_pt: "Impacto do câmbio na rentabilidade do produtor rural",
    title_en: "Exchange rate impact on rural producer profitability",
    type: "blog",
    pillar: "Market Trends",
    description_pt: "Análise de como variações no USD/BRL afetam margens dos produtores de soja e milho",
    description_en: "Analysis of how USD/BRL fluctuations affect soy and corn producer margins",
    keywords: ["câmbio", "produtor rural", "rentabilidade", "soja", "milho"],
    trendScore: 92,
    suggestedDate: "2026-03-20",
  },
  {
    id: "i2",
    title_pt: "CERC: O que muda para as revendas agrícolas em 2026",
    title_en: "CERC: What changes for agricultural resellers in 2026",
    type: "blog",
    pillar: "Credit Risk",
    description_pt: "Guia prático sobre as novas regras da Central de Recebíveis e impacto no crédito agro",
    description_en: "Practical guide on new receivables registry rules and impact on agro credit",
    keywords: ["CERC", "crédito rural", "revendas", "CPR", "recebíveis"],
    trendScore: 88,
    suggestedDate: "2026-03-25",
  },
  {
    id: "i3",
    title_pt: "Monitoramento de safra por satélite: tendências 2026",
    title_en: "Satellite crop monitoring: 2026 trends",
    type: "blog",
    pillar: "Crop Monitoring",
    description_pt: "Como a tecnologia de sensoriamento remoto está transformando o acompanhamento de safras",
    description_en: "How remote sensing technology is transforming crop tracking",
    keywords: ["sensoriamento remoto", "safra", "satélite", "monitoramento"],
    trendScore: 85,
    suggestedDate: "2026-04-01",
  },
  {
    id: "i4",
    title_pt: "5 métricas de score agro que toda revenda deve acompanhar",
    title_en: "5 agro credit scoring metrics every reseller should track",
    type: "social",
    pillar: "Sales Optimization",
    description_pt: "Infográfico com as métricas essenciais para gestão de risco de crédito agrícola",
    description_en: "Infographic with essential metrics for agricultural credit risk management",
    keywords: ["score agro", "métricas", "revenda", "crédito"],
    trendScore: 90,
    suggestedDate: "2026-03-22",
  },
  {
    id: "i5",
    title_pt: "Perspectivas do agronegócio brasileiro para 2026-2027",
    title_en: "Brazilian agribusiness outlook for 2026-2027",
    type: "newsletter",
    pillar: "Market Trends",
    description_pt: "Resumo das projeções de safra, exportações e crédito rural para o próximo biênio",
    description_en: "Summary of crop, export, and rural credit projections for the next biennium",
    keywords: ["agronegócio", "projeções", "2026", "2027", "safra"],
    trendScore: 95,
    suggestedDate: "2026-04-05",
  },
  {
    id: "i6",
    title_pt: "Como a IA está otimizando a concessão de crédito agrícola",
    title_en: "How AI is optimizing agricultural credit allocation",
    type: "press",
    pillar: "Credit Risk",
    description_pt: "Artigo sobre o uso de algoritmos de ML na análise de risco para o agro",
    description_en: "Article on the use of ML algorithms in risk analysis for agribusiness",
    keywords: ["IA", "crédito", "machine learning", "agro", "risco"],
    trendScore: 87,
  },
];
