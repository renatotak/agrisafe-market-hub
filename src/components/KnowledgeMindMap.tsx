"use client";

import { useEffect, useState, useMemo } from "react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  BarChart3, Newspaper, BookOpen, Lightbulb, Loader2,
  Database, Brain, Link2, Info, Sparkles,
} from "lucide-react";

// ─── Mind map node definitions ────────────────────────────────────────────────

interface MapNode {
  id: string;
  table: string;
  label: string;
  tier: 1 | 2 | 3 | 4;
  x: number;
  y: number;
  description: { pt: string; en: string };
  /** Module that uses this table */
  module?: string;
  /** Marks nodes that don't yet exist (planned in Phase 17+) */
  planned?: boolean;
}

interface MapEdge {
  from: string;
  to: string;
  type: "fk" | "view" | "planned";
  label?: string;
}

const W = 1000;
const H = 720;
const CX = W / 2;
const CY = H / 2;

// ─── 4 Tier centers (anchor points) ───
const TIER_ANCHORS: Record<number, { x: number; y: number; angle: number }> = {
  1: { x: 180, y: CY,   angle: 180 }, // LEFT — Market Data
  4: { x: CX,  y: 110,  angle: 270 }, // TOP — Curated
  3: { x: 820, y: CY,   angle: 0   }, // RIGHT — Static Data
  2: { x: CX,  y: 610,  angle: 90  }, // BOTTOM — News & Events
};

