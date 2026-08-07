import * as THREE from "three";
import { subtract, union } from "./csg";
import { HoleAxis } from "./cellTypes";
import { PIN_COLLAR_RADIUS, PIN_COLLAR_WIDTH, PIN_LIP_RADIUS, PIN_SHAFT_RADIUS, STUD_PITCH } from "./units";
import { slitCutter } from "./flexSlit";

export const PIN_MIN_LENGTH_STUDS = 0.5;
export const PIN_DEFAULT_LENGTH_STUDS = 2;

export interface PinOptions {
  /** Overall pin length in mm, running along its own axis. */
  length: number;
  /** World axis the pin points along once built (default "z" — standing up, for the standalone export/preview). */
  axis?: HoleAxis;
  /**
   * Adds the real part's mid-shaft collar (see units.ts's PIN_COLLAR_RADIUS) — the raised rim that
   * drops into the countersunk mouth of a Technic hole, centring the pin across two beams and
   * stopping it sliding through. On by default — every real friction pin has one. See
   * `collarOffset` for where along the shaft it lands.
   */
  centerCollar?: boolean;
  /**
   * Where the collar sits, measured along the pin's own axis from its midpoint (default 0 — dead
   * centre, which is where a standalone two-module pin wants it, straddling the joint between two
   * beams). A pin grown out of a block instead puts the collar at the block's own face, so the
   * collar is the stop the beam seats against and the whole protruding module stays clear to enter
   * the hole. The shaft is otherwise symmetric end-to-end, so callers that mirror a pin by
   * repositioning it rather than rotating it must negate this offset to match.
   */
  collarOffset?: number;
  /**
   * Overrides PIN_COLLAR_RADIUS — for when the pin is grown out of a cell too thin to contain the
   * default 3mm collar. A block-attached pin's collar sits flush at the block's own face (see
   * `collarOffset`), so it's bounded by whatever cross-section that face actually has: a "1 module"
   * (8mm) cell has 4mm of half-thickness either side of centre, comfortably more than the collar's
   * default 3mm radius, but a thinner cell (a "½ module" liftarm is only 4mm thick, 2mm each side)
   * does not — an unclamped collar there pokes out past the block's own top and bottom faces,
   * which reads as the pin growing out of the block at the wrong height/thickness entirely rather
   * than as a collar. Callers should clamp this to the host cell's own perpendicular half-extent.
   */
  collarRadius?: number;
  /**
   * Multiple collars along the shaft, each an independent {offset, radius} — for a longer pin
   * fused from several stud-pitch segments (see geometry.ts's PinPiece run consolidation). A real
   * multi-module pin doesn't have one collar at the geometric centre of its WHOLE length; it has a
   * (smaller) collar ring at EACH point the pin actually passes a stud-pitch boundary — i.e. every
   * place a real beam-to-beam hole junction would sit along it — so it seats correctly wherever
   * it's inserted, not just if the insertion point happens to land on the pin's own midpoint.
   *
   * Given INSTEAD of `centerCollar`/`collarOffset`/`collarRadius` above (which still work as a
   * shorthand for the single-collar case when this is omitted) — not combined with them.
   */
  collars?: { offset: number; radius?: number }[];
}

// How far each end's flex split cuts in from its own tip, as a fraction of the pin's total
// length — checked against a real pin: the split runs in from *each* end that goes into a hole,
// with an uncut collar left in the middle holding both split halves together as one piece. An
// earlier version of this file had the arrangement backwards (one long slot through the middle,
// solid plugs at the ends) — exactly the opposite of where a real pin needs to flex.
const END_SLIT_DEPTH_FRACTION = 0.32;

/**
 * Builds a Technic friction pin, sized off the real part's own measurements. The shaft is a plain,
 * uniform-diameter smooth cylinder — no friction ribs or grooves along its length — with a tiny
 * raised fillet right at each open tip. The friction fit comes from the shaft's diameter against
 * the hole's own narrow-middle/wide-mouth profile (see pinHoleGeometry), not from any ribbing on
 * the pin itself.
 *
 * The one raised feature the shaft does carry is the collar around its middle (PIN_COLLAR_RADIUS),
 * which seats into the countersunk mouth of a Technic hole — see `centerCollar`.
 *
 * The flex splits at each end are the one deliberate departure from the authentic shape, kept from
 * an explicit earlier request: a real injection-molded pin doesn't need them (its manufacturing
 * tolerances give it enough compliance on their own), but a printed one, at this scale, needs the
 * splits to compress into a slightly undersized hole.
 */
