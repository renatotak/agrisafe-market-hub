# CLAUDE.md — AgriSafe Market Hub

> Agent context file. For humans, see README.md. For the full roadmap, see ROADMAP.md.
> For the latest user-defined task list, see `documentation/TODO_2026-04-06.md`.

## Project in One Line

**AgriSafe Market Hub** is a bilingual (PT-BR/EN) executive intelligence platform: it ingests public agribusiness data from 176 sources, organizes it around the **5 core entities** of Brazilian agribusiness (legal entity, farm, asset, commercial activity, AgriSafe service), and enables the AgriSafe team to generate proprietary insights, content, and compliance intelligence.

**Platform flow:** Ingest → Analyze → Create → Comply

---

## ⚖️ HARD GUARDRAILS — read before every task

These rules apply to **every** change in this codebase. Violations are bugs.

### 1. Algorithms first, LLMs last

LLM tools (Gemini, OpenAI, Claude) are **last resort**, not the default.

| Need | Use this | NOT this |
|------|----------|----------|
| Parse a webpage | Cheerio + selectors | LLM extraction |
| Match a CNPJ | Regex + lookup table | LLM "find the company" |
| Compute spread / aggregate / rank | TypeScript / SQL | LLM "what is the average" |
| Geocode a city | Static dictionary + Nominatim | LLM "where is X" |
| Classify a news article by commodity | Keyword regex | LLM zero-shot classification |
| Detect a price rupture | `Math.abs(change) > 2 * stddev` | LLM "is this unusual" |
| Match a rural producer to a farm | CAR/INCRA/CPF/CNPJ keys + JOIN | LLM fuzzy match |
| Summarize a long article for archive | OpenAI / Gemini | (this is a valid LLM use) |
| Generate first-draft narrative for content hub | LLM | (valid LLM use) |
| Conversational chat over the knowledge base | LLM + RAG | (valid LLM use) |

**Why:** Algorithms are deterministic, free, fast, and reproducible. LLM calls cost money, vary across runs, hallucinate IDs, and need constant prompt tuning. Use LLMs only for **prose generation** and **conversational interfaces** where determinism is not required.

When you're tempted to add an LLM call, first ask: "Could a Python script or a regex do this?" If yes, do that.

### 2. The 5-entity data model — everything links back to these nodes

Every record stored in this database must be linkable, via foreign key or stable identifier, to one or more of these five nodes. **Building a feature without thinking about which of these it ties to is a bug.**

For the full schema, junctions, migration plan, and rationale, see **`documentation/ENTITY_MODEL.md`** (the canonical reference).

| # | Node | Stable identifier | What it represents |
|---|---|---|---|
| 1 | **Legal Entity** | `entity_uid` PK + `tax_id` (CPF or CNPJ) + `tax_id_type` | The universal "actor". Replaces the old separate "Company" and "Rural Producer" notion. A single CNPJ can simultaneously be an industry, a retailer, a producer, AND an AgriSafe client. Roles attach via the `entity_roles` junction. |
| 2 | **Farm** | `farm_uid` (CAR / INCRA / centroid hash) | A physical land unit. Multi-shareholder ownership is handled via the `farm_ownership` junction (multiple `entity_uid` per farm with `share_pct`). |
| 3 | **Asset** | `asset_uid` + `asset_type` (cpr / loan / commercial_note / insurance / barter) | A financial instrument. Multi-party stakeholders (co-borrowers, lenders, guarantors) handled via the `asset_parties` junction. |
| 4 | **Commercial Activity** | `activity_uid` + `activity_type` (ag_input_sale / barter / grain_trade / livestock_sale) | A commercial transaction. Always links retailer → buyer → farm → product. |
| 5 | **AgriSafe Service** | `service_uid` + `service_type` (credit_intelligence / monitoring / collection / market_hub_access) | A service contract. The client side is always a `Group` (even of size 1), so a "Família Silva" client can bundle multiple CPFs and CNPJs under one named contract. The service target is polymorphic via `agrisafe_service_targets(target_type, target_id)` so a single contract can simultaneously monitor a farm, an asset, an entity, and a group. |

