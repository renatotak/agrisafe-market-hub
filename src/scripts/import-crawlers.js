/**
 * Import all 4 crawler list CSVs into data_sources_registry table
 * Normalizes categories, deduplicates, and checks URL availability
 *
 * Usage: node src/scripts/import-crawlers.js
 */

const fs = require('fs');
const path = require('path');

const envLines = fs.readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
envLines.forEach(l => { if (l.startsWith('#') || !l.includes('=')) return; const i = l.indexOf('='); env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseCSV(line) {
  const r = []; let c = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { q = !q; continue; }
    if (line[i] === ',' && !q) { r.push(c.trim()); c = ''; continue; }
    c += line[i];
  }
  r.push(c.trim());
  return r;
}

// Normalize category
function normCategory(raw) {
  const l = (raw || '').toLowerCase().trim();
  if (!l || l === '1' || l === '2' || l === '3' || l === '4' || l === '5') {
    // list1 uses numbers: 1=socioambiental, 2=fiscal, 3=agropecuaria, 4=agronomico, 5=trabalhista
    const map = { '1': 'socioambiental', '2': 'fiscal', '3': 'agropecuaria', '4': 'agronomico', '5': 'fiscal' };
    return map[l] || 'outros';
  }
  if (l.includes('fiscal')) return 'fiscal';
  if (l.includes('socio') || l.includes('ambiental')) return 'socioambiental';
  if (l.includes('financ')) return 'financeiro';
  if (l.includes('agropec') || l.includes('agronom')) return 'agropecuaria';
  if (l.includes('logist')) return 'logistica';
  if (l.includes('geogra')) return 'geografias';
  if (l.includes('agro')) return 'agronomico';
  return 'outros';
}

// Normalize frequency
function normFrequency(raw) {
  const l = (raw || '').toLowerCase().trim();
  if (!l || l === '?' || l === 'n/a') return 'nao_informado';
  if (l.includes('dia') || l === 'diaria' || l === 'diário') return 'diaria';
  if (l.includes('seman')) return 'semanal';
  if (l.includes('mensal')) return 'mensal';
  if (l.includes('trimes') || l.includes('quadrimes')) return 'trimestral';
  if (l.includes('anual') || l.includes('ano')) return 'anual';
  if (l.includes('safra')) return 'safra';
  if (l.includes('realtime')) return 'realtime';
  return 'nao_informado';
}

function parseDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  // Try dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  // Try mon-yyyy or mon/yyyy patterns like "set-24", "out/24"
  const months = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
  const m2 = s.match(/^(\d{1,2})[/-](\w+)[/-](\d{2,4})$/i);
  if (m2) {
    const mon = months[m2[2].toLowerCase().slice(0, 3)];
    if (mon) { const yr = m2[3].length === 2 ? '20' + m2[3] : m2[3]; return `${yr}-${mon}-${m2[1].padStart(2, '0')}`; }
  }
  const m3 = s.match(/^(\w+)[/-](\d{2,4})$/i);
  if (m3) {
    const mon = months[m3[1].toLowerCase().slice(0, 3)];
    if (mon) { const yr = m3[2].length === 2 ? '20' + m3[2] : m3[2]; return `${yr}-${mon}-01`; }
  }
  return null;
}

async function checkUrl(url) {
  if (!url || url.length < 10) return { status: 'inactive', code: 0 };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'AgriSafe-MktHub/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    return { status: res.ok ? 'active' : (res.status >= 300 && res.status < 400 ? 'redirect' : 'inactive'), code: res.status };
  } catch {
    try {
      // Retry with GET for servers that don't support HEAD
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { method: 'GET', signal: controller.signal, headers: { 'User-Agent': 'AgriSafe-MktHub/1.0' }, redirect: 'follow' });
      clearTimeout(timeout);
      return { status: res.ok ? 'active' : 'inactive', code: res.status };
    } catch { return { status: 'inactive', code: 0 }; }
  }
}

