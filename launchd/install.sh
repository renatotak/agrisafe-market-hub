#!/usr/bin/env bash
#
# Phase 25 — Mac launchd installer for the AgriSafe Market Hub cron pipeline.
#
# Run this once on the Mac mini that will host the 24/7 ingestion server.
# It is idempotent — re-running it just refreshes the installed plists.
#
# What it does:
#   1. Verifies prerequisites (node, npm, repo root, .env.local)
#   2. Runs `npm install` if node_modules is missing
#   3. Smoke-tests the dispatcher with sync-scraper-healthcheck
#   4. Detects your Mac-specific paths (repo, node, username)
#   5. Generates plist files from launchd/jobs.json
#   6. Substitutes the three REPLACE_ME placeholders into each plist
#   7. Creates ~/Library/Logs/AgriSafe/
#   8. Copies the personalized plists to ~/Library/LaunchAgents/
#   9. Loads each agent via launchctl bootstrap
#  10. Prints next steps (sleep prevention, manual smoke test, etc.)
#
# What it does NOT do automatically — these are still on you:
#   - Provision .env.local with secrets (copy from your dev machine)
#   - Disable Mac sleep (`sudo pmset -a sleep 0 disablesleep 1`)
#   - Install Tailscale for remote access
#
# Usage from the repo root:
#   bash launchd/install.sh                # install or refresh all jobs
#   bash launchd/install.sh --uninstall    # remove every agrisafe agent
#   bash launchd/install.sh --reload       # bootout + bootstrap (refresh)
#   bash launchd/install.sh --dry-run      # print what would happen
#
# Safe to re-run after editing launchd/jobs.json — just regenerates +
# reinstalls the plists.

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHD_DIR="${REPO_ROOT}/launchd"
PLISTS_SRC="${LAUNCHD_DIR}/plists"
LAUNCHAGENTS="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/AgriSafe"
JOBS_JSON="${LAUNCHD_DIR}/jobs.json"
LABEL_PREFIX="com.agrisafe."

# ─── Args ────────────────────────────────────────────────────────────
MODE="install"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --uninstall) MODE="uninstall" ;;
    --reload)    MODE="reload" ;;
    --dry-run)   DRY_RUN=1 ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "[install] unknown arg: $arg (use --help)"
      exit 2
      ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] $*"
  else
    eval "$@"
  fi
}

step() {
  echo ""
  echo "── $1"
}

# ─── 0. Sanity check the platform ────────────────────────────────────
if [ "$(uname)" != "Darwin" ]; then
  echo "[install] this script is macOS-only (you're on $(uname))"
  exit 1
fi

# ─── 1. Verify prerequisites ─────────────────────────────────────────
step "1. Checking prerequisites"

if ! command -v node >/dev/null 2>&1; then
  echo "[install] node not found in PATH. Install with: brew install node@22"
  exit 1
fi
NODE_BIN="$(which node)"
echo "  node binary: $NODE_BIN"
echo "  node version: $(node --version)"

if [ ! -f "${REPO_ROOT}/package.json" ]; then
  echo "[install] package.json not found at ${REPO_ROOT}"
  echo "[install] run this script from inside the agsf-mkthub repo"
  exit 1
fi
echo "  repo root:  $REPO_ROOT"

if [ ! -f "${REPO_ROOT}/.env.local" ]; then
  echo ""
  echo "[install] .env.local NOT FOUND at ${REPO_ROOT}/.env.local"
  echo "[install] You must provision it before this script can finish."
  echo "[install] Copy it from your dev machine — the required keys are:"
  echo "          NEXT_PUBLIC_SUPABASE_URL"
  echo "          SUPABASE_SERVICE_ROLE_KEY"
  echo "          DATABASE_URL  (session pooler, port 5432)"
  echo "          GOOGLE / EMBRAPA / OPENAI / GEMINI / READING_ROOM_SECRET keys as needed"
  echo "[install] Re-run this script once .env.local is in place."
  exit 1
fi
echo "  .env.local: ${REPO_ROOT}/.env.local"

if [ ! -d "${REPO_ROOT}/node_modules" ]; then
  step "1a. node_modules missing — running npm install"
  run "(cd '$REPO_ROOT' && npm install)"
fi

if [ ! -x "${REPO_ROOT}/node_modules/.bin/tsx" ]; then
  echo "[install] tsx not found in node_modules — re-running npm install"
  run "(cd '$REPO_ROOT' && npm install)"
fi

# ─── 2. Uninstall path ───────────────────────────────────────────────
if [ "$MODE" = "uninstall" ]; then
  step "Uninstalling all agrisafe launchd agents"
  for plist in "$LAUNCHAGENTS"/${LABEL_PREFIX}*.plist; do
    [ -f "$plist" ] || continue
    label="$(basename "$plist" .plist)"
    echo "  bootout $label"
    run "launchctl bootout 'gui/$(id -u)/$label' 2>/dev/null || true"
    run "rm '$plist'"
  done
  echo ""
  echo "[install] uninstall complete. Logs in $LOG_DIR remain — delete manually if desired."
  exit 0
fi

