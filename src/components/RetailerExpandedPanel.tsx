"use client";

import { useState, useEffect } from "react";
import { Lang } from "@/lib/i18n";
import type { RetailerIntelligence } from "@/data/retailers";
import {
  Brain, Loader2, Newspaper, Factory, TrendingUp, TrendingDown,
  GitBranch, Landmark, Sparkles, ExternalLink, ChevronDown, ChevronUp,
} from "lucide-react";

const POSITION_LABELS: Record<string, { pt: string; en: string; color: string }> = {
  regional_leader: { pt: "Líder Regional", en: "Regional Leader", color: "bg-green-100 text-green-800" },
  expanding: { pt: "Em Expansão", en: "Expanding", color: "bg-blue-100 text-blue-800" },
  niche_player: { pt: "Nicho", en: "Niche Player", color: "bg-purple-100 text-purple-800" },
  stable: { pt: "Estável", en: "Stable", color: "bg-neutral-100 text-neutral-700" },
  declining: { pt: "Em Declínio", en: "Declining", color: "bg-red-100 text-red-800" },
};

interface IndustryLink {
  id: string;
  name: string;
  name_display: string | null;
  segment: string[];
  relationship_type: string;
  product_count: number;
}

interface Props {
  cnpjRaiz: string;
  retailerName: string;
  lang: Lang;
  onIndustryClick?: (industryId: string) => void;
}

