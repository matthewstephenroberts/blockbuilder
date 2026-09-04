import { useCallback, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { AXIS_AWARE_TYPES, CELL_TYPE_INFO, CellType, FLIP_AWARE_TYPES, plateFractionLabel, PLATE_FRACTION_INFO } from "../model/cellTypes";
import {
  AngledBeam,
  beamBodySpanStuds,
  BeamFitMode,
  beamFitToEndpoint,
  isOnCellGrid,
  beamHolePositions,
  BeamHoleAxis,
  BeamHoleType,
  snapEndpointToLegal,
  beamDirection,
  beamHoleAxisAt,
  beamEndHoleMisses,
  beamEndsMeetingBeams,
  beamHoleOffsetStuds,
  beamPlanOutline,
  beamSuppressedHoles,
  describeBeam,
  isBeamGridLegal,
  nearestBeamHole,
  normalizeDegrees,
} from "../model/angledBeam";
import { centreForOrigin, CircleRing } from "../model/circleRing";
import { Cell, getActiveLayer, GridState, inBounds, indexOf, Layer, layerPitch, layerSpacingOf, ResizeAnchor } from "../model/grid";
import { outerRadiusMm, ringRadiusMm, SlotDisc, slotSizeMm } from "../model/slotDisc";
import { DEFAULT_STUD_PITCH, SUPPORTED_STUD_PITCHES } from "../model/units";
import { BeamFitSetting, ToolMode } from "../state/useProjectStore";
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
  /** Which fit a beam drag takes, so the preview shows the beam the drop will actually make. */
  beamFit: BeamFitSetting;
  /** The angled-beam brush's hole type — the beam-fit drag preview needs it to work out how many
   * holes will fit between the two cells. */
  beamHoleType: BeamHoleType;
  /** ...and its bore direction, which decides whether the fit lands the body or the holes. */
  beamHoleAxis: BeamHoleAxis;
  tool: ToolMode;
  onPaintRect: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    type?: undefined,
    exactEndpoint?: boolean,
  ) => void;
  onSelectLayer: (index: number) => void;
  selectedCell: { x: number; y: number } | null;
  onSelectCell: (x: number, y: number) => void;
  onAddLayer: () => void;
  onDuplicateLayer: (index: number) => void;
  onRemoveLayer: (index: number) => void;
  onMoveLayerUp: (index: number) => void;
  onMoveLayerDown: (index: number) => void;
  /** Changes the active layer's stud pitch / connector system — see grid.ts's LayerSpacing. */
  onSetLayerSpacing: (index: number, patch: { pitch?: number; connectorPitch?: number }) => void;
  onResize: (width: number, height: number, anchor?: ResizeAnchor) => void;
  hiddenLayers: ReadonlySet<number>;
  onToggleLayerVisibility: (index: number) => void;
  selectedBeamId: string | null;
  onSelectBeam: (id: string | null) => void;
  selectedDiscId: string | null;
  onSelectDisc: (id: string | null) => void;
  /** The circle ring the selected cell belongs to, so the overlay can highlight the one the circle
   * panel is editing. */
  selectedCircle: CircleRing | null;
  /** Selects a whole ring from its centre handle — the circle's counterpart of onSelectDisc. */
  onSelectCircle: (id: string | null) => void;
  /** Start/end of a ring drag — see the store's setCircleCentre on why the gesture needs both. */
  onBeginCircleDrag: () => void;
  onEndCircleDrag: () => void;
  /** Start/end of a plain cell's Alt-drag, for the same snapshot reason — see the store's moveCell. */
  onBeginCellDrag: () => void;
  onEndCellDrag: () => void;
  /** Moves a ring so its centre lands on this square, carrying its member cells — the Alt-drag
   * gesture again. */
  onMoveCircleRing: (id: string, centreX: number, centreY: number) => void;
  /** Moves a beam's anchor cell — the overlay's anchor dot is draggable. */
  onMoveBeamAnchor: (id: string, anchorX: number, anchorY: number) => void;
  /** Called once when a move gesture starts, so the whole drag is one undo step (see the store's
   * own `checkpoint`) rather than one per intermediate position. */
  onBeginBeamDrag: () => void;
  /** Moves a slot disc's centre — the Alt-drag gesture again. */
  onMoveDiscCentre: (id: string, centreX: number, centreY: number) => void;
  /** Moves a cell's contents to another square on the active layer — the Alt-drag gesture. */
  onMoveCell: (fromX: number, fromY: number, toX: number, toY: number, history?: boolean) => void;
}

/** "F" (Forward, +axis — the default) or "R" (Reversed, -axis) — matches the Flip picker's own
 * "Forward (F)" / "Reversed (R)" button labels in Toolbar.tsx. */
function flipLabel(flip: boolean | undefined): string {
  return flip ? "R" : "F";
}

/** Spells out a cell's current settings for its hover tooltip, matching the small glyphs overlaid
 * on the cell itself (axis letter, flip letter, plate-height code) so hovering confirms what the
 * overlay is showing. */
function cellTooltip(cell: Cell, typeLabel: string, pitch: number): string {
  if (cell.type === CellType.Empty) return typeLabel;
  const parts = [typeLabel];
  if (showsAxis(cell)) parts.push(`${(cell.axis ?? "x").toUpperCase()} axis`);
  if (FLIP_AWARE_TYPES.has(cell.type)) parts.push(cell.flip ? "Reversed (-axis)" : "Forward (+axis)");
  parts.push(plateFractionLabel(cell.plateFraction ?? "full", pitch));
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
  spacing,
  hidden,
  onClick,
  onRemove,
  onDuplicate,
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
  /** This layer's own spacing — badged on the thumbnail whenever it isn't the plain 8mm default,
   * so a mixed-pitch stack is readable at a glance rather than only when a layer is selected. */
  spacing: { pitch: number; connectorPitch: number };
  hidden: boolean;
  onClick: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
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
        <span className="muted sm">
          {label}
          {(spacing.pitch !== DEFAULT_STUD_PITCH || spacing.connectorPitch !== spacing.pitch) && (
            <span
              className="layer-pitch-badge"
              title={`${spacing.pitch}mm spacing, ${spacing.connectorPitch}mm pins`}
            >
              {spacing.pitch === spacing.connectorPitch
                ? `${spacing.pitch}mm`
                : `${spacing.pitch}/${spacing.connectorPitch}mm`}
            </span>
          )}
        </span>
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
        <button
          className="icon-btn sm"
          onClick={onDuplicate}
          title="Duplicate this layer — cells, beams, discs and circles — directly above it"
        >
          <Copy size={14} />
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


// The angled-beam overlay's own colour, and a deliberately different one for circle groups — the
// two overlays can be on screen at once and both describe "the real shape, not the grid squares",
// so telling them apart has to be immediate.
const BEAM_OVERLAY_COLOUR = "#38bdf8";
const BEAM_OVERLAY_SELECTED_COLOUR = "#f59e0b";
// A hole that nearly meets another beam's hole and misses — see beamEndHoleMisses. Red because it
// is the one fault here that a render cannot show: the corner looks joined at any zoom.
const BEAM_HOLE_MISS_COLOUR = "#ef4444";
const CIRCLE_OVERLAY_COLOUR = "#c084fc";
// A selected ring, in the same amber every other selected element uses.
const CIRCLE_OVERLAY_SELECTED_COLOUR = "#f59e0b";
const DISC_OVERLAY_COLOUR = "#2dd4bf";
const DISC_OVERLAY_SELECTED_COLOUR = "#f59e0b";
// The layer BELOW the one being edited is drawn in grey behind it (see `grid-cell-background`), so
// a new layer can be lined up with what it sits on. Beams, discs and circle groups need the same
// treatment for the same reason — they're the parts of a layer you'd most want to line up with,
// and being element overlays rather than cells they were simply absent from that view.
const GHOST_COLOUR = "#cccccc";
const GHOST_OPACITY = 0.45;

/** An SVG subpath for a full circle — two arcs, since SVG has no circle primitive inside `d`. */
function circleSubpath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}

