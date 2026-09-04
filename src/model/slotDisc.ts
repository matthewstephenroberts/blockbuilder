import { PlateFraction } from "./cellTypes";
import { blockBodySizeMm, PLATE_HEIGHT, STUD_PITCH } from "./units";

/** What the disc's centre is bored for — normally an axle, to drive it straight off a motor. */
export type DiscBore = "axleHole" | "technicHole" | "none";

/** Which face(s) of the disc a pocket's lead-in chamfer is cut into. */
export type DiscOuterShape = "round" | "square";

export type DiscChamferSides = "both" | "top" | "bottom";

/**
 * A rotating disc with a ring of square pockets in it — a carousel/dispenser wheel: an axle bore
 * at the centre, and N pockets evenly spaced around a ring, each sized to take a 1x1 block. The
 * material left between the pockets IS the spoke pattern; there's no separate spoke element,
 * because a spoke is just "the wall between two pockets".
 *
 * Like AngledBeam, this can't be built out of cells and isn't one. A cell grid is square and
 * axis-aligned, so an N-fold radial pattern is only expressible for N of 4 (and, awkwardly, 8);
 * six evenly-spaced pockets have no representation at all. The grid also has no way to REMOVE
 * material — every cell type adds — and a pocket is a subtraction. Both of those are structural,
 * not gaps that more cell types would fill.
 */
export interface SlotDisc {
  id: string;
  layer: number;
  /** Grid cell whose centre is the disc's own centre (and its bore). */
  centreX: number;
  centreY: number;
  /** How many pockets around the ring. */
  slots: number;
  /** Pocket size in studs, square — 1 for a 1x1 block. */
  slotStuds: number;
  /**
   * TOTAL extra width (mm) the pocket has over the block's own body — so half of it is the gap on
   * each side. A pocket a block has to fall freely through wants noticeably more than a connector
   * fit does: an FDM-printed vertical pocket comes out undersized, its inside corners are rounded
   * by the nozzle where the block's are sharper, and a carousel that binds under load is worse
   * than one that rattles.
   */
  slotClearance: number;
  /**
   * Distance (studs) from the disc's centre to each pocket's centre. Left undefined, it's derived
   * (see `autoRingRadiusStuds`) as the smallest radius at which the pockets still clear each other
   * — which is what you want almost always, since a bigger radius is just a bigger disc.
   */
  ringRadiusStuds?: number;
  /** Material (mm) left outside the pockets — the disc's own rim. */
  rimMm: number;
  bore: DiscBore;
  /**
   * Pocket floor thickness in plates. 0 means the pockets go straight through, so a block drops
   * out of the bottom as the disc turns — the usual dispenser. Non-zero leaves a floor, making
   * them carrier pockets that hold their block until something pushes it out.
   */
  floorPlates: number;
  /** Opens each pocket through the rim, so a block can also be pushed out sideways. */
  openOuter?: boolean;
  /**
   * A lead-in chamfer (mm) around each pocket's mouth — the pocket flares out by this much at the
   * face, then runs at its nominal size.
   *
   * Clearance alone doesn't stop a block binding, because binding usually isn't a "too tight"
   * failure: a block arriving even slightly off-centre or off-square catches its bottom edge on the
   * sharp rim of the hole and stops there. A chamfer turns that edge into a ramp that pushes the
   * block into line as it drops, which is why it matters most on the gate plate — the one hole a
   * block has to find on its own, with nothing guiding it. Both mouths are chamfered on a
   * through-pocket; a floored one only has a top.
   */
  slotChamferMm: number;
  /**
   * Which face(s) get the chamfer. A carousel usually wants it on the face blocks are LOADED from
   * and a clean flat face on the other, so the block leaves without a lip to catch on; a gate plate
   * wants it on the face blocks arrive at. "both" (the default) is right when the part is
   * reversible or hand-loaded from either side.
   *
   * A floored pocket only opens at the top, so it can only ever be chamfered there whatever this
   * says — see `chamferedSides`.
   */
  slotChamferSides: DiscChamferSides;
  /** Rotates the whole pocket ring — for lining a pocket up with a chute or a sensor. */
  startAngleDeg: number;
  /**
   * Which of the ring's positions are actually cut, index-aligned with the slots (0 is at
   * `startAngleDeg`). Undefined — the normal case — means all of them.
   *
   * This is what makes a two-part dispenser possible. The carousel disc has every position open
   * and carries the blocks; a GATE PLATE on the layer below shares the same ring geometry but has
   * only ONE position open, so a block is held up by the plate everywhere except where the two
   * line up, and drops through exactly once per position as the disc turns. Entries past `slots`
   * are ignored rather than trimmed, so changing the slot count and changing it back doesn't
   * discard the pattern.
   */
  slotEnabled?: boolean[];
  /**
   * The shape of the disc's outer edge. "round" is the turning carousel; "square" squares it off to
   * the same half-width, which is what you want when the disc has to sit flush inside a square cell
   * footprint — a round rim inside a square pocket leaves triangular gaps at the corners.
   */
  outerShape?: DiscOuterShape;
  /** Disc thickness in Z, on the same scale a cell uses. */
  plateFraction?: PlateFraction;
}

