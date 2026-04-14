import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isVertexAI } from "@/lib/gemini";

/**
 * GET/PATCH /api/settings/ai-model
 *
 * Reads/writes the active generation model preference.
 * Stored as a special row in analysis_lenses (id = '__ai_model').
 */

const ROW_ID = "__ai_model";
const DEFAULT_MODEL = "gemini-2.5-flash";

const AVAILABLE_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Fast, cost-effective (current default)" },
  { id: "gemini-3.1-flash-preview", label: "Gemini 3.1 Flash Preview", description: "Next-gen Flash — faster, cheaper" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", description: "Most capable — best for complex analysis" },
];

export async function GET() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("analysis_lenses")
    .select("model")
    .eq("id", ROW_ID)
    .maybeSingle();

  return NextResponse.json({
    current: data?.model || DEFAULT_MODEL,
    available: AVAILABLE_MODELS,
    provider: isVertexAI() ? "vertexai" : "gemini_api",
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const model = body.model as string;

  if (!model || !AVAILABLE_MODELS.some((m) => m.id === model)) {
    return NextResponse.json(
      { error: `Invalid model. Choose from: ${AVAILABLE_MODELS.map((m) => m.id).join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("analysis_lenses").upsert(
    {
      id: ROW_ID,
      label_pt: "Modelo de IA",
      label_en: "AI Model",
      search_template: "",
      system_prompt: "",
      model,
      enabled: true,
      is_builtin: true,
    },
    { onConflict: "id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, model });
}
