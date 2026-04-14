import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { logActivity } from "@/lib/activity-log";

/**
 * POST /api/outreach/queue
 *
 * Queue a campaign for delivery. Validates against the suppression
 * list and writes one `campaign_sends` row per recipient with status
 * `queued`. The actual provider call (Resend / SendGrid) lives in a
 * worker not yet wired — once an `OUTREACH_PROVIDER_KEY` env var
 * appears, swap the queue → provider step in.
 *
 * Body: { campaign_id, recipients: [{ email, entity_uid?, name?, metadata? }] }
 *
 * Returns: { queued: N, suppressed: N, duplicate: N, errors: [...] }
 *
 * NOTE: this endpoint is admin-only today (no auth wired). Restrict
 * via Vercel middleware or supabase RLS once we expose it externally.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const body = await request.json().catch(() => ({}));
  const campaignId = String(body.campaign_id || "").trim();
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];
  const channel = String(body.channel || "email").trim();
  if (!campaignId || recipients.length === 0) {
    return NextResponse.json(
      { error: "campaign_id and non-empty recipients required" },
      { status: 400 },
    );
  }

  // Pull the suppression list once (small table) — saves N round-trips.
  const { data: suppRows } = await supabase.from("suppression_list").select("email");
  const suppressed = new Set((suppRows || []).map((r: any) => String(r.email).toLowerCase()));

  // Existing sends for this campaign — dedup at the contract level so a
  // re-trigger doesn't double-queue.
  const { data: existingRows } = await supabase
    .from("campaign_sends")
    .select("recipient_email")
    .eq("campaign_id", campaignId);
  const alreadyQueued = new Set((existingRows || []).map((r: any) => String(r.recipient_email).toLowerCase()));

  const toInsert: any[] = [];
  let suppressedCount = 0;
  let duplicateCount = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    const email = String(r.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      errors.push(`invalid email: ${r.email}`);
      continue;
    }
    if (suppressed.has(email)) { suppressedCount++; continue; }
    if (alreadyQueued.has(email)) { duplicateCount++; continue; }
    toInsert.push({
      campaign_id: campaignId,
      entity_uid: r.entity_uid || null,
      recipient_email: email,
      recipient_name: r.name || null,
      channel,
      status: "queued",
      metadata: r.metadata || {},
    });
  }

  let queued = 0;
  if (toInsert.length > 0) {
    const { error } = await supabase.from("campaign_sends").insert(toInsert);
    if (error) {
      errors.push(`insert: ${error.message}`);
    } else {
      queued = toInsert.length;
    }
  }

  await logActivity(supabase, {
    action: "insert",
    target_table: "campaign_sends",
    target_id: campaignId,
    source: "manual:outreach_queue",
    source_kind: "manual",
    summary: `Campanha ${campaignId}: ${queued} fila, ${suppressedCount} suprimidos, ${duplicateCount} duplicados`,
    confidentiality: "agrisafe_published",
    metadata: { queued, suppressed: suppressedCount, duplicate: duplicateCount, errors: errors.length, channel },
  });

  return NextResponse.json({
    ok: true,
    campaign_id: campaignId,
    queued,
    suppressed: suppressedCount,
    duplicate: duplicateCount,
    errors,
    note: "Provider not yet wired — rows sit in `campaign_sends.status='queued'` until a worker picks them up. Set OUTREACH_PROVIDER_KEY + run /api/outreach/dispatch (TODO).",
  });
}
