/**
 * Phase 25 — sync-bcb-rural job module.
 * Logic moved from src/app/api/cron/sync-bcb-rural/route.ts (Phase 24D).
 *
 * Refactor: the scraper now emits regulatory_norms-shaped rows directly,
 * so runScraperJob can upsert without an intermediate mapping step.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import { classifyCnaes } from '@/lib/cnae-classifier'
import type { JobResult } from '@/jobs/types'

interface BCBNormRow extends Record<string, unknown> {
  id: string
  body: 'BCB'
  norm_type: string
  norm_number: null
  title: string
  summary: string
  published_at: string
  effective_at: null
  impact_level: 'high' | 'medium' | 'low'
  affected_areas: string[]
  affected_cnaes: string[]
  source_url: string
}

const BCB_REFERENCES: Array<{
  id: string
  title: string
  summary: string
  source_url: string
  affected_areas: string[]
  impact_level: 'high' | 'medium' | 'low'
  norm_type: string
}> = [
  {
    id: 'bcb-creditorural-portal',
    title: 'BCB — Portal do Crédito Rural',
    summary:
      'Página oficial do Banco Central do Brasil sobre o crédito rural. Reúne resoluções, circulares, manuais (MCR), comunicados e o Sistema de Operações do Crédito Rural e do Proagro (SICOR). Ponto de partida para acompanhar normas e parâmetros operacionais do crédito rural brasileiro.',
    source_url: 'https://www.bcb.gov.br/estabilidadefinanceira/creditorural',
    affected_areas: ['credito_rural', 'proagro'],
    impact_level: 'high',
    norm_type: 'outros',
  },
  {
    id: 'bcb-sicornoticias-portal',
    title: 'BCB — SICOR Notícias',
    summary:
      'Boletim de notícias e atualizações operacionais do Sistema de Operações do Crédito Rural e do Proagro (SICOR). Inclui notas técnicas sobre parâmetros, alterações de tabelas e comunicados aos agentes financeiros que operam crédito rural.',
    source_url: 'https://www.bcb.gov.br/estabilidadefinanceira/sicornoticias',
    affected_areas: ['credito_rural'],
    impact_level: 'medium',
    norm_type: 'comunicado',
  },
  {
    id: 'bcb-mcr',
    title: 'BCB — Manual de Crédito Rural (MCR)',
    summary:
      'Manual de Crédito Rural do BCB — referência consolidada das normas operacionais do crédito rural no Brasil. Atualizado continuamente; é a base normativa para todos os contratos enquadrados no SNCR.',
    source_url: 'https://www3.bcb.gov.br/mcr/Manual/Inicial',
    affected_areas: ['credito_rural', 'proagro', 'seguro_rural'],
    impact_level: 'high',
    norm_type: 'instrucao_normativa',
  },
  {
    id: 'bcb-cmn-resolucoes',
    title: 'BCB — Buscador de Normativos do CMN/BCB',
    summary:
      'Ferramenta de busca oficial do BCB para resoluções do Conselho Monetário Nacional, circulares do BCB, cartas-circulares e demais atos normativos. Cobre toda a hierarquia regulatória que afeta crédito rural, FIAGRO, CRA, LCA e instrumentos correlatos.',
    source_url: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas',
    affected_areas: ['credito_rural', 'fiagro', 'cra', 'lca', 'cpr'],
    impact_level: 'high',
    norm_type: 'outros',
  },
  {
    id: 'bcb-sicor-olinda',
    title: 'BCB — SICOR Open Data (Olinda OData)',
    summary:
      'API pública Olinda do BCB que expõe a Matriz de Dados do Crédito Rural (MDCR) — operações de crédito rural agregadas por município, produto, cultura e instituição financeira, atualizadas mensalmente. Base para análises quantitativas de financiamento rural.',
    source_url: 'https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/swagger-ui3',
    affected_areas: ['credito_rural'],
    impact_level: 'medium',
    norm_type: 'outros',
  },
]

const bcbRuralScraper: ScraperFn<BCBNormRow> = async () => {
  const today = new Date().toISOString().slice(0, 10)
  const rows: BCBNormRow[] = BCB_REFERENCES.map((r) => ({
    id: r.id,
    body: 'BCB',
    norm_type: r.norm_type,
    norm_number: null,
    title: r.title,
    summary: r.summary,
    published_at: today,
    effective_at: null,
    impact_level: r.impact_level,
    affected_areas: r.affected_areas,
    affected_cnaes: classifyCnaes({
      title: r.title,
      summary: r.summary,
      affected_areas: r.affected_areas,
    }),
    source_url: r.source_url,
  }))
  return { rows, httpStatus: 200, targetPeriod: today }
}

export function runSyncBcbRural(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-bcb-rural',
    scraperFn: bcbRuralScraper as ScraperFn<Record<string, unknown>>,
    targetTable: 'regulatory_norms',
    conflictKey: 'id',
  })
}
