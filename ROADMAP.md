# AgriSafe Market Hub — Roadmap

> **Last updated:** 2026-04-09 (Phase 25 + post-25 batches)
> 4 verticals · 14 modules · 57 Supabase tables · 45 SQL migrations · **20 cron routes (now Mac-as-server via launchd, Phase 25)** · 9 registered scrapers (all healthy) · 9,674 legal entities · 5-entity model live · tier-aware chat · CRM tables · activity log · **Source CRUD UI** · **norms × entities view**.
> Latest user task list: `documentation/TODO_2026-04-06.md`

---

## Status Snapshot (2026-04-09)

| Area | Live |
|---|---|
| **Architecture** | 4 verticals (Ingest → Analyze → Create → Comply), 14 modules |
| **5-entity model** | 9,674 legal_entities · 9,609 entity_roles · 143 entity_mentions |
| **Diretório de Canais** | 9,328 retailers · 24,275 retailer_locations (geocoded) · CRM-style 4-card KPI row · sortable columns · RJ + News-mention modals · **CRM panel + Street View tile per row (Phase 24G)** |
| **Diretório de Indústrias** | 274 (18 curated + 256 imported via CSV) · 1,699 cnpj_establishments (100% geocoded via Nominatim) · list+map+expandable rows · 4-button row actions (RF data / Web search / AI analysis / Buscar filiais) · **CRM panel + Street View tile per row (Phase 24G)** |
| **CRM (Phase 24G)** | `key_persons` + `meetings` + `leads` tables (all `agrisafe_confidential`) · `EntityCrmPanel` mounted in both directories · `/api/crm/*` CRUD endpoints · leads can link to existing `campaigns` table |
| **Marco Regulatório** | 16 norms with **CNAE classification** (CVM 6, BCB 6, CONGRESSO 3, CNJ 1) · "Inserir Norma" + "Fontes" modals · CNJ JSON daily · CVM curated daily + historical backfill done · BCB curated · key agro laws seeded · news norm-citation extractor inline in sync-agro-news · **`v_norms_affecting_entity` view + `/api/regulatory/affected-entities` (Phase 25)** — joins `regulatory_norms.affected_cnaes` × `legal_entities.primary_cnae` to surface "X empresas afetadas" per norm |
| **Recuperação Judicial** | 131 cases (118 RJ + 13 manual) · "Adicionar CNPJ" modal with BrasilAPI lookup + DDG debt scrape |
| **Pulso de Mercado** | BCB SGS · NA prices (regional + futures) · Yahoo intl futures · FAOSTAT macro (5 cultures) · World Bank Pink Sheet annual prices (6 commodities × 15 years) |
| **Notícias Agro** | 203 articles · 5 RSS feeds + Reading Room v3.0 Chrome extension · CRUD modal · entity-mention matcher + norm-citation extractor inline |
| **Eventos Agro** | AgroAgenda + AgroAdvance unified into events table · per-event AI enrichment · source provenance badges |
| **Ingestão de Dados** | 176 sources in `data_sources` table (125 active / 25 inactive / 24 error / 2 unchecked) · **Source CRUD UI in DataSources tab (Phase 25)** — Add / Edit / Delete via `SourceFormModal`, soft-delete by default, hard-delete only for manual entries · `/api/data-sources` REST endpoint · weekly Sunday `sync-source-registry-healthcheck` cron updates `url_status` / `http_status` / `last_checked_at` and flags newly-broken sources in `activity_log` · 9 scrapers in `scraper_registry` · Saúde dos Scrapers tab · source→tables mapping |
| **Inteligência de Insumos** | Oracle UX with culture+pest filter · molecule-grouped brand alternatives sorted by competitiveness (patented → commodity) · federal AGROFIT bulk catalog |
| **Radar Competitivo** | CRUD modal · Harvey Ball matrix · web enrichment per company |
| **Base de Conhecimento** | Semantic search + RAG chat · **tier-aware filtering (Phase 24G)** — chat respects caller tier, defaults to `public` for unauthenticated sessions |
| **Configurações** | Editable analysis lenses (DB-backed prompts) · Reading Room install guide · **Activity Log panel (Phase 24G2)** — every cron run + manual insert + extension push surfaced with filter chips |
| **Auth + deploy** | Supabase Auth + SSR middleware · **Hybrid: Vercel hosts Next.js webapp + cron route fallbacks; 20 cron jobs run on Mac mini via launchd (Phase 25)**, each with its own schedule, no Vercel cron-count limit |
| **Cron pipeline (Phase 25)** | **20 cron routes** ported to `src/jobs/*.ts` framework-agnostic modules + `runScraperJob` adapter + generic `run-job.ts` dispatcher + `launchd/jobs.json` schedule config + `generate-plists.js` + `install.sh`. Both the Next.js cron route AND the Mac CLI dispatcher call the same job module — logic lives in exactly one place. Settings → Activity Log surfaces Mac and Vercel runs identically. See [launchd/README.md](launchd/README.md). |

