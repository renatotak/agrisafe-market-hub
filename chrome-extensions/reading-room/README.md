# AgriSafe Reading Room — Chrome extension

A bookmarking + research-library extension that lives inside this repo and pushes
articles into the AgriSafe Market Hub via the Phase 22 ingest endpoint
(`POST /api/reading-room/ingest`).

The extension was originally developed as a standalone tool. It was embedded
into this repo on 2026-04-07 so the consumer (Market Hub) and the producer
(Chrome extension) ship together — no more drift between the two.

## What it does

1. **One-click save** of any web page (popup, context menu, or library page)
2. **Local library** stored in `chrome.storage.local` (offline-first; survives without the Market Hub)
3. **Optional in-extension AI features** — summary / brief / outline via your own Anthropic / OpenAI / Gemini key
4. **Push to AgriSafe Market Hub** — manual per-article push to `/api/reading-room/ingest` from the Detail modal. Articles flow into `agro_news` and run through the Phase 17D algorithmic entity-matcher pipeline (no LLM in the pipeline — guardrail #1)

The local library and the Market Hub push are independent. You can save articles
locally for personal research and selectively push the ones that should feed the
firm's centralized intelligence.

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

After installing, open the Library page (click the extension icon → "Open Library"),
then click **Settings** → **🌾 AgriSafe Market Hub** and fill in:

- **Market Hub Base URL** — `http://localhost:3000` for local dev, or your Vercel
  URL for production. **No trailing slash** (the extension strips it anyway).
- **Shared Secret** — must equal the value of `READING_ROOM_SECRET` in the
  Market Hub's `.env.local` (dev) or Vercel project env (production). The
  Market Hub returns 401 on any request without the matching `x-reading-room-secret` header.

Click **Save & Test Connection**. The extension fires a single probe POST and
expects HTTP 200; on failure the status line shows the exact error.

The URL and secret are stored in `chrome.storage.local`, scoped per-browser-profile.
They are NEVER committed anywhere — the storage lives only on your machine.

## Push an article

1. Save an article (any of the three save flows)
2. Open the Library, click the article to open its Detail modal
3. Click **🌾 Push to Market Hub**
4. On success: a toast confirms the category the Market Hub assigned, and the
   article gains a 🌾 synced badge in the list view. The `mkthubSyncedAt` and
   `mkthubNewsId` fields get stamped on the local article record.

Re-pushing the same article URL is safe — the Market Hub upserts on `source_url`,
so the second push just updates the existing `agro_news` row.

## File layout

```
chrome-extensions/reading-room/
├── manifest.json           # MV3 manifest, host_permissions, version
├── background.js           # Service worker — context menu + open library
├── content-extract.js      # Page metadata extractor (injected on demand)
├── popup.html              # Quick-save popup UI
├── popup.js                # Quick-save popup logic
├── library.html            # Full library UI (Settings, Detail, AI ops)
├── library.js              # Library state, AI calls, Market Hub push
├── icons/                  # 16/48/128 PNG icons
└── README.md               # This file
```

## What was omitted from the original repo

The original `imports/reading-room/` folder also contained a `webapp/` subfolder
that served as a standalone (no-extension) web viewer. Its `app.js` is byte-identical
to `extension/library.js`, so it was redundant after embedding here. The webapp
variant is dropped — articles can be viewed in the extension's library page or
in the Market Hub's `AgroNews` UI once they're pushed.

## How it ties into the Market Hub stack

```
Browser tab                      AgriSafe Market Hub                 Supabase
─────────────                    ───────────────────                 ────────
1. User clicks save  ─┐
                      ├─ chrome.storage.local
2. Extension stores ─┘                                               
                                                                     
3. User clicks                                                       
   "Push to Market Hub"
   in Detail modal                                                   
                                                                     
4. fetch POST   ─────►  /api/reading-room/ingest                     
   x-reading-room-secret  validates secret                           
                          runs categorize() (regex)                  
                          runs entity-matcher (Phase 17D)            
                          upserts agro_news ──────────────────────►  agro_news
                          writes entity_mentions ─────────────────►  entity_mentions
                                                                     
5. 200 OK with                                                       
   news_id + category                                                
                                                                     
6. Extension                                                         
   stamps article                                                    
   with mkthubSyncedAt                                               
```

## Development notes for the extension itself

- The extension uses Manifest V3 (service worker `background.js`, no persistent background page)
- All `fetch()` targets must be in `manifest.json` `host_permissions` — the current allowlist covers `localhost:3000`, `localhost:3001`, `*.vercel.app`, and the three AI provider hosts
- After editing any file, click the refresh icon on the extension's card in `chrome://extensions` for changes to take effect (hard-reload the library page too)
- `chrome.storage.local` quota is generous (~5 MB) but the AI brief operations can produce long markdown blobs — watch out
- The `webapp/` standalone variant is dropped; if you need a web view of the same library, use the Market Hub's AgroNews module instead

## Where the Market Hub side lives

| Layer | File |
|---|---|
| HTTP endpoint | [src/app/api/reading-room/ingest/route.ts](../../src/app/api/reading-room/ingest/route.ts) |
| Migration that created `news_sources` + reading-room sentinel row | [src/db/migrations/032_news_sources.sql](../../src/db/migrations/032_news_sources.sql) |
| Algorithmic categorizer (regex) | shared with `sync-agro-news/route.ts` |
| Algorithmic entity-matcher | [src/lib/entity-matcher.ts](../../src/lib/entity-matcher.ts) |
| Env var | `READING_ROOM_SECRET` in `.env.local` and Vercel project env |
