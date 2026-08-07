#!/usr/bin/env bash
# Launch the Vite dev server (http://localhost:5174).
source "$(dirname "$0")/_lib.sh"

require_npm
ensure_deps
log "Starting Vite dev server → http://localhost:5174  (Ctrl-C to stop)"
exec npm run dev
