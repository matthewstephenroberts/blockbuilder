import { Trash2 } from "lucide-react";
import {
  AngledBeam,
  BEAM_ANGLE_OPTIONS,
  BEAM_QUADRANTS,
  BeamHoleAxis,
  BeamHoleType,
  beamAngleOption,
  beamEndHoleMisses,
  beamEndOffsetStuds,
  beamHasMixedHoleAxes,
  beamAutoSuppressedHoles,
  beamHoleIsSolid,
  beamLeadIn,
  BEAM_END_HOLE_MATERIAL,
  beamHoleAxisAt,
  CUSTOM_ANGLE_ID,
  isBeamGridLegal,
  nearestLegalHoleCounts,
  quadrantDegrees,
} from "../model/angledBeam";
import {
  AXIS_SETTABLE_TYPES,
  BLEND_AWARE_TYPES,
  CellType,
  FLIP_AWARE_TYPES,
  HoleAxis,
  PLATE_FRACTION_INFO,
  PLATE_FRACTION_ORDER,
  PLATE_WIDTH_FRACTION_ORDER,
  PlateFraction,
} from "../model/cellTypes";
import { fixedPlateHeight } from "../model/geometry";
import { getCell, GridState } from "../model/grid";
import {
  autoRingRadiusStuds,
  DiscBore,
  DISC_RUNNING_GAP,
  chamferedSides,
  DiscChamferSides,
  effectiveChamferMm,
  MAX_CHAMFER_FRACTION,
  pocketDepthMm,
  fittingHollowRing,
  isSlotOpen,
  MIN_DISC_RIM,
  openSlotCount,
  hubWallMm,
  MIN_SLOT_WALL,
  outerRadiusMm,
  unsnappedOuterRadiusMm,
  ringRadiusMm,
  SlotDisc,
  rimForRingFit,
  ringRadiusForRim,
  SlotDiscSettings,
  slotGapPerSideMm,
  slotSizeMm,
  slotWallMm,
  withSlotOpen,
} from "../model/slotDisc";
import { PLATE_HEIGHT, STUD_PITCH } from "../model/units";
import { BeamFitSetting, FlipSetting, ToolMode } from "../state/useProjectStore";
import { CircleRing } from "../model/circleRing";

const AXIS_INFO: Record<HoleAxis, { label: string; description: string }> = {
  x: { label: "X", description: "Bores/points sideways along X — connects to a neighbour to the left/right." },
  y: { label: "Y", description: "Bores/points sideways along Y — connects to a neighbour in front/behind." },
  z: { label: "Z", description: "Bores/points vertically through this cell's own layer — connects up/down between stacked layers." },
};

