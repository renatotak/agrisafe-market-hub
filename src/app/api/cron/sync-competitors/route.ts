import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { logSync } from '@/lib/sync-logger'

export const dynamic = 'force-dynamic'

/**
 * sync-competitors:
 * Scans the agro_news table for mentions of mapped competitors
 * and creates new "news" type signals if found.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()

  try {
    // 1. Get all competitors
    const { data: competitors, error: compError } = await supabase
      .from('competitors')
      .select('id, name')
    
    if (compError) throw compError
    if (!competitors || competitors.length === 0) {
      return NextResponse.json({ success: true, message: 'No competitors to sync' })
    }

    // 2. Fetch recent news (last 7 days) to find mentions
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: recentNews, error: newsError } = await supabase
      .from('agro_news')
      .select('id, title, summary, source_name, source_url, published_at')
      .gte('published_at', sevenDaysAgo.toISOString())

    if (newsError) throw newsError

    let signalsInserted = 0
    const errors: string[] = []

    // 3. Process mentions
    for (const competitor of competitors) {
      // Skip AgriSafe itself for competitive signals (internal)
      if (competitor.id === 'agrisafe') continue;

      const mentions = recentNews?.filter(news => 
        news.title.toLowerCase().includes(competitor.name.toLowerCase()) ||
        (news.summary && news.summary.toLowerCase().includes(competitor.name.toLowerCase()))
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
            title_en: mention.title, // Fallback to PT for automated news
            date: mention.published_at.split('T')[0],
            source: mention.source_name,
            url: mention.source_url
          }, { onConflict: 'id' })

        if (insertError) {
          errors.push(`Error inserting signal for ${competitor.name}: ${insertError.message}`)
        } else {
          signalsInserted++
        }
      }
    }

    // 4. Update "Pulse" score based on activity in the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    for (const competitor of competitors) {
      // Get count of signals for this competitor in last 30 days
      const { count, error: countError } = await supabase
        .from('competitor_signals')
        .select('*', { count: 'exact', head: true })
        .eq('competitor_id', competitor.id)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])

      if (!countError) {
        // Calculate pulse score (0-4)
        // 0: 0 signals, 1: 1-2, 2: 3-5, 3: 6-10, 4: >10
        let pulseScore = 0
        const c = count || 0
        if (c > 10) pulseScore = 4
        else if (c >= 6) pulseScore = 3
        else if (c >= 3) pulseScore = 2
        else if (c >= 1) pulseScore = 1

        await supabase
          .from('competitors')
          .update({ score_pulse: pulseScore })
          .eq('id', competitor.id)
      }
    }

    // 5. Log and respond
    await logSync(supabase, {
      source: 'sync-competitors',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      records_fetched: recentNews?.length || 0,
      records_inserted: signalsInserted,
      errors: errors.length,
      status: errors.length === 0 ? 'success' : 'partial',
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
    })

    return NextResponse.json({
      success: true,
      signals_created: signalsInserted,
      mentions_found: recentNews?.length || 0,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: any) {
    console.error('Error syncing competitor signals:', error)
    await logSync(supabase, {
      source: 'sync-competitors',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      records_fetched: 0,
      records_inserted: 0,
      errors: 1,
      status: 'error',
      error_message: error.message,
    })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
