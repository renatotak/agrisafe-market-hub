"use client";

import { useState, useEffect } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  mockPublishedArticles, mockContentTopics, mockHistoricalContexts,
  mockCommodities, mockMarketAlerts, mockRegulatoryNorms,
} from "@/data/mock";
import type { HistoricalContext } from "@/data/mock";
import { sampleCampaigns } from "@/data/campaigns";
import {
  ExternalLink, Linkedin, Instagram, Globe, Eye, Heart,
  MessageCircle, Share2, ChevronRight, Lightbulb, Calendar as CalendarIcon,
  Plus, TrendingUp, BookOpen, Zap, History,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { MockBadge } from "@/components/ui/MockBadge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

type Tab = "published" | "topics" | "calendar" | "campaigns";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  linkedin: Linkedin, instagram: Instagram, blog: Globe, website: Globe,
};
const CHANNEL_COLORS: Record<string, string> = {
  linkedin: "bg-[#0A66C2] text-white", instagram: "bg-[#E1306C] text-white", blog: "bg-brand-primary text-white", website: "bg-neutral-600 text-white",
};

const STATUS_STYLES: Record<string, { pt: string; en: string; variant: "success" | "warning" | "info" | "default" | "primary" }> = {
  published: { pt: "Publicado", en: "Published", variant: "success" },
  scheduled: { pt: "Agendado", en: "Scheduled", variant: "info" },
  draft: { pt: "Rascunho", en: "Draft", variant: "default" },
  suggested: { pt: "Sugerido", en: "Suggested", variant: "default" },
  approved: { pt: "Aprovado", en: "Approved", variant: "info" },
  in_progress: { pt: "Em Produ\u00e7\u00e3o", en: "In Progress", variant: "warning" },
  active: { pt: "Ativa", en: "Active", variant: "success" },
  completed: { pt: "Conclu\u00edda", en: "Completed", variant: "primary" },
  planned: { pt: "Planejada", en: "Planned", variant: "info" },
};

