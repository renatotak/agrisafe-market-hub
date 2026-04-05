/**
 * Centralized mock data for UX/UI evaluation.
 * All modules use this data when Supabase tables are empty.
 * Data is realistic but fictional — no real PII or proprietary information.
 */

// ─── Data Sources ───

export interface MockDataSource {
  id: string;
  name: string;
  type: "api" | "rss" | "file";
  description: string;
  endpoint: string;
  frequency: string;
  last_sync: string | null;
  records_count: number;
  status: "healthy" | "warning" | "stale" | "never";
  target_table: string;
  error?: string;
}

export const mockDataSources: MockDataSource[] = [
  { id: "bcb-soy", name: "BCB SGS \u2014 Soja", type: "api", description: "CEPEA/BCB s\u00e9rie 11752", endpoint: "api.bcb.gov.br/dados/serie/bcdata.sgs.11752", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:02:14Z", records_count: 1247, status: "healthy", target_table: "commodity_prices" },
  { id: "bcb-corn", name: "BCB SGS \u2014 Milho", type: "api", description: "CEPEA/BCB s\u00e9rie 11753", endpoint: "api.bcb.gov.br/dados/serie/bcdata.sgs.11753", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:02:18Z", records_count: 1247, status: "healthy", target_table: "commodity_prices" },
  { id: "bcb-coffee", name: "BCB SGS \u2014 Caf\u00e9", type: "api", description: "CEPEA/BCB s\u00e9rie 11754", endpoint: "api.bcb.gov.br/dados/serie/bcdata.sgs.11754", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:02:22Z", records_count: 1247, status: "healthy", target_table: "commodity_prices" },
  { id: "bcb-sugar", name: "BCB SGS \u2014 A\u00e7\u00facar", type: "api", description: "CEPEA/BCB s\u00e9rie 11755", endpoint: "api.bcb.gov.br/dados/serie/bcdata.sgs.11755", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:02:25Z", records_count: 1247, status: "healthy", target_table: "commodity_prices" },
  { id: "bcb-cotton", name: "BCB SGS \u2014 Algod\u00e3o", type: "api", description: "CEPEA/BCB s\u00e9rie 11756", endpoint: "api.bcb.gov.br/dados/serie/bcdata.sgs.11756", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:02:28Z", records_count: 1247, status: "healthy", target_table: "commodity_prices" },
  { id: "bcb-citrus", name: "BCB SGS \u2014 Laranja", type: "api", description: "CEPEA/BCB s\u00e9rie 11757", endpoint: "api.bcb.gov.br/dados/serie/bcdata.sgs.11757", frequency: "Di\u00e1rio", last_sync: "2026-03-28T08:02:31Z", records_count: 1245, status: "warning", target_table: "commodity_prices" },
  { id: "bcb-usd", name: "BCB SGS \u2014 USD/BRL", type: "api", description: "PTAX s\u00e9rie 1", endpoint: "api.bcb.gov.br/dados/serie/bcdata.sgs.1", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:02:35Z", records_count: 8430, status: "healthy", target_table: "market_indicators" },
  { id: "bcb-selic", name: "BCB SGS \u2014 Selic", type: "api", description: "Taxa Selic s\u00e9rie 432", endpoint: "api.bcb.gov.br/dados/serie/bcdata.sgs.432", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:02:38Z", records_count: 6200, status: "healthy", target_table: "market_indicators" },
  { id: "rss-canal", name: "Canal Rural", type: "rss", description: "Feed RSS de not\u00edcias", endpoint: "canalrural.com.br/feed/", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:05:12Z", records_count: 342, status: "healthy", target_table: "agro_news" },
  { id: "rss-sucesso", name: "Sucesso no Campo", type: "rss", description: "Feed RSS de not\u00edcias", endpoint: "sucessonocampo.com.br/feed/", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:05:28Z", records_count: 218, status: "healthy", target_table: "agro_news" },
  { id: "rss-agrolink", name: "Agrolink", type: "rss", description: "Feed RSS de not\u00edcias", endpoint: "agrolink.com.br/rss/noticias.xml", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:05:35Z", records_count: 410, status: "healthy", target_table: "agro_news" },
  { id: "rss-cna", name: "CNA Not\u00edcias", type: "rss", description: "Feed RSS CNA Brasil", endpoint: "cnabrasil.org.br/noticias/rss", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:05:42Z", records_count: 156, status: "healthy", target_table: "agro_news" },
  { id: "rss-conjur", name: "ConJur (Jur\u00eddico)", type: "rss", description: "Feed RSS filtrado para RJ agro", endpoint: "conjur.com.br/rss.xml", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:06:10Z", records_count: 47, status: "healthy", target_table: "recuperacao_judicial" },
  { id: "rss-migalhas", name: "Migalhas (Jur\u00eddico)", type: "rss", description: "Feed RSS filtrado para RJ agro", endpoint: "migalhas.com.br/rss", frequency: "Di\u00e1rio", last_sync: "2026-03-31T08:06:18Z", records_count: 31, status: "healthy", target_table: "recuperacao_judicial" },
  { id: "file-retailers", name: "Registros Estaduais", type: "file", description: "Import Excel de revendas por estado", endpoint: "Upload manual", frequency: "Sob demanda", last_sync: "2026-02-15T14:30:00Z", records_count: 23861, status: "warning", target_table: "retailers" },
  { id: "bcb-normativos", name: "BCB Normativos", type: "api", description: "API de normas do Banco Central", endpoint: "bcb.gov.br/api/normativos", frequency: "Di\u00e1rio", last_sync: null, records_count: 0, status: "never", target_table: "regulatory_norms", error: "Cron n\u00e3o implementado (Phase 13)" },
];

export interface MockSyncLog {
  id: string;
  source: string;
  started_at: string;
  finished_at: string;
  records_fetched: number;
  records_inserted: number;
  errors: number;
  status: "success" | "error" | "partial";
  error_message?: string;
}

export const mockSyncLogs: MockSyncLog[] = [
  { id: "sl1", source: "sync-market-data", started_at: "2026-03-31T08:00:01Z", finished_at: "2026-03-31T08:02:42Z", records_fetched: 8, records_inserted: 8, errors: 0, status: "success" },
  { id: "sl2", source: "sync-agro-news", started_at: "2026-03-31T08:03:00Z", finished_at: "2026-03-31T08:05:45Z", records_fetched: 24, records_inserted: 18, errors: 0, status: "success" },
  { id: "sl3", source: "sync-recuperacao-judicial", started_at: "2026-03-31T08:06:00Z", finished_at: "2026-03-31T08:06:22Z", records_fetched: 12, records_inserted: 2, errors: 0, status: "success" },
  { id: "sl4", source: "sync-market-data", started_at: "2026-03-30T08:00:01Z", finished_at: "2026-03-30T08:02:38Z", records_fetched: 8, records_inserted: 8, errors: 0, status: "success" },
  { id: "sl5", source: "sync-agro-news", started_at: "2026-03-30T08:03:00Z", finished_at: "2026-03-30T08:05:30Z", records_fetched: 31, records_inserted: 22, errors: 1, status: "partial", error_message: "Agrolink: timeout ap\u00f3s 15s em 1 artigo" },
  { id: "sl6", source: "sync-recuperacao-judicial", started_at: "2026-03-30T08:06:00Z", finished_at: "2026-03-30T08:06:19Z", records_fetched: 8, records_inserted: 1, errors: 0, status: "success" },
  { id: "sl7", source: "sync-market-data", started_at: "2026-03-29T08:00:01Z", finished_at: "2026-03-29T08:02:50Z", records_fetched: 8, records_inserted: 8, errors: 0, status: "success" },
  { id: "sl8", source: "sync-agro-news", started_at: "2026-03-29T08:03:00Z", finished_at: "2026-03-29T08:04:55Z", records_fetched: 19, records_inserted: 15, errors: 0, status: "success" },
  { id: "sl9", source: "sync-market-data", started_at: "2026-03-28T08:00:01Z", finished_at: "2026-03-28T08:01:10Z", records_fetched: 6, records_inserted: 6, errors: 2, status: "partial", error_message: "BCB series 11757 e 11756: HTTP 503" },
  { id: "sl10", source: "sync-agro-news", started_at: "2026-03-28T08:03:00Z", finished_at: "2026-03-28T08:05:12Z", records_fetched: 28, records_inserted: 20, errors: 0, status: "success" },
  { id: "sl11", source: "sync-recuperacao-judicial", started_at: "2026-03-28T08:06:00Z", finished_at: "2026-03-28T08:06:25Z", records_fetched: 15, records_inserted: 3, errors: 0, status: "success" },
  { id: "sl12", source: "sync-market-data", started_at: "2026-03-27T08:00:01Z", finished_at: "2026-03-27T08:02:35Z", records_fetched: 8, records_inserted: 8, errors: 0, status: "success" },
];

// ─── Market Pulse ───

export const mockCommodities = [
  { id: "soy", name_pt: "Soja", name_en: "Soybean", price: 138.42, unit: "R$/sc 60kg", change_24h: 1.8, source: "CEPEA/BCB", last_update: "2026-03-31" },
  { id: "corn", name_pt: "Milho", name_en: "Corn", price: 72.15, unit: "R$/sc 60kg", change_24h: -0.6, source: "CEPEA/BCB", last_update: "2026-03-31" },
  { id: "coffee", name_pt: "Caf\u00e9 Ar\u00e1bica", name_en: "Arabica Coffee", price: 1287.50, unit: "R$/sc 60kg", change_24h: 3.2, source: "CEPEA/BCB", last_update: "2026-03-31" },
  { id: "sugar", name_pt: "A\u00e7\u00facar Cristal", name_en: "Crystal Sugar", price: 142.80, unit: "R$/sc 50kg", change_24h: 0.4, source: "CEPEA/BCB", last_update: "2026-03-31" },
  { id: "cotton", name_pt: "Algod\u00e3o", name_en: "Cotton", price: 82.35, unit: "\u00a2/lb", change_24h: -1.1, source: "CEPEA/BCB", last_update: "2026-03-31" },
  { id: "citrus", name_pt: "Laranja", name_en: "Orange", price: 38.90, unit: "R$/cx 40.8kg", change_24h: 0.0, source: "CEPEA/BCB", last_update: "2026-03-28" },
];

export const mockIndicators = [
  { id: "usd_brl", name_pt: "C\u00e2mbio USD/BRL", name_en: "USD/BRL Exchange", value: "R$ 5.7284", trend: "up" as const, source: "BCB" },
  { id: "selic", name_pt: "Taxa Selic", name_en: "Selic Rate", value: "14.25%", trend: "stable" as const, source: "BCB" },
  { id: "agro_exports", name_pt: "Exporta\u00e7\u00f5es Agro 2026", name_en: "Agro Exports 2026", value: "US$ 42.3 bi", trend: "up" as const, source: "MAPA" },
  { id: "rural_credit", name_pt: "Cr\u00e9dito Rural", name_en: "Rural Credit", value: "R$ 400.6 bi", trend: "stable" as const, source: "BNDES/BCB" },
  { id: "crop_soy", name_pt: "Safra Soja 25/26", name_en: "Soy Crop 25/26", value: "172.4 mi ton", trend: "up" as const, source: "CONAB" },
];

export const mockPriceHistory = (() => {
  const commodityIds = ["soy", "corn", "coffee", "sugar", "cotton", "citrus"];
  const basePrices: Record<string, number> = { soy: 130, corn: 70, coffee: 1200, sugar: 138, cotton: 80, citrus: 37 };
  const history: { id: string; commodity_id: string; price: number; change_24h: number; recorded_at: string }[] = [];
  let n = 0;
  for (let day = 20; day >= 0; day--) {
    const d = new Date(2026, 2, 31);
    d.setDate(d.getDate() - day);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = d.toISOString().split("T")[0];
    for (const cid of commodityIds) {
      const base = basePrices[cid];
      const jitter = (Math.sin(day * 1.3 + commodityIds.indexOf(cid) * 2.7) * 0.04 + (20 - day) * 0.003) * base;
      const price = parseFloat((base + jitter).toFixed(2));
      const prev = history.filter((h) => h.commodity_id === cid).slice(-1)[0];
      const change = prev ? parseFloat(((price - prev.price) / prev.price * 100).toFixed(2)) : 0;
      history.push({ id: `ph${n++}`, commodity_id: cid, price, change_24h: change, recorded_at: dateStr });
    }
  }
  return history;
})();

// ─── Agro News ───

export const mockNews = [
  { id: "n1", title: "Soja brasileira atinge recorde de exporta\u00e7\u00e3o em mar\u00e7o de 2026", summary: "Pa\u00eds exportou 16,2 milh\u00f5es de toneladas no m\u00eas, superando recorde anterior de 2024.", source_name: "Canal Rural", source_url: "https://canalrural.com.br/noticias/soja", image_url: null, published_at: "2026-03-31", category: "commodities", tags: ["soja", "exporta\u00e7\u00e3o", "recorde"], mentions_producer: false, producer_names: [], created_at: "2026-03-31" },
  { id: "n2", title: "Governo anuncia novas linhas de cr\u00e9dito para agricultura familiar", summary: "Plano Safra 2026/27 destina R$ 85 bilh\u00f5es para pequenos produtores com juros reduzidos.", source_name: "CNA Not\u00edcias", source_url: "https://cnabrasil.org.br/noticias/credito", image_url: null, published_at: "2026-03-30", category: "credit", tags: ["cr\u00e9dito rural", "plano safra", "agricultura familiar"], mentions_producer: false, producer_names: [], created_at: "2026-03-30" },
  { id: "n3", title: "Startup usa IA para prever quebra de safra com 90 dias de anteced\u00eancia", summary: "Tecnologia combina dados de sat\u00e9lite e modelos clim\u00e1ticos para alertar produtores sobre riscos.", source_name: "Agrolink", source_url: "https://agrolink.com.br/noticias/ia-safra", image_url: null, published_at: "2026-03-29", category: "technology", tags: ["IA", "safra", "previs\u00e3o", "sat\u00e9lite"], mentions_producer: true, producer_names: ["SLC Agr\u00edcola"], created_at: "2026-03-29" },
  { id: "n4", title: "Milho segunda safra: previs\u00e3o de chuvas favorece plantio no Mato Grosso", summary: "Clima \u00famido nas regi\u00f5es produtoras deve favorecer desenvolvimento da safrinha de milho.", source_name: "Sucesso no Campo", source_url: "https://sucessonocampo.com.br/milho", image_url: null, published_at: "2026-03-28", category: "commodities", tags: ["milho", "safrinha", "clima", "MT"], mentions_producer: false, producer_names: [], created_at: "2026-03-28" },
  { id: "n5", title: "Uni\u00e3o Europeia endurece regras de sustentabilidade para importa\u00e7\u00f5es agr\u00edcolas", summary: "Novas exig\u00eancias de rastreabilidade podem impactar exporta\u00e7\u00f5es brasileiras a partir de 2027.", source_name: "Canal Rural", source_url: "https://canalrural.com.br/noticias/ue-sustentabilidade", image_url: null, published_at: "2026-03-27", category: "sustainability", tags: ["UE", "sustentabilidade", "exporta\u00e7\u00e3o", "rastreabilidade"], mentions_producer: false, producer_names: [], created_at: "2026-03-27" },
  { id: "n6", title: "Caf\u00e9 ar\u00e1bica sobe 3% ap\u00f3s relat\u00f3rio indicar geada em Minas Gerais", summary: "Pre\u00e7os reagiram a previs\u00f5es clim\u00e1ticas que apontam risco de geada no sul de Minas.", source_name: "Agrolink", source_url: "https://agrolink.com.br/noticias/cafe-geada", image_url: null, published_at: "2026-03-26", category: "commodities", tags: ["caf\u00e9", "geada", "MG", "pre\u00e7os"], mentions_producer: true, producer_names: ["Cooxup\u00e9"], created_at: "2026-03-26" },
  { id: "n7", title: "Nova pol\u00edtica agr\u00edcola amplia seguro rural para regi\u00e3o Norte", summary: "Programa do governo federal vai subsidiar at\u00e9 60% do valor do pr\u00eamio de seguro para produtores da regi\u00e3o amaz\u00f4nica.", source_name: "CNA Not\u00edcias", source_url: "https://cnabrasil.org.br/noticias/seguro-norte", image_url: null, published_at: "2026-03-25", category: "policy", tags: ["seguro rural", "pol\u00edtica", "Norte", "amaz\u00f4nia"], mentions_producer: false, producer_names: [], created_at: "2026-03-25" },
  { id: "n8", title: "Recupera\u00e7\u00e3o judicial de usina sucroalcooleira impacta fornecedores no interior de SP", summary: "Usina S\u00e3o Fernando entra em recupera\u00e7\u00e3o judicial com d\u00edvidas de R$ 340 milh\u00f5es.", source_name: "Canal Rural", source_url: "https://canalrural.com.br/noticias/rj-usina", image_url: null, published_at: "2026-03-24", category: "judicial", tags: ["recupera\u00e7\u00e3o judicial", "usina", "SP"], mentions_producer: false, producer_names: [], created_at: "2026-03-24" },
  { id: "n9", title: "Tecnologia blockchain ga\u00e7\u00e3o para rastrear cadeia da soja sustent\u00e1vel", summary: "Plataforma permite rastreabilidade do gr\u00e3o desde o plantio at\u00e9 o porto de exporta\u00e7\u00e3o.", source_name: "Sucesso no Campo", source_url: "https://sucessonocampo.com.br/blockchain-soja", image_url: null, published_at: "2026-03-23", category: "technology", tags: ["blockchain", "soja", "rastreabilidade"], mentions_producer: false, producer_names: [], created_at: "2026-03-23" },
  { id: "n10", title: "Algod\u00e3o brasileiro ganha selo de qualidade internacional", summary: "Certifica\u00e7\u00e3o BCI reconhece padr\u00f5es de produ\u00e7\u00e3o sustent\u00e1vel do algod\u00e3o nacional.", source_name: "Agrolink", source_url: "https://agrolink.com.br/noticias/algodao-bci", image_url: null, published_at: "2026-03-22", category: "sustainability", tags: ["algod\u00e3o", "BCI", "sustentabilidade", "certifica\u00e7\u00e3o"], mentions_producer: false, producer_names: [], created_at: "2026-03-22" },
];

// ─── Competitors ───

export const mockCompetitors = [
  {
    id: "agrisafe",
    name: "AgriSafe",
    vertical: "Intelligence",
    website: "agrisafe.com.br",
    description_pt: "Intelig\u00eancia executiva e estrutura\u00e7\u00e3o financeira para o agroneg\u00f3cio",
    description_en: "Executive intelligence and financial structuring for agribusiness",
    scores: { depth: 4, precision: 4, pulse: 4, regulatory: 4, ux: 4, credit: 4 },
    competitor_signals: [],
  },
  {
    id: "traive",
    name: "Traive",
    vertical: "Credit",
    website: "traive.com",
    description_pt: "IA para an\u00e1lise de risco e estrutura\u00e7\u00e3o de cr\u00e9dito. Pioneira em 'digital twins' de especialistas de cr\u00e9dito.",
    description_en: "AI for risk analysis and credit structuring. Pioneer in 'digital twins' of credit specialists.",
    scores: { depth: 2, precision: 4, pulse: 2, regulatory: 1, ux: 2, credit: 4 },
    competitor_signals: [
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
    competitor_signals: [
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
    competitor_signals: [
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
    competitor_signals: [
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
    competitor_signals: [
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
    competitor_signals: [],
  },
];

// ─── Events ───

export const mockEvents = [
// Base Events

  { id: "e1", name: "Agrishow 2026", type: "fair", date_start: "2026-04-28", date_end: "2026-05-02", location: "Ribeir\u00e3o Preto, SP", description_pt: "Maior feira de tecnologia agr\u00edcola da Am\u00e9rica Latina.", description_en: "Largest agricultural technology fair in Latin America.", content_opportunity: true, tags: ["feira", "tecnologia", "agro"] },
  { id: "e2", name: "Congresso Brasileiro do Agroneg\u00f3cio", type: "conference", date_start: "2026-06-10", date_end: "2026-06-12", location: "S\u00e3o Paulo, SP", description_pt: "Reuni\u00e3o de l\u00edderes do setor para discuss\u00e3o de pol\u00edticas e tend\u00eancias.", description_en: "Industry leaders meeting to discuss policies and trends.", content_opportunity: true, tags: ["congresso", "pol\u00edtica", "tend\u00eancias"] },
  { id: "e3", name: "Webinar CERC & CPR Digital", type: "webinar", date_start: "2026-04-15", date_end: "2026-04-15", location: "Online", description_pt: "Sess\u00e3o sobre novas regras da central de receb\u00edveis.", description_en: "Session on new receivables registry rules.", content_opportunity: true, tags: ["CERC", "CPR", "webinar", "cr\u00e9dito"] },
  { id: "e4", name: "TechAgro Summit", type: "conference", date_start: "2026-07-22", date_end: "2026-07-23", location: "Cuiab\u00e1, MT", description_pt: "Confer\u00eancia sobre inova\u00e7\u00e3o e transforma\u00e7\u00e3o digital no agro.", description_en: "Conference on innovation and digital transformation in agriculture.", content_opportunity: false, tags: ["tech", "digital", "inova\u00e7\u00e3o"] },
  { id: "e5", name: "Expodireto Cotrijal 2026", type: "fair", date_start: "2026-03-03", date_end: "2026-03-07", location: "N\u00e3o-Me-Toque, RS", description_pt: "Feira internacional focada em m\u00e1quinas e insumos agr\u00edcolas.", description_en: "International fair focused on machinery and agricultural inputs.", content_opportunity: false, tags: ["feira", "m\u00e1quinas", "insumos", "RS"] },
  { id: "e6", name: "Workshop Cr\u00e9dito Rural Sustent\u00e1vel", type: "webinar", date_start: "2026-05-08", date_end: "2026-05-08", location: "Online", description_pt: "Discuss\u00e3o sobre financiamento verde e ESG no agroneg\u00f3cio.", description_en: "Discussion on green financing and ESG in agribusiness.", content_opportunity: true, tags: ["cr\u00e9dito", "ESG", "sustentabilidade"] },
  { id: "e7", name: "Interconf\u00e9d\u00e9ral Agro 2026", type: "conference", date_start: "2026-08-18", date_end: "2026-08-20", location: "Bras\u00edlia, DF", description_pt: "Encontro das confedera\u00e7\u00f5es estaduais de agricultura.", description_en: "Meeting of state agricultural confederations.", content_opportunity: false, tags: ["confedera\u00e7\u00e3o", "pol\u00edtica", "estados"] },
  { id: "e8", name: "Seminário Nacional do Milho", type: "workshop", date_start: "2026-05-20", date_end: "2026-05-21", location: "Curitiba, PR", description_pt: "Novas tecnologias para aumento de produtividade (Fonte: Notícias Agrícolas).", description_en: "New technologies for productivity increase.", content_opportunity: false, tags: ["milho", "sementes"] },
  { id: "e9", name: "AgroTech Brasil 2026", type: "summit", date_start: "2026-09-15", date_end: "2026-09-17", location: "Campinas, SP", description_pt: "Fórum de inovação tecnológica do agro brasileiro (Fonte: Notícias Agrícolas).", description_en: "Brazilian agro technological innovation forum.", content_opportunity: true, tags: ["tecnologia", "inovação"] },
  { id: "e10", name: "Fórum de Mercado e Clima", type: "conference", date_start: "2026-08-05", date_end: "2026-08-06", location: "Goiânia, GO", description_pt: "Impactos climáticos na safrinha 2026 (Fonte: Agroagenda)", description_en: "Climate impacts on the 2026 off-season.", content_opportunity: true, tags: ["clima", "mercado", "safrinha"] },

// Auto-scraped fallback items
  { id: "na_0", name: "Innovation Week | Corteva Agriscience", type: "conference", date_start: "2026-09-02", date_end: "2026-09-04", location: "Curitiba, PR", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_1", name: "Fruit Attraction São Paulo 2026", type: "summit", date_start: "2026-05-19", date_end: "2026-05-20", location: "Campinas, SP", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_2", name: "Femagri 2026 | Agroeasy", type: "fair", date_start: "2026-07-10", date_end: "2026-07-10", location: "Sinop, MT", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_3", name: "Lançamento da Colheita da Soja | Aprosoja Pará", type: "fair", date_start: "2026-08-11", date_end: "2026-08-14", location: "Cascavel, PR", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_4", name: "Femagri 2026", type: "webinar", date_start: "2026-05-03", date_end: "2026-05-05", location: "Curitiba, PR", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_5", name: "Expodireto Cotrijal 2026 | Cresol", type: "summit", date_start: "2026-10-02", date_end: "2026-10-05", location: "Sinop, MT", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_6", name: "Assembleia Geral Ordinária do Sistema ABCS", type: "workshop", date_start: "2026-08-12", date_end: "2026-08-15", location: "Curitiba, PR", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_7", name: "Expodireto Cotrijal 2026", type: "fair", date_start: "2026-05-03", date_end: "2026-05-05", location: "Curitiba, PR", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_8", name: "Expodireto Cotrijal 2026 | Bayer", type: "workshop", date_start: "2026-04-01", date_end: "2026-04-02", location: "Curitiba, PR", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_9", name: "Lançamento de plataforma Ag Care | Agroceres Multimix", type: "summit", date_start: "2026-03-07", date_end: "2026-03-08", location: "Goiânia, GO", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_10", name: "Bayer | AgroRosário 2026", type: "webinar", date_start: "2026-07-14", date_end: "2026-07-16", location: "Cuiabá, MT", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_11", name: "Coplacampo 2026", type: "conference", date_start: "2026-10-04", date_end: "2026-10-04", location: "Goiânia, GO", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_12", name: "Show Rural Coopavel 2026 | Yanmar", type: "summit", date_start: "2026-08-17", date_end: "2026-08-19", location: "Campinas, SP", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_13", name: "Show Rural Coopavel 2026 | Jacto", type: "webinar", date_start: "2026-08-10", date_end: "2026-08-12", location: "Sinop, MT", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_14", name: "Show Rural Coopavel 2026 | Agross", type: "conference", date_start: "2026-04-18", date_end: "2026-04-21", location: "Campinas, SP", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_15", name: "Show Rural Coopavel 2026 | Sicredi", type: "workshop", date_start: "2026-03-19", date_end: "2026-03-19", location: "Goiânia, GO", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_16", name: "Show Rural Coopavel 2026", type: "summit", date_start: "2026-05-18", date_end: "2026-05-19", location: "São Paulo, SP", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_17", name: "Show Rural Coopavel 2026 | Bayer", type: "summit", date_start: "2026-08-19", date_end: "2026-08-21", location: "Cuiabá, MT", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_18", name: "Feira do Cerrado 2026", type: "summit", date_start: "2026-06-02", date_end: "2026-06-03", location: "Campinas, SP", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] },
  { id: "na_19", name: "CTECNO Parecis - Especial 10 Anos", type: "summit", date_start: "2026-06-10", date_end: "2026-06-12", location: "Curitiba, PR", description_pt: "Evento referenciado na plataforma Notícias Agrícolas.", description_en: "Event referenced from Notícias Agrícolas platform.", content_opportunity: true, tags: ["agro"] }
];


// ─── Recupera\u00e7\u00e3o Judicial ───

export const mockRecuperacaoJudicial = [
  { id: "rj1", entity_name: "Usina S\u00e3o Fernando Alimentos S.A.", entity_type: "usina", state: "SP", source_name: "ConJur", source_url: "https://conjur.com.br/rj-sao-fernando", published_at: "2026-03-24", summary: "Usina sucroalcooleira entra em recupera\u00e7\u00e3o judicial com d\u00edvidas de R$ 340 milh\u00f5es.", debt_value: 340000000, created_at: "2026-03-24" },
  { id: "rj2", entity_name: "Grupo Agrofaz Ltda.", entity_type: "distribuidor", state: "GO", source_name: "Migalhas", source_url: "https://migalhas.com.br/rj-agrofaz", published_at: "2026-03-20", summary: "Distribuidor de insumos de Goi\u00e1nia pede RJ ap\u00f3s inadimpl\u00eancia de R$ 85 milh\u00f5es.", debt_value: 85000000, created_at: "2026-03-20" },
  { id: "rj3", entity_name: "Frigor\u00edfico Boi Verde S.A.", entity_type: "frigor\u00edfico", state: "MT", source_name: "ConJur", source_url: "https://conjur.com.br/rj-boi-verde", published_at: "2026-03-15", summary: "Frigor\u00edfico em Cuiab\u00e1 com passivo de R$ 210 milh\u00f5es em RJ.", debt_value: 210000000, created_at: "2026-03-15" },
  { id: "rj4", entity_name: "Cooperativa Agr\u00edcola Central do Paran\u00e1", entity_type: "cooperativa", state: "PR", source_name: "Migalhas", source_url: "https://migalhas.com.br/rj-cooperativa-pr", published_at: "2026-03-10", summary: "Cooperativa de Cascavel em RJ com d\u00edvidas trabalhistas e tribut\u00e1rias de R$ 52 milh\u00f5es.", debt_value: 52000000, created_at: "2026-03-10" },
  { id: "rj5", entity_name: "Fazendas Reunidas Mato Grosso do Sul", entity_type: "produtor", state: "MS", source_name: "ConJur", source_url: "https://conjur.com.br/rj-fazendas-ms", published_at: "2026-02-28", summary: "Grupo pecuarista com 15 mil hectares pede RJ por d\u00edvidas de R$ 180 milh\u00f5es.", debt_value: 180000000, created_at: "2026-02-28" },
];

// ─── Market Alerts ───

export const mockMarketAlerts = [
  { id: "ma1", commodity_id: "coffee", type: "rupture" as const, message_pt: "Caf\u00e9 subiu 3.2% em 24h \u2014 maior alta desde jan/2026. Geada em MG impulsiona pre\u00e7os.", message_en: "Coffee up 3.2% in 24h \u2014 largest rise since Jan 2026. Frost in MG drives prices.", severity: "high" as const, timestamp: "2026-03-31T08:00:00Z" },
  { id: "ma2", commodity_id: "soy", type: "price_spike" as const, message_pt: "Soja acumula 5 dias consecutivos de alta. Demanda chinesa aqu\u00e9cida.", message_en: "Soybean accumulates 5 consecutive days of gains. Strong Chinese demand.", severity: "medium" as const, timestamp: "2026-03-31T08:00:00Z" },
  { id: "ma3", commodity_id: "cotton", type: "price_spike" as const, message_pt: "Algod\u00e3o recua 1.1% ap\u00f3s relat\u00f3rio USDA indicar estoques acima do esperado.", message_en: "Cotton drops 1.1% after USDA report indicates above-expected stocks.", severity: "low" as const, timestamp: "2026-03-31T08:00:00Z" },
  { id: "ma4", commodity_id: "citrus", type: "stale_data" as const, message_pt: "Dados de laranja sem atualiza\u00e7\u00e3o h\u00e1 3 dias. Verificar fonte BCB.", message_en: "Orange data not updated for 3 days. Check BCB source.", severity: "medium" as const, timestamp: "2026-03-31T08:00:00Z" },
];

// ─── Published Articles (LinkedIn / Content) ───

export const mockPublishedArticles = [
  { id: "pa1", title: "O paradoxo do cr\u00e9dito rural: por que as revendas n\u00e3o conseguem financiar os produtores que mais precisam", channel: "linkedin", url: "https://linkedin.com/pulse/paradoxo-credito-rural", published_at: "2026-03-28", summary: "An\u00e1lise da assimetria de informa\u00e7\u00e3o no cr\u00e9dito agro e como a tecnologia pode resolver.", thesis: "Assimetria de informa\u00e7\u00e3o no cr\u00e9dito rural", historical_reference: "Crise de cr\u00e9dito de 2015-2016", engagement_views: 3420, engagement_likes: 187, engagement_comments: 42, engagement_shares: 28, tags: ["cr\u00e9dito rural", "revendas", "fintech"], status: "published" },
  { id: "pa2", title: "CPR digital: a revolu\u00e7\u00e3o silenciosa que est\u00e1 mudando o agroneg\u00f3cio", channel: "linkedin", url: "https://linkedin.com/pulse/cpr-digital-revolucao", published_at: "2026-03-21", summary: "Como a digitaliza\u00e7\u00e3o das C\u00e9dulas de Produto Rural est\u00e1 transformando o financiamento agr\u00edcola.", thesis: "Digitaliza\u00e7\u00e3o de t\u00edtulos agro", historical_reference: "Cria\u00e7\u00e3o da CPR em 1994 (Lei 8.929)", engagement_views: 5100, engagement_likes: 312, engagement_comments: 67, engagement_shares: 45, tags: ["CPR", "digital", "financiamento"], status: "published" },
  { id: "pa3", title: "3 li\u00e7\u00f5es do Plano Safra 2025/26 que ningu\u00e9m est\u00e1 discutindo", channel: "linkedin", url: "https://linkedin.com/pulse/licoes-plano-safra", published_at: "2026-03-14", summary: "Pontos cr\u00edticos do plano que passaram despercebidos pelo mercado.", thesis: "Gaps no Plano Safra", historical_reference: "Compara\u00e7\u00e3o com Plano Safra 2020/21", engagement_views: 4200, engagement_likes: 256, engagement_comments: 53, engagement_shares: 31, tags: ["plano safra", "pol\u00edtica agr\u00edcola"], status: "published" },
  { id: "pa4", title: "Recupera\u00e7\u00e3o judicial no agro: o que os n\u00fameros de 2025 nos ensinam", channel: "linkedin", url: "https://linkedin.com/pulse/rj-agro-numeros", published_at: "2026-03-07", summary: "An\u00e1lise dos pedidos de RJ no setor agr\u00edcola e padr\u00f5es identificados.", thesis: "Padr\u00f5es de insol\u00eancia no agro", historical_reference: "Onda de RJs de 2023-2024", engagement_views: 6800, engagement_likes: 421, engagement_comments: 89, engagement_shares: 67, tags: ["recupera\u00e7\u00e3o judicial", "risco"], status: "published" },
  { id: "pa5", title: "Por que o ESG vai redefinir o acesso a cr\u00e9dito agr\u00edcola at\u00e9 2028", channel: "linkedin", url: "https://linkedin.com/pulse/esg-credito-agricola", published_at: "2026-02-28", summary: "Impacto das novas exig\u00eancias ESG europeias no financiamento do agro brasileiro.", thesis: "ESG como barreira/oportunidade no cr\u00e9dito", historical_reference: "Acordo de Paris e regulamenta\u00e7\u00e3o EU 2023", engagement_views: 7200, engagement_likes: 534, engagement_comments: 112, engagement_shares: 78, tags: ["ESG", "cr\u00e9dito", "sustentabilidade"], status: "published" },
  { id: "pa6", title: "Safra 25/26: o que esperar do milho safrinha", channel: "instagram", url: "https://instagram.com/p/agrisafe-milho", published_at: "2026-03-25", summary: "Infogr\u00e1fico sobre perspectivas da segunda safra de milho.", thesis: "Perspectivas safrinha", historical_reference: null, engagement_views: 1850, engagement_likes: 290, engagement_comments: 15, engagement_shares: 42, tags: ["milho", "safrinha"], status: "published" },
];

export const mockContentTopics = [
  { id: "ct1", thesis_pt: "O impacto da taxa Selic em 14.25% na cadeia de cr\u00e9dito rural: winners e losers", thesis_en: "Impact of 14.25% Selic rate on rural credit chain: winners and losers", supporting_data: ["Selic hist\u00f3rica", "Spread banc\u00e1rio agro", "Volume de CPRs emitidas"], historical_angle_pt: "Comparar com ciclo de alta de juros 2015-2016 e efeito no cr\u00e9dito agro", historical_angle_en: "Compare with 2015-2016 interest rate hike cycle and effect on agro credit", suggested_week: "2026-W15", target_channel: "linkedin", status: "approved", keywords: ["selic", "cr\u00e9dito rural", "juros"] },
  { id: "ct2", thesis_pt: "Como a China est\u00e1 redesenhando o mapa de exporta\u00e7\u00e3o da soja brasileira", thesis_en: "How China is redesigning the Brazilian soy export map", supporting_data: ["Volumes de exporta\u00e7\u00e3o por porto", "Pre\u00e7os FOB", "Demanda chinesa mensal"], historical_angle_pt: "Evolu\u00e7\u00e3o da rela\u00e7\u00e3o Brasil-China desde o embargo dos EUA em 2018", historical_angle_en: "Evolution of Brazil-China relationship since 2018 US embargo", suggested_week: "2026-W16", target_channel: "linkedin", status: "suggested", keywords: ["soja", "China", "exporta\u00e7\u00e3o"] },
  { id: "ct3", thesis_pt: "CERC 2.0: as novas regras que v\u00e3o impactar registradoras e revendas em 2026", thesis_en: "CERC 2.0: new rules that will impact registrars and resellers in 2026", supporting_data: ["Resolu\u00e7\u00e3o CMN recente", "Volume de duplicatas registradas", "Mercado de receb\u00edveis agro"], historical_angle_pt: "Da cria\u00e7\u00e3o da CERC em 2021 at\u00e9 as mudan\u00e7as regulat\u00f3rias de 2026", historical_angle_en: "From CERC creation in 2021 to 2026 regulatory changes", suggested_week: "2026-W17", target_channel: "linkedin", status: "suggested", keywords: ["CERC", "regula\u00e7\u00e3o", "receb\u00edveis"] },
  { id: "ct4", thesis_pt: "Seguro rural: por que o produtor ainda n\u00e3o contrata (e o que precisa mudar)", thesis_en: "Rural insurance: why farmers still don't buy it (and what needs to change)", supporting_data: ["Taxa de ades\u00e3o ao PROAGRO", "Sinistrialidade por regi\u00e3o", "Subs\u00eddio federal vs. demanda"], historical_angle_pt: "Evolu\u00e7\u00e3o do seguro rural desde o PROAGRO (1973)", historical_angle_en: "Evolution of rural insurance since PROAGRO (1973)", suggested_week: "2026-W18", target_channel: "linkedin", status: "suggested", keywords: ["seguro rural", "PROAGRO"] },
  { id: "ct5", thesis_pt: "5 indicadores que toda revenda agro deve monitorar semanalmente", thesis_en: "5 indicators every agro reseller should monitor weekly", supporting_data: ["USD/BRL", "Pre\u00e7os CEPEA", "Volume de vendas", "Inadimpl\u00eancia", "Estoque"], historical_angle_pt: "Gest\u00e3o de risco nas crises de 2020 e 2023", historical_angle_en: "Risk management during 2020 and 2023 crises", suggested_week: "2026-W19", target_channel: "instagram", status: "suggested", keywords: ["indicadores", "gest\u00e3o", "revendas"] },
  { id: "ct6", thesis_pt: "A intelig\u00eancia artificial no campo: da previs\u00e3o de safra ao score de cr\u00e9dito", thesis_en: "AI in the field: from crop forecasting to credit scoring", supporting_data: ["Casos de uso de ML no agro", "Acur\u00e1cia de modelos de previs\u00e3o", "Adocao de IA por bancos agro"], historical_angle_pt: "Do sensoriamento remoto nos anos 2000 \u00e0 IA generativa em 2025", historical_angle_en: "From remote sensing in the 2000s to generative AI in 2025", suggested_week: "2026-W20", target_channel: "linkedin", status: "suggested", keywords: ["IA", "machine learning", "agro"] },
  { id: "ct7", thesis_pt: "Barter digital: como a troca de insumos por gr\u00e3os est\u00e1 se modernizando", thesis_en: "Digital barter: how grain-for-input exchanges are modernizing", supporting_data: ["Volume de barter no Brasil", "Plataformas digitais", "Risco de contraparte"], historical_angle_pt: "Origem do barter no cerrado nos anos 1990", historical_angle_en: "Origin of barter in the cerrado in the 1990s", suggested_week: "2026-W21", target_channel: "linkedin", status: "suggested", keywords: ["barter", "insumos", "digital"] },
  { id: "ct8", thesis_pt: "O mapa da recupera\u00e7\u00e3o judicial agro: quais estados e setores concentram os pedidos", thesis_en: "The agro judicial recovery map: which states and sectors concentrate filings", supporting_data: ["Dados de RJ por estado", "Setores mais afetados", "Valor m\u00e9dio de d\u00edvida"], historical_angle_pt: "Compara\u00e7\u00e3o com mapa de 2023-2024", historical_angle_en: "Comparison with 2023-2024 map", suggested_week: "2026-W22", target_channel: "linkedin", status: "suggested", keywords: ["recupera\u00e7\u00e3o judicial", "estados", "setores"] },
  { id: "ct9", thesis_pt: "Armazenagem: o gargalo silencioso que custa bilh\u00f5es ao agro brasileiro", thesis_en: "Storage: the silent bottleneck costing billions to Brazilian agribusiness", supporting_data: ["D\u00e9ficit de armazenagem CONAB", "Perdas p\u00f3s-colheita", "Investimentos necess\u00e1rios"], historical_angle_pt: "A crise de armazenagem de 2013 e li\u00e7\u00f5es n\u00e3o aprendidas", historical_angle_en: "The 2013 storage crisis and lessons not learned", suggested_week: "2026-W23", target_channel: "linkedin", status: "suggested", keywords: ["armazenagem", "log\u00edstica", "perdas"] },
  { id: "ct10", thesis_pt: "Tokeniza\u00e7\u00e3o de ativos rurais: hype ou transforma\u00e7\u00e3o real?", thesis_en: "Tokenization of rural assets: hype or real transformation?", supporting_data: ["Projetos de tokeniza\u00e7\u00e3o no Brasil", "Marco legal (Lei 14.478)", "Casos internacionais"], historical_angle_pt: "Da CPR f\u00edsica \u00e0 CPR digital e agora ao token", historical_angle_en: "From physical CPR to digital CPR and now to tokens", suggested_week: "2026-W24", target_channel: "linkedin", status: "suggested", keywords: ["tokeniza\u00e7\u00e3o", "blockchain", "ativos rurais"] },
  { id: "ct11", thesis_pt: "Infogr\u00e1fico: Safra 25/26 em n\u00fameros \u2014 soja, milho e algod\u00e3o", thesis_en: "Infographic: 25/26 Crop in numbers \u2014 soy, corn and cotton", supporting_data: ["Proje\u00e7\u00f5es CONAB", "Compara\u00e7\u00e3o safra anterior", "\u00c1rea plantada vs. produtividade"], historical_angle_pt: null, historical_angle_en: null, suggested_week: "2026-W16", target_channel: "instagram", status: "approved", keywords: ["safra", "infogr\u00e1fico", "produ\u00e7\u00e3o"] },
  { id: "ct12", thesis_pt: "Carrossel: 4 mudan\u00e7as regulat\u00f3rias que todo profissional do agro deve conhecer", thesis_en: "Carousel: 4 regulatory changes every agro professional should know", supporting_data: ["CMN resolu\u00e7\u00f5es recentes", "CVM normas", "BCB circulares"], historical_angle_pt: null, historical_angle_en: null, suggested_week: "2026-W18", target_channel: "instagram", status: "suggested", keywords: ["regula\u00e7\u00e3o", "carrossel", "compliance"] },
];

// ─── Regulatory Norms ───

export const mockRegulatoryNorms = [
  { id: "reg1", body: "CMN", norm_type: "resolucao", norm_number: "5.234", title: "Altera regras de concess\u00e3o de cr\u00e9dito rural para cooperativas de produ\u00e7\u00e3o", summary: "Amplia limites de financiamento e flexibiliza garantias exigidas para cooperativas com mais de 100 associados. Modifica artigos 3\u00ba e 7\u00ba da Resolu\u00e7\u00e3o 5.100.", published_at: "2026-03-28", effective_at: "2026-07-01", impact_level: "high", affected_areas: ["credito_rural", "cooperativas"], source_url: "https://www.bcb.gov.br/normativos/5234", created_at: "2026-03-28" },
  { id: "reg2", body: "BCB", norm_type: "circular", norm_number: "3.998", title: "Disp\u00f5e sobre registro de CPRs digitais na plataforma do Banco Central", summary: "Estabelece procedimentos para registro de C\u00e9dulas de Produto Rural em formato digital, incluindo requisitos de assinatura eletr\u00f4nica e interoperabilidade com registradoras.", published_at: "2026-03-22", effective_at: "2026-06-01", impact_level: "high", affected_areas: ["cpr", "registro"], source_url: "https://www.bcb.gov.br/normativos/circ3998", created_at: "2026-03-22" },
  { id: "reg3", body: "CVM", norm_type: "instrucao_normativa", norm_number: "IN-42", title: "Regulamenta a oferta p\u00fablica de t\u00edtulos do agroneg\u00f3cio (CRA e LCA)", summary: "Atualiza regras para emiss\u00e3o de Certificados de Receb\u00edveis do Agroneg\u00f3cio e Letras de Cr\u00e9dito do Agroneg\u00f3cio, com novas exig\u00eancias de transpar\u00eancia.", published_at: "2026-03-15", effective_at: "2026-09-01", impact_level: "medium", affected_areas: ["cra", "lca", "mercado_capitais"], source_url: "https://www.cvm.gov.br/normativos/in42", created_at: "2026-03-15" },
  { id: "reg4", body: "MAPA", norm_type: "instrucao_normativa", norm_number: "IN-78", title: "Atualiza requisitos para credenciamento de revendas de defensivos agr\u00edcolas", summary: "Novas exig\u00eancias de rastreabilidade e controle de estoque para distribuidores de defensivos. Prazo de adequa\u00e7\u00e3o de 180 dias.", published_at: "2026-03-10", effective_at: "2026-09-10", impact_level: "medium", affected_areas: ["revendas", "defensivos", "rastreabilidade"], source_url: "https://www.gov.br/agricultura/normativos/in78", created_at: "2026-03-10" },
  { id: "reg5", body: "CMN", norm_type: "resolucao", norm_number: "5.228", title: "Estabelece novas regras para o Proagro e Proagro Mais", summary: "Redefine crit\u00e9rios de enquadramento, valores m\u00e1ximos de cobertura e procedimentos de per\u00edcia para sinistros no Programa de Garantia da Atividade Agropecu\u00e1ria.", published_at: "2026-02-28", effective_at: "2026-05-01", impact_level: "high", affected_areas: ["seguro_rural", "proagro"], source_url: "https://www.bcb.gov.br/normativos/5228", created_at: "2026-02-28" },
  { id: "reg6", body: "BCB", norm_type: "resolucao", norm_number: "BCB-412", title: "Altera regras de provisionamento para opera\u00e7\u00f5es de cr\u00e9dito rural inadimplentes", summary: "Modifica crit\u00e9rios de classifica\u00e7\u00e3o de risco e provisionamento para carteiras de cr\u00e9dito rural com atraso superior a 60 dias.", published_at: "2026-02-20", effective_at: "2026-08-01", impact_level: "medium", affected_areas: ["credito_rural", "provisionamento", "risco"], source_url: "https://www.bcb.gov.br/normativos/bcb412", created_at: "2026-02-20" },
  { id: "reg7", body: "CVM", norm_type: "resolucao", norm_number: "CVM-220", title: "Regula fiduci\u00e1rios de Fiagros com exig\u00eancias ESG", summary: "Fundos de Investimento nas Cadeias Produtivas Agroindustriais (Fiagro) devem reportar indicadores ambientais dos ativos lastro.", published_at: "2026-02-10", effective_at: "2026-08-01", impact_level: "low", affected_areas: ["fiagro", "esg", "fundos"], source_url: "https://www.cvm.gov.br/normativos/cvm220", created_at: "2026-02-10" },
  { id: "reg8", body: "MAPA", norm_type: "instrucao_normativa", norm_number: "IN-75", title: "Disp\u00f5e sobre rastreabilidade de sementes certificadas", summary: "Estabelece sistema nacional de rastreabilidade para sementes certificadas de soja, milho e algod\u00e3o, do produtor ao distribuidor final.", published_at: "2026-01-25", effective_at: "2026-07-25", impact_level: "low", affected_areas: ["sementes", "rastreabilidade"], source_url: "https://www.gov.br/agricultura/normativos/in75", created_at: "2026-01-25" },
];

// ─── Historical Context Database ───

export interface HistoricalContext {
  id: string;
  title_pt: string;
  title_en: string;
  period: string;
  summary_pt: string;
  summary_en: string;
  keywords: string[];
  relevance: string[];
}

export const mockHistoricalContexts: HistoricalContext[] = [
  { id: "hc1", title_pt: "Crise de cr\u00e9dito rural 2015-2016", title_en: "Rural credit crisis 2015-2016", period: "2015-2016", summary_pt: "Redu\u00e7\u00e3o dr\u00e1stica do Plano Safra, inadimpl\u00eancia recorde no agro, Selic a 14.25% estrangulou o cr\u00e9dito. Revendas sofreram com calotes e retri\u00e7\u00e3o de capital.", summary_en: "Drastic reduction in Plano Safra, record defaults in agro, Selic at 14.25% strangled credit. Resellers suffered with defaults and capital restriction.", keywords: ["selic", "cr\u00e9dito rural", "inadimpl\u00eancia", "plano safra"], relevance: ["selic", "credito_rural", "revendas"] },
  { id: "hc2", title_pt: "Embargo de soja EUA-China 2018", title_en: "US-China soy embargo 2018", period: "2018", summary_pt: "Guerra comercial EUA-China redirecionou demanda de soja para o Brasil. Pre\u00e7os dispararam, \u00e1rea plantada expandiu 12% em 2 safras. Brasil se consolidou como maior exportador mundial.", summary_en: "US-China trade war redirected soy demand to Brazil. Prices soared, planted area expanded 12% in 2 seasons. Brazil consolidated as world's largest exporter.", keywords: ["soja", "china", "exporta\u00e7\u00e3o", "guerra comercial"], relevance: ["soja", "exportacao", "china"] },
  { id: "hc3", title_pt: "Onda de recupera\u00e7\u00f5es judiciais 2023-2024", title_en: "Judicial recovery wave 2023-2024", period: "2023-2024", summary_pt: "Mais de 1.200 pedidos de RJ no agro em 18 meses. Grandes grupos (AgroGalaxy, Agrogil) e cooperativas afetados. Causas: supersafra derrubou pre\u00e7os + d\u00edvidas de expans\u00e3o.", summary_en: "Over 1,200 RJ filings in agro in 18 months. Major groups (AgroGalaxy, Agrogil) and cooperatives affected. Causes: bumper crop crashed prices + expansion debts.", keywords: ["recupera\u00e7\u00e3o judicial", "agrogalaxy", "inadimpl\u00eancia"], relevance: ["recuperacao_judicial", "risco", "revendas"] },
  { id: "hc4", title_pt: "Cria\u00e7\u00e3o da CPR em 1994 (Lei 8.929)", title_en: "CPR creation in 1994 (Law 8.929)", period: "1994", summary_pt: "A C\u00e9dula de Produto Rural revolucionou o financiamento agro ao permitir que produtores antecipem receita da safra futura. Base do sistema de barter moderno.", summary_en: "The Rural Product Certificate revolutionized agro financing by allowing producers to advance future crop revenue. Foundation of modern barter system.", keywords: ["CPR", "barter", "financiamento", "lei 8929"], relevance: ["cpr", "financiamento", "barter"] },
  { id: "hc5", title_pt: "Plano Safra 2020/21 e resposta \u00e0 pandemia", title_en: "Plano Safra 2020/21 and pandemic response", period: "2020-2021", summary_pt: "R$ 236 bi em cr\u00e9dito rural com juros subsidiados. Agro foi o setor que menos sofreu na pandemia, com exporta\u00e7\u00f5es record e c\u00e2mbio favor\u00e1vel.", summary_en: "R$236B in rural credit with subsidized rates. Agro was the least affected sector during pandemic, with record exports and favorable exchange rate.", keywords: ["plano safra", "pandemia", "exporta\u00e7\u00e3o", "c\u00e2mbio"], relevance: ["plano_safra", "exportacao", "credito_rural"] },
  { id: "hc6", title_pt: "CERC e a digitaliza\u00e7\u00e3o de receb\u00edveis (2021)", title_en: "CERC and receivables digitization (2021)", period: "2021", summary_pt: "A Central de Receb\u00edveis do CERC criou infraestrutura para registro eletr\u00f4nico de duplicatas e receb\u00edveis agro. Transformou o mercado de antecipa\u00e7\u00e3o de receb\u00edveis.", summary_en: "CERC's receivables registry created infrastructure for electronic registration of agro receivables. Transformed the receivables anticipation market.", keywords: ["CERC", "receb\u00edveis", "duplicata", "registro"], relevance: ["cerc", "registro", "recebíveis"] },
  { id: "hc7", title_pt: "Crise de armazenagem de 2013", title_en: "Storage crisis of 2013", period: "2013", summary_pt: "Supersafra de soja e milho sem capacidade de armazenamento. Milh\u00f5es de toneladas perdidas ao ar livre. Deficit de armazenagem estimado em 40 milh\u00f5es de toneladas.", summary_en: "Bumper soy and corn crop without storage capacity. Millions of tons lost in open air. Storage deficit estimated at 40 million tons.", keywords: ["armazenagem", "log\u00edstica", "perdas", "soja", "milho"], relevance: ["armazenagem", "logistica", "producao"] },
  { id: "hc8", title_pt: "Regulamenta\u00e7\u00e3o EU de desmatamento (2023)", title_en: "EU deforestation regulation (2023)", period: "2023", summary_pt: "Uni\u00e3o Europeia aprovou regulamenta\u00e7\u00e3o que exige rastreabilidade de commodities importadas para comprovar aus\u00eancia de desmatamento. Impacto direto em soja, caf\u00e9 e carne brasileira.", summary_en: "EU approved regulation requiring traceability of imported commodities to prove absence of deforestation. Direct impact on Brazilian soy, coffee and beef.", keywords: ["UE", "desmatamento", "rastreabilidade", "ESG"], relevance: ["esg", "exportacao", "rastreabilidade"] },
];

// ─── Retailers (sample) ───

export const mockRetailers = [
  { id: "r1", name: "Agroquima Produtos Agr\u00edcolas", cnpj: "12.345.678/0001-90", city: "Ribeir\u00e3o Preto", state: "SP", category: "defensivos", active: true },
  { id: "r2", name: "Sementes Selecta", cnpj: "23.456.789/0001-01", city: "Rio Verde", state: "GO", category: "sementes", active: true },
  { id: "r3", name: "Nutrien Ag Solutions", cnpj: "34.567.890/0001-12", city: "Londrina", state: "PR", category: "fertilizantes", active: true },
  { id: "r4", name: "Sinagro Produtos Agropecu\u00e1rios", cnpj: "45.678.901/0001-23", city: "Dourados", state: "MS", category: "defensivos", active: true },
  { id: "r5", name: "Lavoro Agrosc\u00eancias", cnpj: "56.789.012/0001-34", city: "Sorriso", state: "MT", category: "insumos gerais", active: true },
  { id: "r6", name: "Cooperativa Agr\u00edcola Mista Rondon", cnpj: "67.890.123/0001-45", city: "Maring\u00e1", state: "PR", category: "sementes", active: true },
  { id: "r7", name: "AgroGalv\u00e3o Insumos", cnpj: "78.901.234/0001-56", city: "Luis Eduardo Magalh\u00e3es", state: "BA", category: "defensivos", active: true },
  { id: "r8", name: "Bayer CropScience Regional Sul", cnpj: "89.012.345/0001-67", city: "Passo Fundo", state: "RS", category: "defensivos", active: true },
];
