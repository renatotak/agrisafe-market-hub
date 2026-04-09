"use client";

import { useEffect, useState, useCallback } from "react";
// @ts-ignore — react-dom types available at runtime
import { createPortal } from "react-dom";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Store, Search, ChevronDown, ChevronUp, MapPin, Building2,
  Loader2, ChevronLeft, ChevronRight, Filter, X, Map as MapIcon, LayoutList,
  Users, FileSearch, ExternalLink, Calendar, Briefcase, Shield, CheckCircle2, XCircle,
  Pencil, Save, Globe, Lock, MessageSquareText, Phone, Mail, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { RetailerExpandedPanel } from "@/components/RetailerExpandedPanel";
import { RiskSignals } from "@/components/RiskSignals";
import { RetailerKpiRow } from "@/components/RetailerKpiRow";
import { EntityMapShell, EntityMapMarker, EntityMapLayer } from "@/components/EntityMapShell";
import { EntityCrmPanel } from "@/components/EntityCrmPanel";
import { StreetViewTile } from "@/components/StreetViewTile";

const PAGE_SIZE = 25;
const MAP_LIMIT = 500; // max markers on map

// ─── CNPJ Helpers ──────────────────────────────────────────────────────────────

/** Format a CNPJ string (8 or 14 digits) into the standard display format. */
function formatCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (clean.length === 8) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3");
  }
  return cnpj;
}

/** Compute CNPJ check digits for a 12-digit base string. */
function computeCnpjDv(base12: string): string {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d = base12.split("").map(Number);
  const s1 = d.reduce((s, v, i) => s + v * w1[i], 0);
  const d1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);
  d.push(d1);
  const s2 = d.reduce((s, v, i) => s + v * w2[i], 0);
  const d2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);
  return `${d1}${d2}`;
}

/** Build full 14-digit CNPJ for the matriz from the 8-digit root. */
function buildMatrizCnpj(cnpjRaiz: string): string {
  const base12 = cnpjRaiz.padStart(8, "0") + "0001";
  return base12 + computeCnpjDv(base12);
}

interface CompanyEnrichment {
  cnpj_basico: string;
  razao_social: string | null;
  natureza_juridica: string | null;
  capital_social: number | null;
  porte: string | null;
  situacao_cadastral: string | null;
  data_situacao_cadastral: string | null;
  data_inicio_atividade: string | null;
  cnae_fiscal: string | null;
  cnae_fiscal_descricao: string | null;
  opcao_simples: boolean | null;
  opcao_mei: boolean | null;
  email: string | null;
  telefone: string | null;
  qsa: { nome_socio: string; qualificacao_socio: string; data_entrada_sociedade: string; cnpj_cpf_do_socio?: string }[];
  cnaes_secundarios: { codigo: number; descricao: string }[];
  fetched_at: string | null;
  source?: string;
}

const CLASSIFICACAO_COLORS: Record<string, string> = {
  A: "bg-success-light text-success-dark",
  B: "bg-info-light text-info-dark",
  C: "bg-warning-light text-warning-dark",
  D: "bg-neutral-200 text-neutral-700",
};

const GRUPO_COLORS: Record<string, string> = {
  DISTRIBUIDOR: "bg-brand-surface text-brand-primary",
  COOPERATIVA: "bg-info-light text-info-dark",
  "CANAL RD": "bg-warning-light text-warning-dark",
  PLATAFORMA: "bg-neutral-200 text-neutral-600",
};

interface Retailer {
  id: number;
  /** Canonical legal-entity id (Phase 17C). Present after migration 024. */
  entity_uid: string | null;
  cnpj_raiz: string;
  consolidacao: string;
  razao_social: string;
  nome_fantasia: string | null;
  grupo_acesso: string | null;
  tipo_acesso: string | null;
  faixa_faturamento: string | null;
  industria_1: string | null;
  industria_2: string | null;
  industria_3: string | null;
  classificacao: string | null;
  possui_loja_fisica: string | null;
  capital_social: number | null;
  porte: string | null;
  porte_name: string | null;
}

