import { AngledBeam } from "./angledBeam";
import {
  CircleRing,
  centreForOrigin,
  createCircleRing,
  normalizeCircleRing,
  originForCentre,
  ringContains,
  ringFootprint,
} from "./circleRing";
import { SlotDisc } from "./slotDisc";
import { AXIS_SETTABLE_TYPES, BLEND_AWARE_TYPES, CellType, FLIP_AWARE_TYPES, HoleAxis, PlateFraction } from "./cellTypes";

export interface Cell {
  type: CellType;
  /** Only meaningful for axis-aware cells (holes and pins) — which axis it bores/protrudes along. */
  axis?: HoleAxis;
  /**
   * Only meaningful for a protruding connector (Pin/BallPin/Stud) — false (default) grows it
   * toward `+axis`, true toward `-axis`. See FLIP_AWARE_TYPES.
   */
  flip?: boolean;
  /** How tall this cell is, in stacked plates (defaults to the layer's own full height if unset). */
  plateFraction?: PlateFraction;
  /**
   * How wide this cell is ALONG ITS OWN AXIS (defaults to a full stud, i.e. unaffected, if unset)
   * — independent of `plateFraction`, which only ever affects Z (vertical layer-stacking height).
   * Only meaningful for an axis-aware cell (see AXIS_AWARE_TYPES) whose axis is "x" or "y": lets a
   * sideways connector or hole sit on a block that's still full HEIGHT but narrower specifically in
   * the direction it points — e.g. a full-height post with a thin fin a pin grows out of sideways.
   * Left unset (or axis "z", where there's no single obvious "width" direction independent of the
   * already-fixed X/Y footprint) for any other combination.
   *
   * Only the cell's own box, its hole's bore length, and a connector's embed/protrude placement
   * account for this — corner rounding does not yet, so a rounded cell with a custom width may
   * round as if it were still full width. Uniform-width beams (the common "thin liftarm" case,
   * built via plateFraction alone) are unaffected either way.
   */
  widthFraction?: PlateFraction;
  /** Softens this cell's own exposed vertical edges with a small fillet — only at corners that are
   * genuinely exterior (not shared with a neighbouring occupied cell), so rounding one block never
   * cuts into or gaps against the block next to it. */
  rounded?: boolean;
  /**
   * Cuts a 45° chamfer of this many mm along the cell's genuinely EXTERIOR edges — vertical ones
   * and the top/bottom perimeter alike. Distinct from `rounded`, which is a full half-cell fillet
   * on the vertical corners only (a Technic beam's round end); a chamfer is a small flat, and it's
   * what a part that has to ENTER something else wants. The 1x1 blocks a slot disc dispenses are
   * the case it exists for: the pocket has a lead-in chamfer at its mouth, and a matching chamfer
   * on the block's own leading edges is the other half of not binding.
   */
  chamferMm?: number;
  /**
   * For CircleSolid cells: which CircleRing (see circleRing.ts) this cell is a slice of. The ring
   * owns the circle's size, centre, hollow and outer-edge settings; this cell's own position
   * within the group is derived from where it sits relative to the ring's origin, so there is
   * nothing per-cell to keep in step. A CircleSolid cell without a live ring behind it is treated
   * as a plain Solid — see geometry.ts.
   */
  circleId?: string;
  /**
   * For BLEND_AWARE_TYPES cells: when true, this cell's own +X-facing side is walked out and
   * bridged into a neighbouring hollow CircleSolid ring's surviving wall material (see
   * geometry.ts's own `collectJoinBridges`), reconnecting across the ring's own hollow cut instead
   * of staying disconnected. A no-op wherever the +X neighbour isn't actually a hollow ring.
   * Independent per face (see the sibling XNeg/YPos/YNeg flags) — deliberately opt-in rather than
   * auto-detected, see BLEND_AWARE_TYPES's own doc for why.
   */
  blendXPos?: boolean;
  /** Same as `blendXPos`, for this cell's own -X-facing side. */
  blendXNeg?: boolean;
  /** Same as `blendXPos`, for this cell's own +Y-facing side. */
  blendYPos?: boolean;
  /** Same as `blendXPos`, for this cell's own -Y-facing side. */
  blendYNeg?: boolean;
  /**
   * For BLEND_AWARE_TYPES cells: when true, this cell's own (+X, +Y) inner corner is clipped back
   * to match its two orthogonal neighbours' own widthFraction narrowing — see geometry.ts's own
   * `blendCornerToNeighbors`. Meant for an un-narrowed "corner" cell that sits diagonally next to
   * two narrowed edge cells (e.g. a picture-frame layout narrowed to enlarge its own centre
   * hollow): without this, the corner cell keeps poking its full, un-narrowed corner into that
   * hollow, leaving a pinwheel-shaped notch instead of a clean enlarged opening. A no-op wherever
   * either neighbour isn't actually narrowed along the matching axis. Independent per diagonal
   * (see the sibling XPosYNeg/XNegYPos/XNegYNeg flags) — opt-in for the same reason blendXPos etc.
   * are: see BLEND_AWARE_TYPES's own doc.
   */
  cornerBlendXPosYPos?: boolean;
  /** Same as `cornerBlendXPosYPos`, for this cell's own (+X, -Y) inner corner. */
  cornerBlendXPosYNeg?: boolean;
  /** Same as `cornerBlendXPosYPos`, for this cell's own (-X, +Y) inner corner. */
  cornerBlendXNegYPos?: boolean;
  /** Same as `cornerBlendXPosYPos`, for this cell's own (-X, -Y) inner corner. */
  cornerBlendXNegYNeg?: boolean;
}

const EMPTY_CELL: Cell = { type: CellType.Empty };

/** Bumped by every layer duplication, so copies made in the same millisecond still get distinct ids. */
let copySeq = 0;

/**
 * One stacked Z level. Its own stacking height isn't a separate setting any more — it's derived
 * from whichever of its cells is tallest (see model/geometry.ts's `computeLayerHeights`), since
 * every cell now picks its own plate height directly.
 */
export type Layer = Cell[]; // row-major, length width*height

/** Outer-silhouette rounding, applied to the whole assembled part (see model/rounding.ts). */
export interface RoundingConfig {
  corners: boolean;
}

