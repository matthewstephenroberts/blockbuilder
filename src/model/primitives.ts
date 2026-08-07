import * as THREE from "three";
import { union } from "./csg";
import { HoleAxis } from "./cellTypes";
import {
  AXLE_ARM_WIDTH,
  AXLE_ROD_ARM_LENGTH,
  AXLE_ROD_ARM_WIDTH,
  BALL_JOINT_CHANNEL_RADIUS,
  BALL_JOINT_RADIUS,
  BALL_SOCKET_FORK_DEPTH,
  BALL_SOCKET_FORK_OPEN_HALF_WIDTH,
  BALL_SOCKET_FORK_PRONG_HALF_WIDTH,
  CUT_EPSILON,
  PIN_HOLE_BOSS_RADIUS,
  PIN_HOLE_CHAMFER_DEPTH,
  PIN_HOLE_COLLAR_SEAT_SETBACK,
  PIN_HOLE_RADIUS,
  STUD_HOLE_RADIUS,
  STUD_PITCH,
  STUD_RADIUS,
} from "./units";

const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const existing = cache.get(key);
  if (existing) return existing;
  const geom = build();
  cache.set(key, geom);
  return geom;
}

/** A solid box centred at the origin, sized `sizeX x sizeY x sizeZ`. */
export function boxGeometry(sizeX: number, sizeY: number, sizeZ: number): THREE.BufferGeometry {
  return cached(`box:${sizeX}:${sizeY}:${sizeZ}`, () => new THREE.BoxGeometry(sizeX, sizeY, sizeZ));
}

/**
 * A base-anchored stud cylinder for painting a stud onto any face of a cell (top, or sideways
 * for SNOT-style building) — base at the local origin, growing along the given world axis by
 * `totalLength`. Unlike `studGeometry` (fixed Z-up, used by the old automatic-top-stud logic),
 * this can point along x/y/z, matching how Pin/BallPin cells already work.
 */
export function studConnectorGeometry(totalLength: number, axis: HoleAxis): THREE.BufferGeometry {
  const geom = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, totalLength, 40);
  geom.translate(0, totalLength / 2, 0); // base-anchored at the origin, growing +Y
  if (axis === "y") return geom;
  if (axis === "z") {
    geom.rotateX(Math.PI / 2); // +Y -> +Z
    return geom;
  }
  geom.rotateZ(-Math.PI / 2); // +Y -> +X (opposite sign from a symmetric shape — see ballPin.ts's own note)
  return geom;
}

/** Rotates a geometry (built with its bore running along Y, three's cylinder default) onto the requested world axis. */
export function orientAlongAxis(geom: THREE.BufferGeometry, axis: HoleAxis): THREE.BufferGeometry {
  const g = geom.clone();
  if (axis === "x") g.rotateZ(Math.PI / 2);
  else if (axis === "z") g.rotateX(Math.PI / 2);
  // "y" needs no rotation — that's the cylinder's/box's own default long axis.
  return g;
}

/**
 * Revolves a (radius, y) profile 360° around the Y axis into a single closed, watertight solid —
 * used for every rotationally-symmetric hole/cutter shape below instead of building the shape from
 * several overlapping primitives and CSG-`ADDITION`-ing them together. That union approach was
 * tried first and looked reasonable, but three-bvh-csg's boolean ops turned out not to reliably
 * produce a clean, fully-manifold result for these compound coaxial shapes — the leftover defects
 * then propagated into every subsequent SUBTRACTION that used one of these cutters, which is what
 * was producing the non-manifold/open edges reported after export. A `LatheGeometry` revolve has
 * no such failure mode: it's a single direct triangulation of the profile, always closed and
 * watertight by construction, as long as the profile itself starts and ends at radius 0 (which the
 * helpers below always arrange).
 */
function revolveProfile(points: [radius: number, y: number][], radialSegments = 40): THREE.BufferGeometry {
  const profile = points.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, radialSegments);
}

