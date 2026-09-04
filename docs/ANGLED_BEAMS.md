# Angled beams

Every cell in the grid is axis-aligned — that's what a grid is. An **angled beam**
(`src/model/angledBeam.ts`) is the escape hatch: a Technic beam running at an arbitrary angle
across the X/Y plane, stored on `GridState.beams` alongside the cell layers rather than inside
them, and unioned into the same solid at build time (`src/model/angledBeamGeometry.ts`).

## Why it isn't a cell type

A beam's defining property is that its holes sit at the standard **8mm pitch along its own axis**.
A "diagonal cell" type would space its holes one cell diagonal apart — 8·√2 ≈ 11.3mm — which mates
with nothing. Keeping the beam as its own element lets its axis stay authoritative: real pitch,
real angle, real round ends, while still anchoring to a grid cell so it lines up with whatever is
already painted there.

## Anatomy

| Field | Meaning |
|---|---|
| `anchorX`, `anchorY` | Grid cell where the beam's **body starts**. With no lead-in (the default) that's also its first hole, so painting a cell there fuses the two. |
| `angleId` / `customDegrees` | The beam's **slope** — a preset from `BEAM_ANGLE_OPTIONS`, or a hand-entered angle. Presets cover 0°–90°; this is the half that decides grid-legality. |
| `mirror` / `reverse` | Which of the four **quadrants** that slope runs into. `mirror` negates the angle, `reverse` adds 180°; together they reach all four (see `BEAM_QUADRANTS`). Kept separate from the slope because they're independent decisions — and because four beams radiating from one anchor need all four, which a single mirror flag can't express. |
| `holes` | Hole count end to end. Run length is `(holes - 1) × 8mm`. |
| `holeAxis` | The direction every hole bores unless overridden. `"z"` — vertical bores, the flat liftarm lying on the plate. `"perpendicular"` — bores square to the beam's own run and still in the X/Y plane, i.e. the beam standing on edge with its holes pointing along the beam's own diagonal. |
| `holeAxes` | Per-hole overrides, index-aligned (0 = the anchor hole); a `null`/missing entry follows `holeAxis`, so a uniform beam carries no array at all. See **Mixed bore directions** below. |
| `holeType` | `technicHole`, `axleHole`, `studHole`, or `none`. Uniform along the beam, like a real moulded part. |
| `plateFraction` / `widthFraction` | Height in Z and width across the run, on the same scale a cell uses. Defaults: one module (8mm) tall, a full stud (8mm) wide. |
| `roundedEnds` | Full-round end caps, as on a real liftarm. The cap's plane follows `holeAxis`, exactly as a rounded cell's cap follows its own bore. A *fitted* end takes a square face instead — see below. |
| `leadInStart` / `leadInEnd` | How far the body runs before the first hole and past the last one, in mm. 0 on every beam that isn't fitted. See **Fitting a beam between two cells**. |
| `solidHoles` | Holes left solid on purpose, by index (0 = the anchor hole). See **Turning holes off**. |
| `gusset` | Size in mm of the web added where a square end meets a block, 0/absent for none. See **Smoothing the joins**. |
| `endpoint` | The cell a fitted beam was drawn to. Present only while the beam still is that fit — setting a direction or hole count by hand clears it. |

## Four arms from one anchor

Slope and direction are separate controls, so a hub is four beams sharing one anchor cell, each on
a different quadrant. At 45° those are 45° / 135° / 225° / 315°; at the 3-4-5 slope, 36.87° /
143.13° / 216.87° / 323.13°. The quadrant buttons are labelled with the angle each one actually
produces rather than with "forward/mirrored", so what you pick is what you get.

Before `reverse` existed the picker was mirror-only, which reached just the two quadrants either
side of +X — two arms of any four-way hub had nowhere to point.

## Mixed bore directions

A single beam-wide direction can't express the case an angled brace usually needs: the end that
pins DOWN onto a plate wants a vertical bore, while the end that pins SIDEWAYS into another beam
wants an in-plane one. `holeAxes` overrides individual holes, and everything downstream is decided
per hole rather than once per beam:

- Each hole's cutter is built along its own direction, and lands in the through-cutter or the
  local-cutter list accordingly (see the section below).
- Each **end cap** follows the direction of *that end's* hole, not a beam-wide one — a vertical end
  hole is round in plan view, an in-plane one is round in elevation, so on a mixed beam the two
  ends genuinely differ.
- The 2D overlay draws an in-plane hole with a short tick across the beam, so which hole is which
  is readable from the plan.

In the UI this is the **Bore per hole** row, offered on a selected beam (Edit tool) rather than on
the brush — a brush places a beam whose holes all bore the same way, and individual holes are
adjusted afterwards, the same order cells already work in. Each button cycles its hole through
follow-the-beam → vertical → in-plane. Setting the beam-wide **Bore direction** clears every
override, so that control always does what it says.

## Holes vs. the blocks a beam runs through

