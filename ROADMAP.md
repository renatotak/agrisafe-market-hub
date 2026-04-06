# AgriSafe Market Hub — Roadmap

> **Last updated:** 2026-04-06
> **Status:** Phase 17 in progress. 4-vertical architecture, 13+ modules, 22 Supabase tables, 17 SQL migrations.
> **For the latest user-defined task list, see** `docs/TODO_2026-04-06.md`.

---

## Current State (April 2026)

| Component | Status |
|-----------|--------|
| Architecture | 4 verticals, 13 modules |
| Data sources | 166 catalogued (~120 active) |
| Live cron pipeline | 7 jobs via `sync-all` |
| Supabase tables | 22 tables, 17 SQL migrations, FKs + views in place |
| Retailers | 9,328 channels / 24,275 locations (geocoded) |
| Recuperação Judicial | 118 records (Receita Federal seed + RSS feeds) |
| Risk signals | 38 channels in distress, R$ 582.6M exposed (cross-ref view) |
| Live data | BCB SGS, NA prices/news (regional + futures), AgroAgenda, ClimAPI, Embrapa AgroAPI, Yahoo Finance intl futures |
| Auth | Supabase Auth + SSR middleware |
| Deployment | Vercel (production) |

---

## Architectural North Star (locked 2026-04-06)

The platform exists to support analyses around **5 core nodes**. Every feature, every table, every scraper must contribute data that resolves to one or more of them. **Canonical reference: `docs/ENTITY_MODEL.md`.**

| # | Node | Identity | Multi-stakeholder model |
|---|---|---|---|
| 1 | **Legal Entity** | `entity_uid` + `tax_id` (CPF or CNPJ) | `entity_roles` junction (one CNPJ can be retailer + producer + client at once) |
| 2 | **Farm** | `farm_uid` (CAR/INCRA/centroid) | `farm_ownership` junction (multi-shareholder, mixing CPFs and CNPJs) |
| 3 | **Asset** | `asset_uid` (CPR/loan/note/insurance) | `asset_parties` junction (borrower / lender / guarantor / beneficiary) |
| 4 | **Commercial Activity** | `activity_uid` (sale/barter/trade) | retailer + buyer + farm + product (single-FK each) |
| 5 | **AgriSafe Service** | `service_uid` | `client_group_uid` (always a Group, even of size 1) + polymorphic `service_targets` (farm | entity | group | asset) |

**Cross-cutting:** `groups`, `group_members`, `entity_mentions` (junction for news / regulations / events).

**Implementation rule:** algorithms first, LLMs last. LLMs are reserved for prose generation, conversational interfaces, and last-resort fuzzy matching. See CLAUDE.md and AGENTS.md for full details.

---

## Phase History (Completed)

