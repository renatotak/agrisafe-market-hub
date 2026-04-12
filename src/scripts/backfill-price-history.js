#!/usr/bin/env node
/**
 * One-shot backfill — fetches 90 days of BCB SGS price history
 * and populates commodity_price_history for stddev calculations.
 *
 * Usage: node --env-file=.env.local src/scripts/backfill-price-history.js
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const SERIES = {
  soy:    { series: 11752, unit: "R$/sc 60kg" },
  corn:   { series: 11753, unit: "R$/sc 60kg" },
  coffee: { series: 11754, unit: "R$/sc 60kg" },
  sugar:  { series: 11755, unit: "R$/sc 50kg" },
  cotton: { series: 11756, unit: "¢/lb" },
  citrus: { series: 11757, unit: "R$/cx 40.8kg" },
};

function parseBCBDate(dateStr) {
  const [d, m, y] = dateStr.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function fetchBCB(seriesCode) {
  // BCB CEPEA series are monthly. Fetch last 2 years via date range.
  const end = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados?formato=json&dataInicial=01/01/2024&dataFinal=${end}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`BCB ${seriesCode}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  let totalUpserted = 0;

  for (const [id, cfg] of Object.entries(SERIES)) {
    console.log(`Fetching ${id} (BCB ${cfg.series})...`);
    try {
      const raw = await fetchBCB(cfg.series);
      const rows = [];

      for (let i = 0; i < raw.length; i++) {
        const price = parseFloat(raw[i].valor);
        if (!Number.isFinite(price)) continue;
        const date = parseBCBDate(raw[i].data);
        const prevPrice = i > 0 ? parseFloat(raw[i - 1].valor) : null;
        const change = prevPrice && prevPrice > 0
          ? Math.round(((price - prevPrice) / prevPrice) * 10000) / 100
          : 0;

        rows.push({
          commodity_id: id,
          price,
          change_24h: change,
          recorded_at: date,
        });
      }

      const { error, count } = await supabase
        .from("commodity_price_history")
        .upsert(rows, { onConflict: "commodity_id,recorded_at", count: "exact" });

      if (error) {
        console.error(`  ✗ ${id}: ${error.message}`);
      } else {
        console.log(`  ✓ ${id}: ${rows.length} rows upserted`);
        totalUpserted += rows.length;
      }
    } catch (err) {
      console.error(`  ✗ ${id}: ${err.message}`);
    }
  }

  console.log(`\nDone — ${totalUpserted} total rows upserted.`);

  // Verify the stats view
  const { data: stats } = await supabase.from("v_commodity_price_stats").select("*");
  if (stats && stats.length > 0) {
    console.log("\nPrice stats (30-day rolling):");
    for (const s of stats) {
      console.log(`  ${s.commodity_id}: avg_change=${s.avg_change}%, stddev=${s.stddev_change}%, obs=${s.obs_count}`);
    }
  } else {
    console.log("\n⚠ Stats view returned empty — check if HAVING >= 5 is met.");
  }
}

main();
