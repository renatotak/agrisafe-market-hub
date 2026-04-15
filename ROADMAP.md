# AgriSafe Market Hub — Roadmap

> **Last updated:** 2026-04-15 (re-baselined from [`documentation/26-0415 agsf_mkthu to dos.txt`](documentation/26-0415%20agsf_mkthu%20to%20dos.txt))
> 4 verticals · 14 modules · 62 tables · 62 migrations · 25 cron jobs (smart orchestrator) · 9 MCP tools · 176 data sources
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

### Phase 1 — Dashboard bug pass  **[parallel · ≥3 agents]**

Fixes Renato called out on 2026-04-15 for the Painel.

- **1a Unit/cacao KPI bug** — cacao NA widget renders "83 points" where a % is expected. Audit every commodity card in [src/app/page.tsx](src/app/page.tsx) and [`/api/prices-na`](src/app/api/prices-na/route.ts); add a `unit` field on every row (`%`, `pts`, `R$/saca`, `USD/t`) + format symmetrically so the next commodity that returns points doesn't silently break.
- **1b Indústrias KPI indicator + modal** — Revendas indicator exists at [page.tsx:245–251](src/app/page.tsx#L245-L251); clone for industries and add an `industries` case in [ChapterModal.tsx:123–136](src/components/ChapterModal.tsx#L123-L136). Modal shows new edits / updates per industry (last 30d).
- **1c Scrapers KPI rewrite** — current "5/9 alerts" reading is opaque, and the modal lists only 3 broken with no fix action. Rewrite the KPI as "N active · M broken · K stale" with tooltip; modal in [DataSources.tsx:1242–1366](src/components/DataSources.tsx#L1242-L1366) lists **all** broken/stale rows, each with a "Reprocessar" button (calls `/api/cron/sync-<name>` manually) and a link to the scraper file.
- **1d Diretório de Canais curation filter** — add `is_user_curated` / `is_client` / `is_lead` chip toggles in [RetailersDirectory.tsx](src/components/RetailersDirectory.tsx); wire to existing `company_notes` + onenote-import flags so Renato can focus on companies this team has touched.
- **1e Summit Brazil Super Foods 2026 map check** — confirm the manually-edited event now renders on the Painel map; close the carried-over 2026-04-14 item.

### Phase 2 — New ingestion sources  **[parallel · up to 5 agents]**

- **2a MFrural weekly scraper** — `sync-mfrural-fertilizers` against `https://www.mfrural.com.br/produtos/1-11/fertilizantes`. Weekly Sunday 11:00. Targets DAP, MAP, KCl, Urea per-region. Writes to `macro_statistics` with `source_id='mfrural'`.
- **2b USDA agtransport scraper** — `sync-usda-agtransport` against `agtransport.usda.gov/Fertilizer/Fertilizer-Prices-by-Region/8bgf-5mdv`. Weekly Sunday 11:30. Same schema.
- **2c WB Pink Sheet tagging** — already in `sync-worldbank-prices`; confirm DAP/MAP/KCl/Urea rows are tagged and surfaced in the existing Pulso "Preços de Insumos" tab alongside the new MFrural/USDA series.
- **2d AgRural event source** — add `agrural.com.br` via Settings → Ingestão → Adicionar Fonte; new `sync-events-agrural` Cheerio job → `events` table with inline name matcher.
- **2e Serasa RJ backfill** — parse [local files/Serasa](local%20files/Serasa), match by CNPJ against `legal_entities`, insert missing rows. New column `debt_value_source` (mig 064 — enum `legal_rss` / `ddg_scrape` / `serasa` / `manual`) exposed as a chip on each RJ card.

### Phase 3 — Painel map completeness  **[sequential after 1 and 2]**

- **3a Subsidiary markers** — read `cnpj_establishments` with `created_at > now() - interval '30 days'` and drop a marker on each new branch. Click → entity card.
- **3b Entity-attached news markers** — read `entity_mentions(mention_type='news')` with a recency weight; cluster on zoom-out.
- **3c Marker-type extension** — add `"subsidiary_new"` and `"news_attached"` to the `MarkerType` union at [DashboardMap.tsx:103–116](src/components/DashboardMap.tsx#L103-L116) plus the fetch/filter logic in the same file's effect block.

### Phase 4 — AI-assisted input flows  **[parallel · 3 agents]**

Each track turns a manual data-entry step into a paste-and-confirm flow. Vertex AI only; user always approves before save.

- **4a Competitor URL paste + AI categorize** — URL field in the Add-Competitor modal at [CompetitorRadar.tsx:254–260](src/components/CompetitorRadar.tsx#L254-L260); POST to the existing [enrich-web endpoint](src/app/api/competitors/enrich-web/route.ts) (today unwired); returns AI-extracted fields (name, segment, summary, hq_city, main_lines) that the user edits before save.
- **4b Notícias Agro manual upload** — button in [AgroNews.tsx](src/components/AgroNews.tsx) mirroring the Reading-Room ingest flow; reuses `/api/reading-room/ingest` with a `source='manual_ui'` tag.
- **4c News → Directory enrichment** — AI pass on each ingested article picks up entity mentions and proposes a directory update (Canal / Indústria / FI); surfaced as a confirmation modal in the news card. Writes to `entity_mentions` + the target directory only on user approval.
- **4d Event URL paste + AI parse + location confirm** — paste-URL field in `EventFormModal`; new `/api/events/parse-url` (Cheerio + Vertex AI) extracts name/date/city/state/url/organizer; after save, open a location-confirm modal showing the pin on a mini-map so the user validates geocoding before it lands on the Painel map.

### Phase 5 — Inteligência de Insumos rebuild  **[sequential, anchored on Ivan's PDF]**

Today's tabs don't render correctly and the UX doesn't match the buyer's journey. Rebuild around the canonical product list from [`local files/Industry products/management view ivan.pdf`](local%20files/Industry%20products/management%20view%20ivan.pdf).

- **5a Extract canonical products from Ivan's PDF** → seed CSV with `culture, category, product_name, active_ingredient, purpose, industry_name` (e.g. CTVA = Corteva). Semi-automatic: `pdf-parse` extraction + human review.
- **5b Data model** — new table `culture_canonical_inputs(culture, category, product_name, active_ingredient, purpose, industry_entity_uid, region, rank)` (mig 067). Links to `industries` + `industry_products`.
- **5c Tab diagnosis + fix** — diagnose why AgInputIntelligence tabs aren't rendering (likely a failing upstream fetch). Restore baseline before layering new features.
- **5d Greyed-out tab previews** — before a query runs, each tab shows a skeleton with the *expected* output shape and a tooltip "this query returns: ...", so users know what to expect.
- **5e "Show alternatives" as primary action** — re-surface `v_oracle_brand_alternatives` as the default card action.
- **5f Industry → products pivot** — pick an industry, see all commercial products grouped by culture × category. Powered by `industry_products` + the new canonical table.
- **5g Mindmap view (polish)** — optional graph render over the canonical table (industry → product → molecule → purpose → culture). Gated behind 5a–5f.

### Phase 6 — Knowledge & content depth  **[parallel · 3 agents]**

Carried forward from the 2026-04-14 plan; scope unchanged.

- **6a AgriSafe Oracle persistent shell** — floating FAB + side-drawer on every page; page-context capture (active module, entity, filters) into system-prompt metadata; citation chips; tab consolidation (delete `Cobertura do Conhecimento`, merge `Busca Semântica` + `Mapa de Conexões` into a single Knowledge Graph tab). Backend is the already-tier-aware `/api/knowledge/chat`. Weekly `sync-oracle-insights` clusters unanswered prompts into a knowledge-gap backlog.
- **6b Central de Conteúdo suggestion engine** — `/api/content/suggest-topics` takes the last 14d of news + regulatory changes + RJ filings + price ruptures + entity-mention clusters, returns 5–10 ranked LinkedIn angles with thesis + sources. Preceded by a pipeline-status sweep that flips already-published items to `status='published'`.
- **6c Briefing do Dia themed lens** — new `analysis_lenses` row `daily_themed_briefing`; `sync-daily-briefing` accepts `?lens=daily_themed_briefing`; prompt builder reads prior 7 days of briefings as anti-repetition memory.
- **6d Marco Regulatório wrap-up + freshness** — on-demand freshness run of `sync-cvm-agro` / `sync-bcb-rural` / `sync-cnj-atos` / `sync-key-agro-laws`; new `regulatory_digests` table holds a weekly Vertex-AI digest "what changed for agribusiness industries / retailers / producers / FIs" with citations; UI panel under the Marco Regulatório indicators.
- **6e RJ card detail + debt-source chip** — wire the row-click in `RecuperacaoJudicial.tsx` to actually render the detail payload (case, court, debt, mentions, related news); surface the `debt_value_source` chip from Phase 2e.
- **6f Meeting reclassification panel** — Settings → "Reclassificar Importações"; walks every `legal_entity` with `role='retailer'` whose only source is `onenote_import` and lets the user reassign role (retailer / industry / cooperative / trading / financial_institution / other). Solves the Biocaz-as-Biocontrol class of errors.

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
