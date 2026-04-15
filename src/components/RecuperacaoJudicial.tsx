"use client";

import { useEffect, useState, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Scale, ExternalLink, RefreshCw, Loader2, Search,
  ChevronLeft, ChevronRight, AlertTriangle, Building2, MapPin,
  BarChart3, ChevronDown, ChevronUp, DollarSign, Globe, Zap,
  Plus, X, Sparkles,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import { ENTITY_TYPES, RJ_STATUS, DEBT_SOURCE_LABELS, type RecuperacaoJudicial as RJType, type DebtValueSource } from "@/data/recuperacao";
import { mockRecuperacaoJudicial } from "@/data/mock";
import { MockBadge } from "@/components/ui/MockBadge";

const PAGE_SIZE = 15;

const ENTITY_COLORS: Record<string, string> = {
  produtor_rural: "#5B7A2F",
  empresa_agro: "#1565C0",
  cooperativa: "#E65100",
  usina: "#6A1B9A",
  outros: "#616161",
  distribuidor: "#00796B",
  "frigorífico": "#BF360C",
  produtor: "#7FA02B",
};

const STATE_COLORS = [
  "#5B7A2F", "#1565C0", "#E65100", "#6A1B9A", "#00796B",
  "#BF360C", "#F57F17", "#283593", "#C62828", "#00695C",
  "#4527A0", "#558B2F",
];

function formatCurrency(value: number): string {
  if (value >= 1e9) return `R$ ${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `R$ ${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `R$ ${(value / 1e3).toFixed(0)}K`;
  return `R$ ${value}`;
}

export function RecuperacaoJudicial({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [allItems, setAllItems] = useState<RJType[]>([]);
  const [items, setItems] = useState<RJType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isMock, setIsMock] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // UI
  const [showCharts, setShowCharts] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Web scan
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ total: number; inserted: number } | null>(null);

  // Phase 24C — Manual add modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch all items for stats (lightweight)
  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => { setPage(0); }, [entityTypeFilter, stateFilter, statusFilter, search]);
  useEffect(() => { fetchItems(); }, [page, entityTypeFilter, stateFilter, statusFilter, search]);

  const fetchAll = async () => {
    const { data } = await supabase
      .from("recuperacao_judicial")
      .select("id, entity_type, status, state, filing_date, debt_value, debt_value_source");
    if (data && data.length > 0) {
      setAllItems(data as RJType[]);
    } else {
      setAllItems(mockRecuperacaoJudicial.map(adaptMock) as RJType[]);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    let query = supabase
      .from("recuperacao_judicial")
      .select("*", { count: "exact" })
      .order("filing_date", { ascending: false, nullsFirst: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (entityTypeFilter) query = query.eq("entity_type", entityTypeFilter);
    if (stateFilter) query = query.eq("state", stateFilter);
    if (statusFilter) query = query.eq("status", statusFilter);
    if (search) query = query.or(`entity_name.ilike.%${search}%,summary.ilike.%${search}%`);

    const { data, count } = await query;
    if (data?.length) {
      setItems(data);
      if (count != null) setTotalCount(count);
      setIsMock(false);
    } else {
      const mock = mockRecuperacaoJudicial.map(adaptMock);
      // Apply client-side filters on mock
      let filtered = mock;
      const q = search.toLowerCase();
      if (q) filtered = filtered.filter(m => m.entity_name.toLowerCase().includes(q) || (m.summary || "").toLowerCase().includes(q));
      if (entityTypeFilter) filtered = filtered.filter(m => m.entity_type === entityTypeFilter);
      if (stateFilter) filtered = filtered.filter(m => m.state === stateFilter);
      if (statusFilter) filtered = filtered.filter(m => m.status === statusFilter);
      setItems(filtered as RJType[]);
      setTotalCount(filtered.length);
    }
    setLoading(false);
  };

  function adaptMock(m: any): RJType {
    return {
      ...m,
      entity_cnpj: null,
      court: null,
      case_number: null,
      status: m.status || "em_andamento",
      filing_date: m.filing_date || m.published_at,
      debt_value: m.debt_value || null,
    };
  }

  // ─── Computed Stats ───

  const stats = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const stateCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    let totalDebt = 0;
    let debtCount = 0;
    const states = new Set<string>();

    allItems.forEach((item: any) => {
      const s = item.status || "em_andamento";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      if (item.state) {
        stateCounts[item.state] = (stateCounts[item.state] || 0) + 1;
        states.add(item.state);
      }
      const et = item.entity_type || "outros";
      typeCounts[et] = (typeCounts[et] || 0) + 1;
      if (item.debt_value) {
        totalDebt += item.debt_value;
        debtCount++;
      }
    });

    return {
      statusCounts,
      stateCounts,
      typeCounts,
      totalDebt,
      avgDebt: debtCount > 0 ? totalDebt / debtCount : 0,
      stateCount: states.size,
      total: allItems.length,
    };
  }, [allItems]);

  // Chart data
  const stateChartData = useMemo(() =>
    Object.entries(stats.stateCounts)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  [stats.stateCounts]);

  const typeChartData = useMemo(() =>
    Object.entries(stats.typeCounts)
      .map(([type, count]) => ({
        type,
        label: (ENTITY_TYPES as any)[type]?.[lang === "pt" ? "pt" : "en"] || type,
        count,
        fill: ENTITY_COLORS[type] || "#616161",
      }))
      .sort((a, b) => b.count - a.count),
  [stats.typeCounts, lang]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-neutral-900">{tr.recuperacao.title}</h2>
            <p className="text-[12px] text-neutral-500 mt-0.5">{tr.recuperacao.subtitle}</p>
          </div>
          {isMock && <MockBadge />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-surface text-brand-primary border border-brand-primary/30 rounded-md hover:bg-brand-primary/10 text-[13px] font-semibold transition-colors"
          >
            <Plus size={14} />
            {lang === "pt" ? "Adicionar CNPJ" : "Add CNPJ"}
          </button>
          <button
            onClick={async () => {
              setScanning(true);
              setScanResult(null);
              try {
                const res = await fetch("/api/rj-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ max_queries: 5 }) });
                const json = await res.json();
                if (json.success) {
                  setScanResult({ total: json.stats.total_results, inserted: json.stats.inserted });
                  fetchAll();
                  fetchItems();
                }
              } catch { /* ignore */ }
              setScanning(false);
            }}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-md hover:bg-black text-[13px] font-medium transition-colors disabled:opacity-50"
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
            {lang === "pt" ? "Web Scan" : "Web Scan"}
          </button>
          <button
            onClick={() => { setPage(0); fetchAll(); fetchItems(); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-dark text-[13px] font-medium transition-colors"
          >
            <RefreshCw size={14} />
            {tr.recuperacao.refresh}
          </button>
        </div>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className="mb-4 flex items-center gap-2 bg-brand-surface/30 border border-brand-light rounded-lg px-4 py-2.5">
          <Zap size={14} className="text-brand-primary" />
          <p className="text-[12px] text-neutral-700">
            {lang === "pt"
              ? `Web Scan concluído: ${scanResult.total} resultados encontrados, ${scanResult.inserted} novos inseridos.`
              : `Web Scan complete: ${scanResult.total} results found, ${scanResult.inserted} new entries inserted.`}
          </p>
          <button onClick={() => setScanResult(null)} className="ml-auto text-neutral-400 hover:text-neutral-600 text-[11px]">&times;</button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-neutral-400" />
            <p className="text-[10px] font-semibold text-neutral-400 uppercase">{tr.recuperacao.totalCases}</p>
          </div>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-error-light/30 rounded-lg border border-error-light/50 p-4">
          <div className="flex items-center gap-1.5">
            <DollarSign size={12} className="text-error/60" />
            <p className="text-[10px] font-semibold text-error/70 uppercase">{tr.recuperacao.totalDebt}</p>
          </div>
          <p className="text-[24px] font-bold text-error-dark mt-1">
            {stats.totalDebt > 0 ? formatCurrency(stats.totalDebt) : "—"}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase">{tr.recuperacao.avgDebt}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">
            {stats.avgDebt > 0 ? formatCurrency(stats.avgDebt) : "—"}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-neutral-400" />
            <p className="text-[10px] font-semibold text-neutral-400 uppercase">{tr.recuperacao.statesAffected}</p>
          </div>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{stats.stateCount}</p>
        </div>
      </div>

      {/* Status badges row */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(RJ_STATUS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-all ${
              statusFilter === key ? "border-brand-primary bg-brand-surface/50 shadow-[0_0_0_2px_rgba(91,122,47,0.15)]" : "border-neutral-200 bg-white hover:border-neutral-300"
            }`}
          >
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${val.color}`}>
              {lang === "pt" ? val.pt : val.en}
            </span>
            <span className="text-neutral-900 font-bold">{stats.statusCounts[key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Analytics Charts */}
      <div className="mb-6">
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-3 hover:text-neutral-700"
        >
          <BarChart3 size={14} className="text-brand-primary" />
          {lang === "pt" ? "Análise" : "Analytics"}
          {showCharts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showCharts && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cases by State */}
            <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <h4 className="text-[12px] font-semibold text-neutral-700 mb-3">{tr.recuperacao.casesByState}</h4>
              {stateChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stateChartData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <XAxis dataKey="state" tick={{ fontSize: 11, fontWeight: 600 }} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                      formatter={(value) => [value, lang === "pt" ? "Processos" : "Cases"]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={28}>
                      {stateChartData.map((_, i) => (
                        <Cell key={i} fill={STATE_COLORS[i % STATE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[12px] text-neutral-400 py-8 text-center">{lang === "pt" ? "Sem dados" : "No data"}</p>
              )}
            </div>

            {/* Cases by Entity Type */}
            <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <h4 className="text-[12px] font-semibold text-neutral-700 mb-3">{tr.recuperacao.casesByType}</h4>
              {typeChartData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie
                        data={typeChartData}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={70}
                        strokeWidth={2}
                        stroke="#fff"
                      >
                        {typeChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {typeChartData.map((entry) => (
                      <div key={entry.type} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                        <span className="text-[11px] text-neutral-600 flex-1 truncate">{entry.label}</span>
                        <span className="text-[11px] font-bold text-neutral-900">{entry.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-neutral-400 py-8 text-center">{lang === "pt" ? "Sem dados" : "No data"}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr.recuperacao.searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
          />
        </div>
        <select
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
        >
          <option value="">{tr.recuperacao.allTypes}</option>
          {Object.entries(ENTITY_TYPES).map(([key, val]) => (
            <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
          ))}
        </select>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
        >
          <option value="">{tr.recuperacao.allStates}</option>
          {["SP","MT","MS","GO","MG","PR","RS","BA","TO","MA","PA","PI"].map((uf) => (
            <option key={uf} value={uf}>{uf}</option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <p className="text-[11px] text-neutral-400 mb-3">
        {totalCount} {lang === "pt" ? "processos" : "cases"}
        {(search || entityTypeFilter || stateFilter || statusFilter) && ` (${lang === "pt" ? "filtrado" : "filtered"})`}
      </p>

      {/* Cases List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Scale size={40} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-[14px] font-medium text-neutral-500">{tr.recuperacao.noResults}</p>
          <p className="text-[12px] text-neutral-400 mt-1">{tr.recuperacao.noResultsHint}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const statusInfo = RJ_STATUS[item.status as keyof typeof RJ_STATUS] || RJ_STATUS.em_andamento;
            const entityInfo = (ENTITY_TYPES as any)[item.entity_type as string] || ENTITY_TYPES.outros;
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusInfo.color}`}>
                        {lang === "pt" ? statusInfo.pt : statusInfo.en}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 flex items-center gap-1">
                        <Building2 size={10} />
                        {lang === "pt" ? entityInfo.pt : entityInfo.en}
                      </span>
                      {item.state && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 flex items-center gap-1">
                          <MapPin size={10} />
                          {item.state}
                        </span>
                      )}
                      {(item as any).debt_value && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-error-light text-error-dark flex items-center gap-1">
                          <DollarSign size={10} />
                          {formatCurrency((item as any).debt_value)}
                        </span>
                      )}
                      {(item as any).debt_value_source && DEBT_SOURCE_LABELS[(item as any).debt_value_source as DebtValueSource] && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${DEBT_SOURCE_LABELS[(item as any).debt_value_source as DebtValueSource].color}`}>
                          {lang === "pt"
                            ? DEBT_SOURCE_LABELS[(item as any).debt_value_source as DebtValueSource].pt
                            : DEBT_SOURCE_LABELS[(item as any).debt_value_source as DebtValueSource].en}
                        </span>
                      )}
                    </div>
                    {item.filing_date && (
                      <time className="text-[11px] text-neutral-400 font-medium whitespace-nowrap">
                        {new Date(item.filing_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </time>
                    )}
                  </div>

                  <h3 className="font-semibold text-neutral-900 text-[14px] leading-snug mb-1.5">
                    {item.entity_name}
                  </h3>

                  {item.summary && (
                    <p className={`text-[12px] text-neutral-600 leading-relaxed mb-3 ${!isExpanded ? "line-clamp-2" : ""}`}>
                      {item.summary}
                    </p>
                  )}

                  {/* Expanded detail section */}
                  {isExpanded && (
                    <div className="mt-2 mb-3 p-3 rounded-md bg-neutral-50 border border-neutral-100 grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                      {item.entity_cnpj && (
                        <div><span className="font-bold text-neutral-500">CNPJ:</span> <span className="font-mono text-neutral-700">{item.entity_cnpj}</span></div>
                      )}
                      {item.court && (
                        <div><span className="font-bold text-neutral-500">{lang === "pt" ? "Vara:" : "Court:"}</span> <span className="text-neutral-700">{item.court}</span></div>
                      )}
                      {item.case_number && (
                        <div><span className="font-bold text-neutral-500">{lang === "pt" ? "Processo:" : "Case #:"}</span> <span className="font-mono text-neutral-700">{item.case_number}</span></div>
                      )}
                      {item.state && (
                        <div><span className="font-bold text-neutral-500">UF:</span> <span className="text-neutral-700">{item.state}</span></div>
                      )}
                      <div><span className="font-bold text-neutral-500">{lang === "pt" ? "Fonte:" : "Source:"}</span> <span className="text-neutral-700">{item.source_name || "—"}</span></div>
                      <div><span className="font-bold text-neutral-500">{lang === "pt" ? "Indexado em:" : "Indexed:"}</span> <span className="text-neutral-700">{new Date(item.created_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</span></div>
                      {(item as any).debt_value_source && DEBT_SOURCE_LABELS[(item as any).debt_value_source as DebtValueSource] && (
                        <div>
                          <span className="font-bold text-neutral-500">{lang === "pt" ? "Origem do valor:" : "Value source:"}</span>{" "}
                          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${DEBT_SOURCE_LABELS[(item as any).debt_value_source as DebtValueSource].color}`}>
                            {lang === "pt"
                              ? DEBT_SOURCE_LABELS[(item as any).debt_value_source as DebtValueSource].pt
                              : DEBT_SOURCE_LABELS[(item as any).debt_value_source as DebtValueSource].en}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                      {item.source_name && <span>{item.source_name}</span>}
                      {!item.filing_date && item.created_at && (
                        <span>{new Date(item.created_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="flex items-center gap-1 text-[11px] text-brand-primary hover:text-brand-dark font-medium"
                      >
                        {isExpanded
                          ? <><ChevronUp size={12} /> {lang === "pt" ? "Menos" : "Less"}</>
                          : <><ChevronDown size={12} /> {lang === "pt" ? "Detalhes" : "Details"}</>}
                      </button>
                      {item.source_url && (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-brand-primary hover:text-brand-dark font-medium"
                        >
                          {tr.recuperacao.viewSource}
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-[11px] text-neutral-400">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} {tr.recuperacao.of} {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-2 rounded-md hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} className="text-neutral-600" />
            </button>
            <span className="text-[12px] font-medium text-neutral-600">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-md hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} className="text-neutral-600" />
            </button>
          </div>
        </div>
      )}

      {/* Phase 24C — Add by CNPJ modal */}
      {showAddModal && (
        <AddRJModal
          lang={lang}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            fetchAll();
            fetchItems();
          }}
        />
      )}
    </div>
  );
}

// ─── Phase 24C — Add by CNPJ modal ────────────────────────────────────────

function AddRJModal({
  lang,
  onClose,
  onSaved,
}: {
  lang: Lang;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cnpj, setCnpj] = useState("");
  const [entityName, setEntityName] = useState("");
  const [state, setState] = useState("");
  const [entityType, setEntityType] = useState("outros");
  const [status, setStatus] = useState("em_andamento");
  const [filingDate, setFilingDate] = useState(new Date().toISOString().slice(0, 10));
  const [debtValue, setDebtValue] = useState<string>("");
  const [court, setCourt] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [scrapeDebt, setScrapeDebt] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrichmentNote, setEnrichmentNote] = useState<string | null>(null);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setError(null);
    setEnrichmentNote(null);
    setSaving(true);
    try {
      const res = await fetch("/api/rj-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: cnpj.replace(/\D/g, ""),
          entity_name: entityName || undefined,
          state: state || undefined,
          entity_type: entityType,
          status,
          filing_date: filingDate,
          debt_value: debtValue ? Number(debtValue.replace(/\./g, "").replace(",", ".")) : undefined,
          court: court || undefined,
          case_number: caseNumber || undefined,
          summary: summary || undefined,
          source_url: sourceUrl || undefined,
          scrape_debt: scrapeDebt && !debtValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");

      // If the backend enriched fields, surface a brief note before closing
      const notes: string[] = [];
      if (data.enriched_from?.brasilapi) {
        notes.push(lang === "pt" ? "razão social via BrasilAPI" : "company name via BrasilAPI");
      }
      if (data.enriched_from?.debt_scraped) {
        notes.push(lang === "pt" ? "dívida extraída de notícias" : "debt scraped from news");
      }
      if (notes.length > 0) {
        setEnrichmentNote(notes.join(" · "));
        // Brief delay so user sees the badge before the modal closes
        setTimeout(() => onSaved(), 1500);
      } else {
        onSaved();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 p-4 pt-10 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <h3 className="text-[15px] font-bold text-neutral-900 flex items-center gap-2">
            <Plus size={16} className="text-brand-primary" />
            {lang === "pt" ? "Adicionar Recuperação Judicial" : "Add Judicial Recovery"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            {lang === "pt"
              ? "Informe o CNPJ. A razão social e o estado serão preenchidos automaticamente via BrasilAPI; o valor da dívida será extraído de notícias quando possível. Você pode editar qualquer campo antes de salvar."
              : "Enter the CNPJ. Company name and state will auto-populate via BrasilAPI; debt amount will be scraped from news when possible. You can edit any field before saving."}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <RJField label="CNPJ">
              <input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full px-2 py-1.5 text-[12px] font-mono bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </RJField>
            <RJField label={lang === "pt" ? "Estado" : "State"}>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              >
                <option value="">{lang === "pt" ? "Auto (via CNPJ)" : "Auto (via CNPJ)"}</option>
                {["SP","MT","MS","GO","MG","PR","RS","BA","TO","MA","PA","PI","SC","ES","CE","PE","RN","PB","AL","SE","DF","RO","AM","RR","AP","AC"].map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </RJField>
          </div>

          <RJField
            label={lang === "pt" ? "Razão Social" : "Company Name"}
            hint={lang === "pt" ? "deixe em branco para auto-preencher" : "leave blank to auto-fill"}
          >
            <input
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              placeholder={lang === "pt" ? "será preenchido via BrasilAPI" : "will be filled via BrasilAPI"}
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            />
          </RJField>

          <div className="grid grid-cols-3 gap-3">
            <RJField label={lang === "pt" ? "Tipo" : "Type"}>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              >
                {Object.entries(ENTITY_TYPES).map(([key, val]: any) => (
                  <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
                ))}
              </select>
            </RJField>
            <RJField label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              >
                {Object.entries(RJ_STATUS).map(([key, val]: any) => (
                  <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
                ))}
              </select>
            </RJField>
            <RJField label={lang === "pt" ? "Data do pedido" : "Filing date"}>
              <input
                type="date"
                value={filingDate}
                onChange={(e) => setFilingDate(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </RJField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <RJField label={lang === "pt" ? "Vara" : "Court"}>
              <input
                value={court}
                onChange={(e) => setCourt(e.target.value)}
                placeholder={lang === "pt" ? "ex: 1ª Vara Empresarial SP" : "e.g. 1st Business Court SP"}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </RJField>
            <RJField label={lang === "pt" ? "Nº processo" : "Case number"}>
              <input
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder="0000000-00.0000.0.00.0000"
                className="w-full px-2 py-1.5 text-[12px] font-mono bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </RJField>
          </div>

          <RJField
            label={lang === "pt" ? "Dívida (R$)" : "Debt (BRL)"}
            hint={lang === "pt" ? "deixe em branco para extrair de notícias" : "leave blank to scrape from news"}
          >
            <input
              value={debtValue}
              onChange={(e) => setDebtValue(e.target.value)}
              placeholder={lang === "pt" ? "ex: 25000000 ou 25.000.000" : "e.g. 25000000"}
              className="w-full px-2 py-1.5 text-[12px] font-mono bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            />
          </RJField>

          <label className="flex items-center gap-2 text-[11px] text-neutral-600">
            <input
              type="checkbox"
              checked={scrapeDebt}
              disabled={!!debtValue}
              onChange={(e) => setScrapeDebt(e.target.checked)}
            />
            <Sparkles size={11} className="text-purple-500" />
            {lang === "pt"
              ? "Tentar extrair dívida automaticamente de notícias quando o campo estiver vazio"
              : "Auto-extract debt from news snippets when field is empty"}
          </label>

          <RJField label={lang === "pt" ? "Resumo" : "Summary"}>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder={lang === "pt" ? "Contexto curto (opcional)" : "Short context (optional)"}
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            />
          </RJField>

          <RJField label={lang === "pt" ? "URL da fonte" : "Source URL"}>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            />
          </RJField>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-200 bg-neutral-50/50">
          {error && <span className="text-[11px] text-red-600 mr-auto">{error}</span>}
          {enrichmentNote && (
            <span className="text-[11px] text-emerald-600 font-medium mr-auto flex items-center gap-1">
              <Sparkles size={11} />
              {enrichmentNote}
            </span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-[12px] font-semibold border border-neutral-200 text-neutral-600 hover:bg-neutral-100 transition-all"
          >
            {lang === "pt" ? "Cancelar" : "Cancel"}
          </button>
          <button
            onClick={submit}
            disabled={!cnpj.trim() || saving}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-[12px] font-bold bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {lang === "pt" ? "Salvar" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RJField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
        {label}
        {hint && <span className="ml-1 normal-case text-neutral-400">({hint})</span>}
      </label>
      {children}
    </div>
  );
}
