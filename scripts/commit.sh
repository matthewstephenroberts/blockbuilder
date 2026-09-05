#!/usr/bin/env bash
# Stage and commit all changes, optionally pushing to the remote.
# Usage: ./scripts/commit.sh [-p|--push] [-m "message"] [message...]
source "$(dirname "$0")/_lib.sh"

PUSH=0
MSG=""

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--push) PUSH=1; shift ;;
    -m|--message) [ $# -ge 2 ] || die "-m needs a message"; MSG="$2"; shift 2 ;;
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    --) shift; MSG="${MSG:-$*}"; break ;;
    *) MSG="${MSG:-$*}"; break ;;
  esac
done

command -v git >/dev/null 2>&1 || die "git not found."
cd "$REPO_ROOT"
git rev-parse --git-dir >/dev/null 2>&1 || die "Not a git repository: $REPO_ROOT"

if [ -z "$(git status --porcelain)" ]; then
  warn "Nothing to commit — working tree is clean."
  exit 0
fi

[ -n "$MSG" ] || MSG="Update: $(date '+%Y-%m-%d %H:%M:%S')"

log "Staging all changes"
git add -A

log "Committing: $MSG"
git commit -m "$MSG"

if [ "$PUSH" -eq 1 ]; then
  branch="$(git rev-parse --abbrev-ref HEAD)"
  log "Pushing $branch"
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git push
  else
    git push -u origin "$branch"
  fi
  ok "Pushed $branch"
fi

ok "Commit complete"
