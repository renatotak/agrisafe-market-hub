/**
 * Phase 2e — Serasa RJ backfill.
 *
 * Reads all CSV files from `local files/Serasa/`, matches CNPJs against
 * `legal_entities`, and upserts into `recuperacao_judicial` with
 * `debt_value_source='serasa'`.
 *
 * CSV format: semicolon-delimited, UTF-8.
 * Expected columns: CNPJ;RAZAO_SOCIAL;UF;VALOR_DIVIDA;DATA_CONSULTA;TIPO_ENTIDADE;OBSERVACAO
 *
 * Usage:
 *   npx tsx --env-file=.env.local src/scripts/backfill-serasa-rj.ts [--dry-run] [--limit N]
 */

import { createClient } from "@supabase/supabase-js";
import { ensureLegalEntityUid } from "../lib/entities";
import { logActivity } from "../lib/activity-log";
import * as fs from "fs";
import * as path from "path";

const SERASA_DIR = path.resolve(__dirname, "../../local files/Serasa");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

function initSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key);
}

/** Strip punctuation from CNPJ, return 8-digit root */
function cnpjRoot(raw: string): string {
  return raw.replace(/\D/g, "").padStart(14, "0").slice(0, 8);
}

/** Parse Brazilian number: 1.234.567,89 → 1234567.89 */
function parseBRL(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Parse DD/MM/YYYY → YYYY-MM-DD */
function parseDateBR(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Map Serasa entity type labels to our enum keys */
function mapEntityType(raw: string | undefined): string {
  if (!raw) return "outros";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("produtor")) return "produtor_rural";
  if (lower.includes("cooperativa")) return "cooperativa";
  if (lower.includes("usina")) return "usina";
  if (lower.includes("fabricante")) return "empresa_agro";
  if (lower.includes("revenda") || lower.includes("distribui")) return "empresa_agro";
  return "outros";
}

interface SerasaRow {
  cnpj: string;
  razaoSocial: string;
  uf: string;
  valorDivida: number | null;
  dataConsulta: string | null;
  tipoEntidade: string;
  observacao: string;
}

function parseCSV(filePath: string): SerasaRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header to find column indices (flexible order)
  const header = lines[0].split(";").map((h) => h.trim().toUpperCase());
  const idx = {
    cnpj: header.indexOf("CNPJ"),
    razao: header.indexOf("RAZAO_SOCIAL"),
    uf: header.indexOf("UF"),
    valor: header.indexOf("VALOR_DIVIDA"),
    data: header.indexOf("DATA_CONSULTA"),
    tipo: header.indexOf("TIPO_ENTIDADE"),
    obs: header.indexOf("OBSERVACAO"),
  };

  if (idx.cnpj < 0) {
    console.error(`  [SKIP] ${path.basename(filePath)}: missing CNPJ column`);
    return [];
  }

  const rows: SerasaRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    const cnpj = cols[idx.cnpj]?.trim();
    if (!cnpj) continue;

    rows.push({
      cnpj,
      razaoSocial: idx.razao >= 0 ? cols[idx.razao]?.trim() || "" : "",
      uf: idx.uf >= 0 ? cols[idx.uf]?.trim().toUpperCase() || "" : "",
      valorDivida: idx.valor >= 0 ? parseBRL(cols[idx.valor] || "") : null,
      dataConsulta: idx.data >= 0 ? parseDateBR(cols[idx.data] || "") : null,
      tipoEntidade: idx.tipo >= 0 ? cols[idx.tipo]?.trim() || "" : "",
      observacao: idx.obs >= 0 ? cols[idx.obs]?.trim() || "" : "",
    });
  }

  return rows;
}

