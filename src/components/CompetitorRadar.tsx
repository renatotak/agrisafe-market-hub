"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { ExternalLink, AlertCircle, Rocket, Handshake, Users, Newspaper, Loader2, BarChart3 } from "lucide-react";
import { mockCompetitors } from "@/data/mock";
import { MockBadge } from "@/components/ui/MockBadge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis, CartesianGrid,
} from "recharts";

interface CompetitorSignal {
  id: string;
  competitor_id: string;
  type: string;
  title_pt: string;
  title_en: string;
  date: string;
  source: string;
}

interface Competitor {
  id: string;
  name: string;
  segment: string;
  website: string;
  description_pt: string;
  description_en: string;
  competitor_signals: CompetitorSignal[];
}

const signalIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  product_launch: Rocket, funding: AlertCircle, partnership: Handshake, hiring: Users, news: Newspaper,
};

const signalColors: Record<string, string> = {
  product_launch: "bg-blue-100 text-blue-700",
  funding: "bg-green-100 text-green-700",
  partnership: "bg-purple-100 text-purple-700",
  hiring: "bg-amber-100 text-amber-700",
  news: "bg-neutral-100 text-neutral-700",
};

const SIGNAL_CHART_COLORS: Record<string, string> = {
  product_launch: "#3b82f6", funding: "#22c55e", partnership: "#8b5cf6", hiring: "#f59e0b", news: "#6b7280",
};

