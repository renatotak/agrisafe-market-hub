"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Lang } from "@/lib/i18n";
import {
  BarChart3, Loader2, Settings as SettingsIcon, X, Check,
  ExternalLink, TrendingUp, TrendingDown,
} from "lucide-react";

const NA_COTACOES_URL = "https://www.noticiasagricolas.com.br/cotacoes/";

const COMMODITY_COLORS: Record<string, string> = {
  soja: "#5B7A2F", milho: "#E8722A", "boi-gordo": "#8B4513", cafe: "#6F4E37",
  algodao: "#7FA02B", trigo: "#DAA520", acucar: "#2196F3", leite: "#9C27B0",
  arroz: "#795548", frango: "#FF5722", etanol: "#009688", cacau: "#4E342E",
  suinos: "#E91E63", amendoim: "#FF9800", "suco-de-laranja": "#F57C00",
  feijao: "#8D6E63", ovos: "#FFC107", latex: "#607D8B", sorgo: "#CDDC39",
};

const COMMODITY_EN: Record<string, string> = {
  "Soja": "Soybean", "Milho": "Corn", "Boi Gordo": "Cattle", "Café": "Coffee",
  "Algodão": "Cotton", "Trigo": "Wheat", "Açúcar": "Sugar", "Leite": "Milk",
  "Arroz": "Rice", "Frango": "Chicken", "Etanol": "Ethanol", "Cacau": "Cocoa",
  "Suínos": "Pork", "Amendoim": "Peanut", "Suco de Laranja": "Orange Juice",
  "Feijão": "Beans", "Ovos": "Eggs", "Látex": "Rubber", "Sorgo": "Sorghum",
};

interface NAPriceItem { label: string; price: string; variation: string; direction: "up" | "down" | "stable" }
interface NACommodity { commodity: string; slug: string; unit?: string; items: NAPriceItem[] }

const NA_STORAGE_KEY = "agsf-na-visible-commodities";

