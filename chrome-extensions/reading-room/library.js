// ==================== CONSTANTS & CONFIG ====================
const STORAGE_KEY = 'rr_articles';

// AgriSafe Market Hub integration (Phase 22)
const MKTHUB_URL_STORAGE    = 'rr_mkthub_url';
const MKTHUB_SECRET_STORAGE = 'rr_mkthub_secret';
const MKTHUB_DEFAULT_URL    = 'https://agsf-mkthub.vercel.app';
const MKTHUB_LEGACY_DEFAULT = 'http://localhost:3000'; // migrated to default on load

// ==================== STORAGE DETECTION ====================
function getStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        return chrome.storage.local;
    }
    return {
        get: (keys, callback) => {
            const result = {};
            const keyList = typeof keys === 'string' ? [keys] : keys;
            keyList.forEach(key => {
                const value = localStorage.getItem(key);
                if (value) result[key] = JSON.parse(value);
            });
            callback(result);
        },
        set: (obj, callback) => {
            Object.entries(obj).forEach(([key, value]) => {
                localStorage.setItem(key, JSON.stringify(value));
            });
            if (callback) callback();
        },
        remove: (keys, callback) => {
            const keyList = typeof keys === 'string' ? [keys] : keys;
            keyList.forEach(key => localStorage.removeItem(key));
            if (callback) callback();
        }
    };
}

const storage = getStorage();

// ==================== STATE ====================
let articles = [];
let currentEditId = null;
// AgriSafe Market Hub integration state
let mkthubUrl = MKTHUB_DEFAULT_URL;
let mkthubSecret = '';
let currentFilters = { status: 'all', category: '', search: '', tags: [] };
let currentSort = 'newest';

// ==================== UTILITY FUNCTIONS ====================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(date) {
    if (!(date instanceof Date)) date = new Date(date);
    const now = new Date();
    const days = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

function showToast(message, type = 'success') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    if (!document.querySelector('.modal.active')) {
        document.body.style.overflow = '';
    }
}

function safeHostname(url) {
    try { return new URL(url).hostname; } catch { return url || '—'; }
}

// ==================== STORAGE FUNCTIONS ====================
function loadArticles() {
    return new Promise((resolve) => {
        storage.get(STORAGE_KEY, (data) => {
            articles = data[STORAGE_KEY] || [];
            resolve();
        });
    });
}

async function saveArticles() {
    return new Promise((resolve) => {
        storage.set({ [STORAGE_KEY]: articles }, () => resolve());
    });
}

// ==================== MARKET HUB CONFIG (Phase 22) ====================
function loadMarketHubConfig() {
    return new Promise((resolve) => {
        storage.get([MKTHUB_URL_STORAGE, MKTHUB_SECRET_STORAGE], (data) => {
            let url = data[MKTHUB_URL_STORAGE] || MKTHUB_DEFAULT_URL;
            // Migrate legacy localhost default to production. Users who genuinely
            // want localhost dev can re-set it manually after seeing the new value.
            if (url === MKTHUB_LEGACY_DEFAULT) url = MKTHUB_DEFAULT_URL;
            mkthubUrl    = url;
            mkthubSecret = data[MKTHUB_SECRET_STORAGE] || '';
            updateMarketHubSettingsUI();
            resolve();
        });
    });
}

function saveMarketHubConfig(url, secret) {
    return new Promise((resolve) => {
        mkthubUrl    = (url || '').replace(/\/+$/, '') || MKTHUB_DEFAULT_URL; // strip trailing slash
        mkthubSecret = secret || '';
        storage.set({
            [MKTHUB_URL_STORAGE]:    mkthubUrl,
            [MKTHUB_SECRET_STORAGE]: mkthubSecret,
        }, () => {
            updateMarketHubSettingsUI();
            resolve();
        });
    });
}

function updateMarketHubSettingsUI() {
    const urlEl    = document.getElementById('mkthubUrlInput');
    const secretEl = document.getElementById('mkthubSecretInput');
    if (urlEl)    urlEl.value    = mkthubUrl;
    if (secretEl) secretEl.value = mkthubSecret;
}

// ==================== AUTO-PUSH (delegates to background service worker) ====================
// Fire-and-forget auto-push after a save. Background owns the actual fetch +
// retries via storage stamp; we just notify the UI on completion.
function autoPushArticle(article) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    chrome.runtime.sendMessage({ type: 'push-to-mkthub', article }, (result) => {
        if (chrome.runtime.lastError) return; // page may have navigated
        if (!result) return;
        if (result.ok) {
            // Reflect the synced badge without a full reload
            const local = articles.find((a) => a.id === article.id);
            if (local) {
                local.mkthubSyncedAt = new Date().toISOString();
                local.mkthubNewsId   = result.news_id || null;
            }
            renderArticles();
            const cat = result.category ? ` (${result.category})` : '';
            showToast(`Synced to Market Hub${cat} ✓`);
        } else {
            showToast('Market Hub sync failed: ' + result.error, 'error');
        }
    });
}

