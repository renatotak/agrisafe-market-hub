"use client";

import { useState, useEffect, useCallback } from "react";
import { Lang, t } from "@/lib/i18n";
import {
  Search, Leaf, FlaskConical, Map as MapIcon, Loader2, AlertCircle,
  ChevronLeft, ChevronRight, BookMarked, ExternalLink,
  Link, GitBranch, ChevronDown, ChevronUp, Info, Layers,
  Sparkles, Zap, TrendingDown,
} from "lucide-react";

interface ProductRow {
  id: string;
  brand: string;
  activeIngredient: string;
  class: string;
  crops: string;
  toxicity: string;
  holder: string;
}

type Tab = "oracle" | "chemicals" | "biologicals" | "soils" | "glossary";

// Phase 20 — Oracle types
interface OracleBrand {
  product_id: number;
  product_name: string;
  manufacturer_display: string | null;
  manufacturer_country: string | null;
  formulation: string | null;
  toxicity_class: string | null;
  environmental_class: string | null;
  url_agrofit: string | null;
}

interface OracleMolecule {
  ingredient_id: string;
  ingredient_name: string;
  ingredient_display: string | null;
  category: string | null;
  holder_count: number;
  brand_count: number;
  competitiveness: "patented" | "limited" | "generic" | "commodity";
  brands: OracleBrand[];
}

const ORACLE_CULTURES = [
  { slug: "soja", label_pt: "Soja", label_en: "Soybean" },
  { slug: "milho", label_pt: "Milho", label_en: "Corn" },
  { slug: "algodao", label_pt: "Algodão", label_en: "Cotton" },
  { slug: "cafe", label_pt: "Café", label_en: "Coffee" },
  { slug: "cana", label_pt: "Cana", label_en: "Sugar Cane" },
  { slug: "trigo", label_pt: "Trigo", label_en: "Wheat" },
  { slug: "feijao", label_pt: "Feijão", label_en: "Beans" },
  { slug: "arroz", label_pt: "Arroz", label_en: "Rice" },
];

