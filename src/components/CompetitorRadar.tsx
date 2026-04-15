"use client";

import { useEffect, useState } from "react";
// @ts-ignore — react-dom types available at runtime
import { createPortal } from "react-dom";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  ExternalLink, AlertCircle, Rocket, Handshake, Users, Newspaper, Loader2, BarChart3,
  Plus, Pencil, Trash2, X, Save, Globe, Sparkles, FileText,
} from "lucide-react";
import { MockBadge } from "@/components/ui/MockBadge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis, CartesianGrid,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CompetitorSignal {
  id: string;
  competitor_id: string;
  type: string;
  title_pt: string;
  title_en: string;
  date: string;
  source: string;
  url?: string;
}

interface HarveyScores {
  vertical: number;
  depth: number;
  precision: number;
  pulse: number;
  regulatory: number;
  ux: number;
}

interface Competitor {
  id: string;
  name: string;
  vertical: string | null;
  segment: string | null;
  website: string | null;
  country: string | null;
  description_pt: string | null;
  description_en: string | null;
  notes: string | null;
  notes_updated_at: string | null;
  last_web_enrichment_at: string | null;
  entity_uid: string | null;
  legal_entities: { tax_id: string } | null;
  // Legacy score columns mirrored from harvey_ball_scores
  score_depth: number | null;
  score_precision: number | null;
  score_pulse: number | null;
  score_regulatory: number | null;
  score_ux: number | null;
  score_credit: number | null;
  harvey_ball_scores: Partial<HarveyScores> | null;
  competitor_signals: CompetitorSignal[];
}

const HARVEY_KEYS: (keyof HarveyScores)[] = ["vertical", "depth", "precision", "pulse", "regulatory", "ux"];

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

// ─── Harvey Ball SVG ────────────────────────────────────────────────────────

function HarveyBall({ score }: { score: number }) {
  const rotation = -90;
  const size = 18;
  const center = size / 2;
  const radius = (size / 2) - 1.5;

  if (score >= 4) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={radius} fill="currentColor" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }
  if (score <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }

  const percentage = (score / 4) * 100;
  const angle = (percentage / 100) * 360;
  const x = center + radius * Math.cos((angle + rotation) * (Math.PI / 180));
  const y = center + radius * Math.sin((angle + rotation) * (Math.PI / 180));
  const largeArcFlag = angle > 180 ? 1 : 0;
  const pathData = [
    `M ${center} ${center}`,
    `L ${center} ${center - radius}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x} ${y}`,
    "Z",
  ].join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-0">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth="1" />
      <path d={pathData} fill="currentColor" />
    </svg>
  );
}

