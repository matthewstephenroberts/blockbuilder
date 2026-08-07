import { CellType, HoleAxis } from "./cellTypes";
import { addLayer, createEmptyGrid, GridState, withRect } from "./grid";

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  build: () => GridState;
}

// These reconstruct real Technic parts by name, matched as closely as BlockBuilder's own
// grid/cell model allows. Other Technic modelling tools encode each part as a string of
// individually-oriented unit blocks placed anywhere in free 3D space (including bent/branching
// shapes) — not decoded byte-for-byte here, since BlockBuilder's own model is a flat width x height
// grid of stacked layers: each (x, y) column holds one vertical stack, and each cell carries exactly
// one hole/pin/stud type along exactly one axis. Straight beams, axles, and single- or mixed-hole
// blocks map onto that directly and should be geometrically accurate (including which axis a hole
// bores through and how thin a "x 0.5" beam actually is — both were wrong in an earlier pass here).
//
// Now covered: bent (L-shaped) and T-shaped beams and closed frames, which are flat in plan and so
// DO fit this grid — an earlier note here wrongly lumped them in with the genuinely 3D parts below.
// Bare axles are covered too, via CellType.AxlePiece (see BODY_REPLACING_TYPES): the reference's
// "Axle N" is a row of bare axle blocks, NOT a solid block with a rod attached, which is what an
// earlier pass here built.
//
// Still left out, rather than faked: parts that bend or branch OUT OF THE FLAT LAYER (the Cross
// Block "Bent 90" variants, Half Beam Fork with Ball Joint, Steering Arm, Crankshaft) and small
// sub-module connectors combining two different protrusion types on the two ends of one piece
// shorter than a single cell (Pin with Ball, Axle with Ball, Long Pin with Bushing Attached,
// Beam 1 x 4 x 0.5 with Boss) — one-type-per-cell can't represent either without misrepresenting
// the part. Also left out after checking their real renders: Angle Connector (a true bent elbow of
// two cylindrical arms), Cross Block (one cylinder with two DIFFERENT bores crossing the same
// volume), and Axle to Pin Connector (a rod bored full-length with a shaped axle end cap).

// Real Technic liftarms and connectors are uniformly pill-shaped, not sharp-cornered cubes — every
// builder below sets rounded: true on every cell for that reason.

// Every part below is built at a Technic MODULE height ("module" = 8mm, or "halfModule" = 4mm for
// the thin "x 0.5" liftarms) rather than a System brick's 9.6mm. That's the real height of these
// parts, and it's also what makes their rounded ends come out right: a module-tall cell is square
// in cross-section, so the end cap is flush with the block's own top and bottom faces instead of
// leaving a visible ledge. See units.ts's TECHNIC_MODULE_HEIGHT.
function beam(length: number, holeType: CellType.TechnicHole | CellType.AxleHole = CellType.TechnicHole): GridState {
  let grid = createEmptyGrid(length, 1);
  grid = withRect(grid, 0, 0, length - 1, 0, CellType.Solid, undefined, "module", undefined, true);
  for (let x = 0; x < length; x++) {
    grid = withRect(grid, x, 0, x, 0, holeType, "y", "module", undefined, true);
  }
  return grid;
}

/**
 * A thin ("x 0.5") beam — literally half a module (4mm) tall, and its holes bore straight down
 * through the flat face (axis "z"), not sideways through the edge like a standard full-height
 * beam's holes (axis "y") — a flat washer-like bore, not a side-to-side one. Getting that axis
 * wrong is what previously sliced these open on the side instead of boring through the top.
 * Rounded, matching the real part's pill-shaped ends.
 */
