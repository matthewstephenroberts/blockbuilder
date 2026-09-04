# Circle rings

A circle in BlockBuilder is a **CircleRing** (`src/model/circleRing.ts`) plus the cells that belong
to it. The ring describes one shared circle; each member cell is built by intersecting its own body
with that circle, so the assembled blocks form a smooth arc instead of a blocky square silhouette
(`src/model/circleSolidGeometry.ts`).

## Why the ring exists

Circles used to be *only* cells. Every member carried the whole group description — dimension,
hollow, outer-square — plus its own `circleCol`/`circleRow`. That had three costs:

- **Bulk.** A 13x13 ring wrote 169 identical copies of the same five fields into the project file.
- **Fan-out.** Hollowing a ring meant walking every member and rewriting it (the old
  `withCircleGroupFlags`), because a flag stored per cell only ever *meant* something group-wide.
- **No group operations.** Dimension and position were shown but not editable while editing a cell:
  changing either on one member couldn't produce a coherent group, so resizing a circle meant
  repainting it.

Now the ring owns all of it and a member cell carries one field, `circleId`. Its slice of the
circle — the `(col, row)` the geometry wants — is **derived** from its position relative to the
ring's origin (`ringColRow`), so it cannot fall out of step the way a stored copy could.

Unlike an angled beam or a slot disc, a ring is not an alternative to cells: its members really are
cells, they paint, blend, narrow, round and chamfer like any other, and clicks pass through the
overlay to reach them.

## Anchoring

A ring stores `originX`/`originY` — the minimum-X/minimum-Y corner of its `dimension x dimension`
footprint — not a centre. An even-sized group has no centre cell to name, so the corner is the only
anchor that's exact at every dimension. `originForCentre` / `centreForOrigin` convert when a
gesture is centred (a click) or an edit is (a resize); an even dimension leans toward -X/-Y, which
is where the old auto-centre placement put it.

`row` counts DOWN from the group's top while grid y counts UP. That inversion is real (the editor
draws row 0 at the bottom) and now lives in exactly one place, `ringColRow`.

## Partial circles

Membership *is* the mask: a cell belongs exactly when it carries the id. So the whole partial-circle
feature is erasing.

Place a 2x2 and erase three cells, and the survivor is still a member of a `dimension: 2` ring — it
builds as a 1x1 block carrying the correct quarter-arc, which is the reason to build a circle out of
cells at all. Paint a circle cell back inside that ring's footprint and it rejoins (see
`circleRingCovering`), arc intact, rather than starting a second ring on top.

Erasing the last member is also how a ring ends — there's no separate delete gesture — so
`gcCircleRings` runs after any edit that can clear cells, dropping ringless ids and idless rings
together.

## Selecting and moving one

A ring carries a **centre handle** in the plan overlay — the circle's counterpart of a slot disc's
centre. With the Edit tool, clicking it selects the *ring* (clearing any cell selection) and
dragging it moves the whole circle, members and all. It's a small centre dot rather than the hit-
ring the disc overlay uses, because a circle's outline runs straight through its own member cells
and those have to stay clickable — erasing them is how a partial circle is made. The handle costs
one square; an annulus would cost a whole ring of them.

A drag is measured from the grid as it was when the gesture STARTED, not stepped from one square to
the next. Stepping bulldozes: each step overwrites the cells under the ring's new position and then
blanks them as the ring moves on, so dragging a circle across a build leaves a trail of erased
squares. Recomputing from the pre-drag snapshot means anything the ring crosses comes back behind
it, and only where it is dropped gets overwritten (`beginCircleDrag` / `endCircleDrag` bracket the
gesture, and it stays one undo entry).

The handle takes the pointer-down itself, so its drag is implemented on the handle rather than
through the editor's Alt-drag, and needs no modifier: the dot means the ring and nothing else.
Clicking it always selects — never toggles off — since a ring already reads as selected when a
member cell is what put it in the panel, and toggling there would make the handle a no-op in
exactly the case you reach for it.

With the ring selected, the pickers it shares with a cell — **plate height, edges, chamfer, plate
width** — apply to every member at once and are recorded on the ring as its defaults, so cells
stamped into it later (a resize, or a cell painted back into a gap) come out matching. They reach
the ring's *members*, not its footprint rectangle: a square inside the footprint that holds
something else stopped being part of the circle when it was overpainted.

When something else's handle already owns the ring's centre square — a slot disc turning inside the
ring is the ordinary case, a beam anchored there another — the ring's handle **steps aside** by
about half a cell, with a leader line back to the true centre, and its drag reads the pointer back
through that offset so the ring doesn't jump when grabbed. The offset in force is frozen when the
drag starts: read live it would appear the moment the ring landed on such a square, shifting the
pointer-to-cell mapping under the gesture and bouncing the ring straight off again — so the one
square the dodge exists to make shareable would be the one square you could not drop a ring on. Two handles on one point means only the
upper one is ever clickable; stepping aside keeps the square itself free for the disc.

Selections are exclusive: picking a cell, a beam, a disc or a ring drops the other three. Without
that the disc's panel and the ring's panel show at once and neither reads as the thing just clicked.

Selecting a member **cell** still works and still shows the ring's controls; the difference is that
the cell's own controls (and Remove cell) come with it. Ring selected: the panel is the circle,
plus **Remove circle**, which deletes the ring and its cells together.