/**
 * A cylindrical bore through a cell for a Technic pin hole — with a wider entrance chamfer at
 * BOTH ends (matching real Technic beams' own hole profile): the narrower main bore
 * (PIN_HOLE_RADIUS) grips the pin, while the wider mouths at each face
 * (PIN_HOLE_BOSS_RADIUS, extending PIN_HOLE_CHAMFER_DEPTH in from each side) guide the pin in
 * from either direction instead of forcing it to find a single narrow opening. Built as one
 * revolved profile (see revolveProfile) rather than a union of overlapping cylinders.
 */
export function pinHoleGeometry(length: number, axis: HoleAxis, holeClearance = 0): THREE.BufferGeometry {
  const geom = cached(`pinhole:${length}:${axis}:${holeClearance}`, () => {
    const half = length / 2 + CUT_EPSILON;
    const radius = PIN_HOLE_RADIUS + holeClearance;

    // The counterbore reaches the bore through a 45° cone, not a flat 90° ring — see
    // PIN_HOLE_COLLAR_SEAT_SETBACK for why (that ring is unprintable on a vertical bore) and for
    // why the straight section is shortened by exactly the setback: it keeps the depth a pin's
    // collar comes to rest at unchanged at PIN_HOLE_CHAMFER_DEPTH.
    const coneRise = Math.max(0, PIN_HOLE_BOSS_RADIUS - radius); // 45°, so rise == radial gap
    // A very short bore (a thin plate plus a vertical hole) hasn't room for two full mouths; give
    // each at most a little under half the length so the two never cross over each other.
    const maxMouth = (length / 2) * 0.9;
    const straight = Math.min(Math.max(0, PIN_HOLE_CHAMFER_DEPTH - PIN_HOLE_COLLAR_SEAT_SETBACK), maxMouth);
    const cone = Math.min(coneRise, maxMouth - straight);

    const coneStart = -length / 2 + straight; // counterbore stops being straight here
    const boreStart = coneStart + cone; // full narrow bore from here inward
    const profile = revolveProfile([
      [0, -half],
      [PIN_HOLE_BOSS_RADIUS, -half],
      [PIN_HOLE_BOSS_RADIUS, coneStart],
      [radius, boreStart],
      [radius, -boreStart],
      [PIN_HOLE_BOSS_RADIUS, -coneStart],
      [PIN_HOLE_BOSS_RADIUS, half],
      [0, half],
    ]);
    return orientAlongAxis(profile, axis);
  });
  return geom;
}

/**
 * A plain, uniform-radius through-hole for a standard System-style stud — unlike a Technic hole,
 * a stud doesn't need guiding in from both directions, so there's no wider entrance chamfer.
 */
export function studHoleGeometry(length: number, axis: HoleAxis, holeClearance = 0): THREE.BufferGeometry {
  const geom = cached(`studhole:${length}:${axis}:${holeClearance}`, () => {
    const radius = STUD_HOLE_RADIUS + holeClearance;
    const base = new THREE.CylinderGeometry(radius, radius, length + CUT_EPSILON * 2, 40);
    return orientAlongAxis(base, axis);
  });
  return geom;
}

/**
 * The 2D outline of a Technic axle-hole cross-section: two perpendicular arms of half-width
 * AXLE_ARM_WIDTH, with their tips rounded off where they'd otherwise poke outside a circle of
 * radius `outerRadius` — computed analytically (arm-tip arc, flat arm side, concave inner corner,
 * repeated with 4-fold symmetry) rather than via a CSG union+intersection of boxes and a cylinder,
 * which (like the compound hole shapes above) turned out not to produce a reliably watertight
 * result. One quadrant is derived directly from the arm/circle intersection geometry and then
 * rotated into the other three.
 */
