"use client";

import { useEffect, useState, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, Zap,
  ExternalLink, MapPin, Globe, Truck, Layers, BarChart3,
  Calendar, Sprout,
} from "lucide-react";
import { CommodityMap } from "@/components/CommodityMap";
import { NACotacoesWidget } from "@/components/NACotacoesWidget";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommodityPrice {
  id: string;
  name_pt: string;
  name_en: string;
  price: number;
  unit: string;
  change_24h: number;
  source: string;
  last_update: string;
}

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

const CULTURES = [
  { slug: "soja",       label: "Soja",      en: "Soybean", color: "#5B7A2F", region: "BR (CEPEA)", tvSymbol: "CBOT:ZS1!", intlMarket: "CBOT — Chicago" },
  { slug: "milho",      label: "Milho",     en: "Corn",    color: "#E8722A", region: "BR (CEPEA)", tvSymbol: "CBOT:ZC1!", intlMarket: "CBOT — Chicago" },
  { slug: "cafe",       label: "Café",      en: "Coffee",  color: "#6F4E37", region: "BR (CEPEA)", tvSymbol: "ICEUS:KC1!", intlMarket: "ICE US — New York" },
  { slug: "boi-gordo",  label: "Boi Gordo", en: "Cattle",  color: "#8B4513", region: "BR (Scot)",  tvSymbol: "BMFBOVESPA:BGI1!", intlMarket: "B3 — São Paulo" },
  { slug: "trigo",      label: "Trigo",     en: "Wheat",   color: "#DAA520", region: "BR",         tvSymbol: "CBOT:ZW1!", intlMarket: "CBOT — Chicago" },
  { slug: "algodao",    label: "Algodão",   en: "Cotton",  color: "#7FA02B", region: "BR (IMEA)",  tvSymbol: "ICEUS:CT1!", intlMarket: "ICE US — New York" },
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function MarketPulse({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [commodities, setCommodities] = useState<CommodityPrice[]>([]);
  const [indicators, setIndicators] = useState<MarketIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAnalysis, setActiveAnalysis] = useState<"culture" | "region">("culture");
  const [activeCulture, setActiveCulture] = useState<string>("soja");
  const [activeRegion, setActiveRegion] = useState<string>("MT");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: comms }, { data: inds }] = await Promise.all([
      supabase.from("commodity_prices").select("*").order("id"),
      supabase.from("market_indicators").select("*").order("id"),
    ]);
    setCommodities(comms || []);
    setIndicators(inds || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[20px] font-bold text-neutral-900">{tr.marketPulse.title}</h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">{tr.marketPulse.subtitle}</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-dark font-medium text-[13px] transition-colors"
        >
          <RefreshCw size={14} />
          {lang === "pt" ? "Atualizar" : "Refresh"}
        </button>
      </div>

      {/* HIGHLIGHTS BOX — top of page, always visible */}
      <MarketHighlights commodities={commodities} indicators={indicators} lang={lang} />

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
          commodities={commodities}
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
  commodities,
  indicators,
  lang,
}: {
  commodities: CommodityPrice[];
  indicators: MarketIndicator[];
  lang: Lang;
}) {
  const sorted = [...commodities].sort((a, b) => Math.abs(b.change_24h) - Math.abs(a.change_24h));
  const topGainer = [...commodities].sort((a, b) => b.change_24h - a.change_24h)[0];
  const topLoser = [...commodities].sort((a, b) => a.change_24h - b.change_24h)[0];
  const mostVolatile = sorted[0];
  const ruptures = commodities.filter((c) => Math.abs(c.change_24h) > 3).length;

  if (commodities.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-[#1a2818] rounded-xl border border-neutral-800 p-5 mb-5 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          <h3 className="text-[12px] font-bold text-neutral-300 uppercase tracking-[0.1em]">
            {lang === "pt" ? "Destaques do Mercado" : "Market Highlights"}
          </h3>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase tracking-wider">Live</span>
        </div>
        <span className="text-[10px] text-neutral-500">
          {lang === "pt" ? "Atualizado" : "Updated"}: {commodities[0]?.last_update ? new Date(commodities[0].last_update).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US") : "—"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {topGainer && (
          <HighlightCard
            label={lang === "pt" ? "Maior Alta" : "Top Gainer"}
            icon={<TrendingUp size={14} />}
            color="emerald"
            commodity={topGainer}
            lang={lang}
          />
        )}
        {topLoser && (
          <HighlightCard
            label={lang === "pt" ? "Maior Queda" : "Top Loser"}
            icon={<TrendingDown size={14} />}
            color="rose"
            commodity={topLoser}
            lang={lang}
          />
        )}
        {mostVolatile && (
          <HighlightCard
            label={lang === "pt" ? "Mais Volátil" : "Most Volatile"}
            icon={<Zap size={14} />}
            color="amber"
            commodity={mostVolatile}
            lang={lang}
          />
        )}
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Layers size={12} className="text-blue-400" />
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              {lang === "pt" ? "Indicadores" : "Indicators"}
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
                {ruptures} {lang === "pt" ? "alertas ativos" : "active alerts"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HighlightCard({
  label,
  icon,
  color,
  commodity,
  lang,
}: {
  label: string;
  icon: React.ReactNode;
  color: "emerald" | "rose" | "amber";
  commodity: CommodityPrice;
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
  const isUp = commodity.change_24h > 0;

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} to-neutral-800/50 border rounded-lg p-3`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={textColor[color]}>{icon}</span>
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-[13px] font-semibold text-white truncate">
        {lang === "pt" ? commodity.name_pt : commodity.name_en}
      </p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-[20px] font-bold text-white font-mono tracking-tight">
          {formatPrice(commodity.price, lang)}
        </span>
        <span className="text-[10px] text-neutral-400">{commodity.unit}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className={`text-[12px] font-bold ${isUp ? "text-emerald-400" : commodity.change_24h < 0 ? "text-rose-400" : "text-neutral-500"}`}>
          {isUp ? "▲" : commodity.change_24h < 0 ? "▼" : "—"} {isUp ? "+" : ""}{commodity.change_24h.toFixed(2)}%
        </span>
        <span className="text-[9px] text-neutral-500 font-medium">
          {commodity.source}
        </span>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-neutral-700/50 flex items-center justify-between text-[9px] text-neutral-500">
        <span className="flex items-center gap-0.5">
          <MapPin size={8} />
          {lang === "pt" ? "BR Nacional" : "BR National"}
        </span>
        <span>{formatRelativeTime(commodity.last_update, lang)}</span>
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
  commodities,
  lang,
}: {
  activeCulture: string;
  onCultureChange: (slug: string) => void;
  commodities: CommodityPrice[];
  lang: Lang;
}) {
  const culture = CULTURES.find((c) => c.slug === activeCulture)!;
  const [regionalData, setRegionalData] = useState<RegionalPrice[]>([]);
  const [unit, setUnit] = useState<string>("");
  const [closingDate, setClosingDate] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/prices-na/regional?commodity=${activeCulture}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setRegionalData(d.data.filter((p: RegionalPrice) => p.price !== null));
          setUnit(d.unit || "");
          setClosingDate(d.closing_date || "");
        } else {
          setRegionalData([]);
        }
      })
      .catch(() => setRegionalData([]))
      .finally(() => setLoading(false));
  }, [activeCulture]);

  // Logistics spread analysis
  const logistics = useMemo(() => {
    const valid = regionalData.filter((p) => p.price !== null);
    if (valid.length < 2) return null;
    const sorted = [...valid].sort((a, b) => (a.price || 0) - (b.price || 0));
    const cheapest = sorted.slice(0, 5);
    const expensive = sorted.slice(-5).reverse();
    const min = sorted[0].price || 0;
    const max = sorted[sorted.length - 1].price || 0;
    const spread = max - min;
    const spreadPct = min > 0 ? (spread / min) * 100 : 0;
    return { cheapest, expensive, min, max, spread, spreadPct };
  }, [regionalData]);

  // Find the matching commodity record (BCB)
  const cultureMap: Record<string, string> = {
    soja: "soy", milho: "corn", cafe: "coffee",
    "boi-gordo": "cattle", trigo: "wheat", algodao: "cotton",
  };
  const bcbId = cultureMap[activeCulture];
  const bcbPrice = commodities.find((c) => c.id === bcbId);

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
      {bcbPrice && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: culture.color }} />
                <h3 className="text-[16px] font-bold text-neutral-900">
                  {lang === "pt" ? bcbPrice.name_pt : bcbPrice.name_en}
                </h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase">Live</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[36px] font-bold text-neutral-900 tracking-tight font-mono">
                  R$ {formatPrice(bcbPrice.price, lang)}
                </span>
                <span className="text-[14px] text-neutral-500">{bcbPrice.unit}</span>
                <span className={`text-[16px] font-bold ml-2 ${
                  bcbPrice.change_24h > 0 ? "text-emerald-600" :
                  bcbPrice.change_24h < 0 ? "text-rose-600" : "text-neutral-500"
                }`}>
                  {bcbPrice.change_24h > 0 ? "▲ +" : bcbPrice.change_24h < 0 ? "▼ " : "— "}
                  {bcbPrice.change_24h.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] min-w-[200px]">
              <div>
                <p className="text-neutral-400 uppercase font-semibold text-[9px]">{lang === "pt" ? "Fonte" : "Source"}</p>
                <p className="font-bold mt-0.5" style={{ color: SOURCE_COLORS[bcbPrice.source] || "#666" }}>{bcbPrice.source}</p>
              </div>
              <div>
                <p className="text-neutral-400 uppercase font-semibold text-[9px]">{lang === "pt" ? "Região" : "Region"}</p>
                <p className="font-bold text-neutral-700 mt-0.5">{culture.region}</p>
              </div>
              <div>
                <p className="text-neutral-400 uppercase font-semibold text-[9px]">{lang === "pt" ? "Atualização" : "Updated"}</p>
                <p className="font-bold text-neutral-700 mt-0.5">{formatRelativeTime(bcbPrice.last_update, lang)}</p>
              </div>
              <div>
                <p className="text-neutral-400 uppercase font-semibold text-[9px]">{lang === "pt" ? "Mercado Intl." : "Intl. Market"}</p>
                <p className="font-bold text-neutral-700 mt-0.5">{culture.intlMarket}</p>
              </div>
            </div>
          </div>
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
            {closingDate && <span className="text-[10px] text-neutral-400 ml-auto">{closingDate}</span>}
          </div>
          <div className="h-[400px]">
            <CommodityMap lang={lang} />
          </div>
        </div>

        {/* International TradingView chart */}
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-blue-600" />
              <h4 className="text-[12px] font-bold text-neutral-700 uppercase tracking-wider">
                {lang === "pt" ? "Comparação Internacional" : "International Comparison"}
              </h4>
            </div>
            <a
              href={`https://www.tradingview.com/symbols/${culture.tvSymbol.replace(":", "-")}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold flex items-center gap-0.5 text-blue-600 hover:underline"
            >
              {culture.tvSymbol} <ExternalLink size={9} />
            </a>
          </div>
          <div className="h-[400px]">
            <iframe
              key={culture.tvSymbol}
              src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(culture.tvSymbol)}&interval=D&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=f1f3f6&studies=&theme=light&style=2&timezone=America%2FSao_Paulo&locale=${lang === "pt" ? "br" : "en"}&utm_source=agsf-mkthub&utm_medium=widget`}
              className="w-full h-full border-0"
              allowTransparency
              sandbox="allow-scripts allow-same-origin allow-popups"
              loading="lazy"
            />
          </div>
        </div>
      </div>

      {/* Logistics & Infrastructure spread analysis */}
      {loading ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-8 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-neutral-400" />
        </div>
      ) : logistics ? (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
            <Truck size={14} className="text-brand-primary" />
            <h4 className="text-[12px] font-bold text-neutral-700 uppercase tracking-wider">
              {lang === "pt" ? "Logística & Infraestrutura" : "Logistics & Infrastructure"}
            </h4>
            <span className="text-[10px] text-neutral-400 ml-auto">
              {regionalData.length} {lang === "pt" ? "praças" : "locations"} · {unit}
            </span>
          </div>

          <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Spread KPI */}
            <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-lg p-4">
              <p className="text-[10px] font-bold text-amber-700 uppercase mb-1">
                {lang === "pt" ? "Spread Logístico" : "Logistics Spread"}
              </p>
              <p className="text-[28px] font-bold text-neutral-900 font-mono tracking-tight">
                R$ {formatPrice(logistics.spread, lang)}
              </p>
              <p className="text-[11px] text-amber-700 font-semibold mt-1">
                {logistics.spreadPct.toFixed(1)}% {lang === "pt" ? "diferença máx-mín" : "max-min gap"}
              </p>
              <p className="text-[10px] text-neutral-500 mt-2">
                {lang === "pt"
                  ? "Diferença entre praça mais cara e mais barata reflete custos de frete e infraestrutura."
                  : "Gap between most/least expensive locations reflects freight and infrastructure costs."}
              </p>
            </div>

            {/* Top 5 cheapest */}
            <div>
              <p className="text-[10px] font-bold text-emerald-700 uppercase mb-2 flex items-center gap-1">
                <TrendingDown size={10} />
                {lang === "pt" ? "5 Praças Mais Baratas" : "Top 5 Cheapest"}
              </p>
              <div className="space-y-1.5">
                {logistics.cheapest.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="w-4 text-neutral-400 font-mono">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-800 truncate">{p.city}/{p.uf}</p>
                      {p.cooperative && <p className="text-[9px] text-neutral-400 truncate">{p.cooperative}</p>}
                    </div>
                    <span className="font-bold text-emerald-700 font-mono shrink-0">
                      R$ {p.price?.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 5 most expensive */}
            <div>
              <p className="text-[10px] font-bold text-rose-700 uppercase mb-2 flex items-center gap-1">
                <TrendingUp size={10} />
                {lang === "pt" ? "5 Praças Mais Caras" : "Top 5 Most Expensive"}
              </p>
              <div className="space-y-1.5">
                {logistics.expensive.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="w-4 text-neutral-400 font-mono">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-800 truncate">{p.city}/{p.uf}</p>
                      {p.cooperative && <p className="text-[9px] text-neutral-400 truncate">{p.cooperative}</p>}
                    </div>
                    <span className="font-bold text-rose-700 font-mono shrink-0">
                      R$ {p.price?.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center text-[12px] text-neutral-500">
          {lang === "pt" ? "Dados regionais insuficientes para análise logística." : "Insufficient regional data for logistics analysis."}
        </div>
      )}
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
