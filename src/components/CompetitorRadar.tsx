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
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{tr.competitors.title}</h2>
        <p className="text-slate-500 mt-1">{tr.competitors.subtitle}</p>
      </div>

      {/* Signal Summary */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        {Object.entries(signalIcons).map(([type, Icon]) => {
          const count = competitors.reduce((acc, c) => acc + (c.competitor_signals?.filter((s) => s.type === type).length || 0), 0);
          return (
            <div key={type} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
              <Icon size={20} className="mx-auto text-slate-600 mb-2" />
              <p className="text-xl font-bold text-slate-900">{count}</p>
              <p className="text-xs text-slate-500">{signalTypeLabel(type)}</p>
            </div>
          );
        })}
      </div>

      {/* Competitor Cards */}
      <div className="space-y-4">
        {competitors.map((comp) => (
          <div key={comp.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
              <div>
                <h3 className="font-semibold text-slate-900">{comp.name}</h3>
                <p className="text-sm text-slate-500">{comp.segment}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-gray-100 text-slate-600 px-2 py-1 rounded">
                  {comp.website}
                </span>
                <a
                  href={`https://${comp.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-600"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
            <div className="px-6 py-3">
              <p className="text-sm text-slate-600 mb-3">
                {lang === "pt" ? comp.description_pt : comp.description_en}
              </p>
              <div className="space-y-2">
                {(comp.competitor_signals || []).map((signal) => {
                  const Icon = signalIcons[signal.type] || Newspaper;
                  return (
                    <div key={signal.id} className="flex items-center gap-3 py-2 border-t border-gray-50">
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${signalColors[signal.type]}`}>
                        <Icon size={12} />
                        {signalTypeLabel(signal.type)}
                      </span>
                      <p className="text-sm text-slate-700 flex-1">
                        {lang === "pt" ? signal.title_pt : signal.title_en}
                      </p>
                      <span className="text-xs text-slate-400">{signal.date}</span>
                      <span className="text-xs text-slate-400">{signal.source}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