---

## What's Live (compact phase history)

Every shipped phase in chronological order. For deeper detail on a specific phase, search the git log by commit message.

| Phase | What | When |
|---|---|---|
| 1–7 | Research, architecture, build v1, Supabase, data ingestion, mobile UI | — |
| 8 | Design System Migration (AgriSafe brand tokens) | — |
| 9 | Charts & Visualization (Recharts across 4 modules) | — |
| R | Four-Vertical Reorganization | — |
| 10–12 | Data Ingestion vertical, Executive Dashboard, Live Data Feeding | — |
| 13 | Regulatory cron pipeline | — |
| 14 | MarketPulse Bloomberg Enhancement | — |
| 15 | Content Intelligence + Source Registry (176 sources catalogued) | — |
| 16a–16v | NA widgets, Embrapa AgroAPI, AgroAgenda, Dashboard Map, RJ web scan, Migrations 015–017 (FK + views), RiskSignals (R$ 582mi cross-vertical), Knowledge Mind Map, Pulso do Mercado redesign, Yahoo intl futures | — |
| **17A–17F** | **5-entity foundation.** Migrations 018-026: legal_entities + farms + assets + commercial_activities + agrisafe_service_contracts + 7 junctions. Backfill 9,433 entities + 9,353 roles. Re-key 5 satellite tables. `entity-matcher.ts` algorithm-first matcher. Confidentiality enum on 31 tables. Views rebuilt with `security_invoker=on`. | 2026-04-06 |
| **18** | **Painel improvements.** KPI cards open ChapterModal · Mapa de Inteligência Integrada with location-parsed news/events/weather · 30/90/Tudo date filter (now also gates news + RJ as past windows) · Notícias → Knowledge Base RAG ingestion. | 2026-04-07 |
| **19A** | **Scraper Resilience Foundation.** Migration 027: `scraper_registry` + `scraper_runs` + `scraper_knowledge`. `runScraper()` wrapper validates output deterministically (no LLM). Saúde dos Scrapers tab + Dashboard "Dados" KPI. SCRAPER_PROTOCOL.md doc. | 2026-04-07 |
| **19B** | **FAOSTAT macro.** Migration 028 + 029: macro_statistics table. `sync-faostat` covers soja/milho/café/trigo/algodão. MarketPulse → Contexto Macro tab live. | 2026-04-07 |
| **20A** | **Inteligência de Insumos Oracle.** Migration 030: industry_products + active_ingredients + product_uses + v_oracle_brand_alternatives. `sync-agrofit-bulk` Sunday-only. Oracle UX with patented→commodity competitiveness ranking. | 2026-04-07 |
| **21** | **Radar Competitivo CRUD + Harvey Ball.** Migration 031. Modal with sliders, web enrichment via `/api/competitors/enrich-web`. | 2026-04-07 |
| **22** | **Notícias Agro CRUD.** Migration 032: news_sources table. Reading Room Chrome extension v3.0 auto-syncs into Supabase via `/api/reading-room/ingest`. | 2026-04-07 |
| **23A** | **Eventos Agro unified.** Migration 034: events extended with source provenance + lat/lng + AI enrichment. AgroAdvance scraper. EventTracker reads from `/api/events-db`. Per-event Enrich button. | 2026-04-07 |
| **24A** | **Diretório split-out + CRM KPI row.** Industries chapter created. RetailerKpiRow with 4 cards (Total + bar / Cities + concentration / In RJ / Mentioned in News). `/api/retailers/kpi-summary`. Sortable columns. | 2026-04-07 |
| **24A1** | **Entity-matcher SHORT_NAME_ALLOWLIST.** ~25 audited iconic agribrands bypass the 10-char minimum. Inverted join in kpi-summary fixes the 1000-row PostgREST cap that hid COMIGO. | 2026-04-07 |
| **24A2** | **Industries CSV backfill.** 256 industries + 163 inpEV members imported into legal_entities + entity_roles. `/api/industries` returns curated+imported union. IndustriesDirectory filter+sort UX. | 2026-04-07 |
| **24B** | **Industries map + EntityMapShell + editable lenses.** Migration 035: cnpj_establishments. `/api/cnpj/establishments` on-demand BrasilAPI fetcher with inline 3-tier geocoding. `EntityMapShell.tsx` shared by both directories (Painel-style layer chips, terrain/satellite, fullscreen, recenter, "Buscar nesta área"). Migration 036: analysis_lenses table. Settings → Lentes de Análise editor. `/api/company-research` reads lens config from DB with code fallback. **Backfill: 1,699 establishments cached, 100% geocoded.** | 2026-04-08 |
| **24C** | **Marco Reg upload + RJ CRUD + Source→Tables mapping.** `/api/regulatory/upload` + Inserir Norma + Fontes modals. `/api/rj-add` with BrasilAPI lookup + DDG debt scrape regex. DataSources `CATEGORY_TO_TABLES` map surfaced in domain expand + per-endpoint detail. | 2026-04-08 |
| **24D** | **Marco Reg scrapers (CVM + BCB + key laws).** Migration 037 + scraper_knowledge note. `sync-cvm-agro` (direct CVM index walker, weekly), `sync-bcb-rural` (curated catalog, weekly), `sync-key-agro-laws` (CPR / Falências / Nova Lei do Agro seeder, weekly). | 2026-04-08 |
| **24E** | **World Bank Pink Sheet.** Migration 038. `sync-worldbank-prices` parses CMO Annual Prices xlsx with header sanity check. 6 commodities × 15 years = 90 rows seeded. MarketPulse Macro tab gets a new "Preço Anual Mundial" line chart. | 2026-04-08 |
| **24F** | **CNJ atos + news norm-citation extractor.** Migration 039. `sync-cnj-atos` walks atos.cnj.jus.br/api/atos JSON daily, regex-filters by agro keywords, upserts hits with body=CNJ. `src/lib/extract-norms-from-news.ts` 11-pattern extractor hooked into sync-agro-news inline. `backfill-norms-from-news.js` for historical reprocessing. **First run found Provimento 216/2026 in the live DB.** | 2026-04-08 |
| **24D-historical** | **Full CVM walk.** `backfill-cvm-historical.js` walked all 868 docs (inst001..627 + resol001..241), surfaced 5 additional historical agro-relevant CVM Resoluções (165, 175, 184, 214 + Instrução 422 + 600). CVM body count: 1 → 6. | 2026-04-08 |
| **24G** | **Diretório CRM build-out.** Migrations 040 + 041. **Slice 1 — Confidentiality enforcement:** new `src/lib/confidentiality.ts` (`ConfidentialityTier` type, `visibleTiers()`, `resolveCallerTier()`, `tierFilter()`). Migration 040 drops + recreates `match_knowledge_items` RPC with `filter_confidentiality text[] DEFAULT ['public']` arg (fail-closed). `/api/knowledge/chat` resolves caller tier and passes visible tiers to the RPC — chat can no longer leak `agrisafe_confidential` rows to anonymous sessions. **Slice 2 — CRM tables:** migration 041 adds `key_persons` (16 cols), `meetings` (14 cols), `leads` (15 cols), all defaulting to `agrisafe_confidential`, anchored to `legal_entities.entity_uid`, with updated_at triggers + RLS. `leads.linked_campaign_id` FKs to existing `campaigns` so a lead generated by Central de Conteúdo can be tracked. New `/api/crm/key-persons`, `/api/crm/meetings`, `/api/crm/leads` CRUD endpoints. New `EntityCrmPanel.tsx` (collapsible 3-section panel: Pessoas-chave / Reuniões / Pipeline with inline add forms + stage progression dropdown). Mounted in both directories. **Slice 3 — Street View tile:** new `StreetViewTile.tsx` probes Google Street View Metadata API first (free, never burns Static API quota on rural addresses with no panorama coverage), then renders 480×260 static image. Mounted in both directories for any matriz with lat/lng. Smoke-tested all 3 endpoints + chat tier filter against live DB. | 2026-04-08 |
| **24G2** | **Marco Reg fixes + Activity Log.** **Marco Reg slice:** (a) tightened `BODY_AGRO_PATTERN` in `sync-cvm-agro` — dropped loose `fundo.*agro` clause and required precise FIAGRO/CRA/agro-context matches. (b) Fixed CVM date extractor — was returning `today` for `cvm-422`/`cvm-175` because the regex only knew "DD de MONTH de YYYY" and ISO formats, but CVM legacy HTML uses `DD/MM/YYYY` right after the title. New 3-pass extractor cuts the body at footer markers first, then DD/MM/YYYY → "DD de MONTH de YYYY" → ISO with year-range validation. Reran the historical backfill — all 6 CVM rows now have correct dates (cvm-422 → 2005-09-08, cvm-175 → 2022-12-23, etc). (c) Migration 042 adds `regulatory_norms.affected_cnaes text[]` + GIN index. New `src/lib/cnae-classifier.ts` (18 deterministic regex rules → IBGE 7-digit CNAE codes). Wired into 6 paths: `regulatory/upload`, `sync-cvm-agro`, `sync-cnj-atos`, `sync-bcb-rural`, `sync-key-agro-laws`, `extract-norms-from-news`. Backfilled 11/16 existing rows. **Activity Log slice:** Migration 043 adds `activity_log` table (`action`, `target_table`, `target_id`, `source`, `source_kind`, `actor`, `summary`, `metadata` jsonb, `confidentiality`). New `src/lib/activity-log.ts` fail-soft helper (`logActivity` + `logActivityBatch`). Hooked into 8 write paths: `regulatory/upload`, `rj-add`, `crm/key-persons`, `crm/meetings`, `crm/leads`, **`runScraper()` wrapper** (covers all 9 scrapers in one shot), `sync-agro-news` norm extractor, `reading-room/ingest`. New `/api/activity` read endpoint (filter by `source_kind`/`target_table`/`source`, tier-aware). New `ActivityLogPanel.tsx` mounted in Settings — three filter chip rows (origem/tabela/ação) with active-filter pills, paginated feed, color-coded by source_kind, relative time stamps. Smoke-tested end-to-end: regulatory upload + activity feed both green. | 2026-04-09 |
| **24G2 follow-up** | **Activity log coverage closure.** Wired `logActivity` into all 9 cron routes that were still on legacy `logSync` only (sync-market-data, sync-regulatory, sync-recuperacao-judicial, sync-events-na, sync-competitors, sync-retailer-intelligence, sync-industry-profiles, sync-prices-na, archive-old-news) **and** 4 manual API endpoints (`/api/retailers/update`, `/api/company-notes`, `/api/analysis-lenses`, `/api/cnpj/establishments`). Settings → Registro de Atividade panel now surfaces every cron run + manual edit; coverage of "every write across the system" reached ~100%. | 2026-04-09 |
| **25** | **Mac-as-server cron pipeline (launchd).** Liberates ingestion from Vercel Hobby's one-cron-per-day limit. Every cron route extracted into a framework-agnostic `src/jobs/*.ts` module that can be invoked from BOTH the existing Next.js cron route AND a new launchd-friendly CLI dispatcher on a 24/7 Mac mini. **Files shipped:** 19 job modules + `src/jobs/types.ts` (shared `JobResult`) + `src/lib/scraper-job-runner.ts` (adapter that wraps `runScraper()` + upsert into a `JobResult`) + `src/scripts/cron/run-job.ts` (generic dispatcher: `npm run cron <job-name>`) + 19 cron route refactors (each shrunk from 70-385 lines down to ~25-35) + `launchd/jobs.json` (source-of-truth for schedules) + `launchd/generate-plists.js` (jobs.json → 19 .plist files) + `launchd/install.sh` (idempotent installer with `--reload` / `--uninstall` / `--dry-run`, smoke-tests sync-scraper-healthcheck, substitutes REPLACE_ME placeholders) + `launchd/README.md` (full ops manual: Quickstart, sleep prevention, Tailscale, log rotation, troubleshooting). **Bundled scope:** entity-matcher pass added inline to `sync-events-na`, `sync-regulatory`, `sync-recuperacao-judicial` job modules during the extraction (closes the "wire entity-matcher into more scrapers" backlog item). **Net diff:** -3,626 lines in routes, +5,972 lines in jobs/launchd infra. TypeScript clean. | 2026-04-09 |
| **25 backlog** | **Close-the-loop batch.** (a) **CRM PATCH/DELETE → activity_log.** All 6 mutation paths in `/api/crm/{key-persons,meetings,leads}` now log to activity_log; POST was already wired in 24G2. (b) **Backfill scripts → activity_log.** 4 backfill scripts (`backfill-cnpj-establishments.js`, `backfill-norms-from-news.js`, `backfill-cvm-historical.js`, `geocode-events.js`) now write a single summary row at end of run via supabase JS client (cnpj) / pg client (others) / PostgREST (geocode-events). (c) **Migration 044: norms × entities view.** New `v_norms_affecting_entity` (per-row) + `v_norm_entity_counts` (aggregated) joining `regulatory_norms.affected_cnaes` ANY-OF `legal_entities.primary_cnae`, both `security_invoker=on`, plus a partial btree index on `legal_entities.primary_cnae`. New `/api/regulatory/affected-entities` read endpoint with `?norm_id=` drilldown. | 2026-04-09 |
| **25 source CRUD** | **Ingestão de Dados — full Source CRUD UI.** The last open item from `documentation/TODO_2026-04-06.md`. (a) **Migration 045** adds `data_sources` table mirroring the JSON shape 1:1 + 4 new columns (`active`, `confidentiality`, `created_at`, `updated_at`). CHECK constraint on `url_status` enum, indexes on category/url_status/active/used_in_app, RLS public read, updated_at trigger. (b) **`seed-data-sources.js`** one-shot upsert from `source-registry.json` (176 entries) → `data_sources` table, idempotent, logs to activity_log. (c) **`/api/data-sources`** full CRUD: GET (list with filters + paging past PostgREST 1000-cap), POST (auto-generates id for manual entries), PATCH (with `_cron_update` flag for the healthcheck), DELETE (soft by default; hard-delete only for `origin_file='manual'`). All mutations log to activity_log. (d) **`SourceFormModal.tsx`** bilingual add/edit modal with name/url/category/frequency/data_type/description/notes + 3 toggles. (e) **`DataSources.tsx`** surgical refactor (1348 → 1452 lines): top-level const → `STATIC_REGISTRY_FALLBACK`, lifted into `useState`, fetched from `/api/data-sources` on mount, threaded as a prop into `RegistryTab` + `QualityTab`. New "Adicionar Fonte" button + "Live table"/"Static fallback" badge + refresh button. Pencil + Trash icons appear on row hover in `EndpointDetail`. Modal mounted at the bottom of RegistryTab. (f) **`sync-source-registry-healthcheck`** — new 20th launchd cron (Sunday 10:00 local). Probes all 176 URLs at 8 concurrent workers, updates `url_status`/`http_status`/`last_checked_at` per row via the supabase client (skipping per-row activity_log noise), then writes ONE summary row with newly-broken count. The JSON file stays as the seed-data audit trail and as the static fallback if the API errors out. | 2026-04-09 |
| **27 (UI)** | **Source registry health check (one-shot).** `check-source-registry.js` probed all 176 entries. Result: 125 active / 25 inactive / 24 error / 2 unchecked. Ingestão de Dados KPI strip now reflects real data instead of "166 unchecked". (Superseded by the Phase 25 weekly cron, but the script is still used for one-shot dev runs.) | 2026-04-08 |