// ==================== ARTICLE CRUD ====================
function createArticle(data) {
    const now = new Date().toISOString();
    const article = {
        id: generateId(),
        url: data.url || '',
        title: data.title,
        category: data.category || 'other',
        status: 'unread',
        excerpt: data.excerpt || '',
        notes: data.notes || '',
        takeaways: data.takeaways || '',
        tags: data.tags ? data.tags.filter(t => t.trim()) : [],
        savedAt: now,
        updatedAt: now
    };
    articles.push(article);
    return article;
}

function updateArticle(id, data) {
    const article = articles.find(a => a.id === id);
    if (!article) return null;
    Object.assign(article, data, { updatedAt: new Date().toISOString() });
    return article;
}

function deleteArticle(id) {
    articles = articles.filter(a => a.id !== id);
}

function cycleStatus(id) {
    const article = articles.find(a => a.id === id);
    if (!article) return;
    const statuses = ['unread', 'read', 'used'];
    article.status = statuses[(statuses.indexOf(article.status) + 1) % statuses.length];
    article.updatedAt = new Date().toISOString();
}

// ==================== FILTERING & SORTING ====================
function filterArticles() {
    let filtered = [...articles];

    if (currentFilters.status !== 'all') {
        filtered = filtered.filter(a => a.status === currentFilters.status);
    }
    if (currentFilters.category) {
        filtered = filtered.filter(a => a.category === currentFilters.category);
    }
    if (currentFilters.search) {
        const q = currentFilters.search.toLowerCase();
        filtered = filtered.filter(a =>
            a.title.toLowerCase().includes(q) ||
            (a.excerpt || '').toLowerCase().includes(q) ||
            (a.notes || '').toLowerCase().includes(q) ||
            (a.takeaways || '').toLowerCase().includes(q) ||
            (a.url || '').toLowerCase().includes(q) ||
            (a.tags || []).some(t => t.toLowerCase().includes(q))
        );
    }
    if (currentFilters.tags.length > 0) {
        filtered = filtered.filter(a =>
            currentFilters.tags.some(tag => (a.tags || []).includes(tag))
        );
    }

    filtered.sort((a, b) => {
        if (currentSort === 'newest') return new Date(b.savedAt) - new Date(a.savedAt);
        if (currentSort === 'oldest') return new Date(a.savedAt) - new Date(b.savedAt);
        if (currentSort === 'title') return a.title.localeCompare(b.title);
        return 0;
    });

    return filtered;
}

function updateStats() {
    document.getElementById('totalCount').textContent = articles.length;
    document.getElementById('unreadCount').textContent = articles.filter(a => a.status === 'unread').length;
    document.getElementById('readCount').textContent = articles.filter(a => a.status === 'read').length;
    document.getElementById('usedCount').textContent = articles.filter(a => a.status === 'used').length;
}

// ==================== RENDERING ====================
function getCategoryBadge(category) {
    const map = {
        marketing: ['Marketing', 'cat-marketing'],
        tech: ['Tech', 'cat-tech'],
        business: ['Business', 'cat-business'],
        industry: ['Industry', 'cat-industry'],
        research: ['Research', 'cat-research'],
        other: ['Other', 'cat-other']
    };
    const [label, cls] = map[category] || map.other;
    return `<span class="badge ${cls}">${label}</span>`;
}

function getStatusBadge(status) {
    const map = {
        unread: ['Unread', 'status-unread'],
        read: ['Read', 'status-read'],
        used: ['Used', 'status-used']
    };
    const [label, cls] = map[status] || map.unread;
    return `<span class="badge status-badge ${cls}">${label}</span>`;
}

