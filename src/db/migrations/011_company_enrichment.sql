-- Company enrichment cache — stores Receita Federal data fetched on demand via BrasilAPI
-- Used by the "Consultar Empresa" feature in Diretório de Revendas

CREATE TABLE IF NOT EXISTS company_enrichment (
  cnpj_basico text PRIMARY KEY,            -- 8-digit CNPJ root
  razao_social text,
  natureza_juridica text,                   -- description (e.g. "Sociedade Empresária Limitada")
  capital_social numeric,
  porte text,                               -- "MICRO EMPRESA", "EMPRESA DE PEQUENO PORTE", "DEMAIS"
  situacao_cadastral text,                  -- "ATIVA", "BAIXADA", etc.
  data_situacao_cadastral date,
  data_inicio_atividade date,
  cnae_fiscal text,                         -- primary CNAE code
  cnae_fiscal_descricao text,               -- primary CNAE description
  opcao_simples boolean,
  opcao_mei boolean,
  email text,
  telefone text,
  qsa jsonb DEFAULT '[]'::jsonb,            -- array of partners (quadro societário)
  cnaes_secundarios jsonb DEFAULT '[]'::jsonb,
  raw_response jsonb,                       -- full API response for future use
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Index for stale-data queries
CREATE INDEX IF NOT EXISTS idx_company_enrichment_fetched ON company_enrichment(fetched_at);

COMMENT ON TABLE company_enrichment IS 'Cache of Receita Federal company data fetched on demand via BrasilAPI';
