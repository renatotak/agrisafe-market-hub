// ==================== CONSTANTS & CONFIG ====================
const STORAGE_KEY = 'rr_articles';
const API_KEY_STORAGE = 'rr_api_key';
const AI_PROVIDER_STORAGE = 'rr_ai_provider';
const AI_MODEL_STORAGE = 'rr_ai_model';
const AI_ENDPOINT_STORAGE = 'rr_ai_endpoint';
const SAVE_FOLDER_KEY = 'rr_save_folder_name';

// AgriSafe Market Hub integration (Phase 22)
const MKTHUB_URL_STORAGE    = 'rr_mkthub_url';
const MKTHUB_SECRET_STORAGE = 'rr_mkthub_secret';
const MKTHUB_DEFAULT_URL    = 'http://localhost:3000';

const AI_PROVIDERS = {
    anthropic: {
        name: 'Claude (Anthropic)',
        endpoint: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-sonnet-4-20250514',
        keyPlaceholder: 'sk-ant-...',
        keyHintText: 'Get your API key at console.anthropic.com →',
        keyHintUrl: 'https://console.anthropic.com/',
        showSubscriptionNote: true,
        format: 'anthropic',
    },
    openai: {
        name: 'OpenAI (ChatGPT)',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o',
        keyPlaceholder: 'sk-...',
        keyHintText: 'Get your API key at platform.openai.com →',
        keyHintUrl: 'https://platform.openai.com/api-keys',
        showSubscriptionNote: false,
        format: 'openai',
    },
    gemini: {
        name: 'Google Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}',
        defaultModel: 'gemini-1.5-flash',
        keyPlaceholder: 'AIza...',
        keyHintText: 'Get your API key at aistudio.google.com →',
        keyHintUrl: 'https://aistudio.google.com/app/apikey',
        showSubscriptionNote: false,
        format: 'gemini',
    },
    custom: {
        name: 'Custom / OpenAI-compatible',
        endpoint: '',
        defaultModel: '',
        keyPlaceholder: 'Your API key',
        keyHintText: 'Enter endpoint URL above and your API key below.',
        keyHintUrl: null,
        showSubscriptionNote: false,
        format: 'openai',
    },
};

// ==================== INDEXEDDB (for FileSystem handle persistence) ====================
const IDB_NAME = 'reading-room-db';
const IDB_STORE = 'fs-handles';

function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => e.target.result.createObjectStore(IDB_STORE);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbGet(key) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbSet(key, value) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

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
let apiKey = null;
let aiProvider = 'anthropic';
let aiModel = AI_PROVIDERS.anthropic.defaultModel;
let aiEndpoint = '';
let currentEditId = null;
// AgriSafe Market Hub integration state
let mkthubUrl = MKTHUB_DEFAULT_URL;
let mkthubSecret = '';
let saveDirectoryHandle = null;
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
        storage.set({ [STORAGE_KEY]: articles }, async () => {
            await writeToSaveFolder();
            resolve();
        });
    });
}

function loadAIConfig() {
    return new Promise((resolve) => {
        storage.get([API_KEY_STORAGE, AI_PROVIDER_STORAGE, AI_MODEL_STORAGE, AI_ENDPOINT_STORAGE], (data) => {
            apiKey = data[API_KEY_STORAGE] || null;
            aiProvider = data[AI_PROVIDER_STORAGE] || 'anthropic';
            const providerDef = AI_PROVIDERS[aiProvider] || AI_PROVIDERS.anthropic;
            aiModel = data[AI_MODEL_STORAGE] || providerDef.defaultModel;
            aiEndpoint = data[AI_ENDPOINT_STORAGE] || '';
            updateAISettingsUI();
            resolve();
        });
    });
}

// Keep loadApiKey as an alias so any other callers still work
const loadApiKey = loadAIConfig;

