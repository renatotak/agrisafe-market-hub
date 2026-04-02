// Seed published_articles and content_topics to Supabase
// Usage: node src/scripts/seed-content.js

const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
lines.forEach(l => { if (l.startsWith('#') || !l.includes('=')) return; const i = l.indexOf('='); env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const articles = [
  { id: "pa1", title: "O paradoxo do cr\u00e9dito rural: por que as revendas n\u00e3o conseguem financiar os produtores que mais precisam", channel: "linkedin", url: "https://linkedin.com/company/agrisafefin/posts/", published_at: "2026-03-28", summary: "An\u00e1lise da assimetria de informa\u00e7\u00e3o no cr\u00e9dito agro.", thesis: "Assimetria de informa\u00e7\u00e3o no cr\u00e9dito rural", historical_reference: "Crise de cr\u00e9dito de 2015-2016", engagement_views: 3420, engagement_likes: 187, engagement_comments: 42, engagement_shares: 28, tags: ["cr\u00e9dito rural", "revendas"], status: "published" },
  { id: "pa2", title: "CPR digital: a revolu\u00e7\u00e3o silenciosa que est\u00e1 mudando o agroneg\u00f3cio", channel: "linkedin", url: "https://linkedin.com/company/agrisafefin/posts/", published_at: "2026-03-21", summary: "Digitaliza\u00e7\u00e3o das C\u00e9dulas de Produto Rural.", thesis: "Digitaliza\u00e7\u00e3o de t\u00edtulos agro", historical_reference: "Cria\u00e7\u00e3o da CPR em 1994", engagement_views: 5100, engagement_likes: 312, engagement_comments: 67, engagement_shares: 45, tags: ["CPR", "digital"], status: "published" },
  { id: "pa3", title: "3 li\u00e7\u00f5es do Plano Safra 2025/26 que ningu\u00e9m est\u00e1 discutindo", channel: "linkedin", url: "https://linkedin.com/company/agrisafefin/posts/", published_at: "2026-03-14", summary: "Pontos cr\u00edticos do plano.", thesis: "Gaps no Plano Safra", historical_reference: "Plano Safra 2020/21", engagement_views: 4200, engagement_likes: 256, engagement_comments: 53, engagement_shares: 31, tags: ["plano safra"], status: "published" },
  { id: "pa4", title: "Recupera\u00e7\u00e3o judicial no agro: o que os n\u00fameros de 2025 nos ensinam", channel: "linkedin", url: "https://linkedin.com/company/agrisafefin/posts/", published_at: "2026-03-07", summary: "An\u00e1lise dos pedidos de RJ no agro.", thesis: "Padr\u00f5es de insolv\u00eancia no agro", historical_reference: "Onda de RJs 2023-2024", engagement_views: 6800, engagement_likes: 421, engagement_comments: 89, engagement_shares: 67, tags: ["recupera\u00e7\u00e3o judicial"], status: "published" },
  { id: "pa5", title: "Por que o ESG vai redefinir o acesso a cr\u00e9dito agr\u00edcola at\u00e9 2028", channel: "linkedin", url: "https://linkedin.com/company/agrisafefin/posts/", published_at: "2026-02-28", summary: "Impacto das exig\u00eancias ESG no financiamento agro.", thesis: "ESG como barreira/oportunidade", historical_reference: "Regulamenta\u00e7\u00e3o EU 2023", engagement_views: 7200, engagement_likes: 534, engagement_comments: 112, engagement_shares: 78, tags: ["ESG", "cr\u00e9dito"], status: "published" },
  { id: "pa6", title: "Safra 25/26: o que esperar do milho safrinha", channel: "instagram", url: "https://instagram.com/agrisafefin/", published_at: "2026-03-25", summary: "Infogr\u00e1fico sobre perspectivas da safrinha.", thesis: "Perspectivas safrinha", historical_reference: null, engagement_views: 1850, engagement_likes: 290, engagement_comments: 15, engagement_shares: 42, tags: ["milho", "safrinha"], status: "published" },
];

const topics = [
  { id: "ct1", thesis_pt: "O impacto da taxa Selic em 14.75% na cadeia de cr\u00e9dito rural", thesis_en: "Impact of 14.75% Selic on rural credit chain", supporting_data: ["Selic hist\u00f3rica", "Spread banc\u00e1rio", "Volume CPRs"], historical_angle_pt: "Comparar com ciclo 2015-2016", historical_angle_en: "Compare with 2015-2016 cycle", suggested_week: "2026-W15", target_channel: "linkedin", status: "approved", keywords: ["selic", "cr\u00e9dito rural"] },
  { id: "ct2", thesis_pt: "Como a China est\u00e1 redesenhando o mapa de exporta\u00e7\u00e3o da soja brasileira", thesis_en: "How China is redesigning Brazilian soy export map", supporting_data: ["Volumes por porto", "Pre\u00e7os FOB"], historical_angle_pt: "Evolu\u00e7\u00e3o Brasil-China desde 2018", historical_angle_en: "Brazil-China since 2018", suggested_week: "2026-W16", target_channel: "linkedin", status: "suggested", keywords: ["soja", "China"] },
  { id: "ct3", thesis_pt: "CERC 2.0: novas regras para registradoras e revendas", thesis_en: "CERC 2.0: new rules for registrars and resellers", supporting_data: ["Resolu\u00e7\u00e3o CMN", "Duplicatas registradas"], historical_angle_pt: "Da cria\u00e7\u00e3o da CERC em 2021 a 2026", historical_angle_en: "CERC creation 2021 to 2026", suggested_week: "2026-W17", target_channel: "linkedin", status: "suggested", keywords: ["CERC", "regula\u00e7\u00e3o"] },
  { id: "ct4", thesis_pt: "Seguro rural: por que o produtor ainda n\u00e3o contrata", thesis_en: "Rural insurance: why farmers still dont buy", supporting_data: ["PROAGRO", "Sinistralidade"], historical_angle_pt: "Evolu\u00e7\u00e3o desde PROAGRO 1973", historical_angle_en: "Evolution since PROAGRO 1973", suggested_week: "2026-W18", target_channel: "linkedin", status: "suggested", keywords: ["seguro rural", "PROAGRO"] },
  { id: "ct5", thesis_pt: "5 indicadores que toda revenda agro deve monitorar", thesis_en: "5 indicators every agro reseller should monitor", supporting_data: ["USD/BRL", "CEPEA", "Vendas"], historical_angle_pt: "Gest\u00e3o de risco 2020 e 2023", historical_angle_en: "Risk management 2020 and 2023", suggested_week: "2026-W19", target_channel: "instagram", status: "suggested", keywords: ["indicadores", "revendas"] },
];

(async () => {
  const { error: e1 } = await sb.from('published_articles').upsert(articles, { onConflict: 'id' });
  console.log('Articles:', e1 ? 'ERR ' + e1.message : articles.length + ' seeded');

  const { error: e2 } = await sb.from('content_topics').upsert(topics, { onConflict: 'id' });
  console.log('Topics:', e2 ? 'ERR ' + e2.message : topics.length + ' seeded');

  const { count: ac } = await sb.from('published_articles').select('*', { count: 'exact', head: true });
  const { count: tc } = await sb.from('content_topics').select('*', { count: 'exact', head: true });
  console.log('Verified: articles=' + ac + ' topics=' + tc);
})();