/** Minimum wall (mm) the auto ring radius leaves between two neighbouring pockets. */
export const MIN_SLOT_WALL = 2;

/** How much rim `ringRadiusForRim` leaves outside the pockets when pushing them out to the edge. */
export const MIN_DISC_RIM = 2;

/** A pocket's true size in mm: the block's own BODY size (not its stud pitch — see
 * blockBodySizeMm) plus the clearance. */
export function slotSizeMm(disc: SlotDisc, pitch: number = STUD_PITCH): number {
  return blockBodySizeMm(disc.slotStuds, pitch) + disc.slotClearance;
}

/**
 * The chamfer actually applied, clamped so the two mouths can't eat the whole pocket: a
 * through-pocket in a thin plate has to keep a straight section between them or it stops being a
 * pocket and becomes a funnel that a block falls straight through without being held at all.
 */
/**
 * The faces a pocket's chamfer is actually cut into: what `slotChamferSides` asks for, minus what
 * the pocket doesn't have. A floored pocket has no bottom opening, so a chamfer there would be cut
 * into the middle of the floor rather than around a mouth.
 */
export function chamferedSides(disc: SlotDisc): ("top" | "bottom")[] {
  const asked = disc.slotChamferSides ?? "both";
  // A floored pocket has exactly one mouth, so the chamfer goes there — REDIRECTED, not dropped.
  // Filtering "bottom" out instead left a floored pocket asked for a bottom chamfer with no
  // chamfer at all: the setting silently did nothing rather than doing the only thing it could.
  if (Math.max(0, disc.floorPlates) > 0) return ["top"];
  return asked === "both" ? ["top", "bottom"] : [asked];
}

/** The largest ramp a pocket of this depth will take, per face. */
export const MAX_CHAMFER_FRACTION = 0.4;

/**
 * How deep the pocket actually is in MATERIAL — the disc's own thickness, less any floor.
 *
 * Not the same as the pocket cutter's height, which deliberately overshoots to span the whole
 * LAYER so nothing above or below can plug the hole. Clamping the chamfer against the cutter (what
 * this did) let a disc thinner than its layer accept a far bigger ramp than its own material could
 * take: a 6.4mm disc sitting in a 9.6mm layer allowed 3.88mm per face, so two 3mm ramps ate 6mm of
 * the 6.4mm and met in the middle — a funnel, not a pocket. It also disagreed with the panel, which
 * was already measuring against the disc's thickness.
 */
/** A pocket floor's thickness in mm — `floorPlates` plates, at the layer's own scale. A plate is
 * 3.2mm on the 8mm system and scales with the pitch like every other height (see
 * geometry.ts's fixedPlateHeight), so a floor keeps the same proportion of a 10mm disc. */