| Phase | What | Done |
|-------|------|------|
| 1–7 | Research, architecture, build v1, Supabase, data ingestion, mobile UI | ✅ |
| 8 | Design System Migration (AgriSafe brand tokens) | ✅ |
| 9 | Charts & Visualization (Recharts across 4 modules) | ✅ |
| R | Four-Vertical Reorganization | ✅ |
| 10–12 | Data Ingestion vertical, Executive Dashboard, Live Data Feeding | ✅ |
| 13 | Regulatory cron pipeline | ✅ |
| 14 | MarketPulse Bloomberg Enhancement | ✅ |
| 15 | Content Intelligence + Source Registry (166 sources) | ✅ |
| 15a–15e | MockBadge, Retailers migration, Events scraper rewrite | ✅ |
| 16a–16h | NA widgets, Embrapa AgroAPI, AgroAgenda, Dashboard Map, BeefPoint, ClimAPI, SmartSolos, Maps cleanup | ✅ |
| 16i | Retailers Directory: full CNPJ formatting, Receita Federal enrichment, QSA modal, editable fields, web research | ✅ |
| 16j | Settings & Help module, Sidebar Settings entry | ✅ |
| 16k | Regulatório vertical full rebuild (Marco Regulatório + Recuperação Judicial with KPIs, charts, search, timeline) | ✅ |
| 16l | RJ web scan via DuckDuckGo (`/api/rj-scan`) | ✅ |
| 16m | Migration 015: 9 FK constraints, indexes, `v_retailers_in_rj`, `v_retailer_profile` views | ✅ |
| 16n | Migration 016: security advisor fixes (SECURITY INVOKER views, RLS on company_*) | ✅ |
| 16o | Migration 017: tightened `v_retailers_in_rj` to precise CNPJ matching | ✅ |
| 16p | Seed 118 RJ companies from Receita Federal CNPJ tables (crawlers DB) | ✅ |
| 16q | RiskSignals component + Dashboard KPI (R$ 582.6M cross-vertical insight) | ✅ |
| 16r | Knowledge Mind Map: interactive 22-table 4-tier visualization in Base de Conhecimento | ✅ |
| 16s | Pulso do Mercado complete redesign (Highlights box + Culture/Region tabs + Logistics range chart) | ✅ |
| 16t | NA scraper fixes (4 broken URLs, BR number format parser, Scot Consultoria boi-gordo quirks, kg→@ conversion) | ✅ |
| 16u | Yahoo Finance intl futures proxy `/api/intl-futures` (replaced broken TradingView embed) | ✅ |
| 16v | CommodityMap controlled mode (sync with parent culture) | ✅ |

---

## Phase 17 — Five Core Nodes Foundation 🎯 NEXT

This is the **foundational schema phase** that everything else hangs off. Before building Phase 18+ features, the database must be reorganized around the 5 core nodes locked in `docs/ENTITY_MODEL.md`.

- [x] **`docs/ENTITY_MODEL.md`** — canonical reference written
- [ ] **Migration 018**: Create the 5 core node tables
  - `legal_entities(entity_uid PK, tax_id UNIQUE, tax_id_type, cnpj_basico GENERATED, legal_name, display_name)`
  - `farms(farm_uid PK, car_code, incra_code, centroid_lat, centroid_lng, area_ha, uf, municipio)`
  - `assets(asset_uid PK, asset_type, amount, currency, start_date, maturity_date, farm_uid FK, commodity_id, status, confidentiality)`
  - `commercial_activities(activity_uid PK, activity_type, retailer_entity_uid FK, buyer_entity_uid FK, farm_uid FK, product_id, quantity, unit, value, currency, date, confidentiality)`
  - `agrisafe_service_contracts(service_uid PK, service_type, client_group_uid FK, start_date, end_date, status, confidentiality)`
- [ ] **Migration 019**: Junction & support tables
  - `entity_roles(entity_uid, role_type)` — multi-role per entity
  - `groups(group_uid PK, group_type, name, billing_email, primary_payer_entity_uid)` + `group_members(group_uid, entity_uid)`
  - `farm_ownership(farm_uid, entity_uid, ownership_type, share_pct)`
  - `asset_parties(asset_uid, entity_uid, party_role)`
  - `agrisafe_service_targets(service_uid, target_type, target_id)` — polymorphic
  - `entity_mentions(entity_uid, source_table, source_id, mention_type, sentiment)`
- [ ] **Migration 020**: Backfill `legal_entities` from existing tables
  - `retailers.cnpj_raiz` → `legal_entities` (insert if missing) + `entity_roles` row with `role_type='retailer'`
  - `industries` → `legal_entities` + `role_type='industry'` (resolve slug to CNPJ where possible)
  - `competitors` → `legal_entities` + `role_type='competitor'`
  - `recuperacao_judicial.entity_cnpj` → `legal_entities` (insert if missing)