async function run() {
  const dir = path.resolve(__dirname, '../../imports/25-0325 agsf crawlers');
  const sources = new Map(); // deduplicate by name+source_org+url

  // ── Parse List 1 ──
  console.log('Parsing list1...');
  const f1 = fs.readFileSync(path.join(dir, '25-0325 Crawler list  list1.csv'), 'latin1').split('\n');
  for (let i = 4; i < f1.length; i++) {
    const c = parseCSV(f1[i]);
    if (c.length < 7 || !c[2]) continue;
    const url = c[6] || '';
    if (!url.startsWith('http')) continue;
    const key = `${c[2].toLowerCase()}-${url.slice(0, 60)}`;
    if (sources.has(key)) continue;
    sources.set(key, {
      id: `src-l1-${i}`,
      name: c[3] || c[2],
      source_org: c[2],
      category: normCategory(c[1]),
      data_type: (c[4] || '').replace(/^\./, '').toLowerCase() || null,
      description: c[7] || null,
      frequency: normFrequency(c[5]),
      url,
      url_secondary: null,
      last_known_update: null,
      server: null,
      automated: false,
      notes: c[8] || null,
      origin_file: 'list1',
    });
  }

  // ── Parse List 2 (take latest entry per source — has version history) ──
  console.log('Parsing list2...');
  const f2 = fs.readFileSync(path.join(dir, '25-0325 Crawler list  list2.csv'), 'latin1').split('\n');
  const l2Latest = new Map();
  for (let i = 1; i < f2.length; i++) {
    const c = parseCSV(f2[i]);
    if (c.length < 9 || !c[4]) continue;
    const docKey = `${c[2]}-${c[4]}`.toLowerCase(); // folder-document
    const existing = l2Latest.get(docKey);
    // Keep latest by checking flag='x' or latest date
    if (c[0] === 'x' || !existing) l2Latest.set(docKey, c);
  }
  for (const [docKey, c] of l2Latest) {
    const url = c[9] || '';
    if (!url.startsWith('http')) continue;
    const key = `${c[5] || c[2]}-${c[4]}`.toLowerCase();
    if (sources.has(key)) continue;
    sources.set(key, {
      id: `src-l2-${docKey.replace(/[^a-z0-9]/g, '')}`,
      name: c[4],
      source_org: (c[5] || c[2] || '').trim(),
      category: normCategory(c[1]),
      data_type: (c[3] || '').toLowerCase() || null,
      description: c[8] || null,
      frequency: normFrequency(c[6]),
      url,
      url_secondary: null,
      last_known_update: parseDate(c[7]),
      server: null,
      automated: c[0] === 'x',
      notes: null,
      origin_file: 'list2',
    });
  }

  // ── Parse List 3 ──
  console.log('Parsing list3...');
  const f3 = fs.readFileSync(path.join(dir, '25-0325 Crawler list  list3.csv'), 'latin1').split('\n');
  for (let i = 1; i < f3.length; i++) {
    const c = parseCSV(f3[i]);
    if (c.length < 10 || !c[4]) continue;
    const url = c[9] || '';
    if (!url.startsWith('http')) continue;
    const key = `${c[2] || ''}-${c[4]}`.toLowerCase();
    if (sources.has(key)) continue;
    sources.set(key, {
      id: `src-l3-${i}`,
      name: c[4],
      source_org: (c[2] || '').trim(),
      category: normCategory(c[1]),
      data_type: (c[5] || '').toLowerCase() || null,
      description: c[8] || null,
      frequency: normFrequency(c[6]),
      url,
      url_secondary: c[10] || null,
      last_known_update: parseDate(c[7]),
      server: null,
      automated: c[0] === 'ok',
      notes: null,
      origin_file: 'list3',
    });
  }

  // ── Parse List 4 ──
  console.log('Parsing list4...');
  const f4 = fs.readFileSync(path.join(dir, '25-0325 Crawler list  list4.csv'), 'latin1').split('\n');
  for (let i = 1; i < f4.length; i++) {
    const c = parseCSV(f4[i]);
    if (c.length < 10 || !c[2]) continue;
    const url = c[9] || '';
    if (!url.startsWith('http')) continue;
    const key = `l4-${c[0] || i}`;
    sources.set(key, {
      id: `src-l4-${c[0] || i}`,
      name: c[2],
      source_org: (c[1] || '').trim(),
      category: normCategory(c[1]),
      data_type: null,
      description: c[8] || null,
      frequency: normFrequency(c[4]),
      url,
      url_secondary: null,
      last_known_update: parseDate(c[5]),
      server: c[3] || null,
      automated: (c[7] || '').toLowerCase() === 'sim',
      notes: c[8] || null,
      origin_file: 'list4',
    });
  }

  console.log(`Total unique sources: ${sources.size}`);

  // ── Check URLs (batch with concurrency limit) ──
  console.log('\nChecking URL availability (this may take a few minutes)...');
  const entries = Array.from(sources.values());
  const CONCURRENCY = 10;

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (e) => {
      const result = await checkUrl(e.url);
      e.url_status = result.status;
      e.http_status = result.code;
      e.last_checked_at = new Date().toISOString();
      return `${result.status === 'active' ? '✓' : '✗'} ${e.name}`;
    }));
    if (i % 30 === 0) console.log(`  ${i}/${entries.length}... (${results.filter(r => r.startsWith('✓')).length}/${batch.length} active)`);
  }

  const active = entries.filter(e => e.url_status === 'active').length;
  const inactive = entries.filter(e => e.url_status === 'inactive').length;
  console.log(`\nURL check: ${active} active, ${inactive} inactive, ${entries.length - active - inactive} other`);

  // ── Create table and insert ──
  console.log('\nCreating table...');
  // Table creation needs to be done via SQL Editor — we'll just insert

  console.log('Inserting into data_sources_registry...');
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const { error } = await sb.from('data_sources_registry').upsert(batch, { onConflict: 'id' });
    if (error) console.log(`  Error at ${i}: ${error.message}`);
    else inserted += batch.length;
  }

  console.log(`\nInserted: ${inserted}/${entries.length}`);

  // Summary by category
  const cats = {};
  entries.forEach(e => { cats[e.category] = (cats[e.category] || 0) + 1; });
  console.log('\nBy category:');
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => console.log(`  ${cat}: ${count}`));

  // Summary by frequency
  const freqs = {};
  entries.forEach(e => { freqs[e.frequency] = (freqs[e.frequency] || 0) + 1; });
  console.log('\nBy frequency:');
  Object.entries(freqs).sort((a, b) => b[1] - a[1]).forEach(([freq, count]) => console.log(`  ${freq}: ${count}`));
}

run().catch(e => console.error('Fatal:', e.message));
