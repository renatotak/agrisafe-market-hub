# AgriSafe Market Hub — Implementation Plan

> **Last updated:** 2026-04-02
> **Status:** Phases 1-16a complete. 4-vertical architecture with 11 modules. 166 data sources catalogued. Live APIs: Embrapa AgroAPI (AGROFIT + Bioinsumos), AgroAgenda events, Notícias Agrícolas (prices + news). Interactive Dashboard Map with layer control. Supabase tables exist for retailers (33K+ records) but migration 006 was never run for remaining tables.
> **Vision:** Market Hub is the executive intelligence platform where AgriSafe captures, organizes, and transforms public market knowledge into proprietary insights — the foundation for an AI-first digital twin that will power client intelligence, content creation, and strategic decision-making faster than any existing solution.
> **MVP constraint:** Embrapa AgroAPI keys active (100K req/mo free). OpenAI key pending for Phase 17.
> **Key references:** See `docs/SCRAPER_SPECIFICATIONS.md` for scraper inventory. See `docs/REQUIREMENTS.md` for system requirements.

---

## Strategic Context

### What Market Hub Is
Market Hub (`agsf-mkthub`) is **not just a dashboard** — it is the **knowledge engine** of the AgriSafe ecosystem. While the Admin Portal (`agsf_admin_page`) manages internal operations (clients, contracts, credits, compliance), Market Hub serves as the platform where:

1. **Data is ingested** from 15+ public sources (BCB, CEPEA, CONAB, RSS feeds, regulatory APIs, state registries)
2. **Knowledge is organized** using a 4-tier hierarchy (Market Data → News & Events → Static Definitions → Curated Insights)
3. **Insights are generated** by combining, cross-referencing, and contextualizing data across verticals
4. **Content is created** — weekly LinkedIn articles, marketing campaigns, product positioning
5. **The "brain" is built** — every piece of ingested and curated knowledge feeds into a RAG structure that will become AgriSafe's digital twin, providing instant contextual answers for clients and internal teams

### Who Uses It
8 personas from the playbook, but the primary executive users are:
- **CEO** — Weekly 15-min strategic review: macro trends, competitor moves, pipeline health
- **Head de Inteligência** — Daily 20-min data quality + market signal check
- **Marketing Analyst** — Daily 30-min content workflow: news scan → idea generation → draft → publish
- **Consultor Senior de Crédito** — Tue/Thu judicial recovery monitoring + commodity exposure checks
- **Consultor Senior de Estratégia** — Ad-hoc 2-3hr research: market landscapes, competitive benchmarks, value chain analysis

### How It Connects to the Ecosystem
```
External Sources (BCB, RSS, registries, regulatory APIs)
    ↓ INGEST
Market Hub Knowledge Engine
    ↓ ORGANIZE (4-tier hierarchy + dynamic tagging)
    ├── Market Intelligence (analyze trends, detect ruptures)
    ├── Competitive Intelligence (monitor competitors)
    ├── Regulatory Intelligence (track norms, compliance)
    ↓ CREATE
    ├── Content Hub (articles, campaigns, product marketing)
    ↓ STORE → RAG / Digital Twin
    └── pgvector embeddings → semantic search → instant answers
                ↓
    Admin Portal (client intelligence, credit scoring context)
    AgriSafe Products (enriched data for API clients)
```

---

## Completed Phases

