# AgriSafe Market Hub — Roadmap

> **Last updated:** 2026-04-28 — **All planned work complete. ✓**
> Phases 1–7 shipped. Active backlog items (Ctrl+K, CSV export, Knowledge Agents) landed. 9 new backlog items added (§4.3). Remaining items are optional enhancements with no committed timeline.
>
> 4 verticals · 15 modules · 64 tables · 75 migrations · 33 cron jobs (smart orchestrator) · 9 MCP tools · 176 data sources
> For phase history, see git log. For setup, see `.env.example`. For ops, see [`launchd/README.md`](launchd/README.md). For hard rules, see [`CLAUDE.md`](CLAUDE.md).

---

## 1. What's Live

| Area | Key Numbers |
|------|-------------|
| 5-entity model | 9,818 legal_entities · 9,609 roles · 143 mentions |
| Diretório de Canais | 9,328 retailers · 24,275 geocoded locations · CRM panel + Street View |
| Diretório de Indústrias | 274 industries · 1,699 geocoded establishments · industries chat → Oracle redirect |
| Instituições Financeiras | 3,026 FIs (631 SICOR banks/coops + 2,395 CVM FIDC/FIAGRO) · 223 MCR regulatory sections · SCR inadimplência sparkline · paginated list with SICOR/Active filters · Financiadores cross-ref in Canais/Indústrias |
| Marco Regulatório | 16 norms · CNAE classification · "X empresas afetadas" badge · summary section |
| Recuperação Judicial | 131 cases · manual CNPJ add · cards styled collapsible (detail render pending) |
| Pulso de Mercado | BCB SGS · NA prices · Yahoo futures · FAOSTAT · WB Pink Sheet · CONAB · USDA PSD · MDIC · Preços de Insumos tab (DAP/TSP/Urea/KCl/Phosphate Rock from WB) |
| Inteligência de Insumos | Oracle UX + 800 AGROFIT products · 40 canonical inputs (AMIS) · Pacote/Indústria/Mapa tabs · visual mindmap (SVG) |
| Notícias Agro | 203 articles · 5 RSS feeds · Reading Room Chrome extension |
| Eventos Agro | AgroAgenda + AgroAdvance unified · per-event AI enrichment |
| Central de Conteúdo | Article pipeline + `published_article_links` · "Sugerir Artigos" button in UI |
| Executive Briefing | Daily 08:00 Gemini summary · price anomaly detection (rolling 2-sigma) |
| Base de Conhecimento | Merged search + mind map tabs · persistent Oracle chat FAB (shell only) |
| App Campo API | API-key mgmt (SHA-256) · access logs · Settings panel (playbook + keys + logs) |
| Cron pipeline | 25 jobs on Mac mini via smart orchestrator (2 launchd agents) |
| MCP server | 9 tools (stdio-based, `npm run mcp`) |
| Data Ingestion | 176 sources (125 active) · Source CRUD UI · weekly healthcheck |
| Auth + deploy | Supabase Auth + SSR · Vercel webapp + Mac mini cron |

---

## 2. Guardrails (summary)

Algorithms first, LLMs last. Vertex AI only (never Gemini free tier). Everything links to the 5-entity model (FK or `entity_mentions`). Public layer holds only public data; `confidentiality` enum gates the rest. Bilingual PT-BR/EN always; MockBadge on any mocked section. Full text in [`CLAUDE.md`](CLAUDE.md).

---

## 3. Roadmap — 7 phases (all done ✓)

All planned phases shipped between 2026-04-15 and 2026-04-16. The sections below are preserved as a changelog.

### Phase 1 — Dashboard bug pass  **[DONE ✓ 2026-04-15]**

- ~~**1a Unit/cacao KPI bug**~~ — ✓ `topMover` now carries `unit`/`isPercent` from API; formats correctly for pts vs %.
- ~~**1b Indústrias KPI indicator + modal**~~ — ✓ New Industries card + ChapterModal case (last 30d updates).
- ~~**1c Scrapers KPI rewrite**~~ — ✓ KPI shows "N active · M broken · K stale" with tooltip; modal lists all broken/stale with "Reprocessar" button + scraper file link.
- ~~**1d Diretório de Canais curation filter**~~ — ✓ 3 chip toggles (curated/client/lead) in RetailersDirectory, wired to company_notes + onenote-import + entity_roles + leads.
- ~~**1e Summit Brazil Super Foods 2026 map check**~~ — ✓ Verified: event has valid coords (-15.57, -56.08), correctly filtered as past event (ended 2026-04-13).

