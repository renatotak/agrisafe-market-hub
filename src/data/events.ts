// Public events data - all publicly listed agro industry events
// NO proprietary attendance lists or confidential meeting data

export interface AgroEvent {
  id: string;
  name: string;
  date: string;
  endDate?: string;
  location: string;
  type: "conference" | "webinar" | "fair" | "workshop" | "summit";
  description_pt: string;
  description_en: string;
  contentOpportunity_pt: string;
  contentOpportunity_en: string;
  website?: string;
  upcoming: boolean;
}

export const agroEvents: AgroEvent[] = [
  {
    id: "e1",
    name: "Congresso Andav 2026",
    date: "2026-08-12",
    endDate: "2026-08-14",
    location: "Ribeirão Preto, SP",
    type: "conference",
    description_pt: "Principal evento da Associação Nacional dos Distribuidores de Insumos Agrícolas",
    description_en: "Main event of the National Association of Agricultural Input Distributors",
    contentOpportunity_pt: "Artigo sobre tendências em distribuição de insumos; cobertura ao vivo; entrevistas",
    contentOpportunity_en: "Article on input distribution trends; live coverage; interviews",
    upcoming: true,
  },
  {
    id: "e2",
    name: "Agrishow 2026",
    date: "2026-04-28",
    endDate: "2026-05-02",
    location: "Ribeirão Preto, SP",
    type: "fair",
    description_pt: "Maior feira de tecnologia agrícola da América Latina",
    description_en: "Largest agricultural technology fair in Latin America",
    contentOpportunity_pt: "Conteúdo sobre inovação agtech; demos de produto; networking",
    contentOpportunity_en: "Agtech innovation content; product demos; networking",
    upcoming: true,
  },
  {
    id: "e3",
    name: "Febrabantech 2026",
    date: "2026-06-10",
    endDate: "2026-06-12",
    location: "São Paulo, SP",
    type: "conference",
    description_pt: "Congresso de tecnologia e inovação bancária - foco em agro credit",
    description_en: "Banking technology and innovation congress - focus on agro credit",
    contentOpportunity_pt: "Artigo sobre digitalização do crédito rural; fintechs no agro",
    contentOpportunity_en: "Article on rural credit digitization; agro fintechs",
    upcoming: true,
  },
  {
    id: "e4",
    name: "Radar Agtech Summit",
    date: "2026-09-20",
    location: "Piracicaba, SP",
    type: "summit",
    description_pt: "Encontro das principais startups de agtech do Brasil",
    description_en: "Meeting of Brazil's leading agtech startups",
    contentOpportunity_pt: "Mapeamento do ecossistema agtech; tendências de investimento",
    contentOpportunity_en: "Agtech ecosystem mapping; investment trends",
    upcoming: true,
  },
  {
    id: "e5",
    name: "ENCA 2026",
    date: "2026-07-15",
    endDate: "2026-07-17",
    location: "Brasília, DF",
    type: "conference",
    description_pt: "Encontro Nacional do Crédito Agrícola",
    description_en: "National Agricultural Credit Meeting",
    contentOpportunity_pt: "Análise de políticas de crédito rural; novos instrumentos financeiros",
    contentOpportunity_en: "Rural credit policy analysis; new financial instruments",
    upcoming: true,
  },
  {
    id: "e6",
    name: "Embrapa Innovation Day",
    date: "2026-05-20",
    location: "Campinas, SP",
    type: "workshop",
    description_pt: "Dia de inovação e demonstração de novas tecnologias agrícolas",
    description_en: "Innovation day with new agricultural technology demonstrations",
    contentOpportunity_pt: "Conteúdo sobre pesquisa agrícola; parcerias tecnológicas",
    contentOpportunity_en: "Agricultural research content; technology partnerships",
    upcoming: true,
  },
];
