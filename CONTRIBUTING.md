# Contributing to BlockBuilder

Thanks for your interest in contributing! BlockBuilder thrives on community contributions,
especially new catalog parts and geometry improvements.

## Ways to contribute

### 1. Add a catalog part (most valuable)

Want to see a new Technic-compatible part in the catalog? See
[`docs/future-parts-implementation.md`](docs/future-parts-implementation.md) for parts that don't
exist yet, grouped by how well they fit the current grid model.

**Before you start:**
- Check [`src/model/catalog.ts`](src/model/catalog.ts) to see if the part already exists.
- Open an issue describing the part and how you'd represent it as grid cells.

**To add a part:**

1. Add a builder function to `src/model/catalog.ts` (see existing ones — `beam()`, `axleEntry()`,
   `bentBeam()` — for the pattern: build a `GridState`, paint cells with `withRect`).
2. Add a `CatalogEntry` for it in the exported catalog array (`id`, `name`, `description`,
   `build`).
3. If it needs a shape the existing cell types can't represent (see
   [`docs/CELL_TYPES.md`](docs/CELL_TYPES.md)), open an issue to discuss before adding a new
   `CellType` — most parts fit the existing set.
4. Verify visually: run `npm run dev`, place the part, and check it in the 3D viewport.

### 2. Report bugs or suggest features

- Found a bug? Open an issue with:
  - What happened vs. what you expected
  - The grid/cell configuration that triggers it (a saved `.json` project file, if possible)
  - Steps to reproduce

- Have a feature idea? Describe what it should do, why it's useful, and how it might fit the
  existing grid/cell model.

### 3. Improve documentation

- Typos or unclear instructions in `docs/` or `README.md`
- Better explanations of the coordinate system or geometry pipeline

## Development setup

```bash
npm install
npm run dev              # http://localhost:5174
```

Or use the helper scripts in [`scripts/`](scripts/README.md):

```bash
./scripts/dev-web.sh      # Web-only dev server
./scripts/dev-desktop.sh  # Vite + Electron with hot-reload
./scripts/build.sh        # Build to dist/
```

## Code style

See [`CODE_STYLE.md`](CODE_STYLE.md) for the full guide. In short: comments explain *why*, not
*what*; `npm run typecheck` should pass with no errors.

## Pull request process

1. Fork the repo and create a branch: `git checkout -b add-beam-frame-9x9`
2. Make your changes and test them (`npm run typecheck`, and check the result visually in the
   3D viewport)
3. Commit with a clear message describing *why* the change is needed
4. Push to your fork and open a pull request, describing what changed and why
5. Link any related issues

A maintainer will review and merge or request changes.

## A note on compatible parts

BlockBuilder builds Technic-compatible geometry from parametric dimensions — it doesn't include or
reproduce any copyrighted decorations, official set files, or minifigure designs, and doesn't use
LEGO's name, logo, or branding anywhere in the project. See
[`LICENSE-INTENT.md`](LICENSE-INTENT.md) for the full trademark/educational-purpose statement.
Keep contributions consistent with that — dimensional/functional compatibility only.

## Questions?

- Check `docs/` for technical details on the geometry model
- Open an issue and tag it `question`
- Check existing issues — your question may already be answered

## Code of Conduct

See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — be kind and respectful.

Thanks for contributing!