export function ContentHub({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [tab, setTab] = useState<Tab>("published");
  const [liveArticles, setLiveArticles] = useState(mockPublishedArticles);
  const [liveTopics, setLiveTopics] = useState(mockContentTopics);
  const [articlesMock, setArticlesMock] = useState(true);
  const [topicsMock, setTopicsMock] = useState(true);

  useEffect(() => {
    async function fetchLive() {
      const [{ data: arts }, { data: tops }] = await Promise.all([
        supabase.from("published_articles").select("*").order("published_at", { ascending: false }),
        supabase.from("content_topics").select("*").order("suggested_week"),
      ]);
      if (arts?.length) { setLiveArticles(arts as typeof mockPublishedArticles); setArticlesMock(false); }
      if (tops?.length) { setLiveTopics(tops as typeof mockContentTopics); setTopicsMock(false); }
    }
    fetchLive();
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "published", label: tr.contentHub.tabPublished },
    { id: "topics", label: tr.contentHub.tabTopics },
    { id: "calendar", label: tr.contentHub.tabCalendar },
    { id: "campaigns", label: tr.contentHub.tabCampaigns },
  ];

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-neutral-900">{tr.contentHub.title}</h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">{tr.contentHub.subtitle}</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-dark font-medium text-[14px] transition-colors">
          <Plus size={18} />
          {tab === "topics" ? tr.contentHub.newTopic : tr.contentHub.newArticle}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-neutral-200/50 rounded-md p-0.5 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded text-[13px] font-medium transition-colors whitespace-nowrap ${tab === t.id ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600 hover:text-neutral-800"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "published" && <PublishedArticlesTab lang={lang} articles={liveArticles} isMock={articlesMock} />}
      {tab === "topics" && <TopicPipelineTab lang={lang} topics={liveTopics} isMock={topicsMock} />}
      {tab === "calendar" && <ContentCalendarTab lang={lang} articles={liveArticles} topics={liveTopics} />}
      {tab === "campaigns" && <CampaignsTab lang={lang} />}
    </div>
  );
}

// ─── Published Articles Tab ───

function PublishedArticlesTab({ lang, articles, isMock }: { lang: Lang; articles: typeof mockPublishedArticles; isMock: boolean }) {
  const tr = t(lang);

  const totalViews = articles.reduce((s, a) => s + a.engagement_views, 0);
  const totalLikes = articles.reduce((s, a) => s + a.engagement_likes, 0);
  const totalComments = articles.reduce((s, a) => s + a.engagement_comments, 0);

  // Engagement chart data per article
  const engagementData = articles
    .filter((a) => a.channel === "linkedin")
    .map((a) => ({
      name: a.title.split(":")[0].slice(0, 25) + "...",
      views: a.engagement_views,
      likes: a.engagement_likes,
      comments: a.engagement_comments,
    }))
    .reverse();

  return (
    <div>
      {isMock && <div className="flex justify-end mb-3"><MockBadge /></div>}
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: tr.contentHub.views, value: totalViews.toLocaleString(), color: "text-info" },
          { label: tr.contentHub.likes, value: totalLikes.toLocaleString(), color: "text-error" },
          { label: tr.contentHub.comments, value: totalComments.toLocaleString(), color: "text-brand-primary" },
          { label: lang === "pt" ? "Avg. Engaj." : "Avg. Engag.", value: articles.length > 0 ? Math.round(totalViews / articles.length).toLocaleString() : "0", color: "text-warning" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[11px] font-semibold text-neutral-500 uppercase">{stat.label}</p>
            <p className={`text-[24px] font-bold text-neutral-900 mt-1`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Engagement Chart */}
      {engagementData.length > 1 && (
        <div className="bg-white rounded-lg p-5 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
          <h3 className="text-[13px] font-semibold text-neutral-700 mb-3">
            {lang === "pt" ? "Engajamento por Artigo (LinkedIn)" : "Engagement by Article (LinkedIn)"}
          </h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engagementData} barSize={16}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#A69B87" }} />
                <YAxis tick={{ fontSize: 10, fill: "#A69B87" }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #EFEADF" }} />
                <Bar dataKey="views" name={tr.contentHub.views} fill="#2196F3" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Articles List */}
      <div className="space-y-3">
        {articles.map((article) => {
          const ChannelIcon = CHANNEL_ICONS[article.channel] || Globe;
          return (
            <div key={article.id} className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${CHANNEL_COLORS[article.channel]}`}>
                      <ChannelIcon size={12} />
                      {article.channel.charAt(0).toUpperCase() + article.channel.slice(1)}
                    </span>
                    <time className="text-[11px] text-neutral-400">{new Date(article.published_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" })}</time>
                  </div>
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="group">
                    <h3 className="font-semibold text-neutral-900 text-[14px] leading-snug group-hover:text-brand-primary transition-colors">
                      {article.title}
                      <ExternalLink size={12} className="inline ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                  </a>
                  {article.thesis && (
                    <p className="text-[11px] text-brand-primary mt-1 font-medium flex items-center gap-1">
                      <Lightbulb size={10} /> {lang === "pt" ? "Tese" : "Thesis"}: {article.thesis}
                    </p>
                  )}
                  {article.historical_reference && (
                    <p className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-1">
                      <History size={10} /> {article.historical_reference}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-neutral-400 text-[12px] shrink-0">
                  <span className="flex items-center gap-1"><Eye size={14} />{article.engagement_views.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><Heart size={14} />{article.engagement_likes}</span>
                  <span className="flex items-center gap-1"><MessageCircle size={14} />{article.engagement_comments}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Topic Pipeline Tab ───

function TopicPipelineTab({ lang, topics, isMock }: { lang: Lang; topics: typeof mockContentTopics; isMock: boolean }) {
  const tr = t(lang);

  // Market signals that could inspire content
  const biggestMover = [...mockCommodities].sort((a, b) => Math.abs(b.change_24h) - Math.abs(a.change_24h))[0];
  const highImpactNorms = mockRegulatoryNorms.filter((n) => n.impact_level === "high");

  const linkedinTopics = topics.filter((t) => t.target_channel === "linkedin");
  const instagramTopics = topics.filter((t) => t.target_channel === "instagram");

  return (
    <div>
      {/* Market Signals Panel */}
      <div className="bg-neutral-900 rounded-lg p-4 mb-6">
        <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
          {lang === "pt" ? "Sinais de Mercado para Conte\u00fado" : "Market Signals for Content"}
        </p>
        <div className="flex flex-wrap gap-3">
          {biggestMover && (
            <div className="bg-neutral-800 rounded-md px-3 py-2 flex items-center gap-2">
              <TrendingUp size={14} className={biggestMover.change_24h > 0 ? "text-green-400" : "text-red-400"} />
              <span className="text-[12px] text-neutral-200">
                {lang === "pt" ? biggestMover.name_pt : biggestMover.name_en}: <strong>{biggestMover.change_24h > 0 ? "+" : ""}{biggestMover.change_24h}%</strong>
              </span>
            </div>
          )}
          {highImpactNorms.slice(0, 2).map((norm) => (
            <div key={norm.id} className="bg-neutral-800 rounded-md px-3 py-2 flex items-center gap-2">
              <BookOpen size={14} className="text-amber-400" />
              <span className="text-[12px] text-neutral-200 truncate max-w-[200px]">{norm.body}: {norm.title.slice(0, 40)}...</span>
            </div>
          ))}
          {mockMarketAlerts.filter((a) => a.severity === "high").slice(0, 1).map((alert) => (
            <div key={alert.id} className="bg-neutral-800 rounded-md px-3 py-2 flex items-center gap-2">
              <Zap size={14} className="text-red-400" />
              <span className="text-[12px] text-neutral-200 truncate max-w-[200px]">{lang === "pt" ? alert.message_pt.slice(0, 50) : alert.message_en.slice(0, 50)}...</span>
            </div>
          ))}
        </div>
      </div>

      {isMock && <div className="flex justify-end mb-3"><MockBadge /></div>}

      {/* Pipeline summary */}
      <div className="bg-brand-surface/50 border border-brand-light rounded-lg p-4 mb-6">
        <p className="text-[13px] font-medium text-brand-primary">
          <Lightbulb size={16} className="inline mr-1.5" />
          {lang === "pt"
            ? `${topics.length} temas cobrindo as pr\u00f3ximas ${new Set(topics.map((t) => t.suggested_week)).size} semanas`
            : `${topics.length} topics covering the next ${new Set(topics.map((t) => t.suggested_week)).size} weeks`
          }
        </p>
      </div>

      {/* LinkedIn Topics */}
      <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-3">
        <Linkedin size={14} className="inline mr-1" /> LinkedIn ({linkedinTopics.length})
      </h3>
      <div className="space-y-3 mb-6">
        {linkedinTopics.map((topic) => (
          <TopicCard key={topic.id} topic={topic} lang={lang} />
        ))}
      </div>

      {instagramTopics.length > 0 && (
        <>
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] mb-3">
            <Instagram size={14} className="inline mr-1" /> Instagram ({instagramTopics.length})
          </h3>
          <div className="space-y-3">
            {instagramTopics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} lang={lang} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TopicCard({ topic, lang }: { topic: typeof mockContentTopics[0]; lang: Lang }) {
  const tr = t(lang);
  const [expanded, setExpanded] = useState(false);
  const weekNum = topic.suggested_week.split("W")[1];

  // Find matching historical context
  const matchingContexts = mockHistoricalContexts.filter((hc) =>
    topic.keywords.some((kw) => hc.keywords.some((hkw) => hkw.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(hkw.toLowerCase())))
  );

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full px-5 py-4 text-left flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-neutral-400">W{weekNum}</span>
            <Badge variant={STATUS_STYLES[topic.status]?.variant || "default"}>
              {lang === "pt" ? STATUS_STYLES[topic.status]?.pt : STATUS_STYLES[topic.status]?.en}
            </Badge>
            {matchingContexts.length > 0 && (
              <span className="text-[10px] text-warning-dark bg-warning-light px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                <History size={9} /> {matchingContexts.length}
              </span>
            )}
          </div>
          <h4 className="font-semibold text-neutral-900 text-[14px] leading-snug">
            {lang === "pt" ? topic.thesis_pt : topic.thesis_en}
          </h4>
        </div>
        <ChevronRight size={16} className={`text-neutral-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="px-5 pb-4 border-t border-neutral-100 pt-3 space-y-3">
          {/* Historical angle */}
          {(lang === "pt" ? topic.historical_angle_pt : topic.historical_angle_en) && (
            <div className="bg-warning-light/50 border border-warning-light rounded-md p-3">
              <p className="text-[11px] font-semibold text-warning-dark uppercase mb-0.5">{tr.contentHub.historicalAngle}</p>
              <p className="text-[13px] text-neutral-800">{lang === "pt" ? topic.historical_angle_pt : topic.historical_angle_en}</p>
            </div>
          )}

          {/* Matching historical contexts from database */}
          {matchingContexts.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-neutral-500 uppercase mb-2 flex items-center gap-1">
                <History size={12} />
                {lang === "pt" ? "Contexto Hist\u00f3rico Relevante" : "Relevant Historical Context"}
              </p>
              <div className="space-y-2">
                {matchingContexts.map((hc) => (
                  <div key={hc.id} className="bg-neutral-50 rounded-md p-3 border border-neutral-200/60">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-neutral-400 bg-neutral-200 px-1.5 py-0.5 rounded">{hc.period}</span>
                      <p className="text-[12px] font-semibold text-neutral-800">{lang === "pt" ? hc.title_pt : hc.title_en}</p>
                    </div>
                    <p className="text-[11px] text-neutral-600 leading-relaxed">{lang === "pt" ? hc.summary_pt : hc.summary_en}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supporting data */}
          <div>
            <p className="text-[11px] font-semibold text-neutral-500 uppercase mb-1">{tr.contentHub.supportingData}</p>
            <div className="flex flex-wrap gap-1.5">
              {topic.supporting_data.map((d, i) => (
                <span key={i} className="text-[11px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full">{d}</span>
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div className="flex flex-wrap gap-1.5">
            {topic.keywords.map((kw) => (
              <span key={kw} className="text-[10px] text-brand-primary bg-brand-surface px-2 py-0.5 rounded-full font-medium">#{kw}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Content Calendar Tab ───

function ContentCalendarTab({ lang, articles, topics }: { lang: Lang; articles: typeof mockPublishedArticles; topics: typeof mockContentTopics }) {

  const weeks: Record<string, { topics: typeof mockContentTopics; articles: typeof mockPublishedArticles }> = {};
  topics.forEach((t) => { if (!weeks[t.suggested_week]) weeks[t.suggested_week] = { topics: [], articles: [] }; weeks[t.suggested_week].topics.push(t); });
  articles.forEach((a) => {
    const d = new Date(a.published_at);
    const week = `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, "0")}`;
    if (!weeks[week]) weeks[week] = { topics: [], articles: [] };
    weeks[week].articles.push(a);
  });

  const sortedWeeks = Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-3">
      {sortedWeeks.map(([week, data]) => {
        const weekNum = week.split("W")[1];
        return (
          <div key={week} className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarIcon size={14} className="text-neutral-400" />
              <span className="text-[12px] font-bold text-neutral-700">{lang === "pt" ? "Semana" : "Week"} {weekNum}</span>
              {data.articles.length > 0 && <span className="text-[10px] bg-success-light text-success-dark px-2 py-0.5 rounded-full font-semibold">{data.articles.length} {lang === "pt" ? "publicado(s)" : "published"}</span>}
              {data.topics.length > 0 && <span className="text-[10px] bg-info-light text-info-dark px-2 py-0.5 rounded-full font-semibold">{data.topics.length} {lang === "pt" ? "planejado(s)" : "planned"}</span>}
            </div>
            <div className="space-y-1.5">
              {data.articles.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-[13px]">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.channel === "linkedin" ? "bg-[#0A66C2]" : a.channel === "instagram" ? "bg-[#E1306C]" : "bg-brand-primary"}`} />
                  <span className="text-neutral-800 font-medium truncate">{a.title}</span>
                  <Badge variant="success" className="shrink-0 text-[10px]">{lang === "pt" ? "Publicado" : "Published"}</Badge>
                </div>
              ))}
              {data.topics.map((tp) => (
                <div key={tp.id} className="flex items-center gap-2 text-[13px]">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${tp.target_channel === "linkedin" ? "bg-[#0A66C2]" : "bg-[#E1306C]"}`} />
                  <span className="text-neutral-600 truncate">{lang === "pt" ? tp.thesis_pt : tp.thesis_en}</span>
                  <Badge variant={STATUS_STYLES[tp.status]?.variant || "default"} className="shrink-0 text-[10px]">
                    {lang === "pt" ? STATUS_STYLES[tp.status]?.pt : STATUS_STYLES[tp.status]?.en}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Campaigns Tab ───

function CampaignsTab({ lang }: { lang: Lang }) {
  const campaigns = sampleCampaigns;

  return (
    <div>
      <div className="flex justify-end mb-3"><MockBadge /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(["draft", "planned", "active", "completed"] as const).map((status) => {
          const count = campaigns.filter((c) => c.status === status).length;
          const info = STATUS_STYLES[status];
          return (
            <div key={status} className="bg-white rounded-lg p-4 border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
              <p className="text-[24px] font-bold text-neutral-900">{count}</p>
              <Badge variant={info?.variant || "default"}>{lang === "pt" ? info?.pt : info?.en}</Badge>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        {campaigns.map((campaign) => {
          const info = STATUS_STYLES[campaign.status];
          return (
            <div key={campaign.id} className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-neutral-900 text-[14px]">{campaign.name}</h3>
                <Badge variant={info?.variant || "default"}>{lang === "pt" ? info?.pt : info?.en}</Badge>
              </div>
              <p className="text-[12px] text-neutral-600 mb-3">{campaign.description}</p>
              <div className="flex items-center gap-4 text-[11px] text-neutral-500">
                <span>{campaign.startDate} \u2192 {campaign.endDate}</span>
                <span>{campaign.contentPieces} {lang === "pt" ? "pe\u00e7as" : "pieces"}</span>
                <span className="font-medium text-brand-primary">{campaign.pillar}</span>
                <div className="flex gap-1 ml-auto">
                  {campaign.channels.map((ch) => (
                    <span key={ch} className="bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded text-[10px] font-medium">{ch}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
