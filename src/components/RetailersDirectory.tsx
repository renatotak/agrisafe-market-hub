"use client";

import { useEffect, useState, useCallback } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Store, Search, ChevronDown, ChevronUp, MapPin, Building2,
  Loader2, ChevronLeft, ChevronRight, Filter, X, Map as MapIcon, LayoutList,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { APIProvider, Map as GMap, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";

const PAGE_SIZE = 25;
const MAP_LIMIT = 500; // max markers on map

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
  const [activeMapMarker, setActiveMapMarker] = useState<string | null>(null);

  // KPI stats
  const [stats, setStats] = useState({ total: 0, distribuidores: 0, cooperativas: 0, estados: 0 });

  useEffect(() => { fetchRetailers(); fetchFilterOptions(); fetchStats(); }, []);
  useEffect(() => { setPage(0); }, [search, ufFilter, grupoFilter, classificacaoFilter]);
  useEffect(() => { fetchRetailers(); }, [page, search, ufFilter, grupoFilter, classificacaoFilter]);
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
    let query = supabase.from("retailers").select("*", { count: "exact" }).order("razao_social").range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase">{lang === "pt" ? "Total Canais" : "Total Channels"}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase">{lang === "pt" ? "Distribuidores" : "Distributors"}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{stats.distribuidores.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase">{lang === "pt" ? "Cooperativas" : "Cooperatives"}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{stats.cooperativas.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase">{lang === "pt" ? "Estados" : "States"}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{stats.estados}</p>
        </div>
      </div>

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
                    <th className="px-4 py-3 text-left">{lang === "pt" ? "Empresa" : "Company"}</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">{lang === "pt" ? "Grupo" : "Group"}</th>
                    <th className="px-4 py-3 text-center hidden md:table-cell">{lang === "pt" ? "Class." : "Class."}</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">{lang === "pt" ? "Faturamento" : "Revenue"}</th>
                    <th className="px-4 py-3 text-left hidden xl:table-cell">{lang === "pt" ? "Porte" : "Size"}</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {retailers.map((r) => (
                    <RetailerRow key={r.cnpj_raiz} retailer={r} lang={lang} expanded={expandedId === r.cnpj_raiz}
                      onToggle={() => toggleExpand(r.cnpj_raiz)} locations={locations[r.cnpj_raiz]} />
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
        <RetailersMap locations={mapLocations} loading={mapLoading} lang={lang}
          activeId={activeMapMarker} onMarkerClick={setActiveMapMarker} totalCount={totalCount}
          grupoColors={GRUPO_COLORS} />
      )}
    </div>
  );
}

// ─── Map View ────────────────────────────────────────────────────────────────

const GRUPO_MARKER_COLORS: Record<string, string> = {
  DISTRIBUIDOR: "#5B7A2F",
  COOPERATIVA: "#1565C0",
  "CANAL RD": "#E8722A",
  PLATAFORMA: "#9E9E9E",
};

function RetailersMap({ locations, loading, lang, activeId, onMarkerClick, totalCount, grupoColors }: {
  locations: any[]; loading: boolean; lang: Lang; activeId: string | null;
  onMarkerClick: (id: string | null) => void; totalCount: number;
  grupoColors: Record<string, string>;
}) {
  const MAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const active = locations.find((l) => String(l.id) === activeId);

  if (!MAP_KEY) {
    return (
      <div className="bg-neutral-100 rounded-lg border border-neutral-200 p-8 text-center text-neutral-500 text-sm">
        Google Maps API key not configured.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Map info bar */}
      <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px]">
          {Object.entries(GRUPO_MARKER_COLORS).map(([grupo, color]) => {
            const count = locations.filter((l) => l.razao_social?.includes("COOP") ? grupo === "COOPERATIVA" : true).length;
            return (
              <div key={grupo} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-neutral-600 font-medium">{grupo}</span>
              </div>
            );
          })}
        </div>
        <span className="text-[11px] text-neutral-400">
          {loading ? (lang === "pt" ? "Carregando..." : "Loading...") :
           `${locations.length}${locations.length >= MAP_LIMIT ? "+" : ""} ${lang === "pt" ? "pontos" : "points"}`}
          {totalCount > MAP_LIMIT && (
            <span className="ml-1 text-neutral-300">
              ({lang === "pt" ? "use filtros para refinar" : "use filters to refine"})
            </span>
          )}
        </span>
      </div>

      {/* Map */}
      <div className="relative" style={{ height: 550 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50 z-10">
            <Loader2 size={28} className="animate-spin text-brand-primary" />
          </div>
        )}
        <APIProvider apiKey={MAP_KEY}>
          <GMap
            defaultCenter={{ lat: -15.78, lng: -47.93 }}
            defaultZoom={4}
            mapId="retailers-map"
            disableDefaultUI
            zoomControl
          >
            {locations.map((loc) => {
              const markerColor = loc.razao_social?.includes("COOP") ? GRUPO_MARKER_COLORS["COOPERATIVA"] :
                                  GRUPO_MARKER_COLORS["DISTRIBUIDOR"];
              return (
                <AdvancedMarker
                  key={loc.id}
                  position={{ lat: loc.latitude, lng: loc.longitude }}
                  onClick={() => onMarkerClick(String(loc.id))}
                >
                  <div
                    className="w-3 h-3 rounded-full border border-white shadow-sm cursor-pointer hover:scale-150 transition-transform"
                    style={{ backgroundColor: markerColor }}
                  />
                </AdvancedMarker>
              );
            })}

            {active && (
              <InfoWindow
                position={{ lat: active.latitude, lng: active.longitude }}
                onCloseClick={() => onMarkerClick(null)}
                pixelOffset={[0, -5]}
              >
                <div className="p-1 max-w-[240px]">
                  <h4 className="font-bold text-neutral-900 text-[13px] leading-tight">
                    {active.nome_fantasia || active.razao_social}
                  </h4>
                  {active.nome_fantasia && (
                    <p className="text-[11px] text-neutral-500 mt-0.5">{active.razao_social}</p>
                  )}
                  <div className="mt-1.5 space-y-0.5 text-[11px] text-neutral-600">
                    <p className="flex items-center gap-1">
                      <MapPin size={10} className="text-neutral-400 shrink-0" />
                      {[active.logradouro, active.numero].filter(Boolean).join(", ")}
                    </p>
                    <p>{[active.bairro, active.municipio, active.uf].filter(Boolean).join(" - ")}</p>
                    {active.cep && <p>CEP: {active.cep}</p>}
                  </div>
                  {active.geo_precision && active.geo_precision !== "address" && active.geo_precision !== "original" && (
                    <p className="mt-1.5 text-[9px] text-amber-600 font-medium">
                      {lang === "pt" ? "Localização aproximada" : "Approximate location"} ({active.geo_precision})
                    </p>
                  )}
                </div>
              </InfoWindow>
            )}
          </GMap>
        </APIProvider>
      </div>
    </div>
  );
}

