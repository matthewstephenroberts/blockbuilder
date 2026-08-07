#!/usr/bin/env bash
# Build the web app for GitHub Pages and copy it into pages/app/.
# Usage: ./scripts/build-pages.sh
source "$(dirname "$0")/_lib.sh"

PAGES_APP_DIR="$REPO_ROOT/pages/app"

require_npm
ensure_deps

log "Building BlockBuilder"
cd "$REPO_ROOT"
npm run build

log "Copying built files into $PAGES_APP_DIR"
rm -rf "$PAGES_APP_DIR"
mkdir -p "$PAGES_APP_DIR"
cp -r "$REPO_ROOT/dist/." "$PAGES_APP_DIR/"

ok "Pages build complete → $PAGES_APP_DIR"
echo ""
echo "Next steps:"
echo "1. git add pages/"
echo "2. git commit -m \"Build: web app for GitHub Pages\""
echo "3. git push"
echo "4. In GitHub: Settings → Pages → Deploy from a branch → main → /pages"
