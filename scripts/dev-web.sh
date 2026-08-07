#!/usr/bin/env bash
# Launch just the Vite dev server (http://localhost:5174), without Electron.
# Use for web-only development. For desktop app development with hot-reload, use dev-desktop.sh
source "$(dirname "$0")/_lib.sh"

require_npm
ensure_deps
log "Starting Vite dev server → http://localhost:5174  (Ctrl-C to stop)"
cd "$REPO_ROOT"
exec npm run dev
