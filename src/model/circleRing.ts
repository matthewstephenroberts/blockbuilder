import { PlateFraction } from "./cellTypes";

/**
 * One circular arrangement of cells — the thing a "Circle solid" brush stroke actually places.
 *
 * The cells are still real cells (unlike a beam or a slot disc, which can't be cells at all): a
 * circle IS a square block of cells, each cut back to its own slice of one shared circle. What
 * ISN'T per-cell is the circle — its size, its centre, whether it's hollow, whether its outer edge
 * stays square. Those describe the GROUP, and storing them on every member cell (as this used to)
 * meant a 13x13 ring carried 169 identical copies of the same five fields, an edit to any one of
 * them had to fan out across the group by hand, and moving the circle meant repainting it.
 *
 * So the ring owns them, and a member cell carries nothing but `circleId` pointing back here. Its
 * position within the group — which slice of the circle it is — is DERIVED from where it sits
 * relative to the ring's own origin (see `ringColRow`), so it can't fall out of step with the
 * ring the way a stored copy could.
 *
 * Partial circles need no extra machinery as a result: a cell is part of the ring exactly when it
 * carries the id, so erasing one cell of a 2x2 leaves the other three still cut to the SAME shared
 * circle — the corner block with the correct arc on it, which is the whole reason to build a
 * circle out of cells rather than as one solid part.
 */
export interface CircleRing {
  id: string;
  layer: number;
  /**
   * The group's minimum-X/minimum-Y cell — the corner of its `dimension x dimension` footprint,
   * NOT its centre. An even-sized group has no centre cell to name, so a corner is the only
   * anchor that's exact for every dimension.
   */
  originX: number;
  originY: number;
  /** Group size: 2 means 2x2, 13 means 13x13. Outer radius is `dimension / 2` studs. */
  dimension: number;
  /** Bores a concentric inner circle one stud smaller in radius — the ring/washer shape. */
  hollow: boolean;
  /** Leaves the outer boundary square instead of curving it, so the group tiles flush with cells
   * painted outside it. Independent of `hollow`: both together is a square block with a round
   * hole through it. */
  outerSquare: boolean;
  /** Defaults for cells painted into this ring — the cells keep their own copies, so an
   * individual cell can still differ. */
  plateFraction?: PlateFraction;
  rounded?: boolean;
}

let ringSeq = 0;

export function createCircleRing(
  layer: number,
  centreX: number,
  centreY: number,
  dimension: number,
  init?: Partial<Omit<CircleRing, "id" | "layer" | "originX" | "originY" | "dimension">>,
): CircleRing {
  ringSeq += 1;
  return {
    id: `circle-${Date.now().toString(36)}-${ringSeq}`,
    layer,
    ...originForCentre(centreX, centreY, dimension),
    dimension,
    hollow: false,
    outerSquare: false,
    ...init,
  };
}

/**
 * The footprint corner a group centred on (centreX, centreY) starts at. An odd dimension centres
 * exactly on the clicked cell; an even one has to lean one way, and leaning toward -X/-Y matches
 * what the old `withCircleGroup` did, so existing muscle memory (and existing files) still land
 * the group in the same place.
 */
export function originForCentre(
  centreX: number,
  centreY: number,
  dimension: number,
): { originX: number; originY: number } {
  const back = Math.floor((dimension - 1) / 2);
  return { originX: centreX - back, originY: centreY - back };
}

/** The cell a group of this dimension would be centred on, given its origin — the inverse of
 * `originForCentre`, used when resizing a ring in place so it grows about its own middle. */
export function centreForOrigin(ring: Pick<CircleRing, "originX" | "originY" | "dimension">): {
  centreX: number;
  centreY: number;
} {
  const back = Math.floor((ring.dimension - 1) / 2);
  return { centreX: ring.originX + back, centreY: ring.originY + back };
}

/** True when (x, y) is inside the ring's `dimension x dimension` footprint — which is not the same
 * as being a MEMBER of it: a cell in the footprint only belongs once it carries the ring's id. */
export function ringContains(ring: CircleRing, x: number, y: number): boolean {
  return (
    x >= ring.originX &&
    x < ring.originX + ring.dimension &&
    y >= ring.originY &&
    y < ring.originY + ring.dimension
  );
}

/**
 * Which slice of the shared circle the cell at (x, y) is — the (col, row) `buildCircleSolidGeometry`
 * wants, or null if that cell isn't in the footprint at all.
 *
 * `row` counts DOWN from the group's top while grid y counts UP (see GridEditor's own cellAt note),
 * which is the same inversion the geometry and the old per-cell `circleRow` both carried. Deriving
 * it here means exactly one place has to get that right.
 */
export function ringColRow(ring: CircleRing, x: number, y: number): { col: number; row: number } | null {
  if (!ringContains(ring, x, y)) return null;
  return { col: x - ring.originX, row: ring.originY + ring.dimension - 1 - y };
}

/** Every cell coordinate in the ring's footprint, in row-major grid order. */
export function ringFootprint(ring: CircleRing): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let dy = 0; dy < ring.dimension; dy++) {
    for (let dx = 0; dx < ring.dimension; dx++) {
      cells.push({ x: ring.originX + dx, y: ring.originY + dy });
    }
  }
  return cells;
}

/**
 * Fills in anything a ring saved by an older build is missing, for the same reason
 * `normalizeSlotDisc` exists: an absent boolean reaching a toggle as `undefined` makes it an
 * uncontrolled input that stops responding to clicks.
 */
export function normalizeCircleRing(ring: CircleRing): CircleRing {
  return {
    ...ring,
    dimension: Math.max(2, Math.round(ring.dimension ?? 2)),
    hollow: ring.hollow ?? false,
    outerSquare: ring.outerSquare ?? false,
  };
}
