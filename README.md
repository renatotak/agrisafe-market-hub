# AgriSafe Market Hub

Executive market intelligence platform for [AgriSafe Tecnologia](https://agrisafe.agr.br) — a Brazilian agritech/fintech specializing in credit risk scoring, sales optimization, and crop monitoring for agribusiness.

## What This Is

Market Hub is the **knowledge engine** of the AgriSafe ecosystem. It captures public market data from 166+ catalogued sources, organizes it using a 4-tier knowledge hierarchy, and enables executives to generate proprietary insights for content creation, strategic planning, and client intelligence.

**Platform flow:** Ingest → Analyze → Create → Comply

## Architecture: Four Verticals

| Vertical | Modules | Purpose |
|----------|---------|---------| 
| **Ingestão de Dados** | Fontes de Dados, Registro de Fontes (166 sources) | Monitor and control all data pipelines |
| **Inteligência de Mercado** | Pulso do Mercado (BeefPoint + NA), Radar Competitivo, Notícias Agro, Eventos, Dashboard Map (Weather layer) | Capture and analyze market signals |
| **Marketing & Conteúdo** | Central de Conteúdo (articles, topic pipeline, calendar, campaigns) | Create proprietary content from intelligence |
| **Regulatório** | Marco Regulatório, Recuperação Judicial, AgInput Intelligence (SmartSolos + Agrofit) | Legal compliance & input intelligence |

## Tech Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4
- **Supabase** (PostgreSQL + RLS + pgvector) — 13 tables, 33K+ records
- **Recharts** for Bloomberg-style data visualization
- **Vercel** deployment with daily cron pipeline (6 sync jobs)

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
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Functional & non-functional requirements (FR/NFR) |
| [docs/KNOWLEDGE_ARCHITECTURE.md](docs/KNOWLEDGE_ARCHITECTURE.md) | 4-tier data hierarchy & tagging model |
| [docs/SCRAPER_SPECIFICATIONS.md](docs/SCRAPER_SPECIFICATIONS.md) | Scraper selectors, contracts, resilience checklists |
| [docs/CONTENT_HUB_SPEC.md](docs/CONTENT_HUB_SPEC.md) | Content Hub data model & production workflow |
| [docs/AGSF_Datalake_PRODUCT.md](docs/AGSF_Datalake_PRODUCT.md) | Datalake product tiers, personas, unit economics |

## Companion Platform

The **Admin Portal** (`agsf_admin_page`) manages internal operations (clients, contracts, credits). Market Hub is the external intelligence engine. Together they form the AgriSafe ecosystem.

## License

Private — All rights reserved. AgriSafe Tecnologia.
