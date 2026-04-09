/**
 * Phase 24G2 — Deterministic CNAE classifier for regulatory norms.
 *
 * Input: a regulatory_norms-shaped object (title + summary + areas).
 * Output: an array of 7-digit CNAE codes the norm affects.
 *
 * Classification is pure regex over the title and summary, with the
 * `affected_areas` array as a strong prior signal. No LLM (Guardrail
 * #1). The mapping below covers the agribusiness CNAE subset that
 * matches the AgriSafe taxonomy in /api/cron/sync-cvm-agro/route.ts
 * and src/lib/extract-norms-from-news.ts.
 *
 * The codes follow IBGE CNAE 2.3 — same convention used everywhere
 * else in the database (`retailers.cnae_*`, `industries` metadata,
 * `legal_entities.metadata.cnae_fiscal`).
 *
 * Usage:
 *   import { classifyCnaes } from "@/lib/cnae-classifier"
 *   const cnaes = classifyCnaes({
 *     title: "...",
 *     summary: "...",
 *     affected_areas: ["fiagro", "credito_rural"],
 *   })
 *   // → ["6491300", "6499900", "0149999"]
 */

export interface NormClassifierInput {
  title?: string | null
  summary?: string | null
  affected_areas?: string[] | null
}

// ─── CNAE registry ─────────────────────────────────────────────────────────
//
// Each entry maps a regex over (title + summary + areas) to one or more
// CNAE codes. Multiple entries can fire — the result is the deduped union.

interface CnaeRule {
  match: RegExp
  cnaes: string[]
  why: string // documented for self-explanation
}

const RULES: CnaeRule[] = [
  // ── Fund-side / financial intermediation ───────────────────────────
  {
    match: /\bfiagro\b|fundo de investimento.{0,80}agro/i,
    cnaes: ['6630400', '6491300'], // Atividades de fundos de investimento + Sociedades de crédito
    why: 'FIAGRO',
  },
  {
    match: /\bcra\b|certificad[oa]s? de receb[íi]vel.{0,40}agro|certificad[oa]s? de receb[íi]vel.{0,40}imobil/i,
    cnaes: ['6499999', '6630400'],
    why: 'CRA — securitização',
  },
  {
    match: /\blca\b|letra de cr[ée]dito do agroneg[óo]cio/i,
    cnaes: ['6422100', '6491300'],
    why: 'LCA — cooperativa de crédito + bancos',
  },
  {
    match: /\bcpr\b|c[ée]dula de produto rural/i,
    cnaes: ['6491300', '6499999', '0149999'],
    why: 'CPR — bancos + securitizadoras + produtor rural',
  },

  // ── Crédito rural ─────────────────────────────────────────────────
  {
    match: /cr[ée]dito rural|financiamento agr[íi]col|sicor|proagro/i,
    cnaes: ['6422100', '6491300', '6411800'],
    why: 'Crédito rural — coop crédito + bancos múltiplos + bancos comerciais',
  },

  // ── Insumos: defensivos / fertilizantes / sementes ────────────────
  {
    match: /defensivo|agrot[óo]xic|herbicida|fungicida|insumo agr[íi]col/i,
    cnaes: ['2051700', '4683400'],
    why: 'Defensivos — fabricação + atacado',
  },
  {
    match: /fertilizant|adubo|corretivo do solo/i,
    cnaes: ['2013400', '4683400'],
    why: 'Fertilizantes — fabricação + atacado',
  },
  {
    match: /sement[se]\s+(?:fiscaliz|registro|comerciali|certifi)/i,
    cnaes: ['4623108', '0149999'],
    why: 'Sementes — comércio + produção',
  },

  // ── Comercial atacado / distribuição ──────────────────────────────
  {
    match: /(?:revenda|distribuidor)\s+(?:de\s+)?insumos?\s+agr[íi]col|atacado.{0,40}agropecu/i,
    cnaes: ['4683400', '4623199'],
    why: 'Revenda de insumos',
  },
  {
    match: /cooperativa\s+agr[íi]col|cooperativa\s+rural/i,
    cnaes: ['0149999', '4623108'],
    why: 'Cooperativa agrícola',
  },

  // ── Recuperação judicial / risco / falência ───────────────────────
  {
    match: /recupera[çc][ãa]o judicial|fal[êe]ncia/i,
    cnaes: ['0115600', '0149999', '4683400'], // Soja + outras lavouras temporárias + revenda
    why: 'RJ / Falência — produtor rural + revendas',
  },

  // ── Seguro rural ──────────────────────────────────────────────────
  {
    match: /seguro rural|proagro/i,
    cnaes: ['6520100'],
    why: 'Seguros rurais',
  },

  // ── Lavouras / produção ───────────────────────────────────────────
  {
    match: /\bsoja\b/i,
    cnaes: ['0115600'],
    why: 'Soja',
  },
  {
    match: /\bmilho\b/i,
    cnaes: ['0111301'],
    why: 'Milho',
  },
  {
    match: /\bcaf[ée]\b/i,
    cnaes: ['0134200'],
    why: 'Café',
  },
  {
    match: /\balgod[ãa]o\b/i,
    cnaes: ['0116401'],
    why: 'Algodão',
  },
  {
    match: /\btrigo\b/i,
    cnaes: ['0111302'],
    why: 'Trigo',
  },
  {
    match: /cana[\s-]?de[\s-]?a[çc][úu]car|sucroalc/i,
    cnaes: ['0113000', '1071600'],
    why: 'Cana + usina',
  },

  // ── Pecuária ──────────────────────────────────────────────────────
  {
    match: /bovin|gado|boi gordo|pecu[áa]ri/i,
    cnaes: ['0151201'],
    why: 'Pecuária bovina',
  },
  {
    match: /frigor[íi]fic|abate de bovin/i,
    cnaes: ['1011201'],
    why: 'Frigorífico',
  },
]

// ─── Classifier ────────────────────────────────────────────────────────────

/**
 * Run every rule over the input text and return the deduped union of
 * matched CNAE codes. Empty array means no rules fired.
 *
 * Order is preserved from the rule list — typically callers don't care,
 * but the deterministic ordering makes diffs cleaner in regulatory_norms.
 */
export function classifyCnaes(input: NormClassifierInput): string[] {
  const text = `${input.title || ''} ${input.summary || ''} ${(input.affected_areas || []).join(' ')}`
  if (!text.trim()) return []

  const seen = new Set<string>()
  const out: string[] = []
  for (const rule of RULES) {
    if (rule.match.test(text)) {
      for (const cnae of rule.cnaes) {
        if (!seen.has(cnae)) {
          seen.add(cnae)
          out.push(cnae)
        }
      }
    }
  }
  return out
}

/**
 * Return the human-readable explanation of which rules fired against
 * the input text. Useful for the Marco Regulatório UI when surfacing
 * "why was this norm tagged with these CNAEs?".
 */
export function explainCnaes(input: NormClassifierInput): { rule: string; cnaes: string[] }[] {
  const text = `${input.title || ''} ${input.summary || ''} ${(input.affected_areas || []).join(' ')}`
  if (!text.trim()) return []

  const out: { rule: string; cnaes: string[] }[] = []
  for (const rule of RULES) {
    if (rule.match.test(text)) {
      out.push({ rule: rule.why, cnaes: rule.cnaes })
    }
  }
  return out
}