### Phase 2 — New ingestion sources  **[DONE ✓ 2026-04-15]**

- ~~**2a MFrural weekly scraper**~~ — ✓ `sync-mfrural-fertilizers` built (Cheerio, DAP/MAP/KCl/Urea per-region, median BRL/t). Registered in orchestrator, Sunday.
- ~~**2b USDA agtransport scraper**~~ — ✓ `sync-usda-agtransport` built (SODA API, 11 US regions, 3yr monthly). Registered in orchestrator, Sunday.
- ~~**2c WB Pink Sheet tagging**~~ — ✓ Verified: all 5 fertilizers (DAP/TSP/Urea/KCl/Phosphate Rock) tagged `category:'fertilizer_price'`, surfaced in Pulso "Preços de Insumos" tab. MAP not available in WB source.
- ~~**2d AgRural event source**~~ — ✓ `sync-events-agrural` built (Cheerio, Encontro de Mercado + Palestras pages, entity-matcher). Registered in orchestrator, Sunday.
- ~~**2e Serasa RJ backfill**~~ — ✓ Migration 069 (`debt_value_source` column) applied. UI chip on RJ cards. Backfill script ready at `src/scripts/backfill-serasa-rj.ts` — **pending Serasa CSV files from other machine**.

### Phase 3 — Painel map completeness  **[DONE ✓ 2026-04-15]**

- ~~**3a Subsidiary markers**~~ — ✓ Purple markers for new branches (30d) from `cnpj_establishments`. Click shows CNPJ + entity link. New `/api/map/markers` endpoint.
- ~~**3b Entity-attached news markers**~~ — ✓ Teal markers with jitter for co-located entities. Click shows headline + date + entity link. 90d recency window.
- ~~**3c Marker-type extension**~~ — ✓ `MarkerType` extended with `subsidiary_new` + `news_attached`. Layer toggles with counts, distinct colors/icons, respects existing date/UF/city filters.

### Phase 4 — AI-assisted input flows  **[DONE ✓ 2026-04-15]**

- ~~**4a Competitor URL paste + AI categorize**~~ — ✓ URL field in Add-Competitor modal. Paste triggers `/api/competitors/enrich-web` (Cheerio + Vertex AI). Pre-fills name/segment/summary/hq_city/main_lines. User edits before save.
- ~~**4b Notícias Agro manual upload**~~ — ✓ "Adicionar Notícia" button + modal in AgroNews. POSTs to `/api/reading-room/ingest` with `source='manual_ui'`. Note: requires `NEXT_PUBLIC_READING_ROOM_SECRET` env var.
- ~~**4c News → Directory enrichment**~~ — ✓ "Enriquecer Diretório" button per article card. New `/api/news/propose-enrichment` uses entity-matcher first, Vertex AI fallback. Confirmation modal with per-proposal accept/reject. Writes to `entity_mentions` + `entity_roles`.
- ~~**4d Event URL paste + AI parse + location confirm**~~ — ✓ "Colar URL" field in EventFormModal. New `/api/events/parse-url` (Cheerio-first, 6 date regex patterns, BR location extraction, Vertex AI fallback). LocationConfirmModal shows Google Static Maps pin after save.

### Phase 5 — Inteligência de Insumos rebuild  **[DONE ✓ 2026-04-16]**

- ~~**5a Extract canonical products from Ivan's PDF**~~ — ✓ 40 products extracted from AMIS 19/20 soybean analysis into seed CSV (`src/data/culture-canonical-inputs.csv`). 7 categories: fungicida_premium, fungicida_multissitio, inseticida_percevejo, inseticida_lagarta, herbicida_seletivo, herbicida_dessecacao, tsi.
- ~~**5b Data model**~~ — ✓ Migration 074 (`culture_canonical_inputs` table) + seed script with industry UID resolution.
- ~~**5c Tab diagnosis + fix**~~ — ✓ Fixed broken Soils tab (SmartSolos API deprecated — disabled with offline badge). Added error handling to getSoilExpertProfiles.
- ~~**5d/5e Pacote de Insumos + Show Alternatives**~~ — ✓ New "Pacote de Insumos" tab with category-grouped products and "Show Alternatives" → Oracle navigation.
- ~~**5f Industry → products pivot**~~ — ✓ New "Indústria × Produtos" tab with 2-column manufacturer pivot.
- ~~**5g Mindmap view**~~ — ✓ New "Mapa de Insumos" tab with hierarchical SVG graph (culture → category → product → industry/molecule). Hover highlighting, category color-coding, leader badges. Pure SVG, no extra dependencies.

