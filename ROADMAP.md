# AgriSafe Market Hub — Roadmap

> **Last updated:** 2026-04-14 (re-baselined from `documentation/26-0414 agsf_mkthu to dos.txt`)
> 4 verticals · 14 modules · 62 tables · 62 migrations · 25 cron jobs (smart orchestrator) · 9 MCP tools · 176 data sources
> For full phase history, see git log. For env setup, see `.env.example`. For ops, see `launchd/README.md`.

---

## What's Live

| Area | Key Numbers |
|------|-------------|
| 5-entity model | ~9,818 legal_entities · 9,609 roles · 143 mentions |
| Diretório de Canais | 9,328 retailers · 24,275 locations (geocoded) · CRM panel + Street View |
| Diretório de Indústrias | 274 industries · 1,699 establishments (geocoded) · CRM panel + Street View |
| Marco Regulatório | 16 norms with CNAE classification · "X empresas afetadas" badge |
| Recuperação Judicial | 131 cases · manual CNPJ add with BrasilAPI + debt scrape |
| Pulso de Mercado | BCB SGS + NA prices + Yahoo futures + FAOSTAT + WB Pink Sheet + CONAB + USDA PSD + MDIC |
| Inteligência de Insumos | Oracle UX · 800 AGROFIT products · manufacturer FK linked |
| Notícias Agro | 203 articles · 5 RSS feeds · Reading Room Chrome extension |
| Eventos Agro | AgroAgenda + AgroAdvance unified · per-event AI enrichment |
| Executive Briefing | Daily 08:00 Gemini summary + price anomaly detection (rolling 2-sigma) |
| Cron pipeline | 25 jobs on Mac mini via smart orchestrator (2 launchd agents) |
| MCP server | 9 tools (stdio-based, `npm run mcp`) |
| Data Ingestion | 176 sources (125 active) · Source CRUD UI · weekly healthcheck |
| Auth + deploy | Supabase Auth + SSR · Vercel webapp + Mac mini cron |

---

## New Features

### AgriSafe Oracle — Persistent In-App Assistant

**Objective:** A floating chat button in the bottom-right of every page that opens the AgriSafe Oracle: a Vertex-AI-powered conversational layer over the entire knowledge base (news, entities, regulations, market data, financial institutions, meetings — tier-filtered). One assistant, always reachable, replaces the current "Cobertura do Conhecimento" / "Busca Semântica" / "Mapa de Conexões" tab triplet.

**Why this beats a separate chat module:** the user shouldn't navigate to a module to ask a question — they should ask the question wherever they are, and the assistant should know which page they're on (entity context, current filter, active culture) to answer with that context already loaded.

**Scope re-set (corrects an earlier ambiguity):**
- The Oracle is the **internal AgriSafe team's** assistant for finding information AND for capturing **user-journey signals** the team can use to iterate the product (every prompt + outcome becomes a knowledge artifact for product improvement).
- It is **NOT** a chat between AgriSafe HQ and external sales reps — that channel was deprecated. The chat infrastructure already built (`chat_threads`, `chat_messages`, `/api/chat/*`, Supabase Realtime wiring — mig 058) gets repurposed to hold Oracle conversation history per user.

**Rollout:**
1. **Persistent chat shell** — bottom-right floating button on every page (Dashboard, Diretórios, Pulso, etc.), expands to a side-drawer chat panel. Page context (active module, entity, filters) flows in as system-prompt metadata.
2. **Vertex AI backend** — reuses `src/lib/gemini.ts` (`gemini-2.5-flash` for chat, `gemini-embedding-001` for retrieval). All calls through Vertex AI per Guardrail #2 (no Gemini API free tier).
3. **Tier-aware retrieval** — RAG over `knowledge_items`, `entity_mentions`, `regulatory_norms`, `meetings`, future `financial_institutions` table. Already scaffolded via `match_knowledge_items` RPC + `confidentiality.ts` helpers.
4. **Streaming responses** with citation chips that link back to the source module.
5. **Knowledge tab consolidation** — delete `Cobertura do Conhecimento` (no signal value), merge `Busca Semântica` + `Mapa de Conexões` into a single "Knowledge Graph" tab so the Base de Conhecimento module isn't redundant with the Oracle drawer.
6. **Conversation analytics** — capture every prompt + the answer the user accepted/dismissed in `chat_messages` with `sender_kind='bot'`. Weekly `sync-oracle-insights` cron clusters frequent unanswered questions → backlog of knowledge gaps to fill.