function saveAIConfig(key, provider, model, endpoint) {
    return new Promise((resolve) => {
        apiKey = key;
        aiProvider = provider;
        aiModel = model;
        aiEndpoint = endpoint;
        storage.set({
            [API_KEY_STORAGE]: key,
            [AI_PROVIDER_STORAGE]: provider,
            [AI_MODEL_STORAGE]: model,
            [AI_ENDPOINT_STORAGE]: endpoint,
        }, () => {
            updateAISettingsUI();
            resolve();
        });
    });
}

// Keep saveApiKey as a simplified alias
function saveApiKey(key) {
    return saveAIConfig(key, aiProvider, aiModel, aiEndpoint);
}

// ==================== MARKET HUB CONFIG (Phase 22) ====================
function loadMarketHubConfig() {
    return new Promise((resolve) => {
        storage.get([MKTHUB_URL_STORAGE, MKTHUB_SECRET_STORAGE], (data) => {
            mkthubUrl    = data[MKTHUB_URL_STORAGE]    || MKTHUB_DEFAULT_URL;
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

/**
 * Push a single article to the AgriSafe Market Hub /api/reading-room/ingest endpoint.
 * Returns { ok, news_id?, error? }. Does NOT throw — caller handles UI feedback.
 *
 * Algorithmic only — no LLM. The Market Hub side runs its own algorithmic
 * categorizer + entity matcher on the content (per CLAUDE.md guardrail #1).
 */
async function pushArticleToMarketHub(article) {
    if (!mkthubUrl || !mkthubSecret) {
        return { ok: false, error: 'Market Hub URL or secret not configured. Open Settings → Market Hub.' };
    }
    if (!article || !article.url || !article.title) {
        return { ok: false, error: 'Article needs at least url + title.' };
    }
    const body = {
        url:         article.url,
        title:       article.title,
        content:     article.notes || article.takeaways || article.excerpt || article.title,
        source_name: 'Reading Room',
        fetched_at:  article.savedAt || new Date().toISOString(),
        tags:        Array.isArray(article.tags) ? article.tags.slice(0, 10) : [],
    };
    try {
        const res = await fetch(`${mkthubUrl}/api/reading-room/ingest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-reading-room-secret': mkthubSecret,
            },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { ok: false, error: json.error || `HTTP ${res.status}` };
        }
        // Stamp the article with sync state so the UI can show a check
        article.mkthubSyncedAt = new Date().toISOString();
        article.mkthubNewsId   = json.news_id || null;
        await saveArticles();
        return { ok: true, news_id: json.news_id, entity_mentions: json.entity_mentions, category: json.category };
    } catch (err) {
        return { ok: false, error: err.message || 'Network error' };
    }
}

// ==================== SAVE FOLDER (File System Access API) ====================
async function loadSaveDirectory() {
    try {
        const handle = await idbGet('saveDirectory');
        if (handle) {
            // Verify we still have (or can get) permission
            const perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                saveDirectoryHandle = handle;
            } else {
                // Will ask again on next user gesture
                saveDirectoryHandle = handle;
            }
        }
    } catch (e) {
        saveDirectoryHandle = null;
    }
    updateSaveFolderUI();
}

async function pickSaveFolder() {
    if (!window.showDirectoryPicker) {
        showToast('Folder picker not supported in this browser', 'error');
        return;
    }
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
        saveDirectoryHandle = handle;
        await idbSet('saveDirectory', handle);
        updateSaveFolderUI();
        showToast(`Save location set: ${handle.name}`);
        // Write current library immediately
        await writeToSaveFolder();
    } catch (e) {
        if (e.name !== 'AbortError') showToast('Could not set folder: ' + e.message, 'error');
    }
}

async function clearSaveFolder() {
    saveDirectoryHandle = null;
    try { await idbSet('saveDirectory', null); } catch {}
    updateSaveFolderUI();
    showToast('Save location cleared');
}

async function writeToSaveFolder() {
    if (!saveDirectoryHandle) return;
    try {
        let perm = await saveDirectoryHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
            perm = await saveDirectoryHandle.requestPermission({ mode: 'readwrite' });
        }
        if (perm !== 'granted') return;

        const fileHandle = await saveDirectoryHandle.getFileHandle('reading-room-library.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(articles, null, 2));
        await writable.close();
    } catch (e) {
        console.warn('Auto-save to folder failed:', e.message);
    }
}

function updateSaveFolderUI() {
    const nameEl = document.getElementById('saveFolderName');
    const clearBtn = document.getElementById('clearFolderBtn');
    if (!nameEl) return;
    if (saveDirectoryHandle) {
        nameEl.textContent = saveDirectoryHandle.name;
        nameEl.style.color = 'var(--sage)';
        if (clearBtn) clearBtn.style.display = 'inline-block';
    } else {
        nameEl.textContent = 'Not set — click Choose Folder';
        nameEl.style.color = '#888';
        if (clearBtn) clearBtn.style.display = 'none';
    }
}

// ==================== AI PROVIDER API ====================
async function callAI(prompt, keyOverride, providerOverride, modelOverride, endpointOverride) {
    const key = keyOverride || apiKey;
    if (!key) throw new Error('API key not set. Add your key in Settings (⚙️).');

    const providerKey = providerOverride || aiProvider || 'anthropic';
    const providerDef = AI_PROVIDERS[providerKey] || AI_PROVIDERS.anthropic;
    const model = modelOverride || aiModel || providerDef.defaultModel;
    const endpoint = endpointOverride || (providerKey === 'custom' ? aiEndpoint : providerDef.endpoint);

    if (!endpoint) throw new Error('No endpoint configured. Enter an endpoint URL in Settings (⚙️).');

    if (providerDef.format === 'anthropic') {
        return _callAnthropicFormat(endpoint, key, model, prompt);
    } else if (providerDef.format === 'gemini') {
        return _callGeminiFormat(endpoint, key, model, prompt);
    } else {
        return _callOpenAIFormat(endpoint, key, model, prompt);
    }
}

// Keep callClaudeAPI as an alias for backward compatibility
const callClaudeAPI = callAI;

async function _callAnthropicFormat(endpoint, key, model, prompt) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API Error ${response.status}`);
    }
    const data = await response.json();
    return data.content[0].text;
}

async function _callOpenAIFormat(endpoint, key, model, prompt) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API Error ${response.status}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
}

async function _callGeminiFormat(endpointTemplate, key, model, prompt) {
    const endpoint = endpointTemplate.replace('{model}', model).replace('{key}', key);
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1024 },
        }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API Error ${response.status}`);
    }
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

function createSummaryPrompt(article) {
    return `Please provide a concise 2-3 sentence summary of the following article:

Title: ${article.title}
Excerpt: ${article.excerpt || 'N/A'}
Notes: ${article.notes || 'N/A'}

Summary:`;
}

function createBriefPrompt(article) {
    return `Create a structured marketing brief for the following article. This will be used in a Marketing Authority content project.

Title: ${article.title}
Source: ${article.url}
Category: ${article.category}
Excerpt: ${article.excerpt || 'N/A'}
Notes: ${article.notes || 'N/A'}
Takeaways: ${article.takeaways || 'N/A'}
Tags: ${(article.tags || []).join(', ') || 'N/A'}

Please format with:
- HEADLINE
- SOURCE
- KEY INSIGHT
- MAIN TAKEAWAYS (bullet points)
- RELEVANCE TO MARKETING
- RECOMMENDED ACTIONS

Brief:`;
}

function createOutlinePrompt(article) {
    return `Based on the following article, create a detailed outline for an original article inspired by it:

Title: ${article.title}
Excerpt: ${article.excerpt || 'N/A'}
Notes: ${article.notes || 'N/A'}
Takeaways: ${article.takeaways || 'N/A'}

Create an outline with:
1. Working title for new article
2. Introduction hook
3. Main sections (3-4) with key points
4. Conclusion
5. Supporting data points or examples to find

Outline:`;
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

    document.getElementById('aiButtonGroup').style.display = apiKey ? 'flex' : 'none';
    document.getElementById('aiWarning').style.display = apiKey ? 'none' : 'block';
    document.getElementById('aiResponseContainer').style.display = 'none';
    document.getElementById('aiResponse').innerHTML = '';

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

function updateAISettingsUI() {
    // Status badge
    const status = document.getElementById('apiStatus');
    if (status) {
        if (apiKey) {
            const providerDef = AI_PROVIDERS[aiProvider] || AI_PROVIDERS.anthropic;
            status.textContent = `✓ Connected — ${providerDef.name}`;
            status.classList.add('active');
            status.classList.remove('error');
        } else {
            status.textContent = '';
            status.classList.remove('active', 'error');
        }
    }

    // Sync form fields in settings modal
    const providerEl = document.getElementById('aiProviderSelect');
    const modelEl = document.getElementById('aiModelInput');
    const endpointEl = document.getElementById('aiEndpointInput');
    const endpointGroup = document.getElementById('customEndpointGroup');
    const keyInput = document.getElementById('apiKeyInput');
    const hintLink = document.getElementById('aiKeyHintLink');
    const subNote = document.getElementById('aiSubscriptionNote');

    if (providerEl) providerEl.value = aiProvider;
    if (modelEl) modelEl.value = aiModel;
    if (endpointEl) endpointEl.value = aiEndpoint;

    const providerDef = AI_PROVIDERS[aiProvider] || AI_PROVIDERS.anthropic;
    if (endpointGroup) endpointGroup.style.display = aiProvider === 'custom' ? '' : 'none';
    if (keyInput) keyInput.placeholder = providerDef.keyPlaceholder;
    if (hintLink) {
        hintLink.textContent = providerDef.keyHintText;
        if (providerDef.keyHintUrl) {
            hintLink.href = providerDef.keyHintUrl;
            hintLink.style.display = '';
        } else {
            hintLink.style.display = 'none';
        }
    }
    if (subNote) subNote.style.display = providerDef.showSubscriptionNote ? '' : 'none';
}

// Alias kept for compatibility
const updateApiKeyUI = updateAISettingsUI;

// ==================== EXPORT / IMPORT ====================
function exportArticles() {
    const blob = new Blob([JSON.stringify(articles, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reading-room-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Library exported');
}

function importArticles(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error('Invalid format');
            const existingIds = new Set(articles.map(a => a.id));
            let added = 0;
            imported.forEach(item => {
                if (item.title && !existingIds.has(item.id)) {
                    if (item.id) { articles.push(item); added++; }
                    else { createArticle(item); added++; }
                }
            });
            await saveArticles();
            updateStats();
            renderArticles();
            showToast(`Imported ${added} article(s)`);
        } catch (err) {
            showToast('Import failed: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ==================== AI OPERATIONS ====================
async function performAIOperation(operation) {
    const article = window.currentArticle;
    if (!article || !apiKey) return;

    const aiModal = document.getElementById('aiModal');
    const content = document.getElementById('aiModalContent');

    const ops = {
        summarize: ['Article Summary', createSummaryPrompt],
        brief: ['Marketing Brief', createBriefPrompt],
        outline: ['Article Outline', createOutlinePrompt]
    };

    const [title, promptFn] = ops[operation] || ['AI Response', () => ''];
    document.getElementById('aiModalTitle').textContent = title;
    const providerLabel = (AI_PROVIDERS[aiProvider] || AI_PROVIDERS.anthropic).name;
    content.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Processing with ${providerLabel}…</span></div>`;
    openModal(aiModal);

    try {
        const response = await callClaudeAPI(promptFn(article));
        content.innerHTML = `<div class="ai-response">${response}</div>`;
        window.aiResponse = response;
    } catch (err) {
        content.innerHTML = `<div style="color:var(--rust);padding:1rem;">${err.message}</div>`;
        showToast('AI operation failed: ' + err.message, 'error');
    }
}

function generateBriefTemplate(article) {
    return `# BRIEF: ${article.title}

**Source:** ${article.url || 'N/A'}
**Category:** ${article.category}
**Status:** ${article.status}

## Key Insight
${article.excerpt || 'N/A'}

## Main Takeaways
${article.takeaways ? article.takeaways.split('\n').filter(t=>t.trim()).map(t => `- ${t}`).join('\n') : '- No takeaways recorded'}

## Notes
${article.notes || 'No additional notes'}

## Tags
${(article.tags||[]).length > 0 ? article.tags.map(t => `#${t}`).join(' ') : 'No tags'}

---
Generated: ${new Date().toLocaleString()}`.trim();
}

async function generateBulkBriefs() {
    const filtered = filterArticles();
    if (!filtered.length) { showToast('No articles match current filters', 'error'); return; }

    const content = document.getElementById('aiModalContent');
    document.getElementById('aiModalTitle').textContent = `Bulk Briefs (${filtered.length} articles)`;
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Generating briefs…</span></div>';
    openModal(document.getElementById('aiModal'));

    try {
        const briefs = [];
        for (const article of filtered) {
            let brief = generateBriefTemplate(article);
            if (apiKey) {
                try {
                    const summary = await callClaudeAPI(createSummaryPrompt(article));
                    brief += `\n\n## AI Summary\n${summary}`;
                } catch { /* skip AI if rate-limited */ }
            }
            briefs.push(brief);
        }
        const fullOutput = briefs.join('\n\n---\n\n');
        content.innerHTML = `<div class="ai-response" style="max-height:500px;">${fullOutput}</div>`;
        window.aiResponse = fullOutput;
    } catch (err) {
        content.innerHTML = `<div style="color:var(--rust);padding:1rem;">Error: ${err.message}</div>`;
        showToast('Bulk brief generation failed', 'error');
    }
}

