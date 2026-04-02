-- Price history table for storing daily commodity price snapshots
-- Used by MarketPulse sparklines and comparison charts

CREATE TABLE IF NOT EXISTS commodity_price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  commodity_id TEXT NOT NULL,
  price NUMERIC(12, 4) NOT NULL,
  change_24h NUMERIC(6, 2) DEFAULT 0,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commodity_id, recorded_at)
);

-- Index for fast lookups by commodity
CREATE INDEX IF NOT EXISTS idx_price_history_commodity
  ON commodity_price_history (commodity_id, recorded_at DESC);

-- RLS: allow public read access (public data only)
ALTER TABLE commodity_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for commodity price history"
  ON commodity_price_history FOR SELECT
  USING (true);

CREATE POLICY "Service role insert for commodity price history"
  ON commodity_price_history FOR INSERT
  WITH CHECK (true);
