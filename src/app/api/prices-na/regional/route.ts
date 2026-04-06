import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const revalidate = 600; // cache 10 min

/**
 * Scrapes per-city commodity prices from Notícias Agrícolas.
 * Returns prices with city/UF parsed and geocoded where possible.
 *
 * Usage: GET /api/prices-na/regional?commodity=soja
 *        GET /api/prices-na/regional?commodity=milho
 */

// Maps commodity slug to the NA regional price page path
// Verified 2026-04-06: NA changed many URLs, some commodities now under different paths
const COMMODITY_PAGES: Record<string, { path: string; unit: string; name: string }> = {
  soja:       { path: "/cotacoes/soja/soja-mercado-fisico-sindicatos-e-cooperativas",     unit: "R$/Sc 60kg", name: "Soja" },
  milho:      { path: "/cotacoes/milho/milho-mercado-fisico-sindicatos-e-cooperativas",   unit: "R$/Sc 60kg", name: "Milho" },
  cafe:       { path: "/cotacoes/cafe/cafe-arabica-mercado-fisico-tipo-6-7",              unit: "R$/Sc 60kg", name: "Café Arábica" },
  "boi-gordo":{ path: "/cotacoes/boi-gordo/boi-gordo-scot-consultoria",                   unit: "R$/@",       name: "Boi Gordo" },
  algodao:    { path: "/cotacoes/algodao/algodao-imea",                                   unit: "R$/@",       name: "Algodão IMEA" },
  trigo:      { path: "/cotacoes/trigo/trigo-mercado-fisico",                             unit: "R$/Sc 60kg", name: "Trigo" },
};