function axleCrossOutline(outerRadius: number, armWidth: number, arcSegments = 10): THREE.Vector2[] {
  const theta0 = Math.asin(armWidth / outerRadius);
  const rotate = (x: number, y: number, angle: number): [number, number] => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [x * cos - y * sin, x * sin + y * cos];
  };

  // One quadrant's boundary, angle 0 -> 90°: the +x arm's rounded tip, its flat side, the concave
  // inner corner, then the +y arm's rounded tip (its other half, mirrored, comes from the next
  // quadrant's own 0->theta0 arc after rotation).
  const quadrant: [number, number][] = [];
  for (let i = 0; i <= arcSegments; i++) {
    const a = (theta0 * i) / arcSegments;
    quadrant.push([outerRadius * Math.cos(a), outerRadius * Math.sin(a)]);
  }
  quadrant.push([armWidth, armWidth]);
  for (let i = 0; i <= arcSegments; i++) {
    const a = Math.PI / 2 - theta0 + (theta0 * i) / arcSegments;
    quadrant.push([outerRadius * Math.cos(a), outerRadius * Math.sin(a)]);
  }

  const outline: THREE.Vector2[] = [];
  for (let q = 0; q < 4; q++) {
    const angle = (Math.PI / 2) * q;
    for (const [x, y] of quadrant) {
      const [rx, ry] = rotate(x, y, angle);
      outline.push(new THREE.Vector2(rx, ry));
    }
  }
  return outline;
}

/**
 * A cross-shaped bore through a cell, oriented along the given world axis, for a Technic axle
 * hole — matching the real part's rounded-cross profile: two perpendicular arms (AXLE_ARM_WIDTH
 * half-width) clipped to fit inside a circle of PIN_HOLE_RADIUS. Built as a single extrusion of
 * the analytic outline above (see axleCrossOutline) rather than a CSG union+intersection.
 */
export function axleHoleGeometry(length: number, axis: HoleAxis, holeClearance = 0): THREE.BufferGeometry {
  const geom = cached(`axlehole:${length}:${axis}:${holeClearance}`, () => {
    const totalLength = length + CUT_EPSILON * 2;
    // Widening both the arm half-width and the outer clipping circle by the same amount grows the
    // whole cross-shaped slot uniformly, keeping its proportions (and wing angle) matching the
    // reference instead of just the arms getting wider relative to a fixed outer bound.
    const shape = new THREE.Shape(axleCrossOutline(PIN_HOLE_RADIUS + holeClearance, AXLE_ARM_WIDTH + holeClearance));
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: totalLength, bevelEnabled: false, curveSegments: 1 });
    // ExtrudeGeometry builds the shape in the XY plane, extruded along +Z from 0 to totalLength —
    // recentre on Z, then rotate Z (its long axis) onto Y, matching orientAlongAxis's convention.
    extruded.translate(0, 0, -totalLength / 2);
    extruded.rotateX(-Math.PI / 2);
    return orientAlongAxis(extruded, axis);
  });
  return geom;
}

/**
 * The printed Technic axle rod itself — a solid extrusion of the same cross-shaped outline as
 * axleHoleGeometry, but sized to AXLE_ROD_ARM_WIDTH/AXLE_ROD_ARM_LENGTH (smaller than the hole's
 * own dimensions, for clearance) and centred/symmetric along its own length like Pin's shaft, so
 * flipping it (see geometry.ts's Pin handling) only needs to mirror where it's placed, not rotate
 * the rod itself — a real axle has no taper or asymmetric feature along its length.
 */
export function axleRodGeometry(length: number, axis: HoleAxis): THREE.BufferGeometry {
  const geom = cached(`axlerod:${length}:${axis}`, () => {
    const shape = new THREE.Shape(axleCrossOutline(AXLE_ROD_ARM_LENGTH, AXLE_ROD_ARM_WIDTH));
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 1 });
    extruded.translate(0, 0, -length / 2);
    extruded.rotateX(-Math.PI / 2);
    return orientAlongAxis(extruded, axis);
  });
  return geom;
}

