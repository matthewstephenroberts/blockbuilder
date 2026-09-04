import * as THREE from "three";
import { buildAngledBeamGeometry, buildBeamJoinBlend } from "./angledBeamGeometry";
import { beamEndsMeetingBeams } from "./angledBeam";
import { buildSlotDiscGeometry } from "./slotDiscGeometry";
import { buildBallPinGeometry } from "./ballPin";
import { buildCircleSolidGeometry, CIRCLE_CUT_OVERHANG, CIRCLE_SEGMENTS } from "./circleSolidGeometry";
import { AXIS_AWARE_TYPES, BLEND_AWARE_TYPES, BODY_REPLACING_TYPES, CellType, HOLE_TYPES, HoleAxis, PlateFraction } from "./cellTypes";
import { intersect, intersectCylinderZ, subtract, subtractCylinderZ, unionAll } from "./csg";
import { CircleRing, ringColRow } from "./circleRing";
import { Cell, GridState, circleRingOf, inBounds, indexOf, Layer } from "./grid";
import { buildPinGeometry } from "./pin";
import {
  axleHoleGeometry,
  axleRodGeometry,
  ballJointGeometry,
  ballSocketForkKeeperGeometry,
  boxGeometry,
  pinHoleGeometry,
  studConnectorGeometry,
  studHoleGeometry,
} from "./primitives";
import { applyRounding, cellCapCylinder, CornerSafety, roundCellCorners } from "./rounding";
import {
  CELL_OVERLAP,
  PIN_COLLAR_RADIUS_REDUCED,
  PIN_HOLE_BOSS_RADIUS,
  PLATE_HEIGHT,
  STUD_HEIGHT,
  STUD_OVERLAP,
  STUD_PITCH,
  TECHNIC_HALF_MODULE_HEIGHT,
  TECHNIC_MODULE_HEIGHT,
} from "./units";

// A safety margin (mm) kept between a corner's rounding cut and a nearby hole's own boss
// boundary, on top of the geometric clearance computed in buildGridGeometry.
const CORNER_HOLE_MARGIN = 0.5;

// How far blendCornerToNeighbors' notch overshoots past a cell's own true outer edge, so its
// outer face genuinely passes through material instead of landing exactly coincident with it.
const CORNER_NOTCH_OVERSHOOT = 1;

// An embedded connector (Pin, BallPin, or a painted Stud) is built with most of its length
// inside the block (a genuine overlap, safe to merge without CSG) and the rest protruding
// outward to actually plug into another part.
const PIN_EMBED_LENGTH = STUD_PITCH / 2;
const PIN_PROTRUDE_LENGTH = STUD_PITCH;

// "Full" (or an unset plateFraction, e.g. an older saved project) means one standard brick —
// a fixed 3 plates — now that there's no separate grid-wide "layer height" setting for it to refer
// to instead. Every layer's own stacking height is derived from its own cells (see
// `computeLayerHeights`), not from a shared default any more.
const FULL_HEIGHT_PLATES = 3;

/** The fixed-height plate fractions' own mm value, or undefined for "minimal" (which has no fixed
 * value — it's computed relative to whatever the rest of its layer resolves to; see `plateHeight`). */
export function fixedPlateHeight(fraction: PlateFraction | undefined): number | undefined {
  switch (fraction) {
    case "module":
      return TECHNIC_MODULE_HEIGHT;
    case "halfModule":
      return TECHNIC_HALF_MODULE_HEIGHT;
    case "1":
      return PLATE_HEIGHT;
    case "2":
      return PLATE_HEIGHT * 2;
    case "3":
      return PLATE_HEIGHT * 3;
    case "minimal":
      return undefined;
    case "full":
    default:
      return PLATE_HEIGHT * FULL_HEIGHT_PLATES;
  }
}

/**
 * Any cell's actual height. `referenceHeight` is only used to resolve "minimal" — as short as
 * possible while staying clear of a full-height neighbour's pin/axle hole, which is bored through
 * the centre of that neighbour's own cell — so it must end below (referenceHeight/2 - boss
 * radius). Never goes below a small printable floor.
 */
function plateHeight(fraction: PlateFraction | undefined, referenceHeight: number): number {
  return fixedPlateHeight(fraction) ?? Math.max(0.8, referenceHeight / 2 - PIN_HOLE_BOSS_RADIUS);
}

/**
 * Each layer's own stacking height — the tallest of its own cells, since there's no longer a
 * shared "layer height" setting every cell answers to. A layer made up only of "minimal" cells
 * (no fixed-height cell to be minimal *relative to*) falls back to one standard brick as the
 * reference those cells clear under. Exported so ExportPanel can total up the part's real height
 * for its summary line without duplicating this logic.
 */
export function computeLayerHeights(grid: GridState): number[] {
  return grid.layers.map((layer, li) => {
    // An angled beam occupies its layer exactly as a cell does, so it counts toward that layer's
    // height too — otherwise a layer holding only beams would fall back to a default height that
    // has nothing to do with the beams actually in it, and every layer above would sit at the
    // wrong Z.
    const beams = (grid.beams ?? []).filter((b) => b.layer === li && b.holes >= 1);
    const discs = (grid.discs ?? []).filter((d) => d.layer === li);

    let reference = 0;
    for (const cell of layer) {
      if (cell.type === CellType.Empty) continue;
      const fixed = fixedPlateHeight(cell.plateFraction);
      if (fixed !== undefined) reference = Math.max(reference, fixed);
    }
    for (const item of [...beams, ...discs]) {
      const fixed = fixedPlateHeight(item.plateFraction ?? "module");
      if (fixed !== undefined) reference = Math.max(reference, fixed);
    }
    if (reference === 0) reference = PLATE_HEIGHT * FULL_HEIGHT_PLATES;

    let maxHeight = 0;
    for (const cell of layer) {
      if (cell.type === CellType.Empty) continue;
      maxHeight = Math.max(maxHeight, plateHeight(cell.plateFraction, reference));
    }
    for (const item of [...beams, ...discs]) {
      maxHeight = Math.max(maxHeight, plateHeight(item.plateFraction ?? "module", reference));
    }
    return maxHeight || PLATE_HEIGHT * FULL_HEIGHT_PLATES;
  });
}

/**
 * True when a cell at (cx, cy) shares its (dx, dy) edge with a CircleSolid neighbour whose own ring
 * material has been cut away right at that shared edge — i.e. the two would NOT actually touch once
 * the neighbour's circle cuts are applied, even though the grid says they're adjacent.
 *
 * BOTH of the ring's cuts can do it, and a cell can be left facing air by either:
 *
 *  - the hollow BORE, when the cell sits near the group's centre: the ring keeps material only
 *    outside its inner radius, so a cell close to the middle faces the void.
 *  - the OUTER ARC, when the cell butts into the ring's rim from outside and the ring is round:
 *    the ring keeps material only INSIDE its outer radius, so between the arc and the cell's square
 *    edge there is nothing. An arm running into a round-outer ring meets exactly this — the grid
 *    calls the ring cell occupied, so the join looks made, and the material stops short of it.
 *
 * Tests the shared edge SEGMENT rather than the neighbour cell's centre: the closest point of it to
 * the group centre against the bore, the farthest against the arc. A corner of the edge can cross
 * either radius while the cell's own centre stays clear — a ring cell near the group's diagonal is
 * exactly that case — so checking only the centre point misses real gaps.
 */
function circleCellGap(
  grid: GridState,
  layer: Layer,
  nx: number,
  ny: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  if (!inBounds(grid, nx, ny)) return false;
  const neighbor = layer[indexOf(grid, nx, ny)];
  const ring = circleRingOf(grid, neighbor);
  if (!ring) return false;

  const { dimension } = ring;
  const slice = ringColRow(ring, nx, ny);
  if (!slice) return false;
  const centerIndex = (dimension - 1) / 2;
  const neighborCx = (nx - (grid.width - 1) / 2) * STUD_PITCH;
  const neighborCy = (ny - (grid.height - 1) / 2) * STUD_PITCH;
  const groupCenterX = neighborCx - (slice.col - centerIndex) * STUD_PITCH;
  const groupCenterY = neighborCy - (centerIndex - slice.row) * STUD_PITCH;
  // Small safety margins (well past RADIUS_EPSILON's own tiny nudge) so only a genuine, visually
  // meaningful gap triggers a bridge — not a hairline sliver that's already connected.
  const innerRadius = ring.hollow ? Math.max(0, ((dimension - 1) / 2) * STUD_PITCH - 0.5) : 0;
  const outerRadius = ring.outerSquare ? Infinity : (dimension / 2) * STUD_PITCH + 0.5;

  const half = STUD_PITCH / 2;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const at = (px: number, py: number) => Math.hypot(px - groupCenterX, py - groupCenterY);
  let closestDist: number;
  let farthestDist: number;
  if (dx !== 0) {
    const edgeX = cx + dx * half;
    closestDist = at(edgeX, clamp(groupCenterY, cy - half, cy + half));
    farthestDist = Math.max(at(edgeX, cy - half), at(edgeX, cy + half));
  } else {
    const edgeY = cy + dy * half;
    closestDist = at(clamp(groupCenterX, cx - half, cx + half), edgeY);
    farthestDist = Math.max(at(cx - half, edgeY), at(cx + half, edgeY));
  }
  // Inside the bore, or outside the arc: either way the ring has no material at this face.
  return closestDist < innerRadius || farthestDist > outerRadius;
}