// ==================== EVENT LISTENERS ====================
document.getElementById('addArticleBtn').addEventListener('click', () => showArticleForm());
document.getElementById('emptyStateAddBtn').addEventListener('click', () => showArticleForm());
document.getElementById('settingsBtn').addEventListener('click', () => openModal(document.getElementById('settingsModal')));
// Export/Import are now in the Settings modal only
document.getElementById('bulkBriefBtn').addEventListener('click', generateBulkBriefs);

document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) { importArticles(e.target.files[0]); e.target.value = ''; }
});

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
    if (currentEditId) { updateArticle(currentEditId, data); }
    else { createArticle(data); }
    await saveArticles();
    updateStats();
    renderArticles();
    closeModal(document.getElementById('articleModal'));
    showToast(currentEditId ? 'Article updated' : 'Article added');
});

// Modal closes
['closeArticleModal','cancelArticleBtn'].forEach(id =>
    document.getElementById(id).addEventListener('click', () => closeModal(document.getElementById('articleModal'))));
['closeDetailModal','closeDetailBtn'].forEach(id =>
    document.getElementById(id).addEventListener('click', () => closeModal(document.getElementById('detailModal'))));
['closeSettingsModal','closeSettingsBtn'].forEach(id =>
    document.getElementById(id).addEventListener('click', () => closeModal(document.getElementById('settingsModal'))));
