"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { Sparkles, ArrowUpRight, Calendar, Loader2 } from "lucide-react";

interface ContentIdea {
  id: string;
  title_pt: string;
  title_en: string;
  type: string;
  pillar: string;
  description_pt: string;
  description_en: string;
  keywords: string[];
  trend_score: number;
  suggested_date: string | null;
}

const typeColors: Record<string, string> = {
  blog: "bg-blue-100 text-blue-700",
  social: "bg-pink-100 text-pink-700",
  newsletter: "bg-amber-100 text-amber-700",
  press: "bg-violet-100 text-violet-700",
  webinar: "bg-teal-100 text-teal-700",
  ebook: "bg-indigo-100 text-indigo-700",
};

const pillarColors: Record<string, string> = {
  "Credit Risk": "border-l-red-500",
  "Sales Optimization": "border-l-blue-500",
  "Crop Monitoring": "border-l-emerald-500",
  "Market Trends": "border-l-amber-500",
};

export function ContentEngine({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIdeas() {
      const { data } = await supabase.from("content_ideas").select("*").order("trend_score", { ascending: false });
      if (data) setIdeas(data);
      setLoading(false);
    }
    fetchIdeas();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{tr.content.title}</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">{tr.content.subtitle}</p>
        </div>
        <button className="flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium text-sm transition-all shadow-sm active:scale-95">
          <Sparkles size={18} />
          {tr.content.generateIdeas}
        </button>
      </div>

      {/* Pillar Filter */}
      <div className="flex flex-wrap gap-2 md:gap-3 mb-6 md:mb-8">
        {["All", "Credit Risk", "Sales Optimization", "Crop Monitoring", "Market Trends"].map((pillar) => (
          <button
            key={pillar}
            className="px-4 py-2 text-sm md:text-base font-bold rounded-xl bg-white border border-slate-200/80 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 transition-all active:scale-95 text-slate-600"
          >
            {pillar === "All"
              ? lang === "pt" ? "Todos" : "All"
              : lang === "pt"
                ? pillar === "Credit Risk" ? "Risco de Crédito"
                  : pillar === "Sales Optimization" ? "Otimização de Vendas"
                  : pillar === "Crop Monitoring" ? "Monitoramento de Safra"
                  : "Tendências de Mercado"
                : pillar}
          </button>
        ))}
      </div>

      {/* Trend Score Legend */}
      <div className="bg-purple-50/80 border border-purple-100 rounded-2xl p-4 md:p-5 mb-6 md:mb-8 shadow-sm">
        <p className="text-sm md:text-base font-medium text-purple-800 flex flex-col md:flex-row md:items-center gap-2">
          <span className="flex items-center gap-1"><Sparkles size={18} className="inline text-purple-600" /> <strong className="text-purple-900">Trend Score:</strong></span> 
          <span>{lang === "pt"
            ? "Baseado em dados públicos de mercado, volume de busca e relevância sazonal."
            : "Based on public market data, search volume, and seasonal relevance."}</span>
        </p>
      </div>

      {/* Content Ideas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className={`bg-white rounded-2xl p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border-t-4 ${pillarColors[idea.pillar]?.replace('border-l-','border-t-') || "border-t-gray-300"} border-x border-b border-slate-100/60 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 flex flex-col h-full`}
          >
            <div className="flex items-start justify-between mb-4">
              <span className={`text-xs px-2.5 py-1 rounded-md font-extrabold tracking-wide uppercase ${typeColors[idea.type]}`}>
                {idea.type === "blog" ? "Blog Post"
                  : idea.type === "social" ? (lang === "pt" ? "Social" : "Social")
                  : idea.type === "newsletter" ? "Newsletter"
                  : "Press"}
              </span>
              <div className="flex items-center gap-1" title={lang === "pt" ? "Trend Score" : "Trend Score"}>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-md shadow-purple-500/20 flex items-center justify-center text-white text-sm font-extrabold flex-shrink-0">
                  {idea.trend_score}
                </div>
              </div>
            </div>

            <h3 className="font-extrabold text-lg text-slate-900 mb-2 leading-tight flex-1">{lang === "pt" ? idea.title_pt : idea.title_en}</h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">{lang === "pt" ? idea.description_pt : idea.description_en}</p>

            <div className="flex flex-wrap gap-2 mb-5">
              {idea.keywords.slice(0, 3).map((kw) => (
                <span key={kw} className="text-[11px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded border border-slate-200">
                  #{kw}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{idea.pillar}</span>
              <div className="flex items-center gap-3">
                {idea.suggested_date && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <Calendar size={14} className="text-slate-400" />
                    {new Date(idea.suggested_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
                <button className="flex items-center gap-1 text-xs font-extrabold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg transition-colors">
                  {tr.content.outline} <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
