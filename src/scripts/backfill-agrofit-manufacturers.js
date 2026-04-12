#!/usr/bin/env node
/**
 * Backfill — match AGROFIT titular_registro to legal_entities.
 *
 * For each distinct titular_registro in industry_products:
 * 1. Exact match on legal_entities.display_name or legal_name (case-insensitive)
 * 2. If no match, try razao_social prefix match
 * 3. If still no match, create a new legal_entity with role_type='industry'
 * 4. Update industry_products.manufacturer_entity_uid
 *
 * Usage: node --env-file=.env.local src/scripts/backfill-agrofit-manufacturers.js [--dry-run]
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  // 1. Get distinct titular_registro values that have no manufacturer_entity_uid
  const { data: products } = await supabase
    .from("industry_products")
    .select("titular_registro")
    .is("manufacturer_entity_uid", null)
    .not("titular_registro", "is", null)
    .limit(5000);

  const holders = [...new Set((products || []).map(p => p.titular_registro).filter(Boolean))];
  console.log(`${holders.length} distinct unlinked holders found.`);
  if (holders.length === 0) { console.log("Nothing to do."); return; }

  // 2. Load all legal_entities for matching
  const { data: entities } = await supabase
    .from("legal_entities")
    .select("entity_uid, display_name, legal_name")
    .limit(20000);

  const nameToUid = new Map();
  for (const e of entities || []) {
    if (e.display_name) nameToUid.set(e.display_name.toUpperCase().trim(), e.entity_uid);
    if (e.legal_name) nameToUid.set(e.legal_name.toUpperCase().trim(), e.entity_uid);
  }

  let matched = 0, created = 0, failed = 0;

  for (const holder of holders) {
    const key = holder.toUpperCase().trim();
    let entityUid = nameToUid.get(key);

    // Fuzzy: try without common suffixes (LTDA, S.A., S/A, IND, COM)
    if (!entityUid) {
      const cleaned = key.replace(/\s*(LTDA\.?|S\.?A\.?|S\/A|IND\.?\s*E?\s*COM\.?|INDUSTRIA.*|COMERCIO.*)\s*$/i, "").trim();
      for (const [name, uid] of nameToUid) {
        if (name.startsWith(cleaned) && cleaned.length >= 8) {
          entityUid = uid;
          break;
        }
      }
    }

    if (entityUid) {
      matched++;
      if (!DRY_RUN) {
        await supabase
          .from("industry_products")
          .update({ manufacturer_entity_uid: entityUid })
          .eq("titular_registro", holder);
      }
      continue;
    }

    // Create new legal_entity
    created++;
    if (!DRY_RUN) {
      const newUid = crypto.randomUUID();
      // Use a placeholder tax_id derived from the name hash to avoid unique constraint conflicts
      const placeholder = `AGROFIT_${newUid.slice(0, 8)}`;
      const { error: insertErr } = await supabase.from("legal_entities").insert({
        entity_uid: newUid,
        legal_name: holder,
        display_name: holder,
        tax_id_type: "cnpj",
        tax_id: placeholder,
        source_ref: `agrofit_titular:${holder.slice(0, 50)}`,
      });

      if (insertErr) {
        console.error(`  ✗ Create entity failed for "${holder}": ${insertErr.message}`);
        failed++;
        continue;
      }

      // Add industry role (fail-soft)
      const { error: roleErr } = await supabase.from("entity_roles").insert({
        entity_uid: newUid,
        role_type: "industry",
      });
      if (roleErr && !roleErr.message.includes("duplicate")) {
        console.error(`  ⚠ Role insert for "${holder}": ${roleErr.message}`);
      }

      // Update products
      await supabase
        .from("industry_products")
        .update({ manufacturer_entity_uid: newUid })
        .eq("titular_registro", holder);

      nameToUid.set(key, newUid);
    }
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Results:`);
  console.log(`  Matched to existing entities: ${matched}`);
  console.log(`  New entities created: ${created}`);
  if (failed) console.log(`  Failed: ${failed}`);

  // Verify
  if (!DRY_RUN) {
    const { count: linked } = await supabase
      .from("industry_products")
      .select("*", { count: "exact", head: true })
      .not("manufacturer_entity_uid", "is", null);
    const { count: total } = await supabase
      .from("industry_products")
      .select("*", { count: "exact", head: true });
    console.log(`\n  Products with manufacturer_entity_uid: ${linked}/${total}`);
  }
}

main().catch(console.error);