| Phase | What | Status |
|-------|------|--------|
| 1-7 | Research, architecture, build, Supabase, data ingestion, mobile UI | Done |
| 8 | Design System Migration (AgriSafe brand from admin portal) | Done |
| 9 | Visualization & Charts (recharts across 4 modules) | Done |
| R | Three-Pillar Reorganization → Four Verticals (ContentHub, RegulatoryFramework, Bloomberg-style MarketPulse) | Done |
| 10 | Data Ingestion vertical (DataSources + sync monitoring) | Done |
| 11 | Dashboard as executive overview (4 cross-vertical sections) | Done |
| 12 | Live Data Feeding (18 Supabase tables, BCB live, 25+ news, 33K channels) | Done |
| 13 | Regulatory Cron Pipeline (sync-regulatory from legal RSS) | Done |
| 14 | Market Pulse Bloomberg Enhancement (rupture detection, deep-dive, related news) | Done |
| 15 | Content Intelligence (historical context DB, market signal cross-ref, engagement analytics) | Done |
| 15b | Source Registry (166 sources from 4 crawler CSVs + app sources, URL health check) | Done |
| 15c | MockBadge watermarks on all non-live data sections | Done |
| 15d | Retailers moved to Market Intelligence, imported 24K oraculo canais | Done |
| 15e | Events scraper (NA) rewrite: correct selectors, detail page scraping, Supabase upsert, sync-all integration | Done |
| 16a | Notícias Agrícolas live widgets: cotações scraper (`/api/prices-na`, 16 commodities, div.cotacao selectors) + news scraper (`/api/news-na`, .noticias li selectors). Dashboard Painel shows both side-by-side with configurable commodity visibility (localStorage). | Done |
| 16b | Embrapa AgroAPI integration: OAuth2 client_credentials token exchange (`src/lib/agroapi.ts`), AGROFIT + Bioinsumos proxy routes, AgInputIntelligence rewritten with live search (4,252 defensivos, 834 bioinsumos). Mock data removed. | Done |
| 16c | AgroAgenda events integration: `/api/events-na` fetches from `api.agroagenda.agr.br/v1/home` (86 events, 10 categories). EventTracker rewritten with cards/list/calendar views, filters by type/UF/city/date range. No Supabase dependency. | Done |
| 16d | Dashboard Map upgrade: live events from AgroAgenda plotted by city/state. Interactive layer control (Camadas) to toggle Eventos/Alertas/Revendas. Legend bar with counts. 55+ Brazilian city geocoder. | Done |
| 16e | Dashboard layout: KPI indicators moved to top, map in middle, NA widgets at bottom side-by-side. | Done |

---

## Known Issues & Pending Tasks

> **CRITICAL: Supabase migration 006 was never run.** Tables `events`, `commodity_prices`, `market_indicators`, `agro_news`, `competitors`, `campaigns`, `content_ideas`, `published_articles`, `content_topics`, `regulatory_norms`, `recuperacao_judicial`, `sync_logs`, `news_knowledge` do **not exist** in Supabase. Only `retailers` and `retailer_locations` are populated. All cron routes that write to Supabase will fail silently. Run `src/db/migrations/006_all_mkthub_tables.sql` in Supabase SQL Editor to fix.

### Pending from this conversation (priority order):
1. **Run Supabase migration 006** — creates all missing tables. Required for cron pipelines and live data in MarketPulse, AgroNews, CompetitorRadar, RegulatoryFramework, RecuperacaoJudicial.
2. **Retailers Directory: show all fields** — user requested all information from `retailers` + `retailer_locations` on screen. Component already has live Supabase queries but needs UX review.
3. **New Embrapa AgroAPI chapter** — user requested a dedicated sidebar module to explore AGROFIT, Bioinsumos, AgroTermos, SmartSolos, ClimAPI APIs directly. Currently only AgInputIntelligence uses AGROFIT/Bioinsumos.
4. **Improve Painel UI** — user requested leaner KPI indicators to give more vertical space to map and widgets. Cards should be more compact.
5. **Remaining AgroAPI integrations** — AgroTermos (terminology for Knowledge Base/RAG), ClimAPI (weather layer for map), SmartSolosExpert (activate Soils tab in AgInputIntelligence).

---

## Cron Pipeline Architecture

`/api/cron/sync-all` dispatches sequentially (daily 08:00 UTC via Vercel):

