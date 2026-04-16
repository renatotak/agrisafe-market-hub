/**
 * Phase 7c — thin route wrapper for BCB SCR inadimplência sync.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { runSyncBcbScrInadimplencia } from "@/jobs/sync-bcb-scr-inadimplencia";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await runSyncBcbScrInadimplencia(supabase);

  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok
        ? "BCB SCR inadimplência synced"
        : "Failed to sync SCR data",
      timestamp: result.finishedAt,
      duration_ms: result.durationMs,
      records_fetched: result.recordsFetched,
      records_updated: result.recordsUpdated,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  );
}