### Phase 6 — Knowledge & content depth  **[DONE ✓ 2026-04-16]**

- ~~**6a AgriSafe Oracle persistent shell**~~ — ✓ Page-context capture (module + entity) in system prompt. Citation chips with tier-colored indicators + clickable links. KnowledgeBase tabs consolidated (Busca + Mapa → Knowledge Graph). Weekly `sync-oracle-insights` job clusters low-confidence prompts into knowledge-gap backlog.
- ~~**6b Central de Conteúdo suggestion engine**~~ — ✓ `/api/content/suggest-topics` reads 14d signals (news, norms, RJ, price anomalies, entity clusters), generates 5–10 ranked LinkedIn angles via Vertex AI. Pipeline-status sweep auto-flips published items. "Sugerir Tópicos" button + modal in ContentHub.
- ~~**6c Briefing do Dia themed lens**~~ — ✓ Migration 071 (`theme` column + `daily_themed_briefing` lens seed). Rotating themes Mon–Sun. Anti-repetition memory reads prior 7 days. Theme badge on ExecutiveBriefingWidget. Activated via `?lens=daily_themed_briefing`.
- ~~**6d Marco Regulatório wrap-up + freshness**~~ — ✓ `/api/regulatory/refresh` triggers 4 regulatory jobs on demand. Migration 072 (`regulatory_digests` table). Weekly `sync-regulatory-digest` job generates bilingual Vertex AI digest with citations. "Resumo Regulatório" panel + "Atualizar Agora" button in RegulatoryFramework.
- ~~**6e RJ card detail + debt-source chip**~~ — ✓ Expandable `RJDetailPanel` with full fields (case, court, debt, filing date, debt_value_source chip). Linked news via entity_mentions → agro_news join.
- ~~**6f Meeting reclassification panel**~~ — ✓ Settings → "Reclassificar Importações" panel. `/api/entities/reclassify` endpoint. Migration 073 (expands entity_roles CHECK for `financial_institution`). Batch role reassignment with `logActivity()`.

### Phase 7 — Instituições Financeiras (FIs) deep build  **[DONE ✓ 2026-04-16]**

- ~~**7a SICOR eligible-IF import**~~ — ✓ `seed-sicor-ifs.ts` parses BACEN SICOR CSV (Latin-1, 631 rows). Migration 075 (`is_sicor_eligible` + `sicor_segment` + unique cnpj index). All 631 entities resolved + `financial_institution` role added. Breakdown: 554 cooperative banks, 67 banks, 10 development banks.
- ~~**7b BACEN MCR ingestion**~~ — ✓ `seed-mcr.ts` parses 376-page MCR PDF via `pdf-parse`, splits by SEÇÃO headers into 223 sections across 6 chapters. Each section written to `regulatory_norms` (body=BCB, norm_type=manual) + `knowledge_items` (tier=1, tags=MCR) for Oracle RAG. BCB decommissioned www3.bcb.gov.br/mcr; used offline PDF instead.
- ~~**7c SCR inadimplência series**~~ — ✓ `sync-bcb-scr-inadimplencia` job fetches 3 BCB SGS series (21082 total, 21136 rural PJ, 21148 rural PF) × 20 months → `macro_statistics`. Cron route + job runner registered. Monthly data, same API as `sync-market-data`.
- ~~**7d CVM fund inventory**~~ — ✓ `sync-cvm-funds` job downloads CVM `cad_fi.csv` (open data, ~20MB), filters FIDC/FIAGRO + agro-mandate FI funds. 2,549 funds upserted into `financial_institutions` with entity resolution. Cron route + job runner registered.
- ~~**7e FI module UI**~~ — ✓ `FinancialInstitutions.tsx` rebuilt: paginated list (40/page) for 3,026 institutions, SICOR + Active toggle chips, type/UF/search filters, clickable KPI strip (6 cards), SCR inadimplência sparkline chart, expandable per-FI detail panel with CNPJ, BCB code, SICOR eligibility, segment, patrimônio líquido, notes, MCR citation chips.
- ~~**7f Financiadores cross-ref tab**~~ — ✓ New `FinanciadoresSection` in `EntityCrmPanel` — shows SICOR-eligible banks and cooperatives. Mounted on both Diretório de Canais and Diretório de Indústrias expanded panels.