---

## Active Backlog (what's still open)

Items grouped by intent. Priority order within each group is roughly decreasing.

### Marco Regulatório / Compliance

- **CNAE classifier on insert** — ✅ **DONE 2026-04-09** (Phase 24G2). Mig 042 + `src/lib/cnae-classifier.ts` wired into 6 paths.
- **CVM date-extractor fix** — ✅ **DONE 2026-04-09** (Phase 24G2). 3-pass extractor (DD/MM/YYYY → "DD de MONTH de YYYY" → ISO) + footer-marker cut.
- **Tighten CVM agro pattern** — ✅ **DONE 2026-04-09** (Phase 24G2). Dropped `fundo.*agro`; required precise FIAGRO/CRA/agro-context matches.
- **`affected_cnaes` → `legal_entities` JOIN view** — ✅ **DONE 2026-04-09** (Phase 25 backlog). Migration 044 adds `v_norms_affecting_entity` + `v_norm_entity_counts`. Read endpoint `/api/regulatory/affected-entities`. UI badge wiring still pending — surface "X empresas afetadas" in the Marco Reg list.
- **UI badge for `affected_entity_count`** — surface the new view's count in the Marco Regulatório list rows + drilldown modal.

### Ingestão de Dados

- **Source CRUD UI** — ✅ **DONE 2026-04-09** (Phase 25 source CRUD). Migration 045 + `data_sources` table + `seed-data-sources.js` + `/api/data-sources` REST endpoint + `SourceFormModal` + DataSources.tsx refactor with Add/Edit/Delete on row hover.
- **Per-source enable/disable toggle** — ✅ **DONE 2026-04-09** (Phase 25). `data_sources.active` column + soft-delete via DELETE endpoint + Active toggle in the form modal.
- **Source registry periodic re-check cron** — ✅ **DONE 2026-04-09** (Phase 25 source CRUD). `sync-source-registry-healthcheck` runs Sunday 10:00 local on launchd, updates the table per row, writes a single summary `activity_log` row with newly-broken count.
- **Walk all 600 CVM inst###.html** — ✅ **DONE 2026-04-08** via `backfill-cvm-historical.js`.

