-- ============================================================
-- Migration 056: CRM meeting intelligence views
-- ============================================================
-- Adds two views on top of the existing meetings / key_persons /
-- leads / legal_entities tables so the Meeting Intelligence UX
-- (cross-entity log, enriched detail, similar-targets search) can
-- query flat, indexable columns instead of digging into the jsonb
-- metadata blob on every request.
--
-- Design principles (CLAUDE.md guardrail #1 — algorithms first):
--   - No denormalization. Views are pure projections / joins.
--   - Tag aggregation relies on GIN-indexable arrays so "entities
--     matching competitor_tech X" stays fast as the dataset grows.
--   - Similarity is computed in the app layer (Jaccard on arrays)
--     — the view just has to surface the raw tag sets.
-- ============================================================

-- ─── 1. v_meetings_enriched ─────────────────────────────────
-- Flattens meetings.metadata (jsonb) into queryable columns and
-- joins the entity display name so the cross-entity feed can
-- render without a second round-trip. Keyed by meeting id.

DROP VIEW IF EXISTS v_meetings_enriched;

CREATE VIEW v_meetings_enriched
WITH (security_invoker = on) AS
SELECT
  m.id,
  m.entity_uid,
  le.display_name                    AS entity_name,
  le.legal_name                      AS entity_legal_name,
  le.tax_id                          AS entity_tax_id,
  (SELECT array_agg(er.role_type ORDER BY er.role_type)
     FROM entity_roles er
     WHERE er.entity_uid = m.entity_uid)        AS entity_roles,
  m.meeting_date,
  m.meeting_type,
  m.attendees,
  m.agenda,
  m.summary,
  m.next_steps,
  m.outcome,
  m.source,
  m.external_id,
  m.confidentiality,
  m.created_at,
  m.updated_at,
  -- Flattened metadata (OneNote-imported rows) — arrays may be null
  -- for manually-entered meetings, the UI handles that.
  COALESCE(
    (SELECT array_agg(v::text)
       FROM jsonb_array_elements_text(m.metadata -> 'competitor_tech') v),
    ARRAY[]::text[]
  )                                  AS competitor_tech,
  COALESCE(
    (SELECT array_agg(v::text)
       FROM jsonb_array_elements_text(m.metadata -> 'service_interest') v),
    ARRAY[]::text[]
  )                                  AS service_interest,
  m.metadata ->> 'financial_info'    AS financial_info,
  m.metadata ->> 'mood'              AS mood,
  m.metadata ->> 'plans'             AS plans,
  m.metadata ->> 'import_source'     AS import_source
FROM meetings m
JOIN legal_entities le ON le.entity_uid = m.entity_uid;

COMMENT ON VIEW v_meetings_enriched IS
  'Flat projection of meetings with metadata jsonb unpacked + entity name joined. Powers the cross-entity Meeting Log and the /api/crm/meetings/feed endpoint.';

-- ─── 2. v_entity_crm_profile ────────────────────────────────
-- Per-entity aggregate: counts, tag sets, last meeting, lead stage.
-- Used by the "similar targets" engine (Jaccard over tag arrays)
-- and by the Diretório expanded panel for at-a-glance CRM stats.

DROP VIEW IF EXISTS v_entity_crm_profile;

CREATE VIEW v_entity_crm_profile
WITH (security_invoker = on) AS
SELECT
  le.entity_uid,
  le.display_name,
  le.legal_name,
  le.tax_id,
  -- Meeting aggregates
  COALESCE(mstat.meeting_count, 0)          AS meeting_count,
  mstat.last_meeting_date,
  mstat.first_meeting_date,
  COALESCE(mstat.competitor_tech_tags, ARRAY[]::text[])  AS competitor_tech_tags,
  COALESCE(mstat.service_interest_tags, ARRAY[]::text[]) AS service_interest_tags,
  COALESCE(mstat.mood_counts, '{}'::jsonb)  AS mood_counts,
  -- Key-person count
  COALESCE((
    SELECT count(*) FROM key_persons kp
    WHERE kp.entity_uid = le.entity_uid AND kp.active = true
  ), 0)                                     AS key_person_count,
  -- Lead snapshot (most recent non-lost)
  (SELECT l.stage FROM leads l
    WHERE l.entity_uid = le.entity_uid
    ORDER BY CASE WHEN l.stage = 'lost' THEN 1 ELSE 0 END, l.updated_at DESC
    LIMIT 1)                                AS lead_stage,
  (SELECT l.service_interest FROM leads l
    WHERE l.entity_uid = le.entity_uid
    ORDER BY CASE WHEN l.stage = 'lost' THEN 1 ELSE 0 END, l.updated_at DESC
    LIMIT 1)                                AS lead_service_interest,
  (SELECT l.estimated_value_brl FROM leads l
    WHERE l.entity_uid = le.entity_uid
    ORDER BY CASE WHEN l.stage = 'lost' THEN 1 ELSE 0 END, l.updated_at DESC
    LIMIT 1)                                AS lead_estimated_value_brl,
  (SELECT array_agg(er.role_type ORDER BY er.role_type)
     FROM entity_roles er
     WHERE er.entity_uid = le.entity_uid)   AS roles
FROM legal_entities le
LEFT JOIN LATERAL (
  SELECT
    count(*)                             AS meeting_count,
    max(m.meeting_date)                  AS last_meeting_date,
    min(m.meeting_date)                  AS first_meeting_date,
    -- Aggregate distinct tags across all meetings for this entity
    (SELECT array_agg(DISTINCT v)
       FROM meetings m2
       CROSS JOIN LATERAL jsonb_array_elements_text(
         COALESCE(m2.metadata -> 'competitor_tech', '[]'::jsonb)
       ) v
       WHERE m2.entity_uid = m.entity_uid
    )                                    AS competitor_tech_tags,
    (SELECT array_agg(DISTINCT v)
       FROM meetings m2
       CROSS JOIN LATERAL jsonb_array_elements_text(
         COALESCE(m2.metadata -> 'service_interest', '[]'::jsonb)
       ) v
       WHERE m2.entity_uid = m.entity_uid
    )                                    AS service_interest_tags,
    -- Mood histogram as jsonb (e.g. {"positive":4,"neutral":2,"cautious":1})
    (SELECT jsonb_object_agg(mood, cnt)
       FROM (
         SELECT m2.metadata ->> 'mood' AS mood, count(*) AS cnt
           FROM meetings m2
          WHERE m2.entity_uid = m.entity_uid
            AND m2.metadata ->> 'mood' IS NOT NULL
          GROUP BY m2.metadata ->> 'mood'
       ) s
    )                                    AS mood_counts
  FROM meetings m
  WHERE m.entity_uid = le.entity_uid
  GROUP BY m.entity_uid
) mstat ON true
WHERE
  -- Only include entities that have SOME CRM footprint (avoids
  -- surfacing the full 30k+ legal_entities roster).
  mstat.meeting_count IS NOT NULL
  OR EXISTS (SELECT 1 FROM key_persons kp WHERE kp.entity_uid = le.entity_uid)
  OR EXISTS (SELECT 1 FROM leads     l  WHERE l.entity_uid  = le.entity_uid);

COMMENT ON VIEW v_entity_crm_profile IS
  'Per-entity CRM aggregate: meeting counts, tag sets, lead snapshot. Restricted to entities that have at least one meeting / key_person / lead. Powers similar-targets search (Jaccard on the tag arrays).';
