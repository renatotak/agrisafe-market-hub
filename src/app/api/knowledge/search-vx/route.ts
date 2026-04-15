import { NextRequest, NextResponse } from "next/server"
import { readFileSync, readdirSync } from "fs"
import { resolve } from "path"

export const dynamic = "force-dynamic"

/**
 * GET /api/knowledge/search-vx?q=<query>&k=10
 *
 * Queries the Vertex AI Search engine backed by the
 * `agsf-knowledge-items` datastore. Returns the top-k documents plus
 * the engine's generative summary (when Generative Responses is
 * enabled on the search app).
 *
 * This endpoint is a PoC running *alongside* the existing pgvector
 * path at /api/knowledge/chat. It does NOT consume embeddings from
 * src/lib/gemini.ts — Vertex AI Search handles its own indexing and
 * retrieval via the Discovery Engine API.
 *
 * Env:
 *   VERTEX_SEARCH_ENGINE_ID  — e.g. agsf-search_1744800000000_gcs (from AI Applications)
 *   VERTEX_SEARCH_LOCATION   — defaults to "global"
 *
 * IAM: the `agrisafe-*.json` SA must hold `Discovery Engine Viewer`
 * (or higher) on the project. No extra role needed for search calls.
 */

function loadSa(): { credentials: Record<string, string>; project: string } | null {
  try {
    const root = process.cwd()
    const file = readdirSync(root).find(
      (f) => f.startsWith("agrisafe-") && f.endsWith(".json"),
    )
    if (!file) return null
    const creds = JSON.parse(readFileSync(resolve(root, file), "utf-8"))
    if (creds.type !== "service_account") return null
    return { credentials: creds, project: creds.project_id }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = (url.searchParams.get("q") || "").trim()
  const k = Math.min(Math.max(parseInt(url.searchParams.get("k") || "10", 10), 1), 25)
  const langParam = url.searchParams.get("lang") || "pt"
  // Map i18n codes → BCP-47 tags expected by Discovery Engine summarySpec.
  const languageCode = langParam === "en" ? "en" : "pt-BR"

  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 })
  }

  const engineId = process.env.VERTEX_SEARCH_ENGINE_ID
  if (!engineId) {
    return NextResponse.json(
      { error: "VERTEX_SEARCH_ENGINE_ID not set in environment" },
      { status: 500 },
    )
  }
  const location = process.env.VERTEX_SEARCH_LOCATION || "global"

  const sa = loadSa()
  if (!sa) {
    return NextResponse.json(
      { error: "SA key file (agrisafe-*.json) not found in project root" },
      { status: 500 },
    )
  }

  // Use the regional endpoint when the datastore is not global. Google
  // requires this for EU/US multi-regions; `global` uses the default.
  const apiEndpoint =
    location === "global" ? undefined : `${location}-discoveryengine.googleapis.com`

  const { SearchServiceClient } = await import("@google-cloud/discoveryengine")
  const client = new SearchServiceClient({
    credentials: sa.credentials as unknown as object,
    projectId: sa.project,
    ...(apiEndpoint ? { apiEndpoint } : {}),
  })

  const servingConfig = `projects/${sa.project}/locations/${location}/collections/default_collection/engines/${engineId}/servingConfigs/default_search`

  try {
    // autoPaginate:false → [firstPageResults, nextRequest, rawResponse]
    // The rawResponse (index 2) carries `.summary` when Generative
    // Responses are enabled on the search app.
    const [results, , rawResponse] = await client.search(
      {
        servingConfig,
        query: q,
        pageSize: k,
        queryExpansionSpec: {
          condition: "AUTO" as const,
        },
        spellCorrectionSpec: {
          mode: "AUTO" as const,
        },
        contentSearchSpec: {
          snippetSpec: { returnSnippet: true },
          summarySpec: {
            summaryResultCount: Math.min(k, 5),
            ignoreAdversarialQuery: true,
            ignoreNonSummarySeekingQuery: false,
            includeCitations: true,
            languageCode,
          },
          extractiveContentSpec: {
            maxExtractiveAnswerCount: 2,
          },
        },
      },
      { autoPaginate: false },
    )

    const hits = (results || []).map((r) => {
      const doc = (r.document || {}) as {
        id?: string | null
        structData?: { fields?: Record<string, unknown> } | null
        derivedStructData?: { fields?: Record<string, unknown> } | null
      }
      const structFields = doc.structData?.fields || {}
      const derivedFields = doc.derivedStructData?.fields || {}

      return {
        id: doc.id || null,
        title: unwrap(structFields.title) || unwrap(derivedFields.title) || "",
        category: unwrap(structFields.category) || null,
        tier: unwrap(structFields.tier) || null,
        source_url: unwrap(structFields.source_url) || null,
        source_type: unwrap(structFields.source_type) || null,
        snippet: unwrap(derivedFields.snippets) || null,
        extractive: unwrap(derivedFields.extractive_answers) || null,
      }
    })

    const responseSummary = (rawResponse as unknown as {
      summary?: { summaryText?: string | null } | null
    } | null)?.summary
    const summary = responseSummary?.summaryText || null

    return NextResponse.json({
      query: q,
      engine: engineId,
      location,
      count: hits.length,
      summary,
      hits,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `discoveryengine: ${message}` },
      { status: 500 },
    )
  }
}

// Unwrap the Discovery Engine "Value" protobuf shape — each field is a
// `{ stringValue | numberValue | listValue | structValue }` union.
function unwrap(v: unknown): unknown {
  if (v == null) return null
  if (typeof v !== "object") return v
  const o = v as Record<string, unknown>
  if ("stringValue" in o) return o.stringValue
  if ("numberValue" in o) return o.numberValue
  if ("boolValue" in o) return o.boolValue
  if ("listValue" in o) {
    const lv = o.listValue as { values?: unknown[] }
    return (lv.values || []).map(unwrap)
  }
  if ("structValue" in o) {
    const sv = o.structValue as { fields?: Record<string, unknown> }
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(sv.fields || {})) out[k] = unwrap(val)
    return out
  }
  return v
}
