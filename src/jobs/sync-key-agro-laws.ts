/**
 * Phase 25 — sync-key-agro-laws job module.
 * Logic moved from src/app/api/cron/sync-key-agro-laws/route.ts (Phase 24D).
 *
 * Refactor: scraper emits regulatory_norms-shaped rows directly.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import { classifyCnaes } from '@/lib/cnae-classifier'
import type { JobResult } from '@/jobs/types'

interface KeyLawRow extends Record<string, unknown> {
  id: string
  body: 'PRES_REPUBLICA' | 'CONGRESSO'
  norm_type: 'lei' | 'lei_complementar'
  norm_number: string
  title: string
  summary: string
  published_at: string
  effective_at: null
  impact_level: 'high' | 'medium' | 'low'
  affected_areas: string[]
  affected_cnaes: string[]
  source_url: string
}

const KEY_LAWS: Array<{
  id: string
  norm_number: string
  norm_type: 'lei' | 'lei_complementar'
  body: 'PRES_REPUBLICA' | 'CONGRESSO'
  published_at: string
  title: string
  summary: string
  source_url: string
  affected_areas: string[]
  impact_level: 'high' | 'medium' | 'low'
}> = [
  {
    id: 'lei-8929-1994',
    norm_number: '8.929/1994',
    norm_type: 'lei',
    body: 'CONGRESSO',
    published_at: '1994-08-22',
    title: 'Lei da CPR — Lei nº 8.929/1994',
    summary:
      'Institui a Cédula de Produto Rural (CPR), título de crédito vinculado à entrega futura de produtos agropecuários. Marco original do financiamento privado da safra brasileira; objeto de revisões posteriores que ampliaram seu alcance (Lei 13.986/2020 entre outras).',
    source_url: 'https://www.planalto.gov.br/ccivil_03/leis/l8929.htm',
    affected_areas: ['cpr', 'credito_rural', 'mercado_capitais'],
    impact_level: 'high',
  },
  {
    id: 'lei-11101-2005',
    norm_number: '11.101/2005',
    norm_type: 'lei',
    body: 'CONGRESSO',
    published_at: '2005-02-09',
    title: 'Lei das Falências e da Recuperação Judicial — Lei nº 11.101/2005',
    summary:
      'Regula a recuperação judicial, a recuperação extrajudicial e a falência do empresário e da sociedade empresária. Base legal de todos os pedidos de recuperação judicial monitorados na chapter Recuperação Judicial.',
    source_url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2005/lei/l11101.htm',
    affected_areas: ['risco', 'credito_rural'],
    impact_level: 'high',
  },
  {
    id: 'lei-13986-2020',
    norm_number: '13.986/2020',
    norm_type: 'lei',
    body: 'CONGRESSO',
    published_at: '2020-04-07',
    title: 'Nova Lei do Agro — Lei nº 13.986/2020',
    summary:
      'Cria o Fundo de Investimento nas Cadeias Produtivas Agroindustriais (FIAGRO), institui o patrimônio rural em afetação, e amplia/modulariza a CPR (incluindo CPR cambial). É o marco legal contemporâneo do financiamento privado e securitizado do agro brasileiro.',
    source_url: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l13986.htm',
    affected_areas: ['fiagro', 'cpr', 'credito_rural', 'mercado_capitais', 'fundos'],
    impact_level: 'high',
  },
]

const keyLawsScraper: ScraperFn<KeyLawRow> = async () => {
  const rows: KeyLawRow[] = KEY_LAWS.map((law) => ({
    id: law.id,
    body: law.body,
    norm_type: law.norm_type,
    norm_number: law.norm_number,
    title: law.title,
    summary: law.summary,
    published_at: law.published_at,
    effective_at: null,
    impact_level: law.impact_level,
    affected_areas: law.affected_areas,
    affected_cnaes: classifyCnaes({
      title: law.title,
      summary: law.summary,
      affected_areas: law.affected_areas,
    }),
    source_url: law.source_url,
  }))
  return { rows, httpStatus: 200, targetPeriod: new Date().toISOString().slice(0, 10) }
}

export function runSyncKeyAgroLaws(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-key-agro-laws',
    scraperFn: keyLawsScraper as ScraperFn<Record<string, unknown>>,
    targetTable: 'regulatory_norms',
    conflictKey: 'id',
  })
}
