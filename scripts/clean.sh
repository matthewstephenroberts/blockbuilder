#!/usr/bin/env bash
# Remove build output (web and desktop) and Electron release artifacts.
# Keep node_modules intact for faster rebuilds. Use with no args.
source "$(dirname "$0")/_lib.sh"

log "Removing web build artifacts"
rm -rf "$REPO_ROOT/dist" "$REPO_ROOT/.vite"

log "Removing electron build artifacts"
rm -rf "$ELECTRON_DIR/web-dist" "$ELECTRON_DIR/release"

ok "Clean (node_modules kept for faster rebuilds)"
