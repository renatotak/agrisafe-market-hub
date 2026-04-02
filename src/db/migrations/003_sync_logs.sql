-- ============================================================
-- AgriSafe Market Hub — Sync Logs Table
-- Tracks cron job execution history for DataSources module
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,              -- 'sync-market-data', 'sync-agro-news', etc.
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  records_fetched integer DEFAULT 0,
  records_inserted integer DEFAULT 0,
  errors integer DEFAULT 0,
  status text DEFAULT 'success',     -- 'success', 'error', 'partial'
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_source ON sync_logs(source);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON sync_logs(started_at DESC);

ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for sync_logs"
  ON sync_logs FOR SELECT USING (true);

CREATE POLICY "Service role write for sync_logs"
  ON sync_logs FOR INSERT WITH CHECK (true);
