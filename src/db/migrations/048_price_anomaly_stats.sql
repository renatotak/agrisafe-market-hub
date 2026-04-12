-- ============================================================
-- Migration 048 — Price anomaly detection infrastructure
-- Depends on: 002 (commodity_price_history), 047 (executive_briefings)
-- ============================================================

-- Rolling statistics per commodity for anomaly detection.
-- BCB CEPEA series are monthly, so we use a 365-day window
-- to get ~12 observations per commodity.
CREATE OR REPLACE VIEW v_commodity_price_stats AS
SELECT
  commodity_id,
  COUNT(*)::int AS obs_count,
  ROUND(AVG(change_24h)::numeric, 4) AS avg_change,
  ROUND(STDDEV(change_24h)::numeric, 4) AS stddev_change,
  ROUND(AVG(price)::numeric, 4) AS avg_price,
  ROUND(STDDEV(price)::numeric, 4) AS stddev_price,
  MAX(recorded_at) AS latest_date,
  MAX(price) AS max_price,
  MIN(price) AS min_price
FROM commodity_price_history
WHERE recorded_at >= CURRENT_DATE - 365
GROUP BY commodity_id
HAVING COUNT(*) >= 5;

-- Add price_ruptures column to executive_briefings
ALTER TABLE executive_briefings
  ADD COLUMN IF NOT EXISTS price_ruptures jsonb DEFAULT '[]'::jsonb;