A beam is unioned into the same solid as every cell, so a solid cell the beam passes through would
plug the beam's holes — the block wins simply by being unioned after the hole was cut. **Vertical**
bores (whether from `holeAxis` or a per-hole override) are therefore held back and subtracted from the *finished* union (`throughCutters` in
`buildAngledBeamGeometry`, applied in `buildGridGeometry`), so they stay open through whatever they
pass through. They're cut to the layer's full height, not the beam's, so a taller cell sharing the
layer is drilled all the way through rather than capping the hole part-way up.

**In-plane** bores are deliberately NOT done that way: they end at the beam's own two side faces, so
a beam embedded in a block would turn into a sealed cavity inside solid material — unprintable, and
worse than the filled hole it was meant to fix. They're cut from the beam alone, matching how a
cell's own sideways hole bores only through its own cell and leaves a neighbour to paint its own.

## Which angles actually connect

This is the part that isn't obvious. A beam's holes are at 8mm along the beam, so its **far end
only lands back on a grid hole centre when the run is a whole number of studs in both X and Y at
once** — i.e. when the direction is a Pythagorean triple.

- **45° can never do this.** √2 is irrational; no whole number of 8mm steps along a 45° line ever
  lands on the grid. This is why real Technic reaches 45° through pin joints and dedicated angled
  parts, not through a beam spanning two fixed hole positions.
- **36.87° (3-4-5) and 53.13° can**, every 5 hole-spacings — a 6-hole beam pins in at both ends.
  So can 22.62°/67.38° (5-12-13, every 13) and 28.07°/61.93° (8-15-17, every 17).
- **18.43°, 26.57°, 63.43°, 71.57°** are the common LEGO "slope" directions but are not
  Pythagorean: the anchor end pins, the far end doesn't.

For a FITTED beam, legality is the same question asked of its own two end holes: the run between
them has to be a whole number of hole-spacings. Having no lead-in is necessary but nowhere near
sufficient — the hole-aligned fit sets no lead-in on every beam-to-beam drag — and reading legality
off that alone declared a 45° beam across two cells legal while its far hole landed 0.17 studs from
the cell it was aimed at, with the panel saying so in as many words.

`isBeamGridLegal` / `nearestLegalHoleCounts` compute this, the beam panel spells it out in words,
and the 2D overlay draws the far-end marker hollow when it doesn't land on the grid. A beam that
isn't "legal" is still correct and printable — it just can't be pinned straight into the grid at
both ends.

## Fitting a beam between two cells

**Drag** from one cell to another with the Angled beam brush and the beam is fitted between them:
its **body spans the two cell centres exactly**, so it fuses into whatever is painted at each end,
while its **holes keep their true 8mm pitch**.

Those two things are only compatible because the body is allowed to run past its own end holes.
The distance between two cell centres usually isn't a whole number of 8mm hole-spacings (45° never
is — see **Which angles actually connect**), so the fit takes the leftover and splits it evenly
between the two ends as plain material:

```
L        = 8mm × hypot(bx-ax, by-ay)      // exact body length
n        = min(round(L / 8mm),            // hole count…
               floor((L - 2×need) / 8mm) + 1)   // …that still leaves both end holes their wall
holeSpan = (n - 1) × 8mm                  // untouched pitch
leadIn   = (L - holeSpan) / 2             // slack, half at each end
```

**A beam-to-beam drag is snapped to a direction that can actually close.** A beam's holes are at a
true 8mm pitch along its own axis, so starting one on a grid point puts its far end on another only
when the direction's hypotenuse is a whole number of those steps — a Pythagorean triple. 3:2 gives
√13, 1:2 gives √5, 1:1 gives √2: draw a frame at those angles and its corners miss by a few
millimetres however carefully it was drawn, because the arithmetic does not allow anything else.
`snapEndpointToLegal` moves the endpoint to the nearest cell that does work, searching integer
offsets — no angle arithmetic and no tolerance to tune, since a direction either has a whole-number
hypotenuse or it has not. Past `maxShift` the drag is left alone, on the grounds that reaching that
far past every legal direction means it.

The five directions in the sample frame — 3:2, 1:4, 5:1, 1:2 and 1:1 — snap to four 3-4-5 braces
and one axis-aligned run, all landing on holes. Directions that already work (3-4-5, 5-12-13,
straight runs) are returned unchanged.

The drag preview shows the snapped end and a dashed line back to the pointer, so the beam you are
promised is the beam you get.

**While a beam-to-beam drag is in progress, every hole it could actually pin to is ringed in
green** — every existing hole whose run from the anchor is a whole number of hole-spacings. Drag to
one of those and both ends land on holes; drag anywhere else and the far end cannot, however
carefully it is aimed.

This is the compensation for the one thing solid-to-solid can do that beam-to-beam cannot. Between
two blocks the BODY stretches, through its lead-ins, to meet whatever two cells were dragged
between — so every drag lands. Pinned to beams there is nothing to stretch: the holes are at a fixed
pitch along the beam's own axis and have to fall on other holes, which only happens at whole-number
runs. Rather than let that be discovered a millimetre at a time, the reachable holes are simply
shown.

