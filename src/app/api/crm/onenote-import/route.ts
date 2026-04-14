import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { parseOneNoteDocx, type ParsedMeeting } from "@/lib/onenote-parser";
import { matchCompanies, type CompanyMatch } from "@/lib/onenote-company-matcher";
import { logActivity } from "@/lib/activity-log";
import { resolve } from "path";

export const dynamic = "force-dynamic";

const DOCX_PATH = resolve(process.cwd(), "local files/26-0209 onenote Davi.docx");

// ─── POST ?action=parse ───────────────────────────────────────────────
// Parses the DOCX, runs company matching, returns preview. NO DB writes.

// ─── POST ?action=commit ──────────────────────────────────────────────
// Receives confirmed matches, bulk-inserts to CRM tables.

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  if (action === "parse") return handleParse();
  if (action === "commit") return handleCommit(req);

  return NextResponse.json({ error: "action must be 'parse' or 'commit'" }, { status: 400 });
}

// ─── Parse ────────────────────────────────────────────────────────────

async function handleParse() {
  try {
    const parsed = await parseOneNoteDocx(DOCX_PATH);

    // Build meeting count per company
    const meetingCountMap = new Map<string, number>();
    for (const m of parsed.meetings) {
      meetingCountMap.set(m.companyName, (meetingCountMap.get(m.companyName) || 0) + 1);
    }

    const supabase = createAdminClient();
    const matches = await matchCompanies(supabase, parsed.uniqueCompanies, meetingCountMap);

    const tierCounts = { exact: 0, likely: 0, uncertain: 0, unmatched: 0 };
    for (const m of matches) tierCounts[m.tier]++;

    return NextResponse.json({
      stats: parsed.stats,
      tierCounts,
      matches,
      meetings: parsed.meetings,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Parse failed" }, { status: 500 });
  }
}

// ─── Commit ───────────────────────────────────────────────────────────

interface CommitBody {
  matches: CompanyMatch[];
  meetings: ParsedMeeting[];
}

async function handleCommit(req: NextRequest) {
  let body: CommitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { matches, meetings } = body;
  if (!matches || !meetings) {
    return NextResponse.json({ error: "matches and meetings required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Build company → entity_uid lookup from confirmed matches
  const entityMap = new Map<string, string>();
  for (const m of matches) {
    if (m.selectedEntityUid) entityMap.set(m.rawName, m.selectedEntityUid);
  }

  // Check existing external_ids to skip duplicates
  const allExternalIds = meetings.map((m) => m.externalId);
  const existing = new Set<string>();
  // Query in batches of 500 (PostgREST limit)
  for (let i = 0; i < allExternalIds.length; i += 500) {
    const batch = allExternalIds.slice(i, i + 500);
    const { data } = await supabase
      .from("meetings")
      .select("external_id")
      .in("external_id", batch);
    for (const row of data || []) {
      if (row.external_id) existing.add(row.external_id);
    }
  }

  let meetingsInserted = 0;
  let personsInserted = 0;
  let leadsInserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Dedup key_persons by (entity_uid, normalized_name)
  const personsSeen = new Set<string>();

  for (const meeting of meetings) {
    const entityUid = entityMap.get(meeting.companyName);
    if (!entityUid) { skipped++; continue; }
    if (existing.has(meeting.externalId)) { skipped++; continue; }

    // 1. Insert meeting
    try {
      const { error: mErr } = await supabase.from("meetings").insert({
        entity_uid: entityUid,
        meeting_date: meeting.date,
        meeting_type: inferMeetingType(meeting.meetingTitle),
        attendees: meeting.attendees.map((a) => a.name),
        agenda: meeting.meetingTitle,
        summary: meeting.summary,
        outcome: "neutral",
        source: "onenote_import",
        external_id: meeting.externalId,
        metadata: {
          competitor_tech: meeting.competitorTech,
          service_interest: meeting.serviceInterest,
          financial_info: meeting.financialInfo,
          import_source: "davi_onenote",
        },
        confidentiality: "agrisafe_confidential",
      });
      if (mErr) { errors.push(`meeting ${meeting.externalId}: ${mErr.message}`); continue; }
      meetingsInserted++;
    } catch (e: any) {
      errors.push(`meeting ${meeting.externalId}: ${e.message}`);
      continue;
    }

    // 2. Insert key_persons (dedup by entity+name)
    for (const attendee of meeting.attendees) {
      const key = `${entityUid}::${attendee.name.toLowerCase()}`;
      if (personsSeen.has(key)) continue;
      personsSeen.add(key);

      try {
        // Check if already exists
        const { data: existingPerson } = await supabase
          .from("key_persons")
          .select("id")
          .eq("entity_uid", entityUid)
          .ilike("full_name", attendee.name)
          .maybeSingle();

        if (!existingPerson) {
          const { error: pErr } = await supabase.from("key_persons").insert({
            entity_uid: entityUid,
            full_name: attendee.name,
            role_title: attendee.role?.slice(0, 100) || null,
            notes: attendee.role && attendee.role.length > 100 ? attendee.role : null,
            is_decision_maker: isDecisionMaker(attendee.role),
            confidentiality: "agrisafe_confidential",
          });
          if (!pErr) personsInserted++;
        }
      } catch { /* dedup race — ignore */ }
    }

    // 3. Insert lead if service interest detected (one per company, not per meeting)
    if (meeting.serviceInterest.length > 0) {
      const leadKey = `${entityUid}::lead`;
      if (!personsSeen.has(leadKey)) {
        personsSeen.add(leadKey);
        try {
          const { data: existingLead } = await supabase
            .from("leads")
            .select("id")
            .eq("entity_uid", entityUid)
            .eq("source", "onenote_import")
            .maybeSingle();

          if (!existingLead) {
            const { error: lErr } = await supabase.from("leads").insert({
              entity_uid: entityUid,
              stage: "new",
              service_interest: meeting.serviceInterest.join(", "),
              source: "onenote_import",
              notes: `Imported from Davi's OneNote notes. Services: ${meeting.serviceInterest.join(", ")}`,
              confidentiality: "agrisafe_confidential",
            });
            if (!lErr) leadsInserted++;
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Activity log
  await logActivity(supabase, {
    action: "upsert",
    target_table: "meetings",
    source: "backfill:onenote_import",
    source_kind: "manual",
    actor: "admin",
    summary: `OneNote import (Davi): ${meetingsInserted} reuniões, ${personsInserted} contatos, ${leadsInserted} leads. ${skipped} ignorados (sem match ou duplicata).`,
    metadata: { meetingsInserted, personsInserted, leadsInserted, skipped, errors: errors.length },
    confidentiality: "agrisafe_confidential",
  });

  return NextResponse.json({
    ok: true,
    inserted: { meetings: meetingsInserted, key_persons: personsInserted, leads: leadsInserted },
    skipped,
    errors: errors.slice(0, 20),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function inferMeetingType(title: string | null): string {
  if (!title) return "comercial";
  const t = title.toLowerCase();
  if (/demo|apresenta[çc]/i.test(t)) return "comercial";
  if (/treinamento|training/i.test(t)) return "tecnica";
  if (/alinhamento|planning|planejamento/i.test(t)) return "outro";
  if (/follow|acompanhamento/i.test(t)) return "followup";
  if (/contrato|proposta/i.test(t)) return "contrato";
  if (/prospec/i.test(t)) return "prospeccao";
  return "comercial";
}

function isDecisionMaker(role: string | null): boolean {
  if (!role) return false;
  return /diretor|sócio|socio|ceo|presidente|gerente\s*geral|owner|fundador/i.test(role);
}
