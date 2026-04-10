/**
 * Phase 25 — sync-competitors job module.
 * Logic moved from src/app/api/cron/sync-competitors/route.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logSync } from '@/lib/sync-logger'
import { logActivity } from '@/lib/activity-log'
import type { JobResult } from '@/jobs/types'

export async function runSyncCompetitors(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    const { data: competitors, error: compError } = await supabase
      .from('competitors')
      .select('id, name')
    if (compError) throw compError
    if (!competitors || competitors.length === 0) {
      const finishedAt = new Date().toISOString()
      return {
        ok: true,
        status: 'success',
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedAtDate.getTime(),
        recordsFetched: 0,
        recordsUpdated: 0,
        errors: [],
        stats: { message: 'no competitors' },
      }
    }

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: recentNews, error: newsError } = await supabase
      .from('agro_news')
      .select('id, title, summary, source_name, source_url, published_at')
      .gte('published_at', sevenDaysAgo.toISOString())
    if (newsError) throw newsError

    let signalsInserted = 0
    const errors: string[] = []

    for (const competitor of competitors) {
      if (competitor.id === 'agrisafe') continue
      const mentions = recentNews?.filter((news) =>
        news.title.toLowerCase().includes(competitor.name.toLowerCase()) ||
        (news.summary && news.summary.toLowerCase().includes(competitor.name.toLowerCase())),
      ) || []

      for (const mention of mentions) {
        const signalId = `news_${competitor.id}_${mention.id}`.substring(0, 50)
        const { error: insertError } = await supabase
          .from('competitor_signals')
          .upsert({
            id: signalId,
            competitor_id: competitor.id,
            type: 'news',
            title_pt: mention.title,
            title_en: mention.title,
            date: mention.published_at.split('T')[0],
            source: mention.source_name,
            url: mention.source_url,
          }, { onConflict: 'id' })

        if (insertError) {
          errors.push(`Error inserting signal for ${competitor.name}: ${insertError.message}`)
        } else {
          signalsInserted++
        }
      }
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    for (const competitor of competitors) {
      const { count, error: countError } = await supabase
        .from('competitor_signals')
        .select('*', { count: 'exact', head: true })
        .eq('competitor_id', competitor.id)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])

      if (!countError) {
        let pulseScore = 0
        const c = count || 0
        if (c > 10) pulseScore = 4
        else if (c >= 6) pulseScore = 3
        else if (c >= 3) pulseScore = 2
        else if (c >= 1) pulseScore = 1
        await supabase.from('competitors').update({ score_pulse: pulseScore }).eq('id', competitor.id)
      }
    }

    const finishedAt = new Date().toISOString()
    const status = errors.length === 0 ? 'success' : 'partial'

    await logSync(supabase, {
      source: 'sync-competitors',
      started_at: startedAt,
      finished_at: finishedAt,
      records_fetched: recentNews?.length || 0,
      records_inserted: signalsInserted,
      errors: errors.length,
      status,
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
    })

    await logActivity(supabase, {
      action: 'upsert',
      target_table: 'competitor_signals',
      source: 'sync-competitors',
      source_kind: 'cron',
      actor: 'cron',
      summary: `Concorrentes: ${signalsInserted} sinal(is) gerado(s) a partir de ${recentNews?.length || 0} notícias`,
      metadata: { status, signals: signalsInserted, news_scanned: recentNews?.length || 0, errors: errors.length },
    })

    return {
      ok: true,
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: recentNews?.length || 0,
      recordsUpdated: signalsInserted,
      errors,
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logSync(supabase, {
        source: 'sync-competitors',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        records_fetched: 0, records_inserted: 0, errors: 1,
        status: 'error',
        error_message: message,
      })
      await logActivity(supabase, {
        action: 'upsert',
        target_table: 'competitor_signals',
        source: 'sync-competitors',
        source_kind: 'cron',
        actor: 'cron',
        summary: `sync-competitors falhou: ${message}`.slice(0, 200),
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