export function RetailersDirectory({ lang }: { lang: Lang }) {
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ufFilter, setUfFilter] = useState("");
  const [grupoFilter, setGrupoFilter] = useState("");
  const [classificacaoFilter, setClassificacaoFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Record<string, any[]>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [ufs, setUfs] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [mapLocations, setMapLocations] = useState<any[]>([]);
  const [mapLoading, setMapLoading] = useState(false);

  // KPI stats — kept for the header subtitle ("X canais mapeados em Y estados")
  const [stats, setStats] = useState({ total: 0, distribuidores: 0, cooperativas: 0, estados: 0 });

  // Server-side sort. Defaults to razao_social ASC (matches the old hardcoded order).
  type SortField = "razao_social" | "grupo_acesso" | "classificacao" | "faixa_faturamento" | "porte_name";
  const [sortField, setSortField] = useState<SortField>("razao_social");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => { fetchRetailers(); fetchFilterOptions(); fetchStats(); }, []);
  useEffect(() => { setPage(0); }, [search, ufFilter, grupoFilter, classificacaoFilter, sortField, sortDir]);
  useEffect(() => { fetchRetailers(); }, [page, search, ufFilter, grupoFilter, classificacaoFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };
  useEffect(() => { if (viewMode === "map") fetchMapLocations(); }, [viewMode, ufFilter, grupoFilter, classificacaoFilter, search]);

  const fetchStats = async () => {
    const { count: total } = await supabase.from("retailers").select("*", { count: "exact", head: true });
    const { count: dist } = await supabase.from("retailers").select("*", { count: "exact", head: true }).eq("grupo_acesso", "DISTRIBUIDOR");
    const { count: coop } = await supabase.from("retailers").select("*", { count: "exact", head: true }).eq("grupo_acesso", "COOPERATIVA");
    const { data: ufData } = await supabase.from("retailer_locations").select("uf").not("uf", "is", null);
    const estados = ufData ? new Set(ufData.map((r: any) => r.uf)).size : 0;
    setStats({ total: total || 0, distribuidores: dist || 0, cooperativas: coop || 0, estados });
  };

  const fetchFilterOptions = async () => {
    const [{ data: locData }, { data: grupoData }] = await Promise.all([
      supabase.from("retailer_locations").select("uf").not("uf", "is", null),
      supabase.from("retailers").select("grupo_acesso").not("grupo_acesso", "is", null),
    ]);
    if (locData) setUfs([...new Set(locData.map((r: any) => r.uf))].filter(Boolean).sort() as string[]);
    if (grupoData) {
      const g = [...new Set(grupoData.map((r: any) => r.grupo_acesso))].filter(Boolean).sort() as string[];
      setGrupos(g.filter(v => ["DISTRIBUIDOR", "COOPERATIVA", "CANAL RD", "PLATAFORMA", "INDUSTRIA"].includes(v)));
    }
  };

  const fetchRetailers = async () => {
    setLoading(true);
    let query = supabase
      .from("retailers")
      .select("*", { count: "exact" })
      .order(sortField, { ascending: sortDir === "asc", nullsFirst: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search.trim()) query = query.or(`razao_social.ilike.%${search.trim()}%,nome_fantasia.ilike.%${search.trim()}%,cnpj_raiz.ilike.%${search.trim()}%`);
    if (grupoFilter) query = query.eq("grupo_acesso", grupoFilter);
    if (classificacaoFilter) query = query.eq("classificacao", classificacaoFilter);

    // UF filter requires joining with locations — use a subquery approach
    // For simplicity, if UF filter is active, fetch cnpj_raiz from locations first
    if (ufFilter) {
      const { data: ufCnpjs } = await supabase.from("retailer_locations").select("cnpj_raiz").eq("uf", ufFilter);
      if (ufCnpjs?.length) {
        const cnpjs = [...new Set(ufCnpjs.map((r: any) => r.cnpj_raiz))];
        query = query.in("cnpj_raiz", cnpjs.slice(0, 1000)); // Supabase limit
      }
    }

    const { data, count } = await query;
    if (data) setRetailers(data);
    if (count != null) setTotalCount(count);
    setLoading(false);
  };

  const fetchMapLocations = useCallback(async () => {
    setMapLoading(true);
    let query = supabase
      .from("retailer_locations")
      .select("id, cnpj, nome_fantasia, razao_social, logradouro, numero, bairro, municipio, uf, cep, latitude, longitude, geo_precision")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(MAP_LIMIT);

    if (ufFilter) query = query.eq("uf", ufFilter);
    if (search.trim()) {
      query = query.or(`razao_social.ilike.%${search.trim()}%,nome_fantasia.ilike.%${search.trim()}%,cnpj.ilike.%${search.trim()}%`);
    }

    const { data } = await query;
    setMapLocations(data || []);
    setMapLoading(false);
  }, [ufFilter, search]);

  const fetchLocations = async (cnpjRaiz: string) => {
    if (locations[cnpjRaiz]) return;
    const { data } = await supabase.from("retailer_locations").select("*").eq("cnpj_raiz", cnpjRaiz).order("uf");
    if (data) setLocations(prev => ({ ...prev, [cnpjRaiz]: data }));
  };

  const toggleExpand = (cnpjRaiz: string) => {
    if (expandedId === cnpjRaiz) { setExpandedId(null); } else { setExpandedId(cnpjRaiz); fetchLocations(cnpjRaiz); }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasActiveFilters = ufFilter || grupoFilter || classificacaoFilter || search;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-neutral-900">
            {lang === "pt" ? "Diret\u00f3rio de Canais" : "Channel Directory"}
          </h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            {lang === "pt"
              ? `${stats.total.toLocaleString("pt-BR")} canais mapeados em ${stats.estados} estados`
              : `${stats.total.toLocaleString("en-US")} channels mapped across ${stats.estados} states`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5">
            <button onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${viewMode === "list" ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-500 hover:text-neutral-700"}`}>
              <LayoutList size={14} /> {lang === "pt" ? "Lista" : "List"}
            </button>
            <button onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${viewMode === "map" ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-500 hover:text-neutral-700"}`}>
              <MapIcon size={14} /> Mapa
            </button>
          </div>
        </div>
      </div>

      {/* KPIs — Phase 24A CRM-focused indicator row */}
      <RetailerKpiRow lang={lang} />

      {/* Search & Filters */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "pt" ? "Buscar por nome, raz\u00e3o social ou CNPJ..." : "Search by name or CNPJ..."}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-[14px] font-medium transition-all border ${hasActiveFilters ? "bg-brand-surface border-brand-light text-brand-primary" : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100"}`}>
            <Filter size={16} />
            {lang === "pt" ? "Filtros" : "Filters"}
            {hasActiveFilters && <span className="w-5 h-5 rounded-full bg-brand-primary text-white text-[10px] flex items-center justify-center font-bold">{[ufFilter, grupoFilter, classificacaoFilter].filter(Boolean).length}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-neutral-200">
            <div>
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">UF</label>
              <select value={ufFilter} onChange={(e) => setUfFilter(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20">
                <option value="">{lang === "pt" ? "Todos" : "All"}</option>
                {ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">{lang === "pt" ? "Grupo" : "Group"}</label>
              <select value={grupoFilter} onChange={(e) => setGrupoFilter(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20">
                <option value="">{lang === "pt" ? "Todos" : "All"}</option>
                {grupos.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">{lang === "pt" ? "Classifica\u00e7\u00e3o" : "Classification"}</label>
              <select value={classificacaoFilter} onChange={(e) => setClassificacaoFilter(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20">
                <option value="">{lang === "pt" ? "Todas" : "All"}</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
            {hasActiveFilters && (
              <button onClick={() => { setUfFilter(""); setGrupoFilter(""); setClassificacaoFilter(""); setSearch(""); }}
                className="flex items-center gap-1 text-[12px] text-error hover:text-error-dark font-medium">
                <X size={14} />{lang === "pt" ? "Limpar filtros" : "Clear filters"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content: List or Map */}
      {viewMode === "list" ? (
        loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-brand-primary" /></div>
        ) : (
          <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="bg-neutral-50 text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.05em] border-b border-neutral-200">
                    <SortHeader label={lang === "pt" ? "Empresa" : "Company"} field="razao_social" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                    <SortHeader label={lang === "pt" ? "Grupo" : "Group"} field="grupo_acesso" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} className="hidden md:table-cell" />
                    <SortHeader label={lang === "pt" ? "Class." : "Class."} field="classificacao" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} align="center" className="hidden md:table-cell" />
                    <SortHeader label={lang === "pt" ? "Faturamento" : "Revenue"} field="faixa_faturamento" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
                    <SortHeader label={lang === "pt" ? "Porte" : "Size"} field="porte_name" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} className="hidden xl:table-cell" />
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {retailers.map((r) => (
                    <RetailerRow key={r.cnpj_raiz} retailer={r} lang={lang} expanded={expandedId === r.cnpj_raiz}
                      onToggle={() => toggleExpand(r.cnpj_raiz)} locations={locations[r.cnpj_raiz]}
                      onRetailerUpdate={(cnpj, field, value) => {
                        setRetailers(prev => prev.map(ret => ret.cnpj_raiz === cnpj ? { ...ret, [field]: value } : ret));
                      }} />
                  ))}
                  {retailers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-neutral-400">{lang === "pt" ? "Nenhum resultado" : "No results"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
                <p className="text-[12px] text-neutral-500">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} {lang === "pt" ? "de" : "of"} {totalCount.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                    className="p-1.5 rounded-md hover:bg-neutral-200 disabled:opacity-30 transition-colors"><ChevronLeft size={16} /></button>
                  <span className="text-[12px] font-medium text-neutral-600">{page + 1} / {totalPages}</span>
                  <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-md hover:bg-neutral-200 disabled:opacity-30 transition-colors"><ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <RetailersMap locations={mapLocations} loading={mapLoading} lang={lang} totalCount={totalCount} />
      )}
    </div>
  );
}

// ─── Sortable column header ──────────────────────────────────────────────────

function SortHeader({
  label,
  field,
  sortField,
  sortDir,
  onToggle,
  align = "left",
  className = "",
}: {
  label: string;
  field: string;
  sortField: string;
  sortDir: "asc" | "desc";
  onToggle: (field: any) => void;
  align?: "left" | "center";
  className?: string;
}) {
  const active = sortField === field;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 text-${align} ${className}`}>
      <button
        onClick={() => onToggle(field)}
        className={`inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.05em] hover:text-neutral-800 transition-colors ${active ? "text-brand-primary" : "text-neutral-500"}`}
      >
        {label}
        <Icon size={11} className={active ? "" : "opacity-40"} />
      </button>
    </th>
  );
}

// ─── Map View ────────────────────────────────────────────────────────────────
//
// Phase 24B: replaced the bespoke wrapper with EntityMapShell so the
// Diretório de Canais map matches the Painel UI exactly (terrain/satellite,
// fullscreen, recenter, "Buscar nesta área" bbox capture, layer chips, city
// autocomplete). Markers come from retailer_locations and are layered by
// channel group (distribuidor / cooperativa / canal rd / plataforma).

const GRUPO_MARKER_COLORS: Record<string, string> = {
  DISTRIBUIDOR: "#5B7A2F",
  COOPERATIVA: "#1565C0",
  "CANAL RD": "#E8722A",
  PLATAFORMA: "#9E9E9E",
};

const RETAILER_LAYERS: EntityMapLayer[] = [
  { key: "DISTRIBUIDOR", label: "Distribuidor", color: GRUPO_MARKER_COLORS.DISTRIBUIDOR },
  { key: "COOPERATIVA", label: "Cooperativa", color: GRUPO_MARKER_COLORS.COOPERATIVA },
  { key: "CANAL RD", label: "Canal RD", color: GRUPO_MARKER_COLORS["CANAL RD"] },
  { key: "PLATAFORMA", label: "Plataforma", color: GRUPO_MARKER_COLORS.PLATAFORMA },
];

function RetailersMap({ locations, loading, lang, totalCount }: {
  locations: any[]; loading: boolean; lang: Lang; totalCount: number;
}) {
  const markers: EntityMapMarker[] = locations.map((loc) => {
    // Map razao_social heuristic to layer (legacy: COOP substring → COOPERATIVA)
    const isCoop = (loc.razao_social || "").toUpperCase().includes("COOP");
    const layer = isCoop ? "COOPERATIVA" : "DISTRIBUIDOR";
    return {
      id: String(loc.id),
      lat: Number(loc.latitude),
      lng: Number(loc.longitude),
      layer,
      title: loc.nome_fantasia || loc.razao_social || "",
      subtitle: [loc.municipio, loc.uf].filter(Boolean).join(" - "),
      uf: loc.uf || undefined,
      extra: (
        <div className="mt-1 space-y-0.5">
          {loc.nome_fantasia && loc.razao_social && (
            <p className="text-[11px] text-neutral-500">{loc.razao_social}</p>
          )}
          {loc.cnpj && (
            <p className="text-[10px] text-neutral-400 font-mono">{formatCnpj(loc.cnpj)}</p>
          )}
          <p className="text-[11px] text-neutral-600">
            {[loc.logradouro, loc.numero].filter(Boolean).join(", ")}
          </p>
          {loc.cep && <p className="text-[10px] text-neutral-400">CEP {loc.cep}</p>}
          {loc.geo_precision && loc.geo_precision !== "address" && loc.geo_precision !== "original" && (
            <p className="text-[9px] text-amber-600 font-medium">
              {lang === "pt" ? "Localização aproximada" : "Approximate location"} ({loc.geo_precision})
            </p>
          )}
        </div>
      ),
    };
  });

  const subtitle = totalCount > MAP_LIMIT
    ? lang === "pt"
      ? `${locations.length}+ de ${totalCount.toLocaleString("pt-BR")} canais — use filtros para refinar`
      : `${locations.length}+ of ${totalCount.toLocaleString("en-US")} channels — refine with filters`
    : undefined;

  return (
    <EntityMapShell
      lang={lang}
      title={lang === "pt" ? "Mapa de Canais" : "Channels Map"}
      subtitle={subtitle}
      markers={markers}
      layers={RETAILER_LAYERS}
      loading={loading}
      mapId="retailers-map"
    />
  );
}

// ─── Editable Cell ──────────────────────────────────────────────────────────

function EditableCell({ value, onSave, placeholder, type = "text", options }: {
  value: string; onSave: (v: string) => void; placeholder?: string;
  type?: "text" | "select"; options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
        className="cursor-pointer hover:text-brand-primary transition-colors group inline-flex items-center gap-1">
        {value || <span className="text-neutral-300 italic">{placeholder || "—"}</span>}
        <Pencil size={9} className="text-neutral-300 group-hover:text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    );
  }

  const save = () => { onSave(draft); setEditing(false); };

  if (type === "select" && options) {
    return (
      <select value={draft} onChange={e => { setDraft(e.target.value); onSave(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)} autoFocus
        className="px-1.5 py-0.5 text-[12px] border border-brand-primary/30 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30 bg-white"
        onClick={e => e.stopPropagation()}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={save} onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      onClick={e => e.stopPropagation()} autoFocus
      className="px-1.5 py-0.5 text-[12px] border border-brand-primary/30 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30 w-full max-w-[160px]" />
  );
}

const GRUPO_OPTIONS = ["DISTRIBUIDOR", "COOPERATIVA", "CANAL RD", "PLATAFORMA", "INDUSTRIA"];
const CLASS_OPTIONS = ["A", "B", "C", "D"];
const FATURAMENTO_OPTIONS = ["ATÉ 50 MILHÕES", "ATÉ 500 MILHÕES", "ACIMA 500 MILHÕES"];

// ─── Table Row ───────────────────────────────────────────────────────────────

function RetailerRow({ retailer: r, lang, expanded, onToggle, locations, onRetailerUpdate }: {
  retailer: Retailer; lang: Lang; expanded: boolean; onToggle: () => void; locations?: any[];
  onRetailerUpdate?: (cnpjRaiz: string, field: string, value: string) => void;
}) {
  const grupoColor = GRUPO_COLORS[r.grupo_acesso || ""] || "bg-neutral-100 text-neutral-600";
  const classColor = CLASSIFICACAO_COLORS[r.classificacao || ""] || "bg-neutral-100 text-neutral-600";
  const matrizCnpj = buildMatrizCnpj(r.cnpj_raiz);

  // Enrichment state
  const [enrichment, setEnrichment] = useState<CompanyEnrichment | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Research state
  const [research, setResearch] = useState<any[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  // Auto-load enrichment from cache + research when row expands
  useEffect(() => {
    if (!expanded) return;
    fetch(`/api/company-enrichment?cnpj_raiz=${r.cnpj_raiz}&cache_only=true`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && data.source !== "none") setEnrichment(data); });
    fetch(`/api/company-research?cnpj_basico=${r.cnpj_raiz}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.research) setResearch(data.research); });
  }, [expanded, r.cnpj_raiz]);

  const fetchEnrichment = async () => {
    if (enrichment) { setShowModal(true); return; }
    setEnrichLoading(true);
    setEnrichError(null);
    try {
      const res = await fetch(`/api/company-enrichment?cnpj_raiz=${r.cnpj_raiz}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao consultar");
      setEnrichment(data);
      setShowModal(true);
    } catch (err: any) {
      setEnrichError(err.message);
    } finally {
      setEnrichLoading(false);
    }
  };

  const triggerResearch = async () => {
    setResearchLoading(true);
    setResearchError(null);
    try {
      const res = await fetch("/api/company-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj_basico: r.cnpj_raiz, razao_social: r.razao_social, nome_fantasia: r.nome_fantasia }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na pesquisa");
      setResearch(prev => [data, ...prev]);
    } catch (err: any) {
      setResearchError(err.message);
    } finally {
      setResearchLoading(false);
    }
  };

  const updateField = async (field: string, value: string) => {
    await fetch("/api/retailers/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj_raiz: r.cnpj_raiz, updates: { [field]: value } }),
    });
    onRetailerUpdate?.(r.cnpj_raiz, field, value);
  };

  return (
    <>
      <tr onClick={onToggle} className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors cursor-pointer">
        <td className="px-4 py-3">
          <p className="font-semibold text-neutral-900 text-[13px] truncate">{r.nome_fantasia || r.consolidacao || r.razao_social}</p>
          <p className="text-[11px] text-neutral-500 truncate">{r.razao_social}</p>
          <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{formatCnpj(matrizCnpj)}</p>
        </td>
        <td className="px-4 py-3 hidden md:table-cell text-[11px]">
          <EditableCell value={r.grupo_acesso || ""} type="select" options={GRUPO_OPTIONS}
            onSave={v => updateField("grupo_acesso", v)} />
        </td>
        <td className="px-4 py-3 text-center hidden md:table-cell text-[11px]">
          <EditableCell value={r.classificacao || ""} type="select" options={CLASS_OPTIONS}
            onSave={v => updateField("classificacao", v)} />
        </td>
        <td className="px-4 py-3 text-[12px] text-neutral-600 hidden lg:table-cell">
          <EditableCell value={r.faixa_faturamento || ""} type="select" options={FATURAMENTO_OPTIONS}
            onSave={v => updateField("faixa_faturamento", v)} />
        </td>
        <td className="px-4 py-3 text-[12px] text-neutral-600 hidden xl:table-cell">{r.porte_name || "\u2014"}</td>
        <td className="px-4 py-3">{expanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}</td>
      </tr>

      {expanded && (
        <tr className="bg-neutral-50">
          <td colSpan={6} className="px-4 py-4">
            {/* ── Receita Federal data (locked) ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-[12px]">
              <div>
                <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1"><Lock size={8} className="text-neutral-400" />CNPJ (Matriz)</span>
                <p className="text-neutral-800 font-mono mt-0.5">{formatCnpj(matrizCnpj)}</p>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1"><Lock size={8} className="text-neutral-400" />Capital Social</span>
                <p className="text-neutral-800 mt-0.5">{r.capital_social ? `R$ ${r.capital_social.toLocaleString("pt-BR")}` : "\u2014"}</p>
              </div>
              {enrichment && (
                <>
                  <div>
                    <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1"><Lock size={8} className="text-neutral-400" />{lang === "pt" ? "Situação" : "Status"}</span>
                    <p className="mt-0.5">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${enrichment.situacao_cadastral === "Ativa" ? "text-success-dark bg-success-light" : "text-error bg-red-50"}`}>
                        {enrichment.situacao_cadastral === "Ativa" ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                        {enrichment.situacao_cadastral || "—"}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1"><Lock size={8} className="text-neutral-400" />CNAE</span>
                    <p className="text-neutral-800 mt-0.5 text-[11px]">{enrichment.cnae_fiscal_descricao || "—"}</p>
                  </div>
                </>
              )}
            </div>

            {/* ── AgriSafe editable fields ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 text-[12px]">
              <div>
                <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1"><Pencil size={8} className="text-brand-primary" />{lang === "pt" ? "Grupo" : "Group"}</span>
                <div className="mt-0.5"><EditableCell value={r.grupo_acesso || ""} type="select" options={GRUPO_OPTIONS} onSave={v => updateField("grupo_acesso", v)} /></div>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1"><Pencil size={8} className="text-brand-primary" />Class.</span>
                <div className="mt-0.5"><EditableCell value={r.classificacao || ""} type="select" options={CLASS_OPTIONS} onSave={v => updateField("classificacao", v)} /></div>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1"><Pencil size={8} className="text-brand-primary" />{lang === "pt" ? "Faturamento" : "Revenue"}</span>
                <div className="mt-0.5"><EditableCell value={r.faixa_faturamento || ""} type="select" options={FATURAMENTO_OPTIONS} onSave={v => updateField("faixa_faturamento", v)} /></div>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1"><Pencil size={8} className="text-brand-primary" />Loja Física</span>
                <div className="mt-0.5"><EditableCell value={r.possui_loja_fisica || ""} type="select" options={["SIM", "NAO"]} onSave={v => updateField("possui_loja_fisica", v)} /></div>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase text-[10px] flex items-center gap-1"><Pencil size={8} className="text-brand-primary" />{lang === "pt" ? "Indústria 1" : "Industry 1"}</span>
                <div className="mt-0.5"><EditableCell value={r.industria_1 || ""} onSave={v => updateField("industria_1", v)} placeholder="—" /></div>
              </div>
            </div>

            {/* ── Action buttons ── */}
            <div className="flex items-center gap-2 mb-4">
              <button onClick={(e) => { e.stopPropagation(); fetchEnrichment(); }} disabled={enrichLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-semibold transition-all border border-brand-primary/30 bg-brand-surface text-brand-primary hover:bg-brand-primary/10 disabled:opacity-50">
                {enrichLoading ? <Loader2 size={14} className="animate-spin" /> : <Briefcase size={14} />}
                {enrichLoading ? (lang === "pt" ? "Consultando..." : "Querying...") : (lang === "pt" ? "Dados Receita Federal" : "Federal Revenue Data")}
              </button>
              <button onClick={(e) => { e.stopPropagation(); triggerResearch(); }} disabled={researchLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-semibold transition-all border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                {researchLoading ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                {researchLoading ? (lang === "pt" ? "Pesquisando..." : "Searching...") : (lang === "pt" ? "Pesquisar na Web" : "Web Search")}
              </button>
              {enrichError && <p className="text-[11px] text-error">{enrichError}</p>}
              {researchError && <p className="text-[11px] text-error">{researchError}</p>}
            </div>

            {/* ── Research results ── */}
            {research.length > 0 && (
              <div className="mb-4 bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                  <h4 className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5"><Globe size={12} />{lang === "pt" ? "Inteligência Web" : "Web Intelligence"}</h4>
                  <span className="text-[9px] text-neutral-400">{new Date(research[0].searched_at).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="p-4">
                  {research[0].summary && <p className="text-[12px] text-neutral-700 leading-relaxed mb-3">{research[0].summary}</p>}
                  <div className="space-y-2">
                    {(research[0].findings || []).slice(0, 5).map((f: any, j: number) => (
                      <div key={j} className="pl-3 border-l-2 border-blue-100">
                        <p className="text-[12px] font-medium text-neutral-800">{f.title}</p>
                        {f.snippet && <p className="text-[11px] text-neutral-500 mt-0.5">{f.snippet}</p>}
                        {f.url && f.source !== "duckduckgo.com" && (
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">
                            {f.source || "link"} <ExternalLink size={9} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── AI Intelligence Panel ── */}
            <RetailerExpandedPanel
              cnpjRaiz={r.cnpj_raiz}
              entityUid={r.entity_uid}
              retailerName={r.nome_fantasia || r.consolidacao || r.razao_social}
              lang={lang}
            />

            {/* ── Phase 24G — Street View tile (matriz lat/lng) ── */}
            {(() => {
              const matriz = locations?.find((loc: any) => loc.cnpj?.replace(/\D/g, "")?.slice(8, 12) === "0001");
              if (!matriz || matriz.latitude == null || matriz.longitude == null) return null;
              return (
                <div className="my-4">
                  <StreetViewTile
                    latitude={Number(matriz.latitude)}
                    longitude={Number(matriz.longitude)}
                    label={`${matriz.municipio || ""}${matriz.uf ? "/" + matriz.uf : ""}`}
                    lang={lang}
                  />
                </div>
              );
            })()}

            {/* ── Phase 24G — CRM panel ── */}
            <div className="my-4">
              <EntityCrmPanel entityUid={r.entity_uid} lang={lang} />
            </div>

            {/* ── Locations ── */}
            {locations ? (
              locations.length > 0 ? (
                <div>
                  <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building2 size={12} />{locations.length} {lang === "pt" ? "Estabelecimentos" : "Establishments"}
                  </h4>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {locations.map((loc, i) => {
                      const isMatriz = loc.cnpj?.replace(/\D/g, "")?.slice(8, 12) === "0001";
                      return (
                        <div key={loc.cnpj || i} className={`text-[12px] bg-white rounded-md px-3 py-2.5 border ${isMatriz ? "border-brand-primary/20 bg-brand-surface/30" : "border-neutral-200"}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <MapPin size={12} className={isMatriz ? "text-brand-primary shrink-0" : "text-neutral-400 shrink-0"} />
                            {loc.nome_fantasia && <span className="font-semibold text-neutral-800">{loc.nome_fantasia}</span>}
                            <span className="text-[10px] font-mono text-neutral-400">{formatCnpj(loc.cnpj)}</span>
                            {isMatriz && <span className="text-[9px] font-bold text-brand-primary bg-brand-surface px-1.5 py-0.5 rounded">MATRIZ</span>}
                            {loc.situacao_cadastral && loc.situacao_cadastral !== "ATIVA" && (
                              <span className="text-[9px] font-bold text-error bg-red-50 px-1.5 py-0.5 rounded">{loc.situacao_cadastral}</span>
                            )}
                          </div>
                          <div className="ml-5 space-y-0.5">
                            <p className="text-neutral-600">{[loc.logradouro, loc.numero].filter(Boolean).join(", ")}{loc.complemento ? ` — ${loc.complemento}` : ""}</p>
                            <p className="text-neutral-500">{[loc.bairro, loc.municipio, loc.uf].filter(Boolean).join(" - ")}{loc.cep ? ` — CEP ${loc.cep}` : ""}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : <p className="text-[12px] text-neutral-400">{lang === "pt" ? "Nenhum estabelecimento" : "No establishments"}</p>
            ) : (
              <div className="flex items-center gap-2 text-[12px] text-neutral-400"><Loader2 size={14} className="animate-spin" />{lang === "pt" ? "Carregando..." : "Loading..."}</div>
            )}
          </td>
        </tr>
      )}

      {/* ── Full-screen Modal — Receita Federal Data ── */}
      {showModal && enrichment && typeof document !== "undefined" && createPortal(
        <CompanyModal enrichment={enrichment} retailer={r} locations={locations} lang={lang}
          onClose={() => setShowModal(false)} research={research} />,
        document.body,
      )}
    </>
  );
}

// ─── Company Detail Modal (Full RF data per CNPJ Metadados PDF) ─────────────

function CompanyModal({ enrichment: e, retailer: r, locations, lang, onClose, research }: {
  enrichment: CompanyEnrichment; retailer: Retailer; locations?: any[]; lang: Lang;
  onClose: () => void; research: any[];
}) {
  const isAtiva = e.situacao_cadastral === "Ativa" || e.situacao_cadastral === "ATIVA";
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-6 pb-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#F7F4EF] rounded-xl shadow-2xl w-full max-w-4xl mx-4 animate-in fade-in duration-200" onClick={ev => ev.stopPropagation()}>
        {/* Modal header */}
        <div className="px-6 py-5 bg-white border-b border-neutral-200 flex items-start justify-between rounded-t-xl sticky top-0 z-10 shadow-sm">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-[20px] font-bold text-neutral-900 truncate">{r.nome_fantasia || r.razao_social}</h2>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${isAtiva ? "text-success-dark bg-success-light" : "text-error bg-red-50"}`}>
                {isAtiva ? <CheckCircle2 size={11} /> : <XCircle size={11} />}{e.situacao_cadastral || "—"}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[12px] text-neutral-500">
              <span className="font-mono">{formatCnpj(buildMatrizCnpj(r.cnpj_raiz))}</span>
              <span>{e.razao_social || r.razao_social}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors ml-4"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* ── EMPRESAS card ── */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
              <h3 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider flex items-center gap-2">
                <Briefcase size={13} className="text-brand-primary" />{lang === "pt" ? "Dados da Empresa" : "Company Data"}
                <span className="text-[9px] font-normal text-neutral-400 normal-case tracking-normal ml-1">Receita Federal</span>
              </h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-[13px]">
                <div><span className="text-[10px] font-semibold text-neutral-400 uppercase block mb-0.5">Natureza Jurídica</span><p className="text-neutral-800">{e.natureza_juridica || "—"}</p></div>
                <div><span className="text-[10px] font-semibold text-neutral-400 uppercase block mb-0.5">Capital Social</span><p className="text-neutral-900 font-bold">{e.capital_social != null ? `R$ ${Number(e.capital_social).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</p></div>
                <div><span className="text-[10px] font-semibold text-neutral-400 uppercase block mb-0.5">Porte</span><p className="text-neutral-800">{e.porte || "—"}</p></div>
                <div><span className="text-[10px] font-semibold text-neutral-400 uppercase block mb-0.5">{lang === "pt" ? "Data Situação" : "Status Date"}</span><p className="text-neutral-800">{e.data_situacao_cadastral ? new Date(e.data_situacao_cadastral + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                <div><span className="text-[10px] font-semibold text-neutral-400 uppercase block mb-0.5">{lang === "pt" ? "Início Atividade" : "Activity Start"}</span><p className="text-neutral-800 flex items-center gap-1"><Calendar size={11} className="text-neutral-400" />{e.data_inicio_atividade ? new Date(e.data_inicio_atividade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                <div><span className="text-[10px] font-semibold text-neutral-400 uppercase block mb-0.5">CNAE Principal</span><p className="text-neutral-800 text-[12px]">{e.cnae_fiscal ? `${e.cnae_fiscal} — ${e.cnae_fiscal_descricao}` : "—"}</p></div>
              </div>
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-neutral-100">
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${e.opcao_simples ? "bg-success-light text-success-dark" : "bg-neutral-100 text-neutral-500"}`}>
                  Simples: {e.opcao_simples ? "Sim" : "Não"}
                </span>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${e.opcao_mei ? "bg-info-light text-info-dark" : "bg-neutral-100 text-neutral-500"}`}>
                  MEI: {e.opcao_mei ? "Sim" : "Não"}
                </span>
                {e.telefone && <span className="text-[12px] text-neutral-600 flex items-center gap-1 ml-auto"><Phone size={11} className="text-neutral-400" />{e.telefone}</span>}
                {e.email && <span className="text-[12px] text-neutral-600 flex items-center gap-1"><Mail size={11} className="text-neutral-400" /><span className="lowercase">{e.email}</span></span>}
              </div>
            </div>
          </div>

          {/* ── SÓCIOS card ── */}
          {e.qsa && e.qsa.length > 0 && (
            <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
                <h3 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider flex items-center gap-2">
                  <Users size={13} className="text-brand-primary" />{lang === "pt" ? "Quadro Societário" : "Shareholders"}
                  <span className="text-[10px] font-normal text-neutral-400">({e.qsa.length})</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[10px] font-semibold text-neutral-500 uppercase bg-neutral-50/50">
                      <th className="text-left px-4 py-2.5">{lang === "pt" ? "Nome / Razão Social" : "Name"}</th>
                      <th className="text-left px-4 py-2.5">{lang === "pt" ? "Qualificação" : "Role"}</th>
                      <th className="text-left px-4 py-2.5">{lang === "pt" ? "Data Entrada" : "Entry"}</th>
                      <th className="text-left px-4 py-2.5">CPF/CNPJ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.qsa.map((s, i) => (
                      <tr key={i} className="border-t border-neutral-100 hover:bg-neutral-50/50">
                        <td className="px-4 py-2.5 font-medium text-neutral-800">{s.nome_socio}</td>
                        <td className="px-4 py-2.5 text-neutral-600">{s.qualificacao_socio || "—"}</td>
                        <td className="px-4 py-2.5 text-neutral-500">{s.data_entrada_sociedade ? new Date(s.data_entrada_sociedade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="px-4 py-2.5 text-neutral-400 font-mono text-[11px]">{s.cnpj_cpf_do_socio || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ESTABELECIMENTOS card ── */}
          {locations && locations.length > 0 && (
            <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
                <h3 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider flex items-center gap-2">
                  <Building2 size={13} className="text-brand-primary" />{lang === "pt" ? "Estabelecimentos" : "Establishments"}
                  <span className="text-[10px] font-normal text-neutral-400">({locations.length})</span>
                </h3>
              </div>
              <div className="p-4 space-y-2">
                {locations.map((loc, i) => {
                  const isMatriz = loc.cnpj?.replace(/\D/g, "")?.slice(8, 12) === "0001";
                  return (
                    <div key={loc.cnpj || i} className={`rounded-lg border p-3 ${isMatriz ? "border-brand-primary/20 bg-brand-surface/20" : "border-neutral-100 bg-neutral-50/50"}`}>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[12px] font-mono font-semibold text-neutral-800">{formatCnpj(loc.cnpj)}</span>
                        {isMatriz && <span className="text-[9px] font-bold text-brand-primary bg-brand-surface px-1.5 py-0.5 rounded">MATRIZ</span>}
                        {!isMatriz && <span className="text-[9px] font-bold text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">FILIAL</span>}
                        {loc.nome_fantasia && <span className="text-[12px] font-medium text-neutral-700">— {loc.nome_fantasia}</span>}
                        {loc.situacao_cadastral && loc.situacao_cadastral !== "ATIVA" && (
                          <span className="text-[9px] font-bold text-error bg-red-50 px-1.5 py-0.5 rounded">{loc.situacao_cadastral}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-[12px] text-neutral-600 pl-1">
                        <p>{[loc.logradouro, loc.numero].filter(Boolean).join(", ")}{loc.complemento ? ` — ${loc.complemento}` : ""}</p>
                        <p>{[loc.bairro, loc.municipio, loc.uf].filter(Boolean).join(" - ")}{loc.cep ? ` — CEP ${loc.cep}` : ""}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── CNAEs Secundários card ── */}
          {e.cnaes_secundarios && e.cnaes_secundarios.length > 0 && (
            <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
                <h3 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                  {lang === "pt" ? "CNAEs Secundários" : "Secondary Activities"} <span className="text-[10px] font-normal text-neutral-400">({e.cnaes_secundarios.length})</span>
                </h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[12px]">
                {e.cnaes_secundarios.map((c, i) => (
                  <p key={i} className="text-neutral-600"><span className="font-mono text-neutral-400 text-[11px]">{c.codigo}</span> — {c.descricao}</p>
                ))}
              </div>
            </div>
          )}

          {/* ── Web Research card ── */}
          {research.length > 0 && (
            <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                <h3 className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-2">
                  <Globe size={13} className="text-blue-600" />{lang === "pt" ? "Inteligência Web" : "Web Intelligence"}
                </h3>
              </div>
              <div className="p-4">
                {research.map((res, i) => (
                  <div key={i} className="text-[12px] mb-3 last:mb-0">
                    {res.summary && <p className="text-neutral-700 leading-relaxed mb-2">{res.summary}</p>}
                    {res.findings?.map((f: any, j: number) => (
                      <div key={j} className="mt-1.5 pl-3 border-l-2 border-blue-100">
                        <p className="font-medium text-neutral-800">{f.title}</p>
                        <p className="text-neutral-500 text-[11px]">{f.snippet}</p>
                        {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">{f.source || f.url} <ExternalLink size={9} /></a>}
                      </div>
                    ))}
                    <p className="text-[9px] text-neutral-400 mt-2">{new Date(res.searched_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
