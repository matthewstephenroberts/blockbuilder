import { useCallback, useMemo, useRef, useState } from "react";
import { AXIS_SETTABLE_TYPES, CellType, FLIP_AWARE_TYPES, HoleAxis, PlateFraction } from "../model/cellTypes";
import { AutoFillOptions, generateAutoFillLayer } from "../model/autofill";
import {
  AngledBeam,
  BeamHoleAxis,
  BeamMoveRef,
  BeamNeighbourFit,
  beamNeighbourOffset,
  BeamHoleType,
  beamFitToEndpoint,
  BeamFitMode,
  isOnCellGrid,
  beamBodySpanStuds,
  beamDirection,
  beamEndsMeetingBeams,
  beamFlushOffset,
  beamHolePositions,
  createAngledBeam,
  nearestBeamHole,
  snapEndpointToLegal,
  withHoleAxis,
  withSolidHole,
} from "../model/angledBeam";
import { STUD_PITCH } from "../model/units";
import { fixedPlateHeight } from "../model/geometry";
import { cellEdgeRadius } from "../model/rounding";
import { createSlotDisc, DEFAULT_DISC_SETTINGS, normalizeSlotDisc, SlotDisc, SlotDiscSettings } from "../model/slotDisc";
import { centreForOrigin, CircleRing } from "../model/circleRing";
import {
  addBeam,
  addDisc,
  addLayer,
  duplicateLayer,
  clearRect,
  createEmptyGrid,
  getActiveLayer,
  GridState,
  indexOf,
  inBounds,
  moveCell,
  moveLayerDown,
  moveLayerUp,
  removeBeam,
  removeDisc,
  removeLayer,
  resizeGrid,
  DEFAULT_RESIZE_ANCHOR,
  ResizeAnchor,
  layerPitch,
  setActiveLayer,
  setLayerSpacing,
  updateBeam,
  updateDisc,
  withActiveLayerCells,
  circleRingAt,
  circleRingCells,
  circleRingCovering,
  moveCircleRing,
  removeCircleRing,
  withCircleRingCellProperties,
  gcCircleRings,
  resizeCircleRing,
  updateCircleRing,
  withCircleRing,
  withPropertiesRect,
  withRect,
} from "../model/grid";

const HISTORY_LIMIT = 50;

/**
 * "paint" applies the current brush cell type. "edit" leaves every cell's type untouched and only
 * adjusts axis/flip/plate height/edges on cells that are already there — a plain click/drag just
 * inspects a cell (loads its current settings into the pickers below, so you can see what's there
 * before touching anything); holding Shift while clicking/dragging applies whatever the pickers are
 * currently set to across that rectangle.
 */
export type ToolMode = "paint" | "edit";

/**
 * Which way a protruding connector (Pin/BallPin/Stud) grows along its axis. "auto" (the default)
 * picks per-cell at paint time — see `autoDetectFlip` — so placing two facing connectors next to
 * each other doesn't require manually flipping one; the explicit true/false settings override
 * that for every cell painted while selected.
 */
export type FlipSetting = "auto" | boolean;

/**
 * The beam-fit picker's value. "auto" keeps the original rule — a vertical bore takes the
 * grid-aligned fit, an in-plane one the body fit — and the explicit modes override it (see
 * BeamFitMode).
 */
export type BeamFitSetting = "auto" | BeamFitMode;

