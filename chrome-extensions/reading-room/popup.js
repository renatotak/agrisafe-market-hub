// ── The Reading Room — Extension Popup (Quick Save) ──

let articles = [];
let currentTags = [];
let capturedUrl = '';

document.addEventListener('DOMContentLoaded', async () => {
  await loadArticles();
  await checkPendingOrCapture();
  setupEvents();
});

// ── STORAGE ──
async function loadArticles() {
  const data = await chrome.storage.local.get('rr_articles');
  articles = data.rr_articles || [];
}

async function saveArticles() {
  await chrome.storage.local.set({ rr_articles: articles });
}

// ── CAPTURE CURRENT PAGE OR PENDING ──
async function checkPendingOrCapture() {
  // Check for pending article from context menu
  const data = await chrome.storage.local.get('pendingArticle');
  if (data.pendingArticle) {
    const p = data.pendingArticle;
    await chrome.storage.local.remove('pendingArticle');
    fillForm(p);
    return;
  }

  // Otherwise capture current tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let meta = {};
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-extract.js'],
      });
      meta = results?.[0]?.result || {};
    } catch {
      meta = { url: tab.url, title: tab.title, category: 'other' };
    }

    fillForm({
      url: meta.url || tab.url,
      title: meta.title || tab.title || '',
      description: meta.description || '',
      excerpt: meta.excerpt || meta.description || '',
      category: meta.category || 'other',
      author: meta.author || '',
    });
  } catch {
    document.getElementById('pageTitle').textContent = 'Unable to read page';
  }
}

function fillForm(p) {
  capturedUrl = p.url || '';
  document.getElementById('pageTitle').textContent = p.title || p.url || 'Untitled';
  document.getElementById('pageDomain').textContent = extractDomain(capturedUrl);

  const cat = p.category || 'other';
  const catEl = document.getElementById('pageCat');
  catEl.textContent = cat;
  catEl.className = `cat-badge cat-${cat}`;

  document.getElementById('fTitle').value = p.title || '';
  document.getElementById('fCategory').value = cat;
  document.getElementById('fExcerpt').value = p.excerpt || p.description || '';
  document.getElementById('fNotes').value = '';
  document.getElementById('fTakeaways').value = '';
  currentTags = [];
  renderTags();
}

// ── EVENTS ──
function setupEvents() {
  // Open Library
  document.getElementById('openLibrary').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-library' });
    window.close();
  });

  // Save
  document.getElementById('saveBtn').addEventListener('click', handleSave);

  // Tags
  document.getElementById('tagsInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = e.target.value.trim().replace(/,/g, '');
      if (v && !currentTags.includes(v.toLowerCase())) {
        currentTags.push(v.toLowerCase());
        renderTags();
      }
      e.target.value = '';
    }
    if (e.key === 'Backspace' && e.target.value === '' && currentTags.length) {
      currentTags.pop();
      renderTags();
    }
  });

  document.getElementById('tagsWrap').addEventListener('click', () => {
    document.getElementById('tagsInput').focus();
  });
}

function renderTags() {
  const wrap = document.getElementById('tagsWrap');
  const input = document.getElementById('tagsInput');
  wrap.querySelectorAll('.tag').forEach(t => t.remove());
  currentTags.forEach((tag, i) => {
    const el = document.createElement('span');
    el.className = 'tag';
    el.innerHTML = `${esc(tag)} <span class="rm" data-i="${i}">&times;</span>`;
    el.querySelector('.rm').addEventListener('click', (e) => {
      e.stopPropagation();
      currentTags.splice(i, 1);
      renderTags();
    });
    wrap.insertBefore(el, input);
  });
}

// ── SAVE ──
async function handleSave() {
  const title = document.getElementById('fTitle').value.trim();
  if (!title) { toast('Title is required'); return; }

  const article = {
    id: crypto.randomUUID(),
    url: capturedUrl,
    title,
    category: document.getElementById('fCategory').value,
    status: document.getElementById('fStatus').value,
    excerpt: document.getElementById('fExcerpt').value.trim(),
    notes: document.getElementById('fNotes').value.trim(),
    takeaways: document.getElementById('fTakeaways').value.trim(),
    tags: [...currentTags],
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  articles.unshift(article);
  await saveArticles();
  showSuccess(article);

  // Auto-push to AgriSafe Market Hub via background service worker.
  // Fire-and-forget — the popup closes shortly after, so we don't await.
  // Background stamps mkthubSyncedAt on success so the next library render
  // shows the synced badge.
  chrome.runtime.sendMessage(
    { type: 'push-to-mkthub', article },
    (result) => {
      // chrome.runtime.lastError fires if the popup closed before the
      // background worker replied — that's fine, the push still happens.
      if (chrome.runtime.lastError) return;
      if (result && !result.ok) {
        // Surface auth/config failures so the user knows to fix Settings.
        // Network errors are silent — the article is in the local library
        // and a future edit-then-save will retry.
        if (/secret|HTTP 401|HTTP 403/i.test(result.error || '')) {
          toast('Market Hub: ' + result.error);
        }
      }
    }
  );
}

// ── SUCCESS VIEW ──
function showSuccess(saved) {
  document.getElementById('viewSave').classList.remove('active');
  document.getElementById('viewSuccess').classList.add('active');
  document.getElementById('successTitle').textContent = saved.title;

  // Render recent
  const list = document.getElementById('recentList');
  const recent = articles.slice(0, 8);
  list.innerHTML = recent.map(a => `
    <div class="recent-item" title="${esc(a.url)}">
      <span class="ri-title">${esc(a.title)}</span>
      <span class="ri-status status-${a.status}">${a.status}</span>
    </div>
  `).join('');

  list.querySelectorAll('.recent-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      if (recent[i].url) chrome.tabs.create({ url: recent[i].url });
    });
  });
}

// ── HELPERS ──
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function extractDomain(url) { try { return new URL(url).hostname.replace('www.',''); } catch { return url; } }
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(),2500);
}
