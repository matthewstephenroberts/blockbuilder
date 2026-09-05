#!/usr/bin/env bash
# Build the web app for GitHub Pages, then stage and commit the result.
# Usage: ./scripts/build-pages-and-commit.sh [-p|--push] [-m "message"]
source "$(dirname "$0")/_lib.sh"

"$SCRIPT_DIR/build-pages.sh"

args=("$@")
has_msg=0
for a in "${args[@]:-}"; do
  case "$a" in -m|--message) has_msg=1 ;; esac
done
[ "$has_msg" -eq 1 ] || args+=(-m "Build: web app for GitHub Pages")

exec "$SCRIPT_DIR/commit.sh" "${args[@]}"