// Brazilian city coordinates for the most common praças
const PRACA_COORDS: Record<string, { lat: number; lng: number }> = {
  "Não-Me-Toque": { lat: -28.460, lng: -52.793 },
  "Nonoai": { lat: -27.365, lng: -52.772 },
  "Ubiratã": { lat: -24.545, lng: -52.990 },
  "Castro": { lat: -24.790, lng: -50.012 },
  "Ponta Grossa": { lat: -25.095, lng: -50.162 },
  "Marechal Cândido Rondon": { lat: -24.556, lng: -54.056 },
  "Pato Branco": { lat: -26.229, lng: -52.671 },
  "Palma Sola": { lat: -26.345, lng: -53.274 },
  "Rio do Sul": { lat: -27.214, lng: -49.643 },
  "Rondonópolis": { lat: -16.469, lng: -54.636 },
  "Primavera do Leste": { lat: -15.560, lng: -54.297 },
  "Alto Garças": { lat: -16.946, lng: -53.527 },
  "Itiquira": { lat: -17.214, lng: -54.144 },
  "Tangará da Serra": { lat: -14.623, lng: -57.490 },
  "Campo Novo do Parecis": { lat: -13.674, lng: -57.890 },
  "Sorriso": { lat: -12.545, lng: -55.726 },
  "São Gabriel do Oeste": { lat: -19.392, lng: -54.566 },
  "Dourados": { lat: -22.221, lng: -54.805 },
  "Maracaju": { lat: -21.612, lng: -55.167 },
  "Sidrolândia": { lat: -20.930, lng: -54.961 },
  "Chapadão do Sul": { lat: -18.790, lng: -52.620 },
  "Campo Grande": { lat: -20.449, lng: -54.620 },
  "Cascavel": { lat: -24.957, lng: -53.459 },
  "Londrina": { lat: -23.304, lng: -51.169 },
  "Maringá": { lat: -23.420, lng: -51.933 },
  "Passo Fundo": { lat: -28.261, lng: -52.408 },
  "Cruz Alta": { lat: -28.639, lng: -53.606 },
  "Ijuí": { lat: -28.388, lng: -53.915 },
  "Santa Rosa": { lat: -27.871, lng: -54.481 },
  "Barreiras": { lat: -12.144, lng: -44.997 },
  "Luis Eduardo Magalhães": { lat: -12.096, lng: -45.795 },
  "Luís Eduardo Magalhães": { lat: -12.096, lng: -45.795 },
  "Rio Verde": { lat: -17.785, lng: -50.919 },
  "Jataí": { lat: -17.882, lng: -51.719 },
  "Catalão": { lat: -18.170, lng: -47.944 },
  "Uberlândia": { lat: -18.919, lng: -48.277 },
  "Patos de Minas": { lat: -18.579, lng: -46.518 },
  "Uberaba": { lat: -19.749, lng: -47.932 },
  "Lucas do Rio Verde": { lat: -13.050, lng: -55.910 },
  "Sinop": { lat: -11.864, lng: -55.505 },
  "Cuiabá": { lat: -15.598, lng: -56.094 },
  "Sapezal": { lat: -13.535, lng: -58.812 },
  "Nova Mutum": { lat: -13.831, lng: -56.080 },
  "Querência": { lat: -12.594, lng: -52.179 },
  "Canarana": { lat: -13.549, lng: -52.270 },
  "Balsas": { lat: -7.532, lng: -46.035 },
  "Uruçuí": { lat: -7.228, lng: -44.557 },
  "Paranaguá": { lat: -25.520, lng: -48.509 },
  "Santos": { lat: -23.961, lng: -46.334 },
  "Rio Grande": { lat: -32.035, lng: -52.099 },
  "Chapecó": { lat: -27.101, lng: -52.615 },
  "Ribeirão Preto": { lat: -21.170, lng: -47.810 },
  "Campinas": { lat: -22.906, lng: -47.061 },
  "Presidente Prudente": { lat: -22.126, lng: -51.388 },
  "Araçatuba": { lat: -21.209, lng: -50.433 },
  "Goiânia": { lat: -16.686, lng: -49.264 },
  "Brasília": { lat: -15.780, lng: -47.929 },
  // ─── Boi Gordo regions (Scot Consultoria) ───
  "Barretos": { lat: -20.557, lng: -48.567 },
  "Triângulo": { lat: -19.749, lng: -47.932 }, // Uberaba / Triângulo Mineiro
  "B.Horizonte": { lat: -19.917, lng: -43.934 },
  "Belo Horizonte": { lat: -19.917, lng: -43.934 },
  "Três Lagoas": { lat: -20.751, lng: -51.679 },
  "C. Grande": { lat: -20.449, lng: -54.620 }, // Campo Grande
  "Reg. Sul": { lat: -17.785, lng: -50.919 },  // Rio Verde GO
  "Oeste": { lat: -28.639, lng: -53.606 },     // Cruz Alta RS (default oeste)
  "Pelotas": { lat: -31.769, lng: -52.342 },
  "Sul": { lat: -14.866, lng: -40.844 },       // Vitória da Conquista (default sul BA)
  "Norte": { lat: -16.731, lng: -43.864 },     // Montes Claros MG (default norte)
  "Vitória da Conquista": { lat: -14.866, lng: -40.844 },
  "Montes Claros": { lat: -16.731, lng: -43.864 },
  "Bauru": { lat: -22.318, lng: -49.066 },
  "Marília": { lat: -22.214, lng: -49.946 },
};

// UF capital fallback
const UF_FALLBACK: Record<string, { lat: number; lng: number }> = {
  RS: { lat: -30.03, lng: -51.23 }, PR: { lat: -25.43, lng: -49.27 },
  SC: { lat: -27.60, lng: -48.55 }, MT: { lat: -15.60, lng: -56.09 },
  MS: { lat: -20.45, lng: -54.62 }, GO: { lat: -16.69, lng: -49.26 },
  MG: { lat: -19.92, lng: -43.94 }, SP: { lat: -23.55, lng: -46.63 },
  BA: { lat: -12.97, lng: -38.51 }, MA: { lat: -2.53, lng: -44.28 },
  PI: { lat: -5.09, lng: -42.80 }, TO: { lat: -10.18, lng: -48.33 },
  PA: { lat: -1.46, lng: -48.50 }, RO: { lat: -8.76, lng: -63.90 },
};

interface RegionalPrice {
  praca: string;          // full label: "Não-Me-Toque/RS (Cotrijal)"
  city: string;           // "Não-Me-Toque"
  uf: string;             // "RS"
  cooperative: string;    // "Cotrijal"
  price: number | null;   // 120.00
  price_label: string;    // "120,00" or "s/ cotação"
  variation: number | null;
  variation_label: string;
  direction: "up" | "down" | "stable";
  lat: number | null;
  lng: number | null;
}