function renderArticles() {
    const filtered = filterArticles();
    const grid = document.getElementById('articlesGrid');
    const empty = document.getElementById('emptyState');

    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    grid.innerHTML = filtered.map(article => `
        <div class="article-card" data-id="${article.id}">
            <div class="article-header">
                <div class="article-title">${article.title}</div>
            </div>
            <div class="article-meta">
                ${getStatusBadge(article.status)}
                ${getCategoryBadge(article.category)}
                ${article.mkthubSyncedAt ? '<span class="status-badge" style="background:#5B7A2F;color:white;" title="Pushed to AgriSafe Market Hub">🌾 synced</span>' : ''}
            </div>
            ${article.excerpt ? `<p class="article-excerpt">${article.excerpt}</p>` : ''}
            ${article.url ? `<a href="${article.url}" target="_blank" class="article-url" onclick="event.stopPropagation()">${safeHostname(article.url)}</a>` : ''}
            ${(article.tags || []).length > 0 ? `
                <div class="article-tags">
                    ${article.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');

    grid.querySelectorAll('.article-card').forEach(card => {
        card.addEventListener('click', () => showDetailModal(card.dataset.id));
    });
}

function showDetailModal(articleId) {
    const article = articles.find(a => a.id === articleId);
    if (!article) return;

    const modal = document.getElementById('detailModal');
    document.getElementById('detailTitle').textContent = article.title;
    document.getElementById('detailStatus').textContent = article.status.charAt(0).toUpperCase() + article.status.slice(1);
    document.getElementById('detailCategory').textContent = article.category.charAt(0).toUpperCase() + article.category.slice(1);
    document.getElementById('detailSavedAt').textContent = formatDate(article.savedAt);
    document.getElementById('detailUpdatedAt').textContent = formatDate(article.updatedAt);

    document.getElementById('detailUrl').innerHTML = article.url
        ? `<a href="${article.url}" target="_blank" class="article-url">${article.url}</a>`
        : '<span style="color:#888">No URL</span>';

    const excerptDiv = document.getElementById('detailExcerpt');
    if (article.excerpt) {
        document.getElementById('excerptText').textContent = article.excerpt;
        excerptDiv.style.display = 'block';
    } else { excerptDiv.style.display = 'none'; }

    const notesDiv = document.getElementById('detailNotes');
    if (article.notes) {
        document.getElementById('notesText').textContent = article.notes;
        notesDiv.style.display = 'block';
    } else { notesDiv.style.display = 'none'; }

    const takeawaysDiv = document.getElementById('detailTakeaways');
    if (article.takeaways) {
        document.getElementById('takeawaysList').innerHTML = article.takeaways.split('\n')
            .filter(t => t.trim()).map(t => `<li>${t}</li>`).join('');
        takeawaysDiv.style.display = 'block';
    } else { takeawaysDiv.style.display = 'none'; }

    const tagsDiv = document.getElementById('detailTags');
    if ((article.tags || []).length > 0) {
        const tagsList = document.getElementById('detailTagsList');
        tagsList.innerHTML = article.tags.map(tag => `<span class="tag" data-tag="${tag}">${tag}</span>`).join('');
        tagsDiv.style.display = 'block';
        tagsList.querySelectorAll('.tag').forEach(t => {
            t.addEventListener('click', () => {
                const v = t.dataset.tag;
                if (currentFilters.tags.includes(v)) {
                    currentFilters.tags = currentFilters.tags.filter(x => x !== v);
                } else {
                    currentFilters.tags.push(v);
                }
                closeModal(modal);
                renderArticles();
            });
        });
    } else { tagsDiv.style.display = 'none'; }

    window.currentArticle = article;
    currentEditId = articleId;
    openModal(modal);
}

function showArticleForm(articleId = null) {
    const modal = document.getElementById('articleModal');
    document.getElementById('articleForm').reset();
    currentEditId = articleId;

    if (articleId) {
        const a = articles.find(x => x.id === articleId);
        if (!a) return;
        document.getElementById('modalTitle').textContent = 'Edit Article';
        document.getElementById('articleUrl').value = a.url;
        document.getElementById('articleTitle').value = a.title;
        document.getElementById('articleCategory').value = a.category;
        document.getElementById('articleExcerpt').value = a.excerpt;
        document.getElementById('articleNotes').value = a.notes;
        document.getElementById('articleTakeaways').value = a.takeaways;
        document.getElementById('articleTags').value = (a.tags || []).join(', ');
    } else {
        document.getElementById('modalTitle').textContent = 'Add Article';
    }
    openModal(modal);
}

// ==================== EVENT LISTENERS ====================
document.getElementById('addArticleBtn').addEventListener('click', () => showArticleForm());
document.getElementById('emptyStateAddBtn').addEventListener('click', () => showArticleForm());
document.getElementById('settingsBtn').addEventListener('click', () => openModal(document.getElementById('settingsModal')));

document.getElementById('articleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        url: document.getElementById('articleUrl').value,
        title: document.getElementById('articleTitle').value,
        category: document.getElementById('articleCategory').value,
        excerpt: document.getElementById('articleExcerpt').value,
        notes: document.getElementById('articleNotes').value,
        takeaways: document.getElementById('articleTakeaways').value,
        tags: document.getElementById('articleTags').value.split(',').map(t => t.trim()).filter(t => t)
    };
    let savedArticle;
    if (currentEditId) {
        savedArticle = updateArticle(currentEditId, data);
    } else {
        savedArticle = createArticle(data);
    }
    await saveArticles();
    updateStats();
    renderArticles();
    closeModal(document.getElementById('articleModal'));
    showToast(currentEditId ? 'Article updated' : 'Article added');
    // Auto-push to Market Hub. Both create and edit re-trigger so an edit
    // can serve as a manual retry if a previous push failed.
    if (savedArticle) autoPushArticle(savedArticle);
});