**Both ends snap to existing beams' HOLES, not just to cells.** Beams meet beams at pins, and a pin
needs one hole through both. Cell centres are no help for that: a diagonal beam's holes are a whole
number of 8mm steps along its own axis, which almost never lands on a cell — so two beams aimed at
the same cell finish with their end holes a few millimetres apart, joined to look at and impossible
to pin. `nearestBeamHole` anchors the new beam on the hole itself, and those hole positions join the
cell centres as candidates for the far end, checked for a whole-number run exactly as a cell is.

Building a triangle that way closes its first two corners **exactly** — gap 0.000 — and the third to
0.031 studs (0.25mm). The residual is arithmetic, not slop: closing all three corners needs the
triangle's three side lengths to be whole numbers of 8mm at once, which a 3-4-5 satisfies and an
arbitrary triangle does not.

**A hole that nearly meets another beam's hole and misses is drawn RED**, larger and heavier than
the rest, with the gap in the tooltip; the beam panel repeats it in millimetres. `beamEndHoleMisses`
finds them: an END hole with another beam's hole within 0.75 studs but further than 0.01.

This is the one fault here a render cannot show. Two beams meeting at a corner read as joined from
any distance, and whether a pin will pass through both comes down to a fraction of a millimetre.
Nor is it ever the builder's fault: hole pitch is one stud along a beam's OWN axis, so a corner
closes only when the run between the two holes is a whole number of studs, and a right isoceles
triangle has a hypotenuse of √2 times its leg however carefully it is drawn. On the sample the
vertical beam's third hole is flagged at **1.37mm** while the other three corners, which do share
holes, are left alone; a 3-4-5 triangle flags nothing at all.

A free end near nothing is not reported — that is a beam that simply ends, not a join that failed.

**Hold SHIFT while dragging to reach the exact cell instead.** The snap is right by default, because
a direction that cannot close is almost never what someone means — but "almost never" is not never.
A beam has to be able to reach a cell that simply is where it is, and without a way to say so the
snap stops being a help and becomes a wall. Shift is free to mean this on a beam drag because the
rectangle it selects for a cell brush has no meaning for a beam. It is read live rather than latched
at the start, so the snap can be let go of or taken back mid-drag, and the preview labels the beam
"exact cell (Shift), far end won't land on a hole" so the cost is on screen while the choice is
being made.

**Which fit depends on the BORE DIRECTION**, not on what happens to be at the ends.

An **in-plane** beam stands on edge and pins sideways. Its ends are buried in, or butted against,
whatever it joins — so the end holes are cropped and what matters is that the holes between them
keep a true pitch, centred on the beam's length. That is the lead-in fit, and it lands on ANY drag
because the body stretches to reach: the reason a solid-to-solid beam always fits. There was never a
reason a beam-to-beam one should not, and making the choice depend on whether the ends were solid
is what stopped it.

A **vertical** bore is the other case entirely: those holes pin DOWN onto the grid beneath, so they
have to land on it, and the beam takes the hole-aligned fit — with the legal-direction snap, which
only means anything where the holes have to land on something.

The 45°-across-2 drag that could not close: the body fit lands **0.000 / 0.000** on both joint
points with the pitch still exactly 1 stud, where the hole-aligned fit missed the far end by 0.172.

**(Historical)** Which fit depended on what the beam lands on. Into SOLID at both ends, the body is what has to
land: it fuses with the blocks, so the lead-in fit above puts it exactly on the two cell centres and
the holes float wherever the pitch leaves them. Onto anything else — bare grid, or another beam —
nothing fuses. The two are *pinned*, and a pin needs a hole at a position you can find, so the fit
drops the lead-ins and puts the first hole on the anchor cell's own centre with the rest following
at the true pitch. That is what a moulded angled liftarm does, and why its holes sit on the stud
grid.

The difference on a 45° drag across five cells: the solid-to-solid fit gives 7 holes with **none**
on a grid point (the first sits 0.38 studs along), while the beam-to-beam fit gives 8 holes starting
exactly on the anchor and finishing 0.07 studs from the target instead of 0.54. On a Pythagorean
direction the two agree — a 3-4-5 gives 6 holes landing dead on both cells either way.

Rounding rather than flooring is what keeps the ends sane: `leadIn` lands near 4mm, the same wall a
normal liftarm has past its end hole. A 45° drag across 5 cells gives 7 holes and 4.28mm ends.

**`need` is why rounding alone isn't enough.** The slack lands anywhere in 4…12mm, so half of it
can be as little as 2mm — less than a Technic hole's own 3.2mm counterbore. The end hole then
breaks out through the end face and prints as an open notch a pin drops out of, not a hole. Capping
the count at what leaves both ends `BEAM_END_HOLE_MATERIAL[holeType]` of material fixes it: one
hole fewer buys 4mm at each end, which is always enough. Across every drag up to 8×8 studs this
takes the worst end down from 2.0mm to 3.78mm, and it changes the hole count on about a quarter of
them.

