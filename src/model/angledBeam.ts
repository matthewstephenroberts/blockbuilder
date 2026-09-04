import { PlateFraction } from "./cellTypes";
import {
  CELL_BUILT_HALF,
  PIN_HOLE_BOSS_RADIUS,
  PIN_HOLE_RADIUS,
  STUD_HOLE_RADIUS,
  STUD_PITCH,
} from "./units";

/**
 * What each hole along an angled beam is bored as. Mirrors the equivalent grid cell types
 * (see CellType), but a beam carries ONE choice for all of its holes rather than one per cell —
 * a real angled liftarm is a single moulded part with a uniform hole pattern.
 */
export type BeamHoleType = "technicHole" | "axleHole" | "studHole" | "none";

/**
 * Which way an angled beam's holes bore.
 *
 * - "z" — vertically, straight through the beam's top and bottom faces. This is the flat liftarm
 *   lying on the build plate: the beam runs diagonally across the X/Y plane and every hole is a
 *   normal vertical Technic hole, so it pins to anything below or above it. This is the
 *   orientation an angled liftarm is normally used in.
 * - "perpendicular" — horizontally, square to the beam's own run and still in the X/Y plane
 *   (i.e. at the beam's angle + 90°). This is the beam standing on edge, the way a grid cell's
 *   "x"/"y" hole bores sideways — except the bore direction now follows the beam's angle instead
 *   of being locked to a world axis. This is what makes a diagonal beam's holes point diagonally.
 */
export type BeamHoleAxis = "z" | "perpendicular";

/**
 * A direction a beam can run at, as an integer grid vector plus the angle it works out to.
 *
 * `legalPeriod` is the crux of whether a given angle is actually *buildable* as part of a larger
 * assembly. A beam's holes sit at the standard 8mm pitch along the beam's OWN axis, so its far
 * end only lands back on a grid hole centre when the run length is a whole number of studs in
 * both X and Y at once — i.e. when (dx, dy, hypot) is a Pythagorean triple. When it is,
 * `legalPeriod` is that hypotenuse: every `legalPeriod` hole-spacings the far end lands exactly on
 * the grid again, so a 6-hole 36.87° beam (5 spacings = one period) pins at BOTH ends. When it
 * isn't (45° among them — √2 is irrational, so no whole number of 8mm steps along a 45° line ever
 * lands on the grid), `legalPeriod` is null: the beam still pins perfectly at its anchor end and
 * anywhere its own holes are used, but its far end will not line up with a grid hole. That's not a
 * bug in this app — it's why real Technic reaches 45° through pin joints and dedicated angled
 * parts rather than through a beam spanning two fixed hole positions.
 */
export interface BeamAngleOption {
  id: string;
  label: string;
  /** Direction vector in studs. Always in the first quadrant; `AngledBeam.mirror` gives the other. */
  dx: number;
  dy: number;
  degrees: number;
  legalPeriod: number | null;
  note: string;
}

export const BEAM_ANGLE_OPTIONS: readonly BeamAngleOption[] = [
  { id: "a0", label: "0° — straight (1:0)", dx: 1, dy: 0, degrees: 0, legalPeriod: 1, note: "Axis-aligned; every hole lands on the grid." },
  { id: "a18", label: "18.43° (3:1)", dx: 3, dy: 1, degrees: 18.434948822922, legalPeriod: null, note: "Anchor end only — 3:1 is not a Pythagorean direction." },
  { id: "a22", label: "22.62° (12:5)", dx: 12, dy: 5, degrees: 22.619864948041, legalPeriod: 13, note: "Both ends land on the grid every 13 hole-spacings (14 holes)." },
  { id: "a26", label: "26.57° (2:1)", dx: 2, dy: 1, degrees: 26.565051177078, legalPeriod: null, note: "Anchor end only — 2:1 is not a Pythagorean direction." },
  { id: "a28", label: "28.07° (15:8)", dx: 15, dy: 8, degrees: 28.072486935853, legalPeriod: 17, note: "Both ends land on the grid every 17 hole-spacings (18 holes)." },
  { id: "a36", label: "36.87° (4:3)", dx: 4, dy: 3, degrees: 36.869897645844, legalPeriod: 5, note: "The classic 3-4-5 brace. Both ends land on the grid every 5 hole-spacings (6, 11, 16… holes)." },
  { id: "a45", label: "45° (1:1)", dx: 1, dy: 1, degrees: 45, legalPeriod: null, note: "Anchor end only — no whole number of 8mm steps along a 45° line ever lands back on the grid." },
  { id: "a53", label: "53.13° (3:4)", dx: 3, dy: 4, degrees: 53.130102354156, legalPeriod: 5, note: "The 3-4-5 brace the other way up. Both ends land on the grid every 5 hole-spacings (6, 11, 16… holes)." },
  { id: "a61", label: "61.93° (8:15)", dx: 8, dy: 15, degrees: 61.927513064147, legalPeriod: 17, note: "Both ends land on the grid every 17 hole-spacings (18 holes)." },
  { id: "a63", label: "63.43° (1:2)", dx: 1, dy: 2, degrees: 63.434948822922, legalPeriod: null, note: "Anchor end only — 1:2 is not a Pythagorean direction." },
  { id: "a67", label: "67.38° (5:12)", dx: 5, dy: 12, degrees: 67.380135051959, legalPeriod: 13, note: "Both ends land on the grid every 13 hole-spacings (14 holes)." },
  { id: "a71", label: "71.57° (1:3)", dx: 1, dy: 3, degrees: 71.565051177078, legalPeriod: null, note: "Anchor end only — 1:3 is not a Pythagorean direction." },
  { id: "a90", label: "90° — straight (0:1)", dx: 0, dy: 1, degrees: 90, legalPeriod: 1, note: "Axis-aligned; every hole lands on the grid." },
];