- [ ] **Migration 021**: Re-key existing satellite tables to point at `legal_entities`
  - Add `entity_uid` FK column to `company_enrichment`, `company_notes`, `company_research`, `retailer_intelligence`, `retailer_locations`, `retailer_industries`, `recuperacao_judicial`
  - Backfill via JOIN on the existing `cnpj_basico` / `cnpj_raiz` text columns
  - Drop the legacy text-key columns once all readers have been updated (Phase 18+)
- [ ] **Migration 022**: Add `confidentiality` enum column to every table that may store proprietary data
  - Default `public`; AgriSafe-internal tables default `agrisafe_confidential`
- [ ] **Migration 023**: Update `v_retailers_in_rj`, `v_retailer_profile`, and other views to use the new `legal_entities` and `entity_roles` tables instead of direct text joins
- [ ] Update `RetailersDirectory.tsx`, `RegulatoryFramework.tsx`, `RecuperacaoJudicial.tsx`, `CompetitorRadar.tsx`, `RiskSignals.tsx` to read from the canonical entity tables
- [ ] Update `KnowledgeMindMap.tsx` "Future" view to reflect the implemented schema (already includes the future-state nodes; just verify after migration)

---

## Phase 18 — Painel (Dashboard) Improvements

From `docs/TODO_2026-04-06.md`:

- [ ] First-row KPI buttons open a **modal** highlighting what's important in each chapter, with a CTA button linking to the chapter
- [ ] **Mapa de Inteligência Integrada** — natively parse location for every news, event, and weather record so they can all be plotted on the map
- [ ] Map filter by **date range** (next 30d / next 90d) for events
- [ ] Notícias in Painel pipe into the **Knowledge Base** (RAG ingestion)
- [ ] Add new news sources via **LLM agents** (Claude tasks, Grok tasks) running on cloud, controlled by user from desktop
- [ ] **Webapp version** of the whole app with a **chat feature** so the user can talk to an agent that pulls from the knowledge base (RAG + MCP server)

---

## Phase 19 — Pulso do Mercado: Macro Context Layer

The current Pulso do Mercado covers daily prices and futures. The user wants higher-latency macro data layered in, from official agencies.

- [ ] **OECD-FAO Agricultural Outlook** scraper → world supply, demand, price projections
- [ ] **FAO FAOSTAT** scraper → world production by commodity and country
- [ ] **USDA WASDE** monthly reports → US/world S&D estimates
- [ ] **MDIC ComexStat** scraper → Brazilian export volumes/values by HS code
- [ ] **CONAB safra** monthly reports → Brazilian production by state and crop
- [ ] **World Bank Pink Sheet** → monthly commodity price index
- [ ] Update `source-registry.json` and `Ingestão de Dados` to reflect these new sources
- [ ] Region map: filter follows the **main culture filter** (already done: CommodityMap controlled by parent)
- [ ] New "Macro Context" sub-tab in Pulso do Mercado showing exports volume, BR production, world production, projection vs actual

---

## Phase 20 — Inteligência de Insumos Build-Out

The current `AgInputIntelligence.tsx` is a wrapper around AGROFIT/Bioinsumos search. The user wants this to become an **oracle** for ag-input substitution.

- [ ] **Federal source**: full AGROFIT registered products list (defensives + fertilizers + biologicals)
- [ ] **State sources**: per-state agriculture secretariat lists (each `secretaria de agricultura` publishes its own approved list)
- [ ] Database schema: `active_ingredients` ↔ `commercial_brands` ↔ `manufacturers (companies)` — proper FK to the `companies` table
- [ ] First-batch scraper for the federal AGROFIT list, then state lists in priority order (MT, MS, GO, PR, RS, SP, MG, BA)
- [ ] **Oracle UX**: user enters a culture + region → app suggests cheaper alternatives to patented products commonly used by producers in that region. Shows molecule equivalence, brand alternatives, price range.
- [ ] Source registry entries for all the public ag-input lists

---

## Phase 21 — Radar Competitivo: CRUD + Web Enrichment

