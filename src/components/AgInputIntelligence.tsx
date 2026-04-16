"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import {
  Search, Leaf, FlaskConical, Map as MapIcon, Loader2, AlertCircle,
  ChevronLeft, ChevronRight, BookMarked, ExternalLink,
  Link, GitBranch, ChevronDown, ChevronUp, Info, Layers,
  Sparkles, Zap, TrendingDown, Package, Factory, ArrowRight, Network,
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

type Tab = "oracle" | "package" | "industry" | "mindmap" | "chemicals" | "biologicals" | "soils" | "glossary";

// Phase 5 — Canonical input types
interface CanonicalInput {
  id: number;
  culture: string;
  category: string;
  product_name: string;
  active_ingredient: string | null;
  purpose: string | null;
  industry_name: string | null;
  rank: number | null;
  market_share_pct: number | null;
  cost_usd_ha: number | null;
  source: string;
}

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

// ─── Phase 5g: Mindmap SVG component ────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  fungicida_premium: "#5B7A2F",
  fungicida_multissitio: "#7FA02B",
  inseticida_percevejo: "#E8722A",
  inseticida_lagarta: "#D4532B",
  herbicida_seletivo: "#2563EB",
  herbicida_dessecacao: "#1D4ED8",
  tsi: "#7C3AED",
};