export interface GridState {
  width: number;
  height: number;
  rounding: RoundingConfig;
  /**
   * A uniform inward offset (mm) applied to the whole assembled part's true outer skin — the
   * footprint's perimeter walls and its very top/bottom faces — leaving every internal joint
   * between a part's own cells and every connector hole/pin at its normal, correctly-fitted size.
   * For when this part is meant to slot as a separate printed piece into a pocket/frame cut in
   * another part: printed at 0 clearance, two pieces both built to the same nominal stud-grid size
   * usually won't go together at all (FDM tends to print outer walls slightly oversized, the
   * opposite of how holes print undersized — see `holeClearance` below). 0 (default) changes
   * nothing. This is a PER-FACE inset (applied independently to each exterior face it touches, so
   * an axis with exterior faces on both sides shrinks by 2x this value overall). A real Technic
   * part's own between-part tolerance is roughly 0.1-0.2mm per side; 0.15-0.25mm here is a
   * reasonable snug-press-fit start for FDM, up to ~0.4mm for an easy hand-slide fit.
   */
  partClearance: number;
  /**
   * Extra radius (mm) added to every hole a connector actually has to slide into (Technic hole,
   * stud hole, axle hole's arm width) — NOT to the connectors themselves, which print closer to
   * nominal than holes do. 0 (default) means every hole is sized at its exact reference dimension
   * (see units.ts) — a fresh project's geometry matches the real part's own reference measurements
   * identically. An earlier version of this app baked a fixed extra radius directly into the
   * "authentic" hole constants, which made every project's holes diverge
   * from the reference by default; this is the visible, per-project, opt-in replacement — turn it
   * up (PRINT_HOLE_CLEARANCE_DEFAULT in units.ts is a reasonable start) if your printer reproduces
   * the reference's own tight tolerances too tightly to actually assemble.
   */
  holeClearance: number;
  /**
   * FURTHER extra radius (mm) added on top of `holeClearance`, but ONLY to holes bored sideways
   * (x/y) — not vertical (z) ones.
   *
   * A printed part is laid flat, so a z bore is vertical on the bed and an x/y bore is horizontal,
   * and the two come out at genuinely different sizes: a vertical hole is laid down as a closed
   * loop on each layer and stays close to nominal, while a horizontal one is built as a stack of
   * stepped layers whose unsupported top arch sags, ending up measurably undersized and slightly
   * oval. That's a property of the process rather than of any one printer, which is why a single
   * clearance can't be right for both directions at once — dialling `holeClearance` up far enough
   * to make sideways holes fit leaves vertical ones sloppy.
   *
   * 0 (default) keeps the old single-clearance behaviour exactly.
   * PRINT_SIDEWAYS_HOLE_CLEARANCE_DEFAULT in units.ts is a reasonable starting point.
   */
  sidewaysHoleClearance: number;
  layers: Layer[];
  activeLayer: number;
  /**
   * Beams running at an angle across the X/Y plane, alongside the cell grid rather than inside it
   * — see AngledBeam for why an angled beam can't be a cell type. Optional so a project file
   * saved before angled beams existed still loads (see deserializeProject); treat a missing value
   * as an empty list everywhere.
   */
  beams?: AngledBeam[];
  /** Carousel/dispenser discs — see SlotDisc for why these aren't cells either. Optional for the
   * same reason `beams` is: a project saved before them still loads. */
  discs?: SlotDisc[];
  /**
   * Circle groups. Unlike beams and discs these DO own cells — a ring describes the shared circle
   * its member cells are each cut to, and the cells (carrying `circleId`) are what actually get
   * built. Optional for the same back-compat reason as the other two: a file saved when circles
   * were stored per cell is migrated on load (see deserializeProject).
   */
  circles?: CircleRing[];
}

export function indexOf(grid: Pick<GridState, "width">, x: number, y: number): number {
  return y * grid.width + x;
}

export function inBounds(grid: Pick<GridState, "width" | "height">, x: number, y: number): boolean {
  return x >= 0 && x < grid.width && y >= 0 && y < grid.height;
}

function emptyLayer(width: number, height: number): Layer {
  return Array.from({ length: width * height }, () => ({ ...EMPTY_CELL }));
}

export function getActiveLayer(grid: GridState): Layer {
  return grid.layers[grid.activeLayer];
}

export function getCell(grid: GridState, layerIndex: number, x: number, y: number): Cell {
  return grid.layers[layerIndex][indexOf(grid, x, y)];
}

export function createEmptyGrid(width: number, height: number): GridState {
  return {
    width,
    height,
    rounding: { corners: false },
    partClearance: 0,
    holeClearance: 0,
    sidewaysHoleClearance: 0,
    layers: [emptyLayer(width, height)],
    activeLayer: 0,
    beams: [],
    discs: [],
    circles: [],
  };
}

/**
 * Picks a sensible default growth direction for a connector cell about to be painted at (x, y)
 * along `axis`, so that placing two facing connectors next to each other "just works" without
 * making the user flip one manually every time: if the neighbour on the `+axis` side is already
 * occupied (so growing that way would jam straight into it) while the `-axis` side is clear, grow
 * toward `-axis` instead. Only handles the sideways axes (x/y) — a "neighbour" one layer up/down
 * for a z-axis connector isn't something this grid model exposes cheaply, so z always defaults to
 * unflipped; the explicit Flip control still overrides this for any axis.
 */
export function autoDetectFlip(grid: GridState, x: number, y: number, axis: HoleAxis): boolean {
  return autoDetectFlipInLayer(getActiveLayer(grid), grid.width, grid.height, x, y, axis);
}

/** Same as `autoDetectFlip`, but against a bare layer array — lets withRect/withAxisRect check
 * neighbours already painted earlier in the same rectangle, without re-wrapping a whole GridState
 * on every cell. */
function autoDetectFlipInLayer(
  layer: Layer,
  width: number,
  height: number,
  x: number,
  y: number,
  axis: HoleAxis,
): boolean {
  if (axis === "z") return false;
  const dx = axis === "x" ? 1 : 0;
  const dy = axis === "y" ? 1 : 0;
  const inRange = (cx: number, cy: number) => cx >= 0 && cx < width && cy >= 0 && cy < height;
  const forward = inRange(x + dx, y + dy) ? layer[(y + dy) * width + (x + dx)] : undefined;
  const backward = inRange(x - dx, y - dy) ? layer[(y - dy) * width + (x - dx)] : undefined;
  const forwardBlocked = forward !== undefined && forward.type !== CellType.Empty;
  const backwardClear = backward === undefined || backward.type === CellType.Empty;
  return forwardBlocked && backwardClear;
}

