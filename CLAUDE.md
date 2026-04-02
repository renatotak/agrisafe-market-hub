# CLAUDE.md

## Project Overview

AgriSafe Market Hub is the **knowledge engine** of the AgriSafe ecosystem — a bilingual (PT-BR/EN) executive intelligence platform where AgriSafe captures, organizes, and transforms public market knowledge into proprietary insights. It is the foundation for an AI-first digital twin that will power client intelligence, content creation, and strategic decision-making.

The platform flow: **Ingest → Analyze → Create → Comply**

- **Admin Portal** (`agsf_admin_page`) manages internal operations (clients, contracts, credits)
- **Market Hub** (`agsf-mkthub`) provides external market intelligence and content creation tools

## Commands

```bash
npm run dev              # Start dev server (Next.js)
npm run build            # Production build
npm run start            # Start production server
node src/scripts/import-canais.js     # Import oraculo canais CSV (24K channels)
node src/scripts/build-source-registry.js  # Rebuild 166-source registry from crawler CSVs
node src/scripts/seed-content.js      # Seed articles + topics to Supabase
```

No test runner or linter is currently configured.

## Architecture

- **Framework:** Next.js 16 (App Router) with TypeScript strict mode
- **Styling:** Tailwind CSS 4 via PostCSS
- **Backend:** Supabase (PostgreSQL with RLS + pgvector)
- **Auth:** Supabase Auth + SSR with middleware-based route protection
- **AI:** OpenAI (scaffolded; not yet live)
- **Charts:** Recharts (MIT)
- **Data ingestion:** BCB SGS API, RSS feeds (`rss-parser`), web scraping (`cheerio`), CSV/Excel imports
- **Deployment:** Vercel with consolidated daily cron at 08:00 UTC
- **Path alias:** `@/*` maps to `./src/*`

### Four-Vertical Architecture

```
INGESTÃO DE DADOS (Data Ingestion)
  Fontes de Dados        — DataSources.tsx (sync monitoring, 3 tabs)
  Registro de Fontes     — SourceRegistry.tsx (166 catalogued sources with URL health)

INTELIGÊNCIA DE MERCADO (Market Intelligence)
  Pulso do Mercado       — MarketPulse.tsx (Bloomberg-style: movers, alerts, ruptures, deep-dive)
  Radar Competitivo      — CompetitorRadar.tsx (signals, charts, timeline)
  Notícias Agro          — AgroNews.tsx (RSS aggregation, analytics)
  Eventos                — EventTracker.tsx (industry events timeline)
  Diretório de Canais    — RetailersDirectory.tsx (9,328 companies, 24,275 locations)

MARKETING & CONTEÚDO (Marketing & Content)
  Central de Conteúdo    — ContentHub.tsx (4 tabs: articles, topics, calendar, campaigns)

REGULATÓRIO (Regulatory)
  Marco Regulatório      — RegulatoryFramework.tsx (CMN/CVM/BCB/MAPA norms)
  Recuperação Judicial   — RecuperacaoJudicial.tsx (legal RSS dual-filter)
```

### Cron Pipeline

`/api/cron/sync-all` dispatches sequentially:
1. **sync-market-data** — BCB SGS (6 commodities + USD/BRL + Selic) → `commodity_prices`, `market_indicators`, `commodity_price_history`
2. **sync-agro-news** — 4 RSS feeds → `agro_news` (auto-categorize + producer matching)
3. **sync-recuperacao-judicial** — 2 legal RSS → `recuperacao_judicial` (dual agro filter)
4. **archive-old-news** — 3+ month articles → OpenAI summaries + pgvector embeddings → `news_knowledge`
5. **sync-regulatory** — 3 legal RSS → `regulatory_norms` (regulatory body + agro finance filter)

All cron routes log to `sync_logs` via `src/lib/sync-logger.ts`.

### Key Directories

- `src/components/` — 10 module components + Header, Sidebar, AgriSafeLogo, ui/ primitives
- `src/components/ui/` — Card, Badge, Button, KpiCard, DataTable, MockBadge
- `src/data/mock.ts` — Centralized mock data with MockBadge watermark when shown
- `src/data/source-registry.json` — 166 public data sources with URL health status
- `src/lib/i18n.ts` — All UI translations (PT-BR and EN)
- `src/lib/sync-logger.ts` — Sync logging utility for cron routes
- `src/app/api/cron/` — 6 cron routes including sync-all orchestrator
- `src/scripts/` — Import scripts for channels, sources, content seeding
- `src/db/migrations/` — 7 SQL migration files (001-007)
- `docs/` — Knowledge architecture, datalake specs, admin playbook

