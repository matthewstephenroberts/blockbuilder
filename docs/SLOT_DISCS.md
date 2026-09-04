# Slot discs

A carousel/dispenser wheel: a centre bore, and N square pockets evenly spaced around a ring, each
sized to take a block. The material left between the pockets **is** the spoke pattern — there's no
separate spoke element, because a spoke is just "the wall between two pockets".

Like [angled beams](ANGLED_BEAMS.md), a disc lives on `GridState.discs` rather than in a layer, and
for two structural reasons rather than for want of more cell types:

- A cell grid is square and axis-aligned, so an N-fold radial pattern is only expressible for N of
  4 (and, awkwardly, 8). Six evenly-spaced pockets have no representation at all.
- The grid has no way to REMOVE material — every cell type adds — and a pocket is a subtraction.

## Parameters

| Field | Meaning |
|---|---|
| `centreX`, `centreY` | Grid cell the disc is centred on. |
| `slots` | Pocket count. |
| `slotStuds` | Pocket size in studs, square — 1 for a 1×1 block. |
| `slotClearance` | **Total** extra width over the block's own body, so half of it is the gap on each side. |
| `ringRadiusStuds` | Centre-to-pocket-centre distance. Undefined = auto (see below). |
| `rimMm` | Material outside the pockets. |
| `bore` | `axleHole` (driven off a motor), `technicHole` (turns on a pin), or `none`. |
| `floorPlates` | 0 = pockets go through, so a block drops out as the disc turns. Non-zero leaves a floor, making them carrier pockets. |
| `openOuter` | Opens each pocket through the rim as well, so a block can be pushed out sideways. |
| `slotChamferMm` | Lead-in ramp round each pocket mouth — see below. 0 turns it off. |
| `startAngleDeg` | Rotates the ring — to line a pocket up with a chute or sensor. |
| `slotEnabled` | Which positions are actually cut, index-aligned. Undefined = all of them. See **Gate plates**. |
| `plateFraction` | Disc thickness, from the shared Plate height picker. |

## Pocket size is measured off the block's BODY

A block's body is smaller than the pitch it sits on: an n-stud block measures
`n × 8 − 0.2mm` (`blockBodySizeMm`). Sizing a pocket off the *pitch* silently spends that 0.2mm as
if it were clearance, when it's actually the gap that lets two blocks sit side by side at all.
Pocket size is therefore `blockBodySizeMm(slotStuds) + slotClearance`, and the panel reports the gap
per side rather than the total, since per side is what decides whether a block binds.

The default is 0.8mm total, i.e. **0.4mm per side**. A pocket a block has to fall freely through
wants far more than a connector fit does: an FDM-printed vertical pocket comes out undersized, the
nozzle rounds its inside corners where the block's are sharper, and a carousel that jams under load
is worse than one that rattles. The panel warns below 0.25mm per side.

## Mouth chamfers

Clearance alone doesn't stop a block binding, because binding usually isn't a "too tight" failure.
A block arriving even slightly off-centre or off-square catches its bottom edge on the sharp rim of
the hole and stops there, with plenty of clearance still around it. `slotChamferMm` flares each
pocket mouth outward at the face and then runs at nominal size, so the block meets a ramp that
pushes it into line as it drops. It matters most on the gate plate — the one hole a block has to
find on its own, with nothing guiding it.

`slotChamferSides` picks which face(s) get a ramp: **both** (the default, right when the part is
reversible or hand-loaded from either side), **top only** — a carousel usually wants the ramp on
the face blocks are loaded from and a clean flat face on the other, so a block leaves without a lip
to catch on — or **bottom only**. A floored pocket has exactly one mouth, so the ramp is
REDIRECTED there whatever is picked, not dropped.

Anything cut into the part's underside is invisible from every default view, which makes a
bottom-only chamfer read as doing nothing. The 3D viewport has a **view from underneath** button
below the home button for exactly this. The ramps
sit at the disc's own faces, not at the cutter's ends — the cutter deliberately overshoots past
both so it always breaks out, and a chamfer at the overshoot would be cut in mid-air outside the
material. The depth it's measured against is `pocketDepthMm` — the DISC's own thickness less any floor, i.e.
the material the ramp is actually cut into. Not the pocket cutter's height, which deliberately
overshoots to span the whole LAYER so nothing above or below can plug the hole. Clamping against the
cutter (an earlier version) let a disc thinner than its layer accept a far bigger ramp than its own
material could take: a 6.4mm disc in a 9.6mm layer allowed 3.88mm per face, so two 3mm ramps ate
6mm of the 6.4mm and met in the middle — a funnel, not a pocket, and one that reads as "the top
chamfer is enormous and the bottom one has vanished". It also disagreed with the panel, which was
already measuring against the disc's thickness; both now call the same helper.

