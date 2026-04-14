import { parseOneNoteDocx } from "../lib/onenote-parser";

async function main() {
  console.log("Parsing docx...");
  const r = await parseOneNoteDocx("local files/26-0209 onenote Davi.docx");

  console.log("\n=== STATS ===");
  console.log(JSON.stringify(r.stats, null, 2));

  console.log("\n=== FIRST 5 MEETINGS ===");
  for (const m of r.meetings.slice(0, 5)) {
    console.log("---");
    console.log(`Date: ${m.date} | Company: ${m.companyName}`);
    console.log(`Title: ${m.meetingTitle}`);
    console.log(`Attendees: ${JSON.stringify(m.attendees)}`);
    console.log(`Competitors: ${m.competitorTech.join(", ") || "(none)"}`);
    console.log(`Services: ${m.serviceInterest.join(", ") || "(none)"}`);
    console.log(`Financial: ${m.financialInfo.join(", ") || "(none)"}`);
    console.log(`Summary (150ch): ${m.summary.slice(0, 150)}`);
  }

  // Competitor tech summary
  const withCompetitors = r.meetings.filter((m) => m.competitorTech.length > 0);
  console.log(`\n=== COMPETITOR TECH (${withCompetitors.length} meetings) ===`);
  for (const m of withCompetitors.slice(0, 10)) {
    console.log(`  ${m.date} ${m.companyName}: ${m.competitorTech.join(", ")}`);
  }

  // Person extraction sample
  const withPersons = r.meetings.filter((m) => m.attendees.length > 0);
  console.log(`\n=== PERSONS (${withPersons.length} meetings have attendees) ===`);
  for (const m of withPersons.slice(0, 10)) {
    console.log(`  ${m.companyName}: ${m.attendees.map((a) => `${a.name}${a.role ? " (" + a.role + ")" : ""}`).join(", ")}`);
  }
}

main().catch(console.error);