export async function buildPinGeometry(opts: PinOptions): Promise<THREE.BufferGeometry> {
  const length = Math.max(opts.length, STUD_PITCH * PIN_MIN_LENGTH_STUDS);
  const axis = opts.axis ?? "z";

  // Built with the shaft's long axis along Y (three's cylinder default) — orientAlongAxis at
  // the end rotates the whole assembly onto whichever world axis was requested.
  let geom: THREE.BufferGeometry = new THREE.CylinderGeometry(PIN_SHAFT_RADIUS, PIN_SHAFT_RADIUS, length, 40);

  // The mid-shaft collar(s). Built here in the shaft's own local frame (long axis along Y)
  // alongside the tip lips, so orientAlongAxis below carries them onto the target world axis with
  // everything else. The end slits are cut afterwards and reach nowhere near any of these, so they
  // leave every collar — and the uncut spans holding the split halves together — intact.
  const collars = opts.collars ?? (opts.centerCollar ?? true ? [{ offset: opts.collarOffset ?? 0, radius: opts.collarRadius }] : []);
  for (const collar of collars) {
    const collarRadius = collar.radius ?? PIN_COLLAR_RADIUS;
    const collarGeom = new THREE.CylinderGeometry(collarRadius, collarRadius, PIN_COLLAR_WIDTH, 40);
    collarGeom.translate(0, collar.offset, 0);
    geom = await union(geom, collarGeom);
  }

  // The tiny raised tip fillet, right at each open end — a torus centred on the shaft's own
  // surface, so the union only adds the outward-bulging half of it (radius PIN_SHAFT_RADIUS to
  // PIN_SHAFT_RADIUS + PIN_LIP_RADIUS*2), matching the reference's own lip profile.
  for (const end of [-1, 1]) {
    const lipGeom = new THREE.TorusGeometry(PIN_SHAFT_RADIUS, PIN_LIP_RADIUS, 12, 32);
    lipGeom.rotateX(Math.PI / 2);
    lipGeom.translate(0, end * (length / 2 - PIN_LIP_RADIUS), 0);
    geom = await union(geom, lipGeom);
  }

  // Orient the shaft onto its target world axis FIRST, then cut the flex splits directly in world
  // space (see flexSlit.ts) — cutting in the shaft's own local frame and rotating it along with
  // everything else made the final facing depend on each axis's own rotation convention, which
  // didn't reliably land the visible seam on the connector's top.
  //
  // Deliberately NOT primitives.ts's shared `orientAlongAxis` here: that helper's X rotation
  // (rotateZ(+90°)) maps local +Y to world -X — a mirror, not a direct carry-over — which is
  // invisible for the symmetric bores/rods it's normally used for, but not for this shaft: the
  // collar sits at a specific offset along local Y (see `collarOffset`), computed by the caller
  // (geometry.ts) on the assumption that local-plus maps to world-plus. Under the mirrored
  // rotation, that offset lands on the wrong side — the collar ends up out near the far tip
  // instead of at the block's own face. ballPin.ts's neck+ball (also asymmetric) and
  // primitives.ts's studConnectorGeometry (also base-anchored) already use the corrected sign for
  // exactly this reason; this mirrors their convention rather than the shared helper's.
  let oriented = geom.clone();
  if (axis === "z") oriented.rotateX(Math.PI / 2); // +Y -> +Z
  else if (axis === "x") oriented.rotateZ(-Math.PI / 2); // +Y -> +X (not the shared helper's +90°, see above)
  // "y" needs no rotation.

  // One split at each tip, running inward — not one long split through the middle. The uncut
  // collar between the two splits is what keeps the pin one connected piece.
  const endSlitLength = length * END_SLIT_DEPTH_FRACTION;
  for (const end of [-1, 1]) {
    const center = end * (length / 2 - endSlitLength / 2);
    oriented = await subtract(oriented, slitCutter(axis, endSlitLength, PIN_SHAFT_RADIUS * 2, center));
  }
  return oriented;
}
