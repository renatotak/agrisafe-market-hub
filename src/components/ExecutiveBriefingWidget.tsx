"use client";

import { useState, useEffect } from "react";
import { Lang } from "@/lib/i18n";
import {
  FileText, TrendingUp, TrendingDown, Scale, AlertTriangle,
  Calendar, Activity, ChevronDown, ChevronUp, Loader2, RefreshCw,
} from "lucide-react";

interface Briefing {
  briefing_date: string;
  generated_at: string;
  executive_summary: string | null;
  market_moves: { commodity: string; price: number; change_pct: number; unit: string }[];
  top_news: { title: string; summary: string; category: string; source: string; url?: string }[];
  regulatory_updates: { title: string; body: string; impact: string; areas: string[] }[];
  rj_alerts: { company: string; cnpj: string }[];
  upcoming_events: { name: string; date: string; location: string }[];
  price_ruptures: { commodity: string; price: number; change_pct: number; sigma: number; stddev: number; unit: string }[];
  source_health: { total: number; healthy: number; error: number };
}

export function ExecutiveBriefingWidget({ lang }: { lang: Lang }) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchBriefing = () => {
    setLoading(true);
    fetch("/api/executive-briefing")
      .then((r) => r.json())
      .then((json) => {
        if (json.briefing) setBriefing(json.briefing);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(fetchBriefing, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!briefing) return null;

  const dateLabel = new Date(briefing.briefing_date + "T12:00:00").toLocaleDateString(
    lang === "pt" ? "pt-BR" : "en-US",
    { weekday: "long", day: "numeric", month: "long" },
  );

  const generatedTime = new Date(briefing.generated_at).toLocaleTimeString(
    lang === "pt" ? "pt-BR" : "en-US",
    { hour: "2-digit", minute: "2-digit" },
  );

  const hasMoves = briefing.market_moves?.length > 0;
  const hasNews = briefing.top_news?.length > 0;
  const hasRegs = briefing.regulatory_updates?.length > 0;
  const hasRJ = briefing.rj_alerts?.length > 0;
  const hasEvents = briefing.upcoming_events?.length > 0;
  const hasRuptures = briefing.price_ruptures?.length > 0;

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center">
            <FileText size={16} className="text-brand-primary" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-neutral-900 flex items-center gap-2">
              {lang === "pt" ? "Briefing Executivo" : "Executive Briefing"}
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary uppercase">
                {dateLabel}
              </span>
            </h3>
            <p className="text-[10px] text-neutral-400">
              {lang === "pt" ? `Gerado às ${generatedTime}` : `Generated at ${generatedTime}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBriefing}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            title={lang === "pt" ? "Atualizar" : "Refresh"}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Executive Summary — always visible */}
      {briefing.executive_summary && (
        <div className="px-5 py-4">
          <p className="text-[12px] text-neutral-700 leading-relaxed whitespace-pre-line">
            {expanded ? briefing.executive_summary : briefing.executive_summary.slice(0, 300) + (briefing.executive_summary.length > 300 ? "…" : "")}
          </p>
        </div>
      )}

      {/* Quick Stats Strip */}
      <div className="px-5 pb-3 flex flex-wrap gap-3">
        {hasMoves && briefing.market_moves.slice(0, 3).map((m, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px]">
            {m.change_pct >= 0
              ? <TrendingUp size={12} className="text-success-dark" />
              : <TrendingDown size={12} className="text-error" />}
            <span className="font-semibold text-neutral-700">{m.commodity}</span>
            <span className={m.change_pct >= 0 ? "text-success-dark font-bold" : "text-error font-bold"}>
              {m.change_pct > 0 ? "+" : ""}{m.change_pct.toFixed(1)}%
            </span>
          </div>
        ))}
        {hasRuptures && (
          <div className="flex items-center gap-1.5 text-[11px] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <Activity size={12} className="text-amber-600" />
            <span className="text-amber-700 font-bold">
              {briefing.price_ruptures.length} {lang === "pt" ? "anomalia(s)" : "anomaly(ies)"}
            </span>
          </div>
        )}
        {hasRegs && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Scale size={12} className="text-blue-600" />
            <span className="text-neutral-600">
              {briefing.regulatory_updates.length} {lang === "pt" ? "norma(s)" : "norm(s)"}
            </span>
          </div>
        )}
        {hasRJ && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <AlertTriangle size={12} className="text-error" />
            <span className="text-neutral-600">
              {briefing.rj_alerts.length} {lang === "pt" ? "novo(s) RJ" : "new RJ"}
            </span>
          </div>
        )}
        {hasEvents && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Calendar size={12} className="text-amber-600" />
            <span className="text-neutral-600">
              {briefing.upcoming_events.length} {lang === "pt" ? "evento(s)" : "event(s)"}
            </span>
          </div>
        )}
        {briefing.source_health && (
          <div className="flex items-center gap-1.5 text-[11px] ml-auto">
            <Activity size={12} className={briefing.source_health.error > 0 ? "text-error" : "text-success-dark"} />
            <span className="text-neutral-400">
              {briefing.source_health.healthy}/{briefing.source_health.total} {lang === "pt" ? "fontes OK" : "sources OK"}
            </span>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-neutral-100 pt-4">
          {/* Price Anomalies */}
          {hasRuptures && (
            <div>
              <h4 className="text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Activity size={12} />
                {lang === "pt" ? "Anomalias de Preço" : "Price Anomalies"}
              </h4>
              <div className="space-y-1.5">
                {briefing.price_ruptures.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] bg-amber-50/50 border border-amber-100 rounded px-2.5 py-1.5">
                    <span className="font-bold text-amber-700">{r.sigma}σ</span>
                    <span className="font-semibold text-neutral-800">{r.commodity}</span>
                    <span className={r.change_pct >= 0 ? "text-success-dark font-bold" : "text-error font-bold"}>
                      {r.change_pct > 0 ? "+" : ""}{r.change_pct.toFixed(1)}%
                    </span>
                    <span className="text-neutral-400">
                      (avg: {r.stddev.toFixed(1)}% stddev)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top News */}
          {hasNews && (
            <div>
              <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                {lang === "pt" ? "Principais Notícias" : "Top News"}
              </h4>
              <div className="space-y-2">
                {briefing.top_news.slice(0, 5).map((n, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[9px] font-bold text-neutral-400 mt-0.5 shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-neutral-800 truncate">
                        {n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary">{n.title}</a> : n.title}
                      </p>
                      {n.category && <span className="text-[9px] text-neutral-400 uppercase">{n.category}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regulatory Updates */}
          {hasRegs && (
            <div>
              <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                {lang === "pt" ? "Atualizações Regulatórias" : "Regulatory Updates"}
              </h4>
              <div className="space-y-1.5">
                {briefing.regulatory_updates.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.impact === "high" ? "bg-error-light text-error-dark" : "bg-neutral-100 text-neutral-600"}`}>
                      {r.body}
                    </span>
                    <span className="text-neutral-700 truncate">{r.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Events */}
          {hasEvents && (
            <div>
              <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                {lang === "pt" ? "Eventos Próximos" : "Upcoming Events"}
              </h4>
              <div className="space-y-1.5">
                {briefing.upcoming_events.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="text-[9px] font-semibold text-amber-600 shrink-0">{e.date}</span>
                    <span className="text-neutral-700 truncate">{e.name}</span>
                    {e.location && <span className="text-neutral-400 shrink-0">· {e.location}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RJ Alerts */}
          {hasRJ && (
            <div>
              <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                {lang === "pt" ? "Alertas RJ" : "RJ Alerts"}
              </h4>
              <div className="space-y-1">
                {briefing.rj_alerts.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <AlertTriangle size={11} className="text-error shrink-0" />
                    <span className="text-neutral-700">{r.company}</span>
                    {r.cnpj && <span className="text-neutral-400 text-[10px]">{r.cnpj}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
