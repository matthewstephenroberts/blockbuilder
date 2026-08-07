import { useCallback, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { AXIS_AWARE_TYPES, CELL_TYPE_INFO, CellType, FLIP_AWARE_TYPES, PLATE_FRACTION_INFO } from "../model/cellTypes";
import { Cell, getActiveLayer, GridState, indexOf, Layer } from "../model/grid";
import { ToolMode } from "../state/useProjectStore";
import { getCellTypeHexColor } from "../model/colorMap";

const CELL_PX = 28;
const THUMB_CELL_PX = 6;

// A Solid cell's axis only means anything once it's actually narrowed (see AXIS_SETTABLE_TYPES'
// own doc) — showing "X axis" on every plain Solid cell regardless would read as if it had a
// hole/connector bore, which it doesn't.
function showsAxis(cell: Cell): boolean {
  return AXIS_AWARE_TYPES.has(cell.type) || (cell.type === CellType.Solid && cell.widthFraction !== undefined);
}

interface Props {
  grid: GridState;
  brush: CellType;
  tool: ToolMode;
  onPaintRect: (x0: number, y0: number, x1: number, y1: number) => void;
  onSelectLayer: (index: number) => void;
  selectedCell: { x: number; y: number } | null;
  onSelectCell: (x: number, y: number) => void;
  onAddLayer: () => void;
  onRemoveLayer: (index: number) => void;
  onMoveLayerUp: (index: number) => void;
  onMoveLayerDown: (index: number) => void;
  onResize: (width: number, height: number) => void;
  hiddenLayers: ReadonlySet<number>;
  onToggleLayerVisibility: (index: number) => void;
}

/** "F" (Forward, +axis — the default) or "R" (Reversed, -axis) — matches the Flip picker's own
 * "Forward (F)" / "Reversed (R)" button labels in Toolbar.tsx. */
function flipLabel(flip: boolean | undefined): string {
  return flip ? "R" : "F";
}

/** Spells out a cell's current settings for its hover tooltip, matching the small glyphs overlaid
 * on the cell itself (axis letter, flip letter, plate-height code) so hovering confirms what the
 * overlay is showing. */
function cellTooltip(cell: Cell, typeLabel: string): string {
  if (cell.type === CellType.Empty) return typeLabel;
  const parts = [typeLabel];
  if (showsAxis(cell)) parts.push(`${(cell.axis ?? "x").toUpperCase()} axis`);
  if (FLIP_AWARE_TYPES.has(cell.type)) parts.push(cell.flip ? "Reversed (-axis)" : "Forward (+axis)");
  parts.push(PLATE_FRACTION_INFO[cell.plateFraction ?? "full"].label);
  if (cell.rounded) parts.push("rounded edges");
  return parts.join(" · ");
}

/** A small, non-interactive preview of one layer — lets every layer stay visible at once (see
 * LayerStrip) instead of only the single one currently being edited below. */
function LayerThumbnail({
  layer,
  grid,
  active,
  label,
  index,
  totalLayers,
  hidden,
  onClick,
  onRemove,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
}: {
  layer: Layer;
  grid: GridState;
  active: boolean;
  label: string;
  index: number;
  totalLayers: number;
  hidden: boolean;
  onClick: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: () => void;
}) {
  return (
    <div className={`layer-thumb${active ? " active" : ""}`}>
      <button
        className="layer-thumb-preview"
        onClick={onClick}
        title={`${label} — click to make this the active layer`}
        style={hidden ? { opacity: 0.4 } : undefined}
      >
        <div
          className="layer-thumb-grid"
          style={{
            width: grid.width * THUMB_CELL_PX,
            height: grid.height * THUMB_CELL_PX,
            gridTemplateColumns: `repeat(${grid.width}, ${THUMB_CELL_PX}px)`,
          }}
        >
          {layer.map((cell, i) => (
            <div
              key={i}
              className="layer-thumb-cell"
              style={{ background: cell.type === CellType.Empty ? "transparent" : getCellTypeHexColor(cell.type) }}
            />
          ))}
        </div>
        <span className="muted sm">{label}</span>
      </button>
      <div className="layer-thumb-controls">
        <button
          className="icon-btn sm"
          onClick={onToggleVisibility}
          title={
            hidden
              ? "Hidden from the 3D preview — click to show again. Doesn't affect the model or STL export."
              : "Hide this layer from the 3D preview, so it's easier to see into a tall stack. Doesn't affect the model or STL export."
          }
        >
          {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button className="icon-btn sm" onClick={onMoveUp} disabled={index === totalLayers - 1} title="Move layer up">
          <ChevronUp size={14} />
        </button>
        <button className="icon-btn sm" onClick={onMoveDown} disabled={index === 0} title="Move layer down">
          <ChevronDown size={14} />
        </button>
        <button className="icon-btn sm" onClick={onRemove} disabled={totalLayers === 1} title="Remove this layer">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/** All layers at once, top-down, so the whole Z stack is visible while editing just one of them
 * below — otherwise the only way to see another layer's contents is to switch to it and lose
 * sight of the one you were just looking at. */
function LayerStrip({
  grid,
  onSelectLayer,
  onAddLayer,
  onRemoveLayer,
  onMoveLayerUp,
  onMoveLayerDown,
  hiddenLayers,
  onToggleLayerVisibility,
}: {
  grid: GridState;
  onSelectLayer: (index: number) => void;
  onAddLayer: () => void;
  onRemoveLayer: (index: number) => void;
  onMoveLayerUp: (index: number) => void;
  onMoveLayerDown: (index: number) => void;
  hiddenLayers: ReadonlySet<number>;
  onToggleLayerVisibility: (index: number) => void;
}) {
  return (
    <div className="layer-strip-container">
      <button className="icon-btn" onClick={onAddLayer} title="Add new layer on top">
        <Plus size={18} />
      </button>
      <div className="layer-strip">
        {grid.layers.map((_, i) => {
          const layerIndex = grid.layers.length - 1 - i; // top-down, matching LayersPanel's own order
          const label = `Layer ${layerIndex + 1}${layerIndex === grid.layers.length - 1 ? " (top)" : ""}`;
          return (
            <LayerThumbnail
              key={layerIndex}
              layer={grid.layers[layerIndex]}
              grid={grid}
              active={layerIndex === grid.activeLayer}
              label={label}
              index={layerIndex}
              totalLayers={grid.layers.length}
              hidden={hiddenLayers.has(layerIndex)}
              onClick={() => onSelectLayer(layerIndex)}
              onRemove={() => onRemoveLayer(layerIndex)}
              onMoveUp={() => onMoveLayerUp(layerIndex)}
              onMoveDown={() => onMoveLayerDown(layerIndex)}
              onToggleVisibility={() => onToggleLayerVisibility(layerIndex)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function GridEditor({
  grid,
  brush,
  tool,
  onPaintRect,
  onSelectLayer,
  selectedCell,
  onSelectCell,
  onAddLayer,
  onRemoveLayer,
  onMoveLayerUp,
  onMoveLayerDown,
  onResize,
  hiddenLayers,
  onToggleLayerVisibility,
}: Props) {
  const layer = getActiveLayer(grid);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const isRectMode = useRef(false);

  // The grid's Y axis is displayed FLIPPED from its storage order (column = data x unchanged,
  // row = height-1-y). Verified directly against a top-down 3D render: the geometry maps data x
  // to world X and data y to world Y with no rotation, and a top-down camera (screen-right =
  // world +X, screen-up = world +Y) showed that painting "right" in a naively-mapped editor read
  // as 3D "up", and "down" read as 3D "right" — a 90° rotation, not a match. Flipping only the
  // row here (not a transpose) makes editor-right track world +X (3D right) and editor-down
  // track world -Y (3D down), so the 2D plan and the 3D model read in the same orientation.
  const cellAt = useCallback(
    (clientX: number, clientY: number, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const col = Math.floor((clientX - rect.left) / CELL_PX);
      const row = Math.floor((clientY - rect.top) / CELL_PX);
      return { x: col, y: grid.height - 1 - row };
    },
    [grid.height],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = cellAt(e.clientX, e.clientY, e.currentTarget);
    isRectMode.current = e.shiftKey;
    setDragStart({ x, y });
    setDragCurrent({ x, y });
    if (tool === "edit") {
      if (!e.shiftKey) onSelectCell(x, y);
    } else if (!e.shiftKey) {
      onPaintRect(x, y, x, y);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const { x, y } = cellAt(e.clientX, e.clientY, e.currentTarget);
    setDragCurrent({ x, y });
    if (!isRectMode.current) {
      if (tool === "edit") onSelectCell(x, y);
      else onPaintRect(x, y, x, y);
    }
  };

  const handlePointerUp = () => {
    if (dragStart && dragCurrent && isRectMode.current) {
      onPaintRect(dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y);
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  const previewRect =
    dragStart && dragCurrent && isRectMode.current
      ? {
          x0: Math.min(dragStart.x, dragCurrent.x),
          y0: Math.min(dragStart.y, dragCurrent.y),
          x1: Math.max(dragStart.x, dragCurrent.x),
          y1: Math.max(dragStart.y, dragCurrent.y),
        }
      : null;

  const prevLayer = grid.activeLayer > 0 ? grid.layers[grid.activeLayer - 1] : null;

  return (
    <div className="grid-editor-wrap">
      <div className="row gap" style={{ marginBottom: 12 }}>
        <label className="field" style={{ flex: 1 }}>
          <span>X (studs)</span>
          <input
            type="number"
            min={1}
            max={40}
            value={grid.width}
            onChange={(e) => onResize(Number(e.target.value) || 1, grid.height)}
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Y (studs)</span>
          <input
            type="number"
            min={1}
            max={40}
            value={grid.height}
            onChange={(e) => onResize(grid.width, Number(e.target.value) || 1)}
          />
        </label>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
            Z (layers)
          </label>
          <div style={{ fontSize: '0.875rem', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {grid.layers.length}
          </div>
        </div>
      </div>
      <LayerStrip
        grid={grid}
        onSelectLayer={onSelectLayer}
        onAddLayer={onAddLayer}
        onRemoveLayer={onRemoveLayer}
        onMoveLayerUp={onMoveLayerUp}
        onMoveLayerDown={onMoveLayerDown}
        hiddenLayers={hiddenLayers}
        onToggleLayerVisibility={onToggleLayerVisibility}
      />
      <p className="muted sm">
        Editing layer {grid.activeLayer + 1} of {grid.layers.length}.{" "}
        {tool === "edit"
          ? "Click or drag to inspect an existing cell's settings (loaded into the pickers on the left). Hold Shift and click/drag to apply the pickers to existing cells — their type is left unchanged."
          : `Click/drag to paint with the current brush (${CELL_TYPE_INFO[brush].label}). Hold Shift and drag for a rectangle fill.`}
      </p>
      <div
        className="grid-editor-container"
        style={{
          width: grid.width * CELL_PX,
          height: grid.height * CELL_PX,
          position: "relative",
        }}
      >
        <div
          className="grid-editor"
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: `repeat(${grid.width}, ${CELL_PX}px)`,
            width: "100%",
            height: "100%",
            border: "1px solid var(--line)",
            background: "transparent",
            userSelect: "none",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {prevLayer &&
            prevLayer.map((cell, i) => {
              const bgX = i % grid.width;
              const bgY = Math.floor(i / grid.width);
              return (
                <div
                  key={`bg-${i}`}
                  className="grid-cell-background"
                  style={{
                    gridColumn: bgX + 1,
                    gridRow: grid.height - bgY,
                    background: cell.type === CellType.Empty ? undefined : '#cccccc',
                    opacity: cell.type === CellType.Empty ? 0 : 0.5,
                    pointerEvents: 'none',
                  }}
                />
              );
            })}
          {layer.map((cell, i) => {
            const x = i % grid.width;
            const y = Math.floor(i / grid.width);
            const inPreview =
              previewRect &&
              x >= previewRect.x0 &&
              x <= previewRect.x1 &&
              y >= previewRect.y0 &&
              y <= previewRect.y1;
            const isSelected = tool === "edit" && selectedCell?.x === x && selectedCell?.y === y;
            const info = CELL_TYPE_INFO[cell.type];
            const cellHexColor = getCellTypeHexColor(cell.type);
            return (
              <div
                key={indexOf(grid, x, y)}
                className={`grid-cell${inPreview ? " preview" : ""}${isSelected ? " selected" : ""}${cell.rounded ? " rounded" : ""}`}
                style={{
                  gridColumn: x + 1,
                  gridRow: grid.height - y,
                  background: cell.type === CellType.Empty ? undefined : cellHexColor,
                }}
                title={cellTooltip(cell, info.label)}
              >
                {cell.type !== CellType.Empty && (
                  <>
                    <span className="grid-cell-label">{info.shortLabel}</span>
                    {showsAxis(cell) && <span className="grid-cell-axis">{(cell.axis ?? "x").toUpperCase()}</span>}
                    {FLIP_AWARE_TYPES.has(cell.type) && (
                      <span className="grid-cell-flip">{flipLabel(cell.flip)}</span>
                    )}
                    <span className="grid-cell-plate">{PLATE_FRACTION_INFO[cell.plateFraction ?? "full"].shortLabel}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
