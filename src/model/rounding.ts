import * as THREE from "three";
import { HoleAxis } from "./cellTypes";
import { intersect, union } from "./csg";
import { STUD_PITCH } from "./units";

/**
 * Per-cell rounding — the only rounding this app does.
 *
 * There used to be a second, whole-PART pass here: a fixed 4mm fillet cut down the four vertical
 * corners of the grid's bounding rectangle, exposed as a "Rounding / Round corners" checkbox. It
 * was removed because on the one case it was built for — a plate filling its grid — it produced a
 * result identical to simply marking the four corner cells rounded (both cut the same 4mm radius,
 * since CELL_EDGE_RADIUS is half a cell), while on every other case it was wrong: it cut at the
 * GRID's corners rather than the PART's, so it silently did nothing to a part smaller than its
 * grid, rounded a bounding-box corner an L-shaped part has no material at, and on a mixed-pitch
 * stack reached only the widest layer.
 *
 * Per-cell rounding has none of those failure modes — it follows the cells actually painted, works
 * per layer, and rounds about each cell's own bore axis so a beam's D-shaped end comes out right,
 * which a footprint-corner cut cannot express at all. It also needs no bore-safety clamp: the cap
 * is concentric with the cell's own bore, so it can never cut into that bore's wall. The old pass
 * needed a `CornerSafety` table precisely because its cut was near a bore without being centred on
 * one.
 */

const OVERHANG = 2; // mm of cutter overhang past the body, so the cutter cleanly clears the surface it's trimming

// EXACTLY half the cell, so the cap is TANGENT to the cell's own flat faces and blends into them
// smoothly, with no lip or ledge at the join.
//
// An earlier pass here used a rounding radius (3.8mm) copied from a reference geometry that also
// insets its block's FLAT exterior faces by a small margin, so its outer surface sits at that same
// 3.8mm from centre — the radius equals its half-size, which is precisely why that reference's
// round meets its flats tangentially. Copying only the radius (3.8) while leaving our own flats at
// their full 4.0mm made the flats stand 0.2mm proud of the round, producing a visible lip down the
// top and bottom.
//
// Here that inter-part clearance is a separate, explicit, per-project setting
// (GridState.partClearance) rather than baked into every dimension, so a cell's nominal exterior
// really is at STUD_PITCH / 2 and the tangent radius is exactly that.
export const CELL_EDGE_RADIUS = STUD_PITCH / 2;

/** CELL_EDGE_RADIUS at a given layer's own stud pitch — half a cell, whatever a cell measures. */
export function cellEdgeRadius(pitch: number = STUD_PITCH): number {
  return pitch / 2;
}

/** The cap radius a cell of this axis/height actually gets — see roundCellCorners' own clamping. */
export function cellCapRadius(axis: HoleAxis, zHeight: number, radius?: number, pitch: number = STUD_PITCH): number {
  const half = pitch / 2;
  const vHalf = axis === "z" ? half : zHeight / 2;
  return Math.min(radius ?? cellEdgeRadius(pitch), half, vHalf);
}

/**
 * The bare cap cylinder a cell of this axis/position would be rounded against — concentric with
 * that cell's own bore, extended to `lengthAlongAxis` so it can reach beyond the cell itself.
 *
 * Used to build "perpendicular rounded adapters" (see geometry.ts): where a rounded cell sits
 * next to a cell rounded on a perpendicular axis, that neighbour's cap cylinder is carried into
 * this cell's own keep-region, so the two caps blend into one continuous elbow instead of one
 * emerging from the other's flat square face — the same "perpendicular rounded adapter" concept
 * other Technic modelling tools stitch as an explicit blend surface between the two perpendicular
 * cylinders; expressing it as an extra keep-region reaches the same shape through this project's
 * boolean pipeline rather than by emitting triangles directly.
 */
export function cellCapCylinder(
  axis: HoleAxis,
  cx: number,
  cy: number,
  zBase: number,
  zHeight: number,
  lengthAlongAxis: number,
  pitch: number = STUD_PITCH,
  radius?: number,
): THREE.BufferGeometry {
  const r = cellCapRadius(axis, zHeight, radius, pitch);
  const geom = new THREE.CylinderGeometry(r, r, lengthAlongAxis, 48);
  // THREE's CylinderGeometry runs along Y by default — already right for a "y" cap.
  if (axis === "z") geom.rotateX(Math.PI / 2);
  else if (axis === "x") geom.rotateZ(Math.PI / 2);
  geom.translate(cx, cy, zBase + zHeight / 2);
  return geom;
}

/**
 * Rounds one cell's own exterior corners, cutting each caller-supplied corner's quadrant (see
 * geometry.ts's `exteriorCorners`, which excludes any corner shared with an occupied neighbour and
 * decides which two world axes form the cross-section) against ONE shared cylinder centred on the
 * cell itself — not a separate cylinder positioned near each individual corner.
 * `roundCellCorners` is only ever called with CELL_EDGE_RADIUS (see geometry.ts), deliberately
 * close to STUD_PITCH / 2 (see that constant's own doc) — a true full-round end cap, not an
 * arbitrary small fillet — so every corner's cut must agree on the same circle. Positioning each
 * corner's cylinder relative to that corner instead (as an earlier version did) only reconstructs
 * one true circle when the radius is *exactly* STUD_PITCH / 2; once the reference's own 0.2mm edge
 * margin pulls the radius in from that, the four independently-positioned cuts stop agreeing and
 * the result is a rounded square ("squircle") rather than a genuine cylinder.
 *
 * `axis` is the cylinder's own axis — the same axis the cell's hole/connector bores along, so the
 * cap curves in the same view the holes read as circles (see exteriorCorners' doc). `corners` are
 * given in that cross-section's own two in-plane signs (`s1`, `s2`) rather than fixed X/Y.
 *
 * `extraKeep` adds further regions to the keep-set — material inside any of them survives the cut
 * even where this cell's own cap would have removed it. That's how a perpendicular rounded
 * adapter works (see cellCapCylinder): the neighbour's cap cylinder is handed in here, so right at
 * the shared face this cell's surface follows the NEIGHBOUR's round profile and the two meet as
 * one continuous elbow. It also keeps the boolean well-conditioned — without it, two perpendicular
 * caps meeting at a cell boundary overlap only in a near-zero-thickness sliver, which manifold-3d
 * resolves into separate shells rather than one solid.
 *
 * Call this on a cell's bare box, BEFORE its hole is cut — see the call site in geometry.ts for
 * why order matters to the boolean's numerical conditioning.
 */
