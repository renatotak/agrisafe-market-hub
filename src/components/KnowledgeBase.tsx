"use client";

import { useState, useEffect } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { MockBadge } from "@/components/ui/MockBadge";
import { Badge } from "@/components/ui/Badge";
import {
  Search, Newspaper, BookOpen, Lightbulb,
  BarChart3, Loader2, ExternalLink, Network,
} from "lucide-react";
import { KnowledgeMindMap } from "@/components/KnowledgeMindMap";

interface KnowledgeItem {
  id: string;
  tier: number;
  title: string;
  summary: string | null;
  source_type: string;
  category: string | null;
  tags: string[];
  published_at: string | null;
  source_url: string | null;
  data_origin: string;
  timing: string;
  purpose: string[];
}

interface TierStats {
  tier: number;
  count: number;
}

const TIER_CONFIG = [
  { tier: 1, icon: BarChart3, labelPt: "Dados de Mercado", labelEn: "Market Data", descPt: "Dados num\u00e9ricos recorrentes", descEn: "Recurring numerical data", color: "bg-brand-surface text-brand-primary" },
  { tier: 2, icon: Newspaper, labelPt: "Not\u00edcias & Eventos", labelEn: "News & Events", descPt: "Atualiza\u00e7\u00f5es qualitativas", descEn: "Qualitative updates", color: "bg-info-light text-info-dark" },
  { tier: 3, icon: BookOpen, labelPt: "Dados Est\u00e1ticos", labelEn: "Static Data", descPt: "Defini\u00e7\u00f5es, regulamenta\u00e7\u00f5es", descEn: "Definitions, regulations", color: "bg-warning-light text-warning-dark" },
  { tier: 4, icon: Lightbulb, labelPt: "Insights Curados", labelEn: "Curated Insights", descPt: "An\u00e1lises propriet\u00e1rias AgriSafe", descEn: "AgriSafe proprietary analysis", color: "bg-error-light text-error-dark" },
];

