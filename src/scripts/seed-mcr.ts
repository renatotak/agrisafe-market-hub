/**
 * Phase 7b — Seed MCR (Manual de Crédito Rural) from PDF.
 *
 * Reads the BCB MCR PDF, splits by section (MCR X-Y), and writes:
 *   1. regulatory_norms — one row per section (agency=BCB, tag=MCR)
 *   2. knowledge_items — one row per section for Oracle RAG
 *
 * Usage:
 *   npx tsx --env-file=.env.local src/scripts/seed-mcr.ts [--dry-run] [--limit N]
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "../lib/activity-log";
import * as fs from "fs";
import * as path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

const PDF_PATH = path.resolve(__dirname, "../../local files/26-0416 MCR completo.pdf");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ─── MCR chapter titles (from the TOC) ──────────────────────────────────────

const CHAPTER_TITLES: Record<number, string> = {
  1: "Disposições Preliminares",
  2: "Condições Básicas",
  3: "Operações",
  4: "Finalidades e Instrumentos Especiais de Política Agrícola",
  5: "Créditos a Cooperativas de Produção Agropecuária",
  6: "Recursos",
  7: "Encargos Financeiros e Limites de Crédito",
  8: "Pronamp",
  9: "Funcafé",
  10: "Pronaf",
  11: "InvestAgro",
  12: "Proagro",
};

// ─── Section parser ──────────────────────────────────────────────────────────

interface McrSection {
  chapter: number;
  section: number;
  mcr_ref: string;        // "MCR 2-1"
  title: string;
  content: string;
  char_count: number;
}

function parseSections(text: string): McrSection[] {
  const lines = text.split("\n");
  const sections: McrSection[] = [];

  // The MCR PDF uses "SEÇÃO : Title - N" as section headers (observed in body)
  // and "Capítulo X (...)" in the TOC. Content starts after ~line 900.
  // Strategy: detect "SEÇÃO : Title - N" boundaries and group content between them.

  let currentChapter = 0;
  let currentSection = 0;
  let currentTitle = "";
  let currentContent: string[] = [];
  let foundFirst = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip page headers/footers
    if (/^Página\s+\d+\s+de\s+\d+/.test(line)) continue;
    if (/^MANUAL DE CRÉDITO RURAL \(MCR\)\s*\d*$/.test(line)) continue;
    if (/^_{10,}/.test(line)) continue;

    // Primary pattern: "SEÇÃO : Title - N" or "SEÇÃO : Title - N-A"
    const secMatch = line.match(/^SE[ÇC][AÃ]O\s*:\s*(.+?)\s*[-–]\s*(\d+(?:-[A-Z])?)(?:\s*\(\*\))?$/i);

    if (secMatch) {
      // Save previous section
      if (foundFirst && currentContent.length > 0) {
        const content = currentContent.join("\n").trim();
        if (content.length > 100) {
          sections.push({
            chapter: currentChapter,
            section: currentSection,
            mcr_ref: `MCR ${currentChapter}-${currentSection}`,
            title: currentTitle,
            content,
            char_count: content.length,
          });
        }
      }

      const sectionNum = secMatch[2];
      currentSection = parseInt(sectionNum);
      currentTitle = secMatch[1].trim();
      currentContent = [];
      foundFirst = true;

      // Infer chapter from section title / preceding context
      // The chapter changes are detectable from the title keywords
      const titleUpper = currentTitle.toUpperCase();
      if (titleUpper.includes("AUTORIZAÇÃO PARA OPERAR") || titleUpper.includes("ESTRUTURA OPERATIVA")) currentChapter = 1;
      else if (titleUpper.includes("BENEFICIÁRIOS") && currentChapter <= 1) currentChapter = 1;
      else if (titleUpper.includes("ASSISTÊNCIA TÉCNICA")) currentChapter = 1;
      else if (titleUpper.includes("DISPOSIÇÕES GERAIS") && currentSection === 1 && currentChapter < 2) currentChapter = 2;
      else if (titleUpper.includes("ORÇAMENTO")) currentChapter = 2;
      else if (titleUpper.includes("DESPESAS") && currentChapter <= 2) currentChapter = 2;
      else if (titleUpper.includes("METODOLOGIA") && titleUpper.includes("TCR")) currentChapter = 2;
      else if (titleUpper.includes("METODOLOGIA") && titleUpper.includes("TRFC")) currentChapter = 2;
      else if (titleUpper.includes("UTILIZAÇÃO") && currentChapter <= 2) currentChapter = 2;
      else if (titleUpper.includes("REEMBOLSO")) currentChapter = 2;
      else if (titleUpper.includes("MONITORAMENTO") || titleUpper.includes("FISCALIZAÇÃO")) currentChapter = 2;
      else if (titleUpper.includes("DESCLASSIFICAÇÃO")) currentChapter = 2;
      else if (titleUpper.includes("IMPEDIMENTOS SOCIAIS")) currentChapter = 2;
      else if (titleUpper.includes("COMPARTILHAMENTO")) currentChapter = 2;
      else if (titleUpper.includes("FORMALIZAÇÃO") && currentChapter <= 3) currentChapter = 3;
      else if (titleUpper.includes("CUSTEIO") && currentChapter <= 3) currentChapter = 3;
      else if (titleUpper.includes("INVESTIMENTO") && currentChapter <= 3) currentChapter = 3;
      else if (titleUpper.includes("COMERCIALIZAÇÃO") && currentChapter <= 3) currentChapter = 3;
      else if (titleUpper.includes("INDUSTRIALIZAÇÃO") && currentChapter <= 3) currentChapter = 3;
      else if (titleUpper.includes("CONTABILIZAÇÃO")) currentChapter = 3;
      // Continue for later chapters via section numbering patterns
      continue;
    }

    // Also detect chapter title lines like:
    // "Capítulo 7 (Encargos Financeiros e Limites de Crédito),"
    const chapMatch = line.match(/Cap[ií]tulo\s+(\d{1,2})\s*\(([^)]+)\)/i);
    if (chapMatch) {
      currentChapter = parseInt(chapMatch[1]);
      continue;
    }

    if (foundFirst) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (foundFirst && currentContent.length > 0) {
    const content = currentContent.join("\n").trim();
    if (content.length > 100) {
      sections.push({
        chapter: currentChapter,
        section: currentSection,
        mcr_ref: `MCR ${currentChapter}-${currentSection}`,
        title: currentTitle,
        content,
        char_count: content.length,
      });
    }
  }

  return sections;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function initSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  console.log("=== Seed MCR (Manual de Crédito Rural) ===");
  console.log(`Source: ${PDF_PATH}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  // 1. Parse PDF
  const pdfBuf = fs.readFileSync(PDF_PATH);
  const pdfData = await pdfParse(pdfBuf);
  console.log(`Pages: ${pdfData.numpages}`);
  console.log(`Total chars: ${pdfData.text.length}`);

  // 2. Split into sections
  const sections = parseSections(pdfData.text);
  console.log(`Sections parsed: ${sections.length}`);
  console.log();

  if (sections.length === 0) {
    console.error("No sections found — check parser logic");
    process.exit(1);
  }

  // Show breakdown
  const byChapter = new Map<number, number>();
  for (const s of sections) {
    byChapter.set(s.chapter, (byChapter.get(s.chapter) || 0) + 1);
  }
  console.log("Chapters:");
  for (const [ch, count] of [...byChapter.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Cap. ${ch} (${CHAPTER_TITLES[ch] || "?"}): ${count} sections`);
  }
  console.log();

  if (DRY_RUN) {
    console.log("Sample sections:");
    for (const s of sections.slice(0, 5)) {
      console.log(`  ${s.mcr_ref} — ${s.title} (${s.char_count} chars)`);
      console.log(`    ${s.content.slice(0, 150).replace(/\n/g, " ")}...`);
    }
    return;
  }

  const sb = initSupabase();
  const toProcess = sections.slice(0, LIMIT);
  let normsUpserted = 0;
  let knowledgeUpserted = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const s = toProcess[i];
    if (i > 0 && i % 10 === 0) {
      console.log(`  [${i}/${toProcess.length}] norms=${normsUpserted} knowledge=${knowledgeUpserted}`);
    }

    try {
      // Truncate content to 10k chars for regulatory_norms (summary field)
      const summary = s.content.length > 10000 ? s.content.slice(0, 9950) + "\n...[truncado]" : s.content;

      // 1. Insert into regulatory_norms
      const normTitle = `${s.mcr_ref} — ${s.title}`;
      // Check if already exists by title
      const { data: existingNorm } = await sb
        .from("regulatory_norms")
        .select("id")
        .eq("title", normTitle)
        .maybeSingle();

      if (!existingNorm) {
        const normId = `mcr-${s.chapter}-${s.section}-${i}`;
        const { error: insErr } = await sb
          .from("regulatory_norms")
          .insert({
            id: normId,
            title: normTitle,
            body: "BCB",
            norm_type: "manual",
            norm_number: s.mcr_ref,
            summary,
            source_url: "https://www.bcb.gov.br/estabilidadefinanceira/creditorural",
            published_at: "2026-03-31",
            impact_level: "medium",
            affected_areas: ["crédito rural"],
            affected_cnaes: [],
            confidentiality: "public",
          });
        if (insErr) {
          console.error(`  NORM ERR ${s.mcr_ref}: ${insErr.message}`);
          errors++;
          continue;
        }
      }
      normsUpserted++;

      // 2. Insert into knowledge_items (for Oracle RAG)
      const kbTitle = `${s.mcr_ref} — ${s.title}`;
      const chunk = s.content.slice(0, 8000);

      const { data: existingKb } = await sb
        .from("knowledge_items")
        .select("id")
        .eq("title", kbTitle)
        .maybeSingle();

      if (!existingKb) {
        const { error: kbInsErr } = await sb
          .from("knowledge_items")
          .insert({
            title: kbTitle,
            content: chunk,
            summary: chunk.slice(0, 500),
            source_type: "regulatory",
            source_url: "https://www.bcb.gov.br/estabilidadefinanceira/creditorural",
            data_origin: "bcb_mcr",
            tier: 1,
            category: "regulatory",
            tags: ["MCR", `Cap.${s.chapter}`, s.mcr_ref, "crédito rural"],
            keywords: ["MCR", "crédito rural", "BACEN", s.mcr_ref],
            confidentiality: "public",
          });
        if (kbInsErr) {
          console.error(`  KB ERR ${s.mcr_ref}: ${kbInsErr.message}`);
        }
      }
      knowledgeUpserted++;
    } catch (e: any) {
      console.error(`  ERR ${s.mcr_ref}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Sections processed: ${toProcess.length}`);
  console.log(`  regulatory_norms upserted: ${normsUpserted}`);
  console.log(`  knowledge_items upserted: ${knowledgeUpserted}`);
  console.log(`  Errors: ${errors}`);

  await logActivity(sb, {
    action: "upsert",
    source: "seed-mcr",
    source_kind: "backfill",
    target_table: "regulatory_norms",
    summary: `MCR seed: ${normsUpserted} norms + ${knowledgeUpserted} knowledge items from ${pdfData.numpages}-page PDF`,
    metadata: { sections: toProcess.length, norms: normsUpserted, knowledge: knowledgeUpserted, errors },
  });

  console.log("  Activity logged.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