['closeAiModal','closeAiBtn'].forEach(id =>
    document.getElementById(id).addEventListener('click', () => closeModal(document.getElementById('aiModal'))));

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

document.getElementById('summarizeBtn').addEventListener('click', () => performAIOperation('summarize'));
document.getElementById('briefBtn').addEventListener('click', () => performAIOperation('brief'));
document.getElementById('outlineBtn').addEventListener('click', () => performAIOperation('outline'));

document.getElementById('copyAiBtn').addEventListener('click', () => {
    if (window.aiResponse) {
        navigator.clipboard.writeText(window.aiResponse).then(() => showToast('Copied to clipboard'));
    }
});

// Settings — provider selector: update placeholders/hints dynamically
document.getElementById('aiProviderSelect').addEventListener('change', () => {
    const selectedProvider = document.getElementById('aiProviderSelect').value;
    const providerDef = AI_PROVIDERS[selectedProvider] || AI_PROVIDERS.anthropic;

    // Show/hide custom endpoint field
    document.getElementById('customEndpointGroup').style.display = selectedProvider === 'custom' ? '' : 'none';

    // Update key placeholder
    document.getElementById('apiKeyInput').placeholder = providerDef.keyPlaceholder;

    // Update model placeholder to default
    document.getElementById('aiModelInput').placeholder = providerDef.defaultModel || 'model name';

    // Update hint link
    const hintLink = document.getElementById('aiKeyHintLink');
    hintLink.textContent = providerDef.keyHintText;
    if (providerDef.keyHintUrl) {
        hintLink.href = providerDef.keyHintUrl;
        hintLink.style.display = '';
    } else {
        hintLink.style.display = 'none';
    }

    // Show/hide the subscription note (Anthropic-specific)
    document.getElementById('aiSubscriptionNote').style.display = providerDef.showSubscriptionNote ? '' : 'none';
});