### Pulso de Mercado

- **USDA PSD scrapers** — oilseeds (3.7 MB) + grains_pulses (2.7 MB) + cotton (459 KB) ZIPs all alive. Need a ZIP-CSV parser dep (`yauzl` or equivalent). Marginal value over FAOSTAT but adds country-level production/exports forecasts.
- **OECD-FAO Agricultural Outlook xlsx** — URL changes annually, data is forward-projection. Skip until/unless the user explicitly asks for forecast data.
- **MDIC ComexStat scraper** — Brazilian export volumes/values by HS code. The probe in Phase 24E showed comexstat.mdic.gov.br is alive but layout needs analysis.
- **CONAB safra monthly reports** — Brazilian production by state and crop.
- **FAOSTAT QL livestock domain** — boi-gordo coverage (currently mock).

### Inteligência de Insumos

- **State sources** — per-state secretaria de agricultura lists for products approved at state level. Schema is ready (`industry_products.source_dataset` enum has `state_secretaria_*` slots). Priority states: MT, MS, GO, PR, RS, SP, MG, BA. Needs URL + selector verification per state.
- **Manufacturer backfill** — walk distinct AGROFIT `titular_registro` values that don't match any pre-existing `industries` row, propose new entries.
- **Real price data** — v0 Oracle uses `holder_count` as a proxy for "cheaper alternative". A real price comparison needs scraping retailer price tables.
- **Region awareness** — kicks in once state secretariat scrapers ship.