/**
 * Walks outward from a cell along (dx, dy), one grid step at a time, collecting a translated
 * clone of `box` for every consecutive CircleSolid ring cell whose shared edge with the previous
 * step still has no ring material behind it (see circleCellGap) — i.e. every
 * cell along the way that would otherwise face empty air instead of real material. Stops as soon
 * as it reaches a step that ISN'T a gapped ring cell: either genuine ring wall material (outside
 * the hollow radius, where the two pieces already touch on their own) or a non-ring/non-adjacent
 * cell, so the walk never overshoots into unrelated geometry.
 *
 * A single-step bridge (the original version of this feature) only ever reconnected as far as the
 * IMMEDIATE neighbour — for a ring wide enough that its hollow radius spans more than one cell
 * (dimension 5 and up), that neighbour is itself still deep inside the void, so the join fell
 * short of ever reaching real ring wall. Walking cell-by-cell until the gap genuinely ends is what
 * makes the join actually land on solid material rather than stopping partway across the bore.
 */
/**
 * True when a ring cell's own square holds any of the ring's material at all — its band crosses the
 * square somewhere.
 *
 * This is what ENDS a bridge walk. The gap test either side of it looks at the shared EDGE, and on a
 * ring whose band is narrower than a cell (a 13x13 ring's is 4mm against an 8mm cell) no edge need
 * ever land inside the band: each one is either outside the arc or inside the bore. Walking on "the
 * edge has no material" alone therefore chains straight through — out of the arc, into the bore, and
 * on across the hole to the far wall, which is a bar through the middle of the ring rather than a
 * join to it.
 *
 * Filling a cell that HOLDS material already overlaps that material, so the two are one solid and
 * the walk is done: stop there whatever the far edge says.
 */
function ringCellHasMaterial(grid: GridState, layer: Layer, nx: number, ny: number): boolean {
  if (!inBounds(grid, nx, ny)) return false;
  const cell = layer[indexOf(grid, nx, ny)];
  const ring = circleRingOf(grid, cell);
  if (!ring) return false;
  const slice = ringColRow(ring, nx, ny);
  if (!slice) return false;
  const { dimension } = ring;
  const centerIndex = (dimension - 1) / 2;
  const cellCx = (nx - (grid.width - 1) / 2) * STUD_PITCH;
  const cellCy = (ny - (grid.height - 1) / 2) * STUD_PITCH;
  const groupCenterX = cellCx - (slice.col - centerIndex) * STUD_PITCH;
  const groupCenterY = cellCy - (centerIndex - slice.row) * STUD_PITCH;
  const half = STUD_PITCH / 2;
  const dxAbs = Math.abs(cellCx - groupCenterX);
  const dyAbs = Math.abs(cellCy - groupCenterY);
  const near = Math.hypot(Math.max(0, dxAbs - half), Math.max(0, dyAbs - half));
  const far = Math.hypot(dxAbs + half, dyAbs + half);
  const innerRadius = ring.hollow ? ((dimension - 1) / 2) * STUD_PITCH : 0;
  const outerRadius = ring.outerSquare ? Infinity : (dimension / 2) * STUD_PITCH;
  return near < outerRadius && far > innerRadius;
}

async function collectJoinBridges(
  grid: GridState,
  layer: Layer,
  x: number,
  y: number,
  cx: number,
  cy: number,
  cz: number,
  height: number,
  dx: number,
  dy: number,
  box: THREE.BufferGeometry,
): Promise<THREE.BufferGeometry[]> {
  const bridges: THREE.BufferGeometry[] = [];
  /** The ring being bridged to, taken from the first gapped cell — they are all the same ring. */
  let bridged: CircleRing | null = null;
  let stepCx = cx;
  let stepCy = cy;
  let nx = x + dx;
  let ny = y + dy;
  let steps = 0;
  const maxSteps = grid.width + grid.height;
  while (steps < maxSteps && circleCellGap(grid, layer, nx, ny, stepCx, stepCy, dx, dy)) {
    bridged = bridged ?? circleRingOf(grid, layer[indexOf(grid, nx, ny)]);
    const bridge = box.clone();
    bridge.translate((nx - x) * STUD_PITCH, (ny - y) * STUD_PITCH, 0);
    bridges.push(bridge);
    // Reached the wall: this bridge overlaps real ring material, so the join is made and going on
    // would only push a bar deeper into the ring.
    if (ringCellHasMaterial(grid, layer, nx, ny)) break;
    stepCx += dx * STUD_PITCH;
    stepCy += dy * STUD_PITCH;
    nx += dx;
    ny += dy;
    steps++;
  }
  if (bridges.length === 0 || !bridged) return bridges;

  // A bridge fills whole CELLS, and a cell at the rim straddles the ring's wall: filling its square
  // reaches past the wall and into the void on the far side — 2.5mm into the bore on a 13x13 ring,
  // which reads as the join spilling into the hole. So each bridge is clipped to the void it
  // started in: it may cross the gap up to the ring's material, never through it and out the other
  // side.
  const slice = ringColRow(bridged, x + dx, y + dy);
  if (!slice) return bridges;
  const { dimension } = bridged;
  const centerIndex = (dimension - 1) / 2;
  const firstCx = (x + dx - (grid.width - 1) / 2) * STUD_PITCH;
  const firstCy = (y + dy - (grid.height - 1) / 2) * STUD_PITCH;
  const groupCenterX = firstCx - (slice.col - centerIndex) * STUD_PITCH;
  const groupCenterY = firstCy - (centerIndex - slice.row) * STUD_PITCH;
  const innerRadius = bridged.hollow ? ((dimension - 1) / 2) * STUD_PITCH : 0;
  const outerRadius = bridged.outerSquare ? Infinity : (dimension / 2) * STUD_PITCH;
  // Which void the SOURCE cell sits in decides which way the clip runs.
  const sourceR = Math.hypot(cx - groupCenterX, cy - groupCenterY);
  const tall = height + CIRCLE_CUT_OVERHANG * 2;
  const clipped: THREE.BufferGeometry[] = [];
  for (const bridge of bridges) {
    let piece = bridge;
    if (sourceR > outerRadius && innerRadius > 0) {
      // Came from outside the rim: keep it out of the bore.
      piece = await subtractCylinderZ(piece, innerRadius, tall, groupCenterX, groupCenterY, cz, CIRCLE_SEGMENTS);
    } else if (sourceR < innerRadius && Number.isFinite(outerRadius)) {
      // Came from inside the bore: keep it inside the rim.
      piece = await intersectCylinderZ(piece, outerRadius, tall, groupCenterX, groupCenterY, cz, CIRCLE_SEGMENTS);
    }
    if ((piece.attributes.position?.count ?? 0) > 0) clipped.push(piece);
  }
  return clipped;
}

/**
 * How far a cell's own box (see the main loop's `axisSpan`/`widthOffset`) has been narrowed in
 * from a full stud on each face along `axisLetter` — 0 on a face that's unnarrowed (either because
 * the cell isn't narrowed at all, is narrowed along the OTHER axis, or that particular face is the
 * one `widthOffset` deliberately keeps flush; see the main loop's own doc on which face that is).
 * Used by `blendCornerToNeighbors` to find out how much an un-narrowed corner cell should recede
 * to match a narrowed neighbour it doesn't share an axis with.
 */
function axisFaceInsets(cell: Cell, axisLetter: "x" | "y"): { minInset: number; maxInset: number } {
  if (cell.axis !== axisLetter || !cell.widthFraction) return { minInset: 0, maxInset: 0 };
  const axisSpan = Math.min(STUD_PITCH, fixedPlateHeight(cell.widthFraction) ?? STUD_PITCH);
  if (axisSpan >= STUD_PITCH) return { minInset: 0, maxInset: 0 };
  const widthSign = (cell.flip ?? false) ? -1 : 1;
  const widthOffset = (widthSign * (axisSpan - STUD_PITCH)) / 2;
  const half = STUD_PITCH / 2;
  const minFace = widthOffset - axisSpan / 2;
  const maxFace = widthOffset + axisSpan / 2;
  return { minInset: Math.max(0, minFace + half), maxInset: Math.max(0, half - maxFace) };
}

