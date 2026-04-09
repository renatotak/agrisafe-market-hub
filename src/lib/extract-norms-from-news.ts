import { classifyCnaes } from './cnae-classifier'

/**
 * Phase 24F — Detect new legal norms mentioned inside news articles.
 *
 * Why this exists: ConJur/Migalhas/JOTA RSS feeds (sync-agro-news) catch
 * a lot of CNJ Provimentos, MAPA Portarias, BCB Resoluções, etc. that the
 * cron-fed sync-regulatory pass over the same feeds misses because its
 * filter is BODY ∧ DOC_TYPE ∧ AGRO_FINANCE — too narrow when a news headline
 * mentions a brand new norm.
 *
 * The fix: every time a news article is upserted into agro_news, run a
 * deterministic regex pass over its title + summary. If we detect a norm
 * citation (e.g. "Provimento 216/2026", "Resolução CNJ 488/2022", "Lei 13.986")
 * AND the article is in agro context, upsert a regulatory_norms row.
 *
 * Pure regex — Guardrail #1 (algorithms first, no LLM). Returns an array
 * of zero or more candidate norms; the caller decides whether/how to
 * persist them. Idempotent via stable id = `news-<body>-<type>-<number>`.
 */

export interface NormCandidate {
  /** Stable id for upsert. */
  id: string
  /** Issuing body — CNJ, BCB, CMN, CVM, MAPA, CONGRESSO, etc. */
  body: string
  /** instrucao_normativa | resolucao | provimento | portaria | lei | decreto | medida_provisoria | outros */
  norm_type: string
  /** Raw norm number string, e.g. "216/2026" or "13.986". */
  norm_number: string
  /** Reconstructed title (e.g. "CNJ Provimento 216/2026"). */
  title: string
  /** Article snippet that contained the citation (max 500 chars). */
  summary: string
  /** ISO date (article publication or now). */
  published_at: string
  /** high | medium | low — derived from keyword density. */
  impact_level: 'high' | 'medium' | 'low'
  /** Affected areas (cpr, fiagro, recuperacao_judicial, etc). */
  affected_areas: string[]
  /** Phase 24G2 — CNAE codes the norm affects (deterministic from cnae-classifier.ts). */
  affected_cnaes: string[]
  /** URL of the source article — used for traceability. */
  source_url: string
}

// ─── Regex patterns ────────────────────────────────────────────────────────
//
// Each pattern returns: full match, document type label, number/year.
// Document types are normalised below to the canonical norm_type vocabulary.

interface NormPattern {
  pattern: RegExp
  body?: string
  norm_type: string
}

// Common optional "nº" prefix segment, factored so every pattern is consistent.
// Note: the entire (?:n[ºo°.]\s*) group is optional — Brazilian press often
// drops the "nº" entirely (e.g. "Provimento 216/2026"). Earlier drafts made
// just the special char optional, which forced an "n" to be present and
// missed every citation without an "nº" prefix.
const NUM_PREFIX = '(?:n[ºo°.]\\s*)?'

