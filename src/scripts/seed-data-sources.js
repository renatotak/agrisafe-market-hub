/**
 * Phase 25 seed — populate data_sources table from source-registry.json.
 *
 * One-shot. Re-runs are safe (UPSERT by id). Run after migration 045.
 *
 *   node --env-file=.env.local src/scripts/seed-data-sources.js
 *   node --env-file=.env.local src/scripts/seed-data-sources.js --dry
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env vars. Run: node --env-file=.env.local src/scripts/seed-data-sources.js");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const registryPath = path.join(__dirname, "..", "data", "source-registry.json");
  const raw = fs.readFileSync(registryPath, "utf-8");
  const registry = JSON.parse(raw);

  console.log(`=== Seed data_sources ===`);
  console.log(`Source: ${registryPath}`);
  console.log(`Entries: ${registry.length}`);
  console.log(`Mode: ${dryRun ? "DRY" : "LIVE"}\n`);

  // Map JSON entries → table rows. Anything missing in the JSON gets a
  // sane default. Unknown url_status values get coerced to 'unchecked'.
  const validStatus = new Set(["active", "inactive", "error", "unchecked"]);
  const rows = registry.map((e) => ({
    id: e.id,
    name: e.name,
    source_org: e.source_org || null,
    category: e.category || "outros",
    data_type: e.data_type || null,
    description: e.description || null,
    frequency: e.frequency || "nao_informado",
    url: e.url,
    url_secondary: e.url_secondary || null,
    server: e.server || null,
    automated: !!e.automated,
    notes: e.notes || null,
    origin_file: e.origin_file || null,
    url_status: validStatus.has(e.url_status) ? e.url_status : "unchecked",
    http_status: typeof e.http_status === "number" ? e.http_status : null,
    last_checked_at: e.last_checked_at || null,
    last_known_update: e.last_known_update || null,
    used_in_app: !!e.used_in_app,
    active: true,
    confidentiality: "public",
  }));

  if (dryRun) {
    console.log("Sample row:");
    console.log(JSON.stringify(rows[0], null, 2));
    console.log(`\nWould upsert ${rows.length} rows.`);
    return;
  }

  // Chunk to keep payloads reasonable
  const chunkSize = 50;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb
      .from("data_sources")
      .upsert(chunk, { onConflict: "id" });
    if (error) {
      console.error(`Chunk ${i / chunkSize + 1} failed:`, error.message);
      continue;
    }
    upserted += chunk.length;
    process.stdout.write(`  upserted ${upserted}/${rows.length}\r`);
  }
  console.log(`\n✓ Done — upserted ${upserted}/${rows.length} entries.`);

  // Activity log
  try {
    await sb.from("activity_log").insert({
      action: "upsert",
      target_table: "data_sources",
      target_id: null,
      source: "backfill:seed-data-sources",
      source_kind: "backfill",
      actor: "manual",
      summary: `Seeded data_sources from source-registry.json: ${upserted} entries`,
      metadata: { upserted, total: rows.length },
      confidentiality: "public",
    });
  } catch (e) {
    console.warn(`[activity_log] insert failed (non-fatal): ${e.message}`);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
