-- ============================================================
-- Migration 057: Events — hidden flag + updated_at
-- ============================================================
-- Adds a `hidden` boolean so the user can soft-archive events that
-- shouldn't appear in the Eventos Agro feed (e.g. non-agro rows the
-- scrapers misclassified — a celebrity concert on AgroAgenda).
--
-- Also ensures `updated_at` exists so manual edits surface freshness.
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS hidden     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_events_visible ON events(date) WHERE hidden = false;

COMMENT ON COLUMN events.hidden IS
  'Soft-archive flag (mig 057). Scrapers occasionally misclassify non-agro events (concerts, shows). Set hidden=true to hide from the feed without deleting — the row survives so the same scrape won''t re-add it and we keep the provenance trail.';

-- updated_at trigger (mirrors the pattern from crm tables mig 041)
CREATE OR REPLACE FUNCTION trg_events_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS events_touch ON events;
CREATE TRIGGER events_touch BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION trg_events_touch();