function thinBeam(length: number, axleHolesAtEnds: boolean): GridState {
  let grid = createEmptyGrid(length, 1);
  grid = withRect(grid, 0, 0, length - 1, 0, CellType.Solid, undefined, "halfModule", undefined, true);
  for (let x = 0; x < length; x++) {
    const atEnd = x === 0 || x === length - 1;
    const type = axleHolesAtEnds && atEnd ? CellType.AxleHole : CellType.TechnicHole;
    grid = withRect(grid, x, 0, x, 0, type, "z", "halfModule", undefined, true);
  }
  return grid;
}

function pinEntry(): GridState {
  return withRect(createEmptyGrid(1, 1), 0, 0, 0, 0, CellType.Pin, "z", "module", false, true);
}

/**
 * A standalone axle of `length` modules — a row of BARE axle segments (CellType.AxlePiece), which
 * is exactly what the reference's own "Axle 2"/"Axle 3" are: nothing but `BlockType.Axle` blocks
 * in a line. An earlier version here used CellType.Axle, which is the *attachment* — a solid block
 * with an axle growing out of it — so it built three solid cubes with rods poking out instead of a
 * bare axle. See BODY_REPLACING_TYPES in cellTypes.ts.
 */
function axleEntry(length: number): GridState {
  let grid = createEmptyGrid(1, length);
  for (let y = 0; y < length; y++) {
    grid = withRect(grid, 0, y, 0, y, CellType.AxlePiece, "y", "module", undefined, false);
  }
  return grid;
}

/** Axle of `axleLength` modules with a Technic pin-hole block on the end (part 18651-style). */
function axleWithPinHole(axleLength: number): GridState {
  let grid = createEmptyGrid(1, axleLength + 1);
  for (let y = 0; y < axleLength; y++) {
    grid = withRect(grid, 0, y, 0, y, CellType.AxlePiece, "y", "module", undefined, false);
  }
  grid = withRect(grid, 0, axleLength, 0, axleLength, CellType.TechnicHole, "x", "module", undefined, true);
  return grid;
}

/** A standalone pin of `length` modules — a row of BARE pin segments (CellType.PinPiece). */
function pinPieceEntry(length: number): GridState {
  let grid = createEmptyGrid(1, length);
  for (let y = 0; y < length; y++) {
    grid = withRect(grid, 0, y, 0, y, CellType.PinPiece, "y", "module", undefined, false);
  }
  return grid;
}

/** A round connector with a single axle-shaped bore — "Half Bushing" is the half-module-tall variant. */
function bushing(half: boolean): GridState {
  let grid = createEmptyGrid(1, 1);
  return withRect(grid, 0, 0, 0, 0, CellType.AxleHole, "z", half ? "halfModule" : "module", undefined, true);
}

/** Two Technic holes back to back — links two pins end to end. */
function pinJoiner(): GridState {
  return beam(2, CellType.TechnicHole);
}

/**
 * Cross Block 1 x 3 — checked against a reference render: two Technic holes bored sideways
 * through the width (axis "y", same as a standard beam) on the first two segments, and an axle hole
 * bored vertically through the top (axis "z") on the third — not an axle hole in the middle bored
 * sideways, which an earlier pass here got wrong on both the position and the axis.
 */
function crossBlock1x3(): GridState {
  let grid = createEmptyGrid(3, 1);
  grid = withRect(grid, 0, 0, 2, 0, CellType.Solid, undefined, "module", undefined, true);
  grid = withRect(grid, 0, 0, 0, 0, CellType.TechnicHole, "y" as HoleAxis, "module", undefined, true);
  grid = withRect(grid, 1, 0, 1, 0, CellType.TechnicHole, "y" as HoleAxis, "module", undefined, true);
  grid = withRect(grid, 2, 0, 2, 0, CellType.AxleHole, "z" as HoleAxis, "module", undefined, true);
  return grid;
}

/**
 * Beam 1 x 2 with one axle hole and one pin hole — checked against a reference render: the pin
 * hole is on the LEFT cell, bored horizontally through the side (axis "y", same as a standard
 * beam's holes), and the axle hole is on the RIGHT cell, bored vertically through the top (axis
 * "z") — an earlier pass here had these two cells swapped.
 */
