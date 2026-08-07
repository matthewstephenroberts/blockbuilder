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
  /** For CircleSolid cells: dimension of the group circle this cell is one slice of (2, 3, 4, 5 for 2x2, 3x3, 4x4, 5x5). */
  circleDimension?: number;
  /** For CircleSolid cells: this cell's 0-based column within the `circleDimension x circleDimension` group (see circleSolidGeometry.ts). */
  circleCol?: number;
  /** For CircleSolid cells: this cell's 0-based row within the `circleDimension x circleDimension` group. */
  circleRow?: number;
  /** For CircleSolid cells: when true, the group also has a concentric inner circle (one stud
   * smaller in radius than the outer one) bored out of its centre, turning the solid disc into a
   * ring/washer shape — see circleSolidGeometry.ts's own `hollow` param. */
  circleHollow?: boolean;
  /** For CircleSolid cells: when true, the OUTER boundary stays a plain square instead of being
   * curved to the group's outer circle, so the group's own outward-facing sides stay flush and
   * can butt up against neighbouring cells outside the group (e.g. a ring feature embedded flush
   * inside a larger flat plate) — see circleSolidGeometry.ts's own `outerSquare` param. Independent
   * of `circleHollow`: an outer-square + hollow cell is a plain square block with a round hole. */
  circleOuterSquare?: boolean;
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
 * BLEND_AWARE_TYPES, same gating `withRect` already applies to circleDimension etc for non-circle
 * types. */
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
  circleDimension?: number,
  circleCol?: number,
  circleRow?: number,
  circleHollow?: boolean,
  circleOuterSquare?: boolean,
  blend?: BlendFlags,
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
        layer[i].circleDimension !== circleDimension ||
        layer[i].circleCol !== circleCol ||
        layer[i].circleRow !== circleRow ||
        layer[i].circleHollow !== circleHollow ||
        layer[i].circleOuterSquare !== circleOuterSquare ||
        layer[i].blendXPos !== b?.blendXPos ||
        layer[i].blendXNeg !== b?.blendXNeg ||
        layer[i].blendYPos !== b?.blendYPos ||
        layer[i].blendYNeg !== b?.blendYNeg ||
        layer[i].cornerBlendXPosYPos !== b?.cornerBlendXPosYPos ||
        layer[i].cornerBlendXPosYNeg !== b?.cornerBlendXPosYNeg ||
        layer[i].cornerBlendXNegYPos !== b?.cornerBlendXNegYPos ||
        layer[i].cornerBlendXNegYNeg !== b?.cornerBlendXNegYNeg
      ) {
        layer[i] = {
          type,
          axis,
          plateFraction,
          flip: resolvedFlip,
          rounded,
          widthFraction,
          circleDimension,
          circleCol,
          circleRow,
          circleHollow,
          circleOuterSquare,
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
 * Paints a whole `dimension x dimension` CircleSolid group in one shot, centred on
 * (centerX, centerY) — the "auto-fill from center" placement mode, so a user doesn't have to
 * manually select and paint each of the group's own cells one at a time to get a full circle.
 *
 * For an odd dimension, (centerX, centerY) becomes the exact middle cell. For an even dimension
 * (no single middle cell), it becomes the group's own col=0/row=0 cell (top-left) — an arbitrary
 * but consistent choice, matching `withCircleGroup`'s own col/row numbering.
 *
 * Cells that would fall outside the grid are silently skipped (clipped), same as `withRect`.
 */
export function withCircleGroup(
  grid: GridState,
  centerX: number,
  centerY: number,
  dimension: number,
  plateFraction?: PlateFraction,
  rounded?: boolean,
  hollow?: boolean,
  outerSquare?: boolean,
): GridState {
  const startX = centerX - Math.floor((dimension - 1) / 2);
  const startY = centerY - Math.floor((dimension - 1) / 2);
  const layer = getActiveLayer(grid).slice();
  let changed = false;
  for (let dy = 0; dy < dimension; dy++) {
    for (let dx = 0; dx < dimension; dx++) {
      const x = startX + dx;
      const y = startY + dy;
      if (!inBounds(grid, x, y)) continue;
      const col = dx;
      // World Y increases "up" (see GridEditor's own cellAt comment) while row 0 is meant to read
      // as the group's TOP — so row must count DOWN as world y counts up, same inversion
      // circleSolidGeometry.ts's own cellOffsetY applies.
      const row = dimension - 1 - dy;
      const i = indexOf(grid, x, y);
      const next: Cell = {
        type: CellType.CircleSolid,
        plateFraction,
        rounded,
        circleDimension: dimension,
        circleCol: col,
        circleRow: row,
        circleHollow: hollow,
        circleOuterSquare: outerSquare,
      };
      if (
        layer[i].type !== next.type ||
        layer[i].plateFraction !== next.plateFraction ||
        layer[i].circleDimension !== next.circleDimension ||
        layer[i].circleCol !== next.circleCol ||
        layer[i].circleRow !== next.circleRow ||
        layer[i].rounded !== next.rounded ||
        layer[i].circleHollow !== next.circleHollow ||
        layer[i].circleOuterSquare !== next.circleOuterSquare
      ) {
        layer[i] = next;
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
export function resizeGrid(grid: GridState, width: number, height: number): GridState {
  const layers = grid.layers.map((layer) => {
    const next = emptyLayer(width, height);
    for (let y = 0; y < Math.min(height, grid.height); y++) {
      for (let x = 0; x < Math.min(width, grid.width); x++) {
        next[y * width + x] = layer[indexOf(grid, x, y)];
      }
    }
    return next;
  });
  return { ...grid, width, height, layers };
}

/** Appends a new empty layer on top and makes it active. */
export function addLayer(grid: GridState): GridState {
  const layers = grid.layers.concat([emptyLayer(grid.width, grid.height)]);
  return { ...grid, layers, activeLayer: layers.length - 1 };
}

/** Removes the given layer (never the last remaining one), clamping the active layer index. */
export function removeLayer(grid: GridState, layerIndex: number): GridState {
  if (grid.layers.length <= 1) return grid;
  const layers = grid.layers.filter((_, i) => i !== layerIndex);
  const activeLayer = Math.min(grid.activeLayer, layers.length - 1);
  return { ...grid, layers, activeLayer };
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
  return { ...grid, layers, activeLayer };
}

/** Moves a layer down one position (lower index, toward the bottom). */
export function moveLayerDown(grid: GridState, layerIndex: number): GridState {
  if (layerIndex <= 0 || layerIndex >= grid.layers.length) return grid;
  const layers = grid.layers.slice();
  [layers[layerIndex], layers[layerIndex - 1]] = [layers[layerIndex - 1], layers[layerIndex]];
  const activeLayer = grid.activeLayer === layerIndex ? layerIndex - 1 : grid.activeLayer === layerIndex - 1 ? layerIndex : grid.activeLayer;
  return { ...grid, layers, activeLayer };
}

/** Replaces the active layer's cells wholesale (e.g. from an auto-fill generator). */
export function withActiveLayerCells(grid: GridState, cells: Layer): GridState {
  const layers = grid.layers.slice();
  layers[grid.activeLayer] = cells;
  return { ...grid, layers };
}