function parsePraca(raw: string): { city: string; uf: string; cooperative: string } {
  // "Não-Me-Toque/RS (Cotrijal)" → city, uf, cooperative
  const coopMatch = raw.match(/\(([^)]+)\)/);
  const cooperative = coopMatch ? coopMatch[1].trim() : "";
  const withoutCoop = raw.replace(/\([^)]*\)/, "").trim();
  const slashParts = withoutCoop.split("/");
  const city = slashParts[0].trim();
  const uf = (slashParts[1] || "").trim().toUpperCase();
  return { city, uf, cooperative };
}

/** Parse Scot Consultoria format used by boi-gordo: "UF Cidade" or "UF Cidade (kg)" */
function parsePracaScot(raw: string): { city: string; uf: string; cooperative: string } {
  const cleaned = raw.replace(/\s*\(kg\)\s*/i, "").trim();
  const ufMatch = cleaned.match(/^([A-Z]{2})\s+(.+)$/);
  if (ufMatch) {
    return { city: ufMatch[2].trim(), uf: ufMatch[1], cooperative: "Scot" };
  }
  return { city: cleaned, uf: "", cooperative: "Scot" };
}

function geocodePraca(city: string, uf: string): { lat: number; lng: number } | null {
  // Try exact city match
  if (PRACA_COORDS[city]) return PRACA_COORDS[city];
  // Try partial match
  const match = Object.keys(PRACA_COORDS).find(k => k.toLowerCase() === city.toLowerCase());
  if (match) return PRACA_COORDS[match];
  // Try "City - Base" pattern: "Castro (Base - Ponta Grossa/PR)"
  const baseParts = city.split(" - ");
  if (baseParts.length > 1) {
    const base = baseParts[baseParts.length - 1].trim().replace(/\/[A-Z]{2}$/, "");
    if (PRACA_COORDS[base]) return PRACA_COORDS[base];
  }
  // Fallback to UF capital
  if (uf && UF_FALLBACK[uf]) return UF_FALLBACK[uf];
  return null;
}

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[^\d,.-]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseVariation(text: string): { value: number | null; direction: "up" | "down" | "stable" } {
  const cleaned = text.replace(/[^\d,.\-+]/g, "").replace(",", ".").trim();
  if (!cleaned) return { value: null, direction: "stable" };
  const num = parseFloat(cleaned);
  if (isNaN(num)) return { value: null, direction: "stable" };
  return { value: num, direction: num > 0 ? "up" : num < 0 ? "down" : "stable" };
}

export async function GET(req: NextRequest) {
  const commodity = req.nextUrl.searchParams.get("commodity") || "soja";
  const config = COMMODITY_PAGES[commodity];
  if (!config) {
    return NextResponse.json({
      error: `Commodity "${commodity}" not supported. Available: ${Object.keys(COMMODITY_PAGES).join(", ")}`,
    }, { status: 400 });
  }

  try {
    const url = `https://www.noticiasagricolas.com.br${config.path}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) return NextResponse.json({ error: `NA returned ${res.status}` }, { status: 502 });

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract closing date
    const dateText = $("th:contains('Fechamento')").text().trim();
    const dateMatch = dateText.match(/(\d{2}\/\d{2}\/\d{4})/);
    const closingDate = dateMatch ? dateMatch[1] : null;

    // Extract unit from header
    const headerText = $("table thead tr th").eq(1).text().trim();

    const prices: RegionalPrice[] = [];
    $("table tbody tr").each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 3) return;

      const praca = tds.eq(0).text().trim();
      const priceLabel = tds.eq(1).text().trim();
      const varLabel = tds.eq(2).text().trim();

      if (!praca) return;

      const { city, uf, cooperative } = commodity === "boi-gordo"
        ? parsePracaScot(praca)
        : parsePraca(praca);
      const price = parsePrice(priceLabel);
      const { value: variation, direction } = parseVariation(varLabel);
      const coords = geocodePraca(city, uf);

      prices.push({
        praca,
        city,
        uf,
        cooperative,
        price,
        price_label: priceLabel,
        variation,
        variation_label: varLabel,
        direction,
        lat: coords?.lat || null,
        lng: coords?.lng || null,
      });
    });

    return NextResponse.json({
      success: true,
      commodity: config.name,
      slug: commodity,
      unit: headerText || config.unit,
      closing_date: closingDate,
      total: prices.length,
      geocoded: prices.filter(p => p.lat !== null).length,
      data: prices,
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Scrape failed: ${err.message?.slice(0, 200)}` }, { status: 502 });
  }
}