/**
 * Clips `piece`'s own (sx, sy) inner corner back to match its two orthogonal neighbours' own
 * widthFraction narrowing, when the user has explicitly opted that ONE corner in
 * (Cell.cornerBlendXPosYPos etc — see their own doc for why this is opt-in). Built for a plain
 * un-narrowed "frame corner" cell sitting diagonally next to two narrowed "frame edge" cells (a
 * picture-frame layout narrowed to enlarge its own centre hollow, see grid.ts's own doc): without
 * this, the corner cell keeps presenting its full, un-narrowed corner into that hollow even though
 * the edges around it have pulled back, leaving a pinwheel-shaped notch instead of one clean
 * enlarged opening.
 *
 * The neighbour at (x + sx, y) supplies the Y-axis inset (it's expected to be narrowed along Y,
 * i.e. it sits beside this cell but recedes toward/away from it vertically), and the neighbour at
 * (x, y + sy) supplies the X-axis inset, matching how a real picture-frame's edge pieces are laid
 * out (a horizontal-running edge narrows vertically, a vertical-running edge narrows
 * horizontally). Only ever cuts a genuine rectangular notch sized by BOTH insets together — if
 * either neighbour isn't actually narrowed on the relevant axis, there's nothing to match and this
 * is a no-op, rather than slicing a full straight cut through the whole cell on just one axis.
 */
async function blendCornerToNeighbors(
  grid: GridState,
  layer: Layer,
  cellHeight: number,
  cz: number,
  cx: number,
  cy: number,
  x: number,
  y: number,
  sx: 1 | -1,
  sy: 1 | -1,
  piece: THREE.BufferGeometry,
): Promise<THREE.BufferGeometry> {
  const yNeighbor = inBounds(grid, x + sx, y) ? layer[indexOf(grid, x + sx, y)] : undefined;
  const xNeighbor = inBounds(grid, x, y + sy) ? layer[indexOf(grid, x, y + sy)] : undefined;
  const yInsets = yNeighbor ? axisFaceInsets(yNeighbor, "y") : { minInset: 0, maxInset: 0 };
  const xInsets = xNeighbor ? axisFaceInsets(xNeighbor, "x") : { minInset: 0, maxInset: 0 };
  const yInset = sy > 0 ? yInsets.maxInset : yInsets.minInset;
  const xInset = sx > 0 ? xInsets.maxInset : xInsets.minInset;
  if (xInset <= 0 || yInset <= 0) return piece;

  // Overshoots past this cell's own true outer edge by CORNER_NOTCH_OVERSHOOT so the notch's
  // outer face genuinely passes through material instead of landing exactly coincident with the
  // cell's own face — the same known manifold-3d degenerate case RADIUS_EPSILON exists for
  // elsewhere in this codebase (an exact tangent/coincident plane can silently no-op a boolean
  // instead of producing the expected cut). The INNER face (the real cut line, at half - inset)
  // doesn't need this: it's a genuinely new boundary, not coincident with any existing face.
  const half = STUD_PITCH / 2;
  const notchWidth = xInset + CORNER_NOTCH_OVERSHOOT;
  const notchDepth = yInset + CORNER_NOTCH_OVERSHOOT;
  const notch = new THREE.BoxGeometry(notchWidth, notchDepth, cellHeight * 4);
  notch.translate(
    cx + sx * (half - xInset + notchWidth / 2),
    cy + sy * (half - yInset + notchDepth / 2),
    cz,
  );
  return subtract(piece, notch);
}

/** Which of a cell's 6 faces are genuinely exterior (open to outside air, not shared with another
 * occupied cell) — see GridState.partClearance's own doc for why this matters: only these faces
 * get inset, so internal joints between a part's own cells stay exactly as robustly overlapped as
 * before, and only the part's true outer skin shrinks. */
interface ExteriorFaces {
  xMin: boolean;
  xMax: boolean;
  yMin: boolean;
  yMax: boolean;
  zMin: boolean;
  zMax: boolean;
}

function cellExteriorFaces(
  layer: Layer,
  width: number,
  height: number,
  x: number,
  y: number,
  isBottomLayer: boolean,
  isTopLayer: boolean,
): ExteriorFaces {
  const occupied = (cx: number, cy: number) =>
    inBounds({ width, height }, cx, cy) && layer[indexOf({ width }, cx, cy)].type !== CellType.Empty;
  return {
    xMin: !occupied(x - 1, y),
    xMax: !occupied(x + 1, y),
    yMin: !occupied(x, y - 1),
    yMax: !occupied(x, y + 1),
    // Only the very top of the topmost layer and very bottom of the bottommost one — a shorter
    // cell mid-stack (e.g. a "1 plate" cell under a taller neighbour) has an exposed top too, but
    // that's an existing height-variation feature, not the part's own outer envelope; this only
    // targets the true top/bottom faces a mating pocket's own floor/ceiling would touch.
    zMin: isBottomLayer,
    zMax: isTopLayer,
  };
}

/**
 * Cutters that chamfer a cell's genuinely EXTERIOR edges by `chamfer` mm — a 45° flat where two
 * exterior faces meet.
 *
 * Only exterior edges, for the same reason `rounded` only rounds exterior corners: an edge shared
 * with a neighbouring occupied cell isn't an edge of the finished part at all, and cutting it would
 * open a groove down the middle of a joint that's supposed to be solid.
 *
 * Each cutter is a box turned 45° about the edge it's cutting, positioned so its near face lies on
 * the chamfer plane — the plane through the two points the corner is pulled back to. `SPAN` just
 * has to be comfortably bigger than the chamfer so the cutter reaches past the material.
 */
function chamferCutters(
  cx: number,
  cy: number,
  cz: number,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  chamfer: number,
  ext: ExteriorFaces,
): THREE.BufferGeometry[] {
  const SPAN = chamfer * 6 + 4;
  const hx = sizeX / 2;
  const hy = sizeY / 2;
  const hz = sizeZ / 2;
  const cutters: THREE.BufferGeometry[] = [];

  // Distance from the edge's own corner line out to the rotated cutter's centre, such that its
  // near face passes through the chamfer plane.
  const offset = (a: number, b: number) => (a + b - chamfer) / Math.SQRT2 + SPAN / 2;

  // The four vertical edges — the ones that matter for a block dropping into a square pocket.
  for (const [sx, sy, xFace, yFace] of [
    [1, 1, ext.xMax, ext.yMax],
    [1, -1, ext.xMax, ext.yMin],
    [-1, 1, ext.xMin, ext.yMax],
    [-1, -1, ext.xMin, ext.yMin],
  ] as const) {
    if (!xFace || !yFace) continue;
    const cutter = new THREE.BoxGeometry(SPAN, SPAN, sizeZ + SPAN);
    cutter.rotateZ(Math.PI / 4);
    const d = offset(hx, hy) / Math.SQRT2; // back onto the X/Y axes from the diagonal
    cutter.translate(cx + sx * d, cy + sy * d, cz);
    cutters.push(cutter);
  }

  // The horizontal edges, top and bottom — the leading edge as a block enters a pocket.
  for (const [sz, zFace] of [
    [1, ext.zMax],
    [-1, ext.zMin],
  ] as const) {
    if (!zFace) continue;
    for (const [sx, xFace] of [
      [1, ext.xMax],
      [-1, ext.xMin],
    ] as const) {
      if (!xFace) continue;
      const cutter = new THREE.BoxGeometry(SPAN, sizeY + SPAN, SPAN);
      cutter.rotateY(Math.PI / 4);
      const d = offset(hx, hz) / Math.SQRT2;
      cutter.translate(cx + sx * d, cy, cz + sz * d);
      cutters.push(cutter);
    }
    for (const [sy, yFace] of [
      [1, ext.yMax],
      [-1, ext.yMin],
    ] as const) {
      if (!yFace) continue;
      const cutter = new THREE.BoxGeometry(sizeX + SPAN, SPAN, SPAN);
      cutter.rotateX(Math.PI / 4);
      const d = offset(hy, hz) / Math.SQRT2;
      cutter.translate(cx, cy + sy * d, cz + sz * d);
      cutters.push(cutter);
    }
  }

  return cutters;
}

/**
 * A cell's own box, inset by `clearance` on whichever faces `ext` marks as genuinely exterior —
 * used instead of the plain cached `boxGeometry` whenever GridState.partClearance is non-zero.
 * Built from explicit per-axis min/max rather than a symmetric box, since which faces (if any)
 * need insetting varies per cell.
 */
function insetCellBox(cx: number, cy: number, cz: number, cellHeight: number, ext: ExteriorFaces, clearance: number): THREE.BufferGeometry {
  const halfXY = STUD_PITCH / 2 + CELL_OVERLAP / 2;
  const xLo = -halfXY + (ext.xMin ? clearance : 0);
  const xHi = halfXY - (ext.xMax ? clearance : 0);
  const yLo = -halfXY + (ext.yMin ? clearance : 0);
  const yHi = halfXY - (ext.yMax ? clearance : 0);
  const zLo = -cellHeight / 2 + (ext.zMin ? clearance : 0);
  const zHi = cellHeight / 2 - (ext.zMax ? clearance : 0);
  const geom = new THREE.BoxGeometry(xHi - xLo, yHi - yLo, zHi - zLo);
  geom.translate(cx + (xHi + xLo) / 2, cy + (yHi + yLo) / 2, cz + (zHi + zLo) / 2);
  return geom;
}

