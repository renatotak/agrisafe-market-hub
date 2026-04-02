"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Newspaper, ExternalLink, RefreshCw, Loader2, Star,
  ChevronLeft, ChevronRight, BarChart3,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { AgroNews as AgroNewsType } from "@/data/news";
import { mockNews } from "@/data/mock";
import { MockBadge } from "@/components/ui/MockBadge";

const PAGE_SIZE = 15;

const CATEGORY_LABELS: Record<string, { pt: string; en: string; color: string; chartColor: string }> = {
  commodities: { pt: "Commodities", en: "Commodities", color: "bg-green-100 text-green-800", chartColor: "#22c55e" },
  policy: { pt: "Pol\u00edtica", en: "Policy", color: "bg-blue-100 text-blue-800", chartColor: "#3b82f6" },
  technology: { pt: "Tecnologia", en: "Technology", color: "bg-purple-100 text-purple-800", chartColor: "#8b5cf6" },
  credit: { pt: "Cr\u00e9dito", en: "Credit", color: "bg-amber-100 text-amber-800", chartColor: "#f59e0b" },
  sustainability: { pt: "Sustentabilidade", en: "Sustainability", color: "bg-teal-100 text-teal-800", chartColor: "#14b8a6" },
  judicial: { pt: "Judicial", en: "Judicial", color: "bg-red-100 text-red-800", chartColor: "#ef4444" },
  general: { pt: "Geral", en: "General", color: "bg-neutral-100 text-neutral-700", chartColor: "#6b7280" },
};

const SOURCE_COLORS: Record<string, string> = {
  "Canal Rural": "#3b82f6",
  "Sucesso no Campo": "#14b8a6",
  "Agrolink": "#22c55e",
  "CNA Not\u00edcias": "#f59e0b",
};

const SOURCE_TEXT_COLORS: Record<string, string> = {
  "Canal Rural": "text-blue-600",
  "Sucesso no Campo": "text-teal-600",
  "Agrolink": "text-green-600",
  "CNA Not\u00edcias": "text-amber-600",
};

