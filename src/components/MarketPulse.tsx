"use client";

import { useEffect, useState, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  TrendingUp, TrendingDown, RefreshCw, Loader2, Zap,
  ExternalLink, MapPin, Globe, Truck, Layers, BarChart3, Sprout,
} from "lucide-react";
import { CommodityMap } from "@/components/CommodityMap";
import { NACotacoesWidget } from "@/components/NACotacoesWidget";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarketIndicator {
  id: string;
  name_pt: string;
  name_en: string;
  value: string;
  trend: "up" | "down" | "stable";
  source: string;
}

interface RegionalPrice {
  praca: string;
  city: string;
  uf: string;
  cooperative: string;
  price: number | null;
  price_label: string;
  variation: number | null;
  variation_label: string;
  direction: "up" | "down" | "stable";
  lat: number | null;
  lng: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

interface CultureMeta {
  slug: string;
  label: string;
  en: string;
  color: string;
  region: string;
  tvSymbol: string;
  intlMarket: string;
  intlUnit: string;       // CME/ICE original unit
  brUnit: string;         // BR physical unit
}

const CULTURES: CultureMeta[] = [
  { slug: "soja",       label: "Soja",      en: "Soybean", color: "#5B7A2F", region: "BR (CEPEA)", tvSymbol: "CBOT_MINI:ZS1!", intlMarket: "CBOT — Chicago",       intlUnit: "US¢/bushel", brUnit: "R$/sc 60kg" },
  { slug: "milho",      label: "Milho",     en: "Corn",    color: "#E8722A", region: "BR (CEPEA)", tvSymbol: "CBOT_MINI:ZC1!", intlMarket: "CBOT — Chicago",       intlUnit: "US¢/bushel", brUnit: "R$/sc 60kg" },
  { slug: "cafe",       label: "Café",      en: "Coffee",  color: "#6F4E37", region: "BR (CEPEA)", tvSymbol: "ICEUS:KC1!",     intlMarket: "ICE US — New York",    intlUnit: "US¢/lb",     brUnit: "R$/sc 60kg" },
  { slug: "boi-gordo",  label: "Boi Gordo", en: "Cattle",  color: "#8B4513", region: "BR (B3)",    tvSymbol: "BMFBOVESPA:BGI1!", intlMarket: "B3 — São Paulo",    intlUnit: "R$/@",       brUnit: "R$/@"       },
  { slug: "trigo",      label: "Trigo",     en: "Wheat",   color: "#DAA520", region: "BR (RS/PR)", tvSymbol: "CBOT_MINI:ZW1!", intlMarket: "CBOT — Chicago",       intlUnit: "US¢/bushel", brUnit: "R$/sc 60kg" },
  { slug: "algodao",    label: "Algodão",   en: "Cotton",  color: "#7FA02B", region: "BR (IMEA)",  tvSymbol: "ICEUS:CT1!",     intlMarket: "ICE US — New York",    intlUnit: "US¢/lb",     brUnit: "R$/@"       },
];

const REGIONS = [
  { uf: "MT", label: "Mato Grosso",        bias: "Soja, Milho, Algodão, Boi" },
  { uf: "MS", label: "Mato Grosso do Sul", bias: "Soja, Milho, Boi" },
  { uf: "GO", label: "Goiás",              bias: "Soja, Milho, Cana, Boi" },
  { uf: "PR", label: "Paraná",             bias: "Soja, Milho, Trigo" },
  { uf: "RS", label: "Rio Grande do Sul",  bias: "Soja, Trigo, Arroz" },
  { uf: "SP", label: "São Paulo",          bias: "Café, Cana, Citros" },
  { uf: "MG", label: "Minas Gerais",       bias: "Café, Cana, Boi" },
  { uf: "BA", label: "Bahia",              bias: "Soja, Algodão, Café" },
];

const SOURCE_COLORS: Record<string, string> = {
  "BCB SGS": "#1565C0",
  "CEPEA/BCB": "#5B7A2F",
  "CEPEA": "#5B7A2F",
  "BCB": "#1565C0",
  "TradingView": "#2962FF",
  "Notícias Agrícolas": "#E65100",
};

// ─── Helper functions ────────────────────────────────────────────────────────

function formatPrice(n: number, lang: Lang): string {
  return n.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRelativeTime(iso: string, lang: Lang): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return lang === "pt" ? "agora" : "just now";
  if (diffMin < 60) return lang === "pt" ? `há ${diffMin}min` : `${diffMin}min ago`;
  if (diffHr < 24) return lang === "pt" ? `há ${diffHr}h` : `${diffHr}h ago`;
  if (diffDay < 7) return lang === "pt" ? `há ${diffDay}d` : `${diffDay}d ago`;
  return date.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" });
}

// ─── Live culture summary computed from /api/prices-na/regional ───────────────

interface LiveCultureSummary {
  slug: string;
  meta: CultureMeta;
  count: number;          // # of valid praças
  avgPrice: number;       // BR spot average
  minPrice: number;
  maxPrice: number;
  median: number;
  avgVariation: number;   // mean variation across praças
  unit: string;
  closingDate: string;    // from NA, e.g. "06/04/2026"
  topGainers: number;     // praças up
  topLosers: number;      // praças down
  rawPraças: RegionalPrice[]; // only entries with valid coordinates (no futures)
}

async function fetchCultureSummary(slug: string): Promise<LiveCultureSummary | null> {
  const meta = CULTURES.find((c) => c.slug === slug);
  if (!meta) return null;
  try {
    const res = await fetch(`/api/prices-na/regional?commodity=${slug}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return null;
    // Filter strictly: only physical praças (must have lat/lng + valid city + valid price)
    const praças: RegionalPrice[] = (json.data as RegionalPrice[]).filter(
      (p) =>
        p.price !== null && p.price > 0 &&
        p.lat !== null && p.lng !== null &&
        p.city && p.city.length > 0 &&
        p.uf && p.uf.length === 2
    );
    if (praças.length === 0) return null;
    const prices = praças.map((p) => p.price as number).sort((a, b) => a - b);
    const sum = prices.reduce((a, b) => a + b, 0);
    const avg = sum / prices.length;
    const median = prices[Math.floor(prices.length / 2)];
    const variations = praças.map((p) => p.variation || 0);
    const avgVar = variations.reduce((a, b) => a + b, 0) / variations.length;
    return {
      slug,
      meta,
      count: praças.length,
      avgPrice: avg,
      minPrice: prices[0],
      maxPrice: prices[prices.length - 1],
      median,
      avgVariation: avgVar,
      unit: json.unit || meta.brUnit,
      closingDate: json.closing_date || "",
      topGainers: praças.filter((p) => p.direction === "up").length,
      topLosers: praças.filter((p) => p.direction === "down").length,
      rawPraças: praças,
    };
  } catch {
    return null;
  }
}

function useLiveCultureSummaries() {
  const [summaries, setSummaries] = useState<Record<string, LiveCultureSummary>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    Promise.all(CULTURES.map((c) => fetchCultureSummary(c.slug))).then((results) => {
      const map: Record<string, LiveCultureSummary> = {};
      results.forEach((r) => { if (r) map[r.slug] = r; });
      setSummaries(map);
      setLoading(false);
    });
  }, []);
  return { summaries, loading };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MarketPulse({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [indicators, setIndicators] = useState<MarketIndicator[]>([]);
  const [activeAnalysis, setActiveAnalysis] = useState<"culture" | "region">("culture");
  const [activeCulture, setActiveCulture] = useState<string>("soja");
  const [activeRegion, setActiveRegion] = useState<string>("MT");
  const [refreshKey, setRefreshKey] = useState(0);

  // Live spot data for all 6 cultures (BR physical praças only)
  const { summaries, loading: summariesLoading } = useLiveCultureSummaries();

  // Macro indicators from Supabase (USD/BRL, Selic, etc.)
  useEffect(() => {
    supabase.from("market_indicators").select("*").order("id").then(({ data }) => {
      setIndicators(data || []);
    });
  }, [refreshKey]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[20px] font-bold text-neutral-900">{tr.marketPulse.title}</h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">{tr.marketPulse.subtitle}</p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-dark font-medium text-[13px] transition-colors"
        >
          <RefreshCw size={14} />
          {lang === "pt" ? "Atualizar" : "Refresh"}
        </button>
      </div>

      {/* HIGHLIGHTS BOX — live data */}
      <MarketHighlights summaries={summaries} loading={summariesLoading} indicators={indicators} lang={lang} />

      {/* Analysis selector */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-1 mb-4 flex items-center gap-1">
        <button
          onClick={() => setActiveAnalysis("culture")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold transition-all ${
            activeAnalysis === "culture" ? "bg-brand-primary text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          <Sprout size={15} />
          {lang === "pt" ? "Análise por Cultura" : "Analysis by Culture"}
        </button>
        <button
          onClick={() => setActiveAnalysis("region")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold transition-all ${
            activeAnalysis === "region" ? "bg-brand-primary text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          <MapPin size={15} />
          {lang === "pt" ? "Análise por Região" : "Analysis by Region"}
        </button>
      </div>

      {/* Active analysis content */}
      {activeAnalysis === "culture" ? (
        <CultureAnalysis
          activeCulture={activeCulture}
          onCultureChange={setActiveCulture}
          summary={summaries[activeCulture]}
          lang={lang}
        />
      ) : (
        <RegionAnalysis
          activeRegion={activeRegion}
          onRegionChange={setActiveRegion}
          lang={lang}
        />
      )}

      {/* NA Cotações Widget — moved here from Dashboard */}
      <div className="mt-6">
        <NACotacoesWidget lang={lang} />
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1: HIGHLIGHTS BOX
// ═════════════════════════════════════════════════════════════════════════════

function MarketHighlights({
  summaries,
  loading,
  indicators,
  lang,
}: {
  summaries: Record<string, LiveCultureSummary>;
  loading: boolean;
  indicators: MarketIndicator[];
  lang: Lang;
}) {
  const arr = Object.values(summaries);
  const topGainer = [...arr].sort((a, b) => b.avgVariation - a.avgVariation)[0];
  const topLoser = [...arr].sort((a, b) => a.avgVariation - b.avgVariation)[0];
  const mostVolatile = [...arr].sort((a, b) => Math.abs(b.avgVariation) - Math.abs(a.avgVariation))[0];
  const ruptures = arr.filter((c) => Math.abs(c.avgVariation) > 2).length;
  const latestDate = arr.find((s) => s.closingDate)?.closingDate || "";

  return (
    <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-[#1a2818] rounded-xl border border-neutral-800 p-5 mb-5 shadow-lg">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          <h3 className="text-[12px] font-bold text-neutral-300 uppercase tracking-[0.1em]">
            {lang === "pt" ? "Destaques do Mercado" : "Market Highlights"}
          </h3>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase tracking-wider">Live</span>
        </div>
        <span className="text-[10px] text-neutral-500">
          {lang === "pt" ? "Fechamento" : "Closing"}: {latestDate || (loading ? "..." : "—")}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-neutral-500" />
        </div>
      ) : arr.length === 0 ? (
        <p className="text-center text-neutral-500 text-[12px] py-6">
          {lang === "pt" ? "Sem dados ao vivo no momento" : "No live data available"}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {topGainer && <HighlightCard label={lang === "pt" ? "Maior Alta" : "Top Gainer"} icon={<TrendingUp size={14} />} color="emerald" summary={topGainer} lang={lang} />}
          {topLoser && <HighlightCard label={lang === "pt" ? "Maior Queda" : "Top Loser"} icon={<TrendingDown size={14} />} color="rose" summary={topLoser} lang={lang} />}
          {mostVolatile && <HighlightCard label={lang === "pt" ? "Mais Volátil" : "Most Volatile"} icon={<Zap size={14} />} color="amber" summary={mostVolatile} lang={lang} />}
          <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Layers size={12} className="text-blue-400" />
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                {lang === "pt" ? "Indicadores Macro" : "Macro Indicators"}
              </p>
            </div>
            <div className="space-y-1">
              {indicators.slice(0, 2).map((ind) => (
                <div key={ind.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-400">{lang === "pt" ? ind.name_pt : ind.name_en}</span>
                  <span className="font-bold text-white font-mono">{ind.value}</span>
                </div>
              ))}
            </div>
            {ruptures > 0 && (
              <div className="mt-2 pt-2 border-t border-neutral-700/50 flex items-center gap-1">
                <Zap size={10} className="text-amber-400" />
                <span className="text-[10px] text-amber-300 font-semibold">
                  {ruptures} {lang === "pt" ? "movimentos atípicos" : "unusual moves"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HighlightCard({
  label,
  icon,
  color,
  summary,
  lang,
}: {
  label: string;
  icon: React.ReactNode;
  color: "emerald" | "rose" | "amber";
  summary: LiveCultureSummary;
  lang: Lang;
}) {
  const colorClasses: Record<string, string> = {
    emerald: "border-emerald-600/40 from-emerald-900/40",
    rose:    "border-rose-600/40 from-rose-900/40",
    amber:   "border-amber-600/40 from-amber-900/40",
  };
  const textColor: Record<string, string> = {
    emerald: "text-emerald-300",
    rose:    "text-rose-300",
    amber:   "text-amber-300",
  };
  const isUp = summary.avgVariation > 0;

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} to-neutral-800/50 border rounded-lg p-3`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={textColor[color]}>{icon}</span>
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-[13px] font-semibold text-white truncate">
        {lang === "pt" ? summary.meta.label : summary.meta.en}
      </p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-[20px] font-bold text-white font-mono tracking-tight">
          R$ {formatPrice(summary.avgPrice, lang)}
        </span>
        <span className="text-[10px] text-neutral-400">{summary.meta.brUnit}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className={`text-[12px] font-bold ${isUp ? "text-emerald-400" : summary.avgVariation < 0 ? "text-rose-400" : "text-neutral-500"}`}>
          {isUp ? "▲" : summary.avgVariation < 0 ? "▼" : "—"} {isUp ? "+" : ""}{summary.avgVariation.toFixed(2)}%
        </span>
        <span className="text-[9px] text-neutral-500 font-medium">
          NA / CEPEA
        </span>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-neutral-700/50 flex items-center justify-between text-[9px] text-neutral-500">
        <span className="flex items-center gap-0.5">
          <MapPin size={8} />
          {summary.count} {lang === "pt" ? "praças BR" : "BR locations"}
        </span>
        <span>{summary.closingDate || formatRelativeTime(new Date().toISOString(), lang)}</span>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: CULTURE ANALYSIS
// ═════════════════════════════════════════════════════════════════════════════

function CultureAnalysis({
  activeCulture,
  onCultureChange,
  summary,
  lang,
}: {
  activeCulture: string;
  onCultureChange: (slug: string) => void;
  summary: LiveCultureSummary | undefined;
  lang: Lang;
}) {
  const culture = CULTURES.find((c) => c.slug === activeCulture)!;
  const isUp = summary && summary.avgVariation > 0;

  return (
    <div className="space-y-4">
      {/* Culture tabs */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-2 flex items-center gap-1 overflow-x-auto">
        {CULTURES.map((c) => (
          <button
            key={c.slug}
            onClick={() => onCultureChange(c.slug)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap transition-colors ${
              activeCulture === c.slug ? "text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-100"
            }`}
            style={activeCulture === c.slug ? { backgroundColor: c.color } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeCulture === c.slug ? "white" : c.color }} />
            {lang === "pt" ? c.label : c.en}
          </button>
        ))}
      </div>

      {/* Headline price card */}
      {summary ? (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: culture.color }} />
                <h3 className="text-[16px] font-bold text-neutral-900">
                  {lang === "pt" ? culture.label : culture.en}
                </h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase">Live</span>
                <span className="text-[10px] text-neutral-500">
                  {lang === "pt" ? "Média de" : "Average of"} {summary.count} {lang === "pt" ? "praças BR" : "BR locations"}
                </span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[36px] font-bold text-neutral-900 tracking-tight font-mono">
                  R$ {formatPrice(summary.avgPrice, lang)}
                </span>
                <span className="text-[14px] text-neutral-500">{summary.meta.brUnit}</span>
                <span className={`text-[16px] font-bold ml-2 ${isUp ? "text-emerald-600" : summary.avgVariation < 0 ? "text-rose-600" : "text-neutral-500"}`}>
                  {isUp ? "▲ +" : summary.avgVariation < 0 ? "▼ " : "— "}
                  {summary.avgVariation.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                <span className="text-neutral-500">
                  {lang === "pt" ? "Min" : "Min"}: <span className="font-bold text-emerald-700">R$ {formatPrice(summary.minPrice, lang)}</span>
                </span>
                <span className="text-neutral-500">
                  {lang === "pt" ? "Mediana" : "Median"}: <span className="font-bold text-neutral-700">R$ {formatPrice(summary.median, lang)}</span>
                </span>
                <span className="text-neutral-500">
                  {lang === "pt" ? "Max" : "Max"}: <span className="font-bold text-rose-700">R$ {formatPrice(summary.maxPrice, lang)}</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] min-w-[220px]">
              <div>
                <p className="text-neutral-400 uppercase font-semibold text-[9px]">{lang === "pt" ? "Fonte BR" : "BR Source"}</p>
                <p className="font-bold mt-0.5" style={{ color: SOURCE_COLORS["Notícias Agrícolas"] }}>Notícias Agrícolas</p>
              </div>
              <div>
                <p className="text-neutral-400 uppercase font-semibold text-[9px]">{lang === "pt" ? "Região" : "Region"}</p>
                <p className="font-bold text-neutral-700 mt-0.5">{culture.region}</p>
              </div>
              <div>
                <p className="text-neutral-400 uppercase font-semibold text-[9px]">{lang === "pt" ? "Fechamento" : "Closing"}</p>
                <p className="font-bold text-neutral-700 mt-0.5">{summary.closingDate || "—"}</p>
              </div>
              <div>
                <p className="text-neutral-400 uppercase font-semibold text-[9px]">{lang === "pt" ? "Mercado Intl." : "Intl. Market"}</p>
                <p className="font-bold text-neutral-700 mt-0.5">{culture.intlMarket}</p>
                <p className="text-[9px] text-neutral-500">{culture.intlUnit}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-neutral-200 p-8 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-neutral-400" />
        </div>
      )}

      {/* Regional Map + International Chart side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Regional map */}
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
            <MapPin size={14} className="text-brand-primary" />
            <h4 className="text-[12px] font-bold text-neutral-700 uppercase tracking-wider">
              {lang === "pt" ? "Preços por Região (BR)" : "Prices by Region (BR)"}
            </h4>
            {summary?.closingDate && <span className="text-[10px] text-neutral-400 ml-auto">{summary.closingDate}</span>}
          </div>
          <div className="h-[400px]">
            <CommodityMap lang={lang} slug={activeCulture} />
          </div>
        </div>

        {/* International futures chart — fetched from Yahoo Finance via /api/intl-futures */}
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
            <Globe size={14} className="text-blue-600" />
            <h4 className="text-[12px] font-bold text-neutral-700 uppercase tracking-wider">
              {lang === "pt" ? "Mercado Internacional" : "International Market"}
            </h4>
            <span className="text-[10px] text-neutral-500 ml-auto">{culture.intlMarket}</span>
          </div>
          <div className="h-[400px]">
            <IntlFuturesChart slug={activeCulture} lang={lang} />
          </div>
        </div>
      </div>

      {/* Logistics & Infrastructure — horizontal range chart */}
      {summary && summary.count >= 2 ? (
        <LogisticsSpreadChart summary={summary} lang={lang} />
      ) : (
        <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center text-[12px] text-neutral-500">
          {lang === "pt" ? "Dados regionais insuficientes para análise logística." : "Insufficient regional data for logistics analysis."}
        </div>
      )}
    </div>
  );
}

// ─── International futures chart — fetched from Yahoo Finance via proxy ─────

interface IntlFuturesData {
  success: boolean;
  slug: string;
  symbol: string;
  name: string;
  exchange: string;
  unit: string;
  unitFull: string;
  currency: string;
  lastPrice: number;
  prevClose: number;
  change: number;       // daily
  changePct: number;
  periodChange: number; // change over selected range
  periodChangePct: number;
  range: string;
  regularMarketTime: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  points: { t: number; date: string; close: number; high: number | null; low: number | null }[];
  tradingViewLink: string;
  yahooLink: string;
}

function IntlFuturesChart({ slug, lang }: { slug: string; lang: Lang }) {
  const [data, setData] = useState<IntlFuturesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<"1mo" | "3mo" | "6mo" | "1y">("3mo");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/intl-futures?slug=${slug}&range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d);
        else setError(d.error || "Failed to load");
      })
      .catch((e) => setError(e.message || "Fetch failed"))
      .finally(() => setLoading(false));
  }, [slug, range]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-50">
        <Loader2 size={20} className="animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-neutral-50 text-center p-4">
        <Globe size={28} className="text-neutral-300 mb-2" />
        <p className="text-[12px] text-neutral-500">{error || (lang === "pt" ? "Sem dados" : "No data")}</p>
      </div>
    );
  }

  const isUp = data.change > 0;
  const chartColor = isUp ? "#10b981" : "#ef4444";

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top: current price + change */}
      <div className="px-4 py-3 border-b border-neutral-100 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-neutral-500">{data.name}</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-[24px] font-bold text-neutral-900 font-mono tracking-tight">
              {data.lastPrice.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-neutral-500">{data.unit}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1">
            <span className="text-[9px] font-bold text-neutral-400 uppercase">{lang === "pt" ? "Diário" : "Daily"}</span>
            <span className={`text-[13px] font-bold ${isUp ? "text-emerald-600" : data.change < 0 ? "text-rose-600" : "text-neutral-500"}`}>
              {isUp ? "▲" : data.change < 0 ? "▼" : "—"} {data.changePct >= 0 ? "+" : ""}{data.changePct.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span className="text-[9px] font-bold text-neutral-400 uppercase">{data.range}</span>
            <span className={`text-[11px] font-semibold ${data.periodChange > 0 ? "text-emerald-600" : data.periodChange < 0 ? "text-rose-600" : "text-neutral-500"}`}>
              {data.periodChangePct >= 0 ? "+" : ""}{data.periodChangePct.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Range selector */}
      <div className="px-4 py-1.5 border-b border-neutral-100 flex items-center gap-1 bg-neutral-50/50">
        {(["1mo", "3mo", "6mo", "1y"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
              range === r ? "bg-blue-100 text-blue-700" : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {r === "1mo" ? "1M" : r === "3mo" ? "3M" : r === "6mo" ? "6M" : "1Y"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-neutral-500">
          <span>52W H: <span className="font-bold text-neutral-700">{data.fiftyTwoWeekHigh?.toFixed(2)}</span></span>
          <span>L: <span className="font-bold text-neutral-700">{data.fiftyTwoWeekLow?.toFixed(2)}</span></span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points}>
            <defs>
              <linearGradient id={`int-grad-${slug}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickFormatter={(d) => {
                const date = new Date(d);
                return date.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" });
              }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              domain={["auto", "auto"]}
              tickFormatter={(v) => v.toFixed(0)}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e5e0" }}
              labelFormatter={(d) => new Date(d).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
              formatter={(value: any) => [`${Number(value).toFixed(2)} ${data.unit}`, data.name]}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={chartColor}
              strokeWidth={2}
              fill={`url(#int-grad-${slug})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between text-[10px] text-neutral-500">
        <span>{data.exchange} · {data.symbol} · {data.unitFull}</span>
        <a
          href={data.tradingViewLink}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-blue-600 hover:underline flex items-center gap-0.5"
        >
          {lang === "pt" ? "Ver no TradingView" : "View on TradingView"} <ExternalLink size={9} />
        </a>
      </div>
    </div>
  );
}

// ─── Logistics Spread — horizontal range chart ───────────────────────────────

function LogisticsSpreadChart({ summary, lang }: { summary: LiveCultureSummary; lang: Lang }) {
  // Take all geocoded praças, sort by price
  const sorted = [...summary.rawPraças].sort((a, b) => (a.price || 0) - (b.price || 0));
  const min = summary.minPrice;
  const max = summary.maxPrice;
  const range = max - min || 1;
  const spread = max - min;
  const spreadPct = min > 0 ? (spread / min) * 100 : 0;
  const cheapest = sorted[0];
  const expensive = sorted[sorted.length - 1];
  const median = summary.median;
  const avg = summary.avgPrice;

  // Compute position % for each praça in 0-100 scale
  const points = sorted.map((p) => ({
    ...p,
    pct: range > 0 ? (((p.price as number) - min) / range) * 100 : 50,
  }));

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2 flex-wrap">
        <Truck size={14} className="text-brand-primary" />
        <h4 className="text-[12px] font-bold text-neutral-700 uppercase tracking-wider">
          {lang === "pt" ? "Logística & Infraestrutura" : "Logistics & Infrastructure"}
        </h4>
        <span className="text-[10px] text-neutral-400 ml-auto">
          {summary.count} {lang === "pt" ? "praças" : "locations"} · {summary.unit}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Spread summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-lg p-3">
            <p className="text-[10px] font-bold text-emerald-700 uppercase mb-1">
              {lang === "pt" ? "Mais Barata" : "Cheapest"}
            </p>
            <p className="text-[20px] font-bold text-emerald-800 font-mono">R$ {formatPrice(min, lang)}</p>
            <p className="text-[11px] font-semibold text-neutral-800 truncate">{cheapest.city}/{cheapest.uf}</p>
            {cheapest.cooperative && <p className="text-[9px] text-neutral-500 truncate">{cheapest.cooperative}</p>}
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-lg p-3">
            <p className="text-[10px] font-bold text-amber-700 uppercase mb-1">
              {lang === "pt" ? "Spread (Dispersão)" : "Spread"}
            </p>
            <p className="text-[20px] font-bold text-amber-800 font-mono">R$ {formatPrice(spread, lang)}</p>
            <p className="text-[11px] font-semibold text-amber-700">{spreadPct.toFixed(1)}% {lang === "pt" ? "máx-mín" : "max-min"}</p>
            <p className="text-[9px] text-neutral-500">
              {lang === "pt" ? "Reflexo de custo de frete & infraestrutura" : "Reflects freight & infrastructure cost"}
            </p>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-white border border-rose-200 rounded-lg p-3">
            <p className="text-[10px] font-bold text-rose-700 uppercase mb-1">
              {lang === "pt" ? "Mais Cara" : "Most Expensive"}
            </p>
            <p className="text-[20px] font-bold text-rose-800 font-mono">R$ {formatPrice(max, lang)}</p>
            <p className="text-[11px] font-semibold text-neutral-800 truncate">{expensive.city}/{expensive.uf}</p>
            {expensive.cooperative && <p className="text-[9px] text-neutral-500 truncate">{expensive.cooperative}</p>}
          </div>
        </div>

        {/* Range visualization — horizontal "candle" with all praças as dots */}
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase mb-3 tracking-wider">
            {lang === "pt" ? "Distribuição de Preços" : "Price Distribution"}
          </p>
          <div className="relative h-20">
            {/* Background gradient bar */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 rounded-full"
              style={{ background: "linear-gradient(to right, #047857 0%, #f59e0b 50%, #be123c 100%)" }} />
            {/* Mean marker */}
            <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-7 bg-neutral-800"
              style={{ left: `${range > 0 ? ((avg - min) / range) * 100 : 50}%` }}>
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-neutral-700 whitespace-nowrap bg-white px-1 rounded">
                {lang === "pt" ? "Méd" : "Avg"} R$ {avg.toFixed(2)}
              </div>
            </div>
            {/* Median marker */}
            <div className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-neutral-500"
              style={{ left: `${range > 0 ? ((median - min) / range) * 100 : 50}%` }}>
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-neutral-500 whitespace-nowrap">
                {lang === "pt" ? "Med" : "Med"}
              </div>
            </div>
            {/* Praça dots */}
            {points.map((p, i) => (
              <div
                key={i}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white border border-neutral-700 hover:scale-150 hover:z-10 transition-transform cursor-pointer group"
                style={{ left: `${p.pct}%` }}
                title={`${p.city}/${p.uf}: R$ ${p.price?.toFixed(2)}`}
              >
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block z-20 bg-neutral-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
                  {p.city}: R$ {p.price?.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          {/* Axis labels */}
          <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-neutral-500">
            <span className="text-emerald-700 font-bold">R$ {min.toFixed(2)}</span>
            <span className="text-rose-700 font-bold">R$ {max.toFixed(2)}</span>
          </div>
          <p className="text-[9px] text-neutral-400 italic mt-2 text-center">
            {lang === "pt"
              ? `Cada ponto representa uma praça brasileira (${summary.count} no total). A dispersão revela onde a logística e infraestrutura impactam o preço final.`
              : `Each dot is a Brazilian location (${summary.count} total). Spread reveals where logistics and infrastructure impact final price.`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: REGION ANALYSIS
// ═════════════════════════════════════════════════════════════════════════════

interface RegionCommodityData {
  slug: string;
  label: string;
  color: string;
  count: number;        // praças in this UF
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  unit: string;
  loading: boolean;
}

function RegionAnalysis({
  activeRegion,
  onRegionChange,
  lang,
}: {
  activeRegion: string;
  onRegionChange: (uf: string) => void;
  lang: Lang;
}) {
  const region = REGIONS.find((r) => r.uf === activeRegion)!;
  const [data, setData] = useState<RegionCommodityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData([]);

    Promise.all(
      CULTURES.map(async (c) => {
        try {
          const res = await fetch(`/api/prices-na/regional?commodity=${c.slug}`);
          const json = await res.json();
          if (!json.success || !json.data) return null;
          const inUf = (json.data as RegionalPrice[]).filter(
            (p) => p.uf === activeRegion && p.price !== null
          );
          if (inUf.length === 0) return null;
          const prices = inUf.map((p) => p.price as number);
          return {
            slug: c.slug,
            label: lang === "pt" ? c.label : c.en,
            color: c.color,
            count: inUf.length,
            avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            unit: json.unit || "",
            loading: false,
          };
        } catch {
          return null;
        }
      })
    ).then((results) => {
      setData(results.filter((r): r is RegionCommodityData => r !== null));
      setLoading(false);
    });
  }, [activeRegion, lang]);

  // Value support/destruction analysis (vs national average)
  const analysisItems = useMemo(() => {
    return data.map((d) => {
      // Heuristic: high spread or significantly higher avg = value-supporting
      // Low praça count or lower avg = potentially destroying
      const range = d.maxPrice - d.minPrice;
      const rangePct = (range / d.avgPrice) * 100;
      let signal: "support" | "neutral" | "destroy" = "neutral";
      let reason = "";
      if (d.count >= 5 && rangePct < 15) {
        signal = "support";
        reason = lang === "pt"
          ? `${d.count} praças com baixa dispersão (${rangePct.toFixed(0)}%) — mercado líquido e estável.`
          : `${d.count} locations with low dispersion (${rangePct.toFixed(0)}%) — liquid and stable market.`;
      } else if (rangePct > 30) {
        signal = "destroy";
        reason = lang === "pt"
          ? `Alta dispersão (${rangePct.toFixed(0)}%) — gargalos logísticos destroem valor.`
          : `High dispersion (${rangePct.toFixed(0)}%) — logistics bottlenecks destroying value.`;
      } else if (d.count <= 2) {
        signal = "destroy";
        reason = lang === "pt"
          ? `Apenas ${d.count} ${d.count === 1 ? "praça" : "praças"} — mercado pouco líquido.`
          : `Only ${d.count} ${d.count === 1 ? "location" : "locations"} — illiquid market.`;
      } else {
        signal = "neutral";
        reason = lang === "pt"
          ? `${d.count} praças, dispersão moderada (${rangePct.toFixed(0)}%).`
          : `${d.count} locations, moderate dispersion (${rangePct.toFixed(0)}%).`;
      }
      return { ...d, signal, reason };
    });
  }, [data, lang]);

  return (
    <div className="space-y-4">
      {/* Region tabs */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-2 flex items-center gap-1 overflow-x-auto">
        {REGIONS.map((r) => (
          <button
            key={r.uf}
            onClick={() => onRegionChange(r.uf)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap transition-colors ${
              activeRegion === r.uf ? "bg-brand-primary text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <span className={`text-[10px] font-mono px-1 rounded ${activeRegion === r.uf ? "bg-white/20" : "bg-neutral-100"}`}>
              {r.uf}
            </span>
            {r.label}
          </button>
        ))}
      </div>

      {/* Region header card */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={16} className="text-brand-primary" />
              <h3 className="text-[16px] font-bold text-neutral-900">{region.label} ({region.uf})</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary uppercase">Live</span>
            </div>
            <p className="text-[12px] text-neutral-500">
              {lang === "pt" ? "Culturas dominantes" : "Dominant crops"}: <span className="font-semibold text-neutral-700">{region.bias}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase">{lang === "pt" ? "Culturas com cotação" : "Quoted crops"}</p>
            <p className="text-[28px] font-bold text-neutral-900 font-mono">{loading ? "..." : data.length}/{CULTURES.length}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-12 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-brand-primary" />
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center">
          <Sprout size={32} className="mx-auto text-neutral-300 mb-2" />
          <p className="text-[13px] text-neutral-500">
            {lang === "pt"
              ? `Sem cotações regionais disponíveis para ${region.label} no momento.`
              : `No regional quotes available for ${region.label} at this moment.`}
          </p>
        </div>
      ) : (
        <>
          {/* Average price by culture chart */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
              <BarChart3 size={14} className="text-brand-primary" />
              <h4 className="text-[12px] font-bold text-neutral-700 uppercase tracking-wider">
                {lang === "pt" ? "Preço Médio por Cultura em" : "Average Price per Crop in"} {region.uf}
              </h4>
            </div>
            <div className="p-4 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFEADF" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#A69B87" }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fontWeight: 600 }} width={80} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                    formatter={(value: any, _name, item: any) => [
                      `R$ ${Number(value).toFixed(2)} (${item.payload.count} praças)`,
                      lang === "pt" ? "Média" : "Average",
                    ]}
                  />
                  <Bar dataKey="avgPrice" radius={[0, 4, 4, 0]} barSize={22}>
                    {data.map((d) => <Cell key={d.slug} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Value support/destruction analysis */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
              <Layers size={14} className="text-brand-primary" />
              <h4 className="text-[12px] font-bold text-neutral-700 uppercase tracking-wider">
                {lang === "pt" ? "Análise de Valor — Suporta ou Destrói?" : "Value Analysis — Supports or Destroys?"}
              </h4>
            </div>
            <div className="divide-y divide-neutral-100">
              {analysisItems.map((item) => {
                const signalColor = item.signal === "support" ? "emerald" : item.signal === "destroy" ? "rose" : "neutral";
                const colorClasses: Record<string, string> = {
                  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
                  rose: "bg-rose-50 border-rose-200 text-rose-800",
                  neutral: "bg-neutral-50 border-neutral-200 text-neutral-700",
                };
                const signalIcon = item.signal === "support" ? "✓" : item.signal === "destroy" ? "✗" : "≈";
                const signalLabel = item.signal === "support"
                  ? (lang === "pt" ? "Suporta" : "Supports")
                  : item.signal === "destroy"
                  ? (lang === "pt" ? "Destrói" : "Destroys")
                  : (lang === "pt" ? "Neutro" : "Neutral");
                return (
                  <div key={item.slug} className="p-4 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-bold border ${colorClasses[signalColor]} shrink-0`}>
                      {signalIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-[14px] font-bold text-neutral-900">{item.label}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${colorClasses[signalColor]}`}>
                            {signalLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-mono">
                          <span className="text-neutral-500">
                            {lang === "pt" ? "Min" : "Min"}: <span className="font-bold text-emerald-700">R$ {item.minPrice.toFixed(2)}</span>
                          </span>
                          <span className="text-neutral-500">
                            {lang === "pt" ? "Méd" : "Avg"}: <span className="font-bold text-neutral-900">R$ {item.avgPrice.toFixed(2)}</span>
                          </span>
                          <span className="text-neutral-500">
                            {lang === "pt" ? "Max" : "Max"}: <span className="font-bold text-rose-700">R$ {item.maxPrice.toFixed(2)}</span>
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] text-neutral-600 leading-snug">{item.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2 bg-neutral-50 border-t border-neutral-200 text-[10px] text-neutral-500 italic">
              {lang === "pt"
                ? "Heurística: ✓ = mercado líquido (≥5 praças, dispersão <15%); ✗ = pouco líquido ou alta dispersão (>30%)."
                : "Heuristic: ✓ = liquid market (≥5 locations, dispersion <15%); ✗ = illiquid or high dispersion (>30%)."}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
