"use client";

/**
 * Diretório de Indústrias — top-level chapter (Phase 24B refactor).
 *
 * Phase 24A split this chapter out of RetailersDirectory.
 * Phase 24A2 backfilled 256 imported industries from the Apr 2026 CSV.
 * Phase 24B (this file) replaces the card grid with a list+map+expandable
 * layout that mirrors the Diretório de Canais — better for portfolio
 * analysis and consistent with how the user already navigates retailers.
 *
 * Layout:
 *   ┌ Header + view toggle (List / Map)
 *   ├ KPI tiles (industries, inpEV members, segmentos, revendas vinculadas)
 *   ├ Search + filters bar (segment, kind, inpEV)
 *   ├ Result count
 *   └ List view (sortable table with expandable rows)  OR  Map view
 *
 * Each expanded row exposes:
 *   • Receita Federal data inline + "Dados Receita Federal" button
 *   • "Pesquisar na Web" button (analysis_type=industry)
 *   • "Análise IA" button (deeper company-research call, industry prompt)
 *   • Filiais list (queries /api/cnpj/establishments on demand)
 *   • For curated entries: "Ver perfil completo" → IndustryProfile drill-down
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Lang } from "@/lib/i18n";
import {
  Loader2, Factory, Search, Filter, X, Recycle, Building2,
  ChevronDown, ChevronUp,
  LayoutList, Map as MapIcon, Briefcase, Globe, Sparkles, MapPin,
  ExternalLink, Lock, CheckCircle2, XCircle,
} from "lucide-react";
import { IndustryProfile } from "@/components/IndustryProfile";
import { EntityMapShell, EntityMapMarker, EntityMapLayer } from "@/components/EntityMapShell";
import { EntityCrmPanel } from "@/components/EntityCrmPanel";
import { StreetViewTile } from "@/components/StreetViewTile";

interface Industry {
  id: string;
  kind: "curated" | "imported";
  name: string;
  name_display?: string | null;
  segment?: string[] | null;
  product_count?: number;
  retailer_count?: number;
  headquarters_country?: string | null;
  // Imported-only fields:
  cnpj?: string;
  cnae?: string;
  cnae_descricao?: string;
  capital_social?: number | null;
  porte?: string | null;
  inpev?: boolean;
  cnpj_filiais?: number;
  natureza_juridica?: string | null;
}

interface Establishment {
  cnpj: string;
  cnpj_raiz: string;
  ordem?: string | null;
  matriz_filial?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  situacao_cadastral?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep?: string | null;
  municipio?: string | null;
  uf?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const SEGMENT_LABELS: Record<string, { pt: string; en: string }> = {
  defensivos: { pt: "Defensivos", en: "Pesticides" },
  fertilizantes: { pt: "Fertilizantes", en: "Fertilizers" },
  sementes: { pt: "Sementes", en: "Seeds" },
  biologicos: { pt: "Biológicos", en: "Biologicals" },
  biotecnologia: { pt: "Biotecnologia", en: "Biotech" },
  digital: { pt: "Digital", en: "Digital" },
  farmaceuticos: { pt: "Farmacêuticos", en: "Pharmaceuticals" },
  nutricao_animal: { pt: "Nutrição Animal", en: "Animal Nutrition" },
  maquinas: { pt: "Máquinas", en: "Machinery" },
  quimicos: { pt: "Químicos", en: "Chemicals" },
  outros: { pt: "Outros", en: "Other" },
};

const SEGMENT_MARKER_COLORS: Record<string, string> = {
  defensivos: "#E8722A",
  fertilizantes: "#5B7A2F",
  sementes: "#7FA02B",
  biologicos: "#1565C0",
  outros: "#9E9E9E",
};

type SortKey =
  | "name_az" | "name_za"
  | "capital_desc" | "capital_asc"
  | "filiais_desc";

const PAGE_SIZE = 25;

function fmtBRL(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return `R$ ${(n / 1e9).toFixed(2)} bi`;
  if (n >= 1e6) return `R$ ${(n / 1e6).toFixed(1)} mi`;
  if (n >= 1e3) return `R$ ${(n / 1e3).toFixed(0)} mil`;
  return `R$ ${n.toFixed(0)}`;
}

function formatCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  const c = cnpj.replace(/\D/g, "");
  if (c.length === 8) return c.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3");
  if (c.length === 14) return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return cnpj;
}

export function IndustriesDirectory({ lang }: { lang: Lang }) {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("");
  const [inpevOnly, setInpevOnly] = useState(false);
  const [kindFilter, setKindFilter] = useState<"all" | "curated" | "imported">("all");
  const [sort, setSort] = useState<SortKey>("name_az");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedCuratedId, setSelectedCuratedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/industries")
      .then((r) => r.json())
      .then((d) => setIndustries(d.industries || []))
      .finally(() => setLoading(false));
  }, []);

  // Drill-down profile (curated entries only)
  if (selectedCuratedId) {
    return (
      <IndustryProfile
        industryId={selectedCuratedId}
        lang={lang}
        onBack={() => setSelectedCuratedId(null)}
      />
    );
  }

  const segments = useMemo(() => {
    const set = new Set<string>();
    for (const i of industries) (i.segment || []).forEach((s) => set.add(s));
    return Array.from(set).sort();
  }, [industries]);

  const filtered = useMemo(() => {
    let list = [...industries];
    if (kindFilter !== "all") list = list.filter((i) => i.kind === kindFilter);
    if (segmentFilter) list = list.filter((i) => (i.segment || []).includes(segmentFilter));
    if (inpevOnly) list = list.filter((i) => i.inpev === true);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          (i.name_display || i.name || "").toLowerCase().includes(q) ||
          (i.cnpj || "").includes(q) ||
          (i.cnae_descricao || "").toLowerCase().includes(q) ||
          (i.segment || []).some((s) => s.toLowerCase().includes(q)),
      );
    }
    list.sort((a, b) => {
      switch (sort) {
        case "name_za":
          return (b.name_display || b.name || "").localeCompare(a.name_display || a.name || "");
        case "capital_desc":
          return (b.capital_social || 0) - (a.capital_social || 0);
        case "capital_asc":
          return (a.capital_social || 0) - (b.capital_social || 0);
        case "filiais_desc":
          return (b.cnpj_filiais || 0) - (a.cnpj_filiais || 0);
        case "name_az":
        default:
          return (a.name_display || a.name || "").localeCompare(b.name_display || b.name || "");
      }
    });
    return list;
  }, [industries, kindFilter, segmentFilter, inpevOnly, search, sort]);

  // Reset pagination on filter/search change
  useEffect(() => {
    setPage(0);
  }, [search, segmentFilter, inpevOnly, kindFilter, sort]);

  const totalIndustries = industries.length;
  const inpevCount = industries.filter((i) => i.inpev === true).length;
  const totalProducts = industries.reduce((s, i) => s + (i.product_count || 0), 0);
  const totalLinkedRetailers = industries.reduce((s, i) => s + (i.retailer_count || 0), 0);
  const distinctSegments = segments.length;

  const hasFilters = !!segmentFilter || inpevOnly || kindFilter !== "all";

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      {/* ── Header + view toggle ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-neutral-900 flex items-center gap-2">
            <Factory size={22} className="text-brand-primary" />
            {lang === "pt" ? "Diretório de Indústrias" : "Industries Directory"}
          </h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            {lang === "pt"
              ? `${totalIndustries} indústrias catalogadas — ${inpevCount} membros do inpEV`
              : `${totalIndustries} industries catalogued — ${inpevCount} inpEV members`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${viewMode === "list" ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-500 hover:text-neutral-700"}`}
            >
              <LayoutList size={14} /> {lang === "pt" ? "Lista" : "List"}
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${viewMode === "map" ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-500 hover:text-neutral-700"}`}
            >
              <MapIcon size={14} /> {lang === "pt" ? "Mapa" : "Map"}
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile label={lang === "pt" ? "Indústrias" : "Industries"} value={totalIndustries.toLocaleString()} />
        <KpiTile
          label={lang === "pt" ? "Membros inpEV" : "inpEV members"}
          value={inpevCount.toLocaleString()}
          sub={totalIndustries > 0 ? `${Math.round((inpevCount / totalIndustries) * 100)}%` : undefined}
        />
        <KpiTile label={lang === "pt" ? "Segmentos" : "Segments"} value={distinctSegments.toString()} />
        <KpiTile
          label={lang === "pt" ? "Revendas vinculadas" : "Linked Retailers"}
          value={totalLinkedRetailers.toLocaleString()}
          sub={totalProducts > 0 ? `${totalProducts.toLocaleString()} ${lang === "pt" ? "produtos" : "products"}` : undefined}
        />
      </div>

      {/* ── Search + filters ── */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                lang === "pt"
                  ? "Buscar por nome, CNPJ, CNAE ou segmento..."
                  : "Search by name, CNPJ, CNAE or segment..."
              }
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-[14px] font-medium transition-all border ${hasFilters ? "bg-brand-surface border-brand-light text-brand-primary" : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100"}`}
          >
            <Filter size={16} />
            {lang === "pt" ? "Filtros" : "Filters"}
            {hasFilters && (
              <span className="w-5 h-5 rounded-full bg-brand-primary text-white text-[10px] flex items-center justify-center font-bold">
                {[segmentFilter, inpevOnly && "i", kindFilter !== "all" && "k"].filter(Boolean).length}
              </span>
            )}
          </button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            <option value="name_az">{lang === "pt" ? "Nome A→Z" : "Name A→Z"}</option>
            <option value="name_za">{lang === "pt" ? "Nome Z→A" : "Name Z→A"}</option>
            <option value="capital_desc">{lang === "pt" ? "Capital ↓" : "Capital ↓"}</option>
            <option value="capital_asc">{lang === "pt" ? "Capital ↑" : "Capital ↑"}</option>
            <option value="filiais_desc">{lang === "pt" ? "Filiais ↓" : "Branches ↓"}</option>
          </select>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-neutral-200">
            <div>
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
                {lang === "pt" ? "Segmento" : "Segment"}
              </label>
              <select
                value={segmentFilter}
                onChange={(e) => setSegmentFilter(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[14px]"
              >
                <option value="">{lang === "pt" ? "Todos" : "All"}</option>
                {segments.map((s) => (
                  <option key={s} value={s}>
                    {SEGMENT_LABELS[s]?.[lang] || s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
                {lang === "pt" ? "Origem" : "Source"}
              </label>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[14px]"
              >
                <option value="all">{lang === "pt" ? "Todas" : "All"}</option>
                <option value="curated">{lang === "pt" ? "Curadas" : "Curated"}</option>
                <option value="imported">{lang === "pt" ? "Importadas" : "Imported"}</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
                inpEV
              </label>
              <button
                onClick={() => setInpevOnly(!inpevOnly)}
                className={`w-full px-3 py-2 rounded-md text-[14px] font-medium border transition-all ${inpevOnly ? "bg-success-light border-success-dark text-success-dark" : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100"}`}
              >
                {inpevOnly
                  ? lang === "pt"
                    ? "✓ Apenas membros"
                    : "✓ Members only"
                  : lang === "pt"
                    ? "Somente inpEV"
                    : "inpEV only"}
              </button>
            </div>
            {hasFilters && (
              <button
                onClick={() => {
                  setSegmentFilter("");
                  setInpevOnly(false);
                  setKindFilter("all");
                }}
                className="flex items-center gap-1 text-[12px] text-error hover:text-error-dark font-medium"
              >
                <X size={14} />
                {lang === "pt" ? "Limpar filtros" : "Clear filters"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Result count ── */}
      <p className="text-[11px] text-neutral-500 mb-3">
        {filtered.length === industries.length
          ? lang === "pt"
            ? `${filtered.length} indústrias`
            : `${filtered.length} industries`
          : lang === "pt"
            ? `${filtered.length} de ${industries.length}`
            : `${filtered.length} of ${industries.length}`}
      </p>

      {/* ── Body: list or map ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-neutral-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          {lang === "pt" ? "Carregando indústrias..." : "Loading industries..."}
        </div>
      ) : viewMode === "list" ? (
        <IndustryListView
          rows={pageRows}
          totalRows={filtered.length}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
          onOpenCurated={(id) => setSelectedCuratedId(id)}
          lang={lang}
        />
      ) : (
        <IndustryMapView industries={filtered} lang={lang} />
      )}
    </div>
  );
}

// ─── List view ──────────────────────────────────────────────────────────────

function IndustryListView({
  rows,
  totalRows,
  page,
  totalPages,
  onPageChange,
  expandedId,
  onToggleExpand,
  onOpenCurated,
  lang,
}: {
  rows: Industry[];
  totalRows: number;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onOpenCurated: (id: string) => void;
  lang: Lang;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center text-neutral-400 text-sm">
        {lang === "pt" ? "Nenhum resultado" : "No results"}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="bg-neutral-50 text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.05em] border-b border-neutral-200">
              <th className="px-4 py-3 text-left">{lang === "pt" ? "Indústria" : "Industry"}</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">{lang === "pt" ? "Segmento" : "Segment"}</th>
              <th className="px-4 py-3 text-left hidden lg:table-cell">CNAE</th>
              <th className="px-4 py-3 text-right hidden md:table-cell">{lang === "pt" ? "Capital" : "Capital"}</th>
              <th className="px-4 py-3 text-center hidden lg:table-cell">{lang === "pt" ? "Filiais" : "Branches"}</th>
              <th className="px-4 py-3 text-center hidden xl:table-cell">{lang === "pt" ? "Origem" : "Source"}</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ind) => (
              <IndustryRow
                key={ind.id}
                ind={ind}
                expanded={expandedId === ind.id}
                onToggle={() => onToggleExpand(ind.id)}
                onOpenCurated={onOpenCurated}
                lang={lang}
              />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
          <p className="text-[12px] text-neutral-500">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRows)} {lang === "pt" ? "de" : "of"}{" "}
            {totalRows.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-md hover:bg-neutral-200 disabled:opacity-30 transition-colors"
            >
              ‹
            </button>
            <span className="text-[12px] font-medium text-neutral-600">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-md hover:bg-neutral-200 disabled:opacity-30 transition-colors"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── One row + its expanded panel ───────────────────────────────────────────

function IndustryRow({
  ind,
  expanded,
  onToggle,
  onOpenCurated,
  lang,
}: {
  ind: Industry;
  expanded: boolean;
  onToggle: () => void;
  onOpenCurated: (id: string) => void;
  lang: Lang;
}) {
  const segmentLabels = (ind.segment || []).slice(0, 3).map((s) => SEGMENT_LABELS[s]?.[lang] || s);
  const kindLabel = ind.kind === "curated"
    ? lang === "pt" ? "Curada" : "Curated"
    : lang === "pt" ? "Importada" : "Imported";

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer"
      >
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-neutral-900 text-[13px] truncate flex items-center gap-1.5">
                {ind.name_display || ind.name}
                {ind.inpev && (
                  <span
                    title="Membro inpEV"
                    className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-success-light text-success-dark"
                  >
                    <Recycle size={9} /> inpEV
                  </span>
                )}
              </p>
              {ind.cnpj && (
                <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{formatCnpj(ind.cnpj)}</p>
              )}
              {ind.headquarters_country && (
                <p className="text-[10px] text-neutral-400 mt-0.5">{ind.headquarters_country}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <div className="flex flex-wrap gap-1">
            {segmentLabels.map((s, i) => (
              <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                {s}
              </span>
            ))}
          </div>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell text-[11px] text-neutral-600">
          <span className="line-clamp-2">{ind.cnae_descricao || "—"}</span>
        </td>
        <td className="px-4 py-3 hidden md:table-cell text-right text-[12px] text-neutral-700">
          {fmtBRL(ind.capital_social)}
        </td>
        <td className="px-4 py-3 hidden lg:table-cell text-center text-[12px] text-neutral-700">
          {ind.cnpj_filiais != null && ind.cnpj_filiais > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Building2 size={11} className="text-neutral-400" /> {ind.cnpj_filiais}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-4 py-3 hidden xl:table-cell text-center">
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
            {kindLabel}
          </span>
        </td>
        <td className="px-4 py-3">
          {expanded ? (
            <ChevronUp size={14} className="text-neutral-400" />
          ) : (
            <ChevronDown size={14} className="text-neutral-400" />
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-neutral-50">
          <td colSpan={7} className="px-4 py-4">
            <IndustryExpandedPanel ind={ind} onOpenCurated={onOpenCurated} lang={lang} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Expanded panel: RF data, web search, AI analysis, filiais ──────────────

function IndustryExpandedPanel({
  ind,
  onOpenCurated,
  lang,
}: {
  ind: Industry;
  onOpenCurated: (id: string) => void;
  lang: Lang;
}) {
  const cnpjRaiz = ind.cnpj || null;
  const hasCnpj = !!cnpjRaiz;

  // ── Receita Federal enrichment ──
  const [enrichment, setEnrichment] = useState<any | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // ── Web research (analysis_type='industry') ──
  const [research, setResearch] = useState<any[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  // ── Filiais ──
  const [establishments, setEstablishments] = useState<Establishment[] | null>(null);
  const [estLoading, setEstLoading] = useState(false);
  const [estError, setEstError] = useState<string | null>(null);
  const [estSource, setEstSource] = useState<string | null>(null);

  // Auto-load cached enrichment + research when row expands
  useEffect(() => {
    if (!hasCnpj || !cnpjRaiz) return;
    const enrichParam = ind.kind === "imported" ? `entity_uid=${ind.id}` : `cnpj_raiz=${cnpjRaiz}`;
    fetch(`/api/company-enrichment?${enrichParam}&cache_only=true`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.source !== "none") setEnrichment(d);
      });
    const resParam = ind.kind === "imported" ? `entity_uid=${ind.id}` : `cnpj_basico=${cnpjRaiz}`;
    fetch(`/api/company-research?${resParam}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.research) setResearch(d.research);
      });
    // Don't auto-fetch establishments — let the user click (rate-limit cost)
  }, [hasCnpj, cnpjRaiz, ind.id, ind.kind]);

  const fetchEnrichment = async () => {
    if (!cnpjRaiz) return;
    setEnrichLoading(true);
    setEnrichError(null);
    try {
      const param = ind.kind === "imported" ? `entity_uid=${ind.id}` : `cnpj_raiz=${cnpjRaiz}`;
      const res = await fetch(`/api/company-enrichment?${param}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao consultar");
      setEnrichment(data);
    } catch (err: any) {
      setEnrichError(err.message);
    } finally {
      setEnrichLoading(false);
    }
  };

  const triggerResearch = async (deep = false) => {
    if (!cnpjRaiz) return;
    if (deep) setAiLoading(true);
    else setResearchLoading(true);
    setResearchError(null);
    try {
      const res = await fetch("/api/company-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj_basico: cnpjRaiz,
          entity_uid: ind.kind === "imported" ? ind.id : undefined,
          razao_social: ind.name_display || ind.name,
          nome_fantasia: ind.name_display || ind.name,
          analysis_type: "industry",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na pesquisa");
      setResearch((prev) => [data, ...prev]);
    } catch (err: any) {
      setResearchError(err.message);
    } finally {
      setResearchLoading(false);
      setAiLoading(false);
    }
  };

  const fetchEstablishments = useCallback(async () => {
    if (!cnpjRaiz) return;
    setEstLoading(true);
    setEstError(null);
    try {
      const param = ind.kind === "imported" ? `entity_uid=${ind.id}` : `cnpj_raiz=${cnpjRaiz}`;
      const res = await fetch(`/api/cnpj/establishments?${param}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao buscar filiais");
      setEstablishments(data.establishments || []);
      setEstSource(data.source || null);
    } catch (err: any) {
      setEstError(err.message);
    } finally {
      setEstLoading(false);
    }
  }, [cnpjRaiz, ind.id, ind.kind]);

  return (
    <div className="space-y-4">
      {/* ── RF metadata (locked) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <Field
          locked
          label="CNPJ"
          value={ind.cnpj ? formatCnpj(ind.cnpj) : "—"}
          mono
        />
        <Field
          locked
          label={lang === "pt" ? "Capital Social" : "Equity Capital"}
          value={fmtBRL(ind.capital_social)}
        />
        <Field
          locked
          label="CNAE"
          value={ind.cnae ? `${ind.cnae} — ${ind.cnae_descricao || ""}`.trim() : ind.cnae_descricao || "—"}
        />
        <Field
          locked
          label={lang === "pt" ? "Porte" : "Size"}
          value={ind.porte || "—"}
        />
        {ind.natureza_juridica && (
          <Field
            locked
            label={lang === "pt" ? "Natureza Jurídica" : "Legal Form"}
            value={ind.natureza_juridica}
          />
        )}
        {enrichment?.situacao_cadastral && (
          <div>
            <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1">
              <Lock size={8} className="text-neutral-400" />
              {lang === "pt" ? "Situação" : "Status"}
            </span>
            <p className="mt-0.5">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${enrichment.situacao_cadastral === "Ativa" || enrichment.situacao_cadastral === "ATIVA" ? "text-success-dark bg-success-light" : "text-error bg-red-50"}`}
              >
                {enrichment.situacao_cadastral === "Ativa" || enrichment.situacao_cadastral === "ATIVA" ? (
                  <CheckCircle2 size={10} />
                ) : (
                  <XCircle size={10} />
                )}
                {enrichment.situacao_cadastral}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={fetchEnrichment}
          disabled={!hasCnpj || enrichLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-semibold transition-all border border-brand-primary/30 bg-brand-surface text-brand-primary hover:bg-brand-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
          title={hasCnpj ? "" : "CNPJ não disponível para esta indústria"}
        >
          {enrichLoading ? <Loader2 size={14} className="animate-spin" /> : <Briefcase size={14} />}
          {enrichLoading
            ? lang === "pt"
              ? "Consultando..."
              : "Querying..."
            : lang === "pt"
              ? "Dados Receita Federal"
              : "Federal Revenue Data"}
        </button>

        <button
          onClick={() => triggerResearch(false)}
          disabled={!hasCnpj || researchLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-semibold transition-all border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {researchLoading ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
          {researchLoading
            ? lang === "pt"
              ? "Pesquisando..."
              : "Searching..."
            : lang === "pt"
              ? "Pesquisar na Web"
              : "Web Search"}
        </button>

        <button
          onClick={() => triggerResearch(true)}
          disabled={!hasCnpj || aiLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-semibold transition-all border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title={lang === "pt" ? "Análise focada em produtos, moléculas e parceiros" : "Focused on products, molecules and partners"}
        >
          {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {aiLoading
            ? lang === "pt"
              ? "Analisando..."
              : "Analyzing..."
            : lang === "pt"
              ? "Análise IA"
              : "AI Analysis"}
        </button>

        <button
          onClick={fetchEstablishments}
          disabled={!hasCnpj || estLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-semibold transition-all border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {estLoading ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />}
          {estLoading
            ? lang === "pt"
              ? "Buscando filiais..."
              : "Fetching branches..."
            : lang === "pt"
              ? "Buscar filiais"
              : "Fetch branches"}
        </button>

        {ind.kind === "curated" && (
          <button
            onClick={() => onOpenCurated(ind.id)}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-semibold transition-all border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
          >
            <ExternalLink size={14} />
            {lang === "pt" ? "Ver perfil completo" : "View full profile"}
          </button>
        )}
      </div>

      {!hasCnpj && (
        <p className="text-[11px] text-neutral-400 italic">
          {lang === "pt"
            ? "Sem CNPJ associado — esta indústria curada ainda não foi vinculada a uma legal_entity."
            : "No CNPJ on file — this curated industry hasn't been linked to a legal_entity yet."}
        </p>
      )}
      {enrichError && <p className="text-[11px] text-error">{enrichError}</p>}
      {researchError && <p className="text-[11px] text-error">{researchError}</p>}
      {estError && <p className="text-[11px] text-error">{estError}</p>}

      {/* ── Web research results ── */}
      {research.length > 0 && (
        <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <h4 className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <Globe size={12} />
              {lang === "pt" ? "Inteligência Web" : "Web Intelligence"}
              {research[0].analysis_type && (
                <span className="text-[9px] font-normal text-blue-500 ml-1 normal-case">
                  ({research[0].analysis_type})
                </span>
              )}
            </h4>
            <span className="text-[9px] text-neutral-400">
              {research[0].searched_at ? new Date(research[0].searched_at).toLocaleDateString("pt-BR") : ""}
            </span>
          </div>
          <div className="p-4">
            {research[0].summary && (
              <p className="text-[12px] text-neutral-700 leading-relaxed mb-3">{research[0].summary}</p>
            )}
            <div className="space-y-2">
              {(research[0].findings || []).slice(0, 5).map((f: any, j: number) => (
                <div key={j} className="pl-3 border-l-2 border-blue-100">
                  <p className="text-[12px] font-medium text-neutral-800">{f.title}</p>
                  {f.snippet && <p className="text-[11px] text-neutral-500 mt-0.5">{f.snippet}</p>}
                  {f.url && f.source !== "duckduckgo.com" && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5"
                    >
                      {f.source || "link"} <ExternalLink size={9} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Filiais list ── */}
      {establishments && (
        <div className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
            <h4 className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 size={12} />
              {establishments.length} {lang === "pt" ? "Estabelecimentos" : "Establishments"}
            </h4>
            {estSource && (
              <span className="text-[9px] text-amber-600">
                {estSource === "cache"
                  ? lang === "pt" ? "cache" : "cached"
                  : estSource}
              </span>
            )}
          </div>
          <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
            {establishments.length === 0 ? (
              <p className="text-[12px] text-neutral-400 px-2 py-3">
                {lang === "pt" ? "Nenhum estabelecimento encontrado." : "No establishments found."}
              </p>
            ) : (
              establishments.map((loc, i) => {
                const isMatriz = loc.matriz_filial === "1" || loc.ordem === "0001";
                return (
                  <div
                    key={loc.cnpj || i}
                    className={`text-[12px] rounded-md px-3 py-2 border ${isMatriz ? "border-brand-primary/20 bg-brand-surface/30" : "border-neutral-200 bg-white"}`}
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <MapPin
                        size={11}
                        className={isMatriz ? "text-brand-primary shrink-0" : "text-neutral-400 shrink-0"}
                      />
                      <span className="font-mono text-[10px] text-neutral-500">{formatCnpj(loc.cnpj)}</span>
                      {isMatriz && (
                        <span className="text-[9px] font-bold text-brand-primary bg-brand-surface px-1.5 py-0.5 rounded">
                          MATRIZ
                        </span>
                      )}
                      {!isMatriz && (
                        <span className="text-[9px] font-bold text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                          FILIAL
                        </span>
                      )}
                      {loc.nome_fantasia && (
                        <span className="text-[11px] font-medium text-neutral-700">— {loc.nome_fantasia}</span>
                      )}
                      {loc.situacao_cadastral && loc.situacao_cadastral !== "Ativa" && loc.situacao_cadastral !== "ATIVA" && (
                        <span className="text-[9px] font-bold text-error bg-red-50 px-1.5 py-0.5 rounded">
                          {loc.situacao_cadastral}
                        </span>
                      )}
                    </div>
                    <div className="ml-5 space-y-0.5 text-[11px] text-neutral-500">
                      <p>
                        {[loc.logradouro, loc.numero].filter(Boolean).join(", ")}
                        {loc.complemento ? ` — ${loc.complemento}` : ""}
                      </p>
                      <p>
                        {[loc.bairro, loc.municipio, loc.uf].filter(Boolean).join(" - ")}
                        {loc.cep ? ` — CEP ${loc.cep}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Phase 24G — Street View tile (matriz only) ── */}
      {(() => {
        const matriz = establishments?.find((e) => e.matriz_filial === "1" || e.ordem === "0001");
        if (!matriz) return null;
        if (matriz.latitude == null || matriz.longitude == null) return null;
        return (
          <StreetViewTile
            latitude={Number(matriz.latitude)}
            longitude={Number(matriz.longitude)}
            label={`${matriz.municipio || ""}${matriz.uf ? "/" + matriz.uf : ""}`}
            lang={lang}
          />
        );
      })()}

      {/* ── Phase 24G — CRM panel (entity_uid only) ── */}
      <EntityCrmPanel entityUid={ind.kind === "imported" ? ind.id : null} lang={lang} />
    </div>
  );
}

// ─── Map view ───────────────────────────────────────────────────────────────
//
// Phase 24B: replaces the bespoke Google Maps wrapper with EntityMapShell so
// the Painel UI (terrain/satellite, fullscreen, recenter, bbox capture,
// layer chips, city autocomplete) is shared. Markers come from the
// cnpj_establishments cache, segmented by primary segment as layer chips.

const INDUSTRY_LAYERS_PT: EntityMapLayer[] = [
  { key: "defensivos", label: "Defensivos", color: SEGMENT_MARKER_COLORS.defensivos },
  { key: "fertilizantes", label: "Fertilizantes", color: SEGMENT_MARKER_COLORS.fertilizantes },
  { key: "sementes", label: "Sementes", color: SEGMENT_MARKER_COLORS.sementes },
  { key: "biologicos", label: "Biológicos", color: SEGMENT_MARKER_COLORS.biologicos },
  { key: "outros", label: "Outros", color: SEGMENT_MARKER_COLORS.outros },
];

function IndustryMapView({ industries, lang }: { industries: Industry[]; lang: Lang }) {
  const [markers, setMarkers] = useState<EntityMapMarker[]>([]);
  const [loading, setLoading] = useState(false);

  // Build the list of CNPJ roots we'd want to plot (imported kind only)
  const cnpjRoots = useMemo(
    () =>
      industries
        .filter((i) => !!i.cnpj)
        .map((i) => ({
          cnpjRaiz: (i.cnpj || "").replace(/\D/g, "").padStart(8, "0"),
          name: i.name_display || i.name,
          segment: (i.segment || [])[0] || "outros",
        })),
    [industries],
  );

  useEffect(() => {
    if (cnpjRoots.length === 0) {
      setMarkers([]);
      return;
    }
    setLoading(true);
    // Pull cached establishments only — never trigger live BrasilAPI fetches
    // from the map (would make the page hang). Users populate the cache via
    // "Buscar filiais" on a row OR the backfill script.
    Promise.all(
      cnpjRoots.slice(0, 200).map(async (r) => {
        try {
          const res = await fetch(`/api/cnpj/establishments?cnpj_raiz=${r.cnpjRaiz}`);
          if (!res.ok) return [];
          const data = await res.json();
          if (data.source !== "cache" && data.source !== "cache_stale") return [];
          return (data.establishments || [])
            .filter((e: any) => e.latitude != null && e.longitude != null)
            .map((e: any): EntityMapMarker => ({
              id: String(e.cnpj),
              lat: Number(e.latitude),
              lng: Number(e.longitude),
              layer: SEGMENT_MARKER_COLORS[r.segment] ? r.segment : "outros",
              title: r.name,
              subtitle: [e.municipio, e.uf].filter(Boolean).join(" - "),
              uf: e.uf || undefined,
              extra: (
                <div className="mt-1 space-y-0.5">
                  {e.nome_fantasia && (
                    <p className="text-[11px] text-neutral-500">{e.nome_fantasia}</p>
                  )}
                  <p className="text-[10px] text-neutral-400 font-mono">{formatCnpj(e.cnpj)}</p>
                  <p className="text-[11px] text-neutral-600">
                    {[e.logradouro, e.numero].filter(Boolean).join(", ")}
                  </p>
                  {e.cep && <p className="text-[10px] text-neutral-400">CEP {e.cep}</p>}
                </div>
              ),
            }));
        } catch {
          return [];
        }
      }),
    )
      .then((arrs) => setMarkers(arrs.flat()))
      .finally(() => setLoading(false));
  }, [cnpjRoots]);

  return (
    <EntityMapShell
      lang={lang}
      title={lang === "pt" ? "Mapa de Indústrias" : "Industries Map"}
      subtitle={lang === "pt" ? "Estabelecimentos geocodificados (cache)" : "Geocoded establishments (cache)"}
      markers={markers}
      layers={INDUSTRY_LAYERS_PT}
      loading={loading}
      mapId="industries-map"
    />
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  locked,
  mono,
}: {
  label: string;
  value: string;
  locked?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1">
        {locked && <Lock size={8} className="text-neutral-400" />}
        {label}
      </span>
      <p className={`text-neutral-800 mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-semibold text-neutral-500 uppercase">{label}</p>
      <p className="text-[24px] font-bold text-neutral-900 mt-1">{value}</p>
      {sub && <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  );
}
