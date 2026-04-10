-- ============================================================
-- Migration 045 — data_sources table (Phase 25 — Source CRUD)
-- Depends on: nothing (additive)
-- ============================================================
--
-- Promotes the static `src/data/source-registry.json` (176 entries) into
-- a real Supabase table so the user can:
--   - Add new sources from the Ingestão de Dados UI
--   - Edit existing entries (notes, category, frequency, used_in_app)
--   - Toggle active/inactive
--   - See last_checked_at update from the weekly Sunday cron
--
-- The JSON file stays in the repo as the seed-data audit trail (and is
-- still loaded as a fallback if the API ever errors out), but the table
-- becomes the live source-of-truth.
--
-- Schema mirrors the JSON shape 1:1 plus 4 new columns:
--   - active           (soft-disable / hide from UI)
--   - confidentiality  (public default — same enum as the rest of the project)
--   - created_at / updated_at (audit)

create table if not exists data_sources (
  id                text primary key,
  name              text not null,
  source_org        text,
  category          text not null default 'outros',
  data_type         text,
  description       text,
  frequency         text not null default 'nao_informado',
  url               text not null,
  url_secondary     text,
  server            text,
  automated         boolean not null default false,
  notes             text,
  origin_file       text,
  url_status        text not null default 'unchecked'
                    check (url_status in ('active', 'inactive', 'error', 'unchecked')),
  http_status       integer,
  last_checked_at   timestamptz,
  last_known_update timestamptz,
  used_in_app       boolean not null default false,

  -- Phase 25 additions
  active            boolean not null default true,
  confidentiality   text not null default 'public'
                    check (confidentiality in ('public', 'agrisafe_published', 'agrisafe_confidential', 'client_confidential')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table data_sources is
  'Phase 25: live registry of ingestion sources. Seeded from src/data/source-registry.json (176 entries). User-added rows have origin_file=manual.';

-- ─── Indexes ──────────────────────────────────────────────────────────

create index if not exists idx_data_sources_category
  on data_sources (category);

create index if not exists idx_data_sources_url_status
  on data_sources (url_status);

create index if not exists idx_data_sources_active
  on data_sources (active) where active = true;

create index if not exists idx_data_sources_used_in_app
  on data_sources (used_in_app) where used_in_app = true;

-- ─── updated_at trigger ───────────────────────────────────────────────

create or replace function set_data_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_data_sources_updated_at on data_sources;
create trigger trg_data_sources_updated_at
  before update on data_sources
  for each row execute function set_data_sources_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────
-- Service-role only for now (matches the rest of the public-data tables).
-- Add tier-aware policies when multi-user RBAC lands.

alter table data_sources enable row level security;

drop policy if exists "data_sources public read" on data_sources;
create policy "data_sources public read"
  on data_sources for select
  using (true);
