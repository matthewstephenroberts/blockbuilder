import { useCallback, useMemo, useRef, useState } from "react";
import { AXIS_SETTABLE_TYPES, CellType, FLIP_AWARE_TYPES, HoleAxis, PlateFraction } from "../model/cellTypes";
import { AutoFillOptions, generateAutoFillLayer } from "../model/autofill";
import {
  addLayer,
  clearRect,
  createEmptyGrid,
  getActiveLayer,
  GridState,
  indexOf,
  moveLayerDown,
  moveLayerUp,
  removeLayer,
  resizeGrid,
  setActiveLayer,
  withActiveLayerCells,
  withCircleGroup,
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
 * How a CircleSolid click chooses which group cell(s) get painted. "manual" paints exactly the
 * clicked/dragged cell(s) at whatever (circleCol, circleRow) is currently selected in the picker
 * — build the group one cell at a time. "auto-center" paints the WHOLE `circleDimension x
 * circleDimension` group in one click, centred on wherever the user clicks (see
 * `withCircleGroup`) — no picker needed, at the cost of only being able to place one full group
 * per click (a drag still only uses its start cell as the centre).
 */
export type CirclePlacementMode = "manual" | "auto-center";

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
  circleDimension: number;
  setCircleDimension: (d: number) => void;
  circleCol: number;
  circleRow: number;
  setCircleCell: (col: number, row: number) => void;
  circleHollow: boolean;
  setCircleHollow: (v: boolean) => void;
  circleOuterSquare: boolean;
  setCircleOuterSquare: (v: boolean) => void;
  circlePlacementMode: CirclePlacementMode;
  setCirclePlacementMode: (m: CirclePlacementMode) => void;
  tool: ToolMode;
  setTool: (t: ToolMode) => void;
  paintRect: (x0: number, y0: number, x1: number, y1: number, type?: CellType) => void;
  selectedCell: { x: number; y: number } | null;
  selectCell: (x: number, y: number) => void;
  removeCell: (x: number, y: number) => void;
  autoFill: (opts: AutoFillOptions) => void;
  resize: (width: number, height: number) => void;
  setRoundingCorners: (value: boolean) => void;
  setPartClearance: (value: number) => void;
  setHoleClearance: (value: number) => void;
  setSidewaysHoleClearance: (value: number) => void;
  addLayer: () => void;
  removeLayer: (layerIndex: number) => void;
  setActiveLayer: (layerIndex: number) => void;
  moveLayerUp: (layerIndex: number) => void;
  moveLayerDown: (layerIndex: number) => void;
  /** Layer indices currently hidden from the 3D preview — a pure viewing convenience (see
   * buildGridGeometry's own `hiddenLayers` param); never affects the actual model or STL export. */
  hiddenLayers: ReadonlySet<number>;
  toggleLayerVisibility: (layerIndex: number) => void;
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
  const [plateFraction, setPlateFraction] = useState<PlateFraction>("full");
  const [widthFraction, setWidthFraction] = useState<PlateFraction | undefined>(undefined);
  const [roundedEdges, setRoundedEdges] = useState(false);
  const [blendXPos, setBlendXPos] = useState(false);
  const [blendXNeg, setBlendXNeg] = useState(false);
  const [blendYPos, setBlendYPos] = useState(false);
  const [blendYNeg, setBlendYNeg] = useState(false);
  const [cornerBlendXPosYPos, setCornerBlendXPosYPos] = useState(false);
  const [cornerBlendXPosYNeg, setCornerBlendXPosYNeg] = useState(false);
  const [cornerBlendXNegYPos, setCornerBlendXNegYPos] = useState(false);
  const [cornerBlendXNegYNeg, setCornerBlendXNegYNeg] = useState(false);
  const [circleDimension, setCircleDimensionState] = useState(2);
  const [circleCol, setCircleCol] = useState(0);
  const [circleRow, setCircleRow] = useState(0);
  const [circleHollow, setCircleHollow] = useState(false);
  const [circleOuterSquare, setCircleOuterSquare] = useState(false);
  const [circlePlacementMode, setCirclePlacementMode] = useState<CirclePlacementMode>("auto-center");

  // Shrinking the dimension can leave the previously-selected cell out of bounds (e.g. was at
  // col 4 in a 5x5 group, dimension drops to 3x3) — clamp it back into the new group's range
  // rather than silently painting with a stale, now-invalid cell reference.
  const setCircleDimension = useCallback((d: number) => {
    setCircleDimensionState(d);
    setCircleCol((c) => Math.min(c, d - 1));
    setCircleRow((r) => Math.min(r, d - 1));
  }, []);

  const setCircleCell = useCallback((col: number, row: number) => {
    setCircleCol(col);
    setCircleRow(row);
  }, []);
  const [tool, setTool] = useState<ToolMode>("paint");
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  const undoStack = useRef<GridState[]>([]);
  const redoStack = useRef<GridState[]>([]);
  const [, forceRender] = useState(0);

  const paintRect = useCallback(
    (x0: number, y0: number, x1: number, y1: number, type?: CellType) => {
      const explicitFlip = flip === "auto" ? undefined : flip;
      setGridState((prev) => {
        const paintedType = type ?? brush;
        const isEmpty = paintedType === CellType.Empty;
        const next =
          tool === "edit"
            ? withPropertiesRect(prev, x0, y0, x1, y1, {
                axis,
                flip: explicitFlip,
                plateFraction,
                rounded: roundedEdges,
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
            : paintedType === CellType.CircleSolid && circlePlacementMode === "auto-center"
              ? // A drag still only has ONE centre — (x0, y0) is where the drag/click started, so
                // that's what the whole group centres on, ignoring wherever it ended.
                withCircleGroup(
                  prev,
                  x0,
                  y0,
                  circleDimension,
                  plateFraction,
                  roundedEdges,
                  circleHollow,
                  circleOuterSquare,
                )
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
                  paintedType === CellType.CircleSolid ? circleDimension : undefined,
                  paintedType === CellType.CircleSolid ? circleCol : undefined,
                  paintedType === CellType.CircleSolid ? circleRow : undefined,
                  paintedType === CellType.CircleSolid ? circleHollow : undefined,
                  paintedType === CellType.CircleSolid ? circleOuterSquare : undefined,
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
                );
        if (next !== prev) {
          undoStack.current.push(prev);
          if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
          redoStack.current = [];
        }
        return next;
      });
    },
    [
      brush,
      axis,
      flip,
      plateFraction,
      widthFraction,
      roundedEdges,
      tool,
      circleDimension,
      circleCol,
      circleRow,
      circleHollow,
      circleOuterSquare,
      circlePlacementMode,
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

  // Loads an already-painted cell's own current axis/flip/plate height/edges into the pickers —
  // the Edit tool's "inspect" step, so adjusting an existing cell starts from what's actually
  // there instead of whatever the pickers happened to be left at.
  const selectCell = useCallback(
    (x: number, y: number) => {
      const layer = getActiveLayer(grid);
      const cell = layer[indexOf(grid, x, y)];
      if (!cell || cell.type === CellType.Empty) return;
      setSelectedCell({ x, y });
      if (AXIS_SETTABLE_TYPES.has(cell.type)) setAxis(cell.axis ?? "x");
      if (FLIP_AWARE_TYPES.has(cell.type)) setFlip(cell.flip ?? false);
      setPlateFraction(cell.plateFraction ?? "full");
      setWidthFraction(cell.widthFraction);
      setRoundedEdges(cell.rounded ?? false);
      setBlendXPos(cell.blendXPos ?? false);
      setBlendXNeg(cell.blendXNeg ?? false);
      setBlendYPos(cell.blendYPos ?? false);
      setBlendYNeg(cell.blendYNeg ?? false);
      setCornerBlendXPosYPos(cell.cornerBlendXPosYPos ?? false);
      setCornerBlendXPosYNeg(cell.cornerBlendXPosYNeg ?? false);
      setCornerBlendXNegYPos(cell.cornerBlendXNegYPos ?? false);
      setCornerBlendXNegYNeg(cell.cornerBlendXNegYNeg ?? false);
    },
    [grid],
  );

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
      if (tool !== "edit" || !selectedCell) return;
      const nextFlipSetting = overrides.flip ?? flip;
      const changes = {
        axis: overrides.axis ?? axis,
        flip: nextFlipSetting === "auto" ? undefined : nextFlipSetting,
        plateFraction: overrides.plateFraction ?? plateFraction,
        rounded: overrides.rounded ?? roundedEdges,
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
          undoStack.current.push(prev);
          if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
          redoStack.current = [];
        }
        return next;
      });
    },
    [
      tool,
      selectedCell,
      axis,
      flip,
      plateFraction,
      roundedEdges,
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
    if (t !== "edit") setSelectedCell(null);
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
    undoStack.current.push(original);
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    redoStack.current = [];
    return withActiveLayerCells(resized, layer);
  }

  const resize = useCallback((width: number, height: number) => {
    setGridState((prev) => {
      const next = resizeGrid(prev, width, height);
      undoStack.current.push(prev);
      redoStack.current = [];
      return next;
    });
  }, []);

  const setRoundingCorners = useCallback((value: boolean) => {
    setGridState((prev) => ({ ...prev, rounding: { ...prev.rounding, corners: value } }));
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
      const next = clearRect(prev, x, y, x, y);
      if (next !== prev) {
        undoStack.current.push(prev);
        if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
        redoStack.current = [];
      }
      return next;
    });
  }, []);

  const addLayerAction = useCallback(() => {
    setGridState((prev) => {
      const next = addLayer(prev);
      undoStack.current.push(prev);
      redoStack.current = [];
      return next;
    });
  }, []);

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
      undoStack.current.push(prev);
      redoStack.current = [];
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

  const moveLayerUpAction = useCallback(
    (layerIndex: number) => {
      setGridState((prev) => {
        const next = moveLayerUp(prev, layerIndex);
        if (next === prev) return prev;
        undoStack.current.push(prev);
        redoStack.current = [];
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
        undoStack.current.push(prev);
        redoStack.current = [];
        return next;
      });
      swapHiddenLayers(layerIndex, layerIndex - 1);
    },
    [swapHiddenLayers],
  );

  const loadProject = useCallback((next: GridState) => {
    undoStack.current = [];
    redoStack.current = [];
    setGridState(next);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setGridState((current) => {
      redoStack.current.push(current);
      return prev;
    });
    forceRender((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setGridState((current) => {
      undoStack.current.push(current);
      return next;
    });
    forceRender((n) => n + 1);
  }, []);

  return useMemo(
    () => ({
      grid,
      brush,
      setBrush,
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
      circleCol,
      circleRow,
      setCircleCell,
      circleHollow,
      setCircleHollow,
      circleOuterSquare,
      setCircleOuterSquare,
      circlePlacementMode,
      setCirclePlacementMode,
      tool,
      setTool: setToolAndClearSelection,
      paintRect,
      selectedCell,
      selectCell,
      removeCell: removeCellAction,
      autoFill,
      resize,
      setRoundingCorners,
      setPartClearance,
      setHoleClearance,
      setSidewaysHoleClearance,
      addLayer: addLayerAction,
      removeLayer: removeLayerAction,
      setActiveLayer: setActiveLayerAction,
      moveLayerUp: moveLayerUpAction,
      moveLayerDown: moveLayerDownAction,
      hiddenLayers,
      toggleLayerVisibility,
      loadProject,
      undo,
      redo,
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
    }),
    [
      grid,
      brush,
      axis,
      flip,
      plateFraction,
      widthFraction,
      roundedEdges,
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
      circleCol,
      circleRow,
      setCircleCell,
      circleHollow,
      circleOuterSquare,
      circlePlacementMode,
      tool,
      paintRect,
      selectedCell,
      selectCell,
      removeCellAction,
      autoFill,
      resize,
      setRoundingCorners,
      setPartClearance,
      setHoleClearance,
      addLayerAction,
      removeLayerAction,
      setActiveLayerAction,
      moveLayerUpAction,
      moveLayerDownAction,
      hiddenLayers,
      toggleLayerVisibility,
      loadProject,
      undo,
      redo,
      setAxisAndApply,
      setFlipAndApply,
      setPlateFractionAndApply,
      setWidthFractionAndApply,
      setRoundedEdgesAndApply,
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