**What exists:** `/api/knowledge/chat` (tier-aware), 9 MCP tools, chat schema (mig 058), Vertex AI client.
**What's needed:** Floating-button shell component + side-drawer; page-context capture; streaming response handler; citation-chip renderer; tab consolidation; insights cron.

---

### Financial Institutions Directory — FIDCs, FIAGROS, Banks, Cooperative Banks

**Objective:** A new module surfacing every institution that supplies capital to Brazilian agribusiness — FIDCs, FIAGROs, commercial banks, and cooperative banks (Sicredi, Sicoob, Ailos, Cresol, etc.) — with their active inventory of agribusiness credits from Banco Central, news mentions, and the entities they finance.

**Value:** Most rural producers and retailers know 3–5 capital sources. There are dozens. Showing "outras instituições que financiam o seu setor / sua região" turns the Market Hub into a discovery surface for capital sourcing — an angle competitors don't cover.

**Data sources:**
- **Banco Central séries** — agribusiness credit by institution (already partially ingested via `sync-bcb-rural`, needs aggregation by counterparty).
- **CVM** — public FIDC and FIAGRO regulatory filings (already crawled via `sync-cvm-agro` for general norms, needs subset filter for agro funds).
- **Cooperative bank registries** — Sicredi/Sicoob/Ailos/Cresol official lists, scraped via Cheerio.
- **Two-way news flow** — financial-institution-tagged news (existing entity-matcher pipeline) + module triggers news-search for each new institution registered.

**Schema:** new role-types in `entity_roles` (`fidc`, `fiagro`, `bank`, `cooperative_bank`) + a `financial_institution_profile` table for fund-specific fields (inception, AUM, callable, target_yield, concentration_limits). Anchored in the existing 5-entity model — every FI is a `legal_entity`.

**Rollout:**
1. **Schema** — mig 063: `financial_institution_profile` + entity_roles enum extension.
2. **Seed** — manual seed of top 30 banks/cooperative banks + scraping of CVM FIDC/FIAGRO list (~150 funds active in agro).
3. **Module UI** — `FinancialInstitutionsDirectory.tsx` with filters (kind, region, AUM bracket, agro share), expandable per-FI panel showing news, BCB credit volume series, top counterparties.
4. **Cross-references** — Diretório de Canais and de Indústrias gain a "Financiadores" tab in their expanded panels showing FIs that have lent to that entity.

**What exists:** entity_roles.role_type accepts new values via constraint update; `sync-bcb-rural` cron; news entity-matcher.
**What's needed:** mig 063, scrapers, UI module, cross-reference views.

---

### Inteligência de Insumos — Rebuild + Per-Culture Journey + Kynetec

**Objective:** Rebuild the Insumos chapter around the user's actual journey: "what do I need to buy for THIS culture, what alternatives exist, and which industries serve it." Today's tabs aren't loading correctly and the UX doesn't follow the buyer's path.

**Value:** A retailer planning soja season in MT needs a one-screen view of the canonical fertilizer + chemical defensive stack (and their alternatives + manufacturers). The current Oracle answers "what targets pest X on culture Y?" but doesn't surface the planning-time question "what's the standard package?".

**Rollout:**
1. **Tabs audit + fix** — diagnose why the current AgInputIntelligence tabs aren't rendering (likely a data-fetch failure from one of the underlying endpoints). Restore baseline before adding features.
2. **Per-culture canonical stack** — for each monitored culture (soja, milho, café, algodão, cana, trigo, boi-gordo, frango, suínos): the most-used fertilizer types (NPK, ureia, MAP, KCl, micronutrients) and chemical defensives (top 5 herbicidas, inseticidas, fungicidas) ranked by usage share. Sourced from CONAB cost-of-production reports + Kynetec data.
3. **"Show alternatives" view per product** — already partially built via `v_oracle_brand_alternatives`. Re-surface as the primary action on every product card.
4. **Industries → products view** — flip the dimension: pick an industry → see all their commercial products, by culture and by category. Source: Kynetec files in [`local files/Kynetec/`](local%20files/Kynetec/) (need to inspect format and build a parser).