function InputMindMapSvg({
  lang, culture, byCategory, categoryLabels,
}: {
  lang: Lang;
  culture: string;
  byCategory: Record<string, CanonicalInput[]>;
  categoryLabels: Record<string, string>;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const categories = Object.entries(byCategory);
  if (categories.length === 0) return null;

  const catCount = categories.length;
  // Layout: root left, categories center, products right
  const W = 1060;
  const rowH = 28;
  const totalProducts = categories.reduce((s, [, items]) => s + items.length, 0);
  const H = Math.max(400, totalProducts * rowH + catCount * 16 + 80);

  const rootX = 60;
  const rootY = H / 2;
  const catX = 260;
  const prodX = 520;
  const metaX = 780;

  // Compute category Y positions so products are evenly spread
  let curY = 40;
  const catPositions: { key: string; label: string; items: CanonicalInput[]; y: number; color: string; productPositions: { item: CanonicalInput; y: number }[] }[] = [];

  for (const [catKey, items] of categories) {
    const blockH = items.length * rowH;
    const catY = curY + blockH / 2;
    const productPositions = items.map((item, i) => ({ item, y: curY + i * rowH + rowH / 2 }));
    catPositions.push({
      key: catKey,
      label: categoryLabels[catKey] || catKey,
      items,
      y: catY,
      color: CATEGORY_COLORS[catKey] || "#64748b",
      productPositions,
    });
    curY += blockH + 16;
  }

  // Culture label from ORACLE_CULTURES
  const cultureLabel = ORACLE_CULTURES.find((c) => c.slug === culture);
  const cultureDisplay = cultureLabel ? (lang === "pt" ? cultureLabel.label_pt : cultureLabel.label_en) : culture;

  // Dedupe unique industries and molecules for stats
  const uniqueIndustries = new Set<string>();
  const uniqueMolecules = new Set<string>();
  for (const [, items] of categories) {
    for (const item of items) {
      if (item.industry_name) uniqueIndustries.add(item.industry_name);
      if (item.active_ingredient) uniqueMolecules.add(item.active_ingredient);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto">
      {/* Legend */}
      <div className="px-5 py-3 border-b border-neutral-100 flex flex-wrap items-center gap-4 text-[11px]">
        <span className="font-semibold text-neutral-500 uppercase tracking-wider">
          {lang === "pt" ? "Legenda" : "Legend"}:
        </span>
        {catPositions.map((cat) => (
          <span key={cat.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
            <span className="text-neutral-600">{cat.label}</span>
          </span>
        ))}
        <span className="ml-auto text-neutral-400">
          {totalProducts} {lang === "pt" ? "produtos" : "products"} · {uniqueIndustries.size} {lang === "pt" ? "indústrias" : "industries"} · {uniqueMolecules.size} {lang === "pt" ? "moléculas" : "molecules"}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 700 }}>
        {/* Root node — Culture */}
        <circle cx={rootX} cy={rootY} r={36} fill="#5B7A2F" stroke="#3D5520" strokeWidth={2} />
        <text x={rootX} y={rootY - 6} textAnchor="middle" className="fill-white font-bold" style={{ fontSize: 12 }}>
          {cultureDisplay}
        </text>
        <text x={rootX} y={rootY + 10} textAnchor="middle" className="fill-white" style={{ fontSize: 9, opacity: 0.8 }}>
          {totalProducts} {lang === "pt" ? "produtos" : "products"}
        </text>

        {/* Category nodes + connections */}
        {catPositions.map((cat) => {
          const isHoveredCat = hovered === cat.key || cat.productPositions.some((p) => hovered === `prod-${p.item.id}`);
          return (
            <g key={cat.key}>
              {/* Root → Category edge */}
              <path
                d={`M ${rootX + 36} ${rootY} C ${rootX + 100} ${rootY}, ${catX - 70} ${cat.y}, ${catX - 40} ${cat.y}`}
                fill="none"
                stroke={cat.color}
                strokeWidth={isHoveredCat ? 2.5 : 1.5}
                opacity={hovered && !isHoveredCat ? 0.15 : 0.6}
              />

              {/* Category node */}
              <g
                onMouseEnter={() => setHovered(cat.key)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={catX - 40} y={cat.y - 14} width={140} height={28} rx={6}
                  fill={isHoveredCat ? cat.color : `${cat.color}18`}
                  stroke={cat.color}
                  strokeWidth={isHoveredCat ? 2 : 1}
                />
                <text x={catX + 30} y={cat.y + 4} textAnchor="middle"
                  className="font-semibold" style={{ fontSize: 10, fill: isHoveredCat ? "#fff" : cat.color }}>
                  {cat.label}
                </text>
              </g>

              {/* Category → Product edges + Product nodes */}
              {cat.productPositions.map(({ item, y: prodY }) => {
                const prodKey = `prod-${item.id}`;
                const isHoveredProd = hovered === prodKey;
                const isRelated = hovered === cat.key;
                const dimmed = hovered && !isHoveredProd && !isRelated;
                return (
                  <g key={prodKey}>
                    {/* Category → Product edge */}
                    <path
                      d={`M ${catX + 100} ${cat.y} C ${catX + 130} ${cat.y}, ${prodX - 30} ${prodY}, ${prodX} ${prodY}`}
                      fill="none"
                      stroke={cat.color}
                      strokeWidth={isHoveredProd ? 2 : 1}
                      opacity={dimmed ? 0.1 : 0.4}
                    />

                    {/* Product node */}
                    <g
                      onMouseEnter={() => setHovered(prodKey)}
                      onMouseLeave={() => setHovered(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        cx={prodX} cy={prodY} r={6}
                        fill={isHoveredProd ? cat.color : "#fff"}
                        stroke={cat.color}
                        strokeWidth={isHoveredProd ? 2 : 1}
                      />
                      {/* Rank badge for leader */}
                      {item.rank === 1 && (
                        <circle cx={prodX} cy={prodY} r={9} fill="none" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="2 2" />
                      )}
                      {/* Product name */}
                      <text x={prodX + 14} y={prodY + 4} className="font-medium"
                        style={{ fontSize: 10, fill: dimmed ? "#d1d5db" : "#1f2937" }}>
                        {item.product_name}
                        {item.rank === 1 ? " ★" : ""}
                      </text>
                    </g>

                    {/* Metadata: industry + molecule */}
                    <text x={metaX} y={prodY - 2}
                      style={{ fontSize: 9, fill: dimmed ? "#e5e7eb" : cat.color, fontWeight: 600 }}>
                      {item.industry_name || "—"}
                    </text>
                    <text x={metaX} y={prodY + 10}
                      style={{ fontSize: 8, fill: dimmed ? "#e5e7eb" : "#9ca3af" }}>
                      {item.active_ingredient ? (item.active_ingredient.length > 40 ? item.active_ingredient.slice(0, 38) + "…" : item.active_ingredient) : ""}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Column headers */}
        <text x={rootX} y={16} textAnchor="middle" className="font-bold" style={{ fontSize: 9, fill: "#9ca3af", letterSpacing: "0.08em" }}>
          {(lang === "pt" ? "CULTURA" : "CROP").toUpperCase()}
        </text>
        <text x={catX + 30} y={16} textAnchor="middle" className="font-bold" style={{ fontSize: 9, fill: "#9ca3af", letterSpacing: "0.08em" }}>
          {(lang === "pt" ? "CATEGORIA" : "CATEGORY").toUpperCase()}
        </text>
        <text x={prodX + 30} y={16} textAnchor="middle" className="font-bold" style={{ fontSize: 9, fill: "#9ca3af", letterSpacing: "0.08em" }}>
          {(lang === "pt" ? "PRODUTO" : "PRODUCT").toUpperCase()}
        </text>
        <text x={metaX + 40} y={16} textAnchor="middle" className="font-bold" style={{ fontSize: 9, fill: "#9ca3af", letterSpacing: "0.08em" }}>
          {(lang === "pt" ? "INDÚSTRIA / MOLÉCULA" : "INDUSTRY / MOLECULE").toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

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
  // Phase 5 — Canonical inputs state
  const [canonicalByCategory, setCanonicalByCategory] = useState<Record<string, CanonicalInput[]>>({});
  const [canonicalByIndustry, setCanonicalByIndustry] = useState<Record<string, CanonicalInput[]>>({});
  const [canonicalLoading, setCanonicalLoading] = useState(false);
  const [canonicalLoaded, setCanonicalLoaded] = useState(false);

  const fetchCanonical = useCallback(async (culture: string) => {
    setCanonicalLoading(true);
    try {
      const res = await fetch(`/api/inputs/canonical?culture=${culture}`);
      const json = await res.json();
      if (json.success) {
        setCanonicalByCategory(json.by_category || {});
        setCanonicalByIndustry(json.by_industry || {});
      }
    } catch { /* fail silently */ }
    finally {
      setCanonicalLoading(false);
      setCanonicalLoaded(true);
    }
  }, []);

  // Auto-load canonical data when switching to package/industry/mindmap tab
  useEffect(() => {
    if ((activeTab === "package" || activeTab === "industry" || activeTab === "mindmap") && !canonicalLoaded) {
      fetchCanonical(oracleCulture);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch canonical when culture changes (if already on those tabs)
  useEffect(() => {
    if (activeTab === "package" || activeTab === "industry" || activeTab === "mindmap") {
      fetchCanonical(oracleCulture);
    }
  }, [oracleCulture]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load soja on first Oracle render
  useEffect(() => {
    if (activeTab === "oracle" && !oracleSearched) {
      handleOracleSearch();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOracleSearch = async (pestOverride?: string) => {
    if (!oracleCulture) return;
    setOracleLoading(true);
    setOracleError(null);
    setExpandedMolecule(null);
    const pest = pestOverride !== undefined ? pestOverride : oraclePest;
    try {
      const params = new URLSearchParams({ culture: oracleCulture, limit: "30" });
      if (pest.trim()) params.set("pest", pest.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"));
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

  // Top manufacturers by product count from Oracle results
  const topManufacturers = useMemo(() => {
    const map = new Map<string, number>();
    for (const mol of oracleMolecules) {
      for (const brand of mol.brands) {
        const mfr = brand.manufacturer_display;
        if (mfr) map.set(mfr, (map.get(mfr) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [oracleMolecules]);

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
        </button>
        <button
          onClick={() => setActiveTab("package")}
          className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "package"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Package size={16} />
          {tr.inputs.packageTab}
        </button>
        <button
          onClick={() => setActiveTab("industry")}
          className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "industry"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Factory size={16} />
          {tr.inputs.industryTab}
        </button>
        <button
          onClick={() => setActiveTab("mindmap")}
          className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "mindmap"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Network size={16} />
          {tr.inputs.mindmapTab}
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
          disabled
          title={lang === "pt" ? "API SmartSolos Embrapa indisponível" : "Embrapa SmartSolos API unavailable"}
          className="flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 border-transparent text-neutral-300 cursor-not-allowed"
        >
          <MapIcon size={16} />
          {tr.inputs.soils}
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-400">offline</span>
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
                  onClick={() => handleOracleSearch()}
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

            {/* Quick pest picks */}
            {(() => {
              const pestMap: Record<string, { slug: string; label_pt: string; label_en: string }[]> = {
                soja: [
                  { slug: "ferrugem-asiatica", label_pt: "Ferrugem Asiática", label_en: "Asian Rust" },
                  { slug: "lagarta-da-soja", label_pt: "Lagarta da Soja", label_en: "Soybean Caterpillar" },
                  { slug: "percevejo", label_pt: "Percevejo", label_en: "Stink Bug" },
                  { slug: "nematoides", label_pt: "Nematoides", label_en: "Nematodes" },
                  { slug: "mosca-branca", label_pt: "Mosca-branca", label_en: "Whitefly" },
                ],
                milho: [
                  { slug: "lagarta-do-cartucho", label_pt: "Lagarta do Cartucho", label_en: "Fall Armyworm" },
                  { slug: "cigarrinha", label_pt: "Cigarrinha", label_en: "Leafhopper" },
                  { slug: "percevejo", label_pt: "Percevejo", label_en: "Stink Bug" },
                ],
              };
              const pests = pestMap[oracleCulture];
              if (!pests) return null;
              return (
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mr-1">
                    {lang === "pt" ? "Pragas comuns:" : "Common pests:"}
                  </span>
                  {pests.map((p) => (
                    <button
                      key={p.slug}
                      onClick={() => { setOraclePest(p.slug); handleOracleSearch(p.slug); }}
                      className="px-2 py-0.5 text-[10px] font-semibold rounded-full border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-brand-primary/10 hover:border-brand-primary/30 hover:text-brand-primary transition-colors"
                    >
                      {lang === "pt" ? p.label_pt : p.label_en}
                    </button>
                  ))}
                </div>
              );
            })()}
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
                            <span>
                              <strong className="text-neutral-700">{m.holder_count}</strong> {tr.inputs.oracleHolders}
                              <span className="text-[9px] text-neutral-400 ml-1">
                                {lang === "pt" ? "(mais fabricantes = mais concorrência = menor preço)" : "(more manufacturers = more competition = lower price)"}
                              </span>
                            </span>
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

              {/* Top Manufacturers summary */}
              {topManufacturers.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-[12px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                    {lang === "pt" ? "Top Fabricantes" : "Top Manufacturers"}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {topManufacturers.map(([name, count]) => (
                      <div key={name} className="bg-white border border-neutral-200 rounded-lg p-3 flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-neutral-800 truncate">{name}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary whitespace-nowrap">
                          {count} {count === 1 ? (lang === "pt" ? "produto" : "product") : (lang === "pt" ? "produtos" : "products")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : activeTab === "package" ? (
        <div className="space-y-4">
          {/* Culture selector (shared with Oracle) */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="flex items-center gap-2 mb-1">
              <Package size={16} className="text-brand-primary" />
              <h3 className="text-[16px] font-bold text-neutral-900">{tr.inputs.packageTitle}</h3>
            </div>
            <p className="text-[12px] text-neutral-500 mb-4">{tr.inputs.packageSubtitle}</p>
            <div className="flex items-center gap-3">
              <select
                value={oracleCulture}
                onChange={(e) => setOracleCulture(e.target.value)}
                className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              >
                {ORACLE_CULTURES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {lang === "pt" ? c.label_pt : c.label_en}
                  </option>
                ))}
              </select>
              {canonicalLoading && <Loader2 size={14} className="animate-spin text-neutral-400" />}
            </div>
          </div>

          {/* Package by category */}
          {canonicalLoaded && Object.keys(canonicalByCategory).length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-[13px] text-amber-800">
              {tr.inputs.noCanonical}
            </div>
          )}

          {Object.entries(canonicalByCategory).map(([cat, items]) => {
            const catLabel = (tr.inputs.categoryLabels as Record<string, string>)[cat] || cat;
            return (
              <div key={cat} className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
                  <h4 className="text-[13px] font-bold text-neutral-800">{catLabel}</h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
                    {items.length} {lang === "pt" ? "produtos" : "products"}
                  </span>
                </div>
                <div className="divide-y divide-neutral-100">
                  {items.map((item) => (
                    <div key={item.id} className="px-4 py-3 flex items-center gap-4 hover:bg-neutral-50/50 transition-colors">
                      <div className="w-6 text-center">
                        {item.rank === 1 ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            {tr.inputs.leader}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-neutral-400">#{item.rank}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-neutral-900">{item.product_name}</span>
                          <span className="text-[10px] text-neutral-500">{item.industry_name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-neutral-500 mt-0.5">
                          {item.active_ingredient && <span>{item.active_ingredient}</span>}
                          {item.purpose && <span className="text-neutral-400">• {item.purpose}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {item.market_share_pct && (
                          <div className="text-right">
                            <p className="text-[9px] font-bold text-neutral-400 uppercase">{tr.inputs.marketShare}</p>
                            <p className="text-[13px] font-bold text-brand-primary">{item.market_share_pct}%</p>
                          </div>
                        )}
                        {item.cost_usd_ha && (
                          <div className="text-right">
                            <p className="text-[9px] font-bold text-neutral-400 uppercase">{tr.inputs.costPerHa}</p>
                            <p className="text-[13px] font-bold text-neutral-700">US$ {item.cost_usd_ha}</p>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setActiveTab("oracle");
                            setOraclePest("");
                            handleOracleSearch("");
                          }}
                          className="p-1.5 rounded text-neutral-400 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                          title={lang === "pt" ? "Ver alternativas no Oráculo" : "View alternatives in Oracle"}
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : activeTab === "industry" ? (
        <div className="space-y-4">
          {/* Culture selector */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="flex items-center gap-2 mb-1">
              <Factory size={16} className="text-brand-primary" />
              <h3 className="text-[16px] font-bold text-neutral-900">{tr.inputs.industryTitle}</h3>
            </div>
            <p className="text-[12px] text-neutral-500 mb-4">{tr.inputs.industrySubtitle}</p>
            <div className="flex items-center gap-3">
              <select
                value={oracleCulture}
                onChange={(e) => setOracleCulture(e.target.value)}
                className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              >
                {ORACLE_CULTURES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {lang === "pt" ? c.label_pt : c.label_en}
                  </option>
                ))}
              </select>
              {canonicalLoading && <Loader2 size={14} className="animate-spin text-neutral-400" />}
            </div>
          </div>

          {canonicalLoaded && Object.keys(canonicalByIndustry).length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-[13px] text-amber-800">
              {tr.inputs.noCanonical}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(canonicalByIndustry)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([name, items]) => (
                <div key={name} className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
                    <h4 className="text-[13px] font-bold text-neutral-800">{name}</h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary">
                      {items.length} {items.length === 1 ? (lang === "pt" ? "produto" : "product") : (lang === "pt" ? "produtos" : "products")}
                    </span>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {items.map((item) => {
                      const catLabel = (tr.inputs.categoryLabels as Record<string, string>)[item.category] || item.category;
                      return (
                        <div key={item.id} className="px-4 py-2.5 flex items-center justify-between">
                          <div className="min-w-0">
                            <span className="text-[13px] font-medium text-neutral-900">{item.product_name}</span>
                            <span className="text-[10px] text-neutral-400 ml-2">{catLabel}</span>
                          </div>
                          {item.rank === 1 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                              {tr.inputs.leader}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : activeTab === "mindmap" ? (
        <div className="space-y-4">
          {/* Culture selector */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="flex items-center gap-2 mb-1">
              <Network size={16} className="text-brand-primary" />
              <h3 className="text-[16px] font-bold text-neutral-900">{tr.inputs.mindmapTitle}</h3>
            </div>
            <p className="text-[12px] text-neutral-500 mb-4">{tr.inputs.mindmapSubtitle}</p>
            <div className="flex items-center gap-3">
              <select
                value={oracleCulture}
                onChange={(e) => setOracleCulture(e.target.value)}
                className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              >
                {ORACLE_CULTURES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {lang === "pt" ? c.label_pt : c.label_en}
                  </option>
                ))}
              </select>
              {canonicalLoading && <Loader2 size={14} className="animate-spin text-neutral-400" />}
            </div>
          </div>

          {canonicalLoaded && Object.keys(canonicalByCategory).length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-[13px] text-amber-800">
              {tr.inputs.noCanonical}
            </div>
          ) : canonicalLoaded ? (
            <InputMindMapSvg
              lang={lang}
              culture={oracleCulture}
              byCategory={canonicalByCategory}
              categoryLabels={tr.inputs.categoryLabels as Record<string, string>}
            />
          ) : null}
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
