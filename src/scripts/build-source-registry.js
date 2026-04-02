/**
 * Build unified source registry from all 4 crawler CSVs + app active sources
 * Outputs JSON for import into Supabase or direct use as mock data
 *
 * Usage: node src/scripts/build-source-registry.js
 *
 * NOTE: CSV files use DOS/OEM CP437 encoding (Brazilian Portuguese).
 * We decode using a byte-to-Unicode mapping table.
 */

const fs = require('fs');
const path = require('path');

/**
 * CP850 (DOS Latin-1 / Western European) bytes 0x80–0xFF → Unicode.
 * This is the standard codepage for Brazilian Portuguese DOS/CSV exports.
 * Key difference from CP437: bytes 0xB5+ map to accented letters instead of box-drawing.
 */
const CP850 = [
  // 0x80-0x8F
  'Ç','ü','é','â','ä','à','å','ç','ê','ë','è','ï','î','ì','Ä','Å',
  // 0x90-0x9F
  'É','æ','Æ','ô','ö','ò','û','ù','ÿ','Ö','Ü','ø','£','Ø','×','ƒ',
  // 0xA0-0xAF
  'á','í','ó','ú','ñ','Ñ','ª','º','¿','®','¬','½','¼','¡','«','»',
  // 0xB0-0xBF
  '░','▒','▓','│','┤','Á','Â','À','©','╣','║','╗','╝','¢','¥','┐',
  // 0xC0-0xCF
  '└','┴','┬','├','─','┼','ã','Ã','╚','╔','╩','╦','╠','═','╬','¤',
  // 0xD0-0xDF
  'ð','Ð','Ê','Ë','È','ı','Í','Î','Ï','┘','┌','█','▄','¦','Ì','▀',
  // 0xE0-0xEF
  'Ó','ß','Ô','Ò','õ','Õ','µ','þ','Þ','Ú','Û','Ù','ý','Ý','¯','´',
  // 0xF0-0xFF
  '\u00AD','±','‗','¾','¶','§','÷','¸','°','¨','·','¹','³','²','■',' '
];

/** Read a file with CP850 encoding (fixes ç, ã, é, ó, í, ú, etc.) */
function readCP850(filePath) {
  const buf = fs.readFileSync(filePath);
  let str = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    str += (b >= 0x80) ? CP850[b - 0x80] : String.fromCharCode(b);
  }
  return str;
}

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

function normCategory(raw) {
  const l = (raw || '').toLowerCase().trim();
  if (l.includes('fiscal')) return 'fiscal';
  if (l.includes('socio') || l.includes('ambiental')) return 'socioambiental';
  if (l.includes('financ')) return 'financeiro';
  if (l.includes('logist')) return 'logistica';
  if (l.includes('geogra')) return 'geografias';
  if (l.includes('agropec')) return 'agropecuaria';
  if (l.includes('agronom')) return 'agronomico';
  if (l === '1') return 'socioambiental';
  if (l === '2') return 'fiscal';
  if (l === '3') return 'agropecuaria';
  if (l === '4') return 'agronomico';
  if (l === '5') return 'fiscal';
  return 'outros';
}

function normFrequency(raw) {
  const l = (raw || '').toLowerCase().trim();
  if (!l || l === '?' || l === 'n/a') return 'nao_informado';
  if (l.includes('dia') || l === 'realtime') return 'diaria';
  if (l.includes('seman')) return 'semanal';
  if (l.includes('mensal')) return 'mensal';
  if (l.includes('trimes') || l.includes('quadrimes')) return 'trimestral';
  if (l.includes('anual') || l.includes('ano') || l.includes('safra')) return 'anual';
  return 'nao_informado';
}

const sources = new Map();
let id = 0;

function add(name, org, cat, dtype, desc, freq, url, url2, notes, origin, server, automated) {
  if (!name || !url || !url.startsWith('http')) return;
  const key = `${org}-${name}`.toLowerCase().replace(/\s+/g, '_').slice(0, 60);
  if (sources.has(key)) return;
  sources.set(key, {
    id: `src-${++id}`,
    name, source_org: org, category: normCategory(cat),
    data_type: dtype || null, description: desc || null,
    frequency: normFrequency(freq), url, url_secondary: url2 || null,
    server: server || null, automated: automated || false,
    notes: notes || null, origin_file: origin,
    url_status: 'unchecked', http_status: null, last_checked_at: null, last_known_update: null,
    used_in_app: false,
  });
}

const dir = path.resolve(__dirname, '../../imports/25-0325 agsf crawlers');

// ── List 1 ──
const f1 = readCP850(path.join(dir, '25-0325 Crawler list  list1.csv')).split('\n');
for (let i = 4; i < f1.length; i++) {
  const c = parseCSV(f1[i]);
  if (c.length < 7 || !c[6]?.startsWith('http')) continue;
  add(c[3] || c[2], c[2], c[1], (c[4] || '').replace(/^\./, ''), c[7], c[5], c[6], null, c[8], 'list1');
}

// ── List 2 (deduplicate by taking latest entry per doc) ──
const f2 = readCP850(path.join(dir, '25-0325 Crawler list  list2.csv')).split('\n');
const l2 = new Map();
for (let i = 1; i < f2.length; i++) {
  const c = parseCSV(f2[i]);
  if (c.length < 9 || !c[4]) continue;
  const k = `${c[2]}-${c[4]}`.toLowerCase();
  if (c[0] === 'x' || !l2.has(k)) l2.set(k, c);
}
for (const [, c] of l2) {
  if (!c[9]?.startsWith('http')) continue;
  add(c[4], (c[5] || c[2] || '').trim(), c[1], (c[3] || ''), c[8], c[6], c[9], null, null, 'list2', null, c[0] === 'x');
}

