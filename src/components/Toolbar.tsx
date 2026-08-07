import { Trash2 } from "lucide-react";
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
import { getCell, GridState } from "../model/grid";
import { STUD_PITCH } from "../model/units";
import { CirclePlacementMode, FlipSetting, ToolMode } from "../state/useProjectStore";

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
  circleCol: number;
  circleRow: number;
  onCircleCellChange: (col: number, row: number) => void;
  circleHollow: boolean;
  onCircleHollowChange: (v: boolean) => void;
  circleOuterSquare: boolean;
  onCircleOuterSquareChange: (v: boolean) => void;
  circlePlacementMode: CirclePlacementMode;
  onCirclePlacementModeChange: (m: CirclePlacementMode) => void;
  tool: ToolMode;
  onToolChange: (t: ToolMode) => void;
  onResize: (width: number, height: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  selectedCell: { x: number; y: number } | null;
  onRemoveCell: (x: number, y: number) => void;
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
  circleCol,
  circleRow,
  onCircleCellChange,
  circleHollow,
  onCircleHollowChange,
  circleOuterSquare,
  onCircleOuterSquareChange,
  circlePlacementMode,
  onCirclePlacementModeChange,
  tool,
  onToolChange: _onToolChange,
  selectedCell,
  onRemoveCell,
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
  const showAxisPicker = tool === "edit" ? !editingKnownType || AXIS_SETTABLE_TYPES.has(editingType!) : AXIS_SETTABLE_TYPES.has(brush);
  // Flip matters for protruding connectors (which way they point), the ball-socket's single port,
  // and narrowed Solid cells (which side of the axis the material is removed from). Plain holes are
  // symmetric bores, so they don't need a flip control. For narrowed Solid: Forward removes material
  // from the +axis side, Reversed removes from the -axis side, letting ribs be positioned left or right.
  const showFlipPicker = tool === "edit" ? !editingKnownType || FLIP_AWARE_TYPES.has(editingType!) : FLIP_AWARE_TYPES.has(brush);
  const showHeightAndEdgesPickers = tool === "edit" ? !editingKnownType || editingType !== CellType.Empty : brush !== CellType.Empty;
  // Plate width only means something on a cell whose chosen axis is sideways (X or Y) — a Z-axis
  // cell's own cross-section is already governed by Plate height. Solid qualifies here exactly the
  // same as a hole/connector cell now that showAxisPicker includes it. Always show it but disable
  // when Z-axis is selected so users understand the feature exists but isn't applicable.
  const showWidthPicker = showHeightAndEdgesPickers && showAxisPicker;
  const widthPickerEnabled = axis !== "z";
  const showEdgesPicker = showHeightAndEdgesPickers;
  // Available at paint time too, not just Edit — which of a cell's 4 faces actually border a
  // hollow ring depends on where it lands in the grid, so a blindly-set toggle is often a no-op
  // for any GIVEN cell, but a brush painted across many cells (an edge/corner of a repeated
  // pattern, e.g.) benefits from not having to switch to Edit and re-set the same toggle per
  // cell — same tradeoff axis/flip already make (see showAxisPicker/showFlipPicker above).
  const showBlendPicker = tool === "edit" ? !editingKnownType || BLEND_AWARE_TYPES.has(editingType!) : BLEND_AWARE_TYPES.has(brush);
  const showCircleControls = brush === CellType.CircleSolid;

  return (
    <div className="card">
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
                {widthPickerEnabled ? (
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
            When this cell sits near the centre of a hollow Circle solid ring/washer, its edge
            can face empty air across the ring's own bore instead of touching material — toggle a
            side on to reconnect and curve that edge into the ring; leave it off to keep a flat,
            disconnected edge there. Only does anything on a side that's actually next to a hollow
            ring. Nothing is joined automatically any more — toggle each side you want joined.
          </p>
          <div className="row gap wrap">
            <button
              className={`brush-btn${blendXNeg ? " active" : ""}`}
              onClick={() => onBlendXNegChange(!blendXNeg)}
              title="Join and curve this cell's -X (left) edge into a hollow ring on that side."
            >
              -X
            </button>
            <button
              className={`brush-btn${blendXPos ? " active" : ""}`}
              onClick={() => onBlendXPosChange(!blendXPos)}
              title="Join and curve this cell's +X (right) edge into a hollow ring on that side."
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
          <div className="row gap" style={{ alignItems: "center" }}>
            <button
              className="brush-btn"
              style={{ width: 32, padding: 0 }}
              onClick={() => onCircleDimensionChange(Math.max(2, circleDimension - 1))}
              disabled={circleDimension <= 2}
              title="Decrease dimension"
            >
              −
            </button>
            <input
              type="number"
              min={2}
              max={99}
              value={circleDimension}
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

          <div className="card-head" style={{ marginTop: 16 }}>
            <h2>Circle Placement</h2>
          </div>
          <div className="row gap">
            <button
              className={`brush-btn${circlePlacementMode === "auto-center" ? " active" : ""}`}
              onClick={() => onCirclePlacementModeChange("auto-center")}
              title={`Click any cell to paint the WHOLE ${circleDimension}x${circleDimension} group in one go, centred on that click — no need to place each cell individually.`}
            >
              Auto (click center)
            </button>
            <button
              className={`brush-btn${circlePlacementMode === "manual" ? " active" : ""}`}
              onClick={() => onCirclePlacementModeChange("manual")}
              title="Pick which single cell of the group to paint below, then click a grid cell to place just that one — build the group up one cell at a time."
            >
              Manual (one cell)
            </button>
          </div>

          {circlePlacementMode === "manual" && (
            <>
              <div className="card-head" style={{ marginTop: 16 }}>
                <h2>Circle Cell Position</h2>
              </div>
              <p className="muted sm">
                Which cell of the {circleDimension}x{circleDimension} group this brush paints next.
                Paint every cell in the group at its own matching position to assemble one smooth
                circle — a single cell painted alone will still look mostly square, since it's only
                cut where its own corner falls outside the shared circle.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${circleDimension}, 24px)`,
                  gap: 3,
                  width: "fit-content",
                  maxWidth: "100%",
                  maxHeight: 240,
                  overflow: "auto",
                }}
              >
                {Array.from({ length: circleDimension * circleDimension }, (_, i) => {
                  const col = i % circleDimension;
                  const row = Math.floor(i / circleDimension);
                  const isActive = col === circleCol && row === circleRow;
                  return (
                    <button
                      key={i}
                      className={`brush-btn${isActive ? " active" : ""}`}
                      style={{ width: 24, height: 24, padding: 0 }}
                      onClick={() => onCircleCellChange(col, row)}
                      title={`Column ${col}, row ${row} of the ${circleDimension}x${circleDimension} group`}
                    />
                  );
                })}
              </div>
            </>
          )}
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
