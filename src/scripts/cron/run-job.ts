/**
 * Phase 25 — generic launchd CLI dispatcher.
 *
 * One executable for all 17 cron jobs. Pick a job by name:
 *
 *   npm run cron sync-market-data
 *   npm run cron sync-agro-news
 *   npm run cron sync-cnj-atos
 *   …
 *
 * Or directly:
 *   node --env-file=.env.local node_modules/.bin/tsx \
 *     src/scripts/cron/run-job.ts <job-name>
 *
 * Why one dispatcher instead of 17 wrappers:
 *   - 17 nearly-identical files is pure boilerplate.
 *   - launchd plists call this same script with a different argument
 *     each, which is just as clean as having dedicated wrappers.
 *   - Job lookup is explicit (a switch on JOB_REGISTRY) so a typo
 *     fails loudly with the list of valid names.
 *
 * Each job is a `(supabase) => Promise<JobResult>` exported from a
 * file under `src/jobs/`. The dispatcher only knows about the registry
 * — adding a new job means: drop a new file in src/jobs/ + add one
 * line below + drop a plist in launchd/plists/.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/utils/supabase/admin'

import { runSyncMarketData } from '@/jobs/sync-market-data'
import { runSyncAgroNews } from '@/jobs/sync-agro-news'
import { runSyncRecuperacaoJudicial } from '@/jobs/sync-recuperacao-judicial'
import { runSyncRegulatory } from '@/jobs/sync-regulatory'
import { runSyncEventsNA } from '@/jobs/sync-events-na'
import { runSyncCompetitors } from '@/jobs/sync-competitors'
import { runSyncRetailerIntelligence } from '@/jobs/sync-retailer-intelligence'
import { runSyncIndustryProfiles } from '@/jobs/sync-industry-profiles'
import { runSyncPricesNA } from '@/jobs/sync-prices-na'
import { runArchiveOldNews } from '@/jobs/archive-old-news'
import { runSyncCnjAtos } from '@/jobs/sync-cnj-atos'
import { runSyncCvmAgro } from '@/jobs/sync-cvm-agro'
import { runSyncBcbRural } from '@/jobs/sync-bcb-rural'
import { runSyncKeyAgroLaws } from '@/jobs/sync-key-agro-laws'
import { runSyncWorldbankPrices } from '@/jobs/sync-worldbank-prices'
import { runSyncEventsAgroadvance } from '@/jobs/sync-events-agroadvance'
import { runSyncFaostat } from '@/jobs/sync-faostat'
import { runSyncFaostatLivestock } from '@/jobs/sync-faostat-livestock'
import { runSyncUsdaPsd } from '@/jobs/sync-usda-psd'
import { runSyncConabSafra } from '@/jobs/sync-conab-safra'
import { runSyncMdicComexstat } from '@/jobs/sync-mdic-comexstat'
import { runSyncAgrofitBulk } from '@/jobs/sync-agrofit-bulk'
import { runSyncScraperHealthcheck } from '@/jobs/sync-scraper-healthcheck'
import { runSyncSourceRegistryHealthcheck } from '@/jobs/sync-source-registry-healthcheck'
import { runSyncDailyBriefing } from '@/jobs/sync-daily-briefing'
import { runSyncMfruralFertilizers } from '@/jobs/sync-mfrural-fertilizers'
import { runSyncUsdaAgtransport } from '@/jobs/sync-usda-agtransport'
import { runSyncEventsAgrural } from '@/jobs/sync-events-agrural'
import { runSyncOrchestrator } from '@/jobs/sync-orchestrator'
import { runSyncOracleInsights } from '@/jobs/sync-oracle-insights'
import { runSyncRegulatoryDigest } from '@/jobs/sync-regulatory-digest'
import { runSyncBcbScrInadimplencia } from '@/jobs/sync-bcb-scr-inadimplencia'
import { runSyncCvmFunds } from '@/jobs/sync-cvm-funds'
import { runSyncKnowledgeAgents } from '@/jobs/sync-knowledge-agents'

import type { JobResult } from '@/jobs/types'

type JobFn = (supabase: SupabaseClient) => Promise<JobResult>

const JOB_REGISTRY: Record<string, JobFn> = {
  'sync-market-data':         runSyncMarketData,
  'sync-agro-news':           runSyncAgroNews,
  'sync-recuperacao-judicial': runSyncRecuperacaoJudicial,
  'sync-regulatory':          runSyncRegulatory,
  'sync-events-na':           runSyncEventsNA,
  'sync-competitors':         runSyncCompetitors,
  'sync-retailer-intelligence': runSyncRetailerIntelligence,
  'sync-industry-profiles':   runSyncIndustryProfiles,
  'sync-prices-na':           runSyncPricesNA,
  'archive-old-news':         runArchiveOldNews,
  'sync-cnj-atos':            runSyncCnjAtos,
  'sync-cvm-agro':            runSyncCvmAgro,
  'sync-bcb-rural':           runSyncBcbRural,
  'sync-key-agro-laws':       runSyncKeyAgroLaws,
  'sync-worldbank-prices':    runSyncWorldbankPrices,
  'sync-events-agroadvance':  runSyncEventsAgroadvance,
  'sync-faostat':             runSyncFaostat,
  'sync-faostat-livestock':   runSyncFaostatLivestock,
  'sync-usda-psd':            runSyncUsdaPsd,
  'sync-conab-safra':         runSyncConabSafra,
  'sync-mdic-comexstat':      runSyncMdicComexstat,
  'sync-agrofit-bulk':        runSyncAgrofitBulk,
  'sync-scraper-healthcheck': runSyncScraperHealthcheck,
  'sync-source-registry-healthcheck': runSyncSourceRegistryHealthcheck,
  'sync-mfrural-fertilizers': runSyncMfruralFertilizers,
  'sync-usda-agtransport':  runSyncUsdaAgtransport,
  'sync-events-agrural':    runSyncEventsAgrural,
  'sync-daily-briefing':    runSyncDailyBriefing,
  'sync-orchestrator':      runSyncOrchestrator,
  'sync-oracle-insights':   runSyncOracleInsights,
  'sync-regulatory-digest': runSyncRegulatoryDigest,
  'sync-bcb-scr-inadimplencia': runSyncBcbScrInadimplencia,
  'sync-cvm-funds':             runSyncCvmFunds,
  'sync-knowledge-agents':      runSyncKnowledgeAgents,
}

async function main() {
  const jobName = process.argv[2]
  if (!jobName) {
    console.error('[run-job] missing job name')
    console.error('[run-job] usage: npm run cron <job-name>')
    console.error('[run-job] available jobs:')
    for (const name of Object.keys(JOB_REGISTRY).sort()) console.error(`  - ${name}`)
    process.exit(2)
  }

  const job = JOB_REGISTRY[jobName]
  if (!job) {
    console.error(`[run-job] unknown job: ${jobName}`)
    console.error('[run-job] available jobs:')
    for (const name of Object.keys(JOB_REGISTRY).sort()) console.error(`  - ${name}`)
    process.exit(2)
  }

  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const missing = required.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`[run-job] missing env vars: ${missing.join(', ')}`)
    console.error('[run-job] re-run with: node --env-file=.env.local node_modules/.bin/tsx src/scripts/cron/run-job.ts ' + jobName)
    process.exit(2)
  }

  console.log(`[${jobName}] start ${new Date().toISOString()}`)
  const supabase = createAdminClient()
  const result = await job(supabase)
  console.log(
    `[${jobName}] finish ${result.finishedAt} status=${result.status} ` +
    `fetched=${result.recordsFetched} updated=${result.recordsUpdated} ` +
    `duration=${result.durationMs}ms errors=${result.errors.length}`,
  )
  if (result.errors.length > 0) {
    for (const err of result.errors) console.error(`  · ${err}`)
  }
  process.exit(result.status === 'error' ? 1 : 0)
}

main().catch((err) => {
  console.error('[run-job] uncaught:', err)
  process.exit(1)
})
