# Future Technic parts

Notes on which parts from the wider Technic-compatible parts ecosystem aren't in BlockBuilder's catalog yet
(`src/model/catalog.ts`), grouped by how well they fit the current grid/cell model, roughly
ordered by implementation difficulty. Not a schedule — just working notes for whoever picks the
next part up.

## Currently in the catalog

- Straight beams (2, 3, 5, 7; thin 0.5-height variants; mixed axle/pin-hole beams)
- Standalone axles and pins, bushings, pin joiners
- Cross Block 1x3, L-shaped and T-shaped bent beams, stepped Beam 2x4 Bent 90, closed beam frames

Cell types available: `TechnicHole`, `StudHole`, `AxleHole`, `BallJoint` (holes); `Pin`,
`BallPin`, `Stud`, `Axle` (connectors); `AxlePiece`, `PinPiece` (bare, fusable pieces); `Solid`,
`ThinPlate` (structural); `CircleSolid` (circular/ring groups). Heights: full (9.6mm), module
(8mm), half-module (4mm), 1–3 plates, minimal.

## Straightforward additions

These fit the existing flat-grid model directly — no new cell types or architecture needed.

**System plate variants.** Standard System-style plates with studs on top (1x1 through 2x8 and
similar). A flat base plus studs reusing the existing `studConnectorGeometry()`. Useful for
System/Technic hybrid builds, which are common in real sets.

```typescript
function systemPlate(width: number, height: number): GridState {
  let grid = createEmptyGrid(width, height);
  // Fill with ThinPlate, add Stud cells on top (axis "z")
  return grid;
}
```

**Stud-bearing Technic beams.** A beam with both Technic holes and studs on top (SNOT-style),
common in modern sets. Already representable cell-by-cell (`Stud` and `TechnicHole` can coexist
in one beam) — just needs catalog entries for a few common lengths.

**Ball-joint pairs.** `CellType.BallPin` and `CellType.BallJoint` both already exist; what's
missing is pre-made catalog entries combining a ball pin on one end of a piece with a ball socket
on the other (e.g. a short connector for articulated linkages).

```typescript
function ballJointConnector(length: number): GridState {
  let grid = createEmptyGrid(length, 1);
  // first cell: BallPin along +X, last cell: BallJoint socket along -X, middle: Solid
  return grid;
}
```

## Needs new geometry, still grid-shaped

**Gears.** Spur (8/12/16/20/24/36 teeth), bevel, rack, and ring gears. The grid model assumes a
roughly cubic cell, which gears aren't, but they're still representable as one cell with
parametric geometry: an involute tooth profile revolved/duplicated around a circle (reusing the
`revolveProfile` utility in `primitives.ts`). Spur gears first (most common, and the tooth
generation reused by everything else); ring and bevel next; racks (linear tooth array instead of
circular) last. Real Technic gears use a 1.25mm module — parametrize by tooth count and scale from
that rather than eyeballing sizes per gear.

Open question: should teeth actually mesh with correct involute engagement, or is a visually
correct but non-functional tooth profile enough to start? Simpler to start visual-only and revisit
if someone needs simulated engagement.

**Composite axle/bushing assemblies.** Axles and bushings already exist as separate pieces, which
is geometrically correct but requires manual assembly. Pre-molded one-piece variants (axle with
bushing, axle with collar) are just catalog entries combining existing cell types in one grid.

```typescript
function axleWithBushing(axleLength: number): GridState {
  let grid = createEmptyGrid(1, axleLength + 2);
  // AxlePiece top and bottom, AxleHole (the bushing) in the middle
  return grid;
}
```

## Needs architecture changes

These don't fit a flat, axis-aligned grid and would need the model extended before they're
representable properly — not just new cell types.

**Link & chain (track segments).** Track links and curved pieces bend or curve continuously,
which a rectangular grid can't represent natively. Two options: approximate as flat per-layer
segments with axle holes on each edge (works for straight track, not curves), or introduce a
non-grid piece type positioned via a per-piece transform instead of a grid cell. The second is the
real fix but is a bigger change (see below).

**Steering parts (arms, hubs, tie-rods).** These bend out of the flat layer plane at specific
angles and hubs have several arms radiating from a center — the current model only bores holes
along the three cardinal axes and only stacks flat layers. A crude approximation (two layers, one
rotated relative to the other) only covers ~90° bends, not the real part's geometry.

**Engine/pneumatic parts (cylinders, pistons, pumps, cams, cranks).** Hollow cylinders with moving
internal pistons, and parts whose whole point is relative motion (cranks, cams), aren't static
geometry the grid model can express at all. Lowest priority — either they'd need to be
visual-only placeholders, or actual mechanism simulation, which is a different project.

**Panels/cladding.** Flat cosmetic covers, grilles, curved fairings. Cosmetic rather than
structural, so lower value than the categories above; could reuse `ThinPlate` for flat panels
specifically, curved ones would need the same architecture work as track/steering parts.

## If the grid model gets extended for non-flat parts

The real blocker for link/chain, steering, and curved panels is the same one: `GridState` only
represents axis-aligned cells in flat stacked layers. Two ways to lift that:

- **Per-cell transforms** — give a layer (or individual cell) an optional `Matrix4` for
  rotation/positioning, so a piece can be placed off-grid. More flexible, bigger refactor.
- **A separate non-grid `Part` type** — compose grid-based and non-grid pieces side by side rather
  than extending `GridState` itself. Smaller change, less flexible.

Worth deciding only once there's an actual part that needs it — no need to build this ahead of
demand.

## Rough catalog coverage

| Category | Parts in the wider system | In BlockBuilder today |
|---|---|---|
| Brick | 38 | partial |
| Plate | 23 | none |
| Beam | 40 | most straight/bent variants |
| Thin beam | 14 | partial |
| Panel | 57 | none |
| Connector | 98 | pin/ball-joint/stud, no composites |
| Gears | 40 | none |
| Link & chain | 23 | none |
| Steering | 29 | none |
| Engine | 17 | none |
| Mechanical & pneumatic | 35 | none |
| Other Technic | 15 | partial |

Counts are from browsing the wider Technic part catalog by category, not an exact inventory —
treat as orientation, not a spec.