**Cross-cutting layer (junctions and groups):**

- `entity_roles(entity_uid, role_type)` — multi-role per entity
- `groups(group_uid, group_type, name, ...)` + `group_members` — named collections (clients, cooperatives, portfolios)
- `farm_ownership(farm_uid, entity_uid, ownership_type, share_pct)` — multi-shareholder farms
- `asset_parties(asset_uid, entity_uid, party_role)` — multi-stakeholder assets
- `agrisafe_service_targets(service_uid, target_type, target_id)` — polymorphic service targeting
- `entity_mentions(entity_uid, source_table, source_id, mention_type)` — for news/regs/events that mention one or more entities

**FK rules:**

- New tables that describe an entity → FK to `legal_entities(entity_uid)`
- Tables that describe a farm → FK to `farms(farm_uid)`
- Tables that describe a financial instrument → FK to `assets(asset_uid)`
- Tables that describe a commercial transaction → FK to `commercial_activities(activity_uid)`
- Tables that describe an AgriSafe service → FK to `agrisafe_service_contracts(service_uid)`
- Cross-cutting facts (news, regulations, court records) → write rows to `entity_mentions` instead of a direct FK, since one article can mention many entities

**Multi-stakeholder rule of thumb:**

> Multi-row junctions (`farm_ownership`, `asset_parties`) **beat** polymorphic groups,
> **except** when the collective itself has identity worth naming
> (clients, cooperatives, internal portfolios) — those use `groups`.

**Existing tables that already follow this (with `cnpj_basico` text keys, to be migrated to `entity_uid` in Phase 17):**
- `retailers.cnpj_raiz`
- `recuperacao_judicial.entity_cnpj`
- `company_enrichment.cnpj_basico`
- `company_notes.cnpj_basico`, `company_research.cnpj_basico`
- `retailer_intelligence.cnpj_raiz`
- `retailer_industries.cnpj_raiz`

**Tables that still need anchoring (see ROADMAP Phase 17):**
- `agro_news`, `events`, `regulatory_norms` → write `entity_mentions` rows during ingestion
- `competitors` → backfill into `legal_entities` with `role_type='competitor'`
- `industries` → backfill into `legal_entities` with `role_type='industry'`

### 3. Public data only

Never store client PII, financial records, or proprietary data in the public-domain layer. The 3-tier confidentiality model (public / AgriSafe published / AgriSafe confidential) is implemented at the row level via a `confidentiality` enum column on the relevant tables.

### 4. Other hard constraints

- **Bilingual always** — Every UI string must exist in PT-BR + EN via `src/lib/i18n.ts`
- **MockBadge required** — Any non-live section must display the MOCKED DATA watermark
- **Cron pipeline** — Phase 25 lifted the Vercel Hobby single-cron limit. The 20 cron routes now run on a Mac mini via launchd (each job has its own schedule in `launchd/jobs.json`). The Vercel `/api/cron/X` endpoints are kept as manual triggers / fallback. Both call the same `src/jobs/X.ts` module — never duplicate logic between the route and the job. See `launchd/README.md`.
- **Activity log everything** — Every write path (cron, manual API endpoint, backfill script, Chrome extension) must call `logActivity()` from `src/lib/activity-log.ts`. The Settings → Registro de Atividade panel reads from this. POST/PATCH/DELETE all log; coverage is ~100% as of Phase 25 backlog batch.
- **Knowledge hierarchy** — Follow the 4-tier model in `documentation/KNOWLEDGE_ARCHITECTURE.md`
- **Google API free tier** — Verify Google APIs stay within free tier (Maps, Custom Search 100/day)