/** Returns a new grid with the active layer's cell (x, y) set to `type`/`axis`/`flip`/`plateFraction`/`rounded`/`widthFraction` (immutable, for undo/redo). */
export function withCell(
  grid: GridState,
  x: number,
  y: number,
  type: CellType,
  axis?: HoleAxis,
  plateFraction?: PlateFraction,
  flip?: boolean,
  rounded?: boolean,
  widthFraction?: PlateFraction,
): GridState {
  if (!inBounds(grid, x, y)) return grid;
  const layer = getActiveLayer(grid);
  const i = indexOf(grid, x, y);
  const resolvedFlip = FLIP_AWARE_TYPES.has(type) ? (flip ?? autoDetectFlip(grid, x, y, axis ?? "x")) : undefined;
  const next: Cell = { type, axis, plateFraction, flip: resolvedFlip, rounded, widthFraction };
  if (
    layer[i].type === next.type &&
    layer[i].axis === next.axis &&
    layer[i].plateFraction === next.plateFraction &&
    layer[i].flip === next.flip &&
    layer[i].rounded === next.rounded &&
    layer[i].widthFraction === next.widthFraction
  ) {
    return grid;
  }
  const newLayer = layer.slice();
  newLayer[i] = next;
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = newLayer;
  return { ...grid, layers };
}

/**
 * Returns a new grid with every active-layer cell in the rectangle [x0..x1] x [y0..y1] set to
 * `type`/`axis`/`plateFraction`. `flip` — for a protruding connector type — may be an explicit
 * boolean (the user's Flip control) or left undefined to auto-detect per cell (see
 * `autoDetectFlip`), which is what makes painting a row of facing connectors work without manual
 * per-cell flipping.
 */
/** The 8 opt-in join/corner-blend flags a freshly-painted cell can carry — see Cell's own doc on
 * each field for what they do. Passed as one object (rather than 8 more positional params) since
 * withRect's own parameter list is already long; only meaningful when `type` is in
 * BLEND_AWARE_TYPES, same gating `withRect` already applies to `circleId` for non-circle types. */
export interface BlendFlags {
  blendXPos?: boolean;
  blendXNeg?: boolean;
  blendYPos?: boolean;
  blendYNeg?: boolean;
  cornerBlendXPosYPos?: boolean;
  cornerBlendXPosYNeg?: boolean;
  cornerBlendXNegYPos?: boolean;
  cornerBlendXNegYNeg?: boolean;
}

export function withRect(
  grid: GridState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  type: CellType,
  axis?: HoleAxis,
  plateFraction?: PlateFraction,
  flip?: boolean,
  rounded?: boolean,
  widthFraction?: PlateFraction,
  circleId?: string,
  blend?: BlendFlags,
  chamferMm?: number,
): GridState {
  const minX = Math.max(0, Math.min(x0, x1));
  const maxX = Math.min(grid.width - 1, Math.max(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxY = Math.min(grid.height - 1, Math.max(y0, y1));
  const layer = getActiveLayer(grid).slice();
  let changed = false;
  const b = BLEND_AWARE_TYPES.has(type) ? blend : undefined;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = indexOf(grid, x, y);
      const resolvedFlip = FLIP_AWARE_TYPES.has(type)
        ? (flip ?? autoDetectFlipInLayer(layer, grid.width, grid.height, x, y, axis ?? "x"))
        : undefined;
      if (
        layer[i].type !== type ||
        layer[i].axis !== axis ||
        layer[i].plateFraction !== plateFraction ||
        layer[i].flip !== resolvedFlip ||
        layer[i].rounded !== rounded ||
        layer[i].widthFraction !== widthFraction ||
        layer[i].circleId !== circleId ||
        layer[i].blendXPos !== b?.blendXPos ||
        layer[i].blendXNeg !== b?.blendXNeg ||
        layer[i].blendYPos !== b?.blendYPos ||
        layer[i].blendYNeg !== b?.blendYNeg ||
        layer[i].cornerBlendXPosYPos !== b?.cornerBlendXPosYPos ||
        layer[i].cornerBlendXPosYNeg !== b?.cornerBlendXPosYNeg ||
        layer[i].cornerBlendXNegYPos !== b?.cornerBlendXNegYPos ||
        layer[i].cornerBlendXNegYNeg !== b?.cornerBlendXNegYNeg ||
        layer[i].chamferMm !== chamferMm
      ) {
        layer[i] = {
          type,
          axis,
          plateFraction,
          flip: resolvedFlip,
          rounded,
          chamferMm,
          widthFraction,
          circleId,
          blendXPos: b?.blendXPos,
          blendXNeg: b?.blendXNeg,
          blendYPos: b?.blendYPos,
          blendYNeg: b?.blendYNeg,
          cornerBlendXPosYPos: b?.cornerBlendXPosYPos,
          cornerBlendXPosYNeg: b?.cornerBlendXPosYNeg,
          cornerBlendXNegYPos: b?.cornerBlendXNegYPos,
          cornerBlendXNegYNeg: b?.cornerBlendXNegYNeg,
        };
        changed = true;
      }
    }
  }
  if (!changed) return grid;
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = layer;
  return { ...grid, layers };
}

/**
 * Places a whole circle in one action: creates the CircleRing and paints every cell of its
 * `dimension x dimension` footprint as a member of it.
 *
 * This is now the ONLY way a circle gets placed. It used to be one of two modes, the other being
 * a per-cell brush driven by a col/row picker — but that picker existed only because a cell had
 * to carry its own position within the group, and it no longer does. A partial circle is made by
 * placing the whole ring and then erasing the cells you don't want (see `removeCircleCell`): the
 * survivors keep the ring, so they keep the correct arc.
 *
 * For an odd dimension the group centres exactly on (centreX, centreY); an even one leans toward
 * -X/-Y, matching where the old auto-centre mode put it. Cells outside the grid are skipped, so a
 * ring can hang off the edge — its geometry is unaffected, since the circle is defined by the ring
 * rather than by which of its cells happen to exist.
 */