`effectiveChamferMm` clamps each ramp to `MAX_CHAMFER_FRACTION` (40%) of that depth,
**independently of how many faces are being chamfered**. Dividing one allowance between the ramps
instead — the first version — meant switching Both → Top only DOUBLED the ramp actually cut, so a
control that picks WHICH faces get a chamfer silently changed HOW BIG it was. The number typed is
the number you get, whichever faces it lands on. The panel reports the size actually cut and warns
when a request was clamped, since a value larger than the plate can take is otherwise silently
reduced. The clamp exists because so a
through-pocket in a thin plate keeps a straight section between the two: chamfered any further and
it stops being a pocket and becomes a funnel that a block falls straight through without ever being
held.

Measured on a 9.6mm disc with 0.8mm asked for: nominal 8.6mm wall from z=0.8 to z=8.8, opening to
~10.2mm at both faces. On a 3.2mm plate the same request clamps to 0.66mm. A floored pocket gets
the top ramp only.

### The blocks themselves

Cells have their own `chamferMm` (see [CELL_TYPES.md](CELL_TYPES.md)) which chamfers a block's
exterior edges — the matching half of the pocket's mouth chamfer. Mind the sizing though: a plain
1×1 `Solid` built here is 8.1mm across, not the 7.8mm real-block body the pocket is sized against.
`partClearance` 0.15 on the block's project fixes that exactly.

### Older project files

`slotChamferMm` postdates the rest of the disc, so a project saved before it has discs with no
value at all. `deserializeProject` runs every disc through `normalizeSlotDisc`, which fills missing
fields with values that PRESERVE the part rather than with what a new disc would get — a chamfer of
0, not the 0.8 default, since a disc designed before mouth chamfers existed shouldn't quietly grow
them on load.

Without that, an absent number reached the UI as `undefined` and turned its input into an
uncontrolled one that stopped accepting edits, while `effectiveChamferMm` returned NaN. The
geometry happened to survive the NaN (`NaN > 0` is false, so the cutters were skipped) which is
exactly why it was invisible from the 3D view.

## The auto ring radius, and the corner trap

`autoRingRadiusStuds` finds the smallest radius at which the pockets still leave `MIN_SLOT_WALL`
between neighbours. The wall is measured at a pocket's **inner corner**, not between pocket
centres, and that distinction is the whole correctness of the part:

A pocket is a rectangle of fixed width, but the space available to it is a wedge that narrows
toward the hub — so the nearer the centre you look, the more of that wedge the rectangle's full
width occupies. The obvious chord-between-centres formula describes the gap only at the ring radius
itself, and happily reports a healthy 2mm wall for discs whose pockets are frankly overlapping
closer in. When they overlap, the spokes are gone and the hub is a loose piece: the model still
renders, it just isn't one connected solid any more, and you find out at the slicer.

`slotWallMm` therefore measures corner-to-bisector distance, and `autoRingRadiusStuds` bisects on it
(no closed form once the measurement moves to the corner). The panel warns when the wall or the hub
is too thin.

## Gate plates

A closed position still counts toward the ring's spacing — it just isn't cut. That's what makes a
two-part dispenser work:

- **Layer 1, the carousel**: every position open, holding a block in each.
- **Layer 2, the gate plate**: the same ring geometry, but only ONE position open.

A block rests on the plate everywhere except where the two line up, so exactly one drops through
per position as the disc turns. With 13 positions that's 12 blocks held and one hole standing ready.

Two things have to hold for the pair to work, and the panel's controls are arranged around them:

1. **Pin the ring radius to Manual on both.** Auto derives the radius from the slot count, size and
   clearance — so giving the gate plate a looser clearance (which you want, since a block has to
   fall through it rather than sit in it) silently moves its ring and the two stop lining up.
2. **Export them separately.** They're layers of one project, so exporting the whole stack fuses
   them into a single solid — which is not a dispenser. Hide one layer with its eye toggle and
   export, then swap. Export leaves hidden layers out for exactly this reason.

