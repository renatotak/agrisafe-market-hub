"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Landmark, Search, X, ExternalLink, Loader2, MapPin,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Shield, Building2, TrendingDown, BookOpen, Filter, Download,
} from "lucide-react";
import { downloadCsv, type CsvColumn } from "@/lib/csv-export";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancialInstitution {
  id: string;
  entity_uid: string | null;
  name: string;
  short_name: string | null;
  institution_type: string;
  cnpj: string | null;
  bcb_code: string | null;
  headquarters_uf: string | null;
  headquarters_city: string | null;
  active_rural_credit: boolean;
  rural_credit_volume_brl: number | null;
  specialties: string[] | null;
  website: string | null;
  notes: string | null;
  is_sicor_eligible: boolean;
  sicor_segment: string | null;
}

interface ScrDataPoint {
  period: string;
  indicator: string;
  value: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 40;

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  bank:             { bg: "#E8F0FE", text: "#1A73E8" },
  cooperative_bank: { bg: "#E6F4EA", text: "#137333" },
  fidc:             { bg: "#FEF7E0", text: "#B06000" },
  fiagro:           { bg: "#F0E8FE", text: "#7627BB" },
  development_bank: { bg: "#E0F2F1", text: "#00695C" },
  fintech:          { bg: "#FCE4EC", text: "#C2185B" },
  cra_issuer:       { bg: "#FFF3E0", text: "#E65100" },
};

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

// ─── SCR Mini-chart (sparkline) ──────────────────────────────────────────────