### Diretório (CRM build-out — Phase 24G shipped, follow-ups remain)

- **Companies expanding operations** — query Receita Federal `crawlers.cnpj_estabelecimentos` for recently opened CNPJs in agribusiness CNAEs by region. **DEFERRED** — needs `CRAWLERS_DATABASE_URL` env var design + user authorization for Vercel pulling from external DB on a schedule.
- **OneNote import for meetings** — `meetings.source = 'onenote_import'` enum value already reserved. Needs MS Graph API auth flow + file format reverse-engineering. **DEFERRED** to its own session.
- **Newsletter / WhatsApp / email send-out** — `leads.linked_campaign_id` FK to `campaigns` already in place; lead can be tagged with a campaign. Actual channel send-out needs WhatsApp Business API / SendGrid integration. **DEFERRED**.
- **Per-company enrichment basics** — ✅ **DONE 2026-04-08** (Phase 24G slice 2 + 3): `key_persons`, `meetings`, `leads` tables + `EntityCrmPanel` + `StreetViewTile` mounted in both directories.
- **3-tier confidentiality enforcement at query level** — ✅ **PARTIAL** (Phase 24G slice 1): chat / RAG path is filtered via mig 040 + `src/lib/confidentiality.ts`. CRM endpoints still service-role for now (UI is the gate). Add tier filtering to `/api/crm/*` reads when multi-user RBAC ships.
- **Knowledge Base + chat tier-aware filtering** — ✅ **DONE 2026-04-08** (Phase 24G slice 1).
- **CRM update/delete activity logging** — ✅ **DONE 2026-04-09** (Phase 25 backlog). All 6 PATCH/DELETE handlers in `/api/crm/{key-persons,meetings,leads}` now log to activity_log alongside the existing POST hooks.
- **Backfill scripts log to activity_log** — ✅ **DONE 2026-04-09** (Phase 25 backlog). 4 scripts (`cnpj-establishments`, `norms-from-news`, `cvm-historical`, `geocode-events`) write a final summary row.
- **`client_confidential` tier rollout** — defined in the enum and helper but unused. Activate when partner-NDA workflow lands.

