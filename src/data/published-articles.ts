// Published articles from AgriSafe marketing campaigns ONLY
// Source: merged projects data/marketing campaigns/
// Excludes: Tarken articles and any non-AgriSafe channel content

export interface PublishedArticle {
  id: string;
  title: string;
  campaign: string;
  channel: "linkedin" | "instagram" | "blog";
  published_at: string; // ISO date
  status: "published" | "draft" | "scheduled";
  thesis?: string;
  tags: string[];
  hasImage: boolean;
  hasDoc: boolean;
  folder: string; // campaign folder name
}

export const publishedArticles: PublishedArticle[] = [
  // === AgriSafe Campaigns (Mar-Apr 2026) ===
  {
    id: "ag-01",
    title: "O Xadrez de Complexidade do Agro",
    campaign: "Xadrez Virtudes",
    channel: "linkedin",
    published_at: "2026-03-02",
    status: "published",
    thesis: "O agronegócio opera como um tabuleiro de xadrez onde cada peça tem múltiplas dimensões",
    tags: ["complexidade", "xadrez", "estratégia"],
    hasImage: true,
    hasDoc: true,
    folder: "26-0302 xadrez virtudes",
  },
  {
    id: "ag-02",
    title: "Virtudes do Agro",
    campaign: "Virtudes Agro",
    channel: "linkedin",
    published_at: "2026-03-09",
    status: "published",
    tags: ["virtudes", "agro", "valores"],
    hasImage: true,
    hasDoc: true,
    folder: "26-0309 virtudes agro",
  },
  {
    id: "ag-03",
    title: "Dinheiro ou Conhecimento?",
    campaign: "Dinheiro ou Conhecimento",
    channel: "linkedin",
    published_at: "2026-03-16",
    status: "published",
    thesis: "O que vale mais no agro: capital financeiro ou capital intelectual?",
    tags: ["capital", "conhecimento", "investimento"],
    hasImage: true,
    hasDoc: true,
    folder: "26-0316 dinheiro ou conhecimento",
  },
  {
    id: "ag-04",
    title: "Alerta: Recursos Livres do Crédito Rural",
    campaign: "Safra 26/27 Trend",
    channel: "linkedin",
    published_at: "2026-03-23",
    status: "published",
    thesis: "Análise dos recursos livres disponíveis para crédito rural na safra 26/27",
    tags: ["crédito rural", "recursos livres", "safra 26/27"],
    hasImage: true,
    hasDoc: true,
    folder: "26-0323 safra 2627 trend",
  },
  {
    id: "ag-05",
    title: "Matriz de Cenários — Safra 26/27",
    campaign: "Safra 26/27 Trend",
    channel: "linkedin",
    published_at: "2026-03-30",
    status: "published",
    thesis: "Quatro cenários possíveis para a safra 26/27 com base em variáveis macro e micro",
    tags: ["cenários", "safra 26/27", "planejamento"],
    hasImage: true,
    hasDoc: true,
    folder: "26-0323 safra 2627 trend",
  },
  {
    id: "ag-06",
    title: "Cinco Ciclos, Uma Ruptura",
    campaign: "Novo Ciclo",
    channel: "linkedin",
    published_at: "2026-04-06",
    status: "scheduled",
    thesis: "Os cinco grandes ciclos do agro brasileiro e a ruptura que se aproxima",
    tags: ["ciclos", "ruptura", "história", "agro"],
    hasImage: true,
    hasDoc: true,
    folder: "26-0401 novo ciclo",
  },
  {
    id: "ag-07",
    title: "Eficiência: O Novo Crescimento",
    campaign: "Novo Ciclo",
    channel: "linkedin",
    published_at: "2026-04-13",
    status: "draft",
    thesis: "Na era pós-expansão, eficiência operacional substitui crescimento de área como driver de valor",
    tags: ["eficiência", "crescimento", "operacional"],
    hasImage: true,
    hasDoc: true,
    folder: "26-0401 novo ciclo",
  },

  // === Pipeline / New Ideas ===
  {
    id: "ni-01",
    title: "Margem do Produtor em MT",
    campaign: "New Ideas",
    channel: "linkedin",
    published_at: "2026-04-20",
    status: "draft",
    thesis: "Análise detalhada da evolução das margens do produtor em Mato Grosso",
    tags: ["margens", "MT", "produtor"],
    hasImage: false,
    hasDoc: true,
    folder: "New ideas",
  },
];

// Derived campaign list
export const campaigns = [
  ...new Set(publishedArticles.map((a) => a.campaign)),
].map((name) => {
  const articles = publishedArticles.filter((a) => a.campaign === name);
  const dates = articles.map((a) => a.published_at).sort();
  return {
    name,
    articles: articles.length,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    published: articles.filter((a) => a.status === "published").length,
    scheduled: articles.filter((a) => a.status === "scheduled").length,
    draft: articles.filter((a) => a.status === "draft").length,
  };
});
