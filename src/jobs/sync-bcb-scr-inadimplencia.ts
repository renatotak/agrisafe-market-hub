/**
 * Phase 7c — BCB SCR rural credit inadimplência series.
 *
 * Fetches rural credit delinquency rates from BCB SGS API (same API
 * used by sync-market-data) and writes to macro_statistics.
 *
 * Series:
 *   21082  — Total credit inadimplência (benchmark)
 *   21136  — Rural credit PJ (legal entities)
 *   21148  — Rural credit PF (individuals)
 *
 * Data: monthly since 2011-03, unit = % of portfolio 90+ days overdue.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "@/lib/sync-logger";
import { logActivity } from "@/lib/activity-log";
import type { JobResult } from "@/jobs/types";

const SCR_SERIES: {
  code: number;
  indicator: string;
  commodity: string;
  label: string;
}[] = [
  { code: 21082, indicator: "inadimplencia_total", commodity: "credit_total", label: "Inadimplência total" },
  { code: 21136, indicator: "inadimplencia_rural_pj", commodity: "rural_credit", label: "Inadimplência rural PJ" },
  { code: 21148, indicator: "inadimplencia_rural_pf", commodity: "rural_credit", label: "Inadimplência rural PF" },
];

// Fetch last N months from BCB SGS (max 20 per the API limit)
async function fetchSGS(seriesCode: number, count = 20): Promise<{ data: string; valor: string }[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados/ultimos/${count}?formato=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`BCB SGS ${seriesCode}: HTTP ${res.status}`);
  return res.json();
}

function parseBCBDate(dateStr: string): string {
  const [day, month, year] = dateStr.split("/");
  return `${year}-${month}-${day}`;
}

export async function runSyncBcbScrInadimplencia(supabase: SupabaseClient): Promise<JobResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let fetched = 0;
  let updated = 0;

  try {
    for (const series of SCR_SERIES) {
      try {
        const data = await fetchSGS(series.code, 20);
        fetched += data.length;

        const rows = data
          .filter((d) => d.valor && d.valor.trim() !== "")
          .map((d) => ({
            source_id: "bcb_scr",
            category: "credit_risk",
            commodity: series.commodity,
            region: "Brazil",
            indicator: series.indicator,
            value: parseFloat(d.valor),
            unit: "percent",
            period: parseBCBDate(d.data).slice(0, 7), // YYYY-MM
            reference_date: parseBCBDate(d.data),
            metadata: { bcb_sgs_code: series.code, label: series.label },
          }));

        if (rows.length === 0) continue;

        const { error } = await supabase
          .from("macro_statistics")
          .upsert(rows, { onConflict: "source_id,commodity,region,indicator,period" });

        if (error) {
          errors.push(`${series.indicator}: ${error.message}`);
        } else {
          updated += rows.length;
        }
      } catch (e: any) {
        errors.push(`${series.indicator}: ${e.message}`);
      }
    }

    const finishedAt = new Date().toISOString();
    const status = errors.length === 0 ? "success" : updated > 0 ? "partial" : "error";

    await logSync(supabase, {
      source: "sync-bcb-scr-inadimplencia",
      started_at: startedAt,
      finished_at: finishedAt,
      status,
      records_fetched: fetched,
      records_inserted: updated,
      errors: errors.length,
      error_message: errors.length > 0 ? errors.join("; ") : undefined,
    }).catch(() => {});

    await logActivity(supabase, {
      action: "upsert",
      source: "sync-bcb-scr-inadimplencia",
      source_kind: "cron",
      target_table: "macro_statistics",
      summary: `SCR inadimplência: ${updated} rows (${SCR_SERIES.length} series × 20mo)`,
      metadata: { fetched, updated, errors },
    }).catch(() => {});

    return {
      ok: status !== "error",
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      recordsFetched: fetched,
      recordsUpdated: updated,
      errors,
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
