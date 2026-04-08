/**
 * One-off backfill: load `local files/26-0407 industrias.csv` into the
 * 5-entity model so the Diretório de Indústrias chapter can surface
 * every catalogued agribusiness industry, not just the 18 curated brands.
 *
 * Writes to:
 *   - legal_entities  (one row per CNPJ, role-bearing actor)
 *   - entity_roles    (role_type='industry', metadata={inpev, filiais, cnae})
 *   - company_enrichment (Receita Federal-style fields from the CSV)
 *
 * Idempotent — re-running upserts the same rows. Skips rows whose
 * `Comentários` column contains "apagar" (manual delete marker).
 *
 * Usage: node --env-file=.env.local src/scripts/backfill-industries-from-csv.js
 */

const fs = require('node:fs');
const path = require('node:path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env');
  process.exit(1);
}

const CSV_PATH = path.join(process.cwd(), 'local files', '26-0407 industrias.csv');
const SOURCE_REF = 'csv:industrias_2026-04-07';

// ── Minimal RFC-style CSV parser ──────────────────────────────────────────
// Handles quoted fields with embedded commas + double-quote escaping. The
// CSV has CRLF line endings on Windows; both \r and \n are treated as row
// terminators. Empty cells are preserved as ''.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(cell);
        cell = '';
      } else if (c === '\n' || c === '\r') {
        // Only flush a row when we've accumulated something
        if (cell !== '' || row.length > 0) {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = '';
        }
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else {
        cell += c;
      }
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ── Supabase REST helpers (no SDK — keep deps zero) ────────────────────────
async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path}: ${res.status} ${body}`);
  }
  // return=minimal yields 201/204 with empty body — guard JSON parse.
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

/**
 * SELECT-then-INSERT pattern. legal_entities has a partial unique INDEX
 * on tax_id (WHERE tax_id IS NOT NULL) but no real UNIQUE CONSTRAINT,
 * so PostgREST onConflict=tax_id is rejected with 42P10. We avoid the
 * issue by checking existence first.
 */
async function upsertLegalEntity(row) {
  const existing = await sb(
    `legal_entities?tax_id=eq.${encodeURIComponent(row.cnpj_basico)}&select=entity_uid,display_name`,
    { method: 'GET', prefer: '' }
  );
  if (Array.isArray(existing) && existing.length > 0) {
    return { entity_uid: existing[0].entity_uid, created: false };
  }
  const result = await sb('legal_entities', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify({
      tax_id: row.cnpj_basico,
      tax_id_type: 'cnpj',
      legal_name: row.razao_social,
      display_name: row.razao_social,
      confidentiality: 'public',
      source_ref: `${SOURCE_REF}:${row.cnpj_basico}`,
    }),
  });
  const ent = Array.isArray(result) ? result[0] : result;
  return { entity_uid: ent.entity_uid, created: true };
}

/**
 * entity_roles PK is (entity_uid, role_type) — onConflict works because
 * the PK is a real constraint. We pack all the RF fields from the CSV
 * into the metadata jsonb so the directory UI can render them without a
 * separate enrichment table. company_enrichment is retailer-FK-bound and
 * therefore unsuitable for industries.
 */
async function upsertEntityRole(entity_uid, metadata) {
  await sb('entity_roles?on_conflict=entity_uid,role_type', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: JSON.stringify({
      entity_uid,
      role_type: 'industry',
      metadata,
    }),
  });
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Industries CSV backfill ===');
  console.log(`Reading ${CSV_PATH}`);

  const buf = fs.readFileSync(CSV_PATH);
  // CSV is Windows-1252 (cp1252) encoded — use TextDecoder for proper
  // accents (Comércio, Agrícolas, etc.) instead of latin1 substitution.
  const text = new TextDecoder('windows-1252').decode(buf);

  const lines = parseCsv(text);
  if (lines.length < 2) {
    console.error('CSV is empty or unparseable');
    process.exit(1);
  }
  const headers = lines[0];
  const records = lines.slice(1).map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] || '']))
  );
  console.log(`Parsed ${records.length} rows (header + data)`);

  // Filter "apagar" rows
  const COMENTARIOS_KEY = headers.find((h) => h.toLowerCase().startsWith('coment')) || 'Comentários';
  const INPEV_KEY = headers.find((h) => h.toLowerCase().startsWith('inpev')) || 'Inpev?';
  const NATUREZA_KEY = headers.find((h) => h.toLowerCase().startsWith('natureza jur')) || 'Natureza Jurídica (rec fed)';

  const keepers = records.filter(
    (r) => !((r[COMENTARIOS_KEY] || '').toLowerCase().includes('apagar'))
  );
  console.log(`After 'apagar' filter: ${keepers.length} keepers`);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = {
    parsed: records.length,
    skippedApagar: records.length - keepers.length,
    skippedInvalidCnpj: 0,
    legalEntitiesCreated: 0,
    legalEntitiesReused: 0,
    entityRolesUpserted: 0,
    failed: 0,
  };

  for (let i = 0; i < keepers.length; i++) {
    const r = keepers[i];
    const rawCnpj = (r.cnpj || r.cnpj_raiz || '').trim();
    const cnpj_basico = rawCnpj.padStart(8, '0');
    if (!/^\d{8}$/.test(cnpj_basico)) {
      stats.skippedInvalidCnpj++;
      console.log(`  ✗ skip invalid cnpj: "${rawCnpj}" (${r.razao_social})`);
      continue;
    }

    const normalized = {
      cnpj_basico,
      razao_social: r.razao_social || null,
      capital_social: r.capital_social ? Number(r.capital_social) || null : null,
      porte: r.porte || null,
      cnae_fiscal: r.cnae_matriz || null,
      cnae_fiscal_descricao: r['Descricao CNAE matriz'] || null,
      natureza_juridica: r[NATUREZA_KEY] || null,
    };

    try {
      const entity = await upsertLegalEntity(normalized);
      if (!entity || !entity.entity_uid) {
        stats.failed++;
        console.log(`  ✗ legal_entities upsert returned no entity_uid for ${cnpj_basico}`);
        continue;
      }
      if (entity.created) stats.legalEntitiesCreated++;
      else stats.legalEntitiesReused++;

      await upsertEntityRole(entity.entity_uid, {
        inpev: (r[INPEV_KEY] || '').trim() === 'Sim',
        cnpj_basico,
        razao_social: normalized.razao_social,
        capital_social: normalized.capital_social,
        porte: normalized.porte,
        cnae_fiscal: normalized.cnae_fiscal,
        cnae_fiscal_descricao: normalized.cnae_fiscal_descricao,
        natureza_juridica: normalized.natureza_juridica,
        cnpj_filiais: parseInt(r['#filiais'] || '0', 10) || 0,
        cnpj_matriz: r.cnpj_matriz || null,
        cnpj_source_uf: r.cnpj_source || null,
        original_id: r.id_new || null,
        source: SOURCE_REF,
        imported_at: new Date().toISOString(),
      });
      stats.entityRolesUpserted++;

      if ((i + 1) % 25 === 0) console.log(`  · ${i + 1}/${keepers.length}`);
    } catch (err) {
      stats.failed++;
      console.log(`  ✗ ${cnpj_basico} (${r.razao_social}): ${err.message}`);
    }
  }

  console.log('\n=== DONE ===');
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