export function CompetitorRadar({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCharts, setShowCharts] = useState(true);
  const [isMock, setIsMock] = useState(true);

  useEffect(() => {
    async function fetchCompetitors() {
      const { data } = await supabase
        .from("competitors")
        .select("*, competitor_signals(*)")
        .order("name");
      const hasLive = data?.length;
      setCompetitors(hasLive ? data : mockCompetitors);
      setIsMock(!hasLive);
      setLoading(false);
    }
    fetchCompetitors();
  }, []);

  const signalTypeLabel = (type: string) => {
    const labels: Record<string, Record<string, string>> = {
      product_launch: { pt: "Lan\u00e7amento", en: "Launch" },
      funding: { pt: "Capta\u00e7\u00e3o", en: "Funding" },
      partnership: { pt: "Parceria", en: "Partnership" },
      hiring: { pt: "Contrata\u00e7\u00e3o", en: "Hiring" },
      news: { pt: "Not\u00edcia", en: "News" },
    };
    return labels[type]?.[lang] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-brand-primary" />
      </div>
    );
  }

  // Signal type distribution for bar chart
  const signalTypeCounts = Object.keys(signalIcons).map((type) => ({
    type,
    label: signalTypeLabel(type),
    count: competitors.reduce((acc, c) => acc + (c.competitor_signals?.filter((s) => s.type === type).length || 0), 0),
    color: SIGNAL_CHART_COLORS[type],
  }));

  // Timeline scatter data
  const allSignals = competitors.flatMap((c) =>
    (c.competitor_signals || []).map((s) => ({
      ...s,
      competitorName: c.name,
      dateTs: new Date(s.date).getTime(),
      typeIndex: Object.keys(signalIcons).indexOf(s.type),
    }))
  );

  return (
    <div className="pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-neutral-800 tracking-tight">{tr.competitors.title}</h2>
            <p className="text-neutral-500 mt-1 text-sm">{tr.competitors.subtitle}</p>
          </div>
          {isMock && <MockBadge />}
        </div>
        <button
          onClick={() => setShowCharts(!showCharts)}
          className={`p-2 rounded-lg text-sm transition-colors ${showCharts ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-400 hover:bg-neutral-100"}`}
        >
          <BarChart3 size={18} />
        </button>
      </div>

      {/* Analytics Section */}
      {showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Signal Type Distribution */}
          <div className="bg-white rounded-lg p-5 shadow-sm border border-neutral-200/60">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">
              {lang === "pt" ? "Distribui\u00e7\u00e3o por Tipo de Sinal" : "Signal Type Distribution"}
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signalTypeCounts} layout="vertical" barSize={18}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} width={90} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
                    formatter={(value) => [value, lang === "pt" ? "Sinais" : "Signals"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {signalTypeCounts.map((entry) => (
                      <Cell key={entry.type} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Signal Timeline */}
          <div className="bg-white rounded-lg p-5 shadow-sm border border-neutral-200/60">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">
              {lang === "pt" ? "Timeline de Sinais" : "Signal Timeline"}
            </h3>
            {allSignals.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis
                      dataKey="dateTs"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(ts) => new Date(ts).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short" })}
                      tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    />
                    <YAxis
                      dataKey="typeIndex"
                      type="number"
                      domain={[-0.5, Object.keys(signalIcons).length - 0.5]}
                      ticks={Object.keys(signalIcons).map((_, i) => i)}
                      tickFormatter={(i) => signalTypeLabel(Object.keys(signalIcons)[i])}
                      tick={{ fontSize: 10, fill: "#6B7280" }}
                      width={80}
                    />
                    <ZAxis range={[40, 40]} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white p-3 rounded-lg border border-neutral-200 shadow-lg text-xs">
                            <p className="font-semibold text-neutral-800">{d.competitorName}</p>
                            <p className="text-neutral-500">{lang === "pt" ? d.title_pt : d.title_en}</p>
                            <p className="text-neutral-400 mt-1">{new Date(d.date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={allSignals} fill="#5B7A2F" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-neutral-400 italic py-8 text-center">
                {lang === "pt" ? "Sem sinais para exibir" : "No signals to display"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Signal Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {signalTypeCounts.map(({ type, label, count, color }) => {
          const Icon = signalIcons[type];
          return (
            <div key={type} className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200/60 text-center">
              <div className="w-10 h-10 mx-auto rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: `${color}15`, color }}>
                <Icon size={20} />
              </div>
              <p className="text-xl font-bold text-neutral-800">{count}</p>
              <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          );
        })}
      </div>

      {/* Competitor Cards */}
      <div className="space-y-4">
        {competitors.map((comp) => (
          <div key={comp.id} className="bg-white rounded-lg shadow-sm border border-neutral-200/60 overflow-hidden hover:border-neutral-300 transition-colors">
            <div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-100 bg-neutral-50 gap-3">
              <div>
                <h3 className="font-bold text-lg text-neutral-800">{comp.name}</h3>
                <p className="text-sm text-neutral-500">{comp.segment}</p>
              </div>
              <a
                href={`https://${comp.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium bg-white border border-neutral-200 text-neutral-600 px-3 py-1.5 rounded-lg hover:text-neutral-800 transition-colors self-start"
              >
                <span className="hidden sm:inline">{comp.website}</span>
                <ExternalLink size={14} />
              </a>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600 mb-4 leading-relaxed max-w-4xl">
                {lang === "pt" ? comp.description_pt : comp.description_en}
              </p>

              {comp.competitor_signals?.length > 0 ? (
                <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200/60 space-y-2">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                    {lang === "pt" ? "Sinais Recentes" : "Recent Signals"}
                  </p>
                  {comp.competitor_signals.map((signal) => {
                    const Icon = signalIcons[signal.type] || Newspaper;
                    return (
                      <div key={signal.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2 border-b border-neutral-200/40 last:border-0 last:pb-0">
                        <span className={`inline-flex self-start items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md ${signalColors[signal.type]}`}>
                          <Icon size={12} />
                          {signalTypeLabel(signal.type)}
                        </span>
                        <p className="text-sm font-medium text-neutral-700 flex-1">
                          {lang === "pt" ? signal.title_pt : signal.title_en}
                        </p>
                        <span className="text-xs text-neutral-400">
                          {new Date(signal.date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-neutral-400 italic">
                  {lang === "pt" ? "Nenhum sinal recente registrado." : "No recent signals recorded."}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