async function main() {
  console.log(`[backfill-serasa-rj] start${DRY_RUN ? " (DRY RUN)" : ""}`);

  if (!fs.existsSync(SERASA_DIR)) {
    console.error(`[backfill-serasa-rj] directory not found: ${SERASA_DIR}`);
    process.exit(1);
  }

  const csvFiles = fs.readdirSync(SERASA_DIR).filter((f) => f.endsWith(".csv"));
  if (csvFiles.length === 0) {
    console.log("[backfill-serasa-rj] no CSV files found in Serasa directory");
    return;
  }

  console.log(`[backfill-serasa-rj] found ${csvFiles.length} CSV file(s)`);

  // Parse all CSVs
  const allRows: SerasaRow[] = [];
  for (const file of csvFiles) {
    const filePath = path.join(SERASA_DIR, file);
    const rows = parseCSV(filePath);
    console.log(`  ${file}: ${rows.length} rows`);
    allRows.push(...rows);
  }

  if (allRows.length === 0) {
    console.log("[backfill-serasa-rj] no data rows found");
    return;
  }

  const supabase = initSupabase();

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let matched = 0;
  let failed = 0;

  for (const row of allRows) {
    if (processed >= LIMIT) break;
    processed++;

    const root = cnpjRoot(row.cnpj);
    const fullCnpj = row.cnpj.replace(/\D/g, "").padStart(14, "0");
    const formattedCnpj = `${fullCnpj.slice(0, 8)}/${fullCnpj.slice(8, 12)}-${fullCnpj.slice(12)}`;

    console.log(`  [${processed}/${Math.min(allRows.length, LIMIT)}] ${row.razaoSocial || root} (${formattedCnpj})`);

    if (DRY_RUN) continue;

    // 1. Ensure legal entity exists
    const entityUid = await ensureLegalEntityUid(supabase, root, {
      legalName: row.razaoSocial || null,
    });
    if (entityUid) {
      matched++;
    }

    // 2. Check if RJ row already exists for this CNPJ
    const { data: existing } = await supabase
      .from("recuperacao_judicial")
      .select("id, debt_value, debt_value_source")
      .eq("entity_cnpj", formattedCnpj)
      .maybeSingle();

    if (existing) {
      // Update debt_value if Serasa provides a value and existing is null or from a lower-priority source
      const shouldUpdate =
        row.valorDivida != null &&
        (existing.debt_value == null || existing.debt_value_source !== "manual");

      if (shouldUpdate) {
        const { error } = await supabase
          .from("recuperacao_judicial")
          .update({
            debt_value: row.valorDivida,
            debt_value_source: "serasa",
            entity_uid: entityUid,
          })
          .eq("id", existing.id);

        if (error) {
          console.error(`    FAIL update: ${error.message}`);
          failed++;
        } else {
          console.log(`    updated debt_value: ${row.valorDivida}`);
          updated++;
        }
      } else {
        console.log(`    skipped (existing debt_value preserved)`);
      }
    } else {
      // Insert new RJ row
      const id = `serasa-${root}-${Date.now()}`;
      const { error } = await supabase.from("recuperacao_judicial").insert({
        id,
        entity_name: row.razaoSocial || `CNPJ ${formattedCnpj}`,
        entity_cnpj: formattedCnpj,
        entity_type: mapEntityType(row.tipoEntidade),
        state: row.uf || null,
        status: "em_andamento",
        filing_date: row.dataConsulta,
        debt_value: row.valorDivida,
        debt_value_source: "serasa",
        source_name: "Serasa CSV",
        summary: row.observacao || null,
        entity_uid: entityUid,
        confidentiality: "public",
      });

      if (error) {
        console.error(`    FAIL insert: ${error.message}`);
        failed++;
      } else {
        console.log(`    inserted (id=${id})`);
        inserted++;
      }
    }
  }

  const summary = `Serasa backfill: ${processed} rows processed, ${inserted} inserted, ${updated} updated, ${matched} entity matches, ${failed} failed${DRY_RUN ? " [DRY RUN]" : ""}`;
  console.log(`\n${summary}`);

  if (!DRY_RUN) {
    await logActivity(supabase, {
      action: "upsert",
      target_table: "recuperacao_judicial",
      source: "backfill:serasa-rj",
      source_kind: "backfill",
      summary,
      metadata: { processed, inserted, updated, matched, failed, csv_files: csvFiles.length },
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
