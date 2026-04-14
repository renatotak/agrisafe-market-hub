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

  // Plain INSERT — the unique index on tax_id is partial
  // (`WHERE tax_id IS NOT NULL`), so PostgREST's `.upsert(onConflict:'tax_id')`
  // can't target it. Race handling: if INSERT raises unique-violation
  // (Postgres 23505), the other caller already inserted; just re-read.
  const { data: inserted, error } = await supabaseAdmin
    .from("legal_entities")
    .insert({
      tax_id: taxId,
      tax_id_type: "cnpj",
      legal_name: opts?.legalName ?? null,
      display_name: opts?.displayName ?? opts?.legalName ?? null,
      confidentiality: "public",
    })
    .select("entity_uid")
    .maybeSingle();

  if (inserted?.entity_uid) return inserted.entity_uid;

  // Race or any other error → try re-read; if that also fails, give up.
  const { data: reread } = await supabaseAdmin
    .from("legal_entities")
    .select("entity_uid")
    .eq("tax_id", taxId)
    .maybeSingle();
  if (reread?.entity_uid) return reread.entity_uid;

  console.error("[ensureLegalEntityUid] failed for tax_id=%s:", taxId, error);
  return null;
}
