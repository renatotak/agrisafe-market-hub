/**
 * Phase 24G — /api/crm/key-persons CRUD.
 *
 * GET    ?entity_uid=<uuid>     → list active key persons for an entity
 * POST                          → insert a new key person (body = full row)
 * PATCH  ?id=<uuid>             → update a row (body = partial)
 * DELETE ?id=<uuid>             → soft-delete (sets active=false)
 *
 * All rows default to `agrisafe_confidential` (set by the table default).
 * The reads here are NOT tier-filtered yet — they go through the
 * service-role admin client and return everything for the requested
 * entity. The Diretório UI is the gate today (only authenticated
 * AgriSafe users see it). When multi-user RBAC lands, layer
 * resolveCallerTier() in front of the .from('key_persons').select() and
 * apply the .in('confidentiality', visibleTiers(tier)) filter.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const EDITABLE_FIELDS = [
  "full_name",
  "role_title",
  "department",
  "email",
  "phone",
  "whatsapp",
  "linkedin_url",
  "notes",
  "is_decision_maker",
  "is_gatekeeper",
  "active",
] as const

function pickEditable(body: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of EDITABLE_FIELDS) {
    if (k in body) out[k] = body[k]
  }
  return out
}

// ─── GET ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const entityUid = req.nextUrl.searchParams.get("entity_uid")
  if (!entityUid) {
    return NextResponse.json({ error: "entity_uid required" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("key_persons")
    .select("*")
    .eq("entity_uid", entityUid)
    .eq("active", true)
    .order("is_decision_maker", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ key_persons: data || [] })
}

// ─── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const entityUid = body.entity_uid
  const fullName = String(body.full_name || "").trim()

  if (!entityUid) return NextResponse.json({ error: "entity_uid required" }, { status: 400 })
  if (!fullName) return NextResponse.json({ error: "full_name required" }, { status: 400 })

  const row = {
    entity_uid: entityUid,
    ...pickEditable(body),
    full_name: fullName,
  }

  const { data, error } = await supabaseAdmin
    .from("key_persons")
    .insert(row)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "key_persons",
    target_id: data?.id,
    source: "manual:crm_key_person",
    source_kind: "manual",
    summary: `${fullName}${body.role_title ? ` (${body.role_title})` : ""}`.slice(0, 200),
    confidentiality: "agrisafe_confidential",
    metadata: { entity_uid: entityUid },
  })

  return NextResponse.json({ key_person: data })
}

// ─── PATCH ─────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const updates = pickEditable(body)
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no editable fields in body" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("key_persons")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ key_person: data })
}

// ─── DELETE (soft) ─────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("key_persons")
    .update({ active: false })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