---

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript strict mode
- **Styling:** Tailwind CSS 4 via PostCSS
- **Database:** Supabase (PostgreSQL + pgvector + RLS)
- **Auth:** Supabase Auth + SSR middleware
- **Charts:** Recharts. **Icons:** Lucide React + Material Icons Outlined
- **Maps:** @vis.gl/react-google-maps (terrain + satellite views)
- **Path alias:** `@/*` → `./src/*`
- **Deployment:** **Hybrid** — Vercel hosts the Next.js webapp + cron route fallbacks; **20 cron jobs run on a 24/7 Mac mini via launchd (Phase 25)**. Each job has its own schedule in `launchd/jobs.json`. See `launchd/README.md` for the install path.
- **Scrapers:** Cheerio (server-side) + Python scripts in `src/scripts/` for heavy crawls. **No LLM-based scraping.**

## Commands

```bash
npm run dev                                      # Dev server
npm run build                                    # Production build
npm run cron <job-name>                          # Phase 25 — run any cron job locally via the dispatcher
node src/scripts/build-source-registry.js        # Rebuild 176-source seed JSON
node --env-file=.env.local src/scripts/seed-data-sources.js  # Phase 25 — seed data_sources table from JSON
node --env-file=.env.local src/scripts/seed-content.js       # Seed articles + topics to Supabase
node --env-file=.env.local src/scripts/geocode-retailers.js  # Geocode retailer locations
node --env-file=.env.local src/scripts/apply-migration.js NNN_name.sql  # Apply a single migration
```

**Mac launchd install (one-time):**
```bash
bash launchd/install.sh                          # idempotent installer
bash launchd/install.sh --reload                 # regenerate plists + reload after editing jobs.json
bash launchd/install.sh --uninstall              # remove every agrisafe agent
```

## Architecture: Four Verticals + Modules

| Vertical | Key Components |
|----------|---------------|
| Ingestão de Dados | `DataSources.tsx` (Scraper Health tab + **Source CRUD UI from data_sources table — Phase 25**), `SourceFormModal.tsx`, `SourceRegistry.tsx` (176 sources) |
| Inteligência de Mercado | `MarketPulse.tsx` (Highlights + Culture/Region/Macro tabs + Logistics spread + FAOSTAT + WB Pink Sheet macro), `CompetitorRadar.tsx` (CRUD), `AgroNews.tsx` (CRUD + Reading Room), `EventTracker.tsx` (AgroAgenda + AgroAdvance), `AgInputIntelligence.tsx` (Oracle) |
| Marketing & Conteúdo | `ContentHub.tsx` — see `documentation/CONTENT_HUB_SPEC.md` |
| Diretório (CRM-grade) | `RetailersDirectory.tsx` (channels — sortable list + CRM KPI row + RJ/news modals + **`EntityCrmPanel` + `StreetViewTile`** Phase 24G), `IndustriesDirectory.tsx` (industries — 18 curated + 256 imported via Phase 24A2 CSV), `RiskSignals.tsx` (Diretório × RJ cross-ref) |
| Regulatório & Compliance | `RegulatoryFramework.tsx` (with **`v_norms_affecting_entity` view + `/api/regulatory/affected-entities`** for "X empresas afetadas" — Phase 25), `RecuperacaoJudicial.tsx` |
| Base de Conhecimento | `KnowledgeBase.tsx` (search + AgroTermos), `KnowledgeMindMap.tsx` (table-graph viz) — chat is **tier-aware** (Phase 24G slice 1) |
| Configurações | `Settings.tsx` with **`AnalysisLensesEditor` + `ActivityLogPanel`** (Phase 24G2 — every cron / manual / extension write surfaced with filter chips) |

**Cron pipeline (Phase 25 — 20 jobs on Mac launchd, each with its own schedule):**

Every cron route is also a `src/jobs/X.ts` module callable from BOTH the Next.js `/api/cron/X` endpoint AND the launchd CLI dispatcher (`npm run cron <name>`). Logic lives in exactly one place. The Vercel cron route is kept as a manual trigger / fallback. Each job module owns its own `logSync` + `logActivity` calls so the Settings panel surfaces Mac and Vercel runs identically.

