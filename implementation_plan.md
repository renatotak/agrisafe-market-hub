# AgriSafe Market Hub — Implementation Plan

> **Last updated:** 2026-03-15  
> **Status:** Phase 4 (v1 build) complete. Preparing for Phase 5.

---

## Vision

A continuously-running, bilingual (PT-BR/EN) public market intelligence platform for AgriSafe Tecnologia. The platform aggregates exclusively public data to support marketing campaigns, content creation, competitive analysis, and event planning for the Brazilian agribusiness sector.

### Hard Constraints
- ❌ **No proprietary data** — Never store, ingest, or reference confidential client data, financial records, HR data, or credentials
- ❌ **No OneNote data migration** — OneNote was audited read-only; no content is copied into the platform
- ✅ **Public data only** — All data flows sourced from public APIs, government databases, and open feeds

---

## Phase 1 — Research AgriSafe ✅

**Objective:** Map AgriSafe's full service/product offering, target market, and brand voice.

**Findings:**
- **Company:** AgriSafe Tecnologia LTDA (São Paulo, Brazil)
- **Core pillars:** Sales optimization, credit risk management, crop monitoring
- **Platform:** Analyzes 160+ attributes via agro-specific scoring algorithm
- **Clients:** Agricultural resellers (irrigation, fertilizers, inputs) and financial institutions
- **Products:** SaaS platform, mobile app, AgriAcordo partnership, blog
- **Website:** agrisafe.agr.br

---

## Phase 2 — Read-Only OneNote Audit ✅

**Objective:** Understand existing knowledge structure without making any changes.

**OneNote structure (AgriSafe notebook — 8 sections, ~80+ pages):**

| Section | Content Type | Data Sensitivity |
|---------|-------------|------------------|
| General | Strategy, to-dos, Fiagro, market analysis, competitors, advisory board, LGPD | Mixed |
| SGT | Committee meetings, cedentes, NPL, StoneX migration | High |
| TI - Infra | System access, AWS, CERC, databases, platform configs | Critical |
| Comercial | Client relationship notes (ABC Banco, BTG, BB, BrasilAgro, Cosan...) | High |
| Marketing | Agencies, SEO, PR, website, competitors, B2C flows | Moderate |
| Investors | VC/partner notes, pitch materials, fundraising | Critical |
| HR | Candidate/employee profiles | Critical |
| Events | Conference notes (Google Cloud, Embrapa, NVIDIA, Agro ao Cubo...) | Low |

**Key insight:** The platform must run entirely parallel to OneNote, drawing zero proprietary data.

---

## Phase 3 — Architecture Design ✅

**5-module architecture approved:**

### Module 1: Agro Market Pulse
- Brazilian commodity prices (soy, corn, sugar, coffee, citrus, cotton)
- USD/BRL exchange rate, CEPEA indices
- CONAB/Embrapa crop forecasts
- BNDES rural credit rates, export data

### Module 2: Campaign Command Center
- Content calendar + campaign planner
- Pipeline tracking with status management (Draft → Planned → Active → Completed)
- Channel strategy (blog, social, email, webinar)
- Synced with market trends for timing

### Module 3: Article & Content Engine
- AI-powered idea bank
- Blog posts, social media, newsletters, press releases
- Aligned with AgriSafe's 3 pillars: credit risk, sales optimization, crop monitoring
- Trend-scored ideas based on real-time market data

### Module 4: Competitor & Industry Radar
- Public tracking of competitors: TerraMagna, Traive, Agrotools, Bart Digital, Agrosafety
- News monitoring, product launches, hiring signals
- All from public sources only

### Module 5: Event & Conference Tracker
- Forward-looking agro event calendar
- Febrabantech, Congresso Andav, Radar Agtech, ENCA, Agro ao Cubo, etc.
- Content opportunity identification per event

### Cross-cutting
- Bilingual toggle (PT-BR / EN) across all modules
- Persistent "Public Data Only" privacy badge

---

## Phase 4 — Build v1 Locally ✅

**Completed deliverables:**

| Item | Status | Details |
|------|--------|---------|
| Next.js 16 project setup | ✅ | App Router, TypeScript 5.9 |
| Tailwind CSS 4 styling | ✅ | PostCSS integration, custom design tokens |
| Dashboard overview | ✅ | Stats row + module cards with navigation |
| Sidebar navigation | ✅ | Dark theme with all 5 module links |
| Market Pulse module | ✅ | Commodity table, key indicators, trend arrows |
| Campaign Center module | ✅ | Pipeline view, detail panel, status filters |
| Content Engine module | ✅ | Idea cards, pillar filtering, trend scores |
| Competitor Radar module | ✅ | Competitor profiles, signal tracking |
| Event Tracker module | ✅ | Timeline view, content opportunity callouts |
| i18n system | ✅ | Full PT-BR/EN translation coverage |
| Privacy badge | ✅ | Persistent "Public Data Only" indicator |
| Static data layer | ✅ | 4 TypeScript data files (market, campaigns, competitors, events) |
| Build passes | ✅ | Zero compilation errors |
| GitHub sync | ✅ | renatotak/agsf_mkthub — force pushed, fully synced |

**Current data layer:** Static TypeScript files with sample data. Ready for API/database migration.

---

## Phase 5 — Supabase + Vercel Deployment 🔲

**Objective:** Migrate from static data to Supabase and deploy live to Vercel.

### 5.1 Supabase Setup
- [ ] Create Supabase project (free tier)
- [ ] Design PostgreSQL schema for all 5 modules
- [ ] Create tables: `commodities`, `market_indicators`, `campaigns`, `content_ideas`, `competitors`, `competitor_signals`, `events`
- [ ] Set up Row Level Security (RLS) policies
- [ ] Seed database with current static data
- [ ] Create Supabase client config in Next.js

### 5.2 API Integration
- [ ] Replace static data imports with Supabase queries
- [ ] Implement server-side data fetching (React Server Components)
- [ ] Add error handling and loading states
- [ ] Implement data refresh mechanism

### 5.3 Vercel Deployment
- [ ] Connect GitHub repo to Vercel
- [ ] Configure environment variables (Supabase URL, anon key)
- [ ] Deploy and verify all modules on live URL
- [ ] Set up custom domain (optional)

---

## Phase 6 — Live Data & AI Features 🔲

**Objective:** Connect real-time public data feeds and implement AI content generation.

### 6.1 Public Data APIs
- [ ] CEPEA API integration (commodity prices)
- [ ] BCB API (USD/BRL exchange rate, SELIC)
- [ ] CONAB data feeds (crop forecasts)
- [ ] MDIC/ComexStat (export data)
- [ ] Set up scheduled data refresh (cron jobs via Vercel)

### 6.2 AI Content Generation
- [ ] Integrate LLM API for content idea generation
- [ ] Auto-generate blog post outlines based on market trends
- [ ] Social media copy suggestions
- [ ] Trend-to-content matching algorithm

### 6.3 Competitor Monitoring
- [ ] Set up RSS/news feed ingestion for competitor mentions
- [ ] Public hiring signal detection
- [ ] Product launch tracking via public announcements

---

## Phase 7 — Polish & Scale 🔲

**Objective:** Production hardening, analytics, and user experience refinement.

- [ ] Add data visualization charts (recharts or chart.js)
- [ ] Implement responsive design for mobile/tablet
- [ ] Add user authentication (optional, for team access)
- [ ] Performance optimization (ISR, caching)
- [ ] SEO optimization for public pages
- [ ] Error monitoring (Sentry)
- [ ] Analytics integration
- [ ] Accessibility audit (WCAG 2.1)
