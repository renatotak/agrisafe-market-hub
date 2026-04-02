/**
 * Import 26-0224 oraculo canais.csv into Supabase
 * Populates both `retailers` (company-level) and `retailer_locations` (establishments)
 *
 * Usage: node src/scripts/import-canais.js
 */

const fs = require('fs');
const path = require('path');

// Load env
const envLines = fs.readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
envLines.forEach(l => { if (l.startsWith('#') || !l.includes('=')) return; const i = l.indexOf('='); env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

async function run() {
  const csvPath = path.resolve(__dirname, '../../imports/26-0224 oraculo canais.csv');
  const raw = fs.readFileSync(csvPath, 'latin1'); // CSV likely in latin1 encoding
  const lines = raw.split('\n').filter(l => l.trim());
  const header = lines[0];
  const rows = lines.slice(1);

  console.log(`Parsed ${rows.length} rows from CSV`);

  // Group by cnpj_basico to create retailers (company-level)
  const companies = new Map();
  const locations = [];

  for (const line of rows) {
    const cols = parseCSVLine(line);
    if (cols.length < 30) continue;

    const cnpj = cols[1];
    const cnpj_basico = cols[2];
    const consolidacao = cols[5];
    const razao_social = cols[6];
    const nome_fantasia = cols[7];
    const grupo_acesso = cols[8];
    const tipo_acesso = cols[9];
    const tipo_logradouro = cols[11];
    const logradouro = cols[12];
    const numero = cols[13];
    const complemento = cols[14];
    const bairro = cols[15];
    const cep = cols[16];
    const uf = cols[17];
    const municipio = cols[18];
    const lat = cols[19] ? cols[19].replace(/"/g, '').replace(',', '.') : null;
    const lng = cols[20] ? cols[20].replace(/"/g, '').replace(',', '.') : null;
    const faixa_faturamento = cols[22];
    const industria_1 = cols[23] !== 'ND' ? cols[23] : null;
    const industria_2 = cols[24] !== 'ND' ? cols[24] : null;
    const industria_3 = cols[25] !== 'ND' ? cols[25] : null;
    const classificacao = cols[27] || null;
    const possui_loja = cols[28];
    const capital_str = cols[29] ? cols[29].replace(/"/g, '').replace(/,/g, '').trim() : null;
    const capital_social = capital_str ? parseFloat(capital_str) : null;
    const porte = cols[30];
    const porte_name = cols[31];

    if (!cnpj_basico || !razao_social) continue;

    // Company-level (first occurrence wins)
    if (!companies.has(cnpj_basico)) {
      companies.set(cnpj_basico, {
        cnpj_raiz: cnpj_basico,
        consolidacao,
        razao_social,
        nome_fantasia: nome_fantasia || null,
        grupo_acesso: grupo_acesso || null,
        tipo_acesso: tipo_acesso || null,
        faixa_faturamento: faixa_faturamento || null,
        industria_1,
        industria_2,
        industria_3,
        classificacao,
        possui_loja_fisica: possui_loja || null,
        capital_social: isNaN(capital_social) ? null : capital_social,
        porte: porte || null,
        porte_name: porte_name || null,
      });
    }

    // Location-level
    const fullLogradouro = [tipo_logradouro, logradouro].filter(Boolean).join(' ');
    locations.push({
      cnpj: cnpj || null,
      cnpj_raiz: cnpj_basico,
      razao_social,
      nome_fantasia: nome_fantasia || null,
      logradouro: fullLogradouro || null,
      numero: numero || null,
      complemento: complemento || null,
      bairro: bairro || null,
      cep: cep || null,
      uf: uf || null,
      municipio: municipio || null,
      latitude: lat && !isNaN(parseFloat(lat)) ? parseFloat(lat) : null,
      longitude: lng && !isNaN(parseFloat(lng)) ? parseFloat(lng) : null,
    });
  }

  console.log(`Companies: ${companies.size}, Locations: ${locations.length}`);

  // Insert companies in batches
  const companyArr = Array.from(companies.values());
  const BATCH = 500;
  let inserted = 0;

  console.log('Inserting companies...');
  for (let i = 0; i < companyArr.length; i += BATCH) {
    const batch = companyArr.slice(i, i + BATCH);
    const { error } = await sb.from('retailers').upsert(batch, { onConflict: 'cnpj_raiz', ignoreDuplicates: true });
    if (error) console.log(`  Error at batch ${i}: ${error.message}`);
    else inserted += batch.length;
    if (i % 2000 === 0) console.log(`  ${i}/${companyArr.length}...`);
  }
  console.log(`Retailers inserted: ${inserted}`);

  // Insert locations in batches
  console.log('Inserting locations...');
  let locInserted = 0;
  for (let i = 0; i < locations.length; i += BATCH) {
    const batch = locations.slice(i, i + BATCH);
    const { error } = await sb.from('retailer_locations').upsert(batch, { onConflict: 'cnpj', ignoreDuplicates: true });
    if (error) console.log(`  Error at batch ${i}: ${error.message}`);
    else locInserted += batch.length;
    if (i % 5000 === 0) console.log(`  ${i}/${locations.length}...`);
  }
  console.log(`Locations inserted: ${locInserted}`);

  // Verify
  const { count: rc } = await sb.from('retailers').select('*', { count: 'exact', head: true });
  const { count: rlc } = await sb.from('retailer_locations').select('*', { count: 'exact', head: true });
  console.log(`\nVerified: retailers=${rc} retailer_locations=${rlc}`);
}

run().catch(e => console.error('Fatal:', e.message));