// ─── CURRENT STATE: 22 tables with existing FKs (April 2026) ─────────────────
const CURRENT_NODES: MapNode[] = [
  // ─── Tier 1: Market Data (LEFT) ───
  { id: "n_cp", table: "commodity_prices", label: "commodity_prices", tier: 1, x: 90, y: 320,
    description: { pt: "Preços diários de 6 commodities (BCB SGS)", en: "Daily prices of 6 commodities (BCB SGS)" },
    module: "Pulso do Mercado" },
  { id: "n_cph", table: "commodity_price_history", label: "commodity_price_history", tier: 1, x: 90, y: 380,
    description: { pt: "Histórico temporal de preços", en: "Time-series price history" },
    module: "Pulso do Mercado" },
  { id: "n_mi", table: "market_indicators", label: "market_indicators", tier: 1, x: 90, y: 440,
    description: { pt: "USD/BRL, Selic, Plano Safra (BCB)", en: "USD/BRL, Selic, Crop Plan (BCB)" },
    module: "Pulso do Mercado" },

  // ─── Tier 4: Curated Insights (TOP) ───
  { id: "n_ki", table: "knowledge_items", label: "knowledge_items", tier: 4, x: CX,      y: 50,
    description: { pt: "Índice unificado para busca semântica (pgvector)", en: "Unified semantic search index (pgvector)" },
    module: "Base de Conhecimento" },
  { id: "n_pa", table: "published_articles", label: "published_articles", tier: 4, x: CX - 130, y: 130,
    description: { pt: "6 artigos publicados pela AgriSafe (LinkedIn)", en: "6 articles published by AgriSafe (LinkedIn)" },
    module: "Central de Conteúdo" },
  { id: "n_ct", table: "content_topics", label: "content_topics", tier: 4, x: CX + 130, y: 130,
    description: { pt: "Pipeline de temas: tese + dados + ângulo histórico", en: "Topic pipeline: thesis + data + historical angle" },
    module: "Central de Conteúdo" },
  { id: "n_nk", table: "news_knowledge", label: "news_knowledge", tier: 4, x: CX,      y: 180,
    description: { pt: "Notícias arquivadas com embeddings (>3 meses)", en: "Archived news with embeddings (>3mo)" },
    module: "Base de Conhecimento" },

  // ─── Tier 3: Static Data (RIGHT) — retailers hub ───
  { id: "n_r",  table: "retailers",            label: "retailers",            tier: 3, x: 820, y: CY,
    description: { pt: "9.328 canais de distribuição (revendas, cooperativas)", en: "9,328 distribution channels" },
    module: "Diretório de Revendas" },
  { id: "n_rl", table: "retailer_locations",   label: "retailer_locations",   tier: 3, x: 730, y: 280,
    description: { pt: "24.275 estabelecimentos com geolocalização", en: "24,275 establishments with geolocation" },
    module: "Diretório de Revendas" },
  { id: "n_ce", table: "company_enrichment",   label: "company_enrichment",   tier: 3, x: 920, y: 280,
    description: { pt: "Cache Receita Federal (BrasilAPI/CNPJ.ws)", en: "Receita Federal cache" },
    module: "Diretório de Revendas" },
  { id: "n_cn", table: "company_notes",        label: "company_notes",        tier: 3, x: 730, y: 440,
    description: { pt: "Notas editáveis do usuário", en: "User-editable notes" },
    module: "Diretório de Revendas" },
  { id: "n_ri", table: "retailer_intelligence", label: "retailer_intelligence", tier: 3, x: 920, y: 440,
    description: { pt: "Inteligência IA por revenda (Gemini)", en: "AI intelligence per retailer (Gemini)" },
    module: "Diretório de Revendas" },
  { id: "n_ind", table: "industries",          label: "industries",           tier: 3, x: 940, y: 350,
    description: { pt: "18 indústrias normalizadas (Bayer, Syngenta, etc.)", en: "18 normalized industries" },
    module: "Diretório de Revendas" },
  { id: "n_rind", table: "retailer_industries", label: "retailer_industries", tier: 3, x: 880, y: 380,
    description: { pt: "Junction revenda × indústria (392 vínculos)", en: "Retailer × industry junction (392 links)" },
    module: "Diretório de Revendas" },
  { id: "n_ip",  table: "industry_products",   label: "industry_products",    tier: 3, x: 990, y: 410,
    description: { pt: "Catálogo de produtos por indústria", en: "Product catalog per industry" },
    module: "Diretório de Revendas" },
  { id: "n_co",  table: "competitors",         label: "competitors",          tier: 3, x: 700, y: 360,
    description: { pt: "7 concorrentes monitorados", en: "7 competitors monitored" },
    module: "Radar Competitivo" },
  { id: "n_cs",  table: "competitor_signals",  label: "competitor_signals",   tier: 3, x: 660, y: 410,
    description: { pt: "13 sinais detectados em notícias", en: "13 signals detected in news" },
    module: "Radar Competitivo" },

  // ─── Tier 2: News & Events (BOTTOM) ───
  { id: "n_an", table: "agro_news",            label: "agro_news",            tier: 2, x: 320, y: 590,
    description: { pt: "124 notícias de 5 fontes RSS", en: "124 news items from 5 RSS feeds" },
    module: "Notícias Agro" },
  { id: "n_ev", table: "events",               label: "events",               tier: 2, x: 460, y: 640,
    description: { pt: "26 eventos do AgroAgenda", en: "26 events from AgroAgenda" },
    module: "Eventos Agro" },
  { id: "n_rj", table: "recuperacao_judicial", label: "recuperacao_judicial", tier: 2, x: 600, y: 640,
    description: { pt: "118 empresas em RJ/falência (Receita Federal)", en: "118 companies in RJ/falência" },
    module: "Recuperação Judicial" },
  { id: "n_rn", table: "regulatory_norms",     label: "regulatory_norms",     tier: 2, x: 740, y: 590,
    description: { pt: "Normas CMN/BCB/CVM/MAPA (RSS legal)", en: "Regulatory norms (legal RSS)" },
    module: "Marco Regulatório" },
];

// ─── CURRENT STATE: FK relationships from migration 015 ───
const CURRENT_EDGES: MapEdge[] = [
  // Retailer hub
  { from: "n_rl", to: "n_r", type: "fk" },
  { from: "n_ce", to: "n_r", type: "fk" },
  { from: "n_cn", to: "n_r", type: "fk" },
  { from: "n_ri", to: "n_r", type: "fk" },
  { from: "n_rind", to: "n_r", type: "fk" },
  { from: "n_rind", to: "n_ind", type: "fk" },
  { from: "n_ip", to: "n_ind", type: "fk" },
  // Competitors
  { from: "n_cs", to: "n_co", type: "fk" },
  // Market data
  { from: "n_cph", to: "n_cp", type: "fk" },
  // Content
  { from: "n_ct", to: "n_pa", type: "fk" },
  // Knowledge index ingests from all tiers
  { from: "n_an", to: "n_ki", type: "fk", label: "indexed" },
  { from: "n_rn", to: "n_ki", type: "fk", label: "indexed" },
  { from: "n_pa", to: "n_ki", type: "fk", label: "indexed" },
  // News archive
  { from: "n_an", to: "n_nk", type: "fk", label: "archive" },
  // Cross-tier insight (the v_retailers_in_rj view)
  { from: "n_rj", to: "n_r", type: "view", label: "v_retailers_in_rj" },
];

