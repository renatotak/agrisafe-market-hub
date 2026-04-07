// Smoke verification for migrations 027-032 (Phase 19A/B + 20A + 21 + 22)
// Usage: node src/scripts/verify-migrations-027-032.js
//
// Reads service-role key from .env.local and walks every new table /
// view / seed row that the bundle was supposed to create. Reports a
// green checklist or an anomaly per check.

const fs = require('fs');
const path = require('path');

const lines = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf-8').split('\n');
const env = {};
lines.forEach((l) => {
  if (l.startsWith('#') || !l.includes('=')) return;
  const i = l.indexOf('=');
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ANSI = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red:   (s) => `\x1b[31m${s}\x1b[0m`,
  yellow:(s) => `\x1b[33m${s}\x1b[0m`,
  bold:  (s) => `\x1b[1m${s}\x1b[0m`,
};

let pass = 0;
let fail = 0;

async function check(label, fn) {
  try {
    const result = await fn();
    if (result.ok) {
      pass++;
      console.log(`  ${ANSI.green('✓')} ${label}${result.detail ? ' — ' + result.detail : ''}`);
    } else {
      fail++;
      console.log(`  ${ANSI.red('✗')} ${label} — ${result.detail || 'failed'}`);
    }
  } catch (e) {
    fail++;
    console.log(`  ${ANSI.red('✗')} ${label} — ${e.message}`);
  }
}

async function tableExists(name, expectedMinRows = 0) {
  const { count, error } = await sb.from(name).select('*', { count: 'exact', head: true });
  if (error) return { ok: false, detail: error.message };
  if (count < expectedMinRows) return { ok: false, detail: `count=${count}, expected ≥${expectedMinRows}` };
  return { ok: true, detail: `count=${count}` };
}

async function rowExists(table, column, value) {
  const { data, error } = await sb.from(table).select(column).eq(column, value).maybeSingle();
  if (error) return { ok: false, detail: error.message };
  if (!data) return { ok: false, detail: `no row with ${column}='${value}'` };
  return { ok: true, detail: `${column}='${value}' present` };
}

async function selectColumns(table, columns) {
  const { error } = await sb.from(table).select(columns.join(',')).limit(1);
  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: `columns ${columns.join(',')} readable` };
}

async function main() {
  console.log(ANSI.bold('\n=== Verifying migrations 027-032 ===\n'));

  console.log(ANSI.bold('Phase 19A — scraper resilience (mig 027)'));
  await check('scraper_registry table',  () => tableExists('scraper_registry', 3));
  await check('scraper_runs table',      () => tableExists('scraper_runs', 0));
  await check('scraper_knowledge table', () => tableExists('scraper_knowledge', 0));
  await check('seed: sync-scraper-healthcheck', () => rowExists('scraper_registry', 'scraper_id', 'sync-scraper-healthcheck'));

  console.log(ANSI.bold('\nPhase 19B — macro_statistics (mig 028 + 029)'));
  await check('macro_statistics table',  () => tableExists('macro_statistics', 0));
  await check('seed: sync-faostat-prod', () => rowExists('scraper_registry', 'scraper_id', 'sync-faostat-prod'));
  await check('mig 029 applied — sync-faostat-prod expected_min_rows=30', async () => {
    const { data, error } = await sb.from('scraper_registry').select('expected_min_rows').eq('scraper_id', 'sync-faostat-prod').maybeSingle();
    if (error) return { ok: false, detail: error.message };
    if (!data) return { ok: false, detail: 'row missing' };
    if (data.expected_min_rows !== 30) return { ok: false, detail: `got ${data.expected_min_rows}, want 30` };
    return { ok: true, detail: 'expected_min_rows=30' };
  });

  console.log(ANSI.bold('\nPhase 20A — Inteligência de Insumos Oracle (mig 030)'));
  await check('active_ingredients table',           () => tableExists('active_ingredients', 0));
  await check('industry_product_uses table',        () => tableExists('industry_product_uses', 0));
  await check('industry_product_ingredients table', () => tableExists('industry_product_ingredients', 0));
  await check('industry_products has new cols',     () => selectColumns('industry_products', ['formulation','url_agrofit','source_dataset','scraped_at','confidentiality']));
  await check('seed: sync-agrofit-bulk',            () => rowExists('scraper_registry', 'scraper_id', 'sync-agrofit-bulk'));
  await check('view v_oracle_brand_alternatives queryable', async () => {
    const { error } = await sb.from('v_oracle_brand_alternatives').select('ingredient_id').limit(1);
    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: 'view exists, returns rows when populated' };
  });

  console.log(ANSI.bold('\nPhase 21 — Radar Competitivo (mig 031)'));
  await check('competitors has new cols', () => selectColumns('competitors', ['entity_uid','notes','harvey_ball_scores','vertical','country','cnpj_basico','last_web_enrichment_at']));
  await check('competitors entity_uid backfill', async () => {
    const { count: total, error: e1 } = await sb.from('competitors').select('*', { count: 'exact', head: true });
    if (e1) return { ok: false, detail: e1.message };
    const { count: linked, error: e2 } = await sb.from('competitors').select('*', { count: 'exact', head: true }).not('entity_uid', 'is', null);
    if (e2) return { ok: false, detail: e2.message };
    return { ok: true, detail: `${linked}/${total} linked to legal_entities` };
  });

  console.log(ANSI.bold('\nPhase 22 — Notícias Agro CRUD (mig 032)'));
  await check('news_sources table', () => tableExists('news_sources', 6));
  await check('seed: 5 RSS sources + 1 reading-room sentinel', async () => {
    const { data, error } = await sb.from('news_sources').select('id, source_type').order('id');
    if (error) return { ok: false, detail: error.message };
    const ids = (data || []).map((r) => r.id).join(',');
    const rssCount = (data || []).filter((r) => r.source_type === 'rss').length;
    const rrCount  = (data || []).filter((r) => r.source_type === 'reading_room').length;
    if (rssCount < 5 || rrCount < 1) return { ok: false, detail: `rss=${rssCount}, reading_room=${rrCount} (want ≥5/≥1) — ids: ${ids}` };
    return { ok: true, detail: `${rssCount} rss + ${rrCount} reading_room` };
  });

  console.log('');
  if (fail === 0) {
    console.log(ANSI.green(ANSI.bold(`✓ ALL ${pass} CHECKS PASSED`)));
    process.exit(0);
  } else {
    console.log(ANSI.red(ANSI.bold(`✗ ${fail} of ${pass + fail} checks failed`)));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
