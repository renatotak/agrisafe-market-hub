-- User-editable company notes — fields that are NOT from Receita Federal
-- Users can add/edit faturamento observations, custom classifications, general notes
CREATE TABLE IF NOT EXISTS company_notes (
  id serial PRIMARY KEY,
  cnpj_basico text NOT NULL,
  field_key text NOT NULL,            -- e.g., 'faturamento_obs', 'notas', 'contato_comercial'
  value text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(cnpj_basico, field_key)
);

CREATE INDEX IF NOT EXISTS idx_company_notes_cnpj ON company_notes(cnpj_basico);

-- Web research knowledge — saved results from web searches about companies
CREATE TABLE IF NOT EXISTS company_research (
  id serial PRIMARY KEY,
  cnpj_basico text NOT NULL,
  razao_social text,
  search_query text NOT NULL,
  findings jsonb DEFAULT '[]'::jsonb,   -- array of {title, snippet, url}
  summary text,                         -- AI-generated summary
  searched_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_research_cnpj ON company_research(cnpj_basico);

COMMENT ON TABLE company_notes IS 'User-editable notes per company — complements official Receita Federal data';
COMMENT ON TABLE company_research IS 'Web research knowledge about companies — searchable intelligence';