/** `AngledBeam.angleId` when the beam runs at a hand-entered angle instead of a preset. */
export const CUSTOM_ANGLE_ID = "custom";

/**
 * A Technic beam running at an arbitrary angle across the X/Y plane, living alongside the cell
 * grid rather than inside it.
 *
 * The cell grid can only ever express geometry on 90° axes — that's what a grid IS — so an angled
 * beam can't be a cell type without giving up the one thing that makes a beam a beam: holes at a
 * true 8mm pitch along its own run. (A "diagonal" cell type would space its holes 8·√2 ≈ 11.3mm
 * apart, which mates with nothing.) Modelling it as a separate element keeps the beam's own axis
 * authoritative — holes at the real pitch, along the real angle — while still anchoring it to the
 * grid so it lines up with everything already painted.
 */
export interface AngledBeam {
  id: string;
  /** Which layer the beam sits in — it takes that layer's own base height, like any cell. */
  layer: number;
  /** Grid cell whose centre is the beam's FIRST hole. The beam runs from here at its own angle. */
  anchorX: number;
  anchorY: number;
  /** A `BEAM_ANGLE_OPTIONS` id, or `CUSTOM_ANGLE_ID`. */
  angleId: string;
  /** Only read when `angleId` is `CUSTOM_ANGLE_ID`. Degrees CCW from +X. */
  customDegrees?: number;
  /**
   * Mirrors the angle about the X axis (negates it). With `reverse`, this is what reaches all four
   * quadrants from a preset list that only covers 0°…90° — see BEAM_QUADRANTS.
   */
  mirror?: boolean;
  /**
   * Points the beam back the other way (adds 180°). Without it a beam could only ever run into the
   * two quadrants either side of +X, so four beams radiating from one point — the obvious thing to
   * want from an anchor, and what an omniwheel frame is made of — was impossible to express: two
   * of the four arms had nowhere to point.
   */
  reverse?: boolean;
  /** How many holes the beam has, end to end. A "beam" of 1 is just a round end cap. */
  holes: number;
  holeType: BeamHoleType;
  /** The bore direction every hole uses unless `holeAxes` overrides it for that one. */
  holeAxis: BeamHoleAxis;
  /**
   * Per-hole bore direction, index-aligned with the beam's holes (0 = the anchor hole). A `null` or
   * missing entry follows `holeAxis`, so the common case — a beam whose holes all bore the same way
   * — carries no array at all.
   *
   * Mixed orientations are what an angled brace usually needs in practice: the end that pins down
   * onto a plate below wants a vertical bore, while the end that pins sideways into another beam
   * wants an in-plane one, and a single beam-wide setting can't be both. Entries past `holes` are
   * ignored rather than trimmed, so shortening a beam and lengthening it again doesn't silently
   * discard what was set on the holes that came back.
   */
  holeAxes?: (BeamHoleAxis | null)[];
  /** The beam's height in Z — same scale as a cell's (see PlateFraction). Defaults to "module". */
  plateFraction?: PlateFraction;
  /** The beam's width ACROSS its own run. Defaults to a full stud (8mm), a normal beam. */
  widthFraction?: PlateFraction;
  /** Full-round end caps, as on a real liftarm. Default true. */
  roundedEnds?: boolean;
  /**
   * How far the beam's body runs BEFORE its first hole, in mm (0 = the body starts at the first
   * hole, which is every beam that predates this field).
   *
   * This is what lets a beam span exactly cell-to-cell without ever touching its hole pitch. At
   * 45° — and at every other non-Pythagorean angle — the distance between two cell centres simply
   * isn't a whole number of 8mm hole-spacings, so a beam can have holes that mate OR ends that
   * land on the grid, not both. Splitting the leftover between the two ends as plain material
   * gets both: the holes stay at a true 8mm pitch, and the body still reaches both cells so it
   * fuses into whatever is painted there. `anchorX`/`anchorY` stay the body's START (which is why
   * a lead-in of 0 leaves an existing beam bit-for-bit identical), and the holes shift along by
   * this much.
   */
  leadInStart?: number;
  /** The same overrun PAST the last hole. Defaults to `leadInStart` — a fitted beam splits its
   * slack evenly, so the hole pattern sits symmetrically between the two cells. */
  leadInEnd?: number;
  /**
   * Holes left SOLID on purpose — indices into the beam's own holes, 0 = the anchor hole.
   *
   * A beam's `holeType` is one choice for the whole part, matching a real moulded liftarm, and
   * `none` turns every hole off at once. That's the wrong granularity where a beam runs INTO
   * something: the holes buried in the block it joins are the ones you want gone (they weaken the
   * join and print as pockets inside solid material), while the ones out in the open still need to
   * pin. This is that choice, per hole, and it reads as a list so a beam with none of them carries
   * nothing.
   */
  solidHoles?: number[];
  /**
   * Material added into the corner where each square end meets what it lands on, in mm (0 or
   * absent = none) — the moulded web a real angled part has where it joins a straight one.
   *
   * A diagonal butting into an axis-aligned block leaves a sharp notch on each side: the two faces
   * meet at 45°, which is a stress riser, prints as a knife edge, and reads as unfinished. A wedge
   * filling that notch is the fix. It's only added on the side where there IS something to blend
   * into (see `gussetSolidNeighbours`) — a web hanging off a beam into open air would be worse than
   * the notch.
   */
  gusset?: number;
  /**
   * A shift of the whole beam ACROSS its own run, in mm (positive toward the beam's left, the
   * `+perp` side of its pre-rotation frame).
   *
   * A fitted beam's ends sit on cell CENTRES, which buries its end face inside the block it lands
   * on and leaves its side faces crossing that block's walls at an angle — which is what
   * manufactures the lip a blend then has to round away. Sliding the beam across until its OUTER
   * wall passes through the block's outer corner removes the crossing instead of dressing it: the
   * two outlines meet at the corner rather than through it. See `beamFlushOffset`, which computes
   * the shift.
   *
   * The hole pitch is untouched — the whole beam moves, holes with it — so this trades the holes
   * sitting on cell centres for the outline being right, which on a diagonal they could never do
   * at once anyway.
   */
  acrossOffset?: number;
  /**
   * The cell this beam was fitted to run to, when it was placed by dragging from one cell to
   * another. Kept so the fit can be re-derived (and shown) rather than only being visible as the
   * angle and lead-ins it happened to produce.
   */
  endpoint?: { x: number; y: number };
}