export function floorThicknessMm(disc: SlotDisc, pitch: number = STUD_PITCH): number {
  return Math.max(0, disc.floorPlates) * PLATE_HEIGHT * (pitch / STUD_PITCH);
}

export function pocketDepthMm(disc: SlotDisc, discThicknessMm: number, pitch: number = STUD_PITCH): number {
  return Math.max(0, discThicknessMm - floorThicknessMm(disc, pitch));
}

export function effectiveChamferMm(disc: SlotDisc, cutDepthMm: number): number {
  // `?? 0`, not a bare read: a disc saved before mouth chamfers existed has no value at all, and
  // `undefined` propagates silently through the arithmetic as NaN rather than failing anywhere
  // visible. The geometry happens to survive it (NaN > 0 is false, so the cutters are skipped) but
  // the UI does not — an input handed `undefined` goes uncontrolled and stops accepting edits.
  const requested = disc.slotChamferMm ?? 0;
  if (requested <= 0 || cutDepthMm <= 0) return 0;
  // Deliberately independent of how many faces are being chamfered. Dividing the allowance between
  // the ramps (what this did first) meant switching Both -> Top only DOUBLED the ramp actually cut,
  // because the same allowance no longer had to be shared — so a control that picks WHICH faces get
  // a chamfer silently changed HOW BIG it was. The number typed in the box should be the number you
  // get, whichever faces it lands on; capping each ramp against the depth on its own does that, and
  // still leaves a straight section at the worst case of both faces cut to the limit.
  return Math.min(requested, cutDepthMm * MAX_CHAMFER_FRACTION);
}

/**
 * A disc with every field present, filling in anything a project saved before that field existed
 * doesn't carry. Applied on load and whenever a disc is read back into the pickers, so nothing
 * downstream has to keep guessing whether a value is really there.
 *
 * Missing values are filled with what PRESERVES the part, not with what a new disc would get:
 * `slotChamferMm` defaults to 0 here rather than DEFAULT_DISC_SETTINGS' 0.8, because a disc saved
 * before mouth chamfers existed was designed without them, and loading a file should never quietly
 * reshape the part it describes.
 */
export function normalizeSlotDisc(disc: SlotDisc): SlotDisc {
  return {
    ...DEFAULT_DISC_SETTINGS,
    ...disc,
    slotChamferMm: disc.slotChamferMm ?? 0,
    slotChamferSides: disc.slotChamferSides ?? "both",
    outerShape: disc.outerShape ?? "round",
  };
}

/** The gap (mm) between the block and the pocket wall on each side. */
export function slotGapPerSideMm(disc: SlotDisc): number {
  return disc.slotClearance / 2;
}

/**
 * The wall (mm) actually left between two neighbouring pockets — negative when they overlap, which
 * severs the spoke between them and can leave the hub as a loose piece.
 *
 * Measured at a pocket's INNER CORNER, which is the binding constraint and not an obvious one. A
 * pocket is a rectangle of fixed width, but the space available to it is a wedge that narrows
 * toward the centre — so the closer to the hub you look, the more of the wedge the rectangle's
 * full width takes up. Measuring the chord between pocket CENTRES instead (the obvious formula,
 * and what this did first) describes the gap only at the ring radius itself and reports a healthy
 * 2mm wall for discs whose pockets are frankly overlapping nearer the hub.
 *
 * Distance from the corner to the bisector between the two pockets, doubled (each pocket eats into
 * the wall from its own side).
 */
export function slotWallMm(disc: SlotDisc, pitch: number = STUD_PITCH): number {
  const size = slotSizeMm(disc, pitch);
  const n = Math.max(2, disc.slots);
  const innerRadius = ringRadiusMm(disc, pitch) - size / 2;
  if (innerRadius <= 0) return -Infinity;
  const corner = Math.hypot(innerRadius, size / 2);
  const cornerAngle = Math.atan2(size / 2, innerRadius);
  const halfWedge = Math.PI / n;
  if (cornerAngle >= halfWedge) return -corner * 2; // frankly overlapping; sign is what matters
  return 2 * corner * Math.sin(halfWedge - cornerAngle);
}

