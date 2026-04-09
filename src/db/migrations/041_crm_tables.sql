-- ============================================================
-- Migration 041 — CRM tables (Phase 24G)
-- Depends on: 018 (legal_entities), 022 (confidentiality enum)
-- ============================================================
--
-- The Diretório de Canais is becoming AgriSafe's CRM. Until now the
-- only CRM-flavored data lived in `company_notes` (free-text user
-- notes per CNPJ) — no structure for key persons, no meeting log,
-- no lead pipeline. Phase 24G adds the three foundational tables and
-- defaults every row to `agrisafe_confidential` so the Phase 24G
-- confidentiality enforcement (mig 040 + src/lib/confidentiality.ts)
-- gates them out of public reads.
--
-- Anchoring: every CRM row points at a `legal_entities.entity_uid`,
-- not at the legacy `retailers.cnpj_raiz`. This means a single key
-- person / meeting / lead can be attached to a retailer, an industry,
-- a competitor, or any future role — the 5-entity model pays off
-- here exactly as planned.
-- ============================================================

-- ─── 1. key_persons ────────────────────────────────────────────
-- Named contacts at a legal_entity. The QSA from Receita Federal is
-- already in `company_enrichment.qsa` jsonb — that's the ground-truth
-- shareholder list. `key_persons` is the AgriSafe-curated layer of
-- "people we actually talk to": commercial contacts, decision-makers,
-- gatekeepers. They may or may not appear in QSA.

CREATE TABLE IF NOT EXISTS key_persons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_uid      uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  full_name       text NOT NULL,
  role_title      text,                              -- 'CEO', 'Diretor Comercial', 'Comprador', 'Gerente Regional'
  department      text,                              -- 'Comercial', 'Compras', 'TI', 'Diretoria'
  email           text,
  phone           text,
  whatsapp        text,
  linkedin_url    text,
  notes           text,                              -- free-text background, mood, history, gotchas
  is_decision_maker boolean DEFAULT false,
  is_gatekeeper     boolean DEFAULT false,
  active          boolean NOT NULL DEFAULT true,     -- soft-delete via active=false
  confidentiality text NOT NULL DEFAULT 'agrisafe_confidential'
                    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_key_persons_entity ON key_persons(entity_uid) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_key_persons_confidentiality ON key_persons(confidentiality);

ALTER TABLE key_persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read key_persons" ON key_persons FOR SELECT USING (true);
CREATE POLICY "Service write key_persons" ON key_persons FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE key_persons IS
  'Phase 24G — AgriSafe-curated contacts at legal_entities. Distinct from company_enrichment.qsa (which is the official RF shareholder list). Defaults to agrisafe_confidential.';

-- ─── 2. meetings ──────────────────────────────────────────────
-- Meeting log per entity. Notes go in `summary`; the user can later
-- import OneNote files into this table once we wire the MS Graph
-- ingest path (deferred from Phase 24G).

CREATE TABLE IF NOT EXISTS meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_uid      uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  meeting_date    date NOT NULL,
  meeting_type    text DEFAULT 'comercial'
                    CHECK (meeting_type IN ('comercial','tecnica','prospeccao','followup','contrato','outro')),
  attendees       text[],                            -- mix of AgriSafe + counterparty names; full normalization not worth it yet
  agenda          text,
  summary         text,                              -- post-meeting notes
  next_steps      text,
  outcome         text DEFAULT 'pending'
                    CHECK (outcome IN ('pending','positive','neutral','negative')),
  source          text DEFAULT 'manual'              -- 'manual' | 'onenote_import' (future) | 'calendar_sync' (future)
                    CHECK (source IN ('manual','onenote_import','calendar_sync','email_thread')),
  external_id     text,                              -- OneNote page id, calendar event id, etc.
  confidentiality text NOT NULL DEFAULT 'agrisafe_confidential'
                    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_entity_date ON meetings(entity_uid, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_confidentiality ON meetings(confidentiality);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read meetings" ON meetings FOR SELECT USING (true);
CREATE POLICY "Service write meetings" ON meetings FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE meetings IS
  'Phase 24G — meeting log per entity. Defaults to agrisafe_confidential. Source field anticipates future OneNote / calendar / email-thread imports.';

-- ─── 3. leads ─────────────────────────────────────────────────
-- Sales pipeline. Each lead has a stage that mirrors the standard
-- BANT/SPIN funnel adapted to AgriSafe's services. `linked_campaign_id`
-- ties leads to the existing `campaigns` table (mig 006) so a lead
-- generated by a Central de Conteúdo campaign can be tracked.

CREATE TABLE IF NOT EXISTS leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_uid          uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  primary_contact_id  uuid REFERENCES key_persons(id) ON DELETE SET NULL,
  stage               text NOT NULL DEFAULT 'new'
                        CHECK (stage IN ('new','qualified','proposal','negotiation','won','lost','dormant')),
  service_interest    text,                          -- 'credit_intelligence' | 'monitoring' | 'collection' | 'market_hub_access' | free-text
  estimated_value_brl numeric,
  probability_pct     int CHECK (probability_pct IS NULL OR (probability_pct BETWEEN 0 AND 100)),
  expected_close_date date,
  source              text DEFAULT 'manual'          -- 'manual' | 'campaign' | 'inbound' | 'referral'
                        CHECK (source IN ('manual','campaign','inbound','referral','event','partner')),
  linked_campaign_id  text REFERENCES campaigns(id) ON DELETE SET NULL,
  notes               text,
  owner               text,                          -- AgriSafe team member name (free-text until users table lands)
  confidentiality     text NOT NULL DEFAULT 'agrisafe_confidential'
                        CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_entity ON leads(entity_uid);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(linked_campaign_id) WHERE linked_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_confidentiality ON leads(confidentiality);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read leads" ON leads FOR SELECT USING (true);
CREATE POLICY "Service write leads" ON leads FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE leads IS
  'Phase 24G — sales pipeline. Anchored to legal_entities, optionally linked to campaigns (mig 006). Defaults to agrisafe_confidential.';

-- ─── 4. updated_at triggers ────────────────────────────────────
-- Match the pattern from migration 036 (analysis_lenses).

CREATE OR REPLACE FUNCTION trg_crm_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS key_persons_touch ON key_persons;
CREATE TRIGGER key_persons_touch BEFORE UPDATE ON key_persons FOR EACH ROW EXECUTE FUNCTION trg_crm_touch();

DROP TRIGGER IF EXISTS meetings_touch ON meetings;
CREATE TRIGGER meetings_touch BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION trg_crm_touch();

DROP TRIGGER IF EXISTS leads_touch ON leads;
CREATE TRIGGER leads_touch BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION trg_crm_touch();
