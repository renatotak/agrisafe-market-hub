/**
 * Phase 25 — /api/data-sources CRUD.
 *
 * Backs the new "Adicionar Fonte" / Edit / Delete UX in DataSources.tsx
 * and the migrated `sync-source-registry-healthcheck` cron.
 *
 *   GET    /api/data-sources                          → list all (active=true by default)
 *   GET    /api/data-sources?include_inactive=true    → include disabled rows
 *   GET    /api/data-sources?id=src-12                → single row
 *   POST   /api/data-sources                          → create new (id generated if absent)
 *   PATCH  /api/data-sources?id=src-12                → update
 *   DELETE /api/data-sources?id=src-12                → soft-delete (sets active=false)
 *   DELETE /api/data-sources?id=src-12&hard=true      → hard delete (allowed only for manual entries)
 *
 * Service-role admin client today (matches the rest of the project's
 * write paths). When multi-user RBAC lands, layer auth in front.
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
  "name",
  "source_org",
  "category",
  "data_type",
  "description",
  "frequency",
  "url",
  "url_secondary",
  "server",
  "automated",
  "notes",
  "used_in_app",
  "active",
  "confidentiality",
] as const

const VALID_STATUS = new Set(["active", "inactive", "error", "unchecked"])

function pickEditable(body: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of EDITABLE_FIELDS) {
    if (k in body) out[k] = body[k]
  }
  return out
}

function generateId(name: string): string {
  // Manual entries get a deterministic-ish id from the name + a timestamp
  // suffix so the same name doesn't collide on second add.
  const slug = (name || "src")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
  const suffix = Date.now().toString(36).slice(-5)
  return `manual-${slug}-${suffix}`
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  const includeInactive = req.nextUrl.searchParams.get("include_inactive") === "true"
  const category = req.nextUrl.searchParams.get("category")
  const status = req.nextUrl.searchParams.get("url_status")

  if (id) {
    const { data, error } = await supabaseAdmin
      .from("data_sources")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ source: data })
  }

  let query = supabaseAdmin.from("data_sources").select("*").order("id")
  if (!includeInactive) query = query.eq("active", true)
  if (category) query = query.eq("category", category)
  if (status) query = query.eq("url_status", status)

  // Lift the default 1000-row PostgREST cap by paging
  const all: any[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
  }

  return NextResponse.json({ count: all.length, sources: all })
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "").trim()
  const url = String(body.url || "").trim()

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "url must start with http:// or https://" }, { status: 400 })
  }

  const id = String(body.id || "").trim() || generateId(name)
  const row = {
    id,
    name,
    url,
    ...pickEditable(body),
    origin_file: body.origin_file || "manual",
  }

  const { data, error } = await supabaseAdmin
    .from("data_sources")
    .insert(row)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `id "${id}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "data_sources",
    target_id: id,
    source: "manual:data_source_create",
    source_kind: "manual",
    summary: `Nova fonte: ${name} (${data?.category || "outros"})`.slice(0, 200),
    metadata: { url, category: data?.category, frequency: data?.frequency },
  })

  return NextResponse.json({ source: data })
}

// ─── PATCH ──────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const updates = pickEditable(body)

  // Allow url_status / http_status / last_checked_at updates from the
  // healthcheck cron path. These are NOT in EDITABLE_FIELDS because the
  // UI shouldn't expose them, but the cron route needs them.
  if (body._cron_update === true) {
    if (body.url_status && VALID_STATUS.has(body.url_status)) {
      updates.url_status = body.url_status
    }
    if (typeof body.http_status === "number" || body.http_status === null) {
      updates.http_status = body.http_status
    }
    if (body.last_checked_at) {
      updates.last_checked_at = body.last_checked_at
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no editable fields in body" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("data_sources")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })

  // Skip activity logging for cron updates — those are noisy and are
  // already summarized in the healthcheck job's own activity row.
  if (body._cron_update !== true) {
    await logActivity(supabaseAdmin, {
      action: "update",
      target_table: "data_sources",
      target_id: id,
      source: "manual:data_source_edit",
      source_kind: "manual",
      summary: `${data.name}: ${Object.keys(updates).join(", ")}`.slice(0, 200),
      metadata: { fields: Object.keys(updates) },
    })
  }

  return NextResponse.json({ source: data })
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  const hard = req.nextUrl.searchParams.get("hard") === "true"
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Look up to get the name + origin for the log + hard-delete safety check
  const { data: existing } = await supabaseAdmin
    .from("data_sources")
    .select("name, origin_file")
    .eq("id", id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  // Hard-delete is allowed only for user-added rows. Seeded entries from
  // the JSON catalog can only be soft-deleted (active=false) so the
  // catalog stays auditable.
  if (hard) {
    if (existing.origin_file && existing.origin_file !== "manual") {
      return NextResponse.json(
        { error: "hard delete not allowed on seeded entries — use soft delete" },
        { status: 403 },
      )
    }
    const { error } = await supabaseAdmin.from("data_sources").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logActivity(supabaseAdmin, {
      action: "delete",
      target_table: "data_sources",
      target_id: id,
      source: "manual:data_source_delete",
      source_kind: "manual",
      summary: `Fonte removida: ${existing.name}`.slice(0, 200),
      metadata: { hard: true },
    })
    return NextResponse.json({ ok: true, hard: true })
  }

  const { error } = await supabaseAdmin
    .from("data_sources")
    .update({ active: false })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabaseAdmin, {
    action: "delete",
    target_table: "data_sources",
    target_id: id,
    source: "manual:data_source_disable",
    source_kind: "manual",
    summary: `Fonte desativada: ${existing.name}`.slice(0, 200),
    metadata: { soft: true },
  })

  return NextResponse.json({ ok: true, hard: false })
}