| # | Job | Route | Type | Source | Target Table(s) | Status |
|---|-----|-------|------|--------|-----------------|--------|
| 1 | sync-market-data | `/api/cron/sync-market-data` | REST API | BCB SGS (8 series) | `commodity_prices`, `commodity_price_history`, `market_indicators` | Active |
| 2 | sync-agro-news | `/api/cron/sync-agro-news` | RSS | 4 feeds (Canal Rural, Sucesso, Agrolink, CNA) | `agro_news` | Active |
| 3 | sync-recuperacao-judicial | `/api/cron/sync-recuperacao-judicial` | RSS | 2 feeds (ConJur, Migalhas) | `recuperacao_judicial` | Active |
| 4 | archive-old-news | `/api/cron/archive-old-news` | Internal + LLM | `agro_news` (>3 months) | `news_knowledge` | Active (requires OPENAI_API_KEY) |
| 5 | sync-regulatory | `/api/cron/sync-regulatory` | RSS | 3 feeds (ConJur, Migalhas, JOTA) | `regulatory_norms` | Active |
| 6 | sync-events-na | `/api/cron/sync-events-na` | HTML scraper | noticiasagricolas.com.br/eventos | `events` | Blocked (table missing) |
| — | sync-prices-na | `/api/cron/sync-prices-na` | HTML scraper | noticiasagricolas.com.br/cotacoes | *(not persisted)* | Replaced by `/api/prices-na` |

**Timeout:** 55s per job. **Auth:** Bearer token via `CRON_SECRET`.
**Logging:** All jobs log to `sync_logs` via `logSync()`. *(Blocked until migration 006 runs)*
**Full scraper specs:** See `docs/SCRAPER_SPECIFICATIONS.md`.

### Live API Routes (non-cron, cached)

| Route | Source | Cache | Data |
|-------|--------|-------|------|
| `/api/prices-na` | Notícias Agrícolas HTML scraper | 10 min ISR | 16 commodity prices (div.cotacao + table.cot-fisicas) |
| `/api/news-na` | Notícias Agrícolas HTML scraper | 10 min ISR | 35 news articles (.noticias li) |
| `/api/events-na` | AgroAgenda REST API (`api.agroagenda.agr.br/v1/home`) | 1 hour ISR | 86 events across 10 categories |
| `/api/agroapi/agrofit` | Embrapa AGROFIT via OAuth2 | None (upstream) | 27 endpoints, 100K req/mo free |
| `/api/agroapi/bioinsumos` | Embrapa Bioinsumos v2 via OAuth2 | None (upstream) | 32 endpoints, 100K req/mo free |

---

## Architecture: Four Verticals

The platform flow: **Ingest → Analyze → Create → Comply**

### Vertical 1: Ingestão de Dados (Data Ingestion)
*The foundation. All other verticals depend on fresh, validated data.*

| Module | Component | Purpose |
|--------|-----------|---------|
| Fontes de Dados | `DataSources.tsx` | Source registry with health monitoring, sync history, data quality indicators. Manual sync triggers. Visibility into the 15+ data pipelines. |

### Vertical 2: Inteligência de Mercado (Market Intelligence)
*Capture, analyze, and organize market information.*

| Module | Component | Purpose |
|--------|-----------|---------|
| Pulso do Mercado | `MarketPulse.tsx` | Bloomberg-style commodity board with biggest movers, rupture detection, market alerts, sparklines, and cross-referenced news |
| Radar Competitivo | `CompetitorRadar.tsx` | What competitors are publishing, press mentions, funding, hiring, product launches. Signal distribution + timeline charts |
| Notícias Agro | `AgroNews.tsx` | RSS aggregation from 4+ sources with category/source analytics, volume trends, highlighted producer matching |
| Eventos & Conferências | `EventTracker.tsx` | Industry events calendar with content opportunity flags |

### Vertical 3: Marketing & Conteúdo (Marketing & Content)
*Transform intelligence into proprietary content.*

| Module | Component | Purpose |
|--------|-----------|---------|
| Central de Conteúdo | `ContentHub.tsx` | 4 tabs: Published Articles (LinkedIn + engagement), Topic Pipeline (10+ weeks, thesis + historical angle), Content Calendar (weekly view), Campaign Tracker |

### Vertical 4: Regulatório (Regulatory)
*Legal intelligence for compliance.*