/** The bore direction hole `index` actually uses — its own override, or the beam's own setting. */
export function beamHoleAxisAt(beam: AngledBeam, index: number): BeamHoleAxis {
  return beam.holeAxes?.[index] ?? beam.holeAxis;
}

/** True when the beam's holes don't all bore the same way. */
export function beamHasMixedHoleAxes(beam: AngledBeam): boolean {
  for (let i = 0; i < beam.holes; i++) {
    if (beamHoleAxisAt(beam, i) !== beam.holeAxis) return true;
  }
  return false;
}

/**
 * `holeAxes` with `axis` set at `index` — padded with nulls up to that hole, and dropped entirely
 * when nothing is overridden any more, so a beam back on a single uniform direction goes back to
 * carrying no array (and reads that way in a saved project).
 */
export function withHoleAxis(
  beam: AngledBeam,
  index: number,
  axis: BeamHoleAxis | null,
): (BeamHoleAxis | null)[] | undefined {
  const next = [...(beam.holeAxes ?? [])];
  while (next.length <= index) next.push(null);
  next[index] = axis;
  return next.some((a) => a !== null) ? next : undefined;
}

let nextBeamId = 0;

/** Angle in degrees CCW from +X, with `mirror` and `reverse` already applied. */
export function beamAngleDegrees(beam: AngledBeam): number {
  const preset = BEAM_ANGLE_OPTIONS.find((o) => o.id === beam.angleId);
  const base = preset ? preset.degrees : (beam.customDegrees ?? 45);
  return (beam.mirror ? -base : base) + (beam.reverse ? 180 : 0);
}

/** Any angle brought into [0, 360) — for display, so a beam never reports itself as "-45°". */
export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * The four directions a given slope can run in, as (`mirror`, `reverse`) pairs. A preset names a
 * SLOPE (1:1, 3:4, …), which is the part that decides whether the beam's far end lands on the grid;
 * which of the four quadrants it runs into is independent of that, so it's a separate control
 * rather than four times as many presets. Four beams at 45° from one anchor are these four.
 */
export const BEAM_QUADRANTS: readonly { mirror: boolean; reverse: boolean }[] = [
  { mirror: false, reverse: false },
  { mirror: true, reverse: false },
  { mirror: false, reverse: true },
  { mirror: true, reverse: true },
];

/** The angle a beam would run at in the given quadrant — used to label the quadrant buttons with
 * the real resulting direction instead of an abstract "forward/mirrored/reversed". */
export function quadrantDegrees(beam: AngledBeam, quadrant: { mirror: boolean; reverse: boolean }): number {
  return normalizeDegrees(beamAngleDegrees({ ...beam, ...quadrant }));
}

export function beamAngleOption(beam: AngledBeam): BeamAngleOption | undefined {
  return BEAM_ANGLE_OPTIONS.find((o) => o.id === beam.angleId);
}

/** Number of 8mm hole-spacings between the beam's first and last hole. */
export function beamSpans(beam: AngledBeam): number {
  return Math.max(0, beam.holes - 1);
}

/**
 * Where the beam's far end sits relative to its anchor, in studs (so a whole-number pair means it
 * lands exactly on a grid hole centre). Y is in grid storage order, matching `anchorY`.
 */
export function beamEndOffsetStuds(beam: AngledBeam): { dx: number; dy: number } {
  const rad = (beamAngleDegrees(beam) * Math.PI) / 180;
  const span = beamSpans(beam);
  return { dx: span * Math.cos(rad), dy: span * Math.sin(rad) };
}

/**
 * True when BOTH the anchor and the far end land on grid hole centres — see
 * `BeamAngleOption.legalPeriod` for why most angles can only ever manage the anchor.
 */
export function isBeamGridLegal(beam: AngledBeam): boolean {
  // A fitted beam carries its own angle, so the preset list below cannot answer for it. What makes
  // it legal is what makes anything legal here: the run between its two end holes has to be a whole
  // number of hole-spacings. No lead-in is necessary but nowhere near sufficient — the hole-aligned
  // fit sets no lead-in on EVERY beam-to-beam drag, so reading legality off that alone declared a
  // 45° beam across two cells legal when its far hole lands 0.17 studs from the cell it was aimed
  // at, and the panel said so in as many words.
  if (beam.endpoint) {
    const lead = beamLeadIn(beam);
    if (lead.start !== 0 || lead.end !== 0) return false;
    const run = Math.hypot(beam.endpoint.x - beam.anchorX, beam.endpoint.y - beam.anchorY);
    return Math.abs(run - Math.round(run)) < 1e-6;
  }
  const preset = beamAngleOption(beam);
  if (!preset || preset.legalPeriod === null) return false;
  return beamSpans(beam) % preset.legalPeriod === 0;
}

/**
 * The nearest hole counts either side of `beam.holes` that WOULD land both ends on the grid, or
 * null for an angle where no hole count ever can. Lets the UI offer a fix instead of only
 * reporting the problem.
 */
export function nearestLegalHoleCounts(beam: AngledBeam): number[] | null {
  const preset = beamAngleOption(beam);
  if (!preset || preset.legalPeriod === null) return null;
  const period = preset.legalPeriod;
  const span = beamSpans(beam);
  const lower = Math.floor(span / period) * period;
  const upper = lower + period;
  const counts = [lower, upper].filter((s) => s >= 1).map((s) => s + 1);
  return Array.from(new Set(counts)).sort((a, b) => a - b);
}