export function withCircleRing(
  grid: GridState,
  centreX: number,
  centreY: number,
  dimension: number,
  plateFraction?: PlateFraction,
  rounded?: boolean,
  hollow?: boolean,
  outerSquare?: boolean,
): { grid: GridState; ring: CircleRing } {
  const ring = createCircleRing(grid.activeLayer, centreX, centreY, dimension, {
    hollow: hollow ?? false,
    outerSquare: outerSquare ?? false,
    plateFraction,
    rounded,
  });
  return { grid: stampCircleRing(grid, ring), ring };
}

/**
 * Adds the ring and paints its footprint. Split out from `withCircleRing` because resizing an
 * existing ring is the same operation with an id that already exists — see `resizeCircleRing`.
 */
function stampCircleRing(grid: GridState, ring: CircleRing): GridState {
  const layer = getActiveLayer(grid).slice();
  for (const { x, y } of ringFootprint(ring)) {
    if (!inBounds(grid, x, y)) continue;
    layer[indexOf(grid, x, y)] = {
      type: CellType.CircleSolid,
      plateFraction: ring.plateFraction,
      rounded: ring.rounded,
      circleId: ring.id,
    };
  }
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = layer;
  const others = (grid.circles ?? []).filter((c) => c.id !== ring.id);
  return { ...grid, layers, circles: [...others, ring] };
}

/** The ring a cell belongs to, or null — the lookup every consumer of a CircleSolid cell needs. */
export function circleRingOf(grid: GridState, cell: Cell): CircleRing | null {
  if (cell.type !== CellType.CircleSolid || !cell.circleId) return null;
  return (grid.circles ?? []).find((c) => c.id === cell.circleId) ?? null;
}

/** The ring at (x, y) on the active layer, or null. */
export function circleRingAt(grid: GridState, x: number, y: number): CircleRing | null {
  if (!inBounds(grid, x, y)) return null;
  return circleRingOf(grid, getActiveLayer(grid)[indexOf(grid, x, y)]);
}

/**
 * The ring on the active layer whose FOOTPRINT covers (x, y), preferring the smallest — what a
 * CircleSolid brush stroke lands in when it's aimed at a hole left in an existing circle. Painting
 * there rejoins the existing ring rather than starting a new one, which is what makes a partial
 * circle reversible: erase a cell, paint it back, and it comes back with the same arc.
 *
 * Smallest-first because a small ring nested inside a bigger one is the ambiguous case, and the
 * tighter ring is the one whose arc a cell at that position visibly belongs to.
 */
export function circleRingCovering(grid: GridState, x: number, y: number): CircleRing | null {
  const covering = (grid.circles ?? [])
    .filter((c) => c.layer === grid.activeLayer && ringContains(c, x, y))
    .sort((a, b) => a.dimension - b.dimension);
  return covering[0] ?? null;
}

/** Every cell on the active layer that currently belongs to `ringId`. */
export function circleRingCells(grid: GridState, ringId: string): { x: number; y: number }[] {
  const layer = getActiveLayer(grid);
  const found: { x: number; y: number }[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (layer[indexOf(grid, x, y)].circleId === ringId) found.push({ x, y });
    }
  }
  return found;
}

/**
 * Applies a partial change to one ring. Everything a circle's shape depends on lives here, so
 * this single call is what the old `withCircleGroupFlags` fan-out across every member cell became
 * — hollowing a 13x13 ring is now one object write instead of 169 cell writes.
 */
export function updateCircleRing(grid: GridState, id: string, patch: Partial<CircleRing>): GridState {
  const circles = grid.circles ?? [];
  if (!circles.some((c) => c.id === id)) return grid;
  return {
    ...grid,
    circles: circles.map((c) => (c.id === id ? normalizeCircleRing({ ...c, ...patch, id: c.id }) : c)),
  };
}

/**
 * Changes a ring's dimension in place, growing or shrinking it about its own centre and repainting
 * the footprint to match.
 *
 * Cells the ring loses on a shrink are cleared only if they still belonged to it — a cell someone
 * painted something else into inside the old footprint is left alone, since it stopped being part
 * of the circle the moment it was overpainted.
 */
export function resizeCircleRing(grid: GridState, id: string, dimension: number): GridState {
  const ring = (grid.circles ?? []).find((c) => c.id === id);
  if (!ring || dimension === ring.dimension || dimension < 2) return grid;
  const { centreX, centreY } = centreForOrigin(ring);
  const next: CircleRing = {
    ...ring,
    dimension,
    ...originForCentre(centreX, centreY, dimension),
  };

  // Clear the members that fall outside the new footprint first, then stamp the new one.
  const layer = getActiveLayer(grid).slice();
  for (const { x, y } of circleRingCells(grid, id)) {
    if (ringContains(next, x, y)) continue;
    layer[indexOf(grid, x, y)] = { ...EMPTY_CELL };
  }
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = layer;
  return stampCircleRing({ ...grid, layers }, next);
}

/**
 * Moves a ring by (dx, dy), carrying its member cells with it and overwriting whatever is at the
 * destination — the same "pick it up and put it there" as `moveCell`, not a swap.
 *
 * For a DRAG, apply this to the grid as it was when the gesture began, with the total offset so
 * far, rather than stepping the current grid one square at a time. Stepping destroys the build:
 * each step overwrites the cells under the ring's new position and then clears them again as the
 * ring moves on, so a drag across the plan leaves a trail of erased squares behind it. Recomputing
 * from the pre-drag snapshot means anything the ring passes over comes back when it leaves, and
 * only where it is finally dropped gets overwritten. See the store's `setCircleCentre`.
 */
export function moveCircleRing(grid: GridState, id: string, dx: number, dy: number): GridState {
  const ring = (grid.circles ?? []).find((c) => c.id === id);
  if (!ring || (dx === 0 && dy === 0)) return grid;
  const members = circleRingCells(grid, id);
  const layer = getActiveLayer(grid).slice();
  const moved = members
    .map((m) => ({ cell: layer[indexOf(grid, m.x, m.y)], x: m.x + dx, y: m.y + dy }))
    .filter((m) => inBounds(grid, m.x, m.y));
  for (const m of members) layer[indexOf(grid, m.x, m.y)] = { ...EMPTY_CELL };
  for (const m of moved) layer[indexOf(grid, m.x, m.y)] = m.cell;
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = layer;
  return updateCircleRing({ ...grid, layers }, id, { originX: ring.originX + dx, originY: ring.originY + dy });
}

