export enum CellType {
  Empty = "empty",
  Solid = "solid",
  CircleSolid = "circleSolid",
  TechnicHole = "technicHole",
  StudHole = "studHole",
  AxleHole = "axleHole",
  BallJoint = "ballJoint",
  ThinPlate = "thinPlate",
  Pin = "pin",
  BallPin = "ballPin",
  Stud = "stud",
  Axle = "axle",
  AxlePiece = "axlePiece",
  PinPiece = "pinPiece",
}

/**
 * World axis a hole bores through. "x"/"y" bore sideways through the beam's own walls (the usual
 * Technic pin/axle hole, connecting to a neighbour in that direction); "z" bores vertically
 * through the cell's own layer slot (top to bottom), e.g. to let a pin join two stacked layers.
 */
export type HoleAxis = "x" | "y" | "z";

export const HOLE_TYPES: ReadonlySet<CellType> = new Set([
  CellType.TechnicHole,
  CellType.StudHole,
  CellType.AxleHole,
  CellType.BallJoint,
]);

/** Cell types where the axis picker matters (holes bore along it; a pin/ball-pin/stud protrudes along it). */
export const AXIS_AWARE_TYPES: ReadonlySet<CellType> = new Set([
  ...HOLE_TYPES,
  CellType.Pin,
  CellType.BallPin,
  CellType.Stud,
  CellType.Axle,
  CellType.AxlePiece,
  CellType.PinPiece,
]);

/**
 * AXIS_AWARE_TYPES plus Solid — everywhere a cell's `axis` is read/written for Cell.widthFraction's
 * sake (narrowing a cell along one grid direction), not for a hole/connector's own bore direction.
 * geometry.ts's own narrowing math (see buildGridGeometry's `axisSpan`) only ever reads `cell.axis`
 * directly, with no check on `cell.type` at all — a Solid cell given an axis narrows exactly the
 * same way a hole cell does. The UI (Toolbar's axis/width pickers) and the store (which axis
 * survives a repaint or an Edit-tool property change) are what actually gate this; widening those
 * gates by this one set is what turns "narrowing already works for Solid" into "the UI lets you
 * reach it" — a Solid cell has no hole/connector to bore or protrude, but there's no reason a plain
 * block (a rib, a standoff, a spacer) shouldn't be paintable narrower along one axis too.
 *
 * CircleSolid is included for the same reason as Solid, plus one more: narrowing a CircleSolid
 * cell cuts a straight-edged slit/slot into what's otherwise a curved disc (e.g. a coin slot or a
 * dispenser chute through the rim) — geometry.ts builds the narrowed box FIRST, then intersects
 * that with the group's shared circle, so the slit and the curve combine instead of one replacing
 * the other.
 */
export const AXIS_SETTABLE_TYPES: ReadonlySet<CellType> = new Set([...AXIS_AWARE_TYPES, CellType.Solid, CellType.CircleSolid]);

/**
 * Cell types that ARE the cell's body rather than something bolted onto it. Every other type emits
 * the cell's full solid box and then adds its own feature on top — a Pin cell, for instance, is a
 * solid block with a pin growing out of one face, which is what you want for an integrated
 * connector on a beam. A bare piece isn't that: an axle segment is just the axle, no surrounding
 * cube, matching how a real standalone Technic axle is built. Stacking those gives a real
 * standalone axle ("Axle 2"/"Axle 3" are nothing but these blocks in a row), which is
 * impossible to express if the cell insists on contributing a box too.
 */
export const BODY_REPLACING_TYPES: ReadonlySet<CellType> = new Set([CellType.AxlePiece, CellType.PinPiece]);