## What the plan draws

Member cells show **no glyphs**. Stamping the same `type / flip / plate` lettering across 36
identical squares says only "this is a circle", which the outline already says better. A member
shows its glyphs only where it actually differs from its ring's defaults — a different plate
height, a narrowed width, a chamfer — which turns the lettering from noise into a signal: the one
cell you changed is the one with writing on it.

## Model API

| Function | What it does |
|---|---|
| `withCircleRing` | Creates a ring and paints its whole footprint — what the Circle brush does. |
| `circleRingOf` / `circleRingAt` | The ring behind a cell, or behind a grid square. |
| `circleRingCovering` | The ring whose *footprint* covers a square (smallest first) — the rejoin lookup. |
| `circleRingCells` | The active layer's current members of a ring. |
| `updateCircleRing` | One partial write for any ring setting — replaces the old per-cell fan-out. |
| `resizeCircleRing` | Changes dimension about the ring's own centre, repainting the footprint. |
| `moveCircleRing` | Moves a ring and carries its members with it. |
| `gcCircleRings` | Drops rings with no members and `circleId`s with no ring. |

A cell dragged out of its ring's footprint loses its membership (`moveCell`), and a `CircleSolid`
with no live ring builds as a plain Solid — a circle cell with no circle behind it is a square.

## Cells meeting a ring

A ring keeps material only BETWEEN its two circles, so a cell the grid calls adjacent can be facing
air:

- near the centre, across the hollow **bore**;
- butting into a **round rim** from outside, across the gap between the arc and the cell's own
  square edge. An arm running into a round-outer ring is exactly this: the grid says the two cells
  touch, and the material stops short of the join. On a 13x13 ring the arm's whole 8mm face can have
  nothing behind it, leaving the arm floating.

A bridge is also CLIPPED to the void it started in: it fills whole cells, and a cell at the rim
straddles the ring's wall, so filling its square reaches past the wall into the void on the far side
— 2.5mm into the bore on a 13x13 ring, which reads as the join spilling into the hole. A bridge that
came from outside the rim has the bore subtracted from it; one that came from inside the bore is
intersected with the rim. Either way it may cross the gap up to the ring's material and no further.

A bridge stops at the first ring cell that HOLDS material (`ringCellHasMaterial`), not at the first
edge that has some behind it. On a ring whose band is narrower than a cell — a 13x13 ring's is 4mm
against an 8mm cell — no cell edge need ever land inside the band: each is either outside the arc or
inside the bore. Walking on the edge test alone chains straight through, out of the arc and into the
bore, and on across the hole to the far wall: a bar through the middle of the ring rather than a
join to it (13 cells instead of 1, on that ring). Filling a cell that holds material already
overlaps it, so the join is made and the walk is done.

`circleCellGap` (geometry.ts) tests both — the closest point of the shared edge against the bore, the
farthest against the arc — and `collectJoinBridges` then walks the cell's own cross-section across
until it reaches real ring material. It is opt-in per side (the **Join to ring** toggles, stored as
`Cell.blendXPos`/`XNeg`/`YPos`/`YNeg`), because a cell that merely sits beside a ring should not be
fused to it against the designer's wishes.

A square-outer ring has no outer gap at all — every member fills its own square — so this only
arises on Round rims.

## Beams meeting a ring

An angled beam's **End blend** (`AngledBeam.gusset`) fillets the corners where the beam crosses into
the blocks it lands on, and it works off each cell's 2D outline. For a ring member that outline is
the cell's square re-cut to the ring's arcs — the outer circle, and the bore when the ring is hollow
— rather than the plain square every other cell gets (`cellFootprint` → `clipToCircleRing` in
angledBeamGeometry.ts). Without that, a round-outer ring told the blend about a wall 5.7mm from the
cell centre when the material actually stops at the arc 4mm out, and the fillet computed there hung
in mid-air past the curve.

The clip is radial: the outline is densified and every point pulled onto whichever circle it falls
outside of. For a convex square against a concentric circle that IS the intersection, and it takes
the bore's concave bite in the same pass. A member swallowed entirely by the bore has no outline at
all, and is skipped — the same short circuit `buildCircleSolidGeometry` makes for the same cell.

## Why the cut cylinder is manifold's own

The outer cut and the hollow bore go through `intersectCylinderZ` / `subtractCylinderZ` in csg.ts,
which build the cylinder inside manifold rather than converting a `THREE.CylinderGeometry` across.

A triangle-mesh cylinder has to close its ring of segments somewhere, and THREE's builds that
closure by duplicating the vertex column there (one position needs two texture coordinates).
Welding on import gets most of it, but where that column landed on a cut the boolean left a
hairline crease rather than continuous surface: one vertical groove down an otherwise perfect ring,
always at the same bearing, on the outer wall and the bore alike, and in the exported STL as much
as in the preview. Rotating the seam moved the groove with it, which is how it was pinned down.

## File format

`GridState.circles` is optional, like `beams` and `discs`. A project saved before rings is migrated
on load (`migrateCircles` in `src/model/project.ts`): cells that agree on a computed group centre
and dimension become one ring, and cells that were never painted stay absent, so a partial circle
written by the old format survives as a partial circle.