export function AgInputIntelligence({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("oracle");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [glossaryResults, setGlossaryResults] = useState<any[]>([]);
  const [glossaryLoading, setGlossaryLoading] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [termDetails, setTermDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  // Phase 20 — Oracle state
  const [oracleCulture, setOracleCulture] = useState<string>("soja");
  const [oraclePest, setOraclePest] = useState<string>("");
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleMolecules, setOracleMolecules] = useState<OracleMolecule[]>([]);
  const [oracleError, setOracleError] = useState<string | null>(null);
  const [oracleSearched, setOracleSearched] = useState(false);
  const [expandedMolecule, setExpandedMolecule] = useState<string | null>(null);

  const handleOracleSearch = async () => {
    if (!oracleCulture) return;
    setOracleLoading(true);
    setOracleError(null);
    setExpandedMolecule(null);
    try {
      const params = new URLSearchParams({ culture: oracleCulture, limit: "30" });
      if (oraclePest.trim()) params.set("pest", oraclePest.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      const res = await fetch(`/api/inputs/oracle?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setOracleMolecules(json.molecules || []);
      } else {
        setOracleError(json.error || "Failed to query Oracle");
        setOracleMolecules([]);
      }
    } catch (e: any) {
      setOracleError(e.message || "Network error");
      setOracleMolecules([]);
    } finally {
      setOracleLoading(false);
      setOracleSearched(true);
    }
  };

  const handleGlossarySearch = async () => {
    if (!glossaryQuery || glossaryQuery.length < 2) return;
    setGlossaryLoading(true);
    setSelectedTermId(null);
    setTermDetails(null);
    try {
      const res = await fetch(`/api/agroapi/termos?q=${encodeURIComponent(glossaryQuery)}`);
      const json = await res.json();
      const results = Array.isArray(json.dados) ? json.dados : [];
      setGlossaryResults(results);
    } catch {
      setGlossaryResults([]);
    } finally {
      setGlossaryLoading(false);
    }
  };

  const handleTermClick = async (term: any) => {
    const id = term.id || (term.uri?.includes("resources/") ? term.uri.split("/").pop() : null);
    if (!id) return;
    if (selectedTermId === id) {
      setSelectedTermId(null);
      setTermDetails(null);
      return;
    }
    setSelectedTermId(id);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/agroapi/termos?q=${encodeURIComponent(id)}&mode=relations`);
      const json = await res.json();
      const details = json.dados && Array.isArray(json.dados) ? (json.dados[0] || json) : json;
      setTermDetails(details);
    } catch (err) {
      console.error("Error fetching term details:", err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const doSearch = useCallback(async (q: string, tab: Tab, pg: number) => {
    if (!q.trim() || tab === "soils" || tab === "glossary") return;
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

  const [soilResults, setSoilResults] = useState<any[]>([]);

  const doSoilSearch = useCallback(async (q: string, pg: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/agroapi/smartsolos?q=${encodeURIComponent(q)}&page=${pg}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setSoilResults([]);
      } else {
        setSoilResults(json.data || []);
        setTotal(json.total || (json.data?.length || 0));
        setPages(json.pages || 1);
      }
      setSearched(true);
    } catch (e: any) {
      setError(e.message || "Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-search on tab change if we have a query
  useEffect(() => {
    if (activeTab === "glossary") return;
    if (searchTerm.trim()) {
      setPage(1);
      if (activeTab === "soils") {
        doSoilSearch(searchTerm, 1);
      } else {
        doSearch(searchTerm, activeTab, 1);
      }
    } else {
      setResults([]);
      setSoilResults([]);
      setSearched(false);
      setTotal(0);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setPage(1);
    if (activeTab === "soils") {
      doSoilSearch(searchTerm, 1);
    } else {
      doSearch(searchTerm, activeTab, 1);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    if (activeTab === "soils") {
      doSoilSearch(searchTerm, newPage);
    } else {
      doSearch(searchTerm, activeTab, newPage);
    }
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
      <div className="flex items-center gap-2 border-b border-neutral-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab("oracle")}
          className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "oracle"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Sparkles size={16} />
          {tr.inputs.oracleTab}
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary">v0</span>
        </button>
        <button
          onClick={() => setActiveTab("chemicals")}
          className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
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
        <button
          onClick={() => setActiveTab("glossary")}
          className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors ${
            activeTab === "glossary"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <BookMarked size={16} />
          {lang === "pt" ? "Glossário Agro" : "Agro Glossary"}
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700">Embrapa</span>
        </button>
      </div>

      {activeTab === "oracle" ? (
        <div className="space-y-4">
          {/* Oracle search panel */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-brand-primary" />
              <h3 className="text-[16px] font-bold text-neutral-900">{tr.inputs.oracleTitle}</h3>
            </div>
            <p className="text-[12px] text-neutral-500 mb-4">{tr.inputs.oracleSubtitle}</p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                  {tr.inputs.oracleCultureLabel}
                </label>
                <select
                  value={oracleCulture}
                  onChange={(e) => setOracleCulture(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                >
                  {ORACLE_CULTURES.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {lang === "pt" ? c.label_pt : c.label_en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-5">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                  {tr.inputs.oraclePestLabel}
                </label>
                <input
                  type="text"
                  value={oraclePest}
                  onChange={(e) => setOraclePest(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleOracleSearch()}
                  placeholder={lang === "pt" ? "ex: ferrugem asiática, lagarta" : "e.g. asian rust, caterpillar"}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  onClick={handleOracleSearch}
                  disabled={oracleLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-md text-[13px] font-bold hover:bg-brand-dark transition-colors disabled:opacity-50"
                >
                  {oracleLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {tr.inputs.oracleSearch}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-neutral-400 italic mt-3 flex items-start gap-1.5">
              <Info size={10} className="mt-0.5 flex-shrink-0" />
              {tr.inputs.oracleHint}
            </p>
          </div>

          {/* Oracle results */}
          {oracleError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-[13px] text-red-700">
              <strong>{lang === "pt" ? "Erro:" : "Error:"}</strong> {oracleError}
            </div>
          )}

          {oracleSearched && !oracleError && oracleMolecules.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-[13px] text-amber-800">
              {tr.inputs.oracleNoResults}
            </div>
          )}

          {!oracleSearched && (
            <div className="bg-neutral-50 border border-dashed border-neutral-200 rounded-lg p-12 text-center">
              <Sparkles size={36} className="mx-auto mb-3 text-neutral-300" />
              <p className="text-[13px] text-neutral-500">{tr.inputs.oracleEmpty}</p>
            </div>
          )}

          {oracleMolecules.length > 0 && (
            <>
              {/* Summary strip */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-neutral-400 uppercase">{tr.inputs.oracleMolecules}</p>
                  <p className="text-[20px] font-bold text-neutral-900 leading-tight">{oracleMolecules.length}</p>
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-neutral-400 uppercase">{tr.inputs.oracleBrands}</p>
                  <p className="text-[20px] font-bold text-neutral-900 leading-tight">
                    {oracleMolecules.reduce((acc, m) => acc + m.brands.length, 0)}
                  </p>
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-neutral-400 uppercase">{tr.inputs.oracleHolders}</p>
                  <p className="text-[20px] font-bold text-neutral-900 leading-tight">
                    {Math.max(...oracleMolecules.map((m) => m.holder_count))}
                  </p>
                </div>
              </div>

              {/* Molecules list */}
              <div className="space-y-2">
                {oracleMolecules.map((m) => {
                  const isExpanded = expandedMolecule === m.ingredient_id;
                  const competitivenessLabel =
                    m.competitiveness === "patented" ? tr.inputs.oracleCompetitivenessPatented :
                    m.competitiveness === "limited" ? tr.inputs.oracleCompetitivenessLimited :
                    m.competitiveness === "generic" ? tr.inputs.oracleCompetitivenessGeneric :
                    tr.inputs.oracleCompetitivenessCommodity;
                  const competitivenessClass =
                    m.competitiveness === "patented" ? "bg-red-50 text-red-700 border-red-200" :
                    m.competitiveness === "limited" ? "bg-amber-50 text-amber-700 border-amber-200" :
                    m.competitiveness === "generic" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    "bg-blue-50 text-blue-700 border-blue-200";

                  return (
                    <div key={m.ingredient_id} className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedMolecule(isExpanded ? null : m.ingredient_id)}
                        className="w-full p-4 flex items-center gap-4 hover:bg-neutral-50/50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-[14px] font-bold text-neutral-900">
                              {m.ingredient_display || m.ingredient_name}
                            </h4>
                            {m.category && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase">
                                {m.category}
                              </span>
                            )}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${competitivenessClass}`}>
                              {m.competitiveness === "commodity" || m.competitiveness === "generic" ? (
                                <TrendingDown size={9} className="inline mr-0.5" />
                              ) : null}
                              {competitivenessLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                            <span><strong className="text-neutral-700">{m.holder_count}</strong> {tr.inputs.oracleHolders}</span>
                            <span><strong className="text-neutral-700">{m.brands.length}</strong> {tr.inputs.oracleBrands}</span>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-neutral-100 bg-neutral-50/30">
                          <table className="w-full text-[12px]">
                            <thead className="text-[9px] uppercase font-bold text-neutral-500">
                              <tr>
                                <th className="text-left px-4 py-2">{tr.inputs.brand}</th>
                                <th className="text-left px-4 py-2">{tr.inputs.oracleManufacturer}</th>
                                <th className="text-left px-4 py-2">{tr.inputs.oracleFormulation}</th>
                                <th className="text-left px-4 py-2">{tr.inputs.oracleToxicity}</th>
                                <th className="px-4 py-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.brands.map((b) => (
                                <tr key={b.product_id} className="border-t border-neutral-100">
                                  <td className="px-4 py-2 font-bold text-neutral-900">{b.product_name}</td>
                                  <td className="px-4 py-2 text-neutral-600">{b.manufacturer_display || "—"}</td>
                                  <td className="px-4 py-2 text-neutral-500">{b.formulation || "—"}</td>
                                  <td className="px-4 py-2 text-neutral-500">{b.toxicity_class || "—"}</td>
                                  <td className="px-4 py-2 text-right">
                                    {b.url_agrofit && (
                                      <a
                                        href={b.url_agrofit}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-brand-primary font-bold hover:underline inline-flex items-center gap-1"
                                      >
                                        {tr.inputs.oracleViewOnAgrofit} <ExternalLink size={9} />
                                      </a>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : activeTab === "glossary" ? (
        <div className="space-y-4">
          {/* Glossary Search */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <BookMarked size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={glossaryQuery}
                  onChange={(e) => setGlossaryQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGlossarySearch()}
                  placeholder={lang === "pt" ? "Buscar termo agro: soja, crédito rural, CPR, defensivo..." : "Search agro term: soybean, rural credit, CPR, pesticide..."}
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                />
              </div>
              <button onClick={handleGlossarySearch} disabled={glossaryLoading || glossaryQuery.length < 2}
                className="px-5 py-2.5 bg-brand-primary text-white rounded-md hover:bg-brand-dark font-medium text-[14px] transition-colors disabled:opacity-50">
                {glossaryLoading ? <Loader2 size={16} className="animate-spin" /> : (lang === "pt" ? "Buscar" : "Search")}
              </button>
            </div>
            <p className="text-[10px] text-neutral-400 mt-2">
              {lang === "pt"
                ? "Vocabulário controlado da Embrapa (AgroTermos) — definições, sinônimos e contextos de uso para termos agropecuários."
                : "Embrapa controlled vocabulary (AgroTermos) — definitions, synonyms and usage contexts for agricultural terms."}
            </p>
          </div>

          {/* Glossary Results */}
          {glossaryResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                {glossaryResults.length} {lang === "pt" ? "termos encontrados" : "terms found"}
              </p>
              {glossaryResults.map((term: any) => {
                const termId = term.id || (term.uri?.includes("resources/") ? term.uri.split("/").pop() : null);
                const isSelected = selectedTermId === termId;

                return (
                  <div key={termId || term.uri} className={`bg-white rounded-lg border transition-all ${isSelected ? "border-brand-primary ring-1 ring-brand-primary/10" : "border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0" onClick={() => handleTermClick(term)} role="button">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                              {term.tesauroorigem || "AgroTermos"}
                            </span>
                            {term.dataregistro && (
                              <span className="text-[10px] text-neutral-400">{term.dataregistro}</span>
                            )}
                          </div>
                          <h4 className="font-semibold text-neutral-900 text-[14px] leading-snug">{term.label}</h4>
                          {term.definicao && term.definicao !== term.label && (
                            <p className="text-[13px] text-neutral-600 mt-1">{term.definicao}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleTermClick(term)}
                          className={`p-2 rounded-md transition-colors ${isSelected ? "bg-brand-surface text-brand-primary" : "text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600"}`}
                        >
                          {isSelected ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>

                      {/* Detailed View */}
                      {isSelected && (
                        <div className="mt-4 pt-4 border-t border-neutral-100 animate-in fade-in slide-in-from-top-2 duration-200">
                          {detailsLoading ? (
                            <div className="flex items-center justify-center py-6 gap-2 text-neutral-400">
                              <Loader2 size={16} className="animate-spin" />
                              <span className="text-[12px] font-medium">Extraindo registros completos do AgroTermos...</span>
                            </div>
                          ) : (
                            <div className="space-y-6">
                              {/* Metadata Header */}
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                                <div className="grid grid-cols-2 md:flex md:items-center gap-x-6 gap-y-2">
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">ID Embrapa</span>
                                    <span className="text-[12px] font-mono text-neutral-600">{selectedTermId}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Data Registro</span>
                                    <span className="text-[12px] text-neutral-600">{termDetails?.dataregistro || term.dataregistro || "N/A"}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Deep Link</span>
                                    <a
                                      href={`https://sistemas.sede.embrapa.br/agrotermos/#${selectedTermId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-brand-primary font-bold hover:underline flex items-center gap-1"
                                    >
                                      Portal AgroTermos <ExternalLink size={10} />
                                    </a>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-surface text-brand-primary border border-brand-primary/10">
                                    {termDetails?.tesauroorigem || term.tesauroorigem}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Synonyms */}
                                <div className="space-y-3">
                                  <h5 className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5 p-1 border-l-2 border-brand-primary">
                                    <Link size={12} className="text-brand-primary" />
                                    Sinônimos & Equivalências
                                  </h5>
                                  <div className="flex flex-wrap gap-1.5">
                                    {(termDetails?.altLabel || termDetails?.label !== term.label) ? (
                                      <span className="px-2 py-1 bg-white border border-neutral-200 text-neutral-700 rounded text-[12px] shadow-sm">
                                        {termDetails?.altLabel || termDetails?.label}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-neutral-400 italic">Nenhum sinônimo mapeado para este contexto</span>
                                    )}
                                  </div>
                                </div>

                                {/* Hierarchy */}
                                <div className="space-y-3">
                                  <h5 className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5 p-1 border-l-2 border-brand-primary">
                                    <GitBranch size={12} className="text-brand-primary" />
                                    Contexto Hierárquico
                                  </h5>
                                  <div className="p-2.5 bg-white border border-neutral-100 rounded text-[12px] text-neutral-700">
                                    {termDetails?.definicao ? (
                                      <p className="leading-relaxed">{termDetails.definicao}</p>
                                    ) : (
                                      <p className="text-neutral-400 italic">Definição conceitual não disponível</p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Relationships Table */}
                              <div className="space-y-3">
                                <h5 className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5 p-1 border-l-2 border-brand-primary">
                                  <Layers size={12} className="text-brand-primary" />
                                  Registro Completo (Relações Semânticas)
                                </h5>
                                <div className="overflow-hidden border border-neutral-200 rounded-lg shadow-sm">
                                  <table className="w-full text-left border-collapse bg-white">
                                    <thead>
                                      <tr className="bg-neutral-50 border-b border-neutral-200">
                                        <th className="px-4 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Conceito Origem</th>
                                        <th className="px-4 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider text-center">Relação</th>
                                        <th className="px-4 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Conceito Destino</th>
                                        <th className="px-4 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Tesauro</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                      {termDetails?.relacoes && termDetails.relacoes.length > 0 ? (
                                        termDetails.relacoes.map((rel: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-neutral-50/50 transition-colors">
                                            <td className="px-4 py-2.5 text-[12px] font-medium text-neutral-900">{rel.conceito_origem || term.label}</td>
                                            <td className="px-4 py-2.5 text-[11px] text-center">
                                              <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 font-mono italic">
                                                {rel.relacao || "related"}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-[12px] text-neutral-700">{rel.conceito_destino}</td>
                                            <td className="px-4 py-2.5 text-[11px] text-neutral-400 font-semibold">{rel.tesauro || "AgroVOC"}</td>
                                          </tr>
                                        ))
                                      ) : (
                                        <tr>
                                          <td colSpan={4} className="px-4 py-8 text-center text-neutral-400 italic text-[12px]">
                                            Buscando relações granulares no repositório SKOS...
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Standards Watermark */}
                              <div className="bg-brand-surface/30 rounded-md p-3 border border-brand-primary/10 flex items-start gap-2">
                                <Info size={14} className="text-brand-primary mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-[11px] text-brand-primary font-bold mb-0.5">Procedência Tecnológica</p>
                                  <p className="text-[11px] text-neutral-600 leading-relaxed">
                                    Dados sincronizados via Embrapa AgroAPI. O mapeamento SKOS (Simple Knowledge Organization System)
                                    garante a interoperabilidade com bases globais como Agrovoc (FAO) e NAL (USDA).
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="bg-white border border-neutral-200 rounded-lg shadow-sm">
        {/* Search bar */}
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row gap-3 justify-between items-center bg-neutral-50 rounded-t-lg">
          <div className="relative w-full sm:max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input
              type="text"
              placeholder={activeTab === "soils" ? (lang === "pt" ? "Buscar por perfil, cidade ou UF..." : "Search by profile, city or state...") : tr.inputs.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-9 pr-4 py-2 border border-neutral-300 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !searchTerm.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-md text-[13px] font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {lang === "pt" ? "Buscar" : "Search"}
          </button>
        </div>

        {/* Content */}
        {error ? (
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
                : activeTab === "biologicals"
                ? (lang === "pt" ? "Consultar Bioinsumos Registrados (MAPA)" : "Search Registered Biological Inputs (MAPA)")
                : (lang === "pt" ? "Consultar Perfis de Solo (Embrapa)" : "Search Soil Profiles (Embrapa)")}
            </p>
            <p className="text-[12px] text-neutral-400">
              {activeTab === "soils"
                ? (lang === "pt" ? "Pesquise perfis existentes por nome, cidade ou classificação SiBCS" : "Search existing profiles by name, city or SiBCS classification")
                : (lang === "pt" ? "Pesquise por cultura, praga, ingrediente ativo ou marca comercial" : "Search by crop, pest, active ingredient or brand name")}
            </p>
          </div>
        ) : (activeTab === "soils" ? soilResults.length === 0 : results.length === 0) ? (
          <div className="p-12 text-center text-neutral-400">
            <FlaskConical size={40} className="mx-auto mb-4 opacity-20" />
            <p className="text-[14px] font-medium text-neutral-600">
              {lang === "pt" ? "Nenhum resultado encontrado" : "No results found"}
            </p>
            <p className="text-[12px] text-neutral-400 mt-1">
              {lang === "pt" ? `Nenhum registro para "${searchTerm}"` : `No records for "${searchTerm}"`}
            </p>
          </div>
        ) : activeTab === "soils" ? (
          <>
            {/* Soil Results Table */}
            <div className="px-5 py-2.5 bg-neutral-50/50 border-b border-neutral-100 flex items-center justify-between">
              <p className="text-[12px] text-neutral-500">
                {total.toLocaleString()} {lang === "pt" ? "perfis encontrados" : "profiles found"}
              </p>
              <span className="text-[10px] px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary font-medium uppercase tracking-wider">
                SmartSolos Expert
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-left font-semibold uppercase tracking-wider text-[10px]">
                    <th className="px-5 py-3">{lang === "pt" ? "Nome do Perfil" : "Profile Name"}</th>
                    <th className="px-5 py-3">{lang === "pt" ? "Localização" : "Location"}</th>
                    <th className="px-5 py-3">{lang === "pt" ? "Classificação SiBCS" : "SiBCS Classification"}</th>
                    <th className="px-5 py-3 text-right">{lang === "pt" ? "Horizontes" : "Horizons"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {soilResults.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-neutral-900">{item.nome || `ID: ${item.id}`}</td>
                      <td className="px-5 py-3 text-neutral-600">{[item.municipio, item.uf].filter(Boolean).join(", ") || "-"}</td>
                      <td className="px-5 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-primary/10 text-brand-primary">
                          {item.classificacao_sibcs || "N/A"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-neutral-500">{item.horizontes?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* Product Results */}
            <div className="px-5 py-2.5 bg-neutral-50/50 border-b border-neutral-100 flex items-center justify-between">
              <p className="text-[12px] text-neutral-500">
                {total.toLocaleString()} {lang === "pt" ? "registros encontrados" : "records found"}
                {pages > 1 && <span className="text-neutral-400"> &middot; {lang === "pt" ? "pág" : "p."} {page}/{pages}</span>}
              </p>
              <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 text-neutral-500 font-medium">
                {activeTab === "chemicals" ? "AGROFIT / MAPA" : "Bioinsumos / MAPA"}
              </span>
            </div>

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
      )}
    </div>
  );
}
