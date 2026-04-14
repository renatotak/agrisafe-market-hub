import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureLegalEntityUid } from "@/lib/entities";
import { logActivity } from "@/lib/activity-log";

/**
 * POST /api/crm/entity-from-cnpj
 *
 * Manual entity creation used by the OneNote Import Wizard when the
 * fuzzy matcher can't auto-link a raw company name. User supplies a
 * CNPJ (8–14 digits) + role (`retailer` or `industry`); endpoint
 * resolves it via BrasilAPI, upserts the legal_entity, attaches the
 * role in entity_roles, and — for retailers — seeds a minimal row in
 * the `retailers` table so it shows up in the Diretório de Canais.
 *
 * Body: { cnpj, role_type: 'retailer'|'industry', raw_name? }
 * Returns: { entity_uid, display_name, role_type, created }
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function computeCnpjDv(base12: string): string {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d = base12.split("").map(Number);
  const s1 = d.reduce((s, v, i) => s + v * w1[i], 0);
  const d1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);
  d.push(d1);
  const s2 = d.reduce((s, v, i) => s + v * w2[i], 0);
  const d2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);
  return `${d1}${d2}`;
}

function buildMatrizCnpj(cnpjRaiz: string): string {
  const base12 = cnpjRaiz.padStart(8, "0") + "0001";
  return base12 + computeCnpjDv(base12);
}

async function fetchBrasilApi(fullCnpj: string): Promise<any | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${fullCnpj}`, {
      headers: { "User-Agent": "AgriSafeMarketHub/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cnpjRaw = String(body.cnpj || "").replace(/\D/g, "");
  if (cnpjRaw.length < 8 || cnpjRaw.length > 14) {
    return NextResponse.json({ error: "cnpj must have 8-14 digits" }, { status: 400 });
  }
  const roleType = String(body.role_type || "").trim();
  if (!["retailer", "industry"].includes(roleType)) {
    return NextResponse.json({ error: "role_type must be 'retailer' or 'industry'" }, { status: 400 });
  }
  const rawName = String(body.raw_name || "").trim() || null;

  const cnpjRaiz = cnpjRaw.slice(0, 8).padStart(8, "0");
  const fullCnpj = cnpjRaw.length === 14 ? cnpjRaw : buildMatrizCnpj(cnpjRaiz);

  // ─── BrasilAPI lookup (best-effort) ─────────────────────────
  const brasilApi = await fetchBrasilApi(fullCnpj);
  const razaoSocial: string | null = brasilApi?.razao_social || null;
  const nomeFantasia: string | null = brasilApi?.nome_fantasia || null;
  const uf: string | null = brasilApi?.uf || null;
  const displayName = nomeFantasia || razaoSocial || rawName;

  if (!displayName) {
    return NextResponse.json(
      { error: "BrasilAPI returned no razao_social and no raw_name provided" },
      { status: 422 },
    );
  }

  // ─── 1. Upsert legal_entities ───────────────────────────────
  const entityUid = await ensureLegalEntityUid(supabaseAdmin, cnpjRaiz, {
    legalName: razaoSocial || displayName,
    displayName,
  });
  if (!entityUid) {
    return NextResponse.json({ error: "Failed to create legal_entity" }, { status: 500 });
  }

  // ─── 2. Attach role in entity_roles (idempotent) ────────────
  await supabaseAdmin
    .from("entity_roles")
    .upsert(
      { entity_uid: entityUid, role_type: roleType, metadata: { source: "onenote_import" } },
      { onConflict: "entity_uid,role_type", ignoreDuplicates: true },
    );

  // ─── 3. Seed satellite tables ───────────────────────────────
  let createdRetailer = false;
  let createdIndustry = false;

  if (roleType === "retailer") {
    // Seed retailers row so it appears in the Diretório de Canais.
    // retailers.cnpj_raiz was dropped — we key on entity_uid now.
    const { data: existing } = await supabaseAdmin
      .from("retailers")
      .select("id")
      .eq("entity_uid", entityUid)
      .maybeSingle();

    if (!existing) {
      const { error: rErr } = await supabaseAdmin.from("retailers").insert({
        entity_uid: entityUid,
        razao_social: razaoSocial || displayName,
        nome_fantasia: nomeFantasia,
        grupo_acesso: "DISTRIBUIDOR",
        consolidacao: displayName,
        active: true,
      });
      if (!rErr) createdRetailer = true;
    }
  } else if (roleType === "industry") {
    // The Diretório de Indústrias surfaces every legal_entity with
    // role_type='industry' via the "imported" branch of /api/industries,
    // so we DO NOT need to also insert into the legacy `industries`
    // table — doing so would create a second card for the same actor
    // (the bug we fixed in mig 061 + this commit).
    //
    // The legacy `industries` table is reserved for the original 18
    // curated brand-profiles (Syngenta, BASF, etc.) that carry rich
    // metadata. Those rows are now linked to their legal_entity via
    // `industries.entity_uid` so /api/industries can merge the pair.
    //
    // If the user later wants to attach a curated brand-profile to
    // this entity, they can do it via the IndustryProfile editor.
    createdIndustry = false;
  }

  // ─── 4. Activity log ────────────────────────────────────────
  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "legal_entities",
    target_id: entityUid,
    source: "manual:onenote_import_addcnpj",
    source_kind: "manual",
    summary: `${displayName} (${uf || "—"}) — ${roleType} · CNPJ ${fullCnpj}${rawName ? ` · raw="${rawName}"` : ""}`.slice(0, 200),
    metadata: {
      cnpj_raiz: cnpjRaiz,
      full_cnpj: fullCnpj,
      role_type: roleType,
      raw_name: rawName,
      brasilapi_hit: !!brasilApi,
      created_retailer: createdRetailer,
      created_industry: createdIndustry,
    },
  });

  return NextResponse.json({
    ok: true,
    entity_uid: entityUid,
    display_name: displayName,
    legal_name: razaoSocial,
    uf,
    role_type: roleType,
    created: { retailer: createdRetailer, industry: createdIndustry },
    brasilapi_hit: !!brasilApi,
  });
}
