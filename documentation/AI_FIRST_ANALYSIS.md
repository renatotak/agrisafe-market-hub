# AI-First Analysis: AgriSafe Market Hub

> Internal strategic document. Evaluates whether MktHub qualifies as an "AI-first"
> application and what the architecture would look like if it were. Written for
> future investor conversations and positioning decisions.
>
> Date: 2026-04-14

---

## 1. Current Classification

**Market Hub is a data-first platform with AI augmentation, not an AI-first app.**

The codebase's Hard Guardrail #1 is "Algorithms first, LLMs last." An investor
doing technical due diligence would see this immediately in CLAUDE.md and
throughout the architecture.

### Where LLMs are used today (~6 call sites)

| Call site | Model | Purpose |
|-----------|-------|---------|
| `archive-old-news` | OpenAI | Summaries for archived articles |
| `sync-daily-briefing` | Gemini | Executive briefing narrative |
| `sync-retailer-intelligence` | OpenAI | AI retailer profiles |
| `/api/company-research` | OpenAI | Optional summary layer |
| `/api/knowledge/chat` | Gemini | RAG conversational interface |
| `/api/events/enrich` | Gemini/OpenAI | On-demand event enrichment |

These sit across 25 cron jobs, 30+ API routes, and 12 UI modules. Remove every
LLM call and the platform still ingests, stores, geocodes, matches entities,
detects anomalies, and renders dashboards.

### What actually constitutes the moat

- 176 sources, 25 automated scrapers, 51+ migrations
- 5-entity relational model with junctions (not a vector-store-with-a-chat-UI)
- Deterministic entity matching, CNAE classification, norm extraction, anomaly
  detection (stddev-based, not "ask GPT if this is unusual")
- Full observability: activity_log on every write, scraper_runs health tracking
- Bilingual (PT-BR/EN) across every UI string

---

## 2. Investor Framing

| Framing | Honest assessment |
|---------|-------------------|
| "AI-first" | No. AI is a finishing layer, not the core |
| "AI-enhanced data platform" | Yes. LLMs add prose where algorithms can't |
| "Data-first with AI augmentation" | Most accurate description |

### Why this matters for investment thesis

1. **Defensibility** — the moat is 176-source ingestion + entity model + domain
   logic, not a prompt wrapper. Harder to replicate, less exposed to model
   commoditization.
2. **Unit economics** — LLM costs are marginal (~$5-15/month for briefings +
   archive + occasional chat), not per-query. The platform doesn't break if
   OpenAI doubles prices.
3. **Reliability** — deterministic pipelines don't hallucinate CNPJs or invent
   price data. The briefing can hallucinate a narrative, but the numbers
   feeding it are algorithmic.
4. **Risk** — an "AI-first" pitch would be a red flag. It would signal the
   founder doesn't understand where the actual value sits, or is dressing up a
   data product to chase AI multiples.

**Honest pitch:** "We built the data infrastructure that makes AI useful for
agribusiness intelligence, rather than building an AI that hopes data will
appear."

---

## 3. What an AI-First Version Would Look Like

### 3.1 Ingestion — LLM as the parser

**Current:** Cheerio selectors + regex extract structured fields from 176
sources. Deterministic, free, reproducible.

