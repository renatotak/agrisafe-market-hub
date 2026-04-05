import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  const updates = body.updates as Record<string, string | null>;

  if (!cnpjRaiz || !updates || typeof updates !== "object") {
    return NextResponse.json({ error: "cnpj_raiz and updates required" }, { status: 400 });
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

  const { error } = await supabaseAdmin
    .from("retailers")
    .update(safeUpdates)
    .eq("cnpj_raiz", cnpjRaiz);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: Object.keys(safeUpdates) });
}
