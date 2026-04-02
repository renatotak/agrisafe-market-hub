"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Loader2,
  AlertTriangle, Zap, ChevronDown, ExternalLink, Newspaper, Map as MapIcon, List
} from "lucide-react";
import { mockCommodities, mockIndicators, mockPriceHistory, mockMarketAlerts } from "@/data/mock";
import { MockBadge } from "@/components/ui/MockBadge";
import { CommodityMap } from "@/components/CommodityMap";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface CommodityPrice {
  id: string; name_pt: string; name_en: string; price: number; unit: string; change_24h: number; source: string; last_update: string;
}
interface MarketIndicator {
  id: string; name_pt: string; name_en: string; value: string; trend: "up" | "down" | "stable"; source: string;
}
interface PriceHistory {
  id: string; commodity_id: string; price: number; change_24h: number; recorded_at: string;
}
interface NewsItem {
  id: string; title: string; source_name: string; source_url: string; published_at: string; category: string;
}

const CHART_COLORS = ["#5B7A2F", "#E8722A", "#2196F3", "#F44336", "#7FA02B", "#6B7A5A"];
const COMMODITY_TAGS: Record<string, string[]> = {
  soy: ["soja", "soybean", "soy"], corn: ["milho", "corn"], coffee: ["café", "coffee", "cafe"],
  sugar: ["açúcar", "sugar", "acucar"], cotton: ["algodão", "cotton", "algodao"], citrus: ["laranja", "citrus", "orange"],
};

