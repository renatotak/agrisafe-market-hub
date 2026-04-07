// ── Background service worker ──

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

// Handle context menu clicks
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

// Listen for messages from popup or library page
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'open-library') {
    chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    sendResponse({ ok: true });
  }
  return true;
});
