# AgriSafe Market Hub — Roadmap

> **Last updated:** 2026-04-13
> 4 verticals · 14 modules · 60 tables · 53 migrations · 25 cron jobs (smart orchestrator) · 9 MCP tools · 176 data sources
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

### AgriSafe Chat — Webapp with Permanent Chat Panel

**Objective:** Give the AgriSafe team (and eventually partners) an always-available conversational interface over the entire knowledge base — news, entities, regulations, market data — with confidentiality-tier enforcement.

**Value:** Today, insights require navigating multiple modules. A chat interface lets any team member ask "quais revendas em MT estao em RJ?" or "resumo das normas que afetam cooperativas" and get an instant, source-cited answer. The RAG backbone and tier-aware filtering are already live; this feature wraps them in a dedicated UX.

**What exists:** `/api/knowledge/chat` endpoint with tier-aware `match_knowledge_items` RPC, `confidentiality.ts` helpers, 9 MCP tools.
**What's needed:** Standalone webapp route with persistent chat panel, conversation history, streaming responses, citation links back to source modules.

---

### Meeting Intelligence — Import + Live CRM

**Objective:** Bring all historical and future meeting intelligence into Market Hub's CRM, starting with OneNote imports and evolving into a live meeting log for daily commercial use.

**Value:** 3 years of commercial notes (439 meetings, 294 companies, 662 contacts) from Davi sit in a Word file. Renato's own notes are in a similar format. Once imported, every retailer and industry in the Diretório automatically shows its meeting history, key contacts, competitor tech usage, and service interests — zero manual re-entry. The live meeting UI then becomes the team's daily tool for logging client interactions.

**Rollout (3 steps):**
1. **Import Davi's notes** — OneNote Import Wizard in Settings (built, ready to test). Parse docx → review company matches → bulk insert to `meetings`, `key_persons`, `leads`.
2. **Import Renato's notes** — Same wizard, different file. May need parser tweaks for format differences.
3. **Live meeting log UI** — New "Registrar Reunião" modal accessible from the Diretório expanded panel, with structured fields (date, type, attendees, summary, next steps, competitor tech observed). Replaces the current minimal inline form in `EntityCrmPanel`.

**What exists:** `meetings` + `key_persons` + `leads` tables (mig 041), CRUD APIs, `EntityCrmPanel` UI, `OneNoteImportWizard.tsx`, `onenote-parser.ts`, `onenote-company-matcher.ts` (Jaro-Winkler), `/api/crm/onenote-import` endpoint, `meetings.metadata` jsonb (mig 054).
**What's needed:** Step 1 is ready — run the wizard. Step 2 needs a second parser pass. Step 3 needs a dedicated meeting form component with attendee picker, competitor tech checkboxes, and service interest tags.

---

### App Campo Integration — Field Sales Agenda

**Objective:** Feed event, client, and visit data from Market Hub into the App Campo mobile app so field reps see an auto-populated agenda when they open their phone.

**Value:** Field reps currently maintain calendars manually. With integration, every agro fair from AgroAgenda/AgroAdvance, every meeting logged in the CRM panel, and every lead with a scheduled follow-up automatically appears in App Campo — reducing missed visits and duplicate data entry.

**What exists:** `events` table with 52 entries (geocoded), `meetings` + `leads` CRM tables, `/api/events-db` endpoint.
**What's needed:** API contract definition with App Campo team, auth handshake, push/poll sync mechanism.

---

### Insumos Oracle — State-Level Product Coverage

**Objective:** Expand the ag input intelligence from federal AGROFIT data only to include state-level secretaria de agricultura product approvals, giving region-specific recommendations.

**Value:** A farmer in MT and one in RS face different approved product lists. Today the Oracle only shows the federal catalog (800 products). Adding state sources for the 8 priority states (MT, MS, GO, PR, RS, SP, MG, BA) would let the Oracle recommend "approved in your state" alternatives — a differentiator no competitor offers.

**What exists:** `industry_products` table with `source_dataset` enum ready for `state_secretaria_*` slots, Oracle UX with culture+pest filter.
**What's needed:** URL + HTML selector verification per state, Cheerio scrapers, weekly cron jobs.

**Follow-on:** Once state data is live, **region awareness** activates automatically (filter by state), and **real price data** (scraping retailer price tables) would complete the Oracle with actual cost comparison instead of the `holder_count` proxy.

---

### Outreach Engine — Newsletter, WhatsApp & Email Campaigns

**Objective:** Turn the content created in Central de Conteudo and the leads tracked in Diretório de Canais into automated multi-channel outreach (email, WhatsApp, newsletter).

**Value:** The CRM already links leads to campaigns via `leads.linked_campaign_id`. The missing piece is the send-out layer. This closes the loop: Market Hub finds the insight → Content Hub writes the article → Outreach Engine delivers it to the right audience segment.

**What exists:** `leads` table with campaign FK, `campaigns` table, Content Hub articles.
**What's needed:** WhatsApp Business API or SendGrid integration, template builder, delivery tracking, unsubscribe management.