export function NACotacoesWidget({ lang }: { lang: Lang }) {
  const [data, setData] = useState<NACommodity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibleSlugs, setVisibleSlugs] = useState<Set<string> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NA_STORAGE_KEY);
      if (saved) setVisibleSlugs(new Set(JSON.parse(saved)));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  useEffect(() => {
    fetch("/api/prices-na")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.length > 0) {
          const filtered = (json.data as NACommodity[]).filter(
            (c) => c.items.some((it) => !it.price.includes("s/ cotação"))
          ).map((c) => ({
            ...c,
            items: c.items.filter((it) => !it.price.includes("s/ cotação")),
          }));
          setData(filtered);
          setUpdatedAt(json.updated_at);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const toggleSlug = useCallback((slug: string) => {
    setVisibleSlugs((prev) => {
      const allSlugs = data.map((c) => c.slug);
      const current = prev ?? new Set(allSlugs);
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      const result = next.size === allSlugs.length ? null : next;
      try {
        if (result) localStorage.setItem(NA_STORAGE_KEY, JSON.stringify([...result]));
        else localStorage.removeItem(NA_STORAGE_KEY);
      } catch { /* ignore */ }
      return result;
    });
  }, [data]);

  const selectAll = useCallback(() => {
    setVisibleSlugs(null);
    try { localStorage.removeItem(NA_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const displayed = visibleSlugs ? data.filter((c) => visibleSlugs.has(c.slug)) : data;

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-brand-primary" />
          <h3 className="text-[15px] font-bold text-neutral-900">
            {lang === "pt" ? "Cotações Agro em Tempo Real" : "Real-Time Agro Prices"}
          </h3>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary uppercase tracking-wider">
            Live
          </span>
          {visibleSlugs && (
            <span className="text-[10px] text-neutral-400">{visibleSlugs.size}/{data.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-[11px] text-neutral-400 hidden sm:block">
              {new Date(updatedAt).toLocaleTimeString(lang === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`p-1.5 rounded-md transition-colors ${settingsOpen ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"}`}
              title={lang === "pt" ? "Configurar commodities visíveis" : "Configure visible commodities"}
            >
              <SettingsIcon size={15} />
            </button>
            {settingsOpen && data.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-white rounded-lg border border-neutral-200 shadow-lg">
                <div className="p-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-neutral-900">
                    {lang === "pt" ? "Commodities visíveis" : "Visible commodities"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={selectAll}
                      className="text-[10px] font-medium text-brand-primary hover:underline"
                    >
                      {lang === "pt" ? "Todas" : "All"}
                    </button>
                    <button onClick={() => setSettingsOpen(false)} className="p-0.5 text-neutral-400 hover:text-neutral-600">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="p-2 max-h-72 overflow-y-auto space-y-0.5">
                  {data.map((c) => {
                    const isVisible = !visibleSlugs || visibleSlugs.has(c.slug);
                    return (
                      <button
                        key={c.slug}
                        onClick={() => toggleSlug(c.slug)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded text-left transition-colors ${isVisible ? "bg-brand-primary/5" : "hover:bg-neutral-50"}`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isVisible ? "bg-brand-primary border-brand-primary" : "border-neutral-300"}`}>
                          {isVisible && <Check size={11} className="text-white" />}
                        </div>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COMMODITY_COLORS[c.slug] || "#9E9E9E" }} />
                        <span className={`text-[12px] ${isVisible ? "font-semibold text-neutral-900" : "text-neutral-500"}`}>
                          {lang === "pt" ? c.commodity : (COMMODITY_EN[c.commodity] || c.commodity)}
                        </span>
                        {c.unit && <span className="text-[9px] text-neutral-400 ml-auto">{c.unit}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <a href={NA_COTACOES_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12px] font-medium text-brand-primary hover:underline">
            Notícias Agrícolas <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-neutral-400" />
        </div>
      ) : error || data.length === 0 ? (
        <div className="p-8 text-center text-neutral-400 text-[13px]">
          {lang === "pt" ? "Cotações indisponíveis" : "Prices unavailable"}
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
          <SettingsIcon size={24} className="mb-2" />
          <p className="text-[13px]">{lang === "pt" ? "Nenhuma commodity selecionada" : "No commodities selected"}</p>
          <button onClick={() => setSettingsOpen(true)} className="mt-2 text-[12px] font-medium text-brand-primary hover:underline">
            {lang === "pt" ? "Configurar" : "Configure"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100">
          {displayed.map((c) => (
            <a key={c.slug} href={`https://www.noticiasagricolas.com.br/cotacoes/${c.slug}`}
              target="_blank" rel="noopener noreferrer"
              className="block p-4 hover:bg-neutral-50 transition-colors group">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COMMODITY_COLORS[c.slug] || "#9E9E9E" }} />
                <span className="text-[12px] font-bold text-neutral-900 uppercase tracking-wide group-hover:text-brand-primary transition-colors">
                  {lang === "pt" ? c.commodity : (COMMODITY_EN[c.commodity] || c.commodity)}
                </span>
                {c.unit && (
                  <span className="text-[10px] text-neutral-400 font-normal normal-case">{c.unit}</span>
                )}
              </div>
              <div className="space-y-1.5">
                {c.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-[12px]">
                    <span className="text-neutral-500 truncate mr-2">{item.label}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-neutral-900">{item.price}</span>
                      {item.variation && (
                        <span className={`text-[11px] font-semibold ${
                          item.direction === "up" ? "text-green-600" :
                          item.direction === "down" ? "text-red-500" :
                          "text-neutral-400"
                        }`}>
                          {item.direction === "up" && <TrendingUp size={11} className="inline mr-0.5" />}
                          {item.direction === "down" && <TrendingDown size={11} className="inline mr-0.5" />}
                          {item.variation}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
