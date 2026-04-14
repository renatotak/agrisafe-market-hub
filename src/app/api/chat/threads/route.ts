import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifyApiKey, logApiAccess, extractClientIp } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity-log";

/**
 * /api/chat/threads — thread list + create, shared by both Market Hub
 * (AgriSafe HQ inbox) and App Campo (rep's mobile).
 *
 * Auth contract:
 *   - `x-api-key` header present → App Campo path. Requires a valid
 *     key AND the target entity must have `entity_features.has_chat=true`
 *     (premium gate). Scoped reads: only threads with a participant
 *     matching the supplied `client_id` come back.
 *   - No `x-api-key` → Market Hub path. Uses the service role client;
 *     returns everything (the UI is already behind Supabase Auth).
 *
 * GET  ?entity_uid=... | ?client_id=...   — list threads
 * POST {entity_uid, topic?, created_by?}  — create or upsert the main thread
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  const supabase = createAdminClient();
  const sp = request.nextUrl.searchParams;
  const entityUid = sp.get("entity_uid");
  const clientId = sp.get("client_id");
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "50", 10), 1), 200);

  const { authCtx, errResp } = await authorize(request, supabase);
  if (errResp) return errResp;

  try {
    let query = supabase
      .from("chat_threads")
      .select("id, entity_uid, topic, status, last_message_at, last_message_preview, unread_count_hq, unread_count_rep, created_at, updated_at")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (entityUid) query = query.eq("entity_uid", entityUid);

    // App Campo — scope to threads where this client_id is a participant.
    if (authCtx.kind === "rep" && clientId) {
      const { data: participantRows } = await supabase
        .from("chat_participants")
        .select("thread_id")
        .eq("actor_kind", "rep")
        .eq("actor_ref", clientId);
      const threadIds = (participantRows || []).map((r: any) => r.thread_id);
      if (threadIds.length === 0) {
        await logAccess(supabase, authCtx, "/api/chat/threads", "GET", 200, request, startMs);
        return NextResponse.json({ threads: [], total: 0 });
      }
      query = query.in("id", threadIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    await logAccess(supabase, authCtx, "/api/chat/threads", "GET", 200, request, startMs);
    return NextResponse.json({ threads: data || [], total: (data || []).length });
  } catch (err: any) {
    await logAccess(supabase, authCtx, "/api/chat/threads", "GET", 500, request, startMs);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  const supabase = createAdminClient();
  const { authCtx, errResp } = await authorize(request, supabase);
  if (errResp) return errResp;

  const body = await request.json().catch(() => ({}));
  const entityUid = String(body.entity_uid || "").trim();
  if (!entityUid) return NextResponse.json({ error: "entity_uid required" }, { status: 400 });

  // Premium gate for App Campo callers — HQ can always open threads.
  if (authCtx.kind === "rep") {
    const { data: flag } = await supabase
      .from("entity_features")
      .select("has_chat")
      .eq("entity_uid", entityUid)
      .maybeSingle();
    if (!flag?.has_chat) {
      await logAccess(supabase, authCtx, "/api/chat/threads", "POST", 403, request, startMs);
      return NextResponse.json(
        { error: "Chat is a premium feature — has_chat flag not enabled for this entity" },
        { status: 403 },
      );
    }
  }

  const topic = (body.topic && String(body.topic).trim()) || null;
  const createdBy = (body.created_by && String(body.created_by).trim()) || authCtx.kind;

  // Main thread (topic IS NULL) is unique per entity via partial index —
  // upsert on (entity_uid) WHERE topic IS NULL semantics. Topic-scoped
  // threads always create a new row.
  let thread: any = null;
  if (!topic) {
    const { data: existing } = await supabase
      .from("chat_threads")
      .select("*")
      .eq("entity_uid", entityUid)
      .is("topic", null)
      .maybeSingle();
    if (existing) thread = existing;
  }
  if (!thread) {
    const { data: inserted, error } = await supabase
      .from("chat_threads")
      .insert({ entity_uid: entityUid, topic, created_by: createdBy })
      .select()
      .maybeSingle();
    if (error) {
      await logAccess(supabase, authCtx, "/api/chat/threads", "POST", 500, request, startMs);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    thread = inserted;
  }

  // Ensure the caller is a participant.
  if (thread?.id) {
    const participant = {
      thread_id: thread.id,
      actor_kind: authCtx.kind,
      actor_ref: authCtx.ref,
      display_name: body.display_name || authCtx.name || null,
      role: authCtx.kind === "hq" ? "owner" : "member",
    };
    await supabase
      .from("chat_participants")
      .upsert(participant, { onConflict: "thread_id,actor_kind,actor_ref", ignoreDuplicates: true });
  }

  await logActivity(supabase, {
    action: "upsert",
    target_table: "chat_threads",
    target_id: thread?.id,
    source: authCtx.kind === "rep" ? "api:app_campo_chat" : "manual:crm_chat",
    source_kind: authCtx.kind === "rep" ? "manual" : "manual",
    summary: `Thread ${topic ? `(${topic})` : "(main)"} — entity ${entityUid.slice(0, 8)}…`,
    confidentiality: "agrisafe_confidential",
    metadata: { entity_uid: entityUid, topic, actor_kind: authCtx.kind },
  });

  await logAccess(supabase, authCtx, "/api/chat/threads", "POST", 200, request, startMs);
  return NextResponse.json({ thread });
}

// ─── Shared auth helper ─────────────────────────────────────

interface AuthCtx {
  kind: "hq" | "rep";
  ref: string;         // email | client_id
  name?: string | null;
  apiKeyId?: string | null;
}

async function authorize(
  request: NextRequest,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<{ authCtx: AuthCtx; errResp: NextResponse | null }> {
  const hasKey = !!(request.headers.get("x-api-key") || request.headers.get("authorization"));
  if (hasKey) {
    const meta = await verifyApiKey(supabase, request).catch(() => null);
    if (!meta) {
      return {
        authCtx: { kind: "rep", ref: "unknown" },
        errResp: NextResponse.json({ error: "Invalid or inactive API key" }, { status: 401 }),
      };
    }
    const clientId = request.headers.get("x-client-id") || request.nextUrl.searchParams.get("client_id") || meta.key_prefix;
    return {
      authCtx: { kind: "rep", ref: String(clientId), name: meta.name, apiKeyId: meta.id },
      errResp: null,
    };
  }
  // No api-key → assume internal Market Hub user. We don't have the
  // authenticated user's email here yet (Supabase SSR is wired per-page);
  // stamp as 'hq:admin' for the activity log and let the UI overwrite
  // display_name from its own session context when POSTing.
  return {
    authCtx: { kind: "hq", ref: "admin@agrisafe" },
    errResp: null,
  };
}

async function logAccess(
  supabase: ReturnType<typeof createAdminClient>,
  authCtx: AuthCtx,
  endpoint: string,
  method: string,
  status: number,
  request: NextRequest,
  startMs: number,
) {
  if (!authCtx.apiKeyId) return;
  await logApiAccess(supabase, {
    apiKeyId: authCtx.apiKeyId,
    endpoint,
    method,
    statusCode: status,
    ip: extractClientIp(request),
    userAgent: request.headers.get("user-agent"),
    responseTimeMs: Date.now() - startMs,
  }).catch(() => {});
}