// ════════════════════════════════════════════════════════════════════════════
// FUTURE STATE: after Phase 17 (5-core-nodes foundation) + Phase 18-30
// ════════════════════════════════════════════════════════════════════════════
// Every new table is marked `planned: true` so the UI can visually differentiate
// them from existing tables. The layout re-centers Tier 3 on `legal_entities`
// (the universal actor), with farms, assets, commercial activities, and
// AgriSafe services branching off as sub-clusters.

const FUTURE_NODES: MapNode[] = [
  // ─── Tier 1: Market Data (LEFT) — unchanged ───
  { id: "n_cp", table: "commodity_prices", label: "commodity_prices", tier: 1, x: 60, y: 340,
    description: { pt: "Preços diários de 6 commodities (BCB SGS)", en: "Daily prices (BCB SGS)" },
    module: "Pulso do Mercado" },
  { id: "n_cph", table: "commodity_price_history", label: "commodity_price_history", tier: 1, x: 60, y: 390,
    description: { pt: "Histórico temporal de preços", en: "Time-series" },
    module: "Pulso do Mercado" },
  { id: "n_mi", table: "market_indicators", label: "market_indicators", tier: 1, x: 60, y: 440,
    description: { pt: "USD/BRL, Selic, Plano Safra", en: "USD/BRL, Selic" },
    module: "Pulso do Mercado" },

  // ─── Tier 4: Curated Insights (TOP) — unchanged ───
  { id: "n_ki", table: "knowledge_items", label: "knowledge_items", tier: 4, x: CX, y: 40,
    description: { pt: "Índice unificado semântico (pgvector)", en: "Unified semantic index" },
    module: "Base de Conhecimento" },
  { id: "n_pa", table: "published_articles", label: "published_articles", tier: 4, x: CX - 120, y: 110,
    description: { pt: "Artigos publicados AgriSafe", en: "Published articles" },
    module: "Central de Conteúdo" },
  { id: "n_ct", table: "content_topics", label: "content_topics", tier: 4, x: CX + 120, y: 110,
    description: { pt: "Pipeline de temas editoriais", en: "Topic pipeline" },
    module: "Central de Conteúdo" },
  { id: "n_nk", table: "news_knowledge", label: "news_knowledge", tier: 4, x: CX, y: 160,
    description: { pt: "Notícias arquivadas com embeddings", en: "Archived news" },
    module: "Base de Conhecimento" },

  // ─── Tier 3: LEGAL ENTITIES — the new hub ───
  { id: "f_le", table: "legal_entities", label: "legal_entities", tier: 3, x: 820, y: 340, planned: true,
    description: { pt: "Ator universal — CPF ou CNPJ. Raiz de todas as tabelas de entidades", en: "Universal actor" },
    module: "Phase 17" },
  { id: "f_er", table: "entity_roles", label: "entity_roles", tier: 3, x: 720, y: 300, planned: true,
    description: { pt: "Junction: papéis múltiplos por entidade (retailer, producer, client, etc)", en: "Multi-role junction" },
    module: "Phase 17" },
  { id: "f_em", table: "entity_mentions", label: "entity_mentions", tier: 3, x: 680, y: 410, planned: true,
    description: { pt: "Junction para menções em notícias / regulações / eventos", en: "News/reg mentions junction" },
    module: "Phase 17" },
  { id: "f_gr", table: "groups", label: "groups", tier: 3, x: 720, y: 220, planned: true,
    description: { pt: "Coleções nomeadas (clientes, cooperativas, portfolios)", en: "Named collections" },
    module: "Phase 17" },
  { id: "f_gm", table: "group_members", label: "group_members", tier: 3, x: 820, y: 190, planned: true,
    description: { pt: "Junction grupo ↔ entidade", en: "Group-entity junction" },
    module: "Phase 17" },

  // Tier 3: existing channel/industry tables (re-keyed to legal_entities in Phase 17)
  { id: "n_rl", table: "retailer_locations", label: "retailer_locations", tier: 3, x: 920, y: 180,
    description: { pt: "24k estabelecimentos geolocalizados", en: "24k establishments" },
    module: "Diretório de Revendas" },
  { id: "n_ce", table: "company_enrichment", label: "company_enrichment", tier: 3, x: 960, y: 240,
    description: { pt: "Cache Receita Federal", en: "Receita Federal cache" },
    module: "Diretório de Revendas" },
  { id: "n_cn", table: "company_notes", label: "company_notes", tier: 3, x: 960, y: 290,
    description: { pt: "Notas editáveis do usuário", en: "User notes" },
    module: "Diretório de Revendas" },
  { id: "n_ri", table: "retailer_intelligence", label: "retailer_intelligence", tier: 3, x: 960, y: 340,
    description: { pt: "IA: análise por revenda", en: "AI analysis" },
    module: "Diretório de Revendas" },
  { id: "n_ind", table: "industries", label: "industries", tier: 3, x: 960, y: 390,
    description: { pt: "18 indústrias (Bayer, BASF, etc)", en: "18 industries" },
    module: "Diretório de Indústrias" },
  { id: "n_rind", table: "retailer_industries", label: "retailer_industries", tier: 3, x: 920, y: 440,
    description: { pt: "Junction revenda × indústria", en: "Retailer × industry junction" },
    module: "Diretório de Revendas" },
  { id: "n_co", table: "competitors", label: "competitors", tier: 3, x: 900, y: 490,
    description: { pt: "Concorrentes monitorados", en: "Competitors monitored" },
    module: "Radar Competitivo" },

  // Tier 3: NEW — farms + ownership
  { id: "f_fm", table: "farms", label: "farms", tier: 3, x: 820, y: 480, planned: true,
    description: { pt: "Unidade de produção (CAR/INCRA/centroide)", en: "Production unit" },
    module: "Phase 17" },
  { id: "f_fo", table: "farm_ownership", label: "farm_ownership", tier: 3, x: 720, y: 480, planned: true,
    description: { pt: "Junction multi-proprietário com share_pct", en: "Multi-owner junction" },
    module: "Phase 17" },

  // Tier 3: NEW — assets + parties
  { id: "f_as", table: "assets", label: "assets", tier: 3, x: 820, y: 550, planned: true,
    description: { pt: "Instrumentos: CPR, loan, note, seguro, barter", en: "Financial instruments" },
    module: "Phase 17" },
  { id: "f_ap", table: "asset_parties", label: "asset_parties", tier: 3, x: 720, y: 560, planned: true,
    description: { pt: "Junction multi-stakeholder (borrower, lender, guarantor)", en: "Multi-party junction" },
    module: "Phase 17" },

  // Tier 3: NEW — commercial activities
  { id: "f_ca", table: "commercial_activities", label: "commercial_activities", tier: 3, x: 640, y: 510, planned: true,
    description: { pt: "Transações: venda de insumos, barter, grain trade", en: "Commercial transactions" },
    module: "Phase 17" },

  // Tier 3: NEW — AgriSafe services
  { id: "f_sc", table: "agrisafe_service_contracts", label: "agrisafe_service_contracts", tier: 3, x: 560, y: 440, planned: true,
    description: { pt: "Contratos AgriSafe (monitoring, collection, credit_intel)", en: "AgriSafe service contracts" },
    module: "Phase 17" },
  { id: "f_st", table: "agrisafe_service_targets", label: "agrisafe_service_targets", tier: 3, x: 560, y: 490, planned: true,
    description: { pt: "Junction polimórfica: farm | entity | group | asset", en: "Polymorphic targets" },
    module: "Phase 17" },

  // ─── Tier 2: News & Events (BOTTOM) — unchanged ───
  { id: "n_an", table: "agro_news", label: "agro_news", tier: 2, x: 320, y: 600,
    description: { pt: "Notícias de 5 fontes RSS", en: "News from 5 RSS feeds" },
    module: "Notícias Agro" },
  { id: "n_ev", table: "events", label: "events", tier: 2, x: 420, y: 650,
    description: { pt: "Eventos agro", en: "Agro events" },
    module: "Eventos Agro" },
  { id: "n_rj", table: "recuperacao_judicial", label: "recuperacao_judicial", tier: 2, x: 520, y: 650,
    description: { pt: "Empresas em RJ/falência", en: "Companies in RJ" },
    module: "Recuperação Judicial" },
  { id: "n_rn", table: "regulatory_norms", label: "regulatory_norms", tier: 2, x: 620, y: 600,
    description: { pt: "Normas CMN/BCB/CVM/MAPA", en: "Regulatory norms" },
    module: "Marco Regulatório" },
];