### Knowledge / RAG / Webapp

- **MCP server** that exposes the knowledge base to Claude / GPT / other LLM agents.
- **RAG endpoint with confidentiality-tier-aware filtering** — ✅ **DONE 2026-04-08** (Phase 24G slice 1). Mig 040 added `filter_confidentiality` to `match_knowledge_items` RPC; `/api/knowledge/chat` resolves caller tier and passes visible tiers.
- **Daily executive briefing** generated from the knowledge base.
- **Anomaly narratives** when MarketPulse detects rupture (`Math.abs(change) > 2 * stddev`).
- **Webapp build** — same UI as the Next.js app but with a permanent chat panel always available.
- **Cron-driven LLM agents** — scan news/events for entity mentions and enrich the knowledge base.

### Eventos Agro (Phase 23B)

- **App Campo integration** — mobile-side API contract pending.
- **Geocoding backfill** — populate `events.latitude`/`longitude` for the existing 47 rows so the Dashboard map plots them. Reuse `geocode-retailers.js` 3-tier pattern.
- **`organizer_cnpj` linking** — when a scraper finds a CNPJ in the event description, route through `ensureLegalEntityUid()`.
- **baldebranco scraper** — only revisit if (a) page becomes structured or (b) user authorizes a manual one-shot LLM extractor with human review.

### Cleanup / Tech debt