**What exists:** `industry_products` (800 rows), `v_oracle_brand_alternatives`, `industries` table (linked to `legal_entities` via mig 061), AgInputIntelligence component, manufacturer_entity_uid migration (mig 050).
**What's needed:** Tab-load fix; per-culture canonical-stack view (likely needs a curated `culture_canonical_inputs` table or SQL view); Kynetec parser + import script; industry-centric product browser.

**Follow-on (was the old "State-Level Product Coverage" item):** add state-secretaria sources for MT/MS/GO/PR/RS/SP/MG/BA so the Oracle can answer "approved in your state?" — a differentiator no competitor offers. Park until step 1–4 lands.

---

### Recuperação Judicial — Serasa Backfill + Debt Source Attribution + Card Details Bug

**Objective:** Three concrete fixes to make the RJ chapter trustworthy: catch the missing companies, validate the debt amounts, and make the cards actually expand.

**Issues observed:**
- Many RJ companies present in Serasa's dataset ([`local files/Serasa`](local%20files/Serasa)) are missing from `recuperacao_judicial`.
- Debt amounts look incorrect on several cards. The current pipeline has two debt sources — the `/api/rj-add` DDG-scrape and the legal-RSS feeds — and they sometimes disagree silently. Need to expose **which source produced the displayed value** and let the user pick.
- Cards are styled as collapsible but no detail content renders when clicked.

**Rollout:**
1. **Serasa backfill** — read [`local files/Serasa`](local%20files/Serasa), match against `legal_entities` by CNPJ, insert missing rows. Auto-tag `source_name='Serasa'`.
2. **Debt source provenance** — add `debt_value_source` enum to `recuperacao_judicial` (`legal_rss` / `ddg_scrape` / `serasa` / `manual`), surface the source as a chip on the card.
3. **Card-expansion fix** — wire the `RecuperacaoJudicial.tsx` row-click to actually render the existing detail data (case number, court, debt, mentions, related news) instead of just toggling a chevron.

**What exists:** `recuperacao_judicial` table, `/api/rj-add`, `/api/rj-scan`, RJ chapter UI, entity_uid matching.
**What's needed:** Mig 064 (debt_value_source column), Serasa parser/seeder, UI card-detail wiring, source chip.

---

### Marco Regulatório — Live Wrap-Up + Freshness Refresh

**Objective:** Make the regulatory chapter feel alive. Today it shows 16 norms with `affected_cnaes`, but no synthesis of "what changed this week / month" — and several recent norms appear stale.

**Rollout:**
1. **Freshness audit** — run `sync-cvm-agro`, `sync-bcb-rural`, `sync-cnj-atos`, `sync-key-agro-laws` on demand and compare against external sources to confirm the chapter is current. If gaps, fix the scrapers.
2. **Wrap-up panel below indicators** — a Vertex-AI-generated weekly digest that summarizes "what new laws/rules are changing for [agribusiness | retailers | rural producers | financial institutions]" with citation links to the underlying `regulatory_norms` rows. Cron writes to a new `regulatory_digests` table; UI surfaces the latest.
3. **CNAE-aware filter chips** — already partly there. Verify they still work after the digest panel lands.

**What exists:** `regulatory_norms` (16+ rows), `affected_cnaes` GIN index, `cnae-classifier.ts`, weekly cron coverage.
**What's needed:** Freshness audit + scraper repairs; new digest cron + table + UI panel.

---

### Pulso do Mercado — Ag Input Prices Panel

**Objective:** A new panel under Pulso de Mercado specifically for ag input prices, with priority on imported fertilizers (urea, MAP, KCl) — the highest-volatility line item on Brazilian agribusiness P&Ls.