A beam can still end up with a too-tight end hole by being edited by hand after the fit — a hole
count typed in, or lead-ins left behind by an edit. `beamSuppressedHoles` catches that case: the
offending end hole is left **solid** rather than bored (an open notch being worse than no hole),
the 2D overlay draws it dashed, and the beam panel says so and tells you what to change.

Two consequences worth knowing:

- **A Pythagorean direction skips the whole trick.** When the two cells are a whole number of
  spacings apart (3:4, 5:12, 8:15, or any straight run), the fit uses `n = distance + 1` holes and
  **no lead-in at all** — the end holes land on the two cells and pin straight into the grid. It
  would be strictly worse to add lead-ins at the one angle that doesn't need them.
- **A fitted end is square, not round.** A liftarm's round end is a half-circle concentric with its
  end *hole*; once the body runs past that hole, a circle at the body's end is centred on nothing.
  The square face is also what a gusset needs to sit against.

`beamFitToEndpoint` computes the fit, `beamBodySpanStuds` gives the body's real extent (which is
what the 2D overlay draws — the hole-to-hole line would show a beam stopping short of the cell it
actually fuses into), and **Clear fit** in the beam panel drops the lead-ins again.

## Rounded ends, and the ends a fit leaves behind

A liftarm's end is a half-circle concentric with its end HOLE, so an end carrying a **lead-in** can't
have one: the body runs past that hole, and a circle at the body's end would be centred on nothing.
That end used to fall back to a square face regardless of the Rounded setting — which was right
while a fitted end meant an end BURIED in the block it lands on, and wrong once most beams carry a
lead-in (both the Body and Centred fits produce one by construction, so Rounded stopped doing
anything at all on a fitted beam).

Now a fitted end that hangs in **air** gets a **stadium** end instead: the straight body stops a
cap-radius short and an upright half-round centred there carries it the rest of the way, so the end
reaches exactly as far as the square face did and the fit is untouched. An end buried in a block
keeps its flat face — the cap would be invisible inside the material, and the end blend wants a
straight wall to sit its fillet against.

`beamEndIsBuried` decides it, and `beamOutline` applies the same rule so the blend crosses against
the outline the part really has.

## Which fit a drag takes

A drag has to land two things and can rarely land both: the beam's **body** on the two cells, or its
**holes** on the grid. At 45° it is never both — the cells are 8.485 studs apart and √2 is
irrational, so no whole number of 8mm pitches starts on one cell centre and ends on the other.

`beamFitToEndpoint` takes a `BeamFitMode`, and the Beam fit picker chooses it. **Auto** keeps the
original rule (the bore direction decides) and is the default:

| mode | what lands | what gives |
|---|---|---|
| **Body to cells** | body spans the drag; slack split as lead-in at both ends | holes sit off the grid |
| **Grid** | first hole on the anchor, rest at true pitch, no lead-in; the drag snaps to a run that is a whole number of studs so both end holes land on cells | on a run that can't snap, the far end stops short |
| **Centred** | body spans the drag AND the hole count is forced **odd** | one hole fewer than Body, so a little more lead-in |

### Grid refuses an off-grid start

A drag's start snaps to the nearest existing beam HOLE, because that is what makes a corner
pinnable. Under the Grid fit it snaps only to a hole that is itself **on the cell grid**.

The reason: "holes on the grid" is measured from the ANCHOR. A 45° beam's holes step 5.657mm along
its own axis, so they clear the 8mm grid at its anchor and nowhere else — start a new beam on one
and every hole of the new beam is off the grid too, and the angle to the target cell arrives as
179.2° where 180° was meant. Chained round a frame it compounds: a real five-beam frame came out
with anchors 0.12 studs off and corners at 138.47°, 179.20° and 88.23°. The same five drags now give
0°, -45°, -135°, 180°, 90°, every anchor exact.

What it costs is the shared corner hole: anchoring on the cell rather than the diagonal's hole
leaves the two end holes about 1.4mm apart, joined by material but not pinnable through one hole. At
45° that trade is unavoidable — a diagonal's holes and the cell grid only ever meet at its anchor.
A **Pythagorean** corner (3:4, 5:12) has both its end holes on the grid, so it can be chained from
without either loss. The other fits still take the nearest hole whatever its position, since they
never promised the grid.

### Why Centred forces an odd hole count

An odd count puts a hole on the beam's own midpoint; an even one puts the midpoint *between* two
holes. Two beams fitted Centred therefore share a hole at the centre, and since both keep the same
8mm pitch and equal lead-in at each end, **every hole of the shorter beam falls on one of the
longer beam's** — whatever their two lengths. That is what lets a vertical-bored beam on one layer
line up with an in-plane one on another. With even counts the two are 4mm out of phase and share
nothing, however carefully they are placed.

