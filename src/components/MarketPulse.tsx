"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Loader2 } from "lucide-react";

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

export function MarketPulse({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [commodities, setCommodities] = useState<CommodityPrice[]>([]);
  const [indicators, setIndicators] = useState<MarketIndicator[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: comms }, { data: inds }] = await Promise.all([
      supabase.from("commodity_prices").select("*").order("id"),
      supabase.from("market_indicators").select("*").order("id"),
    ]);
    if (comms) setCommodities(comms);
    if (inds) setIndicators(inds);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{tr.marketPulse.title}</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">{tr.marketPulse.subtitle}</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium text-sm transition-all shadow-sm active:scale-95"
        >
          <RefreshCw size={16} />
          {lang === "pt" ? "Atualizar" : "Refresh"}
        </button>
      </div>

      {/* Key Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 md:gap-6 gap-4 mb-8">
        {indicators.slice(0, 3).map((ind) => (
          <div key={ind.id} className="bg-white rounded-2xl p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">{lang === "pt" ? ind.name_pt : ind.name_en}</p>
              <div className={`p-2 rounded-lg ${ind.trend === "up" ? "bg-emerald-50" : ind.trend === "down" ? "bg-red-50" : "bg-slate-50"}`}>
                {ind.trend === "up" && <TrendingUp size={18} className="text-emerald-500" />}
                {ind.trend === "down" && <TrendingDown size={18} className="text-red-500" />}
                {ind.trend === "stable" && <Minus size={18} className="text-slate-400" />}
              </div>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 tracking-tighter">{ind.value}</p>
            <p className="text-xs text-slate-400 mt-2 font-medium">{tr.marketPulse.source}: {ind.source}</p>
          </div>
        ))}
      </div>

      {/* Commodity Table */}
      <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden mb-8 md:mb-10">
        <div className="px-6 py-5 border-b border-gray-100/80 bg-slate-50/50">
          <h3 className="font-bold text-lg text-slate-900">{lang === "pt" ? "Preços de Commodities" : "Commodity Prices"}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-6 py-4 text-left whitespace-nowrap">{tr.marketPulse.commodity}</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">{tr.marketPulse.price}</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">{tr.marketPulse.change} (24h)</th>
                <th className="px-6 py-4 text-left whitespace-nowrap">{tr.marketPulse.source}</th>
                <th className="px-6 py-4 text-left whitespace-nowrap">{tr.marketPulse.lastUpdate}</th>
              </tr>
            </thead>
          <tbody>
            {commodities.map((cp) => (
              <tr key={cp.id} className="border-b border-gray-50 hover:bg-slate-50/50 transition-colors last:border-0">
                <td className="px-6 py-4 font-semibold text-slate-900 whitespace-nowrap">{lang === "pt" ? cp.name_pt : cp.name_en}</td>
                <td className="px-6 py-4 text-right font-mono text-slate-900 font-medium whitespace-nowrap">
                  {cp.price.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2 })} {cp.unit}
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${
                    cp.change_24h > 0 ? "text-emerald-700 bg-emerald-100/50" : cp.change_24h < 0 ? "text-red-700 bg-red-100/50" : "text-slate-600 bg-slate-100"
                  }`}>
                    {cp.change_24h > 0 ? <TrendingUp size={14} /> : cp.change_24h < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                    {cp.change_24h > 0 ? "+" : ""}{cp.change_24h}%
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{cp.source}</td>
                <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{new Date(cp.last_update).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Additional Indicators */}
      <h3 className="font-bold text-lg text-slate-900 mb-4 px-1">{lang === "pt" ? "Macroeconomia" : "Macroeconomy"}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 pb-4">
        {indicators.slice(3).map((ind) => (
          <div key={ind.id} className="bg-white rounded-2xl p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">{lang === "pt" ? ind.name_pt : ind.name_en}</p>
              <div className={`p-2 rounded-lg ${ind.trend === "up" ? "bg-emerald-50" : ind.trend === "down" ? "bg-red-50" : "bg-slate-50"}`}>
                {ind.trend === "up" && <TrendingUp size={18} className="text-emerald-500" />}
                {ind.trend === "down" && <TrendingDown size={18} className="text-red-500" />}
                {ind.trend === "stable" && <Minus size={18} className="text-slate-400" />}
              </div>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 tracking-tighter">{ind.value}</p>
            <p className="text-xs text-slate-400 mt-2 font-medium">{tr.marketPulse.source}: {ind.source}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