# ─── 3. Smoke test the dispatcher ────────────────────────────────────
step "2. Smoke-testing the cron dispatcher (sync-scraper-healthcheck)"
echo "  This calls the GitHub /zen probe and writes one row to scraper_runs."
echo "  If this succeeds, your env vars + tsx + Supabase wiring are good."
if [ "$DRY_RUN" -eq 0 ]; then
  if ! (cd "$REPO_ROOT" && npm run cron sync-scraper-healthcheck); then
    echo ""
    echo "[install] smoke test FAILED. Fix the error above before installing launchd agents."
    echo "[install] common causes:"
    echo "          - .env.local missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    echo "          - tsx not installed (rerun: npm install)"
    echo "          - network blocked"
    exit 1
  fi
else
  echo "  [dry-run] would run: npm run cron sync-scraper-healthcheck"
fi

# ─── 4. Generate fresh plists ────────────────────────────────────────
step "3. Generating plists from launchd/jobs.json"
run "node '$LAUNCHD_DIR/generate-plists.js'"

if [ ! -d "$PLISTS_SRC" ]; then
  echo "[install] $PLISTS_SRC missing after generation — bug in generate-plists.js"
  exit 1
fi

# ─── 5. Create log directory ─────────────────────────────────────────
step "4. Creating log directory $LOG_DIR"
run "mkdir -p '$LOG_DIR'"

# ─── 6. Personalize + install each plist ─────────────────────────────
step "5. Personalizing + installing plists into $LAUNCHAGENTS"
mkdir -p "$LAUNCHAGENTS"

USERNAME="$(whoami)"
echo "  user:      $USERNAME"
echo "  repo:      $REPO_ROOT"
echo "  node:      $NODE_BIN"

# sed -i works differently on macOS (BSD) vs GNU. macOS needs an empty
# argument after -i. We use a temporary file approach instead so this
# script also works on Linux for testing.
sed_inplace() {
  local pattern="$1"
  local file="$2"
  local tmp
  tmp="$(mktemp)"
  sed "$pattern" "$file" > "$tmp"
  mv "$tmp" "$file"
}

for src_plist in "$PLISTS_SRC"/${LABEL_PREFIX}*.plist; do
  [ -f "$src_plist" ] || continue
  label="$(basename "$src_plist" .plist)"
  dest="$LAUNCHAGENTS/$(basename "$src_plist")"

  # Bootout the existing version (no-op if not loaded)
  if [ "$DRY_RUN" -eq 0 ]; then
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  fi

  # Copy + substitute placeholders
  if [ "$DRY_RUN" -eq 0 ]; then
    cp "$src_plist" "$dest"
    sed_inplace "s|REPLACE_ME_ABSOLUTE_PATH_TO_REPO|$REPO_ROOT|g" "$dest"
    sed_inplace "s|REPLACE_ME_ABSOLUTE_PATH_TO_NODE|$NODE_BIN|g" "$dest"
    sed_inplace "s|REPLACE_ME_USERNAME|$USERNAME|g" "$dest"
  else
    echo "  [dry-run] would install $dest"
  fi

  # Bootstrap the new version
  if [ "$MODE" = "install" ] || [ "$MODE" = "reload" ]; then
    if [ "$DRY_RUN" -eq 0 ]; then
      launchctl bootstrap "gui/$(id -u)" "$dest"
    fi
    echo "  ✓ $label"
  fi
done

# ─── 7. Verify ──────────────────────────────────────────────────────
step "6. Verifying loaded agents"
if [ "$DRY_RUN" -eq 0 ]; then
  loaded="$(launchctl list | grep -c "${LABEL_PREFIX}" || true)"
  echo "  $loaded agrisafe agents loaded:"
  launchctl list | grep "${LABEL_PREFIX}" || echo "  (none — something went wrong)"
fi

# ─── 8. Print next steps ─────────────────────────────────────────────
cat <<EOF

══════════════════════════════════════════════════════════════════════
  Install complete.
══════════════════════════════════════════════════════════════════════

NEXT STEPS (manual — these are NOT done for you):

1. DISABLE MAC SLEEP — sleeping Macs don't fire launchd timers:
     sudo pmset -a sleep 0 disablesleep 1
     sudo pmset -a disksleep 0 powernap 0 hibernatemode 0
   Also: System Settings → Battery / Energy → "Start up automatically
   after a power failure" → ON.

2. CONFIRM ONE JOB FIRES MANUALLY:
     launchctl kickstart -k gui/\$(id -u)/com.agrisafe.sync-market-data
     tail -f ~/Library/Logs/AgriSafe/sync-market-data.log

3. CHECK THE ACTIVITY LOG IN THE WEBAPP:
   Open Settings → Registro de Atividade. Within ~30s of step 2, you
   should see a new sync-market-data row appear.

4. INSTALL TAILSCALE (recommended for remote SSH):
     brew install --cask tailscale
     open /Applications/Tailscale.app

5. (OPTIONAL) WEEKLY LOG ROTATION — see launchd/README.md.

REGENERATE PLISTS AFTER EDITING jobs.json:
     bash launchd/install.sh --reload

UNINSTALL EVERYTHING:
     bash launchd/install.sh --uninstall

══════════════════════════════════════════════════════════════════════
EOF
