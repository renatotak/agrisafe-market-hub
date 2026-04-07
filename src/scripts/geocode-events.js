/**
 * Geocode events.latitude / events.longitude for rows added by Phase 23.
 *
 * Strategy: municipality-centroid precision via Nominatim only.
 * Events are buildings/parks INSIDE a city, not specific addresses we
 * want pinpointed, so the city centroid from OSM Nominatim is plenty
 * for the Dashboard map. No Google Maps tier (saves the free-tier
 * quota for retailer addresses where it actually matters).
 *
 * Skips events with location='Brasil' / NULL / empty — these are
 * AgroAgenda rows whose city couldn't be parsed from the detail page;
 * geocoding them would just pin every event to the Brazil centroid.
 *
 * Usage:
 *   node --env-file=.env.local src/scripts/geocode-events.js [--dry-run] [--limit N]
 *
 * Re-runs are safe — only processes events where latitude IS NULL.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : 99999;

const NOMINATIM_DELAY_MS = 1100; // Nominatim usage policy: ≤1 req/sec
const stats = { total: 0, geocoded: 0, cached: 0, skipped: 0, failed: 0 };

const muniCache = new Map();

async function supaFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || '',
      ...opts.headers,
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse "Cascavel, PR" → { city: "Cascavel", uf: "PR" }
 * Falls back gracefully if the format is unexpected.
 */
function parseLocation(loc) {
  if (!loc || typeof loc !== 'string') return null;
  const trimmed = loc.trim();
  if (!trimmed || trimmed.toLowerCase() === 'brasil' || trimmed.toLowerCase() === 'brazil') return null;

  const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    // Just a city name, no UF — try anyway, less accurate
    return { city: parts[0], uf: null };
  }
  const last = parts[parts.length - 1];
  const cityPart = parts.slice(0, -1).join(', ');
  // Treat 2-letter last part as UF
  if (last.length === 2 && /^[A-Z]{2}$/i.test(last)) {
    return { city: cityPart, uf: last.toUpperCase() };
  }
  return { city: cityPart, uf: last };
}

async function geocodeByMunicipality(city, uf) {
  const key = uf ? `${city}|${uf}` : city;
  if (muniCache.has(key)) {
    stats.cached++;
    return muniCache.get(key);
  }

  try {
    const params = new URLSearchParams({
      city,
      country: 'Brazil',
      format: 'jsonv2',
      limit: '1',
    });
    if (uf) params.set('state', uf);

    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'AgriSafe Market Hub/1.0 (events backfill; contact: tech@agrisafe.com.br)',
      },
    });
    if (!res.ok) {
      muniCache.set(key, null);
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
      muniCache.set(key, result);
      return result;
    }
  } catch (err) {
    console.error(`  ✗ Nominatim fetch failed for "${city}, ${uf}":`, err.message);
  }
  muniCache.set(key, null);
  return null;
}

async function updateEvent(id, lat, lng) {
  await supaFetch(`events?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ latitude: lat, longitude: lng }),
    prefer: 'return=minimal',
  });
}

async function main() {
  console.log('=== Event Geocoding (Phase 23B) ===');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'WRITE'}`);
  console.log(`Limit: ${LIMIT === 99999 ? 'all' : LIMIT}\n`);

  // Pull every event without lat/lng. Filter client-side because
  // PostgREST doesn't have a clean "location is real" predicate.
  const res = await supaFetch(
    'events?select=id,name,location,source_name&latitude=is.null&order=date',
  );
  const events = await res.json();
  console.log(`Found ${events.length} events without lat/lng total\n`);

  let processed = 0;
  for (const ev of events) {
    if (processed >= LIMIT) break;
    stats.total++;

    const parsed = parseLocation(ev.location);
    if (!parsed) {
      stats.skipped++;
      console.log(`  ↷ skip ${ev.id.slice(0, 30).padEnd(30)} | location='${ev.location}'`);
      continue;
    }

    const { city, uf } = parsed;
    const geocoded = await geocodeByMunicipality(city, uf);

    if (!geocoded) {
      stats.failed++;
      console.log(`  ✗ fail ${ev.id.slice(0, 30).padEnd(30)} | "${city}${uf ? ', ' + uf : ''}"`);
      processed++;
      await sleep(NOMINATIM_DELAY_MS);
      continue;
    }

    if (!dryRun) {
      await updateEvent(ev.id, geocoded.lat, geocoded.lng);
    }
    stats.geocoded++;
    console.log(
      `  ✓ ${dryRun ? 'would write' : 'wrote'} ${ev.id.slice(0, 30).padEnd(30)} | ${geocoded.lat.toFixed(4)},${geocoded.lng.toFixed(4)} | "${city}${uf ? ', ' + uf : ''}"`,
    );
    processed++;
    // Rate-limit only when we actually hit the network (cached results
    // don't count against Nominatim's policy).
    if (!muniCache.get(uf ? `${city}|${uf}` : city) || stats.geocoded === processed) {
      await sleep(NOMINATIM_DELAY_MS);
    }
  }

  console.log('\n=== DONE ===');
  console.log(`Total processed: ${stats.total}`);
  console.log(`  geocoded:      ${stats.geocoded}`);
  console.log(`  cache hits:    ${stats.cached}`);
  console.log(`  skipped (no real location): ${stats.skipped}`);
  console.log(`  failed:        ${stats.failed}`);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars. Run: node --env-file=.env.local src/scripts/geocode-events.js');
  process.exit(1);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