/**
 * The smallest ring radius (studs) at which `slots` pockets still leave MIN_SLOT_WALL between
 * neighbours. `slotWallMm` grows monotonically with the radius (push the pockets outward and the
 * wedge they sit in widens), so a bisection finds the smallest radius that clears it — there's no
 * closed form once the measurement is taken at the corner rather than the centre.
 */
export function autoRingRadiusStuds(disc: SlotDisc, pitch: number = STUD_PITCH): number {
  const size = slotSizeMm(disc, pitch);
  let lo = size / 2 + 0.01;
  let hi = Math.max(lo * 2, size * Math.max(2, disc.slots));
  const wallAt = (radiusMm: number) => slotWallMm({ ...disc, ringRadiusStuds: radiusMm / pitch }, pitch);
  // Guard against a slot count so high that even `hi` is too tight to fit them.
  for (let i = 0; i < 40 && wallAt(hi) < MIN_SLOT_WALL; i++) hi *= 1.5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (wallAt(mid) < MIN_SLOT_WALL) lo = mid;
    else hi = mid;
  }
  return hi / pitch;
}

export function ringRadiusMm(disc: SlotDisc, pitch: number = STUD_PITCH): number {
  return (disc.ringRadiusStuds ?? autoRingRadiusStuds(disc, pitch)) * pitch;
}

/**
 * The disc's own outer radius — far enough out that the rim is `rimMm` thick even at a pocket's
 * outer CORNER, which is further from the centre than its outer face is.
 */
/**
 * The half-width a SQUARE disc snaps out to, so its edge lands on a cell boundary.
 *
 * A cell centre sits at a multiple of STUD_PITCH from the grid's centre, so cell BOUNDARIES sit at
 * half a pitch either side — 4, 12, 20, 28mm and so on. A square built to the raw radius stops
 * part-way across whichever cell it lands in, which is why it doesn't meet the cells around it: it
 * overlaps one by a fraction of a stud instead of butting up against the next boundary. Snapping
 * OUT (never in) keeps every pocket where it was and only adds waste corner material.
 */
function snapToCellBoundary(radius: number, pitch: number = STUD_PITCH): number {
  const halfPitch = pitch / 2;
  if (radius <= halfPitch) return halfPitch;
  return halfPitch + pitch * Math.ceil((radius - halfPitch) / pitch);
}

/** The radius the ring geometry actually needs, before a square disc snaps out to the grid. */
export function unsnappedOuterRadiusMm(disc: SlotDisc, partClearance = 0, pitch: number = STUD_PITCH): number {
  const half = slotSizeMm(disc, pitch) / 2;
  return Math.hypot(ringRadiusMm(disc, pitch) + half, half) + disc.rimMm - partClearance;
}

export function outerRadiusMm(disc: SlotDisc, partClearance = 0, pitch: number = STUD_PITCH): number {
  const half = slotSizeMm(disc, pitch) / 2;
  const cornerRadius = Math.hypot(ringRadiusMm(disc, pitch) + half, half);
  if (disc.outerShape === "square") {
    // Snapped BEFORE the clearance comes off, so the clearance still opens a real running gap
    // against the neighbour rather than being swallowed by the snap.
    return snapToCellBoundary(cornerRadius + disc.rimMm, pitch) - partClearance;
  }
  // partClearance pulls the rim in, the same inward offset it applies to a cell's outer skin —
  // this is a part meant to TURN inside something else, so it's exactly the case that setting is
  // for. Cells honoured it and discs didn't, which meant a disc and the housing it runs in were
  // both built to the same nominal size and wouldn't go together.
  return cornerRadius + disc.rimMm - partClearance;
}