/**
 * Cell types that actually protrude in a direction (as opposed to a hole, which is a symmetric
 * bore — a hole looks and behaves the same whichever way you'd call its axis "flipped"). Only
 * these need a flip control: two Pin cells facing each other along the same axis both grow in the
 * `+axis` direction by default, so one ends up jammed inside the other instead of both pointing
 * outward — flipping one so it grows toward `-axis` instead is what fixes that.
 *
 * BallJoint is the one HOLE_TYPES member also listed here: unlike the other holes (plain symmetric
 * bores), a real ball-socket is only open on ONE side — a bulb-shaped pocket with a single port
 * and a solid backing on the other, not a bore straight through — so it needs the same directional
 * concept as a protruding connector, just applied to which side its one port opens on.
 *
 * Solid (and CircleSolid, narrowed the same way) is included here when narrowed via
 * widthFraction: the flip setting controls which side of the axis the material gets removed from
 * (forward removes from the +axis side, reversed from the -axis side), so a narrowed rib or slit
 * can be positioned on either side of its axis.
 */
export const FLIP_AWARE_TYPES: ReadonlySet<CellType> = new Set([
  CellType.Solid,
  CellType.CircleSolid,
  CellType.Pin,
  CellType.BallPin,
  CellType.Stud,
  CellType.Axle,
  CellType.BallJoint,
]);

/**
 * Cell types that can have one or more of their own 4 side faces (Cell.blendXPos/XNeg/YPos/YNeg)
 * explicitly curved into a neighbouring hollow CircleSolid ring, rather than showing a flat,
 * square-cornered wall where the two meet — see geometry.ts's own `blendFaceToNeighborHollow` for
 * the actual cut. Deliberately opt-in per face rather than auto-detected: a cell reaching into a
 * ring's hollow doesn't always want this (e.g. a rod meant to butt up flush against a ring at its
 * own natural endpoint), and which faces should curve vs. stay flat depends on the specific layout
 * in a way that isn't reliably inferable from geometry alone — every automatic heuristic tried here
 * ended up either curving faces that should've stayed flat, or (worse) eating a cell's own core
 * material when two opposite blended faces' cuts met in the middle. An explicit per-face toggle
 * sidesteps both failure modes: the user picks exactly which face(s) blend, one direction at a
 * time, and can see the result and adjust rather than a heuristic silently guessing wrong.
 *
 * Matches every type the "bridge across a hollow-cut gap" reconnection in geometry.ts already
 * applies to — everything except CircleSolid itself (which already handles its own group's hollow)
 * and BODY_REPLACING_TYPES (a bare shaft has no box face to blend).
 */
export const BLEND_AWARE_TYPES: ReadonlySet<CellType> = new Set(
  Object.values(CellType).filter((t) => t !== CellType.CircleSolid && !BODY_REPLACING_TYPES.has(t)),
);

/**
 * How tall any cell is, in stacked plates — applies uniformly to every cell type (Solid,
 * holes, connectors alike), not just a special "thin" variant. "1"/"2"/"3" are absolute
 * stacked-plate counts (each plate is a fixed 3.2mm, the same unit real plates actually stack in)
 * rather than a fraction of the current layer height — a "2-plate" cell is always 6.4mm
 * regardless of what else is in its layer. "Full" (or leaving this unset) is one standard
 * brick (3 plates, 9.6mm) — there's no separate grid-wide "layer height" setting for it to refer
 * to; each layer's own stacking height is simply the tallest of its own cells (see
 * model/geometry.ts's computeLayerHeights). "Minimal" is computed dynamically (see
 * model/geometry.ts) to sit just below the pin/axle hole bore level of the tallest cell sharing
 * its layer, so it never intrudes on an axle passing through — it isn't a fixed plate count since
 * the safe height depends on that reference height.
 */
export type PlateFraction = "full" | "module" | "halfModule" | "1" | "2" | "3" | "minimal";

export interface PlateFractionInfo {
  label: string;
  /** A 1-2 character glyph for the grid overlay — see GridEditor's per-cell indicators. */
  shortLabel: string;
  description: string;
}

