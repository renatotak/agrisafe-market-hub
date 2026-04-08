"use client";

/**
 * Diretório de Indústrias — top-level chapter (Phase 24A + 24A2).
 *
 * Phase 24A split this chapter out of RetailersDirectory's "Indústrias" tab
 * so retailers and industries each get their own sidebar entry.
 *
 * Phase 24A2 (2026-04-07) loaded the 2026-04-07 industries CSV — 256
 * additional companies anchored via legal_entities + entity_roles. The
 * /api/industries endpoint now returns a union of:
 *   - "curated" entries (rich slug catalog, drill-down profile)
 *   - "imported" entries (RF metadata: CNAE, capital, porte, Inpev)
 * The card render branches on `kind` so curated cards stay clickable while
 * imported ones surface their RF fields inline.
 */

import { useEffect, useMemo, useState } from "react";
import { Lang } from "@/lib/i18n";
import { Loader2, Factory, Search, Filter, X, Recycle, Building2 } from "lucide-react";
import { IndustryProfile } from "@/components/IndustryProfile";

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

type SortKey = "name_az" | "name_za" | "capital_desc" | "capital_asc" | "filiais_desc";

function fmtBRL(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return `R$ ${(n / 1e9).toFixed(2)} bi`;
  if (n >= 1e6) return `R$ ${(n / 1e6).toFixed(1)} mi`;
  if (n >= 1e3) return `R$ ${(n / 1e3).toFixed(0)} mil`;
  return `R$ ${n.toFixed(0)}`;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/industries")
      .then((r) => r.json())
      .then((d) => setIndustries(d.industries || []))
      .finally(() => setLoading(false));
  }, []);

  // Drill-down only works for curated entries (which use slug ids that the
  // /api/industries?id=<slug> route resolves). Imported entries use UUID
  // ids and there's no drill-down profile yet — they show RF fields inline
  // on the card and clicking does nothing.
  if (selectedId) {
    return (
      <IndustryProfile
        industryId={selectedId}
        lang={lang}
        onBack={() => setSelectedId(null)}
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
          (i.segment || []).some((s) => s.toLowerCase().includes(q))
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

  const totalIndustries = industries.length;
  const inpevCount = industries.filter((i) => i.inpev === true).length;
  const totalProducts = industries.reduce((s, i) => s + (i.product_count || 0), 0);
  const totalLinkedRetailers = industries.reduce((s, i) => s + (i.retailer_count || 0), 0);
  const distinctSegments = segments.length;

  const hasFilters = !!segmentFilter || inpevOnly || kindFilter !== "all";

  return (
    <div>
      {/* Header */}
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile
          label={lang === "pt" ? "Indústrias" : "Industries"}
          value={totalIndustries.toLocaleString()}
        />
        <KpiTile
          label={lang === "pt" ? "Membros inpEV" : "inpEV members"}
          value={inpevCount.toLocaleString()}
          sub={
            totalIndustries > 0
              ? `${Math.round((inpevCount / totalIndustries) * 100)}%`
              : undefined
          }
        />
        <KpiTile
          label={lang === "pt" ? "Segmentos" : "Segments"}
          value={distinctSegments.toString()}
        />
        <KpiTile
          label={lang === "pt" ? "Revendas vinculadas" : "Linked Retailers"}
          value={totalLinkedRetailers.toLocaleString()}
          sub={
            totalProducts > 0
              ? `${totalProducts.toLocaleString()} ${lang === "pt" ? "produtos" : "products"}`
              : undefined
          }
        />
      </div>

      {/* Search + Filters + Sort */}
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

      {/* Result count */}
      <p className="text-[11px] text-neutral-500 mb-3">
        {filtered.length === industries.length
          ? lang === "pt"
            ? `${filtered.length} indústrias`
            : `${filtered.length} industries`
          : lang === "pt"
            ? `${filtered.length} de ${industries.length}`
            : `${filtered.length} of ${industries.length}`}
      </p>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-neutral-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          {lang === "pt" ? "Carregando indústrias..." : "Loading industries..."}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center text-neutral-400 text-sm">
          {lang === "pt" ? "Nenhum resultado" : "No results"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ind) => (
            <IndustryCard
              key={ind.id}
              ind={ind}
              lang={lang}
              onClick={ind.kind === "curated" ? () => setSelectedId(ind.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IndustryCard({
  ind,
  lang,
  onClick,
}: {
  ind: Industry;
  lang: Lang;
  onClick?: () => void;
}) {
  const isCurated = ind.kind === "curated";
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={`bg-white rounded-lg border p-4 text-left transition-all w-full ${
        onClick
          ? "border-neutral-200 shadow-sm hover:border-brand-primary hover:shadow-md cursor-pointer"
          : "border-neutral-200 shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-[14px] font-bold text-neutral-900 leading-tight line-clamp-2">
          {ind.name_display || ind.name}
        </h3>
        {ind.inpev && (
          <span
            title="Membro inpEV — devolução de embalagens"
            className="shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-success-light text-success-dark"
          >
            <Recycle size={10} /> inpEV
          </span>
        )}
      </div>

      {/* Segments */}
      {(ind.segment || []).length > 0 && (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {(ind.segment || []).slice(0, 4).map((s) => (
            <span
              key={s}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-700"
            >
              {SEGMENT_LABELS[s]?.[lang] || s}
            </span>
          ))}
        </div>
      )}

      {isCurated ? (
        // Curated cards: existing rich layout (products, retailers, country)
        <div className="flex items-center gap-4 mt-3 text-[11px] text-neutral-500">
          <span>
            {ind.product_count || 0} {lang === "pt" ? "produtos" : "products"}
          </span>
          <span>
            {ind.retailer_count || 0} {lang === "pt" ? "revendas" : "retailers"}
          </span>
          {ind.headquarters_country && <span>{ind.headquarters_country}</span>}
        </div>
      ) : (
        // Imported cards: RF metadata inline
        <div className="mt-3 space-y-1.5 text-[11px]">
          {ind.cnae_descricao && (
            <p className="text-neutral-600 line-clamp-2">{ind.cnae_descricao}</p>
          )}
          <div className="flex items-center gap-3 text-neutral-500 flex-wrap">
            {ind.cnpj && (
              <span className="font-mono text-[10px]">
                {formatCnpj(ind.cnpj)}
              </span>
            )}
            {ind.capital_social != null && (
              <span title={lang === "pt" ? "Capital social" : "Equity capital"}>
                {fmtBRL(ind.capital_social)}
              </span>
            )}
            {ind.cnpj_filiais != null && ind.cnpj_filiais > 0 && (
              <span className="flex items-center gap-0.5">
                <Building2 size={10} /> {ind.cnpj_filiais}
              </span>
            )}
          </div>
        </div>
      )}
    </Tag>
  );
}

function formatCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, "");
  if (c.length === 8) return c.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3");
  if (c.length === 14) return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return cnpj;
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
