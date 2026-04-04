/**
 * Geocode retailer_locations that have null latitude/longitude.
 *
 * Strategy (3 tiers, each tagged with precision level):
 *   1. Google Maps Geocoding API — street-level → geo_precision='address'
 *   2. AwesomeAPI CEP — postal code area → geo_precision='cep'
 *   3. Nominatim municipality — city centroid → geo_precision='municipality'
 *
 * Usage:
 *   node --env-file=.env.local src/scripts/geocode-retailers.js [--limit N] [--skip-google]
 *
 *   --limit N       Process only N locations (default: all)
 *   --skip-google   Skip Google tier, use only CEP + municipality
 *
 * Prerequisites:
 *   - Run migration 010_geo_precision.sql first (adds geo_precision column)
 *   - NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local (for Google tier)
 *   - SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const args = process.argv.slice(2);
const skipGoogle = args.includes("--skip-google");
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? parseInt(args[limitArg + 1]) : 99999;

const BATCH_SIZE = 100;
const GOOGLE_DELAY = 110; // ~9/sec (Google limit is 50/sec, stay safe)
const CEP_DELAY = 200;

const stats = { total: 0, google: 0, cep: 0, municipality: 0, failed: 0 };

async function supaFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "",
      ...opts.headers,
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Tier 1: Google Maps Geocoding (precise) ────────────────────────────────

let googleQuotaReached = false;

async function geocodeByGoogle(loc) {
  if (!GOOGLE_KEY || googleQuotaReached) return null;

  const address = [loc.logradouro, loc.numero, loc.bairro, loc.municipio, loc.uf, loc.cep, "Brasil"]
    .filter(Boolean)
    .join(", ");

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}&region=br&language=pt-BR`;
    const r = await fetch(url);
    const d = await r.json();

    if (d.status === "OK" && d.results?.[0]) {
      const { lat, lng } = d.results[0].geometry.location;
      const locationType = d.results[0].geometry.location_type; // ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER, APPROXIMATE
      // Only count as 'address' precision if ROOFTOP or RANGE_INTERPOLATED
      const precision = locationType === "ROOFTOP" || locationType === "RANGE_INTERPOLATED" ? "address" : "cep";
      return { lat, lng, precision };
    }
    if (d.status === "OVER_QUERY_LIMIT") {
      console.log("\n  ⚠ Google API quota reached — switching to CEP/municipality only");
      googleQuotaReached = true;
      return null;
    }
  } catch {}
  return null;
}

// ─── Tier 2: CEP geocoding (approximate — postal code area) ─────────────────

const cepCache = new Map();

async function geocodeByCep(cep) {
  if (!cep || cep.length < 7) return null;
  if (cepCache.has(cep)) return cepCache.get(cep);

  try {
    const r = await fetch(`https://cep.awesomeapi.com.br/json/${cep}`);
    if (!r.ok) { cepCache.set(cep, null); return null; }
    const d = await r.json();
    if (d.lat && d.lng) {
      const result = { lat: parseFloat(d.lat), lng: parseFloat(d.lng), precision: "cep" };
      cepCache.set(cep, result);
      return result;
    }
  } catch {}
  cepCache.set(cep, null);
  return null;
}

// ─── Tier 3: Municipality centroid (least precise) ──────────────────────────

const muniCache = new Map();

async function geocodeByMunicipality(municipio, uf) {
  const key = `${municipio}|${uf}`;
  if (muniCache.has(key)) return muniCache.get(key);

  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(municipio)}&state=${encodeURIComponent(uf)}&country=Brazil&format=jsonv2&limit=1`;
    const r = await fetch(url, {
      headers: { "User-Agent": "AgriSafeMarketHub/1.0 (geocoding@agrisafe.com.br)" },
    });
    const data = await r.json();
    if (data[0]) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), precision: "municipality" };
      muniCache.set(key, result);
      return result;
    }
  } catch {}
  muniCache.set(key, null);
  return null;
}

// ─── Update Supabase ────────────────────────────────────────────────────────

async function updateLocation(id, lat, lng, precision) {
  await supaFetch(`retailer_locations?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ latitude: lat, longitude: lng, geo_precision: precision }),
    prefer: "return=minimal",
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Retailer Geocoding ===");
  console.log(`Google: ${skipGoogle ? "DISABLED" : GOOGLE_KEY ? "enabled (free tier)" : "NO KEY"}`);
  console.log(`Limit: ${LIMIT === 99999 ? "all" : LIMIT}\n`);

  let offset = 0;
  let processed = 0;

  while (processed < LIMIT) {
    const r = await supaFetch(
      `retailer_locations?select=id,logradouro,numero,bairro,cep,municipio,uf&latitude=is.null&order=id&limit=${BATCH_SIZE}&offset=${offset}`
    );
    const locations = await r.json();
    if (!locations.length) break;

    for (const loc of locations) {
      if (processed >= LIMIT) break;
      processed++;
      stats.total++;

      let result = null;

      // Tier 1: Google (precise)
      if (!skipGoogle && !googleQuotaReached) {
        result = await geocodeByGoogle(loc);
        if (result) {
          await updateLocation(loc.id, result.lat, result.lng, result.precision);
          if (result.precision === "address") stats.google++;
          else stats.cep++; // Google returned approximate
          await sleep(GOOGLE_DELAY);
          if (stats.total % 50 === 0) logProgress();
          continue;
        }
        await sleep(GOOGLE_DELAY);
      }

      // Tier 2: CEP
      result = await geocodeByCep(loc.cep);
      if (result) {
        await updateLocation(loc.id, result.lat, result.lng, result.precision);
        stats.cep++;
        await sleep(CEP_DELAY);
        if (stats.total % 50 === 0) logProgress();
        continue;
      }

      // Tier 3: Municipality
      if (loc.municipio && loc.uf) {
        result = await geocodeByMunicipality(loc.municipio, loc.uf);
        if (result) {
          await updateLocation(loc.id, result.lat, result.lng, result.precision);
          stats.municipality++;
          await sleep(1100); // Nominatim 1 req/sec
          if (stats.total % 50 === 0) logProgress();
          continue;
        }
      }

      stats.failed++;
      if (stats.total % 50 === 0) logProgress();
    }

    // Don't increment offset — we always query for latitude=is.null,
    // so already-updated rows won't appear again
  }

  console.log("\n=== DONE ===");
  logProgress();
  console.log(`\nPrecision breakdown:`);
  console.log(`  address (street-level):  ${stats.google}`);
  console.log(`  cep (postal area):       ${stats.cep}`);
  console.log(`  municipality (centroid): ${stats.municipality}`);
  console.log(`  failed:                  ${stats.failed}`);
}

function logProgress() {
  const pct = stats.total > 0 ? Math.round(((stats.google + stats.cep + stats.municipality) / stats.total) * 100) : 0;
  console.log(
    `[${stats.total}] addr:${stats.google} cep:${stats.cep} muni:${stats.municipality} fail:${stats.failed} (${pct}%)`
  );
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env vars. Run: node --env-file=.env.local src/scripts/geocode-retailers.js");
  process.exit(1);
}

main().catch(console.error);