// ─── Table Row ───────────────────────────────────────────────────────────────

function RetailerRow({ retailer: r, lang, expanded, onToggle, locations }: {
  retailer: Retailer; lang: Lang; expanded: boolean; onToggle: () => void; locations?: any[];
}) {
  const grupoColor = GRUPO_COLORS[r.grupo_acesso || ""] || "bg-neutral-100 text-neutral-600";
  const classColor = CLASSIFICACAO_COLORS[r.classificacao || ""] || "bg-neutral-100 text-neutral-600";

  return (
    <>
      <tr onClick={onToggle} className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors cursor-pointer">
        <td className="px-4 py-3">
          <p className="font-semibold text-neutral-900 text-[13px] truncate">{r.nome_fantasia || r.consolidacao || r.razao_social}</p>
          <p className="text-[11px] text-neutral-500 truncate">{r.razao_social}</p>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${grupoColor}`}>{r.grupo_acesso || "\u2014"}</span>
        </td>
        <td className="px-4 py-3 text-center hidden md:table-cell">
          {r.classificacao && r.classificacao !== "0" && r.classificacao !== "ND" ? (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${classColor}`}>{r.classificacao}</span>
          ) : <span className="text-neutral-300">\u2014</span>}
        </td>
        <td className="px-4 py-3 text-[12px] text-neutral-600 hidden lg:table-cell">{r.faixa_faturamento || "\u2014"}</td>
        <td className="px-4 py-3 text-[12px] text-neutral-600 hidden xl:table-cell">{r.porte_name || "\u2014"}</td>
        <td className="px-4 py-3">{expanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}</td>
      </tr>

      {expanded && (
        <tr className="bg-neutral-50">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 text-[12px]">
              <div><span className="font-semibold text-neutral-500 uppercase text-[10px]">CNPJ Raiz</span><p className="text-neutral-800 font-mono mt-0.5">{r.cnpj_raiz}</p></div>
              <div><span className="font-semibold text-neutral-500 uppercase text-[10px]">Porte</span><p className="text-neutral-800 mt-0.5">{r.porte_name || "\u2014"}</p></div>
              <div><span className="font-semibold text-neutral-500 uppercase text-[10px]">Capital Social</span><p className="text-neutral-800 mt-0.5">{r.capital_social ? `R$ ${r.capital_social.toLocaleString("pt-BR")}` : "\u2014"}</p></div>
              <div><span className="font-semibold text-neutral-500 uppercase text-[10px]">Loja F\u00edsica</span><p className="text-neutral-800 mt-0.5">{r.possui_loja_fisica || "\u2014"}</p></div>
              <div><span className="font-semibold text-neutral-500 uppercase text-[10px]">{lang === "pt" ? "Ind\u00fastrias" : "Industries"}</span><p className="text-neutral-800 mt-0.5">{[r.industria_1, r.industria_2, r.industria_3].filter(v => v && v !== "ND").join(", ") || "\u2014"}</p></div>
            </div>

            {locations ? (
              locations.length > 0 ? (
                <div>
                  <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building2 size={12} />{locations.length} {lang === "pt" ? "Estabelecimentos" : "Establishments"}
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {locations.map((loc, i) => (
                      <div key={loc.cnpj || i} className="flex items-start gap-2 text-[12px] bg-white rounded-md px-3 py-2 border border-neutral-200">
                        <MapPin size={12} className="text-neutral-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          {loc.nome_fantasia && <p className="font-medium text-neutral-800">{loc.nome_fantasia}</p>}
                          <p className="text-neutral-600 truncate">{[loc.logradouro, loc.numero, loc.bairro].filter(Boolean).join(", ")}</p>
                          <p className="text-neutral-500">{[loc.municipio, loc.uf, loc.cep].filter(Boolean).join(" - ")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-[12px] text-neutral-400">{lang === "pt" ? "Nenhum estabelecimento" : "No establishments"}</p>
            ) : (
              <div className="flex items-center gap-2 text-[12px] text-neutral-400"><Loader2 size={14} className="animate-spin" />{lang === "pt" ? "Carregando..." : "Loading..."}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