---

### Expansion Detection — Companies Opening New Branches

**Objective:** Automatically detect when agribusiness companies open new CNPJ establishments by monitoring Receita Federal data, alerting the commercial team to expansion opportunities.

**Value:** A retailer opening a new branch in a new state is a sales signal. Today this information is discovered manually or months late. Automated detection would surface "Agrogalaxy abriu 3 filiais em MT este mes" in the executive briefing.

**What exists:** `cnpj_establishments` table (1,699 cached), `backfill-cnpj-establishments.js` script, branch delta tracking in `retailer_intelligence`.
**What's needed:** `CRAWLERS_DATABASE_URL` env var for the external RF crawlers DB, scheduled diff job, notification/alert UX.

---

### CRM Access Control — Multi-User RBAC

**Objective:** Move from the current single-user model (service-role key, UI-gated) to proper role-based access control where different team members see different tiers of CRM data.

**Value:** As the team grows, the Head of Credit shouldn't see Marketing's lead pipeline notes, and external partners should only see `agrisafe_published` tier. The `confidentiality` enum and `visibleTiers()` helper already exist — this feature wires them into the CRM read endpoints.

**What exists:** 3-tier confidentiality model (`public` / `agrisafe_published` / `agrisafe_confidential`), `resolveCallerTier()`, Supabase Auth + RLS.
**What's needed:** Tier filtering on `/api/crm/*` read endpoints, role assignment UI in Settings, `client_confidential` fourth tier activation for partner-NDA workflows.

---

### OneNote Meeting Import

**Objective:** Import meeting notes from Microsoft OneNote into the CRM meetings table, preserving the team's existing note-taking workflow.

**Value:** The commercial team already takes meeting notes in OneNote. Manual re-entry into Market Hub is friction that kills adoption. Auto-import means every client meeting automatically appears in the entity's CRM panel.

**What exists:** `meetings` table with `source = 'onenote_import'` enum value reserved.
**What's needed:** MS Graph API OAuth2 flow, OneNote page format parser, periodic sync job.

---

### Knowledge Agents — Cron-Driven Entity Enrichment

**Objective:** Deploy LLM agents on a schedule to scan ingested news, events, and regulatory changes, extract entity mentions, and enrich the knowledge base with structured insights.

**Value:** The entity-matcher today catches explicit name mentions. LLM agents can infer indirect relationships ("nova regulamentacao de credito rural" → affects all entities with CNAE 0111-3) and write richer `entity_mentions` + `knowledge_items` rows. This deepens the RAG layer without manual curation.

**What exists:** `entity-matcher.ts` (algorithmic), `entity_mentions` table, `knowledge_items` with embeddings, daily briefing pipeline.
**What's needed:** Agent prompts, scheduling via orchestrator, quality gate (human review queue for low-confidence extractions).

---

### Events Map — Geocoding & Organizer Linking

**Objective:** Plot all agro events on the Dashboard map and link event organizers to the 5-entity model.

**Value:** The Dashboard map currently shows weather, news, and RJ markers but events without coordinates are invisible. Geocoding the 52 existing events and linking organizer CNPJs to `legal_entities` completes the integrated intelligence picture — "where is the agro ecosystem active this month."

**What exists:** `events` table with lat/lng columns, 3-tier geocoder (`src/lib/geocode.ts`), `ensureLegalEntityUid()`.
**What's needed:** Run geocoder on existing rows, add `organizer_cnpj` extraction to event scrapers, route through entity resolution.

---

### Platform Polish

UX and operational improvements that make the platform production-grade:

- **Sentry error monitoring** — catch runtime errors before users report them
- **WCAG 2.1 accessibility** — screen reader support, keyboard navigation, contrast ratios
- **Dark mode** — toggle in Settings for late-night analysis sessions
- **Ctrl+K command palette** — quick-jump to any module, entity, or search
- **CSV/PDF export** — per-module data export for offline analysis and presentations
- **Institutional PDF briefing** — auto-generated executive briefing in AgriSafe brand format

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

Downstream products: Admin Portal, App Campo, Newsletter/WhatsApp outreach, External chat webapp.

### Hard Guardrails

See `CLAUDE.md` for full text. Summary:
1. **Algorithms first, LLMs last** — regex/Cheerio/SQL for extraction; LLMs only for prose + chat
2. **Vertex AI only, never Gemini API free tier** — free tier lets Google train on your prompts. AgriSafe data is commercial. All LLM calls go through Vertex AI (`src/lib/gemini.ts` auto-detects SA key file `agrisafe-*.json` in project root). R$1,800 GCP credits until July 2026. See `CLAUDE.md` → "AI / LLM Provider" for full setup instructions.
3. **Everything links to 5 entities** — FK or `entity_mentions`
4. **Public data only** in the public layer — `confidentiality` enum gates access
5. **Bilingual always** — PT-BR + EN via `src/lib/i18n.ts`
6. **MockBadge required** when a section uses mock data
