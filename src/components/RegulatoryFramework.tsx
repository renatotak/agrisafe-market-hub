"use client";

import { useState, useEffect, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { mockRegulatoryNorms } from "@/data/mock";
import { Badge } from "@/components/ui/Badge";
import { MockBadge } from "@/components/ui/MockBadge";
import {
  ExternalLink, AlertTriangle, Calendar, BookOpen,
  ChevronDown, ChevronUp, Search, Clock, BarChart3,
  Upload, List, X, Loader2, Plus, Database, Globe, Building2, FileText, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ─── Constants ───

const BODY_STYLES: Record<string, { color: string; full: string; chartColor: string }> = {
  CMN: { color: "bg-[#1565C0] text-white", full: "Conselho Monetário Nacional", chartColor: "#1565C0" },
  BCB: { color: "bg-[#005CA9] text-white", full: "Banco Central do Brasil", chartColor: "#005CA9" },
  CVM: { color: "bg-[#2E7D32] text-white", full: "Comissão de Valores Mobiliários", chartColor: "#2E7D32" },
  MAPA: { color: "bg-[#E65100] text-white", full: "Ministério da Agricultura", chartColor: "#E65100" },
};

const IMPACT_BADGE: Record<string, { variant: "error" | "warning" | "default"; pt: string; en: string }> = {
  high: { variant: "error", pt: "Alto Impacto", en: "High Impact" },
  medium: { variant: "warning", pt: "Médio", en: "Medium" },
  low: { variant: "default", pt: "Baixo", en: "Low" },
};

const NORM_TYPE_LABELS: Record<string, { pt: string; en: string }> = {
  resolucao: { pt: "Resolução", en: "Resolution" },
  circular: { pt: "Circular", en: "Circular" },
  instrucao_normativa: { pt: "Instrução Normativa", en: "Normative Instruction" },
  decreto: { pt: "Decreto", en: "Decree" },
  medida_provisoria: { pt: "Medida Provisória", en: "Provisional Measure" },
  portaria: { pt: "Portaria", en: "Ordinance" },
  outros: { pt: "Outros", en: "Other" },
};

const AREA_LABELS: Record<string, { pt: string; en: string; color: string }> = {
  credito_rural: { pt: "Crédito Rural", en: "Rural Credit", color: "#1565C0" },
  cpr: { pt: "CPR", en: "CPR", color: "#005CA9" },
  cooperativas: { pt: "Cooperativas", en: "Cooperatives", color: "#2E7D32" },
  registro: { pt: "Registro", en: "Registry", color: "#00796B" },
  cra: { pt: "CRA", en: "CRA", color: "#4A148C" },
  lca: { pt: "LCA", en: "LCA", color: "#6A1B9A" },
  mercado_capitais: { pt: "Mercado de Capitais", en: "Capital Markets", color: "#283593" },
  revendas: { pt: "Revendas", en: "Resellers", color: "#E65100" },
  defensivos: { pt: "Defensivos", en: "Crop Protection", color: "#BF360C" },
  rastreabilidade: { pt: "Rastreabilidade", en: "Traceability", color: "#00695C" },
  seguro_rural: { pt: "Seguro Rural", en: "Rural Insurance", color: "#F57F17" },
  proagro: { pt: "PROAGRO", en: "PROAGRO", color: "#FF8F00" },
  provisionamento: { pt: "Provisionamento", en: "Provisioning", color: "#5D4037" },
  risco: { pt: "Risco", en: "Risk", color: "#C62828" },
  fiagro: { pt: "Fiagro", en: "Fiagro", color: "#1B5E20" },
  esg: { pt: "ESG", en: "ESG", color: "#2E7D32" },
  fundos: { pt: "Fundos", en: "Funds", color: "#4527A0" },
  sementes: { pt: "Sementes", en: "Seeds", color: "#558B2F" },
  financiamento: { pt: "Financiamento", en: "Financing", color: "#0277BD" },
  geral: { pt: "Geral", en: "General", color: "#616161" },
};

// ─── Component ───

export function RegulatoryFramework({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [norms, setNorms] = useState<any[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [bodyFilter, setBodyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [impactFilter, setImpactFilter] = useState("");

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(true);

  // Phase 24C — modal state for upload + sources
  const [showUpload, setShowUpload] = useState(false);
  const [showSources, setShowSources] = useState(false);

  // Phase 26 — affected entity counts per norm
  const [affectedCounts, setAffectedCounts] = useState<Record<number, number>>({});
  const [drilldownNormId, setDrilldownNormId] = useState<number | null>(null);
  const [drilldownEntities, setDrilldownEntities] = useState<any[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // Phase 6d — digest + refresh state
  const [digest, setDigest] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // Reload norms after a successful upload so the new row appears
  // immediately without a page refresh.
  const refreshNorms = async () => {
    const { data } = await supabase
      .from("regulatory_norms")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(100);
    if (data && data.length > 0) {
      setNorms(data);
      setIsMock(false);
    }
  };

  useEffect(() => {
    supabase.from("regulatory_norms").select("*").order("published_at", { ascending: false }).limit(100)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setNorms(data);
          setIsMock(false);
        } else {
          setNorms(mockRegulatoryNorms);
          setIsMock(true);
        }
        setLoading(false);
      });
  }, []);

  // Phase 26 — fetch affected entity counts
  useEffect(() => {
    fetch("/api/regulatory/affected-entities")
      .then((r) => r.json())
      .then((data) => {
        if (data?.norms) {
          const map: Record<number, number> = {};
          for (const n of data.norms) map[n.norm_id] = n.affected_entity_count ?? 0;
          setAffectedCounts(map);
        }
      })
      .catch(() => {});
  }, []);

  // Phase 6d — fetch latest digest
  useEffect(() => {
    supabase
      .from("regulatory_digests")
      .select("*")
      .order("digest_date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDigest(data);
      });
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/regulatory/refresh", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setRefreshMsg(tr.regulatory.refreshSuccess);
        refreshNorms();
        // Re-fetch digest
        const { data: d } = await supabase
          .from("regulatory_digests")
          .select("*")
          .order("digest_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (d) setDigest(d);
      } else {
        setRefreshMsg(tr.regulatory.refreshError);
      }
    } catch {
      setRefreshMsg(tr.regulatory.refreshError);
    }
    setRefreshing(false);
    setTimeout(() => setRefreshMsg(null), 4000);
  };

  const openDrilldown = async (normId: number) => {
    setDrilldownNormId(normId);
    setDrilldownLoading(true);
    setDrilldownEntities([]);
    try {
      const r = await fetch(`/api/regulatory/affected-entities?norm_id=${normId}`);
      const data = await r.json();
      setDrilldownEntities(data?.entities || []);
    } catch { /* fail-soft */ }
    setDrilldownLoading(false);
  };

  // ─── Computed Data ───

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return norms.filter((n) => {
      if (bodyFilter && n.body !== bodyFilter) return false;
      if (typeFilter && n.norm_type !== typeFilter) return false;
      if (impactFilter && n.impact_level !== impactFilter) return false;
      if (q) {
        const haystack = `${n.title} ${n.summary || ""} ${n.body} ${n.norm_number || ""} ${(n.affected_areas || []).join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [norms, bodyFilter, typeFilter, impactFilter, search]);

  const highImpact = useMemo(() => norms.filter((n) => n.impact_level === "high"), [norms]);

  const upcomingEffective = useMemo(() => {
    const now = new Date();
    return norms
      .filter((n) => n.effective_at && new Date(n.effective_at) >= now)
      .sort((a, b) => new Date(a.effective_at).getTime() - new Date(b.effective_at).getTime())
      .slice(0, 5);
  }, [norms]);

  const uniqueAreas = useMemo(() => {
    const set = new Set<string>();
    norms.forEach((n) => (n.affected_areas || []).forEach((a: string) => set.add(a)));
    return set.size;
  }, [norms]);

  // Chart data
  const bodyChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    norms.forEach((n) => { counts[n.body] = (counts[n.body] || 0) + 1; });
    return Object.entries(counts)
      .map(([body, count]) => ({ body, count, fill: BODY_STYLES[body]?.chartColor || "#6b7280" }))
      .sort((a, b) => b.count - a.count);
  }, [norms]);

  const areaChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    norms.forEach((n) => (n.affected_areas || []).forEach((a: string) => {
      counts[a] = (counts[a] || 0) + 1;
    }));
    return Object.entries(counts)
      .map(([area, count]) => ({
        area: AREA_LABELS[area]?.[lang === "pt" ? "pt" : "en"] || area,
        count,
        fill: AREA_LABELS[area]?.color || "#6b7280",
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [norms, lang]);

  // ─── Helpers ───

  function daysUntil(dateStr: string): number {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-neutral-900">{tr.regulatory.title}</h2>
            <p className="text-[12px] text-neutral-500 mt-0.5">{tr.regulatory.subtitle}</p>
          </div>
          {isMock && <MockBadge />}
        </div>
        {/* Phase 24C — Upload + Sources actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowSources(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 transition-all"
          >
            <List size={13} />
            {lang === "pt" ? "Fontes" : "Sources"}
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold border border-brand-primary/30 bg-brand-surface text-brand-primary hover:bg-brand-primary/10 transition-all"
          >
            <Upload size={13} />
            {lang === "pt" ? "Inserir Norma" : "Add Norm"}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold border border-brand-primary bg-brand-primary text-white hover:bg-brand-dark disabled:opacity-50 transition-all"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? tr.regulatory.refreshing : tr.regulatory.refreshNow}
          </button>
          {refreshMsg && (
            <span className="text-[11px] font-medium text-brand-primary">{refreshMsg}</span>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase">{tr.regulatory.totalNorms}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{norms.length}</p>
        </div>
        <div className="bg-error-light/30 rounded-lg border border-error-light/50 p-4">
          <p className="text-[10px] font-semibold text-error/70 uppercase">{tr.regulatory.highImpactCount}</p>
          <p className="text-[24px] font-bold text-error-dark mt-1">{highImpact.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-neutral-400" />
            <p className="text-[10px] font-semibold text-neutral-400 uppercase">{tr.regulatory.pendingEffective}</p>
          </div>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{upcomingEffective.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase">{tr.regulatory.areasAffected}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-1">{uniqueAreas}</p>
        </div>
      </div>

      {/* Phase 6d — Regulatory Digest Panel */}
      {digest && (
        <div className="mb-6 bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-bold text-neutral-900 flex items-center gap-2">
              <BookOpen size={15} className="text-brand-primary" />
              {tr.regulatory.digestTitle}
            </h3>
            <span className="text-[10px] text-neutral-400">
              {tr.regulatory.digestPeriod}: {digest.period_start} → {digest.period_end}
            </span>
          </div>
          <p className="text-[12px] text-neutral-500 mb-3 italic">{tr.regulatory.digestSubtitle}</p>
          <div className="text-[12px] text-neutral-700 leading-relaxed whitespace-pre-line">
            {lang === "pt" ? digest.digest_text_pt : digest.digest_text_en}
          </div>
          {digest.citations && digest.citations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-neutral-100">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                {lang === "pt" ? "Citações" : "Citations"} ({digest.citations.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {digest.citations.map((c: any, i: number) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      c.impact_level === "high"
                        ? "bg-red-50 border-red-200 text-red-700"
                        : c.impact_level === "medium"
                        ? "bg-amber-50 border-amber-200 text-amber-700"
                        : "bg-neutral-50 border-neutral-200 text-neutral-600"
                    }`}
                    title={c.title}
                  >
                    <span className="font-bold">{c.body}</span>
                    {c.title.length > 40 ? c.title.slice(0, 40) + "..." : c.title}
                    {c.source_url && (
                      <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="ml-0.5">
                        <ExternalLink size={9} />
                      </a>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phase 29 — Regulatory Change Summary */}
      {norms.length > 0 && (
        <div className="mb-6 bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-[14px] font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <FileText size={15} className="text-brand-primary" />
            {lang === "pt" ? "Resumo de Mudanças Regulatórias" : "Regulatory Change Summary"}
          </h3>
          <div className="space-y-2">
            {norms.slice(0, 5).map((norm) => (
              <div key={norm.id} className="flex items-start gap-3 py-2 border-b border-neutral-100 last:border-0">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${BODY_STYLES[norm.body]?.color || "bg-neutral-600 text-white"}`}>
                  {norm.body}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-neutral-900 leading-snug">{norm.title}</p>
                  {norm.summary && (
                    <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{norm.summary}</p>
                  )}
                  {norm.affected_areas && norm.affected_areas.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {norm.affected_areas.slice(0, 4).map((area: string) => (
                        <span key={area} className="text-[9px] font-bold px-1 py-0.5 rounded bg-neutral-100 text-neutral-600">
                          {AREA_LABELS[area]?.[lang === "pt" ? "pt" : "en"] || area}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-neutral-400 shrink-0">
                  {norm.published_at ? new Date(norm.published_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" }) : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impact Alerts */}
      {highImpact.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-3 flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-error" />
            {tr.regulatory.impactAlerts}
          </h3>
          <div className="space-y-2">
            {highImpact.slice(0, 3).map((norm) => (
              <div key={norm.id} className="bg-error-light border border-[#FFCDD2] rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BODY_STYLES[norm.body]?.color || "bg-neutral-600 text-white"}`}>{norm.body}</span>
                    <span className="text-[11px] text-neutral-500">{NORM_TYPE_LABELS[norm.norm_type]?.[lang === "pt" ? "pt" : "en"] || norm.norm_type} {norm.norm_number}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-error-dark">{norm.title}</p>
                  {norm.effective_at && (
                    <p className="text-[11px] text-neutral-500 mt-1">
                      {tr.regulatory.effectiveAt}: {formatDate(norm.effective_at)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Effective Dates Timeline */}
      {upcomingEffective.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-6">
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-4 flex items-center gap-1.5">
            <Calendar size={14} className="text-brand-primary" />
            {tr.regulatory.upcomingEffective}
          </h3>
          <div className="space-y-3">
            {upcomingEffective.map((norm) => {
              const days = daysUntil(norm.effective_at);
              const urgency = days <= 30 ? "text-error font-bold" : days <= 90 ? "text-amber-600 font-semibold" : "text-neutral-600";
              return (
                <div key={norm.id} className="flex items-center gap-4">
                  <div className="w-20 shrink-0 text-right">
                    <span className={`text-[13px] ${urgency}`}>
                      {days <= 0 ? tr.regulatory.overdue : `${days} ${tr.regulatory.daysLeft}`}
                    </span>
                  </div>
                  <div className="w-px h-8 bg-neutral-200" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${BODY_STYLES[norm.body]?.color || "bg-neutral-600 text-white"}`}>{norm.body}</span>
                      <span className="text-[12px] font-medium text-neutral-500">{norm.norm_number}</span>
                    </div>
                    <p className="text-[12px] text-neutral-700 truncate mt-0.5">{norm.title}</p>
                  </div>
                  <time className="text-[11px] text-neutral-400 shrink-0">{formatDate(norm.effective_at)}</time>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Analytics Charts */}
      <div className="mb-6">
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-3 hover:text-neutral-700"
        >
          <BarChart3 size={14} className="text-brand-primary" />
          {tr.regulatory.analytics}
          {showCharts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showCharts && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Norms by Body */}
            <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <h4 className="text-[12px] font-semibold text-neutral-700 mb-3">{tr.regulatory.normsByBody}</h4>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={bodyChartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="body" width={48} tick={{ fontSize: 12, fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                    formatter={(value) => [value, lang === "pt" ? "Normas" : "Norms"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                    {bodyChartData.map((entry) => (
                      <Cell key={entry.body} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Norms by Area */}
            <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <h4 className="text-[12px] font-semibold text-neutral-700 mb-3">{tr.regulatory.normsByArea}</h4>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={areaChartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="area" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                    formatter={(value) => [value, lang === "pt" ? "Normas" : "Norms"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                    {areaChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Quick Reference — Body Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(BODY_STYLES).map(([body, info]) => {
          const count = norms.filter((n) => n.body === body).length;
          return (
            <button key={body} onClick={() => setBodyFilter(bodyFilter === body ? "" : body)}
              className={`rounded-lg p-4 border text-left transition-all ${bodyFilter === body ? "border-brand-primary bg-brand-surface/50 shadow-[0_0_0_2px_rgba(91,122,47,0.15)]" : "border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-neutral-300"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${info.color}`}>{body}</span>
                <span className="text-[18px] font-bold text-neutral-900">{count}</span>
              </div>
              <p className="text-[11px] text-neutral-500 truncate">{info.full}</p>
            </button>
          );
        })}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr.regulatory.searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary">
          <option value="">{tr.regulatory.allTypes}</option>
          {Object.entries(NORM_TYPE_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
          ))}
        </select>
        <select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary">
          <option value="">{tr.regulatory.allImpacts}</option>
          <option value="high">{tr.regulatory.high}</option>
          <option value="medium">{tr.regulatory.medium}</option>
          <option value="low">{tr.regulatory.low}</option>
        </select>
        {bodyFilter && (
          <button onClick={() => setBodyFilter("")} className="px-3 py-2 rounded-md text-[12px] font-semibold bg-brand-primary text-white hover:bg-brand-dark transition-colors">
            {bodyFilter} &times;
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-[11px] text-neutral-400 mb-3">
        {filtered.length} {lang === "pt" ? "normas" : "norms"}
        {(search || bodyFilter || typeFilter || impactFilter) && ` (${lang === "pt" ? "filtrado" : "filtered"})`}
      </p>

      {/* Norms Feed */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen size={40} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-[14px] font-medium text-neutral-500">{tr.regulatory.noResults}</p>
          <p className="text-[12px] text-neutral-400 mt-1">{tr.regulatory.noResultsHint}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((norm) => {
            const impactInfo = IMPACT_BADGE[norm.impact_level] || IMPACT_BADGE.medium;
            const isExpanded = expandedId === norm.id;
            return (
              <div key={norm.id} className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BODY_STYLES[norm.body]?.color || "bg-neutral-600 text-white"}`}>{norm.body}</span>
                      <span className="text-[12px] text-neutral-500 font-medium">
                        {NORM_TYPE_LABELS[norm.norm_type]?.[lang === "pt" ? "pt" : "en"] || norm.norm_type} {norm.norm_number}
                      </span>
                      <Badge variant={impactInfo.variant}>{lang === "pt" ? impactInfo.pt : impactInfo.en}</Badge>
                    </div>
                    <time className="text-[11px] text-neutral-400 whitespace-nowrap">
                      {formatDate(norm.published_at)}
                    </time>
                  </div>

                  <h3 className="font-semibold text-neutral-900 text-[14px] leading-snug mb-2">{norm.title}</h3>

                  {norm.summary && (
                    <p className={`text-[12px] text-neutral-600 leading-relaxed mb-3 ${!isExpanded ? "line-clamp-2" : ""}`}>
                      {norm.summary}
                    </p>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(norm.affected_areas || []).map((area: string) => (
                        <span key={area} className="text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full font-medium">
                          {AREA_LABELS[area]?.[lang === "pt" ? "pt" : "en"] || area}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-neutral-400 shrink-0">
                      {(affectedCounts[norm.id] ?? 0) > 0 && (
                        <button
                          onClick={() => openDrilldown(norm.id)}
                          className="flex items-center gap-1 bg-brand-surface/50 text-brand-primary px-2.5 py-1 rounded-full font-medium hover:bg-brand-primary/10 transition-colors"
                        >
                          <Building2 size={12} />
                          {affectedCounts[norm.id]} {tr.regulatory.affectedEntities}
                        </button>
                      )}
                      {norm.effective_at && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {tr.regulatory.effectiveAt}: {formatDate(norm.effective_at)}
                        </span>
                      )}
                      {norm.source_url && (
                        <a href={norm.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-primary hover:text-brand-dark font-medium">
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {norm.summary && norm.summary.length > 120 && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : norm.id)}
                          className="flex items-center gap-1 text-brand-primary hover:text-brand-dark font-medium"
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {tr.regulatory.readMore}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phase 24C — Upload modal */}
      {showUpload && (
        <UploadNormModal
          lang={lang}
          onClose={() => setShowUpload(false)}
          onSaved={() => {
            setShowUpload(false);
            refreshNorms();
          }}
        />
      )}

      {/* Phase 24C — Sources list modal */}
      {showSources && <SourcesListModal lang={lang} onClose={() => setShowSources(false)} />}

      {/* Phase 26 — Affected entities drilldown modal */}
      {drilldownNormId !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDrilldownNormId(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-neutral-200">
              <h3 className="text-[14px] font-bold text-neutral-900 flex items-center gap-2">
                <Building2 size={16} className="text-brand-primary" />
                {tr.regulatory.affectedEntitiesTitle}
                {!drilldownLoading && (
                  <span className="text-[11px] font-normal text-neutral-400">({drilldownEntities.length})</span>
                )}
              </h3>
              <button onClick={() => setDrilldownNormId(null)} className="text-neutral-400 hover:text-neutral-600"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {drilldownLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-brand-primary" />
                </div>
              ) : drilldownEntities.length === 0 ? (
                <p className="text-[12px] text-neutral-500 text-center py-8">{tr.regulatory.noAffectedEntities}</p>
              ) : (
                <div className="space-y-2">
                  {drilldownEntities.map((e: any) => (
                    <div key={e.entity_uid} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-neutral-800 truncate">{e.display_name || e.legal_name}</p>
                        <p className="text-[10px] text-neutral-400">{e.tax_id}{e.uf ? ` · ${e.uf}` : ""}{e.primary_cnae ? ` · CNAE ${e.primary_cnae}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Phase 24C — Upload modal ──────────────────────────────────────────────

function UploadNormModal({
  lang,
  onClose,
  onSaved,
}: {
  lang: Lang;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [body, setBody] = useState("CMN");
  const [normType, setNormType] = useState("resolucao");
  const [normNumber, setNormNumber] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [publishedAt, setPublishedAt] = useState(today);
  const [effectiveAt, setEffectiveAt] = useState("");
  const [impact, setImpact] = useState("medium");
  const [sourceUrl, setSourceUrl] = useState("");
  const [areasInput, setAreasInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSaving(true);
    try {
      const res = await fetch("/api/regulatory/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          norm_type: normType,
          norm_number: normNumber || null,
          title,
          summary: summary || null,
          published_at: publishedAt,
          effective_at: effectiveAt || null,
          impact_level: impact,
          source_url: sourceUrl || null,
          affected_areas: areasInput
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");
      onSaved();
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
            <Upload size={16} className="text-brand-primary" />
            {lang === "pt" ? "Inserir Nova Norma" : "Add New Norm"}
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
              ? "Insira manualmente uma norma encontrada em fontes externas (Diário Oficial, portal do regulador, etc). O documento em si não é armazenado — informe o link da fonte oficial."
              : "Manually insert a norm you've found in external sources (Diário Oficial, regulator portal, etc). The document itself is not stored — provide the official source link."}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label={lang === "pt" ? "Órgão" : "Body"}>
              <select
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              >
                {Object.keys(BODY_STYLES).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
                <option value="OUTROS">OUTROS</option>
              </select>
            </Field>
            <Field label={lang === "pt" ? "Tipo" : "Type"}>
              <select
                value={normType}
                onChange={(e) => setNormType(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              >
                {Object.entries(NORM_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {lang === "pt" ? v.pt : v.en}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label={lang === "pt" ? "Número" : "Number"}>
              <input
                value={normNumber}
                onChange={(e) => setNormNumber(e.target.value)}
                placeholder="ex: 5234"
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </Field>
            <Field label={lang === "pt" ? "Publicada em" : "Published"}>
              <input
                type="date"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </Field>
            <Field label={lang === "pt" ? "Vigência" : "Effective"}>
              <input
                type="date"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </Field>
          </div>

          <Field label={lang === "pt" ? "Título" : "Title"}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lang === "pt" ? "Título da norma" : "Norm title"}
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            />
          </Field>

          <Field label={lang === "pt" ? "Resumo" : "Summary"}>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder={lang === "pt" ? "Pontos principais (opcional)" : "Key points (optional)"}
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={lang === "pt" ? "Impacto" : "Impact"}>
              <select
                value={impact}
                onChange={(e) => setImpact(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              >
                <option value="high">{lang === "pt" ? "Alto" : "High"}</option>
                <option value="medium">{lang === "pt" ? "Médio" : "Medium"}</option>
                <option value="low">{lang === "pt" ? "Baixo" : "Low"}</option>
              </select>
            </Field>
            <Field
              label={lang === "pt" ? "Áreas afetadas" : "Affected areas"}
              hint={lang === "pt" ? "separadas por vírgula" : "comma-separated"}
            >
              <input
                value={areasInput}
                onChange={(e) => setAreasInput(e.target.value)}
                placeholder="credito_rural, cpr, fiagro"
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </Field>
          </div>

          <Field
            label={lang === "pt" ? "URL da fonte oficial" : "Official source URL"}
            hint={lang === "pt" ? "Diário Oficial, site do regulador, etc" : "Diário Oficial, regulator portal, etc"}
          >
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://www.in.gov.br/..."
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-200 bg-neutral-50/50">
          {error && <span className="text-[11px] text-red-600 mr-auto">{error}</span>}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-[12px] font-semibold border border-neutral-200 text-neutral-600 hover:bg-neutral-100 transition-all"
          >
            {lang === "pt" ? "Cancelar" : "Cancel"}
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || saving}
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

function Field({
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

// ─── Phase 24C — Sources list modal ────────────────────────────────────────
//
// Static catalog of the regulatory sources currently in use, plus the
// official portals where the user can hunt for more norms manually.
// Mirrors the REGULATORY_SOURCES constant in /api/cron/sync-regulatory.

const REGULATORY_SOURCES_REFERENCE = [
  // Cron-fed RSS feeds (Phase 1)
  {
    type: "rss",
    name: "ConJur",
    description_pt: "Consultor Jurídico — feed jurídico filtrado por palavras-chave regulatórias",
    description_en: "Consultor Jurídico — legal feed filtered by regulatory keywords",
    url: "https://www.conjur.com.br/rss.xml",
    portal: "https://www.conjur.com.br",
  },
  {
    type: "rss",
    name: "Migalhas",
    description_pt: "Migalhas Quentes — boletim jurídico diário",
    description_en: "Migalhas Quentes — daily legal bulletin",
    url: "https://www.migalhas.com.br/rss/quentes.xml",
    portal: "https://www.migalhas.com.br",
  },
  {
    type: "rss",
    name: "JOTA",
    description_pt: "JOTA — análise jurídica e regulatória",
    description_en: "JOTA — legal and regulatory analysis",
    url: "https://www.jota.info/feed",
    portal: "https://www.jota.info",
  },
  // Official regulator portals (manual reference — used for Inserir Norma URL)
  {
    type: "portal",
    name: "BCB — Normativos",
    description_pt: "Banco Central do Brasil — busca de resoluções, circulares e cartas-circulares",
    description_en: "Brazilian Central Bank — resolutions, circulars and circular letters search",
    url: "https://www.bcb.gov.br/estabilidadefinanceira/buscanormas",
    portal: "https://www.bcb.gov.br",
  },
  {
    type: "portal",
    name: "CMN — Resoluções",
    description_pt: "Conselho Monetário Nacional — resoluções publicadas pelo BCB",
    description_en: "National Monetary Council — resolutions published by BCB",
    url: "https://www.bcb.gov.br/estabilidadefinanceira/cmn",
    portal: "https://www.bcb.gov.br",
  },
  {
    type: "portal",
    name: "CVM — Normativos",
    description_pt: "Comissão de Valores Mobiliários — instruções, deliberações e pareceres",
    description_en: "Securities Commission — instructions, deliberations and opinions",
    url: "https://conteudo.cvm.gov.br/legislacao/normas-cvm/index.html",
    portal: "https://www.cvm.gov.br",
  },
  {
    type: "portal",
    name: "MAPA — Legislação",
    description_pt: "Ministério da Agricultura — instruções normativas e portarias",
    description_en: "Ministry of Agriculture — normative instructions and ordinances",
    url: "https://www.gov.br/agricultura/pt-br/assuntos/sustentabilidade/legislacao",
    portal: "https://www.gov.br/agricultura",
  },
  {
    type: "portal",
    name: "Diário Oficial da União",
    description_pt: "DOU — Imprensa Nacional, busca por publicações oficiais",
    description_en: "DOU — National Press, search for official publications",
    url: "https://www.in.gov.br/leiturajornal",
    portal: "https://www.in.gov.br",
  },
];

function SourcesListModal({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rss = REGULATORY_SOURCES_REFERENCE.filter((s) => s.type === "rss");
  const portals = REGULATORY_SOURCES_REFERENCE.filter((s) => s.type === "portal");

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
            <List size={16} className="text-brand-primary" />
            {lang === "pt" ? "Fontes Regulatórias" : "Regulatory Sources"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* RSS feeds (cron-fed) */}
          <div>
            <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Database size={12} />
              {lang === "pt" ? "RSS automatizados" : "Automated RSS feeds"}
              <span className="text-[9px] font-normal text-neutral-400 ml-1 normal-case">
                {lang === "pt" ? "rodam diariamente via cron" : "run daily via cron"}
              </span>
            </h4>
            <div className="space-y-2">
              {rss.map((s) => (
                <SourceCard key={s.name} source={s} lang={lang} />
              ))}
            </div>
          </div>

          {/* Manual reference portals */}
          <div>
            <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Globe size={12} />
              {lang === "pt" ? "Portais oficiais para consulta manual" : "Official portals for manual lookup"}
              <span className="text-[9px] font-normal text-neutral-400 ml-1 normal-case">
                {lang === "pt" ? "use ao inserir norma" : "use when adding a norm"}
              </span>
            </h4>
            <div className="space-y-2">
              {portals.map((s) => (
                <SourceCard key={s.name} source={s} lang={lang} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceCard({
  source,
  lang,
}: {
  source: (typeof REGULATORY_SOURCES_REFERENCE)[number];
  lang: Lang;
}) {
  return (
    <div className="border border-neutral-200 rounded-md p-3 hover:border-brand-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-neutral-900">{source.name}</p>
          <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
            {lang === "pt" ? source.description_pt : source.description_en}
          </p>
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-brand-primary border border-brand-primary/30 rounded hover:bg-brand-surface transition-colors"
        >
          {lang === "pt" ? "Abrir" : "Open"} <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
}
