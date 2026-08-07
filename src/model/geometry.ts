import * as THREE from "three";
import { buildBallPinGeometry } from "./ballPin";
import { buildCircleSolidGeometry } from "./circleSolidGeometry";
import { AXIS_AWARE_TYPES, BLEND_AWARE_TYPES, BODY_REPLACING_TYPES, CellType, HOLE_TYPES, HoleAxis, PlateFraction } from "./cellTypes";
import { intersect, subtract, unionAll } from "./csg";
import { Cell, GridState, inBounds, indexOf, Layer } from "./grid";
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
function fixedPlateHeight(fraction: PlateFraction | undefined): number | undefined {
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
  return grid.layers.map((layer) => {
    let reference = 0;
    for (const cell of layer) {
      if (cell.type === CellType.Empty) continue;
      const fixed = fixedPlateHeight(cell.plateFraction);
      if (fixed !== undefined) reference = Math.max(reference, fixed);
    }
    if (reference === 0) reference = PLATE_HEIGHT * FULL_HEIGHT_PLATES;

    let maxHeight = 0;
    for (const cell of layer) {
      if (cell.type === CellType.Empty) continue;
      maxHeight = Math.max(maxHeight, plateHeight(cell.plateFraction, reference));
    }
    return maxHeight || PLATE_HEIGHT * FULL_HEIGHT_PLATES;
  });
}

/**
 * True when a Solid cell at (cx, cy) shares its (dx, dy) edge with a hollowed CircleSolid
 * neighbour AND that neighbour's own ring material has been bored away right at that shared
 * edge — i.e. the two cells would NOT actually touch once the neighbour's hollow cut is applied,
 * even though they're adjacent in the grid. This happens whenever a Solid cell is painted near
 * the centre of a ring/washer group: the neighbour ring cell keeps material only outside its own
 * inner hollow radius (see buildCircleSolidGeometry's own `hollow` cut), so a Solid cell sitting
 * close to the group's centre can end up facing empty air along part or all of that edge instead
 * of the neighbour's wall.
 *
 * Tests the CLOSEST point of the shared edge segment to the ring group's own centre, not just the
 * neighbour cell's centre — a corner of the shared edge can dip inside the hollow radius even
 * when the neighbour cell's own centre point stays outside it (a ring cell near the group's own
 * diagonal is exactly this case), so checking only the cell centre would miss a real gap.
 */
function hollowCircleGap(
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
  if (neighbor.type !== CellType.CircleSolid || !neighbor.circleHollow) return false;

  const dimension = neighbor.circleDimension ?? 2;
  const col = neighbor.circleCol ?? 0;
  const row = neighbor.circleRow ?? 0;
  const centerIndex = (dimension - 1) / 2;
  const neighborCx = (nx - (grid.width - 1) / 2) * STUD_PITCH;
  const neighborCy = (ny - (grid.height - 1) / 2) * STUD_PITCH;
  const groupCenterX = neighborCx - (col - centerIndex) * STUD_PITCH;
  const groupCenterY = neighborCy - (centerIndex - row) * STUD_PITCH;
  // Small inward safety margin (well past RADIUS_EPSILON's own tiny nudge) so only a genuine,
  // visually meaningful gap triggers a bridge — not a hairline sliver that's already connected.
  const innerRadius = Math.max(0, ((dimension - 1) / 2) * STUD_PITCH - 0.5);

  const half = STUD_PITCH / 2;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  let closestDist: number;
  if (dx !== 0) {
    const edgeX = cx + dx * half;
    const closestY = clamp(groupCenterY, cy - half, cy + half);
    closestDist = Math.hypot(edgeX - groupCenterX, closestY - groupCenterY);
  } else {
    const edgeY = cy + dy * half;
    const closestX = clamp(groupCenterX, cx - half, cx + half);
    closestDist = Math.hypot(closestX - groupCenterX, edgeY - groupCenterY);
  }
  return closestDist < innerRadius;
}

/**
 * Walks outward from a cell along (dx, dy), one grid step at a time, collecting a translated
 * clone of `box` for every consecutive hollowed CircleSolid ring cell whose shared edge with the
 * previous step is still inside the ring's own hollow radius (see hollowCircleGap) — i.e. every
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
function collectJoinBridges(
  grid: GridState,
  layer: Layer,
  x: number,
  y: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  box: THREE.BufferGeometry,
): THREE.BufferGeometry[] {
  const bridges: THREE.BufferGeometry[] = [];
  let stepCx = cx;
  let stepCy = cy;
  let nx = x + dx;
  let ny = y + dy;
  let steps = 0;
  const maxSteps = grid.width + grid.height;
  while (steps < maxSteps && hollowCircleGap(grid, layer, nx, ny, stepCx, stepCy, dx, dy)) {
    const bridge = box.clone();
    bridge.translate((nx - x) * STUD_PITCH, (ny - y) * STUD_PITCH, 0);
    bridges.push(bridge);
    stepCx += dx * STUD_PITCH;
    stepCy += dy * STUD_PITCH;
    nx += dx;
    ny += dy;
    steps++;
  }
  return bridges;
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

        let bodyPiece: THREE.BufferGeometry;
        if (cell.type === CellType.CircleSolid) {
          const dimension = cell.circleDimension ?? 2;
          const col = cell.circleCol ?? 0;
          const row = cell.circleRow ?? 0;
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
            cell.circleHollow ?? false,
            cell.circleOuterSquare ?? false,
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

        // A Solid/TechnicHole/etc cell painted near the centre of a hollow ring/washer group can
        // end up facing empty air along an edge the grid says is "adjacent" — see
        // hollowCircleGap's own doc. Bridge that gap by also filling every gapped cell's own
        // footprint out to wherever the ring's hollow radius actually ends (see
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
            bodyParts.push(...collectJoinBridges(grid, layer, x, y, cx, cy, dx, dy, box));
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

  if (grid.rounding.corners) {
    const widthMm = grid.width * STUD_PITCH;
    const depthMm = grid.height * STUD_PITCH;
    const totalHeightMm = layerHeights.reduce((sum, h) => sum + h, 0);
    geom = await applyRounding(geom, widthMm, depthMm, totalHeightMm, grid.rounding, cornerSafety);
  }

  return geom;
}