function beamAxlePinMix(): GridState {
  let grid = createEmptyGrid(2, 1);
  grid = withRect(grid, 0, 0, 1, 0, CellType.Solid, undefined, "module", undefined, true);
  grid = withRect(grid, 0, 0, 0, 0, CellType.TechnicHole, "y", "module", undefined, true);
  grid = withRect(grid, 1, 0, 1, 0, CellType.AxleHole, "z", "module", undefined, true);
  return grid;
}


/** A straight run of axle holes — the reference's "Beam 2 x 0.5 with Axle Holes" family at full height. */
function axleHoleBeam(length: number): GridState {
  return beam(length, CellType.AxleHole);
}

/** An L-shaped (bent 90 degrees) beam, arms of `armA` and `armB` modules sharing the corner cell. */
/**
 * An L-shaped (bent 90°) beam. DECODED the actual "Beam 3 x 3 T-Shaped" part (60484 — see tBeam
 * below for the full working) to check the per-arm-sideways axis this function used to use, and
 * it's wrong for any shape that branches in the flat plane: every one of that part's holes bores
 * the SAME way — straight through the flat plate's own thickness — not sideways along whichever
 * arm it happens to sit on. That's the opposite of a beamFrame corner (which genuinely does mix
 * axes on the real part), but consistent across every branching flat part checked: with no single
 * "sideways" direction shared by both arms, the real shape is bored uniformly perpendicular to its
 * own flat plane instead, same as a thin "x 0.5" liftarm.
 */
function bentBeam(armA: number, armB: number): GridState {
  let grid = createEmptyGrid(armA, armB);
  for (let x = 0; x < armA; x++) {
    grid = withRect(grid, x, 0, x, 0, CellType.TechnicHole, "z", "module", undefined, true);
  }
  for (let y = 1; y < armB; y++) {
    grid = withRect(grid, 0, y, 0, y, CellType.TechnicHole, "z", "module", undefined, true);
  }
  return grid;
}

/**
 * Beam 2 x 4 Bent 90 Degrees — DECODED against the real part's own geometry for part 32140. This
 * one isn't a flat L at all: once collapsed (each pair of adjacent small-block records is one
 * logical hole) to just 5 positions, ALL orientation "y" (bored sideways, the ordinary beam
 * convention — no per-arm axis mixing here, unlike a T or an L branching in a single flat layer):
 *
 *   layer 1 (top):    AxleHole · Hole · Hole · Hole      (a 4-long beam)
 *   layer 0 (bottom): ·        · ·    · ·    · Hole      (one cell, under the beam's far end)
 *
 * i.e. the "bend" is a vertical STEP to a second layer at one end, not a turn within one layer —
 * genuinely representable with BlockBuilder's own layer stack, once decoded rather than guessed. An
 * earlier pass here built a flat single-layer L instead and had to be renamed away from this part's
 * name because it didn't match; this is the real shape.
 */
function beamBent90Stepped(): GridState {
  let grid = createEmptyGrid(4, 1);
  grid = withRect(grid, 3, 0, 3, 0, CellType.TechnicHole, "y", "module", undefined, true);
  grid = addLayer(grid);
  grid = withRect(grid, 0, 0, 0, 0, CellType.AxleHole, "y", "module", undefined, true);
  grid = withRect(grid, 1, 0, 3, 0, CellType.TechnicHole, "y", "module", undefined, true);
  return grid;
}

/**
 * A closed rectangular frame (part 64179-style). The hole orientations here are DECODED from the
 * real part's own geometry rather than guessed — `Beam Frame 5 x 7` uses 40 pin-hole blocks
 * across three different orientations, not one per rail:
 *
 *   - all four corners bore vertically, through the frame's flat faces;
 *   - the two rails running along X bore through their own width, like any ordinary beam;
 *   - the two rails running along Y ALTERNATE, vertical / sideways / vertical / ...
 *
 * That alternation is the visible signature of the real part: sight down one long edge and you see
 * four holes on the top face interleaved with three on the side wall. An earlier version here gave
 * every cell in a rail the same axis, which produced a frame with a single uniform row of holes per
 * side and no side-wall holes at all.
 */