function rectSubpath(x0: number, y0: number, x1: number, y1: number): string {
  return `M ${x0} ${y0} H ${x1} V ${y1} H ${x0} Z`;
}

/**
 * Draws a slot disc's real outline over the plan: its rim, and every pocket at its true angle.
 * Same reason the other two overlays exist — the disc isn't made of cells, and its whole point is
 * a radial pattern the square grid underneath it can't represent, so without this there's nothing
 * on the 2D view to show where the pockets actually land.
 *
 * Interactive with the Edit tool only, exactly like the beam overlay: clicking selects the disc,
 * and while painting it stays transparent so the cells beneath it can still be painted.
 */
function DiscOverlay({
  grid,
  discs,
  selectedDiscId,
  onSelectDisc,
  interactive,
  ghost = false,
  cellPx,
}: {
  grid: GridState;
  discs: SlotDisc[];
  selectedDiscId: string | null;
  onSelectDisc: (id: string | null) => void;
  interactive: boolean;
  /** Drawn as the layer below rather than the one being edited — grey, faded, never interactive. */
  ghost?: boolean;
  cellPx: number;
}) {
  if (discs.length === 0) return null;
  // Every disc handed to this overlay is on one layer, so its pitch is the scale the whole overlay
  // is drawn at — a 10mm layer's cells are still one cellPx square on screen, but the disc's own
  // mm dimensions have to be divided by the pitch those cells actually represent.
  const mmToPx = cellPx / layerPitch(grid, discs[0].layer);

  return (
    <svg
      width={grid.width * cellPx}
      height={grid.height * cellPx}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", opacity: ghost ? GHOST_OPACITY : 1 }}
    >
      {discs.map((disc) => {
        const selected = !ghost && disc.id === selectedDiscId;
        const stroke = ghost ? GHOST_COLOUR : selected ? DISC_OVERLAY_SELECTED_COLOUR : DISC_OVERLAY_COLOUR;
        // Grid y counts from the front and the editor draws row 0 at the bottom — the same flip
        // every other overlay applies (see cellAt).
        const cx = (disc.centreX + 0.5) * cellPx;
        const cy = (grid.height - 1 - disc.centreY + 0.5) * cellPx;
        const outer = outerRadiusMm(disc) * mmToPx;
        const ring = ringRadiusMm(disc) * mmToPx;
        const size = slotSizeMm(disc) * mmToPx;

        return (
          <g key={disc.id}>
            {/* Purely visual — see the separate hit ring below for why this takes no clicks. */}
            <circle
              cx={cx}
              cy={cy}
              r={outer}
              fill={stroke}
              fillOpacity={0.16}
              stroke={stroke}
              strokeWidth={2}
              strokeOpacity={0.85}
              style={{ pointerEvents: "none" }}
            />
            {/*
              Hit-testing lives on a transparent RING, not on the filled circle.
              A disc's face covers most of a small grid — this one is nearly ten studs across — and
              a filled shape with `pointer-events: all` swallows every click inside it, so with the
              Edit tool no cell underneath the disc could be selected at all. The pickers then still
              showed values (they default to visible with nothing selected), which reads as "the
              cell I clicked has these properties" when in fact nothing was selected.

              A ring keeps the outline clickable — the affordance the panel points at — while the
              whole interior passes clicks straight through to the cells. It's drawn a good deal
              thicker than the visible outline so it's still easy to hit.
            */}
            {interactive && !ghost && (
              <circle
                cx={cx}
                cy={cy}
                r={outer}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onPointerDown={() => onSelectDisc(selected ? null : disc.id)}
              />
            )}
            {Array.from({ length: disc.slots }, (_, i) => {
              const deg = disc.startAngleDeg + (360 / disc.slots) * i;
              // Negated: the SVG y axis runs down while the model's runs up, so a pocket at +30°
              // in the part has to be drawn at -30° here to land on the same side.
              return (
                <rect
                  key={i}
                  x={-size / 2}
                  y={-size / 2}
                  width={size}
                  height={size}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.5}
                  transform={`translate(${cx} ${cy}) rotate(${-deg}) translate(${ring} 0)`}
                />
              );
            })}
            <circle cx={cx} cy={cy} r={Math.max(2, cellPx * 0.12)} fill={stroke} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Draws the true shape each CircleRing on a layer actually builds, over the square cells that make
 * it up — the same idea as BeamOverlay: what a cell grid can DRAW (squares) and what these cells
 * MEAN (one shared circle, optionally a ring, optionally with a square outer edge) are different
 * things, and only the second one tells you whether the circle is right.
 *
 * Drawn straight from the ring objects now, rather than reconstructed by scanning every cell for
 * the group settings it used to carry: a ring is one outline because it IS one thing, and a circle
 * trimmed down to a single corner cell still draws the full circle its arc was cut from — which is
 * exactly the case where the outline is worth having.
 *
 * The selected ring is drawn in the shared selection colour so the circle panel's controls have a
 * visible subject, the way a selected beam or disc does.
 */
/**
 * How far a ring's handle steps aside when something else's handle already owns its centre square,
 * as a fraction of a cell. Far enough that the two are separate click targets, near enough that it
 * still reads as belonging to the ring's centre.
 */
const RING_HANDLE_DODGE = 0.55;

function CircleOverlay({
  grid,
  rings,
  selectedCircleId = null,
  onSelectCircle,
  onMoveCircleRing,
  onBeginCircleDrag,
  onEndCircleDrag,
  interactive = false,
  ghost = false,
  cellPx,
}: {
  grid: GridState;
  rings: CircleRing[];
  selectedCircleId?: string | null;
  onSelectCircle?: (id: string | null) => void;
  onMoveCircleRing?: (id: string, centreX: number, centreY: number) => void;
  /** Called once when a drag starts, so the whole move is one undo entry AND every step of it is
   * measured from the same pre-drag grid — see the store's setCircleCentre. */
  onBeginCircleDrag?: () => void;
  /** Called when the drag ends, releasing that snapshot. */
  onEndCircleDrag?: () => void;
  /** Whether the centre handle takes clicks — the Edit tool only, like the other overlays. */
  interactive?: boolean;
  /** Drawn as the layer below rather than the one being edited — grey and faded. */
  ghost?: boolean;
  cellPx: number;
}) {
  /**
   * The dodge in force for the drag currently under way — frozen at pointer-down and held until it
   * ends.
   *
   * It cannot be read live. The dodge depends on whether the ring's centre square is taken, so the
   * moment a drag lands the ring ON such a square the offset appears, the same pointer position
   * then maps a cell further on, the ring moves off again, the offset vanishes... and the ring
   * oscillates either side of the one square you were trying to drop it on — which is to say, a
   * disc and a ring could no longer be given the same centre by dragging, the exact thing the
   * dodge exists to support.
   */
  const dragDodge = useRef<{ x: number; y: number } | null>(null);

  if (rings.length === 0) return null;

  // Client point -> grid square, in the overlay's own coordinates. Same conversion the editor's
  // `cellAt` and the beam overlay's `dragTo` do, including the row flip.
  /**
   * Whether something else's own handle already sits on this square — a slot disc's centre, a
   * beam's anchor. A disc turning inside a ring puts both on the same cell as a matter of course,
   * and two handles on one point means only the upper one can ever be clicked.
   */
  const squareTaken = (x: number, y: number) =>
    (grid.discs ?? []).some((d) => d.layer === grid.activeLayer && d.centreX === x && d.centreY === y) ||
    (grid.beams ?? []).some((b) => b.layer === grid.activeLayer && b.anchorX === x && b.anchorY === y);

  const dragTo = (e: React.PointerEvent<SVGElement>, id: string) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const dodge = dragDodge.current ?? { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    // The pointer is read back through the handle's own dodge, so a ring whose handle stepped aside
    // still lands where the pointer is rather than jumping by the offset on the first drag.
    const x = Math.max(0, Math.min(grid.width - 1, Math.floor((e.clientX - rect.left - dodge.x) / cellPx)));
    const row = Math.max(0, Math.min(grid.height - 1, Math.floor((e.clientY - rect.top - dodge.y) / cellPx)));
    onMoveCircleRing?.(id, x, grid.height - 1 - row);
  };

  return (
    <svg
      width={grid.width * cellPx}
      height={grid.height * cellPx}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
        opacity: ghost ? GHOST_OPACITY : 1,
        // Above `.grid-cell.selected`, which lifts itself to z-index 1 to draw its outline. A ring's
        // handle sits on a cell that is very often the selected one, and without this the selected
        // cell paints over the handle and swallows the click meant for it.
        zIndex: ghost ? undefined : 2,
      }}
    >
      {rings.map((ring) => {
        // Screen position of the ring's centre — grid y counts from the front, the editor draws
        // row 0 at the BOTTOM (see cellAt's own note), so y is flipped exactly as BeamOverlay does.
        // Measured off the origin corner plus half the footprint, which is exact for an even
        // dimension too (where there is no centre cell to name).
        const centre = ring.originX + (ring.dimension - 1) / 2;
        const centreY = ring.originY + (ring.dimension - 1) / 2;
        const px = (centre + 0.5) * cellPx;
        const py = (grid.height - 1 - centreY + 0.5) * cellPx;
        const outerR = (ring.dimension / 2) * cellPx;
        const innerR = Math.max(0, ((ring.dimension - 1) / 2) * cellPx);

        const outer = ring.outerSquare
          ? rectSubpath(px - outerR, py - outerR, px + outerR, py + outerR)
          : circleSubpath(px, py, outerR);
        // evenodd turns "outer shape plus inner circle" into a genuine annulus, so a hollow ring
        // reads as the ring/washer it actually prints as rather than a filled disc with a line on it.
        const d = ring.hollow && innerR > 0 ? `${outer} ${circleSubpath(px, py, innerR)}` : outer;
        const selected = !ghost && ring.id === selectedCircleId;

        const stroke = ghost ? GHOST_COLOUR : selected ? CIRCLE_OVERLAY_SELECTED_COLOUR : CIRCLE_OVERLAY_COLOUR;
        // Even dimensions centre on a cell CORNER, so the handle can land between four squares; the
        // one it would be clicked on is the one it is drawn over.
        const handleCell = { x: Math.round(centre), y: Math.round(centreY) };
        const dodged = !ghost && squareTaken(handleCell.x, handleCell.y);
        const dodge = dodged ? { x: -RING_HANDLE_DODGE * cellPx, y: -RING_HANDLE_DODGE * cellPx } : { x: 0, y: 0 };

        return (
          <g key={ring.id}>
            <path
              d={d}
              fillRule="evenodd"
              fill={ghost ? GHOST_COLOUR : CIRCLE_OVERLAY_COLOUR}
              fillOpacity={selected ? 0.3 : 0.22}
              stroke={stroke}
              strokeWidth={selected ? 3 : 2}
              strokeOpacity={0.85}
              style={{ pointerEvents: "none" }}
            />
            {/*
              The ring's own handle: one point that means "the circle", the way a slot disc's
              centre does. Everything about a circle now lives on the ring, so there has to be a
              way to grab the ring itself without going through a member cell — a member is a cell,
              and clicking it should still be able to mean the cell.

              Deliberately a small CENTRE dot rather than the outline hit-ring the disc uses: a
              circle's outline runs straight through its own member cells, and those cells have to
              stay clickable (erasing them is how a partial circle is made). A centre handle takes
              one square out of play instead of a whole annulus of them, and Alt-dragging it moves
              the ring — the same gesture that moves a beam anchor or a disc centre.
            */}
            {interactive && !ghost && dodged && (
              <line
                x1={px}
                y1={py}
                x2={px + dodge.x}
                y2={py + dodge.y}
                stroke={stroke}
                strokeWidth={1.5}
                strokeOpacity={0.8}
                style={{ pointerEvents: "none" }}
              />
            )}
            {interactive && !ghost && dodged && (
              <line
                x1={px}
                y1={py}
                x2={px + dodge.x}
                y2={py + dodge.y}
                stroke={stroke}
                strokeWidth={1.5}
                strokeOpacity={0.8}
                style={{ pointerEvents: "none" }}
              />
            )}
            {interactive && !ghost && (
              <circle
                cx={px + dodge.x}
                cy={py + dodge.y}
                r={Math.max(9, cellPx * 0.34)}
                fill={stroke}
                fillOpacity={selected ? 0.95 : 0.7}
                stroke={ghost ? GHOST_COLOUR : "#0b1020"}
                strokeWidth={1.5}
                style={{ pointerEvents: "all", cursor: "grab" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  // Always selects, never toggles off. The ring reads as "selected" whenever it is
                  // what the circle panel is editing — including when that came from a member CELL
                  // being selected — so a toggle would make the handle a no-op in exactly the case
                  // you reach for it: a cell is selected, and you want the ring instead.
                  onSelectCircle?.(ring.id);
                  dragDodge.current = dodge;
                  // Dragged from the handle itself rather than through the editor's Alt-drag: the
                  // handle already swallows the pointer-down (it has to, or the click would paint
                  // the cell underneath), so the drag has to live here. No Alt needed — this dot
                  // means the ring and nothing else, so there's nothing to disambiguate.
                  onBeginCircleDrag?.();
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) dragTo(e, ring.id);
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                  dragDodge.current = null;
                  onEndCircleDrag?.();
                }}
                onLostPointerCapture={() => {
                  dragDodge.current = null;
                  onEndCircleDrag?.();
                }}
              >
                <title>
                  {`${ring.dimension}x${ring.dimension} circle — click to select the ring, drag to move it` +
                    (dodged ? " (offset, so the disc or beam sharing this square stays clickable)" : "")}
                </title>
              </circle>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The beam the current drag WOULD place — drawn live between the cell the gesture started on and
 * the one the pointer is over now, with the hole count and end angle the fit works out to.
 *
 * Worth its own overlay rather than leaving the gesture invisible until pointer-up: the fit's
 * whole point is that the two cells decide the beam, and the number of holes that lands between
 * them (and how much lead-in is left over) isn't something you can work out by eye mid-drag.
 */
function BeamFitPreview({
  grid,
  from,
  to,
  holeType,
  holeAxis,
  fit,
  exact,
  cellPx,
}: {
  grid: GridState;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** The brush's own hole type — it bounds the hole count, since an end hole needs material
   * between it and the end face (see BEAM_END_HOLE_MATERIAL). */
  holeType: BeamHoleType;
  /** The brush's bore direction — with the fit on "auto" it is what picks the fit. */
  holeAxis: BeamHoleAxis;
  /** Which fit the drag will take — see BeamFitMode. */
  fit: BeamFitSetting;
  /** Shift held: the endpoint is taken literally, no snapping to a direction that closes. */
  exact: boolean;
  cellPx: number;
}) {
  // The same decisions the store makes on release — shown while dragging, or the preview promises a
  // beam the drop won't produce. Including which fit: on "auto" the bore direction picks it, exactly
  // as the store does.
  const fitMode: BeamFitMode = fit === "auto" ? (holeAxis === "z" ? "holes" : "body") : fit;
  const bothEndsSolid = fitMode !== "holes";
  const layerBeams = (grid.beams ?? []).filter(
    (b) => b.layer === grid.activeLayer && b.holeType !== "none",
  );
  // The Grid fit refuses an off-grid start — see the store's own note. Mirrored here or the preview
  // promises a beam anchored on a hole the drop will not use.
  const nearestStart = exact ? null : nearestBeamHole(layerBeams, grid.activeLayer, from.x, from.y);
  const startHole = nearestStart && (fitMode !== "holes" || isOnCellGrid(nearestStart)) ? nearestStart : null;
  const start = startHole ?? from;
  const snapped =
    bothEndsSolid || exact
      ? null
      : snapEndpointToLegal(
          start.x,
          start.y,
          to.x,
          to.y,
          1.6,
          layerBeams.flatMap((b) => beamHolePositions(b)),
        );
  const endHole =
    bothEndsSolid && !exact ? nearestBeamHole(layerBeams, grid.activeLayer, to.x, to.y) : null;
  const end = snapped ?? endHole ?? to;
  const fitted = beamFitToEndpoint(start.x, start.y, end.x, end.y, holeType, fitMode);
  if (!fitted) return null;
  const px = (studX: number, studY: number) => ({
    x: (studX + 0.5) * cellPx,
    y: (grid.height - 1 - studY + 0.5) * cellPx,
  });
  const a = px(start.x, start.y);
  const b = px(end.x, end.y);
  const dir = { x: (b.x - a.x), y: (b.y - a.y) };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const lead = (fitted.leadInStart ?? 0) / layerPitch(grid, grid.activeLayer);
  const holes = Array.from({ length: fitted.holes ?? 1 }, (_, i) => {
    const t = (lead + i) / (len / cellPx);
    return { x: a.x + dir.x * t, y: a.y + dir.y * t };
  });
  return (
    <svg
      width={grid.width * cellPx}
      height={grid.height * cellPx}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
    >
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={BEAM_OVERLAY_SELECTED_COLOUR}
        strokeWidth={cellPx * 0.7}
        strokeOpacity={0.3}
        strokeLinecap="butt"
      />
      {holes.map((h, i) => (
        <circle key={i} cx={h.x} cy={h.y} r={cellPx * 0.16} fill="none" stroke={BEAM_OVERLAY_SELECTED_COLOUR} strokeWidth={1.5} />
      ))}
      {/* Every existing hole this beam could actually pin to from where the drag started: one whose
          run from the anchor is a whole number of hole-spacings. Drag to one of these and both ends
          land on holes; drag anywhere else and the far end cannot, however carefully it is aimed.
          Solid-to-solid never needs this because its BODY stretches to meet the two cells — only a
          beam pinned to beams has to land its holes on other holes. */}
      {!bothEndsSolid &&
        layerBeams
          .flatMap((b) => beamHolePositions(b))
          .filter((h) => {
            const run = Math.hypot(h.x - start.x, h.y - start.y);
            return run > 0.5 && Math.abs(run - Math.round(run)) < 1e-6;
          })
          .map((h, i) => {
            const q = px(h.x, h.y);
            return (
              <circle
                key={`t${i}`}
                cx={q.x}
                cy={q.y}
                r={cellPx * 0.3}
                fill="none"
                stroke="#22c55e"
                strokeWidth={2}
                strokeOpacity={0.9}
              />
            );
          })}
      {snapped && (
        <line
          x1={px(to.x, to.y).x}
          y1={px(to.x, to.y).y}
          x2={b.x}
          y2={b.y}
          stroke={BEAM_OVERLAY_SELECTED_COLOUR}
          strokeWidth={1}
          strokeDasharray="3 3"
          strokeOpacity={0.8}
        />
      )}
      <text
        x={(a.x + b.x) / 2}
        y={(a.y + b.y) / 2 - cellPx * 0.6}
        fill={BEAM_OVERLAY_SELECTED_COLOUR}
        fontSize={11}
        textAnchor="middle"
      >
        {snapped
          ? `${normalizeDegrees(fitted.customDegrees ?? 0).toFixed(1)}° · ${fitted.holes} holes · snapped so both ends land on holes`
          : `${normalizeDegrees(fitted.customDegrees ?? 0).toFixed(1)}° · ${fitted.holes} holes${
              fitted.leadInStart ? ` · ${fitted.leadInStart.toFixed(1)}mm ends` : ""
            }${exact && !bothEndsSolid ? " · exact cell (Shift), far end won't land on a hole" : ""}`}
      </text>
    </svg>
  );
}

/**
 * Draws the active layer's angled beams over the 2D plan (see AngledBeam). A beam isn't made of
 * cells, so it can't be drawn AS cells — it's an overlay line from its anchor hole to its far end,
 * with a dot per hole at the beam's own true 8mm pitch, which is exactly what makes it read
 * differently from the grid underneath it.
 *
 * The far-end marker is hollow when the end doesn't land on a grid hole centre (see
 * isBeamGridLegal) — the same warning the beam panel spells out, visible at a glance while
 * laying the part out. A hole that bores IN-PLANE also carries a short tick across the beam,
 * showing the direction it bores: on a beam mixing the two (see AngledBeam.holeAxes) that's the
 * only way to see which hole is which without clicking through them one at a time.
 */
function BeamOverlay({
  grid,
  beams,
  selectedBeamId,
  onSelectBeam,
  onMoveBeamAnchor,
  onBeginBeamDrag,
  interactive,
  ghost = false,
  cellPx,
}: {
  grid: GridState;
  beams: AngledBeam[];
  selectedBeamId: string | null;
  onSelectBeam: (id: string | null) => void;
  onMoveBeamAnchor: (id: string, anchorX: number, anchorY: number) => void;
  onBeginBeamDrag: () => void;
  /** Only the Edit tool lets the overlay take clicks — while painting it has to stay transparent,
   * or a beam would shadow the squares underneath it and you couldn't paint through one. Alt-drag
   * still moves a beam in either tool; that gesture is handled by the grid itself. */
  interactive: boolean;
  /** Drawn as the layer below rather than the one being edited — grey, faded, never interactive. */
  ghost?: boolean;
  cellPx: number;
}) {
  // Storage y counts from the front; the editor draws row 0 at the BOTTOM (see cellAt's own note),
  // so a beam's +Y run has to travel UP the screen to match the 3D model.
  const px = (studX: number, studY: number) => ({
    x: (studX + 0.5) * cellPx,
    y: (grid.height - 1 - studY + 0.5) * cellPx,
  });

  const dragTo = (e: React.PointerEvent<SVGElement>, id: string) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, Math.min(grid.width - 1, Math.floor((e.clientX - rect.left) / cellPx)));
    const row = Math.max(0, Math.min(grid.height - 1, Math.floor((e.clientY - rect.top) / cellPx)));
    onMoveBeamAnchor(id, x, grid.height - 1 - row);
  };

  return (
    <svg
      width={grid.width * cellPx}
      height={grid.height * cellPx}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", opacity: ghost ? GHOST_OPACITY : 1 }}
    >
      {beams.map((beam) => {
        const selected = !ghost && beam.id === selectedBeamId;
        // The BODY's own extent, which on a fitted beam runs past the end holes to reach the cells
        // at either end (see AngledBeam.leadInStart). Drawing the hole-to-hole line instead would
        // show a beam ending short of the cell it actually fuses into.
        const dir = beamDirection(beam);
        const beamPitch = layerPitch(grid, beam.layer);
        const body = beamBodySpanStuds(beam, beamPitch);
        // The beam's own across-shift (AngledBeam.acrossOffset), so the plan shows where the beam
        // actually is rather than where its anchor cell is.
        const across = (beam.acrossOffset ?? 0) / beamPitch;
        const at = (studsAlong: number) =>
          px(
            beam.anchorX + dir.x * studsAlong - dir.y * across,
            beam.anchorY + dir.y * studsAlong + dir.x * across,
          );
        const start = at(body.from);
        const end = at(body.to);
        const legal = isBeamGridLegal(beam);
        const stroke = ghost ? GHOST_COLOUR : selected ? BEAM_OVERLAY_SELECTED_COLOUR : BEAM_OVERLAY_COLOUR;
        const holes = Array.from({ length: beam.holes }, (_, i) => at(beamHoleOffsetStuds(beam, i)));
        const suppressed = new Set(beamSuppressedHoles(beam));
        const misses = new Map(beamEndHoleMisses(beam, beams).map((m) => [m.index, m.gap]));
        return (
          <g key={beam.id}>
            {/* The beam's real plan outline — body and caps — rather than a stroked line of
                nominal width. A beam's end can stand proud of the beam it joins (an in-plane cap
                is square in plan where a plan cap is a disc), and a fat line hides exactly that. */}
            <polygon
              points={beamPlanOutline(
                beam,
                1,
                beamEndsMeetingBeams(beam, beams),
              )
                .map((p) => {
                  const q = px(p.x, p.y);
                  return `${q.x},${q.y}`;
                })
                .join(" ")}
              fill={stroke}
              fillOpacity={0.28}
              stroke={stroke}
              strokeOpacity={0.55}
              strokeWidth={1}
              style={{ pointerEvents: "none" }}
            >
              <title>{describeBeam(beam)}</title>
            </polygon>
            {/* Same reasoning as the disc's hit ring: the visible beam is drawn a full stud wide,
                and hit-testing on that would block the cells it passes over from ever being
                clicked. The hit line is deliberately narrower than the beam looks, so a click on
                its centreline picks the beam and a click near its edge still reaches the cell. */}
            {interactive && !ghost && (
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="transparent"
                strokeWidth={cellPx * 0.3}
                strokeLinecap="round"
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onPointerDown={() => onSelectBeam(selected ? null : beam.id)}
              />
            )}
            {holes.map((h, i) => {
              const inPlane = beam.holeType !== "none" && beamHoleAxisAt(beam, i) !== "z";
              // A hole with no room left to the end face isn't bored at all (see
              // beamSuppressedHoles) — drawn dashed so the plan matches what will actually print
              // rather than promising a hole the part doesn't have.
              const solid = suppressed.has(i);
              const miss = misses.get(i);
              // The bore's own direction in screen space: square to the beam's run, and the run's
              // own screen vector is (end - start), so this is just that turned 90°.
              const runLen = Math.hypot(end.x - start.x, end.y - start.y) || 1;
              const px2 = (-(end.y - start.y) / runLen) * cellPx * 0.34;
              const py2 = ((end.x - start.x) / runLen) * cellPx * 0.34;
              return (
                <g key={i}>
                  {inPlane && (
                    <line
                      x1={h.x - px2}
                      y1={h.y - py2}
                      x2={h.x + px2}
                      y2={h.y + py2}
                      stroke={stroke}
                      strokeWidth={2}
                    />
                  )}
                  <circle
                    cx={h.x}
                    cy={h.y}
                    r={cellPx * (miss !== undefined ? 0.22 : 0.16)}
                    fill={solid || inPlane || (i === beam.holes - 1 && !legal) ? "none" : miss !== undefined ? BEAM_HOLE_MISS_COLOUR : stroke}
                    stroke={miss !== undefined ? BEAM_HOLE_MISS_COLOUR : stroke}
                    strokeWidth={miss !== undefined ? 2.5 : 1.5}
                    strokeDasharray={solid ? "2 2" : undefined}
                  >
                    {solid && <title>Left solid — no room between this hole and the beam&apos;s end face</title>}
                    {miss !== undefined && (
                      <title>{`Won't pin: the nearest hole of another beam is ${(miss * beamPitch).toFixed(2)}mm away, not through this one. A corner only closes when the run between the two holes is a whole number of studs.`}</title>
                    )}
                  </circle>
                </g>
              );
            })}
            <circle
              cx={at(0).x}
              cy={at(0).y}
              r={cellPx * 0.3}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              style={{ pointerEvents: interactive && !ghost ? "all" : "none", cursor: "grab" }}
              onPointerDown={(e) => {
                if (!interactive || ghost) return;
                e.stopPropagation();
                onSelectBeam(beam.id);
                onBeginBeamDrag();
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) dragTo(e, beam.id);
              }}
            >
              <title>Anchor — drag to move this beam</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

/** All layers at once, top-down, so the whole Z stack is visible while editing just one of them
 * below — otherwise the only way to see another layer's contents is to switch to it and lose
 * sight of the one you were just looking at. */
function LayerStrip({
  grid,
  onSelectLayer,
  onAddLayer,
  onDuplicateLayer,
  onRemoveLayer,
  onMoveLayerUp,
  onMoveLayerDown,
  onSetLayerSpacing,
  hiddenLayers,
  onToggleLayerVisibility,
}: {
  grid: GridState;
  onSelectLayer: (index: number) => void;
  onAddLayer: () => void;
  onDuplicateLayer: (index: number) => void;
  onRemoveLayer: (index: number) => void;
  onMoveLayerUp: (index: number) => void;
  onMoveLayerDown: (index: number) => void;
  onSetLayerSpacing: (index: number, patch: { pitch?: number; connectorPitch?: number }) => void;
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
              spacing={layerSpacingOf(grid, layerIndex)}
              hidden={hiddenLayers.has(layerIndex)}
              onClick={() => onSelectLayer(layerIndex)}
              onRemove={() => onRemoveLayer(layerIndex)}
              onDuplicate={() => onDuplicateLayer(layerIndex)}
              onMoveUp={() => onMoveLayerUp(layerIndex)}
              onMoveDown={() => onMoveLayerDown(layerIndex)}
              onToggleVisibility={() => onToggleLayerVisibility(layerIndex)}
            />
          );
        })}
      </div>
      <LayerSpacingField grid={grid} onSetLayerSpacing={onSetLayerSpacing} />
    </div>
  );
}

/**
 * The active layer's stud pitch, and which system's pins it takes.
 *
 * Two separate pickers rather than one, because they are genuinely independent settings and the
 * useful adapter is the case where they disagree — a beam whose holes sit on a 10mm grid so it
 * bolts to a 10mm frame, while still taking the 8mm pins you already own. Collapsing them
 * into a single "system" switch would make exactly that part unbuildable.
 *
 * Per-LAYER rather than per-project for the same reason: the other adapter is a part whose lower
 * half plugs into one system and whose upper half plugs into the other, and layers stay concentric
 * (every coordinate is measured out from the grid's centre), so the two halves line up on their
 * shared centreline whatever their pitches are.
 */
function LayerSpacingField({
  grid,
  onSetLayerSpacing,
}: {
  grid: GridState;
  onSetLayerSpacing: (index: number, patch: { pitch?: number; connectorPitch?: number }) => void;
}) {
  const active = grid.activeLayer;
  const { pitch, connectorPitch } = layerSpacingOf(grid, active);
  const mismatched = connectorPitch !== pitch;
  return (
    <div className="layer-spacing">
      <label className="field">
        <span>Layer spacing</span>
        <select
          value={pitch}
          onChange={(e) => onSetLayerSpacing(active, { pitch: Number(e.target.value) })}
          title="Cell-to-cell spacing on this layer. Layers of different spacing stay concentric — they share the grid's centre — so one part can bridge both systems."
        >
          {SUPPORTED_STUD_PITCHES.map((p) => (
            <option key={p} value={p}>
              {p}mm
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Pins &amp; holes</span>
        <select
          value={connectorPitch}
          onChange={(e) => onSetLayerSpacing(active, { connectorPitch: Number(e.target.value) })}
          title="Which system's pins this layer's holes and connectors are sized for. Normally matches the spacing; set it to 8mm on a 10mm layer to build a part that mounts on a 10mm grid but takes 8mm pins."
        >
          {SUPPORTED_STUD_PITCHES.map((p) => (
            <option key={p} value={p}>
              {p}mm
            </option>
          ))}
        </select>
      </label>
      <p className="muted sm" style={{ margin: 0, flexBasis: "100%" }}>
        {mismatched
          ? `Adapter layer: holes on the ${pitch}mm grid, sized for ${connectorPitch}mm pins.`
          : `Cells, heights and connectors all on the ${pitch}mm module.`}
      </p>
    </div>
  );
}


/**
 * A 3x3 pad picking which way the grid grows. The dot marks where the existing build ends up, so
 * the centre keeps it centred and new studs are shared between both sides, while a corner pins it
 * there and adds everything to the opposite edges.
 *
 * Y is drawn with "end" (the grid's high row) at the TOP to match the plan below, which also draws
 * row 0 at the bottom — a pad whose up arrow moved the build DOWN would be worse than no pad.
 */

/**
 * A grid-size box that only resizes once you've finished typing.
 *
 * Resizing straight from onChange looks fine until you select "10" and type "14": the field sees
 * "1" first, so the grid is resized to 1x1 and everything outside it is discarded before the "4"
 * ever arrives. The draft is therefore local, and only a blur or Enter commits it — Escape puts the
 * real value back. Spinner arrows still commit immediately, since each click is already a complete
 * value.
 */
function SizeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    setDraft(null);
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n === value) return;
    onCommit(Math.min(40, Math.max(1, n)));
  };
  return (
    <label className="field" style={{ flex: 1 }}>
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={40}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit((e.target as HTMLInputElement).value);
          } else if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

function ResizeAnchorPad({
  anchor,
  onChange,
}: {
  anchor: ResizeAnchor;
  onChange: (a: ResizeAnchor) => void;
}) {
  const xs: ResizeAnchor["x"][] = ["start", "centre", "end"];
  const ys: ResizeAnchor["y"][] = ["end", "centre", "start"];
  const label = (x: ResizeAnchor["x"], y: ResizeAnchor["y"]) => {
    const h = x === "start" ? "left" : x === "end" ? "right" : "centred horizontally";
    const v = y === "start" ? "bottom" : y === "end" ? "top" : "centred vertically";
    return `Keep the build ${h === "centred horizontally" && v === "centred vertically" ? "centred" : `${h}, ${v}`}; new studs go on the other side.`;
  };
  return (
    <div className="field" style={{ flex: "0 0 auto" }}>
      <span>Grow from</span>
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 18px)", gap: 2 }}
        role="group"
        aria-label="Resize anchor"
      >
        {ys.map((y) =>
          xs.map((x) => {
            const active = anchor.x === x && anchor.y === y;
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                title={label(x, y)}
                aria-pressed={active}
                onClick={() => onChange({ x, y })}
                style={{
                  width: 18,
                  height: 18,
                  padding: 0,
                  borderRadius: 3,
                  cursor: "pointer",
                  border: "1px solid var(--border, #3a4250)",
                  background: active ? "var(--accent, #4ea8ff)" : "var(--bg-secondary, #222831)",
                }}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}

export default function GridEditor({
  grid,
  brush,
  beamHoleType,
  beamHoleAxis,
  beamFit,
  tool,
  onPaintRect,
  onSelectLayer,
  selectedCell,
  onSelectCell,
  onAddLayer,
  onDuplicateLayer,
  onRemoveLayer,
  onMoveLayerUp,
  onMoveLayerDown,
  onSetLayerSpacing,
  onResize,
  hiddenLayers,
  onToggleLayerVisibility,
  selectedBeamId,
  onSelectBeam,
  selectedDiscId,
  onSelectDisc,
  selectedCircle,
  onSelectCircle,
  onBeginCircleDrag,
  onEndCircleDrag,
  onBeginCellDrag,
  onEndCellDrag,
  onMoveCircleRing,
  onMoveBeamAnchor,
  onBeginBeamDrag,
  onMoveCell,
  onMoveDiscCentre,
}: Props) {
  const layer = getActiveLayer(grid);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const isRectMode = useRef(false);
  /**
   * An in-progress Alt-drag move — "pick up what's on this square and put it somewhere else",
   * available in BOTH tools, since a move is neither painting nor editing properties and shouldn't
   * need a tool switch. A beam anchored on the pressed square wins over the cell underneath it,
   * matching how a click selects (see the store's `selectCell`).
   *
   * `from` tracks the CURRENT position, not where the gesture started: each step moves one square
   * further, so the moved thing follows the cursor instead of teleporting back and forth from a
   * fixed origin.
   */
  const moveDrag = useRef<
    // `from` is the drag's ORIGINAL source and never moves; `to` is where the cell currently sits,
    // so a step can be skipped when the pointer hasn't changed square — including back at `from`,
    // which puts the cell home and restores everything the drag crossed.
    | { kind: "cell"; from: { x: number; y: number }; to: { x: number; y: number } }
    | { kind: "beam"; id: string }
    | { kind: "disc"; id: string }
    | { kind: "circle"; id: string }
    | null
  >(null);

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

  /** What an Alt-drag starting on this square would pick up, or null if there's nothing to move. */
  const movableAt = useCallback(
    (x: number, y: number) => {
      const disc = (grid.discs ?? []).find((d) => d.layer === grid.activeLayer && d.centreX === x && d.centreY === y);
      if (disc) return { kind: "disc" as const, id: disc.id };
      const beam = (grid.beams ?? []).find((b) => b.layer === grid.activeLayer && b.anchorX === x && b.anchorY === y);
      if (beam) return { kind: "beam" as const, id: beam.id };
      // A ring is picked up by its centre cell — the square its handle sits on (or, for an even
      // dimension whose true centre is a cell CORNER, the square the handle sits at the corner
      // of). Checked before the cell case so Alt-dragging the middle of a circle moves the whole
      // circle rather than plucking one member out of it.
      const ring = (grid.circles ?? []).find((c) => {
        if (c.layer !== grid.activeLayer) return false;
        const centre = centreForOrigin(c);
        return centre.centreX === x && centre.centreY === y;
      });
      if (ring) return { kind: "circle" as const, id: ring.id };
      if (!inBounds(grid, x, y)) return null;
      const cell = layer[indexOf(grid, x, y)];
      if (!cell || cell.type === CellType.Empty) return null;
      return { kind: "cell" as const, from: { x, y }, to: { x, y } };
    },
    [grid, layer],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = cellAt(e.clientX, e.clientY, e.currentTarget);

    if (e.altKey) {
      const target = movableAt(x, y);
      if (target) {
        e.preventDefault();
        moveDrag.current = target;
        if (target.kind === "beam") {
          onBeginBeamDrag();
          onSelectBeam(target.id);
        } else if (target.kind === "disc") {
          onBeginBeamDrag();
          onSelectDisc(target.id);
        } else if (target.kind === "circle") {
          onSelectCircle(target.id);
          // The editor's own Alt-drag can pick a ring up too (by its centre square), and it needs
          // the same pre-drag snapshot the handle's drag takes — without it this route still
          // bulldozes whatever it is dragged across.
          onBeginCircleDrag();
        } else {
          // A cell drag needs its own snapshot for the same reason — see the store's moveCell.
          onBeginCellDrag();
        }
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }

    // Shift is the rectangle modifier for a cell brush; a beam has no rectangle, so it is free to
    // mean "take my endpoint literally" there instead — the way out when a beam has to reach a cell
    // the legal-direction snap would otherwise walk it away from.
    const beamBrush = tool === "paint" && brush === CellType.AngledBeam;
    isRectMode.current = e.shiftKey && !beamBrush;
    setExactEndpoint(e.shiftKey && beamBrush);
    setDragStart({ x, y });
    setDragCurrent({ x, y });
    if (tool === "edit") {
      if (!e.shiftKey) onSelectCell(x, y);
    } else if (!e.shiftKey) {
      // The beam brush is the one brush whose gesture has an END as well as a start: a drag runs
      // the beam from the cell it started on to the cell it finished on (see the store's paintRect
      // and beamFitToEndpoint). It can't paint on pointer-down like every other brush, because at
      // that moment the second cell isn't known yet — it places on pointer-UP instead, which for a
      // click that never moves is the same single-cell beam it always placed.
      if (brush !== CellType.AngledBeam) onPaintRect(x, y, x, y);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const move = moveDrag.current;
    if (move) {
      const { x, y } = cellAt(e.clientX, e.clientY, e.currentTarget);
      if (!inBounds(grid, x, y)) return;
      if (move.kind === "beam") {
        onMoveBeamAnchor(move.id, x, y);
      } else if (move.kind === "disc") {
        onMoveDiscCentre(move.id, x, y);
      } else if (move.kind === "circle") {
        onMoveCircleRing(move.id, x, y);
      } else if (move.to.x !== x || move.to.y !== y) {
        // Always from the drag's ORIGINAL square: the store replays the move against the pre-drag
        // grid, so what the cell was pulled across comes back behind it.
        onMoveCell(move.from.x, move.from.y, x, y, false);
        move.to = { x, y };
      }
      return;
    }
    if (!dragStart) return;
    const { x, y } = cellAt(e.clientX, e.clientY, e.currentTarget);
    setDragCurrent({ x, y });
    // Read live, so the snap can be let go of or taken back mid-drag rather than only at the start.
    if (tool === "paint" && brush === CellType.AngledBeam) setExactEndpoint(e.shiftKey);
    if (!isRectMode.current) {
      if (tool === "edit") onSelectCell(x, y);
      // A drag paints continuously, one cell at a time — which is right for a cell brush and wrong
      // for an angled beam, where every step of the drag would place ANOTHER whole beam. The beam
      // brush places exactly one beam per gesture, from where the gesture started (see the store's
      // own paintRect); a drag adds nothing to that.
      else if (brush !== CellType.AngledBeam) onPaintRect(x, y, x, y);
    }
  };

  const handlePointerUp = () => {
    if (moveDrag.current) {
      if (moveDrag.current.kind === "circle") onEndCircleDrag();
      else if (moveDrag.current.kind === "cell") onEndCellDrag();
      moveDrag.current = null;
      return;
    }
    if (dragStart && dragCurrent && (isRectMode.current || (tool === "paint" && brush === CellType.AngledBeam))) {
      onPaintRect(dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y, undefined, exactEndpoint);
    }
    setExactEndpoint(false);
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

  // Where the existing build sits when the grid grows or shrinks. Kept in the editor rather than
  // the project: it steers the NEXT resize, it isn't part of the design.
  const [resizeAnchor, setResizeAnchor] = useState<ResizeAnchor>({ x: "start", y: "start" });
  /** Shift held during a beam drag — see handlePointerDown. */
  const [exactEndpoint, setExactEndpoint] = useState(false);

  const prevLayer = grid.activeLayer > 0 ? grid.layers[grid.activeLayer - 1] : null;
  const prevIndex = grid.activeLayer - 1;
  const prevBeams = (grid.beams ?? []).filter((b) => b.layer === prevIndex);
  const prevDiscs = (grid.discs ?? []).filter((d) => d.layer === prevIndex);
  const prevCircles = (grid.circles ?? []).filter((c) => c.layer === prevIndex);
  const ringsById = new Map((grid.circles ?? []).map((c) => [c.id, c]));

  return (
    <div className="grid-editor-wrap">
      <div className="row gap" style={{ marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <SizeField
          label="X (studs)"
          value={grid.width}
          onCommit={(n) => onResize(n, grid.height, resizeAnchor)}
        />
        <SizeField
          label="Y (studs)"
          value={grid.height}
          onCommit={(n) => onResize(grid.width, n, resizeAnchor)}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
            Z (layers)
          </label>
          <div style={{ fontSize: '0.875rem', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {grid.layers.length}
          </div>
        </div>
        <ResizeAnchorPad anchor={resizeAnchor} onChange={setResizeAnchor} />
      </div>
      <LayerStrip
        grid={grid}
        onSelectLayer={onSelectLayer}
        onAddLayer={onAddLayer}
        onDuplicateLayer={onDuplicateLayer}
        onRemoveLayer={onRemoveLayer}
        onMoveLayerUp={onMoveLayerUp}
        onMoveLayerDown={onMoveLayerDown}
        onSetLayerSpacing={onSetLayerSpacing}
        hiddenLayers={hiddenLayers}
        onToggleLayerVisibility={onToggleLayerVisibility}
      />
      <p className="muted sm">
        Editing layer {grid.activeLayer + 1} of {grid.layers.length}.{" "}
        {tool === "edit"
          ? "Click or drag to inspect an existing cell's settings (loaded into the pickers on the left). Hold Shift and click/drag to apply the pickers to existing cells — their type is left unchanged."
          : brush === CellType.AngledBeam
            ? "Click a cell to anchor an angled beam's first hole there, or drag from one cell to another to fit a beam between them — its angle, holes and bore direction come from the pickers on the left. A drag onto anything but solid at both ends is snapped to a direction whose ends land on holes; hold Shift while dragging to reach the exact cell instead."
            : `Click/drag to paint with the current brush (${CELL_TYPE_INFO[brush].label}). Hold Shift and drag for a rectangle fill.`}{" "}
        Hold Alt and drag to move whatever's on a square — a cell, or a beam anchored there.
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
            // A ring's members are all the same cell, and stamping the same three glyphs across
            // 36 squares says nothing except "this is a circle" — which the outline already says,
            // better. So a member shows its glyphs only where it actually DIFFERS from its ring's
            // own defaults, which turns the lettering from noise into a signal: the one cell you
            // narrowed or re-plated is the one with writing on it.
            const ring = cell.circleId ? ringsById.get(cell.circleId) : undefined;
            const differsFromRing =
              !!ring &&
              (cell.plateFraction !== ring.plateFraction ||
                cell.rounded !== ring.rounded ||
                cell.widthFraction !== undefined ||
                !!cell.chamferMm);
            const showGlyphs = !ring || differsFromRing;
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
                title={cellTooltip(cell, info.label, layerPitch(grid, grid.activeLayer))}
              >
                {cell.type !== CellType.Empty && showGlyphs && (
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
        {/* The layer below, drawn first so it sits behind the active one — the overlay counterpart
            of the grey `grid-cell-background` cells inside the grid itself. */}
        {prevCircles.length > 0 && <CircleOverlay grid={grid} rings={prevCircles} ghost cellPx={CELL_PX} />}
        {prevBeams.length > 0 && (
          <BeamOverlay
            grid={grid}
            beams={prevBeams}
            selectedBeamId={null}
            onSelectBeam={() => {}}
            onMoveBeamAnchor={() => {}}
            onBeginBeamDrag={() => {}}
            interactive={false}
            ghost
            cellPx={CELL_PX}
          />
        )}
        {prevDiscs.length > 0 && (
          <DiscOverlay
            grid={grid}
            discs={prevDiscs}
            selectedDiscId={null}
            onSelectDisc={() => {}}
            interactive={false}
            ghost
            cellPx={CELL_PX}
          />
        )}
        <CircleOverlay
          grid={grid}
          rings={(grid.circles ?? []).filter((c) => c.layer === grid.activeLayer)}
          selectedCircleId={selectedCircle?.id ?? null}
          onSelectCircle={onSelectCircle}
          onMoveCircleRing={onMoveCircleRing}
          onBeginCircleDrag={onBeginCircleDrag}
          onEndCircleDrag={onEndCircleDrag}
          interactive={tool === "edit"}
          cellPx={CELL_PX}
        />
        <DiscOverlay
          grid={grid}
          discs={(grid.discs ?? []).filter((d) => d.layer === grid.activeLayer)}
          selectedDiscId={selectedDiscId}
          onSelectDisc={onSelectDisc}
          interactive={tool === "edit"}
          cellPx={CELL_PX}
        />
        {tool === "paint" && brush === CellType.AngledBeam && dragStart && dragCurrent && (
          <BeamFitPreview
            grid={grid}
            from={dragStart}
            to={dragCurrent}
            holeType={beamHoleType}
            holeAxis={beamHoleAxis}
            fit={beamFit}
            exact={exactEndpoint}
            cellPx={CELL_PX}
          />
        )}
        <BeamOverlay
          grid={grid}
          beams={(grid.beams ?? []).filter((b) => b.layer === grid.activeLayer)}
          selectedBeamId={selectedBeamId}
          onSelectBeam={onSelectBeam}
          onMoveBeamAnchor={onMoveBeamAnchor}
          onBeginBeamDrag={onBeginBeamDrag}
          interactive={tool === "edit"}
          cellPx={CELL_PX}
        />
      </div>
    </div>
  );
}
