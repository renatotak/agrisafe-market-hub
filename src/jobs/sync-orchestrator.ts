/**
 * Smart cron orchestrator — probes each source for freshness before
 * running the heavy scraper. Replaces per-job launchd timers with a
 * single nightly run that only fires jobs when new data is detected.
 *
 * Probe strategies per job:
 *   - HTTP HEAD: check ETag / Last-Modified / Content-Length
 *   - RSS count: fetch feed, compare item count
 *   - API date: hit a lightweight endpoint, check latest date
 *   - Always: jobs that must run every time (briefing, healthcheck)
 *
 * Usage: npm run cron sync-orchestrator
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobResult } from '@/jobs/types'
import { logActivity } from '@/lib/activity-log'
import { createHash } from 'crypto'

// ─── Probe definitions ──────────────────────────────────────────────────────

type ProbeStrategy = 'head' | 'rss_count' | 'api_date' | 'always' | 'weekly_only'

interface JobProbe {
  job: string
  strategy: ProbeStrategy
  probeUrl?: string
  /** Only run on specific weekdays (0=Sun). If empty, run any day. */
  weekdays?: number[]
  /** Import path for the job runner */
  importFn: () => Promise<{ default: (s: SupabaseClient) => Promise<JobResult> }>
}

const PROBES: JobProbe[] = [
  // ── Always run (lightweight + time-sensitive) ──
  { job: 'sync-market-data',       strategy: 'always',
    importFn: () => import('@/jobs/sync-market-data').then(m => ({ default: m.runSyncMarketData })) },
  { job: 'sync-daily-briefing',    strategy: 'always',
    importFn: () => import('@/jobs/sync-daily-briefing').then(m => ({ default: m.runSyncDailyBriefing })) },
  { job: 'sync-scraper-healthcheck', strategy: 'always',
    importFn: () => import('@/jobs/sync-scraper-healthcheck').then(m => ({ default: m.runSyncScraperHealthcheck })) },

  // ── RSS-based (check item count before full parse) ──
  { job: 'sync-agro-news',         strategy: 'rss_count',
    probeUrl: 'https://www.noticiasagricolas.com.br/rss/noticias.xml',
    importFn: () => import('@/jobs/sync-agro-news').then(m => ({ default: m.runSyncAgroNews })) },
  { job: 'sync-regulatory',        strategy: 'rss_count',
    probeUrl: 'https://www.conjur.com.br/feed/',
    importFn: () => import('@/jobs/sync-regulatory').then(m => ({ default: m.runSyncRegulatory })) },
  { job: 'sync-recuperacao-judicial', strategy: 'rss_count',
    probeUrl: 'https://www.conjur.com.br/feed/',
    importFn: () => import('@/jobs/sync-recuperacao-judicial').then(m => ({ default: m.runSyncRecuperacaoJudicial })) },
  { job: 'sync-cnj-atos',          strategy: 'head',
    probeUrl: 'https://atos.cnj.jus.br/api/atos',
    importFn: () => import('@/jobs/sync-cnj-atos').then(m => ({ default: m.runSyncCnjAtos })) },

  // ── HTTP HEAD (check Last-Modified / ETag) ──
  { job: 'sync-events-na',         strategy: 'head',
    probeUrl: 'https://agroagenda.agr.br/',
    importFn: () => import('@/jobs/sync-events-na').then(m => ({ default: m.runSyncEventsNA })) },
  { job: 'sync-competitors',       strategy: 'always',
    importFn: () => import('@/jobs/sync-competitors').then(m => ({ default: m.runSyncCompetitors })) },
  { job: 'sync-prices-na',         strategy: 'always',
    importFn: () => import('@/jobs/sync-prices-na').then(m => ({ default: m.runSyncPricesNA })) },

  // ── Daily but data changes slowly (probe first) ──
  { job: 'sync-faostat',           strategy: 'head',
    probeUrl: 'https://fenixservices.fao.org/faostat/api/v1/en/data/QCL',
    importFn: () => import('@/jobs/sync-faostat').then(m => ({ default: m.runSyncFaostat })) },
  { job: 'sync-faostat-livestock',  strategy: 'head',
    probeUrl: 'https://fenixservices.fao.org/faostat/api/v1/en/data/QL',
    importFn: () => import('@/jobs/sync-faostat-livestock').then(m => ({ default: m.runSyncFaostatLivestock })) },
  { job: 'sync-conab-safra',       strategy: 'head',
    probeUrl: 'https://portaldeinformacoes.conab.gov.br/downloads/arquivos/SerieHistoricaGraos.xls',
    importFn: () => import('@/jobs/sync-conab-safra').then(m => ({ default: m.runSyncConabSafra })) },
  { job: 'sync-retailer-intelligence', strategy: 'always',
    importFn: () => import('@/jobs/sync-retailer-intelligence').then(m => ({ default: m.runSyncRetailerIntelligence })) },
  { job: 'archive-old-news',       strategy: 'always',
    importFn: () => import('@/jobs/archive-old-news').then(m => ({ default: m.runArchiveOldNews })) },

  // ── Weekly-only jobs (skip on non-Sunday) ──
  { job: 'sync-industry-profiles',  strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-industry-profiles').then(m => ({ default: m.runSyncIndustryProfiles })) },
  { job: 'sync-agrofit-bulk',       strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-agrofit-bulk').then(m => ({ default: m.runSyncAgrofitBulk })) },
  { job: 'sync-events-agroadvance', strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-events-agroadvance').then(m => ({ default: m.runSyncEventsAgroadvance })) },
  { job: 'sync-cvm-agro',           strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-cvm-agro').then(m => ({ default: m.runSyncCvmAgro })) },
  { job: 'sync-bcb-rural',          strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-bcb-rural').then(m => ({ default: m.runSyncBcbRural })) },
  { job: 'sync-key-agro-laws',      strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-key-agro-laws').then(m => ({ default: m.runSyncKeyAgroLaws })) },
  { job: 'sync-worldbank-prices',   strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-worldbank-prices').then(m => ({ default: m.runSyncWorldbankPrices })) },
  { job: 'sync-usda-psd',           strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-usda-psd').then(m => ({ default: m.runSyncUsdaPsd })) },
  { job: 'sync-mdic-comexstat',     strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-mdic-comexstat').then(m => ({ default: m.runSyncMdicComexstat })) },
  { job: 'sync-source-registry-healthcheck', strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-source-registry-healthcheck').then(m => ({ default: m.runSyncSourceRegistryHealthcheck })) },
  { job: 'sync-mfrural-fertilizers', strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-mfrural-fertilizers').then(m => ({ default: m.runSyncMfruralFertilizers })) },
  { job: 'sync-usda-agtransport',   strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-usda-agtransport').then(m => ({ default: m.runSyncUsdaAgtransport })) },
  { job: 'sync-events-agrural',     strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-events-agrural').then(m => ({ default: m.runSyncEventsAgrural })) },
  { job: 'sync-oracle-insights',    strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-oracle-insights').then(m => ({ default: m.runSyncOracleInsights })) },
  { job: 'sync-regulatory-digest',  strategy: 'weekly_only', weekdays: [0],
    importFn: () => import('@/jobs/sync-regulatory-digest').then(m => ({ default: m.runSyncRegulatoryDigest })) },
]

// ─── Probe functions ────────────────────────────────────────────────────────

async function probeHead(url: string): Promise<{ etag?: string; lastModified?: string; hash: string }> {
  const res = await fetch(url, {
    method: 'HEAD',
    headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (freshness probe)' },
    signal: AbortSignal.timeout(10000),
  })
  const etag = res.headers.get('etag') || undefined
  const lastModified = res.headers.get('last-modified') || undefined
  const contentLength = res.headers.get('content-length') || ''
  const hash = createHash('md5').update(`${res.status}|${etag}|${lastModified}|${contentLength}`).digest('hex')
  return { etag, lastModified, hash }
}

async function probeRssCount(url: string): Promise<{ itemCount: number; hash: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (freshness probe)' },
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  // Count <item> or <entry> tags without full XML parsing
  const items = (text.match(/<item[\s>]/g) || []).length + (text.match(/<entry[\s>]/g) || []).length
  const hash = createHash('md5').update(text.slice(0, 2000)).digest('hex')
  return { itemCount: items, hash }
}

async function checkFreshness(
  supabase: SupabaseClient,
  jobName: string,
  strategy: ProbeStrategy,
  probeUrl?: string,
): Promise<{ changed: boolean; reason: string }> {
  if (strategy === 'always') return { changed: true, reason: 'always-run' }

  if (strategy === 'weekly_only') {
    const dow = new Date().getDay()
    if (dow !== 0) return { changed: false, reason: `weekly-only (today=${dow}, need=0)` }
    return { changed: true, reason: 'weekly-sunday' }
  }

  if (!probeUrl) return { changed: true, reason: 'no-probe-url' }

  // Load cached fingerprint
  const { data: cached } = await supabase
    .from('cron_freshness')
    .select('*')
    .eq('job_name', jobName)
    .maybeSingle()

  try {
    if (strategy === 'head') {
      const probe = await probeHead(probeUrl)
      const changed = !cached || cached.last_hash !== probe.hash
      // Update cache
      await supabase.from('cron_freshness').upsert({
        job_name: jobName,
        last_etag: probe.etag || null,
        last_modified: probe.lastModified || null,
        last_hash: probe.hash,
        last_checked_at: new Date().toISOString(),
        ...(changed ? { last_changed_at: new Date().toISOString() } : {}),
        skip_count: changed ? 0 : (cached?.skip_count || 0) + 1,
        run_count: changed ? (cached?.run_count || 0) + 1 : cached?.run_count || 0,
      }, { onConflict: 'job_name' })
      return { changed, reason: changed ? `hash-changed (${probe.hash.slice(0, 8)})` : `hash-same (skipped ${(cached?.skip_count || 0) + 1}x)` }
    }

    if (strategy === 'rss_count') {
      const probe = await probeRssCount(probeUrl)
      const changed = !cached || cached.last_hash !== probe.hash || cached.last_item_count !== probe.itemCount
      await supabase.from('cron_freshness').upsert({
        job_name: jobName,
        last_hash: probe.hash,
        last_item_count: probe.itemCount,
        last_checked_at: new Date().toISOString(),
        ...(changed ? { last_changed_at: new Date().toISOString() } : {}),
        skip_count: changed ? 0 : (cached?.skip_count || 0) + 1,
        run_count: changed ? (cached?.run_count || 0) + 1 : cached?.run_count || 0,
      }, { onConflict: 'job_name' })
      return { changed, reason: changed ? `rss-changed (${probe.itemCount} items)` : `rss-same (${probe.itemCount} items, skipped ${(cached?.skip_count || 0) + 1}x)` }
    }
  } catch (err) {
    // Probe failed — run the job anyway to surface the real error
    return { changed: true, reason: `probe-error: ${(err as Error).message?.slice(0, 60)}` }
  }

  return { changed: true, reason: 'unknown-strategy' }
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

export async function runSyncOrchestrator(supabase: SupabaseClient): Promise<JobResult> {
  const startIso = new Date().toISOString()
  const start = Date.now()
  const errors: string[] = []
  const results: { job: string; action: string; reason: string; duration?: number; rows?: number }[] = []

  for (const probe of PROBES) {
    const { changed, reason } = await checkFreshness(supabase, probe.job, probe.strategy, probe.probeUrl)

    if (!changed) {
      results.push({ job: probe.job, action: 'skip', reason })
      continue
    }

    // Run the job
    const jobStart = Date.now()
    try {
      const mod = await probe.importFn()
      const result = await mod.default(supabase)
      results.push({
        job: probe.job,
        action: result.ok ? 'success' : 'error',
        reason,
        duration: Date.now() - jobStart,
        rows: result.recordsUpdated,
      })
      if (!result.ok && result.errors.length > 0) {
        errors.push(`${probe.job}: ${result.errors[0]}`)
      }
    } catch (err) {
      const msg = (err as Error).message?.slice(0, 100) || 'unknown'
      results.push({ job: probe.job, action: 'error', reason: `exception: ${msg}`, duration: Date.now() - jobStart })
      errors.push(`${probe.job}: ${msg}`)
    }
  }

  const ran = results.filter(r => r.action !== 'skip')
  const skipped = results.filter(r => r.action === 'skip')
  const summary = `Orchestrator: ${ran.length} ran, ${skipped.length} skipped, ${errors.length} errors`

  await logActivity(supabase, {
    action: 'upsert',
    target_table: 'cron_freshness',
    target_id: new Date().toISOString().slice(0, 10),
    source: 'sync-orchestrator',
    source_kind: 'cron',
    summary,
    metadata: { results },
  }).catch(() => {})

  // Print report to stdout for launchd logs
  console.log(`\n${'═'.repeat(60)}`)
  console.log(summary)
  console.log(`${'─'.repeat(60)}`)
  for (const r of results) {
    const icon = r.action === 'skip' ? '⏭' : r.action === 'success' ? '✓' : '✗'
    const dur = r.duration ? ` (${(r.duration / 1000).toFixed(1)}s)` : ''
    const rows = r.rows !== undefined ? ` ${r.rows} rows` : ''
    console.log(`  ${icon} ${r.job.padEnd(35)} ${r.action.padEnd(8)}${dur}${rows}  ${r.reason}`)
  }
  console.log(`${'═'.repeat(60)}\n`)

  return {
    ok: errors.length === 0,
    status: errors.length > 0 ? 'error' : 'success',
    startedAt: startIso,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    recordsFetched: ran.length,
    recordsUpdated: ran.filter(r => r.action === 'success').length,
    errors,
    stats: { ran: ran.length, skipped: skipped.length, results },
  }
}