**Frequent (StartInterval):**
1. `sync-market-data` — BCB SGS → `commodity_prices`, `market_indicators` — every 30min
2. `sync-agro-news` — 5 RSS feeds → `agro_news` (+ entity-matcher + Phase 24F inline norm extractor → `regulatory_norms`) — every 2h
3. `sync-recuperacao-judicial` — 2 legal RSS → `recuperacao_judicial` (+ Phase 25 inline name matcher) — every 4h
4. `sync-regulatory` — 3 legal RSS → `regulatory_norms` (+ Phase 25 inline name matcher) — every 4h
5. `sync-prices-na` — Notícias Agrícolas regional prices (stub) — every 1h

**Daily (StartCalendarInterval, local time):**
6. `sync-cnj-atos` — CNJ JSON API → `regulatory_norms` — daily 09:00
7. `sync-events-na` — AgroAgenda → `events` (+ Phase 25 inline name matcher) — daily 06:00
8. `sync-competitors` — competitor enrichment → `competitor_signals` — daily 10:00
9. `sync-retailer-intelligence` — AI retailer intelligence → `retailer_intelligence` — daily 11:00
10. `sync-faostat` — FAOSTAT macro production → `macro_statistics` — daily 02:00
11. `archive-old-news` — OpenAI summaries + pgvector → `news_knowledge` — daily 04:00
12. `sync-scraper-healthcheck` — GitHub /zen probe for `runScraper()` wiring — daily 23:00

**Weekly (Sunday):**
13. `sync-industry-profiles` — industry profile enrichment — Sunday 03:00
14. `sync-agrofit-bulk` — federal AGROFIT crawl → `industry_products` — Sunday 04:00
15. `sync-events-agroadvance` — AgroAdvance Cheerio scraper → `events` — Sunday 05:00
16. `sync-cvm-agro` — CVM legislacao walker → `regulatory_norms` — Sunday 06:00
17. `sync-bcb-rural` — curated BCB landing-page catalog → `regulatory_norms` — Sunday 07:00
18. `sync-key-agro-laws` — Lei CPR / Falências / Nova Lei do Agro seed → `regulatory_norms` — Sunday 08:00
19. `sync-worldbank-prices` — World Bank Pink Sheet xlsx → `macro_statistics` — Sunday 09:00
20. **`sync-source-registry-healthcheck`** — Phase 25. Probes all 176 entries in `data_sources`, updates per-row status, summarizes newly-broken in activity_log — Sunday 10:00