// ── List 3 ──
const f3 = readCP850(path.join(dir, '25-0325 Crawler list  list3.csv')).split('\n');
for (let i = 1; i < f3.length; i++) {
  const c = parseCSV(f3[i]);
  if (c.length < 10 || !c[9]?.startsWith('http')) continue;
  add(c[4], (c[2] || '').trim(), c[1], (c[5] || ''), c[8], c[6], c[9], c[10] || null, null, 'list3', null, c[0] === 'ok');
}

// ── List 4 ──
const f4 = readCP850(path.join(dir, '25-0325 Crawler list  list4.csv')).split('\n');
for (let i = 1; i < f4.length; i++) {
  const c = parseCSV(f4[i]);
  if (c.length < 10 || !c[9]?.startsWith('http')) continue;
  add(c[2], (c[1] || '').trim(), c[1], null, c[8], c[4], c[9], null, c[8], 'list4', c[3] || null, (c[7] || '').toLowerCase().includes('sim'));
}

// ── Active sources used in Market Hub app ──
const appSources = [
  { name: 'BCB SGS - Soja (11752)', org: 'BCB', cat: 'financeiro', freq: 'diaria', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11752/dados', used: true },
  { name: 'BCB SGS - Milho (11753)', org: 'BCB', cat: 'financeiro', freq: 'diaria', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11753/dados', used: true },
  { name: 'BCB SGS - Cafe (11754)', org: 'BCB', cat: 'financeiro', freq: 'diaria', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11754/dados', used: true },
  { name: 'BCB SGS - Acucar (11755)', org: 'BCB', cat: 'financeiro', freq: 'diaria', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11755/dados', used: true },
  { name: 'BCB SGS - Algodao (11756)', org: 'BCB', cat: 'financeiro', freq: 'diaria', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11756/dados', used: true },
  { name: 'BCB SGS - Citros (11757)', org: 'BCB', cat: 'financeiro', freq: 'diaria', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11757/dados', used: true },
  { name: 'BCB SGS - USD/BRL (1)', org: 'BCB', cat: 'financeiro', freq: 'diaria', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados', used: true },
  { name: 'BCB SGS - Selic (432)', org: 'BCB', cat: 'financeiro', freq: 'diaria', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados', used: true },
  { name: 'Canal Rural RSS', org: 'Canal Rural', cat: 'agropecuaria', freq: 'diaria', url: 'https://www.canalrural.com.br/feed/', used: true },
  { name: 'Sucesso no Campo RSS', org: 'Sucesso no Campo', cat: 'agropecuaria', freq: 'diaria', url: 'https://sucessonocampo.com.br/feed/', used: true },
  { name: 'Agrolink RSS', org: 'Agrolink', cat: 'agropecuaria', freq: 'diaria', url: 'https://www.agrolink.com.br/rss/noticias.xml', used: true },
  { name: 'CNA Noticias RSS', org: 'CNA', cat: 'agropecuaria', freq: 'diaria', url: 'https://cnabrasil.org.br/noticias/rss', used: true },
  { name: 'ConJur RSS (Legal)', org: 'ConJur', cat: 'fiscal', freq: 'diaria', url: 'https://www.conjur.com.br/rss.xml', used: true },
  { name: 'Migalhas RSS (Legal)', org: 'Migalhas', cat: 'fiscal', freq: 'diaria', url: 'https://www.migalhas.com.br/rss/quentes.xml', used: true },
  { name: 'Oraculo Canais (Revendas)', org: 'AgriSafe', cat: 'financeiro', freq: 'nao_informado', url: 'https://agrisafe.agr.br', used: true, notes: 'CSV import - 24,275 locations' },
];

for (const s of appSources) {
  const key = s.name.toLowerCase().replace(/\s+/g, '_').slice(0, 60);
  sources.set(key, {
    id: `src-app-${++id}`,
    name: s.name, source_org: s.org, category: normCategory(s.cat),
    data_type: 'api', description: null, frequency: normFrequency(s.freq),
    url: s.url, url_secondary: null, server: null, automated: true,
    notes: s.notes || 'Active in Market Hub cron pipeline', origin_file: 'app_active',
    url_status: 'unchecked', http_status: null, last_checked_at: null, last_known_update: null,
    used_in_app: s.used || false,
  });
}

// ── Output ──
const result = Array.from(sources.values());
console.log(`Total unique sources: ${result.length}`);

// Stats
const cats = {};
result.forEach(s => { cats[s.category] = (cats[s.category] || 0) + 1; });
console.log('\nBy category:');
Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${c}: ${n}`));

const freqs = {};
result.forEach(s => { freqs[s.frequency] = (freqs[s.frequency] || 0) + 1; });
console.log('\nBy frequency:');
Object.entries(freqs).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${f}: ${n}`));

const appUsed = result.filter(s => s.used_in_app).length;
console.log(`\nUsed in app: ${appUsed}`);

// Write to file for use as mock data
const outPath = path.resolve(__dirname, '../data/source-registry.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\nWritten to ${outPath}`);
