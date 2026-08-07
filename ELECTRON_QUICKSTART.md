# BlockBuilder Electron Desktop App - Quick Start

BlockBuilder now has a complete Electron desktop application wrapper supporting **macOS**, **Windows**, and **Linux**.

## Quick Start

### 1. Development with Hot-Reload

```bash
npm run electron-dev
```

This launches the app with Vite hot-reload support. Changes to source files update instantly in the app.

**For debugging with DevTools:**
```bash
npm run electron-dev:devtools
```

### 2. Production Build

```bash
npm run build
```

This builds the web assets to `dist/`.

### 3. Run Production Build Locally

```bash
npm run electron
```

Launches the app using the bundled production build.

### 4. Build Installers

**All platforms:**
```bash
npm run electron-dist
```

**Specific platform:**
```bash
npm run electron-dist:mac     # macOS DMG + app
npm run electron-dist:win     # Windows installer
npm run electron-dist:linux   # Linux AppImage + deb
```

Built apps appear in `electron/release/`.

## Project Structure

```
BlockBuilder/
├── src/                  # React source code
├── electron/             # Electron wrapper
│   ├── main.js          # Electron main process
│   ├── preload.js       # Security bridge
│   ├── package.json     # Electron config & dependencies
│   ├── build/
│   │   ├── icon.svg     # Source icon
│   │   ├── icon.png     # Windows/Linux icon (256x256)
│   │   └── icon.icns    # macOS icon
│   └── README.md        # Detailed Electron docs
├── package.json         # Root package with npm scripts
└── vite.config.ts       # Vite configuration
```

## Features

✅ **Native Desktop App** - Runs as a true native application with system integration
✅ **Hot-Reload Dev** - Instant feedback during development
✅ **Cross-Platform** - Single codebase builds for macOS, Windows, and Linux
✅ **Custom Icons** - Brick-themed app icon on all platforms
✅ **Production Ready** - Optimized builds with electron-builder

## Available npm Scripts

| Command | Purpose |
|---------|---------|
| `npm run electron` | Run production build |
| `npm run electron-dev` | Run with hot-reload dev server |
| `npm run electron-dev:devtools` | Run dev with DevTools open |
| `npm run electron-dist` | Build for all platforms |
| `npm run electron-dist:mac` | macOS build only |
| `npm run electron-dist:win` | Windows build only |
| `npm run electron-dist:linux` | Linux build only |

## Environment Variables

- `BLOCKBUILDER_DEV_SERVER_URL` - Dev server URL (set automatically by scripts)
- `BLOCKBUILDER_DEVTOOLS` - Set to `1` to open DevTools on launch

## Troubleshooting

**"web-dist not found"**
→ Run `npm run build` first to generate the production build

**Icons aren't appearing**
→ Check `electron/build/icon.png` and `electron/build/icon.icns` exist
→ Regenerate with: `bash electron/setup-icons.sh`

**Electron won't start**
→ Ensure `electron/node_modules` exists: `cd electron && npm install`
→ Check console output for specific error messages

## Next Steps

- Customize app icon: Replace `electron/build/icon.svg` and run `bash electron/setup-icons.sh`
- Configure code signing: See `electron/README.md` for distribution setup
- Add menu items: Edit `electron/main.js` createMenu function
- Add IPC communication: Extend `electron/preload.js` and `electron/main.js`

## Documentation

For detailed information about Electron setup, build configuration, and troubleshooting, see `electron/README.md`.

---

**Based on**: MultiController's production-tested Electron pattern
**Created**: August 2026
