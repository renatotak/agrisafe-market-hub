# AgriSafe Market Hub

Executive market intelligence platform for [AgriSafe Tecnologia](https://agrisafe.agr.br) — a Brazilian agritech/fintech company specializing in credit risk scoring, sales optimization, and crop monitoring for agribusiness.

## What This Is

Market Hub is the **knowledge engine** of the AgriSafe ecosystem. It captures public market data from 166+ catalogued sources, organizes it using a 4-tier knowledge hierarchy, and enables executives to generate proprietary insights for content creation, strategic planning, and client intelligence.

**Platform flow:** Ingest → Analyze → Create → Comply

## Architecture: Four Verticals

| Vertical | Modules | Purpose |
|----------|---------|---------|
| **Ingestao de Dados** | Fontes de Dados, Registro de Fontes (166 sources) | Monitor and control all data pipelines |
| **Inteligencia de Mercado** | Pulso do Mercado (Bloomberg-style), Radar Competitivo, Noticias Agro, Eventos, Diretorio de Canais (24K+) | Capture and analyze market signals |
| **Marketing & Conteudo** | Central de Conteudo (articles, topics 10+ weeks, calendar, campaigns) | Create proprietary content from intelligence |
| **Regulatorio** | Marco Regulatorio (CMN/CVM/BCB/MAPA), Recuperacao Judicial | Legal compliance intelligence |

## Tech Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4
- **Supabase** (PostgreSQL + RLS + pgvector) — 18+ tables, 33K+ records
- **Recharts** for Bloomberg-style data visualization
- **Vercel** deployment with daily cron pipeline (5 sync jobs)

## Live Data

| Source | Records | Pipeline |
|--------|---------|----------|
| BCB SGS (6 commodities + USD/BRL + Selic) | Live daily | `sync-market-data` |
| RSS news (Canal Rural, Sucesso no Campo) | 25+ articles | `sync-agro-news` |
| Legal RSS (ConJur) | Filtered | `sync-recuperacao-judicial` + `sync-regulatory` |
| Oraculo Canais (retailers) | 9,328 companies / 24,275 locations | CSV import |
| Source Registry | 166 sources (112 active URLs) | `build-source-registry.js` |

## Quick Start

```bash
npm install
# Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET to .env.local
npm run dev
```

## Documentation

- [CLAUDE.md](CLAUDE.md) — AI assistant context, data source orchestration workflow
- [Implementation Plan](implementation_plan.md) — Full roadmap (Phases 1-20)
- [Knowledge Architecture](docs/KNOWLEDGE_ARCHITECTURE.md) — 4-tier data hierarchy
- [Admin Portal Playbook](docs/admin-page%20playbook.md) — Companion platform
- [Datalake Product Strategy](docs/AGSF_Datalake_PRODUCT.md) — Product tiers, personas, unit economics

## Companion Platform

The **Admin Portal** (`agsf_admin_page`) manages internal operations. Market Hub is the external intelligence engine. Together they form the AgriSafe ecosystem.

## License

Private — All rights reserved. AgriSafe Tecnologia.