/** The body's overrun before the first hole and past the last one, in mm. */
export function beamLeadIn(beam: AngledBeam): { start: number; end: number } {
  const start = beam.leadInStart ?? 0;
  return { start, end: beam.leadInEnd ?? start };
}

/** True when that end of the beam is fitted to a cell rather than finishing at its own end hole.
 * A fitted end can't carry a round cap: a liftarm's cap is a half-circle concentric with the end
 * HOLE, and once the body runs past that hole a circle at the body's end is centred on nothing.
 * It gets a square face instead — which is also the face a gusset needs to sit against. */
export function beamEndIsFitted(beam: AngledBeam, end: "start" | "end"): boolean {
  const lead = beamLeadIn(beam);
  return (end === "start" ? lead.start : lead.end) > 1e-6;
}

/** Where the beam's BODY starts and ends, in hole-spacings from the anchor along its own run.
 * The holes themselves live at `beamHoleOffsetStuds`. */
export function beamBodySpanStuds(beam: AngledBeam): { from: number; to: number } {
  const lead = beamLeadIn(beam);
  const rounded = beam.roundedEnds ?? true;
  // An unfitted square end still needs its half-stud of material past the end hole; a rounded one
  // gets that from the cap. Same rule the geometry builder uses, kept here so the 2D overlay draws
  // the body the length it will actually print.
  const extStart = lead.start > 0 ? lead.start : rounded ? 0 : STUD_PITCH / 2;
  const extEnd = lead.end > 0 ? lead.end : rounded ? 0 : STUD_PITCH / 2;
  return {
    from: (lead.start - extStart) / STUD_PITCH,
    to: (lead.start + beamSpans(beam) * STUD_PITCH + extEnd) / STUD_PITCH,
  };
}

/** How far hole `index` sits from the anchor, in hole-spacings along the beam's own run. */
export function beamHoleOffsetStuds(beam: AngledBeam, index: number): number {
  return beamLeadIn(beam).start / STUD_PITCH + index;
}

/** The unit vector the beam runs along, in grid storage coords (Y matching `anchorY`). */
export function beamDirection(beam: AngledBeam): { x: number; y: number } {
  const rad = (beamAngleDegrees(beam) * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

/**
 * How much material an END hole needs between its own centre and the beam's end face, per hole
 * type, in mm.
 *
 * It's the hole's widest radius plus a printable wall — and for a Technic hole the widest radius
 * is NOT the bore's 2.475mm but the 3.2mm counterbore at each mouth, which is what actually
 * breaks out through the end face first. (A real liftarm puts its end hole 4mm from the tip, so
 * it carries 0.8mm of wall by the same measure.) An end hole closer than this doesn't print as a
 * hole at all: it prints as an open notch a pin drops straight out of.
 */
export const BEAM_END_HOLE_MATERIAL: Record<BeamHoleType, number> = {
  technicHole: PIN_HOLE_BOSS_RADIUS + 0.4,
  axleHole: PIN_HOLE_RADIUS + 0.4,
  studHole: STUD_HOLE_RADIUS + 0.4,
  none: 0,
};

/** How much material sits between the given end's hole centre and the body's end face, in mm —
 * `Infinity` for a rounded end, whose cap is concentric with that hole and so always encloses it. */
function endHoleMaterial(beam: AngledBeam, end: "start" | "end"): number {
  const lead = beamLeadIn(beam);
  const at = end === "start" ? lead.start : lead.end;
  if (at > 0) return at;
  return (beam.roundedEnds ?? true) ? Infinity : STUD_PITCH / 2;
}

/**
 * The holes that would break out through the beam's own end face, and so are filled in solid
 * instead of bored (see BEAM_END_HOLE_MATERIAL).
 *
 * Only ever the first and last hole — every hole between them has a full 8mm of beam either side.
 * Solid is the only sensible reading of "there isn't room for this hole": the alternative is a
 * notch open to the end face, which holds nothing and prints as a hook. It can only arise on a
 * squared end whose lead-in was set by hand or left behind by an edit — `beamFitToEndpoint`
 * chooses a hole count that leaves every hole its wall.
 */
export function beamAutoSuppressedHoles(beam: AngledBeam): number[] {
  if (beam.holeType === "none" || beam.holes < 1) return [];
  const need = BEAM_END_HOLE_MATERIAL[beam.holeType];
  const out: number[] = [];
  if (endHoleMaterial(beam, "start") < need) out.push(0);
  if (beam.holes > 1 && endHoleMaterial(beam, "end") < need) out.push(beam.holes - 1);
  return out;
}

/** True when hole `index` was turned off by hand — see AngledBeam.solidHoles. */
export function beamHoleIsSolid(beam: AngledBeam, index: number): boolean {
  return beam.solidHoles?.includes(index) ?? false;
}

/** `solidHoles` with `index` turned on or off, dropped entirely when nothing is left in it. */
export function withSolidHole(beam: AngledBeam, index: number, solid: boolean): number[] | undefined {
  const next = (beam.solidHoles ?? []).filter((i) => i !== index);
  if (solid) next.push(index);
  return next.length > 0 ? next.sort((a, b) => a - b) : undefined;
}

/** Every hole that isn't bored — the ones there's no room for, plus the ones turned off by hand. */
export function beamSuppressedHoles(beam: AngledBeam): number[] {
  if (beam.holeType === "none" || beam.holes < 1) return [];
  const all = new Set(beamAutoSuppressedHoles(beam));
  for (const i of beam.solidHoles ?? []) {
    if (i >= 0 && i < beam.holes) all.add(i);
  }
  return [...all].sort((a, b) => a - b);
}

/**
 * A beam that runs from cell (ax, ay) exactly to cell (bx, by): the fields to merge into a beam so
 * its BODY spans the two cell centres while its holes keep the true 8mm pitch.
 *
 * Hole count is `round`ed rather than floored on purpose. It's what decides how much slack is left
 * over, and rounding leaves each end with roughly half a stud of material past its end hole —
 * the same wall a normal liftarm end has. Flooring would leave beams whose end hole sits a hair
 * from the edge, with no wall at all.
 */
/** Where every hole of a beam sits, in grid (stud) coordinates — fractional, and rarely on a cell. */
export function beamHolePositions(beam: AngledBeam): { x: number; y: number }[] {
  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const across = (beam.acrossOffset ?? 0) / STUD_PITCH;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < beam.holes; i++) {
    const along = beamHoleOffsetStuds(beam, i);
    out.push({
      x: beam.anchorX + dir.x * along + perp.x * across,
      y: beam.anchorY + dir.y * along + perp.y * across,
    });
  }
  return out;
}

/**
 * The nearest hole of an existing beam to (x, y), or null if none is near enough.
 *
 * Beams meet beams at PINS, and a pin needs one hole through both. Cell centres are no help for
 * that: a diagonal beam's holes are a whole number of 8mm steps along its own axis, which almost
 * never lands on a cell — so a corner built by aiming both beams at the same cell leaves their end
 * holes a few millimetres apart, close enough to look joined and not close enough to pin.
 */
export function nearestBeamHole(
  beams: readonly AngledBeam[],
  layer: number,
  x: number,
  y: number,
  maxDistance = 0.7,
  ignoreId?: string,
): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  const consider = (px: number, py: number, d: number) => {
    if (best === null || d < best.d) best = { x: px, y: py, d };
  };
  for (const beam of beams) {
    if (beam.layer !== layer || beam.id === ignoreId) continue;
    if (beam.holeType === "none") continue;
    const solid = new Set(beamSuppressedHoles(beam));
    beamHolePositions(beam).forEach((p, i) => {
      if (solid.has(i)) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= maxDistance) consider(p.x, p.y, d);
    });
  }
  const found = best as { x: number; y: number; d: number } | null;
  return found ? { x: found.x, y: found.y } : null;
}

