import * as THREE from "three";
import { union } from "./csg";
import { HoleAxis } from "./cellTypes";
import { BALL_JOINT_RADIUS, BALL_PIN_NECK_RADIUS } from "./units";

export interface BallPinOptions {
  /** Length of the straight neck (mm) from its base to the ball's centre, along its own axis. */
  neckLength: number;
  /** World axis the pin points along once built (default "z"). */
  axis?: HoleAxis;
}

/**
 * Builds a ball-joint connector: a cylindrical neck with a sphere at the tip, sized off the real
 * part's own ball-base and ball radius measurements. No flex slit here, unlike Pin — the real
 * ball joint doesn't need the ball to compress at all.
 * The socket's own entry channel (see ballJointGeometry in primitives.ts) is already narrower than
 * the ball, so it's the printed *socket* wall that flexes open a fraction as the rigid ball snaps
 * through, exactly like the real part. An earlier version of this file cut a slit through the
 * neck to help the ball "squeeze in" — that didn't actually do anything useful: the neck was
 * already narrower than the socket's channel, so it was never the tight part, and slitting it
 * can't make the solid ball itself any smaller. It just weakened the connector for no benefit.
 */
export async function buildBallPinGeometry(opts: BallPinOptions): Promise<THREE.BufferGeometry> {
  const axis = opts.axis ?? "z";
  const neckLength = Math.max(opts.neckLength, 1);

  // Built base-anchored at the local origin, growing along +Y: neck from y=0 to y=neckLength,
  // ball centred at y=neckLength. The neck and ball genuinely overlap where they meet, so they're
  // joined with a real CSG union (guaranteed manifold) rather than a plain, non-boolean merge —
  // a plain merge would leave the neck's own end cap as a stray internal face inside the sphere's
  // volume instead of a single clean outer surface.
  const neckGeom = new THREE.CylinderGeometry(BALL_PIN_NECK_RADIUS, BALL_PIN_NECK_RADIUS, neckLength, 40);
  neckGeom.translate(0, neckLength / 2, 0);
  const ballGeom = new THREE.SphereGeometry(BALL_JOINT_RADIUS, 40, 24);
  ballGeom.translate(0, neckLength, 0);
  const geom = await union(neckGeom, ballGeom);

  if (axis === "z") {
    geom.rotateX(Math.PI / 2); // +Y -> +Z
  } else if (axis === "x") {
    geom.rotateZ(-Math.PI / 2); // +Y -> +X (opposite sign from a symmetric shape, see pin.ts's orientAlongAxis note)
  }
  return geom;
}
