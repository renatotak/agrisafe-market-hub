/**
 * Phase 6a — Weekly sync-oracle-insights job.
 *
 * Clusters unanswered / low-confidence Oracle prompts into a
 * knowledge-gap backlog. Reads from `oracle_chat_logs` (prompts
 * where the Oracle had zero or low-quality context matches) and
 * groups them by theme using Vertex AI. The output goes into
 * `knowledge_gap_backlog` so the team can prioritize filling
 * missing knowledge items.
 *
 * Schedule: weekly (Sunday).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobResult } from '@/jobs/types'
import { logActivity } from '@/lib/activity-log'
import { summarizeText, isGeminiConfigured } from '@/lib/gemini'

const JOB_NAME = 'sync-oracle-insights'

interface ChatLog {
  id: string
  prompt: string
  context_count: number
  created_at: string
  module?: string
}

export async function runSyncOracleInsights(supabase: SupabaseClient): Promise<JobResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const errors: string[] = []
  let fetched = 0
  let updated = 0

  try {
    // 1. Fetch recent unanswered / low-confidence prompts (last 7 days)
    //    These are chat interactions where context_count was 0 or very low,
    //    meaning the knowledge base had no good answer.
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

    const { data: logs, error: fetchErr } = await supabase
      .from('oracle_chat_logs')
      .select('id, prompt, context_count, created_at, module')
      .lte('context_count', 1)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(200)

    if (fetchErr) {
      // Table may not exist yet — that's ok, just log and return
      if (fetchErr.message?.includes('does not exist') || fetchErr.code === '42P01') {
        await logActivity(supabase, {
          source: JOB_NAME,
          source_kind: 'cron',
          action: 'upsert',
          target_table: 'knowledge_gap_backlog',
          summary: 'oracle_chat_logs table not found — skipping (create table to enable)',
        })
        return {
          ok: true,
          status: 'success',
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
          recordsFetched: 0,
          recordsUpdated: 0,
          errors: [],
          stats: { skipped: true, reason: 'oracle_chat_logs table not found' },
        }
      }
      throw fetchErr
    }

    const prompts: ChatLog[] = logs || []
    fetched = prompts.length

    if (fetched === 0) {
      await logActivity(supabase, {
        source: JOB_NAME,
        source_kind: 'cron',
        action: 'upsert',
        target_table: 'knowledge_gap_backlog',
        summary: 'No low-confidence prompts found in the last 7 days',
      })
      return {
        ok: true,
        status: 'success',
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        recordsFetched: 0,
        recordsUpdated: 0,
        errors: [],
      }
    }

    // 2. Cluster prompts into themes using Vertex AI
    let clusters: Array<{ theme: string; theme_en: string; prompts: string[]; priority: string }> = []

    if (isGeminiConfigured() && fetched >= 3) {
      const promptList = prompts.map((p, i) => `${i + 1}. [${p.module || 'general'}] ${p.prompt}`).join('\n')

      const clusterPrompt = `Analise as seguintes perguntas feitas ao AgriSafe Oracle que NÃO tiveram respostas satisfatórias na base de conhecimento.
Agrupe-as em clusters temáticos (máximo 10 clusters).
Para cada cluster, forneça:
- theme: nome do tema em PT-BR
- theme_en: nome do tema em EN
- prompts: lista das perguntas originais nesse cluster
- priority: "high" se o tema aparece 3+ vezes, "medium" se 2 vezes, "low" se 1 vez

Responda APENAS com JSON válido no formato:
[{"theme":"...","theme_en":"...","prompts":["..."],"priority":"high|medium|low"}]

PERGUNTAS:
${promptList}`

      try {
        const raw = await summarizeText(
          'You are a data analyst clustering user queries into knowledge gaps. Return only valid JSON.',
          clusterPrompt,
          2000,
        )
        // Extract JSON from the response
        const jsonMatch = raw.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          clusters = JSON.parse(jsonMatch[0])
        }
      } catch (err: any) {
        errors.push(`Clustering failed: ${err.message}`)
        // Fallback: one cluster per prompt
        clusters = prompts.map(p => ({
          theme: p.prompt.slice(0, 80),
          theme_en: p.prompt.slice(0, 80),
          prompts: [p.prompt],
          priority: 'low' as const,
        }))
      }
    } else {
      // No AI or too few prompts — create simple 1:1 clusters
      clusters = prompts.map(p => ({
        theme: p.prompt.slice(0, 80),
        theme_en: p.prompt.slice(0, 80),
        prompts: [p.prompt],
        priority: 'low' as const,
      }))
    }

    // 3. Upsert clusters into knowledge_gap_backlog
    for (const cluster of clusters) {
      const { error: upsertErr } = await supabase
        .from('knowledge_gap_backlog')
        .upsert(
          {
            theme: cluster.theme,
            theme_en: cluster.theme_en,
            sample_prompts: cluster.prompts.slice(0, 10),
            prompt_count: cluster.prompts.length,
            priority: cluster.priority,
            status: 'open',
            detected_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'theme' },
        )

      if (upsertErr) {
        if (upsertErr.message?.includes('does not exist') || upsertErr.code === '42P01') {
          errors.push('knowledge_gap_backlog table not found — run migration to create it')
          break
        }
        errors.push(`Upsert failed for "${cluster.theme}": ${upsertErr.message}`)
      } else {
        updated++
      }
    }

    await logActivity(supabase, {
      source: JOB_NAME,
      source_kind: 'cron',
      action: 'upsert',
      target_table: 'knowledge_gap_backlog',
      summary: `Clustered ${fetched} low-confidence prompts into ${updated} knowledge gaps`,
      metadata: { clusters: clusters.length, prompts: fetched },
    })
  } catch (err: any) {
    errors.push(err.message || String(err))
    await logActivity(supabase, {
      source: JOB_NAME,
      source_kind: 'cron',
      action: 'upsert',
      target_table: 'knowledge_gap_backlog',
      summary: `Error: ${err.message}`,
    }).catch(() => {})
  }

  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? 'success' : (updated > 0 ? 'partial' : 'error'),
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    recordsFetched: fetched,
    recordsUpdated: updated,
    errors,
  }
}