**Value:** Commodity prices are well covered (CEPEA, BCB, Yahoo Finance, futures curve from B3/CME). Input prices are missing — and they swing harder than commodity prices in the import-dependent fertilizer stack.

**Data sources to evaluate:**
- **MDIC ComexStat** — already ingested for export volumes; same source has import unit prices for 31 fertilizer HS codes (already partially in `sync-mdic-comexstat`, needs price-axis extraction).
- **AgRural / AgroAdvance / private indexes** — verify which publish openly.
- **CEPEA insumos** — limited but trustworthy.

**What exists:** `macro_statistics` table, `sync-mdic-comexstat` cron, MarketPulse Pulso component.
**What's needed:** Confirm MDIC unit-price fields, design "Input Prices" tab inside MarketPulse, add per-HS-code historical chart with a Brazilian-import-share badge.

---

### Central de Conteúdo — Idea Suggestion Engine + Pipeline Cleanup

**Objective:** Give Renato a "suggest next-week's articles" button that produces a ranked list of LinkedIn topics seeded from the week's most signal-rich news, regulatory changes, and market anomalies.

**Value:** Renato publishes weekly. Today the topic is selected by hand from intuition. Surfacing 5-10 candidate angles per week — each with a 2-line thesis, the supporting source links (news + reg + entity_mentions + price ruptures), and an estimated audience-fit score — turns the Content Hub from a tracker into a generator.

**Also:** the current "pipeline" tab still lists already-published items; needs a status sweep.

**Rollout:**
1. **Pipeline cleanup** — script to flip already-published items to `status='published'` based on the existence of a `published_article_links` row OR a published_at in the past.
2. **Suggestion engine** — Vertex AI prompt that takes the last 14 days of signals (top news, RJ filings, regulatory changes, anomalies, entity_mentions clustered by CNAE) and returns 5-10 article ideas with thesis + sources + tags. Surface as a "Sugerir próximos temas" button on the Content Hub header. Save accepted suggestions as draft articles.
3. **Auto-link to published URLs** — every accepted suggestion that gets published auto-creates the `published_article_links` row (just need to wire the publish action).

**What exists:** Content Hub UI with `published_article_links` table (mig 062 — auto-fetches og:meta), executive briefing pipeline, daily signals from the orchestrator.
**What's needed:** Pipeline-status reconciliation script; suggestion endpoint; UI button.

---

### Briefing do Dia — Themed Lens

**Objective:** A new analysis lens (configurable via Settings → Lentes de Análise) that produces a focused daily briefing strictly on the themes Market Hub monitors: agribusiness industries + ag input retailers, recuperações judiciais, commodity market prices.

**Value:** The current `executive_briefings` mixes everything. A themed lens produces a tighter, more actionable summary — "what mattered today specifically for the AgriSafe playbook" — that becomes the canonical morning read.

**Rollout:**
1. New lens row in `analysis_lenses` (`id='daily_themed_briefing'`) with the focused prompt + system context (entities monitored, RJ portfolio scope, commodity watchlist).
2. `sync-daily-briefing` accepts a `?lens=daily_themed_briefing` parameter and routes through the new lens.
3. Briefing memory — the agent reads the prior 7 days of briefings as context so it doesn't repeat itself.

**What exists:** `analysis_lenses` (mig 036), `executive_briefings` table (mig 047), `sync-daily-briefing` cron, `AnalysisLensesEditor` Settings panel.
**What's needed:** Seed the new lens row; wire the parameter; add prior-briefing-as-memory in the prompt builder.

---

### Meeting Intelligence — Reclassification + Industry/FI Coverage

**Objective:** Re-pass the OneNote-imported meetings to fix the original misclassification: many companies were tagged as `retailer` because that was the only role the app modeled at the time. With industries / tradings / cooperatives / financial institutions now first-class, those rows need correct role assignment.

**Concrete example:** "Biocaz" was imported as "Biocontrol" (a retailer slug guess) when it's actually an industry. The dedupe pipeline (mig 060–061) fixed the duplicate, but the role assignment still needs a re-pass.