export interface ProjectStore {
  grid: GridState;
  brush: CellType;
  setBrush: (t: CellType) => void;
  axis: HoleAxis;
  setAxis: (a: HoleAxis) => void;
  flip: FlipSetting;
  setFlip: (f: FlipSetting) => void;
  plateFraction: PlateFraction;
  setPlateFraction: (f: PlateFraction) => void;
  widthFraction: PlateFraction | undefined;
  setWidthFraction: (f: PlateFraction | undefined) => void;
  roundedEdges: boolean;
  setRoundedEdges: (v: boolean) => void;
  /** The chamfer (mm) painted onto a cell's exterior edges — see Cell.chamferMm. 0 is off. */
  chamferMm: number;
  setChamferMm: (v: number) => void;
  blendXPos: boolean;
  setBlendXPos: (v: boolean) => void;
  blendXNeg: boolean;
  setBlendXNeg: (v: boolean) => void;
  blendYPos: boolean;
  setBlendYPos: (v: boolean) => void;
  blendYNeg: boolean;
  setBlendYNeg: (v: boolean) => void;
  cornerBlendXPosYPos: boolean;
  setCornerBlendXPosYPos: (v: boolean) => void;
  cornerBlendXPosYNeg: boolean;
  setCornerBlendXPosYNeg: (v: boolean) => void;
  cornerBlendXNegYPos: boolean;
  setCornerBlendXNegYPos: (v: boolean) => void;
  cornerBlendXNegYNeg: boolean;
  setCornerBlendXNegYNeg: (v: boolean) => void;
  /**
   * The circle pickers. With the Edit tool and a circle cell selected they drive the SELECTED
   * RING — one object write, however many cells it spans; otherwise they describe the next circle
   * the brush will place. There is no longer a per-cell col/row picker or a placement mode: a
   * click always places the whole ring, and a partial circle is made by erasing cells from it.
   */
  circleDimension: number;
  setCircleDimension: (d: number) => void;
  circleHollow: boolean;
  setCircleHollow: (v: boolean) => void;
  circleOuterSquare: boolean;
  setCircleOuterSquare: (v: boolean) => void;
  /**
   * The ring the circle pickers are editing: the one selected by its own centre handle, or failing
   * that the one the selected cell belongs to. Selecting the ring directly is the gesture that
   * matches what a circle now IS — one object — the way a slot disc is selected by its centre.
   */
  selectedCircle: CircleRing | null;
  selectCircle: (id: string | null) => void;
  /** Deletes a whole ring and the cells that belonged to it. */
  removeCircle: (id: string) => void;
  /** Moves a ring so its centre lands on (centreX, centreY), carrying its member cells. */
  setCircleCentre: (id: string, centreX: number, centreY: number) => void;
  /** Called at the start and end of a ring drag — see `setCircleCentre`. */
  beginCircleDrag: () => void;
  endCircleDrag: () => void;
  tool: ToolMode;
  setTool: (t: ToolMode) => void;
  paintRect: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    type?: CellType,
    exactEndpoint?: boolean,
  ) => void;
  selectedCell: { x: number; y: number } | null;
  selectCell: (x: number, y: number) => void;
  removeCell: (x: number, y: number) => void;
  autoFill: (opts: AutoFillOptions) => void;
  resize: (width: number, height: number, anchor?: ResizeAnchor) => void;
  setPartClearance: (value: number) => void;
  setHoleClearance: (value: number) => void;
  setSidewaysHoleClearance: (value: number) => void;
  addLayer: () => void;
  /** Copies a layer — cells, beams, discs and circle rings — directly above it. */
  duplicateLayer: (layerIndex: number) => void;
  removeLayer: (layerIndex: number) => void;
  setActiveLayer: (layerIndex: number) => void;
  /** Changes one layer's stud pitch and/or which system's connectors it carries — see LayerSpacing. */
  setLayerSpacing: (layerIndex: number, patch: { pitch?: number; connectorPitch?: number }) => void;
  moveLayerUp: (layerIndex: number) => void;
  moveLayerDown: (layerIndex: number) => void;
  /** Layer indices currently hidden from the 3D preview — a pure viewing convenience (see
   * buildGridGeometry's own `hiddenLayers` param); never affects the actual model or STL export. */
  hiddenLayers: ReadonlySet<number>;
  toggleLayerVisibility: (layerIndex: number) => void;
  /**
   * The angled beam (see AngledBeam) currently being edited in the beam panel, or null. Kept
   * separate from `selectedCell`: a beam isn't a cell, so it can't be addressed by grid coords, and
   * the two selections are independent — you can be editing a beam while a cell is inspected.
   */
  selectedBeamId: string | null;
  selectBeam: (id: string | null) => void;
  /**
   * The angled-beam brush's own settings — the beam equivalent of `axis`/`plateFraction`/the
   * circle pickers. They define the next beam painted, and (with the Edit tool, on a selected
   * beam) apply to that beam immediately, exactly as every other picker does for a cell.
   */
  beamAngleId: string;
  setBeamAngleId: (id: string) => void;
  beamCustomDegrees: number;
  setBeamCustomDegrees: (deg: number) => void;
  /** The quadrant the beam runs into — see AngledBeam.mirror/reverse and BEAM_QUADRANTS. Set as a
   * pair, since picking a direction is one decision, not two independent toggles. */
  beamMirror: boolean;
  beamReverse: boolean;
  setBeamQuadrant: (mirror: boolean, reverse: boolean) => void;
  beamHoles: number;
  setBeamHoles: (n: number) => void;
  beamHoleType: BeamHoleType;
  setBeamHoleType: (t: BeamHoleType) => void;
  beamHoleAxis: BeamHoleAxis;
  setBeamHoleAxis: (a: BeamHoleAxis) => void;
  /**
   * Overrides one hole's own bore direction on the SELECTED beam (Edit tool only) — `null` puts
   * that hole back on the beam's own `beamHoleAxis`. Per-hole and not part of the brush: a brush
   * places a beam whose holes all bore the same way, and individual holes are then adjusted on the
   * beam that exists, the same way a cell's properties are adjusted after it's painted.
   */
  setBeamHoleAxisAt: (index: number, axis: BeamHoleAxis | null) => void;
  /** Leaves one hole on the selected beam solid rather than bored. */
  setBeamHoleSolidAt: (index: number, solid: boolean) => void;
  /** Size in mm of the web added where a beam's square end meets a block — 0 for none. */
  beamGusset: number;
  setBeamGusset: (mm: number) => void;
  /** Which fit a beam drag takes — see BeamFitMode. "auto" lets the bore direction decide, as it
   * always did. */
  beamFit: BeamFitSetting;
  setBeamFit: (f: BeamFitSetting) => void;
  /**
   * Which point on a beam locks to the square under the cursor when the beam is moved — see
   * BeamMoveRef. Like every other beam picker this is the setting for the NEXT beam painted, and
   * it loads back out of whichever beam is selected — the choice is stored per beam
   * (AngledBeam.moveRef) so picking "centre" for one beam doesn't move the grab handle on all of
   * them.
   */
  /** Sits a beam against its nearest parallel neighbour — see the implementation for the geometry. */
  buttBeamToNeighbour: (id: string, fit: BeamNeighbourFit) => { movedMm: number; alongMismatchMm: number } | null;
  beamMoveRef: BeamMoveRef;
  /** Sets it for the next beam painted and — with the Edit tool, on a selected beam — for that
   * beam alone, exactly as every other beam picker behaves. */
  setBeamMoveRef: (r: BeamMoveRef) => void;
  /** Which hole a "hole" lock holds the selected beam by — see AngledBeam.moveHoleIndex. */
  setBeamMoveHoleIndex: (index: number) => void;
  /** Re-runs the fit on an existing beam, between its own anchor and endpoint. */
  refitBeam: (id: string, mode: BeamFitSetting) => void;
  /** Drops every per-hole override on the selected beam, back to one uniform bore direction. */
  clearBeamHoleAxes: () => void;
  /**
   * The slot-disc brush's settings — one object rather than a field per parameter, since a disc has
   * a dozen of them. Patching it also patches the SELECTED disc when the Edit tool is active, the
   * same way every other picker applies to what's selected.
   */
  discSettings: SlotDiscSettings;
  setDiscSettings: (patch: Partial<SlotDiscSettings>) => void;
  setSlotMask: (slotEnabled: boolean[] | undefined) => void;
  selectedDiscId: string | null;
  selectDisc: (id: string | null) => void;
  removeDisc: (id: string) => void;
  /** Moves a disc's centre cell without an undo entry — the Alt-drag gesture's intermediate steps,
   * paired with `checkpoint()` at the start, exactly like a beam's anchor drag. */
  setDiscCentre: (id: string, centreX: number, centreY: number) => void;
  /**
   * `history: false` applies the change without pushing an undo entry — for a continuous gesture
   * (dragging a beam's anchor across the plan) that would otherwise fill the whole 50-entry undo
   * stack with one drag's worth of intermediate positions. Pair it with `checkpoint()` at the
   * start of the gesture so the drag as a whole is still a single undo step.
   */
  updateBeam: (id: string, patch: Partial<AngledBeam>, history?: boolean) => void;
  /** Drops a beam's endpoint fit — see AngledBeam.leadInStart. */
  clearBeamFit: (id: string) => void;
  /** Slides a beam across until its outer wall meets the blocks' outer corners; returns the shift. */
  flushBeamToBlocks: (id: string) => number | null;
  removeBeam: (id: string) => void;
  /**
   * Moves one cell's contents to another square on the active layer (see grid.ts's `moveCell`).
   * `history: false` for the intermediate steps of a drag — pair it with `checkpoint()` at the
   * start so the whole gesture is one undo step.
   */
  moveCell: (fromX: number, fromY: number, toX: number, toY: number, history?: boolean) => void;
  /** Called at the start and end of a cell Alt-drag — see `moveCell`. */
  beginCellDrag: () => void;
  endCellDrag: () => void;
  /** Pushes the current grid onto the undo stack without changing it — see `updateBeam`'s `history`. */
  checkpoint: () => void;
  loadProject: (grid: GridState) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useProjectStore(initialWidth = 10, initialHeight = 10): ProjectStore {
  const [grid, setGridState] = useState<GridState>(() => createEmptyGrid(initialWidth, initialHeight));
  const [brush, setBrush] = useState<CellType>(CellType.Solid);
  const [axis, setAxis] = useState<HoleAxis>("x");
  const [flip, setFlip] = useState<FlipSetting>("auto");
  // One Technic module (8mm), not a System brick's 9.6mm ("full"): this is a Technic-first
  // designer, and a module is the height nearly everything here is actually built at — beams,
  // holes at a beam's own pitch, and anything meant to stack with them. Only the picker's own
  // starting value; a cell that carries no plateFraction of its own still resolves to 9.6mm
  // (see fixedPlateHeight's `default:` case), so old project files are unaffected.
  const [plateFraction, setPlateFraction] = useState<PlateFraction>("module");
  const [widthFraction, setWidthFraction] = useState<PlateFraction | undefined>(undefined);
  const [roundedEdges, setRoundedEdges] = useState(false);
  const [chamferMm, setChamferMm] = useState(0);
  const [blendXPos, setBlendXPos] = useState(false);
  const [blendXNeg, setBlendXNeg] = useState(false);
  const [blendYPos, setBlendYPos] = useState(false);
  const [blendYNeg, setBlendYNeg] = useState(false);
  const [cornerBlendXPosYPos, setCornerBlendXPosYPos] = useState(false);
  const [cornerBlendXPosYNeg, setCornerBlendXPosYNeg] = useState(false);
  const [cornerBlendXNegYPos, setCornerBlendXNegYPos] = useState(false);
  const [cornerBlendXNegYNeg, setCornerBlendXNegYNeg] = useState(false);
  const [circleDimension, setCircleDimensionState] = useState(2);
  const [circleHollow, setCircleHollowState] = useState(false);
  const [circleOuterSquare, setCircleOuterSquareState] = useState(false);
  const [tool, setTool] = useState<ToolMode>("paint");
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  const [selectedBeamId, setSelectedBeamId] = useState<string | null>(null);
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  /**
   * The grid as it was when a ring drag began. Every step of the drag is computed from THIS, not
   * from the previous step — see moveCircleRing's own note on why stepping erases everything the
   * ring is dragged across.
   */
  const circleDragBase = useRef<GridState | null>(null);
  /** The same snapshot for a plain cell's Alt-drag — see `moveCellAction`. */
  const cellDragBase = useRef<GridState | null>(null);
  const [beamAngleId, setBeamAngleIdState] = useState("a45");
  const [beamCustomDegrees, setBeamCustomDegreesState] = useState(45);
  const [beamMirror, setBeamMirrorState] = useState(false);
  const [beamReverse, setBeamReverseState] = useState(false);
  const [beamHoles, setBeamHolesState] = useState(5);
  const [beamHoleType, setBeamHoleTypeState] = useState<BeamHoleType>("technicHole");
  const [beamHoleAxis, setBeamHoleAxisState] = useState<BeamHoleAxis>("z");
  const [beamGusset, setBeamGussetState] = useState(0);
  const [beamFit, setBeamFit] = useState<BeamFitSetting>("auto");
  const [beamMoveRef, setBeamMoveRefState] = useState<BeamMoveRef>("start");
  const [discSettings, setDiscSettingsState] = useState<SlotDiscSettings>(DEFAULT_DISC_SETTINGS);
  const [selectedDiscId, setSelectedDiscId] = useState<string | null>(null);
  const undoStack = useRef<GridState[]>([]);
  const redoStack = useRef<GridState[]>([]);
  const [, forceRender] = useState(0);

  /**
   * Records `prev` as an undo point.
   *
   * The identity guard is load-bearing, not defensive noise. Every caller does this from inside a
   * `setGridState` updater, and React 18's StrictMode deliberately invokes updaters TWICE with the
   * same `prev` to surface exactly this kind of side effect — so each edit was recording two
   * identical history entries, and every Undo needed pressing twice to move one step. Two
   * genuinely separate edits can never share a `prev` object: the second starts from the state the
   * first produced, and an edit that changes nothing doesn't get here at all (callers only record
   * when `next !== prev`).
   */
  const pushHistory = useCallback((prev: GridState) => {
    if (undoStack.current[undoStack.current.length - 1] === prev) return;
    undoStack.current.push(prev);
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const loadBeamIntoPickers = useCallback((beam: AngledBeam) => {
    setBeamAngleIdState(beam.angleId);
    setBeamCustomDegreesState(beam.customDegrees ?? 45);
    setBeamMirrorState(beam.mirror ?? false);
    setBeamReverseState(beam.reverse ?? false);
    setBeamHolesState(beam.holes);
    setBeamHoleTypeState(beam.holeType);
    setBeamHoleAxisState(beam.holeAxis);
    setBeamGussetState(beam.gusset ?? 0);
    setBeamMoveRefState(beam.moveRef ?? "start");
    setPlateFraction(beam.plateFraction ?? "module");
    setWidthFraction(beam.widthFraction);
    setRoundedEdges(beam.roundedEnds ?? true);
  }, []);

  const paintRect = useCallback(
    (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      type?: CellType,
      /**
       * Take the drag's endpoint literally — no snapping to a direction whose ends land on holes.
       *
       * The snap is right by default, because a direction that cannot close is almost never what
       * someone means. But "almost never" is not never: a beam has to be able to reach a cell that
       * simply is where it is, grid-legal or not, and without a way to say so the snap stops being
       * a help and becomes a wall.
       */
      exactEndpoint?: boolean,
    ) => {
      const explicitFlip = flip === "auto" ? undefined : flip;
      setGridState((prev) => {
        const paintedType = type ?? brush;
        const isEmpty = paintedType === CellType.Empty;

        // A brush-only type never reaches the layer — see BRUSH_ONLY_TYPES. The angled-beam brush
        // places one beam anchored at where the gesture STARTED (x0, y0); a drag has no meaning
        // for it, the way a drag across a circle group only ever uses its own start cell as the
        // centre. Painting it is otherwise a normal paint action: same undo entry, same brush
        // settings, same click.
        if (paintedType === CellType.SlotDisc) {
          const disc: SlotDisc = {
            ...createSlotDisc(prev.activeLayer, x0, y0),
            ...discSettings,
            plateFraction,
          };
          pushHistory(prev);
          setSelectedDiscId(disc.id);
          setSelectedBeamId(null);
          return addDisc(prev, disc);
        }

        if (paintedType === CellType.AngledBeam) {
          // A drag from one cell to another FITS the beam between them (see beamFitToEndpoint):
          // the gesture states both ends, and the angle, hole count and lead-ins follow from that
          // rather than from the direction/hole-count pickers. A plain click has only one cell to
          // go on, so it falls back to the pickers — the brush's original behaviour.
          const layerCells = prev.layers[prev.activeLayer];
          const solidHere = (x: number, y: number) =>
            !!layerCells &&
            inBounds(prev, x, y) &&
            layerCells[indexOf(prev, x, y)]?.type !== CellType.Empty;
          // Which fit depends on what the beam is landing on AND which way its holes bore.
          //
          // Into SOLID at both ends, the body is what has to land — it fuses, and the lead-in fit
          // puts it exactly on the two cell centres. Onto anything else (bare grid, or another
          // beam) nothing fuses: the two are pinned, so the HOLES are what has to land, on the grid
          // where a pin can find them.
          //
          // A VERTICAL bore settles it either way. That beam is a flat liftarm lying on the plate,
          // and its holes pin down onto whatever is beneath — so they have to sit on grid hole
          // centres, whatever its ends are resting against. Only a beam standing on edge, pinning
          // sideways, can afford to let its holes float so its body can land exactly.
          // A VERTICAL bore still picks the hole-aligned FIT. That much costs nothing: it puts the
          // first hole on the anchor's own centre and the rest at true pitch, which is the best
          // grid alignment available before any offset, and it is what a flat liftarm lying on the
          // plate wants — its holes pin down onto whatever is beneath.
          // The BORE DIRECTION decides which fit, not what happens to be at the ends.
          //
          // An IN-PLANE beam stands on edge and pins sideways. Its ends are buried in, or butted
          // against, whatever it joins — so the ends are cropped and what matters is that the holes
          // between them keep a true pitch, centred on the beam's length. That is the lead-in fit,
          // and it lands on ANY drag because the body stretches to reach: the reason a solid-to-
          // solid beam always fits. There is no reason a beam-to-beam one should not, and making it
          // depend on whether the ends were solid is what stopped it.
          //
          // A VERTICAL bore is the other case: those holes pin DOWN onto the grid beneath, so they
          // have to land on it, and the beam takes the hole-aligned fit instead.
          const verticalBores = beamHoleAxis === "z";
          // Which fit the drag takes. "auto" is the old rule — the bore direction decides — kept as
          // the default so nothing changes unless it is asked for. The explicit modes exist because
          // the fit and the bore direction are separate questions: two beams meant to stack across
          // layers want the SAME fit whichever way their holes bore.
          const fitMode: BeamFitMode = beamFit === "auto" ? (verticalBores ? "holes" : "body") : beamFit;
          // Snapped only in the hole-aligned case. Where the beam runs into solid at both ends the
          // BODY is what lands, on the two cell centres, and grid-legality of the direction never
          // comes into it — snapping there would move a join the drag had already put where it
          // wanted.
          // Both ends are snapped to existing beams' HOLES where there is one to reach, not just
          // to cells. A diagonal beam's holes are a whole number of 8mm steps along its own axis,
          // which almost never lands on a cell centre — so two beams aimed at the same cell finish
          // with their end holes a few millimetres apart: joined to look at, impossible to pin.
          // Anchoring on the hole itself is what closes a corner.
          const layerBeams = prev.beams ?? [];
          // Both fits still start from a real hole when the drag began on one: that is the point
          // the join is built around, whether the beam pins through it or merely reaches it.
          //
          // Except under the GRID fit, which refuses a start that is off the cell grid. "Holes on
          // the grid" is measured from the ANCHOR — pitch it off a diagonal's hole (5.657mm steps,
          // on the grid only at its own anchor) and every hole of the new beam is off it too, and
          // the angle to the target cell comes out as 179.2° where 180° was meant. Chained round a
          // frame that compounds, corner by corner. Starting on the clicked cell keeps the grid and
          // gives up sharing that one hole; the other fits still take the hole, since they were
          // never promising the grid in the first place.
          const nearestStartHole = !exactEndpoint
            ? nearestBeamHole(layerBeams, prev.activeLayer, x0, y0)
            : null;
          const startHole =
            nearestStartHole && (fitMode !== "holes" || isOnCellGrid(nearestStartHole))
              ? nearestStartHole
              : null;
          const sx = startHole?.x ?? x0;
          const sy = startHole?.y ?? y0;
          // The legal-direction snap only matters where the HOLES have to land on something — with
          // the body stretching there is nothing to be illegal about.
          // Snapping to a legal direction belongs to the GRID fit, not to the bore direction: it is
          // what makes "holes on the grid" mean anything — a run that is a whole number of studs is
          // the only kind whose end holes both land on cells (and whose intermediate ones land every
          // legalPeriod along). The body and centred fits stretch to any drag and want no snap.
          const snapped =
            fitMode === "holes" && !exactEndpoint && (x1 !== x0 || y1 !== y0)
              ? snapEndpointToLegal(
                  sx,
                  sy,
                  x1,
                  y1,
                  1.6,
                  layerBeams
                    .filter((b) => b.layer === prev.activeLayer && b.holeType !== "none")
                    .flatMap((b) => beamHolePositions(b)),
                )
              : null;
          const endHole =
            fitMode !== "holes" && !exactEndpoint
              ? nearestBeamHole(layerBeams, prev.activeLayer, x1, y1)
              : null;
          const ex = snapped?.x ?? endHole?.x ?? x1;
          const ey = snapped?.y ?? endHole?.y ?? y1;
          const fit =
            ex !== sx || ey !== sy
              ? beamFitToEndpoint(sx, sy, ex, ey, beamHoleType, fitMode)
              : null;
          const beam: AngledBeam = {
            ...createAngledBeam(prev.activeLayer, sx, sy),
            angleId: beamAngleId,
            moveRef: beamMoveRef === "start" ? undefined : beamMoveRef,
            customDegrees: beamCustomDegrees,
            mirror: beamMirror,
            reverse: beamReverse,
            holes: beamHoles,
            holeType: beamHoleType,
            holeAxis: beamHoleAxis,
            gusset: beamGusset || undefined,
            plateFraction,
            widthFraction,
            roundedEnds: roundedEdges,
            ...fit,
          };
          // A beam dragged onto blocks is sat against them straight away — its outer wall on their
          // outer corners (see beamFlushOffset). That is where a brace belongs, and having to fit
          // it and then go and ask for it separately made the fit look like it had done half a job.
          // A beam placed on bare grid has nothing to sit against and simply gets no offset.
          // An end BURIED in a block starts with its hole turned off. A hole there is not a hole:
          // it sits inside solid material, weakens the join and prints as a pocket, which is why
          // it wants doing by hand on every beam that runs into a block.
          //
          // An end landing on another BEAM's hole is the opposite case and keeps its hole, because
          // that hole IS the join — it is the one a pin goes through. So the two are distinguished
          // rather than both being called "an outer join".
          if (fit) {
            const joins = beamEndsMeetingBeams(beam, layerBeams);
            const dir = beamDirection(beam);
            const span = beamBodySpanStuds(beam);
            const buried = (along: number) =>
              solidHere(
                Math.round(beam.anchorX + dir.x * along),
                Math.round(beam.anchorY + dir.y * along),
              );
            const solids: number[] = [];
            // In-plane: an end hole sits where the beam meets whatever it joins, so it is cropped
            // either way — buried in a block or butted against a beam. Vertical: only a hole
            // actually buried in solid comes out, since one landing on another beam's hole IS the
            // join and a pin goes through it.
            const cropStart = verticalBores ? !joins.start && buried(span.from) : joins.start || buried(span.from);
            const cropEnd = verticalBores ? !joins.end && buried(span.to) : joins.end || buried(span.to);
            if (cropStart) solids.push(0);
            if (beam.holes > 1 && cropEnd) solids.push(beam.holes - 1);
            if (solids.length > 0) beam.solidHoles = solids;
          }

          // Sitting the beam against the blocks moves it ACROSS its run, and for a vertical bore
          // that takes every hole off the grid it is meant to pin into. The two cannot both be had
          // on a diagonal: a perpendicular shift only returns the holes to the grid if it is a
          // whole lattice step across, which at 45° is 11.31mm, not the ~1.7mm a flush wall wants.
          //
          // Which to prefer is a judgement, so only the DEFAULT is set here — grid-aligned holes,
          // since a vertically bored beam is a flat liftarm whose holes pin down onto whatever is
          // beneath, and that is usually the whole point of boring it that way. Trading it away
          // silently at placement is the surprising choice. The flush is still one click away in
          // the beam panel for the times the wall matters more; the panel says what it costs.
          if (fit && !verticalBores) {
            const bp = layerPitch(prev, beam.layer);
            const width = Math.min(bp, fixedPlateHeight(beam.widthFraction, bp) ?? bp);
            const roundedHere = (x: number, y: number) =>
              !!layerCells && inBounds(prev, x, y) && layerCells[indexOf(prev, x, y)]?.rounded
                ? cellEdgeRadius(bp)
                : 0;
            const neighbours = layerBeams
              .filter((b) => b.layer === prev.activeLayer)
              .map((b) => ({
                beam: b,
                width: Math.min(bp, fixedPlateHeight(b.widthFraction, bp) ?? bp),
              }));
            beam.acrossOffset =
              beamFlushOffset(beam, solidHere, width, roundedHere, neighbours, bp) || undefined;
          }
          pushHistory(prev);
          setSelectedBeamId(beam.id);
          // The pickers follow the beam that was actually placed, exactly as selecting one does —
          // otherwise a fitted beam would sit there at 45° with the Direction picker still
          // claiming whatever it said before the drag.
          if (fit) loadBeamIntoPickers(beam);
          return addBeam(prev, beam);
        }

        // Erasing a cell that a beam is anchored on takes the beam too — otherwise the one thing
        // the Empty brush is for ("remove what's here") would silently leave the most visible
        // thing at that spot behind, with no other way to reach it from the canvas.
        if (isEmpty) {
          const doomed = (prev.beams ?? []).filter(
            (b) =>
              b.layer === prev.activeLayer &&
              b.anchorX >= Math.min(x0, x1) &&
              b.anchorX <= Math.max(x0, x1) &&
              b.anchorY >= Math.min(y0, y1) &&
              b.anchorY <= Math.max(y0, y1),
          );
          const doomedDiscs = (prev.discs ?? []).filter(
            (d) =>
              d.layer === prev.activeLayer &&
              d.centreX >= Math.min(x0, x1) &&
              d.centreX <= Math.max(x0, x1) &&
              d.centreY >= Math.min(y0, y1) &&
              d.centreY <= Math.max(y0, y1),
          );
          if (doomed.length > 0 || doomedDiscs.length > 0) {
            const cleared = doomedDiscs.reduce(
              (g, d) => removeDisc(g, d.id),
              doomed.reduce((g, b) => removeBeam(g, b.id), prev),
            );
            // Erasing is how a circle is trimmed to a partial one, so it is also how a ring ends:
            // the sweep drops any ring that just lost its last cell.
            const next = gcCircleRings(clearRect(cleared, x0, y0, x1, y1));
            pushHistory(prev);
            setSelectedBeamId((current) => (doomed.some((b) => b.id === current) ? null : current));
            setSelectedDiscId((current) => (doomedDiscs.some((d) => d.id === current) ? null : current));
            return next;
          }
        }
        const next =
          tool === "edit"
            ? withPropertiesRect(prev, x0, y0, x1, y1, {
                axis,
                flip: explicitFlip,
                plateFraction,
                rounded: roundedEdges,
                chamferMm,
                widthFraction,
                blendXPos,
                blendXNeg,
                blendYPos,
                blendYNeg,
                cornerBlendXPosYPos,
                cornerBlendXPosYNeg,
                cornerBlendXNegYPos,
                cornerBlendXNegYNeg,
              })
            : paintedType === CellType.CircleSolid && !circleRingCovering(prev, x0, y0)
              ? // A drag still only has ONE centre — (x0, y0) is where the drag/click started, so
                // that's what the whole ring centres on, ignoring wherever it ended.
                withCircleRing(
                  prev,
                  x0,
                  y0,
                  circleDimension,
                  plateFraction,
                  roundedEdges,
                  circleHollow,
                  circleOuterSquare,
                ).grid
              : withRect(
                  prev,
                  x0,
                  y0,
                  x1,
                  y1,
                  paintedType,
                  AXIS_SETTABLE_TYPES.has(paintedType) ? axis : undefined,
                  isEmpty ? undefined : plateFraction,
                  explicitFlip,
                  isEmpty ? undefined : roundedEdges,
                  isEmpty ? undefined : widthFraction,
                  // Painting a circle cell INSIDE an existing ring's footprint rejoins that ring
                  // rather than starting a second one on top of it — how a cell erased out of a
                  // partial circle is put back with its arc intact.
                  paintedType === CellType.CircleSolid ? circleRingCovering(prev, x0, y0)?.id : undefined,
                  {
                    blendXPos,
                    blendXNeg,
                    blendYPos,
                    blendYNeg,
                    cornerBlendXPosYPos,
                    cornerBlendXPosYNeg,
                    cornerBlendXNegYPos,
                    cornerBlendXNegYNeg,
                  },
                  isEmpty ? undefined : chamferMm || undefined,
                );
        if (next !== prev) {
          pushHistory(prev);
        }
        return gcCircleRings(next);
      });
    },
    [
      brush,
      axis,
      flip,
      plateFraction,
      widthFraction,
      roundedEdges,
      chamferMm,
      tool,
      circleDimension,
      circleHollow,
      circleOuterSquare,
      blendXPos,
      blendXNeg,
      blendYPos,
      blendYNeg,
      cornerBlendXPosYPos,
      cornerBlendXPosYNeg,
      cornerBlendXNegYPos,
      cornerBlendXNegYNeg,
      beamAngleId,
      beamCustomDegrees,
      beamMirror,
      beamReverse,
      beamHoles,
      beamHoleType,
      beamHoleAxis,
      beamGusset,
      beamMoveRef,
      discSettings,
      loadBeamIntoPickers,
    ],
  );

  // Loads an already-painted cell's own current axis/flip/plate height/edges into the pickers —
  // the Edit tool's "inspect" step, so adjusting an existing cell starts from what's actually
  // there instead of whatever the pickers happened to be left at.
  /**
   * Loads a disc's own settings into the pickers — the "inspect" half of selecting one.
   *
   * Shared deliberately: selection happens from TWO places (clicking the centre cell, and clicking
   * the disc's outline in the 2D overlay) and only the first used to load anything. The outline is
   * the bigger target by far and the one the panel points you at, so the common way to select a
   * disc showed the previous disc's numbers — which reads as the fields simply not updating.
   */
  const loadDiscIntoPickers = useCallback((disc: SlotDisc) => {
    // Normalised first — a disc from an older project is missing whichever fields postdate it,
    // and copying those gaps into the brush settings makes their inputs uncontrolled.
    const {
      id: _id,
      layer: _layer,
      centreX: _cx,
      centreY: _cy,
      // Per-disc, not a brush default — see the note on SlotDiscSettings.
      slotEnabled: _mask,
      plateFraction,
      ...settings
    } = normalizeSlotDisc(disc);
    setDiscSettingsState(settings);
    setPlateFraction(plateFraction ?? "module");
  }, []);

  /** The beam equivalent of `loadDiscIntoPickers`, shared by the same two selection paths. */

  const selectCell = useCallback(
    (x: number, y: number) => {
      // A beam anchored here wins over the cell underneath it: it's the thing drawn on top in the
      // 2D plan, so it's the thing a click on that square is asking about. Same "inspect" step as
      // a cell — its own settings load into the beam pickers, and the cell selection is dropped so
      // the two can't both claim what the pickers apply to.
      const disc = (grid.discs ?? []).find((d) => d.layer === grid.activeLayer && d.centreX === x && d.centreY === y);
      if (disc) {
        setSelectedDiscId(disc.id);
        setSelectedBeamId(null);
        setSelectedCircleId(null);
        setSelectedCell(null);
        loadDiscIntoPickers(disc);
        return;
      }

      const beam = (grid.beams ?? []).find((b) => b.layer === grid.activeLayer && b.anchorX === x && b.anchorY === y);
      if (beam) {
        setSelectedBeamId(beam.id);
        setSelectedDiscId(null);
        setSelectedCircleId(null);
        setSelectedCell(null);
        loadBeamIntoPickers(beam);
        return;
      }

      const layer = getActiveLayer(grid);
      const cell = layer[indexOf(grid, x, y)];
      if (!cell || cell.type === CellType.Empty) return;
      setSelectedBeamId(null);
      setSelectedDiscId(null);
      setSelectedCircleId(null);
      setSelectedCell({ x, y });
      if (AXIS_SETTABLE_TYPES.has(cell.type)) setAxis(cell.axis ?? "x");
      if (FLIP_AWARE_TYPES.has(cell.type)) setFlip(cell.flip ?? false);
      setPlateFraction(cell.plateFraction ?? "full");
      setWidthFraction(cell.widthFraction);
      setRoundedEdges(cell.rounded ?? false);
      setChamferMm(cell.chamferMm ?? 0);
      // The ring behind a CircleSolid cell, so the circle pickers describe the circle you clicked
      // rather than whatever they were last left at.
      const ring = circleRingAt(grid, x, y);
      if (ring) {
        setCircleDimensionState(ring.dimension);
        setCircleHollowState(ring.hollow);
        setCircleOuterSquareState(ring.outerSquare);
      }
      setBlendXPos(cell.blendXPos ?? false);
      setBlendXNeg(cell.blendXNeg ?? false);
      setBlendYPos(cell.blendYPos ?? false);
      setBlendYNeg(cell.blendYNeg ?? false);
      setCornerBlendXPosYPos(cell.cornerBlendXPosYPos ?? false);
      setCornerBlendXPosYNeg(cell.cornerBlendXPosYNeg ?? false);
      setCornerBlendXNegYPos(cell.cornerBlendXNegYPos ?? false);
      setCornerBlendXNegYNeg(cell.cornerBlendXNegYNeg ?? false);
    },
    [grid, loadDiscIntoPickers, loadBeamIntoPickers],
  );

  /**
   * The beam counterpart of `applyCurrentToSelectedCell` — with the Edit tool and a beam selected,
   * touching a picker changes that beam straight away, so editing a beam works exactly like
   * editing a cell instead of needing its own separate panel and its own separate rules.
   */
  const applyToSelectedBeam = useCallback(
    (patch: Partial<AngledBeam>) => {
      if (tool !== "edit" || !selectedBeamId) return;
      setGridState((prev) => {
        const next = updateBeam(prev, selectedBeamId, patch);
        if (next !== prev) {
          pushHistory(prev);
        }
        return next;
      });
    },
    [tool, selectedBeamId],
  );

  const setBeamAngleId = useCallback(
    (id: string) => {
      setBeamAngleIdState(id);
      // Setting a direction by hand un-fits the beam: `endpoint` says "this body reaches that
      // cell", which stops being true the moment the angle stops being the one the two cells
      // implied. The lead-ins stay — they're just body, and the beam still prints as it looks.
      applyToSelectedBeam({ angleId: id, endpoint: undefined });
    },
    [applyToSelectedBeam],
  );
  const setBeamCustomDegrees = useCallback(
    (deg: number) => {
      setBeamCustomDegreesState(deg);
      applyToSelectedBeam({ customDegrees: deg });
    },
    [applyToSelectedBeam],
  );
  const setBeamQuadrant = useCallback(
    (mirror: boolean, reverse: boolean) => {
      setBeamMirrorState(mirror);
      setBeamReverseState(reverse);
      applyToSelectedBeam({ mirror, reverse });
    },
    [applyToSelectedBeam],
  );
  const setBeamGusset = useCallback(
    (mm: number) => {
      const clamped = Math.max(0, Math.min(STUD_PITCH * 2, mm));
      setBeamGussetState(clamped);
      applyToSelectedBeam({ gusset: clamped || undefined });
    },
    [applyToSelectedBeam],
  );
  const setBeamHoles = useCallback(
    (n: number) => {
      const clamped = Math.max(1, Math.min(40, n));
      setBeamHolesState(clamped);
      applyToSelectedBeam({ holes: clamped, endpoint: undefined });
    },
    [applyToSelectedBeam],
  );
  const setBeamMoveRef = useCallback(
    (r: BeamMoveRef) => {
      setBeamMoveRefState(r);
      applyToSelectedBeam({ moveRef: r === "start" ? undefined : r });
    },
    [applyToSelectedBeam],
  );
  const setBeamMoveHoleIndex = useCallback(
    (index: number) => {
      applyToSelectedBeam({ moveRef: "hole", moveHoleIndex: index });
    },
    [applyToSelectedBeam],
  );
  const setBeamHoleType = useCallback(
    (t: BeamHoleType) => {
      setBeamHoleTypeState(t);
      applyToSelectedBeam({ holeType: t });
    },
    [applyToSelectedBeam],
  );
  const setBeamHoleAxis = useCallback(
    (a: BeamHoleAxis) => {
      setBeamHoleAxisState(a);
      // Setting the beam-wide direction clears the per-hole overrides — otherwise a beam with
      // overrides on would visibly ignore the control that's meant to set every hole at once.
      applyToSelectedBeam({ holeAxis: a, holeAxes: undefined });
    },
    [applyToSelectedBeam],
  );

  const setBeamHoleAxisAt = useCallback(
    (index: number, axis: BeamHoleAxis | null) => {
      if (tool !== "edit" || !selectedBeamId) return;
      setGridState((prev) => {
        const beam = (prev.beams ?? []).find((b) => b.id === selectedBeamId);
        if (!beam) return prev;
        const next = updateBeam(prev, selectedBeamId, { holeAxes: withHoleAxis(beam, index, axis) });
        if (next !== prev) {
          pushHistory(prev);
        }
        return next;
      });
    },
    [tool, selectedBeamId],
  );

  const setDiscSettings = useCallback(
    (patch: Partial<SlotDiscSettings>) => {
      setDiscSettingsState((prev) => ({ ...prev, ...patch }));
      if (tool !== "edit" || !selectedDiscId) return;
      setGridState((prev) => {
        const next = updateDisc(prev, selectedDiscId, patch);
        if (next !== prev) {
          pushHistory(prev);
        }
        return next;
      });
    },
    [tool, selectedDiscId],
  );

  /**
   * The open/closed mask, which belongs to one disc rather than to the brush. Unlike
   * setDiscSettings this never touches `discSettings`, so editing a gate plate cannot change what
   * the next painted disc looks like.
   */
  const setSlotMask = useCallback(
    (slotEnabled: boolean[] | undefined) => {
      if (!selectedDiscId) return;
      setGridState((prev) => {
        const next = updateDisc(prev, selectedDiscId, { slotEnabled });
        if (next !== prev) {
          pushHistory(prev);
        }
        return next;
      });
    },
    [selectedDiscId],
  );

  const selectDisc = useCallback(
    (id: string | null) => {
      setSelectedDiscId(id);
      if (id === null) return;
      const disc = (grid.discs ?? []).find((d) => d.id === id);
      if (!disc) return;
      setSelectedBeamId(null);
      // A ring selected by its own handle has to go too, or both panels show at once and neither
      // reads as "the thing you just clicked" — the two share a centre often enough (a disc turning
      // inside a ring is the whole point of the pair) for that to be the normal case, not an edge.
      setSelectedCircleId(null);
      setSelectedCell(null);
      loadDiscIntoPickers(disc);
    },
    [grid, loadDiscIntoPickers],
  );

  const selectCircle = useCallback(
    (id: string | null) => {
      setSelectedCircleId(id);
      if (id === null) return;
      const ring = (grid.circles ?? []).find((c) => c.id === id);
      if (!ring) return;
      setSelectedBeamId(null);
      setSelectedDiscId(null);
      setSelectedCell(null);
      setCircleDimensionState(ring.dimension);
      setCircleHollowState(ring.hollow);
      setCircleOuterSquareState(ring.outerSquare);
      // The shared pickers are loaded from a MEMBER cell rather than from the ring's own defaults:
      // the cells are what actually builds, and a ring migrated from an older file (or one whose
      // cells were edited before the ring learned to carry defaults) can have none recorded.
      const member = circleRingCells(grid, id)[0];
      const cell = member ? getActiveLayer(grid)[indexOf(grid, member.x, member.y)] : undefined;
      setPlateFraction(cell?.plateFraction ?? ring.plateFraction ?? "full");
      setRoundedEdges(cell?.rounded ?? ring.rounded ?? false);
      setChamferMm(cell?.chamferMm ?? 0);
      setWidthFraction(cell?.widthFraction);
    },
    [grid],
  );

  /**
   * Starts a ring drag: one undo entry for the whole gesture (see `checkpoint`, same as a beam or
   * disc move) plus the snapshot every step of it is measured from.
   */
  const beginCircleDrag = useCallback(() => {
    circleDragBase.current = grid;
    pushHistory(grid);
  }, [grid, pushHistory]);

  const endCircleDrag = useCallback(() => {
    circleDragBase.current = null;
  }, []);

  const setCircleCentre = useCallback((id: string, centreX: number, centreY: number) => {
    setGridState((prev) => {
      // Always from the pre-drag grid, so cells the ring is dragged ACROSS are restored behind it
      // and only its final position overwrites anything. Falling back to `prev` covers a
      // programmatic move with no drag around it.
      const base = circleDragBase.current ?? prev;
      const ring = (base.circles ?? []).find((c) => c.id === id);
      if (!ring) return prev;
      const from = centreForOrigin(ring);
      return moveCircleRing(base, id, centreX - from.centreX, centreY - from.centreY);
    });
  }, []);

  const removeCircleAction = useCallback((id: string) => {
    setGridState((prev) => {
      const next = removeCircleRing(prev, id);
      if (next !== prev) {
        pushHistory(prev);
      }
      return next;
    });
    setSelectedCircleId((current) => (current === id ? null : current));
  }, [pushHistory]);

  const setDiscCentre = useCallback((id: string, centreX: number, centreY: number) => {
    setGridState((prev) => updateDisc(prev, id, { centreX, centreY }));
  }, []);

  const removeDiscAction = useCallback((id: string) => {
    setGridState((prev) => {
      const next = removeDisc(prev, id);
      if (next !== prev) {
        pushHistory(prev);
      }
      return next;
    });
    setSelectedDiscId((current) => (current === id ? null : current));
  }, []);

  /** Turns one hole on the selected beam solid, or bores it again — see AngledBeam.solidHoles. */
  const setBeamHoleSolidAt = useCallback(
    (index: number, solid: boolean) => {
      if (tool !== "edit" || !selectedBeamId) return;
      setGridState((prev) => {
        const beam = (prev.beams ?? []).find((b) => b.id === selectedBeamId);
        if (!beam) return prev;
        const next = updateBeam(prev, selectedBeamId, { solidHoles: withSolidHole(beam, index, solid) });
        if (next !== prev) pushHistory(prev);
        return next;
      });
    },
    [tool, selectedBeamId],
  );

  const clearBeamHoleAxes = useCallback(() => {
    applyToSelectedBeam({ holeAxes: undefined });
  }, [applyToSelectedBeam]);

  // While a cell is selected in the Edit tool, touching any of the pickers below should apply
  // immediately to that one cell — without this, selecting a cell only ever loaded its settings
  // for display; actually changing something required a separate Shift-click/drag back on the
  // canvas, which read as "the Edit tool doesn't do anything after you select a cell." Always
  // supplies all four current values (not just the one that changed) so a single picker edit can't
  // accidentally reset the others via withPropertiesRect's own axis-changed-implies-reautodetect
  // behaviour (see grid.ts).
  const applyCurrentToSelectedCell = useCallback(
    (overrides: {
      axis?: HoleAxis;
      flip?: FlipSetting;
      plateFraction?: PlateFraction;
      rounded?: boolean;
      chamferMm?: number;
      widthFraction?: PlateFraction | undefined;
      blendXPos?: boolean;
      blendXNeg?: boolean;
      blendYPos?: boolean;
      blendYNeg?: boolean;
      cornerBlendXPosYPos?: boolean;
      cornerBlendXPosYNeg?: boolean;
      cornerBlendXNegYPos?: boolean;
      cornerBlendXNegYNeg?: boolean;
    }) => {
      // A selected BEAM takes the pickers instead — it's what the Edit tool is pointed at, and the
      // three pickers a beam shares with a cell (height, width, edges) mean the same thing on it.
      // The beam-specific pickers apply through `applyToSelectedBeam` in their own setters below.
      if (tool === "edit" && selectedDiscId) {
        if ("plateFraction" in overrides) {
          setGridState((prev) => {
            const next = updateDisc(prev, selectedDiscId, { plateFraction: overrides.plateFraction });
            if (next !== prev) {
              pushHistory(prev);
            }
            return next;
          });
        }
        return;
      }
      if (tool === "edit" && selectedBeamId) {
        const patch: Partial<AngledBeam> = {};
        if ("plateFraction" in overrides) patch.plateFraction = overrides.plateFraction;
        if ("widthFraction" in overrides) patch.widthFraction = overrides.widthFraction;
        if ("rounded" in overrides) patch.roundedEnds = overrides.rounded;
        if (Object.keys(patch).length > 0) applyToSelectedBeam(patch);
        return;
      }
      // A ring selected by its own handle has no selected cell, but the pickers a circle shares
      // with a cell — height, edges, chamfer, width — still mean something on it: they apply to
      // every member at once, and stick to the ring so later cells match. Without this the panel
      // showed those pickers next to a selected circle and quietly did nothing when you touched
      // them.
      if (tool === "edit" && selectedCircleId) {
        const patch: {
          plateFraction?: PlateFraction;
          rounded?: boolean;
          chamferMm?: number;
          widthFraction?: PlateFraction;
        } = {};
        if ("plateFraction" in overrides) patch.plateFraction = overrides.plateFraction;
        if ("rounded" in overrides) patch.rounded = overrides.rounded;
        if ("chamferMm" in overrides) patch.chamferMm = overrides.chamferMm;
        if ("widthFraction" in overrides) patch.widthFraction = overrides.widthFraction;
        if (Object.keys(patch).length === 0) return;
        setGridState((prev) => {
          const next = withCircleRingCellProperties(prev, selectedCircleId, patch);
          if (next !== prev) {
            pushHistory(prev);
          }
          return next;
        });
        return;
      }
      if (tool !== "edit" || !selectedCell) return;
      const nextFlipSetting = overrides.flip ?? flip;
      const changes = {
        axis: overrides.axis ?? axis,
        flip: nextFlipSetting === "auto" ? undefined : nextFlipSetting,
        plateFraction: overrides.plateFraction ?? plateFraction,
        rounded: overrides.rounded ?? roundedEdges,
        chamferMm: overrides.chamferMm ?? chamferMm,
        widthFraction: "widthFraction" in overrides ? overrides.widthFraction : widthFraction,
        blendXPos: overrides.blendXPos ?? blendXPos,
        blendXNeg: overrides.blendXNeg ?? blendXNeg,
        blendYPos: overrides.blendYPos ?? blendYPos,
        blendYNeg: overrides.blendYNeg ?? blendYNeg,
        cornerBlendXPosYPos: overrides.cornerBlendXPosYPos ?? cornerBlendXPosYPos,
        cornerBlendXPosYNeg: overrides.cornerBlendXPosYNeg ?? cornerBlendXPosYNeg,
        cornerBlendXNegYPos: overrides.cornerBlendXNegYPos ?? cornerBlendXNegYPos,
        cornerBlendXNegYNeg: overrides.cornerBlendXNegYNeg ?? cornerBlendXNegYNeg,
      };
      setGridState((prev) => {
        const next = withPropertiesRect(prev, selectedCell.x, selectedCell.y, selectedCell.x, selectedCell.y, changes);
        if (next !== prev) {
          pushHistory(prev);
        }
        return next;
      });
    },
    [
      tool,
      selectedCell,
      selectedBeamId,
      selectedDiscId,
      selectedCircleId,
      pushHistory,
      applyToSelectedBeam,
      axis,
      flip,
      plateFraction,
      roundedEdges,
      chamferMm,
      widthFraction,
      blendXPos,
      blendXNeg,
      blendYPos,
      blendYNeg,
      cornerBlendXPosYPos,
      cornerBlendXPosYNeg,
      cornerBlendXNegYPos,
      cornerBlendXNegYNeg,
    ],
  );

  const setAxisAndApply = useCallback(
    (a: HoleAxis) => {
      setAxis(a);
      applyCurrentToSelectedCell({ axis: a });
    },
    [applyCurrentToSelectedCell],
  );
  const setFlipAndApply = useCallback(
    (f: FlipSetting) => {
      setFlip(f);
      applyCurrentToSelectedCell({ flip: f });
    },
    [applyCurrentToSelectedCell],
  );
  const setPlateFractionAndApply = useCallback(
    (f: PlateFraction) => {
      setPlateFraction(f);
      applyCurrentToSelectedCell({ plateFraction: f });
    },
    [applyCurrentToSelectedCell],
  );
  const setWidthFractionAndApply = useCallback(
    (f: PlateFraction | undefined) => {
      setWidthFraction(f);
      applyCurrentToSelectedCell({ widthFraction: f });
    },
    [applyCurrentToSelectedCell],
  );
  const setRoundedEdgesAndApply = useCallback(
    (v: boolean) => {
      setRoundedEdges(v);
      applyCurrentToSelectedCell({ rounded: v });
    },
    [applyCurrentToSelectedCell],
  );
  /**
   * The ring the selected cell belongs to. Every circle setting edits THIS, not the cell — which
   * is the whole point of the ring existing: one write changes the circle, however many cells are
   * cut from it.
   */
  const selectedCircle = useMemo(() => {
    const direct = selectedCircleId ? (grid.circles ?? []).find((c) => c.id === selectedCircleId) : null;
    if (direct) return direct;
    return selectedCell ? circleRingAt(grid, selectedCell.x, selectedCell.y) : null;
  }, [grid, selectedCell, selectedCircleId]);

  const applyToSelectedCircle = useCallback(
    (apply: (prev: GridState, id: string) => GridState) => {
      if (tool !== "edit" || !selectedCircle) return;
      setGridState((prev) => {
        const next = apply(prev, selectedCircle.id);
        if (next !== prev) {
          pushHistory(prev);
        }
        return next;
      });
    },
    [tool, selectedCircle, pushHistory],
  );

  /**
   * Resizing a SELECTED ring repaints its footprint in place — the thing the old per-cell model
   * couldn't do at all, which is why its panel had to say "repaint the group to resize it".
   */
  const setCircleDimension = useCallback(
    (d: number) => {
      setCircleDimensionState(d);
      applyToSelectedCircle((prev, id) => gcCircleRings(resizeCircleRing(prev, id, d)));
    },
    [applyToSelectedCircle],
  );
  const setCircleHollow = useCallback(
    (v: boolean) => {
      setCircleHollowState(v);
      applyToSelectedCircle((prev, id) => updateCircleRing(prev, id, { hollow: v }));
    },
    [applyToSelectedCircle],
  );
  const setCircleOuterSquare = useCallback(
    (v: boolean) => {
      setCircleOuterSquareState(v);
      applyToSelectedCircle((prev, id) => updateCircleRing(prev, id, { outerSquare: v }));
    },
    [applyToSelectedCircle],
  );

  const setChamferMmAndApply = useCallback(
    (v: number) => {
      setChamferMm(v);
      applyCurrentToSelectedCell({ chamferMm: v });
    },
    [applyCurrentToSelectedCell],
  );
  const setBlendXPosAndApply = useCallback(
    (v: boolean) => {
      setBlendXPos(v);
      applyCurrentToSelectedCell({ blendXPos: v });
    },
    [applyCurrentToSelectedCell],
  );
  const setBlendXNegAndApply = useCallback(
    (v: boolean) => {
      setBlendXNeg(v);
      applyCurrentToSelectedCell({ blendXNeg: v });
    },
    [applyCurrentToSelectedCell],
  );
  const setBlendYPosAndApply = useCallback(
    (v: boolean) => {
      setBlendYPos(v);
      applyCurrentToSelectedCell({ blendYPos: v });
    },
    [applyCurrentToSelectedCell],
  );
  const setBlendYNegAndApply = useCallback(
    (v: boolean) => {
      setBlendYNeg(v);
      applyCurrentToSelectedCell({ blendYNeg: v });
    },
    [applyCurrentToSelectedCell],
  );
  const setCornerBlendXPosYPosAndApply = useCallback(
    (v: boolean) => {
      setCornerBlendXPosYPos(v);
      applyCurrentToSelectedCell({ cornerBlendXPosYPos: v });
    },
    [applyCurrentToSelectedCell],
  );
  const setCornerBlendXPosYNegAndApply = useCallback(
    (v: boolean) => {
      setCornerBlendXPosYNeg(v);
      applyCurrentToSelectedCell({ cornerBlendXPosYNeg: v });
    },
    [applyCurrentToSelectedCell],
  );
  const setCornerBlendXNegYPosAndApply = useCallback(
    (v: boolean) => {
      setCornerBlendXNegYPos(v);
      applyCurrentToSelectedCell({ cornerBlendXNegYPos: v });
    },
    [applyCurrentToSelectedCell],
  );
  const setCornerBlendXNegYNegAndApply = useCallback(
    (v: boolean) => {
      setCornerBlendXNegYNeg(v);
      applyCurrentToSelectedCell({ cornerBlendXNegYNeg: v });
    },
    [applyCurrentToSelectedCell],
  );

  // Leaving the Edit tool drops the selection — its highlight and its "which cell do picker edits
  // apply to" meaning are both specific to that tool.
  const setToolAndClearSelection = useCallback((t: ToolMode) => {
    setTool(t);
    // Every selection, not just the cell one. A beam or disc left selected while the Edit tool
    // isn't active keeps the panel showing that item's settings as though it were still being
    // edited — the same "whose values am I looking at?" confusion the cell selection was already
    // cleared to avoid.
    if (t !== "edit") {
      setSelectedCell(null);
      setSelectedBeamId(null);
      setSelectedDiscId(null);
    }
  }, []);

  const autoFill = useCallback((opts: AutoFillOptions) => {
    setGridState((prev) => {
      // Generated layer is sized opts.width x opts.height — the grid itself must match before the
      // layer is dropped in, or its cell indexing (which assumes grid.width) reads the new layer's
      // data at the wrong offsets. Resizing first (preserving whatever already fits) keeps the two
      // in sync even when the dialog's size differs from the current footprint.
      const resized = resizeGrid(prev, opts.width, opts.height);
      return commitLayer(prev, resized, generateAutoFillLayer(opts));
    });
  }, []);

  function commitLayer(
    original: GridState,
    resized: GridState,
    layer: ReturnType<typeof generateAutoFillLayer>,
  ): GridState {
    pushHistory(original);
    return withActiveLayerCells(resized, layer);
  }

  const resize = useCallback((width: number, height: number, anchor: ResizeAnchor = DEFAULT_RESIZE_ANCHOR) => {
    setGridState((prev) => {
      const next = resizeGrid(prev, width, height, anchor);
      pushHistory(prev);
      return next;
    });
  }, []);

  const setPartClearance = useCallback((value: number) => {
    setGridState((prev) => ({ ...prev, partClearance: Math.max(0, value) }));
  }, []);

  const setHoleClearance = useCallback((value: number) => {
    setGridState((prev) => ({ ...prev, holeClearance: Math.max(0, value) }));
  }, []);

  const setSidewaysHoleClearance = useCallback((value: number) => {
    setGridState((prev) => ({ ...prev, sidewaysHoleClearance: Math.max(0, value) }));
  }, []);

  const removeCellAction = useCallback((x: number, y: number) => {
    setGridState((prev) => {
      const next = gcCircleRings(clearRect(prev, x, y, x, y));
      if (next !== prev) {
        pushHistory(prev);
      }
      return next;
    });
  }, []);

  const selectBeam = useCallback(
    (id: string | null) => {
      setSelectedBeamId(id);
      if (id === null) return;
      const beam = (grid.beams ?? []).find((b) => b.id === id);
      if (!beam) return;
      setSelectedDiscId(null);
      setSelectedCircleId(null);
      setSelectedCell(null);
      loadBeamIntoPickers(beam);
    },
    [grid, loadBeamIntoPickers],
  );

  /**
   * The angled-beam brush used to nudge Plate height from "Full" (9.6mm) to one module (8mm),
   * because a real Technic beam is 8mm tall and the shared picker's own default was a System
   * BRICK's 9.6mm — wrong for a beam and not obviously wrong to look at. The picker now starts at
   * one module for every brush, so there's nothing left to nudge: "Full" can only be there because
   * it was picked on purpose, and silently moving off it would be overriding the user.
   */
  const setBrushAndDefaults = useCallback((t: CellType) => {
    setBrush(t);
    if (t !== CellType.AngledBeam) {
      // Picking a cell brush ends the beam's claim on the pickers. Without this the beam stayed
      // selected after the switch, so the Edit tool went on showing Beam angle/holes/bore for a
      // beam the user had visibly moved on from — the beam controls belong to the beam brush and
      // to a beam deliberately clicked on, nothing else.
      setSelectedBeamId(null);
    }
    if (t !== CellType.SlotDisc) setSelectedDiscId(null);
  }, []);

  const moveCellAction = useCallback((fromX: number, fromY: number, toX: number, toY: number, history = true) => {
    setGridState((prev) => {
      // Mid-drag, always from the pre-drag grid (and from the drag's ORIGINAL source square), so
      // cells the dragged one is pulled ACROSS are restored behind it and only the square it lands
      // on is overwritten — see moveCell's own note. `prev` covers a one-shot move with no drag.
      const base = cellDragBase.current ?? prev;
      const next = gcCircleRings(moveCell(base, fromX, fromY, toX, toY));
      if (next !== prev && history) {
        pushHistory(prev);
      }
      return next;
    });
    // The selection follows what it's pointing at — otherwise moving the selected cell would leave
    // the Edit tool's pickers aimed at the now-empty square it came from.
    setSelectedCell((current) => (current && current.x === fromX && current.y === fromY ? { x: toX, y: toY } : current));
  }, []);

  /** Starts a cell Alt-drag: one undo entry for the gesture, plus the snapshot its steps are
   * measured from. */
  const beginCellDrag = useCallback(() => {
    cellDragBase.current = grid;
    pushHistory(grid);
  }, [grid, pushHistory]);

  const endCellDrag = useCallback(() => {
    cellDragBase.current = null;
  }, []);

  const checkpoint = useCallback(() => {
    setGridState((prev) => {
      pushHistory(prev);
      return prev;
    });
  }, []);

  const updateBeamAction = useCallback((id: string, patch: Partial<AngledBeam>, history = true) => {
    setGridState((prev) => {
      const next = updateBeam(prev, id, patch);
      if (next !== prev && history) {
        pushHistory(prev);
      }
      return next;
    });
  }, []);

  /**
   * Slides the selected beam across its own run until its outer wall meets the outer corner of the
   * blocks at its ends — see AngledBeam.acrossOffset. Returns the shift applied, or null when
   * there is nothing at either end to line up with.
   */
  /**
   * Sits a beam against the nearest PARALLEL beam on its layer — walls touching ("butt"), or both
   * on one centreline ("inline"). Two beams fuse when they touch, so this is what "join these two
   * beams" actually means; see beamNeighbourOffset for why the gap is never the obvious size.
   *
   * Returns what it did, so the panel can say which way the beam moved and whether the two hole
   * patterns ended up in step along the run — the sideways fit can't settle that on its own.
   */
  const buttBeamToNeighbour = useCallback(
    (id: string, fit: BeamNeighbourFit): { movedMm: number; alongMismatchMm: number } | null => {
      let applied: { movedMm: number; alongMismatchMm: number } | null = null;
      setGridState((prev) => {
        const beam = (prev.beams ?? []).find((b) => b.id === id);
        if (!beam) return prev;
        const bp = layerPitch(prev, beam.layer);
        const width = Math.min(bp, fixedPlateHeight(beam.widthFraction, bp) ?? bp);
        const others = (prev.beams ?? [])
          .filter((b) => b.id !== beam.id && b.layer === beam.layer)
          .map((b) => ({ beam: b, width: Math.min(bp, fixedPlateHeight(b.widthFraction, bp) ?? bp) }));
        const found = beamNeighbourOffset(beam, width, others, fit, bp);
        if (!found) return prev;
        applied = { movedMm: found.movedMm, alongMismatchMm: found.alongMismatchMm };
        const next = updateBeam(prev, id, {
          acrossOffset: found.acrossOffset || undefined,
          alongOffset: found.alongOffset || undefined,
        });
        if (next !== prev) pushHistory(prev);
        return next;
      });
      return applied;
    },
    [],
  );

  const flushBeamToBlocks = useCallback((id: string): number | null => {
    let applied: number | null = null;
    setGridState((prev) => {
      const beam = (prev.beams ?? []).find((b) => b.id === id);
      if (!beam) return prev;
      const layer = prev.layers[beam.layer];
      if (!layer) return prev;
      const isSolid = (x: number, y: number) =>
        inBounds(prev, x, y) && layer[indexOf(prev, x, y)]?.type !== CellType.Empty;
      // A rounded cell has an arc where its corner would be — see beamFlushOffset's own note.
      const bp = layerPitch(prev, beam.layer);
      const roundRadiusAt = (x: number, y: number) =>
        inBounds(prev, x, y) && layer[indexOf(prev, x, y)]?.rounded ? cellEdgeRadius(bp) : 0;
      const width = Math.min(bp, fixedPlateHeight(beam.widthFraction, bp) ?? bp);
      const others = (prev.beams ?? [])
        .filter((b) => b.id !== beam.id && b.layer === beam.layer)
        .map((b) => ({
          beam: b,
          width: Math.min(bp, fixedPlateHeight(b.widthFraction, bp) ?? bp),
        }));
      const offset = beamFlushOffset(beam, isSolid, width, roundRadiusAt, others, bp);
      if (offset === null) return prev;
      applied = offset;
      const next = updateBeam(prev, id, { acrossOffset: offset || undefined });
      if (next !== prev) pushHistory(prev);
      return next;
    });
    return applied;
  }, []);

  /** Puts a fitted beam back to a plain one: no lead-ins, body ending at its own end holes. */
  const clearBeamFit = useCallback((id: string) => {
    setGridState((prev) => {
      const next = updateBeam(prev, id, {
        leadInStart: undefined,
        leadInEnd: undefined,
        endpoint: undefined,
      });
      if (next !== prev) pushHistory(prev);
      return next;
    });
  }, []);

  /**
   * Re-runs the fit on a beam already placed, between its own anchor and the endpoint the drag gave
   * it. Without this the fit is only ever chosen at drag time, so changing your mind means drawing
   * the beam again — and a beam whose partner on another layer has to match is exactly the case
   * where you change your mind.
   */
  const refitBeam = useCallback(
    (id: string, setting: BeamFitSetting) => {
      setGridState((prev) => {
        const beam = (prev.beams ?? []).find((b) => b.id === id);
        if (!beam || !beam.endpoint) return prev;
        const mode: BeamFitMode = setting === "auto" ? (beam.holeAxis === "z" ? "holes" : "body") : setting;
        const fit = beamFitToEndpoint(
          beam.anchorX,
          beam.anchorY,
          beam.endpoint.x,
          beam.endpoint.y,
          beam.holeType,
          mode,
        );
        if (!fit) return prev;
        const next = updateBeam(prev, id, fit);
        if (next !== prev) pushHistory(prev);
        return next;
      });
    },
    [pushHistory],
  );

  const removeBeamAction = useCallback((id: string) => {
    setGridState((prev) => {
      const next = removeBeam(prev, id);
      if (next !== prev) {
        pushHistory(prev);
      }
      return next;
    });
    setSelectedBeamId((current) => (current === id ? null : current));
  }, []);

  const addLayerAction = useCallback(() => {
    setGridState((prev) => {
      const next = addLayer(prev);
      pushHistory(prev);
      return next;
    });
  }, []);

  const duplicateLayerAction = useCallback((layerIndex: number) => {
    setGridState((prev) => {
      const next = duplicateLayer(prev, layerIndex);
      if (next !== prev) {
        pushHistory(prev);
      }
      return next;
    });
    // The copy lands above the original and becomes active, so anything selected on the layer
    // BELOW is no longer what the pickers are pointed at.
    setSelectedCell(null);
    setSelectedBeamId(null);
    setSelectedDiscId(null);
    setSelectedCircleId(null);
  }, [pushHistory]);

  // Purely a 3D-preview convenience (see buildGridGeometry's own `hiddenLayers` param) — never
  // touches grid state, so it's outside undo/redo and unaffected by loadProject/serialization.
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<number>>(() => new Set());

  const toggleLayerVisibility = useCallback((layerIndex: number) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerIndex)) next.delete(layerIndex);
      else next.add(layerIndex);
      return next;
    });
  }, []);

  // Keeps a hidden FLAG attached to the same layer's own CONTENT across a removal/reorder, not to
  // whatever index happens to land there afterward — e.g. hiding layer 2 then deleting layer 1
  // should still hide what's now layer 1, not silently start hiding something else.
  const swapHiddenLayers = useCallback((a: number, b: number) => {
    setHiddenLayers((prev) => {
      const aHidden = prev.has(a);
      const bHidden = prev.has(b);
      if (aHidden === bHidden) return prev;
      const next = new Set(prev);
      if (aHidden) {
        next.delete(a);
        next.add(b);
      } else {
        next.delete(b);
        next.add(a);
      }
      return next;
    });
  }, []);

  const removeLayerAction = useCallback((layerIndex: number) => {
    setGridState((prev) => {
      const next = removeLayer(prev, layerIndex);
      if (next === prev) return prev;
      pushHistory(prev);
      return next;
    });
    setHiddenLayers((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      for (const i of prev) {
        if (i === layerIndex) continue;
        next.add(i > layerIndex ? i - 1 : i);
      }
      return next;
    });
  }, []);

  const setActiveLayerAction = useCallback((layerIndex: number) => {
    setGridState((prev) => setActiveLayer(prev, layerIndex));
  }, []);

  const setLayerSpacingAction = useCallback(
    (layerIndex: number, patch: { pitch?: number; connectorPitch?: number }) => {
      setGridState((prev) => {
        const next = setLayerSpacing(prev, layerIndex, patch);
        if (next === prev) return prev;
        pushHistory(prev);
        return next;
      });
    },
    [],
  );

  const moveLayerUpAction = useCallback(
    (layerIndex: number) => {
      setGridState((prev) => {
        const next = moveLayerUp(prev, layerIndex);
        if (next === prev) return prev;
        pushHistory(prev);
        return next;
      });
      swapHiddenLayers(layerIndex, layerIndex + 1);
    },
    [swapHiddenLayers],
  );

  const moveLayerDownAction = useCallback(
    (layerIndex: number) => {
      setGridState((prev) => {
        const next = moveLayerDown(prev, layerIndex);
        if (next === prev) return prev;
        pushHistory(prev);
        return next;
      });
      swapHiddenLayers(layerIndex, layerIndex - 1);
    },
    [swapHiddenLayers],
  );

  const loadProject = useCallback((next: GridState) => {
    undoStack.current = [];
    redoStack.current = [];
    // The loaded project has its own beams; a selection pointing into the previous one would
    // silently address nothing (or, worse, a same-id beam that isn't the same beam).
    setSelectedBeamId(null);
    setSelectedDiscId(null);
    setGridState(next);
  }, []);

  // Both stacks get the same identity guard as pushHistory, and for the same reason: these record
  // from inside an updater, which StrictMode runs twice with the same `current`.
  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setGridState((current) => {
      if (redoStack.current[redoStack.current.length - 1] !== current) redoStack.current.push(current);
      return prev;
    });
    forceRender((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setGridState((current) => {
      if (undoStack.current[undoStack.current.length - 1] !== current) undoStack.current.push(current);
      return next;
    });
    forceRender((n) => n + 1);
  }, []);

  return useMemo(
    () => ({
      grid,
      brush,
      setBrush: setBrushAndDefaults,
      axis,
      setAxis: setAxisAndApply,
      flip,
      setFlip: setFlipAndApply,
      plateFraction,
      setPlateFraction: setPlateFractionAndApply,
      widthFraction,
      setWidthFraction: setWidthFractionAndApply,
      roundedEdges,
      setRoundedEdges: setRoundedEdgesAndApply,
      chamferMm,
      setChamferMm: setChamferMmAndApply,
      blendXPos,
      setBlendXPos: setBlendXPosAndApply,
      blendXNeg,
      setBlendXNeg: setBlendXNegAndApply,
      blendYPos,
      setBlendYPos: setBlendYPosAndApply,
      blendYNeg,
      setBlendYNeg: setBlendYNegAndApply,
      cornerBlendXPosYPos,
      setCornerBlendXPosYPos: setCornerBlendXPosYPosAndApply,
      cornerBlendXPosYNeg,
      setCornerBlendXPosYNeg: setCornerBlendXPosYNegAndApply,
      cornerBlendXNegYPos,
      setCornerBlendXNegYPos: setCornerBlendXNegYPosAndApply,
      cornerBlendXNegYNeg,
      setCornerBlendXNegYNeg: setCornerBlendXNegYNegAndApply,
      circleDimension,
      setCircleDimension,
      circleHollow,
      setCircleHollow,
      circleOuterSquare,
      setCircleOuterSquare,
      selectedCircle,
      selectCircle,
      setCircleCentre,
      beginCircleDrag,
      endCircleDrag,
      removeCircle: removeCircleAction,
      tool,
      setTool: setToolAndClearSelection,
      paintRect,
      selectedCell,
      selectCell,
      removeCell: removeCellAction,
      autoFill,
      resize,
      setPartClearance,
      setHoleClearance,
      setSidewaysHoleClearance,
      addLayer: addLayerAction,
      duplicateLayer: duplicateLayerAction,
      removeLayer: removeLayerAction,
      setActiveLayer: setActiveLayerAction,
      setLayerSpacing: setLayerSpacingAction,
      moveLayerUp: moveLayerUpAction,
      moveLayerDown: moveLayerDownAction,
      hiddenLayers,
      toggleLayerVisibility,
      selectedBeamId,
      selectBeam,
      beamAngleId,
      setBeamAngleId,
      beamCustomDegrees,
      setBeamCustomDegrees,
      beamMirror,
      beamReverse,
      setBeamQuadrant,
      beamHoles,
      setBeamHoles,
      beamHoleType,
      setBeamHoleType,
      beamHoleAxis,
      setBeamHoleAxis,
      setBeamHoleAxisAt,
      setBeamHoleSolidAt,
      beamGusset,
      setBeamGusset,
      beamFit,
      setBeamFit,
      beamMoveRef,
      setBeamMoveRef,
      setBeamMoveHoleIndex,
      refitBeam,
      clearBeamHoleAxes,
      updateBeam: updateBeamAction,
      clearBeamFit,
      flushBeamToBlocks,
      buttBeamToNeighbour,
      removeBeam: removeBeamAction,
      discSettings,
      setDiscSettings,
      setSlotMask,
      selectedDiscId,
      selectDisc,
      removeDisc: removeDiscAction,
      setDiscCentre,
      moveCell: moveCellAction,
      beginCellDrag,
      endCellDrag,
      checkpoint,
      loadProject,
      undo,
      redo,
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
    }),
    [
      grid,
      brush,
      setBrushAndDefaults,
      axis,
      flip,
      plateFraction,
      widthFraction,
      roundedEdges,
      chamferMm,
      blendXPos,
      blendXNeg,
      blendYPos,
      blendYNeg,
      cornerBlendXPosYPos,
      cornerBlendXPosYNeg,
      cornerBlendXNegYPos,
      cornerBlendXNegYNeg,
      circleDimension,
      setCircleDimension,
      circleHollow,
      setCircleHollow,
      circleOuterSquare,
      setCircleOuterSquare,
      selectedCircle,
      selectCircle,
      setCircleCentre,
      beginCircleDrag,
      endCircleDrag,
      removeCircleAction,
      tool,
      paintRect,
      selectedCell,
      selectCell,
      removeCellAction,
      autoFill,
      resize,
      setPartClearance,
      setHoleClearance,
      addLayerAction,
      duplicateLayerAction,
      removeLayerAction,
      setActiveLayerAction,
      setLayerSpacingAction,
      moveLayerUpAction,
      moveLayerDownAction,
      hiddenLayers,
      toggleLayerVisibility,
      selectedBeamId,
      selectBeam,
      beamAngleId,
      setBeamAngleId,
      beamCustomDegrees,
      setBeamCustomDegrees,
      beamMirror,
      beamReverse,
      setBeamQuadrant,
      beamHoles,
      setBeamHoles,
      beamHoleType,
      setBeamHoleType,
      beamHoleAxis,
      setBeamHoleAxis,
      setBeamHoleAxisAt,
      setBeamHoleSolidAt,
      beamGusset,
      setBeamGusset,
      beamFit,
      setBeamFit,
      beamMoveRef,
      setBeamMoveRef,
      setBeamMoveHoleIndex,
      refitBeam,
      clearBeamHoleAxes,
      updateBeamAction,
      clearBeamFit,
      flushBeamToBlocks,
      buttBeamToNeighbour,
      removeBeamAction,
      discSettings,
      setDiscSettings,
      setSlotMask,
      selectedDiscId,
      selectDisc,
      removeDiscAction,
      setDiscCentre,
      moveCellAction,
      beginCellDrag,
      endCellDrag,
      checkpoint,
      loadProject,
      undo,
      redo,
      setAxisAndApply,
      setFlipAndApply,
      setPlateFractionAndApply,
      setWidthFractionAndApply,
      setRoundedEdgesAndApply,
      setChamferMmAndApply,
      setBlendXPosAndApply,
      setBlendXNegAndApply,
      setBlendYPosAndApply,
      setBlendYNegAndApply,
      setCornerBlendXPosYPosAndApply,
      setCornerBlendXPosYNegAndApply,
      setCornerBlendXNegYPosAndApply,
      setCornerBlendXNegYNegAndApply,
      setToolAndClearSelection,
    ],
  );
}
