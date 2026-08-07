# Cell types

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

## Axis

Most non-`Empty` types are axis-aware (`AXIS_AWARE_TYPES`): holes bore along their axis,
connectors protrude along it. `Solid` and `CircleSolid` can also take an axis purely to control
`widthFraction` narrowing (see below), even though they have no bore/protrusion of their own.

- `"z"` — vertical, through the cell's own layer slot (top to bottom).
- `"x"` / `"y"` — sideways, through the beam's own walls, toward a neighbouring cell in that
  direction.

## Width narrowing

`Cell.widthFraction` narrows an axis-aware cell along its own axis only (independent of
`plateFraction`, which controls height). The face opposite the connector/bore direction stays
flush with the cell's normal full-stud boundary; material is pulled in from the near face only.
Used for tapered sections, thinner beams, or (combined with the corner-blend feature above) a
larger opening at the centre of a frame-shaped assembly of cells.
