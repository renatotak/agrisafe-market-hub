/**
 * Phase 24D follow-up — historical CVM agro backfill.
 *
 * Walks the FULL CVM legislacao number range:
 *   - inst001..inst627  (instruções, pre-2022 namespace)
 *   - resol001..resol241 (resoluções, post-2022 namespace; CVM Resolução
 *     175 was the first one and started the new numbering)
 *
 * Total = 868 docs. The daily Phase 24D scraper at /api/cron/sync-cvm-agro
 * only walks the curated index pages (~43 docs total) which surfaces the
 * highlighted recent agro-relevant ones. This script is the one-shot
 * historical pass that catches everything else — Resoluções that were
 * agro-flavored but not "highlighted" by CVM, plus the entire pre-2022
 * Instrução archive.
 *
 * Same regex + parser as the daily scraper (`fetchCVMNorm` logic copied
 * inline below). Pure regex, no LLM. Idempotent — re-runs are safe via
 * the existing `cvm-<num>` id scheme used by sync-cvm-agro.
 *
 * Usage:
 *   node --env-file=.env.local src/scripts/backfill-cvm-historical.js
 *   node --env-file=.env.local src/scripts/backfill-cvm-historical.js --dry
 *   node --env-file=.env.local src/scripts/backfill-cvm-historical.js --start-inst 100 --end-inst 200
 *
 * Pacing: 350ms between fetches → ~5 minutes total walltime.
 * Real cost: ~870 GETs to conteudo.cvm.gov.br, all idempotent.
 */

const { Client } = require("pg");
const cheerio = require("cheerio");

// ─── Args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? parseInt(args[i + 1], 10) : fallback;
}

const INST_START = arg("--start-inst", 1);
const INST_END = arg("--end-inst", 627);
const RESOL_START = arg("--start-resol", 1);
const RESOL_END = arg("--end-resol", 241);
const PACE_MS = arg("--pace", 350);

const UA = "Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)";

// ─── Constants (mirrors src/app/api/cron/sync-cvm-agro/route.ts) ───────────

// Phase 24G2 — tightened pattern (drop generic fundo.*agro false positive)
const BODY_AGRO_PATTERN =
  /agroneg[óo]cio|crédito rural|fiagro|\bcpr\b|c[ée]dula de produto rural|\bcra\b\s+(?:do\s+)?agroneg|barter agr[íi]col|cadeia agr[íi]col|insumo agr[íi]col|cooperativa agr[íi]col|defensivo agr[íi]col|fertilizant|sement[se]\s+(?:fiscaliz|registro)|FII[\s-]*agro/i;

const PT_MONTHS = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

// Phase 24G2 — DD/MM/YYYY-first extractor (mirrors the daily route)
function extractDate(body) {
  const t = body.toLowerCase();
  const footerMarkers = [
    "atualizado em",
    "última atualização",
    "última modificação",
    "data da última modificação",
    "arquivos relacionados",
  ];
  let cut = t.length;
  for (const marker of footerMarkers) {
    const idx = t.indexOf(marker);
    if (idx > 0 && idx < cut) cut = idx;
  }
  const head = body.slice(0, cut);

  // Pass 1: DD/MM/YYYY (CVM legacy format, sits right after the title)
  const slashRe = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  let m;
  while ((m = slashRe.exec(head)) !== null) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    if (year < 1976 || year > 2099) continue;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Pass 2: "DD de MONTH de YYYY"
  const ptDateRe = /(\d{1,2})\s+de\s+([a-zçãéí]+)\s+de\s+(\d{4})/gi;
  const lower = head.toLowerCase();
  while ((m = ptDateRe.exec(lower)) !== null) {
    const day = parseInt(m[1], 10);
    const month = PT_MONTHS[m[2]];
    const year = parseInt(m[3], 10);
    if (!month || year < 1976 || year > 2099) continue;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Pass 3: ISO
  const isoMatch = head.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    if (y >= 1976 && y <= 2099) return isoMatch[0];
  }
  return null;
}

function classifyImpact(text) {
  const t = text.toLowerCase();
  if (/fiagro|cra.*agroneg|c[ée]dula de produto rural|cpr/.test(t)) return "high";
  if (/cooperativa|registro|fundo de investimento/.test(t)) return "medium";
  return "low";
}

function extractAffectedAreas(text) {
  const areas = [];
  const t = text.toLowerCase();
  if (/fiagro/.test(t)) areas.push("fiagro");
  if (/c[ée]dula de produto rural|\bcpr\b/.test(t)) areas.push("cpr");
  if (/\bcra\b/.test(t)) areas.push("cra");
  if (/cr[ée]dito rural|financiamento agr/.test(t)) areas.push("credito_rural");
  if (/cooperativa/.test(t)) areas.push("cooperativas");
  if (/defensivo|agrot[óo]xico/.test(t)) areas.push("defensivos");
  if (/sement[se]/.test(t)) areas.push("sementes");
  if (/registro/.test(t)) areas.push("registro");
  if (/fundo de investimento|FII|FIP/.test(t)) areas.push("fundos");
  return areas.length > 0 ? areas : ["mercado_capitais"];
}

// Match the Phase 24D scraper's id scheme exactly so re-runs from this
// script overwrite (and don't duplicate) rows from the daily scraper.
function makeId(num) {
  return `cvm-${num}`;
}

// ─── Single-doc fetcher ────────────────────────────────────────────────────