/**
 * Which of a cell's 4 corners, IN THE CROSS-SECTION PERPENDICULAR TO THE ROUNDING AXIS, are
 * genuinely exterior — both cells adjacent to that corner along the cross-section's two in-plane
 * directions are empty/absent. Rounding a corner shared with an occupied neighbour would cut into
 * the middle of what should be a flat, flush wall between the two blocks, so those are left alone —
 * only a corner sticking out into open space on both adjacent sides gets softened.
 *
 * The rounding axis matters, not just cosmetically: a real Technic beam's rounded end is a "D"
 * shape in the SAME view its holes read as circles — i.e. the round cap is concentric with
 * whatever bore passes through that cell, not always vertical. A standard beam's holes bore
 * sideways (axis "y"), so its end cap rounds in the X-Z cross-section — the cap's own cylinder is
 * oriented along the block's own bore axis rather than a fixed world axis. A Bushing's hole bores
 * vertically (axis "z"), so ITS round exterior is the classic upright tube. Always rounding the
 * X-Y footprint regardless of bore direction (as an earlier version did) puts the curve on the
 * wrong two faces for every standard beam.
 *
 * For axis "z", the cross-section is the familiar X-Y footprint and "exterior" means no in-layer
 * neighbour on that side. For axis "y" or "x", the cross-section includes Z, and "exterior" along
 * Z means no neighbouring LAYER at this same (x, y) — stacking is the only adjacency between
 * layers, so a single-layer part (the common case) is always Z-exterior on both faces.
 */
function exteriorCorners(
  grid: Pick<GridState, "width" | "height" | "layers">,
  layerIndex: number,
  x: number,
  y: number,
  axis: HoleAxis,
): { s1: 1 | -1; s2: 1 | -1 }[] {
  const { width, height, layers } = grid;
  const layer = layers[layerIndex];
  const inLayerOccupied = (cx: number, cy: number) =>
    inBounds({ width, height }, cx, cy) && layer[indexOf({ width }, cx, cy)].type !== CellType.Empty;
  const adjacentLayerOccupied = (otherLayerIndex: number) =>
    otherLayerIndex >= 0 &&
    otherLayerIndex < layers.length &&
    layers[otherLayerIndex][indexOf({ width }, x, y)].type !== CellType.Empty;
  // An occupied neighbour normally blocks rounding, because the wall shared with it has to stay
  // flat for the two to sit flush. A PERPENDICULAR ROUNDED neighbour is the exception (see
  // perpendicularRoundedNeighbor): its own cap curves across that shared face, so there's no flat
  // wall there to protect, and rounding this side too is what turns the pair into one continuous
  // elbow rather than a round cap emerging from a square face.
  const inLayerClear = (cx: number, cy: number, dir: "x" | "y") =>
    !inLayerOccupied(cx, cy) || perpendicularRoundedNeighbor(grid, layerIndex, cx, cy, dir, axis) !== null;

  const corners: { s1: 1 | -1; s2: 1 | -1 }[] = [];
  if (axis === "z") {
    for (const sx of [1, -1] as const) {
      for (const sy of [1, -1] as const) {
        if (inLayerClear(x + sx, y, "x") && inLayerClear(x, y + sy, "y")) corners.push({ s1: sx, s2: sy });
      }
    }
    return corners;
  }
  // "y" -> cross-section is X-Z; "x" -> cross-section is Y-Z. Either way s1 is the in-layer
  // direction (X or Y) and s2 is the layer (Z) direction.
  const inLayerNeighborClear = (s1: 1 | -1) =>
    axis === "y" ? inLayerClear(x + s1, y, "x") : inLayerClear(x, y + s1, "y");
  for (const s1 of [1, -1] as const) {
    for (const s2 of [1, -1] as const) {
      if (inLayerNeighborClear(s1) && !adjacentLayerOccupied(layerIndex + s2)) corners.push({ s1, s2 });
    }
  }
  return corners;
}

/** A cell's own rounding axis — connectors/holes round about their own bore, everything else vertically. */
function roundingAxisOf(cell: Cell): HoleAxis {
  return AXIS_AWARE_TYPES.has(cell.type) ? (cell.axis ?? "z") : "z";
}

/**
 * The neighbour at (nx, ny) if it forms a "perpendicular rounded adapter" with a cell rounding
 * about `ownAxis` that sits one step away in world direction `dir` — i.e. the neighbour is
 * rounded, and its own cap runs ALONG the line joining the two cells, so that cap's curved surface
 * is what meets the shared face.
 *
 * Gates on the same thing a "perpendicular rounded adapter" needs in general: a neighbour whose
 * own forward direction points along the direction to it, and which is itself rounded. Two rounded
 * cells that merely sit side by side do NOT qualify — a beam continuing straight on has a
 * genuinely flat shared wall, and rounding into it would breach the join.
 *
 * `dir` must be perpendicular to `ownAxis`: a neighbour along this cell's OWN bore axis just
 * continues the same tube, which is a different (and already handled) case.
 */
function perpendicularRoundedNeighbor(
  grid: Pick<GridState, "width" | "height" | "layers">,
  layerIndex: number,
  nx: number,
  ny: number,
  dir: "x" | "y",
  ownAxis: HoleAxis,
): Cell | null {
  if (dir === ownAxis) return null;
  if (!inBounds({ width: grid.width, height: grid.height }, nx, ny)) return null;
  const neighbor = grid.layers[layerIndex][indexOf({ width: grid.width }, nx, ny)];
  if (neighbor.type === CellType.Empty || !neighbor.rounded) return null;
  return roundingAxisOf(neighbor) === dir ? neighbor : null;
}

/**
 * How much extra radius a hole bored along `axis` gets. A sideways (x/y) bore is horizontal on the
 * print bed and comes out undersized relative to a vertical (z) one, so it gets `holeClearance`
 * plus `sidewaysHoleClearance` — see GridState.sidewaysHoleClearance for why one figure can't
 * serve both directions.
 */
function holeClearanceFor(grid: Pick<GridState, "holeClearance" | "sidewaysHoleClearance">, axis: HoleAxis): number {
  // Defaulted rather than trusted: these come from user project files on disk, and one saved
  // before a given field existed leaves it undefined at runtime whatever the type says. Arithmetic
  // on undefined yields NaN, which doesn't throw here — it propagates into the hole's radius and
  // only surfaces much later as a "non-finite vertex" out of the CSG engine, with nothing left to
  // point at the actual cause. deserializeProject fills these in too; this is the belt to its braces.
  return (grid.holeClearance ?? 0) + (axis === "z" ? 0 : (grid.sidewaysHoleClearance ?? 0));
}

/**
 * World position (cell face along `axis`, minus the embed length) — where a base-anchored
 * connector's local origin should land. `flip` attaches it to the opposite (`-axis`) face instead,
 * growing outward that way — see cellTypes.ts's FLIP_AWARE_TYPES doc for why this exists: without
 * it, two facing connectors painted on adjacent cells both grow toward `+axis` and one ends up
 * jammed inside the other instead of both pointing outward.
 */
function connectorBasePosition(
  axis: HoleAxis,
  cx: number,
  cy: number,
  layerBase: number,
  cellHeight: number,
  embedLength: number,
  flip = false,
  axisSpan = STUD_PITCH,
): { x: number; y: number; z: number } {
  const s = flip ? -1 : 1;
  if (axis === "x") return { x: cx + s * (axisSpan / 2 - embedLength), y: cy, z: layerBase + cellHeight / 2 };
  if (axis === "y") return { x: cx, y: cy + s * (axisSpan / 2 - embedLength), z: layerBase + cellHeight / 2 };
  return { x: cx, y: cy, z: flip ? layerBase + embedLength : layerBase + cellHeight - embedLength };
}

/**
 * Reverses a base-anchored connector's growth direction (see connectorBasePosition's `flip`) by
 * rotating it 180° around the one axis that leaves the connector's own "up-facing" reference (its
 * flex slit, see flexSlit.ts) undisturbed: Z for a sideways (x/y) connector, X for a vertical (z)
 * one — matching flexSlit.ts's own choice of reference axis for each case.
 */
function flip180(geom: THREE.BufferGeometry, axis: HoleAxis): THREE.BufferGeometry {
  const g = geom.clone();
  if (axis === "z") g.rotateX(Math.PI);
  else g.rotateZ(Math.PI);
  return g;
}

