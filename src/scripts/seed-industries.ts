/**
 * Seed the industries table with major ag-input manufacturers.
 * Maps known AGROFIT titular_registro name variants for product matching.
 *
 * Usage: npx tsx src/scripts/seed-industries.ts
 */
import { createClient } from '@supabase/supabase-js'
// @ts-ignore — dotenv loaded at runtime
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface IndustrySeed {
  id: string
  name: string
  name_display: string
  headquarters_country: string
  website: string
  segment: string[]
  description_pt: string
  agrofit_holder_names: string[]
}

const INDUSTRIES: IndustrySeed[] = [
  // --- 10 industries found in retailers.industria_1/2/3 ---
  {
    id: 'syngenta',
    name: 'SYNGENTA',
    name_display: 'Syngenta',
    headquarters_country: 'Suíça',
    website: 'syngenta.com.br',
    segment: ['defensivos', 'sementes', 'tratamento de sementes'],
    description_pt: 'Líder global em proteção de cultivos e sementes. Parte do grupo ChemChina/Sinochem.',
    agrofit_holder_names: [
      'SYNGENTA PROTECAO DE CULTIVOS LTDA',
      'SYNGENTA SEEDS LTDA',
      'SYNGENTA CROP PROTECTION',
      'SYNGENTA LIMITED',
    ],
  },
  {
    id: 'basf',
    name: 'BASF',
    name_display: 'BASF Agricultural Solutions',
    headquarters_country: 'Alemanha',
    website: 'basf.com/br/pt/agriculture',
    segment: ['defensivos', 'sementes', 'biologicos'],
    description_pt: 'Divisão agrícola da BASF. Portfólio diversificado em fungicidas, herbicidas e sementes.',
    agrofit_holder_names: [
      'BASF S.A.',
      'BASF SA',
      'BASF AGRICULTURAL SOLUTIONS',
    ],
  },
  {
    id: 'bayer',
    name: 'BAYER',
    name_display: 'Bayer CropScience',
    headquarters_country: 'Alemanha',
    website: 'cropscience.bayer.com.br',
    segment: ['defensivos', 'sementes', 'biotecnologia', 'digital'],
    description_pt: 'Referência global em proteção de cultivos, sementes e agricultura digital (Climate FieldView).',
    agrofit_holder_names: [
      'BAYER S.A.',
      'BAYER SA',
      'BAYER CROPSCIENCE LTDA',
      'MONSANTO DO BRASIL LTDA',
    ],
  },
  {
    id: 'corteva',
    name: 'CORTEVA',
    name_display: 'Corteva Agriscience',
    headquarters_country: 'EUA',
    website: 'corteva.com.br',
    segment: ['defensivos', 'sementes'],
    description_pt: 'Spin-off da DowDuPont focada em agricultura. Forte em sementes Pioneer e herbicidas.',
    agrofit_holder_names: [
      'CORTEVA AGRISCIENCE DO BRASIL LTDA',
      'DOW AGROSCIENCES INDUSTRIAL LTDA',
      'DUPONT DO BRASIL S.A.',
      'PIONEER SEMENTES LTDA',
    ],
  },
  {
    id: 'fmc',
    name: 'FMC',
    name_display: 'FMC Corporation',
    headquarters_country: 'EUA',
    website: 'fmc.com/br',
    segment: ['defensivos', 'biologicos'],
    description_pt: 'Especialista em inseticidas e herbicidas. Adquiriu portfólio de defensivos da DuPont.',
    agrofit_holder_names: [
      'FMC QUIMICA DO BRASIL LTDA',
      'FMC CORPORATION',
    ],
  },
  {
    id: 'upl',
    name: 'UPL',
    name_display: 'UPL Brasil',
    headquarters_country: 'Índia',
    website: 'upl-ltd.com/br',
    segment: ['defensivos', 'biologicos', 'sementes'],
    description_pt: 'Multinacional indiana, 5º maior grupo de agroquímicos do mundo. Foco em genéricos e biocontrole.',
    agrofit_holder_names: [
      'UPL DO BRASIL INDUSTRIA E COMERCIO DE INSUMOS AGROPECUARIOS S.A.',
      'UPL DO BRASIL S.A.',
      'UNITED PHOSPHORUS',
    ],
  },
  {
    id: 'adama',
    name: 'ADAMA',
    name_display: 'ADAMA Brasil',
    headquarters_country: 'Israel',
    website: 'adama.com/brasil',
    segment: ['defensivos'],
    description_pt: 'Líder em defensivos genéricos. Parte do grupo Syngenta/ChemChina.',
    agrofit_holder_names: [
      'ADAMA BRASIL S.A.',
      'ADAMA BRASIL S/A',
      'MILENIA AGROCIENCIAS S.A.',
    ],
  },
  {
    id: 'ihara',
    name: 'IHARA',
    name_display: 'IHARA / Iharabras',
    headquarters_country: 'Brasil/Japão',
    website: 'ihara.com.br',
    segment: ['defensivos'],
    description_pt: 'Joint venture japonesa-brasileira. Forte presença em inseticidas e fungicidas no mercado brasileiro.',
    agrofit_holder_names: [
      'IHARABRAS S.A. INDUSTRIAS QUIMICAS',
      'IHARABRAS S/A INDUSTRIAS QUIMICAS',
    ],
  },
  {
    id: 'nortox',
    name: 'NORTOX',
    name_display: 'Nortox S.A.',
    headquarters_country: 'Brasil',
    website: 'nortox.com.br',
    segment: ['defensivos'],
    description_pt: 'Maior empresa brasileira de defensivos genéricos, sediada em Londrina/PR.',
    agrofit_holder_names: [
      'NORTOX S.A.',
      'NORTOX S/A',
    ],
  },
  {
    id: 'sumitomo',
    name: 'SUMITOMO',
    name_display: 'Sumitomo Chemical',
    headquarters_country: 'Japão',
    website: 'sumitomo-chem.com.br',
    segment: ['defensivos', 'biologicos'],
    description_pt: 'Conglomerado japonês com forte portfólio em inseticidas e biodefensivos.',
    agrofit_holder_names: [
      'SUMITOMO CHEMICAL DO BRASIL REPRESENTACOES LTDA',
      'SUMITOMO CHEMICAL',
    ],
  },

  // --- Additional major players not yet in retailers data ---
  {
    id: 'nufarm',
    name: 'NUFARM',
    name_display: 'Nufarm Brasil',
    headquarters_country: 'Austrália',
    website: 'nufarm.com/br',
    segment: ['defensivos', 'sementes'],
    description_pt: 'Especializada em herbicidas e produtos para proteção de cultivos.',
    agrofit_holder_names: [
      'NUFARM INDUSTRIA QUIMICA E FARMACEUTICA S.A.',
      'NUFARM S.A.',
    ],
  },
  {
    id: 'albaugh',
    name: 'ALBAUGH',
    name_display: 'Albaugh do Brasil',
    headquarters_country: 'EUA',
    website: 'albaugh.com.br',
    segment: ['defensivos'],
    description_pt: 'Multinacional americana focada em herbicidas genéricos para grandes culturas.',
    agrofit_holder_names: [
      'ALBAUGH AGRO BRASIL LTDA',
    ],
  },
  {
    id: 'ourofino',
    name: 'OUROFINO',
    name_display: 'Ourofino Agrociência',
    headquarters_country: 'Brasil',
    website: 'ourofinoagrociencia.com.br',
    segment: ['defensivos', 'biologicos'],
    description_pt: 'Empresa brasileira com portfólio crescente em defensivos e bioinsumos.',
    agrofit_holder_names: [
      'OURO FINO QUIMICA S.A.',
      'OUROFINO AGROCIENCIA LTDA',
    ],
  },
  {
    id: 'sipcam',
    name: 'SIPCAM',
    name_display: 'Sipcam Nichino',
    headquarters_country: 'Itália/Japão',
    website: 'sipcam-nichino.com.br',
    segment: ['defensivos'],
    description_pt: 'Joint venture ítalo-japonesa com forte atuação no mercado brasileiro.',
    agrofit_holder_names: [
      'SIPCAM NICHINO BRASIL S.A.',
      'SIPCAM UPL BRASIL S.A.',
    ],
  },
  {
    id: 'arysta',
    name: 'ARYSTA',
    name_display: 'Arysta LifeScience (UPL)',
    headquarters_country: 'Japão',
    website: 'arystalifescience.com.br',
    segment: ['defensivos', 'biologicos'],
    description_pt: 'Adquirida pela UPL. Forte em biologicos e produtos especiais.',
    agrofit_holder_names: [
      'ARYSTA LIFESCIENCE DO BRASIL INDUSTRIA QUIMICA E AGROPECUARIA S.A.',
    ],
  },
  {
    id: 'mosaic',
    name: 'MOSAIC',
    name_display: 'Mosaic Fertilizantes',
    headquarters_country: 'EUA',
    website: 'mosaicco.com.br',
    segment: ['fertilizantes'],
    description_pt: 'Maior produtora de fosfato e potássio do mundo. Operação robusta no Brasil.',
    agrofit_holder_names: [],
  },
  {
    id: 'yara',
    name: 'YARA',
    name_display: 'Yara Brasil',
    headquarters_country: 'Noruega',
    website: 'yara.com.br',
    segment: ['fertilizantes', 'digital'],
    description_pt: 'Líder mundial em nutrição de cultivos e fertilizantes nitrogenados.',
    agrofit_holder_names: [],
  },
  {
    id: 'heringer',
    name: 'HERINGER',
    name_display: 'Heringer Fertilizantes',
    headquarters_country: 'Brasil',
    website: 'heringer.com.br',
    segment: ['fertilizantes'],
    description_pt: 'Uma das maiores misturadoras de fertilizantes do Brasil.',
    agrofit_holder_names: [],
  },
]

async function main() {
  console.log(`Seeding ${INDUSTRIES.length} industries...`)

  for (const ind of INDUSTRIES) {
    const { error } = await supabase.from('industries').upsert(
      {
        id: ind.id,
        name: ind.name,
        name_display: ind.name_display,
        headquarters_country: ind.headquarters_country,
        website: ind.website,
        segment: ind.segment,
        description_pt: ind.description_pt,
        agrofit_holder_names: ind.agrofit_holder_names,
      },
      { onConflict: 'id' }
    )

    if (error) {
      console.error(`  ERROR ${ind.id}:`, error.message)
    } else {
      console.log(`  ✓ ${ind.name_display} (${ind.segment.join(', ')})`)
    }
  }

  console.log('Done.')
}

main().catch(console.error)
