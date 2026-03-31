# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgriSafe Market Hub (`agrisafe-hub`) is a bilingual (PT-BR/EN) public market intelligence platform for AgriSafe Tecnologia, a Brazilian agritech company. It aggregates **exclusively public data** (no proprietary client data, credentials, or PII) from public APIs, government databases, RSS feeds, and open market feeds to produce market reports, agro news, retailer directories, judicial recovery monitoring, campaign planning, competitor tracking, and event management for Brazilian agribusiness.

## Commands

```bash
npm run dev              # Start dev server (Next.js)
npm run build            # Production build
npm run start            # Start production server
npm run import-retailers # One-time import of retailers from Excel into Supabase
```

No test runner or linter is currently configured.

## Architecture

- **Framework:** Next.js 16 (App Router) with TypeScript strict mode
- **Styling:** Tailwind CSS 4 via PostCSS
- **Backend:** Supabase (PostgreSQL with RLS) — browser client, server client, and admin client (bypasses RLS for cron jobs)
- **Auth:** Supabase Auth + SSR with middleware-based route protection
- **AI:** OpenAI (scaffolded, not yet integrated)
- **Data ingestion:** BCB SGS API (commodities, FX, Selic), RSS feeds (news, legal), web scraping (cheerio)
- **Deployment:** Vercel with single consolidated daily cron at 08:00 UTC (`/api/cron/sync-all`)
- **Path alias:** `@/*` maps to `./src/*`

### Module Structure

The dashboard (`src/app/page.tsx`) renders 8 modules via `activeModule` state routing:

| Module | Component | Data | Supabase Tables |
|--------|-----------|------|-----------------|
| Market Pulse | `MarketPulse.tsx` | `market.ts` | `commodity_prices`, `market_indicators` |
| Campaign Center | `CampaignCenter.tsx` | `campaigns.ts` | `campaigns` |
| Content Engine | `ContentEngine.tsx` | `campaigns.ts` | `content_ideas` |
| Competitor Radar | `CompetitorRadar.tsx` | `competitors.ts` | `competitors`, `competitor_signals` |
| Event Tracker | `EventTracker.tsx` | `events.ts` | `events` |
| Agro News | `AgroNews.tsx` | `news.ts` | `agro_news`, `highlighted_producers` |
| Retailers Directory | `RetailersDirectory.tsx` | `retailers.ts` | `retailers`, `retailer_locations` |
| Recuperação Judicial | `RecuperacaoJudicial.tsx` | `recuperacao.ts` | `recuperacao_judicial` |

### Cron Pipeline

All automated data gathering runs through `/api/cron/sync-all` (single Vercel cron for Hobby plan compatibility), which dispatches:

1. **sync-market-data** — Fetches commodity prices (BCB SGS series 11752-11757) and macro indicators (USD/BRL series 1, Selic series 432)
2. **sync-agro-news** — Parses RSS feeds (Canal Rural, Sucesso no Campo, Agrolink, CNA) and matches against highlighted producer keywords
3. **sync-recuperacao-judicial** — Parses legal news RSS (ConJur, Migalhas), filters for agro-related judicial recovery cases

Individual cron routes can also be called directly for testing.

### Key Directories

- `src/components/` — 8 module components (each fetches from Supabase with loading states)
- `src/data/` — TypeScript interfaces and seed/fallback data for each module
- `src/lib/i18n.ts` — All UI translations (PT-BR and EN); usage: `const tr = t(lang)`
- `src/lib/supabase.ts` — Browser client singleton
- `src/utils/supabase/` — Client factories: `client.ts` (browser), `server.ts` (server), `admin.ts` (service role for cron), `middleware.ts` (session refresh)
- `src/app/api/cron/` — Cron routes: `sync-all` (orchestrator), `sync-market-data`, `sync-agro-news`, `sync-recuperacao-judicial`
- `src/app/api/ai/` — AI route: `generate-ideas` (mock impl)
- `src/scripts/` — One-time scripts: `import-retailers.ts` (Excel → Supabase)
- `src/app/login/` — Auth page + server actions

### Auth Flow

Middleware (`src/middleware.ts` → `src/utils/supabase/middleware.ts`) protects all routes except `/login` and `/api/cron/*`. Unauthenticated users redirect to `/login`; authenticated users on `/login` redirect to `/`.

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` — Admin access (bypasses RLS, required for cron writes)
- `CRON_SECRET` — Bearer token for Vercel cron endpoint

## Design Tokens

- Primary: `--agri-green: #16a34a`
- Dark: `--agri-dark: #0f172a`
- Light: `--agri-light: #f0fdf4`
- Accent: `--agri-yellow: #eab308`

## Important Constraints

- **Public data only** — never store, ingest, or reference proprietary client data, financial records, or PII
- **Bilingual always** — every user-facing string must exist in both PT-BR and EN via `src/lib/i18n.ts`
- **Supabase tables required** — New modules need their Supabase tables created before data can be ingested (see `src/data/*.ts` for schemas)
- **Single cron** — Vercel Hobby plan limits to 2 crons; `sync-all` consolidates all jobs into 1
