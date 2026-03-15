// Public market data - NO proprietary or confidential information
// All data sourced from public APIs and feeds

export interface CommodityPrice {
  id: string;
  name_pt: string;
  name_en: string;
  price: number;
  unit: string;
  change24h: number;
  source: string;
  lastUpdate: string;
}

export interface MarketIndicator {
  id: string;
  name_pt: string;
  name_en: string;
  value: string;
  trend: "up" | "down" | "stable";
  source: string;
}

// Sample public commodity data (would be replaced by live API calls)
export const commodityPrices: CommodityPrice[] = [
  { id: "soy", name_pt: "Soja (CBOT)", name_en: "Soybean (CBOT)", price: 1042.50, unit: "¢/bu", change24h: 1.2, source: "CEPEA/CBOT", lastUpdate: "2026-03-15" },
  { id: "corn", name_pt: "Milho (B3)", name_en: "Corn (B3)", price: 72.80, unit: "R$/sc", change24h: -0.5, source: "CEPEA/B3", lastUpdate: "2026-03-15" },
  { id: "sugar", name_pt: "Açúcar (ICE)", name_en: "Sugar (ICE)", price: 19.45, unit: "¢/lb", change24h: 0.8, source: "ICE/CEPEA", lastUpdate: "2026-03-15" },
  { id: "coffee", name_pt: "Café Arábica", name_en: "Arabica Coffee", price: 342.15, unit: "¢/lb", change24h: 2.1, source: "ICE/CEPEA", lastUpdate: "2026-03-15" },
  { id: "citrus", name_pt: "Laranja (FCOJ)", name_en: "Orange Juice (FCOJ)", price: 485.30, unit: "¢/lb", change24h: -1.3, source: "ICE", lastUpdate: "2026-03-15" },
  { id: "cotton", name_pt: "Algodão", name_en: "Cotton", price: 67.20, unit: "¢/lb", change24h: 0.3, source: "ICE/CEPEA", lastUpdate: "2026-03-15" },
];

export const marketIndicators: MarketIndicator[] = [
  { id: "usd_brl", name_pt: "Câmbio USD/BRL", name_en: "USD/BRL Exchange", value: "R$ 5.72", trend: "up", source: "BCB" },
  { id: "selic", name_pt: "Taxa Selic", name_en: "Selic Rate", value: "14.25%", trend: "stable", source: "BCB" },
  { id: "agro_exports", name_pt: "Exportações Agro 2026", name_en: "Agro Exports 2026", value: "US$ 42.3 bi (YTD)", trend: "up", source: "MAPA" },
  { id: "rural_credit", name_pt: "Crédito Rural Plano Safra", name_en: "Rural Credit Plano Safra", value: "R$ 400.59 bi", trend: "stable", source: "BNDES/BCB" },
  { id: "crop_soy", name_pt: "Safra Soja 25/26", name_en: "Soy Crop 25/26", value: "172.4 mi ton", trend: "up", source: "CONAB" },
  { id: "crop_corn", name_pt: "Safra Milho 25/26", name_en: "Corn Crop 25/26", value: "122.8 mi ton", trend: "up", source: "CONAB" },
];