| Module | Component | Purpose |
|--------|-----------|---------|
| Marco Regulatório | `RegulatoryFramework.tsx` | CMN/CVM/BCB/MAPA norms monitoring with impact alerts and affected area tagging |
| Recuperação Judicial | `RecuperacaoJudicial.tsx` | Judicial recovery filings from legal RSS with dual agro filter |
| Diretório de Revendas | `RetailersDirectory.tsx` | 23,861+ licensed ag input retailers across 27 states |

### Dashboard (Painel)
**Not a shortcut screen.** An executive overview providing cross-vertical synthesis:
- Data Health: source freshness at a glance
- Market Intelligence: biggest mover, news velocity, active signals
- Content Pipeline: published this week, topics in queue, next thesis
- Regulatory: high-impact norms count, latest changes
- Knowledge Base: total indexed items, freshness, coverage gaps

---

## Implementation Phases

### Phase 10 — Data Ingestion Vertical
*Priority: CRITICAL — the foundation vertical*

Build `DataSources.tsx` with 3 tabs:

**Tab 1: Sources (Fontes)**
Each data source rendered as a card:
| Source | Type | Series/Feed | Frequency |
|--------|------|-------------|-----------|
| BCB SGS — Soja | API | Series 11752 | Daily |
| BCB SGS — Milho | API | Series 11753 | Daily |
| BCB SGS — Café | API | Series 11754 | Daily |
| BCB SGS — Açúcar | API | Series 11755 | Daily |
| BCB SGS — Algodão | API | Series 11756 | Daily |
| BCB SGS — Citros | API | Series 11757 | Daily |
| BCB SGS — USD/BRL | API | Series 1 | Daily |
| BCB SGS — Selic | API | Series 432 | Daily |
| Canal Rural | RSS | Feed URL | Daily |
| Sucesso no Campo | RSS | Feed URL | Daily |
| Agrolink | RSS | Feed URL | Daily |
| CNA Notícias | RSS | Feed URL | Daily |
| ConJur (Legal) | RSS | Filtered | Daily |
| Migalhas (Legal) | RSS | Filtered | Daily |
| State Registries | File | Excel import | One-time |
| BCB Normativos | API | Regulatory | Future (Phase 13) |

Card fields: name, type icon, last sync timestamp, records count, health badge (green/yellow/red/grey), error message if any.

**Tab 2: Sync History (Histórico)**
Table: timestamp, source, duration_ms, records_fetched, records_inserted, status (success/error/partial), error details expandable.

**Tab 3: Data Quality (Qualidade)**
- Completeness: % of expected fields filled per table
- Freshness: avg age of most recent record per source
- Volume trends: daily record counts (area chart, last 30 days)
- Anomaly flags: sudden volume drops, missing days

**Database:** `sync_logs` table. Each cron route logs its run.

**Files to create:** `src/components/DataSources.tsx`, `src/db/migrations/003_sync_logs.sql`
**Files to modify:** Sidebar (add section), i18n (add keys), mock.ts (add mockDataSources + mockSyncLogs), all 4 cron routes (add sync_logs insert), page.tsx (add routing)

---

### Phase 11 — Dashboard as Executive Overview
*Priority: HIGH — the entry point for all users*

Rework `DashboardOverview` from module cards to a rich cross-vertical overview:

**Section 1: Data Health Bar**
Horizontal strip: each source as a small dot/pill with color (green/yellow/red). One-line view of platform data freshness. Click expands to DataSources module.

**Section 2: Market Pulse Summary**
- Today's biggest commodity mover (name, price, % change, direction arrow)
- USD/BRL current + trend
- Market alerts count (if any active ruptures/spikes)
- News velocity: articles ingested last 7 days

**Section 3: Content Pipeline**
- Articles published this month
- Next topic in pipeline (thesis preview + suggested week)
- Active campaigns count

**Section 4: Regulatory Watch**
- High-impact norms in last 30 days (count + latest title)
- Active judicial recovery cases

**Section 5: Knowledge Base Health** (placeholder for Phase 16)
- Total indexed knowledge items
- Coverage by tier (Market Data / News / Static / Curated)

---

### Phase 12 — Live Data Feeding
*Connect all modules to actual Supabase data*

