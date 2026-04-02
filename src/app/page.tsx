"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Lang, t } from "@/lib/i18n";
import { DataSources } from "@/components/DataSources";
import { KnowledgeBase } from "@/components/KnowledgeBase";
import { MarketPulse } from "@/components/MarketPulse";
import { CompetitorRadar } from "@/components/CompetitorRadar";
import { AgroNews } from "@/components/AgroNews";
import { EventTracker } from "@/components/EventTracker";
import { ContentHub } from "@/components/ContentHub";
import { AgInputIntelligence } from "@/components/AgInputIntelligence";
import { RegulatoryFramework } from "@/components/RegulatoryFramework";
import { RecuperacaoJudicial } from "@/components/RecuperacaoJudicial";
import { RetailersDirectory } from "@/components/RetailersDirectory";
import { Header } from "@/components/Header";
import { Sidebar, getModuleTitle } from "@/components/Sidebar";
import {
  mockDataSources, mockCommodities, mockMarketAlerts,
  mockPublishedArticles, mockContentTopics, mockRegulatoryNorms,
  mockCompetitors, mockNews, mockEvents, mockRecuperacaoJudicial
} from "@/data/mock";
import {
  Database, BarChart3, TrendingUp, TrendingDown, PenTool,
  BookOpen, AlertTriangle, Zap, ChevronRight, Newspaper, Radar, Calendar,
  Circle, ExternalLink, Loader2, Settings, X, Check,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

import type { Module } from "@/components/Sidebar";

export default function Home() {
  const [lang, setLang] = useState<Lang>("pt");
  const [activeModule, setActiveModule] = useState<Module>("dashboard");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F4EF" }}>
      <Sidebar
        lang={lang}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <Header
        lang={lang}
        onToggleLang={() => setLang(lang === "pt" ? "en" : "pt")}
        onLogout={handleLogout}
        onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        moduleTitle={getModuleTitle(activeModule, lang)}
      />
      <main className="md:ml-[var(--sidebar-width)] pt-[var(--header-height)] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          {activeModule === "dashboard"    && <DashboardOverview lang={lang} setActiveModule={setActiveModule} />}
          {activeModule === "dataSources"  && <DataSources lang={lang} />}
          {activeModule === "market"       && <MarketPulse lang={lang} />}
          {activeModule === "inputs"       && <AgInputIntelligence lang={lang} />}
          {activeModule === "competitors"  && <CompetitorRadar lang={lang} />}
          {activeModule === "news"         && <AgroNews lang={lang} />}
          {activeModule === "events"       && <EventTracker lang={lang} />}
          {activeModule === "contentHub"   && <ContentHub lang={lang} />}
          {activeModule === "regulatory"   && <RegulatoryFramework lang={lang} />}
          {activeModule === "recuperacao"  && <RecuperacaoJudicial lang={lang} />}
          {activeModule === "retailers"    && <RetailersDirectory lang={lang} />}
          {activeModule === "knowledgeBase"&& <KnowledgeBase lang={lang} />}
        </div>
      </main>
    </div>
  );
}

import { DashboardMap } from "@/components/DashboardMap";
import { mockRetailers } from "@/data/mock";

// ─── Executive Dashboard Overview ───