**Rollout:**
1. **Reclassification pass** — script that walks every `legal_entity` with `role='retailer'` whose only source is `onenote_import` and re-prompts the user (via a panel) to confirm role: retailer / industry / cooperative / trading / financial_institution / other.
2. **Re-import flow** — the OneNote Import Wizard gets a "re-import with current entity model" mode that re-runs the company matcher against the now-richer `legal_entities` set (post-AGROFIT bulk merge + Financial Institutions seeding) and surfaces newly-resolved matches.

**What exists:** `meetings` (340+ rows from Davi's import), `key_persons`, `leads`, `OneNoteImportWizard.tsx`, `IndustryDedupePanel.tsx`, `entity_merge_log`.
**What's needed:** Reclassification panel (Settings → Reclassificar Importações), re-import mode in the wizard.

---

### App Campo Platform — Agenda Sync + Email/Newsletter Outreach

**Objective:** App Campo (mobile field-sales surface) consumes Market Hub agenda data and is the destination for email + newsletter campaigns. **The persistent-chat track has been removed** — chat moved to AgriSafe Oracle, which is for internal users, not for B2B HQ↔rep messaging.

**Rollout (2 tracks):**

1. **Agenda sync (partially shipped).**
   - ✓ `GET /api/app-campo/events` — next-30d nationwide OR all-future state-scoped (api-key gated).
   - ✓ `GET /api/app-campo/meetings` — rep-scoped, tier-filtered.
   - ✓ `GET /api/app-campo/leads` — rep's pipeline.
   - ✓ `GET /api/app-campo/digest` — daily briefing excerpt + counters.
   - TODO: push-notification hook (FCM/APNs) triggered by the orchestrator on new events/leads.

2. **Broadcast outreach — email + newsletter (NOT WhatsApp).**
   - Schema shipped (mig 059 — `campaign_sends`, `suppression_list`).
   - `POST /api/outreach/queue` shipped — accepts recipients, dedupes against suppression list, queues sends.
   - TODO: Resend integration + dispatch worker, template editor in Central de Conteúdo, webhook receiver for delivery/open events, unsubscribe page.

**Removed:** the persistent-chat track (Supabase Realtime channel for HQ↔rep messaging). The chat schema (`chat_threads`, `chat_messages`) is reused as Oracle conversation history per user.

---

### Knowledge Agents — Cron-Driven Entity Enrichment

**Objective:** Deploy LLM agents on a schedule to scan ingested news, events, and regulatory changes, extract entity mentions, and enrich the knowledge base with structured insights.

**Value:** The entity-matcher today catches explicit name mentions. LLM agents can infer indirect relationships ("nova regulamentacao de credito rural" → affects all entities with CNAE 0111-3) and write richer `entity_mentions` + `knowledge_items` rows. This deepens the RAG layer that powers the AgriSafe Oracle.

**What exists:** `entity-matcher.ts` (algorithmic), `entity_mentions` table, `knowledge_items` with embeddings, daily briefing pipeline.
**What's needed:** Agent prompts, scheduling via orchestrator, quality gate (human review queue for low-confidence extractions).

---

### Expansion Detection — Companies Opening New Branches

**Objective:** Automatically detect when agribusiness companies open new CNPJ establishments by monitoring Receita Federal data, alerting the commercial team to expansion opportunities.

**Value:** A retailer opening a new branch in a new state is a sales signal. Today this information is discovered manually or months late. Automated detection would surface "Agrogalaxy abriu 3 filiais em MT este mes" in the daily themed briefing.

**What exists:** `cnpj_establishments` table (1,699 cached), `backfill-cnpj-establishments.js` script, branch delta tracking in `retailer_intelligence`.
**What's needed:** `CRAWLERS_DATABASE_URL` env var for the external RF crawlers DB, scheduled diff job, notification/alert UX.

---

### CRM Access Control — Multi-User RBAC

**Objective:** Move from the current single-user model (service-role key, UI-gated) to proper role-based access control where different team members see different tiers of CRM data.

**Value:** As the team grows, the Head of Credit shouldn't see Marketing's lead pipeline notes, and external partners should only see `agrisafe_published` tier. The `confidentiality` enum and `visibleTiers()` helper already exist — this feature wires them into the CRM read endpoints.

**What exists:** 3-tier confidentiality model (`public` / `agrisafe_published` / `agrisafe_confidential`), `resolveCallerTier()`, Supabase Auth + RLS.
**What's needed:** Tier filtering on `/api/crm/*` read endpoints, role assignment UI in Settings, `client_confidential` fourth tier activation for partner-NDA workflows.

---

### Events Map — Geocoding & Organizer Linking

**Objective:** Plot all agro events on the Dashboard map and link event organizers to the 5-entity model.

**Value:** The Dashboard map currently shows weather, news, and RJ markers but events without coordinates are invisible. Geocoding existing events and linking organizer CNPJs to `legal_entities` completes the integrated intelligence picture.

**Open verification (from 2026-04-14 todos):** Renato manually edited Summit Brazil Super Foods 2026 with city + state + geolocation. **Confirm this event now renders on the Painel map** before closing this item.

**What exists:** `events` table with lat/lng columns, 3-tier geocoder (`src/lib/geocode.ts`), `ensureLegalEntityUid()`, `EventFormModal` for manual edits.
**What's needed:** Visual confirmation on the Painel map for the manually-edited event; backfill geocode pass for any remaining null-lat/lng rows; `organizer_cnpj` extraction in scrapers.

---

### Platform Polish

UX and operational improvements that make the platform production-grade. Low-risk fixes that make the rest of the system feel finished.

- **Painel "Dados" indicator clarity** — current "5/9 alerts" reading is opaque (only 1 actual scraper failure — FAOSTAT — and that is recovering on next run). Rewrite as "X de Y scrapers OK · 1 com atenção" with a tooltip listing the at-attention scrapers and their last successful run.
- **Diretório de Canais "Em Recuperação Judicial" KPI freshness** — verify the count matches `recuperacao_judicial` after the Serasa backfill lands.
- **Sentry error monitoring** — catch runtime errors before users report them.
- **WCAG 2.1 accessibility** — screen reader support, keyboard navigation, contrast ratios.
- **Dark mode** — toggle in Settings for late-night analysis sessions.
- **Ctrl+K command palette** — quick-jump to any module, entity, or search.
- **CSV/PDF export** — per-module data export for offline analysis and presentations.
- **Institutional PDF briefing** — auto-generated executive briefing in AgriSafe brand format.

---

## Reference

### Cron Pipeline (25 jobs, 2 launchd agents)

Smart orchestrator (`sync-orchestrator`, daily 3am) probes all sources and skips unchanged. `sync-market-data` runs independently every 30min. See [`launchd/README.md`](launchd/README.md).

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

### Strategic Vision

Market Hub is the **knowledge engine** of the AgriSafe ecosystem:

1. **Ingest** — 176 public sources, algorithmic scrapers (no LLM scraping)
2. **Analyze** — 5-entity model, cross-referencing (e.g. `v_retailers_in_rj` revealed R$ 582.6M distressed channels)
3. **Create** — LinkedIn articles, campaigns, positioning via Central de Conteudo
4. **Comply** — regulatory monitoring, CNAE classification, tier-aware access

Downstream products: Admin Portal, App Campo (agenda + email/newsletter outreach — chat moved to Oracle), AgriSafe Oracle (persistent in-app assistant on every page), Financial Institutions Directory.

### Hard Guardrails

See `CLAUDE.md` for full text. Summary:
1. **Algorithms first, LLMs last** — regex/Cheerio/SQL for extraction; LLMs only for prose + chat
2. **Vertex AI only, never Gemini API free tier** — free tier lets Google train on your prompts. AgriSafe data is commercial. All LLM calls go through Vertex AI (`src/lib/gemini.ts` auto-detects SA key file `agrisafe-*.json` in project root). R$1,800 GCP credits until July 2026. See `CLAUDE.md` → "AI / LLM Provider" for full setup instructions.
3. **Everything links to 5 entities** — FK or `entity_mentions`
4. **Public data only** in the public layer — `confidentiality` enum gates access
5. **Bilingual always** — PT-BR + EN via `src/lib/i18n.ts`
6. **MockBadge required** when a section uses mock data