**AI-first:** Feed raw HTML/PDF to an LLM with a schema prompt ("extract event
name, date, location, organizer CNPJ from this page"). Every scraper run burns
tokens. When the model updates or the prompt drifts, yesterday's extractions
don't match today's. Requires eval harnesses and golden-set regression tests
just to keep parity with what a CSS selector does for free.

### 3.2 Entity Resolution — LLM as the matcher

**Current:** `entity-matcher.ts` does normalized substring search with a
stopword blocklist. `ensureLegalEntityUid()` is a deterministic CNPJ lookup +
upsert. Zero ambiguity.

**AI-first:** "Given this news article, which companies from our database are
mentioned?" via function-calling. The model sometimes merges "Bayer S.A." with
"Bayer CropScience Ltda" and sometimes doesn't. Requires a confidence threshold,
a human-review queue, and a feedback loop to fine-tune. Three engineers maintain
what a regex handles today.

### 3.3 Anomaly Detection — LLM as the analyst

**Current:** `|price_change| > 2 * stddev` over a rolling window. Math.

**AI-first:** "Here are the last 30 days of soy prices. Is anything unusual?"
The model says yes on Monday, no on Tuesday, with the same data. Requires
chain-of-thought, few-shot examples, a structured output schema. The stddev
check still runs underneath as ground truth — so now you have both systems.

### 3.4 Knowledge / RAG — already AI-appropriate

**Current:** pgvector embeddings + `match_knowledge_items` RPC + LLM chat.
This is the one place where LLMs are correctly load-bearing, because the task
is inherently fuzzy (natural language Q&A over a corpus).

**AI-first:** Same, but also use LLMs to auto-generate knowledge base entries
(summaries, tags, relationships) instead of having the cron pipeline write
structured rows. The knowledge graph becomes probabilistic rather than
authoritative.

### 3.5 Executive Briefing — already AI-appropriate

**Current:** Aggregated 24h stats (deterministic) fed to Gemini narrative (LLM).
Good split.

**AI-first:** The LLM also decides *which* stats matter, selects the
comparisons, chooses the framing. More interesting output, but no guarantee it
mentions the 15% soy price drop because it decided cotton was more interesting
today.

### 3.6 CRM / Directory — LLM as the enrichment engine

**Current:** Receita Federal data (locked, deterministic) + user-editable
fields + algorithmic CNAE classification.

**AI-first:** "Given this CNPJ, research this company and fill in: revenue
estimate, key products, competitive position, risk signals." Every company card
becomes an LLM call. Rich but unreliable — the model confidently reports revenue
for a company that dissolved two years ago. Requires a verification layer,
which is the deterministic system already in place.

---

## 4. Comparative Cost & Risk Table

| Metric | Current (data-first) | Hypothetical AI-first |
|--------|---------------------|-----------------------|
| Monthly LLM cost | ~$5-15 | $500-2,000+ |
| Reproducibility | Identical outputs across runs | Different extractions, different matches per run |
| Test strategy | Assert on deterministic outputs | Eval harnesses, golden sets, human review, vibe checks |
| Failure mode | Scraper breaks on HTML change, fix selector | Model update changes behavior across all 176 sources simultaneously |
| Latency | Cheerio parses in ms | Each extraction waits for API round-trip |
| Team needed | 1 dev (selectors + SQL) | 1 dev + prompt engineer + eval infra + human reviewers |
| Offline capability | Runs on a Mac mini between scrapes | Every operation needs cloud API call |

---

## 5. Strategic Takeaway

An AI-first version would be **faster to prototype** (no need to write 176
scrapers — just throw HTML at GPT-4) but **harder to operate at quality** (every
model update is a regression risk across the entire pipeline).

The current architecture chose the opposite trade-off: high upfront cost to
write deterministic scrapers, low ongoing cost to maintain them. LLM calls sit
exactly where determinism is impossible (prose generation, conversational search)
and nowhere else.

An AI-first rewrite would mostly mean **replacing cheap, reliable code with
expensive, probabilistic code** — not because the task requires it, but because
it lets you ship a demo faster. That's the right call for a hackathon. It's the
wrong call for a platform that a credit team relies on to monitor 176 sources
daily.

### Where to expand AI usage (high-value, low-risk)

- **Content Hub drafting** — LLM generates first-draft articles from structured
  data (valid prose generation use case)
- **Chat-driven exploration** — expand RAG to cover more tables, add
  function-calling for live queries
- **Cron-driven LLM agents** — scan news/events for entity mentions and enrich
  the knowledge base (already on the roadmap)
- **Smart alerts** — LLM narrates anomaly clusters into human-readable
  notifications

These expand the AI surface without replacing deterministic pipelines.
