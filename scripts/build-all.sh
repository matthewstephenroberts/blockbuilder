#!/usr/bin/env bash
# Build web app + package desktop installer for current OS. Wrapper around build-desktop.sh.
source "$(dirname "$0")/_lib.sh"
exec "$(dirname "$0")/build-desktop.sh" "$@"
