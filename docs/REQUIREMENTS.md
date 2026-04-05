# AgriSafe Market Hub — System Requirements

> **Last updated:** 2026-04-02
> **Version:** 1.0
> **Related:** `SCRAPER_SPECIFICATIONS.md` (scraper details), `KNOWLEDGE_ARCHITECTURE.md` (data hierarchy), `../ROADMAP.md` (roadmap)

---

## Table of Contents

1. [Product Requirements](#1-product-requirements)
2. [Functional Requirements](#2-functional-requirements)
3. [Data Source Contracts](#3-data-source-contracts)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Infrastructure Requirements](#5-infrastructure-requirements)
6. [Security Requirements](#6-security-requirements)
7. [Data Quality Requirements](#7-data-quality-requirements)
8. [Scraper Resilience Requirements](#8-scraper-resilience-requirements)
9. [Acceptance Criteria](#9-acceptance-criteria)

---

## 1. Product Requirements

### 1.1 Mission Statement

AgriSafe Market Hub is the **knowledge engine** of the AgriSafe ecosystem — a bilingual (PT-BR/EN) executive intelligence platform that captures, organizes, and transforms public agricultural market knowledge into proprietary insights.

### 1.2 Platform Flow

**Ingest → Analyze → Create → Comply**

| Phase | Description | Modules |
|-------|-------------|---------|
| Ingest | Automated data collection from public sources | DataSources, Source Registry, Cron Pipelines |
| Analyze | Market intelligence, competitive monitoring | MarketPulse, CompetitorRadar, AgroNews, EventTracker |
| Create | Content generation from intelligence | ContentHub |
| Comply | Regulatory monitoring and judicial recovery | RegulatoryFramework, RecuperacaoJudicial |

### 1.3 Target Users (Personas)

| Persona | Usage | Frequency | Key Modules |
|---------|-------|-----------|-------------|
| CEO | Strategic review: macro trends, pipeline health | Weekly, 15 min | Dashboard, MarketPulse |
| Head de Inteligencia | Data quality + market signals | Daily, 20 min | Dashboard, DataSources, MarketPulse |
| Marketing Analyst | Content workflow: scan → ideate → draft → publish | Daily, 30 min | AgroNews, ContentHub, EventTracker |
| Consultor Senior de Credito | Judicial recovery + commodity exposure | Tue/Thu, 15 min | RecuperacaoJudicial, MarketPulse |
| Consultor Senior de Estrategia | Research: market landscapes, competitive benchmarks | Ad-hoc, 2-3 hr | All modules |

### 1.4 Constraints

| Constraint | Description |
|------------|-------------|
| Public data only | No proprietary client data, financial records, or PII |
| Bilingual always | Every UI string must exist in PT-BR and EN via `src/lib/i18n.ts` |
| MockBadge required | Any section showing non-live data must display watermark |
| Single cron | Vercel Hobby plan: 1 cron entry; `sync-all` consolidates all jobs |
| No paid APIs (MVP) | AI/embedding handled via IDE until Phase 17 (except archive-old-news) |

---

## 2. Functional Requirements

### 2.1 Data Ingestion (FR-DI)

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-DI-01 | System SHALL ingest commodity prices daily from BCB SGS API (6 commodities + 2 indicators) | P0 | Done |
| FR-DI-02 | System SHALL aggregate news from 4+ public RSS feeds with auto-categorization | P0 | Done |
| FR-DI-03 | System SHALL monitor judicial recovery filings with dual agro filter | P0 | Done |
| FR-DI-04 | System SHALL monitor regulatory norms from 3 legal news feeds | P0 | Done |
| FR-DI-05 | System SHALL scrape agricultural events from Noticias Agricolas | P0 | Done |
| FR-DI-06 | System SHALL archive news older than 3 months with LLM summaries and embeddings | P1 | Done (requires OPENAI_API_KEY) |
| FR-DI-07 | System SHALL scrape regional commodity prices from Noticias Agricolas | P1 | Partial — needs rework |
| FR-DI-08 | System SHALL log every sync operation to `sync_logs` table | P0 | Done |
| FR-DI-09 | System SHALL support manual sync triggers from the UI | P1 | Done (dev only) |
| FR-DI-10 | System SHALL maintain a registry of 166+ public data sources with URL health | P1 | Done |
| FR-DI-11 | System SHALL support bulk import from Excel/CSV for retail directory | P1 | Done |

### 2.2 Market Intelligence (FR-MI)

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-MI-01 | MarketPulse SHALL display live commodity prices with 24h change and trend | P0 | Done |
| FR-MI-02 | MarketPulse SHALL detect price ruptures (>2x average daily change) | P0 | Done |
| FR-MI-03 | AgroNews SHALL display categorized news with source and analytics | P0 | Done |
| FR-MI-04 | EventTracker SHALL display events in timeline, map, list, and calendar views | P0 | Done |
| FR-MI-05 | CompetitorRadar SHALL track competitor signals with timeline | P1 | Done (mock data) |
| FR-MI-06 | RetailersDirectory SHALL display 9K+ companies with search and filter | P0 | Done |

### 2.3 Content & Marketing (FR-CM)

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-CM-01 | ContentHub SHALL manage articles with engagement tracking | P1 | Done |
| FR-CM-02 | ContentHub SHALL maintain a topic pipeline with thesis and historical angle | P1 | Done |
| FR-CM-03 | ContentHub SHALL display a content calendar view | P1 | Done |

### 2.4 Regulatory (FR-RG)

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-RG-01 | RegulatoryFramework SHALL display norms with body, type, impact, and affected areas | P0 | Done |
| FR-RG-02 | RecuperacaoJudicial SHALL display filings with entity type, state, and status | P0 | Done |

### 2.5 Knowledge & AI (FR-KA) — Future

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-KA-01 | System SHALL index knowledge in 4-tier hierarchy (Market Data, News/Events, Static, Curated) | P1 | Phase 16 |
| FR-KA-02 | System SHALL generate vector embeddings for semantic search (pgvector) | P1 | Phase 16 |
| FR-KA-03 | System SHALL provide semantic search API (`/api/knowledge/search`) | P1 | Phase 16 |
| FR-KA-04 | System SHALL generate AI-assisted content drafts from topic pipeline | P2 | Phase 17 |
| FR-KA-05 | System SHALL generate daily executive briefings | P2 | Phase 17 |

---

## 3. Data Source Contracts

Each external data source has a "contract" — an implicit agreement about format, availability, and behavior. When a contract breaks, the corresponding scraper fails.

### 3.1 Stable Sources (API-based)

| Source | Contract | Stability | Change Detection |
|--------|----------|-----------|------------------|
| **BCB SGS API** | JSON array with `data` (DD/MM/YYYY) and `valor` (decimal string). Public, no auth. Business days only. | Very High | `records_fetched < 8` in sync_logs |

### 3.2 Semi-Stable Sources (RSS-based)

| Source | Feed URL | Contract | Stability | Change Detection |
|--------|----------|----------|-----------|------------------|
| **Canal Rural** | `canalrural.com.br/feed/` | RSS 2.0 with title, link, content, enclosure, isoDate | High | 0 records from this source in sync_logs |
| **Sucesso no Campo** | `sucessonocampo.com.br/feed/` | RSS 2.0 standard | High | Same |
| **Agrolink** | `agrolink.com.br/rss/noticias.xml` | RSS 2.0 standard | High | Same |
| **CNA Noticias** | `cnabrasil.org.br/noticias/rss` | RSS 2.0 standard | High | Same |
| **ConJur** | `conjur.com.br/rss.xml` | RSS 2.0, general legal news | High | Same |
| **Migalhas** | `migalhas.com.br/rss/quentes.xml` | RSS 2.0, general legal news | High | Same |
| **JOTA** | `jota.info/feed` | RSS 2.0/Atom, legal/political news | Medium | May add paywall restrictions |

### 3.3 Fragile Sources (HTML Scraping)

| Source | URL | Contract | Stability | Change Detection |
|--------|-----|----------|-----------|------------------|
| **NA Events** | `noticiasagricolas.com.br/eventos/` | `ul.lista-de-eventos li` with `h4` titles and `a[href]` links. Detail pages have editorial coverage (no structured dates). | Low | 0 events in sync_logs; check HTML manually |
| **NA Prices** | `noticiasagricolas.com.br/cotacoes/` | `.cotacao` sections with price tables (UNVERIFIED) | Very Low | Scraper not functional; needs full rework |

### 3.4 External API Sources (Future — Phase 19)

| Source | Type | Expected Contract | Priority |
|--------|------|-------------------|----------|
| CEPEA daily indicators | API/scraping | Daily commodity spot prices | High |
| CONAB crop forecasts | API/scraping | Production, area, yield estimates | High |
| INMET weather | REST API | Temperature, precipitation by region | Medium |
| USDA reports | RSS/scraping | WASDE estimates | Medium |
| B3 agro futures | API | BM&F futures contracts | Low |
| MDIC ComexStat | REST API | Export volumes/values by product | Low |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-P-01 | Page load time (initial) | < 3 seconds on 4G |
| NFR-P-02 | Cron job total execution time | < 5 minutes (6 jobs x 55s timeout) |
| NFR-P-03 | Individual scraper execution time | < 55 seconds |
| NFR-P-04 | Supabase query response time | < 500ms for standard queries |
| NFR-P-05 | Module rendering (after data load) | < 1 second |

### 4.2 Availability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-A-01 | Platform uptime | 99.5% (Vercel + Supabase) |
| NFR-A-02 | Data freshness | Updated daily by 09:00 UTC |
| NFR-A-03 | Graceful degradation | All modules fall back to mock data when Supabase empty |

### 4.3 Scalability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-S-01 | News articles stored | Up to 10,000 before archival |
| NFR-S-02 | Price history records | Unlimited (time-series) |
| NFR-S-03 | Events tracked | Up to 500 per year |
| NFR-S-04 | Retailers indexed | Up to 50,000 |
| NFR-S-05 | Knowledge embeddings | Up to 100,000 vectors |

### 4.4 Internationalization

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-I-01 | All UI strings bilingual | PT-BR and EN via `src/lib/i18n.ts` |
| NFR-I-02 | Date formats | PT-BR locale for display, ISO 8601 for storage |
| NFR-I-03 | Currency formats | R$ with Brazilian number formatting |

---

## 5. Infrastructure Requirements

### 5.1 Deployment

| Component | Service | Tier |
|-----------|---------|------|
| Frontend + API | Vercel | Hobby (1 cron, 60s timeout, 100GB bandwidth) |
| Database | Supabase | Free/Pro (PostgreSQL + pgvector + RLS) |
| AI (optional) | OpenAI | Pay-per-use |
| Domain | Vercel | Managed |
| CDN | Vercel Edge | Included |

### 5.2 Database Tables

| Table | Rows (current) | Source | Write Frequency |
|-------|----------------|--------|-----------------|
| `commodity_prices` | 6 | BCB SGS | Daily update |
| `commodity_price_history` | Growing | BCB SGS | Daily insert |
| `market_indicators` | 6 | BCB SGS | Daily update |
| `agro_news` | 25+ | RSS feeds | Daily upsert |
| `events` | 20+ | NA scraper | Daily upsert |
| `regulatory_norms` | 0-5 | RSS feeds | Daily upsert (strict filter) |
| `recuperacao_judicial` | 0-5 | RSS feeds | Daily upsert (strict filter) |
| `news_knowledge` | Growing | Archive pipeline | Daily (if OPENAI_API_KEY) |
| `sync_logs` | Growing | All cron routes | Daily insert (6+ per run) |
| `retailers` | 9,328 | Excel import | Manual |
| `retailer_locations` | 24,275 | Excel import | Manual |
| `competitors` | 5 | Seed | Manual |
| `competitor_signals` | 6 | Seed | Manual |
| `campaigns` | 4 | Seed | Manual |
| `content_ideas` | 6 | Seed | Manual |
| `published_articles` | 6 | Seed | Manual |
| `content_topics` | 5 | Seed | Manual |
| `highlighted_producers` | Variable | Manual | Manual |

### 5.3 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side, bypasses RLS) |
| `CRON_SECRET` | Yes (prod) | Bearer token for cron route authentication |
| `OPENAI_API_KEY` | Optional | OpenAI API key for archive-old-news |

---

## 6. Security Requirements

### 6.1 Authentication & Authorization

| ID | Requirement |
|----|-------------|
| SR-01 | All application routes SHALL require Supabase Auth login (except `/login` and `/api/cron/*`) |
| SR-02 | Cron routes SHALL validate `Authorization: Bearer {CRON_SECRET}` in production |
| SR-03 | Database writes SHALL use service role key via `createAdminClient()` |
| SR-04 | Row-Level Security (RLS) SHALL be enabled on all Supabase tables |
| SR-05 | Client-side code SHALL only use the anonymous key (read-only for public data) |

### 6.2 Data Protection

| ID | Requirement |
|----|-------------|
| SR-06 | System SHALL NOT store proprietary client data, financial records, or PII |
| SR-07 | System SHALL NOT expose `SUPABASE_SERVICE_ROLE_KEY` or `CRON_SECRET` to client-side |
| SR-08 | System SHALL NOT commit `.env.local` or credential files to git |
| SR-09 | External source scraping SHALL identify as AgriSafe Bot via User-Agent |
| SR-10 | External source scraping SHALL respect rate limits and robots.txt |

---

## 7. Data Quality Requirements

### 7.1 Freshness

| Data Type | Maximum Age | Check |
|-----------|-------------|-------|
| Commodity prices | 24 hours (business days) | `last_update` field in `commodity_prices` |
| News articles | 24 hours | `created_at` of latest record in `agro_news` |
| Events | 7 days | `sync_logs` for `sync-events-na` |
| Regulatory norms | 24 hours | `sync_logs` for `sync-regulatory` |

### 7.2 Completeness

| Table | Required Fields | Allowed Nulls |
|-------|----------------|---------------|
| `commodity_prices` | id, price, unit, last_update | change_24h (weekends) |
| `agro_news` | id, title, source_name, source_url, published_at | summary, image_url, tags |
| `events` | id, name, date, type | end_date, location, description, website |
| `regulatory_norms` | id, body, title, published_at | norm_number, effective_at, summary |
| `recuperacao_judicial` | id, entity_name, source_url | entity_cnpj, court, case_number, state |

### 7.3 Deduplication

| Table | Dedup Strategy | Conflict Column(s) |
|-------|---------------|-------------------|
| `agro_news` | Upsert with ignoreDuplicates | `source_url` |
| `events` | Upsert on conflict | `id` (slug-based) |
| `regulatory_norms` | Upsert with ignoreDuplicates | `id` (hash of URL) |
| `recuperacao_judicial` | Upsert with ignoreDuplicates | `id` (hash of URL) |
| `commodity_price_history` | Upsert on conflict | `commodity_id, recorded_at` |
| `commodity_prices` | Update by id | `id` |

---

## 8. Scraper Resilience Requirements

### 8.1 General Requirements

| ID | Requirement |
|----|-------------|
| RR-01 | Each scraper SHALL log its execution to `sync_logs` on both success and failure |
| RR-02 | Each scraper SHALL continue processing remaining items when a single item fails |
| RR-03 | Scraper failures SHALL NOT affect other scrapers in the sync-all pipeline |
| RR-04 | HTML scrapers (S5, S7) SHALL throw meaningful errors when selectors return 0 results |
| RR-05 | All scrapers SHALL have a request timeout (max 15 seconds per external request) |
| RR-06 | HTML scrapers SHALL identify themselves via User-Agent header |
| RR-07 | All scrapers SHALL use `createAdminClient()` for database operations |

### 8.2 HTML Scraper-Specific Requirements

| ID | Requirement |
|----|-------------|
| RR-08 | HTML scrapers SHALL detect when selectors return 0 results and log a warning |
| RR-09 | HTML scrapers SHALL handle Cloudflare challenge pages gracefully (detect and report) |
| RR-10 | HTML scrapers SHALL batch concurrent requests to avoid rate limiting (max 3-5 concurrent) |
| RR-11 | HTML scrapers SHALL have fallback strategies for missing data fields |
| RR-12 | HTML scraper selectors SHALL be documented in `docs/SCRAPER_SPECIFICATIONS.md` |

### 8.3 Maintenance Schedule

| Frequency | Action | Scrapers |
|-----------|--------|----------|
| Weekly | Verify HTML scrapers return expected record count | S5 (events-na), S7 (prices-na) |
| Monthly | Check RSS feed URLs still resolve | S2, S3, S4 |
| Monthly | Review `sync_logs` for anomalies | All |
| Quarterly | Verify BCB SGS series codes still active | S1 |
| Quarterly | Check OpenAI model names still valid | S6 |
| On deploy | Run sync-all manually and verify results | All |

### 8.4 Selector Change Protocol

When an HTML scraper breaks due to source page redesign:

1. **Detect:** `sync_logs` shows 0 records or errors for the scraper
2. **Capture:** Save the current HTML page locally (e.g., `na-eventos.html`)
3. **Inspect:** Open in browser, use DevTools to identify new DOM structure
4. **Document:** Update selectors in `docs/SCRAPER_SPECIFICATIONS.md`
5. **Fix:** Update Cheerio selectors in the route file
6. **Test:** Run scraper locally and verify record count + data quality
7. **Deploy:** Push to production and verify `sync_logs` on next run

---

## 9. Acceptance Criteria

### 9.1 Scraper Acceptance Criteria

A scraper is considered **production-ready** when:

- [ ] Uses `createAdminClient()` (not client-side Supabase)
- [ ] Validates `CRON_SECRET` Bearer token in production
- [ ] Logs to `sync_logs` via `logSync()` on success and failure
- [ ] Added to `sync-all` orchestrator jobs array
- [ ] Handles external source errors gracefully (try/catch per item)
- [ ] Has request timeout configured (15s per external request)
- [ ] Target table exists with appropriate schema and RLS
- [ ] Upsert/dedup strategy prevents duplicate records
- [ ] Returns structured JSON response with success/count/errors
- [ ] Selectors documented in `docs/SCRAPER_SPECIFICATIONS.md`
- [ ] Build passes with no TypeScript errors

### 9.2 Current Scraper Status vs Acceptance Criteria

| Scraper | Admin Client | Auth | Logging | In sync-all | Error Handling | Timeout | Table | Dedup | Documented | PASS? |
|---------|-------------|------|---------|-------------|----------------|---------|-------|-------|------------|-------|
| S1 market-data | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | YES |
| S2 agro-news | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | YES |
| S3 recuperacao-judicial | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | YES |
| S4 regulatory | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | YES |
| S5 events-na | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | YES |
| S6 archive-old-news | Yes | Yes | Yes | Yes | Yes | N/A | Yes | Yes | Yes | YES |
| **S7 prices-na** | **No** | Yes | **No** | **No** | Partial | Yes | **No** | **No** | Yes | **FAIL** |