The count only ever steps DOWN to reach odd. One hole fewer buys 4mm more lead-in at each end; one
more could take an end hole past the material `BEAM_END_HOLE_MATERIAL` demands. Measured over every
drag up to 12x12, the smallest lead-in Centred produces is 3.8mm — it never goes negative, which
would hang the end holes off the body.

**Re-fit selected beam** re-runs the chosen fit on a beam already placed, between its own anchor and
endpoint — the fit is otherwise decided only at drag time, and a beam whose partner on another layer
has to match is exactly when you change your mind.

## Sitting the beam against the blocks

A fitted beam's ends sit on cell **centres**, which buries the end face inside the block it lands
on and leaves the beam's side faces crossing that block's walls at an angle. That crossing is where
the lip comes from — the blend below only dresses it.

`acrossOffset` slides the whole beam across its own run so its **outer wall passes through the
block's outer corner** instead. The two outlines then meet at a point rather than crossing, and
there is no lip to round off in the first place. **Sit against the blocks → Flush outer wall to
block corner** computes the shift; on a 45° brace between 8mm blocks it comes out at 1.657mm.

At each end the block's outer corner is the corner of the cell the beam lands on that sits furthest
out on the beam's OUTER side — the side away from where the block's own material runs, and taken at
`CELL_BUILT_HALF`: the size a solid cell is **actually built at**.

**A rounded cell has no corner to sit against.** Its exterior is an arc, and rounding.ts rounds a
cell by intersecting it with a cylinder on the cell's own centre whose radius is capped at half a
stud — while the box is built a touch wider — so the circle governs the whole profile rather than
just easing four corners: in plan the cell is a circle. Aiming the beam's wall at the square corner
then points it at empty space and leaves the very gap the offset exists to close. The wall is made
**tangent to the arc** instead, which degenerates correctly: a radius of 0 puts the tangent line
back on the sharp corner.

The arc is concentric with the cell, so for a fitted beam — whose line passes through both end cell
centres — a rounded end gives an offset of exactly **0**: an 8mm beam centred on an 8mm round post
already has both its walls tangent to it. Treating the rounding as corners inset by the radius
instead leaves the wall 4.071mm from the centre of a 4mm circle, which is the same class of
fraction-of-a-millimetre lip as the rest of this section.

That distinction is worth spelling out, because there are three plausible numbers and only one is
right. A cell occupies a `STUD_PITCH` square; its nominal block body is `BLOCK_BODY_UNDERSIZE`
narrower than that; and geometry.ts builds it `STUD_PITCH + CELL_OVERLAP` across, deliberately
oversized so neighbours overlap and the CSG has thickness to work with. Only the last is the wall
the part will have. Aligning to the nominal body put the beam's wall 0.15mm inside it and left a
0.3mm lip running the length of the join — the block standing proud of the beam.

**An end joined to another beam is NOT slid across.** Sitting flush is for blocks, which have a wall
to sit against; beams are joined by a *shared hole*, and this offset moves the whole beam, holes
included. Sliding one flush against the beam it joins therefore pulls its end hole off the very hole
that was the join — leaving two end caps of equal radius with centres a millimetre or so apart,
whose union kinks where the circles cross. That kink is a visible bulge on what should be one
continuous edge, and on the sample it also broke a join that had been exact: the shared hole went
from a gap of 0.000 to 0.146.

Nothing is lost by leaving it alone. A shared hole already puts the two caps concentric, and an end
landing on a beam caps in PLAN (see beamEndsMeetingBeams), so the two discs coincide exactly and the
corner comes out smooth without moving anything — which is what the notch on a beam-to-beam triangle
actually needed. Sliding was the wrong instrument for it.

**A vertical bore takes the hole-aligned fit but is still sat against its blocks.** Those are two
separate decisions and only one of them is free.

The fit costs nothing: putting the first hole on the anchor's own centre with the rest at true pitch
is the best grid alignment available, and it is what a flat liftarm lying on the plate wants, since
its holes pin down onto whatever is beneath.

The offset is a genuine trade-off, because sitting a beam against its blocks moves it ACROSS its
run and that takes the holes off the grid. On a diagonal you cannot have both: a perpendicular shift
only returns the holes to the grid if it is a whole lattice step across, which at 45° is 11.31mm,
not the ~1.7mm a flush wall wants. There is no partial shift that recovers alignment — any smaller
one is simply off-grid by a different amount.

So only the DEFAULT is decided: a vertical bore is left centred on the grid, since that beam's holes
pin down onto whatever is beneath and that is usually the point of boring it that way. Trading it
away silently at placement is the surprising choice. **Flush outer wall to block corner** is still
one click away for the times the wall matters more, and the beam panel says which way a given beam
currently sits and what it costs either way.

**A beam dragged onto blocks is sat against them straight away.** Fitting a beam and then having to
ask for the offset separately made the fit look like it had done half a job. A beam placed on bare
grid has nothing to sit against and gets no offset. Both ends
are measured and the one needing the smaller shift wins: moving further than an end needs would
push the wall past that block's corner and re-open the crossing on the other side of it. On a
symmetric brace the two agree exactly.

