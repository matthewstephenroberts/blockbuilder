# BlockBuilder Build Scripts

Helper scripts for development and building BlockBuilder (web + Electron desktop app).

All scripts source `_lib.sh` for common functions (logging, npm checks, etc.) and exit on error.

## Quick Reference

| Command | What it does |
|---------|-------------|
| `./scripts/dev-desktop.sh` | **Start here for desktop development** — launch Vite + Electron with hot-reload |
| `./scripts/dev-web.sh` | Web-only development (Vite dev server, no Electron) |
| `./scripts/build.sh` | Build web app to `dist/` |
| `./scripts/build-desktop.sh` | Build web + package Electron installer for this OS |
| `./scripts/build-all.sh` | Alias for `build-desktop.sh` (same as npm `electron-dist`) |
| `./scripts/build-pages.sh` | Build web app into `pages/app/` for GitHub Pages |
| `./scripts/clean.sh` | Remove build artifacts (keeps node_modules) |
| `./scripts/dist-info.sh` | Show locations and sizes of built artifacts |

## Development Workflow

### Desktop App with Hot-Reload (Recommended)

```bash
./scripts/dev-desktop.sh
```

- Starts Vite dev server on `http://localhost:5174`
- Launches Electron pointing to the dev server
- Code changes hot-reload instantly in the app
- Press Ctrl-C to stop both servers

### Web Only

```bash
./scripts/dev-web.sh
```

- Starts just the Vite dev server on `http://localhost:5174`
- Useful for quick testing in browser without Electron overhead

### Production Build

```bash
./scripts/build.sh
```

- Compiles TypeScript and builds web assets to `dist/`
- Does NOT package Electron app

### Desktop Installer

```bash
./scripts/build-desktop.sh
```

- Builds web app
- Packages Electron installer for current OS:
  - **macOS**: Creates `.dmg` installer (requires macOS)
  - **Windows**: Creates `.exe` installer (requires Windows)
  - **Linux**: Creates `.AppImage` and `.deb` packages

Output goes to `electron/release/`

#### Quick Local Test (Without Installer)

```bash
./scripts/build-desktop.sh --dir
```

- Builds app folder only, skips installer packaging
- Much faster for local testing

### GitHub Pages

```bash
./scripts/build-pages.sh
```

- Builds the web app and copies it into `pages/app/`
- Commit `pages/` and push — see `pages/README.md` for the one-time GitHub Pages setup

### Cleanup

```bash
./scripts/clean.sh
```

- Removes:
  - Web build artifacts (`dist/`, `.vite/`)
  - Electron release artifacts (`web-dist/`, `release/`)
- Keeps:
  - Root `node_modules/`
  - Electron `node_modules/`

These are kept for faster rebuilds. To do a full clean:

```bash
rm -rf node_modules electron/node_modules
./scripts/clean.sh
```

### Check Build Status

```bash
./scripts/dist-info.sh
```

- Shows sizes and locations of current builds
- Helpful before deploying to verify artifacts exist

## Implementation Details

- Scripts use `set -euo pipefail` for safety (exit on error, undefined vars, pipe failures)
- Logging uses colored output when terminal detected (blue `▶`, green `✔`, yellow `!`, red `✗`)
- `_lib.sh` provides shared functions: `log`, `ok`, `warn`, `die`, `require_npm`, `ensure_deps`
- Environment paths are computed once at startup: `$REPO_ROOT`, `$ELECTRON_DIR`

## Troubleshooting

**"npm not found"**: Install Node 18+

**Dev server won't start**: Check port 5174 is free: `lsof -i :5174`

**Electron launch hangs**: Web build probably missing. Run `./scripts/build.sh` first.

**Can't build desktop app**: Check `electron/node_modules` exists. Scripts will install it if missing.

---

Based on [MultiController](https://github.com/mhansen/MultiController) build script pattern.
