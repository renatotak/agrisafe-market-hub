/**
 * Phase 25 — sync-industry-profiles job module.
 * Logic moved from src/app/api/cron/sync-industry-profiles/route.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity-log'
import type { JobResult } from '@/jobs/types'

const BATCH_SIZE = 3
const AGROFIT_BASE = 'https://api.cnptia.embrapa.br/agrofit/v1'

async function getAgrofitToken(): Promise<string | null> {
  const key = process.env.AGROAPI_CONSUMER_KEY
  const secret = process.env.AGROAPI_CONSUMER_SECRET
  if (!key || !secret) return null
  const res = await fetch('https://api.cnptia.embrapa.br/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) return null
  const json = await res.json()
  return json.access_token || null
}

async function searchAgrofitByHolder(token: string, holderNames: string[]): Promise<any[]> {
  const allProducts: any[] = []
  for (const holder of holderNames) {
    try {
      const res = await fetch(
        `${AGROFIT_BASE}/defensivos?titular_registro=${encodeURIComponent(holder)}&page=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) continue
      const json = await res.json()
      const items = json.dados || json.data || []
      if (Array.isArray(items)) allProducts.push(...items)
    } catch {}
  }
  return allProducts
}

export async function runSyncIndustryProfiles(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    const token = await getAgrofitToken()

    const { data: industries, error: indError } = await supabase
      .from('industries')
      .select('id, name, name_display, agrofit_holder_names, updated_at')
      .order('updated_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (indError) throw indError
    if (!industries?.length) {
      return {
        ok: true, status: 'success', startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtDate.getTime(),
        recordsFetched: 0, recordsUpdated: 0, errors: [],
        stats: { message: 'no industries' },
      }
    }

    let totalProducts = 0
    const errors: string[] = []

    for (const industry of industries) {
      try {
        const holderNames = industry.agrofit_holder_names || []
        if (token && holderNames.length > 0) {
          const products = await searchAgrofitByHolder(token, holderNames)
          for (const prod of products) {
            const brandNames = Array.isArray(prod.marca_comercial)
              ? prod.marca_comercial
              : [prod.marca_comercial].filter(Boolean)
            const ingredients = Array.isArray(prod.ingrediente_ativo)
              ? prod.ingrediente_ativo
              : [prod.ingrediente_ativo].filter(Boolean)
            const cultures = Array.isArray(prod.indicacao_uso)
              ? [...new Set(prod.indicacao_uso.map((u: any) => u.cultura).filter(Boolean))]
              : []
            const classAgronomica = Array.isArray(prod.classe_categoria_agronomica)
              ? prod.classe_categoria_agronomica.join(', ')
              : prod.classe_categoria_agronomica || null

            for (const brand of brandNames) {
              if (!brand) continue
              const { error } = await supabase.from('industry_products').upsert({
                industry_id: industry.id,
                product_name: brand,
                active_ingredients: ingredients,
                product_type: classAgronomica,
                target_cultures: cultures.slice(0, 20),
                agrofit_registro: prod.numero_registro || null,
                toxicity_class: prod.classificacao_toxicologica || null,
                environmental_class: prod.classificacao_ambiental || null,
              }, { onConflict: 'industry_id,product_name' })
              if (!error) totalProducts++
            }
          }
        }
        await supabase
          .from('industries')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', industry.id)
      } catch (e: any) {
        errors.push(`${industry.id}: ${e.message}`)
      }
    }

    const finishedAt = new Date().toISOString()
    const status = errors.length === 0 ? 'success' : 'partial'

    await logActivity(supabase, {
      action: 'upsert',
      target_table: 'industry_products',
      source: 'sync-industry-profiles',
      source_kind: 'cron',
      actor: 'cron',
      summary: `Indústrias: ${industries.length} processada(s), ${totalProducts} produto(s) AGROFIT sincronizados`,
      metadata: { status, industries: industries.length, products: totalProducts, errors: errors.length },
    })

    return {
      ok: true,
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: industries.length,
      recordsUpdated: totalProducts,
      errors,
      stats: { industries_processed: industries.length, products_synced: totalProducts },
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error'
    try {
      await logActivity(supabase, {
        action: 'upsert',
        target_table: 'industry_products',
        source: 'sync-industry-profiles',
        source_kind: 'cron',
        actor: 'cron',
        summary: `sync-industry-profiles falhou: ${message}`.slice(0, 200),
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