The hole pitch is untouched — the whole beam moves, holes with it. That trades the holes sitting on
cell centres for the outline being right, which on a diagonal they could never both do anyway.

## Smoothing the joins

**End blend is off by default** and always has to be asked for: a beam carries no `gusset` unless
one is picked, and a project saved without one loads with none.

A beam's fitted end stops at a cell *centre*, buried inside the block it lands on, so the join you
see is where the beam's **side** faces emerge through that block's walls. Every crossing makes two
corners: a concave notch on one side and a convex lip on the other. End blend rounds both, as true
tangent arcs.

### Voids the join encloses

A corner fillet can only round a void's corners; it cannot close it. Where a beam runs along a
**stepped** edge — the staircase of square cells a circle ring is built from is exactly this — each
step traps a triangle of air between the beam's wall and two cell faces, and those come back as
holes in the union. On a 45° beam against 8mm cells each is about 2.2 x 2.2mm, 2.8mm²: too small to
be a design feature, too enclosed for a corner arc to reach.

So End blend also **fills** them, under two tests that together are why this is still not the
morphological close the next section rejects:

- The void must be **narrower than the blend everywhere** — eroding it by the radius must leave
  nothing. A real opening survives its own erosion and is left alone, so the radius keeps meaning
  what it says instead of becoming a size threshold in disguise.
- The void must touch **both** parts. One enclosed by a single part is that part's own business — a
  lightening pocket, a bore, a ring's bore — and filling it would be editing the design rather than
  finishing a join.

### Built from the crossings, not from an offset of the union

`footprintBlend` works from the points where the two outlines actually **cross**, and that is the
whole point of it.

The obvious alternative — morphological close and open on the union — produces a correct fillet at a
corner, and was how this worked first. But it cannot tell a corner from a gap: `close` fills any
concave gap narrower than twice the radius, so as the radius grows it starts webbing across openings
in the design that were never corners, leaving a tapering tongue between two surfaces that never
met. Which radii do that depends on what gaps the part happens to contain — on the sample frame it
was clean at 1.5mm and 2.5mm and silvered at 1mm and 3mm — so no threshold fixes it. A crossing
point cannot bridge anything: it exists only where the two outlines really meet.

The construction at each crossing:

1. **Skip corners either part already had.** A boolean only invents vertices where edges cross, so a
   crossing is a union vertex whose coordinates did not come from an input.
2. **Measure the faces.** How far the flat face runs from the corner in each direction, following
   collinear runs through — the union's contour carries a vertex at every break, including ones the
   boundary carries straight through, and measuring only to the next one pinned every fillet to
   about 2mm however large a radius was asked for.
3. **Size the arc.** `t = radius / tan(φ/2)` for the corner's angle φ, clamped to the faces
   available: a whole face, or **half** of one whose far end is another crossing, since that corner
   wants a fillet out of the same run. A fillet cannot be bigger than what it sits on, so large
   radii saturate rather than misbehave.
4. **Add or subtract.** The material occupies the φ wedge at a convex corner and the air occupies it
   at a concave one, so one shape serves both — the tip out to the tangent points, less the arc
   tangent to both faces — and only the sign differs. A **left turn is convex on every contour**:
   outer contours come back anticlockwise and holes clockwise precisely so that material is on the
   left throughout, so one rule serves both. Inverting it for holes looks right and is not; it
   stayed hidden while cell squares were disjoint and every corner that mattered sat on an outer
   contour, and the moment they overlapped into one region with a hole down the middle, every
   fillet on that hole silently became a cut.

Corners below `MIN_FILLET_TANGENT` are skipped rather than made and filtered afterwards: that is
what keeps the 0.2mm seams between neighbouring cell bodies harmless, since a beam crossing one
makes two crossings a fraction of a millimetre apart.

The fillet is then grown by `CELL_OVERLAP` and clipped to the material it grew into. Built as
polygons it ABUTS the beam and the blocks along its two straight edges — it shares their faces
rather than overlapping them, and two solids that merely touch are not reliably one solid: the join
shows as a seam and can survive into the mesh as a crack.

**Beams are blended against other BEAMS as well as against cells.** A beam meets beams as often as
it meets blocks — a frame made of beams alone has no cells in it at all — and a corner is a corner
whichever it is. Passing only the cells meant the blend found nothing to work with on such a part
and left every join as two rounded ends overlapping, which is what a beam triangle looked like: the
corners read as lumpy rather than blended, and no radius changed it because no fillet was being
built at all.

`beamOutline` gives another beam's footprint the way that beam is really built — same body span,
same width, same decision about which ends are capped, since a lead-in means an end has no cap.
On a three-beam triangle this takes each beam from **no fillets** to a proper one at each join.

