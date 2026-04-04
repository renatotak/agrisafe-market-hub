"use client";

import { useState, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { publishedArticles, campaigns } from "@/data/published-articles";
import type { PublishedArticle } from "@/data/published-articles";
import {
  ExternalLink, Linkedin, Instagram, Globe, Calendar as CalendarIcon,
  Plus, FileText, Image, ChevronDown, Filter, Search,
} from "lucide-react";

type Tab = "published" | "pipeline" | "calendar";

const CHANNEL_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  linkedin: Linkedin, instagram: Instagram, blog: Globe,
};
const CHANNEL_COLOR: Record<string, string> = {
  linkedin: "bg-[#0A66C2]", instagram: "bg-[#E1306C]", blog: "bg-brand-primary",
};
const STATUS_STYLE: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  scheduled: "bg-blue-100 text-blue-700",
  draft: "bg-neutral-100 text-neutral-600",
};

export function ContentHub({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [activeTab, setActiveTab] = useState<Tab>("published");
  const [searchTerm, setSearchTerm] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Stats
  const published = publishedArticles.filter((a) => a.status === "published");
  const drafts = publishedArticles.filter((a) => a.status === "draft");
  const scheduled = publishedArticles.filter((a) => a.status === "scheduled");

  // Filtered articles
  const filtered = useMemo(() => {
    let list = [...publishedArticles];
    if (activeTab === "published") list = list.filter((a) => a.status === "published");
    if (activeTab === "pipeline") list = list.filter((a) => a.status !== "published");
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)) ||
        a.campaign.toLowerCase().includes(q) ||
        a.thesis?.toLowerCase().includes(q)
      );
    }
    if (campaignFilter) list = list.filter((a) => a.campaign === campaignFilter);
    return list.sort((a, b) => b.published_at.localeCompare(a.published_at));
  }, [activeTab, searchTerm, campaignFilter]);

  // Calendar data
  const calendarWeeks = useMemo(() => {
    const weeks: Record<string, PublishedArticle[]> = {};
    publishedArticles.forEach((a) => {
      const d = new Date(a.published_at + "T12:00:00");
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1); // Monday
      const key = weekStart.toISOString().split("T")[0];
      if (!weeks[key]) weeks[key] = [];
      weeks[key].push(a);
    });
    return Object.entries(weeks).sort(([a], [b]) => b.localeCompare(a));
  }, []);

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" });

  const formatWeek = (d: string) => {
    const start = new Date(d + "T12:00:00");
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    const locale = lang === "pt" ? "pt-BR" : "en-US";
    return `${start.toLocaleDateString(locale, opts)} — ${end.toLocaleDateString(locale, opts)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-1">{tr.contentHub.title}</h1>
          <p className="text-[14px] text-neutral-500">{tr.contentHub.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-neutral-500">
            {published.length} {lang === "pt" ? "publicados" : "published"} &middot; {scheduled.length} {lang === "pt" ? "agendados" : "scheduled"} &middot; {drafts.length} {lang === "pt" ? "rascunhos" : "drafts"}
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase">{lang === "pt" ? "Total Artigos" : "Total Articles"}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-0.5">{publishedArticles.length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase">{lang === "pt" ? "Campanhas" : "Campaigns"}</p>
          <p className="text-[24px] font-bold text-neutral-900 mt-0.5">{campaigns.length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[10px] font-semibold text-green-600 uppercase">{lang === "pt" ? "Publicados" : "Published"}</p>
          <p className="text-[24px] font-bold text-green-700 mt-0.5">{published.length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[10px] font-semibold text-blue-600 uppercase">{lang === "pt" ? "Em Produção" : "In Production"}</p>
          <p className="text-[24px] font-bold text-blue-700 mt-0.5">{scheduled.length + drafts.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200">
        {([
          { key: "published" as Tab, label: lang === "pt" ? "Publicados" : "Published", count: published.length },
          { key: "pipeline" as Tab, label: "Pipeline", count: scheduled.length + drafts.length },
          { key: "calendar" as Tab, label: lang === "pt" ? "Calendário" : "Calendar", count: null },
        ]).map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors ${
              activeTab === tab.key ? "border-brand-primary text-brand-primary" : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}>
            {tab.key === "published" && <FileText size={16} />}
            {tab.key === "pipeline" && <Plus size={16} />}
            {tab.key === "calendar" && <CalendarIcon size={16} />}
            {tab.label}
            {tab.count !== null && <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full ml-1">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Filters */}
      {activeTab !== "calendar" && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={lang === "pt" ? "Buscar artigo, tema, tag..." : "Search article, topic, tag..."}
              className="w-full pl-9 pr-4 py-2 border border-neutral-300 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary" />
          </div>
          <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-md text-[13px] bg-white min-w-[160px]">
            <option value="">{lang === "pt" ? "Todas as campanhas" : "All campaigns"}</option>
            {campaigns.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.articles})</option>)}
          </select>
        </div>
      )}

      {/* Published / Pipeline list */}
      {activeTab !== "calendar" && (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
              {lang === "pt" ? "Nenhum artigo encontrado" : "No articles found"}
            </div>
          ) : (
            filtered.map((article) => {
              const ChIcon = CHANNEL_ICON[article.channel] || Globe;
              const isOpen = expandedId === article.id;
              return (
                <div key={article.id} className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <button onClick={() => setExpandedId(isOpen ? null : article.id)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-neutral-50 transition-colors">
                    {/* Channel icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${CHANNEL_COLOR[article.channel] || "bg-neutral-600"}`}>
                      <ChIcon size={16} />
                    </div>

                    {/* Title + campaign */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-neutral-900 truncate">{article.title}</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">{article.campaign} &middot; {formatDate(article.published_at)}</p>
                    </div>

                    {/* Status + assets */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {article.hasImage && <Image size={13} className="text-neutral-300" />}
                      {article.hasDoc && <FileText size={13} className="text-neutral-300" />}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_STYLE[article.status]}`}>
                        {article.status === "published" ? (lang === "pt" ? "Publicado" : "Published") :
                         article.status === "scheduled" ? (lang === "pt" ? "Agendado" : "Scheduled") :
                         (lang === "pt" ? "Rascunho" : "Draft")}
                      </span>
                      <ChevronDown size={14} className={`text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 pt-0 border-t border-neutral-100 bg-neutral-50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                        {article.thesis && (
                          <div>
                            <p className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">{lang === "pt" ? "Tese" : "Thesis"}</p>
                            <p className="text-[13px] text-neutral-700">{article.thesis}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {article.tags.map((tag) => (
                              <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-600">{tag}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">{lang === "pt" ? "Pasta" : "Folder"}</p>
                          <p className="text-[12px] text-neutral-600 font-mono">{article.folder}/</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">{lang === "pt" ? "Ativos" : "Assets"}</p>
                          <div className="flex items-center gap-3 text-[12px] text-neutral-600">
                            {article.hasDoc && <span className="flex items-center gap-1"><FileText size={12} /> .docx</span>}
                            {article.hasImage && <span className="flex items-center gap-1"><Image size={12} /> .png</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Calendar view */}
      {activeTab === "calendar" && (
        <div className="space-y-4">
          {calendarWeeks.map(([weekKey, articles]) => (
            <div key={weekKey} className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-2.5 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarIcon size={14} className="text-neutral-400" />
                  <span className="text-[12px] font-semibold text-neutral-700">{formatWeek(weekKey)}</span>
                </div>
                <span className="text-[10px] text-neutral-400">{articles.length} {lang === "pt" ? "artigo(s)" : "article(s)"}</span>
              </div>
              <div className="divide-y divide-neutral-100">
                {articles.sort((a, b) => a.published_at.localeCompare(b.published_at)).map((article) => {
                  const ChIcon = CHANNEL_ICON[article.channel] || Globe;
                  return (
                    <div key={article.id} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="text-[11px] font-mono text-neutral-400 w-16 flex-shrink-0">{formatDate(article.published_at).split(" de ")[0] || formatDate(article.published_at).split(",")[0]}</span>
                      <div className={`w-6 h-6 rounded flex items-center justify-center text-white flex-shrink-0 ${CHANNEL_COLOR[article.channel] || "bg-neutral-600"}`}>
                        <ChIcon size={12} />
                      </div>
                      <p className="text-[12px] font-medium text-neutral-900 flex-1 truncate">{article.title}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${STATUS_STYLE[article.status]}`}>
                        {article.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campaign summary */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <h3 className="text-[14px] font-semibold text-neutral-900 mb-3">{lang === "pt" ? "Campanhas" : "Campaigns"}</h3>
        <div className="space-y-2">
          {campaigns.map((c) => (
            <button key={c.name} onClick={() => { setCampaignFilter(c.name === campaignFilter ? "" : c.name); setActiveTab("published"); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors ${
                campaignFilter === c.name ? "border-brand-primary bg-brand-surface/30" : "border-neutral-200 hover:border-neutral-300"
              }`}>
              <div>
                <p className="text-[13px] font-semibold text-neutral-900">{c.name}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">{formatDate(c.startDate)} — {formatDate(c.endDate)}</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-green-600 font-semibold">{c.published} pub</span>
                {c.scheduled > 0 && <span className="text-blue-600 font-semibold">{c.scheduled} sched</span>}
                {c.draft > 0 && <span className="text-neutral-400 font-semibold">{c.draft} draft</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