---

## 4. Backlog

### 4.1 Completed backlog (shipped)

- ~~**Ctrl+K command palette**~~ ✓ 2026-04-16 — keyboard-driven navigation across all 16 modules, search by title/keywords (PT+EN), 4 grouped sections.
- ~~**CSV export**~~ ✓ 2026-04-16 — reusable `src/lib/csv-export.ts` helper (UTF-8 BOM for Excel). Wired to Financial Institutions + Indústrias directories.
- ~~**Knowledge Agents**~~ ✓ 2026-04-16 — weekly `sync-knowledge-agents` job re-runs the algorithmic matcher on news/norms/events that have no `entity_mentions`, catching entities added since original ingest (e.g. 2,549 CVM funds, 631 SICOR banks). `extracted_by='knowledge_agents_v1'`. First run added 22 mentions.

### 4.2 Optional / future enhancements (no committed timeline)

Open items — may or may not be pursued depending on future priorities. All are standalone, none are load-bearing for current workflows.

- **Expansion Detection alerts** — diff on `cnpj_establishments` to surface newly opened branches → daily themed briefing. Blocked on `CRAWLERS_DATABASE_URL` access.
- **CRM RBAC + `client_confidential` tier** — tier infrastructure already exists in [`src/lib/confidentiality.ts`](src/lib/confidentiality.ts). Needs `user_profiles` table + tier-filter layer on `/api/crm/*` reads + Settings UI to assign user → tier. Low ROI until multi-user lands.
- **App Campo push notifications** — FCM/APNs integration + Resend outreach worker + template editor + unsubscribe page. Separate mobile-app effort.
- **Sentry** — error monitoring SDK + DSN setup. Needs external account. Vercel logs cover the basics today.
- **WCAG 2.1 AA audit** — color contrast, keyboard focus rings, ARIA labels on icon buttons, semantic landmarks. Legal/enterprise requirement, 1–2 weeks for full AA conformance.
- **Dark mode** — theme toggle + Tailwind dark variant classes across the codebase.
- **PDF export / institutional PDF briefing** — report generation for directories and daily briefings. Needs a PDF library (jsPDF, pdfkit, or Puppeteer).
- **CSV export — remaining directories** — add Download button to RetailersDirectory (needs server-side export endpoint due to 9,328 rows + server pagination) and MeetingsLog.

### 4.3 New backlog (2026-04-28)

| # | Module | Task | Type | Notes |
|---|--------|------|------|-------|
| 1 | Global UI | **Bell notification icon not working** — upper-right bell does nothing on click | Bug | Investigate handler; wire to notification data or remove placeholder |
| 2 | Recuperação Judicial | **RJ analysis via Receita Federal + Notícias Agro** — no Serasa CSV exists; query RF table in AgriSafe Postgres (situação cadastral) cross-referenced with RJ-related news from Notícias Agro | Redesign | Replaces the "Serasa RJ backfill" blocker — `backfill-serasa-rj.ts` approach is abandoned |
| 3 | Diretórios | **Revise all OneNote files (Renato + Davi)** — audit imported OneNote content for classification, data quality, and duplicates | Manual review | Both Renato's and Davi's exports |
| 4 | Marco Regulatório | **Improve regulatory document type indicators** — better showcase normas, leis, instruções normativas, resoluções, portarias, and other regulatory/legal documents that regulate agribusiness in Brazil | Enhancement | Improve UI to distinguish between document types |
| 5 | Central de Conteúdo | **Major content overhaul** — feed from LinkedIn published posts; LinkedIn newspaper; Instagram posts; automated content creation based on the knowledge base being built in this project | Major feature | Large feature package — needs its own spec/phasing |
| 6 | Log de Reuniões | **Company name matching issues** — meeting log entries don't match to correct company names; needs manual revision | Manual fix + code | May also need entity-matcher improvements for meeting imports |
| 7 | Instituições Financeiras | **Delinquency & defaults charts tab** — new tab with charts of inadimplência and defaults, data downloaded from BCB SGS | New tab | Expands existing SCR inadimplência sparkline (Phase 7c) into a full tab with more series |
| 8 | Notícias Agro | **Update button not working** — clicking the update/refresh button appears to do nothing | Bug | Investigate "Atualizar" handler in `AgroNews.tsx` |
| 9 | Painel | **Persona-based Executive Briefing tabs** — develop tabs in Briefing Executivo based on personas (CEO, Head Comercial, Head Crédito, etc.); test now, eventually send via mailing to subscribers | New feature | Builds on `daily_themed_briefing` lens (Phase 6c), adds persona dimension |

