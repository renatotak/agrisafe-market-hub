import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifyApiKey, logApiAccess, extractClientIp } from "@/lib/api-key-auth";

/**
 * GET /api/app-campo/events — App Campo integration feed.
 *
 * Purpose-built for field-sales reps opening the mobile app:
 *   - If `?state=XX` is supplied, return ALL upcoming events (from
 *     today forward, no end cap) in that UF. A rep stationed in MT
 *     wants visibility into everything in their territory so they
 *     can plan months ahead.
 *   - If `state` is absent, return only events in the next 30 days
 *     across all of Brazil. Keeps the national view focused on what
 *     the rep could realistically attend on short notice.
 *
 * Query params (all optional):
 *   state        — UF (e.g. "MT"). Case-insensitive.
 *   days         — override the 30-day national window (max 180).
 *   limit        — max rows (default 100, max 500).
 *   include_past — "true" to include events that already started.
 *
 * Auth: if an `x-api-key` header is present it MUST be valid and
 *       active. Requests without a key are still allowed today so
 *       the existing web UI can hit the endpoint without re-auth;
 *       rotate that when App Campo ships its production key.
 *
 * Response shape is App Campo's contract — a stable envelope with
 * `scope`, `filters_applied`, and `events[]` — so the mobile team
 * doesn't have to parse the generic /api/events-db envelope.
 */

export const dynamic = "force-dynamic";
export const revalidate = 300; // 5 min — App Campo polls frequently

const BR_UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

function parseLocation(location: string | null): { cidade: string | null; uf: string | null } {
  if (!location) return { cidade: null, uf: null };
  const parts = location.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { cidade: null, uf: null };
  if (parts.length === 1) {
    // A lone token that's a 2-letter UF → treat as state-only
    const only = parts[0];
    if (only.length === 2 && BR_UFS.has(only.toUpperCase())) {
      return { cidade: null, uf: only.toUpperCase() };
    }
    return { cidade: only, uf: null };
  }
  const last = parts[parts.length - 1];
  const uf = last.length === 2 && BR_UFS.has(last.toUpperCase()) ? last.toUpperCase() : null;
  const cidade = uf ? parts.slice(0, -1).join(", ") : parts.join(", ");
  return { cidade: cidade || null, uf };
}

function prettyType(t: string): string {
  switch (t) {
    case "fair": return "Feiras Agro";
    case "conference": return "Congressos";
    case "workshop": return "Workshop";
    case "webinar": return "Webinar";
    case "summit": return "Fóruns";
    default: return "Outros";
  }
}

export async function GET(request: Request) {
  const startMs = Date.now();
  const url = new URL(request.url);

  const stateRaw = url.searchParams.get("state");
  const state = stateRaw ? stateRaw.trim().toUpperCase() : null;
  if (state && !BR_UFS.has(state)) {
    return NextResponse.json(
      { success: false, error: `Invalid Brazilian UF: ${state}` },
      { status: 400 },
    );
  }
  const daysParam = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10), 1), 180);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10), 1), 500);
  const includePast = url.searchParams.get("include_past") === "true";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + daysParam);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);

  const supabase = createAdminClient();

  // Optional API key gate. Missing key → anonymous (backwards-compatible
  // with the current /api/events-db pattern). Invalid key → 401.
  const rawKeyHeader = request.headers.get("x-api-key") || request.headers.get("authorization");
  let keyMeta = null;
  if (rawKeyHeader) {
    keyMeta = await verifyApiKey(supabase, request).catch(() => null);
    if (!keyMeta) {
      await logApiAccess(supabase, {
        apiKeyId: null,
        endpoint: "/api/app-campo/events",
        method: "GET",
        statusCode: 401,
        ip: extractClientIp(request),
        userAgent: request.headers.get("user-agent"),
        responseTimeMs: Date.now() - startMs,
      });
      return NextResponse.json({ success: false, error: "Invalid or inactive API key" }, { status: 401 });
    }
  }

  try {
    let query = supabase
      .from("events")
      .select(
        "id, name, date, end_date, location, type, description_pt, description_en, website, source_name, source_url, organizer_cnpj, latitude, longitude, enriched_at, enrichment_summary",
      )
      .eq("hidden", false)
      .order("date", { ascending: true })
      .limit(limit);

    // Date window — always from today unless caller opts into past events
    if (!includePast) query = query.gte("date", todayStr);

    // Scope: state-specific → full future (cap by limit); otherwise national 30-day window
    if (!state && !includePast) {
      query = query.lte("date", windowEndStr);
    }

    // State filter — `location` is free text. We do a permissive ilike
    // first (so PostgREST's `.or()` doesn't choke on commas/spaces) and
    // then tighten in the post-filter below, which parses the location
    // and enforces an exact UF match.
    if (state) {
      query = query.ilike("location", `%${state}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Server-side belt-and-suspenders filter: the `ilike` above is permissive;
    // parse the location and enforce state match with the exact UF we parsed.
    const events = (data || [])
      .map((row) => {
        const { cidade, uf } = parseLocation(row.location);
        return { row, cidade, uf };
      })
      .filter(({ uf }) => !state || uf === state)
      .map(({ row, cidade, uf }) => ({
        id: row.id,
        name: row.name,
        date_start: row.date,
        date_end: row.end_date,
        type: row.type,
        type_label: prettyType(row.type),
        cidade,
        uf,
        location_raw: row.location,
        website: row.website,
        description: row.description_pt || row.description_en || null,
        source_name: row.source_name,
        source_url: row.source_url,
        organizer_cnpj: row.organizer_cnpj,
        latitude: row.latitude,
        longitude: row.longitude,
        enriched: !!row.enriched_at,
      }));

    // Distinct UF counts help the mobile UI show "X events nearby / N states"
    const ufCounts: Record<string, number> = {};
    for (const e of events) {
      if (e.uf) ufCounts[e.uf] = (ufCounts[e.uf] || 0) + 1;
    }

    const scope = state
      ? { kind: "state", state, days: null }
      : { kind: "national_window", state: null, days: daysParam };

    const responsePayload = {
      success: true,
      scope,
      filters_applied: {
        from: todayStr,
        to: state ? null : windowEndStr,
        include_past: includePast,
        hidden_excluded: true,
      },
      count: events.length,
      events,
      uf_counts: ufCounts,
      fetched_at: new Date().toISOString(),
    };

    if (keyMeta) {
      logApiAccess(supabase, {
        apiKeyId: keyMeta.id,
        endpoint: "/api/app-campo/events",
        method: "GET",
        statusCode: 200,
        ip: extractClientIp(request),
        userAgent: request.headers.get("user-agent"),
        responseTimeMs: Date.now() - startMs,
      }).catch(() => {});
    }

    return NextResponse.json(responsePayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (keyMeta) {
      logApiAccess(supabase, {
        apiKeyId: keyMeta.id,
        endpoint: "/api/app-campo/events",
        method: "GET",
        statusCode: 500,
        ip: extractClientIp(request),
        userAgent: request.headers.get("user-agent"),
        responseTimeMs: Date.now() - startMs,
      }).catch(() => {});
    }
    return NextResponse.json({ success: false, error: message, count: 0, events: [] }, { status: 500 });
  }
}