// Every label spells out its own mm value — this used to live only in the hover tooltip, which
// meant telling "Full" and "3 plates" apart (they're the SAME 9.6mm; "full" is just the default
// you get for not picking a fraction at all, not a fourth distinct size) needed a hover to check.
export const PLATE_FRACTION_INFO: Record<PlateFraction, PlateFractionInfo> = {
  full: {
    label: "Full (9.6mm)",
    shortLabel: "F",
    description:
      "The default — one standard brick, 9.6mm (the same fixed size as \"3 plates\"; \"Full\" is just what a cell gets when nothing more specific is picked). This does NOT stretch to match a taller neighbour in the same layer — each cell's own height is fixed once painted; it's the LAYER's overall height that ends up as whichever of its cells is tallest.",
  },
  module: {
    label: "1 module (8mm)",
    shortLabel: "M",
    description:
      "One Technic module — 8mm, the height of a real Technic beam/liftarm. Same as the stud pitch, so the cell is square in cross-section, which is what lets a rounded end sit flush with its own top and bottom faces instead of leaving a ledge.",
  },
  halfModule: {
    label: "½ module (4mm)",
    shortLabel: "½M",
    description: "Half a Technic module — 4mm, the thickness of a real thin (“x 0.5”) liftarm.",
  },
  "1": { label: "1 plate (3.2mm)", shortLabel: "1p", description: "A single standard plate — 3.2mm." },
  "2": { label: "2 plates (6.4mm)", shortLabel: "2p", description: "Two stacked standard plates — 6.4mm." },
  "3": {
    label: "3 plates (9.6mm)",
    shortLabel: "3p",
    description: "Three stacked standard plates — 9.6mm. The same fixed size as \"Full\" — see its own description.",
  },
  minimal: {
    label: "Minimal",
    shortLabel: "m",
    description:
      "As short as possible while staying clear of a neighbouring full-height cell's pin/axle hole bore — won't interfere with an axle passing through. No fixed mm value: how short is \"safe\" depends on that neighbour's own height.",
  },
};
export const PLATE_FRACTION_ORDER: PlateFraction[] = ["full", "module", "halfModule", "1", "2", "3", "minimal"];

/**
 * The subset of PLATE_FRACTION_ORDER that's meaningful as a cell's WIDTH along its own connector
 * axis (see Cell.widthFraction) — everything here is genuinely NARROWER than the 8mm stud pitch,
 * largest first.
 *
 * The others are all excluded for a reason, not for tidiness: "full" and "3" both resolve to 9.6mm
 * (a System brick's height), which as a width would push the cell out past its own grid square and
 * into its neighbour; "module" is exactly 8mm, i.e. full width, which the picker already offers as
 * its own "Full" entry (listing it again produced two buttons both labelled "Full"); and "minimal"
 * has no fixed size at all — it's resolved against a layer's own height, which says nothing about
 * how wide a cell should be.
 */
export const PLATE_WIDTH_FRACTION_ORDER: PlateFraction[] = ["2", "halfModule", "1"];

export interface CellTypeInfo {
  label: string;
  shortLabel: string;
  colour: string;
  description: string;
}

