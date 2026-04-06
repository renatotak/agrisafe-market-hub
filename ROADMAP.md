# AgriSafe Market Hub — Roadmap

> **Last updated:** 2026-04-06
> **Status:** Phase 17 complete (5-entity foundation shipped). 4-vertical architecture, 13+ modules, 31 Supabase tables, 26 SQL migrations. Phase 18+ open.
> **For the latest user-defined task list, see** `docs/TODO_2026-04-06.md`.

---

## Current State (April 2026)

| Component | Status |
|-----------|--------|
| Architecture | 4 verticals, 13 modules |
| Data sources | 166 catalogued (~120 active) |
| Live cron pipeline | 7 jobs via `sync-all` |
| Supabase tables | 31 tables, 26 SQL migrations, 5-entity model live |
| Legal entities (canonical) | 9,433 (9,328 retailers + 80 RJ-only + 18 industries + 7 competitors) |
| Entity roles | 9,353 (retailer / industry / competitor) |
| Entity mentions (graph edges) | 120 (118 RJ + 2 agro_news, algorithm-matched) |
| Retailers | 9,328 channels / 24,275 locations (geocoded), all linked to entity_uid |
| Recuperação Judicial | 118 records, all linked to entity_uid |
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
| 17A–17F | Five Core Nodes Foundation — see Phase 17 block below | ✅ |

---

## Phase 17 — Five Core Nodes Foundation ✅ COMPLETE (2026-04-06)

The foundational schema phase that everything else hangs off. Database is now reorganized around the 5 core nodes from `docs/ENTITY_MODEL.md`. Shipped in **6 commits across 6 sub-phases**, all pushed to `origin/main`.

| Sub-phase | Commit | Migration(s) | What |
|-----------|--------|--------------|------|
| **17A** | `733f674` | 018, 019 | 12 new tables: 5 core nodes (`legal_entities`, `farms`, `assets`, `commercial_activities`, `agrisafe_service_contracts`) + 7 junction/support tables (`entity_roles`, `groups`, `group_members`, `farm_ownership`, `asset_parties`, `agrisafe_service_targets`, `entity_mentions`). RLS + confidentiality on every table, 15 FK constraints. |
| **17B** | `b75f7d8` | 020–023 | Backfill **9,433 legal_entities** (9,328 retailers + 80 RJ-only + 18 industries + 7 competitors) and **9,353 entity_roles** assignments. Re-key 5 satellite tables to `entity_uid` (100% link rate). Add `confidentiality` enum to 25 more tables (16 public / 6 agrisafe_published / 3 agrisafe_confidential). Rebuild `v_retailer_profile`, `v_retailers_in_rj`, plus new canonical `v_entity_profile` (one-row entity lookup). All views use `security_invoker=on`. |
| **17C** | `f374b17` | 024 | Add `retailers.entity_uid` FK + backfill (9,328/9,328). New helper `src/lib/entities.ts#ensureLegalEntityUid` (idempotent, race-safe). Wire it into write APIs (`/api/company-enrichment`, `/api/company-notes`, `/api/company-research`) so every new row carries `entity_uid`. |
| **17D** | `08dc7c4` | 025 | Backfill `entity_mentions` from RJ (118 mentions, subject/negative). New algorithm-first matcher `src/lib/entity-matcher.ts` with Portuguese-agro stopword blocklist + multi-word/length-10 rule. Wire matcher into `sync-agro-news` and `sync-recuperacao-judicial` crons. **Initial backfill: 2 true-positive news mentions, zero false positives** (CAPAL COOPERATIVA, SPAÇO AGRÍCOLA). |
| **17E** | `21b39f7` | — | `/api/retailer-intelligence` accepts `entity_uid` (preferred) or `cnpj_raiz` (fallback). News lookup REPLACED: was an ILIKE substring scan over `agro_news` (lossy, accent-blind, slow at scale), now a deterministic JOIN through `entity_mentions`. UI panel propagates entity_uid. |
| **17F** | `22bd422` | 026 | Add `recuperacao_judicial.entity_uid` FK + backfill (118/118). Mirrors mig 024. Existing `select("*")` in the UI auto-carries entity_uid for any future drill-down — no UI changes needed. |

**End-state numbers:**
- 31 tables (was 22), 26 migrations (was 17)
- 9,433 legal_entities, 9,353 entity_roles, 120 entity_mentions
- All 9,328 retailers + all 118 RJ rows linked to a canonical entity
- `get_advisors`: 0 ERRORs, only the same pre-existing WARNs as before Phase 17

**Architectural payoffs unlocked for Phase 18+:**
- Anything that mentions a CNPJ now resolves to a single `entity_uid` — drill-downs across modules trivialize.
- Cross-cutting graph queries: *"show me all news mentioning the entities currently in RJ"* is one JOIN.
- Confidentiality tier in place at row level on 31 tables — RAG/chat in Phase 28 can filter by user role.
- Reusable algorithm-first entity matcher (`src/lib/entity-matcher.ts`) ready for events / regulations / industries crons when those get wired.