/** How close two holes must be to count as one — well under a print layer, in studs. */
const HOLE_COINCIDENT = 0.01;

/**
 * Whether each end of `beam` lands on another beam's hole.
 *
 * An end that does has to cap in PLAN, whatever its own bores do. Two beams joined at a shared hole
 * both put a cap on that hole, and the two only coincide if they are the same kind: a plan cap is a
 * disc of half a stud about the hole, while an in-plane cap is square in plan and reaches half a
 * stud along the beam AND across it — so its corners stand 1.66mm proud of the other beam's disc.
 * That is the overhang, and it is not something either beam is doing wrong on its own.
 */
export function beamEndsMeetingBeams(
  beam: AngledBeam,
  others: readonly AngledBeam[],
): { start: boolean; end: boolean } {
  if (beam.holes < 1) return { start: false, end: false };
  const mine = beamHolePositions(beam);
  const meets = (p: { x: number; y: number }) =>
    others.some(
      (other) =>
        other.id !== beam.id &&
        other.layer === beam.layer &&
        beamHolePositions(other).some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= HOLE_COINCIDENT),
    );
  return {
    start: meets(mine[0]),
    end: beam.holes > 1 ? meets(mine[beam.holes - 1]) : false,
  };
}

/** How near another beam's hole has to be before a miss is worth reporting, in studs. */
const HOLE_NEAR_MISS = 0.75;

/**
 * The END holes of `beam` that ALMOST line up with another beam's hole but don't — each with the
 * gap, in studs.
 *
 * This is the failure that looks like success. Two beams meeting at a corner read as joined from
 * any distance, and whether a pin will actually pass through both comes down to a fraction of a
 * millimetre that no render shows. It happens for a reason that is never the builder's fault: hole
 * pitch is one stud along a beam's OWN axis, so a corner only closes when the run between the two
 * holes is a whole number of studs — and a right isoceles triangle, say, has a hypotenuse of 2√2,
 * which is not one however carefully it is drawn.
 *
 * A free end near nothing is not reported: that is a beam that simply ends, not a join that failed.
 */
export function beamEndHoleMisses(
  beam: AngledBeam,
  others: readonly AngledBeam[],
): { index: number; gap: number }[] {
  if (beam.holeType === "none" || beam.holes < 1) return [];
  const mine = beamHolePositions(beam);
  const suppressed = new Set(beamSuppressedHoles(beam));
  const targets: { x: number; y: number }[] = [];
  for (const other of others) {
    if (other.id === beam.id || other.layer !== beam.layer || other.holeType === "none") continue;
    const otherSolid = new Set(beamSuppressedHoles(other));
    beamHolePositions(other).forEach((p, i) => {
      if (!otherSolid.has(i)) targets.push(p);
    });
  }
  if (targets.length === 0) return [];

  const out: { index: number; gap: number }[] = [];
  for (const index of beam.holes > 1 ? [0, beam.holes - 1] : [0]) {
    if (suppressed.has(index)) continue;
    const p = mine[index];
    let nearest = Infinity;
    for (const t of targets) nearest = Math.min(nearest, Math.hypot(t.x - p.x, t.y - p.y));
    if (nearest > HOLE_COINCIDENT && nearest <= HOLE_NEAR_MISS) out.push({ index, gap: nearest });
  }
  return out;
}