**A rounded cell is not a square.** `cellFootprint` gives each cell its real outline: a square, with
any ROUNDED quadrant replaced by its arc. A square for every cell is wrong as soon as one is
rounded, and wrong by a lot — a cell's corner sits 5.73mm from its centre while the arc that
replaces it is at 4mm. The blend finds its corners by crossing the two outlines, so an outline that
isn't there produces crossings that aren't either, and fillets appear along the outer wall where the
real geometry runs smoothly past.

Which quadrants round follows geometry.ts's own rule (`exteriorCorners`): a corner rounds when both
of its orthogonal neighbours are clear, since a shared wall has to stay flat for two cells to sit
flush. The arc is concentric with the cell, so a rounded quadrant is a quarter of a circle of
`CELL_EDGE_RADIUS` — not a corner eased by it.

The test that shows it working: a beam fitted between two isolated cells gives four small fillets
when they are square and **none at all** when they are round. That is the right answer — a beam
tangent to a round post makes no corner, so there is nothing to fillet.

`partB` must be the blocks **exactly as the part will be built** — real body squares, seams and all.
Anything that makes this outline differ from the assembled part's shows up as a sliver somewhere:
pitch squares put every fillet 0.1mm proud of the real wall, and welding the seams shut first
rounded the blocks' corners and left a razor wedge millimetres long along the clipped edge.

### Holes the blend must not cover

A fillet is computed from outlines, and an outline knows nothing about holes — so at a corner beside
one, the blend cheerfully lays material across the opening. Normally a bore would cut that away
again, but an in-plane bore is clipped to its own beam's width (see **In-plane bores**) and cannot
reach material a fillet added *beyond* the beam's side face. The result is a film across the mouth.

So the fillet is cleared away from those mouths — with the **bore's own shape**, a cylinder on its
axis standing off the face by half the blend radius, not a footprint in plan. Half, because the
fillet's face curves away from the bore as it goes: past about that depth it is no longer in front
of the opening, and clearing further only removes material that was already out of the way. The difference matters: a fillet spans the
beam's full height while the mouth is a circle partway up it, so a plan footprint takes out
everything above and below the opening as well — material that was never in the way, cut to a
rectangle nothing in the part is shaped like.

And **per side, only where the bore opens into air**. Where it meets a block there is no mouth at
all: the bore ends inside that material, and cutting there just bites into a fillet doing its job.
The middle of a beam running through a block is exactly where that shows.

A vertical bore needs none of this — it runs the layer's full height and cuts whatever is over it.

### Acceptance test

Top-face perimeter against blend off. Filleting a concave corner *reduces* perimeter; slivers add
boundary and *increase* it, which is what makes this a usable check on a change no screenshot can
resolve:

| radius | Δ perimeter | Δ area |
|---|---|---|
| 0.4mm | −25.3 | +3.5 |
| 0.8mm | −53.8 | +12.7 |
| 1.2mm | −55.6 | +28.6 |
| 1.6mm | −91.7 | +50.8 |
| 2.4mm | −123.2 | +114.2 |

Monotonic and never positive. Under the offset-based version the same test read **+34.3 at 1mm** and
**+58.9 at 3mm** — the slivers, in a number.

## In-plane bores through a block

An in-plane bore is normally cut into the beam alone (see `buildAngledBeamGeometry`'s own note: one
that ends inside solid material would be a sealed cavity). That left the holes where a beam passes
**through** a block coming out blocked — the bore stopped at the beam's own side faces, and the
cell, unioned in afterwards, filled it straight back in.

`inPlaneBreakout` measures how far such a bore has to reach to come out of open air at *both* ends,
walking the grid outwards from the beam's centre line. If it gets out, the hole is promoted to a
through-cutter so it is cut from the finished assembly, where the cell that was filling it can
actually be reached. If it never gets out within four studs it stays the beam's own width and stays
local — a blind pocket is worse than a filled hole.

Each side is measured **on its own**, and the clearing cylinder spans exactly `-minus…+plus` rather
than the same distance both ways. A single symmetric reach — one length, centred, sized to the
longer side — punched out of the short side by however much the long side needed, drilling through
cells the beam never touches. The material either side of a beam is only symmetric by accident.

**An in-plane bore reaches `BORE_BREAKOUT` (0.05mm) past the beam's side faces, and no more.** Every
hole primitive grows `CUT_EPSILON` — 0.5mm — past each end of the length it is given, so a cut into
a lone solid breaks its surface instead of ending flush with it. For a vertical bore that overshoot
goes up and down into open air and costs nothing. For an in-plane one it goes sideways, into
whatever block the beam is buried in, and since these are cut from the assembly it scalloped 0.5mm
out of the block alongside the beam's edge at every hole: a line hugging the join, one bite per hole.

The overshoot cannot simply be removed. Ending the bore exactly flush with the beam's side faces
makes the cut coplanar with the surface it breaks, and the boolean answers that with degenerate
slivers — holes come out as a **starburst of radial spikes** rather than circles. What it can be is
small: 0.05mm keeps the faces off each other so the cut stays robust, while the notch it leaves in
an adjacent block is finer than a print layer.

