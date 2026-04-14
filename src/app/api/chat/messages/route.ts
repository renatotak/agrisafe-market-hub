import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifyApiKey, logApiAccess, extractClientIp } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity-log";

/**
 * /api/chat/messages — list history + send + ack.
 *
 * GET   ?thread_id=...&since=ISO&limit=N  — message history, newest first.
 *                                           `since` lets mobile clients replay
 *                                           after coming back online.
 * POST  {thread_id, body?, attachment_path?, reply_to_id?, sender_name?}
 *       — send a new message. status starts as 'sent' for DB-confirmed
 *         rows (the "queued → sent" state is only meaningful on the
 *         client side before the round-trip completes).
 * POST  ?id=<message>&action=ack   body: { kind: 'delivered' | 'read' }
 *       — mark a message as delivered or read; the trigger adjusts the
 *         thread's unread counters for the opposite participant.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  const supabase = createAdminClient();
  const sp = request.nextUrl.searchParams;
  const threadId = sp.get("thread_id");
  const since = sp.get("since");
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "100", 10), 1), 500);
  if (!threadId) return NextResponse.json({ error: "thread_id required" }, { status: 400 });

  const { authCtx, errResp } = await authorize(request, supabase);
  if (errResp) return errResp;

  // Rep-side scope: confirm the caller participates in this thread.
  if (authCtx.kind === "rep") {
    const clientId = request.headers.get("x-client-id") || authCtx.ref;
    const { data: membership } = await supabase
      .from("chat_participants")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("actor_kind", "rep")
      .eq("actor_ref", clientId)
      .maybeSingle();
    if (!membership) {
      await logAccess(supabase, authCtx, "/api/chat/messages", "GET", 403, request, startMs);
      return NextResponse.json({ error: "Not a participant of this thread" }, { status: 403 });
    }
  }

  let q = supabase
    .from("chat_messages")
    .select("id, thread_id, entity_uid, sender_kind, sender_ref, sender_name, body, attachment_path, attachment_kind, attachment_meta, status, failure_reason, sent_at, delivered_at, read_at, reply_to_id, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (since) q = q.gt("created_at", since);

  const { data, error } = await q;
  if (error) {
    await logAccess(supabase, authCtx, "/api/chat/messages", "GET", 500, request, startMs);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAccess(supabase, authCtx, "/api/chat/messages", "GET", 200, request, startMs);
  return NextResponse.json({ messages: data || [], total: (data || []).length });
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  const supabase = createAdminClient();
  const sp = request.nextUrl.searchParams;
  const action = sp.get("action");

  const { authCtx, errResp } = await authorize(request, supabase);
  if (errResp) return errResp;

  if (action === "ack") return handleAck(request, supabase, authCtx, startMs);

  const body = await request.json().catch(() => ({}));
  const threadId = String(body.thread_id || "").trim();
  if (!threadId) {
    await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 400, request, startMs);
    return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  }

  // Fetch thread to get entity_uid + check rep participation / premium gate.
  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id, entity_uid, status")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) {
    await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 404, request, startMs);
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }
  if (thread.status === "blocked") {
    await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 403, request, startMs);
    return NextResponse.json({ error: "thread is blocked" }, { status: 403 });
  }

  if (authCtx.kind === "rep") {
    const { data: flag } = await supabase
      .from("entity_features")
      .select("has_chat")
      .eq("entity_uid", thread.entity_uid)
      .maybeSingle();
    if (!flag?.has_chat) {
      await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 403, request, startMs);
      return NextResponse.json({ error: "Chat not enabled for this entity" }, { status: 403 });
    }
    const { data: membership } = await supabase
      .from("chat_participants")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("actor_kind", "rep")
      .eq("actor_ref", authCtx.ref)
      .maybeSingle();
    if (!membership) {
      // Auto-enroll the rep if the key is valid and feature is on — keeps
      // first-message flow smooth.
      await supabase
        .from("chat_participants")
        .upsert({
          thread_id: threadId,
          actor_kind: "rep",
          actor_ref: authCtx.ref,
          display_name: body.sender_name || null,
          role: "member",
        }, { onConflict: "thread_id,actor_kind,actor_ref", ignoreDuplicates: true });
    }
  }

  const messageBody = body.body != null ? String(body.body) : null;
  const attachmentPath = body.attachment_path ? String(body.attachment_path) : null;
  if (!messageBody && !attachmentPath) {
    await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 400, request, startMs);
    return NextResponse.json({ error: "body or attachment_path required" }, { status: 400 });
  }

  const row = {
    thread_id: threadId,
    entity_uid: thread.entity_uid,
    sender_kind: authCtx.kind,
    sender_ref: authCtx.ref,
    sender_name: (body.sender_name && String(body.sender_name)) || authCtx.name || null,
    body: messageBody,
    attachment_path: attachmentPath,
    attachment_kind: body.attachment_kind || null,
    attachment_meta: body.attachment_meta || {},
    reply_to_id: body.reply_to_id || null,
    status: "sent" as const,
    sent_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(row)
    .select()
    .maybeSingle();
  if (error) {
    await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 500, request, startMs);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 200, request, startMs);
  return NextResponse.json({ message: data });
}

async function handleAck(
  request: NextRequest,
  supabase: ReturnType<typeof createAdminClient>,
  authCtx: AuthCtx,
  startMs: number,
) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || "").trim();
  if (!["delivered", "read"].includes(kind)) {
    return NextResponse.json({ error: "kind must be 'delivered' or 'read'" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, any> = { status: kind };
  if (kind === "delivered") updates.delivered_at = now;
  if (kind === "read") {
    updates.read_at = now;
    if (!(await hasDeliveredAt(supabase, id))) updates.delivered_at = now;
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .update(updates)
    .eq("id", id)
    .select("id, thread_id, status, delivered_at, read_at, sender_kind")
    .maybeSingle();
  if (error) {
    await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 500, request, startMs);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 404, request, startMs);
    return NextResponse.json({ error: "message not found" }, { status: 404 });
  }

  // Also record the participant's last_read_at when they ack-read.
  if (kind === "read") {
    await supabase
      .from("chat_participants")
      .update({ last_read_at: now })
      .eq("thread_id", data.thread_id)
      .eq("actor_kind", authCtx.kind)
      .eq("actor_ref", authCtx.ref);
  }

  await logAccess(supabase, authCtx, "/api/chat/messages", "POST", 200, request, startMs);
  return NextResponse.json({ message: data });
}

async function hasDeliveredAt(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<boolean> {
  const { data } = await supabase.from("chat_messages").select("delivered_at").eq("id", id).maybeSingle();
  return !!data?.delivered_at;
}

// ─── Shared auth helper (duplicated — TODO factor out) ──────

interface AuthCtx {
  kind: "hq" | "rep";
  ref: string;
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
  return { authCtx: { kind: "hq", ref: "admin@agrisafe" }, errResp: null };
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