### Data in Supabase (Live)

| Table | Rows | Source | Live |
|-------|------|--------|------|
| `commodity_prices` | 6 | BCB SGS | Yes |
| `commodity_price_history` | 6+ | BCB SGS daily | Yes |
| `market_indicators` | 6 | BCB SGS | Yes |
| `agro_news` | 25+ | RSS feeds | Yes |
| `competitors` | 5 | Seed | Seed |
| `competitor_signals` | 6 | Seed | Seed |
| `events` | 6 | Seed | Seed |
| `campaigns` | 4 | Seed | Seed |
| `content_ideas` | 6 | Seed | Seed |
| `published_articles` | 6 | Seed | Seed |
| `content_topics` | 5 | Seed | Seed |
| `recuperacao_judicial` | 0 | RSS (strict filter) | Yes |
| `retailers` | 9,328 | Oraculo CSV | Yes |
| `retailer_locations` | 24,275 | Oraculo CSV | Yes |
| `sync_logs` | 3+ | Cron logging | Yes |
| `regulatory_norms` | 0 | RSS (strict filter) | Yes |
| `news_knowledge` | 0 | Archive pipeline | Pending |

## New Data Source Orchestration Workflow

When adding a new public data source to the platform, follow this workflow:

### Step 1: Analyze the Source
- Identify URL, data format (API/RSS/CSV/HTML), update frequency, and data schema
- Determine scraping method: REST API (preferred) > RSS feed > structured download > HTML scraping
- Document rationale for chosen method in the source registry notes field
- Check if source requires authentication, captcha, or rate limiting

### Step 2: Check for Conflicts
- Query existing sources in `src/data/source-registry.json` for overlapping data
- If overlap exists, document both sources and flag for user decision on primary source
- Example: BCB SGS and CEPEA both provide commodity prices — user decides which is primary

### Step 3: Register the Source
- Add to `src/data/source-registry.json` with all metadata fields
- Run URL availability check
- Categorize: fiscal, socioambiental, financeiro, agropecuaria, agronomico, logistica, geografias

### Step 4: Build Ingestion
- Create cron route in `src/app/api/cron/sync-{source}/route.ts`
- Add sync logging via `logSync()` from `src/lib/sync-logger.ts`
- Add to `sync-all` orchestrator
- Create/update Supabase migration for target table

### Step 5: Sample Check
- Run the cron route manually and verify data quality
- Check: record count, field completeness, data freshness, encoding
- Document results in sync_logs

### Step 6: Persona Validation
- Test the data through the lens of each relevant persona (from playbook):
  - CEO: Does this appear in Dashboard overview? Is it decision-relevant?
  - Head Inteligência: Is the data fresh? Is quality acceptable?
  - Marketing Analyst: Can this feed content creation?
  - Consultor de Crédito: Does this affect credit risk assessment?
- If data doesn't create value for any persona, reconsider adding it

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Optional:
- `OPENAI_API_KEY` — For archive-old-news and future AI integration

## Design Tokens (from admin portal)

- Primary: `#5B7A2F` (olive green) / Secondary: `#7FA02B` / Dark: `#4A6328`
- Warning: `#E8722A` (orange)
- Page bg: `#F7F4EF` / Sidebar: `#F5F5F0` / Borders: `#EFEADF`
- Text: `#3D382F` (warm brown)
- Font: Inter (300-800) / Icons: Material Icons Outlined + Lucide React

## Important Constraints

- **Public data only** — Never store proprietary client data, financial records, or PII
- **Bilingual always** — Every user-facing string must exist in PT-BR and EN via `src/lib/i18n.ts`
- **MockBadge required** — Any section showing non-live data must display the MOCKED DATA watermark
- **Single cron** — Vercel Hobby plan limits crons; `sync-all` consolidates all jobs
- **Knowledge Architecture** — Follow the 4-tier hierarchy in `docs/KNOWLEDGE_ARCHITECTURE.md`
