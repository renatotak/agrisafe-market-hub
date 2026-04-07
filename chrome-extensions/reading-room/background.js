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

// Stamp the article in chrome.storage.local with sync metadata after a
// successful push. Read-modify-write — there's a tiny race window if the
// user saves another article at the same instant, but in practice the popup
// closes after save and library re-renders are debounced, so it's fine.
async function stampArticleSynced(articleId, news_id) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const articles = data[STORAGE_KEY] || [];
  const idx = articles.findIndex((a) => a.id === articleId);
  if (idx === -1) return;
  articles[idx].mkthubSyncedAt = new Date().toISOString();
  articles[idx].mkthubNewsId   = news_id;
  await chrome.storage.local.set({ [STORAGE_KEY]: articles });
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

  return false;
});