- [ ] **Modal with CRUD** — add/edit/delete competitors directly from the UI
- [ ] Each company supports **manual notes** + **automatic web search** enrichment
- [ ] Anchor competitors to the canonical `companies` table via `cnpj_basico`
- [ ] Optional Harvey Ball comparison matrix (vertical, depth, precision, pulse, regulatory, UX)

---

## Phase 22 — Notícias Agro: CRUD + Reading-Room Integration

- [ ] **Modal/list with CRUD** for news providers (currently 5 RSS feeds, hardcoded)
- [ ] Connect the existing **reading-room Chrome extension** (`C:\Users\renat\.gemini\antigravity\projects\1 personal\reading-room`) to push articles into Supabase instead of localhost
- [ ] More source detail: provider name, RSS URL, last fetch, error count
- [ ] Article entity-mention parser: when ingesting an article, scan for known CNPJs / cidades / culturas and write to `entity_mentions`

---

## Phase 23 — Eventos Agro: Missing Sources + Source Detail + AI Enrichment

- [ ] Scrape and ingest events from:
  - https://baldebranco.com.br/confira-os-grandes-eventos-do-agro-em-2026/
  - https://agroadvance.com.br/blog-feiras-e-eventos-agro-2026/
- [ ] Show **source provenance** on every event card
- [ ] Button to let an agent **enrich event details** from the event's website (algorithmic first, LLM only for the prose summary)
- [ ] Schema additions: `events.organizer_cnpj` (FK to companies), `events.location_lat/lng`
- [ ] **App Campo integration** — events feed becomes the calendar source for the AgriSafe field-sales mobile app

---

## Phase 24 — Diretório de Canais → CRM Tool

The current Diretório de Canais shows retailers from a static Excel import. The user wants it to become AgriSafe's **CRM**.

- [ ] **Split out Industries** into a new chapter `Diretório de Indústrias` with the same UX as channels
- [ ] **New main indicators row** (4 cards):
  1. Total Channels + horizontal bar chart by category
  2. Cities with channels + concentration in top cities (bar chart)
  3. Channels in Recuperação Judicial → modal with all distress data
  4. Channels appearing in any news portal → modal with company / portal / publication date
- [ ] **Highlights**:
  - Companies in Recuperação Judicial (already done — `RiskSignals.tsx`)
  - Companies **expanding operations** — query Receita Federal (`crawlers.cnpj_estabelecimentos`) for recently opened CNPJs in agribusiness CNAEs by region
  - Companies mentioned in main news portals (NA, Agribiz, neofeed, Bloomberg Línea/agro, Globo Rural, etc.)
- [ ] **Per-company enrichment**:
  - Inpev cross-reference (defensive container recycling membership)
  - Google Maps Street View / Places photo of the POS
  - AgriSafe data imported from OneNote meeting files
  - Key persons, interests, meeting history, lead status
- [ ] **3-tier confidentiality model** enforced via the new `confidentiality` enum
- [ ] **Knowledge Base integration** — chat / RAG queries respect tier permissions
- [ ] **CRM workflow**: schedule meetings, find leads, push leads to **Central de Conteúdo** for newsletter / WhatsApp / email outreach

---

## Phase 25 — Marco Regulatório: Manual Inserts + Source CRUD

- [ ] Button to **upload a new law / regulation** (PDF or text) and add it to `regulatory_norms`
- [ ] Modal listing all main legal sources with CRUD
- [ ] When a norm is inserted, run an algorithmic CNAE classifier to populate `affected_companies`

---

## Phase 26 — Recuperação Judicial: Easier Backfilling + Debt Scraping

- [ ] **Easy CNPJ insertion** — paste a CNPJ, fetch Receita Federal, classify CNAE, insert into `recuperacao_judicial` if not present
- [ ] **Debt amount scraper** — for each RJ case, scrape the judicial process page (e-SAJ / TJ portals) OR run a DuckDuckGo / Google search and let an algorithmic regex pull "R$ X milhões" from snippets. LLM only as last-resort summarizer.
- [ ] Backfill the missing companies the user has flagged