/**
 * Builds the full part geometry for a grid, stacking every layer along Z — each layer's own
 * height (see `computeLayerHeights`) is whichever of its cells is tallest, not a shared setting.
 *
 * Strategy: every filled cell contributes one solid piece (a box, with its own hole already cut
 * if it has one) or connector geometry (Pin/BallPin/Stud), each genuinely overlapping its
 * neighbours by a small amount (see CELL_OVERLAP) rather than sitting exactly flush — real CSG
 * booleans (this project uses manifold-3d, see csg.ts) are still more reliable given genuine
 * overlap than exactly-touching/coplanar geometry. All of it is then combined with one real CSG
 * union (`unionAll`, manifold-3d), which — unlike the plain non-boolean "soup" merge this used to
 * do — is guaranteed to produce a single watertight solid rather than a pile of intentionally
 * overlapping pieces. Studs are not added automatically — they're their own paintable cell type
 * (like Pin/BallPin), oriented along whichever axis the cell requests, so a stud can go on any
 * face rather than being forced onto every exposed top.
 *
 * @param hiddenLayers - Layer indices to skip when building geometry — a pure VIEWING convenience
 *   (see Viewport3D/GridEditor's own layer-visibility toggle) so a tall multi-layer part is easier
 *   to see into from the 3D preview. Every other layer's own height/position math is computed
 *   exactly as if nothing were hidden (skipped layers leave their own real gap rather than pulling
 *   the layers above down to fill it) — this never touches the actual model, only what gets
 *   rendered here, so hiding a layer has no effect on STL export or anything else that calls this
 *   function without passing the set.
 */
