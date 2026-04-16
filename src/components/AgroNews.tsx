"use client";

import { useEffect, useState, useCallback } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Newspaper, ExternalLink, RefreshCw, Loader2, Star,
  ChevronLeft, ChevronRight, BarChart3, Settings2, Plus,
  Pencil, Trash2, X, AlertTriangle, BookOpen, Brain, Bookmark,
  Zap, Check, ShieldCheck,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { AgroNews as AgroNewsType } from "@/data/news";
import { MockBadge } from "@/components/ui/MockBadge";

const PAGE_SIZE = 15;

const CATEGORY_LABELS: Record<string, { pt: string; en: string; color: string; chartColor: string }> = {
  commodities: { pt: "Commodities", en: "Commodities", color: "bg-green-100 text-green-800", chartColor: "#22c55e" },
  livestock: { pt: "Pecu\u00e1ria", en: "Livestock", color: "bg-orange-100 text-orange-800", chartColor: "#f97316" },
  policy: { pt: "Pol\u00edtica", en: "Policy", color: "bg-blue-100 text-blue-800", chartColor: "#3b82f6" },
  technology: { pt: "Tecnologia", en: "Technology", color: "bg-purple-100 text-purple-800", chartColor: "#8b5cf6" },
  credit: { pt: "Cr\u00e9dito", en: "Credit", color: "bg-amber-100 text-amber-800", chartColor: "#f59e0b" },
  sustainability: { pt: "Sustentabilidade", en: "Sustainability", color: "bg-teal-100 text-teal-800", chartColor: "#14b8a6" },
  judicial: { pt: "Judicial", en: "Judicial", color: "bg-red-100 text-red-800", chartColor: "#ef4444" },
  general: { pt: "Geral", en: "General", color: "bg-neutral-100 text-neutral-700", chartColor: "#6b7280" },
  reading_room: { pt: "Reading Room", en: "Reading Room", color: "bg-indigo-100 text-indigo-700", chartColor: "#6366f1" },
};

const SOURCE_TYPE_OPTIONS = ["rss", "reading_room", "api", "scrape"] as const;
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS);
const LANGUAGE_OPTIONS = ["pt", "en", "es"] as const;

interface NewsSource {
  id: string;
  name: string;
  rss_url: string | null;
  website_url: string | null;
  category: string;
  language: string;
  enabled: boolean;
  source_type: string;
  last_fetched_at: string | null;
  last_error: string | null;
  error_count: number;
  created_at: string;
  updated_at: string;
}

