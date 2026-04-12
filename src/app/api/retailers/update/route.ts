import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity-log";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Fields that are AgriSafe internal (editable) — NOT from Receita Federal
const EDITABLE_FIELDS = new Set([
  "grupo_acesso", "tipo_acesso", "classificacao", "faixa_faturamento",
  "industria_1", "industria_2", "industria_3", "possui_loja_fisica",
  "consolidacao", "porte_name",
]);

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const cnpjRaiz = body.cnpj_raiz?.replace(/\D/g, "");
  const entityUid = body.entity_uid;
  const updates = body.updates as Record<string, string | null>;

  if ((!cnpjRaiz && !entityUid) || !updates || typeof updates !== "object") {
    return NextResponse.json({ error: "cnpj_raiz or entity_uid + updates required" }, { status: 400 });
  }

  // Filter to only allowed editable fields
  const safeUpdates: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (EDITABLE_FIELDS.has(key)) {
      safeUpdates[key] = value;
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  let query = supabaseAdmin.from("retailers").update(safeUpdates);
  if (entityUid) query = query.eq("entity_uid", entityUid);
  else query = query.eq("cnpj_raiz", cnpjRaiz);
  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Phase 24G2 — activity feed (fail-soft)
  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "retailers",
    target_id: cnpjRaiz,
    source: "manual:retailer_edit",
    source_kind: "manual",
    summary: `Revenda ${cnpjRaiz}: campos atualizados — ${Object.keys(safeUpdates).join(", ")}`,
    metadata: { fields: Object.keys(safeUpdates), values: safeUpdates },
    confidentiality: "agrisafe_confidential",
  });

  return NextResponse.json({ updated: Object.keys(safeUpdates) });
}
