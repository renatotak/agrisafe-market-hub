import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { logActivity, logActivityBatch } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set([
  "industry", "retailer", "cooperative", "frigorifico", "trader",
  "distribuidor", "rural_producer", "professional", "government",
  "competitor", "agrisafe_client", "agrisafe_partner",
  "financial_institution", "other",
]);

// ─── GET — entities imported via OneNote with role 'retailer' ────────

export async function GET() {
  const supabase = createAdminClient();

  // Find entities that have meetings sourced from onenote_import
  // AND currently carry the 'retailer' role.
  const { data, error } = await supabase.rpc("get_onenote_retailers");

  if (error) {
    // Fallback: manual join via two queries
    const { data: meetingEntities, error: mErr } = await supabase
      .from("meetings")
      .select("entity_uid")
      .eq("source", "onenote_import");

    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }

    const uids = [...new Set((meetingEntities || []).map((r) => r.entity_uid))];
    if (uids.length === 0) {
      return NextResponse.json({ entities: [] });
    }

    // Get entities with retailer role among those
    const { data: roles, error: rErr } = await supabase
      .from("entity_roles")
      .select("entity_uid, role_type")
      .in("entity_uid", uids);

    if (rErr) {
      return NextResponse.json({ error: rErr.message }, { status: 500 });
    }

    // Build a map of entity_uid -> roles
    const roleMap = new Map<string, string[]>();
    for (const r of roles || []) {
      const arr = roleMap.get(r.entity_uid) || [];
      arr.push(r.role_type);
      roleMap.set(r.entity_uid, arr);
    }

    // Only include entities that have 'retailer' role
    const retailerUids = uids.filter((uid) => {
      const roles = roleMap.get(uid);
      return roles && roles.includes("retailer");
    });

    if (retailerUids.length === 0) {
      return NextResponse.json({ entities: [] });
    }

    // Fetch entity details
    const { data: entities, error: eErr } = await supabase
      .from("legal_entities")
      .select("entity_uid, display_name, legal_name, tax_id, tax_id_type")
      .in("entity_uid", retailerUids)
      .order("display_name");

    if (eErr) {
      return NextResponse.json({ error: eErr.message }, { status: 500 });
    }

    const result = (entities || []).map((e) => ({
      entity_uid: e.entity_uid,
      name: e.display_name || e.legal_name || "(sem nome)",
      tax_id: e.tax_id,
      current_roles: roleMap.get(e.entity_uid) || [],
    }));

    return NextResponse.json({ entities: result });
  }

  return NextResponse.json({ entities: data || [] });
}

// ─── POST — batch reclassify ─────────────────────────────────────────

interface ReclassifyChange {
  entity_uid: string;
  new_role_type: string;
}

export async function POST(req: NextRequest) {
  let body: { changes: ReclassifyChange[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { changes } = body;
  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: "changes array required" }, { status: 400 });
  }

  // Validate
  for (const c of changes) {
    if (!c.entity_uid || !c.new_role_type) {
      return NextResponse.json({ error: "entity_uid and new_role_type required" }, { status: 400 });
    }
    if (!VALID_ROLES.has(c.new_role_type)) {
      return NextResponse.json({ error: `Invalid role: ${c.new_role_type}` }, { status: 400 });
    }
  }

  const supabase = createAdminClient();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of changes) {
    // Delete old 'retailer' role
    const { error: delErr } = await supabase
      .from("entity_roles")
      .delete()
      .eq("entity_uid", c.entity_uid)
      .eq("role_type", "retailer");

    if (delErr) {
      errors.push(`${c.entity_uid}: delete retailer failed — ${delErr.message}`);
      continue;
    }

    // Insert new role (upsert — PK is entity_uid + role_type)
    const { error: insErr } = await supabase
      .from("entity_roles")
      .upsert(
        { entity_uid: c.entity_uid, role_type: c.new_role_type },
        { onConflict: "entity_uid,role_type" },
      );

    if (insErr) {
      errors.push(`${c.entity_uid}: insert ${c.new_role_type} failed — ${insErr.message}`);
      continue;
    }

    updated++;
  }

  // Activity log
  if (updated > 0) {
    await logActivityBatch(
      supabase,
      changes
        .filter((c) => !errors.some((e) => e.startsWith(c.entity_uid)))
        .map((c) => ({
          action: "update" as const,
          target_table: "entity_roles",
          target_id: c.entity_uid,
          source: "manual:reclassification",
          source_kind: "manual" as const,
          summary: `Reclassified from retailer → ${c.new_role_type}`,
          actor: "admin",
          metadata: { old_role: "retailer", new_role: c.new_role_type },
        })),
    );
  }

  return NextResponse.json({
    ok: errors.length === 0,
    updated,
    skipped,
    errors: errors.slice(0, 20),
  });
}