function relativeTime(iso: string | null, lang: Lang): string {
  if (!iso) return lang === "pt" ? "nunca" : "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return lang === "pt" ? "agora" : "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === "pt" ? "agora" : "just now";
  if (mins < 60) return lang === "pt" ? `${mins} min atrás` : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === "pt" ? `${hrs} h atrás` : `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return lang === "pt" ? `${days} d atrás` : `${days} d ago`;
  return new Date(iso).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" });
}

export function AgroNews({ lang }: { lang: Lang }) {
  const tr = t(lang).news;
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
  // Phase 22 follow-up: which agro_news IDs are indexed in knowledge_items
  const [kbIndexedIds, setKbIndexedIds] = useState<Set<string>>(new Set());

  // ─── Sources state (Phase 22) ───────────────────────────────
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [showSourcesPanel, setShowSourcesPanel] = useState(false);
  const [editingSource, setEditingSource] = useState<NewsSource | null>(null);
  const [showSourceModal, setShowSourceModal] = useState(false);

  // Phase 4b — manual news upload
  const [showAddNewsModal, setShowAddNewsModal] = useState(false);
  const [addNewsUrl, setAddNewsUrl] = useState("");
  const [addNewsTitle, setAddNewsTitle] = useState("");
  const [addNewsSummary, setAddNewsSummary] = useState("");
  const [addNewsSubmitting, setAddNewsSubmitting] = useState(false);
  const [addNewsFeedback, setAddNewsFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // ─── Phase 4c — News → Directory enrichment ────────────────
  interface EnrichmentProposal {
    entity_uid: string;
    entity_name: string;
    proposed_role: string;
    confidence: number;
    source_snippet: string;
    source: "algorithmic" | "llm";
  }
  const [enrichArticleId, setEnrichArticleId] = useState<string | null>(null);
  const [enrichProposals, setEnrichProposals] = useState<EnrichmentProposal[]>([]);
  const [enrichSelected, setEnrichSelected] = useState<Set<string>>(new Set());
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichAccepting, setEnrichAccepting] = useState(false);
  const [enrichFeedback, setEnrichFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showEnrichModal, setShowEnrichModal] = useState(false);

  const proposeEnrichment = async (articleId: string) => {
    setEnrichArticleId(articleId);
    setEnrichLoading(true);
    setEnrichProposals([]);
    setEnrichSelected(new Set());
    setEnrichFeedback(null);
    setShowEnrichModal(true);
    try {
      const res = await fetch(`/api/news/propose-enrichment?article_id=${encodeURIComponent(articleId)}`);
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      const proposals: EnrichmentProposal[] = json.proposals || [];
      setEnrichProposals(proposals);
      // Pre-select all with confidence >= 0.7
      setEnrichSelected(new Set(proposals.filter((p) => p.confidence >= 0.7).map((p) => p.entity_uid)));
    } catch {
      setEnrichFeedback({ type: "error", msg: tr.enrichError });
    } finally {
      setEnrichLoading(false);
    }
  };

  const acceptEnrichment = async () => {
    if (enrichSelected.size === 0 || !enrichArticleId) return;
    setEnrichAccepting(true);
    setEnrichFeedback(null);
    try {
      const accepted = enrichProposals
        .filter((p) => enrichSelected.has(p.entity_uid))
        .map((p) => ({ entity_uid: p.entity_uid, proposed_role: p.proposed_role }));
      const res = await fetch("/api/news/propose-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article_id: enrichArticleId, accepted }),
      });
      if (!res.ok) throw new Error("post failed");
      setEnrichFeedback({ type: "success", msg: tr.enrichSuccess });
    } catch {
      setEnrichFeedback({ type: "error", msg: tr.enrichError });
    } finally {
      setEnrichAccepting(false);
    }
  };

  const toggleEnrichSelection = (uid: string) => {
    setEnrichSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

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
      setAllNewsForCharts((data?.length ? data : []) as AgroNewsType[]);
    }
    fetchAllForCharts();
  }, []);

  // Fetch sources
  const fetchSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const res = await fetch("/api/news-sources/crud");
      if (res.ok) {
        const json = await res.json();
        setSources(json.sources || []);
      }
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

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
      // Phase 22 follow-up: check which of these news IDs are indexed in
      // knowledge_items so we can render a "🧠 KB" badge per article.
      // Single small query, runs after the news fetch completes.
      try {
        const ids = data.map((n: any) => n.id);
        const { data: kbRows } = await supabase
          .from("knowledge_items")
          .select("source_id")
          .eq("source_table", "agro_news")
          .in("source_id", ids);
        setKbIndexedIds(new Set((kbRows || []).map((r: any) => r.source_id as string)));
      } catch {
        setKbIndexedIds(new Set());
      }
    } else {
      setNews([]);
      setTotalCount(0);
      setIsMock(false);
      setKbIndexedIds(new Set());
    }
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Chart data
  const categoryData = Object.entries(CATEGORY_LABELS).map(([key, val]) => ({
    name: lang === "pt" ? val.pt : val.en,
    value: allNewsForCharts.filter((n) => n.category === key).length,
    color: val.chartColor,
  })).filter((d) => d.value > 0);

  const sourceVolumeData = sources
    .filter((s) => s.enabled)
    .map((s) => ({
      name: s.name,
      count: allNewsForCharts.filter((n) => n.source_name === s.name).length,
      color: CATEGORY_LABELS[s.category]?.chartColor || "#6b7280",
    }))
    .filter((d) => d.count > 0);

  const dailyData = buildDailyData(allNewsForCharts, lang);

  // ─── Source CRUD handlers ───────────────────────────────────
  const openNewSource = () => {
    setEditingSource({
      id: "",
      name: "",
      rss_url: "",
      website_url: "",
      category: "general",
      language: "pt",
      enabled: true,
      source_type: "rss",
      last_fetched_at: null,
      last_error: null,
      error_count: 0,
      created_at: "",
      updated_at: "",
    });
    setShowSourceModal(true);
  };

  const openEditSource = (source: NewsSource) => {
    setEditingSource({ ...source });
    setShowSourceModal(true);
  };

  const closeModal = () => {
    setShowSourceModal(false);
    setEditingSource(null);
  };

  const saveSource = async () => {
    if (!editingSource) return;
    if (!editingSource.name.trim()) {
      alert(tr.requiredFields);
      return;
    }
    if (editingSource.source_type === "rss" && !editingSource.rss_url?.trim()) {
      alert(tr.requiredFields);
      return;
    }

    const isEdit = !!editingSource.created_at;
    const method = isEdit ? "PATCH" : "POST";
    const body = isEdit
      ? {
          id: editingSource.id,
          name: editingSource.name,
          rss_url: editingSource.rss_url || null,
          website_url: editingSource.website_url || null,
          category: editingSource.category,
          language: editingSource.language,
          source_type: editingSource.source_type,
          enabled: editingSource.enabled,
        }
      : {
          name: editingSource.name,
          rss_url: editingSource.rss_url || null,
          website_url: editingSource.website_url || null,
          category: editingSource.category,
          language: editingSource.language,
          source_type: editingSource.source_type,
          enabled: editingSource.enabled,
        };

    const res = await fetch("/api/news-sources/crud", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`${tr.sourceError}: ${err.error || res.statusText}`);
      return;
    }
    await fetchSources();
    closeModal();
  };

  const deleteSource = async (source: NewsSource) => {
    if (!confirm(tr.confirmDelete)) return;
    const res = await fetch(`/api/news-sources/crud?id=${encodeURIComponent(source.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert(tr.sourceError);
      return;
    }
    await fetchSources();
  };

  // Phase 4b — manual news submit
  const submitManualNews = async () => {
    if (!addNewsUrl.trim()) {
      setAddNewsFeedback({ type: "error", msg: tr.addNewsUrlRequired });
      return;
    }
    setAddNewsSubmitting(true);
    setAddNewsFeedback(null);
    try {
      const secret = process.env.NEXT_PUBLIC_READING_ROOM_SECRET || "";
      const res = await fetch("/api/reading-room/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-reading-room-secret": secret,
        },
        body: JSON.stringify({
          url: addNewsUrl.trim(),
          title: addNewsTitle.trim() || undefined,
          summary: addNewsSummary.trim() || undefined,
          content: addNewsSummary.trim() || undefined,
          source: "manual_ui",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAddNewsFeedback({ type: "error", msg: `${tr.addNewsError}: ${err.error || res.statusText}` });
        return;
      }
      setAddNewsFeedback({ type: "success", msg: tr.addNewsSuccess });
      setAddNewsUrl("");
      setAddNewsTitle("");
      setAddNewsSummary("");
      fetchNews();
      setTimeout(() => {
        setShowAddNewsModal(false);
        setAddNewsFeedback(null);
      }, 1500);
    } catch (e: any) {
      setAddNewsFeedback({ type: "error", msg: `${tr.addNewsError}: ${e?.message || "unknown"}` });
    } finally {
      setAddNewsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-neutral-800 tracking-tight">{tr.title}</h2>
            <p className="text-neutral-500 mt-1 text-sm">{tr.subtitle}</p>
          </div>
          {isMock && <MockBadge />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSourcesPanel(!showSourcesPanel)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border ${
              showSourcesPanel
                ? "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                : "text-neutral-600 hover:bg-neutral-100 border-neutral-200"
            }`}
            title={tr.manageSources}
          >
            <Settings2 size={16} />
            <span className="hidden sm:inline">{tr.manageSources}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
              {sources.filter((s) => s.enabled).length}
            </span>
          </button>
          <button
            onClick={() => setShowCharts(!showCharts)}
            className={`p-2 rounded-lg text-sm transition-colors ${showCharts ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-400 hover:bg-neutral-100"}`}
          >
            <BarChart3 size={18} />
          </button>
          <button
            onClick={() => { setAddNewsFeedback(null); setShowAddNewsModal(true); }}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors shadow-sm"
          >
            <Plus size={16} />
            {tr.addNews}
          </button>
          <button
            onClick={() => { setPage(0); fetchNews(); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary-dark font-medium text-sm transition-colors shadow-sm"
          >
            <RefreshCw size={16} />
            {tr.refresh}
          </button>
        </div>
      </div>

      {/* Sources Panel (Phase 22 — CRUD) */}
      {showSourcesPanel && (
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200/60 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-neutral-800">{tr.providers}</h3>
              <p className="text-xs text-neutral-500 mt-0.5">{tr.providersSubtitle}</p>
            </div>
            <button
              onClick={openNewSource}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary text-white rounded-lg hover:bg-brand-primary-dark text-xs font-semibold transition-colors"
            >
              <Plus size={14} />
              {tr.addSource}
            </button>
          </div>
          {sourcesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-brand-primary" />
            </div>
          ) : sources.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-6">{tr.noSources}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sources.map((s) => (
                <div
                  key={s.id}
                  className={`border rounded-lg p-3 flex items-start justify-between gap-3 ${
                    s.enabled ? "bg-white border-neutral-200" : "bg-neutral-50 border-neutral-200 opacity-70"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-neutral-800 truncate">{s.name}</h4>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        s.source_type === "reading_room"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}>
                        {s.source_type === "reading_room" ? (
                          <span className="flex items-center gap-1"><BookOpen size={9} />{tr.readingRoomBadge}</span>
                        ) : (
                          s.source_type.toUpperCase()
                        )}
                      </span>
                      {!s.enabled && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">
                          {tr.disabled}
                        </span>
                      )}
                      {s.error_count > 0 && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-1">
                          <AlertTriangle size={9} />
                          {s.error_count}
                        </span>
                      )}
                    </div>
                    {s.rss_url && (
                      <p className="text-[11px] text-neutral-500 truncate" title={s.rss_url}>
                        {s.rss_url}
                      </p>
                    )}
                    {s.source_type === "reading_room" && (
                      <p className="text-[11px] text-neutral-500">{tr.readingRoomHint}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-neutral-400">
                      <span>{tr.lastFetched}: {relativeTime(s.last_fetched_at, lang)}</span>
                      <span>{(CATEGORY_LABELS[s.category]?.[lang]) || s.category}</span>
                      <span className="uppercase">{s.language}</span>
                    </div>
                    {s.last_error && (
                      <p className="text-[10px] text-red-600 mt-1 truncate" title={s.last_error}>
                        {tr.lastError}: {s.last_error}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => openEditSource(s)}
                      className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500 hover:text-brand-primary"
                      title={tr.editSource}
                    >
                      <Pencil size={13} />
                    </button>
                    {s.enabled && (
                      <button
                        onClick={() => deleteSource(s)}
                        className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600"
                        title={tr.deleteSource}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Analytics Charts */}
      {showCharts && allNewsForCharts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Category Donut */}
          <div className="bg-white rounded-lg p-5 shadow-sm border border-neutral-200/60">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">{tr.byCategory}</h3>
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
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">{tr.volumeBySource}</h3>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceVolumeData} barSize={24}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {sourceVolumeData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Article Count Area Chart */}
          <div className="bg-white rounded-lg p-5 shadow-sm border border-neutral-200/60">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">{tr.articlesPerDay}</h3>
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
          {tr.highlightedProducers}
        </button>
        {/* Phase 22 follow-up: Reading Room quick-filter chip */}
        <button
          onClick={() => setSourceFilter(sourceFilter === "Reading Room" ? "" : "Reading Room")}
          title={lang === "pt" ? "Mostrar apenas artigos enviados pela extensão Reading Room" : "Show only articles pushed via the Reading Room extension"}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
            sourceFilter === "Reading Room"
              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
              : "bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50"
          }`}
        >
          <Bookmark size={14} className={sourceFilter === "Reading Room" ? "fill-indigo-400 text-indigo-500" : ""} />
          {lang === "pt" ? "Reading Room" : "Reading Room"}
        </button>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-white border border-neutral-200 text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        >
          <option value="">{tr.allCategories}</option>
          {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
          ))}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-white border border-neutral-200 text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        >
          <option value="">{tr.allSources}</option>
          {sources.filter((s) => s.enabled).map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
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
          <p className="text-neutral-500 font-medium">{tr.noNews}</p>
          <p className="text-neutral-400 text-sm mt-1">{tr.runSyncHint}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <article key={item.id} className="bg-white rounded-lg shadow-sm border border-neutral-200/60 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                      {item.source_name}
                    </span>
                    {item.category && CATEGORY_LABELS[item.category] && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${CATEGORY_LABELS[item.category].color}`}>
                        {lang === "pt" ? CATEGORY_LABELS[item.category].pt : CATEGORY_LABELS[item.category].en}
                      </span>
                    )}
                    {item.source_name === "Reading Room" && (
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 flex items-center gap-1"
                        title={lang === "pt" ? "Salvo via extensão Reading Room" : "Pushed via Reading Room extension"}
                      >
                        <Bookmark size={10} className="fill-indigo-400 text-indigo-500" />
                        Reading Room
                      </span>
                    )}
                    {kbIndexedIds.has(item.id) && (
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 flex items-center gap-1"
                        title={lang === "pt" ? "Indexado na Base de Conhecimento (knowledge_items)" : "Indexed in the Knowledge Base (knowledge_items)"}
                      >
                        <Brain size={10} />
                        KB
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

      {/* Phase 4b — Add News Modal */}
      {showAddNewsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-neutral-200 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h3 className="text-lg font-semibold text-neutral-800">{tr.addNewsTitle}</h3>
              <button onClick={() => setShowAddNewsModal(false)} className="p-1.5 rounded hover:bg-neutral-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {tr.addNewsUrl} *
                </label>
                <input
                  type="url"
                  value={addNewsUrl}
                  onChange={(e) => setAddNewsUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder={tr.addNewsUrlPlaceholder}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {tr.addNewsTitleField}
                </label>
                <input
                  type="text"
                  value={addNewsTitle}
                  onChange={(e) => setAddNewsTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder={tr.addNewsTitlePlaceholder}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {tr.addNewsSummary}
                </label>
                <textarea
                  value={addNewsSummary}
                  onChange={(e) => setAddNewsSummary(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                  placeholder={tr.addNewsSummaryPlaceholder}
                />
              </div>
              {addNewsFeedback && (
                <div className={`text-sm px-3 py-2 rounded-lg ${
                  addNewsFeedback.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  {addNewsFeedback.msg}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
              <button
                onClick={() => setShowAddNewsModal(false)}
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                {tr.cancel}
              </button>
              <button
                onClick={submitManualNews}
                disabled={addNewsSubmitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg flex items-center gap-2"
              >
                {addNewsSubmitting && <Loader2 size={14} className="animate-spin" />}
                {addNewsSubmitting ? tr.addNewsSubmitting : tr.addNewsSubmit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Source CRUD Modal */}
      {showSourceModal && editingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-neutral-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h3 className="text-lg font-semibold text-neutral-800">
                {editingSource.created_at ? tr.editSource : tr.addSource}
              </h3>
              <button onClick={closeModal} className="p-1.5 rounded hover:bg-neutral-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {tr.sourceName} *
                </label>
                <input
                  type="text"
                  value={editingSource.name}
                  onChange={(e) => setEditingSource({ ...editingSource, name: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  placeholder="Canal Rural"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {tr.sourceType}
                </label>
                <select
                  value={editingSource.source_type}
                  onChange={(e) => setEditingSource({ ...editingSource, source_type: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                >
                  {SOURCE_TYPE_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st === "rss" ? tr.sourceTypeRss : st === "reading_room" ? tr.sourceTypeReadingRoom : st === "api" ? tr.sourceTypeApi : tr.sourceTypeScrape}
                    </option>
                  ))}
                </select>
              </div>

              {editingSource.source_type === "rss" && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {tr.rssUrl} *
                  </label>
                  <input
                    type="url"
                    value={editingSource.rss_url || ""}
                    onChange={(e) => setEditingSource({ ...editingSource, rss_url: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                    placeholder="https://example.com/feed"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  {tr.websiteUrl}
                </label>
                <input
                  type="url"
                  value={editingSource.website_url || ""}
                  onChange={(e) => setEditingSource({ ...editingSource, website_url: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  placeholder="https://example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {tr.category}
                  </label>
                  <select
                    value={editingSource.category}
                    onChange={(e) => setEditingSource({ ...editingSource, category: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {(CATEGORY_LABELS[c]?.[lang]) || c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {tr.language}
                  </label>
                  <select
                    value={editingSource.language}
                    onChange={(e) => setEditingSource({ ...editingSource, language: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  >
                    {LANGUAGE_OPTIONS.map((l) => (
                      <option key={l} value={l}>{l.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={editingSource.enabled}
                  onChange={(e) => setEditingSource({ ...editingSource, enabled: e.target.checked })}
                  className="rounded border-neutral-300"
                />
                {tr.enabled}
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                {tr.cancel}
              </button>
              <button
                onClick={saveSource}
                className="px-4 py-2 text-sm font-semibold text-white bg-brand-primary hover:bg-brand-primary-dark rounded-lg"
              >
                {tr.saveSource}
              </button>
            </div>
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
