/**
 * Import retailers from Excel file into Supabase.
 *
 * Usage: npx tsx src/scripts/import-retailers.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env from .env.local
const envPath = resolve(__dirname, '../../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.includes('your_')) {
  console.error('ERROR: Set real SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const EXCEL_PATH = resolve(__dirname, '../../26-0224 oraculo canais.xlsx');
const BATCH_SIZE = 500;

async function batchInsert(table: string, rows: Record<string, unknown>[]) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: table === 'retailers' ? 'cnpj_raiz' : 'cnpj' });
    if (error) {
      console.error(`  Error at batch ${i}-${i + batch.length}:`, error.message);
    } else {
      inserted += batch.length;
    }
    process.stdout.write(`  ${inserted}/${rows.length}\r`);
  }
  console.log(`  Inserted ${inserted}/${rows.length} rows into ${table}`);
}

function parseCapitalSocial(val: unknown): number | null {
  if (val == null) return null;
  const str = String(val).replace(/\./g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseLatLong(val: unknown): number | null {
  if (val == null) return null;
  const str = String(val).replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

async function main() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(EXCEL_PATH);

  // --- Import main_empresas → retailers ---
  console.log('\n=== Importing retailers (main_empresas) ===');
  const empresasSheet = workbook.Sheets['main_empresas'];
  const empresasRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(empresasSheet);

  const retailers = empresasRows
    .filter((row) => row['manter'] === 'x')
    .map((row) => ({
      cnpj_raiz: String(row['cnpj_raiz'] ?? ''),
      consolidacao: row['CONSOLIDAÇÃO'] ? String(row['CONSOLIDAÇÃO']) : null,
      razao_social: String(row['RAZAO_SOCIAL'] ?? row['razao_social_dez25'] ?? ''),
      nome_fantasia: row['NOME FANTASIA PADRONIZADO'] ? String(row['NOME FANTASIA PADRONIZADO']) : null,
      grupo_acesso: row['GRUPO ACESSO'] ? String(row['GRUPO ACESSO']) : null,
      tipo_acesso: row['TIPO ACESSO'] ? String(row['TIPO ACESSO']) : null,
      faixa_faturamento: row['FAIXA FATURAMENTO'] ? String(row['FAIXA FATURAMENTO']).trim() : null,
      industria_1: row['1º INDUSTRIA'] && row['1º INDUSTRIA'] !== 'ND' ? String(row['1º INDUSTRIA']) : null,
      industria_2: row['2º INDUSTRIA'] && row['2º INDUSTRIA'] !== 'ND' ? String(row['2º INDUSTRIA']) : null,
      industria_3: row['3º INDUSTRIA'] && row['3º INDUSTRIA'] !== 'ND' ? String(row['3º INDUSTRIA']) : null,
      classificacao: row['CLASSIFICAÇÃO'] ? String(row['CLASSIFICAÇÃO']) : null,
      possui_loja_fisica: row['CNPJ POSSUI LOJA FISICA?'] ? String(row['CNPJ POSSUI LOJA FISICA?']) : null,
      capital_social: parseCapitalSocial(row['capital_social']),
      porte: row['porte'] ? String(row['porte']) : null,
      porte_name: row['porte_name'] ? String(row['porte_name']) : null,
    }))
    .filter((r) => r.cnpj_raiz.length > 0);

  console.log(`  Found ${retailers.length} retailers (manter=x)`);
  await batchInsert('retailers', retailers);

  // --- Import clean → retailer_locations ---
  console.log('\n=== Importing locations (clean) ===');
  const cleanSheet = workbook.Sheets['clean'];
  const cleanRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(cleanSheet);

  const locations = cleanRows
    .filter((row) => row['visible'] === 'x')
    .map((row) => ({
      cnpj: row['cnpj'] ? String(row['cnpj']) : null,
      cnpj_raiz: String(row['cnpj_basico'] ?? ''),
      razao_social: row['razao social'] ? String(row['razao social']) : null,
      nome_fantasia: row['nome_fantasia'] ? String(row['nome_fantasia']) : null,
      logradouro: [row['tipo_logradouro'], row['logradouro']].filter(Boolean).join(' ') || null,
      numero: row['numero'] ? String(row['numero']) : null,
      complemento: row['complemento'] ? String(row['complemento']) : null,
      bairro: row['bairro'] ? String(row['bairro']) : null,
      cep: row['cep'] ? String(row['cep']) : null,
      uf: row['uf'] ? String(row['uf']) : null,
      municipio: row['municipio'] ? String(row['municipio']) : null,
      latitude: parseLatLong(row['latitude']),
      longitude: parseLatLong(row['longitude']),
    }))
    .filter((l) => l.cnpj_raiz.length > 0);

  console.log(`  Found ${locations.length} locations (visible=x)`);
  await batchInsert('retailer_locations', locations);

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
