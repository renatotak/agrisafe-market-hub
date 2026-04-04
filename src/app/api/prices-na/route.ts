import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const revalidate = 600; // cache 10 min

export interface NACommodityPrice {
  commodity: string;
  slug: string;
  unit: string;
  headers: string[];
  items: { label: string; price: string; extra?: string; variation: string; direction: "up" | "down" | "stable" }[];
}

const SLUG_MAP: Record<string, { slug: string; en: string }> = {
  "Algodão": { slug: "algodao", en: "Cotton" },
  "Arroz": { slug: "arroz", en: "Rice" },
  "Boi Gordo": { slug: "boi-gordo", en: "Cattle" },
  "Cacau": { slug: "cacau", en: "Cocoa" },
  "Café": { slug: "cafe", en: "Coffee" },
  "Feijão": { slug: "feijao", en: "Beans" },
  "Frango": { slug: "frango", en: "Chicken" },
  "Leite": { slug: "leite", en: "Milk" },
  "Milho": { slug: "milho", en: "Corn" },
  "Soja": { slug: "soja", en: "Soybean" },
  "Suínos": { slug: "suinos", en: "Pork" },
  "Trigo": { slug: "trigo", en: "Wheat" },
  "Açúcar": { slug: "acucar", en: "Sugar" },
  "Etanol": { slug: "etanol", en: "Ethanol" },
  "Suco de Laranja": { slug: "suco-de-laranja", en: "Orange Juice" },
  "Amendoim": { slug: "amendoim", en: "Peanut" },
  "Ovos": { slug: "ovos", en: "Eggs" },
  "Látex": { slug: "latex", en: "Rubber" },
  "Sorgo": { slug: "sorgo", en: "Sorghum" },
};

function parseDirection(text: string): "up" | "down" | "stable" {
  const cleaned = text.replace(/[^0-9.,+\-]/g, "").trim();
  if (cleaned.startsWith("+")) return "up";
  if (cleaned.startsWith("-")) return "down";
  const num = parseFloat(cleaned.replace(",", "."));
  if (num > 0) return "up";
  if (num < 0) return "down";
  return "stable";
}

export async function GET() {
  try {
    const res = await fetch("https://www.noticiasagricolas.com.br/cotacoes/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      next: { revalidate: 600 },
    });

    if (!res.ok) throw new Error(`NA returned ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: NACommodityPrice[] = [];

    // DOM structure: div.cotacao > div.info > h3 (commodity name)
    //               div.cotacao > div.table-content > table.cot-fisicas > tr > td
    $("div.cotacao").each((_i, section) => {
      const headerText = $(section).find(".info h3").text().trim();

      const matched = Object.keys(SLUG_MAP).find(
        (name) => headerText.toLowerCase() === name.toLowerCase()
      );
      if (!matched) return;
      if (results.find((r) => r.slug === SLUG_MAP[matched].slug)) return;

      // Extract full header row
      const headerRow = $(section).find("table.cot-fisicas th");
      const headers: string[] = [];
      headerRow.each((_j, th) => { headers.push($(th).text().trim()); });
      // Unit from price column header, e.g. "Preço (R$/sc 50 kg)"
      const priceHeader = headers[1] || "";
      const unitMatch = priceHeader.match(/\(([^)]+)\)/);
      const unit = unitMatch ? unitMatch[1] : "";

      const items: NACommodityPrice["items"] = [];
      $(section).find("table.cot-fisicas tr").each((_j, tr) => {
        const tds = $(tr).find("td");
        if (tds.length < 2) return;

        const label = $(tds[0]).text().trim();
        const price = $(tds[1]).text().trim();
        if (!label || !price || price === "***" || price === "s/ cotação") return;
        // Skip footer rows like "Dólar: 5,16"
        if (label.toLowerCase().startsWith("dólar") || label.toLowerCase().startsWith("referência")) return;

        // Extra column (e.g. R$/@ for Algodão which has ¢/lb + R$/@)
        const extra = tds.length >= 4 ? $(tds[2]).text().trim() : undefined;
        // Variation is always the last column
        const variation = $(tds[tds.length - 1]).text().trim();
        const var_ = variation !== price && variation !== extra ? variation : "";

        items.push({ label, price, extra: extra || undefined, variation: var_, direction: parseDirection(var_) });
      });

      if (items.length > 0) {
        results.push({
          commodity: matched,
          slug: SLUG_MAP[matched].slug,
          unit,
          headers,
          items, // all rows — no cap
        });
      }
    });

    return NextResponse.json({
      success: true,
      updated_at: new Date().toISOString(),
      count: results.length,
      data: results,
    });
  } catch (error: any) {
    console.error("Error fetching NA prices:", error);
    return NextResponse.json({ success: false, error: error.message, data: [] }, { status: 502 });
  }
}