function ScrSparkline({ data, lang }: { data: ScrDataPoint[]; lang: Lang }) {
  if (data.length === 0) return null;
  const sorted = [...data].sort((a, b) => a.period.localeCompare(b.period));
  const values = sorted.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 260;
  const H = 60;
  const PAD = 4;

  const points = sorted.map((d, i) => {
    const x = PAD + (i / (sorted.length - 1 || 1)) * (W - PAD * 2);
    const y = H - PAD - ((d.value - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(" ");

  const latest = sorted[sorted.length - 1];
  return (
    <div className="bg-neutral-50 rounded-lg border border-neutral-100 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
          {lang === "pt" ? "Inadimplência Rural (PJ)" : "Rural Delinquency (PJ)"}
        </span>
        <span className="text-[12px] font-bold text-red-600">
          {latest?.value.toFixed(2)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 48 }}>
        <polyline
          points={points}
          fill="none"
          stroke="#DC2626"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {sorted.length > 0 && (() => {
          const lastIdx = sorted.length - 1;
          const lx = PAD + (lastIdx / (sorted.length - 1 || 1)) * (W - PAD * 2);
          const ly = H - PAD - ((sorted[lastIdx].value - min) / range) * (H - PAD * 2);
          return <circle cx={lx} cy={ly} r={3} fill="#DC2626" />;
        })()}
      </svg>
      <div className="flex items-center justify-between text-[9px] text-neutral-400 mt-0.5">
        <span>{sorted[0]?.period}</span>
        <span>{latest?.period}</span>
      </div>
    </div>
  );
}

// ─── Expanded Detail Panel ───────────────────────────────────────────────────

function FiDetailPanel({ inst, lang }: { inst: FinancialInstitution; lang: Lang }) {
  const [mcrNorms, setMcrNorms] = useState<{ id: string; title: string; norm_number: string }[]>([]);
  const [loadingMcr, setLoadingMcr] = useState(false);

  useEffect(() => {
    setLoadingMcr(true);
    supabase
      .from("regulatory_norms")
      .select("id, title, norm_number")
      .eq("body", "BCB")
      .like("norm_number", "MCR%")
      .limit(8)
      .then(({ data }) => {
        setMcrNorms(data || []);
        setLoadingMcr(false);
      });
  }, []);

  const formatBrl = (v: number | null) => {
    if (v == null) return "—";
    if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
    return `R$ ${v.toFixed(0)}`;
  };

  return (
    <div className="mt-2 pt-3 border-t border-neutral-100 space-y-3">
      {/* Profile row */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="text-neutral-400 block">{lang === "pt" ? "CNPJ Raiz" : "Tax ID"}</span>
          <span className="font-mono text-neutral-700">{inst.cnpj || "—"}</span>
        </div>
        <div>
          <span className="text-neutral-400 block">{lang === "pt" ? "Código BCB" : "BCB Code"}</span>
          <span className="font-mono text-neutral-700">{inst.bcb_code || "—"}</span>
        </div>
        <div>
          <span className="text-neutral-400 block">SICOR</span>
          <span className={`font-semibold ${inst.is_sicor_eligible ? "text-green-700" : "text-neutral-400"}`}>
            {inst.is_sicor_eligible
              ? (lang === "pt" ? "Elegível" : "Eligible")
              : (lang === "pt" ? "Não elegível" : "Not eligible")}
          </span>
        </div>
        {inst.sicor_segment && (
          <div>
            <span className="text-neutral-400 block">{lang === "pt" ? "Segmento SICOR" : "SICOR Segment"}</span>
            <span className="text-neutral-700">{inst.sicor_segment}</span>
          </div>
        )}
        {inst.rural_credit_volume_brl != null && (
          <div>
            <span className="text-neutral-400 block">{lang === "pt" ? "Patrimônio Líquido" : "Net Assets"}</span>
            <span className="font-semibold text-neutral-800">{formatBrl(inst.rural_credit_volume_brl)}</span>
          </div>
        )}
      </div>

      {/* Notes (gestor/admin for funds) */}
      {inst.notes && (
        <div className="text-[11px] text-neutral-500 bg-neutral-50 rounded px-2.5 py-1.5">
          {inst.notes}
        </div>
      )}

      {/* MCR citation chips */}
      {!loadingMcr && mcrNorms.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
            {lang === "pt" ? "Marco Regulatório (MCR)" : "Regulatory Framework (MCR)"}
          </span>
          <div className="flex flex-wrap gap-1">
            {mcrNorms.map((n) => (
              <span key={n.id} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                {n.norm_number || n.title.split("—")[0].trim()}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function FinancialInstitutions({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const fi = (tr as any).financialInstitutions || {} as Record<string, any>;

  const [institutions, setInstitutions] = useState<FinancialInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrData, setScrData] = useState<ScrDataPoint[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ufFilter, setUfFilter] = useState("");
  const [sicorOnly, setSicorOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch institutions
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("financial_institutions")
        .select("*")
        .order("name");

      if (error) throw error;
      setInstitutions(data || []);
    } catch {
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch SCR data
  const fetchScr = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("macro_statistics")
        .select("period, indicator, value")
        .eq("source_id", "bcb_scr")
        .eq("indicator", "inadimplencia_rural_pj")
        .order("period", { ascending: true });
      setScrData((data || []) as ScrDataPoint[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchData(); fetchScr(); }, [fetchData, fetchScr]);

  // Filtered data
  const filtered = useMemo(() => {
    let result = institutions;
    if (typeFilter) result = result.filter((i) => i.institution_type === typeFilter);
    if (ufFilter) result = result.filter((i) => i.headquarters_uf === ufFilter);
    if (sicorOnly) result = result.filter((i) => i.is_sicor_eligible);
    if (activeOnly) result = result.filter((i) => i.active_rural_credit);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.short_name && i.short_name.toLowerCase().includes(q)) ||
        (i.cnpj && i.cnpj.includes(q))
      );
    }
    return result;
  }, [institutions, typeFilter, ufFilter, sicorOnly, activeOnly, searchQuery]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [typeFilter, ufFilter, sicorOnly, activeOnly, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // KPI counts
  const kpis = useMemo(() => {
    const byType: Record<string, number> = {};
    let sicorCount = 0;
    for (const i of institutions) {
      byType[i.institution_type] = (byType[i.institution_type] || 0) + 1;
      if (i.is_sicor_eligible) sicorCount++;
    }
    return {
      total: institutions.length,
      banks: (byType.bank || 0) + (byType.development_bank || 0),
      cooperatives: byType.cooperative_bank || 0,
      fidcs: byType.fidc || 0,
      fiagros: byType.fiagro || 0,
      sicor: sicorCount,
    };
  }, [institutions]);

  const typeBadgeLabel = (type: string): string => fi.typeBadge?.[type] || type;

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("");
    setUfFilter("");
    setSicorOnly(false);
    setActiveOnly(false);
  };
  const hasFilters = searchQuery || typeFilter || ufFilter || sicorOnly || activeOnly;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Landmark size={24} className="text-[#5B7A2F]" />
            <h2 className="text-[22px] font-bold text-neutral-900">
              {fi.title || "Instituições Financeiras"}
            </h2>
          </div>
          <p className="text-[13px] text-neutral-500 ml-[36px]">
            {fi.subtitle || "Bancos, cooperativas, FIDCs e FIAGROs ativos no crédito rural"}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
          SICOR + CVM
        </span>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: "Total", value: kpis.total, onClick: () => { clearFilters(); } },
          { label: fi.typeBadge?.bank || "Bancos", value: kpis.banks, onClick: () => { clearFilters(); setTypeFilter("bank"); } },
          { label: fi.typeBadge?.cooperative_bank || "Cooperativas", value: kpis.cooperatives, onClick: () => { clearFilters(); setTypeFilter("cooperative_bank"); } },
          { label: "FIDCs", value: kpis.fidcs, onClick: () => { clearFilters(); setTypeFilter("fidc"); } },
          { label: "SICOR", value: kpis.sicor, onClick: () => { clearFilters(); setSicorOnly(true); } },
          { label: lang === "pt" ? "Inadimpl." : "Delinq.", value: scrData.length > 0 ? `${scrData[scrData.length - 1].value.toFixed(1)}%` : "—" },
        ].map((kpi, i) => (
          <button
            key={i}
            onClick={kpi.onClick}
            className="rounded-lg px-3 py-2.5 bg-white border border-neutral-200 text-left hover:border-[#5B7A2F]/40 transition-colors"
          >
            <p className="text-[9px] font-semibold text-neutral-400 uppercase">{kpi.label}</p>
            <p className="text-[18px] font-bold text-neutral-900 leading-tight mt-0.5">{kpi.value}</p>
          </button>
        ))}
      </div>

      {/* SCR Chart */}
      {scrData.length > 0 && <ScrSparkline data={scrData} lang={lang} />}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={fi.searchPlaceholder || "Buscar instituição..."}
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#5B7A2F] focus:border-[#5B7A2F]"
          />
        </div>

        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#5B7A2F] cursor-pointer"
          >
            <option value="">{fi.filterByType || "Tipo"}</option>
            {["bank", "cooperative_bank", "fidc", "fiagro", "development_bank"].map((tp) => (
              <option key={tp} value={tp}>{typeBadgeLabel(tp)}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={ufFilter}
            onChange={(e) => setUfFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#5B7A2F] cursor-pointer"
          >
            <option value="">{fi.filterByUf || "UF"}</option>
            {UF_LIST.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        </div>

        {/* SICOR chip */}
        <button
          onClick={() => setSicorOnly(!sicorOnly)}
          className={`flex items-center gap-1 px-3 py-2 text-[12px] font-medium rounded-lg border transition-colors ${
            sicorOnly
              ? "bg-green-50 border-green-300 text-green-700"
              : "bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300"
          }`}
        >
          <Shield size={12} />
          SICOR
        </button>

        {/* Active chip */}
        <button
          onClick={() => setActiveOnly(!activeOnly)}
          className={`flex items-center gap-1 px-3 py-2 text-[12px] font-medium rounded-lg border transition-colors ${
            activeOnly
              ? "bg-blue-50 border-blue-300 text-blue-700"
              : "bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300"
          }`}
        >
          <Building2 size={12} />
          {lang === "pt" ? "Ativos" : "Active"}
        </button>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 text-[12px] font-medium text-neutral-500 hover:text-neutral-800 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X size={14} />
            {lang === "pt" ? "Limpar" : "Clear"}
          </button>
        )}
      </div>

      {/* Results count + export + pagination top */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-neutral-400">
          {filtered.length} {lang === "pt" ? "resultado(s)" : "result(s)"}
          {totalPages > 1 && ` · ${lang === "pt" ? "página" : "page"} ${page}/${totalPages}`}
        </p>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button
              onClick={() => {
                const columns: CsvColumn<FinancialInstitution>[] = [
                  { key: "name", header: lang === "pt" ? "Nome" : "Name" },
                  { key: "short_name", header: lang === "pt" ? "Nome Curto" : "Short Name" },
                  { key: "cnpj", header: "CNPJ" },
                  { key: "institution_type", header: lang === "pt" ? "Tipo" : "Type" },
                  { key: "headquarters_uf", header: "UF" },
                  { key: "headquarters_city", header: lang === "pt" ? "Cidade" : "City" },
                  { key: "is_sicor_eligible", header: "SICOR", format: (r) => r.is_sicor_eligible ? "Sim" : "Não" },
                  { key: "sicor_segment", header: lang === "pt" ? "Segmento SICOR" : "SICOR Segment" },
                  { key: "bcb_code", header: lang === "pt" ? "Código BCB" : "BCB Code" },
                  { key: "rural_credit_volume_brl", header: lang === "pt" ? "Patrimônio (R$)" : "Net Assets (R$)" },
                  { key: "active_rural_credit", header: lang === "pt" ? "Ativo" : "Active", format: (r) => r.active_rural_credit ? "Sim" : "Não" },
                  { key: "website", header: "Website" },
                ];
                const ts = new Date().toISOString().slice(0, 10);
                downloadCsv(`instituicoes-financeiras-${ts}`, filtered, columns);
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              title={lang === "pt" ? "Exportar CSV" : "Export CSV"}
            >
              <Download size={12} />
              CSV
            </button>
          )}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-neutral-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center">
          <p className="text-[14px] text-neutral-500">{fi.noResults || "Nenhuma instituição encontrada."}</p>
        </div>
      )}

      {/* List */}
      {!loading && paged.length > 0 && (
        <div className="space-y-2">
          {paged.map((inst) => {
            const colors = TYPE_COLORS[inst.institution_type] || { bg: "#F3F4F6", text: "#6B7280" };
            const isExpanded = expandedId === inst.id;
            return (
              <div
                key={inst.id}
                className={`bg-white rounded-lg border transition-colors ${
                  isExpanded ? "border-[#5B7A2F]/60 shadow-sm" : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : inst.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                >
                  {/* Type badge */}
                  <span
                    className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    {typeBadgeLabel(inst.institution_type)}
                  </span>

                  {/* Name */}
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold text-neutral-900 line-clamp-1">
                      {inst.short_name || inst.name}
                    </span>
                    {inst.short_name && inst.short_name !== inst.name && (
                      <span className="text-[11px] text-neutral-400 ml-2 hidden sm:inline">{inst.name}</span>
                    )}
                  </div>

                  {/* SICOR badge */}
                  {inst.is_sicor_eligible && (
                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                      SICOR
                    </span>
                  )}

                  {/* Location */}
                  {inst.headquarters_uf && (
                    <span className="shrink-0 text-[11px] text-neutral-400 hidden md:block">
                      {inst.headquarters_uf}
                    </span>
                  )}

                  {/* AUM */}
                  {inst.rural_credit_volume_brl != null && inst.rural_credit_volume_brl > 0 && (
                    <span className="shrink-0 text-[11px] font-medium text-neutral-600 hidden lg:block">
                      {inst.rural_credit_volume_brl >= 1e9
                        ? `R$ ${(inst.rural_credit_volume_brl / 1e9).toFixed(1)}B`
                        : inst.rural_credit_volume_brl >= 1e6
                          ? `R$ ${(inst.rural_credit_volume_brl / 1e6).toFixed(0)}M`
                          : `R$ ${(inst.rural_credit_volume_brl / 1e3).toFixed(0)}K`}
                    </span>
                  )}

                  {/* Expand chevron */}
                  {isExpanded ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <FiDetailPanel inst={inst} lang={lang} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded border border-neutral-300 text-neutral-700 hover:bg-white disabled:opacity-40">
            <ChevronLeft size={14} /> {lang === "pt" ? "Anterior" : "Previous"}
          </button>
          <span className="text-[12px] text-neutral-500">{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded border border-neutral-300 text-neutral-700 hover:bg-white disabled:opacity-40">
            {lang === "pt" ? "Próxima" : "Next"} <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
