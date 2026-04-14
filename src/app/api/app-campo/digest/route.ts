import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifyApiKey, logApiAccess, extractClientIp } from "@/lib/api-key-auth";

/**
 * GET /api/app-campo/digest — daily briefing for the field rep.
 *
 * Wraps the latest `executive_briefings` row + a few high-signal
 * counters so the rep's home screen has something to read first
 * thing in the morning. Optional ?state=UF localizes the upcoming
 * events count.
 */

export const dynamic = "force-dynamic";
export const revalidate = 600; // 10 min

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  const supabase = createAdminClient();
  const sp = request.nextUrl.searchParams;
  const state = (sp.get("state") || "").trim().toUpperCase() || null;

  const hasKeyHeader = !!(request.headers.get("x-api-key") || request.headers.get("authorization"));
  const keyMeta = hasKeyHeader ? await verifyApiKey(supabase, request).catch(() => null) : null;
  if (hasKeyHeader && !keyMeta) {
    return NextResponse.json({ success: false, error: "Invalid or inactive API key" }, { status: 401 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const in7Str = in7.toISOString().slice(0, 10);
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);

    // Latest executive briefing (markdown).
    const { data: briefing } = await supabase
      .from("executive_briefings")
      .select("id, briefing_date, summary_md, generated_at")
      .order("briefing_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Events: next 7d (this week), next 30d (this month), state-scoped if asked.
    let weekQ = supabase.from("events").select("id", { count: "exact", head: true })
      .eq("hidden", false).gte("date", todayStr).lte("date", in7Str);
    let monthQ = supabase.from("events").select("id", { count: "exact", head: true })
      .eq("hidden", false).gte("date", todayStr).lte("date", in30Str);
    if (state) {
      weekQ = weekQ.ilike("location", `%${state}%`);
      monthQ = monthQ.ilike("location", `%${state}%`);
    }
    const [{ count: eventsThisWeek }, { count: eventsThisMonth }] = await Promise.all([weekQ, monthQ]);

    // Open leads (excludes lost/dormant).
    const { count: openLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("stage", "in", "(lost,dormant)");

    // Meetings logged in the last 7d (activity proxy).
    const last7 = new Date(today); last7.setDate(last7.getDate() - 7);
    const { count: meetingsLast7d } = await supabase
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .gte("meeting_date", last7.toISOString().slice(0, 10));

    if (keyMeta) {
      logApiAccess(supabase, {
        apiKeyId: keyMeta.id,
        endpoint: "/api/app-campo/digest",
        method: "GET",
        statusCode: 200,
        ip: extractClientIp(request),
        userAgent: request.headers.get("user-agent"),
        responseTimeMs: Date.now() - startMs,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      scope: { state },
      briefing: briefing
        ? {
            id: briefing.id,
            date: briefing.briefing_date,
            summary_md: briefing.summary_md,
            generated_at: briefing.generated_at,
          }
        : null,
      counters: {
        events_this_week: eventsThisWeek || 0,
        events_this_month: eventsThisMonth || 0,
        open_leads: openLeads || 0,
        meetings_last_7d: meetingsLast7d || 0,
      },
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
