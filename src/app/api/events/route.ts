import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity-log";
import { geocodeAddress } from "@/lib/geocode";

/**
 * /api/events — manual CRUD for the unified events table.
 *
 *   PATCH ?id=<event_id>   — update fields (name, date, location,
 *                             type, website, lat/lng, hidden, etc.)
 *   POST                    — insert a new manual event
 *   DELETE ?id=<event_id>   — soft-archive (hidden=true) by default;
 *                             pass ?hard=true to actually delete
 *
 * GET lives at /api/events-db (public read). This file only handles
 * writes so keeping them in a separate namespace avoids accidentally
 * mixing read-ISR caching with write traffic.
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const EDITABLE_FIELDS = [
  "name",
  "date",
  "end_date",
  "location",
  "type",
  "description_pt",
  "description_en",
  "website",
  "source_name",
  "source_url",
  "organizer_cnpj",
  "latitude",
  "longitude",
  "hidden",
  "hidden_reason",
] as const;

const VALID_TYPES = new Set([
  "fair", "conference", "workshop", "webinar", "summit", "other",
]);

function pickEditable(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  if (out.type && !VALID_TYPES.has(out.type)) delete out.type;
  return out;
}

async function maybeGeocode(updates: Record<string, any>) {
  // If the caller changed location but didn't supply lat/lng, try to
  // geocode automatically. Failure is non-fatal — the row still saves.
  if (
    typeof updates.location === "string" &&
    updates.latitude == null &&
    updates.longitude == null
  ) {
    // Extract city, uf from "City, UF" format if present.
    const parts = updates.location.split(",").map((s: string) => s.trim()).filter(Boolean);
    const municipio = parts[0] || null;
    const uf = parts.length >= 2 && parts[parts.length - 1].length === 2
      ? parts[parts.length - 1].toUpperCase()
      : null;
    if (municipio) {
      try {
        const geo = await geocodeAddress({
          logradouro: null,
          numero: null,
          bairro: null,
          cep: null,
          municipio,
          uf,
        });
        if (geo) {
          updates.latitude = geo.lat;
          updates.longitude = geo.lng;
        }
      } catch { /* ignore */ }
    }
  }
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const updates = pickEditable(body);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no editable fields in body" }, { status: 400 });
  }

  await maybeGeocode(updates);

  const { data, error } = await supabaseAdmin
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "events",
    target_id: id,
    source: "manual:events_edit",
    source_kind: "manual",
    summary: `${data.name || id}: ${Object.keys(updates).join(", ")}`.slice(0, 200),
    metadata: { fields: Object.keys(updates), hidden: data.hidden },
  });

  return NextResponse.json({ event: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.name || !body.date) {
    return NextResponse.json({ error: "name and date required" }, { status: 400 });
  }
  const row = {
    id: body.id || `manual-${Date.now().toString(36)}`,
    type: VALID_TYPES.has(body.type) ? body.type : "other",
    source_name: body.source_name || "Manual",
    hidden: false,
    ...pickEditable(body),
  };
  await maybeGeocode(row as any);

  const { data, error } = await supabaseAdmin
    .from("events")
    .insert(row)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "events",
    target_id: data?.id,
    source: "manual:events_add",
    source_kind: "manual",
    summary: `Evento adicionado: ${data?.name}`.slice(0, 200),
    metadata: { type: data?.type, location: data?.location },
  });

  return NextResponse.json({ event: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const hard = req.nextUrl.searchParams.get("hard") === "true";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (hard) {
    const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logActivity(supabaseAdmin, {
      action: "delete",
      target_table: "events",
      target_id: id,
      source: "manual:events_delete",
      source_kind: "manual",
      summary: `Evento excluído: ${id}`,
      metadata: { hard: true },
    });
    return NextResponse.json({ ok: true, hard: true });
  }

  // Soft-archive
  const { data, error } = await supabaseAdmin
    .from("events")
    .update({ hidden: true })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "events",
    target_id: id,
    source: "manual:events_hide",
    source_kind: "manual",
    summary: `Evento ocultado: ${data?.name || id}`.slice(0, 200),
    metadata: { hidden: true },
  });

  return NextResponse.json({ ok: true, event: data });
}