const FUTURE_EDGES: MapEdge[] = [
  // ─── Existing edges retained ───
  { from: "n_cph", to: "n_cp", type: "fk" },
  { from: "n_ct", to: "n_pa", type: "fk" },
  { from: "n_an", to: "n_ki", type: "fk", label: "indexed" },
  { from: "n_rn", to: "n_ki", type: "fk", label: "indexed" },
  { from: "n_pa", to: "n_ki", type: "fk", label: "indexed" },
  { from: "n_an", to: "n_nk", type: "fk", label: "archive" },

  // ─── NEW: everything anchored to legal_entities ───
  { from: "f_er",  to: "f_le", type: "planned", label: "roles" },
  { from: "f_gm",  to: "f_gr", type: "planned" },
  { from: "f_gm",  to: "f_le", type: "planned" },

  // Existing channel tables re-key to legal_entities
  { from: "n_rl",  to: "f_le", type: "planned", label: "re-key" },
  { from: "n_ce",  to: "f_le", type: "planned", label: "re-key" },
  { from: "n_cn",  to: "f_le", type: "planned", label: "re-key" },
  { from: "n_ri",  to: "f_le", type: "planned", label: "re-key" },
  { from: "n_rind", to: "f_le", type: "planned", label: "re-key" },
  { from: "n_rind", to: "n_ind", type: "fk" },
  { from: "n_ind", to: "f_le", type: "planned", label: "backfill" },
  { from: "n_co",  to: "f_le", type: "planned", label: "backfill" },

  // Farms
  { from: "f_fo", to: "f_fm", type: "planned" },
  { from: "f_fo", to: "f_le", type: "planned", label: "owners" },

  // Assets
  { from: "f_ap", to: "f_as", type: "planned" },
  { from: "f_ap", to: "f_le", type: "planned", label: "parties" },
  { from: "f_as", to: "f_fm", type: "planned" },

  // Commercial activities
  { from: "f_ca", to: "f_le", type: "planned", label: "retailer" },
  { from: "f_ca", to: "f_fm", type: "planned" },

  // AgriSafe services
  { from: "f_sc", to: "f_gr", type: "planned", label: "client" },
  { from: "f_st", to: "f_sc", type: "planned" },
  { from: "f_st", to: "f_fm", type: "planned", label: "target" },
  { from: "f_st", to: "f_as", type: "planned", label: "target" },

  // Tier 2 → entity_mentions (cross-cutting facts resolve to legal_entities)
  { from: "n_an", to: "f_em", type: "planned", label: "mentions" },
  { from: "n_rj", to: "f_em", type: "planned", label: "mentions" },
  { from: "n_rn", to: "f_em", type: "planned", label: "mentions" },
  { from: "n_ev", to: "f_em", type: "planned", label: "mentions" },
  { from: "f_em", to: "f_le", type: "planned" },
];

