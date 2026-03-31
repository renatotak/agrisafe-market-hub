"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Newspaper,
  ExternalLink,
  RefreshCw,
  Loader2,
  Star,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import type { AgroNews as AgroNewsType } from "@/data/news";

const PAGE_SIZE = 15;

const CATEGORY_LABELS: Record<string, { pt: string; en: string; color: string }> = {
  commodities: { pt: "Commodities", en: "Commodities", color: "bg-emerald-100 text-emerald-800" },
  policy: { pt: "Política", en: "Policy", color: "bg-blue-100 text-blue-800" },
  technology: { pt: "Tecnologia", en: "Technology", color: "bg-purple-100 text-purple-800" },
  credit: { pt: "Crédito", en: "Credit", color: "bg-amber-100 text-amber-800" },
  sustainability: { pt: "Sustentabilidade", en: "Sustainability", color: "bg-green-100 text-green-800" },
  judicial: { pt: "Judicial", en: "Judicial", color: "bg-red-100 text-red-800" },
  general: { pt: "Geral", en: "General", color: "bg-slate-100 text-slate-700" },
};

const SOURCE_COLORS: Record<string, string> = {
  "Canal Rural": "text-blue-600",
  "Sucesso no Campo": "text-teal-600",
  "Agrolink": "text-emerald-600",
  "CNA Notícias": "text-amber-600",
};

export function AgroNews({ lang }: { lang: Lang }) {
  const [news, setNews] = useState<AgroNewsType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [producerOnly, setProducerOnly] = useState(false);

  useEffect(() => {
    setPage(0);
  }, [categoryFilter, sourceFilter, producerOnly]);

  useEffect(() => {
    fetchNews();
  }, [page, categoryFilter, sourceFilter, producerOnly]);

  const fetchNews = async () => {
    setLoading(true);
    let query = supabase
      .from("agro_news")
      .select("*", { count: "exact" })
      .order("published_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (categoryFilter) query = query.eq("category", categoryFilter);
    if (sourceFilter) query = query.eq("source_name", sourceFilter);
    if (producerOnly) query = query.eq("mentions_producer", true);

    const { data, count } = await query;
    if (data) setNews(data);
    if (count != null) setTotalCount(count);
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            {lang === "pt" ? "Notícias Agro" : "Agro News"}
          </h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">
            {lang === "pt"
              ? "Notícias do agronegócio brasileiro em tempo real"
              : "Real-time Brazilian agribusiness news"}
          </p>
        </div>
        <button
          onClick={() => { setPage(0); fetchNews(); }}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-medium text-sm transition-all shadow-sm active:scale-95"
        >
          <RefreshCw size={16} />
          {lang === "pt" ? "Atualizar" : "Refresh"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setProducerOnly(!producerOnly)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
            producerOnly
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Star size={14} className={producerOnly ? "fill-amber-400 text-amber-400" : ""} />
          {lang === "pt" ? "Produtores Destaque" : "Highlighted Producers"}
        </button>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-medium bg-white border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        >
          <option value="">{lang === "pt" ? "Todas Categorias" : "All Categories"}</option>
          {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-medium bg-white border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        >
          <option value="">{lang === "pt" ? "Todas Fontes" : "All Sources"}</option>
          <option value="Canal Rural">Canal Rural</option>
          <option value="Sucesso no Campo">Sucesso no Campo</option>
          <option value="Agrolink">Agrolink</option>
          <option value="CNA Notícias">CNA Notícias</option>
        </select>
      </div>

      {/* News Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-teal-500" />
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-16">
          <Newspaper size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">
            {lang === "pt" ? "Nenhuma notícia encontrada" : "No news found"}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {lang === "pt"
              ? "Execute o cron de sincronização para coletar notícias"
              : "Run the sync cron to collect news"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {news.map((item) => (
            <article
              key={item.id}
              className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-5 md:p-6 hover:shadow-lg transition-shadow duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${SOURCE_COLORS[item.source_name] || "text-slate-500"}`}>
                      {item.source_name}
                    </span>
                    {item.category && CATEGORY_LABELS[item.category] && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${CATEGORY_LABELS[item.category].color}`}>
                        {lang === "pt" ? CATEGORY_LABELS[item.category].pt : CATEGORY_LABELS[item.category].en}
                      </span>
                    )}
                    {item.mentions_producer && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 flex items-center gap-1">
                        <Star size={10} className="fill-amber-400 text-amber-400" />
                        {item.producer_names?.join(", ")}
                      </span>
                    )}
                  </div>

                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <h3 className="font-bold text-slate-900 mb-1.5 group-hover:text-teal-700 transition-colors leading-snug">
                      {item.title}
                      <ExternalLink size={14} className="inline-block ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                  </a>

                  {item.summary && (
                    <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">{item.summary}</p>
                  )}

                  <div className="flex items-center gap-3 mt-3">
                    <time className="text-xs text-slate-400 font-medium">
                      {new Date(item.published_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 px-1">
          <p className="text-xs text-slate-500">
            {lang === "pt"
              ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} de ${totalCount}`
              : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-slate-600">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