**Cleanup deferred (low priority, do alongside Phase 24):**
- Drop legacy `cnpj_raiz` / `cnpj_basico` text columns once nothing reads them
- Wire entity-matcher into `sync-events-na`, `sync-regulatory`, `archive-old-news`
- Refresh `KnowledgeMindMap.tsx` "current state" view — the future-state nodes shown there are now real, not aspirational
- Migrate the remaining cnpj_raiz reads in `RetailersDirectory.tsx`, `RegulatoryFramework.tsx`, `RecuperacaoJudicial.tsx`, `CompetitorRadar.tsx` to entity_uid

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

## Database Tables (Live, post-Phase 17)

### Core 5-entity model (Phase 17A — migrations 018-019)

| Table | Rows | Purpose |
|-------|------|---------|
| `legal_entities` | 9,433 | The universal "actor" — single CNPJ/CPF row with multi-role attachment via `entity_roles` |
| `farms` | 0 | Physical land units (`car_code`, `incra_code`, centroid, area). Empty until INCRA/CAR ingestion |
| `assets` | 0 | Financial instruments (CPR / loan / commercial note / insurance / barter). Empty until ingestion |
| `commercial_activities` | 0 | Commercial transactions (ag input sale / barter / grain trade / livestock sale). Empty until ingestion |
| `agrisafe_service_contracts` | 0 | AgriSafe service contracts. Empty until CRM ingestion (Phase 24) |
| `entity_roles` | 9,353 | Many-to-many: which entity holds which role(s). 9,328 retailer + 18 industry + 7 competitor |
| `groups` | 0 | Named collections of entities (clients, cooperatives, portfolios). Empty until CRM ingestion |
| `group_members` | 0 | Group membership junction |
| `farm_ownership` | 0 | Multi-shareholder farms — `(farm_uid, entity_uid, share_pct)` |
| `asset_parties` | 0 | Multi-stakeholder assets — `(asset_uid, entity_uid, party_role)` |
| `agrisafe_service_targets` | 0 | Polymorphic service targeting `(target_type, target_id)` |
| `entity_mentions` | 120 | Cross-cutting graph edges. **118 from RJ + 2 from agro_news** (algorithm-matched, Phase 17D) |

### Public-data layer (anchored to entity_uid post-Phase 17)

| Table | Rows | Source | entity_uid? |
|-------|------|--------|-------------|
| `commodity_prices` | 6 | BCB SGS | — (commodity dimension) |
| `commodity_price_history` | growing | BCB SGS | `commodity_prices.id` (FK) |
| `market_indicators` | 6 | BCB SGS | — |
| `agro_news` | 124 | RSS feeds | linked via `entity_mentions` (2 rows) |
| `events` | 26 | NA / AgroAgenda | needs `entity_mentions` hook (deferred) |
| `regulatory_norms` | 1 | RSS legal feeds | needs `entity_mentions` hook (deferred) |
| `recuperacao_judicial` | 118 | RSS + Receita Federal seed | `entity_uid` ✓ (Phase 17F, mig 026) |
| `retailers` | 9,328 | Excel + Receita Federal | `entity_uid` ✓ (Phase 17C, mig 024) |
| `retailer_locations` | 24,275 | Excel + 3-tier geocoder | `cnpj_raiz` only (deferred to cleanup) |
| `company_enrichment` | 2 | BrasilAPI / CNPJ.ws / ReceitaWS | `entity_uid` ✓ (Phase 17B, mig 021) + new rows via API helper (17C) |
| `company_notes` | 2 | User input | `entity_uid` ✓ (Phase 17B + 17C) |
| `company_research` | 3 | DuckDuckGo / Google CSE | `entity_uid` ✓ (Phase 17B + 17C) |
| `industries` | 18 | Manual + AGROFIT | promoted to `legal_entities` with `role_type='industry'` |
| `retailer_industries` | 392 | Manual junction | both `retailer_entity_uid` + `industry_entity_uid` ✓ (Phase 17B, mig 021) |
| `industry_products` | 0 | AGROFIT (planned) | `industry_id` (FK) ✓ |
| `retailer_intelligence` | 2 | Gemini analysis (legacy) | `entity_uid` ✓ (Phase 17B) |
| `competitors` / `competitor_signals` | 7 / 13 | Seed + news scan | promoted to `legal_entities` with `role_type='competitor'` |
| `news_knowledge` | 0 | Archive pipeline | needs `entity_mentions` |
| `knowledge_items` | 49 | Cross-vertical index (pgvector) | needs `entity_mentions` |
| `published_articles` | 6 | AgriSafe content | — |
| `content_topics` | 5 | Editorial pipeline | `published_article_id` (FK) ✓ |
| `sync_logs` | 13 | All crons | — |

### Views (rebuilt in Phase 17B/17E with `security_invoker=on`)

| View | Keyed on | Purpose |
|------|----------|---------|
| `v_retailer_profile` | `entity_uid` | Retailer + Receita Federal enrichment + AgriSafe intelligence in one row |
| `v_retailers_in_rj` | `entity_uid` | Retailers intersected with RJ filings (powers `RiskSignals.tsx`) |
| `v_entity_profile` | `entity_uid` | NEW canonical "everything I know about entity X" — roles array + retailer facts + RF enrichment + intelligence + RJ state |

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