/**
 * The nearest cell to (bx, by) that a beam can actually REACH from (ax, ay) with both end holes on
 * the grid — or null when there isn't one close by.
 *
 * A beam's holes are at a true 8mm pitch along its own axis, so starting one on a grid point puts
 * its far end on another only when the direction's hypotenuse is a whole number of those steps: a
 * Pythagorean triple. 3:2 gives √13, 1:2 gives √5, 1:1 gives √2 — all irrational, so a frame drawn
 * at those angles cannot close, and its corners miss by a few millimetres however carefully it was
 * drawn. This is the same fact `BeamAngleOption.legalPeriod` records for the presets, and it is why
 * real angled liftarms come at 36.87°/53.13° (3-4-5), 22.62°/67.38° (5-12-13) and 28.07°/61.93°
 * (8-15-17) and not at the angles that look rounder.
 *
 * So a drag is snapped to the nearest direction that works, rather than being taken literally and
 * quietly producing a frame with a gap in it. The search is over integer offsets — no angle
 * arithmetic, no tolerance to tune: a direction either has a whole-number hypotenuse or it does
 * not. `maxShift` bounds how far the endpoint may be moved; beyond it the drag is left alone, on
 * the grounds that someone reaching that far past every legal direction means it.
 */
export function snapEndpointToLegal(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  maxShift = 1.6,
  /**
   * Hole positions of beams already in the layer, as extra places the far end may land. They are
   * what makes a beam-to-beam corner actually pin: the run to one of these is checked for being a
   * whole number of steps exactly as a cell's is, so an end that snaps to one shares that hole.
   */
  holeTargets: readonly { x: number; y: number }[] = [],
): { x: number; y: number } | null {
  let best: { x: number; y: number; shift: number } | null = null;
  for (const t of holeTargets) {
    const shift = Math.hypot(t.x - bx, t.y - by);
    if (shift > maxShift) continue;
    const run = Math.hypot(t.x - ax, t.y - ay);
    if (run < 0.5 || Math.abs(run - Math.round(run)) > 1e-6) continue;
    if (best === null || shift < best.shift) best = { x: t.x, y: t.y, shift };
  }
  const range = Math.ceil(maxShift);
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const x = bx + dx;
      const y = by + dy;
      if (x === ax && y === ay) continue;
      const shift = Math.hypot(dx, dy);
      if (shift > maxShift) continue;
      const run = Math.hypot(x - ax, y - ay);
      if (Math.abs(run - Math.round(run)) > 1e-9) continue;
      if (best === null || shift < best.shift) best = { x, y, shift };
    }
  }
  if (!best) return null;
  return best.x === bx && best.y === by ? null : { x: best.x, y: best.y };
}

/**
 * How a drag decides what lands where.
 *
 * - `body` — the beam's BODY spans the drag exactly and the slack is split as lead-in at both ends;
 *   the holes float wherever the pitch puts them. Right where the ends fuse into solid blocks. A
 *   run that is already a whole number of studs needs no lead-in and gets the hole-on-cell fit for
 *   free.
 * - `holes` — the first hole sits on the anchor and the rest follow at true pitch, no lead-in. Right
 *   where the beam is PINNED rather than fused, since a pin needs a hole where you can find it.
 * - `centred` — the body spans the drag, and the hole count is forced ODD so one hole sits on the
 *   beam's own midpoint. That is what makes two beams line up across layers: with the same 8mm
 *   pitch, a shared centre hole and equal lead-in at both ends, every hole of the shorter beam
 *   falls on one of the longer beam's — whatever their lengths. An even count puts the midpoint
 *   BETWEEN two holes instead, and two such beams miss each other by 4mm however carefully they
 *   are placed.
 */
export type BeamFitMode = "body" | "holes" | "centred";

/**
 * True when a point sits on a cell centre — the 8mm lattice every hole in a plate is drilled on.
 *
 * A beam's own holes step along ITS axis, so only an axis-aligned beam's land here: a 45° one steps
 * 5.657mm and clears the grid at its anchor and nowhere else. That is why a drag that starts on a
 * diagonal's hole inherits an off-grid anchor — and why the Grid fit has to refuse such a start.
 */
export function isOnCellGrid(p: { x: number; y: number }): boolean {
  return Math.abs(p.x - Math.round(p.x)) < 1e-6 && Math.abs(p.y - Math.round(p.y)) < 1e-6;
}