// Modal closes
['closeArticleModal','cancelArticleBtn'].forEach(id =>
    document.getElementById(id).addEventListener('click', () => closeModal(document.getElementById('articleModal'))));
['closeDetailModal','closeDetailBtn'].forEach(id =>
    document.getElementById(id).addEventListener('click', () => closeModal(document.getElementById('detailModal'))));
['closeSettingsModal','closeSettingsBtn'].forEach(id =>
    document.getElementById(id).addEventListener('click', () => closeModal(document.getElementById('settingsModal'))));

document.getElementById('editBtn').addEventListener('click', () => {
    closeModal(document.getElementById('detailModal'));
    showArticleForm(currentEditId);
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (confirm('Delete this article?')) {
        deleteArticle(currentEditId);
        await saveArticles();
        updateStats();
        renderArticles();
        closeModal(document.getElementById('detailModal'));
        showToast('Article deleted');
    }
});

document.getElementById('toggleStatusBtn').addEventListener('click', async () => {
    cycleStatus(currentEditId);
    await saveArticles();
    updateStats();
    renderArticles();
    showDetailModal(currentEditId);
    showToast('Status updated');
});

// ===== Market Hub settings (Phase 22) =====
const mkthubSaveBtn = document.getElementById('saveMkthubBtn');
if (mkthubSaveBtn) {
    mkthubSaveBtn.addEventListener('click', async () => {
        const url    = document.getElementById('mkthubUrlInput').value.trim();
        const secret = document.getElementById('mkthubSecretInput').value.trim();
        const status = document.getElementById('mkthubStatus');
        if (!url) { showToast('Please enter a Market Hub URL', 'error'); return; }
        if (!secret) { showToast('Please enter the shared secret', 'error'); return; }
        if (status) { status.textContent = 'Testing connection…'; status.classList.remove('error'); }
        // Quick connectivity test: send a tiny placeholder POST. The endpoint
        // returns 200 even without entity matches, so any non-200 is a real
        // config / auth / network problem.
        try {
            const testRes = await fetch(`${url.replace(/\/+$/, '')}/api/reading-room/ingest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-reading-room-secret': secret,
                },
                body: JSON.stringify({
                    url: 'https://example.com/reading-room-config-test',
                    title: 'Reading Room config test',
                    content: 'Connectivity probe from the Reading Room extension settings panel.',
                    source_name: 'Reading Room (config test)',
                }),
            });
            if (!testRes.ok) {
                const json = await testRes.json().catch(() => ({}));
                throw new Error(json.error || `HTTP ${testRes.status}`);
            }
            await saveMarketHubConfig(url, secret);
            if (status) { status.textContent = '✓ Connected and saved'; status.classList.remove('error'); }
            showToast('Market Hub connected ✓');
        } catch (err) {
            if (status) { status.textContent = '✗ ' + (err.message || 'Connection failed'); status.classList.add('error'); }
            showToast('Market Hub connection failed', 'error');
        }
    });
}

// Filters
document.getElementById('searchInput').addEventListener('input', (e) => {
    currentFilters.search = e.target.value;
    renderArticles();
});

document.querySelectorAll('.filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilters.status = chip.dataset.filter;
        renderArticles();
    });
});

document.getElementById('categoryFilter').addEventListener('change', (e) => {
    currentFilters.category = e.target.value;
    renderArticles();
});

document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderArticles();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.active').forEach(m => closeModal(m));
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.getElementById('searchInput').focus(); }
});

// Close modal on overlay click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
});

// ==================== INITIALIZATION ====================
async function init() {
    await loadArticles();
    await loadMarketHubConfig();
    updateStats();
    renderArticles();
    updateMarketHubSettingsUI();

    // Show extension tip banner only in standalone mode
    const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id;
    const banner = document.getElementById('extensionBanner');
    if (banner && !isExtension) banner.style.display = 'flex';
}

init();