export async function roundCellCorners(
  geom: THREE.BufferGeometry,
  axis: HoleAxis,
  cx: number,
  cy: number,
  zBase: number,
  zHeight: number,
  corners: { s1: 1 | -1; s2: 1 | -1 }[],
  radius: number | undefined,
  extraKeep: THREE.BufferGeometry[] = [],
  pitch: number = STUD_PITCH,
): Promise<THREE.BufferGeometry> {
  let result = geom;
  const zCenter = zBase + zHeight / 2;

  // (u, v) are the cross-section's own two in-plane coords, w runs along the cylinder's axis.
  // uHalf/vHalf are the cross-section's half-extents; wLength is the cell's extent along the axis
  // (one stud for a sideways bore — every cell is exactly one stud wide/deep — or the cell's own
  // height for a vertical one).
  const uHalf = pitch / 2;
  const vHalf = axis === "z" ? pitch / 2 : zHeight / 2;
  const wLength = axis === "z" ? zHeight : pitch;
  const uCenter = axis === "x" ? cy : cx;
  const vCenter = axis === "z" ? cy : zCenter;
  const wCenter = axis === "z" ? zCenter : axis === "y" ? cy : cx;

  // Never exceed either half-extent of the cross-section, so the cap can't overshoot a cell that's
  // shorter than it is wide (a "½ module" cell is only 4mm tall). Clamped to the half-extent
  // EXACTLY, with nothing subtracted: landing exactly on it is the tangent case that makes the cap
  // meet the flat faces flush, and shaving even a twentieth of a millimetre off would put the lip
  // back (see CELL_EDGE_RADIUS).
  const safeRadius = Math.min(radius ?? cellEdgeRadius(pitch), uHalf, vHalf);
  if (safeRadius <= 0) return result;

  // Maps this function's (u, v, w) onto real (x, y, z) — used for both a shape's LOCAL dimensions
  // (so it's built pre-sized along the right world axes) and its world position, keeping the two
  // consistent. "x" axis -> cross-section is Y-Z; "y" -> X-Z; "z" -> X-Y.
  const uvwToXYZ = (u: number, v: number, w: number): [number, number, number] =>
    axis === "z" ? [u, v, w] : axis === "y" ? [u, w, v] : [w, u, v];

  const keptQuadrant = (s1: number, s2: number) => corners.some((c) => c.s1 === s1 && c.s2 === s2);
  const quadrantSize = Math.max(uHalf, vHalf) + OVERHANG;

  // Build the region to KEEP and intersect, rather than building each rounded corner's leftover
  // sliver and subtracting it. Those slivers (quadrant box MINUS cylinder) collapse to zero
  // thickness exactly at the four points where the cap is tangent to the cell's faces — and since
  // CELL_EDGE_RADIUS is deliberately tangent, that degeneracy is guaranteed, not incidental. It
  // made manifold-3d gouge chunks out of a fully-rounded cell (a Pin's base lost everything above
  // z=3.25 on one side only — asymmetric, the signature of a boolean tripping over a degenerate
  // input rather than of bad arithmetic). Intersecting against the cap never constructs a
  // zero-thickness solid at all, so the tangent case is ordinary instead of degenerate.
  const wSpan = wLength + OVERHANG * 2;

  const cylGeom = new THREE.CylinderGeometry(safeRadius, safeRadius, wSpan, 48);
  // THREE's CylinderGeometry is Y-axis-aligned by default (round cross-section in X-Z) — already
  // exactly what a "y" axis cap needs. "z" takes the classic quarter-turn onto Z; "x" onto X.
  if (axis === "z") cylGeom.rotateX(Math.PI / 2);
  else if (axis === "x") cylGeom.rotateZ(Math.PI / 2);
  cylGeom.translate(...uvwToXYZ(uCenter, vCenter, wCenter));

  let keeper: THREE.BufferGeometry = cylGeom;
  for (const s1 of [1, -1] as const) {
    for (const s2 of [1, -1] as const) {
      if (keptQuadrant(s1, s2)) continue; // this corner IS being rounded — the cap alone defines it
      const boxGeom = new THREE.BoxGeometry(...uvwToXYZ(quadrantSize, quadrantSize, wSpan));
      boxGeom.translate(
        ...uvwToXYZ(uCenter + (s1 * quadrantSize) / 2, vCenter + (s2 * quadrantSize) / 2, wCenter),
      );
      keeper = await union(keeper, boxGeom);
    }
  }
  for (const extra of extraKeep) {
    keeper = await union(keeper, extra);
  }

  return intersect(result, keeper);
}
