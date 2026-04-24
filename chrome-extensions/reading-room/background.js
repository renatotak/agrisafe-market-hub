// ── Background service worker ──
// Owns: context menu, open-library message, auto-push to AgriSafe Market Hub
//
// Auto-push design (Phase 22 follow-up, 2026-04-07):
// Both popup.js (quick save) and library.js (full library form submit) send a
// { type: 'push-to-mkthub', articleId } message after writing the article to
// chrome.storage.local. Background reads the article + Market Hub config,
// POSTs to /api/reading-room/ingest, and on success stamps the article with
// mkthubSyncedAt + mkthubNewsId. The UI never has to manually push.

const STORAGE_KEY           = 'rr_articles';
const STAMPS_KEY            = 'rr_article_stamps';
const MKTHUB_URL_STORAGE    = 'rr_mkthub_url';
const MKTHUB_SECRET_STORAGE = 'rr_mkthub_secret';
const MKTHUB_DEFAULT_URL    = 'https://agsf-mkthub.vercel.app';

// ── Context menus ──
chrome.runtime.onInstalled.addListener(() => {
  // Remove any leftover items from a previous install/reload before recreating,
  // otherwise Chrome throws "duplicate id" errors on extension updates/reloads.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-to-reading-room',
      title: 'Save to Reading Room',
      contexts: ['page', 'link'],
    });
    chrome.contextMenus.create({
      id: 'save-selection-to-reading-room',
      title: 'Save selection to Reading Room',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let meta = {};

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-extract.js'],
    });
    meta = results?.[0]?.result || {};
  } catch (e) {
    meta = { url: tab.url, title: tab.title, category: 'other' };
  }

  const pending = {
    url: info.linkUrl || meta.url || info.pageUrl,
    title: meta.title || tab.title || '',
    description: meta.description || '',
    excerpt: info.menuItemId === 'save-selection-to-reading-room'
      ? (info.selectionText || '')
      : (meta.excerpt || meta.description || ''),
    category: meta.category || 'other',
    author: meta.author || '',
    savedVia: 'context-menu',
    timestamp: Date.now(),
  };

  await chrome.storage.local.set({ pendingArticle: pending });

  chrome.action.setBadgeText({ text: '+1' });
  chrome.action.setBadgeBackgroundColor({ color: '#d4a043' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
});

// ── Market Hub auto-push ──
async function getMarketHubConfig() {
  const data = await chrome.storage.local.get([MKTHUB_URL_STORAGE, MKTHUB_SECRET_STORAGE]);
  let url = data[MKTHUB_URL_STORAGE] || MKTHUB_DEFAULT_URL;
  // Migrate legacy localhost default to production. Users who genuinely want
  // localhost dev can re-set it manually in Settings.
  if (url === 'http://localhost:3000') url = MKTHUB_DEFAULT_URL;
  url = url.replace(/\/+$/, ''); // strip trailing slash
  return { url, secret: data[MKTHUB_SECRET_STORAGE] || '' };
}