---

## 5. Reference

### Cron pipeline (33 jobs · 2 launchd agents)

Smart orchestrator (`sync-orchestrator`, daily 03:00) probes all sources and skips unchanged. `sync-market-data` runs independently every 30min. See [`launchd/README.md`](launchd/README.md).

**Frequent:**
| Job | Target | Schedule |
|-----|--------|----------|
| sync-market-data | commodity_prices, market_indicators | every 30min |
| sync-agro-news | agro_news + entity_mentions + regulatory_norms | every 2h |
| sync-recuperacao-judicial | recuperacao_judicial | every 4h |
| sync-regulatory | regulatory_norms | every 4h |
| sync-prices-na | commodity_prices_regional (stub) | every 1h |

**Daily:**
| Job | Target | Time |
|-----|--------|------|
| sync-faostat | macro_statistics | 02:00 |
| sync-faostat-livestock | macro_statistics | 02:30 |
| sync-conab-safra | macro_statistics | 03:00 |
| sync-usda-psd | macro_statistics | 03:30 |
| sync-mdic-comexstat | macro_statistics | 04:00 |
| archive-old-news | news_knowledge | 04:00 |
| sync-events-na | events | 06:00 |
| sync-daily-briefing | executive_briefings | 08:00 |
| sync-cnj-atos | regulatory_norms | 09:00 |
| sync-competitors | competitor_signals | 10:00 |
| sync-retailer-intelligence | retailer_intelligence | 11:00 |
| sync-scraper-healthcheck | scraper_registry | 23:00 |

**Weekly (Sunday):**
| Job | Target | Time |
|-----|--------|------|
| sync-industry-profiles | industries | 03:00 |
| sync-agrofit-bulk | industry_products | 04:00 |
| sync-events-agroadvance | events | 05:00 |
| sync-cvm-agro | regulatory_norms | 06:00 |
| sync-bcb-rural | regulatory_norms | 07:00 |
| sync-key-agro-laws | regulatory_norms | 08:00 |
| sync-worldbank-prices | macro_statistics | 09:00 |
| sync-source-registry-healthcheck | data_sources | 10:00 |
| sync-mfrural-fertilizers *(Phase 2a)* | macro_statistics | 11:00 |
| sync-usda-agtransport *(Phase 2b)* | macro_statistics | 11:30 |
| sync-events-agrural *(Phase 2d)* | events | 12:00 |
| sync-bacen-mcr *(Phase 7b)* | regulatory_norms + knowledge_items | 12:30 |
| sync-cvm-funds *(Phase 7d)* | financial_institution_profile + fund_holdings | 13:00 |

**Daily additions from Phase 7:**
| Job | Target | Time |
|-----|--------|------|
| sync-bcb-scr-inadimplencia *(Phase 7c)* | macro_statistics | 04:30 |

**Weekly additions from backlog:**
| Job | Target | Time |
|-----|--------|------|
| sync-knowledge-agents *(Backlog)* | entity_mentions | Sunday 14:00 |

### Strategic vision

Market Hub is the **knowledge engine** of the AgriSafe ecosystem:

1. **Ingest** — 176 public sources, algorithmic scrapers (no LLM scraping).
2. **Analyze** — 5-entity model, cross-referencing (e.g. `v_retailers_in_rj` surfaced R$ 582.6M distressed channels).
3. **Create** — LinkedIn articles, campaigns, positioning via Central de Conteúdo.
4. **Comply** — regulatory monitoring, CNAE classification, tier-aware access.

Downstream products: Admin Portal, App Campo (agenda + email/newsletter outreach — chat moved to Oracle), AgriSafe Oracle (persistent in-app assistant on every page), Financial Institutions Directory.
