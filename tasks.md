# AgriSafe Market Hub — Task Tracker

> **Last updated:** 2026-03-15 10:30  
> Legend: `[x]` Done · `[/]` In progress · `[ ]` To do

---

## Phase 1 — Research AgriSafe
- [x] Analyze AgriSafe website (agrisafe.agr.br)
- [x] Map service offerings: sales optimization, credit risk, crop monitoring
- [x] Identify target market: ag resellers, financial institutions
- [x] Document brand pillars and product portfolio

## Phase 2 — OneNote Audit (Read-Only)
- [x] Access OneNote Online via browser
- [x] Inventory all 8 sections (~80+ pages)
- [x] Classify content sensitivity per section
- [x] Confirm public-data-only constraint based on findings

## Phase 3 — Architecture Design
- [x] Define 5-module architecture
- [x] Design Market Pulse data model (commodities, indicators)
- [x] Design Campaign Center data model (pipeline, statuses, channels)
- [x] Design Content Engine data model (ideas, pillars, types)
- [x] Design Competitor Radar data model (profiles, signals)
- [x] Design Event Tracker data model (events, opportunities)
- [x] Specify bilingual (PT-BR/EN) i18n strategy
- [x] Confirm privacy constraint architecture (no proprietary data)

## Phase 4 — Build v1 Locally
- [x] Initialize Next.js 16 + TypeScript project
- [x] Configure Tailwind CSS 4 + PostCSS
- [x] Create design tokens and global styles (`globals.css`)
- [x] Build i18n translation system (`i18n.ts`)
- [x] Create static data files
  - [x] `market.ts` — commodity prices, indicators
  - [x] `campaigns.ts` — campaign pipeline data
  - [x] `competitors.ts` — competitor profiles & signals
  - [x] `events.ts` — agro event calendar
- [x] Build components
  - [x] `MarketPulse.tsx` — commodity table, indicators, trend arrows
  - [x] `CampaignCenter.tsx` — pipeline view, detail panel
  - [x] `ContentEngine.tsx` — idea cards, pillar filtering
  - [x] `CompetitorRadar.tsx` — competitor profiles, signal tracking
  - [x] `EventTracker.tsx` — timeline view, content opportunities
- [x] Build main dashboard (`page.tsx`)
  - [x] Sidebar navigation (dark theme)
  - [x] Dashboard overview with stats
  - [x] Module routing
  - [x] Privacy badge
  - [x] Language toggle
- [x] Build root layout (`layout.tsx`)
- [x] Verify build passes (zero errors)
- [x] Sync to GitHub (`renatotak/agsf_mkthub`)
- [x] Configure git email for GitHub privacy compliance
- [x] Create project documentation (README, implementation plan, tasks)

## Phase 5 — Supabase + Vercel Deployment
- [x] Create Supabase project (using existing project `uclxmhjzutiaksfhqszn`)
- [x] Design PostgreSQL schema
  - [x] `commodity_prices` table
  - [x] `market_indicators` table
  - [x] `campaigns` table
  - [x] `content_ideas` table
  - [x] `competitors` table
  - [x] `competitor_signals` table
  - [x] `events` table
- [x] Set up Row Level Security (RLS) policies
- [x] Seed database with current static data
- [x] Create Supabase client config in Next.js (`src/lib/supabase.ts`)
- [x] Replace static imports with Supabase queries
- [x] Add loading states and error handling
- [x] Connect GitHub to Vercel
- [x] Configure environment variables
- [x] Deploy to Vercel
- [x] Verify live deployment

## Phase 6 — Automated Data Ingestion
- [ ] Implement Vercel cron jobs for scheduled data refresh
- [ ] Integrate CEPEA API & Web Scraping (commodity prices)
- [ ] Integrate BCB API (USD/BRL, SELIC)
- [ ] Integrate CONAB data feeds (crop forecasts)
- [ ] Integrate MDIC/ComexStat (exports)
- [ ] Set up RSS/news feeds for competitor monitoring
- [ ] Implement public hiring signal detection

## Phase 7 — Vector Database & AI Integration
- [ ] Enable `pgvector` extension in Supabase
- [ ] Create vector database schema and embeddings tables
- [ ] Implement data chunking and embedding generation pipeline (e.g., OpenAI `text-embedding-3-small`)
- [ ] Integrate LLM API (OpenAI) for content idea generation using Vector Search (RAG)
- [ ] Implement auto-generated blog outlines and social media copy suggestions

## Phase 8 — Proprietary Data Module (New Feature)
- [ ] Review and lift "public-data-only" constraint for authenticated users
- [ ] Design secure database schema for proprietary data (internal reports, client feedback, sales data)
- [ ] Implement strict Row Level Security (RLS) policies to ensure proprietary data is fully isolated
- [ ] Build UX/UI for "Internal Insights Vault" module (accessible only to team members)
- [ ] Create data capture forms and API routes for manual/automated proprietary data ingestion

## Phase 9 — Polish & Scale
- [ ] Add data visualization charts (Recharts or Chart.js)
- [ ] Performance optimization (Next.js ISR, caching)
- [ ] SEO optimization and Metadata
- [ ] Error monitoring (Sentry)
- [ ] Analytics integration
- [ ] Accessibility audit (WCAG 2.1)
