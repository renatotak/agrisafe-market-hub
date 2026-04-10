/**
 * Phase 25 — sync-source-registry-healthcheck.
 *
 * Periodic re-check of the data_sources table (was: source-registry.json).
 *
 * Phase 25 follow-up: this job now reads + WRITES to the `data_sources`
 * table via /api/data-sources. The earlier read-only design (against
 * the static JSON) was replaced once Source CRUD landed because:
 *   - The JSON is now seed-data-only — `data_sources` is the live truth
 *   - The cron updates url_status / http_status / last_checked_at via
 *     the PATCH endpoint (with the `_cron_update` flag to skip per-row
 *     activity_log noise)
 *   - The cron still writes ONE summary row to activity_log so the
 *     user sees "X active, Y broken, Z newly broken" in Settings
 *
 * Cadence: weekly (Sunday). Probing 176 URLs at 8 concurrent workers
 * with 100ms pace + 12s timeout = ~30-60s walltime per run.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity-log'
import type { JobResult } from '@/jobs/types'

const CONCURRENCY = 8
const TIMEOUT_MS = 12000
const PACE_MS = 100
const UA = 'Mozilla/5.0 (compatible; AgriSafe MarketHub/1.0; +https://agsf-mkthub.vercel.app)'

type Status = 'active' | 'inactive' | 'error' | 'unchecked'
interface ProbeResult { status: Status; http: number | null; reason: string }

interface DataSourceRow {
  id: string
  name: string | null
  url: string | null
  url_status: string | null
  active: boolean | null
}

async function probe(url: string | undefined): Promise<ProbeResult> {
  if (!url) return { status: 'unchecked', http: null, reason: 'empty_url' }
  if (!/^https?:\/\//i.test(url)) return { status: 'unchecked', http: null, reason: 'non_http_scheme' }

  const headers = { 'User-Agent': UA, Accept: '*/*' }

  // HEAD first
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const res = await fetch(url, { method: 'HEAD', headers, redirect: 'follow', signal: ctrl.signal })
    clearTimeout(t)
    const http = res.status
    if (http >= 200 && http < 400) return { status: 'active', http, reason: 'head_ok' }
    if (http === 405 || http === 403 || http === 400) {
      // fall through to GET
    } else if (http === 404 || http === 410 || http === 451) {
      return { status: 'inactive', http, reason: `head_${http}` }
    } else if (http >= 500) {
      // retry with GET
    } else {
      return { status: 'error', http, reason: `head_${http}` }
    }
  } catch {
    // network/timeout — try GET below
  }

  // GET fallback
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const res = await fetch(url, { method: 'GET', headers, redirect: 'follow', signal: ctrl.signal })
    clearTimeout(t)
    try { if (res.body && typeof res.body.cancel === 'function') await res.body.cancel() } catch {}
    const http = res.status
    if (http >= 200 && http < 400) return { status: 'active', http, reason: 'get_ok' }
    if (http === 404 || http === 410 || http === 451) return { status: 'inactive', http, reason: `get_${http}` }
    return { status: 'error', http, reason: `get_${http}` }
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes('aborted') || msg.includes('timeout')) return { status: 'error', http: null, reason: 'timeout' }
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) return { status: 'error', http: null, reason: 'dns' }
    if (msg.includes('ECONNREFUSED')) return { status: 'error', http: null, reason: 'refused' }
    if (msg.includes('certificate') || msg.includes('CERT')) return { status: 'error', http: null, reason: 'cert' }
    return { status: 'error', http: null, reason: msg.slice(0, 60) }
  }
}

async function pool<T, R>(items: T[], worker: (item: T, i: number) => Promise<R>, concurrency: number): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function spawn() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await worker(items[i], i)
      if (PACE_MS > 0) await new Promise((r) => setTimeout(r, PACE_MS))
    }
  }
  const workers = Array.from({ length: concurrency }, () => spawn())
  await Promise.all(workers)
  return out
}

export async function runSyncSourceRegistryHealthcheck(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    // Page through data_sources, active=true. PostgREST defaults cap at 1000
    // but we have ~176 rows so a single fetch is fine.
    const { data: rows, error: loadErr } = await supabase
      .from('data_sources')
      .select('id, name, url, url_status, active')
      .eq('active', true)
      .order('id')
      .limit(2000)

    if (loadErr) throw new Error(`failed to load data_sources: ${loadErr.message}`)

    const targets = (rows || []).filter((r) => !!r.url) as DataSourceRow[]
    const stats = { active: 0, inactive: 0, error: 0, unchecked: 0 }
    const newlyBroken: Array<{ id: string; name: string | null; previous: string | null; now: Status; http: number | null }> = []
    const nowIso = new Date().toISOString()

    await pool(
      targets,
      async (entry) => {
        const result = await probe(entry.url || undefined)
        stats[result.status]++

        // Detect drift
        if (entry.url_status === 'active' && (result.status === 'error' || result.status === 'inactive')) {
          newlyBroken.push({
            id: entry.id,
            name: entry.name,
            previous: entry.url_status,
            now: result.status,
            http: result.http,
          })
        }

        // Write back url_status / http_status / last_checked_at via UPDATE.
        // Use the supabase client directly (not the API) to skip the HTTP
        // round-trip. The API's PATCH path is what manual edits use.
        await supabase
          .from('data_sources')
          .update({
            url_status: result.status,
            http_status: result.http,
            last_checked_at: nowIso,
          })
          .eq('id', entry.id)

        return null
      },
      CONCURRENCY,
    )

    const finishedAt = new Date().toISOString()
    const durationMs = Date.now() - startedAtDate.getTime()
    const status = stats.error + stats.inactive === 0 ? 'success' : 'partial'

    await logActivity(supabase, {
      action: 'update',
      target_table: 'data_sources',
      source: 'sync-source-registry-healthcheck',
      source_kind: 'cron',
      actor: 'cron',
      summary:
        `Source registry: ${stats.active} active, ${stats.inactive} inactive, ${stats.error} error` +
        (newlyBroken.length > 0 ? ` · ${newlyBroken.length} novo(s) quebrado(s)` : ''),
      metadata: {
        status,
        active: stats.active,
        inactive: stats.inactive,
        error: stats.error,
        unchecked: stats.unchecked,
        total: targets.length,
        newly_broken: newlyBroken.slice(0, 20),
        newly_broken_count: newlyBroken.length,
        duration_ms: durationMs,
      },
    })

    return {
      ok: true,
      status,
      startedAt,
      finishedAt,
      durationMs,
      recordsFetched: targets.length,
      recordsUpdated: targets.length,
      errors: [],
      stats: { ...stats, newly_broken: newlyBroken.length },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logActivity(supabase, {
        action: 'update',
        target_table: 'data_sources',
        source: 'sync-source-registry-healthcheck',
        source_kind: 'cron',
        actor: 'cron',
        summary: `sync-source-registry-healthcheck falhou: ${message}`.slice(0, 200),
        metadata: { status: 'error', error: message },
      })
    } catch {}
    return {
      ok: false,
      status: 'error',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [message],
    }
  }
}
