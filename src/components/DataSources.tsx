"use client";

import { useState, useEffect, useMemo } from "react";
import { Lang, t, translations } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { mockSyncLogs } from "@/data/mock";
import type { MockSyncLog } from "@/data/mock";
import sourceData from "@/data/source-registry.json";
import { MockBadge } from "@/components/ui/MockBadge";
import { SourceFormModal, type SourceRow } from "@/components/SourceFormModal";
import {
  CheckCircle2, AlertTriangle, XCircle, Circle, ExternalLink,
  Search, Globe, ChevronDown, ChevronUp, Zap, Layers, X,
  Database, Info, Activity, Wrench, RefreshCw, Plus, Pencil, Trash2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "registry" | "history" | "quality" | "health";

interface RegistrySource {
  id: string;
  name: string;
  source_org: string;
  category: string;
  data_type: string | null;
  description: string | null;
  frequency: string;
  url: string;
  url_secondary: string | null;
  server: string | null;
  automated: boolean;
  notes: string | null;
  origin_file: string;
  url_status: string;
  http_status: number | null;
  last_checked_at: string | null;
  used_in_app: boolean;
  moduleId?: string;
}

interface DomainGroup {
  domain: string;
  org: string;
  sources: RegistrySource[];
  categories: string[];
  frequencies: string[];
  activeCount: number;
  errorCount: number;
  inactiveCount: number;
  uncheckedCount: number;
  usedCount: number;
  overallStatus: string;
}

// Phase 25 — JSON file is now a STATIC FALLBACK only. Live data comes
// from /api/data-sources (table data_sources). DataSources.tsx fetches
// on mount and threads the result down through props. If the API errors
// out, the static fallback keeps the UI functional.
const STATIC_REGISTRY_FALLBACK: RegistrySource[] = sourceData as RegistrySource[];

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { pt: string; en: string; color: string }> = {
  fiscal:         { pt: "Fiscal",         en: "Fiscal",       color: "bg-info-light text-info-dark" },
  socioambiental: { pt: "Socioambiental", en: "Environmental",color: "bg-success-light text-success-dark" },
  financeiro:     { pt: "Financeiro",     en: "Financial",    color: "bg-warning-light text-warning-dark" },
  agropecuaria:   { pt: "Agropecuária",   en: "Agriculture",  color: "bg-brand-surface text-brand-primary" },
  agronomico:     { pt: "Agronômico",     en: "Agronomic",    color: "bg-brand-surface text-brand-dark" },
  logistica:      { pt: "Logística",      en: "Logistics",    color: "bg-neutral-200 text-neutral-700" },
  geografias:     { pt: "Geografias",     en: "Geographies",  color: "bg-[#E3F2FD] text-[#1565C0]" },
  outros:         { pt: "Outros",         en: "Other",        color: "bg-neutral-200 text-neutral-600" },
};

const FREQ_LABELS: Record<string, { pt: string; en: string }> = {
  diaria:        { pt: "Diária",     en: "Daily" },
  semanal:       { pt: "Semanal",    en: "Weekly" },
  mensal:        { pt: "Mensal",     en: "Monthly" },
  trimestral:    { pt: "Trimestral", en: "Quarterly" },
  anual:         { pt: "Anual",      en: "Annual" },
  nao_informado: { pt: "N/I",        en: "N/A" },
};

const CATEGORY_TO_MODULE: Record<string, string> = {
  "financeiro":     "finance",
  "agropecuaria":   "marketPulse",
  "indicadores":    "marketPulse",
  "insumos":        "inputs",
  "clima":          "marketPulse",
  "logistica":      "inputs",
  "noticias":       "news",
  "regulacao":      "regulatory",
  "juridico":       "regulatory",
  "socioambiental": "inputs",
  "agronomico":     "inputs",
  "fiscal":         "regulatory",
  "geografias":     "dataSources",
  "cadastral":      "retailers",
  "outros":         "news"
};

// Phase 24C — source category → Supabase tables it likely enriches.
//
// The user follow-up asked for a way to see "which tables this source feeds".
// Source-registry.json has 176 entries with no per-source table annotation,
// so a per-category map is the right granularity for now: it captures the
// 5-entity model intent, mirrors the cron pipeline in CLAUDE.md, and is
// cheap to maintain (one place to update when a new ingest target appears).
//
// For precise per-scraper mapping (e.g. "sync-faostat-prod → macro_statistics
// when measure_type='production'"), the Scraper Health tab already shows
// `target_table` from `scraper_registry`. This map is the broad-strokes
// counterpart that works across all 176 catalog entries.
const CATEGORY_TO_TABLES: Record<string, string[]> = {
  financeiro:      ["commodity_prices", "commodity_prices_regional", "market_indicators"],
  agropecuaria:    ["commodity_prices", "commodity_prices_regional", "macro_statistics"],
  indicadores:     ["market_indicators", "macro_statistics"],
  insumos:         ["industry_products", "industries", "active_ingredients"],
  clima:           ["weather_observations"],
  logistica:       ["commodity_prices_regional"],
  noticias:        ["agro_news", "news_knowledge", "entity_mentions"],
  regulacao:       ["regulatory_norms"],
  juridico:        ["recuperacao_judicial", "regulatory_norms"],
  socioambiental:  ["farms"],
  agronomico:      ["industry_products", "industries"],
  fiscal:          ["legal_entities", "company_enrichment"],
  geografias:      ["retailer_locations", "cnpj_establishments"],
  cadastral:       ["retailers", "retailer_locations", "cnpj_establishments", "legal_entities"],
  outros:          [],
};

/**
 * Safely gets the module label from translations
 */
function getModuleLabel(mod: string, lang: Lang): string {
  const modKey = mod as keyof typeof translations.pt.modules;
  return (translations[lang].modules as any)[modKey] || mod;
}

// URL status display config (real data from registry JSON)
const URL_STATUS_CONFIG = {
  active:    { labelPt: "Ativo",          labelEn: "Active",      dotColor: "#2E7D32" },
  inactive:  { labelPt: "Inativo",        labelEn: "Inactive",    dotColor: "#F44336" },
  error:     { labelPt: "Erro",           labelEn: "Error",       dotColor: "#E8722A" },
  unchecked: { labelPt: "Não verificado", labelEn: "Unchecked",   dotColor: "#9CA3AF" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    let domain = u.hostname.replace(/^www\./, "");
    if (domain.includes("bcb.gov.br"))    return "bcb.gov.br";
    if (domain.includes("embrapa.br"))    return "embrapa.br";
    return domain;
  } catch {
    return url;
  }
}

function computeOverallStatus(g: { activeCount: number; errorCount: number; inactiveCount: number }): string {
  if (g.errorCount > 0 && g.activeCount === 0) return "error";
  if (g.inactiveCount > 0 && g.activeCount === 0) return "inactive";
  if (g.errorCount > 0) return "error";
  if (g.activeCount > 0) return "active";
  return "unchecked";
}

// ─── Root Component ───────────────────────────────────────────────────────────

export function DataSources({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [tab, setTab] = useState<Tab>("registry");
  const [liveLogs, setLiveLogs] = useState<MockSyncLog[]>([]);
  const [logsAreReal, setLogsAreReal] = useState(false);

  // Phase 25 — fetch live data_sources from the API; fall back to static JSON.
  const [registrySources, setRegistrySources] = useState<RegistrySource[]>(STATIC_REGISTRY_FALLBACK);
  const [registryIsLive, setRegistryIsLive] = useState(false);

  const refreshRegistry = async () => {
    try {
      const res = await fetch("/api/data-sources?include_inactive=false");
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.sources) && json.sources.length > 0) {
        setRegistrySources(json.sources as RegistrySource[]);
        setRegistryIsLive(true);
      }
    } catch {
      // Network error → static fallback already in state
    }
  };

  useEffect(() => {
    async function fetchLogs() {
      const { data } = await supabase
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(30);
      if (data?.length) { setLiveLogs(data as MockSyncLog[]); setLogsAreReal(true); }
    }
    fetchLogs();
    refreshRegistry();
  }, []);

  // Real KPIs from registry (live or fallback)
  const totalSources  = registrySources.length;
  const activeCount   = registrySources.filter(s => s.url_status === "active").length;
  const errorCount    = registrySources.filter(s => s.url_status === "error").length;
  const inactiveCount = registrySources.filter(s => s.url_status === "inactive").length;
  const uncheckedCount= registrySources.filter(s => s.url_status === "unchecked").length;
  const automatedCount= registrySources.filter(s => s.automated).length;
  const totalDomains  = [...new Set(registrySources.map(s => extractDomain(s.url)))].length;

  const tabs: { id: Tab; label: string }[] = [
    { id: "registry", label: lang === "pt" ? "Registro de Fontes" : "Source Registry" },
    { id: "history",  label: lang === "pt" ? "Histórico de Sync"  : "Sync History" },
    { id: "quality",  label: lang === "pt" ? "Qualidade dos Dados": "Data Quality" },
    { id: "health",   label: lang === "pt" ? "Saúde dos Scrapers" : "Scraper Health" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-neutral-900">
            {lang === "pt" ? "Ingestão de Dados" : "Data Ingestion"}
          </h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            {lang === "pt"
              ? `${totalSources} endpoints catalogados · ${totalDomains} domínios · ${automatedCount} automatizados`
              : `${totalSources} endpoints catalogued · ${totalDomains} domains · ${automatedCount} automated`}
          </p>
        </div>
      </div>

      {/* KPI strip — sourced from real registry data */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(["active", "error", "inactive", "unchecked"] as const).map((status) => {
          const cfg   = URL_STATUS_CONFIG[status];
          const count = status === "active" ? activeCount : status === "error" ? errorCount : status === "inactive" ? inactiveCount : uncheckedCount;
          return (
            <div key={status}
              className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-4">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: cfg.dotColor }} />
              <div>
                <p className="text-[22px] font-bold text-neutral-900 leading-none">{count}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5 font-medium">
                  {lang === "pt" ? cfg.labelPt : cfg.labelEn}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-neutral-200/50 rounded-md p-0.5 w-fit">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`px-4 py-2 rounded text-[13px] font-medium transition-colors whitespace-nowrap ${
              tab === tb.id ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600 hover:text-neutral-800"
            }`}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "registry" && (
        <RegistryTab
          lang={lang}
          sources={registrySources}
          isLive={registryIsLive}
          onRefresh={refreshRegistry}
        />
      )}
      {tab === "history"  && <HistoryTab lang={lang} logs={liveLogs} isReal={logsAreReal} />}
      {tab === "quality"  && <QualityTab lang={lang} logs={liveLogs} logsAreReal={logsAreReal} sources={registrySources} />}
      {tab === "health"   && <ScraperHealthTab lang={lang} />}
    </div>
  );
}

// ─── Tab: Source Registry ─────────────────────────────────────────────────────

type SortField = "domain" | "org" | "count" | "status";

interface RegistryTabProps {
  lang: Lang;
  sources: RegistrySource[];
  isLive: boolean;
  onRefresh: () => Promise<void>;
}

function RegistryTab({ lang, sources, isLive, onRefresh }: RegistryTabProps) {
  const tr = t(lang);
  const [search, setSearch]                 = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState("");
  const [statusFilter, setStatusFilter]     = useState("");
  const [moduleFilter, setModuleFilter]     = useState("");
  const [usedFilter, setUsedFilter]         = useState<"all" | "used" | "unused">("all");
  const [sortField, setSortField]           = useState<SortField>("count");
  const [sortDir, setSortDir]               = useState<"asc" | "desc">("desc");
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  // Phase 25 — Add/Edit modal state + delete confirmation
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<RegistrySource | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const handleEdit = (s: RegistrySource) => {
    setEditTarget(s);
    setModalMode("edit");
  };

  const handleDelete = async (s: RegistrySource) => {
    const ok = window.confirm(
      lang === "pt"
        ? `Desativar fonte "${s.name}"?\n\nEntradas seedadas (do registry inicial) só podem ser desativadas (soft-delete). Entradas adicionadas manualmente podem ser removidas com Shift+Click.`
        : `Disable source "${s.name}"?\n\nSeeded entries can only be disabled (soft-delete). Manual entries can be hard-deleted with Shift+Click.`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/data-sources?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Erro: ${err.error || res.statusText}`);
        return;
      }
      await onRefresh();
    } catch (e: any) {
      alert(`Network error: ${e?.message || e}`);
    }
  };

  const handleSaved = async () => {
    setModalMode(null);
    setEditTarget(null);
    await onRefresh();
  };

  const allGroups = useMemo(() => {
    const map = new Map<string, DomainGroup>();
    for (const s of sources) {
      const domain = extractDomain(s.url);
      let group = map.get(domain);
      if (!group) {
        group = {
          domain, org: s.source_org, sources: [], categories: [],
          frequencies: [], activeCount: 0, errorCount: 0, inactiveCount: 0,
          uncheckedCount: 0, usedCount: 0, overallStatus: "unchecked",
        };
        map.set(domain, group);
      }
      group.sources.push(s);
      if (!group.categories.includes(s.category))   group.categories.push(s.category);
      if (!group.frequencies.includes(s.frequency)) group.frequencies.push(s.frequency);
      if (s.url_status === "active")    group.activeCount++;
      else if (s.url_status === "error")   group.errorCount++;
      else if (s.url_status === "inactive") group.inactiveCount++;
      else group.uncheckedCount++;
      if (s.used_in_app) group.usedCount++;
    }
    for (const g of map.values()) g.overallStatus = computeOverallStatus(g);
    return Array.from(map.values());
  }, [sources]);

  const filtered = useMemo(() => {
    let result = [...allGroups];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(g =>
        g.domain.toLowerCase().includes(q) ||
        g.org.toLowerCase().includes(q) ||
        g.sources.some(s => s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q))
      );
    }
    if (categoryFilter) result = result.filter(g => g.categories.includes(categoryFilter));
    if (frequencyFilter) result = result.filter(g => g.frequencies.includes(frequencyFilter));
    if (statusFilter)   result = result.filter(g => g.overallStatus === statusFilter);
    if (moduleFilter)   result = result.filter(g =>
      g.sources.some(s => CATEGORY_TO_MODULE[s.category] === moduleFilter)
    );
    if (usedFilter === "used")   result = result.filter(g => g.usedCount > 0);
    if (usedFilter === "unused") result = result.filter(g => g.usedCount === 0);

    result.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortField) {
        case "domain": av = a.domain; bv = b.domain; break;
        case "org":    av = a.org;    bv = b.org; break;
        case "count":  av = a.sources.length; bv = b.sources.length; break;
        case "status": av = a.overallStatus;  bv = b.overallStatus; break;
        default:       av = a.domain; bv = b.domain;
      }
      if (typeof av === "number" && typeof bv === "number")
        return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return result;
  }, [allGroups, search, categoryFilter, frequencyFilter, statusFilter, usedFilter, sortField, sortDir, moduleFilter]);

  const moduleStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sources) {
      const mod = CATEGORY_TO_MODULE[s.category] || "outros";
      if (mod === "dataSources") continue; // Organization-only chapter
      counts[mod] = (counts[mod] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [sources]);

  const categories  = useMemo(() => [...new Set(sources.map(s => s.category))].sort(), [sources]);
  const frequencies = useMemo(() => [...new Set(sources.map(s => s.frequency))].sort(), [sources]);
  const hasFilters  = search || categoryFilter || frequencyFilter || statusFilter || usedFilter !== "all";

  return (
    <div className="space-y-4">
      {/* Phase 25 — Add Source button + live/static badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          {isLive ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success-light text-success-dark border border-success/20 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-success-dark" />
              {lang === "pt" ? "Tabela ao vivo" : "Live table"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 font-semibold">
              {lang === "pt" ? "Fallback estático" : "Static fallback"}
            </span>
          )}
          <button
            onClick={() => onRefresh()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-neutral-500 hover:text-brand-primary"
            title={lang === "pt" ? "Recarregar" : "Refresh"}
          >
            <RefreshCw size={11} />
          </button>
        </div>
        <button
          onClick={() => { setEditTarget(null); setModalMode("add"); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-brand-primary hover:bg-brand-dark transition-colors"
        >
          <Plus size={13} />
          {lang === "pt" ? "Adicionar Fonte" : "Add Source"}
        </button>
      </div>

      {/* Category strip — clickable filters */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {categories.filter(c => c !== "outros").slice(0, 6).map(cat => {
          const info  = CATEGORY_LABELS[cat] || CATEGORY_LABELS.outros;
          const count = sources.filter(s => s.category === cat).length;
          return (
            <button key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
              className={`rounded-lg p-3 border text-left transition-all ${
                categoryFilter === cat
                  ? "border-brand-primary bg-brand-surface/50"
                  : "border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-neutral-300"
              }`}>
              <p className="text-[18px] font-bold text-neutral-900">{count}</p>
              <p className="text-[10px] font-semibold text-neutral-500 uppercase">
                {lang === "pt" ? info.pt : info.en}
              </p>
            </button>
          );
        })}
      </div>

      {/* Chapter Summary - Horizontal Scroll */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <div className="flex-shrink-0 text-[11px] font-bold text-neutral-400 uppercase tracking-wider mr-2">
          {lang === "pt" ? "Por Capítulo:" : "By Chapter:"}
        </div>
        {moduleStats.map(([mod, count]) => (
          <button
            key={mod}
            onClick={() => setModuleFilter(moduleFilter === mod ? "" : mod)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border whitespace-nowrap transition-all ${
              moduleFilter === mod
                ? "bg-brand-primary text-white border-brand-primary"
                : "bg-white text-neutral-600 border-neutral-200 hover:border-brand-primary/40"
            }`}
          >
            <span className="text-[12px] font-semibold">
              {getModuleLabel(mod, lang)}
            </span>
            <span className={`text-[10px] px-1.5 py-0.25 rounded-full ${
              moduleFilter === mod ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-500"
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={lang === "pt"
                ? "Buscar por domínio, organização ou endpoint..."
                : "Search by domain, org or endpoint..."}
              className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary" />
          </div>
          <select value={frequencyFilter} onChange={e => setFrequencyFilter(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20">
            <option value="">{lang === "pt" ? "Frequência" : "Frequency"}</option>
            {frequencies.map(f => (
              <option key={f} value={f}>
                {FREQ_LABELS[f]?.[lang === "pt" ? "pt" : "en"] || f}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20">
            <option value="">Status URL</option>
            <option value="active">{lang === "pt" ? "Ativo" : "Active"}</option>
            <option value="inactive">{lang === "pt" ? "Inativo" : "Inactive"}</option>
            <option value="error">Error</option>
            <option value="unchecked">{lang === "pt" ? "Não verificado" : "Unchecked"}</option>
          </select>
          <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20">
            <option value="">{tr.dataSources.targetChapter}</option>
            {Object.keys(translations.pt.modules)
              .filter(m => m !== "dataSources")
              .map(mod => (
                <option key={mod} value={mod}>
                  {getModuleLabel(mod, lang)}
                </option>
              ))}
          </select>
          <div className="flex bg-neutral-200/50 rounded-md p-0.5">
            {(["all", "used", "unused"] as const).map(v => (
              <button key={v} onClick={() => setUsedFilter(v)}
                className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${
                  usedFilter === v ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600"
                }`}>
                {v === "all"
                  ? (lang === "pt" ? "Todas" : "All")
                  : v === "used"
                  ? (lang === "pt" ? "Em uso" : "In use")
                  : (lang === "pt" ? "Não usadas" : "Unused")}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              onClick={() => {
                setSearch(""); setCategoryFilter(""); setFrequencyFilter(""); setStatusFilter(""); setUsedFilter("all"); setModuleFilter("");
              }}
              className="flex items-center gap-1 px-3 py-2 text-[12px] text-error font-medium hover:text-error-dark">
              <X size={14} />{lang === "pt" ? "Limpar" : "Clear"}
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-[12px] text-neutral-500 px-1">
        {filtered.length} {lang === "pt" ? "domínios" : "domains"} (
        {filtered.reduce((s, g) => s + g.sources.length, 0)} endpoints)
      </p>

      {/* Domain table */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-neutral-50 text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.05em] border-b border-neutral-200">
                <th className="px-3 py-2.5 text-center w-8">
                  {lang === "pt" ? "Uso" : "Use"}
                </th>
                <th className="px-3 py-2.5 text-left cursor-pointer hover:text-neutral-700"
                  onClick={() => toggleSort("domain")}>
                  {lang === "pt" ? "Domínio" : "Domain"}{" "}
                  {sortField === "domain" && (sortDir === "asc" ? "▲" : "▼")}
                </th>
                <th className="px-3 py-2.5 text-left cursor-pointer hover:text-neutral-700 hidden md:table-cell"
                  onClick={() => toggleSort("org")}>
                  Org {sortField === "org" && (sortDir === "asc" ? "▲" : "▼")}
                </th>
                <th className="px-3 py-2.5 text-left hidden sm:table-cell">
                  {lang === "pt" ? "Capítulo" : "Chapter"}
                </th>
                <th className="px-3 py-2.5 text-center cursor-pointer hover:text-neutral-700 hidden lg:table-cell"
                  onClick={() => toggleSort("count")}>
                  Endpoints {sortField === "count" && (sortDir === "asc" ? "▲" : "▼")}
                </th>
                <th className="px-3 py-2.5 text-center cursor-pointer hover:text-neutral-700"
                  onClick={() => toggleSort("status")}>
                  {lang === "pt" ? "Saúde" : "Health"}{" "}
                  {sortField === "status" && (sortDir === "asc" ? "▲" : "▼")}
                </th>
                <th className="px-3 py-2.5 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(group => {
                const isExpanded = expandedDomain === group.domain;
                return (
                  <DomainRow key={group.domain} group={group} lang={lang}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedDomain(isExpanded ? null : group.domain)}
                    onEdit={handleEdit}
                    onDelete={handleDelete} />
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 100 && (
          <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50 text-[12px] text-neutral-500 text-center">
            {lang === "pt"
              ? `Mostrando 100 de ${filtered.length} domínios. Use filtros para refinar.`
              : `Showing 100 of ${filtered.length} domains. Use filters to refine.`}
          </div>
        )}
      </div>

      {/* Phase 25 — Add / Edit modal */}
      {modalMode && (
        <SourceFormModal
          mode={modalMode}
          initial={editTarget as unknown as SourceRow | null}
          onSaved={handleSaved}
          onClose={() => { setModalMode(null); setEditTarget(null); }}
          lang={lang}
        />
      )}
    </div>
  );
}

// ─── Domain Row ───────────────────────────────────────────────────────────────

function DomainRow({ group, lang, isExpanded, onToggle, onEdit, onDelete }: {
  group: DomainGroup; lang: Lang; isExpanded: boolean; onToggle: () => void;
  onEdit?: (s: RegistrySource) => void;
  onDelete?: (s: RegistrySource) => void;
}) {
  const hasUsed = group.usedCount > 0;

  return (
    <>
      <tr onClick={onToggle}
        className="border-b border-neutral-200 hover:bg-neutral-100/60 transition-colors cursor-pointer">
        <td className="px-3 py-2.5 text-center">
          {hasUsed
            ? <Zap size={14} className="text-brand-primary inline" />
            : <Circle size={8} className="text-neutral-300 inline" />}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-neutral-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-neutral-900 text-[13px]">{group.domain}</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">{group.org}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 hidden md:table-cell">
          <span className="text-[12px] text-neutral-600">{group.org}</span>
        </td>
        <td className="px-3 py-2.5 hidden sm:table-cell">
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set(group.sources.map(s => CATEGORY_TO_MODULE[s.category] || "outros")))
              .filter(mod => mod !== "dataSources")
              .map(mod => (
                <span key={mod} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-surface text-brand-primary border border-brand-primary/20">
                  {getModuleLabel(mod, lang)}
                </span>
              ))}
          </div>
        </td>
        <td className="px-3 py-2.5 text-center hidden lg:table-cell">
          <div className="flex items-center justify-center gap-1">
            <Layers size={12} className="text-neutral-400" />
            <span className="text-[12px] font-semibold text-neutral-700">{group.sources.length}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-center">
          <HealthBadge status={group.overallStatus} active={group.activeCount}
            error={group.errorCount} inactive={group.inactiveCount}
            unchecked={group.uncheckedCount} lang={lang} />
        </td>
        <td className="px-3 py-2.5">
          {isExpanded
            ? <ChevronUp size={12} className="text-neutral-400" />
            : <ChevronDown size={12} className="text-neutral-400" />}
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-neutral-50/80">
          <td colSpan={7} className="px-4 py-0">
            <div className="py-3 space-y-2">
              {/* Domain stats bar */}
              <div className="flex flex-wrap gap-3 text-[11px] text-neutral-500 pb-2 border-b border-neutral-200/60">
                <span>{group.activeCount} {lang === "pt" ? "ativos" : "active"}</span>
                {group.errorCount > 0 && (
                  <span className="text-warning">
                    {group.errorCount} {lang === "pt" ? "com erro" : "error"}
                  </span>
                )}
                {group.inactiveCount > 0 && (
                  <span className="text-error">
                    {group.inactiveCount} {lang === "pt" ? "inativos" : "inactive"}
                  </span>
                )}
                {group.usedCount > 0 && (
                  <span className="text-brand-primary font-medium">
                    {group.usedCount} {lang === "pt" ? "em uso no app" : "used in app"}
                  </span>
                )}
              </div>

              {/* Phase 24C — Tables this domain enriches */}
              <DomainTables group={group} lang={lang} />

              {/* Endpoint list */}
              <div className="space-y-1.5">
                {group.sources.map(s => (
                  <EndpointDetail key={s.id} s={s} lang={lang} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Phase 24C — Domain → tables panel.
//
// Aggregates the table mapping across every source in this domain so the
// user can see at a glance which Supabase tables this domain feeds — the
// answer to the TODO question "which information was used to enrich the
// database, which tables".
function DomainTables({ group, lang }: { group: DomainGroup; lang: Lang }) {
  const tables = useMemo(() => {
    const set = new Set<string>();
    for (const s of group.sources) {
      const cats = CATEGORY_TO_TABLES[s.category] || [];
      for (const t of cats) set.add(t);
    }
    return Array.from(set).sort();
  }, [group]);

  if (tables.length === 0) return null;

  return (
    <div className="flex items-start gap-2 text-[11px] py-1.5 px-2 bg-brand-surface/30 border border-brand-light/40 rounded">
      <Database size={11} className="text-brand-primary mt-0.5 shrink-0" />
      <div className="flex-1">
        <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider mr-2">
          {lang === "pt" ? "Tabelas alimentadas" : "Tables enriched"}
        </span>
        <span className="inline-flex flex-wrap gap-1 align-middle">
          {tables.map((t) => (
            <span
              key={t}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-brand-primary/20 text-neutral-700"
            >
              {t}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

// ─── Health Badge ─────────────────────────────────────────────────────────────

function HealthBadge({ status, active, error, inactive }: {
  status: string; active: number; error: number; inactive: number; unchecked: number; lang: Lang;
}) {
  if (status === "active" && error === 0 && inactive === 0)
    return <CheckCircle2 size={14} className="text-success-dark inline" />;
  if ((status === "error" || status === "inactive") && active === 0)
    return <XCircle size={14} className="text-error inline" />;
  if (status === "error")
    return <AlertTriangle size={14} className="text-warning inline" />;
  return <Circle size={10} className="text-neutral-300 inline" />;
}

// ─── Endpoint Detail ──────────────────────────────────────────────────────────

function EndpointDetail({ s, lang, onEdit, onDelete }: {
  s: RegistrySource;
  lang: Lang;
  onEdit?: (s: RegistrySource) => void;
  onDelete?: (s: RegistrySource) => void;
}) {
  const freqInfo = FREQ_LABELS[s.frequency] || { pt: s.frequency, en: s.frequency };
  // Phase 24C — derive target tables from category map
  const targetTables = CATEGORY_TO_TABLES[s.category] || [];

  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-md bg-white border border-neutral-100 hover:border-neutral-200 transition-colors group">
      {/* URL status icon */}
      <div className="mt-0.5 flex-shrink-0">
        {s.url_status === "active"    && <CheckCircle2 size={12} className="text-success-dark" />}
        {s.url_status === "inactive"  && <XCircle size={12} className="text-error" />}
        {s.url_status === "error"     && <AlertTriangle size={12} className="text-warning" />}
        {s.url_status === "unchecked" && <Circle size={8} className="text-neutral-300 mt-0.5" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[12px] text-neutral-800">{s.name}</span>
          {s.used_in_app && <Zap size={10} className="text-brand-primary" />}
          <span className="text-[10px] text-neutral-400">
            {lang === "pt" ? freqInfo.pt : freqInfo.en}
          </span>
          {s.http_status && (
            <span className="text-[10px] text-neutral-400 font-mono">HTTP {s.http_status}</span>
          )}
          {s.automated && (
            <span className="text-[9px] text-brand-primary font-medium bg-brand-surface px-1.5 py-0.5 rounded">
              Auto
            </span>
          )}
          {(CATEGORY_TO_MODULE[s.category] || "news") !== "dataSources" && (
            <span className="text-[9px] text-neutral-500 font-medium bg-neutral-100 px-1.5 py-0.5 rounded">
              {getModuleLabel(CATEGORY_TO_MODULE[s.category] || "news", lang)}
            </span>
          )}
        </div>
        {s.description && (
          <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{s.description}</p>
        )}
        {/* Phase 24C — target Supabase tables (only when source is in use) */}
        {s.used_in_app && targetTables.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <Database size={9} className="text-brand-primary/60" />
            <span className="text-[9px] font-bold text-brand-primary/70 uppercase tracking-wider mr-0.5">
              {lang === "pt" ? "Tabelas:" : "Tables:"}
            </span>
            {targetTables.map((t) => (
              <span
                key={t}
                className="text-[9px] font-mono px-1.5 py-0.25 rounded bg-brand-surface/60 text-brand-primary/90 border border-brand-primary/15"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <a href={s.url} target="_blank" rel="noopener noreferrer"
          className="text-[11px] text-brand-primary hover:text-brand-dark flex items-center gap-1 mt-0.5 break-all">
          {s.url.length > 70 ? s.url.slice(0, 70) + "..." : s.url}
          <ExternalLink size={9} className="flex-shrink-0" />
        </a>
        {s.notes && (
          <p className="text-[10px] text-neutral-400 mt-0.5 italic">{s.notes}</p>
        )}
      </div>

      {s.data_type && (
        <span className="hidden md:inline-block text-[10px] font-mono text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded flex-shrink-0">
          {s.data_type}
        </span>
      )}

      {/* Phase 25 — Edit/Delete actions, visible on row hover */}
      {(onEdit || onDelete) && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(s); }}
              className="p-1 rounded text-neutral-400 hover:text-brand-primary hover:bg-brand-surface"
              title={lang === "pt" ? "Editar fonte" : "Edit source"}
            >
              <Pencil size={11} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(s); }}
              className="p-1 rounded text-neutral-400 hover:text-error hover:bg-error-light"
              title={lang === "pt" ? "Desativar fonte" : "Disable source"}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Sync History ────────────────────────────────────────────────────────

function HistoryTab({ lang, logs, isReal }: { lang: Lang; logs: MockSyncLog[]; isReal: boolean }) {
  const tr = t(lang);

  const sourceLabels: Record<string, string> = {
    "sync-market-data":          lang === "pt" ? "Dados de Mercado"  : "Market Data",
    "sync-agro-news":            lang === "pt" ? "Notícias Agro"     : "Agro News",
    "sync-recuperacao-judicial": lang === "pt" ? "Rec. Judicial"     : "Judicial Recovery",
  };

  return (
    <div className="space-y-4">
      {!isReal && (
        <div className="flex items-start gap-3 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3">
          <Info size={16} className="text-neutral-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[12px] text-neutral-600 font-medium">
              {lang === "pt" ? "Dados Simulados" : "Simulated Data"}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              {lang === "pt"
                ? "O histórico de sincronização abaixo é simulado. Os jobs de ETL ainda não estão configurados na infraestrutura de produção."
                : "The sync history below is simulated. ETL jobs are not yet configured in the production infrastructure."}
            </p>
          </div>
          <MockBadge />
        </div>
      )}

      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em]">
                <th className="px-4 py-3 text-left">{tr.dataSources.status}</th>
                <th className="px-4 py-3 text-left">{lang === "pt" ? "Fonte" : "Source"}</th>
                <th className="px-4 py-3 text-left">{lang === "pt" ? "Início" : "Started"}</th>
                <th className="px-4 py-3 text-right">{tr.dataSources.duration}</th>
                <th className="px-4 py-3 text-right">{tr.dataSources.fetched}</th>
                <th className="px-4 py-3 text-right">{tr.dataSources.inserted}</th>
                <th className="px-4 py-3 text-right">{tr.dataSources.errors}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const duration = Math.round(
                  (new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000
                );
                return (
                  <tr key={log.id} className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors">
                    <td className="px-4 py-3">
                      {log.status === "success" && <CheckCircle2 size={16} className="text-success-dark" />}
                      {log.status === "error"   && <XCircle size={16} className="text-error" />}
                      {log.status === "partial" && <AlertTriangle size={16} className="text-warning" />}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800">
                      {sourceLabels[log.source] || log.source}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 text-[13px]">
                      {new Date(log.started_at).toLocaleDateString(
                        lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" }
                      )}{" "}
                      {new Date(log.started_at).toLocaleTimeString(
                        lang === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" }
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600 font-mono text-[13px]">{duration}s</td>
                    <td className="px-4 py-3 text-right text-neutral-800 font-semibold">{log.records_fetched}</td>
                    <td className="px-4 py-3 text-right text-neutral-800">{log.records_inserted}</td>
                    <td className="px-4 py-3 text-right">
                      {log.errors > 0 ? (
                        <span className="text-error font-semibold" title={log.error_message}>{log.errors}</span>
                      ) : (
                        <span className="text-neutral-400">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Data Quality ────────────────────────────────────────────────────────

function QualityTab({ lang, logs, logsAreReal, sources }: {
  lang: Lang;
  logs: MockSyncLog[];
  logsAreReal: boolean;
  sources: RegistrySource[];
}) {
  const tr = t(lang);

  const dailyVolume: Record<string, number> = {};
  logs.forEach((log) => {
    const day = new Date(log.started_at).toLocaleDateString(
      lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" }
    );
    dailyVolume[day] = (dailyVolume[day] || 0) + log.records_inserted;
  });
  const volumeData = Object.entries(dailyVolume).reverse().map(([date, count]) => ({ date, count }));

  // Real stats derived from the live registry (data_sources table or static fallback)
  const realStats = [
    {
      name: lang === "pt" ? "Domínios catalogados" : "Catalogued domains",
      value: [...new Set(sources.map(s => extractDomain(s.url)))].length,
      note: lang === "pt" ? "Orgs únicas" : "Unique orgs",
      real: true,
    },
    {
      name: lang === "pt" ? "Endpoints ativos" : "Active endpoints",
      value: sources.filter(s => s.url_status === "active").length,
      note: lang === "pt" ? "URL status = active" : "URL status = active",
      real: true,
    },
    {
      name: lang === "pt" ? "Automatizados" : "Automated",
      value: sources.filter(s => s.automated).length,
      note: lang === "pt" ? "Scraper rodando" : "Scraper running",
      real: true,
    },
    {
      name: lang === "pt" ? "Sem verificação" : "Unchecked",
      value: sources.filter(s => s.url_status === "unchecked").length,
      note: lang === "pt" ? "Pendente de checagem de URL" : "Pending URL check",
      real: true,
    },
  ];

  // Mock-backed DB table health
  const tables = [
    { name: "commodity_prices",        records: 6,     completeness: 100, freshDays: 0 },
    { name: "commodity_price_history", records: 90,    completeness: 100, freshDays: 0 },
    { name: "market_indicators",       records: 5,     completeness: 100, freshDays: 0 },
    { name: "agro_news",               records: 1126,  completeness: 92,  freshDays: 0 },
    { name: "recuperacao_judicial",    records: 78,    completeness: 85,  freshDays: 0 },
    { name: "retailers",               records: 23861, completeness: 97,  freshDays: 44 },
    { name: "regulatory_norms",        records: 0,     completeness: 0,   freshDays: -1 },
  ];

  return (
    <div className="space-y-6">
      {/* Real registry stats */}
      <div>
        <h3 className="text-[13px] font-semibold text-neutral-700 mb-3 flex items-center gap-2">
          <Database size={14} className="text-neutral-500" />
          {lang === "pt" ? "Estatísticas do Catálogo (dados reais)" : "Catalogue Stats (real data)"}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {realStats.map(stat => (
            <div key={stat.name} className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[24px] font-bold text-neutral-900">{stat.value}</p>
              <p className="text-[12px] font-medium text-neutral-700 mt-0.5">{stat.name}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">{stat.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Simulated sync volume chart */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-neutral-700">
            {logsAreReal
              ? (lang === "pt" ? "Volume de Sync" : "Sync Volume")
              : (lang === "pt" ? "Volume de Sync Simulado" : "Simulated Sync Volume")}
          </h3>
          {!logsAreReal && <MockBadge />}
        </div>

        {!logsAreReal && (
        <div className="flex items-start gap-3 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3 mb-3">
          <Info size={16} className="text-neutral-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-neutral-500">
            {lang === "pt"
              ? "Os dados de volume e saúde das tabelas abaixo são simulados e representam o comportamento esperado quando os jobs de ETL estiverem ativos."
              : "Volume and table health data below are simulated and represent the expected behavior once ETL jobs are active."}
          </p>
        </div>
        )}

        <div className="bg-white rounded-lg p-5 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEADF" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#A69B87" }} />
                <YAxis tick={{ fontSize: 11, fill: "#A69B87" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #EFEADF" }} />
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#5B7A2F" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#5B7A2F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="count" stroke="#5B7A2F" strokeWidth={2} fill="url(#volGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table health (mock) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-neutral-700">
            {lang === "pt" ? "Saúde das Tabelas" : "Table Health"}
          </h3>
          <MockBadge />
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em]">
                  <th className="px-4 py-3 text-left">{lang === "pt" ? "Tabela" : "Table"}</th>
                  <th className="px-4 py-3 text-right">{tr.dataSources.records}</th>
                  <th className="px-4 py-3 text-right">{tr.dataSources.freshness}</th>
                  <th className="px-4 py-3 text-right">{tr.dataSources.completeness}</th>
                  <th className="px-4 py-3 text-center">{tr.dataSources.status}</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((tbl) => (
                  <tr key={tbl.name} className="border-b border-neutral-200">
                    <td className="px-4 py-3 font-mono text-[13px] text-neutral-800">{tbl.name}</td>
                    <td className="px-4 py-3 text-right text-neutral-700">{tbl.records.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-neutral-600 text-[13px]">
                      {tbl.freshDays === 0
                        ? (lang === "pt" ? "Hoje" : "Today")
                        : tbl.freshDays === -1 ? "—"
                        : `${tbl.freshDays}d`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${tbl.completeness}%`,
                            backgroundColor: tbl.completeness > 90 ? "#2E7D32" : tbl.completeness > 70 ? "#E8722A" : "#F44336",
                          }} />
                        </div>
                        <span className="text-[12px] text-neutral-600 w-8 text-right">{tbl.completeness}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {tbl.freshDays === 0 && tbl.completeness > 90 && <Circle size={10} fill="#2E7D32" className="text-success-dark inline" />}
                      {tbl.freshDays > 0 && tbl.freshDays <= 7      && <Circle size={10} fill="#E8722A" className="text-warning inline" />}
                      {(tbl.freshDays > 7 || tbl.freshDays === -1)  && <Circle size={10} fill="#F44336" className="text-error inline" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Scraper Health (Phase 19A) ─────────────────────────────────────────

interface ScraperHealthRow {
  scraper_id: string;
  name: string;
  description: string | null;
  source_id: string;
  kind: string;
  target_table: string | null;
  cadence: string;
  status: "healthy" | "degraded" | "broken" | "disabled";
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  expected_min_rows: number;
  last_run: {
    run_id: string;
    started_at: string;
    duration_ms: number | null;
    rows_fetched: number;
    rows_inserted: number;
    status: string;
    error_message: string | null;
    validation_errors: unknown[];
  } | null;
  open_failure_count: number;
  recent_runs_24h: number;
  recent_failures_24h: number;
}

interface ScraperHealthSummary {
  healthy: number;
  degraded: number;
  broken: number;
  disabled: number;
  total: number;
}

const HEALTH_STATUS_CONFIG: Record<
  ScraperHealthRow["status"],
  { dotColor: string; bg: string; border: string; text: string; labelPt: string; labelEn: string }
> = {
  healthy:  { dotColor: "#2E7D32", bg: "bg-emerald-50",  border: "border-emerald-200", text: "text-emerald-700", labelPt: "Saudável",  labelEn: "Healthy" },
  degraded: { dotColor: "#E8722A", bg: "bg-amber-50",    border: "border-amber-200",   text: "text-amber-700",   labelPt: "Degradado", labelEn: "Degraded" },
  broken:   { dotColor: "#F44336", bg: "bg-red-50",      border: "border-red-200",     text: "text-red-700",     labelPt: "Quebrado",  labelEn: "Broken" },
  disabled: { dotColor: "#9CA3AF", bg: "bg-neutral-100", border: "border-neutral-200", text: "text-neutral-600", labelPt: "Desabilitado", labelEn: "Disabled" },
};

function fmtRelative(iso: string | null, lang: Lang): string {
  if (!iso) return lang === "pt" ? "nunca" : "never";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return lang === "pt" ? "agora" : "just now";
  if (min < 60) return lang === "pt" ? `há ${min}min` : `${min}min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lang === "pt" ? `há ${hr}h` : `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return lang === "pt" ? `há ${d}d` : `${d}d ago`;
  return new Date(iso).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US");
}

function ScraperHealthTab({ lang }: { lang: Lang }) {
  const [scrapers, setScrapers] = useState<ScraperHealthRow[]>([]);
  const [summary, setSummary] = useState<ScraperHealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/scraper-health")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setScrapers(json.scrapers || []);
          setSummary(json.summary || null);
        } else {
          setError(json.error || "Failed to load scraper health");
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [refreshTick]);

  const sortedScrapers = useMemo(() => {
    // Sort: broken first, then degraded, then healthy, then disabled. Within each, alpha.
    const order: Record<ScraperHealthRow["status"], number> = {
      broken: 0,
      degraded: 1,
      healthy: 2,
      disabled: 3,
    };
    return [...scrapers].sort((a, b) => {
      const o = order[a.status] - order[b.status];
      if (o !== 0) return o;
      return a.scraper_id.localeCompare(b.scraper_id);
    });
  }, [scrapers]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-[13px] text-red-700">
        <strong>{lang === "pt" ? "Erro ao carregar saúde dos scrapers:" : "Failed to load scraper health:"}</strong>{" "}
        {error}
        <p className="text-[11px] text-red-600 mt-2">
          {lang === "pt"
            ? "Verifique se as migrations 027/028 foram aplicadas no Supabase."
            : "Check that migrations 027/028 have been applied to Supabase."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-neutral-900 flex items-center gap-2">
            <Activity size={16} className="text-brand-primary" />
            {lang === "pt" ? "Saúde dos Scrapers" : "Scraper Health"}
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {lang === "pt"
              ? "Telemetria e auto-correção via scraper_registry / scraper_runs / scraper_knowledge (Fase 19A)"
              : "Telemetry and auto-correction via scraper_registry / scraper_runs / scraper_knowledge (Phase 19A)"}
          </p>
        </div>
        <button
          onClick={() => setRefreshTick((t) => t + 1)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-brand-primary border border-brand-primary rounded-md hover:bg-brand-primary/5 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {lang === "pt" ? "Atualizar" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["healthy", "degraded", "broken", "disabled"] as const).map((status) => {
          const cfg = HEALTH_STATUS_CONFIG[status];
          const count = summary ? summary[status] : 0;
          return (
            <div
              key={status}
              className={`${cfg.bg} ${cfg.border} border rounded-lg p-4 flex items-center gap-4`}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dotColor }} />
              <div>
                <p className={`text-[22px] font-bold ${cfg.text} leading-none`}>{count}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5 font-medium">
                  {lang === "pt" ? cfg.labelPt : cfg.labelEn}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrapers list */}
      {sortedScrapers.length === 0 && !loading ? (
        <div className="bg-white border border-neutral-200 rounded-lg p-6 text-center text-[12px] text-neutral-500">
          {lang === "pt"
            ? "Nenhum scraper registrado ainda. Aplique a migration 027 para criar a tabela scraper_registry."
            : "No scrapers registered yet. Apply migration 027 to create the scraper_registry table."}
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-neutral-50 text-[10px] uppercase font-bold text-neutral-500">
              <tr>
                <th className="text-left px-4 py-2.5">{lang === "pt" ? "Scraper" : "Scraper"}</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">{lang === "pt" ? "Cadência" : "Cadence"}</th>
                <th className="text-left px-4 py-2.5">{lang === "pt" ? "Último sucesso" : "Last success"}</th>
                <th className="text-left px-4 py-2.5">{lang === "pt" ? "Linhas (último)" : "Rows (last)"}</th>
                <th className="text-left px-4 py-2.5">{lang === "pt" ? "Falhas 24h" : "24h failures"}</th>
                <th className="text-left px-4 py-2.5">{lang === "pt" ? "Falhas abertas" : "Open failures"}</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sortedScrapers.map((s) => {
                const cfg = HEALTH_STATUS_CONFIG[s.status];
                const isExpanded = expanded === s.scraper_id;
                return (
                  <>
                    <tr
                      key={s.scraper_id}
                      className="border-t border-neutral-100 hover:bg-neutral-50/50 cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : s.scraper_id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-neutral-900">{s.name}</div>
                        <div className="text-[10px] text-neutral-500">{s.scraper_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.bg} ${cfg.border} ${cfg.text}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dotColor }} />
                          {lang === "pt" ? cfg.labelPt : cfg.labelEn}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{s.cadence}</td>
                      <td className="px-4 py-3 text-neutral-600">{fmtRelative(s.last_success_at, lang)}</td>
                      <td className="px-4 py-3 text-neutral-600">
                        {s.last_run ? `${s.last_run.rows_fetched}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={s.recent_failures_24h > 0 ? "text-red-600 font-bold" : "text-neutral-400"}>
                          {s.recent_failures_24h}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {s.open_failure_count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                            <Wrench size={10} />
                            {s.open_failure_count}
                          </span>
                        ) : (
                          <span className="text-neutral-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-neutral-50/40 border-t border-neutral-100">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                            <div>
                              <div className="font-bold text-neutral-700 mb-2">
                                {lang === "pt" ? "Definição" : "Definition"}
                              </div>
                              <dl className="space-y-1 text-neutral-600">
                                <div className="flex gap-2">
                                  <dt className="w-32 text-neutral-400">{lang === "pt" ? "Tipo" : "Kind"}</dt>
                                  <dd>{s.kind}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-32 text-neutral-400">{lang === "pt" ? "Tabela alvo" : "Target table"}</dt>
                                  <dd>{s.target_table || "—"}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-32 text-neutral-400">source_id</dt>
                                  <dd>{s.source_id}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-32 text-neutral-400">{lang === "pt" ? "Mín. linhas" : "Min rows"}</dt>
                                  <dd>{s.expected_min_rows}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-32 text-neutral-400">{lang === "pt" ? "Falhas consecutivas" : "Consecutive fails"}</dt>
                                  <dd>{s.consecutive_failures}</dd>
                                </div>
                              </dl>
                              {s.description && (
                                <p className="mt-3 text-neutral-500 italic leading-relaxed">{s.description}</p>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-neutral-700 mb-2">
                                {lang === "pt" ? "Última execução" : "Last run"}
                              </div>
                              {s.last_run ? (
                                <dl className="space-y-1 text-neutral-600">
                                  <div className="flex gap-2">
                                    <dt className="w-32 text-neutral-400">{lang === "pt" ? "Iniciada" : "Started"}</dt>
                                    <dd>{new Date(s.last_run.started_at).toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}</dd>
                                  </div>
                                  <div className="flex gap-2">
                                    <dt className="w-32 text-neutral-400">{lang === "pt" ? "Duração" : "Duration"}</dt>
                                    <dd>{s.last_run.duration_ms !== null ? `${s.last_run.duration_ms}ms` : "—"}</dd>
                                  </div>
                                  <div className="flex gap-2">
                                    <dt className="w-32 text-neutral-400">{lang === "pt" ? "Buscadas / Inseridas" : "Fetched / inserted"}</dt>
                                    <dd>{s.last_run.rows_fetched} / {s.last_run.rows_inserted}</dd>
                                  </div>
                                  <div className="flex gap-2">
                                    <dt className="w-32 text-neutral-400">Status</dt>
                                    <dd className="font-mono">{s.last_run.status}</dd>
                                  </div>
                                  {s.last_run.error_message && (
                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">
                                      {s.last_run.error_message}
                                    </div>
                                  )}
                                  {Array.isArray(s.last_run.validation_errors) && s.last_run.validation_errors.length > 0 && (
                                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-700 font-mono text-[10px] max-h-32 overflow-auto">
                                      {JSON.stringify(s.last_run.validation_errors, null, 2)}
                                    </div>
                                  )}
                                </dl>
                              ) : (
                                <div className="text-neutral-400 italic">
                                  {lang === "pt" ? "Nunca executado" : "Never run"}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-neutral-400 italic">
        {lang === "pt"
          ? "Auto-correção é humana: quando um scraper fica quebrado, leia scraper_knowledge e corrija o código. Veja documentation/SCRAPER_PROTOCOL.md."
          : "Auto-correction is human-driven: when a scraper goes broken, read scraper_knowledge and fix the code. See documentation/SCRAPER_PROTOCOL.md."}
      </div>
    </div>
  );
}
