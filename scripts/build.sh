#!/usr/bin/env bash
# Typecheck and build the app into dist/.
source "$(dirname "$0")/_lib.sh"

require_npm
ensure_deps
log "Building BlockBuilder"
npm run build
ok "Build → $REPO_ROOT/dist"
