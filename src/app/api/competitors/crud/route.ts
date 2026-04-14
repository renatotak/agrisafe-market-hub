import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { ensureLegalEntityUid } from "@/lib/entities";

/**
 * Phase 21 — Competitors CRUD route.
 *
 * POST   { id?, name, vertical?, segment?, country?, website?, description_pt?,
 *          description_en?, tax_id?, notes?, harvey_ball_scores? }
 * PATCH  { id, ...partial }
 * DELETE { id }
 *
 * On insert/update, when `tax_id` is present we resolve a stable
 * `entity_uid` via `ensureLegalEntityUid()` so the new competitor row joins
 * the cross-vertical 5-entity graph (Phase 17 alignment).
 *
 * The Harvey Ball matrix is mirrored into the legacy `score_*` columns so
 * the existing sync-competitors cron and the comparison matrix view stay
 * in sync without a second migration pass.
 */

const HARVEY_DIMENSIONS = ["vertical", "depth", "precision", "pulse", "regulatory", "ux"] as const;
type HarveyKey = (typeof HARVEY_DIMENSIONS)[number];

const EDITABLE_FIELDS = new Set([
  "name", "vertical", "segment", "country", "website",
  "description_pt", "description_en", "tax_id", "notes",
  "score_depth", "score_precision", "score_pulse",
  "score_regulatory", "score_ux", "score_credit",
  "harvey_ball_scores",
]);

function slugifyId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || `competitor-${Date.now()}`;
}

function clampScore(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(4, Math.round(n)));
}

function normalizeHarvey(input: unknown): Record<HarveyKey, number> {
  const out = { vertical: 0, depth: 0, precision: 0, pulse: 0, regulatory: 0, ux: 0 } as Record<HarveyKey, number>;
  if (input && typeof input === "object") {
    for (const k of HARVEY_DIMENSIONS) {
      if ((input as Record<string, unknown>)[k] !== undefined) {
        out[k] = clampScore((input as Record<string, unknown>)[k]);
      }
    }
  }
  return out;
}

function pickUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_FIELDS.has(key)) continue;
    if (key.startsWith("score_")) {
      out[key] = clampScore(value);
    } else if (key === "harvey_ball_scores") {
      const hb = normalizeHarvey(value);
      out[key] = hb;
      out.score_depth = hb.depth;
      out.score_precision = hb.precision;
      out.score_pulse = hb.pulse;
      out.score_regulatory = hb.regulatory;
      out.score_ux = hb.ux;
    } else if (key === "tax_id" && typeof value === "string") {
      // NOTE: We don't persist tax_id directly into competitors table anymore
      // We handle entity_uid resolution downstream using this extracted value
    } else {
      out[key] = value === "" ? null : value;
    }
  }
  return out;
}

// ─── POST: create a new competitor ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Choose / validate id
  const requestedId = typeof body.id === "string" ? body.id.trim() : "";
  let id = requestedId || slugifyId(name);

  // Conflict check
  const { data: existing } = await supabase.from("competitors").select("id").eq("id", id).maybeSingle();
  if (existing) {
    id = `${id}-${Date.now().toString(36).slice(-4)}`;
  }

  const updates = pickUpdates(body);

  // Resolve entity_uid via the canonical helper
  let entityUid: string | null = null;
  const inTaxId = body.tax_id as string | null | undefined;
  if (inTaxId) {
    entityUid = await ensureLegalEntityUid(supabase, inTaxId, {
      legalName: name,
      displayName: name,
    });
  } else {
    // Anchor as a tax-id-less seed entity, mirroring the 020 backfill pattern.
    const sourceRef = `competitors:${id}`;
    const { data: leExisting } = await supabase
      .from("legal_entities")
      .select("entity_uid")
      .eq("source_ref", sourceRef)
      .maybeSingle();
    if (leExisting?.entity_uid) {
      entityUid = leExisting.entity_uid;
    } else {
      const { data: leInserted } = await supabase
        .from("legal_entities")
        .insert({
          tax_id: null,
          tax_id_type: "unknown",
          legal_name: name,
          display_name: name,
          confidentiality: "public",
          source_ref: sourceRef,
        })
        .select("entity_uid")
        .maybeSingle();
      entityUid = leInserted?.entity_uid ?? null;
    }
  }

  if (entityUid) {
    // Attach competitor role (idempotent)
    await supabase
      .from("entity_roles")
      .upsert({ entity_uid: entityUid, role_type: "competitor" }, { onConflict: "entity_uid,role_type", ignoreDuplicates: true });
  }

  const insertRow: Record<string, unknown> = {
    id,
    name,
    entity_uid: entityUid,
    confidentiality: "agrisafe_published",
    ...updates,
  };
  if (insertRow.notes) {
    insertRow.notes_updated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("competitors")
    .insert(insertRow)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ competitor: data });
}

// ─── PATCH: update an existing competitor ──────────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = createAdminClient();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates = pickUpdates(body);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no editable fields" }, { status: 400 });
  }

  if ("notes" in updates) {
    updates.notes_updated_at = new Date().toISOString();
  }

  // If tax_id was supplied, refresh entity_uid (tax_id is not persisted
  // in competitors — it's only used to resolve entity_uid via legal_entities)
  const patchTaxId = typeof body.tax_id === "string" ? body.tax_id.replace(/\D/g, "").slice(0, 14) : null;
  if (patchTaxId) {
    const { data: row } = await supabase
      .from("competitors")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    const entityUid = await ensureLegalEntityUid(
      supabase,
      patchTaxId,
      { legalName: row?.name ?? null, displayName: row?.name ?? null },
    );
    if (entityUid) {
      updates.entity_uid = entityUid;
      await supabase
        .from("entity_roles")
        .upsert({ entity_uid: entityUid, role_type: "competitor" }, { onConflict: "entity_uid,role_type", ignoreDuplicates: true });
    }
  }

  const { data, error } = await supabase
    .from("competitors")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ competitor: data });
}

// ─── DELETE: remove a competitor ───────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = createAdminClient();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Cascade: delete signals first (no FK ON DELETE CASCADE in mig 006)
  await supabase.from("competitor_signals").delete().eq("competitor_id", id);

  const { error } = await supabase.from("competitors").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deleted: id });
}
