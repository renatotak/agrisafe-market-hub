import { GoogleGenAI } from '@google/genai'

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 1536 // matches existing pgvector columns
const SUMMARY_MODEL = 'gemini-2.5-flash'

let _client: GoogleGenAI | null = null

function getClient(): GoogleGenAI | null {
  if (_client) return _client
  const key = process.env.GEMINI_API_KEY
  if (!key || key.includes('your_')) return null
  _client = new GoogleGenAI({ apiKey: key })
  return _client
}

export function isGeminiConfigured(): boolean {
  return getClient() !== null
}

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

  const response = await ai.models.generateContent({
    model: SUMMARY_MODEL,
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