**Live API routes (ISR cached or on-demand):**
- `/api/prices-na` — Notícias Agrícolas commodity prices (revalidate 10min)
- `/api/prices-na/regional` — Per-city prices: 322 praças for soy, 6 commodities
- `/api/intl-futures` — Yahoo Finance v8 proxy for CBOT/ICE/CME futures (15min ISR)
- `/api/events-na`, `/api/events-db` — AgroAgenda + unified events table (revalidate 1h / 10min)
- `/api/news-na` — NA news with category filter
- `/api/agroapi/clima` — Embrapa ClimAPI weather (revalidate 1h)
- `/api/agroapi/agrofit` / `bioinsumos` / `termos` — AGROFIT product search, Bioinsumos, AgroTermos
- `/api/macro-stats` — read endpoint for `macro_statistics` (FAOSTAT + World Bank), 1h ISR
- `/api/company-enrichment` — Receita Federal data (BrasilAPI/CNPJ.ws/ReceitaWS, cached 30d)
- `/api/company-research` — Web search (Google CSE / DuckDuckGo + optional OpenAI summary). **Phase 24B**: reads lens config from `analysis_lenses` (DB-backed) with code fallback. `analysis_type` body param picks the lens.
- `/api/company-notes` — User-editable company notes
- `/api/retailers/update`, `/api/retailers/kpi-summary` — retailer field edits + Diretório de Canais 4-card KPI summary
- `/api/cnpj/establishments` — **Phase 24B** generic on-demand RF establishment fetcher (BrasilAPI ordens 0001..N, inline geocoding via `src/lib/geocode.ts`, cached in `cnpj_establishments`)
- `/api/analysis-lenses` — **Phase 24B** CRUD for the editable analysis lens registry. Backs Settings → "Lentes de Análise"
- `/api/regulatory/upload` — **Phase 24C** manual `regulatory_norms` insert (Marco Regulatório "Inserir Norma" modal)
- `/api/regulatory/affected-entities` — **Phase 25** read endpoint backed by `v_norms_affecting_entity` + `v_norm_entity_counts` views (mig 044). `?norm_id=<id>` for the drilldown
- `/api/rj-scan` — DuckDuckGo web scan for agro companies in restructuring (Phase 16l)
- `/api/rj-add` — **Phase 24C** manual RJ insert by CNPJ + BrasilAPI lookup + DDG debt-amount scrape
- `/api/data-sources` — **Phase 25** full CRUD on `data_sources` table (mig 045). Backs the new "Adicionar Fonte" / Edit / Delete UX in `DataSources.tsx`. Soft-delete by default; hard-delete only allowed for `origin_file='manual'`
- `/api/activity` — **Phase 24G2** read endpoint for `activity_log` with `?source_kind` / `?target_table` / `?source` filters, tier-aware. Backs `ActivityLogPanel` in Settings
- `/api/crm/{key-persons,meetings,leads}` — **Phase 24G** CRUD endpoints for the new CRM tables (all default `agrisafe_confidential`). POST/PATCH/DELETE all log to `activity_log`
- `/api/knowledge/chat` — RAG chat over `knowledge_items` with **tier-aware filtering** (Phase 24G slice 1). Resolves caller tier and passes visible tiers to the `match_knowledge_items` RPC; defaults to `public` for unauthenticated sessions

**Logging stack:**
- `sync_logs` (legacy flat per-run row) — every cron via `src/lib/sync-logger.ts`
- `scraper_runs` + `scraper_registry.status` (Phase 19A) — only for scrapers wrapped in `runScraper()`
- `activity_log` (Phase 24G2 — **the canonical observability layer**) — every cron + every manual API write + every backfill script + extension push, fail-soft via `src/lib/activity-log.ts`. Settings → Registro de Atividade reads from this. ~100% coverage as of Phase 25 backlog batch.

## Key Files

