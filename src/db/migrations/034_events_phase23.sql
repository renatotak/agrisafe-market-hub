-- ============================================================
-- Migration 034: Phase 23 — Eventos Agro source provenance + AI enrichment
-- Depends on: 006 (events table), 027 (scraper_registry)
-- ============================================================
--
-- Phase 23 — Eventos Agro: Missing Sources + Source Detail + AI Enrichment
--
-- The current `events` table is populated by the sync-events-na cron
-- (which scrapes Notícias Agrícolas) but every row lacks any indication
-- of WHERE the row came from. The table is also missing the geocoding
-- columns the Dashboard map needs and the AI-enrichment columns the
-- Phase 23 "Enrich" button writes back to.
--
-- This migration adds:
--   • source_name        — provider that delivered this event
--                          ('AgroAgenda', 'AgroAdvance', 'BaldeBranco',
--                           'Manual', etc.)
--   • source_url         — listing page URL where the event was scraped
--                          (distinct from `website` which is the event's
--                          OWN site)
--   • organizer_cnpj     — optional 8-digit CNPJ root for entity linking
--   • latitude / longitude — geocoding for the Dashboard map
--   • enriched_at        — timestamp of last LLM enrichment run
--   • enrichment_summary — markdown prose summary written by /api/events/enrich
--   • enrichment_source  — provenance: 'gemini' | 'openai' | 'manual'
--
-- It also:
--   1. Backfills source_name='AgroAgenda' on every existing row whose id
--      starts with 'na-' (the prefix sync-events-na/route.ts uses)
--   2. Adds a scraper_registry row for sync-events-agroadvance
--   3. Adds a scraper_knowledge row of kind='spec' documenting why we're
--      DEFERRING the baldebranco scraper (free-text paragraphs, hostile
--      to algorithmic scraping per guardrail #1)
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS source_name        text,
  ADD COLUMN IF NOT EXISTS source_url         text,
  ADD COLUMN IF NOT EXISTS organizer_cnpj     text,
  ADD COLUMN IF NOT EXISTS latitude           numeric,
  ADD COLUMN IF NOT EXISTS longitude          numeric,
  ADD COLUMN IF NOT EXISTS enriched_at        timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_summary text,
  ADD COLUMN IF NOT EXISTS enrichment_source  text
    CHECK (enrichment_source IS NULL OR enrichment_source IN ('gemini','openai','manual'));

CREATE INDEX IF NOT EXISTS idx_events_source_name ON events(source_name);
CREATE INDEX IF NOT EXISTS idx_events_organizer_cnpj ON events(organizer_cnpj) WHERE organizer_cnpj IS NOT NULL;

COMMENT ON COLUMN events.source_name IS
  'Provider that delivered this row. Distinct from `website` (the event''s own URL). Set by each scraper at upsert time.';
COMMENT ON COLUMN events.source_url IS
  'Listing page URL where this event was discovered (scraper input), not the event''s own website.';
COMMENT ON COLUMN events.enrichment_summary IS
  'Markdown prose summary written by /api/events/enrich after fetching the event detail page. Optional LLM step gated on GEMINI_API_KEY / OPENAI_API_KEY.';

-- ─── Backfill: stamp existing AgroAgenda events ──────────────
-- sync-events-na/route.ts uses id pattern `na-<slug>`, so we can
-- safely tag every existing 'na-*' row with source_name='AgroAgenda'.

UPDATE events
SET source_name = 'AgroAgenda',
    source_url  = 'https://www.noticiasagricolas.com.br/eventos/'
WHERE source_name IS NULL
  AND id LIKE 'na-%';

-- ─── Seed: scraper_registry row for the new agroadvance scraper ─

INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-events-agroadvance',
  'AgroAdvance Events List',
  'Scrapes the agroadvance.com.br/blog-feiras-e-eventos-agro-2026/ HTML page for the curated annual list of Brazilian agro fairs and events. Each entry has h4(name) + p>strong (Data/Local/Site Oficial) markup, parsed deterministically with Cheerio. Phase 23.',
  'agroadvance-events-2026',
  'html',
  'events',
  'weekly',
  168,
  '{
    "required_keys": ["id","name","date","source_name","source_url"],
    "sample_row": {
      "id": "string",
      "name": "string",
      "date": "string",
      "source_name": "string",
      "source_url": "string"
    },
    "enum_values": {
      "source_name": ["AgroAdvance"]
    }
  }'::jsonb,
  10,
  'agrisafe-mkthub',
  'Annual reference page. Re-scraping is cheap (single HTTP request, ~30 events). The page itself is updated by AgroAdvance throughout the year as event details change.'
)
ON CONFLICT (scraper_id) DO NOTHING;

-- ─── Seed: scraper_knowledge spec for the baldebranco deferral ──
-- This documents WHY we are not shipping a baldebranco scraper today,
-- so a future Claude session (or human) reading scraper_knowledge sees
-- the rationale before re-attempting the work.

INSERT INTO scraper_knowledge (
  scraper_id, kind, title, body, severity, created_by
) VALUES (
  'sync-events-agroadvance',
  'note',
  'Phase 23 — Why no baldebranco scraper (yet)',
  'baldebranco.com.br/confira-os-grandes-eventos-do-agro-em-2026/ was on the Phase 23 roadmap but is not getting a scraper this slice. Reason: the page structure is free-text paragraphs under <strong>MONTH</strong> headers with event names, dates, and locations all inline-mixed inside paragraph text via more <strong> tags. There is no semantic separation between event boundaries, no per-event wrapper element, and no labeled fields. Writing a deterministic Cheerio scraper for this requires regex-based segmentation of paragraph text by Portuguese date patterns + state-name detection — fragile, easily broken by editorial changes to the page.

Per guardrail #1 (algorithms first, LLMs last) we are NOT going to ship an LLM-extraction scraper for this. Two viable paths if we revisit:

1. Wait for baldebranco to publish a more structured page (e.g. a JSON-LD events feed or a properly marked-up list).
2. Build a one-shot LLM extractor as a manual tool (NOT a cron). The user runs it once per year, reviews the output by hand, and inserts the events into Supabase via the events CRUD UI. This keeps LLMs out of the automated path and respects the algorithms-first principle for scheduled scrapers.

Either way, agroadvance.com.br already covers ~27 events including most of what baldebranco lists, so the marginal value of baldebranco is small.',
  'info',
  'system'
)
ON CONFLICT DO NOTHING;