## Ring radius vs. rim

Two independent numbers set the layout: `ringRadiusStuds` (where the pockets sit) and `rimMm` (how
much material is outside them). Outer radius is derived from both.

That leaves one obvious move unreachable by either on its own. The disc's overall size is usually
fixed by whatever it has to fit inside — so once the rim has been fitted to a housing, turning the
ring radius up just grows the whole disc again, and the pockets stay proportionally where they
were, crammed near the hub with a wide band of nothing outside them. **Push slots out to the rim**
moves both together: it holds the current outer diameter and takes the ring out until only
`MIN_DISC_RIM` remains.

It's worth doing wherever the disc has room, because the wedge each pocket occupies widens with
radius — the same geometry the auto radius is derived from, run the other way. On a 13-slot disc
fitted to an 11×11 housing:

| | ring radius | rim | outer ⌀ | spoke between pockets |
|---|---|---|---|---|
| rim fitted, pockets at the auto radius | 25.9mm | 9.1mm | 79.2mm | 2.0mm |
| after pushing them out | 33.1mm | 2.0mm | 79.2mm | **5.4mm** |

Same disc, same diameter, spokes nearly three times thicker.

## Running it inside a housing

`fittingHollowRing` gives the smallest hollow `CircleSolid` ring whose bore the disc turns inside,
and `rimForRingFit` gives the `rimMm` that closes the leftover slack to a `DISC_RUNNING_GAP`
running fit (the panel offers this as a button). A ring's bore comes in 8mm steps while a disc's
diameter is whatever its slot geometry works out to, so the two are essentially never a running fit
by default.

**Only odd ring dimensions are suggested**, and that restriction matters: an even-dimension circle
group's true centre falls on a cell *corner*, while a disc is centred on a cell *centre*, so an even
ring can never be concentric with the disc it holds — it sits half a stud out on each axis. The bore
would measure right and the assembly still wouldn't turn.

`GridState.partClearance` applies to the disc's outer rim, the same inward offset it gives a cell's
outer skin — this is a part meant to turn inside another one, so it's exactly what that setting is
for. (Cells honoured it and discs did not, which meant a disc and its housing were both built to the
same nominal size and wouldn't go together.)

## Cells painted under a disc keep their holes

A disc lives alongside the cell grid, not in it, so it's built *after* every cell and unioned into
the same solid. That means its body lands on top of whatever is painted inside its footprint — and
a hole cell's bore, cut into that cell's own box while the cell was built, was simply filled back in
by the disc arriving over it. A ring of Technic holes painted around a disc's hub came out as a
blank slab.

Cell bores are therefore held back and subtracted from the *assembled* body, exactly as a disc's own
bore and pockets already were (`assemblyCutters` in `buildGridGeometry`). The cutter never leaves
its own cell's volume — a `z` bore is exactly the cell's height and stays in its layer, an `x`/`y`
bore is at most one stud and stays in its footprint — so it can only clear material that had
encroached on the cell's own space, which is precisely what needs clearing. Angled beams overlap
cells the same way and are fixed by the same pass.

## Editing

Placed and edited exactly like every other brush: pick **Slot disc**, click a cell to centre it,
and with the Edit tool click that cell (or its outline in the plan) to load it into the pickers,
where every change applies immediately.

Both selection paths run through the same `loadDiscIntoPickers` in the store, and that sharing is
the point: selecting from the OUTLINE originally only set the selected id and never loaded
anything, so the bigger and more obvious of the two targets left every field showing the previously
selected disc's numbers — which reads as the panel simply not updating. `loadBeamIntoPickers` does
the same job for beams, whose overlay had the identical bug. Alt-drag moves it. The 2D overlay draws the rim and every
pocket at its true angle in teal, since the square grid underneath can't show where they land.

## Print fit

The disc's centre bore takes the project's own **Hole clearance**, exactly as a cell's or a beam's
hole does — it is a vertical bore, so it gets the base clearance and not the sideways extra. It used
to be built at bare reference size regardless, which made it the one hole in a model that no print
fit setting could loosen: an axle bore that came out tight with nothing to turn up.

The pockets are separate: their fit is `slotClearance`, a property of the disc, because a block that
has to fall freely through a pocket wants far more room than a connector press-fit does.
