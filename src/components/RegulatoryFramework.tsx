"use client";

import { useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { mockRegulatoryNorms } from "@/data/mock";
import { Badge } from "@/components/ui/Badge";
import { MockBadge } from "@/components/ui/MockBadge";
import {
  ExternalLink, AlertTriangle, Calendar, BookOpen,
  ChevronRight, Filter,
} from "lucide-react";

const BODY_STYLES: Record<string, { color: string; full: string }> = {
  CMN: { color: "bg-[#1565C0] text-white", full: "Conselho Monet\u00e1rio Nacional" },
  BCB: { color: "bg-[#005CA9] text-white", full: "Banco Central do Brasil" },
  CVM: { color: "bg-[#2E7D32] text-white", full: "Comiss\u00e3o de Valores Mobili\u00e1rios" },
  MAPA: { color: "bg-[#E65100] text-white", full: "Minist\u00e9rio da Agricultura" },
};

const IMPACT_BADGE: Record<string, { variant: "error" | "warning" | "default"; pt: string; en: string }> = {
  high: { variant: "error", pt: "Alto Impacto", en: "High Impact" },
  medium: { variant: "warning", pt: "M\u00e9dio", en: "Medium" },
  low: { variant: "default", pt: "Baixo", en: "Low" },
};

const NORM_TYPE_LABELS: Record<string, { pt: string; en: string }> = {
  resolucao: { pt: "Resolu\u00e7\u00e3o", en: "Resolution" },
  circular: { pt: "Circular", en: "Circular" },
  instrucao_normativa: { pt: "Instru\u00e7\u00e3o Normativa", en: "Normative Instruction" },
};

const AREA_LABELS: Record<string, { pt: string; en: string }> = {
  credito_rural: { pt: "Cr\u00e9dito Rural", en: "Rural Credit" },
  cpr: { pt: "CPR", en: "CPR" },
  cooperativas: { pt: "Cooperativas", en: "Cooperatives" },
  registro: { pt: "Registro", en: "Registry" },
  cra: { pt: "CRA", en: "CRA" },
  lca: { pt: "LCA", en: "LCA" },
  mercado_capitais: { pt: "Mercado de Capitais", en: "Capital Markets" },
  revendas: { pt: "Revendas", en: "Resellers" },
  defensivos: { pt: "Defensivos", en: "Crop Protection" },
  rastreabilidade: { pt: "Rastreabilidade", en: "Traceability" },
  seguro_rural: { pt: "Seguro Rural", en: "Rural Insurance" },
  proagro: { pt: "PROAGRO", en: "PROAGRO" },
  provisionamento: { pt: "Provisionamento", en: "Provisioning" },
  risco: { pt: "Risco", en: "Risk" },
  fiagro: { pt: "Fiagro", en: "Fiagro" },
  esg: { pt: "ESG", en: "ESG" },
  fundos: { pt: "Fundos", en: "Funds" },
  sementes: { pt: "Sementes", en: "Seeds" },
  financiamento: { pt: "Financiamento", en: "Financing" },
};

export function RegulatoryFramework({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [bodyFilter, setBodyFilter] = useState("");
  const [impactFilter, setImpactFilter] = useState("");
  const norms = mockRegulatoryNorms;

  const filtered = norms.filter((n) => {
    if (bodyFilter && n.body !== bodyFilter) return false;
    if (impactFilter && n.impact_level !== impactFilter) return false;
    return true;
  });

  const highImpact = norms.filter((n) => n.impact_level === "high");

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-neutral-900">{tr.regulatory.title}</h2>
            <p className="text-[12px] text-neutral-500 mt-0.5">{tr.regulatory.subtitle}</p>
          </div>
          <MockBadge />
        </div>
      </div>

      {/* Impact Alerts */}
      {highImpact.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-3 flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-error" />
            {tr.regulatory.impactAlerts}
          </h3>
          <div className="space-y-2">
            {highImpact.map((norm) => (
              <div key={norm.id} className="bg-error-light border border-[#FFCDD2] rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BODY_STYLES[norm.body]?.color || "bg-neutral-600 text-white"}`}>{norm.body}</span>
                    <span className="text-[11px] text-neutral-500">{NORM_TYPE_LABELS[norm.norm_type]?.[lang === "pt" ? "pt" : "en"] || norm.norm_type} {norm.norm_number}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-error-dark">{norm.title}</p>
                  {norm.effective_at && (
                    <p className="text-[11px] text-neutral-500 mt-1">
                      {tr.regulatory.effectiveAt}: {new Date(norm.effective_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Reference Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(BODY_STYLES).map(([body, info]) => {
          const count = norms.filter((n) => n.body === body).length;
          return (
            <button key={body} onClick={() => setBodyFilter(bodyFilter === body ? "" : body)}
              className={`rounded-lg p-4 border text-left transition-all ${bodyFilter === body ? "border-brand-primary bg-brand-surface/50" : "border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-neutral-300"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${info.color}`}>{body}</span>
                <span className="text-[18px] font-bold text-neutral-900">{count}</span>
              </div>
              <p className="text-[11px] text-neutral-500 truncate">{info.full}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-white border border-neutral-300 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary">
          <option value="">{lang === "pt" ? "Todos os Impactos" : "All Impacts"}</option>
          <option value="high">{tr.regulatory.high}</option>
          <option value="medium">{tr.regulatory.medium}</option>
          <option value="low">{tr.regulatory.low}</option>
        </select>
        {bodyFilter && (
          <button onClick={() => setBodyFilter("")} className="px-3 py-2 rounded-md text-[12px] font-medium bg-brand-primary text-white">
            {bodyFilter} \u00d7
          </button>
        )}
      </div>

      {/* Norms Feed */}
      <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-3">{tr.regulatory.recentChanges}</h3>
      <div className="space-y-3">
        {filtered.map((norm) => {
          const impactInfo = IMPACT_BADGE[norm.impact_level] || IMPACT_BADGE.medium;
          return (
            <div key={norm.id} className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BODY_STYLES[norm.body]?.color || "bg-neutral-600 text-white"}`}>{norm.body}</span>
                  <span className="text-[12px] text-neutral-500 font-medium">
                    {NORM_TYPE_LABELS[norm.norm_type]?.[lang === "pt" ? "pt" : "en"] || norm.norm_type} {norm.norm_number}
                  </span>
                  <Badge variant={impactInfo.variant}>{lang === "pt" ? impactInfo.pt : impactInfo.en}</Badge>
                </div>
                <time className="text-[11px] text-neutral-400 whitespace-nowrap">
                  {new Date(norm.published_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                </time>
              </div>

              <h3 className="font-semibold text-neutral-900 text-[14px] leading-snug mb-2">{norm.title}</h3>
              {norm.summary && <p className="text-[12px] text-neutral-600 leading-relaxed mb-3">{norm.summary}</p>}

              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {norm.affected_areas.map((area) => (
                    <span key={area} className="text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full font-medium">
                      {AREA_LABELS[area]?.[lang === "pt" ? "pt" : "en"] || area}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-neutral-400 shrink-0">
                  {norm.effective_at && (
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {tr.regulatory.effectiveAt}: {new Date(norm.effective_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", year: "numeric" })}
                    </span>
                  )}
                  {norm.source_url && (
                    <a href={norm.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-primary hover:text-brand-dark font-medium">
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
