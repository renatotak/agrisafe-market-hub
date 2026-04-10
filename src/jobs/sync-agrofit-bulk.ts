/**
 * Phase 25 — sync-agrofit-bulk job module.
 *
 * Logic moved from src/app/api/cron/sync-agrofit-bulk/route.ts (Phase 20).
 *
 * This is the only runScraper-based job that DOES NOT fit the
 * runScraperJob() helper because it upserts into 4 tables
 * (industry_products + active_ingredients + 2 junction tables) and
 * needs to coordinate IDs between them. So we wrap runScraper()
 * directly here and produce a JobResult by hand.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { runScraper, type ScraperFn } from '@/lib/scraper-runner'
import { searchAgrofitProducts, type AgroProduct } from '@/lib/agroapi'
import type { JobResult } from '@/jobs/types'

const SEED_QUERIES = [
  'soja', 'milho', 'algodao', 'cafe', 'cana', 'trigo',
  'glifosato', 'atrazina', '2,4-d', 'imazapyr', 'mancozebe', 'clorpirifós',
  'imidacloprido', 'tebuconazol', 'lambda-cialotrina', 'bifentrina',
  'paraquate', 'flutriafol',
] as const

const MAX_PAGES_PER_QUERY = 8

function slugify(s: string | null | undefined): string {
  if (!s) return ''
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function categorize(classes: string[] | null | undefined): string {
  const joined = (classes || []).join(' ').toLowerCase()
  if (joined.includes('herbic')) return 'herbicida'
  if (joined.includes('insetic')) return 'inseticida'
  if (joined.includes('fungic')) return 'fungicida'
  if (joined.includes('acaric')) return 'acaricida'
  if (joined.includes('nematic')) return 'nematicida'
  if (joined.includes('reguladora')) return 'reguladora'
  if (joined.includes('biológico') || joined.includes('biologic')) return 'biologico'
  if (joined.includes('fertiliz')) return 'fertilizante'
  return 'outro'
}

interface NormalizedProduct extends Record<string, unknown> {
  numero_registro: string
  marca_comercial: string
  titular_registro: string
  ingrediente_ativo: string
  indicacao_uso: string
  _ingredients: string[]
  _classes: string[]
  _uses: { culture: string; pest: string }[]
  _formulation: string | null
  _toxicity: string | null
  _environmental: string | null
  _url: string | null
  _biological: boolean
}

const fetchAgrofit: ScraperFn<NormalizedProduct> = async () => {
  const seen = new Map<string, NormalizedProduct>()
  let httpOk = 0
  let totalBytes = 0

  for (const query of SEED_QUERIES) {
    let page = 1
    while (page <= MAX_PAGES_PER_QUERY) {
      let res
      try {
        res = await searchAgrofitProducts(query, page)
      } catch (err) {
        console.error(`AGROFIT seed "${query}" page ${page} failed:`, err)
        break
      }
      httpOk++
      totalBytes += JSON.stringify(res).length
      const products: AgroProduct[] = res.data || []
      if (products.length === 0) break

      for (const p of products) {
        if (!p.numero_registro || seen.has(p.numero_registro)) continue
        const ingredients = Array.isArray(p.ingrediente_ativo) ? p.ingrediente_ativo : []
        const brand = Array.isArray(p.marca_comercial) ? p.marca_comercial[0] : ''
        const classes = Array.isArray(p.classe_categoria_agronomica) ? p.classe_categoria_agronomica : []
        const uses = Array.isArray(p.indicacao_uso)
          ? p.indicacao_uso.map((u) => ({ culture: u.cultura || '', pest: u.praga || '' }))
          : []

        seen.set(p.numero_registro, {
          numero_registro: p.numero_registro,
          marca_comercial: brand || '(sem marca)',
          titular_registro: p.titular_registro || '(sem titular)',
          ingrediente_ativo: ingredients.join(', ') || '(sem ingrediente)',
          indicacao_uso: uses.map((u) => `${u.culture}/${u.pest}`).join('; ') || '(sem indicação)',
          _ingredients: ingredients,
          _classes: classes,
          _uses: uses,
          _formulation: p.formulacao || null,
          _toxicity: p.classificacao_toxicologica || null,
          _environmental: p.classificacao_ambiental || null,
          _url: p.url_agrofit || null,
          _biological: !!p.produto_biologico,
        })
      }
      if (page >= (res.pages || 1)) break
      page++
    }
  }

  return {
    rows: Array.from(seen.values()),
    httpStatus: httpOk > 0 ? 200 : 502,
    bytesFetched: totalBytes,
    targetPeriod: new Date().toISOString().slice(0, 7),
  }
}

export async function runSyncAgrofitBulk(supabase: SupabaseClient): Promise<JobResult> {
  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()

  try {
    const outcome = await runScraper<NormalizedProduct>('sync-agrofit-bulk', fetchAgrofit, { supabase })

    if (!outcome.ok || outcome.rows.length === 0) {
      return {
        ok: false,
        status: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtDate.getTime(),
        recordsFetched: outcome.rowsFetched,
        recordsUpdated: 0,
        errors: [
          outcome.errorMessage || 'no rows fetched',
          ...(outcome.validationErrors || []).map((e) => `row ${e.row_index} ${e.key}: expected ${e.expected}, got ${e.got}`),
        ],
        stats: { runId: outcome.runId },
      }
    }

    const { data: industries } = await supabase
      .from('industries')
      .select('id, agrofit_holder_names')
    const holderToIndustryId = new Map<string, string>()
    for (const ind of industries || []) {
      const names: string[] = ind.agrofit_holder_names || []
      for (const n of names) holderToIndustryId.set(n.toUpperCase().trim(), ind.id)
    }

    interface IngredientAggregate {
      ingredient_id: string
      name: string
      name_display: string
      category: string
      classes: Set<string>
      holders: Set<string>
      brands: Set<string>
    }
    const ingredientMap = new Map<string, IngredientAggregate>()
    for (const row of outcome.rows) {
      for (const ing of row._ingredients) {
        const id = slugify(ing)
        if (!id) continue
        let agg = ingredientMap.get(id)
        if (!agg) {
          agg = {
            ingredient_id: id,
            name: ing.toUpperCase().trim(),
            name_display: ing.trim(),
            category: categorize(row._classes),
            classes: new Set(),
            holders: new Set(),
            brands: new Set(),
          }
          ingredientMap.set(id, agg)
        }
        for (const c of row._classes) agg.classes.add(c)
        agg.holders.add(row.titular_registro)
        agg.brands.add(row.marca_comercial)
      }
    }

    const now = new Date().toISOString()
    const ingredientRows = Array.from(ingredientMap.values()).map((agg) => ({
      ingredient_id: agg.ingredient_id,
      name: agg.name,
      name_display: agg.name_display,
      category: agg.category,
      molecule_class: Array.from(agg.classes).slice(0, 3).join(' / ') || null,
      brand_count: agg.brands.size,
      holder_count: agg.holders.size,
      last_seen_at: now,
    }))

    const { error: ingErr } = await supabase
      .from('active_ingredients')
      .upsert(ingredientRows, { onConflict: 'ingredient_id' })
    if (ingErr) throw new Error(`active_ingredients upsert failed: ${ingErr.message}`)

    const productRows = outcome.rows.map((row) => ({
      industry_id: holderToIndustryId.get(row.titular_registro.toUpperCase().trim()) || null,
      product_name: row.marca_comercial,
      active_ingredients: row._ingredients,
      product_type: categorize(row._classes),
      target_cultures: Array.from(new Set(row._uses.map((u) => u.culture).filter(Boolean))),
      agrofit_registro: row.numero_registro,
      toxicity_class: row._toxicity,
      environmental_class: row._environmental,
      formulation: row._formulation,
      url_agrofit: row._url,
      source_dataset: row._biological ? 'bioinsumos_federal' : 'agrofit_federal',
      scraped_at: now,
      confidentiality: 'public',
    }))

    const { data: upserted, error: prodErr } = await supabase
      .from('industry_products')
      .upsert(productRows, { onConflict: 'agrofit_registro' })
      .select('id, agrofit_registro')
    if (prodErr) throw new Error(`industry_products upsert failed: ${prodErr.message}`)

    const registroToProductId = new Map<string, number>()
    for (const r of upserted || []) {
      if (r.agrofit_registro) registroToProductId.set(r.agrofit_registro, r.id)
    }

    const useRows: Array<Record<string, unknown>> = []
    const ingredientLinkRows: Array<Record<string, unknown>> = []
    for (const row of outcome.rows) {
      const productId = registroToProductId.get(row.numero_registro)
      if (!productId) continue
      const seenUseKey = new Set<string>()
      for (const u of row._uses) {
        if (!u.culture) continue
        const culture_slug = slugify(u.culture)
        const pest_slug = slugify(u.pest) || null
        const key = `${culture_slug}|${pest_slug || ''}`
        if (seenUseKey.has(key)) continue
        seenUseKey.add(key)
        useRows.push({
          product_id: productId,
          culture: u.culture,
          culture_slug,
          pest: u.pest || null,
          pest_slug,
          source_dataset: row._biological ? 'bioinsumos_federal' : 'agrofit_federal',
        })
      }
      const seenIngId = new Set<string>()
      for (const ing of row._ingredients) {
        const id = slugify(ing)
        if (!id || seenIngId.has(id)) continue
        seenIngId.add(id)
        ingredientLinkRows.push({ product_id: productId, ingredient_id: id })
      }
    }

    let usesUpserted = 0, linksUpserted = 0
    if (useRows.length > 0) {
      const chunkSize = 500
      for (let i = 0; i < useRows.length; i += chunkSize) {
        const chunk = useRows.slice(i, i + chunkSize)
        const { error } = await supabase
          .from('industry_product_uses')
          .upsert(chunk, { onConflict: 'product_id,culture_slug,pest_slug', ignoreDuplicates: true })
        if (error && !error.message.includes('duplicate')) {
          throw new Error(`industry_product_uses upsert failed: ${error.message}`)
        }
        usesUpserted += chunk.length
      }
    }
    if (ingredientLinkRows.length > 0) {
      const chunkSize = 500
      for (let i = 0; i < ingredientLinkRows.length; i += chunkSize) {
        const chunk = ingredientLinkRows.slice(i, i + chunkSize)
        const { error } = await supabase
          .from('industry_product_ingredients')
          .upsert(chunk, { onConflict: 'product_id,ingredient_id', ignoreDuplicates: true })
        if (error && !error.message.includes('duplicate')) {
          throw new Error(`industry_product_ingredients upsert failed: ${error.message}`)
        }
        linksUpserted += chunk.length
      }
    }

    return {
      ok: true,
      status: outcome.status === 'success' ? 'success' : 'partial',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtDate.getTime(),
      recordsFetched: outcome.rowsFetched,
      recordsUpdated: productRows.length,
      errors: (outcome.validationErrors || []).map((e) => `row ${e.row_index} ${e.key}: expected ${e.expected}, got ${e.got}`),
      stats: {
        runId: outcome.runId,
        products_upserted: productRows.length,
        ingredients_upserted: ingredientRows.length,
        uses_upserted: usesUpserted,
        ingredient_links_upserted: linksUpserted,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
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
