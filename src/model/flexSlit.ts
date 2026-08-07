import * as THREE from "three";
import { HoleAxis } from "./cellTypes";
import { CUT_EPSILON } from "./units";

/**
 * A thin, full-diameter slit cutter for a flex-split connector (Pin or BallPin), built directly in
 * WORLD axes — not the shaft's own local "built along Y" frame — so it always ends up on the
 * connector's visible top face regardless of which axis the connector itself points along.
 * Cutting the slit in the local frame and rotating it along with the shaft (an earlier approach)
 * put its final facing at the mercy of each axis's own rotation convention, which didn't reliably
 * land the visible seam on top — sometimes it ended up on a side or the underside instead.
 *
 * `along` is the world axis the connector's own length runs along; `slitLength` and `center`
 * describe the cut itself (`center` measured along `along`) — a real Technic pin's split runs in
 * from *each tip* toward the middle, not through the middle with solid ends (checked directly
 * against a real pin: the split ends are what get pushed into the hole and need to flex, while an
 * uncut collar in the middle is what actually holds the two split halves together as one piece —
 * the opposite arrangement of an earlier version of this code, which cut one long slot through the
 * centre and left the *ends* solid). Callers build whichever slit(s) they need by choosing
 * `slitLength`/`center` themselves. The slit is thin along world Z (so it reads on top when viewed
 * from above) except when the connector itself points along Z, where "top" doesn't apply and X is
 * used instead so the seam still has a fixed, sensible facing.
 */
export function slitCutter(along: HoleAxis, slitLength: number, diameter: number, center = 0): THREE.BufferGeometry {
  const span = diameter + CUT_EPSILON;
  const kerf = Math.min(0.7, diameter * 0.3);

  let geom: THREE.BufferGeometry;
  if (along === "x") geom = new THREE.BoxGeometry(slitLength, span, kerf);
  else if (along === "y") geom = new THREE.BoxGeometry(span, slitLength, kerf);
  else geom = new THREE.BoxGeometry(kerf, span, slitLength);

  if (along === "x") geom.translate(center, 0, 0);
  else if (along === "y") geom.translate(0, center, 0);
  else geom.translate(0, 0, center);
  return geom;
}
