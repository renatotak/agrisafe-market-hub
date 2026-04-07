# AgriSafe Reading Room — Chrome extension

A bookmarking extension that lives inside this repo and **automatically syncs**
saved articles into the AgriSafe Market Hub via the Phase 22 ingest endpoint
(`POST /api/reading-room/ingest`).

The extension was originally developed as a standalone tool. It was embedded
into this repo on 2026-04-07 so the consumer (Market Hub) and the producer
(Chrome extension) ship together — no more drift between the two. **v3.0
(2026-04-07)** stripped the in-extension AI provider, save-folder, and import/export
features — the Market Hub is now the single source of truth for everything
downstream of "save".

## What it does

1. **One-click save** of any web page (popup or context menu)
2. **Auto-push** to the AgriSafe Market Hub on every save — no manual button
3. **Local library** stored in `chrome.storage.local` (offline-first; the synced badge tells you which articles made it to the Market Hub)

The Market Hub side runs the algorithmic categorizer + entity matcher (no LLM
in the pipeline — guardrail #1). Articles flow into `agro_news` and `entity_mentions`.

## Install in Chrome (developer mode)

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Pick this folder: `chrome-extensions/reading-room/`
5. The extension icon appears in the toolbar — pin it for quick access

The extension runs entirely in the browser. It does not need npm install or a
build step. Reloading after edits: click the ⟳ refresh icon on the extension's
card in `chrome://extensions`.

## Configure the Market Hub integration

The extension defaults to the production Market Hub URL (`https://agsf-mkthub.vercel.app`),
so you only need to set the **shared secret** before the first save.

1. Click the extension icon → **Open Library**
2. Click **⚙ Settings** → **🌾 AgriSafe Market Hub**
3. **Shared Secret** — paste the value of `READING_ROOM_SECRET` from the Vercel
   project env (or `.env.local` for local dev). The Market Hub returns 401 on
   any request without the matching `x-reading-room-secret` header.
4. (Optional) override the **Market Hub Base URL** — leave the default for prod, or change to `http://localhost:3000` for local dev. **No trailing slash** (the extension strips it anyway).
5. Click **Save & Test Connection**. The extension fires a single probe POST and expects HTTP 200; on failure the status line shows the exact error.

The URL and secret are stored in `chrome.storage.local`, scoped per-browser-profile.
They are NEVER committed anywhere — the storage lives only on your machine.

## Save an article

1. Browse to any page → click the extension icon → fill the popup → **Save to Library**
2. The article is written to `chrome.storage.local` immediately and the popup
   closes
3. The background service worker fires `POST /api/reading-room/ingest` with the
   shared secret. On success it stamps `mkthubSyncedAt` + `mkthubNewsId` on the
   local record so the next time you open the Library you'll see the 🌾 synced
   badge

Re-pushing the same article URL is safe — the Market Hub upserts on `source_url`,
so editing-and-saving an existing article just updates the existing `agro_news` row.
Failed pushes (network down, wrong secret) leave the article unsynced locally;
edit the article in the Library and click Save again to retry.

## File layout

```
chrome-extensions/reading-room/
├── manifest.json           # MV3 manifest, host_permissions, version
├── background.js           # Service worker — context menu + auto-push to Market Hub
├── content-extract.js      # Page metadata extractor (injected on demand)
├── popup.html              # Quick-save popup UI
├── popup.js                # Quick-save popup logic (sends push message after save)
├── library.html            # Library UI (Settings + browse + edit)
├── library.js              # Library state + Market Hub config
├── icons/                  # 16/48/128 PNG icons
└── README.md               # This file
```

## How it ties into the Market Hub stack

```
Browser tab                      AgriSafe Market Hub                 Supabase
─────────────                    ───────────────────                 ────────
1. User clicks save  ─┐
                      ├─ chrome.storage.local
2. Popup stores      ─┘
3. Popup sends `push-to-mkthub` to background service worker
                                                                     
4. background.js fetch POST  ──►  /api/reading-room/ingest           
   x-reading-room-secret           validates secret                  
                                   runs categorize() (regex)         
                                   runs entity-matcher (Phase 17D)   
                                   upserts agro_news ──────────────► agro_news
                                   writes entity_mentions ─────────► entity_mentions
                                                                     
5. 200 OK with news_id + category                                    
                                                                     
6. background.js stamps article with mkthubSyncedAt + mkthubNewsId
```

## Development notes for the extension itself

- The extension uses Manifest V3 (service worker `background.js`, no persistent background page)
- All `fetch()` targets must be in `manifest.json` `host_permissions` — the current allowlist covers `localhost:3000`, `localhost:3001`, and `*.vercel.app`
- After editing any file, click the refresh icon on the extension's card in `chrome://extensions` for changes to take effect (hard-reload the library page too)
- `chrome.storage.local` quota is generous (~5 MB) — should never run out for plain article metadata
- v2.x had in-extension AI features (Anthropic / OpenAI / Gemini direct calls) and a local save folder. Both were dropped in v3.0 — the Market Hub owns those concerns now

## Where the Market Hub side lives

| Layer | File |
|---|---|
| HTTP endpoint | [src/app/api/reading-room/ingest/route.ts](../../src/app/api/reading-room/ingest/route.ts) |
| Migration that created `news_sources` + reading-room sentinel row | [src/db/migrations/032_news_sources.sql](../../src/db/migrations/032_news_sources.sql) |
| Algorithmic categorizer (regex) | shared with `sync-agro-news/route.ts` |
| Algorithmic entity-matcher | [src/lib/entity-matcher.ts](../../src/lib/entity-matcher.ts) |
| Env var | `READING_ROOM_SECRET` in `.env.local` and Vercel project env |