---

## Phase 27 — Ingestão de Dados: Source CRUD + Usage Visibility

- [ ] CRUD for sources in the Source Registry UI
- [ ] **Usage map**: which Supabase tables each source feeds (visual graph)
- [ ] **Health tracking**: last successful fetch, error count, latency, sample row count
- [ ] Per-source enable/disable toggle (writes to `source_registry.active`)

---

## Phase 28 — Knowledge Architecture & RAG Foundation (carryover from old Phase 16)

- [x] 4-tier knowledge architecture (already enforced via `knowledge_items.tier`)
- [x] pgvector enabled
- [x] `news_knowledge` table with embeddings
- [x] Knowledge Base module with semantic search
- [x] Knowledge Mind Map visualization
- [ ] **MCP server** that exposes the knowledge base to Claude / GPT / other LLM agents
- [ ] **RAG endpoint** with confidentiality-tier-aware filtering
- [ ] Daily executive briefing generated from the knowledge base
- [ ] Anomaly narratives when MarketPulse detects rupture

---

## Phase 29 — AI Integration & Virtual Coworker (carryover from old Phase 17)

- [ ] OpenAI / Gemini / Claude content generation for first-draft articles from the topic pipeline
- [ ] Conversational chat interface (chat-style knowledge query) with RAG + tier permissions
- [ ] **Webapp version** of the entire app — same UI but web-only, with the chat panel always available
- [ ] Cron-driven LLM agents that scan news/events for entity mentions and enrich the knowledge base

---

## Phase 30 — Cross-Platform Intelligence & Polish

- [ ] Cross-reference RJ entities with Admin Portal via CNPJ
- [ ] Commodity exposure alerts in Admin Dashboard
- [ ] Market context panel when commercial team views a prospect
- [ ] Sentry error monitoring
- [ ] WCAG 2.1 accessibility compliance
- [ ] Dark mode toggle
- [ ] Ctrl+K command palette
- [ ] CSV/PDF export per module
- [ ] Institutional PDF export (executive briefing format)

---

## Cron Pipeline (Current)

| # | Job | Route | Target | Status |
|---|-----|-------|--------|--------|
| 1 | sync-market-data | `/api/cron/sync-market-data` | `commodity_prices`, `market_indicators` | ✅ Active |
| 2 | sync-agro-news | `/api/cron/sync-agro-news` | `agro_news` | ✅ Active |
| 3 | sync-recuperacao-judicial | `/api/cron/sync-recuperacao-judicial` | `recuperacao_judicial` | ✅ Active |
| 4 | archive-old-news | `/api/cron/archive-old-news` | `news_knowledge` | ✅ Active |
| 5 | sync-regulatory | `/api/cron/sync-regulatory` | `regulatory_norms` | ✅ Active |
| 6 | sync-events-na | `/api/cron/sync-events-na` | `events` | ✅ Active |
| 7 | sync-competitors | `/api/cron/sync-competitors` | `competitor_signals` | ✅ Active |
| 8 | sync-retailer-intelligence | `/api/cron/sync-retailer-intelligence` | `retailer_intelligence` | ✅ Active |
| 9 | sync-industry-profiles | `/api/cron/sync-industry-profiles` | `industries`, `industry_products` | Sundays only |
| — | sync-prices-na | `/api/cron/sync-prices-na` | (live route, no Supabase write) | Active |

**Non-cron live routes:** `/api/prices-na`, `/api/news-na`, `/api/events-na`, `/api/intl-futures`, `/api/agroapi/*`, `/api/rj-scan`

---

## Sidebar Structure (Target after Phase 24)