export function beamFitToEndpoint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  holeType: BeamHoleType = "technicHole",
  /**
   * Put the beam's HOLES on the drag's two endpoints rather than its BODY.
   *
   * The lead-in fit is right where a beam runs into solid blocks: what has to land exactly is the
   * body, so it fuses, and the holes float wherever the pitch puts them. Where a beam meets another
   * BEAM that is exactly backwards — nothing is fusing, the two are pinned, and a pin needs a hole
   * at a position you can find. So the first hole goes on the anchor cell's own centre and the rest
   * follow at the true pitch, which is what a moulded angled liftarm does and why its holes sit on
   * the stud grid.
   *
   * What it costs, and why it is a CHOICE rather than a consequence of the bore direction: on a run
   * that is not a whole number of studs — 45° across any distance, since √2 is irrational — no
   * number of 8mm pitches can start on one cell centre and finish on the other. Hole-aligning then
   * buys the anchor hole alone; the far end simply stops short (3.9mm on a 6x6 diagonal) and every
   * hole between is off the grid anyway. It also gives the same drag a different beam depending on
   * the bore direction — one hole more, and no lead-in — so two beams meant to stack across layers
   * cannot have their holes line up. Both fits are legitimate; which one a drag wants is the
   * caller's to say.
   */
  mode: BeamFitMode = "body",
): Pick<AngledBeam, "angleId" | "customDegrees" | "mirror" | "reverse" | "holes" | "leadInStart" | "leadInEnd" | "endpoint"> | null {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return null;
  const studs = Math.hypot(dx, dy);
  // A Pythagorean direction (3:4, 5:12, 8:15…) puts the two cells a WHOLE number of hole-spacings
  // apart, so it needs no lead-in at all: one more hole than that reaches both cell centres with
  // the pitch alone, and the end holes then pin straight into the grid. Fitting it with lead-ins
  // instead would throw that away — a strictly worse part at the one angle that doesn't need the
  // trick. Every other direction falls through to splitting the slack.
  // `centred` never takes the exact branch: its whole point is a hole on the midpoint, and the
  // exact fit's count (spacings + 1) is even exactly when that would fail.
  const exact = mode !== "centred" && (mode === "holes" || Math.abs(studs - Math.round(studs)) < 1e-9);
  const length = studs * STUD_PITCH;
  // Rounding alone can leave as little as 2mm at each end (the slack lands anywhere in 4…12mm),
  // which is less than a Technic hole's own 3.2mm counterbore — the end holes then break out
  // through the end faces and print as open notches. So the hole count is also capped at what
  // leaves BOTH ends their wall; one hole fewer buys 4mm at each end, which is always enough.
  const need = BEAM_END_HOLE_MATERIAL[holeType];
  const fits = Math.floor((length - 2 * need) / STUD_PITCH) + 1;
  let holes = exact
    ? Math.round(studs) + 1
    : Math.max(1, Math.min(Math.round(length / STUD_PITCH), fits));
  // Dropping to the next odd count DOWN, never up: one hole fewer only ever buys 4mm more lead-in
  // at each end, while one more could take the end holes past what BEAM_END_HOLE_MATERIAL leaves
  // them — the cap above exists for that.
  if (mode === "centred" && holes % 2 === 0) holes = Math.max(1, holes - 1);
  const lead = exact ? 0 : (length - (holes - 1) * STUD_PITCH) / 2;
  return {
    angleId: CUSTOM_ANGLE_ID,
    // The quadrant flags reach any direction from a first-quadrant preset (see BEAM_QUADRANTS);
    // a fitted beam has its true direction in hand already, so it states it outright and leaves
    // both flags off rather than encoding the same angle twice.
    customDegrees: (Math.atan2(dy, dx) * 180) / Math.PI,
    mirror: false,
    reverse: false,
    holes,
    leadInStart: lead || undefined,
    leadInEnd: lead || undefined,
    endpoint: { x: bx, y: by },
  };
}

export function createAngledBeam(layer: number, anchorX: number, anchorY: number): AngledBeam {
  return {
    id: `beam-${Date.now().toString(36)}-${nextBeamId++}`,
    layer,
    anchorX,
    anchorY,
    angleId: "a45",
    mirror: false,
    reverse: false,
    holes: 5,
    holeType: "technicHole",
    holeAxis: "z",
    plateFraction: "module",
    roundedEnds: true,
  };
}

/** Short human label for a beam — used in the beam list and the 2D overlay's tooltip. */
export function describeBeam(beam: AngledBeam): string {
  const deg = normalizeDegrees(beamAngleDegrees(beam));
  const rounded = Math.abs(deg % 1) < 0.005 ? deg.toFixed(0) : deg.toFixed(2);
  return `${rounded}° · ${beam.holes} holes @ (${beam.anchorX}, ${beam.anchorY})`;
}

/**
 * The `acrossOffset` that puts the beam's outer wall through the outer corner of the blocks at its
 * ends, or null when there is nothing at either end to line up with.
 *
 * At each end, the block's outer corner is the corner of the cell the beam lands on that sits
 * furthest out on the beam's OUTER side — the side away from where the block's own material runs.
 * Putting the wall there means the beam's outline meets the block's at a point instead of crossing
 * it, so there is no lip to round off in the first place.
 *
 * Both ends are measured and the one needing the SMALLER shift wins: moving further than an end
 * needs would push the beam's wall past that block's corner and re-open the crossing on the other
 * side of it. On a symmetric brace the two agree exactly.
 */
