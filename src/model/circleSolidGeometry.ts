import * as THREE from "three";
import { STUD_PITCH } from "./units";
import { intersect, subtract } from "./csg";

const OVERHANG = 2;

// Segment count for the ring's own curve cylinders. The rest of the model deliberately keeps
// FLAT per-facet shading (see csg.ts's own note on fromManifold: STL has no smoothing info, and
// smooth-averaged normals would blur every crisp box edge into a rounded blob) — so a wide
// ring built from too few segments shows its facets as visible flat panels, and at a shallow
// viewing/light angle one panel's own flat normal can end up pointing almost edge-on to the
// light, reading as a dark "cut" line across otherwise-solid material even though the mesh itself
// is watertight. Raising the segment count shrinks each facet instead of switching to smooth
// shading, so the curve still reads as flat printed plastic, just with the facet seams small enough
// not to catch the light as a false notch.
const CIRCLE_SEGMENTS = 128;

// A tiny outward nudge on the shared circle's radius. For several (dimension, col, row)
// combinations — e.g. every cell in a 2x2 group — the circle's radius is constructed to reach
// EXACTLY the midpoint of the group's own outer edge, which is precisely a shared corner between
// two adjacent cells: an exact tangent touch, the known degenerate case for this project's CSG
// engine (see ballSocketForkKeeperGeometry's own note on tangent radii in primitives.ts). Nudging
// the radius out by a fraction of a mm turns that exact touch into a clean "just inside" instead,
// with no visible effect on the curve.
const RADIUS_EPSILON = 0.02;

/**
 * Cuts a single cell's slice of a curved circular arrangement: intersects `box` (the cell's own
 * body — already built and positioned in WORLD space by geometry.ts, and possibly already
 * narrowed via Cell.widthFraction/axis to cut a straight-edged slit into one side, e.g. a
 * dispenser chute through the rim) with a circle shared across the whole `dimension x dimension`
 * group, so that when all the group's cells are painted at their correct (col, row) position, the
 * assembled blocks form one smooth circular arc instead of a blocky square silhouette.
 *
 * `col`/`row` are 0-based coordinates of THIS cell within the dimension x dimension group (e.g.
 * for a 3x3 group, valid values are 0, 1, 2 in each direction — (1,1) is the centre cell). The
 * shared circle is centred on the group's own centre, not on this cell — a corner cell far from
 * the group centre gets cut aggressively, the centre cell (if `dimension` is odd) stays untouched.
 *
 * @param box - This cell's own body, already positioned in world space (see geometry.ts) — may
 *   already be narrower than a full stud if the cell has a widthFraction/axis set, and/or already
 *   have rounded corners applied.
 * @param cx - This cell's TRUE (un-narrowed) grid-position centre X, in world mm — narrowing
 *   shifts the box itself but the shared circle's group-offset math always uses the cell's real
 *   grid slot, so a slit cut into one side doesn't also shift the curve.
 * @param cy - This cell's TRUE (un-narrowed) grid-position centre Y, in world mm.
 * @param cz - This cell's centre Z, in world mm.
 * @param height - Cell height in mm
 * @param dimension - Circle group size (any integer >= 2, e.g. 2 for 2x2, 8 for 8x8)
 * @param col - This cell's 0-based column within the group
 * @param row - This cell's 0-based row within the group
 * @param hollow - When true, ALSO bores a concentric inner circle one stud smaller in radius than
 *   the group's own outer circle (e.g. a 2x2 group's inner hole reads as "1x1", a 3x3's as "2x2")
 *   out of the group's centre — turning the solid disc into a ring/washer shape. Cells whose own
 *   footprint never reaches that inner radius are unaffected (the subtraction is a no-op there).
 * @param outerSquare - When true, the OUTER boundary stays a plain square (this cell's `box` is
 *   used as-is, un-cut) instead of being curved to the group's outer circle — so the group's own
 *   outward-facing sides stay flush and can butt up against neighbouring cells outside the group,
 *   e.g. a ring/washer feature embedded flush inside a larger flat plate. `hollow`'s inner cut
 *   still applies independently of this flag — the two aren't mutually exclusive.
 */
