/**
 * Phase 24G — /api/crm/leads CRUD.
 *
 * GET    ?entity_uid=<uuid>     → leads for an entity
 * GET    (no params)            → all leads, ordered by stage + expected_close_date
 * POST                          → insert
 * PATCH  ?id=<uuid>             → update (typical use: stage progression)
 * DELETE ?id=<uuid>             → hard-delete
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
  "primary_contact_id",
  "stage",
  "service_interest",
  "estimated_value_brl",
  "probability_pct",
  "expected_close_date",
  "source",
  "linked_campaign_id",
  "notes",
  "owner",
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

  let query = supabaseAdmin.from("leads").select("*").order("created_at", { ascending: false })
  if (entityUid) query = query.eq("entity_uid", entityUid)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const entityUid = body.entity_uid
  if (!entityUid) return NextResponse.json({ error: "entity_uid required" }, { status: 400 })

  const row = {
    entity_uid: entityUid,
    ...pickEditable(body),
  }

  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert(row)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "leads",
    target_id: data?.id,
    source: "manual:crm_lead",
    source_kind: "manual",
    summary: `Lead [${body.stage || "new"}]${body.service_interest ? " · " + body.service_interest : ""}${body.estimated_value_brl ? " · R$ " + Number(body.estimated_value_brl).toLocaleString("pt-BR") : ""}`.slice(0, 200),
    confidentiality: "agrisafe_confidential",
    metadata: { entity_uid: entityUid, stage: body.stage },
  })

  return NextResponse.json({ lead: data })
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
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ lead: data })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await supabaseAdmin.from("leads").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
