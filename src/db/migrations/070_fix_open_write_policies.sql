-- Migration 070: Fix 18 tables with overly permissive write policies
-- These policies used USING(true) / WITH CHECK(true) instead of
-- restricting writes to service_role. The anon key (client-side)
-- could INSERT/UPDATE/DELETE on all 18 tables.

BEGIN;

-- 1. api_keys (CRITICAL — anyone could create API keys)
DROP POLICY IF EXISTS "Service role write api_keys" ON api_keys;
CREATE POLICY "service_write_api_keys" ON api_keys
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 2. api_access_logs
DROP POLICY IF EXISTS "Service role write api_access_logs" ON api_access_logs;
CREATE POLICY "service_write_api_access_logs" ON api_access_logs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 3. macro_statistics
DROP POLICY IF EXISTS "Service role write macro_statistics" ON macro_statistics;
CREATE POLICY "service_write_macro_statistics" ON macro_statistics
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 4. active_ingredients
DROP POLICY IF EXISTS "Service role write active_ingredients" ON active_ingredients;
CREATE POLICY "service_write_active_ingredients" ON active_ingredients
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 5. industry_product_ingredients
DROP POLICY IF EXISTS "Service role write industry_product_ingredients" ON industry_product_ingredients;
CREATE POLICY "service_write_industry_product_ingredients" ON industry_product_ingredients
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 6. industry_product_uses
DROP POLICY IF EXISTS "Service role write industry_product_uses" ON industry_product_uses;
CREATE POLICY "service_write_industry_product_uses" ON industry_product_uses
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 7. scraper_registry
DROP POLICY IF EXISTS "Service role write scraper_registry" ON scraper_registry;
CREATE POLICY "service_write_scraper_registry" ON scraper_registry
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 8. scraper_runs
DROP POLICY IF EXISTS "Service role write scraper_runs" ON scraper_runs;
CREATE POLICY "service_write_scraper_runs" ON scraper_runs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 9. scraper_knowledge
DROP POLICY IF EXISTS "Service role write scraper_knowledge" ON scraper_knowledge;
CREATE POLICY "service_write_scraper_knowledge" ON scraper_knowledge
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 10. entity_merge_log
DROP POLICY IF EXISTS "Service write entity_merge_log" ON entity_merge_log;
CREATE POLICY "service_write_entity_merge_log" ON entity_merge_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 11. entity_features
DROP POLICY IF EXISTS "Service write entity_features" ON entity_features;
CREATE POLICY "service_write_entity_features" ON entity_features
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 12. published_article_links
DROP POLICY IF EXISTS "Service write published_article_links" ON published_article_links;
CREATE POLICY "service_write_published_article_links" ON published_article_links
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 13. chat_threads
DROP POLICY IF EXISTS "Service write chat_threads" ON chat_threads;
CREATE POLICY "service_write_chat_threads" ON chat_threads
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 14. chat_messages
DROP POLICY IF EXISTS "Service write chat_messages" ON chat_messages;
CREATE POLICY "service_write_chat_messages" ON chat_messages
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 15. chat_participants
DROP POLICY IF EXISTS "Service write chat_participants" ON chat_participants;
CREATE POLICY "service_write_chat_participants" ON chat_participants
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 16. campaign_sends
DROP POLICY IF EXISTS "Service write campaign_sends" ON campaign_sends;
CREATE POLICY "service_write_campaign_sends" ON campaign_sends
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 17. suppression_list
DROP POLICY IF EXISTS "Service write suppression_list" ON suppression_list;
CREATE POLICY "service_write_suppression_list" ON suppression_list
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 18. activity_log (was INSERT-only with USING(true))
DROP POLICY IF EXISTS "Service role write activity_log" ON activity_log;
CREATE POLICY "service_write_activity_log" ON activity_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMIT;