/**
 * A ball-and-socket connector socket: a spherical pocket with a single port on ONE side only —
 * matching a real Technic ball socket (e.g. 67695), which is a bulb-shaped cup with a solid
 * backing on one side and one narrower entry port on the other, not a bore straight through. An
 * earlier version of this shape had a port at both ends (symmetric, like a spool/hourglass), which
 * doesn't match any real part and isn't what a "U"-shaped cup cross-section actually looks like.
 * `flip` picks which side the port is on (unflipped = `+axis`), the same convention as every other
 * FLIP_AWARE_TYPES cell. Built as one revolved profile (see revolveProfile): the port side's radius
 * is whichever is larger of the straight channel or the sphere bulging through it (an exact revolve
 * equivalent of unioning a sphere with a coaxial cylinder); the backing side has no channel floor
 * at all, so the profile just follows the sphere and pinches shut well before reaching that face.
 */
export function ballJointGeometry(channelLength: number, axis: HoleAxis, flip = false): THREE.BufferGeometry {
  const geom = cached(`balljoint:${channelLength}:${axis}:${flip}`, () => {
    const half = channelLength / 2 + CUT_EPSILON;
    const segments = 32;
    const portSign = flip ? -1 : 1;
    const points: [number, number][] = [[0, -half]];
    for (let i = 0; i <= segments; i++) {
      const y = -half + (2 * half * i) / segments;
      const sphereR = Math.abs(y) <= BALL_JOINT_RADIUS ? Math.sqrt(BALL_JOINT_RADIUS ** 2 - y * y) : 0;
      // Only the port side gets the channel floor — the backing side follows the sphere alone,
      // which naturally closes to a point well inside the cell instead of opening a second port.
      const onPortSide = Math.sign(y || portSign) === portSign;
      points.push([onPortSide ? Math.max(BALL_JOINT_CHANNEL_RADIUS, sphereR) : sphereR, y]);
    }
    points.push([0, half]);
    return orientAlongAxis(revolveProfile(points), axis);
  });
  return geom;
}

/**
 * The region to KEEP near the socket's one port, turning the collar from a solid ring into a real
 * open fork — see the constants' own comment in units.ts for why: a rigid full collar this size
 * physically cannot admit the ball at all, and the real part (LDraw's own geometry for it confirms
 * this directly) isn't a solid ring with thin relief cuts, it's
 * officially named "Angled Forks ... Open Sides" — two curved, genuinely thin prongs (top and
 * bottom) that are each naturally flexible because there's a real gap either side of them, not
 * because a slot was cut into an otherwise-thick block. An earlier version of this function cut 3
 * thin radial slits into an intact collar instead; those work, but flex by concentrating bend into
 * a slot ROOT (a stress-riser prone to fatigue cracking), which is a materially worse way to get
 * the same motion than a part that's just thin where it needs to be.
 *
 * Built as the region to KEEP and intersected against the cell's own body (the same
 * build-the-keeper-and-intersect approach roundCellCorners uses, and for the same reason: a
 * subtract-based cutter here would leave a razor-thin sliver exactly at the fork's own tangent
 * edges, which is the known degenerate case for this project's CSG engine). Away from the port
 * (beyond BALL_SOCKET_FORK_DEPTH) the full cross-section is kept untouched — there's no second
 * port back there to open a fork around. Near the port, only two bounded "cap" boxes survive —
 * one where the perpendicular-to-bore Z is beyond BALL_SOCKET_FORK_OPEN_HALF_WIDTH (positive), one
 * where it's beyond that same width negative — each ALSO bounded in X to
 * BALL_SOCKET_FORK_PRONG_HALF_WIDTH, comfortably short of the cell's own wall. Bounding both axes
 * (not just the one that splits the two caps from each other) is what leaves open air on the
 * LEFT and RIGHT of each prong too, not only between them — "open sides" (plural), matching the
 * real part's own name, rather than a single slot cut straight through.
 */
