# AGENTS.md — AgriSafe Market Hub

> Universal agent context file (Cursor · Gemini CLI · Windsurf · GitHub Copilot · Antigravity).
> Tool-specific overrides in CLAUDE.md. Human overview in README.md.

## What This Project Is

AgriSafe Market Hub (`agsf-mkthub`) is a **Next.js 16** executive intelligence platform for AgriSafe Tecnologia — a Brazilian agritech/fintech focused on agribusiness credit and commercial intelligence. It ingests public market data from 166+ sources, organizes it around the **5 core entities** of Brazilian agribusiness, and surfaces it through a Bloomberg-style dashboard for the AgriSafe team.

**Platform flow:** Ingest → Analyze → Create → Comply

## Stack at a Glance

```
Next.js 16 (App Router) + TypeScript strict + Tailwind CSS 4
Supabase (PostgreSQL + RLS + pgvector)
Vercel (daily cron, single job limit on Hobby plan)
Path alias: @/* → ./src/*
Scrapers: Cheerio (server) + Python scripts in src/scripts/ (NO LLM-based scraping)
```

## ⚖️ Critical Rules — Never Violate

### 1. Algorithms first, LLMs last

LLM tools (Gemini, OpenAI, Claude) are **last resort**, not the default. Use them only for:
- **Prose generation** (first-draft articles, executive summaries, narratives)
- **Conversational interfaces** (chat over the knowledge base / RAG queries)
- **Last-resort fuzzy matching** when no deterministic key is available

For everything else — parsing, classification, matching, geocoding, aggregation, ranking — write **deterministic algorithms** in TypeScript or Python. They are free, reproducible, fast, and don't hallucinate IDs.

When you're tempted to add an LLM call, first ask: "Could a Python script or a regex do this?" If yes, do that.

### 2. The 5-entity data model — everything links back to these nodes

Every record stored in this database must be linkable, via foreign key or stable identifier, to one or more of these five nodes. **For the full schema, junctions, migration plan, and rationale, see `docs/ENTITY_MODEL.md`** (the canonical reference).

| # | Node | Stable identifier | Notes |
|---|---|---|---|
| 1 | **Legal Entity** | `entity_uid` PK + `tax_id` (CPF or CNPJ) | The universal "actor". A single CNPJ can simultaneously be industry + retailer + producer + AgriSafe client — roles attach via `entity_roles` junction. |
| 2 | **Farm** | `farm_uid` (CAR/INCRA/centroid) | Multi-shareholder ownership via `farm_ownership` junction (`entity_uid` + `share_pct`). |
| 3 | **Asset** | `asset_uid` + `asset_type` | CPR, loan, commercial note, insurance, barter. Multi-stakeholder via `asset_parties` junction (borrower, lender, guarantor, beneficiary). |
| 4 | **Commercial Activity** | `activity_uid` + `activity_type` | Ag-input sale, barter, grain trade, livestock sale. |
| 5 | **AgriSafe Service** | `service_uid` + `service_type` | Credit intelligence, monitoring, collection, market_hub_access. Client side is **always a Group** (even of size 1, so a "Família Silva" client bundles multiple CPFs/CNPJs). Service target is polymorphic via `agrisafe_service_targets(target_type, target_id)`. |

**Junction & support tables:**
- `entity_roles(entity_uid, role_type)` — multi-role per entity
- `groups(group_uid, group_type, name)` + `group_members` — named collections (clients, cooperatives, portfolios)
- `farm_ownership` — multi-shareholder farms (CPF + CNPJ mix)
- `asset_parties` — multi-stakeholder assets
- `agrisafe_service_targets(service_uid, target_type, target_id)` — polymorphic targeting (farm | entity | group | asset)
- `entity_mentions(entity_uid, source_table, source_id)` — news/reg cross-references

**Multi-stakeholder rule:**
> Multi-row junctions (`farm_ownership`, `asset_parties`) **beat** polymorphic groups,
> **except** when the collective itself has identity worth naming
> (clients, cooperatives, internal portfolios) — those use `groups`.

**FK rules:**
- Tables describing an entity → FK to `legal_entities(entity_uid)`
- Tables describing a farm → FK to `farms(farm_uid)`
- Tables describing a financial instrument → FK to `assets(asset_uid)`
- Cross-cutting facts (news, regulations, events) → write rows to `entity_mentions` instead of a direct FK

**Building a feature without thinking about which node it ties to is a bug.** If you can't justify how a new column or table relates back to one of the five nodes, it doesn't belong in this database.

### 3. Other hard constraints

1. **Public data only** — Never store client PII, financial records, or proprietary company data outside the `agrisafe_confidential` tier
2. **Bilingual always** — Every UI string lives in `src/lib/i18n.ts` in both `pt` and `en`
3. **MockBadge required** — Any section showing mock/seed data must render the `<MockBadge />` watermark
4. **Single cron** — Do not add new Vercel cron entries; add all jobs inside `sync-all` orchestrator
5. **Admin client for writes** — All DB writes use `createAdminClient()` (service role, bypasses RLS)
6. **Logging mandatory** — Every cron route must call `logSync()` from `src/lib/sync-logger.ts`
7. **Confidentiality tier** — Tables containing AgriSafe-proprietary data must carry a `confidentiality` enum (`public`, `agrisafe_published`, `agrisafe_confidential`)

