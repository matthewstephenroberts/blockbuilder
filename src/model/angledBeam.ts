import { PlateFraction } from "./cellTypes";
import {
  CELL_BUILT_HALF,
  cellBuiltHalf,
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
   * Ends forced SQUARE, whatever `roundedEnds` says — "start" is the anchor end.
   *
   * A liftarm's round end is right where the end stands alone. Where two beams run side by side it
   * is wrong: each cap is a half-disc about its own end hole, so the pair finishes in a scallop
   * with a notch between the two curves instead of one flat face across the width of both. The
   * same goes for a beam ending against anything meant to read as flush. This is per end rather
   * than per beam because the other end of the same beam usually still stands alone and still
   * wants its cap.
   */
  flatEnds?: { start?: boolean; end?: boolean };
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
   * A shift of the whole beam ALONG its own run, in mm (positive toward the beam's far end) — the
   * companion to `acrossOffset`, and the other half of what a sub-cell alignment needs.
   *
   * Body and holes move together, so nothing about the part changes: same length, same 8mm pitch,
   * same end caps. That's what separates it from the lead-ins, which also move the holes along but
   * do it by growing material at one end — which starves the end hole (see beamAutoSuppressedHoles)
   * and turns a rounded cap into a fitted face. Landing one hole exactly on a cell centre needs a
   * shift, not a change of part, so it belongs here.
   */
  alongOffset?: number;
  /**
   * The cell this beam was fitted to run to, when it was placed by dragging from one cell to
   * another. Kept so the fit can be re-derived (and shown) rather than only being visible as the
   * angle and lead-ins it happened to produce.
   */
  endpoint?: { x: number; y: number };
  /**
   * Which point on THIS beam locks to the square it's dragged onto — see BeamMoveRef. Absent means
   * the anchor end, which is how every beam behaved before the choice existed.
   *
   * It lives on the beam rather than being one editor-wide setting because the choice belongs to
   * the beam's job: the arms of a frame are held by the end that meets the hub, while the beam
   * that has to sit centred on a plate is held by its middle. A global setting made picking
   * "centre" for one beam move the grab handle on every other beam on the layer, which reads as
   * the control having edited them all.
   */
  moveRef?: BeamMoveRef;
  /**
   * Which hole a "hole" lock holds the beam by — 0 = the anchor hole. Absent means the middle one.
   *
   * The hole that has to line up with something is usually an END hole: a brace meets the block it
   * pins to at its tip, not at its waist. Fixing the lock to the middle hole would have made the
   * one case the lock exists for — dropping a beam's own hole onto a hole cell that is already
   * there — the one case it couldn't do.
   */
  moveHoleIndex?: number;
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

/** Whether that end is built as a flat face — asked for outright, or because the end is fitted. */
export function beamEndIsFlat(beam: AngledBeam, end: "start" | "end"): boolean {
  return end === "start" ? (beam.flatEnds?.start ?? false) : (beam.flatEnds?.end ?? false);
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
export function beamBodySpanStuds(beam: AngledBeam, pitch: number = STUD_PITCH): { from: number; to: number } {
  const lead = beamLeadIn(beam);
  const rounded = beam.roundedEnds ?? true;
  // An unfitted square end still needs its half-stud of material past the end hole; a rounded one
  // gets that from the cap. Same rule the geometry builder uses, kept here so the 2D overlay draws
  // the body the length it will actually print.
  const roundStart = rounded && !beamEndIsFlat(beam, "start");
  const roundEnd = rounded && !beamEndIsFlat(beam, "end");
  const extStart = lead.start > 0 ? lead.start : roundStart ? 0 : pitch / 2;
  const extEnd = lead.end > 0 ? lead.end : roundEnd ? 0 : pitch / 2;
  return {
    from: (lead.start - extStart) / pitch,
    to: (lead.start + beamSpans(beam) * pitch + extEnd) / pitch,
  };
}

/** How far hole `index` sits from the anchor, in hole-spacings along the beam's own run. */
export function beamHoleOffsetStuds(beam: AngledBeam, index: number, pitch: number = STUD_PITCH): number {
  return beamLeadIn(beam).start / pitch + index;
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
function endHoleMaterial(beam: AngledBeam, end: "start" | "end", pitch: number = STUD_PITCH): number {
  const lead = beamLeadIn(beam);
  const at = end === "start" ? lead.start : lead.end;
  if (at > 0) return at;
  // A flat end has no cap to carry material past its hole, so it is measured like a square one.
  return (beam.roundedEnds ?? true) && !beamEndIsFlat(beam, end) ? Infinity : pitch / 2;
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
export function beamHolePositions(beam: AngledBeam, pitch: number = STUD_PITCH): { x: number; y: number }[] {
  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const across = (beam.acrossOffset ?? 0) / pitch;
  const shift = (beam.alongOffset ?? 0) / pitch;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < beam.holes; i++) {
    const along = beamHoleOffsetStuds(beam, i, pitch) + shift;
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
  pitch: number = STUD_PITCH,
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
  const length = studs * pitch;
  // Rounding alone can leave as little as 2mm at each end (the slack lands anywhere in 4…12mm),
  // which is less than a Technic hole's own 3.2mm counterbore — the end holes then break out
  // through the end faces and print as open notches. So the hole count is also capped at what
  // leaves BOTH ends their wall; one hole fewer buys 4mm at each end, which is always enough.
  const need = BEAM_END_HOLE_MATERIAL[holeType];
  const fits = Math.floor((length - 2 * need) / pitch) + 1;
  let holes = exact
    ? Math.round(studs) + 1
    : Math.max(1, Math.min(Math.round(length / pitch), fits));
  // Dropping to the next odd count DOWN, never up: one hole fewer only ever buys 4mm more lead-in
  // at each end, while one more could take the end holes past what BEAM_END_HOLE_MATERIAL leaves
  // them — the cap above exists for that.
  if (mode === "centred" && holes % 2 === 0) holes = Math.max(1, holes - 1);
  const lead = exact ? 0 : (length - (holes - 1) * pitch) / 2;
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
  pitch: number = STUD_PITCH,
): number | null {
  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const body = beamBodySpanStuds(beam, pitch);
  const offsets: number[] = [];

  const holes = beamHolePositions(beam, pitch);
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
    const c = round > 0 ? 0 : cellBuiltHalf(pitch) / pitch;
    let extreme: number | null = null;
    for (const [sx, sy] of [
      [c, c],
      [c, -c],
      [-c, c],
      [-c, -c],
    ]) {
      const dx = (cx + sx - beam.anchorX) * pitch;
      const dy = (cy + sy - beam.anchorY) * pitch;
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
export function beamPlanOutline(
  beam: AngledBeam,
  widthStuds: number,
  joinedEnds?: { start: boolean; end: boolean },
  pitch: number = STUD_PITCH,
): { x: number; y: number }[] {
  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const body = beamBodySpanStuds(beam, pitch);
  const lead = beamLeadIn(beam);
  const across = (beam.acrossOffset ?? 0) / pitch;
  // The beam's rigid shift along its own run travels with the outline, exactly as the across-shift
  // does — otherwise a snapped beam draws its body where it used to be and its holes where they
  // now are, which reads as the plan being broken rather than the beam having moved.
  const shift = (beam.alongOffset ?? 0) / pitch;
  const hw = widthStuds / 2;
  const at = (along: number, over: number) => ({
    x: beam.anchorX + dir.x * (along + shift) + perp.x * (over + across),
    y: beam.anchorY + dir.y * (along + shift) + perp.y * (over + across),
  });
  const suppressed = new Set(beamSuppressedHoles(beam));
  const capsInPlan = (index: number) =>
    suppressed.has(index) ||
    (index === 0 ? (joinedEnds?.start ?? false) : (joinedEnds?.end ?? false)) ||
    beamHoleAxisAt(beam, index) === "z";
  const rounded = beam.roundedEnds ?? true;
  const capStart = rounded && !beamEndIsFlat(beam, "start") && lead.start <= 0 && capsInPlan(0);
  const capEnd =
    rounded && !beamEndIsFlat(beam, "end") && lead.end <= 0 && capsInPlan(Math.max(0, beam.holes - 1));
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
    rounded0 &&
    !beamEndIsFlat(beam, index === 0 ? "start" : "end") &&
    (index === 0 ? lead.start <= 0 : lead.end <= 0)
      ? capR
      : 0;
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

/**
 * Which point on a beam is the one that locks to a grid square when the beam is moved.
 *
 * A beam is anchored by its body START, which is the right handle for a brace running away from
 * something — but it's the wrong one for a beam that has to sit centred on a square shape (a hub,
 * a plate, another beam's middle hole). Centring it by dragging the start means computing where
 * the start has to be for the middle to land where you want, which is exactly the arithmetic the
 * editor should be doing. Letting the lock point be either end or the centre does that: the point
 * you picked lands on the square under the cursor, and the anchor is back-solved from it.
 *
 * "end" is the body's FAR end (past any lead-in and end cap), not its last hole — the same extent
 * the plan outline draws, so what locks to the square is what you can see touching it.
 */
export type BeamMoveRef = "start" | "centre" | "end" | "hole";

export const BEAM_MOVE_REFS: readonly { id: BeamMoveRef; label: string; hint: string }[] = [
  { id: "start", label: "Start", hint: "The beam's anchor end — where it has always been held." },
  { id: "centre", label: "Centre", hint: "The middle of the beam's body, for centring it on a shape." },
  { id: "end", label: "Far end", hint: "The far end of the beam's body." },
  {
    id: "hole",
    label: "A hole",
    hint: "One of the beam's own holes (pick which below), landed EXACTLY on the square's centre — the lead-ins and across-offset take up the fraction of a stud that the anchor can't.",
  },
];

/** The middle hole — on an even count the lower of the two middles, there being no single one. */
export function beamMiddleHoleIndex(beam: AngledBeam): number {
  return Math.max(0, Math.floor((beam.holes - 1) / 2));
}

/** The hole a "hole" lock actually holds the beam by — its own choice, clamped to the holes it
 * still has (shortening a beam mustn't leave the lock pointing past its end), or the middle. */
export function beamLockHoleIndex(beam: AngledBeam): number {
  const i = beam.moveHoleIndex ?? beamMiddleHoleIndex(beam);
  return Math.max(0, Math.min(beam.holes - 1, i));
}

/**
 * Where the beam's lock point sits relative to its anchor cell, in studs (grid storage order).
 * Includes the beam's own across-shift, so the point tracks where the beam actually is rather
 * than where its anchor cell is — see AngledBeam.acrossOffset.
 */
export function beamRefOffsetStuds(
  beam: AngledBeam,
  ref: BeamMoveRef,
  pitch: number = STUD_PITCH,
): { x: number; y: number } {
  const dir = beamDirection(beam);
  const body = beamBodySpanStuds(beam, pitch);
  const along =
    ref === "start"
      ? body.from
      : ref === "end"
        ? body.to
        : ref === "hole"
          ? beamHoleOffsetStuds(beam, beamLockHoleIndex(beam), pitch)
          : (body.from + body.to) / 2;
  const across = (beam.acrossOffset ?? 0) / pitch;
  const shift = along + (beam.alongOffset ?? 0) / pitch;
  return { x: dir.x * shift - dir.y * across, y: dir.y * shift + dir.x * across };
}

/** The grid square the beam's lock point falls on — what an Alt-drag picks the beam up by. */
export function beamRefCell(
  beam: AngledBeam,
  ref: BeamMoveRef,
  pitch: number = STUD_PITCH,
): { x: number; y: number } {
  const off = beamRefOffsetStuds(beam, ref, pitch);
  return { x: Math.round(beam.anchorX + off.x), y: Math.round(beam.anchorY + off.y) };
}

/**
 * The anchor the beam needs so that its `ref` point lands on cell (`targetX`, `targetY`).
 *
 * The anchor stays a whole grid cell — it's what everything else about the beam is measured from,
 * and a fractional one would take every hole off the lattice. So a diagonal beam of even body
 * length can't put its exact centre on a cell centre, and this lands on the nearest cell it can;
 * the beam's own across-offset and lead-ins are the sub-cell adjustments for the rest.
 */
export function beamAnchorForRef(
  beam: AngledBeam,
  ref: BeamMoveRef,
  targetX: number,
  targetY: number,
  pitch: number = STUD_PITCH,
): { anchorX: number; anchorY: number } {
  const off = beamRefOffsetStuds(beam, ref, pitch);
  return { anchorX: Math.round(targetX - off.x), anchorY: Math.round(targetY - off.y) };
}

/**
 * Everything a beam needs so that its `ref` point lands EXACTLY on the centre of cell
 * (`targetX`, `targetY`) — the anchor cell plus the sub-cell shift that finishes the job.
 *
 * The anchor is a whole grid cell, so on a diagonal it can only ever get the lock point to within
 * half a cell of where you wanted it — which is why dropping a 45° beam onto a Technic-hole cell
 * never quite lined up. The leftover is taken up by the beam's own two rigid shifts, `alongOffset`
 * and `acrossOffset`: the whole part moves, holes and body together, so nothing about it changes —
 * same length, same 8mm pitch, same caps — it just sits where it was asked to.
 *
 * Every lock point works this way, so on a 3-hole beam "centre" and "middle hole" land in the same
 * place, which is the only thing they could sensibly mean.
 *
 * The trade is the one the panel already spells out for `acrossOffset`: the beam's OTHER holes come
 * off the lattice by the same shift. On a diagonal that is unavoidable — one point is all a
 * diagonal beam can ever have on the grid at once.
 */
export function beamSnapPatch(
  beam: AngledBeam,
  ref: BeamMoveRef,
  targetX: number,
  targetY: number,
  pitch: number = STUD_PITCH,
): Partial<AngledBeam> {
  // The anchor is a whole cell, so there are four cells the hole could be hung off (the two
  // roundings in X by the two in Y). The one that leaves the least to make up in offsets wins —
  // rounding each axis independently doesn't, because the leftover is measured along the beam's
  // own run rather than along X and Y.
  const off = beamRefOffsetStuds(beam, ref, pitch);
  const dir = beamDirection(beam);
  const baseX = targetX - off.x;
  const baseY = targetY - off.y;
  let anchor = { anchorX: Math.round(baseX), anchorY: Math.round(baseY) };
  let along = 0;
  let across = 0;
  let best = Infinity;
  for (const ax of [Math.floor(baseX), Math.ceil(baseX)]) {
    for (const ay of [Math.floor(baseY), Math.ceil(baseY)]) {
      const rx = targetX - (ax + off.x);
      const ry = targetY - (ay + off.y);
      const a = (rx * dir.x + ry * dir.y) * pitch;
      const c = (-rx * dir.y + ry * dir.x) * pitch;
      const cost = Math.abs(a) + Math.abs(c);
      if (cost < best) {
        best = cost;
        anchor = { anchorX: ax, anchorY: ay };
        along = a;
        across = c;
      }
    }
  }

  const alongOffset = (beam.alongOffset ?? 0) + along;
  const acrossOffset = (beam.acrossOffset ?? 0) + across;
  return {
    ...anchor,
    alongOffset: Math.abs(alongOffset) > 1e-9 ? alongOffset : undefined,
    acrossOffset: Math.abs(acrossOffset) > 1e-9 ? acrossOffset : undefined,
  };
}

/**
 * Sitting one beam against a PARALLEL neighbour, which is two different arrangements:
 *
 * - "butt" — SIDE BY SIDE. The beam moves onto the lattice line beside its neighbour, one pitch
 *   across, so the two run next to each other as one wider part.
 * - "inline" — END TO END. The beam moves onto the neighbour's own centreline, so the two read as
 *   one continuous run and the holes carry on at the same pitch.
 *
 * Both also bring the two hole patterns onto a common perpendicular — see beamNeighbourOffset.
 */
export type BeamNeighbourFit = "butt" | "inline";

/** How far off parallel two beams may be and still count as neighbours, in degrees. Beams are
 * placed on a small set of slopes, so anything not meant to be parallel is far outside this. */
const PARALLEL_TOLERANCE_DEG = 0.5;

/**
 * The across-offset that puts `beam` against the nearest parallel beam on its layer.
 *
 * Two beams fuse when they touch — everything on a layer goes through one union — so "joining" two
 * beams is not a flag to set but a distance to close. On a diagonal that distance is never what it
 * looks like: a beam is one stud wide, while the lattice step ACROSS a 45° run is 11.31mm, so two
 * beams on adjacent lattice lines sit 3.3mm apart and never meet however carefully they are drawn.
 * A hole-snap widens the gap further, by giving one beam an across-offset its neighbour hasn't got.
 *
 * - "butt" puts them a whole LATTICE STEP apart — the layer's own pitch, 8mm or 10mm, or a
 *   multiple of it where the two beams are too wide for one — so the two hole lines keep the exact
 *   spacing a pin needs. It does NOT close the last fraction of a millimetre to make them touch:
 *   the fusing is handled where it belongs, in the geometry, which builds every beam CELL_OVERLAP
 *   wider than nominal exactly as a cell is built. Two beams on adjacent lattice lines therefore
 *   overlap by 0.1mm of built material and union cleanly, while their nominal positions — and so
 *   every hole they carry — stay exactly on the lattice.
 * - "inline" puts them on the same centreline — end to end, one continuous run — rather than
 *   beside each other.
 *
 * Returns null when there is no parallel beam to sit against, or when the beam is already there.
 */
export function beamNeighbourOffset(
  beam: AngledBeam,
  beamWidth: number,
  others: readonly { beam: AngledBeam; width: number }[],
  fit: BeamNeighbourFit,
  pitch: number = STUD_PITCH,
): {
  acrossOffset: number;
  neighbourId: string;
  movedMm: number;
  /** The along-run shift applied to bring the two hole patterns into the same perpendicular. */
  alongOffset: number;
  /**
   * How far the beam moved ALONG its own run as part of this fit, in mm.
   *
   * The sideways move settles the spacing between the two hole lines and nothing else. Two beams
   * can be the right distance apart and still have one beam's holes sitting between the other's,
   * or be in step but staggered end to end like brickwork. So the fit slides the beam along until
   * it is centred on its neighbour, snapped to the nearest whole hole-spacing from there — holes
   * lining up is the constraint, being centred is the preference.
   */
  alongMismatchMm: number;
} | null {
  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const mine = beamAngleDegrees(beam);
  const body = beamBodySpanStuds(beam, pitch);

  // The beam's own centreline, as a point on it in mm.
  const px = beam.anchorX * pitch + perp.x * (beam.acrossOffset ?? 0);
  const py = beam.anchorY * pitch + perp.y * (beam.acrossOffset ?? 0);

  let best:
    | { acrossOffset: number; neighbourId: string; movedMm: number; distance: number; alongMismatchMm: number }
    | null = null;
  for (const { beam: other, width } of others) {
    if (other.id === beam.id || other.layer !== beam.layer) continue;
    // Parallel either way round: a beam pointing back along the same line is still alongside it.
    const delta = Math.abs(normalizeDegrees(beamAngleDegrees(other) - mine) % 180);
    if (Math.min(delta, 180 - delta) > PARALLEL_TOLERANCE_DEG) continue;

    // Everything about the neighbour is measured in WORLD space and then projected onto this
    // beam's own frame, never read off its `from`/`to` directly. A parallel beam may run the
    // opposite way along the same line — 45° and -135° are the same line — and its own offsets
    // are then signed backwards relative to this one. Projecting is indifferent to which way it
    // points; using its span directly is not, and got these pairs exactly one run-length wrong.
    const otherDir = beamDirection(other);
    const otherPerp = { x: -otherDir.y, y: otherDir.x };
    const otherBody = beamBodySpanStuds(other, pitch);
    const otherShift = (other.alongOffset ?? 0) / pitch;
    const otherAcross = (other.acrossOffset ?? 0) / pitch;
    const otherPoint = (alongStuds: number) => ({
      x: (other.anchorX + otherDir.x * (alongStuds + otherShift) + otherPerp.x * otherAcross) * pitch,
      y: (other.anchorY + otherDir.y * (alongStuds + otherShift) + otherPerp.y * otherAcross) * pitch,
    });
    const project = (p: { x: number; y: number }) => ({
      along: (p.x - px) * dir.x + (p.y - py) * dir.y,
      across: (p.x - px) * perp.x + (p.y - py) * perp.y,
    });

    const theirEndA = project(otherPoint(otherBody.from));
    const theirEndB = project(otherPoint(otherBody.to));
    const sideways = (theirEndA.across + theirEndB.across) / 2;
    const theirFrom = Math.min(theirEndA.along, theirEndB.along);
    const theirTo = Math.max(theirEndA.along, theirEndB.along);
    const myFrom = body.from * pitch + (beam.alongOffset ?? 0);
    const myTo = body.to * pitch + (beam.alongOffset ?? 0);
    if (Math.min(myTo, theirTo) < Math.max(myFrom, theirFrom) - pitch) continue;

    // Where the beam's centreline has to end up, measured from where it is now. The nearest whole
    // lattice step that still clears both beams' widths — never a fraction of one, which is what
    // would take their holes off the grid.
    const clearance = (beamWidth + width) / 2;
    const steps = Math.max(1, Math.ceil((clearance - 1e-6) / pitch));
    const target = fit === "inline" ? sideways : sideways - Math.sign(sideways || 1) * steps * pitch;
    const acrossOffset = (beam.acrossOffset ?? 0) + target;
    const distance = Math.abs(sideways);

    // Phase of the two hole patterns along the run, brought into (-pitch/2, pitch/2].
    const myHole0 = beamHoleOffsetStuds(beam, 0, pitch) * pitch + (beam.alongOffset ?? 0);
    const theirHole0 = project(otherPoint(beamHoleOffsetStuds(other, 0, pitch))).along;
    let phase = (theirHole0 - myHole0) % pitch;
    if (phase > pitch / 2) phase -= pitch;
    if (phase < -pitch / 2) phase += pitch;

    // Being in step is not the same as being alongside: two beams a whole number of hole-spacings
    // apart along the run are in step and still staggered like brickwork, which is not what "sit
    // alongside" means. So the shift is the one that centres this beam on its neighbour, snapped
    // to the nearest whole hole-spacing away from that — holes lining up is the constraint, and
    // centring is only the preference.
    const centring = (theirFrom + theirTo) / 2 - (myFrom + myTo) / 2;
    const alongShift = phase + pitch * Math.round((centring - phase) / pitch);

    if (!best || distance < best.distance) {
      best = {
        acrossOffset,
        neighbourId: other.id,
        movedMm: target,
        distance,
        alongMismatchMm: Math.abs(alongShift) < 1e-6 ? 0 : alongShift,
      };
    }
  }
  if (!best) return null;
  const { acrossOffset, neighbourId, movedMm, alongMismatchMm } = best;
  // Both halves of the fit: across onto the neighbouring lattice line, and along by whatever the
  // hole patterns were out of step, so the two beams' holes end up on one perpendicular.
  const alongOffset = (beam.alongOffset ?? 0) + alongMismatchMm;
  return { acrossOffset, alongOffset, neighbourId, movedMm, alongMismatchMm };
}

/**
 * For each end of `beam`, which side another beam is running alongside it — +1 toward the beam's
 * left (its `+perp`), -1 toward its right, 0 for an end with nothing beside it.
 *
 * This is what tells a rounded end which half of its cap is wrong. A liftarm's end is a half-disc
 * about its end hole, and where a second beam runs alongside, the half of that disc facing the
 * neighbour curves AWAY from it — leaving a notch between two curves exactly where the pair should
 * read as one flat end. Squaring the whole end throws away the outer half of the radius too, which
 * is the half that should stay. So the answer is per SIDE, not per end: round outside, square where
 * they join.
 */
export function beamEndSideJoins(
  beam: AngledBeam,
  others: readonly { beam: AngledBeam; width: number }[],
  pitch: number = STUD_PITCH,
): { start: number; end: number } {
  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const mine = beamAngleDegrees(beam);
  const body = beamBodySpanStuds(beam, pitch);
  const shift = beam.alongOffset ?? 0;
  const px = beam.anchorX * pitch + perp.x * (beam.acrossOffset ?? 0);
  const py = beam.anchorY * pitch + perp.y * (beam.acrossOffset ?? 0);
  // How far off a whole lattice step the two centrelines may be and still count as alongside. A
  // beam sat by "side by side" is exact; this only has to tolerate a hand-typed offset.
  const SIDE_TOLERANCE = 0.5;

  const sideAt = (alongMm: number): number => {
    for (const { beam: other } of others) {
      if (other.id === beam.id || other.layer !== beam.layer) continue;
      const delta = Math.abs(normalizeDegrees(beamAngleDegrees(other) - mine) % 180);
      if (Math.min(delta, 180 - delta) > PARALLEL_TOLERANCE_DEG) continue;

      // Measured in WORLD space and projected onto this beam's frame, never read off the
      // neighbour's own span: a parallel beam may run the opposite way along the same line (45°
      // and -135° are one line), and its from/to and offsets are then signed backwards. Reading
      // them directly made the fill appear on one pairing and not on its mirror image.
      const otherDir = beamDirection(other);
      const otherPerp = { x: -otherDir.y, y: otherDir.x };
      const otherBody = beamBodySpanStuds(other, pitch);
      const otherShift = (other.alongOffset ?? 0) / pitch;
      const otherAcross = (other.acrossOffset ?? 0) / pitch;
      const project = (alongStuds: number) => {
        const wx =
          (other.anchorX + otherDir.x * (alongStuds + otherShift) + otherPerp.x * otherAcross) * pitch;
        const wy =
          (other.anchorY + otherDir.y * (alongStuds + otherShift) + otherPerp.y * otherAcross) * pitch;
        return {
          along: (wx - px) * dir.x + (wy - py) * dir.y,
          across: (wx - px) * perp.x + (wy - py) * perp.y,
        };
      };
      const endA = project(otherBody.from);
      const endB = project(otherBody.to);
      const sideways = (endA.across + endB.across) / 2;
      if (Math.abs(Math.abs(sideways) - pitch) > SIDE_TOLERANCE) continue;

      // Does the neighbour's own body actually reach this end? A beam alongside the far half of
      // this one says nothing about the shape of this end.
      const from = Math.min(endA.along, endB.along);
      const to = Math.max(endA.along, endB.along);
      if (alongMm < from - 1e-6 || alongMm > to + 1e-6) continue;
      return Math.sign(sideways);
    }
    return 0;
  };

  return {
    start: sideAt(body.from * pitch + shift),
    end: sideAt(body.to * pitch + shift),
  };
}
