"use client";

import { useState, useEffect, useCallback } from "react";
import { Lang, t } from "@/lib/i18n";
import { Search, Leaf, FlaskConical, Map as MapIcon, Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";

interface ProductRow {
  id: string;
  brand: string;
  activeIngredient: string;
  class: string;
  crops: string;
  toxicity: string;
  holder: string;
}

type Tab = "chemicals" | "biologicals" | "soils";

export function AgInputIntelligence({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("chemicals");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (q: string, tab: Tab, pg: number) => {
    if (!q.trim() || tab === "soils") return;
    setLoading(true);
    setError("");

    const endpoint = tab === "biologicals" ? "/api/agroapi/bioinsumos" : "/api/agroapi/agrofit";
    try {
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&page=${pg}`);
      const json = await res.json();

      if (json.error) {
        setError(json.error);
        setResults([]);
        setTotal(0);
        setPages(0);
      } else {
        const join = (v: any) => Array.isArray(v) ? v.join(", ") : (v || "-");
        // Extract crop names from indicacao_uso array of objects
        const extractCrops = (uso: any) => {
          if (!Array.isArray(uso)) return "-";
          const crops = [...new Set(uso.map((u: any) => u.cultura).filter(Boolean))];
          return crops.length > 0 ? crops.slice(0, 5).join(", ") + (crops.length > 5 ? "…" : "") : "-";
        };
        const rows: ProductRow[] = (json.data || []).map((item: any, i: number) => ({
          id: item.numero_registro || String(i),
          brand: join(item.marca_comercial),
          activeIngredient: join(item.ingrediente_ativo),
          class: join(item.classe_categoria_agronomica),
          crops: extractCrops(item.indicacao_uso),
          toxicity: item.classificacao_toxicologica || "-",
          holder: item.titular_registro || "-",
        }));
        setResults(rows);
        setTotal(json.total || rows.length);
        setPages(json.pages || 1);
      }
      setSearched(true);
    } catch (e: any) {
      setError(e.message || "Erro de conexão");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-search on tab change if we have a query
  useEffect(() => {
    if (searchTerm.trim() && activeTab !== "soils") {
      setPage(1);
      doSearch(searchTerm, activeTab, 1);
    } else {
      setResults([]);
      setSearched(false);
      setTotal(0);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setPage(1);
    doSearch(searchTerm, activeTab, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    doSearch(searchTerm, activeTab, newPage);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-1">{tr.inputs.title}</h1>
          <p className="text-[14px] text-neutral-500">{tr.inputs.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-50 border border-green-200 text-[11px] font-semibold text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Embrapa AgroAPI
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200">
        <button
          onClick={() => setActiveTab("chemicals")}
          className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors ${
            activeTab === "chemicals"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <FlaskConical size={16} />
          {tr.inputs.activeIngredients}
        </button>
        <button
          onClick={() => setActiveTab("biologicals")}
          className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors ${
            activeTab === "biologicals"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Leaf size={16} />
          {tr.inputs.biologicals}
        </button>
        <button
          onClick={() => setActiveTab("soils")}
          className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors ${
            activeTab === "soils"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <MapIcon size={16} />
          {tr.inputs.soils}
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg shadow-sm">
        {/* Search bar */}
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row gap-3 justify-between items-center bg-neutral-50 rounded-t-lg">
          <div className="relative w-full sm:max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input
              type="text"
              placeholder={tr.inputs.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-9 pr-4 py-2 border border-neutral-300 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !searchTerm.trim() || activeTab === "soils"}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-md text-[13px] font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {lang === "pt" ? "Buscar" : "Search"}
          </button>
        </div>

        {/* Content */}
        {activeTab === "soils" ? (
          <div className="p-12 text-center text-neutral-500">
            <MapIcon size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-neutral-900 mb-1">
              {lang === "pt" ? "Classificação de Solos" : "Soil Classification"}
            </p>
            <p className="text-sm">
              {lang === "pt"
                ? "Integração com SmartSolos Expert (Embrapa) em desenvolvimento."
                : "SmartSolos Expert (Embrapa) integration in development."}
            </p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle size={32} className="mx-auto mb-3 text-red-400" />
            <p className="text-[13px] text-red-600 font-medium mb-1">{lang === "pt" ? "Erro na consulta" : "Query error"}</p>
            <p className="text-[12px] text-neutral-500">{error}</p>
          </div>
        ) : !searched ? (
          <div className="p-12 text-center text-neutral-400">
            <Search size={40} className="mx-auto mb-4 opacity-20" />
            <p className="text-[14px] font-medium text-neutral-600 mb-1">
              {activeTab === "chemicals"
                ? (lang === "pt" ? "Consultar Defensivos Registrados (MAPA)" : "Search Registered Pesticides (MAPA)")
                : (lang === "pt" ? "Consultar Bioinsumos Registrados (MAPA)" : "Search Registered Biological Inputs (MAPA)")}
            </p>
            <p className="text-[12px] text-neutral-400">
              {lang === "pt"
                ? "Pesquise por cultura, praga, ingrediente ativo ou marca comercial"
                : "Search by crop, pest, active ingredient or brand name"}
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="p-12 text-center text-neutral-400">
            <FlaskConical size={40} className="mx-auto mb-4 opacity-20" />
            <p className="text-[14px] font-medium text-neutral-600">
              {lang === "pt" ? "Nenhum resultado encontrado" : "No results found"}
            </p>
            <p className="text-[12px] text-neutral-400 mt-1">
              {lang === "pt" ? `Nenhum registro para "${searchTerm}"` : `No records for "${searchTerm}"`}
            </p>
          </div>
        ) : (
          <>
            {/* Results count */}
            <div className="px-5 py-2.5 bg-neutral-50/50 border-b border-neutral-100 flex items-center justify-between">
              <p className="text-[12px] text-neutral-500">
                {total.toLocaleString()} {lang === "pt" ? "registros encontrados" : "records found"}
                {pages > 1 && <span className="text-neutral-400"> &middot; {lang === "pt" ? "pág" : "p."} {page}/{pages}</span>}
              </p>
              <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 text-neutral-500 font-medium">
                {activeTab === "chemicals" ? "AGROFIT / MAPA" : "Bioinsumos / MAPA"}
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-left font-semibold uppercase tracking-wider text-[10px]">
                    <th className="px-5 py-3">{tr.inputs.brand}</th>
                    <th className="px-5 py-3">{tr.inputs.activeIngredients}</th>
                    <th className="px-5 py-3">{tr.inputs.class}</th>
                    <th className="px-5 py-3">{tr.inputs.culture}</th>
                    <th className="px-5 py-3 text-right">{lang === "pt" ? "Toxicidade" : "Toxicity"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {results.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-neutral-900">
                        {item.brand}
                        <p className="text-[10px] text-neutral-400 font-normal mt-0.5">{item.holder}</p>
                      </td>
                      <td className="px-5 py-3 text-neutral-600 max-w-[200px] truncate">{item.activeIngredient}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          item.class.toLowerCase().includes("biológico") || item.class.toLowerCase().includes("biologic") ? "bg-green-100 text-green-800" :
                          item.class.toLowerCase().includes("herbicida") ? "bg-amber-100 text-amber-800" :
                          item.class.toLowerCase().includes("fungicida") ? "bg-blue-100 text-blue-800" :
                          item.class.toLowerCase().includes("inseticida") ? "bg-purple-100 text-purple-800" :
                          "bg-neutral-100 text-neutral-700"
                        }`}>
                          {item.class}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-neutral-600 max-w-[180px] truncate">{item.crops}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-[11px] font-semibold ${
                          item.toxicity.includes("IV") || item.toxicity.includes("4") ? "text-green-600" :
                          item.toxicity.includes("III") || item.toxicity.includes("3") ? "text-amber-600" :
                          item.toxicity.includes("II") || item.toxicity.includes("2") ? "text-orange-600" :
                          item.toxicity.includes("I") || item.toxicity.includes("1") ? "text-red-600" :
                          "text-neutral-500"
                        }`}>
                          {item.toxicity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between bg-neutral-50">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || loading}
                  className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded border border-neutral-300 text-neutral-700 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                  {lang === "pt" ? "Anterior" : "Previous"}
                </button>
                <span className="text-[12px] text-neutral-500">
                  {page} / {pages}
                </span>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= pages || loading}
                  className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded border border-neutral-300 text-neutral-700 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {lang === "pt" ? "Próxima" : "Next"}
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