async function pushArticleToMarketHub(article) {
  const { url, secret } = await getMarketHubConfig();
  if (!secret) return { ok: false, error: 'Market Hub secret not set. Open Settings → Market Hub.' };
  if (!article || !article.url || !article.title) return { ok: false, error: 'Article needs at least url + title.' };

  const body = {
    url:         article.url,
    title:       article.title,
    content:     article.notes || article.takeaways || article.excerpt || article.title,
    source_name: 'Reading Room',
    fetched_at:  article.savedAt || new Date().toISOString(),
    tags:        Array.isArray(article.tags) ? article.tags.slice(0, 10) : [],
  };

  try {
    const res = await fetch(`${url}/api/reading-room/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-reading-room-secret': secret,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || `HTTP ${res.status}` };
    return {
      ok: true,
      news_id: json.news_id || null,
      category: json.category || null,
      entity_mentions: json.entity_mentions || 0,
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

// Stamps are kept in their own sparse key `rr_article_stamps = { [id]: {syncedAt, newsId} }`
// so UI writes to `rr_articles` never clobber a stamp mid-push. Writes are serialized
// via a single-slot promise queue to prevent background-vs-background lost updates when
// several pushes complete concurrently.
let stampQueue = Promise.resolve();
function stampArticleSynced(articleId, news_id) {
  stampQueue = stampQueue.then(async () => {
    const data = await chrome.storage.local.get(STAMPS_KEY);
    const stamps = data[STAMPS_KEY] || {};
    stamps[articleId] = {
      syncedAt: new Date().toISOString(),
      newsId:   news_id || null,
    };
    await chrome.storage.local.set({ [STAMPS_KEY]: stamps });
  }).catch((e) => {
    console.error('[stampArticleSynced] failed:', e && e.message);
  });
  return stampQueue;
}

// ── Message router ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'open-library') {
    chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'push-to-mkthub') {
    // Caller passes either { article } directly OR { articleId } to look up.
    (async () => {
      let article = msg.article;
      if (!article && msg.articleId) {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        article = (data[STORAGE_KEY] || []).find((a) => a.id === msg.articleId) || null;
      }
      if (!article) {
        sendResponse({ ok: false, error: 'Article not found' });
        return;
      }
      const result = await pushArticleToMarketHub(article);
      if (result.ok && article.id) {
        await stampArticleSynced(article.id, result.news_id);
      }
      sendResponse(result);
    })();
    return true; // keep the message channel open for async sendResponse
  }

  if (msg.type === 'pull-from-mkthub') {
    (async () => {
      const result = await pullFromMarketHub();
      sendResponse(result);
    })();
    return true;
  }

  return false;
});

// ── Pull from Market Hub ──
// Fetches /api/reading-room/list and merges into rr_articles. Matches by URL
// to keep this idempotent: existing local articles are kept (notes/status/
// takeaways preserved) and only their mkthubNewsId + stamp get refreshed.
// New articles are inserted with the server's id as their local id.
async function pullFromMarketHub() {
  const { url, secret } = await getMarketHubConfig();
  if (!secret) return { ok: false, error: 'Market Hub secret not set. Open Settings → Market Hub.' };

  let serverArticles;
  try {
    const res = await fetch(`${url}/api/reading-room/list`, {
      method: 'GET',
      headers: { 'x-reading-room-secret': secret },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || `HTTP ${res.status}` };
    serverArticles = Array.isArray(json.articles) ? json.articles : [];
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }

  const data = await chrome.storage.local.get([STORAGE_KEY, STAMPS_KEY]);
  const local = data[STORAGE_KEY] || [];
  const stamps = data[STAMPS_KEY] || {};
  const byUrl = new Map(local.map((a) => [a.url, a]));

  let added = 0;
  let updated = 0;
  const nowIso = new Date().toISOString();

  for (const s of serverArticles) {
    if (!s.url || !s.title) continue;
    const existing = byUrl.get(s.url);
    if (existing) {
      // Preserve user edits — only refresh server linkage + stamp.
      existing.mkthubNewsId = s.id;
      stamps[existing.id] = {
        syncedAt: stamps[existing.id]?.syncedAt || s.published_at || nowIso,
        newsId:   s.id,
      };
      updated++;
    } else {
      const fresh = {
        id:         s.id, // reuse server's hash id locally
        url:        s.url,
        title:      s.title,
        category:   mapServerCategory(s.category),
        status:     'unread',
        excerpt:    s.summary || '',
        notes:      '',
        takeaways:  '',
        tags:       Array.isArray(s.tags) ? s.tags.slice(0, 10) : [],
        savedAt:    s.published_at || nowIso,
        updatedAt:  nowIso,
        mkthubNewsId: s.id,
        pulledFromMkthub: true,
      };
      local.unshift(fresh);
      byUrl.set(s.url, fresh);
      stamps[s.id] = { syncedAt: s.published_at || nowIso, newsId: s.id };
      added++;
    }
  }

  await chrome.storage.local.set({
    [STORAGE_KEY]: local,
    [STAMPS_KEY]:  stamps,
  });

  return { ok: true, added, updated, total: serverArticles.length };
}

// Map the server's news category (commodities/judicial/etc.) to the
// extension's extraction taxonomy (marketing/tech/business/industry/
// research/other). Anything we can't map cleanly falls back to 'other' so
// the user can re-categorize later.
function mapServerCategory(cat) {
  switch ((cat || '').toLowerCase()) {
    case 'technology':      return 'tech';
    case 'commodities':
    case 'credit':
    case 'judicial':        return 'business';
    case 'policy':
    case 'sustainability':  return 'industry';
    case 'livestock':
    case 'general':
    default:                return 'other';
  }
}
