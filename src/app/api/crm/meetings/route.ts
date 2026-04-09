/**
 * Phase 24G — /api/crm/meetings CRUD.
 *
 * Mirrors /api/crm/key-persons. Tier behavior is the same:
 * service-role admin client, no per-request tier filter today.
 *
 * GET    ?entity_uid=<uuid>     → meetings for an entity, newest first
 * POST                          → insert
 * PATCH  ?id=<uuid>             → update
 * DELETE ?id=<uuid>             → hard-delete (no soft-delete column)
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
  "meeting_date",
  "meeting_type",
  "attendees",
  "agenda",
  "summary",
  "next_steps",
  "outcome",
  "source",
  "external_id",
] as const

function pickEditable(body: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of EDITABLE_FIELDS) {
    if (k in body) out[k] = body[k]
  }
  return out
}

export async function GET(req: NextRequest) {
  const entityUid = req.nextUrl.searchParams.get("entity_uid")
  if (!entityUid) return NextResponse.json({ error: "entity_uid required" }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from("meetings")
    .select("*")
    .eq("entity_uid", entityUid)
    .order("meeting_date", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ meetings: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const entityUid = body.entity_uid
  const meetingDate = body.meeting_date

  if (!entityUid) return NextResponse.json({ error: "entity_uid required" }, { status: 400 })
  if (!meetingDate || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    return NextResponse.json({ error: "meeting_date required (YYYY-MM-DD)" }, { status: 400 })
  }

  const row = {
    entity_uid: entityUid,
    ...pickEditable(body),
  }

  const { data, error } = await supabaseAdmin
    .from("meetings")
    .insert(row)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "meetings",
    target_id: data?.id,
    source: "manual:crm_meeting",
    source_kind: "manual",
    summary: `${meetingDate} · ${body.meeting_type || "comercial"}${body.summary ? " — " + String(body.summary).slice(0, 80) : ""}`,
    confidentiality: "agrisafe_confidential",
    metadata: { entity_uid: entityUid, outcome: body.outcome },
  })

  return NextResponse.json({ meeting: data })
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const updates = pickEditable(body)
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no editable fields in body" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("meetings")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ meeting: data })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await supabaseAdmin.from("meetings").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
