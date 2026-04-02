/**
 * Index existing Supabase data into the knowledge_items table (4-tier hierarchy)
 * Usage: node src/scripts/index-knowledge.js
 */

const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
lines.forEach(l => { if (l.startsWith('#') || !l.includes('=')) return; const i = l.indexOf('='); env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  let total = 0;

  // ── Tier 1: Market Data (commodity prices + indicators) ──
  console.log('Indexing Tier 1: Market Data...');
  const { data: commodities } = await sb.from('commodity_prices').select('*');
  if (commodities?.length) {
    const items = commodities.map(c => ({
      tier: 1,
      title: `${c.name_pt} - R$ ${c.price} (${c.change_24h > 0 ? '+' : ''}${c.change_24h}%)`,
      content: `Commodity: ${c.name_pt} / ${c.name_en}. Price: ${c.price} ${c.unit}. Change 24h: ${c.change_24h}%. Source: ${c.source}. Last update: ${c.last_update}.`,
      summary: `${c.name_pt}: ${c.price} ${c.unit} (${c.change_24h > 0 ? '+' : ''}${c.change_24h}%)`,
      source_type: 'commodity_price', source_table: 'commodity_prices', source_id: c.id,
      data_origin: 'tier_1_public', timing: 'recurring',
      purpose: ['commercial', 'credit_analysis'],
      value_chain: ['tradings', 'agro_industries', 'rural_producers'],
      category: 'commodities', tags: ['price', c.id], keywords: [c.name_pt, c.name_en, c.id],
      published_at: c.last_update,
    }));
    const { error } = await sb.from('knowledge_items').insert(items);
    if (error) console.log('  Error:', error.message); else { total += items.length; console.log(`  ${items.length} commodity prices`); }
  }

  const { data: indicators } = await sb.from('market_indicators').select('*');
  if (indicators?.length) {
    const items = indicators.map(ind => ({
      tier: 1,
      title: `${ind.name_pt}: ${ind.value}`,
      content: `Indicator: ${ind.name_pt} / ${ind.name_en}. Value: ${ind.value}. Trend: ${ind.trend}. Source: ${ind.source}.`,
      summary: `${ind.name_pt}: ${ind.value} (${ind.trend})`,
      source_type: 'indicator', source_table: 'market_indicators', source_id: ind.id,
      data_origin: 'tier_1_public', timing: 'recurring',
      purpose: ['commercial', 'credit_analysis'],
      value_chain: ['financial_institutions', 'tradings'],
      category: 'macroeconomia', tags: ['indicator', ind.id], keywords: [ind.name_pt, ind.name_en],
      published_at: new Date().toISOString(),
    }));
    const { error } = await sb.from('knowledge_items').insert(items);
    if (error) console.log('  Error:', error.message); else { total += items.length; console.log(`  ${items.length} market indicators`); }
  }

  // ── Tier 2: News & Events ──
  console.log('Indexing Tier 2: News & Events...');
  const { data: news } = await sb.from('agro_news').select('*').order('published_at', { ascending: false }).limit(100);
  if (news?.length) {
    const items = news.map(n => ({
      tier: 2,
      title: n.title,
      content: n.summary || n.title,
      summary: n.summary,
      source_type: 'news', source_table: 'agro_news', source_id: n.id, source_url: n.source_url,
      data_origin: 'tier_1_public', timing: 'non_recurring',
      purpose: ['marketing', 'commercial'],
      value_chain: ['agro_industries', 'retailers', 'rural_producers'],
      category: n.category || 'general', tags: n.tags || [], keywords: [n.source_name, ...(n.tags || [])],
      published_at: n.published_at,
    }));
    const { error } = await sb.from('knowledge_items').insert(items);
    if (error) console.log('  Error:', error.message); else { total += items.length; console.log(`  ${items.length} news articles`); }
  }

  const { data: events } = await sb.from('events').select('*');
  if (events?.length) {
    const items = events.map(e => ({
      tier: 2,
      title: e.name,
      content: `${e.description_pt || ''} ${e.description_en || ''}`.trim(),
      summary: e.description_pt || e.description_en,
      source_type: 'event', source_table: 'events', source_id: e.id, source_url: e.website,
      data_origin: 'tier_1_public', timing: 'non_recurring',
      purpose: ['marketing', 'commercial'],
      value_chain: ['agro_industries', 'retailers'],
      category: 'events', tags: [e.type], keywords: [e.name, e.location || ''],
      published_at: e.date,
    }));
    const { error } = await sb.from('knowledge_items').insert(items);
    if (error) console.log('  Error:', error.message); else { total += items.length; console.log(`  ${items.length} events`); }
  }

  // ── Tier 3: Static / Regulatory ──
  console.log('Indexing Tier 3: Regulatory Norms...');
  const { data: norms } = await sb.from('regulatory_norms').select('*');
  if (norms?.length) {
    const items = norms.map(n => ({
      tier: 3,
      title: `[${n.body}] ${n.title}`,
      content: n.summary || n.title,
      summary: n.summary,
      source_type: 'regulatory_norm', source_table: 'regulatory_norms', source_id: n.id, source_url: n.source_url,
      data_origin: 'tier_1_public', timing: 'persistent',
      purpose: ['credit_analysis', 'commercial'],
      value_chain: ['financial_institutions', 'retailers'],
      category: 'regulatory', tags: n.affected_areas || [], keywords: [n.body, n.norm_type, ...(n.affected_areas || [])],
      published_at: n.published_at,
    }));
    const { error } = await sb.from('knowledge_items').insert(items);
    if (error) console.log('  Error:', error.message); else { total += items.length; console.log(`  ${items.length} regulatory norms`); }
  }

  // ── Tier 4: Curated Insights (published articles) ──
  console.log('Indexing Tier 4: Curated Insights...');
  const { data: articles } = await sb.from('published_articles').select('*');
  if (articles?.length) {
    const items = articles.map(a => ({
      tier: 4,
      title: a.title,
      content: `${a.summary || ''} Thesis: ${a.thesis || ''}. Historical reference: ${a.historical_reference || ''}.`,
      summary: a.summary,
      source_type: 'article', source_table: 'published_articles', source_id: a.id, source_url: a.url,
      data_origin: 'agrisafe_proprietary', timing: 'non_recurring',
      purpose: ['marketing'],
      value_chain: ['agro_industries', 'financial_institutions', 'retailers'],
      category: 'curated', tags: a.tags || [], keywords: [...(a.tags || []), a.thesis || ''],
      published_at: a.published_at,
    }));
    const { error } = await sb.from('knowledge_items').insert(items);
    if (error) console.log('  Error:', error.message); else { total += items.length; console.log(`  ${items.length} published articles`); }
  }

  // Verify
  const { count } = await sb.from('knowledge_items').select('*', { count: 'exact', head: true });
  console.log(`\nTotal indexed: ${total} items. Verified in DB: ${count}`);
}

run().catch(e => console.error('Fatal:', e.message));
