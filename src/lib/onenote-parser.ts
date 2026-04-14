/**
 * OneNote DOCX meeting notes parser.
 *
 * Parses the exported OneNote document into structured meeting entries.
 * Pure algorithmic — no LLM calls. Uses mammoth for DOCX-to-text, then
 * regex-based extraction for dates, attendees, competitor tech, etc.
 */

import mammoth from "mammoth";
import { createHash } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────

export interface ParsedAttendee {
  name: string;
  role: string | null;
}

export interface ParsedMeeting {
  rawLine: string;
  date: string; // YYYY-MM-DD
  companyName: string;
  meetingTitle: string | null;
  attendees: ParsedAttendee[];
  summary: string;
  competitorTech: string[];
  serviceInterest: string[];
  financialInfo: string[];
  externalId: string;
}

export interface ParseResult {
  meetings: ParsedMeeting[];
  uniqueCompanies: string[];
  stats: {
    totalMeetings: number;
    dateRange: [string, string];
    uniqueCompanies: number;
    uniquePersons: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────

const HEADER_RE = /^(\d{2})-(\d{2})(\d{2})\s+(.+)$/;

const COMPETITOR_KEYWORDS = [
  "serasa", "serasa experian", "datarken", "datarking", "agrisk", "ag risk",
  "neoway", "bigdata corp", "boa vista", "scr", "spc", "quod",
  "creditas", "credit safe",
];

const SERVICE_KEYWORDS: Record<string, string> = {
  "análise de crédito": "credit_intelligence",
  "analise de credito": "credit_intelligence",
  "análise de pf": "credit_intelligence",
  "análise de pj": "credit_intelligence",
  "monitoramento": "monitoring",
  "monitor": "monitoring",
  "cobrança": "collection",
  "cobranca": "collection",
  "inadimplência": "credit_intelligence",
  "inadimplencia": "credit_intelligence",
  "plataforma": "market_hub_access",
  "cpr": "credit_intelligence",
  "capital social": "credit_intelligence",
  "demonstrativo": "credit_intelligence",
};

const BRL_RE = /R\$\s*[\d.,]+(?:\s*(?:mil|milh[õo]es|milh|bi(?:lh[õo]es)?|mi\b))?/gi;

// Person pattern: "Name - role/context" at the start of a line
// Name must start with uppercase letter
const PERSON_RE = /^([A-ZÀ-Ú][a-zà-ú]+(?:\s[A-ZÀ-Ú][a-zà-ú]+){0,4})\s*[-–—]\s*(.+)$/;

// Also catch "Falamos com Name" / "Diretor chama Name" patterns
const MENTION_RE = /(?:falamos com|conversamos com|diretor\w*\s+(?:chama|é)\s+|sócio\w*\s+(?:chama|é)\s+)([A-ZÀ-Ú][a-zà-ú]+(?:\s[A-ZÀ-Ú][a-zà-ú]+){0,3})/i;

// ─── Helpers ──────────────────────────────────────────────────────────

function parseDate(yy: string, mm: string, dd: string): string {
  const year = parseInt(yy, 10) + 2000;
  return `${year}-${mm}-${dd}`;
}

function makeExternalId(dateCode: string, companyName: string): string {
  const hash = createHash("sha256")
    .update(companyName.toLowerCase().trim())
    .digest("hex")
    .slice(0, 12);
  return `onenote_davi_${dateCode}_${hash}`;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractCompetitorTech(text: string): string[] {
  const lower = normalize(text);
  const found = new Set<string>();
  for (const kw of COMPETITOR_KEYWORDS) {
    if (lower.includes(kw)) found.add(kw);
  }
  return [...found];
}

function extractServiceInterests(text: string): string[] {
  const lower = normalize(text);
  const found = new Set<string>();
  for (const [pattern, service] of Object.entries(SERVICE_KEYWORDS)) {
    if (lower.includes(pattern)) found.add(service);
  }
  return [...found];
}

function extractFinancialInfo(text: string): string[] {
  return [...text.matchAll(BRL_RE)].map((m) => m[0].trim());
}

function extractAttendees(lines: string[]): ParsedAttendee[] {
  const attendees: ParsedAttendee[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Pattern 1: "Name - Role"
    const pm = trimmed.match(PERSON_RE);
    if (pm) {
      const name = pm[1].trim();
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        attendees.push({ name, role: pm[2].trim() });
      }
      continue;
    }

    // Pattern 2: "Falamos com Name" / "Diretor chama Name"
    const mm = trimmed.match(MENTION_RE);
    if (mm) {
      const name = mm[1].trim();
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        attendees.push({ name, role: null });
      }
    }
  }

  return attendees;
}

// ─── Main Parser ──────────────────────────────────────────────────────

export async function parseOneNoteDocx(filePath: string): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ path: filePath });
  const allLines = result.value.split("\n");

  // Split into meeting blocks by header pattern
  const blocks: { headerIdx: number; header: string; yy: string; mm: string; dd: string; company: string }[] = [];
  for (let i = 0; i < allLines.length; i++) {
    const m = allLines[i].trim().match(HEADER_RE);
    if (m) {
      blocks.push({
        headerIdx: i,
        header: allLines[i].trim(),
        yy: m[1],
        mm: m[2],
        dd: m[3],
        company: m[4].trim(),
      });
    }
  }

  const meetings: ParsedMeeting[] = [];
  const allPersons = new Set<string>();

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    const startLine = block.headerIdx + 1;
    const endLine = b + 1 < blocks.length ? blocks[b + 1].headerIdx : allLines.length;
    const contentLines = allLines.slice(startLine, endLine).filter((l) => l.trim().length > 0);

    // Skip the date line (e.g. "quinta-feira, 2 de março de 2023") and time line (e.g. "10:02")
    let bodyStart = 0;
    for (let i = 0; i < Math.min(contentLines.length, 4); i++) {
      const t = contentLines[i].trim();
      if (/^\d{1,2}:\d{2}$/.test(t) || /^(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i.test(t) || /^\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i.test(t)) {
        bodyStart = i + 1;
      }
    }

    const bodyLines = contentLines.slice(bodyStart);

    // Meeting title: first non-empty body line (if it looks like a title)
    let meetingTitle: string | null = null;
    let summaryLines = bodyLines;
    if (bodyLines.length > 0) {
      const firstLine = bodyLines[0].trim();
      if (firstLine.length < 120 && /^[A-ZÀ-Úa-zà-ú]/.test(firstLine)) {
        meetingTitle = firstLine;
        summaryLines = bodyLines.slice(1);
      }
    }

    const summary = summaryLines.map((l) => l.trim()).filter(Boolean).join("\n");
    const fullText = bodyLines.join(" ");
    const attendees = extractAttendees(bodyLines);
    for (const a of attendees) allPersons.add(a.name.toLowerCase());

    const dateCode = `${block.yy}${block.mm}${block.dd}`;

    meetings.push({
      rawLine: block.header,
      date: parseDate(block.yy, block.mm, block.dd),
      companyName: block.company,
      meetingTitle,
      attendees,
      summary,
      competitorTech: extractCompetitorTech(fullText),
      serviceInterest: extractServiceInterests(fullText),
      financialInfo: extractFinancialInfo(fullText),
      externalId: makeExternalId(dateCode, block.company),
    });
  }

  const uniqueCompanies = [...new Set(meetings.map((m) => m.companyName))];
  const dates = meetings.map((m) => m.date).sort();

  return {
    meetings,
    uniqueCompanies,
    stats: {
      totalMeetings: meetings.length,
      dateRange: [dates[0] || "", dates[dates.length - 1] || ""],
      uniqueCompanies: uniqueCompanies.length,
      uniquePersons: allPersons.size,
    },
  };
}