function beamFrame(width: number, depth: number): GridState {
  let grid = createEmptyGrid(width, depth);
  for (let y = 0; y < depth; y++) {
    for (let x = 0; x < width; x++) {
      const onXRail = y === 0 || y === depth - 1;
      const onYRail = x === 0 || x === width - 1;
      if (!onXRail && !onYRail) continue; // hollow middle

      let axis: HoleAxis;
      if (onXRail && onYRail) {
        axis = "z"; // corner
      } else if (onXRail) {
        axis = "y";
      } else {
        // Y rail: alternate vertical / sideways down its length.
        axis = y % 2 === 0 ? "z" : "x";
      }
      grid = withRect(grid, x, y, x, y, CellType.TechnicHole, axis, "module", undefined, true);
    }
  }
  return grid;
}

/** A T-shaped beam: a straight run of `stem` with a crossbar of `bar` at one end (part 60484-style). */
/**
 * A T-shaped beam. DECODED against the reference's own "Beam 3 x 3 T-Shaped" string (60484,
 * `17x13bx11ex17x10x12ax15bx133x111x13x1`): parsing each block's position (`Vector3.fromNumber`'s
 * tetrahedral/triangular-number inverse) and orientation gives 10 blocks, all orientation "x", at
 * positions that reduce (after collapsing each block's own paired small-block records) to exactly
 * this footprint in the reference's Y-Z plane:
 *
 *     X..
 *     XXX
 *     X..
 *
 * — a vertical stem with a horizontal crossbar, i.e. the same T this function builds — with every
 * hole bored the SAME way (perpendicular to the flat plate), not sideways along whichever arm a
 * cell happens to sit on. An earlier version here bored the bar sideways along its row and the
 * stem sideways along its column, which was a guess, not a decode, and wrong.
 */
function tBeam(bar: number, stem: number): GridState {
  let grid = createEmptyGrid(bar, stem);
  const mid = Math.floor(bar / 2);
  for (let x = 0; x < bar; x++) {
    grid = withRect(grid, x, 0, x, 0, CellType.TechnicHole, "z", "module", undefined, true);
  }
  for (let y = 1; y < stem; y++) {
    grid = withRect(grid, mid, y, mid, y, CellType.TechnicHole, "z", "module", undefined, true);
  }
  return grid;
}