async function fetchAndParse(url, kind, num) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return { ok: false, reason: `fetch_error: ${e.message}` };
  }
  if (res.status === 410 || res.status === 404) {
    return { ok: false, reason: `http_${res.status}` };
  }
  if (!res.ok) {
    return { ok: false, reason: `http_${res.status}` };
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  let title = ($("title").first().text() || $("h1").first().text() || "").trim();
  title = title.replace(/\s*[-—|]\s*comissão de valores mobiliários.*/i, "").trim();
  if (!title) return { ok: false, reason: "no_title" };

  $("script,style,nav,header,footer").remove();
  const body = $("body").text().replace(/\s+/g, " ").trim();
  const summary = body.slice(0, 500);

  const haystack = `${title} ${body.slice(0, 4000)}`;
  if (!BODY_AGRO_PATTERN.test(haystack)) return { ok: false, reason: "no_agro_match" };

  const publishedAt = extractDate(body) || new Date().toISOString().slice(0, 10);

  return {
    ok: true,
    row: {
      id: makeId(num),
      body: "CVM",
      norm_type: kind === "instrucao" ? "instrucao" : "resolucao",
      norm_number: num,
      title: title.slice(0, 300),
      summary,
      published_at: publishedAt,
      effective_at: null,
      impact_level: classifyImpact(haystack),
      affected_areas: extractAffectedAreas(haystack),
      source_url: url,
    },
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set in .env.local");
    process.exit(1);
  }

  console.log("=== CVM Historical Backfill ===");
  console.log(`Range: inst${INST_START}..inst${INST_END} + resol${RESOL_START}..resol${RESOL_END}`);
  console.log(`Pace:  ${PACE_MS}ms between fetches`);
  console.log(`Mode:  ${dryRun ? "DRY RUN (no DB writes)" : "LIVE"}\n`);

  const docs = [];
  for (let n = INST_START; n <= INST_END; n++) {
    docs.push({
      kind: "instrucao",
      num: String(n),
      url: `https://conteudo.cvm.gov.br/legislacao/instrucoes/inst${String(n).padStart(3, "0")}.html`,
    });
  }
  for (let n = RESOL_START; n <= RESOL_END; n++) {
    docs.push({
      kind: "resolucao",
      num: String(n),
      url: `https://conteudo.cvm.gov.br/legislacao/resolucoes/resol${String(n).padStart(3, "0")}.html`,
    });
  }

  console.log(`Total docs to walk: ${docs.length}\n`);

  const stats = {
    walked: 0,
    http_410: 0,
    http_404: 0,
    other_errors: 0,
    no_title: 0,
    no_agro_match: 0,
    agro_hits: 0,
    upserted: 0,
  };

  const hits = [];

  for (const doc of docs) {
    stats.walked++;
    const result = await fetchAndParse(doc.url, doc.kind, doc.num);

    if (result.ok) {
      stats.agro_hits++;
      hits.push(result.row);
      console.log(
        `✓ [${stats.walked}/${docs.length}] ${doc.kind}-${doc.num} ${result.row.published_at} — ${result.row.title.slice(0, 70)}`,
      );
    } else {
      const reason = result.reason;
      if (reason === "http_410") stats.http_410++;
      else if (reason === "http_404") stats.http_404++;
      else if (reason === "no_title") stats.no_title++;
      else if (reason === "no_agro_match") stats.no_agro_match++;
      else stats.other_errors++;
    }

    // Progress ping every 50 docs
    if (stats.walked % 50 === 0) {
      console.log(
        `... [${stats.walked}/${docs.length}] hits=${stats.agro_hits} 410=${stats.http_410} 404=${stats.http_404} no-agro=${stats.no_agro_match}`,
      );
    }

    await sleep(PACE_MS);
  }

  console.log(`\n=== Walk complete ===`);
  console.log(`Walked:        ${stats.walked}`);
  console.log(`HTTP 410:      ${stats.http_410} (gone — gaps in numbering)`);
  console.log(`HTTP 404:      ${stats.http_404}`);
  console.log(`Other errors:  ${stats.other_errors}`);
  console.log(`No title:      ${stats.no_title}`);
  console.log(`No agro match: ${stats.no_agro_match}`);
  console.log(`Agro hits:     ${stats.agro_hits}\n`);

  if (hits.length === 0) {
    console.log("No agro-flavored CVM docs found in the requested range.");
    return;
  }

  if (dryRun) {
    console.log("DRY RUN — not writing.");
    return;
  }

  // Upsert in one batch via direct pg insert (bypasses PostgREST 1000-row cap)
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  for (const row of hits) {
    try {
      await c.query(
        `insert into regulatory_norms
           (id, body, norm_type, norm_number, title, summary, published_at, effective_at, impact_level, affected_areas, source_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (id) do update set
           title = excluded.title,
           summary = excluded.summary,
           published_at = excluded.published_at,
           impact_level = excluded.impact_level,
           affected_areas = excluded.affected_areas,
           source_url = excluded.source_url`,
        [
          row.id,
          row.body,
          row.norm_type,
          row.norm_number,
          row.title,
          row.summary,
          row.published_at,
          row.effective_at,
          row.impact_level,
          row.affected_areas,
          row.source_url,
        ],
      );
      stats.upserted++;
    } catch (e) {
      console.error(`Upsert failed for ${row.id}: ${e.message}`);
    }
  }

  await c.end();

  console.log(`Upserted: ${stats.upserted}/${hits.length}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