export function AgroNews({ lang }: { lang: Lang }) {
  const [news, setNews] = useState<AgroNewsType[]>([]);
  const [allNewsForCharts, setAllNewsForCharts] = useState<AgroNewsType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [producerOnly, setProducerOnly] = useState(false);
  const [showCharts, setShowCharts] = useState(true);
  const [isMock, setIsMock] = useState(true);

  useEffect(() => { setPage(0); }, [categoryFilter, sourceFilter, producerOnly]);
  useEffect(() => { fetchNews(); }, [page, categoryFilter, sourceFilter, producerOnly]);

  // Fetch all news (limited) for chart analytics
  useEffect(() => {
    async function fetchAllForCharts() {
      const { data } = await supabase
        .from("agro_news")
        .select("id, category, source_name, published_at")
        .order("published_at", { ascending: false })
        .limit(500);
      setAllNewsForCharts((data?.length ? data : mockNews) as AgroNewsType[]);
    }
    fetchAllForCharts();
  }, []);

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
    if (data?.length) {
      setNews(data);
      if (count != null) setTotalCount(count);
      setIsMock(false);
    } else {
      setNews(mockNews as AgroNewsType[]);
      setTotalCount(mockNews.length);
      setIsMock(true);
    }
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Chart data: category distribution
  const categoryData = Object.entries(CATEGORY_LABELS).map(([key, val]) => ({
    name: lang === "pt" ? val.pt : val.en,
    value: allNewsForCharts.filter((n) => n.category === key).length,
    color: val.chartColor,
  })).filter((d) => d.value > 0);

  // Chart data: source volume
  const sourceData = Object.keys(SOURCE_COLORS).map((source) => ({
    name: source,
    count: allNewsForCharts.filter((n) => n.source_name === source).length,
    color: SOURCE_COLORS[source],
  })).filter((d) => d.count > 0);

  // Chart data: daily article count (last 30 days)
  const dailyData = buildDailyData(allNewsForCharts, lang);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-neutral-800 tracking-tight">
              {lang === "pt" ? "Not\u00edcias Agro" : "Agro News"}
            </h2>
            <p className="text-neutral-500 mt-1 text-sm">
              {lang === "pt" ? "Not\u00edcias do agroneg\u00f3cio brasileiro em tempo real" : "Real-time Brazilian agribusiness news"}
            </p>
          </div>
          {isMock && <MockBadge />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCharts(!showCharts)}
            className={`p-2 rounded-lg text-sm transition-colors ${showCharts ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-400 hover:bg-neutral-100"}`}
          >
            <BarChart3 size={18} />
          </button>
          <button
            onClick={() => { setPage(0); fetchNews(); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary-dark font-medium text-sm transition-colors shadow-sm"
          >
            <RefreshCw size={16} />
            {lang === "pt" ? "Atualizar" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Analytics Charts */}
      {showCharts && allNewsForCharts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Category Donut */}
          <div className="bg-white rounded-lg p-5 shadow-sm border border-neutral-200/60">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">
              {lang === "pt" ? "Por Categoria" : "By Category"}
            </h3>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" nameKey="name" paddingAngle={2}>
                    {categoryData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 justify-center">
              {categoryData.map((d) => (
                <div key={d.name} className="flex items-center gap-1 text-[11px] text-neutral-600">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </div>
              ))}
            </div>
          </div>

          {/* Source Volume Bars */}
          <div className="bg-white rounded-lg p-5 shadow-sm border border-neutral-200/60">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">
              {lang === "pt" ? "Volume por Fonte" : "Volume by Source"}
            </h3>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData} barSize={24}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {sourceData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Article Count Area Chart */}
          <div className="bg-white rounded-lg p-5 shadow-sm border border-neutral-200/60">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">
              {lang === "pt" ? "Artigos por Dia (30d)" : "Articles per Day (30d)"}
            </h3>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                  <defs>
                    <linearGradient id="newsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5B7A2F" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#5B7A2F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="count" stroke="#5B7A2F" strokeWidth={2} fill="url(#newsGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setProducerOnly(!producerOnly)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
            producerOnly ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50"
          }`}
        >
          <Star size={14} className={producerOnly ? "fill-amber-400 text-amber-400" : ""} />
          {lang === "pt" ? "Produtores Destaque" : "Highlighted Producers"}
        </button>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-white border border-neutral-200 text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        >
          <option value="">{lang === "pt" ? "Todas Categorias" : "All Categories"}</option>
          {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
          ))}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-white border border-neutral-200 text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        >
          <option value="">{lang === "pt" ? "Todas Fontes" : "All Sources"}</option>
          <option value="Canal Rural">Canal Rural</option>
          <option value="Sucesso no Campo">Sucesso no Campo</option>
          <option value="Agrolink">Agrolink</option>
          <option value="CNA Not\u00edcias">CNA Not\u00edcias</option>
        </select>
      </div>

      {/* News Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-brand-primary" />
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-16">
          <Newspaper size={48} className="mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-500 font-medium">
            {lang === "pt" ? "Nenhuma not\u00edcia encontrada" : "No news found"}
          </p>
          <p className="text-neutral-400 text-sm mt-1">
            {lang === "pt" ? "Execute o cron de sincroniza\u00e7\u00e3o para coletar not\u00edcias" : "Run the sync cron to collect news"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <article key={item.id} className="bg-white rounded-lg shadow-sm border border-neutral-200/60 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${SOURCE_TEXT_COLORS[item.source_name] || "text-neutral-500"}`}>
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
                  <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="group">
                    <h3 className="font-semibold text-neutral-800 mb-1 group-hover:text-brand-primary transition-colors leading-snug">
                      {item.title}
                      <ExternalLink size={14} className="inline-block ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                  </a>
                  {item.summary && (
                    <p className="text-sm text-neutral-500 leading-relaxed line-clamp-2">{item.summary}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <time className="text-xs text-neutral-400">
                      {new Date(item.published_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                    </time>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[10px] text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded">#{tag}</span>
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
          <p className="text-xs text-neutral-500">
            {page * PAGE_SIZE + 1}\u2013{Math.min((page + 1) * PAGE_SIZE, totalCount)} {lang === "pt" ? "de" : "of"} {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="p-2 rounded-lg hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-neutral-600">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="p-2 rounded-lg hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Build daily article count for last 30 days */
function buildDailyData(news: AgroNewsType[], lang: Lang) {
  const now = new Date();
  const days: { date: string; count: number }[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" });
    const count = news.filter((n) => n.published_at?.startsWith(dateStr)).length;
    days.push({ date: label, count });
  }
  return days;
}
