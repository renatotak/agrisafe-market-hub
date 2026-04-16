-- ============================================================
-- Migration 073: Add 'financial_institution' to entity_roles CHECK
-- ============================================================
-- Phase 6f — the reclassification panel needs financial_institution
-- as a valid role_type.

ALTER TABLE entity_roles DROP CONSTRAINT IF EXISTS entity_roles_role_type_check;
ALTER TABLE entity_roles ADD CONSTRAINT entity_roles_role_type_check
  CHECK (role_type IN (
    'industry','retailer','cooperative','frigorifico','trader','distribuidor',
    'rural_producer','professional','government','competitor',
    'agrisafe_client','agrisafe_partner','financial_institution','other'
  ));
