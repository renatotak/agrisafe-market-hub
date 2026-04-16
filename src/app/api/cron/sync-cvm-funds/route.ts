/**
 * Phase 7d — thin route wrapper for CVM fund inventory sync.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { runSyncCvmFunds } from "@/jobs/sync-cvm-funds";

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
  const result = await runSyncCvmFunds(supabase);

  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok
        ? "CVM FIDC/FIAGRO fund inventory synced"
        : "Failed to sync CVM funds",
      timestamp: result.finishedAt,
      duration_ms: result.durationMs,
      records_fetched: result.recordsFetched,
      records_updated: result.recordsUpdated,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
    },
    { status: result.ok ? 200 : 500 },
  );
}