```
Painel (Executive Overview)

INGESTÃO DE DADOS
  Fontes de Dados (CRUD)

INTELIGÊNCIA DE MERCADO
  Pulso do Mercado
  Inteligência de Insumos (oracle)
  Radar Competitivo (CRUD)
  Notícias Agro (CRUD)
  Eventos Agro

DIRETÓRIO  ← split from "Inteligência de Mercado"
  Diretório de Canais (CRM)
  Diretório de Indústrias (NEW)

MARKETING & CONTEÚDO
  Central de Conteúdo

REGULATÓRIO
  Marco Regulatório
  Recuperação Judicial

BASE DE CONHECIMENTO
  Busca Semântica
  Mapa de Conexões
  Chat (RAG, Phase 29)

CONFIGURAÇÕES
  Help / About
```

---

## Database Tables (Live)

| Table | Rows | Source | Anchored to |
|-------|------|--------|-------------|
| `commodity_prices` | 6 | BCB SGS | — (commodity dimension) |
| `commodity_price_history` | growing | BCB SGS | `commodity_prices.id` (FK) |
| `market_indicators` | 6 | BCB SGS | — |
| `agro_news` | 124 | RSS feeds | needs `entity_mentions` |
| `events` | 26 | NA / AgroAgenda | needs `organizer_cnpj` |
| `regulatory_norms` | 1 | RSS legal feeds | needs `affected_companies` |
| `recuperacao_judicial` | 118 | RSS + Receita Federal seed | `entity_cnpj` (semi-anchored) |
| `retailers` | 9,328 | Excel + Receita Federal | `cnpj_raiz` ✓ |
| `retailer_locations` | 24,275 | Excel + 3-tier geocoder | `cnpj_raiz` (FK) ✓ |
| `company_enrichment` | 2 | BrasilAPI / CNPJ.ws / ReceitaWS | `cnpj_basico` (FK) ✓ |
| `company_notes` | 2 | User input | `cnpj_basico` (FK) ✓ |
| `company_research` | 3 | DuckDuckGo / Google CSE | `cnpj_basico` (FK) ✓ |
| `industries` | 18 | Manual + AGROFIT | `id` PK (needs `cnpj_basico`) |
| `retailer_industries` | 392 | Manual junction | both FKs ✓ |
| `industry_products` | 0 | AGROFIT (planned) | `industry_id` (FK) ✓ |
| `retailer_intelligence` | 2 | Gemini analysis (legacy) | `cnpj_raiz` (FK) ✓ |
| `competitors` / `competitor_signals` | 7 / 13 | Seed + news scan | needs anchoring to `companies` |
| `news_knowledge` | 0 | Archive pipeline | needs `entity_mentions` |
| `knowledge_items` | 49 | Cross-vertical index (pgvector) | needs `entity_mentions` |
| `published_articles` | 6 | AgriSafe content | — |
| `content_topics` | 5 | Editorial pipeline | `published_article_id` (FK) ✓ |
| `sync_logs` | 13 | All crons | — |

---

## Strategic Vision

Market Hub is **not just a dashboard** — it is the knowledge engine of the AgriSafe ecosystem:

1. **Data is ingested** algorithmically from public sources (~166 catalogued, ~120 active) — **no LLM scraping**
2. **Knowledge is organized** around the 5 core entities (company, rural producer, farm, financial operation, ag-input transaction) and the 4 confidentiality tiers (public, agrisafe_published, agrisafe_confidential, client_confidential)
3. **Insights are generated** by cross-referencing entities (e.g. `v_retailers_in_rj` revealed R$ 582.6M of distressed channels in the Diretório)
4. **Content is created** — LinkedIn articles, campaigns, positioning — feeding back into the AgriSafe brand
5. **The brain is built** — RAG structure that becomes AgriSafe's digital twin, accessible via a webapp chat interface

The platform serves multiple AgriSafe products downstream:
- **Admin Portal** — credit risk, commercial intelligence
- **App Campo** — field sales agenda, client visits, calendar from Eventos Agro
- **Newsletter / WhatsApp outreach** — driven by Central de Conteúdo + CRM leads from Diretório de Canais
