import { GoogleGenAI } from '@google/genai'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 1536 // matches existing pgvector columns
const DEFAULT_SUMMARY_MODEL = 'gemini-2.5-flash'

// Cached model preference — refreshed every 5 min
let _cachedModel: string | null = null
let _cachedModelAt = 0
const MODEL_CACHE_MS = 5 * 60_000

async function getSummaryModel(): Promise<string> {
  if (_cachedModel && Date.now() - _cachedModelAt < MODEL_CACHE_MS) return _cachedModel
  try {
    const { createAdminClient } = await import('@/utils/supabase/admin')
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('analysis_lenses')
      .select('model')
      .eq('id', '__ai_model')
      .maybeSingle()
    _cachedModel = data?.model || DEFAULT_SUMMARY_MODEL
  } catch {
    _cachedModel = DEFAULT_SUMMARY_MODEL
  }
  _cachedModelAt = Date.now()
  return _cachedModel!
}

let _client: GoogleGenAI | null = null

/**
 * Find a GCP service account key file in the project root.
 * Matches pattern: agrisafe-*.json
 */
function findSaKeyFile(): { credentials: any; project: string } | null {
  try {
    const root = resolve(process.cwd())
    const files = readdirSync(root).filter(f => f.startsWith('agrisafe-') && f.endsWith('.json'))
    if (files.length === 0) return null
    const raw = readFileSync(resolve(root, files[0]), 'utf-8')
    const creds = JSON.parse(raw)
    if (creds.type === 'service_account' && creds.project_id) {
      return { credentials: creds, project: creds.project_id }
    }
  } catch { /* file not found or malformed */ }
  return null
}

/**
 * Initialize the Gemini client.
 *
 * Two modes (Vertex AI tried first):
 *   1. **Vertex AI** — auto-detected from agrisafe-*.json SA key file in project root
 *   2. **Gemini API** — fallback via GEMINI_API_KEY env var
 */
function getClient(): GoogleGenAI | null {
  if (_client) return _client

  // Try Vertex AI via SA key file
  const sa = findSaKeyFile()
  if (sa) {
    _client = new GoogleGenAI({
      vertexai: true,
      project: sa.project,
      location: 'us-east4',
      googleAuthOptions: { credentials: sa.credentials },
    } as any)
    return _client
  }

  // Gemini API fallback
  const key = process.env.GEMINI_API_KEY
  if (!key || key.includes('your_')) return null
  _client = new GoogleGenAI({ apiKey: key })
  return _client
}

export function isGeminiConfigured(): boolean {
  return getClient() !== null
}

export function isVertexAI(): boolean {
  return findSaKeyFile() !== null
}

export { getSummaryModel }

export async function generateEmbedding(text: string): Promise<number[]> {
  const ai = getClient()
  if (!ai) throw new Error('GEMINI_API_KEY not configured')

  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text.slice(0, 10000),
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  })

  return response.embeddings![0].values!
}

export async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const ai = getClient()
  if (!ai) throw new Error('GEMINI_API_KEY not configured')

  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts.map(t => t.slice(0, 10000)),
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  })

  return response.embeddings!.map(e => e.values!)
}

export async function summarizeText(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 500
): Promise<string> {
  const ai = getClient()
  if (!ai) throw new Error('GEMINI_API_KEY not configured')

  const model = await getSummaryModel()
  const response = await ai.models.generateContent({
    model,
    config: {
      temperature: 0.3,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      systemInstruction: systemPrompt,
      thinkingConfig: { thinkingBudget: 0 },
    },
    contents: userPrompt,
  })

  let text = response.text || '{}'
  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  return text
}

export interface RetailerAnalysis {
  executive_summary: string
  market_position: 'regional_leader' | 'expanding' | 'niche_player' | 'stable' | 'declining'
  risk_signals: { type: string; detail: string; date?: string }[]
  growth_signals: { type: string; detail: string; date?: string }[]
  financial_instruments: { type: string; detail: string; amount?: string; date?: string }[]
}

export async function analyzeRetailer(context: {
  retailer: Record<string, unknown>
  industries: string[]
  newsHeadlines: string[]
  events: string[]
  branchCount: number
  branchDelta: number
  webFindings: string[]
}): Promise<RetailerAnalysis> {
  const systemPrompt = `You are a senior agribusiness market analyst at AgriSafe. Analyze the retailer/cooperative data and produce a structured intelligence report in Portuguese.

Output JSON with exactly these fields:
- "executive_summary": 2-3 paragraphs in Portuguese analyzing the company's market position, operations, strategic movements, and outlook. Reference specific data points.
- "market_position": one of "regional_leader", "expanding", "niche_player", "stable", "declining"
- "risk_signals": array of {type, detail, date?} — types: "recuperacao_judicial", "declining_activity", "regulatory_issue", "financial_stress", "market_loss"
- "growth_signals": array of {type, detail, date?} — types: "branch_expansion", "partnership", "event_presence", "market_entry", "product_launch", "funding"
- "financial_instruments": array of {type, detail, amount?, date?} — types: "CRA", "LCA", "FIDC", "debenture", "CPR"

Be specific, cite data points, and flag anything noteworthy. If data is insufficient for a field, return an empty array.`

  const userPrompt = JSON.stringify(context, null, 2)

  const raw = await summarizeText(systemPrompt, userPrompt, 2000)
  try {
    const parsed = JSON.parse(raw)
    return {
      executive_summary: parsed.executive_summary || '',
      market_position: parsed.market_position || 'stable',
      risk_signals: Array.isArray(parsed.risk_signals) ? parsed.risk_signals : [],
      growth_signals: Array.isArray(parsed.growth_signals) ? parsed.growth_signals : [],
      financial_instruments: Array.isArray(parsed.financial_instruments) ? parsed.financial_instruments : [],
    }
  } catch {
    return {
      executive_summary: raw.slice(0, 1000),
      market_position: 'stable',
      risk_signals: [],
      growth_signals: [],
      financial_instruments: [],
    }
  }
}