/**
 * Applies cell properties — height, edges, chamfer — to every cell that belongs to a ring, and
 * records the ones that are ring-wide defaults on the ring itself so cells stamped into it later
 * (a resize, or a cell painted back into a gap) come out matching.
 *
 * The ring's members, not its footprint rectangle: a square inside the footprint that someone
 * painted something else into isn't part of the circle any more, and a "change the circle's height"
 * gesture has no business reaching it.
 */
export function withCircleRingCellProperties(
  grid: GridState,
  id: string,
  changes: { plateFraction?: PlateFraction; rounded?: boolean; chamferMm?: number; widthFraction?: PlateFraction },
): GridState {
  const members = circleRingCells(grid, id);
  if (members.length === 0) return grid;
  const layer = getActiveLayer(grid).slice();
  let changed = false;
  for (const m of members) {
    const i = indexOf(grid, m.x, m.y);
    const next = { ...layer[i], ...changes };
    if (
      next.plateFraction !== layer[i].plateFraction ||
      next.rounded !== layer[i].rounded ||
      next.chamferMm !== layer[i].chamferMm ||
      next.widthFraction !== layer[i].widthFraction
    ) {
      layer[i] = next;
      changed = true;
    }
  }
  const layers = grid.layers.slice();
  if (changed) layers[grid.activeLayer] = layer;
  const withCells = changed ? { ...grid, layers } : grid;
  const ringPatch: Partial<CircleRing> = {};
  if ("plateFraction" in changes) ringPatch.plateFraction = changes.plateFraction;
  if ("rounded" in changes) ringPatch.rounded = changes.rounded;
  return Object.keys(ringPatch).length > 0 ? updateCircleRing(withCells, id, ringPatch) : withCells;
}

/**
 * Deletes a ring and clears every cell that belonged to it — the whole circle in one action, for
 * when you want it gone rather than trimmed. (Trimming is erasing cells; the ring then ends on its
 * own once the last one goes, see gcCircleRings.)
 */
export function removeCircleRing(grid: GridState, id: string): GridState {
  const members = circleRingCells(grid, id);
  if (members.length === 0) return gcCircleRings({ ...grid, circles: (grid.circles ?? []).filter((c) => c.id !== id) });
  const layer = getActiveLayer(grid).slice();
  for (const m of members) layer[indexOf(grid, m.x, m.y)] = { ...EMPTY_CELL };
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = layer;
  return gcCircleRings({ ...grid, layers, circles: (grid.circles ?? []).filter((c) => c.id !== id) });
}

/**
 * Drops any ring that no longer has a single member cell on its layer, and clears a `circleId`
 * pointing at a ring that no longer exists.
 *
 * Erasing cells is how a partial circle is made, so "the last member was erased" is the ordinary
 * way a ring ends — there's no separate delete gesture to hang the cleanup off. Run this after any
 * edit that can clear cells.
 */
export function gcCircleRings(grid: GridState): GridState {
  const circles = grid.circles ?? [];
  if (circles.length === 0) return grid;
  const live = new Set<string>();
  for (let li = 0; li < grid.layers.length; li++) {
    const layer = grid.layers[li];
    for (const cell of layer) {
      if (cell.type === CellType.CircleSolid && cell.circleId) live.add(cell.circleId);
    }
  }
  const kept = circles.filter((c) => live.has(c.id));
  const keptIds = new Set(kept.map((c) => c.id));
  let layersChanged = false;
  const layers = grid.layers.map((layer) => {
    let changed = false;
    const next = layer.map((cell) => {
      if (cell.circleId && !keptIds.has(cell.circleId)) {
        changed = true;
        const { circleId: _dropped, ...rest } = cell;
        return rest;
      }
      return cell;
    });
    if (!changed) return layer;
    layersChanged = true;
    return next;
  });
  if (kept.length === circles.length && !layersChanged) return grid;
  return { ...grid, circles: kept, layers };
}

/**
 * Sets any combination of axis/flip/plateFraction/rounded on every already-painted (non-Empty)
 * cell in the active layer within the rectangle, leaving each cell's type untouched — the "Edit"
 * tool's rect-apply, for adjusting cells that are already placed instead of needing to repaint them
 * with the exact same type just to change one property. Each property is left alone (not cleared)
 * when its argument is omitted, so a caller can update just the one picker the user touched without
 * having to re-supply every other current value.
 */