const NORM_PATTERNS: NormPattern[] = [
  // CNJ-issued: Provimento, Resolução, Portaria, Recomendação
  {
    pattern: new RegExp(`\\b(?:CNJ\\s+)?Provimento\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, 'gi'),
    body: 'CNJ',
    norm_type: 'provimento',
  },
  {
    pattern: new RegExp(`\\b(?:CNJ|Conselho Nacional de Justiça)\\s+Resolução\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, 'gi'),
    body: 'CNJ',
    norm_type: 'resolucao',
  },
  {
    pattern: new RegExp(`\\b(?:CNJ\\s+)?Recomendação\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, 'gi'),
    body: 'CNJ',
    norm_type: 'recomendacao',
  },

  // CMN/BCB Resolução
  {
    pattern: new RegExp(`\\b(?:CMN|Conselho Monetário(?: Nacional)?)\\s+(?:Resolução|Resol\\.)\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, 'gi'),
    body: 'CMN',
    norm_type: 'resolucao',
  },
  {
    pattern: new RegExp(`\\b(?:BCB|BACEN|Banco Central)\\s+Circular\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, 'gi'),
    body: 'BCB',
    norm_type: 'circular',
  },

  // CVM
  {
    pattern: new RegExp(`\\b(?:CVM|Comissão de Valores Mobiliários)\\s+(?:Instrução|Resolução)\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, 'gi'),
    body: 'CVM',
    norm_type: 'instrucao',
  },

  // MAPA
  {
    pattern: new RegExp(`\\b(?:MAPA|Ministério da Agricultura)\\s+(?:Instrução Normativa|IN|Portaria)\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, 'gi'),
    body: 'MAPA',
    norm_type: 'instrucao_normativa',
  },

  // Federal laws — Lei N (with optional /year), Lei Complementar
  {
    pattern: new RegExp(`\\bLei\\s+${NUM_PREFIX}(\\d{1,2}\\.\\d{3}(?:[\\/-]\\d{2,4})?)\\b`, 'gi'),
    body: 'CONGRESSO',
    norm_type: 'lei',
  },
  {
    pattern: new RegExp(`\\bLei\\s+Complementar\\s+${NUM_PREFIX}(\\d{1,3}(?:[\\/-]\\d{2,4})?)\\b`, 'gi'),
    body: 'CONGRESSO',
    norm_type: 'lei_complementar',
  },

  // Decreto
  {
    pattern: new RegExp(`\\bDecreto\\s+${NUM_PREFIX}(\\d{1,2}\\.\\d{3}(?:[\\/-]\\d{2,4})?)\\b`, 'gi'),
    body: 'PRES_REPUBLICA',
    norm_type: 'decreto',
  },

  // Medida Provisória
  {
    pattern: new RegExp(`\\bMedida\\s+Provisória\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/-]\\d{2,4})?)\\b`, 'gi'),
    body: 'PRES_REPUBLICA',
    norm_type: 'medida_provisoria',
  },
]

// Article must mention at least one of these to count as agro context. The
// regex set is broad on purpose — we'd rather over-include and have a human
// reject a false positive in the UI than miss a Provimento like 216/2026.
//
// Important: Portuguese plurals matter. "rural" → "rurais", "produtor" →
// "produtores". The patterns below use rurai?s? and produto[rs]e?s? to cover
// both forms; \b alone misses the plural because it requires word-end after
// a specific suffix.
const AGRO_CONTEXT_PATTERN =
  /\bagroneg[óo]cio|\brura(?:l|is)\b|\bagr[íi]col|\bsafra\b|\bproduto[rs]e?s?\s+rura(?:l|is)|\bcooperativ|\bfazend|\bcpr\b|c[ée]dula de produto rural|\bfiagro|\bcra\b\s+(?:do\s+)?agr|\bcr[ée]dito\s+rural|\brecupera[çc][ãa]o\s+judicial.{0,80}(?:rura(?:l|is)|agro|produto[rs])|fal[êe]ncia.{0,80}(?:rura(?:l|is)|agro|produto[rs])/i

// Heuristic impact classifier (regex over the full article text).
function classifyImpact(text: string): 'high' | 'medium' | 'low' {
  const t = text.toLowerCase()
  if (
    /recupera[çc][ãa]o judicial|fal[êe]ncia|cr[ée]dito rural|cpr|fiagro|nova lei do agro|patrim[ôo]nio rural em afeta[çc][ãa]o/.test(
      t,
    )
  ) {
    return 'high'
  }
  if (/registro|reporting|atualiza|prorrog|amplia|reduz|altera/.test(t)) return 'medium'
  return 'low'
}

function extractAffectedAreas(text: string): string[] {
  const areas: string[] = []
  const t = text.toLowerCase()
  if (/\bcpr\b|c[ée]dula de produto rural/.test(t)) areas.push('cpr')
  if (/fiagro/.test(t)) areas.push('fiagro')
  if (/cr[ée]dito rural|financiamento agr/.test(t)) areas.push('credito_rural')
  if (/cooperativa/.test(t)) areas.push('cooperativas')
  if (/recupera[çc][ãa]o judicial|fal[êe]ncia/.test(t)) areas.push('risco')
  if (/seguro rural|proagro/.test(t)) areas.push('seguro_rural')
  if (/\bcra\b/.test(t)) areas.push('cra')
  if (/\blca\b/.test(t)) areas.push('lca')
  if (/defensivo|agrot[óo]xico|insumo/.test(t)) areas.push('defensivos')
  return areas.length > 0 ? areas : ['geral']
}

/**
 * Run the extractor over a news article.
 *
 * Returns an empty array if:
 *   - the article is not in agro context (AGRO_CONTEXT_PATTERN miss), OR
 *   - no norm citation is detected
 *
 * Otherwise returns one NormCandidate per unique citation. The caller is
 * responsible for upserting these into regulatory_norms.
 */
export function extractNormsFromNews(article: {
  title: string
  summary?: string | null
  source_url: string
  published_at?: string | null
}): NormCandidate[] {
  const text = `${article.title} ${article.summary || ''}`
  if (!text.trim()) return []

  // Gate 1: must be in agro context
  if (!AGRO_CONTEXT_PATTERN.test(text)) return []

  // Gate 2: must contain at least one citable norm
  const seen = new Set<string>()
  const candidates: NormCandidate[] = []

  for (const np of NORM_PATTERNS) {
    np.pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = np.pattern.exec(text)) !== null) {
      const number = m[1]
      const dedupKey = `${np.body || 'OUTROS'}-${np.norm_type}-${number}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      const id = `news-${dedupKey.toLowerCase()}`
      // Pull a 240-char window around the citation as the summary snippet.
      const matchIdx = m.index
      const snippetStart = Math.max(0, matchIdx - 80)
      const snippetEnd = Math.min(text.length, matchIdx + 160)
      const snippet = text.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim()

      const titleParts = [np.body, np.norm_type, number].filter(Boolean)
      const builtTitle = titleParts.join(' ').toUpperCase().replace('LEI ', 'Lei ').replace('PROVIMENTO ', 'Provimento ').replace('RESOLUCAO', 'Resolução').replace('CIRCULAR', 'Circular').replace('INSTRUCAO_NORMATIVA', 'Instrução Normativa').replace('INSTRUCAO', 'Instrução').replace('PORTARIA', 'Portaria').replace('DECRETO', 'Decreto').replace('MEDIDA_PROVISORIA', 'Medida Provisória').replace('LEI_COMPLEMENTAR', 'Lei Complementar').replace('RECOMENDACAO', 'Recomendação')
      const builtSummary = snippet.slice(0, 500)
      const areas = extractAffectedAreas(text)
      candidates.push({
        id,
        body: np.body || 'OUTROS',
        norm_type: np.norm_type,
        norm_number: number,
        title: builtTitle,
        summary: builtSummary,
        published_at: (article.published_at || new Date().toISOString()).slice(0, 10),
        impact_level: classifyImpact(text),
        affected_areas: areas,
        // Phase 24G2 — auto-classify CNAEs from title/summary/areas
        affected_cnaes: classifyCnaes({ title: builtTitle, summary: builtSummary, affected_areas: areas }),
        source_url: article.source_url,
      })
    }
  }

  return candidates
}
