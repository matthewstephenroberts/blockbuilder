#!/usr/bin/env bash
# Package BlockBuilder desktop app (Electron wrapper) for the current OS. Produces a native
# installer under electron/release/ — .exe (nsis) on Windows, .dmg on macOS, .AppImage/.deb on
# Linux. electron-builder can't reliably cross-build a macOS .dmg from Windows/Linux (needs real
# macOS tooling), so building "all" platforms means running this script on each target OS.
# Usage: ./scripts/build-desktop.sh [--dir]   (--dir = unpacked app folder only, skip installer packaging)
source "$(dirname "$0")/_lib.sh"

require_npm
ensure_deps

log "Building web app"
npm run build

log "Copying web build into electron app"
rm -rf "$ELECTRON_DIR/web-dist"
cp -r "$REPO_ROOT/dist" "$ELECTRON_DIR/web-dist"

# A major-version bump of electron in package.json against a stale node_modules/package-lock
# can wedge npm's resolver or leave a mismatched binary — detect the mismatch and force a
# clean reinstall instead of letting npm install hang or half-upgrade.
if [ -f "$ELECTRON_DIR/node_modules/electron/package.json" ]; then
  INSTALLED_MAJOR="$(node -p "require('$ELECTRON_DIR/node_modules/electron/package.json').version.split('.')[0]" 2>/dev/null || echo "")"
  WANTED_MAJOR="$(node -p "require('$ELECTRON_DIR/package.json').devDependencies.electron.replace(/[^0-9.]/g,'').split('.')[0]" 2>/dev/null || echo "")"
  if [ -n "$INSTALLED_MAJOR" ] && [ -n "$WANTED_MAJOR" ] && [ "$INSTALLED_MAJOR" != "$WANTED_MAJOR" ]; then
    warn "Installed electron v$INSTALLED_MAJOR != required v$WANTED_MAJOR — clean reinstall"
    rm -rf "$ELECTRON_DIR/node_modules" "$ELECTRON_DIR/package-lock.json"
  fi
fi

log "Installing electron dependencies (electron binary is ~120MB — first install takes a while)"
( cd "$ELECTRON_DIR" && npm install )

if [ "${1:-}" = "--dir" ]; then
  log "Packaging (unpacked dir only)"
  ( cd "$ELECTRON_DIR" && npx electron-builder --dir )
else
  log "Packaging installer"
  # Forward all arguments to electron-builder (e.g., --mac, --win, --linux, --publish)
  ( cd "$ELECTRON_DIR" && npx electron-builder "$@" )
fi

ok "Desktop build complete — see electron/release/"
