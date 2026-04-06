import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the entity_uid for a CNPJ basico (8-digit root), creating a
 * minimal legal_entities row if one doesn't exist yet.
 *
 * Idempotent: safe to call from every write API that touches satellite
 * tables keyed on cnpj_basico / cnpj_raiz.
 *
 * Returns `null` only on database error (logged). Never throws — callers
 * can still write the legacy text key even if entity resolution fails.
 */
export async function ensureLegalEntityUid(
  supabaseAdmin: SupabaseClient,
  cnpjBasico: string,
  opts?: { legalName?: string | null; displayName?: string | null },
): Promise<string | null> {
  const taxId = cnpjBasico.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
  if (taxId.length !== 8) return null;

  // Fast path: existing row
  const { data: existing } = await supabaseAdmin
    .from("legal_entities")
    .select("entity_uid")
    .eq("tax_id", taxId)
    .maybeSingle();

  if (existing?.entity_uid) return existing.entity_uid;

  // Insert minimal row. ON CONFLICT is handled by the partial unique index
  // on tax_id — a race between two callers just means one of them loses
  // and re-reads. .upsert() with ignoreDuplicates gives us that behavior.
  const { data: inserted, error } = await supabaseAdmin
    .from("legal_entities")
    .upsert(
      {
        tax_id: taxId,
        tax_id_type: "cnpj",
        legal_name: opts?.legalName ?? null,
        display_name: opts?.displayName ?? opts?.legalName ?? null,
        confidentiality: "public",
      },
      { onConflict: "tax_id", ignoreDuplicates: true },
    )
    .select("entity_uid")
    .maybeSingle();

  if (inserted?.entity_uid) return inserted.entity_uid;

  // Upsert with ignoreDuplicates returns null on conflict — re-read.
  if (!error) {
    const { data: reread } = await supabaseAdmin
      .from("legal_entities")
      .select("entity_uid")
      .eq("tax_id", taxId)
      .maybeSingle();
    return reread?.entity_uid ?? null;
  }

  console.error("[ensureLegalEntityUid] failed for tax_id=%s:", taxId, error);
  return null;
}
