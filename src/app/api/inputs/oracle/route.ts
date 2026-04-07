/**
 * Phase 20 — Inteligência de Insumos Oracle.
 *
 * Substitution query endpoint. Given a culture (and optionally a pest or a
 * specific brand or active ingredient), returns a list of registered active
 * ingredients targeting that culture/pest, with all the commercial brands
 * available for each one. The "cheaper alternative" angle is exposed via
 * `holder_count` (more holders = more competitive market = the molecule has
 * generic versions, not just a single patented brand).
 *
 * Algorithmic only — JOIN through v_oracle_brand_alternatives. No LLM.
 *
 * Query params:
 *   culture           required — slug like 'soja', 'milho'
 *   pest              optional — slug like 'ferrugem-asiatica'
 *   ingredient_id     optional — narrow to one molecule
 *   category          optional — 'herbicida' | 'inseticida' | 'fungicida' | ...
 *   limit             optional, default 50, max 200
 *
 * Response:
 *   {
 *     success: true,
 *     culture: '...',
 *     pest: '...' | null,
 *     molecules: [
 *       {
 *         ingredient_id, ingredient_name, ingredient_display, category,
 *         holder_count, brand_count, competitiveness: 'patented'|'limited'|'generic'|'commodity',
 *         brands: [
 *           { product_id, product_name, manufacturer_display, formulation, toxicity_class, url_agrofit }, ...
 *         ]
 *       }, ...
 *     ],
 *     total_brands: N,
 *     fetched_at: '...'
 *   }
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 600 // 10 min

interface OracleRow {
  ingredient_id: string
  ingredient_name: string
  ingredient_display: string | null
  ingredient_category: string | null
  holder_count: number
  brand_count: number
  culture_slug: string
  culture: string
  pest_slug: string | null
  pest: string | null
  product_id: number
  product_name: string
  industry_id: string | null
  toxicity_class: string | null
  environmental_class: string | null
  formulation: string | null
  url_agrofit: string | null
  manufacturer_display: string | null
  headquarters_country: string | null
}

interface MoleculeBrand {
  product_id: number
  product_name: string
  manufacturer_display: string | null
  manufacturer_country: string | null
  formulation: string | null
  toxicity_class: string | null
  environmental_class: string | null
  url_agrofit: string | null
}

interface MoleculeGroup {
  ingredient_id: string
  ingredient_name: string
  ingredient_display: string | null
  category: string | null
  holder_count: number
  brand_count: number
  competitiveness: 'patented' | 'limited' | 'generic' | 'commodity'
  brands: MoleculeBrand[]
}

function classifyCompetitiveness(holderCount: number): MoleculeGroup['competitiveness'] {
  if (holderCount <= 1) return 'patented' // single holder, likely still under patent
  if (holderCount <= 3) return 'limited' // a couple of generics
  if (holderCount <= 10) return 'generic'
  return 'commodity' // 10+ holders = highly competitive market
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const culture = url.searchParams.get('culture')
  const pest = url.searchParams.get('pest')
  const ingredientId = url.searchParams.get('ingredient_id')
  const category = url.searchParams.get('category')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)

  if (!culture) {
    return NextResponse.json(
      { success: false, error: 'culture query param is required' },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()

    // The view returns one row per (ingredient × product × use). Filter by
    // culture_slug, optionally narrow by pest_slug / ingredient_id / category.
    let query = supabase
      .from('v_oracle_brand_alternatives')
      .select('*')
      .eq('culture_slug', culture)
      .limit(limit * 5) // generous because we'll group client-side

    if (pest) query = query.eq('pest_slug', pest)
    if (ingredientId) query = query.eq('ingredient_id', ingredientId)
    if (category) query = query.eq('ingredient_category', category)

    const { data, error } = await query
    if (error) throw error

    const rows = (data || []) as OracleRow[]

    // Group by ingredient_id; dedupe brands within a group by product_id.
    const groups = new Map<string, MoleculeGroup>()
    const seenBrandPerGroup = new Map<string, Set<number>>()

    for (const r of rows) {
      let g = groups.get(r.ingredient_id)
      if (!g) {
        g = {
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredient_name,
          ingredient_display: r.ingredient_display,
          category: r.ingredient_category,
          holder_count: r.holder_count,
          brand_count: r.brand_count,
          competitiveness: classifyCompetitiveness(r.holder_count),
          brands: [],
        }
        groups.set(r.ingredient_id, g)
        seenBrandPerGroup.set(r.ingredient_id, new Set())
      }
      const seenSet = seenBrandPerGroup.get(r.ingredient_id)!
      if (seenSet.has(r.product_id)) continue
      seenSet.add(r.product_id)
      g.brands.push({
        product_id: r.product_id,
        product_name: r.product_name,
        manufacturer_display: r.manufacturer_display,
        manufacturer_country: r.headquarters_country,
        formulation: r.formulation,
        toxicity_class: r.toxicity_class,
        environmental_class: r.environmental_class,
        url_agrofit: r.url_agrofit,
      })
    }

    // Sort groups: most competitive (highest holder_count) first — these are
    // the molecules where the user has the most "cheap alternative" options.
    // Within each group, sort brands alphabetically.
    const molecules = Array.from(groups.values())
      .sort((a, b) => b.holder_count - a.holder_count || b.brand_count - a.brand_count)
      .slice(0, limit)
    for (const m of molecules) {
      m.brands.sort((a, b) => a.product_name.localeCompare(b.product_name))
    }

    const totalBrands = molecules.reduce((acc, m) => acc + m.brands.length, 0)

    return NextResponse.json({
      success: true,
      culture,
      pest: pest || null,
      ingredient_id: ingredientId || null,
      category: category || null,
      molecules,
      total_brands: totalBrands,
      total_molecules: molecules.length,
      fetched_at: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { success: false, error: message, molecules: [] },
      { status: 500 }
    )
  }
}