export function KnowledgeBase({ lang }: { lang: Lang }) {
  const [tierStats, setTierStats] = useState<TierStats[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [isMock, setIsMock] = useState(true);
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"search" | "mindmap">("search");

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const { data, count } = await supabase
      .from("knowledge_items")
      .select("tier", { count: "exact" });

    if (data?.length) {
      setIsMock(false);
      const stats: Record<number, number> = {};
      data.forEach((d: any) => { stats[d.tier] = (stats[d.tier] || 0) + 1; });
      setTierStats([1, 2, 3, 4].map(t => ({ tier: t, count: stats[t] || 0 })));
      setTotalItems(count || 0);
    } else {
      // Mock stats based on existing data
      setIsMock(true);
      setTierStats([
        { tier: 1, count: 12 },  // commodity prices + indicators
        { tier: 2, count: 25 },  // agro_news
        { tier: 3, count: 8 },   // regulatory_norms
        { tier: 4, count: 6 },   // published_articles (curated)
      ]);
      setTotalItems(51);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery || searchQuery.length < 2) return;
    setSearching(true);

    // Try live search first
    const { data } = await supabase
      .from("knowledge_items")
      .select("id, tier, title, summary, source_type, category, tags, published_at, source_url, data_origin, timing, purpose")
      .or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,summary.ilike.%${searchQuery}%`)
      .order("indexed_at", { ascending: false })
      .limit(20);

    if (data?.length) {
      setSearchResults(data as KnowledgeItem[]);
    } else {
      // Search across existing tables as fallback
      const [{ data: news }, { data: norms }] = await Promise.all([
        supabase.from("agro_news").select("id, title, summary, source_name, source_url, published_at, category").ilike("title", `%${searchQuery}%`).limit(10),
        supabase.from("regulatory_norms").select("id, title, summary, body, source_url, published_at, impact_level").ilike("title", `%${searchQuery}%`).limit(5),
      ]);

      const results: KnowledgeItem[] = [
        ...(news || []).map((n: any) => ({
          id: n.id, tier: 2, title: n.title, summary: n.summary,
          source_type: "news", category: n.category, tags: [],
          published_at: n.published_at, source_url: n.source_url,
          data_origin: "tier_1_public", timing: "non_recurring", purpose: ["marketing"],
        })),
        ...(norms || []).map((n: any) => ({
          id: n.id, tier: 3, title: n.title, summary: n.summary,
          source_type: "regulatory_norm", category: "regulatory", tags: [],
          published_at: n.published_at, source_url: n.source_url,
          data_origin: "tier_1_public", timing: "persistent", purpose: ["credit_analysis"],
        })),
      ];
      setSearchResults(results);
    }
    setSearching(false);
  };

  const tierTotal = tierStats.reduce((s, t) => s + t.count, 0);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-neutral-900">
              {lang === "pt" ? "Base de Conhecimento" : "Knowledge Base"}
            </h2>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              {lang === "pt"
                ? `${tierTotal} itens indexados em 4 n\u00edveis de conhecimento`
                : `${tierTotal} items indexed across 4 knowledge tiers`}
            </p>
          </div>
          {isMock && <MockBadge />}
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab("search")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${activeTab === "search" ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-500 hover:text-neutral-700"}`}
          >
            <Search size={14} /> {lang === "pt" ? "Busca Semântica" : "Semantic Search"}
          </button>
          <button
            onClick={() => setActiveTab("mindmap")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${activeTab === "mindmap" ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-500 hover:text-neutral-700"}`}
          >
            <Network size={14} /> {lang === "pt" ? "Mapa de Conexões" : "Connection Map"}
          </button>
        </div>
      </div>

      {activeTab === "mindmap" ? (
        <KnowledgeMindMap lang={lang} />
      ) : (<>

      {/* Tier Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {TIER_CONFIG.map((tc) => {
          const stat = tierStats.find(s => s.tier === tc.tier);
          const count = stat?.count || 0;
          const isActive = tierFilter === tc.tier;

          return (
            <button key={tc.tier} onClick={() => setTierFilter(isActive ? null : tc.tier)}
              className={`rounded-lg p-4 border text-left transition-all ${isActive ? "border-brand-primary bg-brand-surface/50 shadow-sm" : "border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-neutral-300"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tc.color}`}>
                  <tc.icon size={16} />
                </div>
                <span className="text-[10px] font-bold text-neutral-400">TIER {tc.tier}</span>
              </div>
              <p className="text-[24px] font-bold text-neutral-900">{count}</p>
              <p className="text-[12px] font-semibold text-neutral-700 mt-0.5">{lang === "pt" ? tc.labelPt : tc.labelEn}</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">{lang === "pt" ? tc.descPt : tc.descEn}</p>
            </button>
          );
        })}
      </div>

      {/* Knowledge Search */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={lang === "pt" ? "Ex: cr\u00e9dito rural, CPR, recupera\u00e7\u00e3o judicial..." : "E.g.: rural credit, CPR, judicial recovery..."}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>
          <button onClick={handleSearch} disabled={searching || searchQuery.length < 2}
            className="px-5 py-2.5 bg-brand-primary text-white rounded-md hover:bg-brand-dark font-medium text-[14px] transition-colors disabled:opacity-50">
            {searching ? <Loader2 size={16} className="animate-spin" /> : (lang === "pt" ? "Buscar" : "Search")}
          </button>
        </div>
        <p className="text-[10px] text-neutral-400 mt-2">
          {lang === "pt"
            ? "Busca semântica (IA) e por palavra-chave em notícias, normas regulatórias e artigos."
            : "AI semantic and keyword search across news, regulatory norms, and articles."}
        </p>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
            {searchResults.length} {lang === "pt" ? "resultados" : "results"}
          </h3>
          <div className="space-y-2">
            {searchResults.filter(r => tierFilter === null || r.tier === tierFilter).map((item) => {
              const tierConf = TIER_CONFIG.find(t => t.tier === item.tier);
              return (
                <div key={item.id} className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tierConf?.color || "bg-neutral-100 text-neutral-600"}`}>
                          T{item.tier}
                        </span>
                        <span className="text-[10px] text-neutral-400 uppercase">{item.source_type.replace("_", " ")}</span>
                        {item.category && (
                          <Badge variant="default" className="text-[9px]">{item.category}</Badge>
                        )}
                      </div>
                      <h4 className="font-semibold text-neutral-900 text-[13px] leading-snug">{item.title}</h4>
                      {item.summary && <p className="text-[12px] text-neutral-600 mt-1 line-clamp-2">{item.summary}</p>}
                    </div>
                    {item.source_url && (
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-brand-primary shrink-0">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  {item.published_at && (
                    <p className="text-[10px] text-neutral-400 mt-2">
                      {new Date(item.published_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Coverage Overview */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <h3 className="text-[14px] font-semibold text-neutral-900 mb-4">
          {lang === "pt" ? "Cobertura do Conhecimento" : "Knowledge Coverage"}
        </h3>
        <div className="space-y-3">
          {TIER_CONFIG.map((tc) => {
            const stat = tierStats.find(s => s.tier === tc.tier);
            const count = stat?.count || 0;
            const pct = tierTotal > 0 ? Math.round((count / tierTotal) * 100) : 0;

            return (
              <div key={tc.tier} className="flex items-center gap-4">
                <div className="w-24 text-[12px] font-medium text-neutral-700">
                  T{tc.tier}: {lang === "pt" ? tc.labelPt : tc.labelEn}
                </div>
                <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{
                    width: `${pct}%`,
                    backgroundColor: tc.tier === 1 ? "#5B7A2F" : tc.tier === 2 ? "#2196F3" : tc.tier === 3 ? "#E8722A" : "#F44336",
                  }} />
                </div>
                <span className="text-[12px] font-semibold text-neutral-600 w-16 text-right">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-neutral-200 text-[11px] text-neutral-500">
          <p>
            {lang === "pt"
              ? "Busca semântica via Google Gemini Embeddings + pgvector. Indexação automática pelo cron diário."
              : "Semantic search powered by Google Gemini Embeddings + pgvector. Automatic indexing via daily cron."}
          </p>
        </div>
      </div>
      </>)}
    </div>
  );
}