export async function ballSocketForkKeeperGeometry(
  channelLength: number,
  axis: HoleAxis,
  flip = false,
): Promise<THREE.BufferGeometry> {
  const half = channelLength / 2 + CUT_EPSILON;
  const portSign = flip ? -1 : 1;
  const cellHalf = STUD_PITCH / 2;
  const overhang = 1; // past the cell's own wall, for a clean intersect at that outer edge only
  // On a short cell (e.g. a 1-plate z-axis ball joint) the "ideal" fork depth wouldn't fit without
  // reaching past the bore's own centreline — clamp so the fork stops at most halfway in.
  const forkDepth = Math.min(BALL_SOCKET_FORK_DEPTH, half);

  const portFaceY = portSign * half; // a TRUE outer boundary of the whole geometry
  const farEndY = -portFaceY; // the OTHER true outer boundary
  const innerY = portFaceY - portSign * forkDepth; // internal seam only — not a real edge

  // Extends a [lo, hi] interval by `overhang` on whichever end is a true outer boundary
  // (matches portFaceY or farEndY), and by nothing on the end that's actually the shared innerY
  // seam with the other region. The fork region and the "back" (full-material) region meet
  // EXACTLY at innerY, with NO overlap — an earlier version gave that seam the same small overhang
  // the true outer edges get, on the assumption more margin is always safer; it wasn't. Two boxes
  // with genuinely DIFFERENT cross-sections (one full-square, one bounded-caps) overlapping by even
  // a hair at a large, otherwise near-coincident shared face is exactly the near-degenerate case
  // this project's CSG engine handles worst (see roundCellCorners' own doc on tangent radii for the
  // same failure mode elsewhere). An exact, non-overlapping shared boundary — different shapes
  // meeting at a clean seam, not fighting over the same sliver of space — has no such ambiguity.
  const extendToOuterEdges = (lo: number, hi: number): [number, number] => [
    lo === portFaceY || lo === farEndY ? lo - overhang : lo,
    hi === portFaceY || hi === farEndY ? hi + overhang : hi,
  ];

  const [forkYLo, forkYHi] = extendToOuterEdges(Math.min(portFaceY, innerY), Math.max(portFaceY, innerY));
  const forkLength = forkYHi - forkYLo;
  const forkCenterY = (forkYLo + forkYHi) / 2;

  // Each prong is bounded in BOTH the direction it's split from its twin (Z, top vs bottom) AND
  // the "open sides" direction (X) — the earlier version of this function only bounded Z, which
  // opened a single slot straight through top-to-bottom but left the prongs still spanning the
  // FULL cell width in X, i.e. still closed at the sides. Bounding X too (well short of the
  // cell's own STUD_PITCH/2 wall) is what actually leaves open air to the left and right, matching
  // "open sides" (plural) rather than a single slot.
  const capDepth = cellHalf + overhang - BALL_SOCKET_FORK_OPEN_HALF_WIDTH;
  const capBox = (zSign: 1 | -1) => {
    const box = new THREE.BoxGeometry(BALL_SOCKET_FORK_PRONG_HALF_WIDTH * 2, forkLength, capDepth);
    box.translate(0, forkCenterY, zSign * (BALL_SOCKET_FORK_OPEN_HALF_WIDTH + capDepth / 2));
    return box;
  };

  let keeper: THREE.BufferGeometry = capBox(1);
  keeper = await union(keeper, capBox(-1));

  // The rest of the bore (away from the port) — kept in full (unbounded in X/Z), no fork applied
  // there; there's no second port back there to open one around.
  const [backYLo, backYHi] = extendToOuterEdges(Math.min(farEndY, innerY), Math.max(farEndY, innerY));
  if (backYHi - backYLo > CUT_EPSILON) {
    const backSpan = (cellHalf + overhang) * 2;
    const backBox = new THREE.BoxGeometry(backSpan, backYHi - backYLo, backSpan);
    backBox.translate(0, (backYLo + backYHi) / 2, 0);
    keeper = await union(keeper, backBox);
  }

  return orientAlongAxis(keeper, axis);
}