**The hole primitive itself always stays the beam's own width**, and the reach beyond is cleared by
a separate plain cylinder. A Technic hole carries a counterbore at each mouth, so building the
primitive over-length does not lengthen a hole — it moves both mouths to wherever the extension
happens to stop, burying a 3.2mm pocket inside the block and leaving the real face with a bare bore.
The plain cylinder has no mouth of its own to misplace. A round section is right even for an axle
hole: it encloses the cross, and an axle only ever engages the beam.

## Ends that meet other beams

A cap's plane follows its end hole's bore because it is meant to be concentric with that hole:
round in plan for a vertical bore, round in elevation for an in-plane one. Two beams joined at a
shared hole both cap that hole, and the two caps only coincide if they are the same kind — a plan
cap is a disc of half a stud about the hole, while an in-plane cap is square in plan and reaches
half a stud along the beam AND across it, so its corners stand `(√2 − 1) × 4mm = 1.66mm` proud of
the other beam's disc. That is the overhang, and neither beam is doing anything wrong on its own.

So an end that lands on another beam's hole caps in PLAN whatever its own bores do, exactly as an
end whose hole has been made solid does — in both cases there is no hole of this beam's own for the
cap to belong to. Measured on a flat beam meeting an on-edge one: 1.66mm of overhang before, 0.00
after.

The 2D plan draws each beam's **real outline** — body and caps, `beamPlanOutline` — rather than a
stroked line of nominal width, so an end standing proud of what it joins is visible where it is
made. A fat line hides precisely the thing worth seeing. Note an in-plane cap is deliberately square
in that outline and reaches its own radius past the hole: it is a cylinder lying across the beam,
and drawing it as a disc, or stopping at the hole, would hide the overhang just as effectively.

## What a fresh drag starts with

An end **buried in a block** starts with its hole turned off. A hole there is not a hole: it sits
inside solid material, weakens the join, and prints as a pocket — which is why it wanted doing by
hand on every beam that ran into a block.

An end landing on **another beam's hole** keeps its hole, because that hole IS the join: it is the
one a pin goes through, and turning it off would remove the very thing being built. The two are
distinguished rather than both being treated as "an outer join".

Verified: a beam fitted between two solid cells starts with `solidHoles: [0, last]`, while one
anchored on another beam's hole starts with none.

## Turning holes off

`holeType` is one choice for the whole beam, matching a real moulded liftarm, and `none` turns
every hole off at once. That's the wrong granularity where a beam runs INTO something: the holes
buried in the block it joins weaken the join and print as pockets inside solid material, while the
ones out in the open still need to pin.

`solidHoles` is that choice per hole. In the beam panel, the **Bore per hole** buttons cycle
`·` (follow the beam) → `↕` (vertical) → `↔` (in-plane) → `✕` (solid, no hole) → `·`. It shares
that cycle rather than getting its own control because "which way does this hole bore" and "is
there a hole here at all" are the same decision, made one hole at a time.

The end holes an endpoint fit has no room for (see **Fitting a beam between two cells**) show as
`✕` too, and the 2D overlay draws every un-bored hole dashed either way.

## Editing

A beam is placed, selected and edited exactly like a cell — it is not a separate mode:

- **Place**: pick the **Angled beam** brush in the ActionBar and click a cell — or drag from one
  cell to another to fit a beam between them (above). It's the one brush whose gesture has an end
  as well as a start, so it places on pointer-*up* rather than pointer-down; a click that never
  moves is the same single-cell placement it always was. The brush is
  `CellType.AngledBeam`, a *brush-only* type (`BRUSH_ONLY_TYPES`) that `paintRect` intercepts
  before the layer is touched — it exists so a beam shares the one brush strip, icon, preview and
  colour everything else already has, never because a beam is a cell.
- **Edit**: with the Edit tool, click a beam's anchor square (or its row in the Angled beams
  panel). Its settings load into the pickers, and every picker change applies straight away — the
  same `applyCurrentToSelectedCell` behaviour a cell gets, routed through `applyToSelectedBeam`.
  A beam shares Plate height / Plate width / Edges with cells and has its own Beam angle, Beam
  holes and Bore direction pickers; it has no axis, flip or blend pickers, since none of those mean
  anything on it.
- **Erase**: the Empty brush over a beam's anchor removes the beam along with the cell.
- **Move**: hold **Alt** and drag on the plan — this moves whatever is on that square, a cell or a
  beam anchored there, in either tool. A whole drag is one undo step (the store's `checkpoint`
  plus `history: false` on the intermediate steps). The beam's anchor dot in the 2D overlay is also
  draggable directly while the Edit tool is active.

`AngledBeamPanel` is now just an inventory — which beams exist, which is selected, and delete —
because a beam can run off across the plan from one anchor square, so the grid alone doesn't
answer "what beams does this part have".
