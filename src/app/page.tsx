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
import { Settings } from "@/components/Settings";
import { RiskSignals } from "@/components/RiskSignals";
import { Header } from "@/components/Header";
import { Sidebar, getModuleTitle } from "@/components/Sidebar";
import {
  Database, BarChart3, TrendingUp, TrendingDown, PenTool,
  BookOpen, AlertTriangle, Zap, ChevronRight, Newspaper, Radar, Calendar,
  Circle, ExternalLink, Loader2, Settings as SettingsIcon, X, Check,
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
          {activeModule === "settings"     && <Settings lang={lang} />}
        </div>
      </main>
    </div>
  );
}

import { DashboardMap } from "@/components/DashboardMap";

// ─── Executive Dashboard Overview ───

function DashboardOverview({ lang, setActiveModule }: { lang: Lang; setActiveModule: (m: Module) => void }) {
  // Live KPI state
  const [kpis, setKpis] = useState({
    newsCount: 0, eventsCount: 0, rjCount: 0, retailersCount: 0,
    sourcesHealthy: 0, sourcesTotal: 0, topMover: null as { name: string; change: number } | null,
  });

  // Fetch live KPIs from Supabase + APIs
  useEffect(() => {
    // News count
    supabase.from("agro_news").select("*", { count: "exact", head: true })
      .then(({ count }) => setKpis(prev => ({ ...prev, newsCount: count || 0 })));

    // Events count (upcoming)
    fetch("/api/events-na").then(r => r.json()).then(json => {
      if (json.success && json.data) {
        const upcoming = json.data.filter((e: any) => new Date(e.dataInicio) >= new Date()).length;
        setKpis(prev => ({ ...prev, eventsCount: upcoming }));
      }
    }).catch(() => {});

    // Recuperação judicial count
    supabase.from("recuperacao_judicial").select("*", { count: "exact", head: true })
      .then(({ count }) => setKpis(prev => ({ ...prev, rjCount: count || 0 })));

    // Retailers count
    supabase.from("retailers").select("*", { count: "exact", head: true })
      .then(({ count }) => setKpis(prev => ({ ...prev, retailersCount: count || 0 })));

    // Source health from sync_logs
    supabase.from("sync_logs").select("source, status").order("started_at", { ascending: false }).limit(50)
      .then(({ data }) => {
        if (data) {
          const latest = new Map<string, string>();
          for (const log of data) { if (!latest.has(log.source)) latest.set(log.source, log.status); }
          const total = latest.size;
          const healthy = [...latest.values()].filter(s => s === "success").length;
          setKpis(prev => ({ ...prev, sourcesHealthy: healthy, sourcesTotal: total }));
        }
      });

    // Top mover from live prices
    fetch("/api/prices-na").then(r => r.json()).then(json => {
      if (json.success && json.data?.length > 0) {
        let best = { name: "", change: 0 };
        for (const c of json.data as any[]) {
          for (const it of c.items || []) {
            if (it.variation) {
              const val = parseFloat(it.variation.replace(",", ".").replace("%", ""));
              if (!isNaN(val) && Math.abs(val) > Math.abs(best.change)) {
                best = { name: c.commodity, change: val };
              }
            }
          }
        }
        if (best.name) setKpis(prev => ({ ...prev, topMover: best }));
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">

      {/* Compact KPI Strip — all live data */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <button onClick={() => setActiveModule("market")} className="rounded-lg px-3 py-2.5 bg-white border border-neutral-200 text-left hover:border-brand-primary transition-colors group">
          <p className="text-[9px] font-semibold text-neutral-400 uppercase">{lang === "pt" ? "Mercado" : "Market"}</p>
          {kpis.topMover ? (
            <>
              <p className="text-[14px] font-bold text-neutral-900 leading-tight mt-0.5">{kpis.topMover.name}</p>
              <p className={`text-[11px] font-bold ${kpis.topMover.change >= 0 ? "text-success-dark" : "text-error"}`}>
                {kpis.topMover.change >= 0 ? <TrendingUp size={11} className="inline mr-0.5" /> : <TrendingDown size={11} className="inline mr-0.5" />}
                {kpis.topMover.change > 0 ? "+" : ""}{kpis.topMover.change.toFixed(1)}%
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-bold text-neutral-900 leading-tight mt-0.5">—</p>
              <p className="text-[10px] text-neutral-400">Live</p>
            </>
          )}
        </button>

        <button onClick={() => setActiveModule("news")} className="rounded-lg px-3 py-2.5 bg-white border border-neutral-200 text-left hover:border-brand-primary transition-colors">
          <p className="text-[9px] font-semibold text-neutral-400 uppercase">{lang === "pt" ? "Notícias" : "News"}</p>
          <p className="text-[20px] font-bold text-neutral-900 leading-tight mt-0.5">{kpis.newsCount}</p>
          <p className="text-[10px] text-neutral-400">{lang === "pt" ? "indexadas" : "indexed"}</p>
        </button>

        <button onClick={() => setActiveModule("events")} className="rounded-lg px-3 py-2.5 bg-white border border-neutral-200 text-left hover:border-brand-primary transition-colors">
          <p className="text-[9px] font-semibold text-neutral-400 uppercase">{lang === "pt" ? "Eventos" : "Events"}</p>
          <p className="text-[20px] font-bold text-neutral-900 leading-tight mt-0.5">{kpis.eventsCount}</p>
          <p className="text-[10px] text-neutral-400">{lang === "pt" ? "próximos" : "upcoming"}</p>
        </button>

        <button onClick={() => setActiveModule("recuperacao")} className="rounded-lg px-3 py-2.5 bg-error-light/20 border border-error-light/50 text-left hover:border-error transition-colors">
          <p className="text-[9px] font-semibold text-error/70 uppercase">{lang === "pt" ? "Rec. Judicial" : "Judicial Rec."}</p>
          <p className="text-[20px] font-bold text-error-dark leading-tight mt-0.5">{kpis.rjCount}</p>
          <p className="text-[10px] text-error/60">{lang === "pt" ? "processos" : "cases"}</p>
        </button>

        <button onClick={() => setActiveModule("retailers")} className="rounded-lg px-3 py-2.5 bg-white border border-neutral-200 text-left hover:border-brand-primary transition-colors">
          <p className="text-[9px] font-semibold text-neutral-400 uppercase">{lang === "pt" ? "Revendas" : "Retailers"}</p>
          <p className="text-[20px] font-bold text-neutral-900 leading-tight mt-0.5">
            {kpis.retailersCount > 1000 ? `${(kpis.retailersCount / 1000).toFixed(0)}k+` : kpis.retailersCount}
          </p>
          <p className="text-[10px] text-neutral-400">{lang === "pt" ? "canais" : "channels"}</p>
        </button>

        <button onClick={() => setActiveModule("dataSources")} className="rounded-lg px-3 py-2.5 bg-neutral-900 text-left hover:bg-black transition-colors">
          <p className="text-[9px] font-semibold text-neutral-500 uppercase">{lang === "pt" ? "Dados" : "Data"}</p>
          <p className="text-[20px] font-bold text-white leading-tight mt-0.5">{kpis.sourcesHealthy}/{kpis.sourcesTotal}</p>
          <p className="text-[10px] text-neutral-500">{lang === "pt" ? "fontes ativas" : "active sources"}</p>
        </button>

        <button onClick={() => setActiveModule("contentHub")} className="rounded-lg px-3 py-2.5 bg-brand-surface/20 border border-brand-light text-left hover:border-brand-primary transition-colors">
          <p className="text-[9px] font-semibold text-neutral-400 uppercase">{lang === "pt" ? "Conteúdo" : "Content"}</p>
          <p className="text-[14px] font-bold text-neutral-900 leading-tight mt-0.5">AgriSafe</p>
          <p className="text-[10px] text-brand-primary font-medium">{lang === "pt" ? "Central" : "Hub"}</p>
        </button>

        {/* Risk Signals — cross-reference Diretório × Recuperação Judicial */}
        <RiskSignals lang={lang} compact onDrilldown={() => setActiveModule("retailers")} />
      </div>

      {/* Intelligence Map — fully live data */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-neutral-900">{lang === "pt" ? "Mapa de Inteligência Integrada" : "Integrated Intelligence Map"}</h3>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary uppercase tracking-wider">Live</span>
          </div>
          <p className="text-[12px] text-neutral-500 hidden sm:block">{lang === "pt" ? "Eventos, Revendas, Mercado & Clima" : "Events, Retailers, Market & Weather"}</p>
        </div>
        <DashboardMap lang={lang} />
      </div>

      {/* Notícias Agrícolas — News only (cotações moved to Pulso do Mercado) */}
      <NANoticiasWidget lang={lang} />
    </div>
  );
}

const COMMODITY_COLORS: Record<string, string> = {
  soja: "#5B7A2F", milho: "#E8722A", "boi-gordo": "#8B4513", cafe: "#6F4E37",
  algodao: "#7FA02B", trigo: "#DAA520", acucar: "#2196F3", leite: "#9C27B0",
  arroz: "#795548", frango: "#FF5722", etanol: "#009688", cacau: "#4E342E",
  suinos: "#E91E63", amendoim: "#FF9800", "suco-de-laranja": "#F57C00",
  feijao: "#8D6E63", ovos: "#FFC107", latex: "#607D8B", sorgo: "#CDDC39",
};


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