export function MarketPulse({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [commodities, setCommodities] = useState<CommodityPrice[]>(mockCommodities);
  const [indicators, setIndicators] = useState<MarketIndicator[]>(mockIndicators);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>(mockPriceHistory);
  const [relatedNews, setRelatedNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCommodity, setExpandedCommodity] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [isMockData, setIsMockData] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: comms }, { data: inds }, { data: history }, { data: news }] = await Promise.all([
      supabase.from("commodity_prices").select("*").order("id"),
      supabase.from("market_indicators").select("*").order("id"),
      supabase.from("commodity_price_history").select("*").order("recorded_at", { ascending: true }).limit(200),
      supabase.from("agro_news").select("id, title, source_name, source_url, published_at, category").order("published_at", { ascending: false }).limit(50),
    ]);
    const hasLive = comms?.length;
    setCommodities(hasLive ? comms : mockCommodities);
    setIndicators(inds?.length ? inds : mockIndicators);
    setPriceHistory(history?.length ? history : mockPriceHistory);
    if (news?.length) setRelatedNews(news);
    setIsMockData(!hasLive);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-brand-primary" /></div>;
  }

  // Build history by commodity
  const historyByCommodity: Record<string, PriceHistory[]> = {};
  priceHistory.forEach((h) => {
    if (!historyByCommodity[h.commodity_id]) historyByCommodity[h.commodity_id] = [];
    historyByCommodity[h.commodity_id].push(h);
  });

  // Rupture detection: change > 2x the 7-day average absolute change
  const ruptures: Record<string, boolean> = {};
  commodities.forEach((cp) => {
    const history = historyByCommodity[cp.id] || [];
    if (history.length < 3) { ruptures[cp.id] = Math.abs(cp.change_24h) > 3; return; }
    const recent = history.slice(-7);
    const avgChange = recent.reduce((s, h) => s + Math.abs(h.change_24h), 0) / recent.length;
    ruptures[cp.id] = avgChange > 0 && Math.abs(cp.change_24h) > avgChange * 2;
  });

  // Compute 7d high/low per commodity
  const highLow: Record<string, { high: number; low: number }> = {};
  commodities.forEach((cp) => {
    const hist = historyByCommodity[cp.id] || [];
    const last7 = hist.slice(-7);
    if (last7.length > 0) {
      highLow[cp.id] = {
        high: Math.max(...last7.map((h) => h.price)),
        low: Math.min(...last7.map((h) => h.price)),
      };
    }
  });

  // Dynamic alerts from live data
  const liveAlerts = commodities
    .filter((cp) => ruptures[cp.id])
    .map((cp) => ({
      id: `live-${cp.id}`,
      type: "rupture" as const,
      severity: "high" as const,
      message_pt: `${cp.name_pt} ${cp.change_24h > 0 ? "subiu" : "caiu"} ${Math.abs(cp.change_24h)}% — movimento atípico detectado.`,
      message_en: `${cp.name_en} ${cp.change_24h > 0 ? "up" : "down"} ${Math.abs(cp.change_24h)}% — unusual movement detected.`,
    }));

  // Get news for a specific commodity
  const getNewsForCommodity = (commodityId: string) => {
    const tags = COMMODITY_TAGS[commodityId] || [];
    return relatedNews.filter((n) =>
      tags.some((tag) => n.title.toLowerCase().includes(tag))
    ).slice(0, 5);
  };

  const comparisonData = buildComparisonData(priceHistory, commodities, lang);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-neutral-900">{tr.marketPulse.title}</h2>
            <p className="text-[12px] text-neutral-500 mt-0.5">{tr.marketPulse.subtitle}</p>
          </div>
          {isMockData && <MockBadge />}
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-dark font-medium text-[14px] transition-colors">
          <RefreshCw size={16} />{lang === "pt" ? "Atualizar" : "Refresh"}
        </button>
      </div>

      {/* Live Alerts */}
      {liveAlerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {liveAlerts.map((alert) => (
            <div key={alert.id} className="flex items-start gap-3 rounded-lg p-3 text-[13px] bg-error-light border border-[#FFCDD2] text-error-dark">
              <Zap size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">{tr.marketPulse.rupture}: </span>
                <span className="font-medium">{lang === "pt" ? alert.message_pt : alert.message_en}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Biggest Movers Strip */}
      <div className="bg-neutral-900 rounded-lg p-4 mb-6 flex items-stretch gap-3 overflow-x-auto">
        <div className="text-neutral-400 text-[11px] font-semibold uppercase tracking-wider self-center pr-3 border-r border-neutral-700 shrink-0">
          {tr.marketPulse.biggestMovers}
        </div>
        {[...commodities].sort((a, b) => Math.abs(b.change_24h) - Math.abs(a.change_24h)).slice(0, 4).map((cp) => (
          <div key={cp.id} className={`flex-1 min-w-[140px] rounded-md px-4 py-3 ${cp.change_24h > 0 ? "bg-green-900/30" : cp.change_24h < 0 ? "bg-red-900/30" : "bg-neutral-800"}`}>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-neutral-400 font-medium">{lang === "pt" ? cp.name_pt : cp.name_en}</p>
              {ruptures[cp.id] && <Zap size={10} className="text-amber-400" />}
            </div>
            <p className="text-[18px] font-bold text-white tracking-tight">{cp.price.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2 })}</p>
            <p className={`text-[13px] font-bold ${cp.change_24h > 0 ? "text-green-400" : cp.change_24h < 0 ? "text-red-400" : "text-neutral-400"}`}>
              {cp.change_24h > 0 ? "\u25b2" : cp.change_24h < 0 ? "\u25bc" : "\u25ac"} {cp.change_24h > 0 ? "+" : ""}{cp.change_24h}%
            </p>
          </div>
        ))}
      </div>

      {/* Key Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {indicators.map((ind) => (
          <div key={ind.id} className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[11px] font-medium text-neutral-500 mb-1">{lang === "pt" ? ind.name_pt : ind.name_en}</p>
            <div className="flex items-center justify-between">
              <p className="text-[18px] font-bold text-neutral-900 tracking-tight">{ind.value}</p>
              {ind.trend === "up" && <TrendingUp size={14} className="text-success-dark" />}
              {ind.trend === "down" && <TrendingDown size={14} className="text-error" />}
              {ind.trend === "stable" && <Minus size={14} className="text-neutral-400" />}
            </div>
          </div>
        ))}
      </div>

      {/* Commodity Board (dense table — noticiasagricolas style) */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
          <h3 className="font-semibold text-neutral-900 text-[14px]">
            {tr.marketPulse.commodityBoard}
            {viewMode === "map" && <span className="ml-2 text-[10px] bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded">Geospatial Beta</span>}
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-white border border-neutral-200 rounded-md p-0.5">
              <button 
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-sm transition-colors ${viewMode === "list" ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                <List size={14} /> {lang === "pt" ? "Lista" : "List"}
              </button>
              <button 
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-sm transition-colors ${viewMode === "map" ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                <MapIcon size={14} /> Mapa
              </button>
            </div>
            <span className="text-[11px] text-neutral-400 hidden sm:inline-block">{tr.marketPulse.source}: CEPEA/BCB</span>
          </div>
        </div>
        
        {viewMode === "list" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-neutral-50 text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.05em] border-b border-neutral-200">
                <th className="px-4 py-2.5 text-left">{tr.marketPulse.commodity}</th>
                <th className="px-4 py-2.5 text-right">{tr.marketPulse.price}</th>
                <th className="px-4 py-2.5 text-right">{tr.marketPulse.change} 24h</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">{tr.marketPulse.high7d}</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">{tr.marketPulse.low7d}</th>
                <th className="px-4 py-2.5 text-center w-24 hidden md:table-cell">Spark</th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">{tr.marketPulse.lastUpdate}</th>
                <th className="px-2 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {commodities.map((cp, i) => {
                const hl = highLow[cp.id];
                const sparkData = (historyByCommodity[cp.id] || []).map((h) => ({
                  date: h.recorded_at,
                  price: h.price,
                }));
                const isExpanded = expandedCommodity === cp.id;
                const isRupture = ruptures[cp.id];
                const commodityNews = getNewsForCommodity(cp.id);

                return (
                  <CommodityRow
                    key={cp.id}
                    cp={cp}
                    lang={lang}
                    index={i}
                    hl={hl}
                    sparkData={sparkData}
                    isExpanded={isExpanded}
                    isRupture={isRupture}
                    news={commodityNews}
                    onToggle={() => setExpandedCommodity(isExpanded ? null : cp.id)}
                    tr={tr}
                  />
                );
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="p-4 bg-neutral-50 border-t border-neutral-200">
            <div className="max-w-5xl mx-auto">
              <CommodityMap commodities={commodities} lang={lang} />
            </div>
          </div>
        )}
      </div>

      {/* Comparison Chart */}
      {comparisonData.length > 1 && (
        <div className="bg-white rounded-lg p-5 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
          <h3 className="font-semibold text-neutral-900 mb-4 text-[14px]">{lang === "pt" ? "Compara\u00e7\u00e3o (% varia\u00e7\u00e3o)" : "Comparison (% change)"}</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEADF" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#A69B87" }} />
                <YAxis tick={{ fontSize: 11, fill: "#A69B87" }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #EFEADF" }} formatter={(value) => [`${Number(value).toFixed(2)}%`]} />
                {commodities.map((cp, i) => (
                  <Line key={cp.id} type="monotone" dataKey={cp.id} name={lang === "pt" ? cp.name_pt : cp.name_en} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dense commodity row with expandable deep-dive */
function CommodityRow({
  cp, lang, index, hl, sparkData, isExpanded, isRupture, news, onToggle, tr,
}: {
  cp: CommodityPrice; lang: Lang; index: number;
  hl?: { high: number; low: number };
  sparkData: { date: string; price: number }[];
  isExpanded: boolean; isRupture: boolean;
  news: NewsItem[];
  onToggle: () => void;
  tr: ReturnType<typeof t>;
}) {
  const fmt = (n: number) => n.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2 });

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-neutral-200 cursor-pointer transition-colors ${
          isRupture ? "bg-amber-50/50" : cp.change_24h > 0 ? "bg-green-50/30" : cp.change_24h < 0 ? "bg-red-50/30" : ""
        } hover:bg-neutral-100`}
      >
        <td className="px-4 py-2.5 font-semibold text-neutral-900">
          <div className="flex items-center gap-1.5">
            {isRupture && <Zap size={12} className="text-amber-500" />}
            {lang === "pt" ? cp.name_pt : cp.name_en}
          </div>
        </td>
        <td className="px-4 py-2.5 text-right font-mono font-semibold text-neutral-800">
          {fmt(cp.price)} <span className="text-neutral-400 font-normal text-[10px]">{cp.unit}</span>
        </td>
        <td className="px-4 py-2.5 text-right">
          <span className={`inline-flex items-center gap-0.5 font-bold ${cp.change_24h > 0 ? "text-success-dark" : cp.change_24h < 0 ? "text-error" : "text-neutral-500"}`}>
            {cp.change_24h > 0 ? "\u25b2" : cp.change_24h < 0 ? "\u25bc" : ""}{cp.change_24h > 0 ? "+" : ""}{cp.change_24h}%
          </span>
        </td>
        <td className="px-4 py-2.5 text-right text-neutral-600 hidden sm:table-cell">{hl ? fmt(hl.high) : "\u2014"}</td>
        <td className="px-4 py-2.5 text-right text-neutral-600 hidden sm:table-cell">{hl ? fmt(hl.low) : "\u2014"}</td>
        <td className="px-4 py-2.5 hidden md:table-cell">
          {sparkData.length > 1 && (
            <div className="h-8 w-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData}>
                  <defs>
                    <linearGradient id={`sg-${cp.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="price" stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={1.5} fill={`url(#sg-${cp.id})`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </td>
        <td className="px-4 py-2.5 text-neutral-500 text-[12px] hidden lg:table-cell">
          {new Date(cp.last_update).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" })}
        </td>
        <td className="px-2 py-2.5">
          <ChevronDown size={14} className={`text-neutral-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
        </td>
      </tr>

      {/* Deep-dive expandable row */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-neutral-50 border-b border-neutral-200 p-0">
            <div className="p-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Price chart */}
                <div>
                  <h4 className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                    {lang === "pt" ? "Hist\u00f3rico de Pre\u00e7os" : "Price History"}
                  </h4>
                  {sparkData.length > 1 ? (
                    <div className="h-44 bg-white rounded-lg p-3 border border-neutral-200">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#EFEADF" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A69B87" }} tickFormatter={(d) => new Date(d).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" })} />
                          <YAxis tick={{ fontSize: 10, fill: "#A69B87" }} domain={["auto", "auto"]} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #EFEADF" }} labelFormatter={(d) => new Date(d).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")} />
                          <defs>
                            <linearGradient id={`dd-${cp.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.3} />
                              <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="price" stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2} fill={`url(#dd-${cp.id})`} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-[12px] text-neutral-400 italic py-8">{lang === "pt" ? "Hist\u00f3rico insuficiente" : "Insufficient history"}</p>
                  )}
                </div>

                {/* Related news */}
                <div>
                  <h4 className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Newspaper size={12} />
                    {tr.marketPulse.relatedNews}
                  </h4>
                  {news.length > 0 ? (
                    <div className="space-y-2">
                      {news.map((n) => (
                        <a key={n.id} href={n.source_url} target="_blank" rel="noopener noreferrer"
                          className="block bg-white rounded-lg p-3 border border-neutral-200 hover:border-neutral-300 transition-colors group">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[12px] font-semibold text-neutral-800 leading-snug group-hover:text-brand-primary transition-colors">{n.title}</p>
                              <p className="text-[10px] text-neutral-400 mt-1">
                                {n.source_name} &middot; {new Date(n.published_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" })}
                              </p>
                            </div>
                            <ExternalLink size={12} className="text-neutral-300 group-hover:text-brand-primary shrink-0 mt-0.5" />
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-neutral-400 italic py-4">{lang === "pt" ? "Nenhuma not\u00edcia relacionada" : "No related news"}</p>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function buildComparisonData(history: PriceHistory[], commodities: CommodityPrice[], lang: Lang) {
  if (history.length === 0) return [];
  const dateMap: Record<string, Record<string, number>> = {};
  const basePrices: Record<string, number> = {};
  history.forEach((h) => {
    const dateKey = new Date(h.recorded_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" });
    if (!dateMap[dateKey]) dateMap[dateKey] = {};
    if (!basePrices[h.commodity_id]) basePrices[h.commodity_id] = h.price;
    dateMap[dateKey][h.commodity_id] = ((h.price - basePrices[h.commodity_id]) / basePrices[h.commodity_id]) * 100;
  });
  return Object.entries(dateMap).map(([date, values]) => ({ date, ...values }));
}