- Verify BCB Market Data pipeline (6 commodities + 2 indicators)
- Verify RSS News pipeline (4 sources)
- Verify Judicial Recovery pipeline (dual-filter)
- Run migrations:
  - `003_sync_logs.sql` — sync history
  - `004_content_tables.sql` — `published_articles`, `content_topics`
  - `005_regulatory_norms.sql` — `regulatory_norms`
- Seed events table with real 2026 agro events
- Verify retailer data population
- Remove mock data fallbacks where live data exists

---

### Phase 13 — Regulatory Cron Pipeline
*Automated regulatory monitoring*

New cron route: `src/app/api/cron/sync-regulatory/route.ts`
- **BCB Normativos API** (`https://www.bcb.gov.br/api/normativos`): fetch recent resolutions, circulars
- **CMN Resolutions**: published via BCB API (filter by body=CMN)
- **CVM**: scrape recent resolutions from CVM portal
- **MAPA**: scrape instruções normativas relevant to agro
- Auto-classify impact level based on keyword matching (crédito rural, CPR, seguro, etc.)
- Add to `sync-all` orchestrator
- Log to `sync_logs`

---

### Phase 14 — Market Pulse Enrichment
*Make it truly Bloomberg-grade*

- **Commodity Deep-Dive**: click a commodity → full-page view with 30-day chart, 7d high/low, related news (cross-query `agro_news` by tag), price alerts history
- **Rupture Detection Algorithm**: if `change_24h > 2x avg(abs(change_24h))` over last 7 days → flag as rupture with alert
- **Related News Cross-Reference**: MarketPulse queries `agro_news` matching commodity tags, shows "Related News" panel
- **Additional Indicators**: add Boi Gordo (CEPEA), CDI, IPCA from BCB SGS
- **Commodity board format**: dense table layout (like noticiasagricolas.com.br) with row-level color coding

---

### Phase 15 — Content Intelligence
*AI-assisted topic generation (manual via IDE initially)*

- **Topic Suggestion Engine**: cross-reference this week's market signals + news + regulatory changes → generate topic candidates with thesis, supporting data, and historical angle
- **Article Performance Analytics**: track engagement trends across published articles, identify which thesis angles get most traction
- **Historical Context Database**: curate a structured collection of historical events/crises that can be referenced in articles (e.g., "2015-2016 credit crisis", "2018 US-China soy embargo", "2023-2024 RJ wave")
- **Multi-Channel Content Adaptation**: suggest how a LinkedIn article thesis can be adapted for Instagram carousel, blog post, newsletter

---

### Phase 16 — Knowledge Architecture & RAG Foundation
*Build the "brain" — the foundation for the digital twin*

This is the transformational phase. Implement the Knowledge Architecture from `docs/KNOWLEDGE_ARCHITECTURE.md`:

**16.1 Knowledge Indexing**
- Implement the 4-tier hierarchy as Supabase tables:
  - `knowledge_market_data` (Tier 1: recurring numerical data)
  - `knowledge_news_events` (Tier 2: non-recurring qualitative)
  - `knowledge_static` (Tier 3: definitions, glossaries, regulations)
  - `knowledge_curated` (Tier 4: AgriSafe proprietary insights)
- Dynamic metadata tagging: Data Origin, Timing, Purpose, LGPD Clear

**16.2 Vector Embeddings (pgvector)**
- Enable pgvector extension in Supabase
- Generate embeddings for all news articles, regulatory norms, curated insights
- Use `text-embedding-3-small` (via IDE or batch script)
- Store in `knowledge_embeddings` table with source reference

**16.3 Semantic Search**
- API route: `/api/knowledge/search` — accepts natural language query, returns top-K relevant knowledge items
- Cross-tier search: query can return market data + news + regulations simultaneously
- Used by Content Hub for topic research, by Dashboard for contextual summaries

**16.4 Knowledge Dashboard Module**
- New module in sidebar: "Base de Conhecimento" / "Knowledge Base"
- Shows: total items by tier, freshness, coverage gaps, tag distribution
- Search interface: type a question → get relevant knowledge items with source citations

