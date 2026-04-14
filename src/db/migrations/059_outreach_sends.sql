-- ============================================================
-- Migration 059: Outreach — per-recipient send tracking + suppression
-- ============================================================
-- Schema-only this migration. The actual delivery is wired in a
-- follow-up once we choose the email provider (Resend preferred).
-- That choice doesn't change this contract:
--
--   campaign_sends     — one row per (campaign × recipient).
--                         Carries provider-side message_id + status.
--   suppression_list   — global opt-out, enforced before insert.
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  entity_uid      uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name  text,
  channel         text NOT NULL DEFAULT 'email'
                    CHECK (channel IN ('email','newsletter','app_campo_inbox')),
  provider        text,                                    -- 'resend' | 'sendgrid' | NULL when in-app
  provider_msg_id text,                                    -- provider's message id for webhook lookup
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','delivered','opened','clicked','bounced','complained','suppressed','failed')),
  failure_reason  text,
  retry_count     int NOT NULL DEFAULT 0,
  scheduled_at    timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  opened_at       timestamptz,
  clicked_at      timestamptz,
  bounced_at      timestamptz,
  complained_at   timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,      -- subject, template_id, links
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_entity   ON campaign_sends(entity_uid);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_status   ON campaign_sends(status);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_provider_msg ON campaign_sends(provider_msg_id) WHERE provider_msg_id IS NOT NULL;

ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read campaign_sends" ON campaign_sends;
CREATE POLICY "Public read campaign_sends" ON campaign_sends FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service write campaign_sends" ON campaign_sends;
CREATE POLICY "Service write campaign_sends" ON campaign_sends FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE campaign_sends IS
  'Per-recipient outreach send tracking. Status moves queued → sent → delivered → opened → clicked, with bounce/complaint terminal states. Provider webhooks update timestamps.';

-- ─── suppression_list ───────────────────────────────────────
-- Global opt-out + bounce/complaint suppression. Checked before
-- queueing a send. `reason` distinguishes user-requested vs
-- provider-mandated entries (the latter are permanent).

CREATE TABLE IF NOT EXISTS suppression_list (
  email          text PRIMARY KEY,
  reason         text NOT NULL CHECK (reason IN ('unsubscribe','bounce_hard','bounce_soft','complaint','manual')),
  source         text,                                    -- 'user_link' | 'provider_webhook' | 'admin_ui'
  campaign_id    text REFERENCES campaigns(id) ON DELETE SET NULL,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppression_reason ON suppression_list(reason);

ALTER TABLE suppression_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read suppression_list" ON suppression_list;
CREATE POLICY "Public read suppression_list" ON suppression_list FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service write suppression_list" ON suppression_list;
CREATE POLICY "Service write suppression_list" ON suppression_list FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE suppression_list IS
  'Global email suppression. Always check before queueing a campaign_sends row. Hard bounces + complaints are permanent.';

-- updated_at touch
CREATE OR REPLACE FUNCTION trg_campaign_sends_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS campaign_sends_touch ON campaign_sends;
CREATE TRIGGER campaign_sends_touch BEFORE UPDATE ON campaign_sends FOR EACH ROW EXECUTE FUNCTION trg_campaign_sends_touch();
