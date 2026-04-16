# AgriSafe Market Hub — Roadmap

> **Last updated:** 2026-04-16 (Phases 1–6 completed, security audit + RLS fix)
> 4 verticals · 14 modules · 64 tables · 73 migrations · 30 cron jobs (smart orchestrator) · 9 MCP tools · 176 data sources
> For phase history, see git log. For setup, see `.env.example`. For ops, see [`launchd/README.md`](launchd/README.md). For hard rules, see [`CLAUDE.md`](CLAUDE.md).

---

## 1. What's Live

| Area | Key Numbers |
|------|-------------|
| 5-entity model | 9,818 legal_entities · 9,609 roles · 143 mentions |
| Diretório de Canais | 9,328 retailers · 24,275 geocoded locations · CRM panel + Street View |
| Diretório de Indústrias | 274 industries · 1,699 geocoded establishments · industries chat → Oracle redirect |
| Instituições Financeiras | mig 063 + seed (BB, BNDES, Sicredi, Sicoob, Ailos, Cresol, Rabobank, BTG); full chapter in **Phase 7** (SICOR eligibility · BACEN MCR · SCR inadimplência · CVM FIDC/FIAGRO inventory) |
| Marco Regulatório | 16 norms · CNAE classification · "X empresas afetadas" badge · summary section |
| Recuperação Judicial | 131 cases · manual CNPJ add · cards styled collapsible (detail render pending) |
| Pulso de Mercado | BCB SGS · NA prices · Yahoo futures · FAOSTAT · WB Pink Sheet · CONAB · USDA PSD · MDIC · Preços de Insumos tab (DAP/TSP/Urea/KCl/Phosphate Rock from WB) |
| Inteligência de Insumos | Oracle UX + 800 AGROFIT products; tabs currently broken (Phase 5 fixes) |
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

## 3. Roadmap — 6 phases

Each phase lists concrete tracks. Phases marked **[parallel]** are safe to dispatch to multiple agents concurrently; **[sequential]** phases have internal ordering.

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

### Phase 5 — Inteligência de Insumos rebuild  **[sequential, anchored on Ivan's PDF]**

Today's tabs don't render correctly and the UX doesn't match the buyer's journey. Rebuild around the canonical product list from [`local files/Industry products/management view ivan.pdf`](local%20files/Industry%20products/management%20view%20ivan.pdf).

- **5a Extract canonical products from Ivan's PDF** → seed CSV with `culture, category, product_name, active_ingredient, purpose, industry_name` (e.g. CTVA = Corteva). Semi-automatic: `pdf-parse` extraction + human review.
- **5b Data model** — new table `culture_canonical_inputs(culture, category, product_name, active_ingredient, purpose, industry_entity_uid, region, rank)` (mig 067). Links to `industries` + `industry_products`.
- **5c Tab diagnosis + fix** — diagnose why AgInputIntelligence tabs aren't rendering (likely a failing upstream fetch). Restore baseline before layering new features.
- **5d Greyed-out tab previews** — before a query runs, each tab shows a skeleton with the *expected* output shape and a tooltip "this query returns: ...", so users know what to expect.
- **5e "Show alternatives" as primary action** — re-surface `v_oracle_brand_alternatives` as the default card action.
- **5f Industry → products pivot** — pick an industry, see all commercial products grouped by culture × category. Powered by `industry_products` + the new canonical table.
- **5g Mindmap view (polish)** — optional graph render over the canonical table (industry → product → molecule → purpose → culture). Gated behind 5a–5f.

### Phase 6 — Knowledge & content depth  **[DONE ✓ 2026-04-16]**

- ~~**6a AgriSafe Oracle persistent shell**~~ — ✓ Page-context capture (module + entity) in system prompt. Citation chips with tier-colored indicators + clickable links. KnowledgeBase tabs consolidated (Busca + Mapa → Knowledge Graph). Weekly `sync-oracle-insights` job clusters low-confidence prompts into knowledge-gap backlog.
- ~~**6b Central de Conteúdo suggestion engine**~~ — ✓ `/api/content/suggest-topics` reads 14d signals (news, norms, RJ, price anomalies, entity clusters), generates 5–10 ranked LinkedIn angles via Vertex AI. Pipeline-status sweep auto-flips published items. "Sugerir Tópicos" button + modal in ContentHub.
- ~~**6c Briefing do Dia themed lens**~~ — ✓ Migration 071 (`theme` column + `daily_themed_briefing` lens seed). Rotating themes Mon–Sun. Anti-repetition memory reads prior 7 days. Theme badge on ExecutiveBriefingWidget. Activated via `?lens=daily_themed_briefing`.
- ~~**6d Marco Regulatório wrap-up + freshness**~~ — ✓ `/api/regulatory/refresh` triggers 4 regulatory jobs on demand. Migration 072 (`regulatory_digests` table). Weekly `sync-regulatory-digest` job generates bilingual Vertex AI digest with citations. "Resumo Regulatório" panel + "Atualizar Agora" button in RegulatoryFramework.
- ~~**6e RJ card detail + debt-source chip**~~ — ✓ Expandable `RJDetailPanel` with full fields (case, court, debt, filing date, debt_value_source chip). Linked news via entity_mentions → agro_news join.
- ~~**6f Meeting reclassification panel**~~ — ✓ Settings → "Reclassificar Importações" panel. `/api/entities/reclassify` endpoint. Migration 073 (expands entity_roles CHECK for `financial_institution`). Batch role reassignment with `logActivity()`.