---

### Phase 17 — AI Integration & Virtual Coworker
*AgriSafe becomes AI-first*

**17.1 Content Generation**
- OpenAI integration for:
  - First-draft article generation from topic pipeline (thesis + supporting data + historical angle → draft)
  - Social media post generation (LinkedIn → Instagram carousel adaptation)
  - Newsletter section generation
- Human-in-the-loop: AI generates, human reviews and publishes

**17.2 Automated Insights**
- Daily executive briefing generation (for CEO persona)
- Anomaly narratives: when rupture detected, generate explanation paragraph
- Competitor signal summarization
- Regulatory impact assessment: when new norm ingested, auto-generate impact analysis

**17.3 Conversational Interface (Future)**
- Chat-like interface within Market Hub
- Query the knowledge base in natural language
- "What happened to soy prices last time the Selic was above 14%?"
- "Summarize competitor moves in the last quarter"
- "Draft a LinkedIn article about the new CMN resolution on rural credit"

---

### Phase 18 — Cross-Platform Intelligence
*Connect Market Hub insights to Admin Portal*

- **Judicial Recovery → Client Risk**: cross-reference `recuperacao_judicial` entities with Admin Portal's `empresas` via CNPJ. Surface alerts in Admin Dashboard: "Client X filed for judicial recovery"
- **Commodity Exposure**: Admin Portal shows which clients have exposure to commodities in rupture state
- **Market Context for Sales**: when Commercial team views a prospect in Admin, show relevant Market Hub intelligence (competitor signals, commodity trends, regulatory changes in their sector)
- Shared API layer between the two platforms

---

### Phase 19 — Advanced Data Sources
*Expand the ingestion pipeline*

| Source | Type | Data | Priority |
|--------|------|------|----------|
| CEPEA daily indicators | API/scraping | Soy, corn, cotton, coffee spot prices | High |
| CONAB crop forecasts | API/scraping | Production, area, yield estimates | High |
| INMET weather | API | Temperature, precipitation for key regions | Medium |
| USDA reports | RSS/scraping | World Agricultural Supply and Demand Estimates | Medium |
| LinkedIn API | API | Competitor post tracking, article engagement | Medium |
| B3 agro futures | API | BM&F futures contracts for soy, corn, coffee | Low |
| MDIC ComexStat | API | Export volumes and values by product | Low |

---

### Phase 20 — Polish & Scale
- ISR (Incremental Static Regeneration) for performance
- Sentry error monitoring
- Analytics (usage tracking per module per persona)
- WCAG 2.1 accessibility compliance
- Dark mode toggle
- Keyboard shortcuts (Ctrl+K command palette)
- CSV/PDF export per module

---

## Suggested New Tools & Features

Based on the AI-first vision and competitive landscape:

### 1. Market Radar (Real-Time Alert System)
A persistent notification layer that monitors all data sources and surfaces what matters NOW. Not a module — a platform capability. Like Bloomberg Terminal alerts.
- Price threshold alerts (commodity crosses a level)
- Volume anomaly alerts (news volume spike = something happened)
- Competitor activity alerts (new signal detected)
- Regulatory deadline alerts (compliance date approaching)
- Configurable per user/persona

### 2. Insight Composer
A workspace where users combine data from multiple modules to build custom insights. Not a pre-built report — a canvas.
- Drag market data + news + regulatory changes into a workspace
- AI suggests connections and narratives
- Export as formatted brief, article draft, or presentation
- Foundation for the digital twin's "answer anything" capability

### 3. Knowledge Graph Visualizer
Visual representation of how knowledge items connect:
- Commodity → affected by → regulatory change
- Competitor → launched → product → in response to → market trend
- Historical event → similar to → current signal
- Interactive: click nodes to drill into data

### 4. Content Studio (Evolution of Content Hub)
When AI is integrated, Content Hub evolves into a full creative studio:
- AI drafts articles from topic pipeline entries
- Side-by-side editor: market data on left, writing on right
- Inline citation from knowledge base
- One-click publish to LinkedIn, Instagram, blog
- A/B test different angles

