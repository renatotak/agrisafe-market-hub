"use client";

import { Lang, t } from "@/lib/i18n";
import { commodityPrices, marketIndicators } from "@/data/market";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";

export function MarketPulse({ lang }: { lang: Lang }) {
  const tr = t(lang);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{tr.marketPulse.title}</h2>
          <p className="text-slate-500 mt-1">{tr.marketPulse.subtitle}</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm transition-colors">
          <RefreshCw size={16} />
          {lang === "pt" ? "Atualizar" : "Refresh"}
        </button>
      </div>

      {/* Key Indicators */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {marketIndicators.slice(0, 3).map((ind) => (
          <div key={ind.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{lang === "pt" ? ind.name_pt : ind.name_en}</p>
              {ind.trend === "up" && <TrendingUp size={16} className="text-emerald-500" />}
              {ind.trend === "down" && <TrendingDown size={16} className="text-red-500" />}
              {ind.trend === "stable" && <Minus size={16} className="text-slate-400" />}
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{ind.value}</p>
            <p className="text-xs text-slate-400 mt-1">{tr.marketPulse.source}: {ind.source}</p>
          </div>
        ))}
      </div>

      {/* Commodity Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-slate-900">{lang === "pt" ? "Preços de Commodities" : "Commodity Prices"}</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-xs text-slate-500 uppercase">
              <th className="px-6 py-3 text-left">{tr.marketPulse.commodity}</th>
              <th className="px-6 py-3 text-right">{tr.marketPulse.price}</th>
              <th className="px-6 py-3 text-right">{tr.marketPulse.change} (24h)</th>
              <th className="px-6 py-3 text-left">{tr.marketPulse.source}</th>
              <th className="px-6 py-3 text-left">{tr.marketPulse.lastUpdate}</th>
            </tr>
          </thead>
          <tbody>
            {commodityPrices.map((cp) => (
              <tr key={cp.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-900">{lang === "pt" ? cp.name_pt : cp.name_en}</td>
                <td className="px-6 py-4 text-right font-mono text-slate-900">
                  {cp.price.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2 })} {cp.unit}
                </td>
                <td className="px-6 py-4 text-right">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-medium ${
                    cp.change24h > 0 ? "text-emerald-700 bg-emerald-50" : cp.change24h < 0 ? "text-red-700 bg-red-50" : "text-slate-500 bg-slate-50"
                  }`}>
                    {cp.change24h > 0 ? <TrendingUp size={12} /> : cp.change24h < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                    {cp.change24h > 0 ? "+" : ""}{cp.change24h}%
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">{cp.source}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{cp.lastUpdate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Additional Indicators */}
      <div className="grid grid-cols-3 gap-4">
        {marketIndicators.slice(3).map((ind) => (
          <div key={ind.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{lang === "pt" ? ind.name_pt : ind.name_en}</p>
              {ind.trend === "up" && <TrendingUp size={16} className="text-emerald-500" />}
              {ind.trend === "down" && <TrendingDown size={16} className="text-red-500" />}
              {ind.trend === "stable" && <Minus size={16} className="text-slate-400" />}
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{ind.value}</p>
            <p className="text-xs text-slate-400 mt-1">{tr.marketPulse.source}: {ind.source}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