| File/Dir | Purpose |
|----------|---------|
| `src/data/mock.ts` | Fallback mock data; shown with MockBadge watermark when live data unavailable |
| `src/data/published-articles.ts` | Curated AgriSafe published content (not mock) |
| `src/data/source-registry.json` | **Phase 25**: now seed-data only. Live truth is `data_sources` table. JSON is the static fallback if `/api/data-sources` errors out, and the audit-trail copy in git. |
| `src/lib/i18n.ts` | All PT-BR / EN translations |
| `src/lib/agroapi.ts` | Embrapa AgroAPI OAuth2 client + typed helpers |
| `src/lib/sync-logger.ts` | Legacy `sync_logs` per-run row writer (still used; new code should also call `logActivity`) |
| `src/lib/activity-log.ts` | **Phase 24G2** — fail-soft `logActivity()` + `logActivityBatch()` helpers. The canonical observability layer. Every write path must call this. |
| `src/lib/scraper-runner.ts` | **Phase 19A** — `runScraper()` wrapper. Validates output rows against `scraper_registry.schema_check`, updates per-scraper health, writes to `scraper_runs` + `scraper_knowledge` + `activity_log`. Every Phase 19+ scraper uses this. |
| `src/lib/scraper-job-runner.ts` | **Phase 25** — adapter that wraps `runScraper()` + an upsert into a unified `JobResult`. Used by 8 of the 9 runScraper-based job modules (sync-agrofit-bulk has a custom job because it touches 4 tables). |
| `src/lib/entity-matcher.ts` | **Phase 17D** — algorithm-first matcher. Used by `sync-agro-news`, `reading-room/ingest`, **and Phase 25 inline in `sync-events-na`, `sync-regulatory`, `sync-recuperacao-judicial` job modules**. |
| `src/lib/extract-norms-from-news.ts` | **Phase 24F** — pure-regex norm-citation extractor. 11 patterns. Used inline by `sync-agro-news`. |
| `src/lib/cnae-classifier.ts` | **Phase 24G2** — 18 deterministic regex rules → IBGE 7-digit CNAE codes. Wired into 6 paths that write `regulatory_norms`. |
| `src/lib/confidentiality.ts` | **Phase 24G slice 1** — `ConfidentialityTier` type, `visibleTiers()`, `resolveCallerTier()`, `tierFilter()`. Used by `/api/knowledge/chat` and the `match_knowledge_items` RPC (mig 040). |
| `src/lib/geocode.ts` | **Phase 24B** — reusable 3-tier geocoder (Google → AwesomeAPI CEP → Nominatim) |
| `src/lib/entities.ts` | `ensureLegalEntityUid()` helper — idempotent, race-safe |
| **`src/jobs/`** | **Phase 25** — 19 framework-agnostic cron job modules + `types.ts` (shared `JobResult`). Each exports `runX(supabase): Promise<JobResult>`. Both the Next.js cron route AND the launchd CLI dispatcher call the same module. |
| `src/components/EntityMapShell.tsx` | **Phase 24B** — reusable Painel-style map shell shared by both directories |
| `src/components/AnalysisLensesEditor.tsx` | **Phase 24B** — Settings panel for editing `analysis_lenses` |
| `src/components/EntityCrmPanel.tsx` | **Phase 24G** — collapsible 3-section panel (Pessoas-chave / Reuniões / Pipeline) mounted in both directories |
| `src/components/StreetViewTile.tsx` | **Phase 24G slice 3** — probes Street View Metadata API first, then renders 480×260 static image. Mounted per matriz with lat/lng. |
| `src/components/ActivityLogPanel.tsx` | **Phase 24G2** — Settings panel reading from `/api/activity`. Three filter chip rows + paginated feed |
| `src/components/SourceFormModal.tsx` | **Phase 25** — bilingual add/edit modal for `data_sources` rows. Self-contained POST/PATCH. |
| `src/app/api/cron/` | **20 cron routes** + `sync-all` orchestrator (still alive as a Vercel manual trigger). All 20 are now thin HTTP wrappers calling `src/jobs/X.ts`. |
| **`src/scripts/cron/run-job.ts`** | **Phase 25** — generic launchd CLI dispatcher: `npm run cron <job-name>`. JOB_REGISTRY has all 20 jobs. |
| `src/app/api/data-sources/` | **Phase 25** Source CRUD (table-backed, replaces the JSON-only catalog from the UI side) |
| `src/app/api/regulatory/affected-entities/` | **Phase 25** read endpoint backed by `v_norms_affecting_entity` + `v_norm_entity_counts` views |
| `src/app/api/cnpj/establishments/` | **Phase 24B** generic RF establishment fetcher with inline geocoding |
| `src/app/api/analysis-lenses/` | **Phase 24B** CRUD endpoint for editable lens registry |
| `src/app/api/regulatory/upload/` | **Phase 24C** manual `regulatory_norms` insert |
| `src/app/api/rj-add/` | **Phase 24C** manual RJ insert by CNPJ + BrasilAPI + DDG debt scrape |
| `src/app/api/crm/` | **Phase 24G** — `/key-persons`, `/meetings`, `/leads` CRUD endpoints. All POST/PATCH/DELETE log to `activity_log`. |
| `src/app/api/activity/` | **Phase 24G2** — read endpoint for the activity log feed |
| `src/db/migrations/` | **45 SQL migrations.** 035=`cnpj_establishments`, 036=`analysis_lenses`, 037=Phase 24D scrapers, 038=World Bank, 039=CNJ, 040=tier-aware knowledge search, 041=CRM tables, 042=`affected_cnaes` + GIN, 043=`activity_log`, **044=`v_norms_affecting_entity`**, **045=`data_sources` table** |
| **`launchd/`** | **Phase 25** Mac launchd cron infrastructure. `jobs.json` (source of truth for schedules), `generate-plists.js` (jobs.json → plists/), `install.sh` (idempotent installer with `--reload`/`--uninstall`/`--dry-run`), `README.md` (full ops manual: Quickstart, sleep prevention, Tailscale, troubleshooting), `plists/` (20 generated `.plist` files with REPLACE_ME placeholders) |
| `src/scripts/apply-migration.js` | **Phase 24B** — applies a single migration via `DATABASE_URL` Postgres pooler |
| `src/scripts/seed-data-sources.js` | **Phase 25** — one-shot upsert from `source-registry.json` → `data_sources` table |
| `src/scripts/backfill-cnpj-establishments.js` | **Phase 24B** — walks every entity with `role_type='industry'`, fetches all ordens via BrasilAPI, geocodes, upserts. Logs to `activity_log` (Phase 25 backlog). 1,699 establishments cached. |
| `src/scripts/backfill-norms-from-news.js` | **Phase 24F** — re-scans `agro_news` through the norm extractor. Logs to `activity_log` (Phase 25 backlog). |
| `src/scripts/backfill-cvm-historical.js` | **Phase 24D follow-up** — walks all 868 CVM legislacao docs. Logs to `activity_log` (Phase 25 backlog). |
| `src/scripts/check-source-registry.js` | One-shot health probe over `source-registry.json`. Superseded for the cron use case by `sync-source-registry-healthcheck`, but still useful in dev. |
| `src/scripts/geocode-events.js` | **Phase 23B** — Nominatim-only geocoder for events. Logs to `activity_log` (Phase 25 backlog). |
| `src/scripts/geocode-retailers.js` | 3-tier geocoding for `retailer_locations` (Phase 16i) |
| `src/scripts/seed-rj-from-receita.ts` | Seed RJ data from crawlers DB |
| `imports/cnpj-metadados.pdf` | Receita Federal CNPJ data layout reference |
| `chrome-extensions/reading-room/` | Embedded Chrome MV3 extension. Pushes saved articles to `/api/reading-room/ingest` (Phase 22). |

