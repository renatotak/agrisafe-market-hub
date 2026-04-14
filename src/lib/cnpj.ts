/**
 * Shared CNPJ helpers.
 *
 * `cnpj_raiz` / `tax_id` (8 digits) identifies a legal_entity;
 * the full 14-digit CNPJ is raiz + ordem (4) + DV (2). Matriz is
 * always ordem "0001".
 */

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function computeCnpjDv(base12: string): string {
  const d = base12.split("").map(Number);
  const s1 = d.reduce((s, v, i) => s + v * W1[i], 0);
  const d1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);
  d.push(d1);
  const s2 = d.reduce((s, v, i) => s + v * W2[i], 0);
  const d2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);
  return `${d1}${d2}`;
}

/** Build the 14-digit matriz CNPJ from the 8-digit cnpj_raiz/tax_id. */
export function buildMatrizCnpj(cnpjRaiz: string | null | undefined): string {
  if (!cnpjRaiz) return "";
  const base12 = String(cnpjRaiz).replace(/\D/g, "").padStart(8, "0").slice(0, 8) + "0001";
  return base12 + computeCnpjDv(base12);
}

/** Format a CNPJ (any length) into XX.XXX.XXX/YYYY-ZZ shape. */
export function formatCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  const clean = String(cnpj).replace(/\D/g, "");
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (clean.length === 8) {
    // Show as XX.XXX.XXX for display consistency
    return clean.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3");
  }
  return clean;
}

/** External public CNPJ lookup URL — useful for "open in new tab". */
export function cnpjPublicUrl(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const clean = String(cnpj).replace(/\D/g, "");
  if (clean.length < 8) return null;
  const full = clean.length === 14 ? clean : buildMatrizCnpj(clean.slice(0, 8));
  return `https://cnpj.biz/${full}`;
}
