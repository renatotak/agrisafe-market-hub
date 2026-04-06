"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle, ChevronDown, ChevronUp, MapPin, DollarSign, Building2,
  ExternalLink, Loader2, Shield,
} from "lucide-react";

interface RiskSignalRow {
  /** Canonical legal-entity id from v_retailers_in_rj (Phase 17C). */
  entity_uid: string | null;
  cnpj_raiz: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  classificacao: string | null;
  faixa_faturamento: string | null;
  porte_name: string | null;
  rj_status: string;
  rj_filing_date: string | null;
  rj_summary: string | null;
  rj_source: string | null;
  rj_debt_value: number | null;
  rj_state: string | null;
  rj_entity_type: string | null;
}

interface RiskSignalsProps {
  lang: Lang;
  /** Compact mode shows only the KPI strip (for embedding in Dashboard) */
  compact?: boolean;
  /** Optional click handler when user wants to drill down */
  onDrilldown?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  em_andamento: "bg-amber-100 text-amber-800",
  encerrado: "bg-error-light text-error-dark",
  liquidacao: "bg-purple-100 text-purple-800",
  deferido: "bg-blue-100 text-blue-800",
};

const STATUS_LABELS: Record<string, { pt: string; en: string }> = {
  em_andamento: { pt: "Em andamento", en: "In progress" },
  encerrado: { pt: "Encerrado", en: "Closed" },
  liquidacao: { pt: "Liquidação", en: "Liquidation" },
  deferido: { pt: "Deferido", en: "Granted" },
};

