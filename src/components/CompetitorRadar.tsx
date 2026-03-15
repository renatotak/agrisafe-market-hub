"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { ExternalLink, AlertCircle, Rocket, Handshake, Users, Newspaper, Loader2 } from "lucide-react";

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
  product_launch: Rocket,
  funding: AlertCircle,
  partnership: Handshake,
  hiring: Users,
  news: Newspaper,
};

const signalColors: Record<string, string> = {
  product_launch: "bg-blue-100 text-blue-700",
  funding: "bg-emerald-100 text-emerald-700",
  partnership: "bg-purple-100 text-purple-700",
  hiring: "bg-amber-100 text-amber-700",
  news: "bg-slate-100 text-slate-700",
};

export function CompetitorRadar({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCompetitors() {
      const { data } = await supabase
        .from("competitors")
        .select("*, competitor_signals(*)")
        .order("name");
      if (data) setCompetitors(data);
      setLoading(false);
    }
    fetchCompetitors();
  }, []);

  const signalTypeLabel = (type: string) => {
    const labels: Record<string, Record<string, string>> = {
      product_launch: { pt: "Lançamento", en: "Launch" },
      funding: { pt: "Captação", en: "Funding" },
      partnership: { pt: "Parceria", en: "Partnership" },
      hiring: { pt: "Contratação", en: "Hiring" },
      news: { pt: "Notícia", en: "News" },
    };
    return labels[type]?.[lang] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-8">
      <div className="mb-6 md:mb-8 text-center md:text-left">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{tr.competitors.title}</h2>
        <p className="text-slate-500 mt-1 text-sm md:text-base">{tr.competitors.subtitle}</p>
      </div>

      {/* Signal Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-5 mb-8 md:mb-10">
        {Object.entries(signalIcons).map(([type, Icon]) => {
          const count = competitors.reduce((acc, c) => acc + (c.competitor_signals?.filter((s) => s.type === type).length || 0), 0);
          return (
            <div key={type} className={`bg-white rounded-2xl p-5 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 hover:-translate-y-1 transition-transform duration-300 text-center ${count > 0 ? "" : "opacity-75"}`}>
              <div className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3 ${signalColors[type].replace('text-', 'bg-opacity-20 text-').replace('bg-', 'bg-')}`}>
                <Icon size={24} />
              </div>
              <p className="text-2xl md:text-3xl font-extrabold text-slate-900">{count}</p>
              <p className="text-[11px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">{signalTypeLabel(type)}</p>
            </div>
          );
        })}
      </div>

      {/* Competitor Cards */}
      <div className="space-y-4 md:space-y-6">
        {competitors.map((comp) => (
          <div key={comp.id} className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden group hover:border-slate-200 transition-colors">
            <div className="px-5 py-4 md:px-6 md:py-5 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-50/80 bg-slate-50/50 gap-4">
              <div className="flex-1">
                <h3 className="font-extrabold text-lg md:text-xl text-slate-900 tracking-tight">{comp.name}</h3>
                <p className="text-sm font-medium text-slate-500 mt-0.5">{comp.segment}</p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`https://${comp.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-bold bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg shadow-sm hover:text-slate-900 hover:border-slate-300 transition-all active:scale-95"
                >
                  <span className="hidden sm:inline">{comp.website}</span>
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
            <div className="p-5 md:p-6">
              <p className="text-sm md:text-base text-slate-600 mb-4 md:mb-6 leading-relaxed max-w-4xl">
                {lang === "pt" ? comp.description_pt : comp.description_en}
              </p>
              
              {comp.competitor_signals && comp.competitor_signals.length > 0 ? (
                <div className="bg-slate-50 rounded-xl p-4 md:p-5 border border-slate-100/80 space-y-3">
                  <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{lang === "pt" ? "Sinais Recentes" : "Recent Signals"}</p>
                  {(comp.competitor_signals || []).map((signal) => {
                    const Icon = signalIcons[signal.type] || Newspaper;
                    return (
                      <div key={signal.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-slate-200/60 last:border-0 last:pb-0">
                        <span className={`inline-flex self-start sm:self-auto items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md tracking-wide uppercase shadow-sm border border-white/20 ${signalColors[signal.type]}`}>
                          <Icon size={14} />
                          {signalTypeLabel(signal.type)}
                        </span>
                        <p className="text-sm font-semibold text-slate-800 flex-1 leading-snug">
                          {lang === "pt" ? signal.title_pt : signal.title_en}
                        </p>
                        <div className="flex items-center gap-2 mt-1 sm:mt-0 opacity-70">
                          <span className="text-xs font-bold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded border border-slate-200">{new Date(signal.date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" })}</span>
                          <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/50">{signal.source}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-slate-400 italic px-2">
                  {lang === "pt" ? "Nenhum sinal recente registrado." : "No recent signals recorded."}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