function DashboardOverview({ lang, setActiveModule }: { lang: Lang; setActiveModule: (m: Module) => void }) {
  // Source health
  const healthyCt = mockDataSources.filter((s) => s.status === "healthy").length;
  const totalSources = mockDataSources.length;

  // Market intelligence
  const biggestMover = [...mockCommodities].sort((a, b) => Math.abs(b.change_24h) - Math.abs(a.change_24h))[0];
  const highAlerts = mockMarketAlerts.filter((a) => a.severity === "high");
  const totalSignals = mockCompetitors.reduce((s, c) => s + (c.competitor_signals?.length || 0), 0);
  const upcomingEvents = mockEvents.filter((e) => new Date(e.date_start) > new Date()).length;

  // Content
  const publishedThisMonth = mockPublishedArticles.filter((a) => a.published_at >= "2026-03-01").length;
  const topicsInPipeline = mockContentTopics.filter((t) => t.status !== "published").length;

  // Regulatory & Legal
  const highImpactNorms = mockRegulatoryNorms.filter((n) => n.impact_level === "high");
  const latestNorm = mockRegulatoryNorms[0];

  // Knowledge Base & New items
  const rjAlerts = mockRecuperacaoJudicial.length;
  const numRetailers = mockRetailers.length;

  // Live events from AgroAgenda
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/events-na")
      .then((r) => r.json())
      .then((json) => { if (json.success && json.data) setLiveEvents(json.data); })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">

      {/* Row 1: Market & Competitors (Head Comercial & SEO) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Market Pulse */}
        <button onClick={() => setActiveModule("market")} className="rounded-lg p-5 bg-white border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left hover:border-brand-primary transition-colors group">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase flex items-center justify-between">
            {lang === "pt" ? "Pulso do Mercado" : "Market Pulse"}
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary" />
          </p>
          <div className="mt-3 flex items-end gap-3">
            <div>
              <p className="text-[20px] font-bold text-neutral-900 leading-none">{lang === "pt" ? biggestMover.name_pt : biggestMover.name_en}</p>
              <p className={`text-[13px] font-bold mt-1.5 ${biggestMover.change_24h >= 0 ? "text-success-dark" : "text-error"}`}>
                {biggestMover.change_24h >= 0 ? <TrendingUp size={14} className="inline mr-1" /> : <TrendingDown size={14} className="inline mr-1" />}
                {biggestMover.change_24h > 0 ? "+" : ""}{biggestMover.change_24h}%
              </p>
            </div>
          </div>
        </button>

        {/* Competitor Radar */}
        <button onClick={() => setActiveModule("competitors")} className="rounded-lg p-5 bg-white border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left hover:border-brand-primary transition-colors group">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase flex items-center justify-between">
            {lang === "pt" ? "Sinais Competitivos" : "Competitive Signals"}
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary" />
          </p>
          <p className="text-[28px] font-bold text-neutral-900 mt-2 mb-1 leading-none">{totalSignals}</p>
          <p className="text-[12px] text-neutral-500">{mockCompetitors.length} {lang === "pt" ? "concorrentes mapeados" : "mapped competitors"}</p>
        </button>

        {/* Ag Input Intelligence */}
        <button onClick={() => setActiveModule("inputs")} className="rounded-lg p-5 bg-white border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left hover:border-brand-primary transition-colors group">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase flex items-center justify-between">
            {lang === "pt" ? "Inteligência de Insumos" : "Input Intelligence"}
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary" />
          </p>
          <p className="text-[14px] font-semibold text-brand-primary mt-2 flex items-center gap-1"><PenTool size={14} /> Relatório NPK</p>
          <p className="text-[12px] text-neutral-500 mt-1 line-clamp-2">Atrasos de fertilizantes nos portos do sul.</p>
        </button>

        {/* Retailers Directory */}
        <button onClick={() => setActiveModule("retailers")} className="rounded-lg p-5 bg-white border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left hover:border-brand-primary transition-colors group">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase flex items-center justify-between">
            {lang === "pt" ? "Diretório de Revendas" : "Retailers Directory"}
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary" />
          </p>
          <p className="text-[28px] font-bold text-neutral-900 mt-2 mb-1 leading-none">23k+</p>
          <p className="text-[12px] text-neutral-500">{numRetailers} {lang === "pt" ? "monitoradas agos/26" : "monitored in Aug/26"}</p>
        </button>
      </div>

      {/* Row 2: Content, Events & News (Digital Marketing & Sales) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* News & Events */}
        <div className="col-span-1 lg:col-span-2 bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-[14px] font-semibold text-neutral-900">{lang === "pt" ? "Mídia & Eventos" : "Media & Events"}</h3>
             <div className="flex gap-4">
               <button onClick={() => setActiveModule("news")} className="text-[12px] font-medium text-brand-primary hover:underline">Ver Notícias</button>
               <button onClick={() => setActiveModule("events")} className="text-[12px] font-medium text-brand-primary hover:underline">Ver Eventos</button>
             </div>
           </div>
           <div className="flex gap-6">
             <div className="flex-1">
                <p className="text-[24px] font-bold text-neutral-900 leading-none">{mockNews.length}</p>
                <p className="text-[11px] text-neutral-500 uppercase mt-1">{lang === "pt" ? "Notícias Ativas" : "Active News"}</p>
             </div>
             <div className="w-px bg-neutral-200"></div>
             <div className="flex-1">
                <p className="text-[24px] font-bold text-neutral-900 leading-none">{upcomingEvents}</p>
                <p className="text-[11px] text-neutral-500 uppercase mt-1">{lang === "pt" ? "Eventos Próximos" : "Upcoming Events"}</p>
             </div>
           </div>
        </div>

        {/* Content Pipeline */}
        <button onClick={() => setActiveModule("contentHub")} className="rounded-lg p-5 bg-brand-surface/20 border border-brand-light text-left hover:border-brand-primary transition-colors group">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase flex items-center justify-between">
            {lang === "pt" ? "Pipeline de Conteúdo" : "Content Pipeline"}
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary" />
          </p>
          <div className="flex items-center gap-3 mt-3">
             <div className="bg-white p-2 rounded border border-brand-light">
               <BookOpen size={16} className="text-brand-primary" />
             </div>
             <div>
               <p className="text-[18px] font-bold text-neutral-900 leading-none">{publishedThisMonth}</p>
               <p className="text-[11px] text-neutral-600 font-medium mt-0.5">{lang === "pt" ? "Publicados no Mês" : "Published this Month"}</p>
             </div>
          </div>
          <p className="text-[12px] text-neutral-600 mt-3"><span className="font-semibold text-brand-primary">{topicsInPipeline}</span> {lang === "pt" ? "pautas em aprovação" : "topics pending approval"}</p>
        </button>
      </div>

      {/* Row 3: Regulatory, Operations & Data Health (Data Analysts & Legal) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Rec Judiciais */}
        <button onClick={() => setActiveModule("recuperacao")} className="rounded-lg p-5 bg-error-light/30 border border-error-light text-left hover:border-error transition-colors group">
          <p className="text-[11px] font-semibold text-error uppercase flex items-center justify-between">
            {lang === "pt" ? "Recuperação Judicial" : "Judicial Recovery"}
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-error" />
          </p>
          <p className="text-[28px] font-bold text-error-dark mt-2 mb-1 leading-none">{rjAlerts}</p>
          <p className="text-[12px] text-error font-medium">{lang === "pt" ? "processos recentes" : "recent active cases"}</p>
        </button>

        {/* Regulatory */}
        <button onClick={() => setActiveModule("regulatory")} className="rounded-lg p-5 bg-white border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left hover:border-brand-primary transition-colors group">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase flex items-center justify-between">
            {lang === "pt" ? "Regulatório" : "Regulatory Watch"}
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary" />
          </p>
          {latestNorm ? (
            <div className="mt-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#1565C0] text-white">{latestNorm.body}</span>
              <p className="text-[12px] font-semibold text-neutral-900 line-clamp-2 mt-1.5">{latestNorm.title}</p>
            </div>
          ) : (
            <p className="text-[14px] text-neutral-500 mt-2 font-medium">Clear</p>
          )}
        </button>

        {/* Knowledge Base */}
        <button onClick={() => setActiveModule("knowledgeBase")} className="rounded-lg p-5 bg-white border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left hover:border-brand-primary transition-colors group">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase flex items-center justify-between">
            {lang === "pt" ? "Base de Conhecimento" : "Knowledge Base"}
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary" />
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Database size={18} className="text-brand-primary" />
             <p className="text-[13px] font-medium text-neutral-900">8 Acervos Indexados</p>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1 line-clamp-1">{lang === "pt" ? "Pronto para RAG / OpenAI" : "Ready for RAG / OpenAI"}</p>
        </button>

        {/* Data Health & Registry */}
        <button onClick={() => setActiveModule("dataSources")} className="rounded-lg p-5 bg-neutral-900 text-left hover:bg-black transition-colors group flex flex-col justify-between">
          <p className="text-[11px] font-semibold text-neutral-400 uppercase flex items-center justify-between">
            {lang === "pt" ? "Saúde dos Dados" : "Data Health"}
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-white" />
          </p>
          <div>
            <div className="flex items-center gap-1.5 mb-2 mt-3 flex-wrap">
              {mockDataSources.slice(0, 10).map((s) => (
                <div key={s.id} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.status === "healthy" ? "#4CAF50" : s.status === "warning" ? "#FF9800" : s.status === "stale" ? "#F44336" : "#9E9E9E" }} />
              ))}
            </div>
            <p className="text-[12px] text-neutral-300">
               <span className="font-bold text-white leading-none text-[16px] mr-1">{healthyCt}/{totalSources}</span> {lang === "pt" ? "fontes operantes" : "sources operating"}
            </p>
          </div>
        </button>
      </div>

      {/* Intelligence Map */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-neutral-900">{lang === "pt" ? "Mapa de Inteligência Integrada" : "Integrated Intelligence Map"}</h3>
          </div>
          <p className="text-[12px] text-neutral-500 hidden sm:block">{lang === "pt" ? "Eventos, Revendas & Alertas" : "Events, Retailers & Alerts"}</p>
        </div>
        <DashboardMap events={mockEvents} liveEvents={liveEvents} retailers={mockRetailers.slice(0, 4)} alerts={highAlerts} lang={lang} />
      </div>

      {/* Notícias Agrícolas — Cotações + News side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NACotacoesWidget lang={lang} />
        <NANoticiasWidget lang={lang} />
      </div>
    </div>
  );
}

// ─── Notícias Agrícolas — Cotações Widget ───

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

function NACotacoesWidget({ lang }: { lang: Lang }) {
  const [data, setData] = useState<NACommodity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibleSlugs, setVisibleSlugs] = useState<Set<string> | null>(null); // null = show all
  const panelRef = useRef<HTMLDivElement>(null);

  // Load saved selection from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NA_STORAGE_KEY);
      if (saved) setVisibleSlugs(new Set(JSON.parse(saved)));
    } catch { /* ignore */ }
  }, []);

  // Close settings panel on outside click
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
      // If null (show all), start from all selected minus this one
      const current = prev ?? new Set(allSlugs);
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      // If all are selected, store null (show all)
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
          {/* Settings button */}
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`p-1.5 rounded-md transition-colors ${settingsOpen ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"}`}
              title={lang === "pt" ? "Configurar commodities visíveis" : "Configure visible commodities"}
            >
              <Settings size={15} />
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
          <a
            href={NA_COTACOES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12px] font-medium text-brand-primary hover:underline"
          >
            Notícias Agrícolas
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-neutral-400" />
        </div>
      ) : error || data.length === 0 ? (
        <NACotacoesFallback lang={lang} />
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
          <Settings size={24} className="mb-2" />
          <p className="text-[13px]">{lang === "pt" ? "Nenhuma commodity selecionada" : "No commodities selected"}</p>
          <button onClick={() => setSettingsOpen(true)} className="mt-2 text-[12px] font-medium text-brand-primary hover:underline">
            {lang === "pt" ? "Configurar" : "Configure"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100">
          {displayed.map((c) => (
            <a
              key={c.slug}
              href={`https://www.noticiasagricolas.com.br/cotacoes/${c.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 hover:bg-neutral-50 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COMMODITY_COLORS[c.slug] || "#9E9E9E" }}
                />
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

// Fallback when scraper can't reach NA
function NACotacoesFallback({ lang }: { lang: Lang }) {
  const commodities = [
    { name: "Soja", en: "Soybean", slug: "soja" },
    { name: "Milho", en: "Corn", slug: "milho" },
    { name: "Boi Gordo", en: "Cattle", slug: "boi-gordo" },
    { name: "Café", en: "Coffee", slug: "cafe" },
    { name: "Algodão", en: "Cotton", slug: "algodao" },
    { name: "Trigo", en: "Wheat", slug: "trigo" },
    { name: "Açúcar", en: "Sugar", slug: "acucar" },
    { name: "Leite", en: "Milk", slug: "leite" },
  ];

  return (
    <div className="p-5">
      <p className="text-[13px] text-neutral-500 mb-4">
        {lang === "pt"
          ? "Cotações indisponíveis no momento. Acesse diretamente:"
          : "Prices temporarily unavailable. Access directly:"}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {commodities.map((c) => (
          <a
            key={c.slug}
            href={`https://www.noticiasagricolas.com.br/cotacoes/${c.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-neutral-200 hover:border-brand-primary hover:bg-brand-primary/5 transition-colors group"
          >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COMMODITY_COLORS[c.slug] }} />
            <div>
              <p className="text-[13px] font-semibold text-neutral-900 group-hover:text-brand-primary transition-colors">
                {lang === "pt" ? c.name : c.en}
              </p>
              <p className="text-[10px] text-neutral-400 flex items-center gap-0.5">
                {lang === "pt" ? "Ver cotação" : "View price"} <ExternalLink size={9} />
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
} // end NACotacoesFallback

// ─── Notícias Agrícolas — News Widget ────────────────────────────────────────

const NA_NOTICIAS_URL = "https://www.noticiasagricolas.com.br/noticias/";

const NA_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "",                label: "Todas" },
  { slug: "agronegocio",    label: "Agronegócio" },
  { slug: "soja",           label: "Soja" },
  { slug: "milho",          label: "Milho" },
  { slug: "boi",            label: "Boi Gordo" },
  { slug: "cafe",           label: "Café" },
  { slug: "algodao",        label: "Algodão" },
  { slug: "biocombustivel", label: "Biocomb." },
  { slug: "clima",          label: "Clima" },
];

const CAT_COLORS: Record<string, string> = {
  agronegocio: "#5B7A2F", soja: "#8B6914", milho: "#E8722A",
  boi: "#8B4513", cafe: "#6F4E37", algodao: "#7FA02B",
  biocombustivel: "#009688", clima: "#1565C0",
};

interface NANewsItem {
  title: string; url: string;
  time?: string; date: string; category: string;
}

function NANoticiasWidget({ lang }: { lang: Lang }) {
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<NANewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchedAt, setFetchedAt] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/news-na?category=${category}&limit=12`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.length > 0) {
          setItems(json.data as NANewsItem[]);
          setFetchedAt(json.fetched_at);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [category]);

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Newspaper size={16} className="text-brand-primary" />
          <h3 className="text-[15px] font-bold text-neutral-900">
            {lang === "pt" ? "Notícias Agro em Tempo Real" : "Real-Time Agro News"}
          </h3>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary uppercase tracking-wider">
            Live
          </span>
        </div>
        <div className="flex items-center gap-3">
          {fetchedAt && (
            <span className="text-[11px] text-neutral-400 hidden sm:block">
              {new Date(fetchedAt).toLocaleTimeString(lang === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <a href={NA_NOTICIAS_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12px] font-medium text-brand-primary hover:underline">
            Notícias Agrícolas <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-0 overflow-x-auto scrollbar-hide">
        {NA_CATEGORIES.map(cat => (
          <button key={cat.slug} onClick={() => setCategory(cat.slug)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap ${
              category === cat.slug
                ? "text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
            style={category === cat.slug ? { backgroundColor: CAT_COLORS[cat.slug] || "#5B7A2F" } : {}}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-neutral-400" />
        </div>
      ) : error || items.length === 0 ? (
        <div className="p-5">
          <p className="text-[13px] text-neutral-500 mb-4">
            {lang === "pt"
              ? "Notícias indisponíveis no momento. Acesse diretamente:"
              : "News temporarily unavailable. Access directly:"}
          </p>
          <a href={NA_NOTICIAS_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-brand-primary hover:underline">
            noticiasagricolas.com.br/noticias/ <ExternalLink size={13} />
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0 divide-y sm:divide-y-0">
          {items.map((item, i) => {
            const catColor = CAT_COLORS[item.category] || "#5B7A2F";
            const timeStr = item.time || "";
            return (
              <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                className="block p-4 hover:bg-neutral-50 transition-colors group border-neutral-100 sm:border-r last:border-r-0">
                {/* Category dot + date */}
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: catColor }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor }} />
                    {NA_CATEGORIES.find(c => c.slug === item.category)?.label || item.category}
                  </span>
                  {timeStr && (
                    <span className="text-[10px] text-neutral-400">{timeStr}</span>
                  )}
                </div>
                {/* Title */}
                <p className="text-[12px] font-semibold text-neutral-900 leading-snug line-clamp-3 group-hover:text-brand-primary transition-colors">
                  {item.title}
                </p>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
