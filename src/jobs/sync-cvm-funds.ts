/**
 * Phase 7d — CVM fund inventory (FIDCs + FIAGROs).
 *
 * Downloads the CVM open-data fund registration CSV, filters for FIDC
 * and FIAGRO fund types, and upserts into financial_institutions with
 * institution_type='fidc' or 'fiagro'.
 *
 * Source: https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv
 * Format: semicolon-delimited CSV, ISO-8859-1 encoding.
 * Updated daily at 08:00 BRT.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "@/lib/sync-logger";
import { logActivity } from "@/lib/activity-log";
import { ensureLegalEntityUid } from "@/lib/entities";
import type { JobResult } from "@/jobs/types";

const CVM_CAD_URL = "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv";

// These are the TP_FUNDO values we care about
const FUND_TYPES_OF_INTEREST = new Set([
  "FI - Fundo de Investimento",
  "FIDC - Fundo de Investimento em Direitos Creditórios",
  "FIDC-NP",
  "FIAGRO",
  "FIAGRO - Fundo de Investimento nas Cadeias Produtivas Agroindustriais",
]);

// Map CVM fund type to our institution_type
function mapFundType(tp: string): string | null {
  const upper = tp.toUpperCase();
  if (upper.includes("FIAGRO")) return "fiagro";
  if (upper.includes("FIDC")) return "fidc";
  return null;
}

// Check if fund name suggests an agro mandate (for generic FI types)
function hasAgroMandate(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("agro") ||
    lower.includes("rural") ||
    lower.includes("agri") ||
    lower.includes("cra") ||
    lower.includes("cpr") ||
    lower.includes("safra") ||
    lower.includes("agroneg")
  );
}

interface CsvRow {
  [key: string]: string;
}

function parseCSV(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    const row: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (values[i] || "").trim();
    }
    return row;
  });
}

export async function runSyncCvmFunds(supabase: SupabaseClient): Promise<JobResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let fetched = 0;
  let updated = 0;

  try {
    // 1. Download the CSV
    const res = await fetch(CVM_CAD_URL, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`CVM CAD CSV: HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    // CVM CSVs are Latin-1 encoded
    const text = new TextDecoder("latin1").decode(buffer);
    const allRows = parseCSV(text);
    fetched = allRows.length;

    // 2. Filter for FIDC, FIAGRO, and agro-mandate FI funds
    const agroFunds = allRows.filter((row) => {
      const tp = row["TP_FUNDO"] || "";
      const instType = mapFundType(tp);
      if (instType) return true;
      // Also capture generic FI with agro in the name
      if (tp.startsWith("FI") && hasAgroMandate(row["DENOM_SOCIAL"] || "")) return true;
      return false;
    });

    // 3. Upsert each fund
    for (const row of agroFunds) {
      try {
        const cnpj14 = (row["CNPJ_FUNDO"] || "").replace(/\D/g, "");
        if (!cnpj14 || cnpj14.length < 8) continue;
        const cnpj8 = cnpj14.slice(0, 8);

        const tp = row["TP_FUNDO"] || "";
        let instType = mapFundType(tp);
        if (!instType) instType = "fidc"; // agro-mandate FI defaults to fidc

        const situacao = (row["SIT"] || "").toUpperCase();
        const isActive = situacao !== "CANCELADA" && situacao !== "ENCERRADO";

        const name = row["DENOM_SOCIAL"] || row["FUNDO"] || "";
        const adminName = row["ADMIN"] || null;
        const adminCnpj = (row["CNPJ_ADMIN"] || "").replace(/\D/g, "").slice(0, 8) || null;
        const gestorName = row["GESTOR"] || null;
        const gestorCnpj = (row["CPF_CNPJ_GESTOR"] || "").replace(/\D/g, "").slice(0, 8) || null;
        const dtReg = row["DT_REG"] || null;
        const dtConst = row["DT_CONST"] || null;
        const vlPatrimLiq = row["VL_PATRIM_LIQ"] ? parseFloat(row["VL_PATRIM_LIQ"].replace(",", ".")) : null;
        const dtPatrimLiq = row["DT_PATRIM_LIQ"] || null;

        // Resolve entity
        const entityUid = await ensureLegalEntityUid(supabase, cnpj8, {
          legalName: name,
          displayName: name,
        });

        // Upsert into financial_institutions
        const { data: existing } = await supabase
          .from("financial_institutions")
          .select("id")
          .eq("cnpj", cnpj8)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("financial_institutions")
            .update({
              name,
              institution_type: instType,
              entity_uid: entityUid,
              active_rural_credit: isActive,
              rural_credit_volume_brl: vlPatrimLiq,
              notes: [
                gestorName ? `Gestor: ${gestorName}` : null,
                adminName ? `Admin: ${adminName}` : null,
                dtConst ? `Constituição: ${dtConst}` : null,
              ]
                .filter(Boolean)
                .join(" | ") || null,
            })
            .eq("cnpj", cnpj8);
        } else {
          const { error: insErr } = await supabase
            .from("financial_institutions")
            .insert({
              name,
              cnpj: cnpj8,
              institution_type: instType,
              entity_uid: entityUid,
              active_rural_credit: isActive,
              rural_credit_volume_brl: vlPatrimLiq,
              notes: [
                gestorName ? `Gestor: ${gestorName}` : null,
                adminName ? `Admin: ${adminName}` : null,
                dtConst ? `Constituição: ${dtConst}` : null,
              ]
                .filter(Boolean)
                .join(" | ") || null,
            });
          if (insErr) {
            errors.push(`${cnpj8} ${name}: ${insErr.message}`);
            continue;
          }
        }

        // Add entity role
        if (entityUid) {
          await supabase
            .from("entity_roles")
            .insert({ entity_uid: entityUid, role_type: "financial_institution" })
            .select()
            .maybeSingle();
          // ignore duplicate
        }

        updated++;
      } catch (e: any) {
        errors.push(`row: ${e.message}`);
      }
    }

    const finishedAt = new Date().toISOString();
    const status = errors.length === 0 ? "success" : updated > 0 ? "partial" : "error";

    await logSync(supabase, {
      source: "sync-cvm-funds",
      started_at: startedAt,
      finished_at: finishedAt,
      status,
      records_fetched: agroFunds.length,
      records_inserted: updated,
      errors: errors.length,
      error_message: errors.length > 0 ? errors.slice(0, 10).join("; ") : undefined,
    }).catch(() => {});

    await logActivity(supabase, {
      action: "upsert",
      source: "sync-cvm-funds",
      source_kind: "cron",
      target_table: "financial_institutions",
      summary: `CVM funds: ${updated} FIDC/FIAGRO upserted from ${agroFunds.length} agro funds (${fetched} total in CVM)`,
      metadata: { total_cvm: fetched, agro_filtered: agroFunds.length, updated, errors: errors.length },
    }).catch(() => {});

    return {
      ok: status !== "error",
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      recordsFetched: agroFunds.length,
      recordsUpdated: updated,
      errors,
      stats: { total_cvm_funds: fetched, agro_filtered: agroFunds.length },
    };
  } catch (e: any) {
    const finishedAt = new Date().toISOString();
    return {
      ok: false,
      status: "error",
      startedAt,
      finishedAt,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      recordsFetched: fetched,
      recordsUpdated: updated,
      errors: [...errors, e.message],
    };
  }
}