/**
 * The smallest hollow CircleSolid ring (see circleSolidGeometry.ts) whose bore this disc actually
 * turns inside, and how much room is left over. A hollow ring's inner radius is quantised to
 * `(dimension - 1) / 2` studs, while a disc's outer radius is a free millimetre value, so the two
 * only line up by luck — this is what turns "print a housing for it" from trial and error into a
 * number.
 *
 * Only ODD dimensions are offered, and that restriction is the whole point: an even-dimension
 * circle group's true centre falls on a cell CORNER, while a disc is centred on a cell CENTRE, so
 * an even ring can never be concentric with the disc it's supposed to hold — it sits half a stud
 * out on each axis. The bore would measure right and the assembly still wouldn't turn.
 */
/**
 * The ring radius (studs) that keeps this disc's CURRENT outer diameter while leaving only
 * `targetRimMm` outside the pockets — i.e. push the pockets out to the edge without growing the
 * disc.
 *
 * Ring radius and rim are independent, which is right but leaves one obvious move unreachable: the
 * disc's size is usually fixed by whatever it has to fit inside, and within that size you want the
 * pockets as far out as they'll go, because the wedge each one sits in widens with radius and so
 * the spokes between them get thicker. Turning up the ring radius on its own just grows the whole
 * disc and the pockets stay proportionally where they were; the two have to move together.
 *
 * Inverts outerRadiusMm: outer = hypot(ring + half, half) + rim - partClearance.
 */
export function ringRadiusForRim(disc: SlotDisc, targetRimMm: number, partClearance = 0, pitch: number = STUD_PITCH): number {
  const half = slotSizeMm(disc, pitch) / 2;
  const outer = outerRadiusMm(disc, partClearance, pitch);
  const cornerRadius = outer + partClearance - targetRimMm;
  if (cornerRadius <= half) return disc.ringRadiusStuds ?? autoRingRadiusStuds(disc, pitch);
  return (Math.sqrt(cornerRadius * cornerRadius - half * half) - half) / pitch;
}

/** A running gap (mm, per side) between a disc and the bore it turns in — enough to spin freely
 * without the wobble a several-millimetre gap gives. */
export const DISC_RUNNING_GAP = 0.4;

/**
 * The `rimMm` that would make this disc just run inside the given hollow ring — i.e. take up the
 * slack a quantised ring bore leaves. A ring's bore comes in 8mm steps while a disc's diameter is
 * whatever its slot geometry works out to, so the two are almost never a running fit by default;
 * growing the rim to close the gap is the adjustment that makes them one, and it adds material
 * where the disc wants it anyway.
 */
export function rimForRingFit(disc: SlotDisc, dimension: number, partClearance = 0, pitch: number = STUD_PITCH): number {
  const innerRadius = ((dimension - 1) / 2) * pitch;
  const half = slotSizeMm(disc, pitch) / 2;
  const cornerRadius = Math.hypot(ringRadiusMm(disc, pitch) + half, half);
  // outerRadiusMm = cornerRadius + rim - partClearance, and we want that to be
  // innerRadius - DISC_RUNNING_GAP.
  return Math.max(0, innerRadius - DISC_RUNNING_GAP - cornerRadius + partClearance);
}

export function fittingHollowRing(
  disc: SlotDisc,
  partClearance = 0,
  pitch: number = STUD_PITCH,
): { dimension: number; innerDiameterMm: number; slackMm: number } {
  const outer = outerRadiusMm(disc, partClearance, pitch);
  // Ring bore radius for dimension d is (d - 1) / 2 studs; solve for the smallest d that clears.
  const smallest = Math.ceil((2 * outer) / pitch + 1);
  const dimension = Math.max(3, smallest % 2 === 0 ? smallest + 1 : smallest);
  const innerRadius = ((dimension - 1) / 2) * pitch;
  return { dimension, innerDiameterMm: innerRadius * 2, slackMm: innerRadius - outer };
}

