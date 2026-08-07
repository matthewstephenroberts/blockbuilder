# Development guide

For developers who want to modify BlockBuilder, add catalog parts, or work on the geometry engine.

## Quick start

```bash
git clone <your fork or this repo's URL>
cd BlockBuilder
npm install
npm run dev              # http://localhost:5174
```

Or use the helper scripts — see [`scripts/README.md`](scripts/README.md) for the full list.

## Web app (React + Vite, TypeScript)

**Location:** `src/`

### Prerequisites
- Node 18+ / npm

### Development

```bash
npm run dev               # Vite dev server, http://localhost:5174
```

Changes to `.tsx`/`.ts` files hot-reload automatically.

### Key files

- `src/App.tsx` — top-level layout and state wiring
- `src/state/useProjectStore.ts` — app state (grid, tool/brush selection, undo/redo)
- `src/model/grid.ts` — `GridState`/`Cell` data model
- `src/model/cellTypes.ts` — `CellType` enum and per-type UI metadata (labels, descriptions)
- `src/model/geometry.ts` — builds the full 3D mesh from a `GridState` (the core of the app)
- `src/model/csg.ts` — the manifold-3d CSG boolean wrapper every geometry op goes through
- `src/model/catalog.ts` — the built-in library of real Technic-compatible parts
- `src/components/GridEditor.tsx` — the 2D grid painting UI
- `src/components/Viewport3D.tsx` — the 3D preview (react-three-fiber)
- `src/export/` — STL export

See [`docs/BLOCKBUILDER_OVERVIEW.md`](docs/BLOCKBUILDER_OVERVIEW.md) for how the geometry pipeline
fits together, and [`COORDINATE_SYSTEM.md`](COORDINATE_SYSTEM.md) for grid/world coordinate
conventions.

### Building for production

```bash
npm run build              # tsc && vite build → dist/
```

## Desktop app (Electron)

**Location:** `electron/`

```bash
./scripts/dev-desktop.sh    # Launches Electron app with live reload
./scripts/build-desktop.sh  # Builds a native installer for the current OS
```

See [`ELECTRON_QUICKSTART.md`](ELECTRON_QUICKSTART.md) for the full desktop build/dev guide.

## GitHub Pages

```bash
./scripts/build-pages.sh    # Builds the web app into pages/app/
```

See [`pages/README.md`](pages/README.md) for deployment setup.

## Testing

There's no automated test suite yet — verification is:

1. **Typecheck:** `npm run typecheck` (also runs as part of `npm run build`)
2. **Visual verification:** `npm run dev`, paint the change, check the 3D viewport
3. **Geometry sanity:** for CSG changes, it's worth checking the built mesh is watertight (no
   boundary edges) before trusting a screenshot — see recent commits touching
   `src/model/geometry.ts` for the pattern (walking the mesh's triangle edges and counting
   edges used exactly once).

## Code style

See [`CODE_STYLE.md`](CODE_STYLE.md) for the full guide. In short: comments explain *why*, not
*what*; the project builds with TypeScript `strict: true`.

### Commits

- Describe *why* the change is needed, not just *what* changed.
- Good: "Walk the bridge outward until it reaches real ring wall (single-step bridge fell short
  for rings wider than one cell)"
- Less useful: "Fix bridging"

## Debugging

- Open DevTools (F12 / Cmd+Opt+I) in the browser or the Electron window
- Console tab shows app logs, including `[BlockBuilder] geometry build failed: ...` if a CSG
  operation throws (the viewport keeps showing the last good geometry rather than going blank)
- React DevTools extension recommended for component/state inspection

## Project structure

```
BlockBuilder/
├── src/
│   ├── model/         Grid/cell data model, CSG geometry builders, part catalog
│   ├── components/    React UI (grid editor, 3D viewport, toolbars/panels)
│   ├── state/         App state (useProjectStore)
│   └── export/        STL export
├── electron/           Desktop app wrapper (Electron)
├── pages/              GitHub Pages site (built via scripts/build-pages.sh)
├── docs/                Design notes and reference docs
├── scripts/             Dev/build helper scripts
└── README.md            You are here
```

## Releases

Maintainers, to cut a new release:

1. Update `version` in `package.json` and `electron/package.json`
2. Commit with message `Release vX.Y.Z`
3. Tag: `git tag vX.Y.Z`
4. Push: `git push origin main --tags`
5. Build installers per-platform (`./scripts/build-desktop.sh` on each target OS — see
   `ELECTRON_QUICKSTART.md` for why cross-building a macOS `.dmg` from Windows/Linux isn't
   reliable) and attach them to the GitHub release

## Getting help

- Check existing issues and discussions on the repo
- Open a new issue with details: what you tried, what happened, a saved project `.json` if
  relevant

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for pull request process and community guidelines.
