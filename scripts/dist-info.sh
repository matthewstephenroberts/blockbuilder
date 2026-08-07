#!/usr/bin/env bash
# Show locations of built web and desktop artifacts.
source "$(dirname "$0")/_lib.sh"

echo ""
log "BlockBuilder build artifacts:"
echo ""

if [ -d "$REPO_ROOT/dist" ]; then
  ok "Web build: $REPO_ROOT/dist"
  du -sh "$REPO_ROOT/dist" 2>/dev/null | sed 's/^/    /'
else
  warn "Web build not found (run: ./scripts/build.sh)"
fi

echo ""

if [ -d "$ELECTRON_DIR/release" ]; then
  ok "Desktop installer(s): $ELECTRON_DIR/release"
  find "$ELECTRON_DIR/release" -maxdepth 2 \( -name "*.dmg" -o -name "*.exe" -o -name "*.AppImage" -o -name "*.deb" \) 2>/dev/null | while read -r f; do
    du -h "$f" 2>/dev/null | sed 's/^/    /'
  done
else
  warn "Desktop builds not found (run: ./scripts/build-desktop.sh)"
fi

echo ""