### Phase 7 — Instituições Financeiras (FIs) deep build  **[parallel · 4 agents, merge at UI step]**

Mig 063 + seed rows are in place (BB, BNDES, Sicredi, Sicoob, Ailos, Cresol, Rabobank, BTG). This phase turns it into a full chapter: eligible-IF registry, credit-risk series, fund inventory (FIDCs / FIAGROs from CVM), and a Marco Regulatório anchor for the MCR.

- **7a SICOR eligible-IF import** — parse [`local files/financial institutions/sicor_lista_ifs.csv`](local%20files/financial%20institutions/sicor_lista_ifs.csv) (the BACEN SICOR list of institutions authorised to operate rural credit). For each row: resolve `entity_uid` via `ensureLegalEntityUid()` on the CNPJ, add `entity_roles` with `role_type` in `{bank, cooperative_bank, fidc, fiagro, development_bank}`, tag `is_sicor_eligible=true` in `financial_institution_profile`. One-shot seeder (`src/scripts/seed-sicor-ifs.js`) with `logActivity`; idempotent re-run.
- **7b BACEN MCR ingestion → Marco Regulatório + Base de Conhecimento** — the Manual de Crédito Rural is the ground-truth rulebook for rural-credit FIs. New `sync-bacen-mcr` weekly Cheerio scraper against `https://www3.bcb.gov.br/mcr/` → writes each chapter/sub-chapter as a `regulatory_norms` row (agency=`BCB`, tag=`MCR`) **and** a `knowledge_items` row with Vertex embedding so the Oracle can quote MCR passages with citations. Add an `mcr_chapter` + `mcr_version` column on `regulatory_norms` (mig 068) so the UI can show "MCR 2-1 — Beneficiários" as a filter chip.
- **7c SCR inadimplência series** — rebuild the BCB SCR chart (`bcb.gov.br/estabilidadefinanceira/scrdata`) on our side using the open dataset at `https://dadosabertos.bcb.gov.br/dataset/21082-inadimplencia-da-carteira-de-credito---total`. New `sync-bcb-scr-inadimplencia` daily job → `macro_statistics` rows with dimensions `uf`, `cnae`, `porte`, `modalidade`, `origem`, `indexador`, `cliente`, `submodalidade`, `segmento`. UI widget on the FI module shows a configurable multi-series chart (same filters as the BCB source) that updates daily vs. BCB's quarterly refresh cadence.
- **7d CVM fund inventory (FIDCs + FIAGROs)** — walk `https://sistemas.cvm.gov.br/` fund listings to extract every active FIDC + FIAGRO with an agro mandate. For each fund capture `name, cnpj, inception_date, aum_brl, aum_asof, gp_name, gp_cnpj, website, status, target_yield, callable, concentration_limits, fund_type`. Persist on `financial_institution_profile` (extend the table if needed via mig 069) + `fund_holdings` (new) for the fund-of-funds structure. Source-tag `cvm_fidc_fiagro`. New `sync-cvm-funds` weekly Sunday 13:00.
- **7e FI module UI** — [FinancialInstitutionsDirectory.tsx](src/components/FinancialInstitutionsDirectory.tsx) with filters (kind, region, AUM bracket, SICOR-eligible, fund_type) and an expandable per-FI panel showing: profile, GP, fund list, AUM history, SCR inadimplência series scoped to that FI where possible, MCR-citation chips, news mentions, BCB agro-credit volume, top counterparties.
- **7f Cross-reference "Financiadores" tab** — on Diretório de Canais + Diretório de Indústrias expanded panels, a new tab listing FIs that have lent to that entity (pulled from `sync-bcb-rural` counterparty aggregation + `entity_mentions` where `mention_type='credit_relationship'`).

---

## 4. Backlog (one-liners, lowest-priority)

- Knowledge Agents — cron-driven LLM enrichment of `entity_mentions` beyond the algorithmic matcher.
- Expansion Detection alerts — needs `CRAWLERS_DATABASE_URL`; diff on `cnpj_establishments` → daily themed briefing.
- CRM RBAC + `client_confidential` 4th tier — tier filtering on `/api/crm/*` + role assignment UI.
- App Campo push notifications (FCM/APNs) + Resend outreach worker + template editor + unsubscribe page.
- Sentry · WCAG 2.1 · dark mode · Ctrl+K command palette · CSV/PDF export · institutional PDF briefing.

---

## 5. Reference

### Cron pipeline (25 jobs · 2 launchd agents)

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

### Strategic vision

Market Hub is the **knowledge engine** of the AgriSafe ecosystem:

1. **Ingest** — 176 public sources, algorithmic scrapers (no LLM scraping).
2. **Analyze** — 5-entity model, cross-referencing (e.g. `v_retailers_in_rj` surfaced R$ 582.6M distressed channels).
3. **Create** — LinkedIn articles, campaigns, positioning via Central de Conteúdo.
4. **Comply** — regulatory monitoring, CNAE classification, tier-aware access.

Downstream products: Admin Portal, App Campo (agenda + email/newsletter outreach — chat moved to Oracle), AgriSafe Oracle (persistent in-app assistant on every page), Financial Institutions Directory.
