# Scraper Specifications & Maintenance Playbook

> **Last updated:** 2026-04-02
> **Purpose:** Complete inventory of all data ingestion pipelines, external source contracts, fragility analysis, and maintenance procedures. This is the primary reference for diagnosing and fixing scrapers when external data sources change.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Scraper Inventory](#2-scraper-inventory)
3. [Scraper #1: sync-market-data (BCB SGS API)](#3-scraper-1-sync-market-data)
4. [Scraper #2: sync-agro-news (RSS Feeds)](#4-scraper-2-sync-agro-news)
5. [Scraper #3: sync-recuperacao-judicial (RSS + Filter)](#5-scraper-3-sync-recuperacao-judicial)
6. [Scraper #4: sync-regulatory (RSS + Classification)](#6-scraper-4-sync-regulatory)
7. [Scraper #5: sync-events-na (HTML Scraper)](#7-scraper-5-sync-events-na)
8. [Scraper #6: archive-old-news (LLM Pipeline)](#8-scraper-6-archive-old-news)
9. [Scraper #7: sync-prices-na (HTML Scraper — PARTIAL)](#9-scraper-7-sync-prices-na)
10. [Import Scripts (Manual)](#10-import-scripts)
11. [Shared Infrastructure](#11-shared-infrastructure)
12. [Fragility Matrix](#12-fragility-matrix)
13. [Monitoring & Alerting Playbook](#13-monitoring--alerting-playbook)
14. [Emergency Procedures](#14-emergency-procedures)

---

## 1. Architecture Overview

```
Vercel Cron (daily 08:00 UTC)
         |
    sync-all (orchestrator, 55s timeout per job)
         |
    +----+----+----+----+----+----+
    |    |    |    |    |    |    |
    v    v    v    v    v    v    v
  mktd  news  rj  arch  reg  evt  (prices — not in orchestrator)
    |    |    |    |    |    |
    v    v    v    v    v    v
  Supabase (service role, bypass RLS)
         |
      sync_logs (every run logged)
```

**Key constraints:**
- Vercel Hobby plan: 1 cron entry, 60s function timeout
- sync-all dispatches jobs sequentially with 55s timeout each
- All cron routes use `createAdminClient()` (service role key) to bypass RLS
- Auth: Bearer token via `CRON_SECRET` env var (skipped in dev)

---

## 2. Scraper Inventory

| ID | Name | File | Type | External Source | Target Table(s) | Fragility | Status |
|----|------|------|------|-----------------|-----------------|-----------|--------|
| S1 | sync-market-data | `src/app/api/cron/sync-market-data/route.ts` | REST API | BCB SGS | `commodity_prices`, `commodity_price_history`, `market_indicators` | LOW | Active |
| S2 | sync-agro-news | `src/app/api/cron/sync-agro-news/route.ts` | RSS | 4 feeds | `agro_news` | LOW | Active |
| S3 | sync-recuperacao-judicial | `src/app/api/cron/sync-recuperacao-judicial/route.ts` | RSS | 2 feeds | `recuperacao_judicial` | LOW | Active |
| S4 | sync-regulatory | `src/app/api/cron/sync-regulatory/route.ts` | RSS | 3 feeds | `regulatory_norms` | LOW | Active |
| S5 | sync-events-na | `src/app/api/cron/sync-events-na/route.ts` | HTML Scraper | noticiasagricolas.com.br | `events` | HIGH | Active |
| S6 | archive-old-news | `src/app/api/cron/archive-old-news/route.ts` | Internal + LLM | `agro_news` + OpenAI | `news_knowledge` | MEDIUM | Active |
| S7 | sync-prices-na | `src/app/api/cron/sync-prices-na/route.ts` | HTML Scraper | noticiasagricolas.com.br | *(not persisted)* | HIGH | Partial |
| M1 | import-retailers | `src/scripts/import-canais.js` | Excel Import | Local .xlsx file | `retailers`, `retailer_locations` | NONE | Manual |
| M2 | build-source-registry | `src/scripts/build-source-registry.js` | CSV Import | Local CSVs | `src/data/source-registry.json` | NONE | Manual |
| M3 | seed-content | `src/scripts/seed-content.js` | Seed Script | Hardcoded data | `published_articles`, `content_topics` | NONE | Manual |

---

## 3. Scraper #1: sync-market-data

### Source Contract

| Field | Value |
|-------|-------|
| Provider | Banco Central do Brasil (BCB) |
| API | SGS (Sistema Gerenciador de Séries Temporais) |
| URL pattern | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{CODE}/dados/ultimos/{N}?formato=json` |
| Auth | None (public API) |
| Rate limit | Not documented; observed stable at 8 sequential requests |
| Response format | JSON array: `[{ "data": "DD/MM/YYYY", "valor": "123.45" }]` |
| SLA | Government infrastructure; occasional downtime on weekends/holidays |

### Series Codes

| Commodity/Indicator | SGS Code | Unit | Notes |
|---------------------|----------|------|-------|
| Soja (Soybean) | 11752 | R$/sc 60kg | CEPEA/ESALQ indicator |
| Milho (Corn) | 11753 | R$/sc 60kg | CEPEA/ESALQ indicator |
| Cafe (Coffee) | 11754 | R$/sc 60kg | CEPEA/ESALQ indicator |
| Acucar (Sugar) | 11755 | R$/sc 50kg | CEPEA/ESALQ indicator |
| Algodao (Cotton) | 11756 | cents/lb | CEPEA/ESALQ indicator |
| Citros (Citrus) | 11757 | R$/cx 40.8kg | CEPEA/ESALQ indicator |
| USD/BRL | 1 | R$ | PTAX sell rate |
| Selic | 432 | % annual | Overnight target |

### Data Flow

```
BCB SGS API (8 calls, latest 2 data points each)
    |
    v
Parse: date DD/MM/YYYY → YYYY-MM-DD, valor → float
Compute: change_24h = ((current - previous) / previous) * 100
    |
    v
UPDATE commodity_prices (6 rows by id)
UPSERT commodity_price_history (on conflict: commodity_id, recorded_at)
UPDATE market_indicators (2 rows by id)
```

### Attention Points

| Risk | Severity | What to check | How to fix |
|------|----------|---------------|------------|
| BCB API downtime | LOW | `sync_logs` shows errors for `sync-market-data` | Wait and retry next day; BCB has no alternative mirror |
| Series code deprecated | LOW | BCB may retire or renumber series | Check BCB SGS portal for new codes; update `COMMODITY_SERIES` array |
| Date format change | LOW | BCB returns `"data"` in DD/MM/YYYY | Update `parseBCBDate()` function |
| Value format change | LOW | `"valor"` may include locale separators | Check `parseFloat()` handles new format |
| Weekend/holiday gaps | NONE | BCB only publishes on business days | Normal behavior; `change_24h` uses last available day |
| New commodities needed | NONE | Business decides to track more | Add to series array + seed row in `commodity_prices` table |

### Dependencies

- None (native `fetch`)

---

## 4. Scraper #2: sync-agro-news

### Source Contract

| Feed | URL | Format | Items/request |
|------|-----|--------|---------------|
| Canal Rural | `https://www.canalrural.com.br/feed/` | RSS 2.0 | ~20 latest |
| Sucesso no Campo | `https://sucessonocampo.com.br/feed/` | RSS 2.0 | ~20 latest |
| Agrolink | `https://www.agrolink.com.br/rss/noticias.xml` | RSS 2.0 | ~20 latest |
| CNA Noticias | `https://cnabrasil.org.br/noticias/rss` | RSS 2.0 | ~20 latest |

Config: `src/data/news.ts` → `NEWS_SOURCES` array.

### Data Flow

```
4 RSS feeds (rss-parser, 15s timeout each)
    |
    v
Per article:
  - id = hash(item.link)
  - categorize() via regex (7 categories)
  - Match against highlighted_producers keywords
    |
    v
UPSERT agro_news (on conflict: source_url, ignoreDuplicates: true)
```

### Category Classification Rules

```
commodities: /soja|milho|café|açúcar|algodão|commodity|cotaç/
credit:      /crédito|financ|banco|selic|juro/
technology:  /tecnolog|ia|inovaç|startup|digital|drone|satelit/
policy:      /polític|govern|lei|regulament|ministér|mapa|conab/
sustainability: /sustentab|ambient|carbono|esg|desmat/
judicial:    /recuperação judicial|falência|judicial|tribunal/
general:     (default)
```

### Attention Points

| Risk | Severity | What to check | How to fix |
|------|----------|---------------|------------|
| RSS feed URL changes | MEDIUM | Feed returns 404 or redirects | Check `sync_logs` for source-specific errors; update URL in `src/data/news.ts` |
| RSS feed format changes | LOW | `rss-parser` can't parse new format | Check if feed switched to Atom or custom XML; update parser config |
| Feed goes offline permanently | MEDIUM | Source discontinued | Remove from `NEWS_SOURCES` array; consider replacement feeds |
| Encoding issues (UTF-8/ISO) | LOW | Garbled Portuguese characters in titles | Check feed encoding headers; add `customFields` to parser config |
| Rate limiting | LOW | Feed returns 429 or blocks User-Agent | Change User-Agent string; add delay between requests |
| Duplicate articles | NONE | Same article from multiple feeds | Handled by `ignoreDuplicates: true` on `source_url` conflict |
| Category misclassification | LOW | New topics not matching any regex | Add new patterns to `categorize()` function |
| highlighted_producers table empty | NONE | No producer matching occurs | Graceful degradation — sets `mentions_producer: false` |

### Dependencies

- `rss-parser` ^3.13.0

---

## 5. Scraper #3: sync-recuperacao-judicial

### Source Contract

| Feed | URL | Format |
|------|-----|--------|
| ConJur | `https://www.conjur.com.br/rss.xml` | RSS 2.0 |
| Migalhas | `https://www.migalhas.com.br/rss/quentes.xml` | RSS 2.0 |

Config: `src/data/recuperacao.ts` → `RJ_NEWS_SOURCES` array.

### Dual-Filter Logic

Articles must match **BOTH** conditions:

1. **RJ keyword match:** Title or content contains "recuperação judicial" or "falência"
2. **Agro context match:** Contains at least one of: `produtor rural`, `agronegócio`, `usina`, `cooperativa`, `agropecuária`, `agroindústria`, `cana-de-açúcar`, `soja`, `milho`, `algodão`, `café`

### Data Flow

```
2 RSS feeds (50 items each)
    |
    v
Filter: must match RJ keyword AND agro context
    |
    v
Classify: entity_type (produtor_rural|cooperativa|usina|empresa_agro|outros)
Extract: state from text (SP|MT|MS|GO|MG|PR|RS|BA|TO|MA|PA|PI)
    |
    v
UPSERT recuperacao_judicial (on conflict: id, ignoreDuplicates: true)
```

### Attention Points

| Risk | Severity | What to check | How to fix |
|------|----------|---------------|------------|
| Very strict filter → 0 results | EXPECTED | Most runs produce 0 records | Normal behavior; dual filter is intentionally strict |
| RSS feed URL changes | MEDIUM | Same as S2 | Update URL in `src/data/recuperacao.ts` |
| Entity CNPJ not extracted | KNOWN GAP | CNPJ field always `null` | Would need detail page scraping or CNPJ API lookup |
| Court/case_number not extracted | KNOWN GAP | Fields always `null` | Would need regex parsing from article body or court API |
| State extraction misses | LOW | State field may be `null` | Add more regex patterns to `extractState()` |
| Agro keyword coverage | LOW | New agro entities not caught by filter | Add terms to agro context regex |

### Dependencies

- `rss-parser` ^3.13.0

---

## 6. Scraper #4: sync-regulatory

### Source Contract

| Feed | URL | Format | Items/request |
|------|-----|--------|---------------|
| ConJur | `https://www.conjur.com.br/rss.xml` | RSS 2.0 | 50 |
| Migalhas | `https://www.migalhas.com.br/rss/quentes.xml` | RSS 2.0 | 50 |
| JOTA | `https://www.jota.info/feed` | RSS 2.0 | 50 |

### Three-Layer Filter

1. **Regulatory body OR document type match:**
   - Bodies: `CMN`, `CVM`, `BCB`, `Banco Central`, `BACEN`, `MAPA`
   - Doc types: `resolução`, `circular`, `instrução normativa`, `decreto`, `medida provisória`, `portaria`

2. **Agro/financial relevance match:**
   - `crédito rural`, `agronegócio`, `CPR`, `cédula de produto rural`, `Proagro`, `seguro rural`, `Fiagro`, `CRA`, `LCA`, `financiamento agrícola`, `plano safra`

### Classification Functions

| Function | Purpose | Output |
|----------|---------|--------|
| `extractBody()` | Identify issuing regulatory body | CMN, CVM, BCB, MAPA |
| `extractNormType()` | Classify document type | resolucao, circular, instrucao_normativa, decreto, medida_provisoria, portaria, outros |
| `extractNormNumber()` | Extract norm number from text | e.g., "5.234" from "Resolução 5.234" |
| `classifyImpact()` | Assess impact level | high, medium, low |
| `extractAffectedAreas()` | Tag affected business areas | credito_rural, cpr, seguro_rural, cra, lca, fiagro, cooperativas, registro, defensivos, rastreabilidade, esg, geral |

### Attention Points

| Risk | Severity | What to check | How to fix |
|------|----------|---------------|------------|
| Very strict filter → 0 results | EXPECTED | Most runs produce 0 records | Normal — only regulatory articles matching agro-finance pass |
| JOTA feed changes/paywall | MEDIUM | JOTA may restrict RSS access | Check if feed returns empty; consider alternative legal news source |
| New regulatory bodies | LOW | New entity (e.g., IBAMA, ANA) not in filter | Add to body regex in `extractBody()` |
| Norm number format change | LOW | New document numbering convention | Update regex in `extractNormNumber()` |
| Impact misclassification | LOW | High-impact norm classified as low | Review keyword lists in `classifyImpact()` |
| effective_at always null | KNOWN GAP | Effective date not extracted from content | Would need NLP or detail page scraping |
| Affected areas incomplete | LOW | New business area not tagged | Add pattern to `extractAffectedAreas()` |

### Dependencies

- `rss-parser` ^3.13.0

---

## 7. Scraper #5: sync-events-na

### Source Contract

| Field | Value |
|-------|-------|
| Provider | Noticias Agricolas |
| Base URL | `https://www.noticiasagricolas.com.br` |
| List page | `/eventos/` (defaults to current year) |
| Detail pages | `/eventos/{slug}/` (editorial coverage pages) |
| Format | HTML (server-rendered) |
| Auth | None (public) |
| Anti-bot | Cloudflare (may challenge automated requests) |

### HTML Selectors — List Page

```
Container: ul.lista-de-eventos
Item:      ul.lista-de-eventos li
Link:      li > a[href]
Title:     li > a > h4
Image:     li > a > figure > img[data-src] (lazy-loaded)
```

**Sample structure:**
```html
<ul class="lista-de-eventos">
  <li>
    <a href="/eventos/femagri-2026/">
      <figure><img data-src="..." alt="Femagri 2026"></figure>
      <h4>Femagri 2026</h4>
      <p></p>
    </a>
  </li>
</ul>
```

### HTML Selectors — Detail Pages

Detail pages are **editorial coverage** (videos, articles), NOT structured event metadata. There are no dedicated date/location fields.

**Date extraction strategy:**
```
Elements checked: span.data, .data, time, a (text content)
Text scan: regex /\d{2}\/\d{2}\/\d{4}/ on #content or body text
Logic: earliest date found ≈ event start, latest ≈ event end
Fallback: year from slug/title → Jan 1 of that year
```

**Description extraction:**
```
Priority: meta[name="description"] > meta[property="og:description"] > #content p:first
```

**Location extraction:**
```
Regex: /(?:em|in)\s+([\w\s]+(?:,\s*[A-Z]{2}))/i
Applied to: h1 + h2:first + meta description
Fallback: "Brasil"
```

### Event Type Inference

| Keyword pattern | Type |
|----------------|------|
| `feira`, `show rural`, `expo`, `field day`, `agrishow`, `tecnoshow`, `coplacampo` | fair |
| `workshop`, `oficina`, `capacitação`, `treinamento` | workshop |
| `webinar`, `online`, `live`, `palestra` | webinar |
| `summit`, `cúpula`, `fórum` | summit |
| *(default)* | conference |

### Data Flow

```
Step 1: Fetch /eventos/ list page (single request)
    |
    v
Step 2: Parse ul.lista-de-eventos li → extract title, slug, URL, image
    |
    v
Step 3: For each event, fetch detail page (batches of 3)
    - Extract dates from article coverage (DD/MM/YYYY patterns)
    - Extract description from meta tags or first paragraph
    - Infer location from text content
    |
    v
Step 4: Build event records
    - id: na-{slug}
    - type: inferred from title keywords
    - date: earliest coverage date or fallback
    - upcoming: date >= today
    |
    v
UPSERT events (on conflict: id)
```

### Attention Points

| Risk | Severity | What to check | How to fix |
|------|----------|---------------|------------|
| **HTML structure change** | **CRITICAL** | NA redesigns events page; `ul.lista-de-eventos` no longer exists | Inspect new HTML at `/eventos/`; update selectors in `scrapeDetailPage()` and main parser |
| **Cloudflare blocking** | **HIGH** | Returns 403 or challenge page instead of HTML | Rotate User-Agent; add random delay between requests; may need headless browser fallback |
| **Date extraction unreliable** | **HIGH** | Detail pages may have no DD/MM/YYYY dates; events show on wrong dates | Check `sync_logs` for `records_inserted` count; review events in Supabase for date accuracy |
| **No structured event metadata** | KNOWN GAP | NA events are editorial coverage, not calendar listings | Dates are approximated from article coverage dates; locations are inferred from text |
| **Lazy-loaded images** | LOW | Images use `data-src` instead of `src` | Scraper already handles both; check if they switch to JS-only loading |
| **Year page URL change** | LOW | `/eventos/ano-2026` pattern changes | Check if year filter URL convention changes |
| **Rate limiting** | MEDIUM | 20+ requests (list + detail pages) may trigger rate limit | Batch size is 3; add delay if needed; monitor for 429 responses |
| **New event type keywords** | LOW | New event formats not classified | Add keywords to `inferType()` function |
| **Slug collisions** | LOW | Two events with same slug across years | ID includes slug which may not include year; monitor for conflicts |
| **Page encoding** | LOW | Portuguese characters garbled | Check response encoding; add charset header if needed |

### Dependencies

- `cheerio` ^1.2.0

---

## 8. Scraper #6: archive-old-news

### Source Contract

This is an **internal pipeline** — it reads from `agro_news` (populated by S2) and writes to `news_knowledge`.

| Field | Value |
|-------|-------|
| Input | `agro_news` records older than 3 months |
| LLM Provider | OpenAI |
| Summary model | `gpt-4o-mini` |
| Embedding model | `text-embedding-3-small` |
| Vector dimensions | 1536 |

### Data Flow

```
SELECT from agro_news WHERE published_at < (now - 3 months)
    |
    v
Group by: category + source_name + month
    |
    v
Per group:
    - Send article list to GPT-4o-mini → Portuguese summary + key_topics
    - Concatenate summary → text-embedding-3-small → 1536-dim vector
    |
    v
UPSERT news_knowledge (on conflict: id)
DELETE archived articles from agro_news
```

### Knowledge Entry ID

```
knowledge-{category}-{source}-{month}
Example: knowledge-commodities-canal-rural-2025-11
```

### Attention Points

| Risk | Severity | What to check | How to fix |
|------|----------|---------------|------------|
| OPENAI_API_KEY not set | NONE | Pipeline skips gracefully | Set key in `.env.local` when ready |
| OPENAI_API_KEY invalid/expired | MEDIUM | 401 errors from OpenAI | Rotate API key; check billing |
| OpenAI model deprecated | MEDIUM | Model name no longer valid | Update model strings (gpt-4o-mini, text-embedding-3-small) |
| LLM returns invalid JSON | LOW | Summary parsing fails | Fallback logic concatenates raw responses |
| Embedding dimension change | LOW | New model returns different vector size | Update pgvector column dimension; regenerate embeddings |
| No old news to archive | NONE | Returns `archived: 0` | Normal when all news is < 3 months old |
| Large article groups | LOW | Token limit exceeded for big groups | Split groups or truncate input text |
| Deletes archived news | CAUTION | Original articles removed from `agro_news` after archival | This is by design; ensure knowledge entry is written before delete |

### Dependencies

- `openai` ^6.29.0

---

## 9. Scraper #7: sync-prices-na

### Status: PARTIAL — NOT PRODUCTION-READY

This scraper is a proof-of-concept. Data is extracted but **not persisted** to any database table.

### Source Contract

| Field | Value |
|-------|-------|
| Provider | Noticias Agricolas |
| URL | `https://www.noticiasagricolas.com.br/cotacoes/` |
| Format | HTML tables |

### Current Selectors (UNVERIFIED)

```
Section:   .cotacao
Title:     .cotacao h2
Rows:      .cotacao table tbody tr
Columns:   tr td[0] = location, td[1] = price, td[2] = variation
```

### Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| **Selectors unverified** — `.cotacao` may not match actual HTML | CRITICAL | Needs inspection of live page |
| **DB upsert commented out** — data extracted but not stored | CRITICAL | Needs target table creation + upsert code |
| **Uses client supabase** — should use `createAdminClient()` | HIGH | Must switch to service role |
| **No sync logging** — doesn't call `logSync()` | MEDIUM | Add logging |
| **Not in sync-all** — not dispatched by orchestrator | MEDIUM | Add to jobs array after fixing |
| **No target table** — `commodity_prices_regional` doesn't exist | HIGH | Create migration |
| **Cloudflare protection** — same risks as S5 | HIGH | Same mitigations as S5 |

### Required Work

1. Inspect live HTML at `noticiasagricolas.com.br/cotacoes/` — capture page and map actual selectors
2. Create `commodity_prices_regional` table migration
3. Switch to `createAdminClient()`
4. Add `logSync()` calls
5. Enable upsert with deduplication strategy
6. Add to `sync-all` orchestrator
7. Test end-to-end

---

## 10. Import Scripts

### M1: import-canais (Retailer Import)

| Field | Value |
|-------|-------|
| File | `src/scripts/import-canais.js` |
| Command | `node src/scripts/import-canais.js` |
| Input | Excel file (`26-0224 oraculo canais.xlsx`) |
| Output | `retailers` (9,328 rows), `retailer_locations` (24,275 rows) |
| Batch size | 500 rows per upsert |
| Dedup | `cnpj_raiz` for retailers, `cnpj` for locations |

### M2: build-source-registry

| Field | Value |
|-------|-------|
| File | `src/scripts/build-source-registry.js` |
| Command | `node src/scripts/build-source-registry.js` |
| Input | 4 crawler CSV files |
| Output | `src/data/source-registry.json` (166 sources) |

### M3: seed-content

| Field | Value |
|-------|-------|
| File | `src/scripts/seed-content.js` |
| Command | `node src/scripts/seed-content.js` |
| Output | `published_articles`, `content_topics` tables |

---

## 11. Shared Infrastructure

### Authentication

All cron routes use the same auth pattern:

```typescript
const authHeader = request.headers.get('authorization');
if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

- In **development**: auth check skipped
- In **production**: requires `Authorization: Bearer {CRON_SECRET}` header
- `sync-all` passes the token to all child routes

### Database Client

```typescript
// src/utils/supabase/admin.ts
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,  // Bypasses RLS
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

### Sync Logger

```typescript
// src/lib/sync-logger.ts
interface SyncLogEntry {
  source: string           // e.g., 'sync-agro-news'
  started_at: string       // ISO timestamp
  finished_at: string
  records_fetched: number
  records_inserted: number
  errors: number
  status: 'success' | 'error' | 'partial'
  error_message?: string
}

// Silently fails — never blocks sync operations
async function logSync(supabase: SupabaseClient, entry: SyncLogEntry)
```

### Environment Variables

| Variable | Required | Used by |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | All scrapers |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client-side only |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | All cron routes (admin client) |
| `CRON_SECRET` | Yes (prod) | All cron routes (auth) |
| `OPENAI_API_KEY` | Optional | archive-old-news only |

### NPM Dependencies for Scraping

| Package | Version | Used by |
|---------|---------|--------|
| `rss-parser` | ^3.13.0 | S2, S3, S4 |
| `cheerio` | ^1.2.0 | S5, S7 |
| `openai` | ^6.29.0 | S6 |
| `xlsx` | ^0.18.5 | M1 |

---

## 12. Fragility Matrix

### By Failure Mode

| Failure Mode | Affected Scrapers | Likelihood | Impact | Detection | Recovery |
|--------------|-------------------|------------|--------|-----------|----------|
| **HTML structure change** | S5, S7 | HIGH | CRITICAL | 0 records in sync_logs | Inspect live page, update selectors |
| **Cloudflare blocking** | S5, S7 | MEDIUM | HIGH | HTTP 403 errors in logs | Rotate UA, add delays, consider headless |
| **RSS feed URL change** | S2, S3, S4 | MEDIUM | MEDIUM | 0 records for specific source | Update URL in config file |
| **RSS feed discontinued** | S2, S3, S4 | LOW | MEDIUM | Persistent 404s | Find replacement feed |
| **BCB API downtime** | S1 | LOW | LOW | Error in sync_logs | Wait; BCB recovers within 1-2 days |
| **BCB series deprecated** | S1 | VERY LOW | HIGH | Persistent 404 for specific series | Find new series code on SGS portal |
| **OpenAI API error** | S6 | LOW | LOW | archive-old-news errors | Check API key, billing, model name |
| **Supabase outage** | ALL | VERY LOW | CRITICAL | All scrapers fail | Wait for Supabase to recover |
| **Vercel function timeout** | ALL | LOW | MEDIUM | Job returns error in sync-all results | Optimize scraper; reduce batch size |

### By Scraper — Maintenance Priority

| Scraper | Priority | Reason |
|---------|----------|--------|
| **S5 (events-na)** | P1 — CHECK WEEKLY | HTML scraping is inherently fragile; NA may redesign at any time |
| **S7 (prices-na)** | P1 — NEEDS REWORK | Not functional; selectors unverified; no DB persistence |
| **S2 (agro-news)** | P2 — CHECK MONTHLY | RSS feeds are stable but URLs can change |
| **S3 (recuperacao-judicial)** | P2 — CHECK MONTHLY | Same feeds as S4; strict filter means usually 0 results |
| **S4 (regulatory)** | P2 — CHECK MONTHLY | Three feeds; JOTA may add paywall |
| **S1 (market-data)** | P3 — CHECK QUARTERLY | BCB SGS API is very stable |
| **S6 (archive-old-news)** | P3 — CHECK QUARTERLY | Internal pipeline; only breaks if OpenAI changes |

---

## 13. Monitoring & Alerting Playbook

### Daily Health Check (Manual)

Query `sync_logs` for the last 24 hours:

```sql
SELECT source, status, records_fetched, records_inserted, errors, error_message,
       finished_at - started_at as duration
FROM sync_logs
WHERE started_at > now() - interval '24 hours'
ORDER BY started_at DESC;
```

**What to look for:**
- `status = 'error'` → scraper failed completely
- `records_fetched = 0` with `status = 'success'` → source returned empty (may be normal for RJ/regulatory)
- `records_inserted = 0` but `records_fetched > 0` → upsert failed or all duplicates
- Duration > 50s → approaching timeout, may fail intermittently

### Per-Scraper Health Indicators

| Scraper | Healthy | Warning | Broken |
|---------|---------|---------|--------|
| S1 market-data | 8 fetched, 8 inserted | < 8 fetched (some series failed) | 0 fetched (API down) |
| S2 agro-news | 20-80 fetched, 0-20 new | 0 fetched from a specific source | All sources return 0 |
| S3 recuperacao-judicial | 0-2 inserted (strict filter) | N/A — 0 results is normal | Error status in log |
| S4 regulatory | 0-5 inserted (strict filter) | N/A — 0 results is normal | Error status in log |
| S5 events-na | 10-25 fetched | 0 fetched (selectors broken) | Error status + check HTML |
| S6 archive-old-news | 0 archived (normal if news < 3mo) | Error from OpenAI | All groups fail |

### Automated Monitoring (Future)

Consider adding:
- Slack/email alert when `sync_logs.status = 'error'` for any source
- Weekly digest of scraper health metrics
- Sentry integration for error tracking (Phase 20)

---

## 14. Emergency Procedures

### Scraper Returns 0 Records

1. Check `sync_logs` for error message
2. Manually call the cron route in browser/curl: `GET /api/cron/sync-{name}`
3. If HTML scraper: visit the source URL in browser, inspect HTML structure
4. Compare current HTML selectors in code vs actual page DOM
5. Update selectors if changed
6. Test locally before deploying

### Cloudflare Blocks Scraper

1. Check if source returns Cloudflare challenge page (look for `cf-` classes in response)
2. Try different User-Agent strings
3. Add random delay between requests (1-3 seconds)
4. If persistent: consider using a headless browser (Puppeteer) or proxy service
5. As last resort: manually export data and import via script

### RSS Feed URL Changed

1. Visit the source website in browser
2. Look for RSS/Atom feed link (usually in `<head>` or footer)
3. Try common patterns: `/feed/`, `/rss/`, `/rss.xml`, `/feed.xml`
4. Update URL in config file (`src/data/news.ts` or `src/data/recuperacao.ts`)
5. Test with `rss-parser` locally

### BCB API Series Deprecated

1. Visit BCB SGS portal: `https://www3.bcb.gov.br/sgspub/`
2. Search for the commodity/indicator by name
3. Find the new series code
4. Update the series code in `sync-market-data/route.ts`
5. Verify data format matches expected JSON structure

### OpenAI Model Deprecated

1. Check OpenAI documentation for current model names
2. Update model strings in `archive-old-news/route.ts`:
   - `SUMMARY_MODEL` (currently `gpt-4o-mini`)
   - `EMBEDDING_MODEL` (currently `text-embedding-3-small`)
3. If embedding dimensions change, update pgvector column and regenerate
