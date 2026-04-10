# AgriSafe Market Hub

Executive market intelligence platform for [AgriSafe Tecnologia](https://agrisafe.agr.br) — a Brazilian agritech/fintech specializing in credit risk scoring, sales optimization, and crop monitoring for agribusiness.

## What This Is

Market Hub is the **knowledge engine** of the AgriSafe ecosystem. It captures public market data from 176 catalogued sources, organizes it around the **5-entity model** of Brazilian agribusiness (legal entities, farms, assets, commercial activities, AgriSafe services), and enables executives to generate proprietary insights for content creation, strategic planning, and client intelligence.

**Platform flow:** Ingest → Analyze → Create → Comply

## Architecture: Four Verticals

| Vertical | Modules | Purpose |
|----------|---------|---------|
| **Ingestão de Dados** | Fontes de Dados (Scraper Health tab + **Source CRUD** with Add / Edit / Delete from the UI, Phase 25), 176 sources in `data_sources` table, weekly auto-healthcheck cron | Monitor and control all data pipelines |
| **Inteligência de Mercado** | Pulso do Mercado (BCB + NA + FAOSTAT + WB Pink Sheet macro), Radar Competitivo, Notícias Agro (Reading Room ingest), Eventos Agro (AgroAgenda + AgroAdvance), Diretório de Canais (CRM-style), Diretório de Indústrias, Dashboard Map | Capture and analyze market signals |
| **Marketing & Conteúdo** | Central de Conteúdo (articles, topic pipeline, calendar, campaigns) | Create proprietary content from intelligence |
| **Regulatório** | Marco Regulatório (CNJ + CVM + BCB + key laws + norms-affecting-entity view), Recuperação Judicial (CRUD with BrasilAPI + DDG debt scrape), AgInput Intelligence (SmartSolos + AGROFIT + Bioinsumos) | Legal compliance & input intelligence |

## Tech Stack

- **Next.js 16** (App Router) + TypeScript strict + Tailwind CSS 4
- **Supabase** (PostgreSQL + RLS + pgvector) — 57 tables, 45 SQL migrations, 5-entity model live
- **Recharts** + `@vis.gl/react-google-maps` for Bloomberg-style data visualization
- **Hybrid deployment** — Vercel hosts the Next.js webapp + manual cron triggers; **20 cron jobs run on a 24/7 Mac mini via launchd** (Phase 25), each with its own schedule. See [launchd/README.md](launchd/README.md) for the install path. Vercel Hobby's single-cron limit is now history.
- **Reading Room Chrome extension** at `chrome-extensions/reading-room/` auto-syncs saved articles to `/api/reading-room/ingest`

## Quick Start

```bash
npm install
# Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET to .env.local
npm run dev
```

## Documentation

| File | What it's for |
|------|--------------|
| [AGENTS.md](AGENTS.md) | **AI agents** — cross-tool universal context (Cursor, Gemini CLI, Windsurf, etc.) |
| [CLAUDE.md](CLAUDE.md) | **AI agents** — Claude-specific context & tool-specific workflow |
| [PLAYBOOK.md](PLAYBOOK.md) | **Operators** — data journeys, operational how-tos, persona routines |
| [ROADMAP.md](ROADMAP.md) | **Team** — current status, pending tasks, phase history |
| [launchd/README.md](launchd/README.md) | **Mac ops** — Phase 25 launchd cron pipeline install + ops manual |
| [documentation/REQUIREMENTS.md](documentation/REQUIREMENTS.md) | Functional & non-functional requirements (FR/NFR) |
| [documentation/KNOWLEDGE_ARCHITECTURE.md](documentation/KNOWLEDGE_ARCHITECTURE.md) | 4-tier data hierarchy & tagging model |
| [documentation/SCRAPER_SPECIFICATIONS.md](documentation/SCRAPER_SPECIFICATIONS.md) | Scraper selectors, contracts, resilience checklists |
| [documentation/CONTENT_HUB_SPEC.md](documentation/CONTENT_HUB_SPEC.md) | Content Hub data model & production workflow |
| [documentation/AGSF_Datalake_PRODUCT.md](documentation/AGSF_Datalake_PRODUCT.md) | Datalake product tiers, personas, unit economics |

## Companion Platform

The **Admin Portal** (`agsf_admin_page`) manages internal operations (clients, contracts, credits). Market Hub is the external intelligence engine. Together they form the AgriSafe ecosystem.

## License

Private — All rights reserved. AgriSafe Tecnologia.
