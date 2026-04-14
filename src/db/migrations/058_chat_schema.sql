-- ============================================================
-- Migration 058: App Campo — persistent chat schema
-- ============================================================
-- Three tables + Supabase Realtime publication wiring.
--
-- chat_threads       — one per conversation (per entity_uid, per topic)
-- chat_participants  — who's in a thread (agrisafe user | rep identifier)
-- chat_messages      — individual messages with delivery-status columns
--
-- Realtime is the transport (Postgres LISTEN/NOTIFY over WebSocket):
-- a client subscribed to `public:chat_messages` sees INSERT + UPDATE
-- rows as they happen, so `delivered_at` / `read_at` updates propagate
-- without a separate event bus.
-- ============================================================

-- ─── 1. chat_threads ────────────────────────────────────────
-- One row per conversation. Anchored to a legal_entity so every
-- thread is discoverable from the Diretório panel. `topic` lets
-- AgriSafe HQ open a second thread for a specific deal/campaign
-- without polluting the main thread.

CREATE TABLE IF NOT EXISTS chat_threads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_uid        uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  topic             text,                                  -- free-text label, NULL = main thread
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','archived','blocked')),
  last_message_at   timestamptz,
  last_message_preview text,
  unread_count_hq   int NOT NULL DEFAULT 0,                -- messages AgriSafe HQ hasn't read
  unread_count_rep  int NOT NULL DEFAULT 0,                -- messages the rep hasn't read
  created_by        text,                                  -- 'hq' | 'rep' | 'system'
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_entity ON chat_threads(entity_uid);
CREATE INDEX IF NOT EXISTS idx_chat_threads_last_msg ON chat_threads(last_message_at DESC NULLS LAST);

-- Only one "main" (topic IS NULL) thread per entity; additional threads
-- use distinct topics.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_chat_threads_main ON chat_threads(entity_uid) WHERE topic IS NULL;

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read chat_threads" ON chat_threads;
CREATE POLICY "Public read chat_threads" ON chat_threads FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service write chat_threads" ON chat_threads;
CREATE POLICY "Service write chat_threads" ON chat_threads FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE chat_threads IS
  'Phase 30 — persistent chat between AgriSafe HQ and App Campo reps. One main thread per entity + optional topic-specific threads.';

-- ─── 2. chat_participants ───────────────────────────────────
-- Who is in a thread. `actor_kind` distinguishes AgriSafe HQ users
-- from remote reps (App Campo identifies by api_key + a stable
-- client_id the app provisions on first launch). The `actor_ref`
-- column stores whichever is relevant (email for HQ, client_id for
-- rep). Kept deliberately polymorphic because App Campo auth model
-- isn't finalized yet.

CREATE TABLE IF NOT EXISTS chat_participants (
  thread_id       uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  actor_kind      text NOT NULL CHECK (actor_kind IN ('hq','rep','bot')),
  actor_ref       text NOT NULL,                          -- email | client_id | bot_id
  display_name    text,
  role            text CHECK (role IS NULL OR role IN ('owner','member','readonly')),
  last_read_at    timestamptz,                            -- for per-participant unread counts
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, actor_kind, actor_ref)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_ref ON chat_participants(actor_kind, actor_ref);

ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read chat_participants" ON chat_participants;
CREATE POLICY "Public read chat_participants" ON chat_participants FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service write chat_participants" ON chat_participants;
CREATE POLICY "Service write chat_participants" ON chat_participants FOR ALL USING (true) WITH CHECK (true);

-- ─── 3. chat_messages ───────────────────────────────────────
-- One row per message. Delivery status lives on the row, so an
-- UPDATE flipping `delivered_at` is what Realtime broadcasts.
-- Attachments carry a Supabase Storage path (signed URL generated
-- at read time — kept out of the row so expired signatures don't
-- persist).