export const CATALOG: CatalogEntry[] = [
  { id: "beam-2", name: "Beam 2", description: "Two Technic holes in a row.", build: () => beam(2) },
  { id: "beam-3", name: "Beam 3", description: "Three Technic holes in a row.", build: () => beam(3) },
  { id: "beam-5", name: "Beam 5", description: "Five Technic holes in a row.", build: () => beam(5) },
  { id: "beam-7", name: "Beam 7", description: "Seven Technic holes in a row.", build: () => beam(7) },
  {
    id: "beam-1x2-axle-pin",
    name: "Beam 1 x 2 with Axle Hole and Pin Hole",
    description: "Two-long beam, one axle hole and one Technic hole.",
    build: beamAxlePinMix,
  },
  {
    id: "beam-2-half-axle",
    name: "Beam 2 x 0.5 with Axle Holes",
    description: "Thin 2-long beam, axle hole at each end, bored through the flat face.",
    build: () => thinBeam(2, true),
  },
  {
    id: "beam-3-half-axle",
    name: "Beam 3 x 0.5 with Axle Hole each end",
    description: "Thin 3-long beam, axle hole at each end, pin hole in the middle.",
    build: () => thinBeam(3, true),
  },
  {
    id: "beam-4-half-axle",
    name: "Beam 4 x 0.5 with Axle Hole each end",
    description: "Thin 4-long beam, axle hole at each end.",
    build: () => thinBeam(4, true),
  },
  {
    id: "beam-5-half-axle",
    name: "Beam 5 x 0.5 with Axle Holes each end",
    description: "Thin 5-long beam, axle hole at each end.",
    build: () => thinBeam(5, true),
  },
  {
    id: "beam-5-half",
    name: "Beam 5 x 0.5",
    description: "Thin 5-long beam, Technic holes throughout.",
    build: () => thinBeam(5, false),
  },
  { id: "axle-2", name: "Axle 2", description: "Two stacked axle segments.", build: () => axleEntry(2) },
  { id: "axle-3", name: "Axle 3", description: "Three stacked axle segments.", build: () => axleEntry(3) },
  { id: "bushing", name: "Bushing", description: "Round connector with an axle-shaped bore.", build: () => bushing(false) },
  { id: "half-bushing", name: "Half Bushing", description: "Shorter bushing, axle-shaped bore.", build: () => bushing(true) },
  { id: "pin", name: "Pin", description: "A single protruding Technic pin.", build: pinEntry },
  { id: "pin-joiner", name: "Pin Joiner", description: "Two Technic holes back to back.", build: pinJoiner },
  {
    id: "beam-2-axle-holes",
    name: "Beam 2 with Axle Holes",
    description: "Two axle holes in a row.",
    build: () => axleHoleBeam(2),
  },
  {
    id: "beam-3-axle-holes",
    name: "Beam 3 with Axle Holes",
    description: "Three axle holes in a row.",
    build: () => axleHoleBeam(3),
  },
  { id: "pin-piece-2", name: "Pin 2 (bare)", description: "Two bare pin segments in a row — a standalone 2-module pin shaft.", build: () => pinPieceEntry(2) },
  { id: "axle-4", name: "Axle 4", description: "Four bare axle segments in a row.", build: () => axleEntry(4) },
  { id: "axle-5", name: "Axle 5", description: "Five bare axle segments in a row.", build: () => axleEntry(5) },
  {
    id: "axle-2-with-pin-hole",
    name: "Axle 2 with Pin Hole",
    description: "A 2-module bare axle ending in a Technic pin-hole block.",
    build: () => axleWithPinHole(2),
  },
  {
    // Not named after a specific reference part — "Beam 3 x 3 Bent 90" was never a real catalog
    // entry (fabricated in an earlier pass here). A flat, single-layer, generic L, built with the
    // decode-confirmed uniform bore axis (see bentBeam's own doc).
    id: "beam-l-3x3",
    name: "Beam L-Shape 3 x 3",
    description: "L-shaped beam, three holes on each arm, bored straight through the flat plate.",
    build: () => bentBeam(3, 3),
  },
  {
    id: "beam-bent-90-4x2",
    name: "Beam 2 x 4 Bent 90",
    description: "L-shaped beam using two stacked layers — a 4-long beam with one hole stepping down to a second layer at its far end.",
    build: beamBent90Stepped,
  },
  {
    id: "beam-t-3x3",
    name: "Beam 3 x 3 T-Shaped",
    description: "T-shaped beam — a three-hole crossbar with a three-hole stem.",
    build: () => tBeam(3, 3),
  },
  {
    id: "beam-frame-5x7",
    name: "Beam Frame 5 x 7",
    description: "Closed rectangular frame of Technic holes with a hollow middle.",
    build: () => beamFrame(5, 7),
  },
  {
    id: "beam-frame-3x5",
    name: "Beam Frame 3 x 5",
    description: "Smaller closed rectangular frame with a hollow middle.",
    build: () => beamFrame(3, 5),
  },
  {
    id: "cross-block-1x3",
    name: "Cross Block 1 x 3",
    description: "Two Technic holes through the side, axle hole through the top at one end.",
    build: crossBlock1x3,
  },
];