export function beamFlushOffset(
  beam: AngledBeam,
  isSolid: (x: number, y: number) => boolean,
  beamWidth: number,
  /**
   * The radius that cell's exterior corners are rounded to, in mm — 0 for a square cell.
   *
   * A rounded cell has no corner to sit against. Its exterior is an arc, and at
   * `CELL_EDGE_RADIUS` (half a stud) the arc swallows the square entirely: in plan the cell is a
   * circle. Laying the beam's wall on the square corner then aims it at a point of empty space and
   * leaves the same gap this offset exists to close. Tangent to the arc is the answer, and it
   * degenerates correctly — a radius of 0 puts the tangent line back on the sharp corner.
   */
  roundRadiusAt: (x: number, y: number) => number = () => 0,
  /**
   * The other beams on the layer, with the width each is built at.
   *
   * A beam sits against beams the same way it sits against blocks, and for the same reason: its
   * outer wall belongs on the outer edge of what it joins, not through the middle of it. Without
   * this an end that lands on another beam is simply centred on the shared hole, so its wall cuts
   * the corner and leaves a notch — the difference between a triangle of beams and the same
   * triangle drawn on solid cells, which sits flush.
   */
  others: readonly { beam: AngledBeam; width: number }[] = [],
): number | null {
  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const body = beamBodySpanStuds(beam);
  const offsets: number[] = [];

  const holes = beamHolePositions(beam);
  for (const end of ["start", "end"] as const) {
    const along = end === "start" ? body.from : body.to;
    const cx = Math.round(beam.anchorX + dir.x * along);
    const cy = Math.round(beam.anchorY + dir.y * along);

    // An end joined to another beam is NOT slid across. Beams are joined by a shared hole, and
    // this offset moves the whole beam, holes included — so sitting one flush against the beam it
    // joins pulls its end hole off the very hole that was the join, leaving two end caps of equal
    // radius with centres a millimetre or so apart. Their union kinks where the circles cross, and
    // that kink is a visible bulge on what should be one continuous edge.
    //
    // Nothing is lost by leaving it alone: a shared hole already puts the two caps concentric, and
    // an end that lands on a beam caps in PLAN (see beamEndsMeetingBeams), so the two discs
    // coincide exactly and the corner is smooth without moving anything. Sitting flush is for
    // blocks, which have a wall to sit against rather than a hole to share.
    const myHole = holes[end === "start" ? 0 : Math.max(0, beam.holes - 1)];
    const joinsABeam = others.some(
      (o) =>
        o.beam.id !== beam.id &&
        o.beam.layer === beam.layer &&
        beamHolePositions(o.beam).some((q) => Math.hypot(q.x - myHole.x, q.y - myHole.y) <= 0.01),
    );
    if (joinsABeam) continue;

    if (!isSolid(cx, cy)) continue;

    // Which side the block's own material runs to — the beam's OUTER side is the other one.
    let inside = 0;
    for (const [nx, ny] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (!isSolid(cx + nx, cy + ny)) continue;
      const cross = dir.x * ny - dir.y * nx;
      if (Math.abs(cross) < 0.2) continue; // straight on from the beam — no side to it
      inside += cross > 0 ? 1 : -1;
    }
    if (inside === 0) continue;
    const outer = inside > 0 ? -1 : 1;

    // The corners of the cell AS BUILT — see CELL_BUILT_HALF. Neither the stud pitch nor the
    // nominal block body: geometry.ts builds a solid cell a touch OVER its pitch so neighbours
    // overlap, and aligning to either of the other two puts the beam's wall a fraction inside the
    // wall that actually gets built, leaving exactly the lip this is meant to remove.
    //
    // Rounded, it is the CENTRE of the arc that is measured and the wall sits a radius outboard of
    // it — the tangent. The arc here is concentric with the CELL: rounding.ts rounds a cell by
    // intersecting it with a cylinder on its own centre, and that cylinder's radius is capped at
    // half a stud while the box is built a touch wider, so the circle governs the whole profile
    // rather than just easing four corners. Treating it as corners inset by the radius instead
    // leaves the wall a fraction outside the tangent — 4.071mm from the centre of a 4mm circle.
    const round = Math.max(0, Math.min(roundRadiusAt(cx, cy), CELL_BUILT_HALF));
    const c = round > 0 ? 0 : CELL_BUILT_HALF / STUD_PITCH;
    let extreme: number | null = null;
    for (const [sx, sy] of [
      [c, c],
      [c, -c],
      [-c, c],
      [-c, -c],
    ]) {
      const dx = (cx + sx - beam.anchorX) * STUD_PITCH;
      const dy = (cy + sy - beam.anchorY) * STUD_PITCH;
      const across = dx * perp.x + dy * perp.y;
      if (extreme === null || across * outer > extreme * outer) extreme = across;
    }
    if (extreme === null) continue;
    // Put the outer wall — at `offset + outer * beamWidth / 2` — on that corner, or tangent to its
    // arc when it has one.
    offsets.push(extreme + outer * round - (outer * beamWidth) / 2);
  }

  if (offsets.length === 0) return null;
  return offsets.reduce((a, b) => (Math.abs(a) <= Math.abs(b) ? a : b));
}

/**
 * A beam's outline in PLAN, in grid (stud) coordinates — body, plus a half-round at each end that
 * caps in plan. This is the shape the part actually occupies looking down, and the 2D plan draws it
 * so that an end standing proud of the beam it joins is visible where it is made rather than only
 * in the render.
 *
 * An in-plane cap is deliberately square here: it rounds top-to-bottom and leaves the plan outline
 * flat, which is exactly the difference that lets one beam's end overhang another's.
 */
export function beamPlanOutline(beam: AngledBeam, widthStuds: number, joinedEnds?: { start: boolean; end: boolean }): { x: number; y: number }[] {
  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const body = beamBodySpanStuds(beam);
  const lead = beamLeadIn(beam);
  const across = (beam.acrossOffset ?? 0) / STUD_PITCH;
  const hw = widthStuds / 2;
  const at = (along: number, over: number) => ({
    x: beam.anchorX + dir.x * along + perp.x * (over + across),
    y: beam.anchorY + dir.y * along + perp.y * (over + across),
  });
  const suppressed = new Set(beamSuppressedHoles(beam));
  const capsInPlan = (index: number) =>
    suppressed.has(index) ||
    (index === 0 ? (joinedEnds?.start ?? false) : (joinedEnds?.end ?? false)) ||
    beamHoleAxisAt(beam, index) === "z";
  const rounded = beam.roundedEnds ?? true;
  const capStart = rounded && lead.start <= 0 && capsInPlan(0);
  const capEnd = rounded && lead.end <= 0 && capsInPlan(Math.max(0, beam.holes - 1));
  const capR = Math.min(0.5, hw);

  const out: { x: number; y: number }[] = [];
  const arc = (centre: number, a0: number, a1: number) => {
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      out.push(at(centre + Math.cos(a) * capR, Math.sin(a) * capR));
    }
  };
  // A capped end that does NOT cap in plan still reaches capR along the beam — its cap is a
  // cylinder lying across the beam, which is square from above and just as long as the disc is
  // wide. Stopping the outline at the hole understates it by exactly the overhang being looked for.
  const rounded0 = beam.roundedEnds ?? true;
  const flatEnd = (index: number) =>
    rounded0 && (index === 0 ? lead.start <= 0 : lead.end <= 0) ? capR : 0;
  if (capEnd) arc(body.to, -Math.PI / 2, Math.PI / 2);
  else {
    const over = flatEnd(Math.max(0, beam.holes - 1));
    out.push(at(body.to + over, -hw));
    out.push(at(body.to + over, hw));
  }
  if (capStart) arc(body.from, Math.PI / 2, (Math.PI * 3) / 2);
  else {
    const over = flatEnd(0);
    out.push(at(body.from - over, hw));
    out.push(at(body.from - over, -hw));
  }
  return out;
}