interface Props {
  grid: GridState;
  brush: CellType;
  onBrushChange: (t: CellType) => void;
  axis: HoleAxis;
  onAxisChange: (a: HoleAxis) => void;
  flip: FlipSetting;
  onFlipChange: (f: FlipSetting) => void;
  plateFraction: PlateFraction;
  onPlateFractionChange: (f: PlateFraction) => void;
  widthFraction: PlateFraction | undefined;
  onWidthFractionChange: (f: PlateFraction | undefined) => void;
  roundedEdges: boolean;
  onRoundedEdgesChange: (v: boolean) => void;
  chamferMm: number;
  onChamferMmChange: (v: number) => void;
  blendXPos: boolean;
  onBlendXPosChange: (v: boolean) => void;
  blendXNeg: boolean;
  onBlendXNegChange: (v: boolean) => void;
  blendYPos: boolean;
  onBlendYPosChange: (v: boolean) => void;
  blendYNeg: boolean;
  onBlendYNegChange: (v: boolean) => void;
  cornerBlendXPosYPos: boolean;
  onCornerBlendXPosYPosChange: (v: boolean) => void;
  cornerBlendXPosYNeg: boolean;
  onCornerBlendXPosYNegChange: (v: boolean) => void;
  cornerBlendXNegYPos: boolean;
  onCornerBlendXNegYPosChange: (v: boolean) => void;
  cornerBlendXNegYNeg: boolean;
  onCornerBlendXNegYNegChange: (v: boolean) => void;
  circleDimension: number;
  onCircleDimensionChange: (d: number) => void;
  circleHollow: boolean;
  onCircleHollowChange: (v: boolean) => void;
  circleOuterSquare: boolean;
  onCircleOuterSquareChange: (v: boolean) => void;
  /** The ring the circle controls are editing, when one is selected — see ProjectStore. */
  selectedCircle: CircleRing | null;
  onRemoveCircle: (id: string) => void;
  tool: ToolMode;
  onToolChange: (t: ToolMode) => void;
  onResize: (width: number, height: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  selectedCell: { x: number; y: number } | null;
  onRemoveCell: (x: number, y: number) => void;
  selectedBeam: AngledBeam | null;
  onRemoveBeam: (id: string) => void;
  onClearBeamFit: (id: string) => void;
  onFlushBeam: (id: string) => void;
  onBeamAcrossOffsetChange: (mm: number) => void;
  beamAngleId: string;
  onBeamAngleIdChange: (id: string) => void;
  beamCustomDegrees: number;
  onBeamCustomDegreesChange: (deg: number) => void;
  beamMirror: boolean;
  beamReverse: boolean;
  onBeamQuadrantChange: (mirror: boolean, reverse: boolean) => void;
  beamHoles: number;
  onBeamHolesChange: (n: number) => void;
  beamHoleType: BeamHoleType;
  onBeamHoleTypeChange: (t: BeamHoleType) => void;
  beamHoleAxis: BeamHoleAxis;
  onBeamHoleAxisChange: (a: BeamHoleAxis) => void;
  onBeamHoleAxisAtChange: (index: number, axis: BeamHoleAxis | null) => void;
  onBeamHoleSolidAtChange: (index: number, solid: boolean) => void;
  beamGusset: number;
  onBeamGussetChange: (mm: number) => void;
  beamFit: BeamFitSetting;
  onBeamFitChange: (f: BeamFitSetting) => void;
  onRefitBeam: (id: string, mode: BeamFitSetting) => void;
  onClearBeamHoleAxes: () => void;
  discSettings: SlotDiscSettings;
  onDiscSettingsChange: (patch: Partial<SlotDiscSettings>) => void;
  onSlotMaskChange: (slotEnabled: boolean[] | undefined) => void;
  selectedDisc: SlotDisc | null;
  onRemoveDisc: (id: string) => void;
}

const DISC_BORE_INFO: Record<DiscBore, { label: string; description: string }> = {
  axleHole: { label: "Axle", description: "Cross-shaped axle bore — drives straight off a motor axle without slipping." },
  technicHole: { label: "Pin", description: "Round pin hole — the disc turns freely on a pin rather than being driven by it." },
  none: { label: "None", description: "No centre bore at all." },
};

const BEAM_HOLE_TYPE_INFO: Record<BeamHoleType, { label: string; description: string }> = {
  technicHole: { label: "Pin holes", description: "Standard Technic pin holes, chamfered at both ends." },
  axleHole: { label: "Axle holes", description: "Cross-shaped axle holes." },
  studHole: { label: "Stud holes", description: "Plain round through-holes sized for a System stud." },
  none: { label: "None", description: "No holes at all — a plain angled bar." },
};

/** How a beam drag decides what lands where — see BeamFitMode in angledBeam.ts. */
const BEAM_FIT_OPTIONS: readonly { value: BeamFitSetting; label: string; description: string }[] = [
  {
    value: "auto",
    label: "Auto",
    description:
      "The bore direction decides, as it always has: a vertical bore takes Grid, an in-plane one takes Body.",
  },
  {
    value: "body",
    label: "Body to cells",
    description:
      "The body spans the drag exactly and the slack is split as lead-in at both ends; the holes float wherever the pitch puts them. For a beam whose ends fuse into blocks.",
  },
  {
    value: "holes",
    label: "Grid",
    description:
      "Holes on the cell grid: the drag snaps to a direction whose run is a whole number of studs, the first hole sits on the anchor and the rest follow at true pitch. Both end holes then land on cells. For a beam that pins down rather than fuses.",
  },
  {
    value: "centred",
    label: "Centred",
    description:
      "The body spans the drag and the hole count is forced ODD, so one hole sits on the beam's own midpoint. Two beams fitted this way share every hole of the shorter one, whatever their lengths — which is what lets a vertical-bored beam and an in-plane one line up across layers.",
  },
];

/** Web sizes offered for a beam's end blend (AngledBeam.gusset), in mm. */
const BEAM_GUSSET_OPTIONS: readonly { mm: number; label: string; description: string }[] = [
  { mm: 0, label: "None", description: "The beam simply crosses whatever it lands on: a notch on one side, a lip on the other." },
  { mm: 0.4, label: "0.4mm", description: "Just breaks the corner — takes the knife edge off without visibly changing the outline." },
  { mm: 0.8, label: "0.8mm", description: "A light fillet, still well inside what any join can take." },
  { mm: 1.2, label: "1.2mm", description: "The usual choice on 8mm work." },
  { mm: 1.6, label: "1.6mm", description: "A generous fillet — at or near what the shorter face at a typical join allows." },
  { mm: 2.4, label: "2.4mm", description: "Larger than most joins can use: each corner takes what its own faces allow and no more, so this only differs where the faces are long." },
];

const BEAM_HOLE_AXIS_INFO: Record<BeamHoleAxis, { label: string; description: string }> = {
  z: {
    label: "Vertical",
    description:
      "Bores straight down through the beam's top and bottom faces — the flat liftarm lying on the build plate, pinning to whatever is above or below it.",
  },
  perpendicular: {
    label: "In-plane",
    description:
      "Bores square to the beam's own run and still in the X/Y plane — the beam standing on edge, with its holes pointing along the beam's own diagonal rather than along a world axis.",
  },
};

/**
 * The disc's derived dimensions, and the two ways it can be asked for something impossible. Both
 * failures are silent in the 3D view — a disc whose pockets overlap still renders, it just isn't
 * one connected piece any more, and you find out at the slicer or the printer.
 */
function DiscReadout({
  disc,
  partClearance,
  thicknessMm,
}: {
  disc: SlotDisc;
  partClearance: number;
  /** The disc's own thickness, or undefined for the "minimal" height, which has no fixed value. */
  thicknessMm: number | undefined;
}) {
  const wall = slotWallMm(disc);
  // Roughly an axle's own outer reach; only used to say whether the hub is thin, so the exact
  // bore profile doesn't matter here.
  const hub = hubWallMm(disc, disc.bore === "none" ? 0 : 3);
  const problems: string[] = [];
  if (wall < MIN_SLOT_WALL) {
    problems.push(
      wall <= 0
        ? "The pockets overlap — the spokes between them are gone, so the hub isn't joined to the rim. Use fewer slots, a smaller slot, or a bigger ring radius."
        : `Only ${wall.toFixed(1)}mm of spoke between neighbouring pockets. Under about ${MIN_SLOT_WALL}mm it's unlikely to survive being turned.`,
    );
  }
  if (hub < 1.5) {
    problems.push(
      hub <= 0
        ? "The pockets reach the centre bore — there's no hub left to drive."
        : `Only ${hub.toFixed(1)}mm between the bore and the pockets.`,
    );
  }

  // A square disc grows to the next cell boundary, which can be most of a stud more than the ring
  // itself needs. That is invisible otherwise — the panel would just show a size nobody asked for
  // and no setting that explains it.
  if (disc.outerShape === "square") {
    const raw = unsnappedOuterRadiusMm(disc, partClearance);
    const snapped = outerRadiusMm(disc, partClearance);
    if (snapped > raw + 0.05) {
      problems.push(
        `Squared off to ${(snapped * 2).toFixed(1)}mm so its edge lands on a cell boundary — the ring itself only needs ${(
          raw * 2
        ).toFixed(1)}mm. Lower the ring radius or the rim to drop it to the next size down, or switch Outer edge to Round to use the exact size.`,
      );
    }
  }

  const gap = slotGapPerSideMm(disc);
  if (gap < 0.25) {
    problems.push(
      `Only ${gap.toFixed(2)}mm of room per side around the block. A printed pocket comes out undersized and its corners are rounded by the nozzle — under about 0.25mm a block tends to bind rather than drop. Raise Slot clearance.`,
    );
  }
  const housing = fittingHollowRing(disc, partClearance);
  const open = openSlotCount(disc);
  if (open === 0) problems.push("Every position is closed — this disc is a plain ring with no pockets at all.");
  const floorMm = Math.max(0, disc.floorPlates) * PLATE_HEIGHT;
  if (thicknessMm !== undefined && floorMm >= thicknessMm) {
    problems.push(
      `The pocket floor (${floorMm.toFixed(1)}mm) is as thick as the whole disc (${thicknessMm.toFixed(1)}mm), so the pockets aren't cut at all. Make the disc thicker under Plate height, or the floor thinner.`,
    );
  }
  const sides = chamferedSides(disc);
  const askedChamfer = disc.slotChamferMm ?? 0;
  // Same depth the geometry uses, so the panel reports what was really cut rather than what was
  // typed — a request far larger than the plate can take is clamped, silently otherwise.
  // Exactly what the geometry computes, via the same helper — the two used to derive the depth
  // differently and disagree about how much was actually cut.
  const cutChamfer = thicknessMm === undefined ? 0 : effectiveChamferMm(disc, pocketDepthMm(disc, thicknessMm));
  if (askedChamfer > 0 && thicknessMm !== undefined && cutChamfer < askedChamfer - 0.005) {
    problems.push(
      `Mouth chamfer clamped to ${cutChamfer.toFixed(2)}mm (you asked for ${askedChamfer}mm) — a ramp can't take more than ${Math.round(MAX_CHAMFER_FRACTION * 100)}% of the pocket's depth, or there'd be no straight section left to hold a block.`,
    );
  }
  if (askedChamfer > 0 && floorMm > 0 && (disc.slotChamferSides ?? "both") !== "top") {
    problems.push("A floored pocket only opens at the top, so the chamfer is cut there whatever side is picked.");
  }
  const pocketDepth =
    thicknessMm !== undefined && floorMm > 0 && floorMm < thicknessMm ? thicknessMm - floorMm : undefined;

  return (
    <>
      <p className="muted sm" style={{ marginTop: 12 }}>
        {disc.outerShape === "square"
          ? `${(outerRadiusMm(disc, partClearance) * 2).toFixed(1)}mm across flats (${(
              outerRadiusMm(disc, partClearance) * 2 * Math.SQRT2
            ).toFixed(1)}mm corner to corner)`
          : `⌀${(outerRadiusMm(disc, partClearance) * 2).toFixed(1)}mm overall`}{" "}
        · pockets{" "}
        {slotSizeMm(disc).toFixed(1)}mm square ({gap.toFixed(2)}mm per side around the block) on a{" "}
        {ringRadiusMm(disc).toFixed(1)}mm radius · {wall > 0 ? `${wall.toFixed(1)}mm` : "no"} spoke between them
        {` · ${hub.toFixed(1)}mm hub inside them`}
        {open !== disc.slots ? ` · ${open} of ${disc.slots} positions cut` : ""}
        {pocketDepth !== undefined ? ` · ${pocketDepth.toFixed(1)}mm deep over a ${floorMm.toFixed(1)}mm floor` : ""}
        {cutChamfer > 0 ? ` · ${cutChamfer.toFixed(2)}mm ramp on the ${sides.join(" and ")} face${sides.length > 1 ? "s" : ""}` : ""}
      </p>
      <p className="muted sm">
        Turns inside a hollow {housing.dimension}×{housing.dimension} Circle solid ring (bore ⌀
        {housing.innerDiameterMm.toFixed(1)}mm), with {housing.slackMm.toFixed(1)}mm to spare.
        {partClearance > 0
          ? " Print fit's Part clearance is already taken off the rim."
          : " Set Part clearance under Print fit to shrink the rim for a running fit."}
      </p>
      {problems.map((p) => (
        <p className="muted sm" key={p}>
          ⚠ {p}
        </p>
      ))}
    </>
  );
}

/** Whole degrees where the angle is whole, two decimals otherwise — so 45° reads as "45°" while
 * 36.87° keeps the precision that distinguishes it from a neighbouring slope. */
function formatDegrees(deg: number): string {
  return `${Math.abs(deg % 1) < 0.005 ? deg.toFixed(0) : deg.toFixed(2)}°`;
}

/**
 * Per-hole bore direction on the selected beam. The Bore direction picker above sets every hole at
 * once; this is for the case a single setting can't express — an angled brace whose one end pins
 * DOWN onto a plate (a vertical bore) while its other end pins SIDEWAYS into another beam (an
 * in-plane one). Each button cycles that hole through follow-the-beam → vertical → in-plane.
 *
 * Only offered on a beam that exists, not on the brush: a brush places a beam whose holes all bore
 * the same way, and individual holes are adjusted afterwards — the same order cells already work
 * in (paint first, adjust the painted cell second).
 */
function PerHoleBoreEditor({
  beam,
  onChange,
  onSolidChange,
  onClear,
}: {
  beam: AngledBeam;
  onChange: (index: number, axis: BeamHoleAxis | null) => void;
  onSolidChange: (index: number, solid: boolean) => void;
  onClear: () => void;
}) {
  if (beam.holeType === "none" || beam.holes < 1) return null;

  const mixed = beamHasMixedHoleAxes(beam);
  const autoSolid = new Set(beamAutoSuppressedHoles(beam));
  // follow (no override) -> vertical -> in-plane -> SOLID (no hole at all) -> follow.
  // Solid belongs on this cycle rather than in its own control: "which way does this hole bore"
  // and "is there a hole here at all" are the same decision made per hole, and the holes that want
  // turning off are the ones buried in whatever the beam runs into — picked out one at a time,
  // exactly like the bore directions beside them.
  const cycle = (index: number) => {
    if (beamHoleIsSolid(beam, index)) {
      onSolidChange(index, false);
      onChange(index, null);
      return;
    }
    const override = beam.holeAxes?.[index] ?? null;
    if (override === "perpendicular") {
      onSolidChange(index, true);
      return;
    }
    onChange(index, override === null ? "z" : "perpendicular");
  };

  return (
    <>
      <div className="card-head" style={{ marginTop: 16 }}>
        <h2>Bore per hole</h2>
      </div>
      <p className="muted sm">
        Hole 1 is the anchor end. Click one to cycle it: <strong>·</strong> follows the beam&apos;s
        own direction above, <strong>↕</strong> bores vertically, <strong>↔</strong> bores in-plane,
        <strong>✕</strong> leaves it solid — no hole at all, which is what the holes buried inside
        whatever the beam joins want to be.
      </p>
      <div className="row gap" style={{ flexWrap: "wrap" }}>
        {Array.from({ length: beam.holes }, (_, i) => {
          const override = beam.holeAxes?.[i] ?? null;
          const effective = beamHoleAxisAt(beam, i);
          const isSolid = beamHoleIsSolid(beam, i);
          const noRoom = !isSolid && autoSolid.has(i);
          const glyph = isSolid || noRoom ? "✕" : override === null ? "·" : override === "z" ? "↕" : "↔";
          return (
            <button
              key={i}
              className={`brush-btn${isSolid || override !== null ? " active" : ""}`}
              onClick={() => cycle(i)}
              title={
                isSolid
                  ? `Hole ${i + 1} — left solid, no hole bored. Click to bore it again.`
                  : noRoom
                    ? `Hole ${i + 1} — no room between it and the beam's end face, so it's left solid. Click to change its bore direction anyway.`
                    : `Hole ${i + 1} — ${
                        effective === "z" ? "bores vertically" : "bores in-plane"
                      }${override === null ? " (following the beam's own setting)" : " (set on this hole)"}. Click to change.`
              }
            >
              {i + 1} {glyph}
            </button>
          );
        })}
      </div>
      {mixed && (
        <button className="ghost sm" style={{ marginTop: 8 }} onClick={onClear}>
          Reset every hole to the beam&apos;s direction
        </button>
      )}
    </>
  );
}

/**
 * Whether the selected beam's far end lands back on a grid hole centre, and what would fix it when
 * it doesn't. This is the one thing about an angled beam that isn't visible by looking at it: 45°
 * seems like the most natural angle there is and is the one angle that can never span two grid
 * holes (see BeamAngleOption.legalPeriod). Saying so, with the nearest hole counts that DO work, is
 * what keeps the feature from being a trap.
 */
function BeamLegality({ beam }: { beam: AngledBeam }) {
  const preset = beamAngleOption(beam);
  const end = beamEndOffsetStuds(beam);
  const endText = `far end at +${end.dx.toFixed(2)}, +${end.dy.toFixed(2)} studs from the anchor`;
  const lead = beamLeadIn(beam);

  // A FITTED beam answers the grid-legality question differently, so it gets its own line rather
  // than the warning below. Its far end genuinely does land on a cell centre — the body reaches it
  // — and the reason the hole pattern doesn't is the point of the fit, not a problem with it.
  if (beam.endpoint) {
    const between = `(${beam.anchorX}, ${beam.anchorY}) and (${beam.endpoint.x}, ${beam.endpoint.y})`;
    return (
      <p className="muted sm" style={{ marginTop: 12 }}>
        {lead.start === 0 && lead.end === 0
          ? `✓ Fitted between ${between} — a whole number of hole-spacings apart, so no lead-in was needed: the end HOLES land on those two cells and pin straight into the grid.`
          : `✓ Fitted between ${between} — the body spans the two cell centres exactly, so it fuses into whatever is painted at each end. Its ${beam.holes} holes stay at a true 8mm pitch, centred, with ${lead.start.toFixed(2)}mm of plain material past the end hole at each end.`}
      </p>
    );
  }

  if (isBeamGridLegal(beam)) {
    return (
      <p className="muted sm" style={{ marginTop: 12 }}>
        ✓ Both ends land on grid hole centres ({endText}) — this beam pins in at both ends.
      </p>
    );
  }

  const nearest = nearestLegalHoleCounts(beam);
  return (
    <p className="muted sm" style={{ marginTop: 12 }}>
      ⚠ Anchor end only: {endText}, which isn't a whole number of studs, so the far end won't line
      up with a grid hole. The beam is still correct and printable — its own holes are at a true
      8mm pitch — you just can't pin its far end straight into the grid.{" "}
      {nearest && nearest.length > 0
        ? `At this angle, ${nearest.join(" or ")} holes would land both ends on the grid.`
        : (preset?.note ?? "")}
    </p>
  );
}

export default function Toolbar({
  grid,
  brush,
  onBrushChange: _onBrushChange,
  axis,
  onAxisChange,
  flip,
  onFlipChange,
  plateFraction,
  onPlateFractionChange,
  widthFraction,
  onWidthFractionChange,
  roundedEdges,
  onRoundedEdgesChange,
  chamferMm,
  onChamferMmChange,
  blendXPos,
  onBlendXPosChange,
  blendXNeg,
  onBlendXNegChange,
  blendYPos,
  onBlendYPosChange,
  blendYNeg,
  onBlendYNegChange,
  cornerBlendXPosYPos,
  onCornerBlendXPosYPosChange,
  cornerBlendXPosYNeg,
  onCornerBlendXPosYNegChange,
  cornerBlendXNegYPos,
  onCornerBlendXNegYPosChange,
  cornerBlendXNegYNeg,
  onCornerBlendXNegYNegChange,
  circleDimension,
  onCircleDimensionChange,
  circleHollow,
  onCircleHollowChange,
  circleOuterSquare,
  onCircleOuterSquareChange,
  selectedCircle,
  onRemoveCircle,
  tool,
  onToolChange: _onToolChange,
  selectedCell,
  onRemoveCell,
  selectedBeam,
  onRemoveBeam,
  onClearBeamFit,
  onFlushBeam,
  onBeamAcrossOffsetChange,
  beamAngleId,
  onBeamAngleIdChange,
  beamCustomDegrees,
  onBeamCustomDegreesChange,
  beamMirror,
  beamReverse,
  onBeamQuadrantChange,
  beamHoles,
  onBeamHolesChange,
  beamHoleType,
  onBeamHoleTypeChange,
  beamHoleAxis,
  onBeamHoleAxisChange,
  onBeamHoleAxisAtChange,
  onBeamHoleSolidAtChange,
  beamGusset,
  onBeamGussetChange,
  beamFit,
  onBeamFitChange,
  onRefitBeam,
  onClearBeamHoleAxes,
  discSettings,
  onDiscSettingsChange,
  onSlotMaskChange,
  selectedDisc,
  onRemoveDisc,
}: Props) {
  // The Edit tool adjusts whatever's already painted — but only the SPECIFIC cell currently
  // selected (a plain click loads one cell's own settings; see useProjectStore's selectCell), so
  // each picker's relevance while editing should follow that cell's own type, not stay
  // unconditionally on. Before anything is clicked yet (selectedCell === null), there's no cell to
  // check against — the pickers still act as a general "what will Shift+drag apply" settings panel
  // in that state, so they default to visible.
  const editingType = tool === "edit" && selectedCell ? getCell(grid, grid.activeLayer, selectedCell.x, selectedCell.y).type : undefined;
  const editingKnownType = tool === "edit" && selectedCell !== null;
  // Solid and CircleSolid are included alongside the hole/connector types (AXIS_SETTABLE_TYPES,
  // not AXIS_AWARE_TYPES) — neither has a bore of its own, but their axis still means something
  // once Plate width narrows them along one direction (for CircleSolid: cutting a straight-edged
  // slit into the curved disc, e.g. a dispenser chute); see AXIS_SETTABLE_TYPES' own doc.
  // An angled beam is being painted, or one is selected for editing. It shares three pickers with
  // a cell (height, width, edges — all three mean the same thing on a beam) and has none of the
  // rest: no cell axis (its bore direction follows the beam, see the Bore picker below), no flip
  // (nothing protrudes), no blends (it has no grid neighbours to blend into).
  // What the quadrant buttons label themselves against: the beam being edited, or — while
  // painting, when there's no beam yet — the settings the brush would place one with.
  const quadrantPreview: AngledBeam =
    selectedBeam ?? ({ angleId: beamAngleId, customDegrees: beamCustomDegrees } as AngledBeam);
  const editingBeam = tool === "edit" && selectedBeam !== null;
  const beamMode = editingBeam || (tool === "paint" && brush === CellType.AngledBeam);
  const editingDisc = tool === "edit" && selectedDisc !== null;
  // What the readout below describes: the disc being edited, or — while painting — a stand-in
  // built from the brush's own settings, so the numbers are live before anything is placed.
  const discPreview: SlotDisc =
    selectedDisc ?? ({ ...discSettings, id: "", layer: 0, centreX: 0, centreY: 0 } as SlotDisc);
  const discMode = editingDisc || (tool === "paint" && brush === CellType.SlotDisc);
  const showAxisPicker =
    !beamMode && !discMode && (tool === "edit" ? !editingKnownType || AXIS_SETTABLE_TYPES.has(editingType!) : AXIS_SETTABLE_TYPES.has(brush));
  // Flip matters for protruding connectors (which way they point), the ball-socket's single port,
  // and narrowed Solid cells (which side of the axis the material is removed from). Plain holes are
  // symmetric bores, so they don't need a flip control. For narrowed Solid: Forward removes material
  // from the +axis side, Reversed removes from the -axis side, letting ribs be positioned left or right.
  const showFlipPicker =
    !beamMode && !discMode && (tool === "edit" ? !editingKnownType || FLIP_AWARE_TYPES.has(editingType!) : FLIP_AWARE_TYPES.has(brush));
  const showHeightAndEdgesPickers =
    beamMode || discMode || (tool === "edit" ? !editingKnownType || editingType !== CellType.Empty : brush !== CellType.Empty);
  // Plate width only means something on a cell whose chosen axis is sideways (X or Y) — a Z-axis
  // cell's own cross-section is already governed by Plate height. Solid qualifies here exactly the
  // same as a hole/connector cell now that showAxisPicker includes it. Always show it but disable
  // when Z-axis is selected so users understand the feature exists but isn't applicable.
  // A beam's width is always meaningful — it's the width across its own run, and a beam has no
  // "Z axis" case where that stops having a single obvious direction the way a cell's does.
  const showWidthPicker = !discMode && (beamMode || (showHeightAndEdgesPickers && showAxisPicker));
  const widthPickerEnabled = beamMode || axis !== "z";
  const showEdgesPicker = !discMode && showHeightAndEdgesPickers;
  // Available at paint time too, not just Edit — which of a cell's 4 faces actually border a
  // hollow ring depends on where it lands in the grid, so a blindly-set toggle is often a no-op
  // for any GIVEN cell, but a brush painted across many cells (an edge/corner of a repeated
  // pattern, e.g.) benefits from not having to switch to Edit and re-set the same toggle per
  // cell — same tradeoff axis/flip already make (see showAxisPicker/showFlipPicker above).
  const showBlendPicker =
    !beamMode && !discMode && (tool === "edit" ? !editingKnownType || BLEND_AWARE_TYPES.has(editingType!) : BLEND_AWARE_TYPES.has(brush));
  // In Edit mode this has to follow the SELECTED CELL's type, not the brush — every other picker
  // already does. Keyed off the brush, selecting a CircleSolid cell showed no circle sections at
  // all, so a group's dimension, position and flags were simply invisible while editing it.
  // A ring selected by its own centre handle has no selected CELL, so the panel has to key off the
  // ring as well as off the cell type — otherwise grabbing a circle by its handle showed nothing to
  // edit, which is the opposite of what the handle is for.
  const showCircleControls =
    !beamMode &&
    !discMode &&
    (tool === "edit" ? editingType === CellType.CircleSolid || !!selectedCircle : brush === CellType.CircleSolid);
  // Editable in BOTH modes now: painting, these are the next circle's settings; editing, they are
  // the selected RING's, and a ring owns its own dimension, so resizing one in place is a real
  // operation rather than the repaint it used to have to be. The one case with nothing to edit is
  // the Edit tool on a circle cell whose ring is missing.
  const circleLayoutEditable = tool !== "edit" || !!selectedCircle;

  // With the Edit tool and nothing picked, every picker still shows — they act as the "what will a
  // Shift+drag apply" settings in that state. But the panel then looks IDENTICAL to editing a real
  // cell, so whatever they happen to be left at reads as the properties of something selected.
  // That's how a stray value gets attributed to a cell that was never selected at all.
  const editingNothing = tool === "edit" && !selectedCell && !selectedBeam && !selectedDisc && !selectedCircle;

  return (
    <div className="card">
      {editingNothing && (
        <p className="muted sm" style={{ marginBottom: 4 }}>
          <strong>Nothing selected.</strong> Click a cell, a beam, a disc&apos;s outline, or a circle&apos;s
          centre handle to edit it — the pickers below will then show and change that item. Until
          then they&apos;re just the settings a Shift+drag would apply, not the properties of anything.
        </p>
      )}
      {discMode && (
        <>
          <div className="card-head">
            <h2>Slot disc</h2>
          </div>
          <p className="muted sm">
            {editingDisc
              ? "Editing the selected disc — every change here applies to it straight away."
              : "Click a cell in the plan below to centre a disc there. Thickness comes from Plate height."}
          </p>

          <div className="row gap">
            <label className="field" style={{ flex: 1 }}>
              <span>Slots</span>
              <input
                type="number"
                min={2}
                max={36}
                value={discSettings.slots}
                onChange={(e) => onDiscSettingsChange({ slots: Math.max(2, Math.min(36, Number(e.target.value) || 2)) })}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Slot size (studs)</span>
              <input
                type="number"
                min={1}
                max={6}
                value={discSettings.slotStuds}
                onChange={(e) => onDiscSettingsChange({ slotStuds: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })}
              />
            </label>
          </div>

          <div className="row gap" style={{ marginTop: 8 }}>
            <label className="field" style={{ flex: 1 }}>
              <span>Slot clearance (mm)</span>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={discSettings.slotClearance}
                onChange={(e) => onDiscSettingsChange({ slotClearance: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Rim (mm)</span>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={discSettings.rimMm}
                onChange={(e) => onDiscSettingsChange({ rimMm: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          </div>

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Slot ring</h2>
          </div>
          <div className="row gap">
            <button
              className={`brush-btn${discSettings.ringRadiusStuds === undefined ? " active" : ""}`}
              onClick={() => onDiscSettingsChange({ ringRadiusStuds: undefined })}
              title={`Smallest radius that still leaves ${MIN_SLOT_WALL}mm of spoke between neighbouring pockets — a bigger radius only makes a bigger disc.`}
            >
              Auto
            </button>
            <button
              className={`brush-btn${discSettings.ringRadiusStuds !== undefined ? " active" : ""}`}
              onClick={() =>
                onDiscSettingsChange({ ringRadiusStuds: Number(autoRingRadiusStuds(discPreview).toFixed(2)) })
              }
              title="Set the ring radius by hand — to line the pockets up with something else, or to leave a bigger hub."
            >
              Manual
            </button>
          </div>
          <button
            className="ghost sm"
            style={{ marginTop: 8 }}
            onClick={() =>
              onDiscSettingsChange({
                ringRadiusStuds: Number(ringRadiusForRim(discPreview, MIN_DISC_RIM, grid.partClearance).toFixed(3)),
                rimMm: MIN_DISC_RIM,
              })
            }
            title={`Moves the pockets out to the edge WITHOUT growing the disc — keeps the current ⌀ and leaves ${MIN_DISC_RIM}mm of rim. The further out they sit, the wider the wedge each one occupies, so the spokes between them get thicker.`}
          >
            Push slots out to the rim
          </button>
          {discSettings.ringRadiusStuds !== undefined && (
            <label className="field" style={{ width: "100%", marginTop: 8 }}>
              <span>Ring radius (studs)</span>
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.25}
                value={discSettings.ringRadiusStuds}
                onChange={(e) => onDiscSettingsChange({ ringRadiusStuds: Math.max(0.5, Number(e.target.value) || 0.5) })}
              />
            </label>
          )}
          <label className="field" style={{ width: "100%", marginTop: 8 }}>
            <span>Start angle (°)</span>
            <input
              type="number"
              min={-360}
              max={360}
              step={1}
              value={discSettings.startAngleDeg}
              onChange={(e) => onDiscSettingsChange({ startAngleDeg: Number(e.target.value) || 0 })}
            />
          </label>

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Centre bore</h2>
          </div>
          <div className="row gap">
            {(Object.keys(DISC_BORE_INFO) as DiscBore[]).map((b) => (
              <button
                key={b}
                className={`brush-btn${discSettings.bore === b ? " active" : ""}`}
                onClick={() => onDiscSettingsChange({ bore: b })}
                title={DISC_BORE_INFO[b].description}
              >
                {DISC_BORE_INFO[b].label}
              </button>
            ))}
          </div>

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Pockets</h2>
          </div>
          <div className="row gap">
            <button
              className={`brush-btn${discSettings.floorPlates === 0 ? " active" : ""}`}
              onClick={() => onDiscSettingsChange({ floorPlates: 0 })}
              title="Pockets go straight through, so a block drops out of the bottom as the disc turns — the usual dispenser."
            >
              Through
            </button>
            <button
              className={`brush-btn${discSettings.floorPlates > 0 ? " active" : ""}`}
              onClick={() => onDiscSettingsChange({ floorPlates: discSettings.floorPlates > 0 ? discSettings.floorPlates : 1 })}
              title="Leaves a floor under each pocket, so it carries its block until something pushes it out."
            >
              Floored
            </button>
          </div>
          {discSettings.floorPlates > 0 && (
            <label className="field" style={{ width: "100%", marginTop: 8 }}>
              <span>Floor (plates)</span>
              <input
                type="number"
                min={1}
                max={6}
                value={discSettings.floorPlates}
                onChange={(e) => onDiscSettingsChange({ floorPlates: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })}
              />
            </label>
          )}
          <label className="field" style={{ width: "100%", marginTop: 8 }}>
            <span>Mouth chamfer (mm)</span>
            <input
              type="number"
              min={0}
              max={3}
              step={0.1}
              value={discSettings.slotChamferMm ?? 0}
              onChange={(e) => onDiscSettingsChange({ slotChamferMm: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <p className="muted sm">
            A lead-in ramp round each pocket mouth. Clearance on its own doesn't stop a block
            binding — a block arriving slightly off-square catches its bottom edge on the sharp rim
            of the hole and stops there. The ramp pushes it into line instead. It matters most on a
            gate plate, where the block has to find one hole with nothing guiding it. 0 turns it off.
          </p>
          {discSettings.slotChamferMm > 0 && (
            <div className="row gap">
              {([
                ["both", "Both faces"],
                ["top", "Top only"],
                ["bottom", "Bottom only"],
              ] as [DiscChamferSides, string][]).map(([value, label]) => (
                <button
                  key={value}
                  className={`brush-btn${(discSettings.slotChamferSides ?? "both") === value ? " active" : ""}`}
                  onClick={() => onDiscSettingsChange({ slotChamferSides: value })}
                  title={
                    value === "both"
                      ? "Ramp both faces — right when the part is reversible or loaded by hand from either side."
                      : value === "top"
                        ? "Ramp the top face only, leaving the bottom flat — a block leaves without a lip to catch on."
                        : "Ramp the bottom face only, leaving the top flat."
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Outer edge</h2>
          </div>
          <p className="muted sm">
            A round disc inside a square cell footprint leaves triangular gaps at the corners.
            Squaring the edge fills them in — the pockets don't move, only the waste corners change.
          </p>
          <div className="row gap">
            {([
              ["round", "Round"],
              ["square", "Square"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={`brush-btn${(discSettings.outerShape ?? "round") === value ? " active" : ""}`}
                onClick={() => onDiscSettingsChange({ outerShape: value })}
                title={
                  value === "round"
                    ? "A round rim — the turning carousel."
                    : "Square the rim off at the same half-width, to sit flush in a square footprint."
                }
              >
                {label}
              </button>
            ))}
          </div>

          <label className="toggle-row" style={{ marginTop: 8 }} title="Opens each pocket through the rim as well, so a block can be pushed out sideways instead of only dropping.">
            <input
              type="checkbox"
              checked={discSettings.openOuter ?? false}
              onChange={(e) => onDiscSettingsChange({ openOuter: e.target.checked })}
            />
            <span>Open at the rim</span>
          </label>

          {/* Per-disc, so only offered for a disc you've actually selected — a brush has no
              positions to open. See the note on SlotDiscSettings. */}
          {editingDisc && (
            <>
          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Open positions</h2>
          </div>
          <p className="muted sm">
            Which of the ring's positions are actually cut. Closing all but one turns this disc into
            a GATE PLATE: put it on the layer under a full carousel with the same ring settings, and
            a block is held up everywhere except where the two line up — so one drops through per
            position as the disc turns. Pin the ring radius to Manual on both so they stay matched.
          </p>
          <div className="row gap" style={{ flexWrap: "wrap" }}>
            {Array.from({ length: discPreview.slots }, (_, i) => {
              const open = isSlotOpen(discPreview, i);
              return (
                <button
                  key={i}
                  className={`brush-btn${open ? " active" : ""}`}
                  onClick={() => onSlotMaskChange(withSlotOpen(discPreview, i, !open))}
                  title={`Position ${i + 1} — ${open ? "cut" : "left solid"}. Click to change.`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="row gap" style={{ marginTop: 8 }}>
            <button
              className="ghost sm"
              onClick={() => onSlotMaskChange(undefined)}
              title="Cut every position — a full carousel."
            >
              All open
            </button>
            <button
              className="ghost sm"
              onClick={() =>
                onSlotMaskChange(Array.from({ length: discPreview.slots }, (_, i) => i === 0))
              }
              title="Leave only position 1 cut — the gate plate for a carousel with these same ring settings."
            >
              Only one open
            </button>
          </div>
            </>
          )}

          <DiscReadout disc={discPreview} partClearance={grid.partClearance} thicknessMm={fixedPlateHeight(plateFraction)} />
          {(() => {
            const housing = fittingHollowRing(discPreview, grid.partClearance);
            const fittedRim = rimForRingFit(discPreview, housing.dimension, grid.partClearance);
            if (Math.abs(fittedRim - discSettings.rimMm) < 0.05) return null;
            return (
              <button
                className="ghost sm"
                style={{ marginTop: 8 }}
                onClick={() => onDiscSettingsChange({ rimMm: Number(fittedRim.toFixed(2)) })}
                title={`Grows the rim to ${fittedRim.toFixed(1)}mm so the disc runs in that ring's bore with ${DISC_RUNNING_GAP}mm to spare, instead of rattling around in it.`}
              >
                Fit the rim to that ring
              </button>
            );
          })()}

          {editingDisc && selectedDisc && (
            <>
              <div className="card-head" style={{ marginTop: 16 }}>
                <h2>Disc actions</h2>
              </div>
              <button className="ghost sm" onClick={() => onRemoveDisc(selectedDisc.id)} title="Delete the selected disc">
                <Trash2 size={16} />
                Remove disc
              </button>
            </>
          )}
        </>
      )}

      {beamMode && (
        <>
          <div className="card-head">
            <h2>Beam angle</h2>
          </div>
          <p className="muted sm">
            {editingBeam
              ? "Editing the selected beam — every change here applies to it straight away."
              : "Click a cell in the plan below to anchor a beam's first hole there — or DRAG from one cell to another to fit a beam between them. Into solid at both ends the body spans both cell centres exactly; onto anything else the holes land on the grid and the direction is snapped to one whose ends fall on holes. Hold SHIFT while dragging to reach the exact cell instead of the snapped one."}
          </p>
          {/* Wrapped in label.field like every other picker in the app — the select's dark theming
              hangs off `.field select` in styles.css, so a bare <select> here rendered as an
              unstyled native control next to controls that don't. */}
          <label className="field" style={{ width: "100%" }}>
            <span>Direction</span>
            <select
              value={beamAngleId}
              onChange={(e) => onBeamAngleIdChange(e.target.value)}
              style={{ width: "100%" }}
            >
              {BEAM_ANGLE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id} title={o.note}>
                  {o.label}
                  {o.legalPeriod === null ? " — anchor end only" : ""}
                </option>
              ))}
              <option value={CUSTOM_ANGLE_ID}>Custom angle…</option>
            </select>
          </label>

          {beamAngleId === CUSTOM_ANGLE_ID && (
            <label className="field" style={{ width: "100%", marginTop: 8 }}>
              <span>Custom angle (°)</span>
              <input
                type="number"
                min={-180}
                max={180}
                step={0.01}
                value={beamCustomDegrees}
                onChange={(e) => onBeamCustomDegreesChange(Number(e.target.value) || 0)}
              />
            </label>
          )}

          {/* All FOUR quadrants, labelled with the direction each one actually produces. The
              picker used to be Forward/Mirrored only, which covered the two quadrants either side
              of +X — so four beams radiating from a single anchor (an omniwheel frame, say) had
              nowhere to point two of its arms. The preset above names the SLOPE, which is what
              decides grid-legality; which way that slope runs is this, independently. */}
          <div className="row gap" style={{ marginTop: 8 }}>
            {BEAM_QUADRANTS.map((q) => {
              const active = (beamMirror === q.mirror) && (beamReverse === q.reverse);
              const deg = quadrantDegrees(quadrantPreview, q);
              return (
                <button
                  key={`${q.mirror}:${q.reverse}`}
                  className={`brush-btn${active ? " active" : ""}`}
                  onClick={() => onBeamQuadrantChange(q.mirror, q.reverse)}
                  title={`Run the beam at ${deg.toFixed(2)}° — anticlockwise from the +X axis, measured at its anchor.`}
                >
                  {formatDegrees(deg)}
                </button>
              );
            })}
          </div>

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Beam holes</h2>
          </div>
          <label className="field" style={{ width: "100%" }}>
            <span>Hole count</span>
            <input
              type="number"
              min={1}
              max={40}
              value={beamHoles}
              onChange={(e) => onBeamHolesChange(Number(e.target.value) || 1)}
            />
          </label>
          <div className="row gap" style={{ flexWrap: "wrap", marginTop: 8 }}>
            {(Object.keys(BEAM_HOLE_TYPE_INFO) as BeamHoleType[]).map((t) => (
              <button
                key={t}
                className={`brush-btn${beamHoleType === t ? " active" : ""}`}
                onClick={() => onBeamHoleTypeChange(t)}
                title={BEAM_HOLE_TYPE_INFO[t].description}
              >
                {BEAM_HOLE_TYPE_INFO[t].label}
              </button>
            ))}
          </div>

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Bore direction</h2>
          </div>
          <div className="row gap">
            {(Object.keys(BEAM_HOLE_AXIS_INFO) as BeamHoleAxis[]).map((a) => (
              <button
                key={a}
                className={`brush-btn${beamHoleAxis === a ? " active" : ""}`}
                onClick={() => onBeamHoleAxisChange(a)}
                title={BEAM_HOLE_AXIS_INFO[a].description}
              >
                {BEAM_HOLE_AXIS_INFO[a].label}
              </button>
            ))}
          </div>

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Beam fit</h2>
          </div>
          <p className="muted sm">
            What a drag lands exactly — the beam&apos;s body on the two cells, or its holes on the
            grid. <strong>Centred</strong> is the one to use when a beam has to line up with another
            on a different layer: an odd hole count puts a hole on the midpoint, and two centred
            beams then share holes however long each is.
          </p>
          <div className="row gap" style={{ flexWrap: "wrap" }}>
            {BEAM_FIT_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`brush-btn${beamFit === o.value ? " active" : ""}`}
                onClick={() => onBeamFitChange(o.value)}
                title={o.description}
              >
                {o.label}
              </button>
            ))}
          </div>
          {selectedBeam?.endpoint && (
            <div className="row gap" style={{ flexWrap: "wrap", marginTop: 8 }}>
              <button
                className="ghost sm"
                onClick={() => onRefitBeam(selectedBeam.id, beamFit)}
                title="Re-run the fit on the selected beam, between its own anchor and endpoint, using the fit picked above."
              >
                Re-fit selected beam
              </button>
            </div>
          )}

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>End blend</h2>
          </div>
          <p className="muted sm">
            Rounds every corner where this beam crosses into a block: inside corners get a tangent
            fillet, outside corners — the lip where the beam&apos;s edge crosses the block&apos;s —
            get rounded off. Each corner takes what its own two faces allow, so a radius larger than
            a join can use simply gives that join its largest possible fillet rather than
            misbehaving. On 8mm work the faces run out around 2mm.
          </p>
          <div className="row gap" style={{ flexWrap: "wrap" }}>
            {BEAM_GUSSET_OPTIONS.map((o) => (
              <button
                key={o.mm}
                className={`brush-btn${Math.abs(beamGusset - o.mm) < 0.01 ? " active" : ""}`}
                onClick={() => onBeamGussetChange(o.mm)}
                title={o.description}
              >
                {o.label}
              </button>
            ))}
          </div>

          {selectedBeam && (
            <PerHoleBoreEditor
              beam={selectedBeam}
              onChange={onBeamHoleAxisAtChange}
              onSolidChange={onBeamHoleSolidAtChange}
              onClear={onClearBeamHoleAxes}
            />
          )}

          {selectedBeam && <BeamLegality beam={selectedBeam} />}

          {selectedBeam &&
            beamEndHoleMisses(selectedBeam, grid.beams ?? []).map((miss) => (
              <p
                key={miss.index}
                className="muted sm"
                style={{ marginTop: 8, color: "#ef4444" }}
              >
                ⚠ Hole {miss.index + 1} won&apos;t pin: another beam&apos;s hole is{" "}
                {(miss.gap * STUD_PITCH).toFixed(2)}mm away rather than through this one. A corner
                only closes when the run between the two holes is a whole number of studs — a right
                isoceles triangle can never manage it, because its hypotenuse is √2 times a leg.
                Pythagorean legs do: 3-4-5, 6-8-10, 5-12-13.
              </p>
            ))}

          {selectedBeam && beamAutoSuppressedHoles(selectedBeam).length > 0 && (
            <p className="muted sm" style={{ marginTop: 8 }}>
              ⚠ {beamAutoSuppressedHoles(selectedBeam).length === 1 ? "One end hole is" : "Both end holes are"}{" "}
              left <strong>solid</strong>: there's less than{" "}
              {BEAM_END_HOLE_MATERIAL[selectedBeam.holeType].toFixed(1)}mm between the hole and the
              beam's end face, so boring it would break out through the end rather than make a hole.
              Give the beam one hole fewer, or drag it to a cell further out, to get the hole back.
            </p>
          )}

          {selectedBeam && (
            <>
              <div className="card-head" style={{ marginTop: 16 }}>
                <h2>Sit against the blocks</h2>
              </div>
              <p className="muted sm">
                Slides the beam across its own run until its outer wall meets the outer corner of
                the blocks at each end, so the two outlines meet at a point instead of crossing —
                which is where the lip comes from in the first place. The hole pitch doesn&apos;t
                move; the whole beam does.
              </p>
              {beamHoleAxisAt(selectedBeam, 0) === "z" && (selectedBeam.acrossOffset ?? 0) === 0 && (
                <p className="muted sm">
                  This beam&apos;s holes bore <strong>vertically</strong>, so they pin down onto
                  whatever is beneath and it was left centred on the grid rather than sat against
                  the blocks automatically. Sitting it against them moves it sideways, which on a
                  diagonal takes every hole off the grid — the two can&apos;t both be had. Use the
                  button if the wall matters more here than the holes.
                </p>
              )}
              {beamHoleAxisAt(selectedBeam, 0) === "z" && (selectedBeam.acrossOffset ?? 0) !== 0 && (
                <p className="muted sm">
                  ⚠ This beam&apos;s holes bore <strong>vertically</strong>, so they pin down onto
                  whatever is beneath — and sitting it against the blocks has moved them{" "}
                  {Math.abs(selectedBeam.acrossOffset ?? 0).toFixed(2)}mm off the grid. On a
                  diagonal you can have one or the other: a sideways shift only puts the holes back
                  on the grid if it is a whole lattice step across, which at 45° is 11.31mm rather
                  than the ~1.7mm a flush wall wants. <strong>Back to centre</strong> gives up the
                  flush wall and puts the holes back.
                </p>
              )}
              <div className="row gap" style={{ flexWrap: "wrap" }}>
                <button className="ghost sm" onClick={() => onFlushBeam(selectedBeam.id)}>
                  Flush outer wall to block corner
                </button>
                {selectedBeam.acrossOffset ? (
                  <button className="ghost sm" onClick={() => onBeamAcrossOffsetChange(0)}>
                    Back to centre
                  </button>
                ) : null}
              </div>
              <label className="field" style={{ width: "100%", marginTop: 8 }}>
                <span>Across offset (mm)</span>
                <input
                  type="number"
                  step={0.1}
                  value={Number((selectedBeam.acrossOffset ?? 0).toFixed(3))}
                  onChange={(e) => onBeamAcrossOffsetChange(Number(e.target.value) || 0)}
                />
              </label>
            </>
          )}

          {selectedBeam?.endpoint && (
            <button
              className="ghost sm"
              style={{ marginTop: 8 }}
              onClick={() => onClearBeamFit(selectedBeam.id)}
              title="Drop the lead-ins, so the beam's body ends at its own end holes again"
            >
              Clear fit
            </button>
          )}
        </>
      )}

      {showAxisPicker && (
        <>
          <div className="card-head">
            <h2>
              {tool === "edit"
                ? "Axis"
                : brush === CellType.Pin ||
                    brush === CellType.BallPin ||
                    brush === CellType.Stud ||
                    brush === CellType.Axle
                  ? "Protrusion axis"
                  : brush === CellType.Solid || brush === CellType.CircleSolid
                    ? "Narrow axis"
                    : "Hole axis"}
            </h2>
          </div>
          <div className="row gap">
            {(Object.keys(AXIS_INFO) as HoleAxis[]).map((a) => (
              <button
                key={a}
                className={`brush-btn${axis === a ? " active" : ""}`}
                onClick={() => onAxisChange(a)}
                title={AXIS_INFO[a].description}
              >
                {AXIS_INFO[a].label}
              </button>
            ))}
          </div>
        </>
      )}

      {showFlipPicker && (
        <>
          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Flip</h2>
          </div>
          <div className="row gap">
            <button
              className={`brush-btn${flip === "auto" ? " active" : ""}`}
              onClick={() => onFlipChange("auto")}
              title="Automatically point away from a neighbouring cell that's already occupied, so two facing connectors don't jam into each other — falls back to the default (+axis) direction when there's nothing to detect."
            >
              Auto
            </button>
            <button
              className={`brush-btn${flip === false ? " active" : ""}`}
              onClick={() => onFlipChange(false)}
              title="Always grow toward the +axis direction."
            >
              Forward (F)
            </button>
            <button
              className={`brush-btn${flip === true ? " active" : ""}`}
              onClick={() => onFlipChange(true)}
              title="Always grow toward the -axis direction — use this to fix two facing connectors that ended up pointing into each other."
            >
              Reversed (R)
            </button>
          </div>
        </>
      )}

      {showHeightAndEdgesPickers && (
        <>
          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Plate height</h2>
          </div>
          <div className="row gap" style={{ flexWrap: "wrap" }}>
            {PLATE_FRACTION_ORDER.map((f) => (
              <button
                key={f}
                className={`brush-btn${plateFraction === f ? " active" : ""}`}
                onClick={() => onPlateFractionChange(f)}
                title={PLATE_FRACTION_INFO[f].description}
              >
                {PLATE_FRACTION_INFO[f].label}
              </button>
            ))}
          </div>

          {showWidthPicker && (
            <>
              <div className="card-head" style={{ marginTop: 16 }}>
                <h2>Plate width</h2>
              </div>
              <p className="muted sm">
                {beamMode ? (
                  <>
                    The beam's width ACROSS its own run — a DIFFERENT setting from Plate height
                    above, which is the vertical (Z) thickness. Options top out at 8mm (one stud),
                    since a beam wider than the hole pattern it carries would foul its neighbours.
                  </>
                ) : widthPickerEnabled ? (
                  <>
                    Narrows this cell only along its own {axis.toUpperCase()} axis (the direction its
                    connector/hole faces) — a DIFFERENT setting from Plate height above, which is
                    always the vertical (Z) thickness regardless of axis. Options here top out at 8mm
                    (one stud) rather than 9.6mm (one brick), since going wider than a stud would push
                    the cell into its neighbour.
                  </>
                ) : (
                  <>
                    Width narrowing only applies to X and Y axes. Z-axis cells use Plate height instead
                    (see above). Select X or Y axis to enable width options.
                  </>
                )}
              </p>
              <div className="row gap" style={{ flexWrap: "wrap" }}>
                <button
                  className={`brush-btn${widthFraction === undefined ? " active" : ""}${!widthPickerEnabled ? " disabled" : ""}`}
                  onClick={() => widthPickerEnabled && onWidthFractionChange(undefined)}
                  disabled={!widthPickerEnabled}
                  title={
                    widthPickerEnabled
                      ? "Full width (8mm) — the cell fills the whole stud pitch across its connector axis, same as every other cell. Note this is a DIFFERENT 'Full' from Plate height's own Full (9.6mm) above — width's ceiling is one stud (8mm), height's is one brick (9.6mm), so the same word means a different size in each picker."
                      : "Not available for Z-axis cells. Select X or Y axis to enable."
                  }
                >
                  Full (8mm)
                </button>
                {PLATE_WIDTH_FRACTION_ORDER.map((f) => (
                  <button
                    key={f}
                    className={`brush-btn${widthFraction === f ? " active" : ""}${!widthPickerEnabled ? " disabled" : ""}`}
                    onClick={() => widthPickerEnabled && onWidthFractionChange(f)}
                    disabled={!widthPickerEnabled}
                    title={
                      widthPickerEnabled
                        ? `Narrows the cell along its own ${axis.toUpperCase()} (connector) axis to ${PLATE_FRACTION_INFO[f].description.toLowerCase()}`
                        : "Not available for Z-axis cells. Select X or Y axis to enable."
                    }
                  >
                    {PLATE_FRACTION_INFO[f].label}
                  </button>
                ))}
              </div>
            </>
          )}

          {showEdgesPicker && (
            <>
              <div className="card-head" style={{ marginTop: 16 }}>
                <h2>Edges</h2>
              </div>
              <div className="row gap">
                <button
                  className={`brush-btn${!roundedEdges ? " active" : ""}`}
                  onClick={() => onRoundedEdgesChange(false)}
                  title="Sharp, flush edges — flush against a neighbouring block on any side it touches."
                >
                  Not rounded
                </button>
                <button
                  className={`brush-btn${roundedEdges ? " active" : ""}`}
                  onClick={() => onRoundedEdgesChange(true)}
                  title="Softens this block's own exterior vertical corners with a small fillet. Only corners genuinely exposed to open space are rounded — a corner shared with an occupied neighbour stays flush so the two blocks still fit flat together."
                >
                  Rounded
                </button>
              </div>

              <div className="card-head" style={{ marginTop: 16 }}>
                <h2>Chamfer</h2>
              </div>
              <p className="muted sm">
                A 45° flat along this block's own exterior edges — vertical ones and the top/bottom
                perimeter alike. Different from Rounded, which is a full half-cell fillet on the
                vertical corners only: a chamfer is a small flat, and it's what a part that has to
                ENTER something else wants. The 1×1 blocks a slot disc dispenses are the case for
                it — the pocket has a lead-in chamfer at its mouth and this is the other half. Only
                genuinely exposed edges are cut, so a face shared with a neighbour stays flush. 0
                turns it off.
              </p>
              <label className="field" style={{ width: "100%" }}>
                <span>Chamfer (mm)</span>
                <input
                  type="number"
                  min={0}
                  max={3}
                  step={0.1}
                  value={chamferMm}
                  onChange={(e) => onChamferMmChange(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
            </>
          )}
        </>
      )}

      {showBlendPicker && (
        <>
          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Join to ring</h2>
          </div>
          <p className="muted sm">
            A cell next to a Circle solid ring can face empty air where the grid says it touches —
            the ring keeps material only between its two circles, so a cell near the centre faces
            the bore, and one butting into a ROUND rim from outside faces the gap between the arc
            and its own square edge (an arm running into a round ring is exactly that). Toggle a
            side on to reach across and join the ring's real material; leave it off to keep a flat,
            disconnected edge there. Only does anything on a side actually next to a ring with a gap
            — nothing is joined automatically.
          </p>
          <div className="row gap wrap">
            <button
              className={`brush-btn${blendXNeg ? " active" : ""}`}
              onClick={() => onBlendXNegChange(!blendXNeg)}
              title="Join this cell's -X (left) edge across to a ring's real material on that side."
            >
              -X
            </button>
            <button
              className={`brush-btn${blendXPos ? " active" : ""}`}
              onClick={() => onBlendXPosChange(!blendXPos)}
              title="Join this cell's +X (right) edge across to a ring's real material on that side."
            >
              +X
            </button>
            <button
              className={`brush-btn${blendYNeg ? " active" : ""}`}
              onClick={() => onBlendYNegChange(!blendYNeg)}
              title="Join and curve this cell's -Y (down) edge into a hollow ring on that side."
            >
              -Y
            </button>
            <button
              className={`brush-btn${blendYPos ? " active" : ""}`}
              onClick={() => onBlendYPosChange(!blendYPos)}
              title="Join and curve this cell's +Y (up) edge into a hollow ring on that side."
            >
              +Y
            </button>
          </div>

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Blend corner into neighbours' width</h2>
          </div>
          <p className="muted sm">
            For an un-narrowed cell sitting diagonally next to two narrowed neighbours (e.g. a
            picture-frame corner next to two narrowed edge pieces) — toggle a corner on to clip it
            back flush with both neighbours' own narrowed width, closing the pinwheel-shaped notch
            that's otherwise left where the corner still pokes its full width into the enlarged
            centre opening. Only does anything where both neighbours are actually narrowed on the
            matching axis.
          </p>
          <div className="row gap wrap">
            <button
              className={`brush-btn${cornerBlendXNegYNeg ? " active" : ""}`}
              onClick={() => onCornerBlendXNegYNegChange(!cornerBlendXNegYNeg)}
              title="Clip this cell's (-X, -Y) corner flush with its narrowed neighbours on that side."
            >
              -X-Y
            </button>
            <button
              className={`brush-btn${cornerBlendXPosYNeg ? " active" : ""}`}
              onClick={() => onCornerBlendXPosYNegChange(!cornerBlendXPosYNeg)}
              title="Clip this cell's (+X, -Y) corner flush with its narrowed neighbours on that side."
            >
              +X-Y
            </button>
            <button
              className={`brush-btn${cornerBlendXNegYPos ? " active" : ""}`}
              onClick={() => onCornerBlendXNegYPosChange(!cornerBlendXNegYPos)}
              title="Clip this cell's (-X, +Y) corner flush with its narrowed neighbours on that side."
            >
              -X+Y
            </button>
            <button
              className={`brush-btn${cornerBlendXPosYPos ? " active" : ""}`}
              onClick={() => onCornerBlendXPosYPosChange(!cornerBlendXPosYPos)}
              title="Clip this cell's (+X, +Y) corner flush with its narrowed neighbours on that side."
            >
              +X+Y
            </button>
          </div>
        </>
      )}

      {showCircleControls && (
        <>
          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Circle Dimension</h2>
          </div>
          <p className="muted sm">
            Group size — an N x N block of cells sharing one circle, {STUD_PITCH}mm radius per stud
            of N. Any size works (not just 2-5); bigger groups need more cells around the rim before
            the curve reads as smooth rather than blocky.
          </p>
          {tool === "edit" && !selectedCircle && (
            <p className="muted sm">
              This circle cell has no ring behind it, so there is nothing group-wide to edit — it
              builds as a plain solid. Repaint it with the Circle brush to give it one.
            </p>
          )}
          {tool === "edit" && selectedCircle && (
            <p className="muted sm">
              Editing the selected ring — every setting here changes the whole circle at once, and
              resizing repaints its footprint in place.
            </p>
          )}
          <div className="row gap" style={{ alignItems: "center" }}>
            <button
              className="brush-btn"
              style={{ width: 32, padding: 0 }}
              onClick={() => onCircleDimensionChange(Math.max(2, circleDimension - 1))}
              disabled={!circleLayoutEditable || circleDimension <= 2}
              title="Decrease dimension"
            >
              −
            </button>
            <input
              type="number"
              min={2}
              max={99}
              value={circleDimension}
              disabled={!circleLayoutEditable}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) onCircleDimensionChange(Math.max(2, Math.min(99, v)));
              }}
              style={{ width: 56, textAlign: "center" }}
            />
            <button
              className="brush-btn"
              style={{ width: 32, padding: 0 }}
              onClick={() => onCircleDimensionChange(Math.min(99, circleDimension + 1))}
              disabled={!circleLayoutEditable}
              title="Increase dimension"
            >
              +
            </button>
            <span className="muted sm">
              {circleDimension}x{circleDimension} · {((circleDimension / 2) * STUD_PITCH).toFixed(1)}mm radius
            </span>
          </div>

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Outer Edge</h2>
          </div>
          <p className="muted sm">
            Round curves the group's outward-facing sides to the shared circle (the usual look).
            Square leaves them flat instead, so the group tiles flush against neighbouring cells
            painted outside it — e.g. embedding a round (or ringed) feature flush inside a larger
            flat plate.
          </p>
          <div className="row gap">
            <button
              className={`brush-btn${!circleOuterSquare ? " active" : ""}`}
              onClick={() => onCircleOuterSquareChange(false)}
              title="Curve the outer boundary to the shared circle."
            >
              Round
            </button>
            <button
              className={`brush-btn${circleOuterSquare ? " active" : ""}`}
              onClick={() => onCircleOuterSquareChange(true)}
              title="Leave the outer boundary flat/square, flush with neighbouring cells outside the group."
            >
              Square
            </button>
          </div>

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Inner Hole</h2>
          </div>
          <p className="muted sm">
            Hollow bores a concentric inner circle one stud smaller in radius out of the group's
            centre. Combine with a Square outer edge for a plain block with a round hole through it.
          </p>
          <div className="row gap">
            <button
              className={`brush-btn${!circleHollow ? " active" : ""}`}
              onClick={() => onCircleHollowChange(false)}
              title="No inner hole."
            >
              Solid
            </button>
            <button
              className={`brush-btn${circleHollow ? " active" : ""}`}
              onClick={() => onCircleHollowChange(true)}
              title={`Bores an inner circle sized as if the group were ${circleDimension - 1}x${circleDimension - 1} out of the centre.`}
            >
              Hollow (ring)
            </button>
          </div>

          {tool !== "edit" && (
            <p className="muted sm" style={{ marginTop: 16 }}>
              A click places the whole {circleDimension}x{circleDimension} circle, centred where you
              click. For a partial circle — a corner block carrying the correct 2x2 arc, say — place
              the whole thing and erase the cells you don&apos;t want: the survivors keep the ring, so
              they keep being cut to the same circle. Painting a circle cell back inside an existing
              ring rejoins it rather than starting a new one.
            </p>
          )}
        </>
      )}

      {tool === "edit" && selectedCircle && (
        <>
          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Circle actions</h2>
          </div>
          <button
            className="ghost sm"
            onClick={() => onRemoveCircle(selectedCircle.id)}
            title="Delete the whole ring and the cells that belong to it"
          >
            <Trash2 size={16} />
            Remove circle
          </button>
        </>
      )}

      {editingBeam && selectedBeam && (
        <>
          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Beam actions</h2>
          </div>
          <button className="ghost sm" onClick={() => onRemoveBeam(selectedBeam.id)} title="Delete the selected beam">
            <Trash2 size={16} />
            Remove beam
          </button>
        </>
      )}

      {tool === "edit" && selectedCell && (
        <>
          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Cell Actions</h2>
          </div>
          <button
            className="ghost sm"
            onClick={() => onRemoveCell(selectedCell.x, selectedCell.y)}
            title="Clear the selected cell"
          >
            <Trash2 size={16} />
            Remove cell
          </button>
        </>
      )}
    </div>
  );
}
