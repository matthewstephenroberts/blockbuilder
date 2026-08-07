# BlockBuilder Desktop Application

This directory contains the Electron wrapper for BlockBuilder, enabling native macOS, Windows, and Linux desktop applications.

## Setup

### Prerequisites

- Node.js 16+ and npm
- Xcode Command Line Tools (macOS)
- Visual Studio Build Tools (Windows, for native modules)

### Installation

```bash
cd electron
npm install
```

This installs electron and electron-builder dependencies.

## Development

### Development Mode with Dev Server

Run BlockBuilder with hot-reload support (Vite dev server):

```bash
npm run electron-dev
```

This will:
1. Start the Vite dev server on http://localhost:5174
2. Launch Electron pointing to the dev server
3. Changes to source files hot-reload instantly

### Development Mode with DevTools

To debug with DevTools open:

```bash
npm run electron-dev:devtools
```

### Production-like Testing

To test the production build locally:

```bash
npm run electron
```

This loads from the bundled `web-dist` folder (built by `npm run build` in the root).

## Building

### Build for Current Platform

```bash
# From root directory
npm run electron-dist
```

### Platform-Specific Builds

```bash
# macOS (.dmg + .app)
npm run electron-dist:mac

# Windows (.exe installer)
npm run electron-dist:win

# Linux (.AppImage + .deb)
npm run electron-dist:linux
```

Built apps will be in `electron/release/`.

## Icons

The app uses a brick-themed icon set:

- `build/icon.svg` — Source SVG (used for reference)
- `build/icon.png` — 256x256 PNG for Windows and Linux
- `build/icon.icns` — macOS icon format

To regenerate icons from scratch:

```bash
bash setup-icons.sh
```

## Project Structure

```
electron/
├── main.js              # Electron main process
├── preload.js           # Renderer security bridge
├── package.json         # Electron-specific dependencies & build config
├── build/
│   ├── icon.svg         # Source icon (SVG)
│   ├── icon.png         # Windows/Linux icon
│   └── icon.icns        # macOS icon
├── web-dist/            # Built web app (created by `npm run build`)
└── release/             # Output directory for built apps
```

## Environment Variables

- `BLOCKBUILDER_DEV_SERVER_URL` — URL of Vite dev server (set automatically by scripts)
- `BLOCKBUILDER_DEVTOOLS` — Set to `1` to open DevTools on startup

## Troubleshooting

### "web-dist not found"

Run `npm run build` in the root BlockBuilder directory to create the build output.

### macOS code signing

If you need to sign the app for distribution, add this to `electron/package.json` build config:

```json
"mac": {
  "certificateFile": "path/to/certificate.p12",
  "certificatePassword": "password"
}
```

### Icon generation fails

The `setup-icons.sh` script requires Python 3 and `sips` (macOS). If icons aren't created:

```bash
# Manual ICNS generation (macOS)
sips -s format icns electron/build/icon.png -o electron/build/icon.icns
```

## Cross-Platform Notes

- **macOS**: Requires notarization for distribution (not configured by default)
- **Windows**: NSIS installer requires Windows or Wine to build
- **Linux**: AppImage and .deb can be built on any platform with electron-builder