// Read the canonical Harvey scores from a competitor row, falling back to
// the legacy score_* columns when harvey_ball_scores hasn't been written yet.
function getHarveyScores(c: Competitor): HarveyScores {
  const hb = c.harvey_ball_scores || {};
  return {
    vertical: hb.vertical ?? 0,
    depth: hb.depth ?? c.score_depth ?? 0,
    precision: hb.precision ?? c.score_precision ?? 0,
    pulse: hb.pulse ?? c.score_pulse ?? 0,
    regulatory: hb.regulatory ?? c.score_regulatory ?? 0,
    ux: hb.ux ?? c.score_ux ?? 0,
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CompetitorRadar({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCharts, setShowCharts] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchCompetitors = async () => {
    const { data: logData } = await supabase
      .from("sync_logs")
      .select("finished_at")
      .eq("source", "sync-competitors")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1);
    if (logData && logData.length > 0) {
      setLastSync(logData[0].finished_at);
    }

    const { data } = await supabase
      .from("competitors")
      .select(`*, legal_entities(tax_id), competitor_signals(*)`)
      .order("name");

    if (data && data.length > 0) {
      setCompetitors(data as unknown as Competitor[]);
      setIsMock(false);
    } else {
      setCompetitors([]);
      setIsMock(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompetitors();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

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

  const handleDelete = async (comp: Competitor) => {
    if (!window.confirm(tr.competitors.deleteConfirm)) return;
    const res = await fetch(`/api/competitors/crud?id=${encodeURIComponent(comp.id)}`, { method: "DELETE" });
    if (res.ok) {
      await fetchCompetitors();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-brand-primary" />
      </div>
    );
  }

  const signalTypeCounts = Object.keys(signalIcons).map((type) => ({
    type,
    label: signalTypeLabel(type),
    count: competitors.reduce((acc, c) => acc + (c.competitor_signals?.filter((s) => s.type === type).length || 0), 0),
    color: SIGNAL_CHART_COLORS[type],
  }));

  const allSignals = competitors.flatMap((c) =>
    (c.competitor_signals || []).map((s) => ({
      ...s,
      competitorName: c.name,
      dateTs: new Date(s.date).getTime(),
      typeIndex: Object.keys(signalIcons).indexOf(s.type),
    })),
  );

  return (
    <div className="pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-neutral-800 tracking-tight">{tr.competitors.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-neutral-500 text-sm">{tr.competitors.subtitle}</p>
              {lastSync && (
                <>
                  <span className="w-1 h-1 rounded-full bg-neutral-300" />
                  <p className="text-[10px] text-neutral-400 font-medium whitespace-nowrap">
                    {lang === "pt" ? "\u00daltima atualiza\u00e7\u00e3o: " : "Last updated: "}
                    {formatDate(lastSync)}
                  </p>
                </>
              )}
            </div>
          </div>
          {isMock && <MockBadge />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-primary text-white text-sm font-semibold hover:bg-brand-primary/90 transition-colors"
          >
            <Plus size={16} />
            {tr.competitors.addCompetitor}
          </button>
          <button
            onClick={() => setShowCharts(!showCharts)}
            className={`p-2 rounded-lg text-sm transition-colors ${showCharts ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-400 hover:bg-neutral-100"}`}
          >
            <BarChart3 size={18} />
          </button>
        </div>
      </div>

      {/* Analytics Section */}
      {showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
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

      {/* Comparison Matrix (Harvey Balls — 6 dimensions) */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200/60 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-800 uppercase tracking-wider">
            {tr.competitors.harveyMatrix}
          </h3>
          <div className="flex items-center gap-4 text-[10px] text-neutral-400 font-medium italic">
            <div className="flex items-center gap-1"><HarveyBall score={1} /> 25%</div>
            <div className="flex items-center gap-1"><HarveyBall score={2} /> 50%</div>
            <div className="flex items-center gap-1"><HarveyBall score={3} /> 75%</div>
            <div className="flex items-center gap-1"><HarveyBall score={4} /> 100%</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-100 bg-white">
                <th className="px-5 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider w-40">{tr.competitors.competitor}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">{tr.competitors.vertical}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">{tr.competitors.depth}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">{tr.competitors.precision}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">{tr.competitors.pulse}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">{tr.competitors.regulatory}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">{tr.competitors.ux}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {[...competitors].sort((a) => a.id === "agrisafe" ? -1 : 1).map((comp) => {
                const scores = getHarveyScores(comp);
                return (
                  <tr key={comp.id} className={`${comp.id === "agrisafe" ? "bg-brand-primary/[0.03]" : "hover:bg-neutral-50/30"} transition-colors`}>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`text-sm font-bold ${comp.id === "agrisafe" ? "text-brand-primary" : "text-neutral-700"}`}>
                        {comp.name}
                        {comp.id === "agrisafe" && <span className="ml-2 text-[9px] bg-brand-primary text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">Self</span>}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-neutral-400">
                      <div className={`flex justify-center ${comp.id === "agrisafe" ? "text-brand-primary" : "text-neutral-400"}`}>
                        <HarveyBall score={scores.vertical} />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center text-neutral-400">
                      <div className={`flex justify-center ${comp.id === "agrisafe" ? "text-brand-primary" : "text-neutral-400"}`}>
                        <HarveyBall score={scores.depth} />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center text-neutral-400">
                      <div className={`flex justify-center ${comp.id === "agrisafe" ? "text-brand-primary" : "text-neutral-400"}`}>
                        <HarveyBall score={scores.precision} />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center text-neutral-400">
                      <div className={`flex justify-center ${comp.id === "agrisafe" ? "text-brand-primary" : "text-neutral-400"}`}>
                        <HarveyBall score={scores.pulse} />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center text-neutral-400">
                      <div className={`flex justify-center ${comp.id === "agrisafe" ? "text-brand-primary" : "text-neutral-400"}`}>
                        <HarveyBall score={scores.regulatory} />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center text-neutral-400">
                      <div className={`flex justify-center ${comp.id === "agrisafe" ? "text-brand-primary" : "text-neutral-400"}`}>
                        <HarveyBall score={scores.ux} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {competitors.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-neutral-400 italic">
                    {tr.competitors.noCompetitors}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-neutral-800 truncate">{comp.name}</h3>
                  {comp.country && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-neutral-200 text-neutral-500 uppercase tracking-tighter">{comp.country}</span>
                  )}
                </div>
                <p className="text-sm text-neutral-500">{comp.vertical || comp.segment || "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                {comp.website && (
                  <a
                    href={comp.website.startsWith("http") ? comp.website : `https://${comp.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium bg-white border border-neutral-200 text-neutral-600 px-3 py-1.5 rounded-lg hover:text-neutral-800 transition-colors"
                  >
                    <span className="hidden sm:inline">{comp.website.replace(/^https?:\/\//, "")}</span>
                    <ExternalLink size={14} />
                  </a>
                )}
                {comp.id !== "agrisafe" && (
                  <>
                    <button
                      onClick={() => setEditingCompetitor(comp)}
                      title={tr.competitors.editCompetitor}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(comp)}
                      title={tr.competitors.deleteCompetitor}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600 mb-4 leading-relaxed max-w-4xl">
                {(lang === "pt" ? comp.description_pt : comp.description_en) || (lang === "pt" ? comp.description_en : comp.description_pt) || ""}
              </p>

              {comp.notes && (
                <div className="mb-4 bg-amber-50/40 border border-amber-200/60 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1 flex items-center gap-1">
                    <FileText size={10} /> {tr.competitors.notes}
                  </p>
                  <p className="text-sm text-neutral-700 whitespace-pre-wrap">{comp.notes}</p>
                </div>
              )}

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

      {/* ── Add / Edit Modal ── */}
      {(showAddModal || editingCompetitor) && typeof document !== "undefined" && createPortal(
        <CompetitorModal
          lang={lang}
          competitor={editingCompetitor}
          onClose={() => { setShowAddModal(false); setEditingCompetitor(null); }}
          onSaved={async () => {
            setShowAddModal(false);
            setEditingCompetitor(null);
            await fetchCompetitors();
          }}
        />,
        document.body,
      )}
    </div>
  );
}

// ─── Competitor Modal (Add / Edit) ──────────────────────────────────────────

interface ModalFormState {
  name: string;
  vertical: string;
  country: string;
  website: string;
  tax_id: string;
  description_pt: string;
  description_en: string;
  notes: string;
  harvey: HarveyScores;
}

function emptyForm(): ModalFormState {
  return {
    name: "",
    vertical: "",
    country: "",
    website: "",
    tax_id: "",
    description_pt: "",
    description_en: "",
    notes: "",
    harvey: { vertical: 0, depth: 0, precision: 0, pulse: 0, regulatory: 0, ux: 0 },
  };
}

function fromCompetitor(c: Competitor): ModalFormState {
  const scores = getHarveyScores(c);
  return {
    name: c.name || "",
    vertical: c.vertical || c.segment || "",
    country: c.country || "",
    website: c.website || "",
    tax_id: c.legal_entities?.tax_id || "",
    description_pt: c.description_pt || "",
    description_en: c.description_en || "",
    notes: c.notes || "",
    harvey: scores,
  };
}

function CompetitorModal({ lang, competitor, onClose, onSaved }: {
  lang: Lang;
  competitor: Competitor | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const tr = t(lang);
  const isEdit = !!competitor;
  const [form, setForm] = useState<ModalFormState>(competitor ? fromCompetitor(competitor) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ summary: string | null; findings: { title: string; url: string; source: string }[] } | null>(null);
  const [enrichErr, setEnrichErr] = useState<string | null>(null);

  const update = <K extends keyof ModalFormState>(key: K, value: ModalFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateHarvey = (key: keyof HarveyScores, value: number) => {
    setForm((prev) => ({ ...prev, harvey: { ...prev.harvey, [key]: value } }));
  };

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError(tr.competitors.requiredField + ": " + tr.competitors.name);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      vertical: form.vertical.trim() || null,
      segment: form.vertical.trim() || "N/A",
      country: form.country.trim() || null,
      website: form.website.trim() || null,
      tax_id: form.tax_id.replace(/\D/g, "").slice(0, 14) || null,
      description_pt: form.description_pt.trim() || null,
      description_en: form.description_en.trim() || null,
      notes: form.notes.trim() || null,
      harvey_ball_scores: form.harvey,
    };
    if (isEdit && competitor) payload.id = competitor.id;

    try {
      const res = await fetch("/api/competitors/crud", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save failed");
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleEnrich = async () => {
    if (!isEdit || !competitor) {
      setEnrichErr(lang === "pt" ? "Salve antes de enriquecer" : "Save before enriching");
      return;
    }
    setEnriching(true);
    setEnrichErr(null);
    setEnrichResult(null);
    try {
      const res = await fetch("/api/competitors/enrich-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: competitor.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "enrich failed");
      setEnrichResult({ summary: data.summary, findings: data.findings || [] });
      // If a summary was returned, append it to the notes draft
      if (data.summary) {
        setForm((prev) => ({
          ...prev,
          notes: prev.notes
            ? `${prev.notes}\n\n--- ${tr.competitors.enrichmentSummary} (${new Date().toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}) ---\n${data.summary}`
            : data.summary,
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setEnrichErr(msg);
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-6 pb-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#F7F4EF] rounded-xl shadow-2xl w-full max-w-3xl mx-4" onClick={(ev) => ev.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 bg-white border-b border-neutral-200 flex items-start justify-between rounded-t-xl sticky top-0 z-10 shadow-sm">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold text-neutral-900 truncate">
              {isEdit ? tr.competitors.editCompetitor : tr.competitors.newCompetitor}
            </h2>
            <p className="text-[12px] text-neutral-500 mt-1">{tr.competitors.harveyHelp}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Identity card */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                  {tr.competitors.name} *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                  {tr.competitors.vertical}
                </label>
                <input
                  type="text"
                  value={form.vertical}
                  onChange={(e) => update("vertical", e.target.value)}
                  placeholder="Credit / Intelligence / Agtech..."
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                  {tr.competitors.website}
                </label>
                <div className="relative">
                  <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={form.website}
                    onChange={(e) => update("website", e.target.value)}
                    placeholder="example.com.br"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                  {tr.competitors.country}
                </label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => update("country", e.target.value)}
                  placeholder="BR"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                  {tr.competitors.cnpjOptional}
                </label>
                <input
                  type="text"
                  value={form.tax_id}
                  onChange={(e) => update("tax_id", e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="00000000000000"
                  className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
                <p className="text-[10px] text-neutral-400 mt-1">
                  {lang === "pt"
                    ? "Quando preenchido, o concorrente \u00e9 ancorado em legal_entities via entity_uid."
                    : "When filled, the competitor is anchored to legal_entities via entity_uid."}
                </p>
              </div>
            </div>
          </div>

          {/* Descriptions */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                  {tr.competitors.descriptionPt}
                </label>
                <textarea
                  value={form.description_pt}
                  onChange={(e) => update("description_pt", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary resize-y"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                  {tr.competitors.descriptionEn}
                </label>
                <textarea
                  value={form.description_en}
                  onChange={(e) => update("description_en", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary resize-y"
                />
              </div>
            </div>
          </div>

          {/* Harvey Ball matrix editor */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">{tr.competitors.harveyMatrix}</h3>
              <span className="text-[10px] text-neutral-400 italic">{tr.competitors.harveyHelp}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {HARVEY_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-[12px] font-semibold text-neutral-600 capitalize w-24">
                    {tr.competitors[key as keyof typeof tr.competitors] as string}
                  </span>
                  <div className="text-brand-primary">
                    <HarveyBall score={form.harvey[key]} />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={1}
                    value={form.harvey[key]}
                    onChange={(e) => updateHarvey(key, Number(e.target.value))}
                    className="flex-1 accent-brand-primary"
                  />
                  <span className="text-[12px] font-mono text-neutral-500 w-6 text-right">{form.harvey[key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes + enrich-web */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                {tr.competitors.notes}
              </label>
              <button
                type="button"
                onClick={handleEnrich}
                disabled={enriching || !isEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={!isEdit ? (lang === "pt" ? "Salve antes de enriquecer" : "Save before enriching") : ""}
              >
                {enriching ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {enriching ? tr.competitors.enriching : tr.competitors.enrichWeb}
              </button>
            </div>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={5}
              placeholder={tr.competitors.notesPlaceholder}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary resize-y"
            />
            {enrichErr && (
              <p className="text-xs text-red-600 mt-2">{tr.competitors.enrichError}: {enrichErr}</p>
            )}
            {enrichResult && enrichResult.findings.length > 0 && (
              <div className="mt-3 border-t border-neutral-100 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  {tr.competitors.enrichmentSources} ({enrichResult.findings.length})
                </p>
                <ul className="space-y-1 text-xs max-h-32 overflow-y-auto">
                  {enrichResult.findings.slice(0, 6).map((f, i) => (
                    <li key={i} className="truncate">
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
                        {f.title}
                      </a>
                      <span className="text-neutral-400 ml-2">{f.source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {competitor?.last_web_enrichment_at && (
              <p className="text-[10px] text-neutral-400 mt-2">
                {tr.competitors.lastEnrichedAt}: {new Date(competitor.last_web_enrichment_at).toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              {tr.competitors.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-semibold hover:bg-brand-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? tr.competitors.saving : tr.competitors.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