export function withPropertiesRect(
  grid: GridState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  changes: {
    axis?: HoleAxis;
    flip?: boolean;
    plateFraction?: PlateFraction;
    rounded?: boolean;
    chamferMm?: number;
    widthFraction?: PlateFraction;
    blendXPos?: boolean;
    blendXNeg?: boolean;
    blendYPos?: boolean;
    blendYNeg?: boolean;
    cornerBlendXPosYPos?: boolean;
    cornerBlendXPosYNeg?: boolean;
    cornerBlendXNegYPos?: boolean;
    cornerBlendXNegYNeg?: boolean;
  },
): GridState {
  const minX = Math.max(0, Math.min(x0, x1));
  const maxX = Math.min(grid.width - 1, Math.max(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxY = Math.min(grid.height - 1, Math.max(y0, y1));
  const layer = getActiveLayer(grid).slice();
  let changed = false;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = indexOf(grid, x, y);
      const cell = layer[i];
      if (cell.type === CellType.Empty) continue;
      const nextAxis = AXIS_SETTABLE_TYPES.has(cell.type) && changes.axis !== undefined ? changes.axis : cell.axis;
      const wantsFlip = FLIP_AWARE_TYPES.has(cell.type);
      const nextFlip = wantsFlip
        ? (changes.flip ?? (changes.axis !== undefined ? autoDetectFlipInLayer(layer, grid.width, grid.height, x, y, nextAxis ?? "x") : cell.flip))
        : undefined;
      const nextPlateFraction = changes.plateFraction !== undefined ? changes.plateFraction : cell.plateFraction;
      const nextRounded = changes.rounded !== undefined ? changes.rounded : cell.rounded;
      const nextChamferMm = changes.chamferMm !== undefined ? changes.chamferMm : cell.chamferMm;
      const nextWidthFraction = changes.widthFraction !== undefined ? changes.widthFraction : cell.widthFraction;
      const wantsBlend = BLEND_AWARE_TYPES.has(cell.type);
      const nextBlendXPos = wantsBlend && changes.blendXPos !== undefined ? changes.blendXPos : cell.blendXPos;
      const nextBlendXNeg = wantsBlend && changes.blendXNeg !== undefined ? changes.blendXNeg : cell.blendXNeg;
      const nextBlendYPos = wantsBlend && changes.blendYPos !== undefined ? changes.blendYPos : cell.blendYPos;
      const nextBlendYNeg = wantsBlend && changes.blendYNeg !== undefined ? changes.blendYNeg : cell.blendYNeg;
      const nextCornerBlendXPosYPos =
        wantsBlend && changes.cornerBlendXPosYPos !== undefined ? changes.cornerBlendXPosYPos : cell.cornerBlendXPosYPos;
      const nextCornerBlendXPosYNeg =
        wantsBlend && changes.cornerBlendXPosYNeg !== undefined ? changes.cornerBlendXPosYNeg : cell.cornerBlendXPosYNeg;
      const nextCornerBlendXNegYPos =
        wantsBlend && changes.cornerBlendXNegYPos !== undefined ? changes.cornerBlendXNegYPos : cell.cornerBlendXNegYPos;
      const nextCornerBlendXNegYNeg =
        wantsBlend && changes.cornerBlendXNegYNeg !== undefined ? changes.cornerBlendXNegYNeg : cell.cornerBlendXNegYNeg;
      if (
        cell.chamferMm !== nextChamferMm ||
        cell.axis !== nextAxis ||
        cell.flip !== nextFlip ||
        cell.plateFraction !== nextPlateFraction ||
        cell.rounded !== nextRounded ||
        cell.widthFraction !== nextWidthFraction ||
        cell.blendXPos !== nextBlendXPos ||
        cell.blendXNeg !== nextBlendXNeg ||
        cell.blendYPos !== nextBlendYPos ||
        cell.blendYNeg !== nextBlendYNeg ||
        cell.cornerBlendXPosYPos !== nextCornerBlendXPosYPos ||
        cell.cornerBlendXPosYNeg !== nextCornerBlendXPosYNeg ||
        cell.cornerBlendXNegYPos !== nextCornerBlendXNegYPos ||
        cell.cornerBlendXNegYNeg !== nextCornerBlendXNegYNeg
      ) {
        layer[i] = {
          ...cell,
          axis: nextAxis,
          flip: nextFlip,
          plateFraction: nextPlateFraction,
          rounded: nextRounded,
          chamferMm: nextChamferMm,
          widthFraction: nextWidthFraction,
          blendXPos: nextBlendXPos,
          blendXNeg: nextBlendXNeg,
          blendYPos: nextBlendYPos,
          blendYNeg: nextBlendYNeg,
          cornerBlendXPosYPos: nextCornerBlendXPosYPos,
          cornerBlendXPosYNeg: nextCornerBlendXPosYNeg,
          cornerBlendXNegYPos: nextCornerBlendXNegYPos,
          cornerBlendXNegYNeg: nextCornerBlendXNegYNeg,
        };
        changed = true;
      }
    }
  }
  if (!changed) return grid;
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = layer;
  return { ...grid, layers };
}

/** Clears cells (sets them to Empty) in the active layer within the rectangle. */
export function clearRect(grid: GridState, x0: number, y0: number, x1: number, y1: number): GridState {
  const minX = Math.max(0, Math.min(x0, x1));
  const maxX = Math.min(grid.width - 1, Math.max(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxY = Math.min(grid.height - 1, Math.max(y0, y1));
  const layer = getActiveLayer(grid).slice();
  let changed = false;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = indexOf(grid, x, y);
      if (layer[i].type !== CellType.Empty) {
        layer[i] = EMPTY_CELL;
        changed = true;
      }
    }
  }
  if (!changed) return grid;
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = layer;
  return { ...grid, layers };
}

/** Resizes every layer's footprint, preserving existing cell contents at their original (x, y) where they still fit. */
/**
 * Which edge a resize grows from (or trims into). "start" is x=0 / y=0 — the original behaviour,
 * where everything stays put and the new studs all appear on the far side.
 */
export type ResizeAnchorX = "start" | "centre" | "end";
export type ResizeAnchorY = "start" | "centre" | "end";
export interface ResizeAnchor {
  x: ResizeAnchorX;
  y: ResizeAnchorY;
}

export const DEFAULT_RESIZE_ANCHOR: ResizeAnchor = { x: "start", y: "start" };

/**
 * The occupied span along one axis across every layer, plus any beams and discs — or null when the
 * build is empty. Used by centre anchoring, which has to know where the CONTENT is rather than just
 * how much the grid grew.
 */
function contentSpan(grid: GridState, axis: "x" | "y"): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  const see = (v: number) => {
    if (v < min) min = v;
    if (v > max) max = v;
  };
  for (const layer of grid.layers) {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (layer[y * grid.width + x].type === CellType.Empty) continue;
        see(axis === "x" ? x : y);
      }
    }
  }
  for (const b of grid.beams ?? []) see(axis === "x" ? b.anchorX : b.anchorY);
  for (const d of grid.discs ?? []) see(axis === "x" ? d.centreX : d.centreY);
  // A ring's own cells are already counted above; its origin is included so an all-but-erased
  // circle still anchors where its circle actually is rather than where its last cell is.
  for (const c of grid.circles ?? []) see(axis === "x" ? c.originX : c.originY);
  return max < min ? null : { min, max };
}

/**
 * How far the existing content shifts along one axis. Negative when shrinking from the start.
 *
 * "start" and "end" are pure size arithmetic, and both survive being applied one stud at a time:
 * start never moves anything, and end moves by the delta, so four +1 steps land where a single +4
 * would. Centre CANNOT work that way. Half of a delta of 1 rounds to 0, so growing a stud at a
 * time — which is exactly what the spinner arrows do — left the build pinned to the corner and made
 * the whole setting look broken.
 *
 * So centre is measured from the content itself: put the occupied span in the middle of the new
 * grid, wherever it happens to start. That is idempotent and step-size independent — one +4 and
 * four +1s agree, and re-applying it changes nothing.
 */
function resizeOffset(
  grid: GridState,
  oldSize: number,
  newSize: number,
  anchor: "start" | "centre" | "end",
  axis: "x" | "y",
): number {
  const delta = newSize - oldSize;
  if (anchor === "start") return 0;
  if (anchor === "end") return delta;
  const span = contentSpan(grid, axis);
  // Nothing built yet: there is no content to centre, so fall back to splitting the new space.
  if (!span) return Math.floor(delta / 2);
  const occupied = span.max - span.min + 1;
  return Math.floor((newSize - occupied) / 2) - span.min;
}

