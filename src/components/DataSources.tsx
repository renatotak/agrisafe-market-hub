"use client";

import { useState, useEffect, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { mockSyncLogs } from "@/data/mock";
import type { MockSyncLog } from "@/data/mock";
import sourceData from "@/data/source-registry.json";
import { MockBadge } from "@/components/ui/MockBadge";
import {
  CheckCircle2, AlertTriangle, XCircle, Circle, ExternalLink,
  Search, Globe, ChevronDown, ChevronUp, Zap, Layers, X,
  Database, Info,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "registry" | "history" | "quality";

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

const registrySources: RegistrySource[] = sourceData as RegistrySource[];

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
  const [liveLogs, setLiveLogs] = useState<MockSyncLog[]>(mockSyncLogs);
  const [logsAreReal, setLogsAreReal] = useState(false);

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
  }, []);

  // Real KPIs from registry JSON (not mock)
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

      {tab === "registry" && <RegistryTab lang={lang} />}
      {tab === "history"  && <HistoryTab lang={lang} logs={liveLogs} isReal={logsAreReal} />}
      {tab === "quality"  && <QualityTab lang={lang} />}
    </div>
  );
}

// ─── Tab: Source Registry ─────────────────────────────────────────────────────

type SortField = "domain" | "org" | "count" | "status";

function RegistryTab({ lang }: { lang: Lang }) {
  const [search, setSearch]                 = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState("");
  const [statusFilter, setStatusFilter]     = useState("");
  const [usedFilter, setUsedFilter]         = useState<"all" | "used" | "unused">("all");
  const [sortField, setSortField]           = useState<SortField>("count");
  const [sortDir, setSortDir]               = useState<"asc" | "desc">("desc");
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const allGroups = useMemo(() => {
    const map = new Map<string, DomainGroup>();
    for (const s of registrySources) {
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
  }, []);

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
  }, [allGroups, search, categoryFilter, frequencyFilter, statusFilter, usedFilter, sortField, sortDir]);

  const categories  = [...new Set(registrySources.map(s => s.category))].sort();
  const frequencies = [...new Set(registrySources.map(s => s.frequency))].sort();
  const hasFilters  = search || categoryFilter || frequencyFilter || statusFilter || usedFilter !== "all";

  return (
    <div className="space-y-4">
      {/* Category strip — clickable filters */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {categories.filter(c => c !== "outros").slice(0, 6).map(cat => {
          const info  = CATEGORY_LABELS[cat] || CATEGORY_LABELS.outros;
          const count = registrySources.filter(s => s.category === cat).length;
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
              onClick={() => { setSearch(""); setCategoryFilter(""); setFrequencyFilter(""); setStatusFilter(""); setUsedFilter("all"); }}
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
                  {lang === "pt" ? "Categorias" : "Categories"}
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
                    onToggle={() => setExpandedDomain(isExpanded ? null : group.domain)} />
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
    </div>
  );
}

// ─── Domain Row ───────────────────────────────────────────────────────────────

function DomainRow({ group, lang, isExpanded, onToggle }: {
  group: DomainGroup; lang: Lang; isExpanded: boolean; onToggle: () => void;
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
            {group.categories.slice(0, 3).map(cat => {
              const ci = CATEGORY_LABELS[cat] || CATEGORY_LABELS.outros;
              return (
                <span key={cat} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${ci.color}`}>
                  {lang === "pt" ? ci.pt : ci.en}
                </span>
              );
            })}
            {group.categories.length > 3 && (
              <span className="text-[9px] text-neutral-400 font-medium">
                +{group.categories.length - 3}
              </span>
            )}
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
              {/* Endpoint list */}
              <div className="space-y-1.5">
                {group.sources.map(s => <EndpointDetail key={s.id} s={s} lang={lang} />)}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
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

function EndpointDetail({ s, lang }: { s: RegistrySource; lang: Lang }) {
  const freqInfo = FREQ_LABELS[s.frequency] || { pt: s.frequency, en: s.frequency };

  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-md bg-white border border-neutral-100 hover:border-neutral-200 transition-colors">
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
        </div>
        {s.description && (
          <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{s.description}</p>
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

function QualityTab({ lang }: { lang: Lang }) {
  const tr = t(lang);

  const dailyVolume: Record<string, number> = {};
  mockSyncLogs.forEach((log) => {
    const day = new Date(log.started_at).toLocaleDateString(
      lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" }
    );
    dailyVolume[day] = (dailyVolume[day] || 0) + log.records_inserted;
  });
  const volumeData = Object.entries(dailyVolume).reverse().map(([date, count]) => ({ date, count }));

  // Real stats derived from the registry JSON
  const realStats = [
    {
      name: lang === "pt" ? "Domínios catalogados" : "Catalogued domains",
      value: [...new Set(registrySources.map(s => extractDomain(s.url)))].length,
      note: lang === "pt" ? "Orgs únicas no arquivo JSON" : "Unique orgs in JSON file",
      real: true,
    },
    {
      name: lang === "pt" ? "Endpoints ativos" : "Active endpoints",
      value: registrySources.filter(s => s.url_status === "active").length,
      note: lang === "pt" ? "URL status = active" : "URL status = active",
      real: true,
    },
    {
      name: lang === "pt" ? "Automatizados" : "Automated",
      value: registrySources.filter(s => s.automated).length,
      note: lang === "pt" ? "automated: true no JSON" : "automated: true in JSON",
      real: true,
    },
    {
      name: lang === "pt" ? "Sem verificação" : "Unchecked",
      value: registrySources.filter(s => s.url_status === "unchecked").length,
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
            {lang === "pt" ? "Volume de Sync Simulado" : "Simulated Sync Volume"}
          </h3>
          <MockBadge />
        </div>

        <div className="flex items-start gap-3 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3 mb-3">
          <Info size={16} className="text-neutral-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-neutral-500">
            {lang === "pt"
              ? "Os dados de volume e saúde das tabelas abaixo são simulados e representam o comportamento esperado quando os jobs de ETL estiverem ativos."
              : "Volume and table health data below are simulated and represent the expected behavior once ETL jobs are active."}
          </p>
        </div>

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