## Data Classification (Receita Federal vs AgriSafe)

| Source | Fields | Behavior |
|--------|--------|----------|
| **Receita Federal** (locked) | CNPJ, Razão Social, Capital Social, Porte, Situação, CNAE, Endereço, QSA, Simples/MEI | Read-only, lock icon |
| **AgriSafe internal** (editable) | Grupo, Classificação, Faturamento, Indústrias, Loja Física, Tipo Acesso | Click-to-edit, pencil icon |
| **User notes** | Obs. Faturamento, Contato Comercial, Observações | Saved to `company_notes` table |

### Confidentiality tiers (planned)

The Diretório de Canais will become AgriSafe's CRM. To support that, every editable field will be tagged with one of three tiers stored in a `confidentiality` enum:

1. **`public`** — Receita Federal data, news mentions, public events. Anyone can see.
2. **`agrisafe_published`** — AgriSafe-curated insights (e.g. company write-ups). Visible to AgriSafe team and partners.
3. **`agrisafe_confidential`** — Meeting notes, lead pipelines, internal classifications. Visible only to authenticated AgriSafe staff with the right role.

A future fourth tier (`client_confidential`) will hold partner-shared data under NDA.

The Knowledge Base (RAG / chat) must respect this tier when answering — never leak `agrisafe_confidential` content to a query that came from a `public`-tier session.

## Adding a New Data Source (Workflow — Phase 25)

