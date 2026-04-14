import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/industries — list all industries with stats
 * GET /api/industries?id=syngenta — single industry with products + retailers
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  try {
    const supabase = createAdminClient()

    if (id) {
      // Single industry detail
      const { data: industry, error } = await supabase
        .from('industries')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error || !industry) {
        return NextResponse.json({ error: 'Industry not found' }, { status: 404 })
      }

      // Products
      const { data: products } = await supabase
        .from('industry_products')
        .select('*')
        .eq('industry_id', id)
        .order('product_name')

      // Retailer links
      const { data: retailerLinks } = await supabase
        .from('retailer_industries')
        .select('retailer_entity_uid, relationship_type')
        .eq('industry_id', id)
        .limit(100)

      // Resolve retailer details
      const uids = (retailerLinks || []).map((r: any) => r.retailer_entity_uid).filter(Boolean)
      let retailerDetails: Record<string, any> = {}
      if (uids.length > 0) {
        const { data: retData } = await supabase
          .from('retailers')
          .select('entity_uid, razao_social, nome_fantasia, consolidacao, grupo_acesso, classificacao')
          .in('entity_uid', uids)
        for (const ret of retData || []) {
          retailerDetails[ret.entity_uid] = ret
        }
      }
      
      let ufCoverage: string[] = []
      if (uids.length > 0) {
        // Map uids to tax_ids to lookup in retailer_locations (which still uses cnpj_raiz)
        const { data: entities } = await supabase
          .from('legal_entities')
          .select('tax_id')
          .in('entity_uid', uids.slice(0, 200))
        
        const taxIds = (entities || []).map(e => e.tax_id).filter(Boolean)
        if (taxIds.length > 0) {
          const { data: locs } = await supabase
            .from('retailer_locations')
            .select('uf')
            .in('cnpj_raiz', taxIds)
            .not('uf', 'is', null)

          ufCoverage = [...new Set((locs || []).map(l => l.uf).filter(Boolean))]
        }
      }

      return NextResponse.json({
        industry,
        products: products || [],
        retailers: (retailerLinks || []).map((r: any) => ({
          entity_uid: r.retailer_entity_uid,
          relationship_type: r.relationship_type,
          ...(retailerDetails[r.retailer_entity_uid] || {}),
        })),
        stats: {
          product_count: products?.length || 0,
          retailer_count: retailerLinks?.length || 0,
          uf_coverage: ufCoverage,
        },
      })
    }

    // List all industries — union of two sources:
    //   1. `industries` table (curated catalog with rich slugs) — original 18
    //   2. legal_entities + entity_roles where role_type='industry' — the
    //      bulk imports (Phase 24A2: industries CSV backfill, 2026-04-07)
    //
    // Both surface as a single list with a `kind` discriminator. Curated
    // entries are clickable for drill-down (existing /api/industries?id=X
    // path); imported entries surface their RF metadata inline on the card.
    const [{ data: curated, error: listError }, { data: prodCounts }, { data: retCounts }, { data: imported }] =
      await Promise.all([
        supabase
          .from('industries')
          .select('id, name, name_display, segment, headquarters_country, website, entity_uid')
          .order('name'),
        supabase.from('industry_products').select('industry_id'),
        supabase.from('retailer_industries').select('industry_id'),
        supabase
          .from('entity_roles')
          .select('entity_uid, metadata, legal_entities!inner(entity_uid, tax_id, display_name, legal_name)')
          .eq('role_type', 'industry')
          .not('legal_entities.tax_id', 'is', null), // CSV-imported entities have a real CNPJ
      ])

    if (listError) throw listError

    const prodMap: Record<string, number> = {}
    for (const p of prodCounts || []) {
      prodMap[p.industry_id] = (prodMap[p.industry_id] || 0) + 1
    }
    const retMap: Record<string, number> = {}
    for (const r of retCounts || []) {
      retMap[r.industry_id] = (retMap[r.industry_id] || 0) + 1
    }

    // Build entity_uid → imported-row lookup so we can hand RF metadata
    // to the curated row when the two are linked (mig 061 + backfill).
    const importedByEntityUid = new Map<string, any>()
    for (const er of imported || []) {
      const le: any = (er as any).legal_entities || {}
      if (le.entity_uid) importedByEntityUid.set(le.entity_uid, er)
    }

    // Track which entity_uids have been claimed by a curated card so we
    // don't render a second "imported" card for the same actor.
    const consumedEntityUids = new Set<string>()

    // Curated cards (rich brand-profile, clickable for drill-down). When
    // linked to a legal_entity via entity_uid, we hydrate the card with
    // RF metadata (CNPJ, CNAE, porte, etc.) so the user gets a single
    // unified view.
    const curatedItems = (curated || []).map((ind: any) => {
      const linked = ind.entity_uid ? importedByEntityUid.get(ind.entity_uid) : null
      if (linked) consumedEntityUids.add(ind.entity_uid)
      const m = linked?.metadata || {}
      const le = linked?.legal_entities || {}
      return {
        id: ind.id,                 // keep the slug so drill-down still works
        entity_uid: ind.entity_uid || null,
        kind: 'curated' as const,
        name: ind.name,
        name_display: ind.name_display,
        segment: (ind.segment && ind.segment.length > 0)
          ? ind.segment
          : cnaeToSegment(m.cnae_fiscal_descricao || ''),
        headquarters_country: ind.headquarters_country,
        website: ind.website,
        product_count: prodMap[ind.id] || 0,
        retailer_count: retMap[ind.id] || 0,
        // Pulled in from the linked legal_entity (when present)
        cnpj: le.tax_id || null,
        cnae: m.cnae_fiscal || null,
        cnae_descricao: m.cnae_fiscal_descricao || null,
        capital_social: m.capital_social ?? null,
        porte: m.porte || null,
        inpev: m.inpev === true,
        cnpj_filiais: m.cnpj_filiais ?? 0,
        natureza_juridica: m.natureza_juridica || null,
      }
    })

    // Imported cards — only those NOT already represented by a curated
    // row. The id is the entity_uid so the UI can route drill-down
    // through a future entity-aware profile endpoint.
    const importedItems = (imported || [])
      .filter((er: any) => !consumedEntityUids.has(((er as any).legal_entities || {}).entity_uid))
      .map((er: any) => {
        const m = er.metadata || {}
        const le = er.legal_entities || {}
        return {
          id: er.entity_uid,
          entity_uid: er.entity_uid,
          kind: 'imported' as const,
          name: le.display_name || le.legal_name || '—',
          name_display: le.display_name || le.legal_name || '—',
          segment: cnaeToSegment(m.cnae_fiscal_descricao || ''),
          headquarters_country: null,
          website: null,
          product_count: 0,
          retailer_count: 0,
          cnpj: le.tax_id,
          cnae: m.cnae_fiscal,
          cnae_descricao: m.cnae_fiscal_descricao,
          capital_social: m.capital_social ?? null,
          porte: m.porte,
          inpev: m.inpev === true,
          cnpj_filiais: m.cnpj_filiais ?? 0,
          natureza_juridica: m.natureza_juridica,
        }
      })

    return NextResponse.json({
      industries: [...curatedItems, ...importedItems],
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

/**
 * Map a Receita Federal CNAE description to one of the segment buckets the
 * Diretório de Indústrias UI uses for filtering. Pure regex — guardrail #1.
 * Returns an array because some descriptions span multiple buckets.
 */
function cnaeToSegment(cnaeDesc: string): string[] {
  if (!cnaeDesc) return []
  const t = cnaeDesc.toLowerCase()
  const segments: string[] = []
  if (/defensiv/.test(t)) segments.push('defensivos')
  if (/fertiliz|adubo|corretivo/.test(t)) segments.push('fertilizantes')
  if (/sement/.test(t)) segments.push('sementes')
  if (/biol[óo]gic|inoculan|bioinsumo/.test(t)) segments.push('biologicos')
  if (/farmac[êe]utic|farmoqu[íi]mic|medicament/.test(t)) segments.push('farmaceuticos')
  if (/alimento|nutri[çc][ãa]o anim/.test(t)) segments.push('nutricao_animal')
  if (/m[áa]quin|equipamento agr[íi]col/.test(t)) segments.push('maquinas')
  if (/qu[íi]mic/.test(t) && segments.length === 0) segments.push('quimicos')
  if (segments.length === 0) segments.push('outros')
  return segments
}