- **Drop legacy `cnpj_raiz` / `cnpj_basico` text columns** once nothing reads them.
- **Wire entity-matcher into 3 more cron paths** — ✅ **PARTIAL** (Phase 25 bundled scope). `sync-events-na`, `sync-regulatory`, `sync-recuperacao-judicial` job modules now load matchable entities once + write entity_mentions per row. `archive-old-news` is still pending — but its source rows in agro_news already have mentions written by sync-agro-news, so this is low priority.
- **Refresh `KnowledgeMindMap.tsx` "current state" view** — the future-state nodes shown there are now real, not aspirational.
- **Migrate the remaining `cnpj_raiz` reads** in RetailersDirectory.tsx, RegulatoryFramework.tsx, RecuperacaoJudicial.tsx, CompetitorRadar.tsx to `entity_uid`.
- **Migrate `sync-events-na` to `runScraper()`** — currently still on `logSync()` + `logActivity` direct calls. Lower priority now that the job module pattern from Phase 25 already gives uniform telemetry via the dispatcher.

### Polish (Phase 30)

- Sentry error monitoring · WCAG 2.1 accessibility · Dark mode toggle · Ctrl+K command palette · CSV/PDF export per module · Institutional PDF executive briefing format.

---

## Reference

### Cron pipeline (Phase 25: 20 jobs, Mac launchd primary + Vercel fallback)

Each cron route is **also** a launchd job on the Mac mini server (Phase 25). The Mac runs each job on its own schedule via [`launchd/jobs.json`](launchd/jobs.json); the Vercel `/api/cron/X` endpoints stay alive as manual triggers and as a fallback. Both call the same `src/jobs/X.ts` module — see [launchd/README.md](launchd/README.md) for the install path.

**Frequent (StartInterval, every 30min–4h):**
1. `sync-market-data` — BCB SGS → `commodity_prices`, `market_indicators` — every 30min
2. `sync-agro-news` — 5 RSS feeds → `agro_news` (+ entity-matcher + Phase 24F norm extractor → `regulatory_norms`) — every 2h
3. `sync-recuperacao-judicial` — 2 legal RSS → `recuperacao_judicial` (+ Phase 25 inline name matcher) — every 4h
4. `sync-regulatory` — 3 legal RSS → `regulatory_norms` (+ Phase 25 inline name matcher) — every 4h
5. `sync-prices-na` — Notícias Agrícolas regional prices (currently a stub) — every 1h

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
15. `sync-events-agroadvance` — annual AgroAdvance list → `events` — Sunday 05:00
16. `sync-cvm-agro` — CVM legislacao walker → `regulatory_norms` — Sunday 06:00
17. `sync-bcb-rural` — curated BCB landing-page catalog → `regulatory_norms` — Sunday 07:00
18. `sync-key-agro-laws` — Lei CPR / Falências / Nova Lei do Agro seed → `regulatory_norms` — Sunday 08:00
19. `sync-worldbank-prices` — World Bank Pink Sheet xlsx → `macro_statistics` — Sunday 09:00
20. **`sync-source-registry-healthcheck`** — Phase 25 source CRUD. Probes all 176 entries in `data_sources`, updates per-row status, summarizes newly-broken in activity_log — Sunday 10:00

The legacy `/api/cron/sync-all` orchestrator still works as a "run everything now" Vercel trigger but is no longer the only cron entry — the Mac handles the schedule.

### Database tables (live)

**Core 5-entity model (Phase 17A — migrations 018-019)**
- `legal_entities` (9,674) · `entity_roles` (9,609) · `entity_mentions` (143)
- `farms` · `assets` · `commercial_activities` · `agrisafe_service_contracts` (all 0 — empty until ingestion)
- `groups` · `group_members` · `farm_ownership` · `asset_parties` · `agrisafe_service_targets` (junctions)

**Public-data layer**
- Channels: `retailers` (9,328) · `retailer_locations` (24,275) · `cnpj_establishments` (1,699)
- Industries: `industries` (18 curated, 256 imported via entity_roles) · `industry_products` (growing) · `retailer_industries` (392) · `active_ingredients` · `industry_product_uses` · `industry_product_ingredients`
- Risk: `recuperacao_judicial` (131)
- News + content: `agro_news` (203) · `news_sources` (6+) · `news_knowledge` · `knowledge_items` · `published_articles` (6) · `content_topics` (5) · `competitors` (7) · `competitor_signals` (13)
- Regulatory: `regulatory_norms` (16 with `affected_cnaes` from Phase 24G2: CVM 6 + BCB 6 + CONGRESSO 3 + CNJ 1)
- Macro: `commodity_prices` (6) · `commodity_price_history` · `market_indicators` (6) · `macro_statistics` (96: WB 90 + USDA 6) · `commodity_prices_regional`
- Events: `events`
- Enrichment: `company_enrichment` · `company_notes` · `company_research` (with `analysis_type` column from Phase 24B)
- **CRM (Phase 24G):** `key_persons` · `meetings` · `leads` (all default `agrisafe_confidential`, FK → legal_entities)
- Config: `analysis_lenses` (3: retailer, industry, generic) · **`data_sources` (176 entries — Phase 25 source CRUD)**
- Telemetry: `scraper_registry` (9 healthy) · `scraper_runs` · `scraper_knowledge` · `sync_logs` · **`activity_log` (Phase 24G2 — every write across the system, ~100% coverage after Phase 25 backlog batch)**