// ─── Tier metadata ───
const TIER_META: Record<number, { color: string; bg: string; ring: string; icon: any; pt: string; en: string }> = {
  1: { color: "#5B7A2F", bg: "#EEF2E6", ring: "#A8C076", icon: BarChart3, pt: "Tier 1 — Dados de Mercado",  en: "Tier 1 — Market Data" },
  2: { color: "#1565C0", bg: "#E3F2FD", ring: "#64B5F6", icon: Newspaper, pt: "Tier 2 — Notícias & Eventos", en: "Tier 2 — News & Events" },
  3: { color: "#E65100", bg: "#FFF3E0", ring: "#FFB74D", icon: BookOpen,  pt: "Tier 3 — Dados Estáticos",   en: "Tier 3 — Static Data" },
  4: { color: "#C62828", bg: "#FFEBEE", ring: "#EF9A9A", icon: Lightbulb, pt: "Tier 4 — Insights Curados",   en: "Tier 4 — Curated Insights" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function KnowledgeMindMap({ lang }: { lang: Lang }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"current" | "future">("current");

  // Select the node/edge arrays based on view mode
  const activeNodes = viewMode === "current" ? CURRENT_NODES : FUTURE_NODES;
  const activeEdges = viewMode === "current" ? CURRENT_EDGES : FUTURE_EDGES;

  useEffect(() => {
    async function load() {
      // Only query tables that exist (skip planned future tables)
      const tables = activeNodes.filter((n) => !n.planned).map((n) => n.table);
      const results = await Promise.all(
        tables.map(async (t) => {
          const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
          return [t, count ?? 0] as const;
        })
      );
      setCounts(Object.fromEntries(results));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const totalRecords = useMemo(() =>
    Object.values(counts).reduce((s, c) => s + c, 0)
  , [counts]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, MapNode>();
    activeNodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [activeNodes]);

  // Compute connected node IDs for hover highlighting
  const hoveredConnections = useMemo(() => {
    if (!hovered) return new Set<string>();
    const set = new Set<string>([hovered]);
    activeEdges.forEach((e) => {
      if (e.from === hovered) set.add(e.to);
      if (e.to === hovered) set.add(e.from);
    });
    return set;
  }, [hovered, activeEdges]);

  const visibleNodes = activeNodes.filter((n) => !selectedTier || n.tier === selectedTier);
  const visibleEdges = activeEdges.filter((e) => {
    if (!selectedTier) return true;
    const fn = nodeMap.get(e.from);
    const tn = nodeMap.get(e.to);
    return fn?.tier === selectedTier && tn?.tier === selectedTier;
  });

  const plannedCount = activeNodes.filter((n) => n.planned).length;

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Brain size={16} className="text-brand-primary" />
          <h3 className="text-[14px] font-bold text-neutral-900">
            {lang === "pt" ? "Mapa de Conexões do Conhecimento" : "Knowledge Connection Map"}
          </h3>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary uppercase">
            {activeNodes.length} {lang === "pt" ? "tabelas" : "tables"}
          </span>
          {viewMode === "future" && plannedCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase flex items-center gap-1">
              <Sparkles size={10} />
              {plannedCount} {lang === "pt" ? "planejadas" : "planned"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Current / Future toggle */}
          <div className="flex items-center bg-white border border-neutral-200 rounded-md p-0.5">
            <button
              onClick={() => { setViewMode("current"); setSelectedTier(null); }}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${viewMode === "current" ? "bg-brand-primary text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
            >
              {lang === "pt" ? "Atual" : "Current"}
            </button>
            <button
              onClick={() => { setViewMode("future"); setSelectedTier(null); }}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors flex items-center gap-1 ${viewMode === "future" ? "bg-amber-500 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
            >
              <Sparkles size={10} />
              {lang === "pt" ? "Futuro" : "Future"}
            </button>
          </div>
          <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedTier(null)}
            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${selectedTier === null ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
          >
            {lang === "pt" ? "Todos" : "All"}
          </button>
          {([1, 2, 3, 4] as const).map((t) => {
            const meta = TIER_META[t];
            const isActive = selectedTier === t;
            return (
              <button
                key={t}
                onClick={() => setSelectedTier(isActive ? null : t)}
                className="px-2 py-1 text-[11px] font-semibold rounded transition-colors"
                style={{
                  backgroundColor: isActive ? meta.color : meta.bg,
                  color: isActive ? "white" : meta.color,
                }}
              >
                T{t}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-neutral-400" />
        </div>
      ) : (
        <>
          {/* SVG Mind Map */}
          <div className="relative bg-gradient-to-br from-neutral-50 to-white overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 800 }}>
              {/* Tier sector backgrounds */}
              {([1, 2, 3, 4] as const).map((t) => {
                if (selectedTier && selectedTier !== t) return null;
                const anchor = TIER_ANCHORS[t];
                const meta = TIER_META[t];
                return (
                  <g key={`sector-${t}`} opacity={selectedTier === t ? 0.5 : 0.25}>
                    <circle cx={anchor.x} cy={anchor.y} r={150} fill={meta.bg} />
                  </g>
                );
              })}

              {/* Center node — AgriSafe Knowledge */}
              {!selectedTier && (
                <g>
                  <circle cx={CX} cy={CY} r={62} fill="#5B7A2F" stroke="#3D5520" strokeWidth={3} />
                  <circle cx={CX} cy={CY} r={70} fill="none" stroke="#5B7A2F" strokeWidth={1} strokeDasharray="2 4" opacity={0.4} />
                  <text x={CX} y={CY - 12} textAnchor="middle" className="fill-white font-bold" style={{ fontSize: 12 }}>
                    AgriSafe
                  </text>
                  <text x={CX} y={CY + 4} textAnchor="middle" className="fill-white font-bold" style={{ fontSize: 11 }}>
                    {lang === "pt" ? "Base de" : "Knowledge"}
                  </text>
                  <text x={CX} y={CY + 18} textAnchor="middle" className="fill-white font-bold" style={{ fontSize: 11 }}>
                    {lang === "pt" ? "Conhecimento" : "Engine"}
                  </text>
                  <text x={CX} y={CY + 36} textAnchor="middle" className="fill-white" style={{ fontSize: 9, opacity: 0.85 }}>
                    {totalRecords.toLocaleString(lang === "pt" ? "pt-BR" : "en-US")} {lang === "pt" ? "registros" : "records"}
                  </text>
                </g>
              )}

              {/* Tier labels (for non-filtered view) */}
              {!selectedTier && ([1, 2, 3, 4] as const).map((t) => {
                const anchor = TIER_ANCHORS[t];
                const meta = TIER_META[t];
                let labelX = anchor.x, labelY = anchor.y;
                if (t === 1) { labelX = 90; labelY = 230; }
                if (t === 2) { labelX = CX; labelY = 700; }
                if (t === 3) { labelX = 820; labelY = 230; }
                if (t === 4) { labelX = CX; labelY = 25; }
                return (
                  <text key={`tlabel-${t}`} x={labelX} y={labelY} textAnchor="middle"
                    className="font-bold" style={{ fontSize: 11, fill: meta.color, letterSpacing: "0.05em" }}>
                    {(lang === "pt" ? meta.pt : meta.en).toUpperCase()}
                  </text>
                );
              })}

              {/* Edges (drawn before nodes so they appear behind) */}
              {visibleEdges.map((e, i) => {
                const from = nodeMap.get(e.from);
                const to = nodeMap.get(e.to);
                if (!from || !to) return null;
                const isHighlighted = hovered ? (hoveredConnections.has(e.from) && hoveredConnections.has(e.to)) : false;
                const isViewLink = e.type === "view";
                const isPlanned = e.type === "planned";
                const edgeColor = isPlanned ? "#d97706" : isViewLink ? "#C62828" : "#94a3b8";
                const edgeDash = (isViewLink || isPlanned) ? "4 3" : "none";
                const baseOpacity = isPlanned ? 0.55 : isViewLink ? 0.7 : 0.5;
                return (
                  <g key={`edge-${i}`}>
                    <line
                      x1={from.x} y1={from.y}
                      x2={to.x} y2={to.y}
                      stroke={edgeColor}
                      strokeWidth={isHighlighted ? 2.5 : (isViewLink || isPlanned) ? 1.5 : 1}
                      strokeDasharray={edgeDash}
                      opacity={hovered && !isHighlighted ? 0.15 : baseOpacity}
                    />
                    {e.label && (
                      <text
                        x={(from.x + to.x) / 2}
                        y={(from.y + to.y) / 2 - 4}
                        textAnchor="middle"
                        className="fill-neutral-500"
                        style={{
                          fontSize: 8,
                          opacity: hovered ? (isHighlighted ? 1 : 0.2) : 0.7,
                          fontStyle: (isViewLink || isPlanned) ? "italic" : "normal",
                        }}
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {visibleNodes.map((n) => {
                const meta = TIER_META[n.tier];
                const count = counts[n.table] || 0;
                const isHovered = hovered === n.id;
                const isConnected = hovered && hoveredConnections.has(n.id);
                const isDimmed = hovered && !isConnected;
                const isHub = n.id === "n_r" || n.id === "n_ki" || n.id === "n_cp" || n.id === "f_le";
                const radius = isHub ? 22 : 15;
                const isPlanned = !!n.planned;
                const ringColor = isPlanned ? "#d97706" : (isHovered || isConnected ? meta.color : meta.ring);
                const innerStroke = isPlanned ? "#d97706" : meta.color;

                return (
                  <g
                    key={n.id}
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: "pointer", opacity: isDimmed ? 0.3 : 1, transition: "opacity 0.15s" }}
                  >
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={radius + 4}
                      fill={isPlanned ? "#FEF3C7" : meta.bg}
                      stroke={ringColor}
                      strokeWidth={isHovered ? 3 : 1.5}
                      strokeDasharray={isPlanned ? "3 2" : "none"}
                    />
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={radius}
                      fill="white"
                      stroke={innerStroke}
                      strokeWidth={1.5}
                    />
                    {isPlanned ? (
                      <text
                        x={n.x}
                        y={n.y + 3}
                        textAnchor="middle"
                        className="font-bold"
                        style={{ fontSize: isHub ? 10 : 8, fill: "#d97706" }}
                      >
                        NEW
                      </text>
                    ) : (
                      <>
                        <text
                          x={n.x}
                          y={n.y - 1}
                          textAnchor="middle"
                          className="font-bold"
                          style={{ fontSize: isHub ? 10 : 8, fill: meta.color }}
                        >
                          {count > 999 ? `${(count / 1000).toFixed(0)}k` : count}
                        </text>
                        <text
                          x={n.x}
                          y={n.y + 8}
                          textAnchor="middle"
                          style={{ fontSize: 6, fill: "#525252" }}
                        >
                          {lang === "pt" ? "reg." : "rec."}
                        </text>
                      </>
                    )}
                    {/* Table name label */}
                    <text
                      x={n.x}
                      y={n.y + radius + 11}
                      textAnchor="middle"
                      className="font-mono"
                      style={{
                        fontSize: 7,
                        fontWeight: isHovered ? 700 : 500,
                        fill: isPlanned ? "#92400e" : "#404040",
                      }}
                    >
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover detail tooltip */}
            {hovered && (() => {
              const n = nodeMap.get(hovered);
              if (!n) return null;
              const count = counts[n.table] || 0;
              const meta = TIER_META[n.tier];
              const isPlanned = !!n.planned;
              return (
                <div className="absolute top-3 left-3 bg-white border border-neutral-300 rounded-lg shadow-lg p-3 max-w-xs pointer-events-none">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: meta.bg, color: meta.color }}>
                      T{n.tier}
                    </span>
                    <span className="font-mono font-bold text-[12px] text-neutral-900">{n.table}</span>
                    {isPlanned && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase flex items-center gap-0.5">
                        <Sparkles size={9} />
                        {lang === "pt" ? "Planejado" : "Planned"}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-600 leading-snug">{n.description[lang === "pt" ? "pt" : "en"]}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-100">
                    <span className="text-[10px] text-neutral-400">{lang === "pt" ? "Módulo" : "Module"}</span>
                    <span className="text-[10px] font-semibold text-neutral-700">{n.module}</span>
                  </div>
                  {!isPlanned && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400">{lang === "pt" ? "Registros" : "Records"}</span>
                      <span className="text-[10px] font-bold" style={{ color: meta.color }}>
                        {count.toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Legend */}
          <div className="border-t border-neutral-200 bg-neutral-50 p-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Database size={11} className="text-neutral-400" />
                <span className="text-neutral-500 font-semibold uppercase tracking-wider text-[9px]">
                  {lang === "pt" ? "Legenda" : "Legend"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#94a3b8" strokeWidth="1.5" /></svg>
                <span className="text-neutral-600">{lang === "pt" ? "Foreign Key" : "Foreign Key"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#C62828" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                <span className="text-neutral-600">
                  {viewMode === "future"
                    ? (lang === "pt" ? "Planejado" : "Planned")
                    : (lang === "pt" ? "View Cruzada" : "Cross-View")}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Link2 size={11} className="text-neutral-400" />
                <span className="text-neutral-600">
                  {activeEdges.filter(e => e.type === "fk").length} FK ·{" "}
                  {activeEdges.filter(e => e.type === "view").length} views{" "}
                  {viewMode === "future" && `· ${activeEdges.filter(e => e.type === "planned").length} ${lang === "pt" ? "planejadas" : "planned"}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <Info size={11} className="text-neutral-400" />
                <span className="text-neutral-500 italic">
                  {lang === "pt" ? "Passe o mouse sobre uma tabela para destacar suas conexões" : "Hover a table to highlight its connections"}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
