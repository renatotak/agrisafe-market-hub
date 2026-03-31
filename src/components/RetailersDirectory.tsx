"use client";

import { useEffect, useState, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Store,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  Building2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from "lucide-react";
import type { Retailer } from "@/data/retailers";

const PAGE_SIZE = 25;

const CLASSIFICACAO_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-amber-100 text-amber-800",
  D: "bg-slate-100 text-slate-700",
};

export function RetailersDirectory({ lang }: { lang: Lang }) {
  const tr = t(lang);
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

  // Fetch distinct UFs for filter dropdown
  const [ufs, setUfs] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);

  useEffect(() => {
    fetchRetailers();
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    setPage(0);
    fetchRetailers();
  }, [search, ufFilter, grupoFilter, classificacaoFilter]);

  useEffect(() => {
    fetchRetailers();
  }, [page]);

  const fetchFilterOptions = async () => {
    const [{ data: locData }, { data: grupoData }] = await Promise.all([
      supabase.from("retailer_locations").select("uf").not("uf", "is", null),
      supabase.from("retailers").select("grupo_acesso").not("grupo_acesso", "is", null),
    ]);
    if (locData) {
      const uniqueUfs = [...new Set(locData.map((r: any) => r.uf))].filter(Boolean).sort() as string[];
      setUfs(uniqueUfs);
    }
    if (grupoData) {
      const uniqueGrupos = [...new Set(grupoData.map((r: any) => r.grupo_acesso))].filter(Boolean).sort() as string[];
      setGrupos(uniqueGrupos);
    }
  };

  const fetchRetailers = async () => {
    setLoading(true);

    let query = supabase
      .from("retailers")
      .select("*", { count: "exact" })
      .order("razao_social")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search.trim()) {
      query = query.or(
        `razao_social.ilike.%${search.trim()}%,nome_fantasia.ilike.%${search.trim()}%,cnpj_raiz.ilike.%${search.trim()}%`
      );
    }
    if (grupoFilter) query = query.eq("grupo_acesso", grupoFilter);
    if (classificacaoFilter) query = query.eq("classificacao", classificacaoFilter);

    const { data, count, error } = await query;
    if (data) setRetailers(data);
    if (count != null) setTotalCount(count);
    setLoading(false);
  };

  const fetchLocations = async (cnpjRaiz: string) => {
    if (locations[cnpjRaiz]) return;
    const { data } = await supabase
      .from("retailer_locations")
      .select("*")
      .eq("cnpj_raiz", cnpjRaiz)
      .order("uf");
    if (data) setLocations((prev) => ({ ...prev, [cnpjRaiz]: data }));
  };

  const toggleExpand = (cnpjRaiz: string) => {
    if (expandedId === cnpjRaiz) {
      setExpandedId(null);
    } else {
      setExpandedId(cnpjRaiz);
      fetchLocations(cnpjRaiz);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasActiveFilters = ufFilter || grupoFilter || classificacaoFilter || search;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            {lang === "pt" ? "Diretório de Canais" : "Retailers Directory"}
          </h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">
            {lang === "pt"
              ? `${totalCount.toLocaleString("pt-BR")} distribuidores e revendas mapeados`
              : `${totalCount.toLocaleString("en-US")} distributors and retailers mapped`}
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-4 md:p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "pt" ? "Buscar por nome, razão social ou CNPJ..." : "Search by name, company name or CNPJ..."}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              hasActiveFilters
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Filter size={16} />
            {lang === "pt" ? "Filtros" : "Filters"}
            {hasActiveFilters && (
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center">
                {[ufFilter, grupoFilter, classificacaoFilter].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                {lang === "pt" ? "Grupo de Acesso" : "Access Group"}
              </label>
              <select
                value={grupoFilter}
                onChange={(e) => setGrupoFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">{lang === "pt" ? "Todos" : "All"}</option>
                {grupos.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                {lang === "pt" ? "Classificação" : "Classification"}
              </label>
              <select
                value={classificacaoFilter}
                onChange={(e) => setClassificacaoFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">{lang === "pt" ? "Todas" : "All"}</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                {lang === "pt" ? "Faixa de Faturamento" : "Revenue Range"}
              </label>
              <select
                value={ufFilter}
                onChange={(e) => setUfFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">{lang === "pt" ? "Todas" : "All"}</option>
              </select>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => { setUfFilter(""); setGrupoFilter(""); setClassificacaoFilter(""); setSearch(""); }}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium mt-1"
              >
                <X size={14} />
                {lang === "pt" ? "Limpar filtros" : "Clear filters"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-emerald-500" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-4 md:px-6 py-4 text-left">{lang === "pt" ? "Empresa" : "Company"}</th>
                  <th className="px-4 md:px-6 py-4 text-left hidden md:table-cell">{lang === "pt" ? "Grupo" : "Group"}</th>
                  <th className="px-4 md:px-6 py-4 text-center hidden md:table-cell">{lang === "pt" ? "Class." : "Class."}</th>
                  <th className="px-4 md:px-6 py-4 text-left hidden lg:table-cell">{lang === "pt" ? "Faturamento" : "Revenue"}</th>
                  <th className="px-4 md:px-6 py-4 text-left hidden lg:table-cell">{lang === "pt" ? "Indústria" : "Industry"}</th>
                  <th className="px-4 md:px-6 py-4 text-center w-10"></th>
                </tr>
              </thead>
              <tbody>
                {retailers.map((r) => (
                  <RetailerRow
                    key={r.cnpj_raiz}
                    retailer={r}
                    lang={lang}
                    expanded={expandedId === r.cnpj_raiz}
                    onToggle={() => toggleExpand(r.cnpj_raiz)}
                    locations={locations[r.cnpj_raiz]}
                  />
                ))}
                {retailers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      {lang === "pt" ? "Nenhum resultado encontrado" : "No results found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 md:px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                {lang === "pt"
                  ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} de ${totalCount.toLocaleString("pt-BR")}`
                  : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString("en-US")}`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-medium text-slate-600 min-w-[60px] text-center">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RetailerRow({
  retailer,
  lang,
  expanded,
  onToggle,
  locations,
}: {
  retailer: Retailer;
  lang: Lang;
  expanded: boolean;
  onToggle: () => void;
  locations?: any[];
}) {
  const r = retailer;
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-gray-50 hover:bg-slate-50/50 transition-colors cursor-pointer last:border-0"
      >
        <td className="px-4 md:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
              <Store size={16} className="text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{r.nome_fantasia || r.consolidacao || r.razao_social}</p>
              <p className="text-xs text-slate-400 truncate">{r.razao_social}</p>
            </div>
          </div>
        </td>
        <td className="px-4 md:px-6 py-4 hidden md:table-cell">
          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md">
            {r.grupo_acesso || "—"}
          </span>
        </td>
        <td className="px-4 md:px-6 py-4 text-center hidden md:table-cell">
          {r.classificacao ? (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${CLASSIFICACAO_COLORS[r.classificacao] || "bg-slate-100 text-slate-600"}`}>
              {r.classificacao}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-4 md:px-6 py-4 text-xs text-slate-600 hidden lg:table-cell whitespace-nowrap">
          {r.faixa_faturamento || "—"}
        </td>
        <td className="px-4 md:px-6 py-4 text-xs text-slate-600 hidden lg:table-cell">
          {[r.industria_1, r.industria_2, r.industria_3].filter(Boolean).join(", ") || "—"}
        </td>
        <td className="px-4 md:px-6 py-4 text-center">
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-50/80">
          <td colSpan={6} className="px-4 md:px-8 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider">CNPJ Raiz</span>
                <p className="text-slate-800 font-mono mt-0.5">{r.cnpj_raiz}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider">Porte</span>
                <p className="text-slate-800 mt-0.5">{r.porte_name || r.porte || "—"}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider">Capital Social</span>
                <p className="text-slate-800 mt-0.5">
                  {r.capital_social
                    ? `R$ ${r.capital_social.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2 })}`
                    : "—"}
                </p>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider">
                  {lang === "pt" ? "Loja Física" : "Physical Store"}
                </span>
                <p className="text-slate-800 mt-0.5">{r.possui_loja_fisica || "—"}</p>
              </div>
            </div>

            {/* Locations */}
            {locations ? (
              locations.length > 0 ? (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building2 size={14} />
                    {lang === "pt" ? `${locations.length} Estabelecimentos` : `${locations.length} Establishments`}
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {locations.map((loc, i) => (
                      <div key={loc.cnpj || i} className="flex items-start gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-slate-100">
                        <MapPin size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          {loc.nome_fantasia && (
                            <p className="font-medium text-slate-800">{loc.nome_fantasia}</p>
                          )}
                          <p className="text-slate-600 truncate">
                            {[loc.logradouro, loc.numero, loc.bairro].filter(Boolean).join(", ")}
                          </p>
                          <p className="text-slate-500">
                            {[loc.municipio, loc.uf, loc.cep].filter(Boolean).join(" - ")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">{lang === "pt" ? "Nenhum estabelecimento cadastrado" : "No establishments registered"}</p>
              )
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                {lang === "pt" ? "Carregando..." : "Loading..."}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
