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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{tr.content.title}</h2>
          <p className="text-slate-500 mt-1">{tr.content.subtitle}</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm transition-colors">
          <Sparkles size={16} />
          {tr.content.generateIdeas}
        </button>
      </div>

      {/* Pillar Filter */}
      <div className="flex gap-2 mb-6">
        {["All", "Credit Risk", "Sales Optimization", "Crop Monitoring", "Market Trends"].map((pillar) => (
          <button
            key={pillar}
            className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors text-slate-700"
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
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6">
        <p className="text-sm text-purple-800">
          <Sparkles size={14} className="inline mr-1" />
          {lang === "pt"
            ? "Score de tendência baseado em dados públicos de mercado, volume de busca e relevância sazonal."
            : "Trend score based on public market data, search volume, and seasonal relevance."}
        </p>
      </div>

      {/* Content Ideas Grid */}
      <div className="grid grid-cols-2 gap-4">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${pillarColors[idea.pillar] || "border-l-gray-300"} border border-gray-100 card-hover`}
          >
            <div className="flex items-start justify-between mb-3">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeColors[idea.type]}`}>
                {idea.type === "blog" ? "Blog Post"
                  : idea.type === "social" ? (lang === "pt" ? "Mídia Social" : "Social Media")
                  : idea.type === "newsletter" ? "Newsletter"
                  : "Press Release"}
              </span>
              <div className="flex items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                  {idea.trend_score}
                </div>
              </div>
            </div>

            <h3 className="font-semibold text-slate-900 mb-2">{lang === "pt" ? idea.title_pt : idea.title_en}</h3>
            <p className="text-sm text-slate-500 mb-3">{lang === "pt" ? idea.description_pt : idea.description_en}</p>

            <div className="flex flex-wrap gap-1 mb-3">
              {idea.keywords.slice(0, 3).map((kw) => (
                <span key={kw} className="text-xs bg-gray-100 text-slate-600 px-2 py-0.5 rounded">
                  {kw}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-xs text-slate-500">{idea.pillar}</span>
              <div className="flex gap-2">
                {idea.suggested_date && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Calendar size={12} />
                    {idea.suggested_date}
                  </span>
                )}
                <button className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium">
                  {tr.content.outline} <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
