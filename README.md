# 🌾 AgriSafe Market Hub

**Public market intelligence platform for Brazilian agribusiness.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Private-red)]()

---

## Overview

AgriSafe Market Hub is a continuously-running market intelligence platform designed for [AgriSafe Tecnologia](https://agrisafe.agr.br) — a São Paulo-based agritech company specializing in sales optimization, credit risk management, and crop monitoring for Brazilian agribusiness.

The platform aggregates **exclusively public data** to produce market reports, support campaign planning, generate content ideas, track competitors, and monitor industry events. It **never stores proprietary or confidential data** from AgriSafe or its users.

### 🔒 Privacy Constraint

> **This platform operates under a strict public-data-only policy.**
> No proprietary client data, financial records, credentials, or personally identifiable information is stored, ingested, or referenced. All data flows are sourced from public APIs, government databases, and open market feeds.

---

## Modules

| # | Module | Description |
|---|--------|-------------|
| 1 | **Agro Market Pulse** | Real-time commodity prices (soy, corn, sugar, coffee, citrus, cotton), USD/BRL exchange, CEPEA indices, CONAB crop forecasts, BNDES rural credit rates, and export data |
| 2 | **Campaign Command Center** | Content calendar and campaign planner with pipeline tracking, status management, and channel strategy — synced with market trends for timing |
| 3 | **Article & Content Engine** | AI-powered idea bank generating blog topics, article outlines, and social media angles aligned with AgriSafe's three pillars (credit risk, sales optimization, crop monitoring) |
| 4 | **Competitor & Industry Radar** | Public monitoring of competitors (TerraMagna, Traive, Agrotools, Bart Digital, Agrosafety) tracking news, product launches, and market signals |
| 5 | **Event & Conference Tracker** | Forward-looking calendar of agro events (Febrabantech, Congresso Andav, Radar Agtech, etc.) with content opportunity identification |

All modules support a **bilingual toggle (PT-BR / EN)**.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.9 |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| Data (v1) | Static TypeScript data files (CSV-ready) |
| Future: Database | Supabase (PostgreSQL, free tier) |
| Future: Hosting | Vercel (free tier) |

---

## Project Structure

```
agsf_mkthub/
├── src/
│   ├── app/
│   │   ├── globals.css          # Design tokens & global styles
│   │   ├── layout.tsx           # Root layout with metadata
│   │   └── page.tsx             # Main dashboard + sidebar navigation
│   ├── components/
│   │   ├── MarketPulse.tsx      # Module 1: Commodity data & indicators
│   │   ├── CampaignCenter.tsx   # Module 2: Campaign pipeline & calendar
│   │   ├── ContentEngine.tsx    # Module 3: AI content idea bank
│   │   ├── CompetitorRadar.tsx  # Module 4: Competitor signal tracker
│   │   └── EventTracker.tsx     # Module 5: Event calendar
│   ├── data/
│   │   ├── market.ts            # Commodity prices & market indicators
│   │   ├── campaigns.ts         # Campaign pipeline data
│   │   ├── competitors.ts       # Competitor profiles & signals
│   │   └── events.ts            # Agro event calendar
│   └── lib/
│       └── i18n.ts              # Bilingual translation system (PT-BR/EN)
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── implementation_plan.md       # Phased development roadmap
├── tasks.md                     # Task tracker & progress checklist
└── log.md                       # Session activity log
```

---

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+

### Install & Run

```bash
# Clone the repository
git clone https://github.com/renatotak/agsf_mkthub.git
cd agsf_mkthub

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Build for Production

```bash
npm run build
npm start
```

---

## Background & Origin

This project originated from a OneNote reorganization initiative that pivoted into building a full market intelligence platform. Key milestones:

1. **OneNote Audit** — Read-only audit of 8 sections (~80+ pages) covering General, SGT, TI-Infra, Comercial, Marketing, Investors, HR, and Events
2. **AgriSafe Research** — Analyzed AgriSafe's service offerings (credit risk scoring, 160+ agro attributes, mobile app, AgriAcordo partnership)
3. **Architecture Design** — Defined 5-module architecture with public-data-only constraint
4. **v1 Build** — Implemented all modules with bilingual UI, dark sidebar, dashboard overview, and privacy badge
5. **GitHub Sync** — Repository published at `renatotak/agsf_mkthub`

---

## Roadmap

See [implementation_plan.md](implementation_plan.md) for the full phased roadmap and [tasks.md](tasks.md) for the current task tracker.

**Next milestones:**
- Connect live public data APIs (CEPEA, CONAB, BCB)
- Integrate Supabase for persistent storage
- Deploy to Vercel
- Implement AI-powered content generation
- Add real-time market data feeds

---

## Contributing

This is currently a private project for AgriSafe Tecnologia. Contact the repository owner for access.

---

## License

Private — All rights reserved.
