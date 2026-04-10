/**
 * Phase 25 — sync-recuperacao-judicial job module.
 * Logic moved from src/app/api/cron/sync-recuperacao-judicial/route.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logSync } from '@/lib/sync-logger'
import { logActivity } from '@/lib/activity-log'
import { loadMatchableEntities, matchEntitiesInText, writeEntityMentions } from '@/lib/entity-matcher'
import Parser from 'rss-parser'
import { RJ_NEWS_SOURCES } from '@/data/recuperacao'
import type { JobResult } from '@/jobs/types'

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (RSS Reader)' },
})

const RJ_PATTERN = /recupera[çc][ãa]o judicial/i
const AGRO_PATTERN =
  /produtor rural|agroneg[óo]cio|usina|cooperativa|agropecuári|agroind[úu]stri|cana-de-a[çc][úu]car|soja|milho|algod[ãa]o|caf[ée]/i

function classifyEntityType(text: string): string {
  const lower = text.toLowerCase()
  if (/produtor rural|produtores rurais/.test(lower)) return 'produtor_rural'
  if (/cooperativa/.test(lower)) return 'cooperativa'
  if (/usina/.test(lower)) return 'usina'
  if (/agro|agríc|pecuári/.test(lower)) return 'empresa_agro'
  return 'outros'
}

function extractState(text: string): string | null {
  const statePatterns: Record<string, RegExp> = {
    'SP': /s[ãa]o paulo|tjsp/i, 'MT': /mato grosso(?! do sul)|tjmt/i,
    'MS': /mato grosso do sul|tjms/i, 'GO': /goi[áa]s|tjgo/i,
    'MG': /minas gerais|tjmg/i, 'PR': /paran[áa]|tjpr/i,
    'RS': /rio grande do sul|tjrs/i, 'BA': /bahia|tjba/i,
    'TO': /tocantins|tjto/i, 'MA': /maranh[ãa]o|tjma/i,
    'PA': /par[áa](?! do)|tjpa/i, 'PI': /piau[ií]|tjpi/i,
  }
  for (const [uf, pattern] of Object.entries(statePatterns)) {
    if (pattern.test(text)) return uf
  }
  return null
}

function generateId(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i)
    hash |= 0
  }
  return `rj-${Math.abs(hash).toString(36)}`
}

export async function runSyncRecuperacaoJudicial(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    let totalNew = 0
    let totalFiltered = 0
    let totalMentions = 0
    const errors: string[] = []

    // Phase 25 — load matchable entities once for the inline name matcher.
    // Most RJ items don't carry a CNPJ in the RSS feed, so the name matcher
    // is the primary path for linking RJ filings to legal_entities.
    const matchableEntities = await loadMatchableEntities(supabase)

    for (const source of RJ_NEWS_SOURCES) {
      try {
        const feed = await parser.parseURL(source.rss)
        const items = feed.items.slice(0, 50)

        for (const item of items) {
          if (!item.link) continue
          const title = item.title?.trim() || ''
          const content = item.contentSnippet?.slice(0, 1000) || item.content?.slice(0, 1000) || ''
          const fullText = `${title} ${content}`

          if (!RJ_PATTERN.test(fullText) || !AGRO_PATTERN.test(fullText)) {
            totalFiltered++
            continue
          }

          const rjItem = {
            id: generateId(item.link),
            entity_name: title.slice(0, 200),
            entity_cnpj: null,
            entity_type: classifyEntityType(fullText),
            court: null,
            case_number: null,
            status: 'em_andamento',
            filing_date: item.isoDate ? item.isoDate.split('T')[0] : null,
            summary: content.slice(0, 500) || null,
            source_url: item.link,
            source_name: source.name,
            state: extractState(fullText),
          }

          const { error } = await supabase
            .from('recuperacao_judicial')
            .upsert(rjItem, { onConflict: 'id', ignoreDuplicates: true })

          if (!error) {
            totalNew++
            if (rjItem.entity_cnpj) {
              const cnpjBasico = String(rjItem.entity_cnpj).replace(/\D/g, '').slice(0, 8)
              if (cnpjBasico.length === 8) {
                const { data: ent } = await supabase
                  .from('legal_entities')
                  .select('entity_uid')
                  .eq('tax_id', cnpjBasico)
                  .maybeSingle()
                if (ent?.entity_uid) {
                  totalMentions += await writeEntityMentions(supabase, {
                    entityUids: [ent.entity_uid],
                    sourceTable: 'recuperacao_judicial',
                    sourceId: rjItem.id,
                    mentionType: 'subject',
                    sentiment: 'negative',
                    extractedBy: 'cnpj_direct',
                  })
                }
              }
            }

            // Phase 25 — name-based matcher fallback. RJ RSS items rarely
            // carry a CNPJ; matching by entity name in the title catches
            // cases like "Cooperativa Comigo entra com pedido de RJ".
            const entityUids = matchEntitiesInText(`${title} ${content}`, matchableEntities)
            if (entityUids.length > 0) {
              totalMentions += await writeEntityMentions(supabase, {
                entityUids,
                sourceTable: 'recuperacao_judicial',
                sourceId: rjItem.id,
                mentionType: 'subject',
                sentiment: 'negative',
                extractedBy: 'regex_v1',
              })
            }
          }
        }
      } catch (e: any) {
        errors.push(`${source.name}: ${e.message}`)
      }
    }

    const finishedAt = new Date().toISOString()
    const status = errors.length === 0 ? 'success' : totalNew > 0 ? 'partial' : 'error'

    await logSync(supabase, {
      source: 'sync-recuperacao-judicial',
      started_at: startedAt,
      finished_at: finishedAt,
      records_fetched: totalNew + totalFiltered,
      records_inserted: totalNew,
      errors: errors.length,
      status,
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
    })

    await logActivity(supabase, {
      action: 'upsert',
      target_table: 'recuperacao_judicial',
      source: 'sync-recuperacao-judicial',
      source_kind: 'cron',
      actor: 'cron',
      summary: `RJ RSS: ${totalNew} caso(s) novos, ${totalFiltered} item(s) filtrados${totalMentions ? `, ${totalMentions} entidades vinculadas` : ''}`,
      metadata: { status, new: totalNew, filtered: totalFiltered, errors: errors.length, entity_mentions: totalMentions },
    })

    return {
      ok: status !== 'error',
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: totalNew + totalFiltered,
      recordsUpdated: totalNew,
      errors,
      stats: { new: totalNew, filtered: totalFiltered, entity_mentions: totalMentions },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logSync(supabase, {
        source: 'sync-recuperacao-judicial',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        records_fetched: 0, records_inserted: 0, errors: 1,
        status: 'error',
        error_message: message,
      })
      await logActivity(supabase, {
        action: 'upsert',
        target_table: 'recuperacao_judicial',
        source: 'sync-recuperacao-judicial',
        source_kind: 'cron',
        actor: 'cron',
        summary: `sync-recuperacao-judicial falhou: ${message}`.slice(0, 200),
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
