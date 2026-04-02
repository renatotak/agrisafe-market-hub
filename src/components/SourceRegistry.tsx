"use client";

import { useState, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import sourceData from "@/data/source-registry.json";
import { Badge } from "@/components/ui/Badge";
import {
  Search, Filter, ExternalLink, CheckCircle2, XCircle, AlertTriangle,
  Circle, ChevronDown, ChevronUp, ArrowUpDown, Database, Rss,
  FileSpreadsheet, Globe, X, Zap, Layers,
} from "lucide-react";

interface Source {
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
  sources: Source[];
  categories: string[];
  frequencies: string[];
  activeCount: number;
  errorCount: number;
  inactiveCount: number;
  uncheckedCount: number;
  usedCount: number;
  overallStatus: string;
}

const sources: Source[] = sourceData as Source[];

/** Extract base domain from a URL */
function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    // Remove www. prefix for cleaner grouping
    let domain = u.hostname.replace(/^www\./, "");
    if (domain.includes("bcb.gov.br")) return "bcb.gov.br";
    if (domain.includes("embrapa.br")) return "embrapa.br";
    return domain;
  } catch {
    return url;
  }
}

/** Determine overall status for a domain group */
function computeOverallStatus(group: { activeCount: number; errorCount: number; inactiveCount: number; uncheckedCount: number }): string {
  if (group.errorCount > 0 && group.activeCount === 0) return "error";
  if (group.inactiveCount > 0 && group.activeCount === 0) return "inactive";
  if (group.errorCount > 0) return "error";
  if (group.activeCount > 0) return "active";
  return "unchecked";
}

const CATEGORY_LABELS: Record<string, { pt: string; en: string; color: string }> = {
  fiscal: { pt: "Fiscal", en: "Fiscal", color: "bg-info-light text-info-dark" },
  socioambiental: { pt: "Socioambiental", en: "Environmental", color: "bg-success-light text-success-dark" },
  financeiro: { pt: "Financeiro", en: "Financial", color: "bg-warning-light text-warning-dark" },
  agropecuaria: { pt: "Agropecuária", en: "Agriculture", color: "bg-brand-surface text-brand-primary" },
  agronomico: { pt: "Agronômico", en: "Agronomic", color: "bg-brand-surface text-brand-dark" },
  logistica: { pt: "Logística", en: "Logistics", color: "bg-neutral-200 text-neutral-700" },
  geografias: { pt: "Geografias", en: "Geographies", color: "bg-[#E3F2FD] text-[#1565C0]" },
  outros: { pt: "Outros", en: "Other", color: "bg-neutral-200 text-neutral-600" },
};

const FREQ_LABELS: Record<string, { pt: string; en: string }> = {
  diaria: { pt: "Diária", en: "Daily" },
  semanal: { pt: "Semanal", en: "Weekly" },
  mensal: { pt: "Mensal", en: "Monthly" },
  trimestral: { pt: "Trimestral", en: "Quarterly" },
  anual: { pt: "Anual", en: "Annual" },
  nao_informado: { pt: "N/I", en: "N/A" },
};

type SortField = "domain" | "org" | "count" | "status";