export const CELL_TYPE_INFO: Record<CellType, CellTypeInfo> = {
  [CellType.Empty]: {
    label: "Empty",
    shortLabel: "—",
    colour: "transparent",
    description: "No material here — a hole through the whole tile footprint.",
  },
  [CellType.Solid]: {
    label: "Solid",
    shortLabel: "S",
    colour: "var(--lego-blue)",
    description: "Fully solid block at full height, no connector bore. Fast to print, sturdy.",
  },
  [CellType.CircleSolid]: {
    label: "Circle solid",
    shortLabel: "◯",
    colour: "var(--lego-blue)",
    description:
      "Solid block with curved outer edges forming a circular arc. Dimension (2x2, 3x3, 4x4) determines the radius of curvature. Combine multiple to create smooth circular designs.",
  },
  [CellType.TechnicHole]: {
    label: "Technic hole",
    shortLabel: "O",
    colour: "var(--lego-green)",
    description:
      "Round pin-hole bore through the beam — the classic Technic connector, with a wider entrance chamfer at both ends to guide a pin in.",
  },
  [CellType.StudHole]: {
    label: "Stud hole",
    shortLabel: "o",
    colour: "#7dd3fc",
    description:
      "Plain round through-hole sized for a standard System-style stud — no entrance chamfer, since a stud doesn't need guiding in from both sides.",
  },
  [CellType.AxleHole]: {
    label: "Axle hole",
    shortLabel: "+",
    colour: "var(--lego-orange)",
    description: "Cross-shaped bore for a Technic axle.",
  },
  [CellType.BallJoint]: {
    label: "Ball joint",
    shortLabel: "B",
    colour: "var(--lego-teal)",
    description:
      "A ball-and-socket cup, open on one side (the chosen axis) with a solid backing on the other — the receiving counterpart to a Ball pin cell.",
  },
  [CellType.ThinPlate]: {
    label: "Thin plate",
    shortLabel: "T",
    colour: "var(--lego-yellow)",
    description:
      "Thin solid plate (1 plate tall) under the stud only, no pin/axle cavity — saves material where the full connector height isn't needed.",
  },
  [CellType.Pin]: {
    label: "Pin",
    shortLabel: "P",
    colour: "var(--lego-red)",
    description:
      "An integrated Technic pin connector protruding from this cell along the chosen axis — printed as one piece with the model, for plugging directly into another part's hole.",
  },
  [CellType.BallPin]: {
    label: "Ball pin",
    shortLabel: "◉",
    colour: "var(--lego-azure)",
    description:
      "An integrated ball-joint connector (neck + ball) protruding from this cell along the chosen axis — the male counterpart to a Ball joint socket cell.",
  },
  [CellType.Stud]: {
    label: "Stud",
    shortLabel: "•",
    colour: "#facc15",
    description:
      "A System-style stud protruding from this cell along the chosen axis — paint it on any face (top, or sideways for SNOT-style building) rather than getting one automatically.",
  },
  [CellType.AxlePiece]: {
    label: "Axle piece",
    shortLabel: "✜",
    colour: "#f59e0b",
    description:
      "A bare cross-shaped Technic axle segment that IS this cell — no surrounding block. Stack them in a line to build a standalone axle of any length. Use the Axle brush instead when you want an axle growing out of a solid part.",
  },
  [CellType.PinPiece]: {
    label: "Pin piece",
    shortLabel: "⊝",
    colour: "#ef4444",
    description:
      "A bare Technic pin shaft that IS this cell — no surrounding block. Stack them in a line to build a standalone pin of any length. Use the Pin brush instead when you want a pin growing out of a solid part.",
  },
  [CellType.Axle]: {
    label: "Axle",
    shortLabel: "✛",
    colour: "#fb923c",
    description:
      "A solid cross-shaped Technic axle rod protruding from this cell along the chosen axis — the male counterpart to an Axle hole cell, sized with clearance to fit inside one.",
  },
};

// ThinPlate is intentionally excluded here (not offered as a brush any more) — every cell type
// now gets its height from the same universal "Plate height" picker (see Toolbar.tsx), so a
// separate "thin" variant of Solid is redundant. The enum member and its CELL_TYPE_INFO entry stay
// so older saved projects with ThinPlate cells still load and render correctly.
export const CELL_TYPE_ORDER: CellType[] = [
  CellType.Solid,
  CellType.CircleSolid,
  CellType.TechnicHole,
  CellType.StudHole,
  CellType.AxleHole,
  CellType.BallJoint,
  CellType.Pin,
  CellType.BallPin,
  CellType.Stud,
  CellType.Axle,
  CellType.AxlePiece,
  CellType.PinPiece,
  CellType.Empty,
];