/**
 * Resizes the grid, keeping the existing content anchored to whichever edge `anchor` names.
 *
 * Beams and discs move with the cells: they address the grid by cell coordinate, so leaving them
 * behind while every cell around them shifts would silently take them off their mountings. Any
 * whose anchor cell ends up outside the new grid is dropped, the same way cells that fall outside
 * are dropped — a shrink discards what no longer fits, whichever kind of thing it is.
 */
export function resizeGrid(
  grid: GridState,
  width: number,
  height: number,
  anchor: ResizeAnchor = DEFAULT_RESIZE_ANCHOR,
): GridState {
  const dx = resizeOffset(grid, grid.width, width, anchor.x, "x");
  const dy = resizeOffset(grid, grid.height, height, anchor.y, "y");

  const layers = grid.layers.map((layer) => {
    const next = emptyLayer(width, height);
    for (let y = 0; y < height; y++) {
      const srcY = y - dy;
      if (srcY < 0 || srcY >= grid.height) continue;
      for (let x = 0; x < width; x++) {
        const srcX = x - dx;
        if (srcX < 0 || srcX >= grid.width) continue;
        next[y * width + x] = layer[indexOf(grid, srcX, srcY)];
      }
    }
    return next;
  });

  const within = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height;
  const beams = (grid.beams ?? [])
    .map((b) => ({ ...b, anchorX: b.anchorX + dx, anchorY: b.anchorY + dy }))
    .filter((b) => within(b.anchorX, b.anchorY));
  const discs = (grid.discs ?? [])
    .map((d) => ({ ...d, centreX: d.centreX + dx, centreY: d.centreY + dy }))
    .filter((d) => within(d.centreX, d.centreY));

  // A ring moves with its cells, and is NOT dropped for landing outside: its members are what
  // gets clipped, and gcCircleRings then removes any ring that lost all of them. Dropping the ring
  // itself on an origin check would strip the circle off cells that survived the resize.
  const circles = (grid.circles ?? []).map((c) => ({ ...c, originX: c.originX + dx, originY: c.originY + dy }));

  return gcCircleRings({ ...grid, width, height, layers, beams, discs, circles });
}

/** Appends a new empty layer on top and makes it active. */
export function addLayer(grid: GridState): GridState {
  const layers = grid.layers.concat([emptyLayer(grid.width, grid.height)]);
  return { ...grid, layers, activeLayer: layers.length - 1 };
}

/**
 * Copies a layer, inserting the copy directly above it and making it active.
 *
 * Everything ON the layer comes with it, not just the cells: its beams, its slot discs and its
 * circle rings are all copied too, with fresh ids — a duplicate that shared ids would have two
 * layers' worth of cells pointing at one ring, so editing either would change both, and deleting
 * one layer would strip the circle off the other.
 *
 * Layers above shift up one, and every element that names a layer by index shifts with them (same
 * remap `removeLayer` does in the other direction).
 */
export function duplicateLayer(grid: GridState, layerIndex: number): GridState {
  if (layerIndex < 0 || layerIndex >= grid.layers.length) return grid;
  const at = layerIndex + 1;
  // A monotonic counter, not the clock: duplicating the same layer twice inside one millisecond
  // otherwise mints the SAME id twice, and two beams sharing an id is a part that deletes or edits
  // in pairs.
  copySeq += 1;
  const stamp = `${Date.now().toString(36)}${copySeq}`;

  // New ring ids first: the copied CELLS have to point at the copies, not the originals.
  const ringIdMap = new Map<string, string>();
  const circles = (grid.circles ?? []).map((c) => (c.layer > layerIndex ? { ...c, layer: c.layer + 1 } : c));
  for (const ring of grid.circles ?? []) {
    if (ring.layer !== layerIndex) continue;
    const copy = { ...ring, id: `${ring.id}-copy-${stamp}-${circles.length}`, layer: at };
    ringIdMap.set(ring.id, copy.id);
    circles.push(copy);
  }

  const source = grid.layers[layerIndex];
  const copiedCells: Layer = source.map((cell) => {
    const next = { ...cell };
    if (next.circleId) {
      const mapped = ringIdMap.get(next.circleId);
      // A circle cell whose ring isn't on this layer has nothing to point at in the copy — it is
      // already broken, and copying the dangling id would spread the breakage.
      if (mapped) next.circleId = mapped;
      else delete next.circleId;
    }
    return next;
  });
  const layers = [...grid.layers.slice(0, at), copiedCells, ...grid.layers.slice(at)];

  const shiftAndCopy = <T extends { id: string; layer: number }>(items: T[] | undefined, tag: string): T[] => {
    const shifted = (items ?? []).map((it) => (it.layer > layerIndex ? { ...it, layer: it.layer + 1 } : it));
    const copies = (items ?? [])
      .filter((it) => it.layer === layerIndex)
      .map((it, i) => ({ ...it, id: `${it.id}-${tag}-${stamp}-${i}`, layer: at }));
    return [...shifted, ...copies];
  };

  return {
    ...grid,
    layers,
    activeLayer: at,
    beams: shiftAndCopy(grid.beams, "copy"),
    discs: shiftAndCopy(grid.discs, "copy"),
    circles,
  };
}

/** Removes the given layer (never the last remaining one), clamping the active layer index. */
export function removeLayer(grid: GridState, layerIndex: number): GridState {
  if (grid.layers.length <= 1) return grid;
  const layers = grid.layers.filter((_, i) => i !== layerIndex);
  const activeLayer = Math.min(grid.activeLayer, layers.length - 1);
  // An angled beam names its layer by index, so removing a layer has to take its beams with it and
  // pull every beam above back down one — otherwise the survivors silently jump a layer.
  const beams = (grid.beams ?? [])
    .filter((b) => b.layer !== layerIndex)
    .map((b) => (b.layer > layerIndex ? { ...b, layer: b.layer - 1 } : b));
  const discs = (grid.discs ?? [])
    .filter((d) => d.layer !== layerIndex)
    .map((d) => (d.layer > layerIndex ? { ...d, layer: d.layer - 1 } : d));
  const circles = (grid.circles ?? [])
    .filter((c) => c.layer !== layerIndex)
    .map((c) => (c.layer > layerIndex ? { ...c, layer: c.layer - 1 } : c));
  return { ...grid, layers, activeLayer, beams, discs, circles };
}