### 5. Stitch Integration for UX Feedback
Use Claude AI Stitch to get continuous UX feedback as modules are built:
- Share live deployment URL with Stitch
- Get per-module UX analysis
- Identify usability issues before user testing

### 6. Scheduled Agents (Claude Code Triggers)
Automate recurring intelligence tasks:
- Daily: generate executive briefing from overnight data
- Weekly: competitive landscape summary
- Monthly: regulatory compliance checklist
- On-demand: deep-dive research on a specific topic

---

## Database Schema Summary

### Existing Tables
| Table | Purpose | Updated By |
|-------|---------|------------|
| `commodity_prices` | Latest commodity prices | sync-market-data cron |
| `commodity_price_history` | Daily price history | sync-market-data cron |
| `market_indicators` | USD/BRL, Selic, etc. | sync-market-data cron |
| `agro_news` | News articles | sync-agro-news cron |
| `highlighted_producers` | Keywords for news matching | Manual |
| `competitors`, `competitor_signals` | Competitor data | Manual + scraping |
| `events` | Agro events | sync-events-na cron |
| `recuperacao_judicial` | Judicial recovery | sync-recuperacao-judicial cron |
| `retailers`, `retailer_locations` | Retailer directory | Excel import |
| `campaigns`, `content_ideas` | Legacy campaign/content | Manual |
| `news_knowledge` | Archived news summaries + embeddings | archive-old-news cron |

### New Tables (by Phase)
| Table | Phase | Purpose |
|-------|-------|---------|
| `sync_logs` | 10 | Cron execution history |
| `published_articles` | 12 | LinkedIn/Instagram articles + engagement |
| `content_topics` | 12 | Topic pipeline with thesis + historical angle |
| `regulatory_norms` | 12-13 | CMN/CVM/BCB/MAPA norms |
| `knowledge_market_data` | 16 | Tier 1 knowledge items |
| `knowledge_news_events` | 16 | Tier 2 knowledge items |
| `knowledge_static` | 16 | Tier 3 definitions and regulations |
| `knowledge_curated` | 16 | Tier 4 proprietary insights |
| `knowledge_embeddings` | 16 | pgvector embeddings for semantic search |

---

## Sidebar Structure (Target)

```
Painel (Executive Overview — cross-vertical synthesis)

INGESTÃO DE DADOS
  Fontes de Dados

INTELIGÊNCIA DE MERCADO
  Pulso do Mercado
  Radar Competitivo
  Notícias Agro
  Eventos

MARKETING & CONTEÚDO
  Central de Conteúdo

REGULATÓRIO
  Marco Regulatório
  Recuperação Judicial
  Diretório de Revendas

BASE DE CONHECIMENTO (Phase 16)
  Busca Semântica
```

---

## Mock Data Strategy

All modules use `src/data/mock.ts` as fallback when Supabase tables are empty:
- 6 commodities + 15-day price history + 5 indicators + 4 market alerts
- 10 news articles, 5 competitors with 9 signals, 7 events
- 6 published articles (LinkedIn + Instagram), 12 content topics (10+ weeks)
- 8 regulatory norms from CMN/CVM/BCB/MAPA
- 5 judicial recovery cases, 8 retailers
- Phase 10 adds: 15+ data source cards, 30+ sync history entries

---

## Critical Path

```
Phase 10 (Data Ingestion) ─────┐
Phase 11 (Dashboard Overview) ──┤
Phase 12 (Live Data) ──────────┤──→ Phase 14 (Market Enrichment)
Phase 13 (Regulatory Cron) ────┘         │
                                         ↓
                               Phase 15 (Content Intelligence)
                                         │
                                         ↓
                               Phase 16 (Knowledge Architecture / RAG)
                                         │
                                         ↓
                               Phase 17 (AI Integration / Digital Twin)
                                         │
                                         ↓
                               Phase 18 (Cross-Platform Intelligence)
                               Phase 19 (Advanced Sources)
                               Phase 20 (Polish & Scale)
```
