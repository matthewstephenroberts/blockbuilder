import { Paintbrush, MousePointer } from "lucide-react";
import { CELL_TYPE_INFO, CELL_TYPE_ORDER, CellType } from "../model/cellTypes";
import { ToolMode } from "../state/useProjectStore";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getBrushPreview, clearBrushPreviewCache } from "../model/brushPreview";
import { getCellTypeHexColor } from "../model/colorMap";

interface Props {
  tool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  brush: CellType;
  onBrushChange: (type: CellType) => void;
  theme: 'dark' | 'light';
}

function BrushButton({
  type,
  isActive,
  onSelect,
  theme,
  onPreviewLoad,
}: {
  type: CellType;
  isActive: boolean;
  onSelect: () => void;
  theme: 'dark' | 'light';
  /** Fired once this chip's preview image has actually rendered — see ActionBar's own fitTiles,
   * which has to re-measure after the chips reach their real laid-out size. */
  onPreviewLoad: () => void;
}) {
  const [preview, setPreview] = useState<string>("");
  const info = CELL_TYPE_INFO[type];
  const hexColor = getCellTypeHexColor(type);

  useEffect(() => {
    getBrushPreview(type, theme).then(setPreview);
  }, [type, theme]);

  return (
    <button
      className={`brush-btn-with-preview${isActive ? " active" : ""}`}
      onClick={onSelect}
      title={info.label}
    >
      <div className="brush-preview-container">
        {preview ? (
          <img src={preview} alt={info.label} className="brush-preview-img" onLoad={onPreviewLoad} />
        ) : (
          <div
            className="brush-preview-swatch"
            style={{ backgroundColor: hexColor }}
          />
        )}
        <div
          className="brush-color-indicator"
          style={{ backgroundColor: hexColor }}
          title={`Color: ${hexColor}`}
        />
      </div>
      <span className="brush-label">{info.shortLabel}</span>
    </button>
  );
}

// The brush chips are sized from a single `--brush-tile` (see styles.css). These bound the
// auto-fit search below: TILE_MAX is as large as a chip ever usefully gets, TILE_MIN as small as
// one stays legible at, and TILE_STEP how finely the two are searched between.
const TILE_MAX = 96;
const TILE_MIN = 34;
const TILE_STEP = 2;

// Below this bar height there isn't room to stack the two tool buttons — they go side by side
// instead. This has to follow the BAR's own height, not the viewport's: the bar is resizable
// independently of the window, so a tall window with the bar dragged to its 70px minimum is
// exactly the case a viewport media query gets wrong.
const TOOL_STACK_MIN_HEIGHT = 104;

export default function ActionBar({ tool, onToolChange, brush, onBrushChange, theme }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [stackTools, setStackTools] = useState(true);

  useEffect(() => {
    clearBrushPreviewCache();
  }, [theme]);

  /**
   * Picks the largest chip size at which every brush still fits the bar without scrolling.
   *
   * This can't be done in CSS alone: how many rows the chips wrap into depends on the chip width,
   * which depends on the size we're choosing, and CSS has no way to feed that back. Scaling the
   * chip off the bar's height (what this replaced) got it exactly backwards — dragging the bar
   * TALLER grew the chips, which made them wrap to a second row, which needed more height than the
   * bar had, so the extra space produced a scrollbar instead of removing one.
   *
   * So: set the biggest size, then step down until the group stops overflowing. Measuring the real
   * laid-out result rather than modelling chip width means it stays correct regardless of how many
   * brushes there are or how wide their labels get. Starting from TILE_MAX every time is what lets
   * it grow back when space is freed, not only shrink.
   */
  const fitTiles = useCallback(() => {
    const group = groupRef.current;
    if (!group || group.childElementCount === 0) return;
    let tile = TILE_MAX;
    group.style.setProperty("--brush-tile", `${tile}px`);
    while (tile > TILE_MIN && group.scrollHeight > group.clientHeight + 1) {
      tile -= TILE_STEP;
      group.style.setProperty("--brush-tile", `${tile}px`);
    }
    const bar = barRef.current;
    if (bar) setStackTools(bar.clientHeight >= TOOL_STACK_MIN_HEIGHT);
  }, []);

  // Coalesces the callers below into one fit per frame — fourteen preview images finishing at
  // roughly the same moment would otherwise each trigger their own measure-and-shrink pass.
  const pendingFit = useRef(0);
  const scheduleFit = useCallback(() => {
    if (pendingFit.current) return;
    pendingFit.current = requestAnimationFrame(() => {
      pendingFit.current = 0;
      fitTiles();
    });
  }, [fitTiles]);

  useLayoutEffect(() => {
    // Measured immediately AND again after the browser has actually laid the chips out. The first
    // pass runs before the bar has its final height and before any preview has rendered, so on its
    // own it can conclude everything fits when it doesn't — which is how the strip ended up
    // scrolling at full bar height with the chips still at their largest size.
    fitTiles();
    scheduleFit();
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    // Watches the bar itself, so both the user's drag on its height and any window resize
    // re-run the fit. Deliberately NOT the brush group: this changes the group's own contents, so
    // observing it would feed straight back into itself.
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      if (pendingFit.current) {
        cancelAnimationFrame(pendingFit.current);
        // Clearing the ref matters as much as cancelling the frame: `scheduleFit` treats a
        // non-zero id as "a fit is already queued" and returns early, so leaving a cancelled id
        // behind wedges it shut permanently. StrictMode's mount / cleanup / re-mount makes that
        // the NORMAL path in development, not an edge case — every later resize and preview load
        // was being silently dropped.
        pendingFit.current = 0;
      }
    };
  }, [fitTiles, scheduleFit]);

  return (
    <div className="action-bar" ref={barRef}>
      <div className={`tool-group${stackTools ? " stacked" : ""}`}>
        <button
          className={`icon-btn${tool === "paint" ? " active" : ""}`}
          onClick={() => onToolChange("paint")}
          title="Paint tool - click/drag to paint with selected brush"
        >
          <Paintbrush size={18} />
        </button>
        <button
          className={`icon-btn${tool === "edit" ? " active" : ""}`}
          onClick={() => onToolChange("edit")}
          title="Edit tool - inspect and adjust existing cells"
        >
          <MousePointer size={18} />
        </button>
      </div>

      <div className="brush-group" ref={groupRef}>
        {CELL_TYPE_ORDER.map((type) => (
          <BrushButton
            key={type}
            type={type}
            isActive={brush === type}
            onSelect={() => onBrushChange(type)}
            theme={theme}
            onPreviewLoad={scheduleFit}
          />
        ))}
      </div>
    </div>
  );
}