**Views (rebuilt in Phase 17B/17E with `security_invoker=on`)**
- `v_retailer_profile` — retailer + RF enrichment + intelligence in one row
- `v_retailers_in_rj` — retailers ∩ RJ (powers RiskSignals)
- `v_entity_profile` — canonical "everything I know about entity X"
- `v_oracle_brand_alternatives` — Oracle substitution view (Phase 20A)
- **`v_norms_affecting_entity`** — per-row join of `regulatory_norms.affected_cnaes` × `legal_entities.primary_cnae` (Phase 25 backlog, migration 044)
- **`v_norm_entity_counts`** — aggregated count per norm; powers the future "X empresas afetadas" badge in Marco Reg

### Sidebar structure (current)

```
Painel (Executive Overview)

INGESTÃO DE DADOS
  Fontes de Dados (176 sources in data_sources table, Source CRUD, Saúde dos Scrapers tab, weekly auto-healthcheck)

INTELIGÊNCIA DE MERCADO
  Pulso do Mercado          (BCB + NA + Yahoo + FAOSTAT + WB Pink Sheet)
  Inteligência de Insumos   (Oracle)
  Radar Competitivo         (CRUD + Harvey Ball)
  Notícias Agro             (CRUD + Reading Room)
  Eventos Agro              (AgroAgenda + AgroAdvance + AI enrich)

DIRETÓRIO
  Diretório de Canais       (CRM-style)
  Diretório de Indústrias   (list + map + filiais)

MARKETING & CONTEÚDO
  Central de Conteúdo

REGULATÓRIO
  Marco Regulatório         (16 norms + insert + sources modal)
  Recuperação Judicial      (131 cases + add CNPJ + DDG debt scrape)

BASE DE CONHECIMENTO
  Busca Semântica
  Mapa de Conexões

CONFIGURAÇÕES
  Lentes de Análise (editable prompts) · Reading Room install · Help
```

---

## Strategic Vision

Market Hub is **not just a dashboard** — it is the knowledge engine of the AgriSafe ecosystem:

1. **Data is ingested** algorithmically from public sources (176 catalogued, ~125 active) — **no LLM scraping**
2. **Knowledge is organized** around the 5 core entities and the 4 confidentiality tiers
3. **Insights are generated** by cross-referencing entities (e.g. `v_retailers_in_rj` revealed R$ 582.6M of distressed channels)
4. **Content is created** — LinkedIn articles, campaigns, positioning — feeding back into the AgriSafe brand
5. **The brain is built** — RAG structure that becomes AgriSafe's digital twin, accessible via a webapp chat interface

The platform serves multiple AgriSafe products downstream:
- **Admin Portal** — credit risk, commercial intelligence
- **App Campo** — field sales agenda, client visits, calendar from Eventos Agro
- **Newsletter / WhatsApp outreach** — driven by Central de Conteúdo + CRM leads from Diretório de Canais
- **External chat** (planned) — webapp UI with permanent chat panel over the knowledge base, RAG with tier-aware permissions

---

## Hard Guardrails (non-negotiable)

See `CLAUDE.md` for the full text.

1. **Algorithms first, LLMs last** — every "extract from page" or "match a CNPJ" task uses regex/Cheerio/SQL, never an LLM. LLMs are reserved for prose generation and chat.
2. **Everything links to the 5 entities** — every new table either FKs to one of the 5 nodes or writes to `entity_mentions`.
3. **Public data only** — client PII / financial records / proprietary data are tagged via the `confidentiality` enum and never live in the public layer.
4. ~~**Single Vercel cron** (Hobby plan limit) — `sync-all` consolidates all jobs.~~ **Lifted in Phase 25**: 20 cron jobs now run on a Mac mini via launchd, each with its own schedule. The Vercel cron route is kept as a fallback / manual trigger but is no longer the schedule source. See [launchd/README.md](launchd/README.md).
5. **Bilingual always** — every UI string in PT-BR + EN via `src/lib/i18n.ts`.
6. **MockBadge required** when a section falls back to mock data.
