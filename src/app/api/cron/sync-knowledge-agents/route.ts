/**
 * Backlog — thin route wrapper for knowledge agents enrichment.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { runSyncKnowledgeAgents } from "@/jobs/sync-knowledge-agents";

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
  const result = await runSyncKnowledgeAgents(supabase);

  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok
        ? `Knowledge Agents: ${result.recordsUpdated} mentions added`
        : "Failed to run knowledge agents",
      timestamp: result.finishedAt,
      duration_ms: result.durationMs,
      records_fetched: result.recordsFetched,
      records_updated: result.recordsUpdated,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  );
}