// Settings — Save & Test Connection
document.getElementById('saveApiKeyBtn').addEventListener('click', async () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    const selectedProvider = document.getElementById('aiProviderSelect').value;
    const model = document.getElementById('aiModelInput').value.trim()
        || (AI_PROVIDERS[selectedProvider] || AI_PROVIDERS.anthropic).defaultModel;
    const endpoint = document.getElementById('aiEndpointInput')?.value.trim() || '';

    if (!key) { showToast('Please enter an API key', 'error'); return; }
    if (selectedProvider === 'custom' && !endpoint) { showToast('Please enter an endpoint URL', 'error'); return; }

    const status = document.getElementById('apiStatus');
    status.textContent = 'Testing connection…';
    status.classList.remove('active', 'error');
    try {
        // Test with the chosen provider before committing
        await callAI('Reply with only the word: Ready', key, selectedProvider, model, endpoint);
        await saveAIConfig(key, selectedProvider, model, endpoint);
        showToast('Connection verified and settings saved ✓');
    } catch (err) {
        status.textContent = '✗ Connection failed: ' + err.message;
        status.classList.add('error');
        showToast('Connection test failed', 'error');
    }
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

// Per-article Push to Market Hub button (in the Detail modal)
const pushToMkthubBtn = document.getElementById('pushToMkthubBtn');
if (pushToMkthubBtn) {
    pushToMkthubBtn.addEventListener('click', async () => {
        if (!currentEditId) return;
        const article = articles.find((a) => a.id === currentEditId);
        if (!article) { showToast('Article not found', 'error'); return; }
        pushToMkthubBtn.disabled = true;
        const originalText = pushToMkthubBtn.textContent;
        pushToMkthubBtn.textContent = 'Pushing…';
        const result = await pushArticleToMarketHub(article);
        pushToMkthubBtn.disabled = false;
        pushToMkthubBtn.textContent = originalText;
        if (result.ok) {
            const cat = result.category ? ` (${result.category})` : '';
            showToast(`Pushed to Market Hub${cat} ✓`);
            // Re-render so the synced badge appears
            renderArticles();
            showDetailModal(currentEditId);
        } else {
            showToast('Push failed: ' + result.error, 'error');
        }
    });
}

document.getElementById('settingsExportBtn').addEventListener('click', exportArticles);
document.getElementById('settingsImportBtn').addEventListener('click', () => document.getElementById('fileInput').click());

// Save folder buttons
document.getElementById('chooseFolderBtn').addEventListener('click', pickSaveFolder);
document.getElementById('clearFolderBtn').addEventListener('click', clearSaveFolder);

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
    await loadAIConfig();
    await loadMarketHubConfig();
    await loadSaveDirectory();
    updateStats();
    renderArticles();

    // Pre-fill settings modal fields from loaded state
    const keyEl = document.getElementById('apiKeyInput');
    if (keyEl && apiKey) keyEl.value = apiKey;
    updateMarketHubSettingsUI();

    // Show extension tip banner only in standalone mode
    const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id;
    const banner = document.getElementById('extensionBanner');
    if (banner && !isExtension) banner.style.display = 'flex';
}

init();
