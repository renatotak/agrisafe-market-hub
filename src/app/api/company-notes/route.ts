import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureLegalEntityUid } from "@/lib/entities";
import { logActivity } from "@/lib/activity-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** GET — fetch all notes for a company */
export async function GET(req: NextRequest) {
  const entityUid = req.nextUrl.searchParams.get("entity_uid");
  let cnpjBasico = req.nextUrl.searchParams.get("cnpj_basico")?.replace(/\D/g, "");

  if (entityUid && !cnpjBasico) {
    const { data: entity } = await supabaseAdmin.from("legal_entities").select("tax_id").eq("entity_uid", entityUid).maybeSingle();
    if (entity?.tax_id) cnpjBasico = entity.tax_id.slice(0, 8);
  }
  if (!cnpjBasico && !entityUid) return NextResponse.json({ error: "cnpj_basico or entity_uid required" }, { status: 400 });

  const root = cnpjBasico?.padStart(8, "0");
  let query = supabaseAdmin.from("company_notes").select("field_key, value, updated_at");
  if (entityUid) query = query.eq("entity_uid", entityUid);
  else query = query.eq("cnpj_basico", root!);
  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Convert to a key-value map
  const notes: Record<string, { value: string; updated_at: string }> = {};
  for (const row of data || []) {
    notes[row.field_key] = { value: row.value, updated_at: row.updated_at };
  }
  return NextResponse.json({ cnpj_basico: root, notes });
}

/** POST — upsert one or more notes */
export async function POST(req: NextRequest) {
  const body = await req.json();
  let cnpjBasico = body.cnpj_basico?.replace(/\D/g, "");
  const bodyEntityUid = body.entity_uid;
  const updates = body.notes as Record<string, string>; // { field_key: value }

  if (bodyEntityUid && !cnpjBasico) {
    const { data: entity } = await supabaseAdmin.from("legal_entities").select("tax_id").eq("entity_uid", bodyEntityUid).maybeSingle();
    if (entity?.tax_id) cnpjBasico = entity.tax_id.slice(0, 8);
  }

  if (!cnpjBasico || !updates || typeof updates !== "object") {
    return NextResponse.json({ error: "cnpj_basico or entity_uid + notes required" }, { status: 400 });
  }

  const root = cnpjBasico.padStart(8, "0");
  const entityUid = bodyEntityUid || await ensureLegalEntityUid(supabaseAdmin, root);

  const rows = Object.entries(updates).map(([field_key, value]) => ({
    cnpj_basico: root,
    entity_uid: entityUid,
    field_key,
    value: String(value),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("company_notes")
    .upsert(rows, { onConflict: "cnpj_basico,field_key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Phase 24G2 — activity feed (fail-soft). Notes are AgriSafe-internal
  // observations on a CNPJ; default tier is agrisafe_confidential.
  await logActivity(supabaseAdmin, {
    action: "upsert",
    target_table: "company_notes",
    target_id: root,
    source: "manual:company_notes",
    source_kind: "manual",
    summary: `Notas da empresa ${root}: ${rows.length} campo(s) salvo(s) (${Object.keys(updates).join(", ")})`,
    metadata: { entity_uid: entityUid, fields: Object.keys(updates) },
    confidentiality: "agrisafe_confidential",
  });

  return NextResponse.json({ saved: rows.length });
}
