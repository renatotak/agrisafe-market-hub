# CLAUDE.md — AgriSafe Market Hub

> Agent context file. For humans, see README.md. For the full roadmap, see ROADMAP.md.

## Project in One Line

**AgriSafe Market Hub** is a bilingual (PT-BR/EN) executive intelligence platform: it ingests public agribusiness data from 166+ sources, organizes it into a 4-tier knowledge hierarchy, and enables the AgriSafe team to generate proprietary insights, content, and compliance intelligence.

**Platform flow:** Ingest → Analyze → Create → Comply

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript strict mode
- **Styling:** Tailwind CSS 4 via PostCSS
- **Database:** Supabase (PostgreSQL + pgvector + RLS)
- **Auth:** Supabase Auth + SSR middleware
- **Charts:** Recharts. **Icons:** Lucide React + Material Icons Outlined
- **Maps:** @vis.gl/react-google-maps (terrain + satellite views)
- **Path alias:** `@/*` → `./src/*`
- **Deployment:** Vercel (Hobby — single daily cron at 08:00 UTC)

## Commands

```bash
npm run dev                                      # Dev server
npm run build                                    # Production build
node src/scripts/build-source-registry.js        # Rebuild 166-source registry
node src/scripts/seed-content.js                 # Seed articles + topics to Supabase
node --env-file=.env.local src/scripts/geocode-retailers.js  # Geocode retailer locations
```

## Architecture: Four Verticals + 11 Modules

| Vertical | Key Components |
|----------|---------------|
| Ingestão de Dados | `DataSources.tsx`, `SourceRegistry.tsx` (166 sources) |
| Inteligência de Mercado | `MarketPulse.tsx`, `CommodityMap.tsx` (live regional prices), `CompetitorRadar.tsx`, `AgroNews.tsx`, `EventTracker.tsx`, `RetailersDirectory.tsx` (23k+ channels, editable fields, company enrichment) |
| Marketing & Conteúdo | `ContentHub.tsx` — see `docs/CONTENT_HUB_SPEC.md` |
| Regulatório & Compliance | `RegulatoryFramework.tsx`, `RecuperacaoJudicial.tsx`, `AgInputIntelligence.tsx` (AGROFIT/Bioinsumos), `KnowledgeBase.tsx` (AgroTermos glossary) |

**Cron pipeline** (`/api/cron/sync-all` → daily 08:00 UTC):
1. `sync-market-data` — BCB SGS → `commodity_prices`, `market_indicators`
2. `sync-agro-news` — 5 RSS feeds → `agro_news`
3. `sync-recuperacao-judicial` — 2 legal RSS → `recuperacao_judicial`
4. `archive-old-news` — OpenAI summaries + pgvector → `news_knowledge`
5. `sync-regulatory` — 3 legal RSS → `regulatory_norms`
6. `sync-events-na` — AgroAgenda API → `events`

**Live API routes (ISR cached):**
- `/api/prices-na` — Notícias Agrícolas commodity prices (revalidate 10min)
- `/api/prices-na/regional` — Per-city prices: 322 praças for soy, 6 commodities
- `/api/events-na` — AgroAgenda events (revalidate 1h)
- `/api/news-na` — NA news with category filter
- `/api/agroapi/clima` — Embrapa ClimAPI weather (revalidate 1h)
- `/api/agroapi/agrofit` — AGROFIT product search
- `/api/agroapi/bioinsumos` — Bioinsumos search
- `/api/agroapi/termos` — AgroTermos glossary
- `/api/company-enrichment` — Receita Federal data (BrasilAPI/CNPJ.ws/ReceitaWS, cached 30d)
- `/api/company-research` — Web search (Google CSE / DuckDuckGo + optional OpenAI summary)
- `/api/company-notes` — User-editable company notes
- `/api/retailers/update` — Update editable retailer fields

All cron routes log to `sync_logs` via `src/lib/sync-logger.ts`.

## Key Files

