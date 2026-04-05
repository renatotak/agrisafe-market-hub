/**
 * Migrate free-text industria_1/2/3 from retailers into retailer_industries junction.
 * Must run AFTER seed-industries.ts to have the industries table populated.
 *
 * Usage: npx tsx src/scripts/normalize-industries.ts
 */
import { createClient } from '@supabase/supabase-js'
// @ts-ignore — dotenv loaded at runtime
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // 1. Load industry name→id lookup
  const { data: industries, error: indError } = await supabase
    .from('industries')
    .select('id, name')

  if (indError || !industries?.length) {
    console.error('No industries found. Run seed-industries.ts first.')
    return
  }

  const nameLookup = new Map<string, string>()
  for (const ind of industries) {
    nameLookup.set(ind.name.toUpperCase().trim(), ind.id)
  }
  console.log(`Loaded ${nameLookup.size} industries for matching.`)

  // 2. Fetch all retailers with any industria_* value
  const { data: retailers, error: retError } = await supabase
    .from('retailers')
    .select('cnpj_raiz, industria_1, industria_2, industria_3')

  if (retError) {
    console.error('Error fetching retailers:', retError.message)
    return
  }

  console.log(`Processing ${retailers?.length || 0} retailers...`)

  let inserted = 0
  let skipped = 0
  let unmatched = new Set<string>()

  for (const r of retailers || []) {
    const fields = [r.industria_1, r.industria_2, r.industria_3]

    for (const val of fields) {
      if (!val || !val.trim() || val.trim() === '0') continue

      const normalized = val.trim().toUpperCase()
      const industryId = nameLookup.get(normalized)

      if (!industryId) {
        unmatched.add(normalized)
        continue
      }

      const { error } = await supabase.from('retailer_industries').upsert(
        {
          cnpj_raiz: r.cnpj_raiz,
          industry_id: industryId,
          relationship_type: 'distributor',
          source: 'imported',
          confidence: 1.0,
        },
        { onConflict: 'cnpj_raiz,industry_id' }
      )

      if (error) {
        skipped++
      } else {
        inserted++
      }
    }
  }

  console.log(`\nResults:`)
  console.log(`  Inserted/Updated: ${inserted}`)
  console.log(`  Skipped (errors): ${skipped}`)

  if (unmatched.size > 0) {
    console.log(`  Unmatched values (${unmatched.size}):`)
    for (const v of [...unmatched].sort()) {
      console.log(`    - "${v}"`)
    }
  }

  console.log('Done.')
}

main().catch(console.error)