export function RetailerExpandedPanel({ cnpjRaiz, retailerName, lang, onIndustryClick }: Props) {
  const [intel, setIntel] = useState<RetailerIntelligence | null>(null);
  const [industries, setIndustries] = useState<IndustryLink[]>([]);
  const [liveNews, setLiveNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAllNews, setShowAllNews] = useState(false);

  useEffect(() => {
    fetchIntelligence();
  }, [cnpjRaiz]);

  const fetchIntelligence = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/retailer-intelligence?cnpj_raiz=${cnpjRaiz}`);
      const data = await res.json();
      setIntel(data.intelligence || null);
      setIndustries(data.industries || []);
      setLiveNews(data.live_news || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const triggerAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/retailer-intelligence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj_raiz: cnpjRaiz }),
      });
      const data = await res.json();
      if (data.intelligence) {
        setIntel(data.intelligence);
      }
    } catch {
      // silent
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-neutral-400 text-[12px]">
        <Loader2 size={14} className="animate-spin" />
        {lang === "pt" ? "Carregando inteligência..." : "Loading intelligence..."}
      </div>
    );
  }

  const posConfig = POSITION_LABELS[intel?.market_position || "stable"] || POSITION_LABELS.stable;
  const newsToShow = showAllNews ? liveNews : liveNews.slice(0, 3);
  const allSignals = [
    ...(intel?.growth_signals || []).map(s => ({ ...s, kind: "growth" as const })),
    ...(intel?.risk_signals || []).map(s => ({ ...s, kind: "risk" as const })),
  ];

  return (
    <div className="space-y-4 mt-4">
      {/* ── AI Intelligence Card ── */}
      <div className="bg-white rounded-lg border border-emerald-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
            <Brain size={12} />
            {lang === "pt" ? "Inteligência AI" : "AI Intelligence"}
          </h4>
          <div className="flex items-center gap-2">
            {intel?.analyzed_at && (
              <span className="text-[9px] text-neutral-400">
                {lang === "pt" ? "Analisado" : "Analyzed"}: {new Date(intel.analyzed_at).toLocaleDateString("pt-BR")}
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); triggerAnalysis(); }}
              disabled={analyzing}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
            >
              {analyzing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              {analyzing
                ? (lang === "pt" ? "Analisando..." : "Analyzing...")
                : (lang === "pt" ? "Analisar com IA" : "Analyze with AI")}
            </button>
          </div>
        </div>

        {intel?.executive_summary ? (
          <div className="p-4 space-y-4">
            {/* Summary */}
            <p className="text-[12px] text-neutral-700 leading-relaxed whitespace-pre-line">{intel.executive_summary}</p>

            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Market Position */}
              <div className="text-center p-2 rounded-lg bg-neutral-50 border border-neutral-100">
                <p className="text-[9px] font-bold text-neutral-400 uppercase">{lang === "pt" ? "Posição" : "Position"}</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${posConfig.color}`}>
                  {lang === "pt" ? posConfig.pt : posConfig.en}
                </span>
              </div>

              {/* Branch Dynamics */}
              <div className="text-center p-2 rounded-lg bg-neutral-50 border border-neutral-100">
                <p className="text-[9px] font-bold text-neutral-400 uppercase flex items-center justify-center gap-1">
                  <GitBranch size={10} />
                  {lang === "pt" ? "Filiais" : "Branches"}
                </p>
                <p className="text-[16px] font-bold text-neutral-900 mt-0.5">{intel.branch_count_current ?? "—"}</p>
                {intel.branch_expansion_detected && (
                  <p className="text-[9px] text-green-600 font-semibold">
                    +{(intel.branch_count_current || 0) - (intel.branch_count_previous || 0)} {lang === "pt" ? "novas" : "new"}
                  </p>
                )}
              </div>

              {/* News Mentions */}
              <div className="text-center p-2 rounded-lg bg-neutral-50 border border-neutral-100">
                <p className="text-[9px] font-bold text-neutral-400 uppercase flex items-center justify-center gap-1">
                  <Newspaper size={10} />
                  {lang === "pt" ? "Menções" : "Mentions"}
                </p>
                <p className="text-[16px] font-bold text-neutral-900 mt-0.5">{intel.news_mentions || liveNews.length}</p>
              </div>

              {/* Financial Instruments */}
              <div className="text-center p-2 rounded-lg bg-neutral-50 border border-neutral-100">
                <p className="text-[9px] font-bold text-neutral-400 uppercase flex items-center justify-center gap-1">
                  <Landmark size={10} />
                  {lang === "pt" ? "Títulos" : "Instruments"}
                </p>
                <p className="text-[16px] font-bold text-neutral-900 mt-0.5">{intel.financial_instruments?.length || 0}</p>
              </div>
            </div>

            {/* Signals */}
            {allSignals.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Growth Signals */}
                {(intel.growth_signals?.length || 0) > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <TrendingUp size={10} />
                      {lang === "pt" ? "Sinais de Crescimento" : "Growth Signals"} ({intel.growth_signals!.length})
                    </p>
                    <div className="space-y-1">
                      {intel.growth_signals!.slice(0, 5).map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-neutral-600 pl-2 border-l-2 border-green-200">
                          <span className="text-[9px] font-mono text-green-600 bg-green-50 px-1 rounded shrink-0">{s.type}</span>
                          <span>{s.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risk Signals */}
                {(intel.risk_signals?.length || 0) > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <TrendingDown size={10} />
                      {lang === "pt" ? "Sinais de Risco" : "Risk Signals"} ({intel.risk_signals!.length})
                    </p>
                    <div className="space-y-1">
                      {intel.risk_signals!.slice(0, 5).map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-neutral-600 pl-2 border-l-2 border-red-200">
                          <span className="text-[9px] font-mono text-red-600 bg-red-50 px-1 rounded shrink-0">{s.type}</span>
                          <span>{s.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Financial Instruments */}
            {(intel.financial_instruments?.length || 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Landmark size={10} />
                  {lang === "pt" ? "Instrumentos Financeiros Detectados" : "Financial Instruments Detected"}
                </p>
                <div className="space-y-1">
                  {intel.financial_instruments!.map((fi, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] pl-2 border-l-2 border-amber-200">
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">{fi.type}</span>
                      <span className="text-neutral-600">{fi.detail}</span>
                      {fi.amount && <span className="text-neutral-500 font-mono">{fi.amount}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center">
            <Brain size={28} className="mx-auto mb-2 text-neutral-300" />
            <p className="text-[12px] text-neutral-500 mb-2">
              {lang === "pt"
                ? "Nenhuma análise AI disponível ainda para esta empresa."
                : "No AI analysis available yet for this company."}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); triggerAnalysis(); }}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {analyzing
                ? (lang === "pt" ? "Analisando..." : "Analyzing...")
                : (lang === "pt" ? "Gerar Análise AI" : "Generate AI Analysis")}
            </button>
          </div>
        )}
      </div>

      {/* ── News Mentions ── */}
      {liveNews.length > 0 && (
        <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <h4 className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <Newspaper size={12} />
              {lang === "pt" ? "Menções em Notícias" : "News Mentions"} ({liveNews.length})
            </h4>
          </div>
          <div className="p-3 space-y-1.5">
            {newsToShow.map((n: any) => (
              <div key={n.id} className="flex items-start justify-between gap-2 pl-2 border-l-2 border-blue-100 py-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-neutral-800 truncate">{n.title}</p>
                  <p className="text-[10px] text-neutral-400">{n.source_name} — {n.published_at?.slice(0, 10)}</p>
                </div>
                {n.source_url && (
                  <a href={n.source_url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-600 shrink-0" onClick={e => e.stopPropagation()}>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
            {liveNews.length > 3 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAllNews(!showAllNews); }}
                className="text-[10px] text-blue-600 font-semibold flex items-center gap-1 mt-1"
              >
                {showAllNews ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {showAllNews ? (lang === "pt" ? "Menos" : "Less") : `+${liveNews.length - 3} ${lang === "pt" ? "mais" : "more"}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Industry Relationships ── */}
      {industries.length > 0 && (
        <div className="bg-white rounded-lg border border-green-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-green-50 border-b border-green-100 flex items-center justify-between">
            <h4 className="text-[10px] font-semibold text-green-700 uppercase tracking-wider flex items-center gap-1.5">
              <Factory size={12} />
              {lang === "pt" ? "Indústrias Vinculadas" : "Industry Relationships"} ({industries.length})
            </h4>
          </div>
          <div className="p-3 space-y-1.5">
            {industries.map((ind) => (
              <div
                key={ind.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-neutral-100 hover:border-green-200 hover:bg-green-50/30 transition-colors cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onIndustryClick?.(ind.id); }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] font-semibold text-neutral-900">{ind.name_display || ind.name}</span>
                  <span className="text-[9px] font-medium text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">{ind.relationship_type}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {ind.product_count > 0 && (
                    <span className="text-[10px] text-neutral-500">{ind.product_count} {lang === "pt" ? "produtos" : "products"}</span>
                  )}
                  {ind.segment?.length > 0 && (
                    <span className="text-[9px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{ind.segment.slice(0, 2).join(", ")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