/** Swaps the layer index every beam on `a` or `b` refers to — see `removeLayer` on why beams need
 * remapping whenever the layer list is reordered. */
function swapBeamLayers<T extends { layer: number }>(items: T[] | undefined, a: number, b: number): T[] {
  return (items ?? []).map((item) =>
    item.layer === a ? { ...item, layer: b } : item.layer === b ? { ...item, layer: a } : item,
  );
}

/**
 * Moves one cell's contents to another square on the same layer, leaving the source empty and
 * overwriting whatever was at the destination. A no-op when the source is empty or the two are the
 * same square — moving nothing shouldn't cost an undo entry.
 *
 * Deliberately a plain move, not a swap: the gesture it backs (Alt-drag on the plan) reads as
 * "pick this up and put it there", and a swap would silently drag a second, unrelated cell along
 * for the ride.
 *
 * For a DRAG, apply this to the grid as it was when the gesture began, always from the ORIGINAL
 * source square to wherever the pointer is now — never step it from one intermediate square to the
 * next. Stepping destroys the plan: every square the cell is dragged across is overwritten and then
 * blanked as the cell moves on, so a drag leaves a trail of erased cells behind it. Recomputing
 * from the pre-drag snapshot means what the cell passes over comes back when it leaves, and only
 * the square it is dropped on is overwritten. Same rule, same reason, as moveCircleRing.
 */
export function moveCell(grid: GridState, fromX: number, fromY: number, toX: number, toY: number): GridState {
  if (!inBounds(grid, fromX, fromY) || !inBounds(grid, toX, toY)) return grid;
  if (fromX === toX && fromY === toY) return grid;
  const layer = grid.layers[grid.activeLayer];
  const cell = layer[indexOf(grid, fromX, fromY)];
  if (cell.type === CellType.Empty) return grid;
  const next = layer.slice();
  // A circle cell dragged outside its own ring's footprint stops being a slice of that circle —
  // there is no (col, row) for it there — so it lands as the plain solid it now is, rather than
  // keeping a membership that would silently build as the ring's (0, 0) corner.
  const ring = circleRingOf(grid, cell);
  const moved = ring && !ringContains(ring, toX, toY) ? (({ circleId: _dropped, ...rest }) => rest)(cell) : cell;
  next[indexOf(grid, toX, toY)] = moved;
  next[indexOf(grid, fromX, fromY)] = { ...EMPTY_CELL };
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = next;
  return { ...grid, layers };
}

/** Adds an angled beam and makes it the project's newest element. */
export function addBeam(grid: GridState, beam: AngledBeam): GridState {
  return { ...grid, beams: [...(grid.beams ?? []), beam] };
}

/** Applies a partial change to one beam by id; returns the grid unchanged if there's no such beam. */
export function updateBeam(grid: GridState, id: string, patch: Partial<AngledBeam>): GridState {
  const beams = grid.beams ?? [];
  if (!beams.some((b) => b.id === id)) return grid;
  return { ...grid, beams: beams.map((b) => (b.id === id ? { ...b, ...patch, id: b.id } : b)) };
}

export function removeBeam(grid: GridState, id: string): GridState {
  const beams = grid.beams ?? [];
  if (!beams.some((b) => b.id === id)) return grid;
  return { ...grid, beams: beams.filter((b) => b.id !== id) };
}

/** Adds a slot disc. */
export function addDisc(grid: GridState, disc: SlotDisc): GridState {
  return { ...grid, discs: [...(grid.discs ?? []), disc] };
}

/** Applies a partial change to one disc by id; returns the grid unchanged if there's no such disc. */
export function updateDisc(grid: GridState, id: string, patch: Partial<SlotDisc>): GridState {
  const discs = grid.discs ?? [];
  if (!discs.some((d) => d.id === id)) return grid;
  return { ...grid, discs: discs.map((d) => (d.id === id ? { ...d, ...patch, id: d.id } : d)) };
}

export function removeDisc(grid: GridState, id: string): GridState {
  const discs = grid.discs ?? [];
  if (!discs.some((d) => d.id === id)) return grid;
  return { ...grid, discs: discs.filter((d) => d.id !== id) };
}

export function setActiveLayer(grid: GridState, layerIndex: number): GridState {
  if (layerIndex < 0 || layerIndex >= grid.layers.length || layerIndex === grid.activeLayer) return grid;
  return { ...grid, activeLayer: layerIndex };
}

/** Moves a layer up one position (higher index, toward the top). */
export function moveLayerUp(grid: GridState, layerIndex: number): GridState {
  if (layerIndex >= grid.layers.length - 1 || layerIndex < 0) return grid;
  const layers = grid.layers.slice();
  [layers[layerIndex], layers[layerIndex + 1]] = [layers[layerIndex + 1], layers[layerIndex]];
  const activeLayer = grid.activeLayer === layerIndex ? layerIndex + 1 : grid.activeLayer === layerIndex + 1 ? layerIndex : grid.activeLayer;
  return {
    ...grid,
    layers,
    activeLayer,
    beams: swapBeamLayers(grid.beams, layerIndex, layerIndex + 1),
    discs: swapBeamLayers(grid.discs, layerIndex, layerIndex + 1),
    circles: swapBeamLayers(grid.circles, layerIndex, layerIndex + 1),
  };
}

/** Moves a layer down one position (lower index, toward the bottom). */
export function moveLayerDown(grid: GridState, layerIndex: number): GridState {
  if (layerIndex <= 0 || layerIndex >= grid.layers.length) return grid;
  const layers = grid.layers.slice();
  [layers[layerIndex], layers[layerIndex - 1]] = [layers[layerIndex - 1], layers[layerIndex]];
  const activeLayer = grid.activeLayer === layerIndex ? layerIndex - 1 : grid.activeLayer === layerIndex - 1 ? layerIndex : grid.activeLayer;
  return {
    ...grid,
    layers,
    activeLayer,
    beams: swapBeamLayers(grid.beams, layerIndex, layerIndex - 1),
    discs: swapBeamLayers(grid.discs, layerIndex, layerIndex - 1),
    circles: swapBeamLayers(grid.circles, layerIndex, layerIndex - 1),
  };
}

/** Replaces the active layer's cells wholesale (e.g. from an auto-fill generator). */
export function withActiveLayerCells(grid: GridState, cells: Layer): GridState {
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = cells;
  return { ...grid, layers };
}
