# launchd — Mac-as-Server Cron Pipeline

> **Goal:** run the AgriSafe Market Hub ingestion pipeline 24/7 on a Mac
> mini server, with each scraper on its own schedule, free of Vercel
> Hobby's single-daily-cron limit.
>
> **Status:** Phase 25 complete. All 19 cron routes ported. Run
> `bash launchd/install.sh` on the Mac to install everything.

---

## ⚡ Quickstart (Mac)

If you already have the Mac set up with Node + the repo cloned + `.env.local`
in place, this is the entire install:

```bash
cd ~/agrisafe/agsf-mkthub
npm install
bash launchd/install.sh
```

That's it. The script:
1. Verifies prerequisites
2. Smoke-tests the dispatcher (`sync-scraper-healthcheck`)
3. Generates plists from `launchd/jobs.json`
4. Substitutes your repo path / node binary / username into each plist
5. Copies them to `~/Library/LaunchAgents/`
6. `launchctl bootstrap`s every agent
7. Prints next-step instructions

**Then do these manual steps once** (the script can't do them for you):

```bash
# 1. Disable sleep — sleeping Macs do not fire launchd timers
sudo pmset -a sleep 0 disablesleep 1
sudo pmset -a disksleep 0 powernap 0 hibernatemode 0

# 2. Force one job to run now and watch it
launchctl kickstart -k gui/$(id -u)/com.agrisafe.sync-market-data
tail -f ~/Library/Logs/AgriSafe/sync-market-data.log

# 3. (Optional) Tailscale for remote SSH from anywhere
brew install --cask tailscale
open /Applications/Tailscale.app
```

Then open the webapp → Settings → Registro de Atividade. You should see
new rows appearing as launchd fires each job.

**To regenerate plists after editing `jobs.json`:**
```bash
bash launchd/install.sh --reload
```

**To remove everything:**
```bash
bash launchd/install.sh --uninstall
```

---

## Full Mac setup from a fresh machine

If the Mac is brand new, do these steps once before running the
quickstart above:

```bash
# 1. Install Homebrew (if not already)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Node 22 (LTS)
brew install node@22

# 3. Verify
which node          # should print /opt/homebrew/bin/node on Apple Silicon
node --version      # should print v22.x

# 4. Clone the repo
mkdir -p ~/agrisafe && cd ~/agrisafe
git clone <your-fork-url> agsf-mkthub
cd agsf-mkthub

# 5. Install dependencies
npm install

# 6. Provision .env.local — copy from your dev machine.
#    Required keys (see CLAUDE.md for the full list):
#      NEXT_PUBLIC_SUPABASE_URL
#      SUPABASE_SERVICE_ROLE_KEY
#      DATABASE_URL              (Session pooler, port 5432)
#      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
#      AGROAPI_CONSUMER_KEY / AGROAPI_CONSUMER_SECRET
#      OPENAI_API_KEY            (optional)
#      GEMINI_API_KEY            (optional)
#      READING_ROOM_SECRET       (Chrome extension)
#      CRON_SECRET               (optional, for production gate)

# 7. Install all 19 launchd jobs
bash launchd/install.sh
```

Then do the three manual steps from the Quickstart (sleep, kickstart, Tailscale).

---

## Architecture (one screen)

```
┌────────────────────────────┐         ┌──────────────────────┐
│  Mac mini (24/7 server)    │         │   Vercel Hobby       │
│                            │         │                      │
│  launchd ──┐               │         │  Next.js webapp      │
│            │               │         │  (AgriSafe team UI)  │
│            ▼               │         │                      │
│  src/scripts/cron/         │         │  /api/cron/* routes  │
│    run-job.ts <name>       │         │  (manual triggers +  │
│            │               │         │   Vercel fallback)   │
│            ▼               │         │                      │
│  src/jobs/<name>.ts        │◀────────┤  also calls          │
│  (pure logic, framework-   │  shared │  src/jobs/<name>.ts  │
│   agnostic)                │  module │                      │
│            │               │         └──────────────────────┘
│            ▼               │                    │
│            └─────────┬─────┴────────────────────┘
│                      ▼                          │
│              ┌──────────────┐                   │
│              │   Supabase   │◀──────────────────┘
│              │   (cloud)    │
│              └──────────────┘
└────────────────────────────┘
```

**Key invariant:** the Next.js cron route AND the launchd CLI dispatcher
both call the same `src/jobs/<name>.ts` module. Logic lives in exactly
one place. The route handles HTTP envelope; the dispatcher handles
process exit codes; the job handles ingestion + logging.

The Settings → Activity Log surfaces both rails identically.

---

## File map

| Path | Purpose |
|---|---|
| [`launchd/jobs.json`](jobs.json) | **Source of truth** for all 19 job schedules. Edit then regenerate. |
| [`launchd/generate-plists.js`](generate-plists.js) | Reads jobs.json → writes plists/*.plist |
| [`launchd/plists/`](plists/) | 19 generated `.plist` files (one per job, ignored by git? — see below) |
| [`launchd/install.sh`](install.sh) | Idempotent installer. Personalizes plists + bootstraps each agent. |
| [`launchd/README.md`](README.md) | This file. |
| [`src/scripts/cron/run-job.ts`](../src/scripts/cron/run-job.ts) | Generic dispatcher: `npm run cron <job-name>` |
| [`src/jobs/types.ts`](../src/jobs/types.ts) | Shared `JobResult` type. |
| [`src/jobs/<name>.ts`](../src/jobs/) | One file per cron — pure logic, framework-agnostic. |
| [`src/lib/scraper-job-runner.ts`](../src/lib/scraper-job-runner.ts) | Adapter that wraps `runScraper()` + upsert into a `JobResult`. |

---

## The 19 jobs at a glance

| Name | Schedule | Target table |
|---|---|---|
| sync-market-data | every 30min | commodity_prices |
| sync-agro-news | every 2h | agro_news |
| sync-recuperacao-judicial | every 4h | recuperacao_judicial |
| sync-regulatory | every 4h | regulatory_norms |
| sync-prices-na | every 1h *(stub — does not write)* | commodity_prices_regional |
| sync-cnj-atos | daily 09:00 | regulatory_norms |
| sync-events-na | daily 06:00 | events |
| sync-competitors | daily 10:00 | competitor_signals |
| sync-retailer-intelligence | daily 11:00 | retailer_intelligence |
| sync-faostat | daily 02:00 | macro_statistics |
| archive-old-news | daily 04:00 | news_knowledge + agro_news |
| sync-scraper-healthcheck | daily 23:00 | (probe — no upsert) |
| sync-industry-profiles | Sunday 03:00 | industry_products |
| sync-agrofit-bulk | Sunday 04:00 | industry_products + ingredients + junctions |
| sync-events-agroadvance | Sunday 05:00 | events |
| sync-cvm-agro | Sunday 06:00 | regulatory_norms |
| sync-bcb-rural | Sunday 07:00 | regulatory_norms |
| sync-key-agro-laws | Sunday 08:00 | regulatory_norms |
| sync-worldbank-prices | Sunday 09:00 | macro_statistics |

Set the Mac timezone to **America/Sao_Paulo** so all clock times match
Brazilian agro hours: `sudo systemsetup -settimezone America/Sao_Paulo`.

---

## Why a Mac instead of Vercel Pro

| | Vercel Hobby | Vercel Pro ($20/mo) | Mac mini |
|---|---|---|---|
| Cron entries | **1** *(the bottleneck)* | Unlimited | Unlimited |
| Function timeout | 10s | 60s (300s w/ config) | None |
| Headless browser | No | Memory-bounded | Yes (Playwright) |
| Long crawls (USDA PSD, CVM walker) | No | Tight | Yes |
| Multi-step Claude tool use | Times out | Tight | Yes |
| Cost | Free | ~$240/yr | ~$1/mo electricity |

The Mac unlocks every scraper that's currently deferred in
[`memory/project_status.md`](../C:/Users/renat/.claude/projects/c--Users-renat--gemini-antigravity-projects-0-gh-agrisafe-agsf-mkthub/memory/project_status.md).

---

## Sleep prevention (THE most common gotcha)

**A sleeping Mac stops launchd timers.** If the Mac sleeps at 23:00 and
wakes at 07:00, every job that was scheduled in between is silently
skipped.

### Option A — disable sleep entirely (recommended for a dedicated server)

```bash
sudo pmset -a sleep 0
sudo pmset -a disksleep 0
sudo pmset -a powernap 0
sudo pmset -a hibernatemode 0
```

Verify:
```bash
pmset -g | grep -E '(sleep|powernap|hibernate)'
```

Set "Start up automatically after a power failure" in System Settings → Battery / Energy.

### Option B — wrap each job in `caffeinate`

Edit `launchd/jobs.json` → in the future could add a `caffeinate: true`
flag and have the generator wrap node with `/usr/bin/caffeinate -is`.
For now, Option A is the recommended path on a dedicated server.

---

## Remote access (don't expose SSH)

Install [Tailscale](https://tailscale.com) (free for personal use).
Encrypted SSH from anywhere without opening ports on your home router.

```bash
brew install --cask tailscale
open /Applications/Tailscale.app
# log in once, then ssh from any other Tailscale machine
ssh renato@agrisafe-mac
```

Do **not** enable macOS Remote Login on a public IP — every script
kiddie scans port 22.

---

## Log rotation

macOS has no `logrotate` by default. Quick weekly cleanup:

```bash
# Drop into ~/Library/LaunchAgents/com.agrisafe.log-rotate.plist:
# Truncates any AgriSafe log >50 MB on Sundays at 02:30.
find ~/Library/Logs/AgriSafe -name "*.log" -size +50M -exec truncate -s 0 {} \;
```

Or just `> ~/Library/Logs/AgriSafe/<job>.log` manually when it gets noisy.

---

## Sanity checks

| Check | Command |
|---|---|
| Are all 19 agents loaded? | `launchctl list \| grep agrisafe \| wc -l` (should be 19) |
| Did the last run succeed? | `tail -20 ~/Library/Logs/AgriSafe/sync-market-data.log` |
| Are activities being logged? | Settings → Activity Log → filter by source kind = `cron` |
| Is the Mac asleep? | `pmset -g log \| grep -i sleep \| tail` |
| When does launchd think the next run is? | `launchctl print gui/$(id -u)/com.agrisafe.sync-market-data \| grep -A2 next` |
| Run any job manually | `npm run cron <job-name>` (from the repo root) |
| Force launchd to fire one now | `launchctl kickstart -k gui/$(id -u)/com.agrisafe.<job-name>` |

---

## Editing schedules

1. Edit [`launchd/jobs.json`](jobs.json) — change `interval` (seconds) or `calendar` ({Hour, Minute, Weekday})
2. Run `bash launchd/install.sh --reload`
3. Done. The script regenerates the plists and reloads each agent.

**Schedule field reference:**

```json
// Every N seconds:
{ "interval": 1800 }              // every 30 min

// Daily at HH:MM (local time):
{ "calendar": { "Hour": 9, "Minute": 0 } }

// Weekly: add Weekday (0=Sun, 1=Mon, ..., 6=Sat):
{ "calendar": { "Hour": 6, "Minute": 0, "Weekday": 0 } }   // Sunday 06:00
```

---

## When NOT to use this pattern

- **HTTP-triggered work** (Reading Room ingest, CRM endpoints, manual UI
  actions). Stays on Vercel — those don't need a schedule.
- **One-shot scripts** (backfills, migrations). Stays in `src/scripts/*.js` —
  `node --env-file=.env.local src/scripts/X.js` for a single run is simpler.
- **Sub-minute schedules.** launchd is reliable down to ~1 minute; below that
  use a long-running daemon with `setInterval` instead.

---

## Troubleshooting

**`Bootstrap failed: 5: Input/output error`**
→ `StandardOutPath` directory doesn't exist. The install.sh script
creates it for you, but if you bypassed the script: `mkdir -p ~/Library/Logs/AgriSafe`

**Plist loads but never runs**
→ Mac is sleeping. See "sleep prevention" above.

**Job runs but writes nothing to Supabase**
→ Env vars not loaded. Check that `WorkingDirectory` in the plist points
to the repo root and `.env.local` exists there. Test with
`npm run cron sync-scraper-healthcheck` first.

**`tsx: command not found`**
→ Run `npm install` on the Mac. `tsx` is in `devDependencies`.

**`Error: Cannot find module '@/jobs/...'`**
→ tsx honors tsconfig `paths` only when the working directory is the
repo root. Make sure `WorkingDirectory` in the plist is correct
(install.sh sets this for you).

**Activity log shows the run but Supabase rows didn't update**
→ Check the partial errors in the log — many scrapers (BCB SGS, RSS feeds)
return transient HTTP errors per-source. The job logs each per-source
failure individually and still reports `partial` status.

**`launchctl bootstrap` says "service already loaded"**
→ Run `bash launchd/install.sh --reload` which boots out + bootstraps each agent.

---

## Phase 25 changelog

This setup was introduced in Phase 25 (April 2026) to liberate the
ingestion pipeline from Vercel Hobby's one-cron-per-day limit. Before
Phase 25, all 17 cron routes ran inside a single `sync-all` orchestrator
every day at 08:00 UTC, which meant:
- Long-running scrapers (USDA PSD, CVM walker) couldn't fit Vercel's
  function timeout
- Headless-browser scrapes (BCB SharePoint pages) were impossible
- Frequent crons (market data, news) only updated once per day

With launchd + a Mac mini, every job has its own cadence, no timeout
limits, and the Mac can run Playwright for the JS-rendered scrapers
that were blocked. The Activity Log panel surfaces every run regardless
of where it executed, so observability stays unified.
