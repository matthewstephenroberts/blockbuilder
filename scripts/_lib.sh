# _lib.sh — shared helpers for BlockBuilder scripts. Source this; do not execute.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ELECTRON_DIR="$REPO_ROOT/electron"

# --- logging ---
if [ -t 1 ]; then
  c_blue='\033[0;34m'; c_green='\033[0;32m'; c_yellow='\033[0;33m'; c_red='\033[0;31m'; c_reset='\033[0m'
else
  c_blue=''; c_green=''; c_yellow=''; c_red=''; c_reset=''
fi
log()  { printf "${c_blue}▶ %s${c_reset}\n" "$*"; }
ok()   { printf "${c_green}✔ %s${c_reset}\n" "$*"; }
warn() { printf "${c_yellow}! %s${c_reset}\n" "$*"; }
die()  { printf "${c_red}✗ %s${c_reset}\n" "$*" >&2; exit 1; }

require_npm() { command -v npm >/dev/null 2>&1 || die "npm not found — install Node 18+."; }

ensure_deps() {
  cd "$REPO_ROOT"
  [ -d node_modules ] || { log "Installing dependencies"; npm install; }
}