export function SourceRegistry({ lang }: { lang: Lang }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [usedFilter, setUsedFilter] = useState<"all" | "used" | "unused">("all");
  const [sortField, setSortField] = useState<SortField>("count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  // Build domain groups from raw sources
  const allGroups = useMemo(() => {
    const map = new Map<string, DomainGroup>();

    for (const s of sources) {
      const domain = extractDomain(s.url);
      let group = map.get(domain);
      if (!group) {
        group = {
          domain,
          org: s.source_org,
          sources: [],
          categories: [],
          frequencies: [],
          activeCount: 0,
          errorCount: 0,
          inactiveCount: 0,
          uncheckedCount: 0,
          usedCount: 0,
          overallStatus: "unchecked",
        };
        map.set(domain, group);
      }
      group.sources.push(s);
      if (!group.categories.includes(s.category)) group.categories.push(s.category);
      if (!group.frequencies.includes(s.frequency)) group.frequencies.push(s.frequency);
      if (s.url_status === "active") group.activeCount++;
      else if (s.url_status === "error") group.errorCount++;
      else if (s.url_status === "inactive") group.inactiveCount++;
      else group.uncheckedCount++;
      if (s.used_in_app) group.usedCount++;
    }

    // compute overall status
    for (const group of map.values()) {
      group.overallStatus = computeOverallStatus(group);
    }

    return Array.from(map.values());
  }, []);

  // Filter and sort domain groups
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
    if (statusFilter) result = result.filter(g => g.overallStatus === statusFilter);
    if (usedFilter === "used") result = result.filter(g => g.usedCount > 0);
    if (usedFilter === "unused") result = result.filter(g => g.usedCount === 0);

    result.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortField) {
        case "domain": av = a.domain; bv = b.domain; break;
        case "org": av = a.org; bv = b.org; break;
        case "count": av = a.sources.length; bv = b.sources.length; break;
        case "status": av = a.overallStatus; bv = b.overallStatus; break;
        default: av = a.domain; bv = b.domain;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

    return result;
  }, [allGroups, search, categoryFilter, frequencyFilter, statusFilter, usedFilter, sortField, sortDir]);

  // Stats
  const totalActive = sources.filter(s => s.url_status === "active").length;
  const totalUsed = sources.filter(s => s.used_in_app).length;
  const categories = [...new Set(sources.map(s => s.category))].sort();
  const frequencies = [...new Set(sources.map(s => s.frequency))].sort();
  const totalDomains = allGroups.length;
  const hasFilters = search || categoryFilter || frequencyFilter || statusFilter || usedFilter !== "all";

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-neutral-900">
            {lang === "pt" ? "Registro de Fontes" : "Source Registry"}
          </h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            {lang === "pt"
              ? `${totalDomains} domínios — ${sources.length} endpoints — ${totalActive} ativos — ${totalUsed} em uso`
              : `${totalDomains} domains — ${sources.length} endpoints — ${totalActive} active — ${totalUsed} in use`}
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {categories.filter(c => c !== "outros").slice(0, 6).map(cat => {
          const info = CATEGORY_LABELS[cat] || CATEGORY_LABELS.outros;
          const count = sources.filter(s => s.category === cat).length;
          return (
            <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
              className={`rounded-lg p-3 border text-left transition-all ${categoryFilter === cat ? "border-brand-primary bg-brand-surface/50" : "border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-neutral-300"}`}>
              <p className="text-[18px] font-bold text-neutral-900">{count}</p>
              <p className="text-[10px] font-semibold text-neutral-500 uppercase">{lang === "pt" ? info.pt : info.en}</p>
            </button>
          );
        })}
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={lang === "pt" ? "Buscar por domínio, organização ou nome..." : "Search by domain, organization or name..."}
              className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary" />
          </div>
          <select value={frequencyFilter} onChange={e => setFrequencyFilter(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20">
            <option value="">{lang === "pt" ? "Frequência" : "Frequency"}</option>
            {frequencies.map(f => <option key={f} value={f}>{FREQ_LABELS[f]?.[lang === "pt" ? "pt" : "en"] || f}</option>)}
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
                className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${usedFilter === v ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600"}`}>
                {v === "all" ? (lang === "pt" ? "Todas" : "All") : v === "used" ? (lang === "pt" ? "Em uso" : "In use") : (lang === "pt" ? "Não usadas" : "Unused")}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button onClick={() => { setSearch(""); setCategoryFilter(""); setFrequencyFilter(""); setStatusFilter(""); setUsedFilter("all"); }}
              className="flex items-center gap-1 px-3 py-2 text-[12px] text-error font-medium hover:text-error-dark">
              <X size={14} />{lang === "pt" ? "Limpar" : "Clear"}
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-[12px] text-neutral-500 mb-3 px-1">
        {filtered.length} {lang === "pt" ? "domínios" : "domains"} ({filtered.reduce((sum, g) => sum + g.sources.length, 0)} endpoints)
      </p>

      {/* Table — grouped by domain */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-neutral-50 text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.05em] border-b border-neutral-200">
                <th className="px-3 py-2.5 text-center w-8">{lang === "pt" ? "Uso" : "Use"}</th>
                <th className="px-3 py-2.5 text-left cursor-pointer hover:text-neutral-700" onClick={() => toggleSort("domain")}>
                  {lang === "pt" ? "Domínio" : "Domain"} {sortField === "domain" && (sortDir === "asc" ? "▲" : "▼")}
                </th>
                <th className="px-3 py-2.5 text-left cursor-pointer hover:text-neutral-700 hidden md:table-cell" onClick={() => toggleSort("org")}>
                  {lang === "pt" ? "Org" : "Org"} {sortField === "org" && (sortDir === "asc" ? "▲" : "▼")}
                </th>
                <th className="px-3 py-2.5 text-left hidden sm:table-cell">
                  {lang === "pt" ? "Categorias" : "Categories"}
                </th>
                <th className="px-3 py-2.5 text-center cursor-pointer hover:text-neutral-700 hidden lg:table-cell" onClick={() => toggleSort("count")}>
                  {lang === "pt" ? "Endpoints" : "Endpoints"} {sortField === "count" && (sortDir === "asc" ? "▲" : "▼")}
                </th>
                <th className="px-3 py-2.5 text-center cursor-pointer hover:text-neutral-700" onClick={() => toggleSort("status")}>
                  {lang === "pt" ? "Saúde" : "Health"} {sortField === "status" && (sortDir === "asc" ? "▲" : "▼")}
                </th>
                <th className="px-3 py-2.5 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(group => {
                const isExpanded = expandedDomain === group.domain;
                return (
                  <DomainRow key={group.domain} group={group} lang={lang}
                    isExpanded={isExpanded} onToggle={() => setExpandedDomain(isExpanded ? null : group.domain)} />
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 100 && (
          <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50 text-[12px] text-neutral-500 text-center">
            {lang === "pt" ? `Mostrando 100 de ${filtered.length} domínios. Use filtros para refinar.` : `Showing 100 of ${filtered.length} domains. Use filters to refine.`}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Domain-grouped row ── */
function DomainRow({ group, lang, isExpanded, onToggle }: {
  group: DomainGroup; lang: Lang;
  isExpanded: boolean; onToggle: () => void;
}) {
  const hasUsed = group.usedCount > 0;
  const primaryCat = group.categories[0] || "outros";
  const catInfo = CATEGORY_LABELS[primaryCat] || CATEGORY_LABELS.outros;

  return (
    <>
      <tr onClick={onToggle} className="border-b border-neutral-200 hover:bg-neutral-100/60 transition-colors cursor-pointer">
        {/* Used indicator */}
        <td className="px-3 py-2.5 text-center">
          {hasUsed ? (
            <Zap size={14} className="text-brand-primary inline" />
          ) : (
            <Circle size={8} className="text-neutral-300 inline" />
          )}
        </td>

        {/* Domain */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-neutral-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-neutral-900 text-[13px]">{group.domain}</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">{group.org}</p>
            </div>
          </div>
        </td>

        {/* Org */}
        <td className="px-3 py-2.5 hidden md:table-cell">
          <span className="text-[12px] text-neutral-600">{group.org}</span>
        </td>

        {/* Categories */}
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
              <span className="text-[9px] text-neutral-400 font-medium">+{group.categories.length - 3}</span>
            )}
          </div>
        </td>

        {/* Endpoint count */}
        <td className="px-3 py-2.5 text-center hidden lg:table-cell">
          <div className="flex items-center justify-center gap-1">
            <Layers size={12} className="text-neutral-400" />
            <span className="text-[12px] font-semibold text-neutral-700">{group.sources.length}</span>
          </div>
        </td>

        {/* Overall health status */}
        <td className="px-3 py-2.5 text-center">
          <HealthBadge status={group.overallStatus} active={group.activeCount} error={group.errorCount}
            inactive={group.inactiveCount} unchecked={group.uncheckedCount} lang={lang} />
        </td>

        {/* Expand chevron */}
        <td className="px-3 py-2.5">
          {isExpanded ? <ChevronUp size={12} className="text-neutral-400" /> : <ChevronDown size={12} className="text-neutral-400" />}
        </td>
      </tr>

      {/* ── Collapsible detail ── */}
      {isExpanded && (
        <tr className="bg-neutral-50/80">
          <td colSpan={7} className="px-4 py-0">
            <div className="py-3 space-y-2">
              {/* Domain summary bar */}
              <div className="flex flex-wrap gap-3 text-[11px] text-neutral-500 pb-2 border-b border-neutral-200/60">
                <span>{group.activeCount} {lang === "pt" ? "ativos" : "active"}</span>
                {group.errorCount > 0 && <span className="text-warning">{group.errorCount} {lang === "pt" ? "com erro" : "error"}</span>}
                {group.inactiveCount > 0 && <span className="text-error">{group.inactiveCount} {lang === "pt" ? "inativos" : "inactive"}</span>}
                {group.usedCount > 0 && <span className="text-brand-primary font-medium">{group.usedCount} {lang === "pt" ? "em uso no app" : "used in app"}</span>}
              </div>

              {/* Individual endpoints list */}
              <div className="space-y-1.5">
                {group.sources.map(s => (
                  <EndpointDetail key={s.id} s={s} lang={lang} />
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Health badge (aggregated) ── */
function HealthBadge({ status, active, error, inactive, unchecked, lang }: {
  status: string; active: number; error: number; inactive: number; unchecked: number; lang: Lang;
}) {
  if (status === "active" && error === 0 && inactive === 0) {
    return <CheckCircle2 size={14} className="text-success-dark inline" />;
  }
  if (status === "error" && active === 0) {
    return <XCircle size={14} className="text-error inline" />;
  }
  if (status === "inactive" && active === 0) {
    return <XCircle size={14} className="text-error inline" />;
  }
  if (status === "error") {
    return <AlertTriangle size={14} className="text-warning inline" />;
  }
  if (status === "unchecked") {
    return <Circle size={10} className="text-neutral-300 inline" />;
  }
  return <CheckCircle2 size={14} className="text-success-dark inline" />;
}

/* ── Individual endpoint detail inside collapsible ── */
function EndpointDetail({ s, lang }: { s: Source; lang: Lang }) {
  const freqInfo = FREQ_LABELS[s.frequency] || { pt: s.frequency, en: s.frequency };

  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-md bg-white border border-neutral-100 hover:border-neutral-200 transition-colors">
      {/* Status icon */}
      <div className="mt-0.5 flex-shrink-0">
        {s.url_status === "active" && <CheckCircle2 size={12} className="text-success-dark" />}
        {s.url_status === "inactive" && <XCircle size={12} className="text-error" />}
        {s.url_status === "error" && <AlertTriangle size={12} className="text-warning" />}
        {s.url_status === "unchecked" && <Circle size={8} className="text-neutral-300 mt-0.5" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[12px] text-neutral-800">{s.name}</span>
          {s.used_in_app && <Zap size={10} className="text-brand-primary" />}
          <span className="text-[10px] text-neutral-400">{lang === "pt" ? freqInfo.pt : freqInfo.en}</span>
          {s.http_status && <span className="text-[10px] text-neutral-400 font-mono">HTTP {s.http_status}</span>}
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

      {/* Data type + Automated */}
      <div className="hidden md:flex flex-col items-end gap-1 flex-shrink-0">
        {s.data_type && <span className="text-[10px] font-mono text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded">{s.data_type}</span>}
        {s.automated && <span className="text-[9px] text-brand-primary font-medium bg-brand-surface px-1.5 py-0.5 rounded">Auto</span>}
      </div>
    </div>
  );
}