/** Material (mm) left between the centre bore and the inner face of a pocket. */
export function hubWallMm(disc: SlotDisc, boreRadiusMm: number, pitch: number = STUD_PITCH): number {
  return ringRadiusMm(disc, pitch) - slotSizeMm(disc, pitch) / 2 - boreRadiusMm;
}

/**
 * The subset of a disc that the brush carries — everything except where it sits and how thick it
 * is (position comes from the click, thickness from the shared Plate height picker). Kept as one
 * object rather than a dozen separate store fields: a disc has enough parameters that the
 * one-state-and-setter-per-field shape the other brushes use stops being readable.
 */
export type SlotDiscSettings = Pick<
  SlotDisc,
  | "slots"
  | "slotStuds"
  | "slotClearance"
  | "ringRadiusStuds"
  | "rimMm"
  | "bore"
  | "floorPlates"
  | "openOuter"
  | "slotChamferMm"
  | "slotChamferSides"
  | "startAngleDeg"
  | "outerShape"
>;

/**
 * NOTE: `slotEnabled` is deliberately NOT part of SlotDiscSettings. Every other field describes a
 * KIND of disc and makes sense as a brush default, but the open/closed mask describes one specific
 * disc's positions. Carrying it in the brush meant that selecting a gate plate loaded its "only
 * position 1 open" mask into the brush, and every disc painted afterwards silently came out almost
 * entirely solid. The mask is edited only on a selected disc — see setSlotMask in useProjectStore.
 */

export const DEFAULT_DISC_SETTINGS: SlotDiscSettings = {
  slots: 8,
  slotStuds: 1,
  slotClearance: 0.8,
  ringRadiusStuds: undefined,
  rimMm: 3,
  bore: "axleHole",
  floorPlates: 0,
  openOuter: false,
  slotChamferMm: 0.8,
  slotChamferSides: "both",
  startAngleDeg: 0,
  outerShape: "round",
};

/** Whether position `index` is actually cut — see SlotDisc.slotEnabled. */
export function isSlotOpen(disc: SlotDisc, index: number): boolean {
  return disc.slotEnabled?.[index] ?? true;
}

export function openSlotCount(disc: SlotDisc): number {
  let count = 0;
  for (let i = 0; i < disc.slots; i++) if (isSlotOpen(disc, i)) count++;
  return count;
}

/**
 * `slotEnabled` with position `index` set — padded with `true` up to that position, and dropped
 * entirely when every position is open again, so the common "all of them" case goes back to
 * carrying no array (and reads that way in a saved project).
 */
export function withSlotOpen(disc: SlotDisc, index: number, open: boolean): boolean[] | undefined {
  const next = [...(disc.slotEnabled ?? [])];
  while (next.length <= Math.max(index, disc.slots - 1)) next.push(true);
  next[index] = open;
  return next.some((v) => v === false) ? next : undefined;
}

/** Every position open (undefined) or every position closed but the first — the gate plate. */
export function allSlotsOpen(): undefined {
  return undefined;
}

let nextDiscId = 0;

export function createSlotDisc(layer: number, centreX: number, centreY: number): SlotDisc {
  return {
    id: `disc-${Date.now().toString(36)}-${nextDiscId++}`,
    layer,
    centreX,
    centreY,
    // A 1x1 block is nominally 8mm and prints slightly over; a pocket it has to drop freely
    // through (not press into) wants noticeably more room than a pin hole does — hence the 0.4mm
    // in DEFAULT_DISC_SETTINGS rather than the tighter clearances used for connector fits.
    ...DEFAULT_DISC_SETTINGS,
    plateFraction: "module",
  };
}

export function describeSlotDisc(disc: SlotDisc): string {
  const diameter = (outerRadiusMm(disc) * 2).toFixed(1);
  const open = openSlotCount(disc);
  const slots = open === disc.slots ? `${disc.slots} slots` : `${open} of ${disc.slots} slots`;
  return `${slots} · ⌀${diameter}mm @ (${disc.centreX}, ${disc.centreY})`;
}