function formatCurrency(value: number | null): string {
  if (!value || value === 0) return "—";
  if (value >= 1e9) return `R$ ${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `R$ ${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `R$ ${(value / 1e3).toFixed(0)}K`;
  return `R$ ${value}`;
}

export function RiskSignals({ lang, compact = false, onDrilldown }: RiskSignalsProps) {
  const [rows, setRows] = useState<RiskSignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    supabase
      .from("v_retailers_in_rj")
      .select("*")
      .order("rj_debt_value", { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        setRows((data || []) as RiskSignalRow[]);
        setLoading(false);
      });
  }, []);

  // ─── Aggregations ───
  const totalRetailers = rows.length;
  const totalExposed = rows.reduce((sum, r) => sum + (r.rj_debt_value || 0), 0);
  const statusCounts: Record<string, number> = {};
  const states = new Set<string>();
  rows.forEach((r) => {
    statusCounts[r.rj_status] = (statusCounts[r.rj_status] || 0) + 1;
    if (r.rj_state) states.add(r.rj_state);
  });

  // Group AgroGalaxy and similar groups by nome_fantasia
  const groupedDebt: Record<string, { count: number; debt: number }> = {};
  rows.forEach((r) => {
    const key = r.nome_fantasia && r.nome_fantasia.length < 30 ? r.nome_fantasia : (r.razao_social || r.cnpj_raiz);
    if (!groupedDebt[key]) groupedDebt[key] = { count: 0, debt: 0 };
    groupedDebt[key].count += 1;
    groupedDebt[key].debt += r.rj_debt_value || 0;
  });
  const topGroups = Object.entries(groupedDebt)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.debt - a.debt)
    .slice(0, 5);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 mb-6 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-neutral-400" />
      </div>
    );
  }

  if (totalRetailers === 0) {
    return null;
  }

  // ─── Compact mode: KPI strip only ───
  if (compact) {
    return (
      <button
        onClick={onDrilldown}
        className="w-full text-left bg-error-light/30 rounded-lg border border-error-light/50 p-4 hover:border-error transition-colors"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle size={12} className="text-error" />
          <p className="text-[10px] font-semibold text-error/80 uppercase">
            {lang === "pt" ? "Sinais de Risco" : "Risk Signals"}
          </p>
        </div>
        <p className="text-[20px] font-bold text-error-dark leading-tight">{totalRetailers}</p>
        <p className="text-[11px] text-error/70 mt-0.5">
          {lang === "pt" ? "canais em RJ" : "channels in RJ"} · {formatCurrency(totalExposed)}
        </p>
      </button>
    );
  }

  // ─── Full panel mode ───
  return (
    <div className="bg-gradient-to-br from-error-light/20 to-white rounded-lg border border-error-light shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-error-light/50 flex items-center justify-between bg-error-light/30">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-error" />
          <div>
            <h3 className="text-[14px] font-bold text-error-dark">
              {lang === "pt" ? "Sinais de Risco — Cruzamento Diretório × Recuperação Judicial" : "Risk Signals — Directory × Judicial Recovery Cross-Reference"}
            </h3>
            <p className="text-[11px] text-error/70 mt-0.5">
              {lang === "pt"
                ? "Canais do diretório de revendas com situação especial registrada na Receita Federal"
                : "Directory channels with special status registered at Receita Federal"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] font-semibold text-error hover:text-error-dark"
        >
          {expanded ? (lang === "pt" ? "Ocultar" : "Hide") : (lang === "pt" ? "Ver detalhes" : "View details")}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        <div className="bg-white rounded-md border border-error-light/50 p-3">
          <div className="flex items-center gap-1">
            <Building2 size={11} className="text-error/60" />
            <p className="text-[10px] font-semibold text-error/70 uppercase">
              {lang === "pt" ? "Canais Afetados" : "Affected Channels"}
            </p>
          </div>
          <p className="text-[22px] font-bold text-error-dark mt-1">{totalRetailers}</p>
        </div>
        <div className="bg-white rounded-md border border-error-light/50 p-3">
          <div className="flex items-center gap-1">
            <DollarSign size={11} className="text-error/60" />
            <p className="text-[10px] font-semibold text-error/70 uppercase">
              {lang === "pt" ? "Capital Exposto" : "Exposed Capital"}
            </p>
          </div>
          <p className="text-[22px] font-bold text-error-dark mt-1">{formatCurrency(totalExposed)}</p>
        </div>
        <div className="bg-white rounded-md border border-error-light/50 p-3">
          <div className="flex items-center gap-1">
            <AlertTriangle size={11} className="text-error/60" />
            <p className="text-[10px] font-semibold text-error/70 uppercase">
              {lang === "pt" ? "Em Andamento" : "In Progress"}
            </p>
          </div>
          <p className="text-[22px] font-bold text-error-dark mt-1">{statusCounts.em_andamento || 0}</p>
        </div>
        <div className="bg-white rounded-md border border-error-light/50 p-3">
          <div className="flex items-center gap-1">
            <MapPin size={11} className="text-error/60" />
            <p className="text-[10px] font-semibold text-error/70 uppercase">
              {lang === "pt" ? "Estados" : "States"}
            </p>
          </div>
          <p className="text-[22px] font-bold text-error-dark mt-1">{states.size}</p>
        </div>
      </div>

      {/* Top Groups by Debt */}
      <div className="px-4 pb-4">
        <p className="text-[10px] font-semibold text-error/70 uppercase mb-2">
          {lang === "pt" ? "Top 5 Grupos por Capital Exposto" : "Top 5 Groups by Exposed Capital"}
        </p>
        <div className="space-y-1.5">
          {topGroups.map((g, i) => {
            const pct = totalExposed > 0 ? (g.debt / totalExposed) * 100 : 0;
            return (
              <div key={g.name} className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-error/60 w-4 shrink-0">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[12px] font-semibold text-neutral-800 truncate">
                      {g.name}
                      {g.count > 1 && (
                        <span className="text-[10px] text-neutral-400 ml-1">
                          ({g.count} {lang === "pt" ? "entidades" : "entities"})
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] font-bold text-error-dark shrink-0">{formatCurrency(g.debt)}</span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-error to-error-dark rounded-full"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded Detail Table */}
      {expanded && (
        <div className="border-t border-error-light/50 max-h-[400px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-error-light/20 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-error/80">
                  {lang === "pt" ? "Canal" : "Channel"}
                </th>
                <th className="text-left px-2 py-2 font-semibold text-error/80">
                  {lang === "pt" ? "Classe" : "Class"}
                </th>
                <th className="text-left px-2 py-2 font-semibold text-error/80">UF</th>
                <th className="text-left px-2 py-2 font-semibold text-error/80">Status</th>
                <th className="text-right px-2 py-2 font-semibold text-error/80">
                  {lang === "pt" ? "Capital" : "Capital"}
                </th>
                <th className="text-left px-4 py-2 font-semibold text-error/80">
                  {lang === "pt" ? "Data" : "Date"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = STATUS_LABELS[r.rj_status]?.[lang === "pt" ? "pt" : "en"] || r.rj_status;
                const statusColor = STATUS_COLORS[r.rj_status] || "bg-neutral-100 text-neutral-700";
                const displayName = r.nome_fantasia || r.razao_social?.replace(/ EM RECUPERACAO JUDICIAL$/i, "").trim() || r.cnpj_raiz;
                return (
                  <tr key={r.cnpj_raiz} className="border-b border-error-light/20 hover:bg-error-light/10 transition-colors">
                    <td className="px-4 py-2 font-medium text-neutral-800">
                      <div className="truncate max-w-[260px]" title={r.razao_social || ""}>{displayName}</div>
                    </td>
                    <td className="px-2 py-2">
                      {r.classificacao && r.classificacao !== "0" ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                          {r.classificacao}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-2 font-mono text-neutral-600">{r.rj_state || "—"}</td>
                    <td className="px-2 py-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${statusColor}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-error-dark">
                      {formatCurrency(r.rj_debt_value)}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">
                      {r.rj_filing_date ? new Date(r.rj_filing_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
