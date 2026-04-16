-- ============================================================
-- Migration 071 — Themed lens support for daily briefings
-- Phase 6c: rotating daily theme + anti-repetition memory
-- ============================================================

-- Add theme column to executive_briefings
ALTER TABLE executive_briefings
  ADD COLUMN IF NOT EXISTS theme text;

COMMENT ON COLUMN executive_briefings.theme IS
  'Rotating daily theme lens: commodities, regulatory, competitors, content_opportunities, weekly_recap, market_outlook';

-- Seed the daily_themed_briefing analysis lens
INSERT INTO analysis_lenses (id, kind, label_pt, label_en, description, search_template, system_prompt, is_builtin, enabled)
VALUES (
  'daily_themed_briefing',
  'task',
  'Briefing Temático Diário',
  'Daily Themed Briefing',
  'Lente rotativa para o briefing executivo diário. Segunda=commodities, Terça=regulatório, Quarta=concorrentes, Quinta=oportunidades de conteúdo, Sexta=recapitulação semanal, Sáb/Dom=perspectiva de mercado.',
  'agronegócio Brasil {{theme}}',
  'Lente de briefing temático — o tema do dia é injetado pelo job sync-daily-briefing.',
  true,
  true
)
ON CONFLICT (id) DO NOTHING;