1. **Analyze** — Format (API/RSS/CSV/HTML), update freq, auth requirements
2. **Check conflicts** — Search `data_sources` table (or `source-registry.json` as the audit-trail seed) for overlapping data
3. **Register** — Either add via the **Settings → Ingestão de Dados → Adicionar Fonte** UI (writes to `data_sources` with `origin_file='manual'`), OR add to `source-registry.json` and re-run `seed-data-sources.js` if it should be in the seed catalog
4. **Build ingestion** — Algorithmic scraper (Cheerio/Python), NOT LLM:
   - Write the logic in `src/jobs/sync-{source}.ts` as `runSyncX(supabase): Promise<JobResult>` (use `runScraperJob` if it's a runScraper-style scraper that can use the helper)
   - Create the thin HTTP wrapper in `src/app/api/cron/sync-{source}/route.ts` that calls the job
   - Add an import + registry entry in `src/scripts/cron/run-job.ts`
   - Add an entry in `launchd/jobs.json` with the desired schedule
   - Run `node launchd/generate-plists.js` to regenerate the plists
   - The job module must call `logActivity()` (or use `runScraperJob`/`runScraper`, both of which call it for you)
5. **Anchor to entities** — Make sure scraped records carry the relevant FK (`entity_uid`, `farm_uid`, etc.) OR write `entity_mentions` rows during ingestion using the `entity-matcher` lib
6. **Sample check** — `npm run cron sync-{source}` from the repo root to test locally before installing the launchd job
7. **Persona validation** — Test through CEO / Head Inteligência / Marketing / Crédito lenses

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY   # Required
SUPABASE_SERVICE_ROLE_KEY                                   # Required (server-side admin)
DATABASE_URL                                                # Direct Postgres pooler — needed for migrations + scripts
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY                             # Required (maps + tier-1 geocoding)
AGROAPI_CONSUMER_KEY / AGROAPI_CONSUMER_SECRET              # Required (Embrapa)
GOOGLE_CUSTOM_SEARCH_KEY / GOOGLE_CUSTOM_SEARCH_CX          # Optional (web research, 100 free/day — currently disabled at the project level, returns 403)
OPENAI_API_KEY                                              # Optional (archive, AI summaries, analysis lenses)
GEMINI_API_KEY                                              # Optional (knowledge embeddings)
READING_ROOM_SECRET                                         # Phase 22 — Chrome extension auth
CRON_SECRET                                                 # Optional (production cron auth gate)
```

`DATABASE_URL` must use the **Session pooler** (port 5432, NOT Transaction pooler 6543) because DDL needs session mode. Format:
```
postgresql://postgres.<project-ref>:<DB-PASSWORD>@aws-N-<region>.pooler.supabase.com:5432/postgres
```
Special characters in the DB password must be percent-encoded (`@`→`%40`, `!`→`%21`).

## Design Tokens

Primary `#5B7A2F` · Secondary `#7FA02B` · Warning `#E8722A`
Page bg `#F7F4EF` · Text `#3D382F` · Font: Inter 300–800

## Deeper References

| Topic | File |
|-------|------|
| **Entity model (5 nodes + junctions)** — canonical schema reference | **`documentation/ENTITY_MODEL.md`** |
| **Mac launchd ops manual (Phase 25)** | **`launchd/README.md`** |
| Operations & data journeys | `PLAYBOOK.md` |
| Roadmap & phase history | `ROADMAP.md` |
| Latest task list (2026-04-06) | `documentation/TODO_2026-04-06.md` |
| System requirements (FR/NFR) | `documentation/REQUIREMENTS.md` |
| Scraper specs & selectors | `documentation/SCRAPER_SPECIFICATIONS.md` |
| Knowledge architecture (4-tier) | `documentation/KNOWLEDGE_ARCHITECTURE.md` |
| Content Hub spec | `documentation/CONTENT_HUB_SPEC.md` |
| Datalake product strategy | `documentation/AGSF_Datalake_PRODUCT.md` |
| CNPJ data layout (RF) | `imports/cnpj-metadados.pdf` |
