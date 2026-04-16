-- Migration 072: regulatory_digests table (Phase 6d)
-- Weekly AI-generated bilingual digests of regulatory changes.

BEGIN;

CREATE TABLE IF NOT EXISTS regulatory_digests (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  digest_date   date NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  digest_text_pt text NOT NULL,
  digest_text_en text NOT NULL,
  citations     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digest_date)
);

-- RLS: public read, service_role write
ALTER TABLE regulatory_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_regulatory_digests"
  ON regulatory_digests FOR SELECT
  USING (true);

CREATE POLICY "service_write_regulatory_digests"
  ON regulatory_digests FOR ALL
  USING ((current_setting('role') = 'service_role'))
  WITH CHECK ((current_setting('role') = 'service_role'));

COMMENT ON TABLE regulatory_digests IS 'Weekly AI-generated bilingual summaries of regulatory changes (Phase 6d)';

COMMIT;