CREATE TABLE IF NOT EXISTS chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  entity_uid      uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  sender_kind     text NOT NULL CHECK (sender_kind IN ('hq','rep','bot')),
  sender_ref      text NOT NULL,
  sender_name     text,
  body            text,                                    -- NULL allowed when only attachments
  attachment_path text,                                    -- Supabase Storage key, signed at fetch time
  attachment_kind text CHECK (attachment_kind IS NULL OR attachment_kind IN ('image','pdf','doc','other')),
  attachment_meta jsonb NOT NULL DEFAULT '{}'::jsonb,      -- size, mime, original filename
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','delivered','read','failed')),
  failure_reason  text,
  retry_count     int NOT NULL DEFAULT 0,
  sent_at         timestamptz,                             -- when the DB accepted the insert
  delivered_at    timestamptz,                             -- device ack
  read_at         timestamptz,                             -- recipient opened
  reply_to_id     uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread   ON chat_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_entity   ON chat_messages(entity_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_status   ON chat_messages(status) WHERE status IN ('queued','failed');
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender   ON chat_messages(sender_kind, sender_ref);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read chat_messages" ON chat_messages;
CREATE POLICY "Public read chat_messages" ON chat_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service write chat_messages" ON chat_messages;
CREATE POLICY "Service write chat_messages" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE chat_messages IS
  'Phase 30 — chat messages with delivery status (queued/sent/delivered/read/failed). Realtime publishes INSERT + UPDATE so clients see status changes live.';

-- ─── 4. Thread aggregate trigger ─────────────────────────────
-- Keep chat_threads.last_message_at / preview / unread counts
-- in sync without asking the app to do it on every send.

CREATE OR REPLACE FUNCTION trg_chat_message_touch_thread()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE chat_threads
    SET last_message_at      = COALESCE(NEW.sent_at, NEW.created_at),
        last_message_preview = LEFT(COALESCE(NEW.body, '[anexo]'), 160),
        unread_count_hq      = CASE WHEN NEW.sender_kind = 'rep' THEN unread_count_hq + 1 ELSE unread_count_hq END,
        unread_count_rep     = CASE WHEN NEW.sender_kind = 'hq'  THEN unread_count_rep + 1 ELSE unread_count_rep END,
        updated_at           = now()
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chat_message_touch_thread ON chat_messages;
CREATE TRIGGER chat_message_touch_thread
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION trg_chat_message_touch_thread();

CREATE OR REPLACE FUNCTION trg_chat_message_on_read()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- When a message flips to read_at, decrement the recipient's unread
  -- counter once. sender_kind tells us who SENT, so the OPPOSITE side
  -- is the one reading.
  IF NEW.read_at IS NOT NULL AND (OLD.read_at IS NULL OR OLD.read_at IS DISTINCT FROM NEW.read_at) THEN
    UPDATE chat_threads
    SET unread_count_hq  = CASE WHEN NEW.sender_kind = 'rep' THEN GREATEST(unread_count_hq - 1, 0) ELSE unread_count_hq END,
        unread_count_rep = CASE WHEN NEW.sender_kind = 'hq'  THEN GREATEST(unread_count_rep - 1, 0) ELSE unread_count_rep END,
        updated_at       = now()
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chat_message_on_read ON chat_messages;
CREATE TRIGGER chat_message_on_read
  AFTER UPDATE OF read_at ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION trg_chat_message_on_read();

-- ─── 5. Realtime publication wiring ──────────────────────────
-- Supabase Realtime listens on the `supabase_realtime` publication.
-- Add the chat tables so Postgres INSERT/UPDATE rows stream to
-- subscribed clients. Idempotent via DO block.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_threads;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- supabase_realtime publication only exists in a real Supabase
    -- project; local psql test runs skip this gracefully.
    NULL;
END $$;

-- ─── 6. entity_features flag for premium gating ─────────────
-- Extremely minimal per-entity feature table — used today to toggle
-- the chat feature on/off per premium client. Will grow into a
-- proper entitlements system later.

CREATE TABLE IF NOT EXISTS entity_features (
  entity_uid   uuid PRIMARY KEY REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  has_chat     boolean NOT NULL DEFAULT false,
  premium_tier text CHECK (premium_tier IS NULL OR premium_tier IN ('standard','premium','enterprise')),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE entity_features ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read entity_features" ON entity_features;
CREATE POLICY "Public read entity_features" ON entity_features FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service write entity_features" ON entity_features;
CREATE POLICY "Service write entity_features" ON entity_features FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE entity_features IS
  'Per-entity feature flags. has_chat gates the App Campo persistent chat for premium-tier clients.';
