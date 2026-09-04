# Cell types

> Angled and radial elements are NOT cell types — see [ANGLED_BEAMS.md](ANGLED_BEAMS.md) and
> [SLOT_DISCS.md](SLOT_DISCS.md). A cell grid is axis-aligned by construction and can only ADD
> material; a beam at 45°, or a disc with six pockets cut round it, is its own element stored
> alongside the layers.

Every occupied grid cell has exactly one `CellType` (see `src/model/cellTypes.ts`), which
determines what geometry `buildGridGeometry` produces for it.

## Solid cells

| Type | Symbol | What it builds |
|---|---|---|
| `Solid` | `S` | A plain solid block at full height, no bore. |
| `ThinPlate` | `T` | A thin solid plate (1 plate tall), no pin/axle cavity. |
| `CircleSolid` | — | One slice of a circle shared across a `dimension × dimension` group of cells — assembling the whole group produces a smooth circular or ring/washer shape (e.g. a wheel or hub) instead of a blocky square. Optionally hollow (bores a concentric inner circle) and/or has a square outer edge instead of a curved one. Supports opt-in "join to ring" (bridges a cell across a neighbouring ring's hollow) and "blend corner" (clips an un-narrowed corner flush with narrowed neighbours) — see `geometry.ts`. |

## Hole types

| Type | Symbol | What it builds |
|---|---|---|
| `TechnicHole` | `O` | A round pin-hole bore, chamfered at both ends to guide a pin in from either direction — the standard Technic beam hole. |
| `StudHole` | `o` | A plain round through-hole sized for a System-style stud, no chamfer. |
| `AxleHole` | `+` | A cross-shaped bore for a Technic axle, clipped to fit inside a circle. |
| `BallJoint` | `B` | A ball-and-socket cup, open on one side along the chosen axis, with solid backing — the receiving half of a ball-joint pair. |

## Connector types (protrude from the cell)

| Type | Symbol | What it builds |
|---|---|---|
| `Pin` | `P` | A Technic pin protruding along the chosen axis, printed as one piece with the model. |
| `BallPin` | ◉ | A ball-joint connector (neck + ball) protruding from the cell — the male half of a ball-joint pair. |
| `Stud` | `•` | A System-style stud protruding from any face (top, or sideways for SNOT-style building). Not added automatically — paint it where you want one. |
| `Axle` | — | A Technic axle rod protruding from the cell along the chosen axis, as an integrated part of the block (unlike `AxlePiece`, which has no surrounding block). |

## Bare piece types (no surrounding block)

| Type | Symbol | What it builds |
|---|---|---|
| `AxlePiece` | ✜ | A bare cross-shaped axle segment. Adjacent `AxlePiece` cells along one axis fuse into a single continuous rod sized to the run's total length. |
| `PinPiece` | ⊝ | A bare pin shaft, same fusing behaviour as `AxlePiece`. |

## Empty

| Type | Symbol | What it builds |
|---|---|---|
| `Empty` | `—` | No material — an unpainted grid cell. |

## Circles

A `CircleSolid` cell is one slice of a **CircleRing** — see [CIRCLE_RINGS.md](CIRCLE_RINGS.md).
The cell carries only `circleId`; the ring owns the circle (dimension, position, Outer Edge, Inner
Hole), and the cell's position within the group is derived from where it sits relative to the
ring's origin.

The Circle brush places a whole ring per click. A **partial circle** is made by erasing cells from
one: what's left keeps the ring, so a lone corner cell of a 2x2 is still cut to the same shared
circle and carries the correct arc. Painting a circle cell back inside an existing ring's footprint
rejoins that ring rather than starting a new one.

Each ring draws a centre handle in the plan: click it to select the whole ring, drag it to move the
circle. Member cells show no glyphs unless they differ from the ring's own defaults, so a uniform
circle reads as one shape rather than N identical labelled squares.

With the Edit tool, selecting a member cell selects its ring, and every circle control edits the
ring — one write, however many cells it spans. Dimension is editable there too: the ring resizes
about its own centre and repaints its footprint in place.

## Alt-drag moves

Alt-drag picks up whatever is on a square — a cell, a beam's anchor, a slot disc's centre, or a
circle ring by its centre — and puts it down elsewhere. For a cell and for a ring (the two that own
cells), each step of the drag is replayed against the grid as it was when the gesture STARTED,
always from the original source square. Stepping the live grid instead would overwrite every square
dragged across and blank it again on the way past, leaving a trail of erased cells; replaying from
the snapshot restores what the drag crosses and overwrites only where it is dropped. The gesture is
one undo entry either way.

## Layers

Each layer card carries duplicate alongside show/hide, reorder and delete. Duplicating copies
everything ON that layer — cells, beams, slot discs and circle rings — into a new layer directly
above, and makes it active. The copies get fresh ids: a duplicate sharing a ring or beam id would
edit and delete in pairs, and a cell on one layer would point at the other layer's ring.

## 2D overlays

Two cell arrangements build a shape the grid squares themselves can't show, so `GridEditor` draws
the real outline over the plan instead of leaving you to infer it from coloured squares:

- **Circle rings** (violet, amber when selected) — the ring's actual outer circle, its inner circle
  when hollow (drawn as a genuine annulus), or the square outer boundary when `outerSquare` is set.
  Radii come from the same numbers `circleSolidGeometry` builds with (outer `dimension / 2` studs,
  inner `(dimension - 1) / 2`), so the overlay tracks the real part. Drawn straight from the ring
  objects, so a circle trimmed to a single cell still shows the full circle its arc was cut from.
  Interactive only at the centre handle (Edit tool) — everywhere else clicks pass straight through
  to the member cells, so painting and erasing them still works.
- **Angled beams** (sky blue, amber when selected) — see [ANGLED_BEAMS.md](ANGLED_BEAMS.md).
- **Slot discs** (teal, amber when selected) — the disc's rim and every pocket at its true angle;
  see [SLOT_DISCS.md](SLOT_DISCS.md).

Overlays hit-test on a deliberately SMALL target — a transparent ring for a disc, a line narrower
than the beam looks — never on their filled shape. A disc's face covers most of a small grid, and a
filled SVG shape with `pointer-events: all` swallows every click inside it, so no cell underneath a
disc could be selected at all. The pickers still showed values in that state (they default to
visible with nothing selected), which reads as "the cell I clicked has these properties" when
nothing was selected — the Toolbar now says so explicitly instead.

All three also draw the layer BELOW the one being edited, in grey and faded (`GHOST_COLOUR`) and
never interactive — the overlay counterpart of the grey `grid-cell-background` cells that let a new
layer be lined up with what it sits on. Being element overlays rather than cells, beams, discs and
circle groups were simply absent from that view until they were given the same treatment.

## Axis

Most non-`Empty` types are axis-aware (`AXIS_AWARE_TYPES`): holes bore along their axis,
connectors protrude along it. `Solid` and `CircleSolid` can also take an axis purely to control
`widthFraction` narrowing (see below), even though they have no bore/protrusion of their own.

- `"z"` — vertical, through the cell's own layer slot (top to bottom).
- `"x"` / `"y"` — sideways, through the beam's own walls, toward a neighbouring cell in that
  direction.

## Edges: rounded vs. chamfered

Two separate, independent settings, both applied only to a cell's genuinely EXTERIOR faces so a
joint shared with an occupied neighbour stays flush:

- `rounded` — a full half-cell fillet on the vertical corners (see rounding.ts's `CELL_EDGE_RADIUS`),
  i.e. a Technic beam's round end. A shape decision.
- `chamferMm` — a small 45° flat along every exterior edge: the four vertical ones AND the top and
  bottom perimeter. A fit decision, for a part that has to ENTER something else. The 1×1 blocks a
  [slot disc](SLOT_DISCS.md) dispenses are the case it exists for — the pocket carries a lead-in
  chamfer at its mouth, and a matching chamfer on the block's own leading edges is the other half of
  not binding.

The chamfer is measured off the box's **own** bounds, not the nominal stud pitch. A cell's box is
built slightly oversize so neighbours genuinely overlap (`CELL_OVERLAP`), and smaller again when
`partClearance` is set, so positioning the cut from the nominal size takes the wrong amount off the
face that actually exists — 0.65mm for a requested 0.6mm, on a part whose whole job is to fit
something else.

### Sizing a printed block for a slot disc

A slot disc's pockets are sized against a real block body, `n × 8 − 0.2mm` (7.8mm for a 1×1). A
plain `Solid` cell built here comes out at **8.1mm** — the nominal 8mm plus `CELL_OVERLAP` — so a
block printed straight from a 1×1 Solid is 0.3mm wider than the pocket assumes, and the real gap is
0.25mm per side rather than the 0.4mm the disc panel reports.

Setting `partClearance` to 0.15 on the block's own project brings it to exactly 7.8mm. Note that
`partClearance` insets every exterior face, so it takes the same 0.15mm off the top and bottom —
an 8mm-tall block becomes 7.7mm.

## Width narrowing

`Cell.widthFraction` narrows an axis-aware cell along its own axis only (independent of
`plateFraction`, which controls height). The face opposite the connector/bore direction stays
flush with the cell's normal full-stud boundary; material is pulled in from the near face only.
Used for tapered sections, thinner beams, or (combined with the corner-blend feature above) a
larger opening at the centre of a frame-shaped assembly of cells.