| File/Dir | Purpose |
|----------|---------|
| `src/data/mock.ts` | Fallback mock data; shown with MockBadge watermark when live data unavailable |
| `src/data/published-articles.ts` | Curated AgriSafe published content (not mock) |
| `src/data/source-registry.json` | 166 catalogued public sources |
| `src/lib/i18n.ts` | All PT-BR / EN translations |
| `src/lib/agroapi.ts` | Embrapa AgroAPI OAuth2 client + typed helpers |
| `src/lib/sync-logger.ts` | Cron logging utility |
| `src/app/api/cron/` | 6 cron routes + sync-all orchestrator |
| `src/app/api/prices-na/regional/` | Per-city commodity price scraper (322 praças) |
| `src/app/api/company-enrichment/` | Receita Federal company lookup (3-source fallback) |
| `src/app/api/company-research/` | Web search (DuckDuckGo + Google CSE + OpenAI) |
| `src/db/migrations/` | SQL migrations 001–014 |
| `src/scripts/geocode-retailers.js` | 3-tier geocoding (Google/CEP/Nominatim) |
| `imports/cnpj-metadados.pdf` | Receita Federal CNPJ data layout reference |

## Data Classification (Receita Federal vs AgriSafe)

| Source | Fields | Behavior |
|--------|--------|----------|
| **Receita Federal** (locked) | CNPJ, Razão Social, Capital Social, Porte, Situação, CNAE, Endereço, QSA, Simples/MEI | Read-only, lock icon |
| **AgriSafe internal** (editable) | Grupo, Classificação, Faturamento, Indústrias, Loja Física, Tipo Acesso | Click-to-edit, pencil icon |
| **User notes** | Obs. Faturamento, Contato Comercial, Observações | Saved to `company_notes` table |

## Adding a New Data Source (Workflow)

1. **Analyze** — Format (API/RSS/CSV/HTML), update freq, auth requirements
2. **Check conflicts** — Search `source-registry.json` for overlapping data
3. **Register** — Add to `source-registry.json` with all metadata fields
4. **Build ingestion** — Create `src/app/api/cron/sync-{source}/route.ts`, log via `logSync()`, add to `sync-all`
5. **Sample check** — Verify record count, freshness, encoding
6. **Persona validation** — Test through CEO / Head Inteligência / Marketing / Crédito lenses

## Hard Constraints

- **Public data only** — No client PII, financial records, or proprietary data
- **Bilingual always** — Every UI string must exist in PT-BR + EN via `src/lib/i18n.ts`
- **MockBadge required** — Any non-live section must display the MOCKED DATA watermark
- **Single cron** — Vercel Hobby plan limit; `sync-all` consolidates all jobs
- **Knowledge hierarchy** — Follow the 4-tier model in `docs/KNOWLEDGE_ARCHITECTURE.md`
- **Google API free tier** — Always verify Google APIs stay within free tier (Maps, Custom Search 100/day)

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY   # Required
SUPABASE_SERVICE_ROLE_KEY / CRON_SECRET                     # Required
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY                             # Required (maps)
AGROAPI_CONSUMER_KEY / AGROAPI_CONSUMER_SECRET              # Required (Embrapa)
GOOGLE_CUSTOM_SEARCH_KEY / GOOGLE_CUSTOM_SEARCH_CX          # Optional (web research, 100 free/day)
OPENAI_API_KEY                                              # Optional (archive, AI summaries)
```

## Design Tokens

Primary `#5B7A2F` · Secondary `#7FA02B` · Warning `#E8722A`
Page bg `#F7F4EF` · Text `#3D382F` · Font: Inter 300–800

## Deeper References

| Topic | File |
|-------|------|
| Operations & data journeys | `PLAYBOOK.md` |
| Roadmap & phase history | `ROADMAP.md` |
| System requirements (FR/NFR) | `docs/REQUIREMENTS.md` |
| Scraper specs & selectors | `docs/SCRAPER_SPECIFICATIONS.md` |
| Knowledge architecture (4-tier) | `docs/KNOWLEDGE_ARCHITECTURE.md` |
| Content Hub spec | `docs/CONTENT_HUB_SPEC.md` |
| Datalake product strategy | `docs/AGSF_Datalake_PRODUCT.md` |
| CNPJ data layout (RF) | `imports/cnpj-metadados.pdf` |