## Module Map

```
src/components/
  DataSources.tsx          — Source registry & sync monitoring (Vertical 1)
  MarketPulse.tsx          — Highlights + Culture/Region tabs + Logistics + Yahoo intl chart (Vertical 2)
  CommodityMap.tsx         — Regional price map (controlled by parent slug)
  CompetitorRadar.tsx      — Competitor signals & timeline (Vertical 2)
  AgroNews.tsx             — RSS news aggregation (Vertical 2)
  EventTracker.tsx         — Industry events calendar (Vertical 2)
  RetailersDirectory.tsx   — 9,328 channels / 24,275 locations (Vertical 2 → CRM)
  RiskSignals.tsx          — Diretório × RJ cross-reference panel
  ContentHub.tsx           — AgriSafe-only articles & campaigns (Vertical 3)
  RegulatoryFramework.tsx  — CMN/CVM/BCB/MAPA norms (Vertical 4)
  RecuperacaoJudicial.tsx  — Judicial recovery RSS monitor + Receita Federal seed (Vertical 4)
  KnowledgeBase.tsx        — Semantic search + Mind Map tab (Knowledge)
  KnowledgeMindMap.tsx     — Interactive 22-table 4-tier visualization
  Settings.tsx             — Help / About / module guide
```

## Key Paths

| Path | What it Contains |
|------|-----------------|
| `src/data/mock.ts` | All fallback mock data (shown with MockBadge) |
| `src/data/source-registry.json` | 166 public sources with URL health |
| `src/lib/i18n.ts` | All PT-BR / EN translations |
| `src/lib/sync-logger.ts` | `logSync()` utility for cron routes |
| `src/app/api/cron/` | 7 cron routes + `sync-all` orchestrator |
| `src/app/api/prices-na/` | Live NA prices (10 min ISR, no Supabase) |
| `src/app/api/intl-futures/` | Yahoo Finance v8 proxy (CBOT/ICE/CME futures) |
| `src/app/api/events-na/` | AgroAgenda events (1 hr ISR, no Supabase) |
| `src/app/api/rj-scan/` | DuckDuckGo web scan for distressed agro companies |
| `src/db/migrations/` | SQL migrations 001–017 |

## Dev Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Verify TypeScript before PR
```

## Adding a Module (Checklist)

- [ ] Identify which of the **5 entities** the module reads/writes
- [ ] `src/data/{module}.ts` — interfaces + seed data
- [ ] `src/components/{Module}.tsx` — import `Lang`, fetch Supabase, fall back to seed
- [ ] `src/lib/i18n.ts` — add keys to both `pt` and `en`
- [ ] `src/app/page.tsx` — add to `Module` type + sidebar + render
- [ ] `src/db/migrations/` — new SQL file with RLS enabled, FK to anchor entity
- [ ] Update `CLAUDE.md` architecture table + `ROADMAP.md` if phase changes

## Adding a Data Source (Checklist)

- [ ] **Use a deterministic algorithm** (Cheerio / Python). Do NOT use LLM extraction.
- [ ] Check `source-registry.json` for conflicts
- [ ] Register in `source-registry.json`
- [ ] Create `src/app/api/cron/sync-{source}/route.ts`
- [ ] Validate `CRON_SECRET` Bearer token
- [ ] Call `logSync()` on success and failure
- [ ] Add to `sync-all` orchestrator
- [ ] Create Supabase migration for target table — **must include FK to one of the 5 entity anchors**
- [ ] Document selectors in `docs/SCRAPER_SPECIFICATIONS.md`

## Reference Documents

| Need | Document |
|------|----------|
| **Entity model (5 nodes + junctions) — canonical schema** | **`docs/ENTITY_MODEL.md`** |
| Latest user-defined task list (2026-04-06) | `docs/TODO_2026-04-06.md` |
| Data journeys & operational how-tos | `PLAYBOOK.md` |
| Roadmap, completed phases, pending tasks | `ROADMAP.md` |
| Functional & non-functional requirements | `docs/REQUIREMENTS.md` |
| Scraper selectors & contracts | `docs/SCRAPER_SPECIFICATIONS.md` |
| 4-tier knowledge architecture & tagging | `docs/KNOWLEDGE_ARCHITECTURE.md` |
| Content Hub data model & workflow | `docs/CONTENT_HUB_SPEC.md` |
| Datalake product tiers & personas | `docs/AGSF_Datalake_PRODUCT.md` |

## Design Tokens (from Admin Portal)

```
Primary   #5B7A2F (olive)   Secondary #7FA02B   Warning  #E8722A
Bg        #F7F4EF           Sidebar   #F5F5F0   Border   #EFEADF
Text      #3D382F (warm brown)
Font: Inter 300–800
```
