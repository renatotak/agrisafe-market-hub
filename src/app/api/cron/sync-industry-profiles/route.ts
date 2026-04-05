import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

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

async function searchAgrofitByHolder(
  token: string,
  holderNames: string[]
): Promise<any[]> {
  const allProducts: any[] = []

  for (const holder of holderNames) {
    try {
      const res = await fetch(
        `${AGROFIT_BASE}/defensivos?titular_registro=${encodeURIComponent(holder)}&page=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) continue
      const json = await res.json()
      const items = json.dados || json.data || []
      if (Array.isArray(items)) allProducts.push(...items)
    } catch {
      // skip
    }
  }

  return allProducts
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const token = await getAgrofitToken()

    // Pick industries not recently synced
    const { data: industries, error: indError } = await supabase
      .from('industries')
      .select('id, name, name_display, agrofit_holder_names, updated_at')
      .order('updated_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (indError) throw indError
    if (!industries?.length) {
      return NextResponse.json({ success: true, message: 'No industries to sync', synced: 0 })
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

        // Compute retailer count and geographic coverage for this industry
        const { count: retailerCount } = await supabase
          .from('retailer_industries')
          .select('id', { count: 'exact', head: true })
          .eq('industry_id', industry.id)

        // Update industry timestamp
        await supabase
          .from('industries')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', industry.id)

      } catch (e: any) {
        errors.push(`${industry.id}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Industry profiles sync completed',
      timestamp: new Date().toISOString(),
      stats: {
        industries_processed: industries.length,
        products_synced: totalProducts,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error in sync-industry-profiles:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync industry profiles' },
      { status: 500 }
    )
  }
}
