# BlockBuilder overview

## What it is

BlockBuilder is a grid-based editor for Technic-compatible parts. You paint cells onto a
width × height grid, stacked in layers, where each cell is one part type (a solid block, a
Technic/stud/axle hole, a pin, a ball joint, a stud, or a bare axle/pin segment). The app then
builds a single 3D mesh from that grid and exports it as STL.

## Geometry pipeline

Each occupied cell contributes its own piece of geometry (a box, or a box with a hole cut into
it, or connector geometry for pins/studs/etc.), positioned in world space with a small deliberate
overlap between adjacent cells (`CELL_OVERLAP`). All of those pieces are combined with one real
CSG union via [manifold-3d](https://github.com/elalish/manifold) (`src/model/csg.ts`), which
produces a genuinely watertight, non-self-intersecting solid — not a pile of overlapping boxes
that merely look connected.

manifold-3d also backs every other boolean in the pipeline: cutting holes, chamfers, corner
rounding, and the circular/ring cuts for `CircleSolid` cells.

## Key pieces of the model

- **Grid (`src/model/grid.ts`)** — `GridState` holds `width`, `height`, and a stack of `layers`,
  each a flat array of `Cell`. Each layer's own stacking height is derived from its tallest cell
  (`computeLayerHeights` in `geometry.ts`), not a single shared setting.
- **Cell types (`src/model/cellTypes.ts`)** — see `docs/CELL_TYPES.md` for the full list.
- **Geometry builder (`src/model/geometry.ts`)** — walks the grid and builds/unions every cell's
  piece. Handles connector placement (pins/axles/studs growing outward from the correct face),
  per-cell width narrowing, corner rounding, and the opt-in "join to ring" / "blend corner"
  features for `CircleSolid` groups.
- **Rendering (`src/components/Viewport3D.tsx`)** — renders the built mesh with
  `react-three-fiber`. Geometry rebuilds are debounced (`REBUILD_DEBOUNCE_MS`) so painting stays
  responsive while the CSG work (which isn't free) runs in the background.

## Print-oriented settings

- `GridState.holeClearance` / `sidewaysHoleClearance` — extra radius added to holes only (not
  connectors), to compensate for a given printer's tolerance. Defaults to 0, so a fresh project's
  dimensions match the real part's reference measurements exactly.
- `GridState.partClearance` — insets a part's genuinely exterior faces (not faces shared with
  another occupied cell), for mating clearance between separate printed parts.
- `GridState.rounding` — softens the model's outer vertical corners with a small fillet, matching
  real Technic parts' rounded edges.

## Export

Models export as STL (`src/export/`), suitable for FDM or resin printing, or for opening in other
CAD/mesh tools.
