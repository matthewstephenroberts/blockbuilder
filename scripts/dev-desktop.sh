#!/usr/bin/env bash
# Run BlockBuilder desktop app against the live Vite dev server, so UI edits hot-reload without
# repackaging the Electron app each time. Usage: ./scripts/dev-desktop.sh
source "$(dirname "$0")/_lib.sh"

require_npm
ensure_deps

log "Starting Vite dev server → http://localhost:5174"
( cd "$REPO_ROOT" && npm run dev >/dev/null 2>&1 & echo $! > /tmp/blockbuilder-dev-server.pid )
trap '[ -f /tmp/blockbuilder-dev-server.pid ] && kill "$(cat /tmp/blockbuilder-dev-server.pid)" 2>/dev/null; rm -f /tmp/blockbuilder-dev-server.pid' EXIT

log "Waiting for dev server to come up"
for _ in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:5174" && break
  sleep 0.5
done

( cd "$ELECTRON_DIR" && [ -d node_modules ] || npm install )
log "Launching Electron with hot-reload"
( cd "$ELECTRON_DIR" && BLOCKBUILDER_DEV_SERVER_URL="http://localhost:5174" npm start )
