# 🧱 BlockBuilder

Parametric designer for Technic-compatible parts. Paint beams, pins, axles, studs, and
connectors onto a grid; BlockBuilder assembles them into a single watertight 3D mesh and exports
it as a print-ready STL. Runs entirely in the browser, or as a desktop app via Electron.

## What it does

- **Grid-based part editor** — paint cells onto a width × height × layers grid, one part type per
  cell (solid block, Technic/stud/axle hole, pin, ball joint, stud, bare axle/pin segment).
- **Real CSG, not a visual stack** — every cell's geometry is combined with actual boolean
  operations ([manifold-3d](https://github.com/elalish/manifold)), so the exported mesh is a
  single watertight solid, not overlapping/kissing boxes.
- **Print-oriented details** — configurable hole clearance (compensates for FDM/SLA print
  tolerance), inter-part clearance, corner rounding, and correctly chamfered Technic hole profiles.
- **Circular/ring parts** — a dedicated cell type builds smooth circular or ring/washer shapes
  across a group of cells (e.g. wheels, hubs), including opt-in joins into a neighbouring ring's
  hollow bore and corner-blending for narrowed parts.
- **Catalog of real parts** — a library of standard Technic beams, axles, pins, and frames you can
  drop straight onto the grid.
- **STL export** for FDM/SLA printing.

## Getting started

```bash
npm install
npm run dev
```

Opens the Vite dev server at `http://localhost:5174`.

## Scripts

Prefer the helper scripts in [`scripts/`](scripts/README.md) — they handle dependency installs
and give consistent output for both the web build and the Electron desktop build:

| Command | What it does |
|---|---|
| `./scripts/dev-web.sh` | Web-only dev server |
| `./scripts/dev-desktop.sh` | Vite + Electron with hot-reload |
| `./scripts/build.sh` | Build web app to `dist/` |
| `./scripts/build-desktop.sh` | Build + package a native installer (macOS/Windows/Linux) |
| `./scripts/build-pages.sh` | Build web app into `pages/app/` for GitHub Pages |
| `./scripts/clean.sh` | Remove build artifacts |
| `./scripts/dist-info.sh` | Show sizes/locations of current builds |

Or use the equivalent `npm` scripts directly — see [`package.json`](package.json).

## Project structure

```
src/
  model/        Grid/cell data model, CSG geometry builders, part catalog
  components/   React UI (grid editor, 3D viewport, toolbars/panels)
  state/        App state (useProjectStore)
  export/       STL export
electron/       Desktop app wrapper (Electron)
pages/          GitHub Pages site (built via scripts/build-pages.sh)
docs/           Design notes and reference docs
scripts/        Dev/build helper scripts
```

## Documentation

- [`docs/BLOCKBUILDER_OVERVIEW.md`](docs/BLOCKBUILDER_OVERVIEW.md) — how the geometry pipeline
  works
- [`docs/CELL_TYPES.md`](docs/CELL_TYPES.md) — every cell type and what it builds
- [`docs/future-parts-implementation.md`](docs/future-parts-implementation.md) — roadmap for
  additional catalog parts
- [`COORDINATE_SYSTEM.md`](COORDINATE_SYSTEM.md) — grid/world coordinate conventions
- [`ELECTRON_QUICKSTART.md`](ELECTRON_QUICKSTART.md) — desktop app build/dev guide
- [`pages/README.md`](pages/README.md) — GitHub Pages deployment
- [`DEVELOPMENT.md`](DEVELOPMENT.md) — full development guide (key files, testing, releases)
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute (new parts, bug reports, PRs)
- [`CODE_STYLE.md`](CODE_STYLE.md) — commenting/style conventions

## Tech stack

React + TypeScript + Vite, [Three.js](https://threejs.org)/[react-three-fiber](https://github.com/pmndrs/react-three-fiber)
for rendering, [manifold-3d](https://github.com/elalish/manifold) for CSG booleans, Electron for
the desktop build.

## License

MIT — see [`LICENSE`](LICENSE). See [`LICENSE-INTENT.md`](LICENSE-INTENT.md) for the project's
educational purpose, trademark disclaimer, and intent behind the license choice.