export async function buildGridGeometry(
  grid: GridState,
  hiddenLayers?: ReadonlySet<number>,
): Promise<THREE.BufferGeometry> {
  const layerHeights = computeLayerHeights(grid);
  const layerBases: number[] = [];
  {
    let acc = 0;
    for (const h of layerHeights) {
      layerBases.push(acc);
      acc += h;
    }
  }

  const bodyParts: THREE.BufferGeometry[] = [];

  // Cutters held back until the whole body has been unioned, then subtracted from the ASSEMBLED
  // solid. Everything in this part is built as its own overlapping piece and fused with one union,
  // so anything cut into a single piece beforehand is simply filled back in by whatever else is
  // unioned over the same space afterwards. That's fine for features nothing overlaps, but not for
  // a hole: a slot disc's body (or an angled beam's, or a neighbour's join bridge) is built AFTER
  // every cell and lands on top of the very cells its footprint covers, plugging their bores. Every
  // cutter in here therefore gets one guaranteed pass over the finished solid, so a hole stays a
  // hole no matter what shares its space. Contributors: each cell's own bore (see HOLE_TYPES
  // below), a beam's vertical bores, and a disc's centre bore and pockets.
  const assemblyCutters: THREE.BufferGeometry[] = [];

  for (let li = 0; li < grid.layers.length; li++) {
    if (hiddenLayers?.has(li)) continue;
    const layer = grid.layers[li];
    const layerHeight = layerHeights[li];
    const layerBase = layerBases[li];

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const cell = layer[indexOf(grid, x, y)];
        if (cell.type === CellType.Empty) continue;

        const cellHeight = plateHeight(cell.plateFraction, layerHeight);
        const cx = (x - (grid.width - 1) / 2) * STUD_PITCH;
        const cy = (y - (grid.height - 1) / 2) * STUD_PITCH;
        const cz = layerBase + cellHeight / 2;
        // How wide this cell is ALONG ITS OWN AXIS — see Cell.widthFraction's own doc. Only
        // meaningful (and only ever narrower than a full stud) for an axis-aware cell whose axis is
        // "x" or "y"; anything else (no axis, or axis "z", where there's no single "width"
        // direction independent of the fixed X/Y footprint) stays a full STUD_PITCH.
        // Clamped to a stud: the PlateFraction scale it reuses runs up to 9.6mm (a System brick's
        // height), which is fine as a height but as a WIDTH would push the cell past its own grid
        // square and into its neighbour. The picker only offers genuinely narrower values (see
        // PLATE_WIDTH_FRACTION_ORDER); this covers an older or hand-edited project too.
        const axisSpan =
          cell.widthFraction && (cell.axis === "x" || cell.axis === "y")
            ? Math.min(STUD_PITCH, fixedPlateHeight(cell.widthFraction) ?? STUD_PITCH)
            : STUD_PITCH;
        // A narrowed cell keeps the face OPPOSITE its connector/bore direction flush at the
        // normal full-stud cell boundary — that's the face a neighbouring cell's own full-width
        // face butts up against, so the two still join solidly — and pulls material in only from
        // the near face (the one the pin/axle/hole itself opens on). Centring the narrowed box on
        // the cell's own centre instead (the naive approach) shrinks BOTH faces symmetrically,
        // leaving a gap on the far side where a neighbour expects this cell to still reach the
        // shared boundary. `s` mirrors the same flip sign the connector/box-placement code below
        // uses for which way it protrudes/opens.
        const widthSign = (cell.flip ?? false) ? -1 : 1;
        const widthOffset = axisSpan !== STUD_PITCH ? (widthSign * (axisSpan - STUD_PITCH)) / 2 : 0;
        const bx = cell.axis === "x" ? cx + widthOffset : cx;
        const by = cell.axis === "y" ? cy + widthOffset : cy;

        // A bare piece (see BODY_REPLACING_TYPES) IS the cell — it contributes its own shape and no
        // surrounding box, so none of the box/rounding/hole machinery below applies to it. A run
        // of matching pieces fuses into ONE geometry sized to the run's own true total length —
        // not a fixed STUD_PITCH per cell — so Cell.widthFraction (see PLATE_WIDTH_FRACTION_ORDER
        // in Toolbar.tsx) actually shortens the piece it's painted on instead of being silently
        // ignored. An earlier version built each cell independently at a hard-coded STUD_PITCH (or
        // STUD_PITCH + CELL_OVERLAP for AxlePiece) length regardless of widthFraction, which is why
        // narrowing a Pin/Axle piece had no visible effect: the Plate width picker was reachable
        // (both types are in AXIS_AWARE_TYPES) but nothing downstream ever read the value.
        //
        // Consolidating into one run — rather than keeping each cell's own independent, possibly
        // narrowed segment and relying on CELL_OVERLAP to bridge the gaps — also avoids a real
        // failure mode narrowing would otherwise create: an AxlePiece cell narrowed enough loses
        // its overlap margin with the next cell entirely, which would leave a genuine gap
        // DISCONNECTING the rod rather than just shortening it. A single consolidated geometry has
        // no internal joints for narrowing to break.
        if (cell.type === CellType.AxlePiece || cell.type === CellType.PinPiece) {
          const pieceType = cell.type;
          const segAxis = cell.axis ?? "z";

          // How much length ONE cell contributes along its own axis — full stud pitch, or
          // narrower per Cell.widthFraction. Axis "z" never narrows (see widthFraction's own doc:
          // there's no separate "width" direction independent of the fixed X/Y footprint), so it
          // always contributes that layer's own real height.
          const pieceSpan = (widthFraction: PlateFraction | undefined, height: number): number =>
            segAxis === "z"
              ? height
              : widthFraction
                ? Math.min(STUD_PITCH, fixedPlateHeight(widthFraction) ?? STUD_PITCH)
                : STUD_PITCH;

          // Two cells only fuse into one run if they're the SAME piece type (a Pin piece and an
          // Axle piece never merge, even placed end to end) and the SAME axis. x/y runs also need
          // matching cellHeight — two adjacent cells at different plate heights have misaligned
          // centrelines, so fusing them would kink the rod; z runs across layers don't need that,
          // since differing per-layer height there is ordinary length accumulation, not
          // misalignment. Width narrowing does NOT block fusing — see pieceSpan above; a narrowed
          // cell simply contributes less length to the total.
          const matches = (other: Cell | undefined, otherHeight: number) =>
            other !== undefined &&
            other.type === pieceType &&
            (other.axis ?? "z") === segAxis &&
            (segAxis === "z" || otherHeight === cellHeight);

          const neighborAt = (step: number): { cell: Cell | undefined; height: number } => {
            if (segAxis === "x") {
              const nx = x + step;
              return inBounds(grid, nx, y)
                ? { cell: layer[indexOf(grid, nx, y)], height: cellHeight }
                : { cell: undefined, height: 0 };
            }
            if (segAxis === "y") {
              const ny = y + step;
              return inBounds(grid, x, ny)
                ? { cell: layer[indexOf(grid, x, ny)], height: cellHeight }
                : { cell: undefined, height: 0 };
            }
            const nLi = li + step;
            if (nLi < 0 || nLi >= grid.layers.length) return { cell: undefined, height: 0 };
            const otherCell = grid.layers[nLi][indexOf(grid, x, y)];
            return { cell: otherCell, height: plateHeight(otherCell.plateFraction, layerHeights[nLi]) };
          };

          const behind = neighborAt(-1);
          if (matches(behind.cell, behind.height)) continue; // not the run's start — the start cell already covers this one

          // Walk forward accumulating the run's total length and its own end position, one cell
          // (or layer, for a z run) at a time.
          let runLength = pieceSpan(cell.widthFraction, cellHeight);
          let endCx = cx;
          let endCy = cy;
          let endLayerBase = layerBase;
          let endCellHeight = cellHeight;
          // Distance (from the run's own start, i.e. this cell's own near face) of every internal
          // seam between two fused cells — where a real beam's hole would sit if one were inserted
          // there. `runLength` at the top of each loop iteration, before that iteration's own
          // segment is added, is exactly that: how far the run has gotten so far.
          const internalBoundaries: number[] = [];
          let step = 1;
          for (;;) {
            const ahead = neighborAt(step);
            if (!matches(ahead.cell, ahead.height)) break;
            const aheadCell = ahead.cell!;
            internalBoundaries.push(runLength);
            runLength += pieceSpan(aheadCell.widthFraction, ahead.height);
            if (segAxis === "x") {
              endCx = (x + step - (grid.width - 1) / 2) * STUD_PITCH;
            } else if (segAxis === "y") {
              endCy = (y + step - (grid.height - 1) / 2) * STUD_PITCH;
            } else {
              endLayerBase = layerBases[li + step];
              endCellHeight = ahead.height;
            }
            step++;
          }

          // The run's own midpoint, in world space — same for every axis: halfway between this
          // (start) cell's own centre and the final cell's own centre. (Narrowing shortens the
          // built geometry itself, not where these nominal grid-position centres fall — a narrowed
          // run ends up centred within its own nominal footprint rather than flush to one side,
          // since a bare rod has no neighbouring face of its own to stay flush against the way a
          // box cell does.)
          const startCenter = segAxis === "z" ? layerBase + cellHeight / 2 : cz;
          const endCenter = segAxis === "z" ? endLayerBase + endCellHeight / 2 : cz;
          const midX = (cx + endCx) / 2;
          const midY = (cy + endCy) / 2;
          const midZ = (startCenter + endCenter) / 2;

          // A real pin has tip lips at each true end and a collar at every internal stud-pitch
          // seam it passes — where a real beam's hole would actually sit if this pin were inserted
          // there — not one at the geometric centre of its whole length (see PinOptions.collars'
          // own doc). A lone cell (no internal seam at all) still gets the usual single default
          // centre collar, matching a normal standalone pin; a 2-cell run's one seam happens to
          // fall exactly at the centre too, so that case is visually unchanged from before. Only a
          // 3+-cell run — 2 or more seams, none of which is the geometric centre — actually
          // differs, and gets each collar reduced (PIN_COLLAR_RADIUS_REDUCED) rather than reading
          // as a row of full-size discs. A real axle has no collar or lip treatment at all
          // (uniform cross-section its whole length). No flip handling needed for either: neither
          // type is in FLIP_AWARE_TYPES (no UI flip control at all), and symmetric collars/lips
          // have no "direction" for a flip to even change.
          const collars =
            internalBoundaries.length === 0
              ? [{ offset: 0 }]
              : internalBoundaries.length === 1
                ? [{ offset: internalBoundaries[0] - runLength / 2 }]
                : internalBoundaries.map((boundary) => ({ offset: boundary - runLength / 2, radius: PIN_COLLAR_RADIUS_REDUCED }));
          const segment =
            pieceType === CellType.PinPiece
              ? (await buildPinGeometry({ length: runLength, axis: segAxis, collars })).clone()
              : axleRodGeometry(runLength + CELL_OVERLAP, segAxis).clone();
          segment.translate(midX, midY, midZ);
          bodyParts.push(segment);
          continue;
        }

        let box: THREE.BufferGeometry;
        if (grid.partClearance > 0) {
          // partClearance's own inset math (insetCellBox) isn't width-aware yet — a custom
          // widthFraction combined with a non-zero partClearance falls back to full stud width
          // rather than silently mis-inset a narrowed face. Uncommon combination; flagged rather
          // than either one quietly overriding the other.
          const ext = cellExteriorFaces(layer, grid.width, grid.height, x, y, li === 0, li === grid.layers.length - 1);
          box = insetCellBox(cx, cy, cz, cellHeight, ext, grid.partClearance);
        } else if (axisSpan !== STUD_PITCH && cell.axis === "x") {
          box = new THREE.BoxGeometry(axisSpan + CELL_OVERLAP, STUD_PITCH + CELL_OVERLAP, cellHeight);
          box.translate(bx, by, cz);
        } else if (axisSpan !== STUD_PITCH && cell.axis === "y") {
          box = new THREE.BoxGeometry(STUD_PITCH + CELL_OVERLAP, axisSpan + CELL_OVERLAP, cellHeight);
          box.translate(bx, by, cz);
        } else {
          box = boxGeometry(STUD_PITCH + CELL_OVERLAP, STUD_PITCH + CELL_OVERLAP, cellHeight).clone();
          box.translate(cx, cy, cz);
        }

        // Shape the cell's OUTER profile first, while it's still a plain box — the simplest
        // possible manifold input for a boolean. Doing this after the hole was cut (as an earlier
        // version did) meant every rounding cut had to slice through the hole's own chamfers and
        // counterbore walls, and when the rounding axis matches the bore axis those two features
        // are concentric — the rounding cylinder lands in the same thin annular wall the hole's
        // counterbore already carved, which is exactly the near-degenerate case mesh booleans
        // handle worst. Rounding the bare box instead keeps both operations well-conditioned, and
        // matches how the reference tool builds a part (exterior profile first, interior after).
        if (cell.rounded) {
          // A cell's rounded exterior is concentric with whatever it's bored/oriented along — see
          // exteriorCorners' own doc. Only axis-aware types (holes and connectors) carry a
          // meaningful axis; a plain Solid cell has none, so it falls back to the familiar
          // vertical (Z) rounding, matching a rounded brick's own upright corners.
          const roundingAxis = roundingAxisOf(cell);
          const corners = exteriorCorners(grid, li, x, y, roundingAxis);
          if (corners.length > 0) {
            // Carry any perpendicular rounded neighbour's own cap cylinder into this cell's
            // keep-region — see cellCapCylinder and roundCellCorners' `extraKeep`.
            //
            // Two studs long, centred on the NEIGHBOUR, so it reaches exactly as far as this
            // cell's own centre plane and no further. That endpoint is deliberate: a cap radius is
            // exactly half a cell (see CELL_EDGE_RADIUS), so at its own centre plane this cell's
            // own cap already keeps the whole cross-section — the adapter cylinder contributes
            // nothing there, and cutting it off leaves no step. Run it the full length of the cell
            // instead and it overrides this cell's cap entirely, so the elbow never tapers back
            // into its own tube.
            const adapters: THREE.BufferGeometry[] = [];
            const addAdapter = (nx: number, ny: number, dir: "x" | "y") => {
              const neighbor = perpendicularRoundedNeighbor(grid, li, nx, ny, dir, roundingAxis);
              if (neighbor === null) return;
              adapters.push(
                cellCapCylinder(
                  roundingAxisOf(neighbor),
                  (nx - (grid.width - 1) / 2) * STUD_PITCH,
                  (ny - (grid.height - 1) / 2) * STUD_PITCH,
                  layerBase,
                  plateHeight(neighbor.plateFraction, layerHeight),
                  STUD_PITCH * 2,
                ),
              );
            };
            addAdapter(x + 1, y, "x");
            addAdapter(x - 1, y, "x");
            addAdapter(x, y + 1, "y");
            addAdapter(x, y - 1, "y");

            box = await roundCellCorners(
              box,
              roundingAxis,
              cx,
              cy,
              layerBase,
              cellHeight,
              corners,
              undefined,
              adapters,
            );
          }
        }

        // After any rounding, and before the hole: same ordering argument as rounding itself — the
        // exterior profile is shaped while the box is still simple, so the boolean stays
        // well-conditioned and the hole is cut into a finished outer shape.
        if (cell.chamferMm && cell.chamferMm > 0) {
          const ext = cellExteriorFaces(layer, grid.width, grid.height, x, y, li === 0, li === grid.layers.length - 1);
          // Measured off the box's OWN bounds rather than the nominal stud pitch. The box is built
          // slightly over-size so neighbours genuinely overlap (CELL_OVERLAP), and smaller again
          // when partClearance is set — so a chamfer positioned from the nominal size cuts the
          // wrong amount off the face that actually exists. On a part whose whole job is to fit
          // something else, a tenth of a millimetre of "roughly" is not good enough.
          box.computeBoundingBox();
          const bb = box.boundingBox!;
          const sizeX = bb.max.x - bb.min.x;
          const sizeY = bb.max.y - bb.min.y;
          const sizeZ = bb.max.z - bb.min.z;
          // Clamped under half the smallest dimension — two chamfers that meet would consume the
          // face between them entirely.
          const chamfer = Math.min(cell.chamferMm, Math.min(sizeX, sizeY, sizeZ) * 0.45);
          const cutters = chamferCutters(
            (bb.min.x + bb.max.x) / 2,
            (bb.min.y + bb.max.y) / 2,
            (bb.min.z + bb.max.z) / 2,
            sizeX,
            sizeY,
            sizeZ,
            chamfer,
            ext,
          );
          if (cutters.length > 0) {
            box = await subtract(box, cutters.length === 1 ? cutters[0] : await unionAll(cutters));
          }
        }

        let bodyPiece: THREE.BufferGeometry;
        const ring = circleRingOf(grid, cell);
        const slice = ring ? ringColRow(ring, x, y) : null;
        // A CircleSolid with no ring behind it — one whose ring is gone, or a cell dragged out of
        // its ring's footprint — still has to build SOMETHING, and falling through to the plain
        // body branch makes it a Solid, which is exactly what a circle cell with no circle is.
        if (ring && slice) {
          const { dimension } = ring;
          const { col, row } = slice;
          // `box` here is this cell's own body as already built above — full stud width by
          // default, or already narrowed to a slit if widthFraction/axis is set, and already
          // rounded if cell.rounded — so a CircleSolid cell now supports the same narrowing (and
          // rounding) as Solid; the circle cut layers on top instead of replacing it.
          bodyPiece = await buildCircleSolidGeometry(
            box,
            cx,
            cy,
            cz,
            cellHeight,
            dimension,
            col,
            row,
            ring.hollow,
            ring.outerSquare,
          );
        } else if (HOLE_TYPES.has(cell.type)) {
          const axis = cell.axis ?? "x";
          const boreLength = axis === "z" ? cellHeight : axisSpan;
          const flip = cell.flip ?? false;
          const clearance = holeClearanceFor(grid, axis);
          const holeGeom =
            cell.type === CellType.TechnicHole
              ? pinHoleGeometry(boreLength, axis, clearance)
              : cell.type === CellType.StudHole
                ? studHoleGeometry(boreLength, axis, clearance)
                : cell.type === CellType.AxleHole
                  ? axleHoleGeometry(boreLength, axis, clearance)
                  : ballJointGeometry(boreLength, axis, flip);
          const holeGeomClone = holeGeom.clone();
          holeGeomClone.translate(bx, by, cz);

          bodyPiece = await subtract(box, holeGeomClone);

          // The same bore, kept for one more pass over the finished assembly — see
          // assemblyCutters. Cutting it here as well isn't redundant: a slot disc or angled beam
          // covering this cell is unioned on AFTER every cell is built, so without the second pass
          // its body plugs this bore straight back up and the hole vanishes (a hole cell painted
          // inside a disc's footprint came out as blank slab). Safe to apply to the whole solid
          // rather than just this cell, because the cutter never leaves the cell's own volume: a
          // z bore is exactly `cellHeight` tall and stays inside this layer, and an x/y bore runs
          // exactly `axisSpan` (a stud at most) and stays inside this footprint. So it can only
          // ever clear material that had encroached on this cell's own space — which is precisely
          // what needs clearing, including the sliver a neighbour's CELL_OVERLAP pushes across the
          // shared face into the bore's mouth.
          assemblyCutters.push(holeGeomClone.clone());

          if (cell.type === CellType.BallJoint) {
            const forkKeeper = (await ballSocketForkKeeperGeometry(boreLength, axis, flip)).clone();
            forkKeeper.translate(bx, by, cz);
            bodyPiece = await intersect(bodyPiece, forkKeeper);
          }
        } else {
          bodyPiece = box;

          if (cell.type === CellType.Stud) {
            // The real part's underside "tube" — a socket on the face OPPOSITE the protruding
            // stud, sized to receive another piece's stud, so studded plates can actually clip
            // together rather than just resting on top of each other. Reuses studHoleGeometry
            // (a plain uniform-radius bore) rather than a full through-hole: only deep enough to
            // seat a mating stud (STUD_HEIGHT) plus its own embed overlap, not all the way through.
            const axis = cell.axis ?? "z";
            const flip = cell.flip ?? false;
            const s = flip ? -1 : 1; // direction the male stud protrudes; the socket goes on -s
            const socketDepth = STUD_HEIGHT + STUD_OVERLAP;
            const extent = axis === "z" ? cellHeight : axisSpan;
            const axisCenter = axis === "x" ? bx : axis === "y" ? by : cz;
            const faceCoord = axisCenter - s * (extent / 2);
            const socketCoord = faceCoord + s * (socketDepth / 2);
            let sx = bx;
            let sy = by;
            let sz = cz;
            if (axis === "x") sx = socketCoord;
            else if (axis === "y") sy = socketCoord;
            else sz = socketCoord;

            const socketGeom = studHoleGeometry(socketDepth, axis, holeClearanceFor(grid, axis)).clone();
            socketGeom.translate(sx, sy, sz);
            bodyPiece = await subtract(bodyPiece, socketGeom);
          }
        }

        // Explicit per-corner "blend into narrowed neighbours' width" — see
        // blendCornerToNeighbors's own doc for why this is opt-in (Cell.cornerBlendXPosYPos etc).
        if (BLEND_AWARE_TYPES.has(cell.type)) {
          const cornerDirections: [1 | -1, 1 | -1, boolean | undefined][] = [
            [1, 1, cell.cornerBlendXPosYPos],
            [1, -1, cell.cornerBlendXPosYNeg],
            [-1, 1, cell.cornerBlendXNegYPos],
            [-1, -1, cell.cornerBlendXNegYNeg],
          ];
          for (const [sx, sy, enabled] of cornerDirections) {
            if (!enabled) continue;
            bodyPiece = await blendCornerToNeighbors(grid, layer, cellHeight, cz, cx, cy, x, y, sx, sy, bodyPiece);
          }
        }

        if ((bodyPiece.attributes.position?.count ?? 0) > 0) {
          bodyParts.push(bodyPiece);
        }

        // A Solid/TechnicHole/etc cell next to a circle ring can end up facing empty air along an
        // edge the grid says is "adjacent" — inside the bore, or outside a round rim; see
        // circleCellGap's own doc. Bridge that gap by also filling every gapped cell's own
        // footprint out to wherever the ring's material actually starts (see
        // collectJoinBridges), at THIS cell's height (deliberately allowed to be shorter than the
        // ring's), so the union below reconnects with the ring's surviving wall material instead
        // of leaving this cell floating disconnected inside the bore.
        //
        // Opt-in per direction (Cell.blendXPos/XNeg/YPos/YNeg) rather than automatic: whichever
        // side is toggled on gets walked out and bridged; a side left untoggled stays exactly as
        // painted, with no forced join, even if it happens to sit next to a hollow ring's gap.
        if (cell.type !== CellType.CircleSolid && !BODY_REPLACING_TYPES.has(cell.type) && BLEND_AWARE_TYPES.has(cell.type)) {
          for (const [dx, dy, enabled] of [
            [1, 0, cell.blendXPos],
            [-1, 0, cell.blendXNeg],
            [0, 1, cell.blendYPos],
            [0, -1, cell.blendYNeg],
          ] as const) {
            if (!enabled) continue;
            // Reuse this cell's OWN box — already narrowed to axisSpan/widthOffset if the cell
            // has a widthFraction, and already rounded if cell.rounded — rather than a fresh
            // full-stud box, so a narrowed rib bridges the gap with its own true (narrower)
            // cross-section instead of ballooning out to full stud width where it crosses into
            // the neighbour's cell.
            bodyParts.push(...(await collectJoinBridges(grid, layer, x, y, cx, cy, cz, cellHeight, dx, dy, box)));
          }
        }

        if (cell.type === CellType.Pin) {
          const axis = cell.axis ?? "x";
          const flip = cell.flip ?? false;
          const pinLength = PIN_EMBED_LENGTH + PIN_PROTRUDE_LENGTH;
          // Centre offset (from the cell's outward face) so most of the pin sits embedded
          // inside the block (real overlap, safe to merge) and the rest protrudes beyond it. The
          // shaft itself is symmetric along its own length (see pin.ts), so flipping only needs to
          // mirror which face it attaches to — no need to rotate the pin's own geometry.
          const centerOffset = (PIN_PROTRUDE_LENGTH - PIN_EMBED_LENGTH) / 2;
          const s = flip ? -1 : 1;
          let px = bx;
          let py = by;
          let pz = cz;
          if (axis === "x") px = bx + s * (axisSpan / 2 + centerOffset);
          else if (axis === "y") py = by + s * (axisSpan / 2 + centerOffset);
          else pz = flip ? layerBase - centerOffset : layerBase + cellHeight + centerOffset;

          // The collar goes at the host block's own face rather than mid-shaft: that's the surface a
          // mating beam seats against, and it leaves the full protruding module clear to enter the
          // hole. `s` negates it when flipped, because flipping repositions this pin rather than
          // rotating it (see below) and the collar is the one feature that isn't symmetric.
          const collarOffset = s * (PIN_EMBED_LENGTH - pinLength / 2);

          // PIN_COLLAR_RADIUS unconditionally, at full size, on every host cell regardless of its
          // own thickness — an earlier version here clamped (and, on a "½ module" cell, omitted
          // entirely) the collar to fit within the block's own cross-section, on the theory that a
          // wider collar would look wrong overhanging a thin block's edges. That theory doesn't
          // hold up: the bare SHAFT (PIN_SHAFT_RADIUS = 2.315mm) already exceeds a "½ module"
          // cell's own 2mm half-thickness on its own, with no collar involved at all — a real thin
          // liftarm's integrated pin genuinely does stand proud of the liftarm's own thin edges,
          // which is what a printed/molded part with a fixed-size connector on a thin body actually
          // looks like, not a defect to hide. Clamping just traded a correctly-proportioned proud
          // collar for a missing one, on cells where it was needed most.
          const pinGeom = (
            await buildPinGeometry({
              length: pinLength,
              axis,
              collarOffset,
            })
          ).clone();
          pinGeom.translate(px, py, pz);
          bodyParts.push(pinGeom);
        }

        if (cell.type === CellType.Axle) {
          const axis = cell.axis ?? "x";
          const flip = cell.flip ?? false;
          const rodLength = PIN_EMBED_LENGTH + PIN_PROTRUDE_LENGTH;
          // Same centred-shaft placement as Pin — the rod's cross-section is uniform along its
          // whole length (no taper), so flipping only needs to mirror which face it attaches to.
          const centerOffset = (PIN_PROTRUDE_LENGTH - PIN_EMBED_LENGTH) / 2;
          const s = flip ? -1 : 1;
          let px = bx;
          let py = by;
          let pz = cz;
          if (axis === "x") px = bx + s * (axisSpan / 2 + centerOffset);
          else if (axis === "y") py = by + s * (axisSpan / 2 + centerOffset);
          else pz = flip ? layerBase - centerOffset : layerBase + cellHeight + centerOffset;

          const axleGeom = axleRodGeometry(rodLength, axis).clone();
          axleGeom.translate(px, py, pz);
          bodyParts.push(axleGeom);
        }

        if (cell.type === CellType.BallPin) {
          const axis = cell.axis ?? "x";
          const flip = cell.flip ?? false;
          const neckLength = PIN_EMBED_LENGTH + PIN_PROTRUDE_LENGTH;
          const pos = connectorBasePosition(axis, bx, by, layerBase, cellHeight, PIN_EMBED_LENGTH, flip, axisSpan);
          let ballPinGeom = (await buildBallPinGeometry({ neckLength, axis })).clone();
          if (flip) ballPinGeom = flip180(ballPinGeom, axis);
          ballPinGeom.translate(pos.x, pos.y, pos.z);
          bodyParts.push(ballPinGeom);
        }

        if (cell.type === CellType.Stud) {
          const axis = cell.axis ?? "z";
          const flip = cell.flip ?? false;
          const studEmbed = STUD_OVERLAP;
          const totalLength = studEmbed + STUD_HEIGHT;
          const pos = connectorBasePosition(axis, bx, by, layerBase, cellHeight, studEmbed, flip, axisSpan);
          let studGeom = studConnectorGeometry(totalLength, axis).clone();
          if (flip) studGeom = flip180(studGeom, axis);
          studGeom.translate(pos.x, pos.y, pos.z);
          bodyParts.push(studGeom);
        }
      }
    }
  }

  // Angled beams (see AngledBeam) live alongside the cell grid rather than inside it, so they're
  // built after every cell — same layer bases, same world space, unioned into the same solid, so a
  // beam anchored on a painted cell fuses with it exactly as two adjacent cells would. A beam's own
  // height/width use the same PlateFraction scale a cell's do, resolved against its layer for
  // "minimal" just like `plateHeight` does for a cell.
  // A beam's VERTICAL hole cutters are held back until the whole body is unioned — see
  // buildAngledBeamGeometry's own note: cut them into the beam alone and any solid cell the beam
  // passes through simply fills them back in when it's unioned on afterwards. (In-plane bores are
  // cut there and don't appear here — same note explains why.)
  // Each beam's built width, worked out once: a beam's blend needs the OTHER beams' outlines as
  // well as the cells', and an outline is only useful if it is the width that beam is really built
  // at.
  const beamWidths = new Map<string, number>();
  for (const beam of grid.beams ?? []) {
    beamWidths.set(beam.id, Math.min(STUD_PITCH, fixedPlateHeight(beam.widthFraction) ?? STUD_PITCH));
  }

  for (const beam of grid.beams ?? []) {
    if (beam.layer < 0 || beam.layer >= grid.layers.length) continue;
    if (hiddenLayers?.has(beam.layer)) continue;
    if (beam.holes < 1) continue;
    const layerHeight = layerHeights[beam.layer];
    const beamHeight = plateHeight(beam.plateFraction ?? "module", layerHeight);
    // Clamped to a stud for the same reason a cell's own axisSpan is: the PlateFraction scale runs
    // past 8mm, which is fine as a height but as a WIDTH would make the beam wider than the hole
    // pattern it carries.
    const beamWidth = Math.min(STUD_PITCH, fixedPlateHeight(beam.widthFraction) ?? STUD_PITCH);
    const built = await buildAngledBeamGeometry(
      grid,
      beam,
      layerBases[beam.layer],
      beamHeight,
      beamWidth,
      layerHeight,
      beamEndsMeetingBeams(
        beam,
        (grid.beams ?? []).filter((b) => b.layer === beam.layer && !hiddenLayers?.has(b.layer)),
      ),
    );
    bodyParts.push(built.body);
    assemblyCutters.push(...built.throughCutters);

    // The join blend is a 2D operation on the beam's outline and the blocks' (see footprintBlend),
    // so it is computed here rather than inside the beam builder: the fill has to be unioned with
    // the assembly and the carve subtracted from it, and neither is the beam's own solid alone.
    const radius = beam.gusset ?? 0;
    if (radius > 0) {
      const others = (grid.beams ?? [])
        .filter((b) => b.id !== beam.id && b.layer === beam.layer && !hiddenLayers?.has(b.layer))
        .map((b) => ({ beam: b, width: beamWidths.get(b.id) ?? STUD_PITCH }));
      const blend = await buildBeamJoinBlend(
        grid,
        beam,
        layerBases[beam.layer],
        beamHeight,
        beamWidth,
        radius,
        others,
      );
      if (blend.fill) bodyParts.push(blend.fill);
      if (blend.carve) assemblyCutters.push(blend.carve);
    }
  }

  // Slot discs, same deal as beams: built after every cell, into the same world space and the same
  // union, with their bore and pockets held back as cutters so a cell painted over the disc can't
  // fill them in (see buildSlotDiscGeometry).
  for (const disc of grid.discs ?? []) {
    if (disc.layer < 0 || disc.layer >= grid.layers.length) continue;
    if (hiddenLayers?.has(disc.layer)) continue;
    if (disc.slots < 1) continue;
    const layerHeight = layerHeights[disc.layer];
    const discHeight = plateHeight(disc.plateFraction ?? "module", layerHeight);
    const built = buildSlotDiscGeometry(grid, disc, layerBases[disc.layer], discHeight, layerHeight);
    // The mouth ramps shape this disc and nothing else, so they are subtracted here rather than
    // added to the assembly-wide cutters — see buildSlotDiscGeometry.
    bodyParts.push(built.bodyCutters.length > 0 ? await subtract(built.body, await unionAll(built.bodyCutters)) : built.body);
    assemblyCutters.push(...built.throughCutters);
  }

  // If a corner cell has a hole/pin bore, the corner-rounding cut there must stay small enough
  // not to breach the thin wall between that bore's own boss circle (centred at the cell's
  // centre, STUD_PITCH/2 in from each edge) and the model's outer corner point. That distance is
  // constant regardless of grid size — geometrically, the corner point to that cell-centre
  // distance is (STUD_PITCH/2) * sqrt(2) — so the safe radius is that distance minus the boss
  // radius minus a small margin, rather than skipping the corner outright.
  const cornerToHoleCentre = (STUD_PITCH / 2) * Math.SQRT2;
  const safeRadiusNearHole = Math.max(0, cornerToHoleCentre - PIN_HOLE_BOSS_RADIUS - CORNER_HOLE_MARGIN);
  const cornerSafety: CornerSafety = { maxRadius: [] };
  for (const [sx, sy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const cornerX = sx === 1 ? grid.width - 1 : 0;
    const cornerY = sy === 1 ? grid.height - 1 : 0;
    const hasHole = grid.layers.some((layer) => HOLE_TYPES.has(layer[indexOf(grid, cornerX, cornerY)].type));
    if (hasHole) cornerSafety.maxRadius.push({ sx, sy, radius: safeRadiusNearHole });
  }

  if (bodyParts.length === 0) return new THREE.BufferGeometry();

  let geom = await unionAll(bodyParts);

  // Bored out of the ASSEMBLED body, so a cell's own bore, a beam's holes and a disc's pockets all
  // survive whatever they run through — and whatever was unioned over them.
  if (assemblyCutters.length > 0) {
    geom = await subtract(geom, assemblyCutters.length === 1 ? assemblyCutters[0] : await unionAll(assemblyCutters));
  }

  if (grid.rounding.corners) {
    const widthMm = grid.width * STUD_PITCH;
    const depthMm = grid.height * STUD_PITCH;
    const totalHeightMm = layerHeights.reduce((sum, h) => sum + h, 0);
    geom = await applyRounding(geom, widthMm, depthMm, totalHeightMm, grid.rounding, cornerSafety);
  }

  return geom;
}