export async function buildCircleSolidGeometry(
  box: THREE.BufferGeometry,
  cx: number,
  cy: number,
  cz: number,
  height: number,
  dimension: number,
  col: number,
  row: number,
  hollow: boolean,
  outerSquare: boolean,
): Promise<THREE.BufferGeometry> {
  // This cell's TRUE centre, relative to the group's own centre. `row` is a top-down READING
  // index (row 0 = top of the group, like the on-screen picker) — but world +Y is "up" (GridEditor
  // deliberately inverts its own screen-row -> grid-y for exactly this reason, see its own cellAt
  // comment), so increasing row must SUBTRACT from the Y offset, not add to it, or every cell ends
  // up positioned on the wrong side of the shared circle (curving inward instead of outward, since
  // the "kept" near-centre corner comes out mirrored top-to-bottom).
  const centerIndex = (dimension - 1) / 2;
  const cellOffsetX = (col - centerIndex) * STUD_PITCH;
  const cellOffsetY = (centerIndex - row) * STUD_PITCH;
  const groupCenterX = cx - cellOffsetX;
  const groupCenterY = cy - cellOffsetY;

  let result: THREE.BufferGeometry;
  if (outerSquare) {
    // Skip the outer cut entirely — this cell's own body (possibly already narrowed/rounded)
    // stays a plain square, so it still tiles flush with whatever's painted outside the group.
    result = box;
  } else {
    // Radius of the shared circle, centred on the whole group.
    // 2x2 -> 1 stud (8mm), 3x3 -> 1.5 studs (12mm), 4x4 -> 2 studs (16mm), 5x5 -> 2.5 studs (20mm)
    const radiusMm = (dimension / 2) * STUD_PITCH + RADIUS_EPSILON;

    // The shared circle, extruded along Z (matching the cell box's height axis) —
    // CylinderGeometry's default bore runs along Y, so rotate 90° about X to bring its round face
    // into the XY plane. Positioned in WORLD space, at the group's own centre, using this cell's
    // TRUE grid centre rather than wherever a narrowed `box` itself got shifted to, so the curve's
    // own position never moves just because one side got sliced off.
    const cylinder = new THREE.CylinderGeometry(radiusMm, radiusMm, height + OVERHANG * 2, CIRCLE_SEGMENTS);
    cylinder.rotateX(Math.PI / 2);
    cylinder.translate(groupCenterX, groupCenterY, cz);

    // Intersecting keeps only the part of this cell's (already positioned, possibly narrowed) box
    // that's inside the shared circle — the manifold-safe direction (vs. subtracting the circle's
    // complement) matching the rest of the codebase's rounding approach.
    result = await intersect(box, cylinder);
  }

  if (hollow) {
    // One stud smaller in radius than the outer circle — shrunk (not just left exact) for the
    // same tangency reason RADIUS_EPSILON exists: at dimension 2 the inner radius would otherwise
    // land EXACTLY on the cells' own shared centre corner, the known degenerate touch for this
    // project's CSG engine.
    const innerRadiusMm = Math.max(0, ((dimension - 1) / 2) * STUD_PITCH - RADIUS_EPSILON);
    if (innerRadiusMm > 0) {
      // A cell close enough to the group's own centre (e.g. directly above/below the centre row
      // in a 5x5+ group) can have its ENTIRE box fall inside the hollow radius, not just a slice
      // of it — asking manifold-3d to subtract a cylinder that fully engulfs the box is a
      // degenerate case it doesn't handle cleanly: rather than the expected empty result, it's
      // produced a corrupt/garbage mesh that then poisons the whole model's union (confirmed by
      // inspecting the actual triangle output — this isn't a hypothetical). Checking the box's own
      // farthest corner against the radius FIRST and short-circuiting to a genuinely empty
      // geometry sidesteps the bad CSG input entirely, rather than trying to clean up its output.
      result.computeBoundingBox();
      const bb = result.boundingBox!;
      const cornerDistances = [
        [bb.min.x, bb.min.y],
        [bb.min.x, bb.max.y],
        [bb.max.x, bb.min.y],
        [bb.max.x, bb.max.y],
      ].map(([x, y]) => Math.hypot(x - groupCenterX, y - groupCenterY));
      const farthestCorner = Math.max(...cornerDistances);

      if (farthestCorner <= innerRadiusMm) {
        // A bare `new THREE.BufferGeometry()` has no `position` attribute at all, which crashes
        // downstream CSG code expecting one (mergeToIndexed reads `attributes.position.count`) —
        // give it a real, just-empty one instead so it behaves like any other zero-volume piece.
        result = new THREE.BufferGeometry();
        result.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
      } else {
        const innerCylinder = new THREE.CylinderGeometry(innerRadiusMm, innerRadiusMm, height + OVERHANG * 2, CIRCLE_SEGMENTS);
        innerCylinder.rotateX(Math.PI / 2);
        innerCylinder.translate(groupCenterX, groupCenterY, cz);
        result = await subtract(result, innerCylinder);
      }
    }
  }

  return result;
}
