import { CircleRing, normalizeCircleRing } from "./circleRing";
import { CellType } from "./cellTypes";
import { Cell, GridState, Layer } from "./grid";
import { normalizeStudPitch } from "./units";
import { normalizeSlotDisc } from "./slotDisc";

const PROJECT_FILE_VERSION = 1;

interface ProjectFile {
  version: number;
  grid: GridState;
}

/** The whole-part rounding a file written before per-cell rounding replaced it may still carry. */
interface LegacyRoundedGrid extends GridState {
  rounding?: { corners?: boolean };
}

/**
 * Carries a legacy "Round corners" project over to per-cell rounding.
 *
 * The old setting cut a fixed 4mm fillet down the four vertical corners of the GRID's bounding
 * rectangle. Marking the four corner CELLS rounded reproduces it exactly on the case it was built
 * for — a plate filling its grid — because a cell's own cap radius is half a cell, which is the
 * same 4mm, and a corner cell's only genuinely exterior corner is the one the old cut aimed at.
 *
 * Where the two differ, the per-cell result is the correct one and the old one was the bug: the
 * old cut was keyed to the grid rather than the part, so it did nothing at all to a part smaller
 * than its grid and rounded thin air at an L-shaped part's missing corner. So this migrates by
 * INTENT — "the corners of this part were meant to be soft" — rather than trying to reproduce a
 * cut that was misplaced to begin with. A corner cell that was never painted stays empty; there is
 * nothing there to round.
 *
 * Cells that already say `rounded` are left alone, and the flag is only ever added, never removed.
 */
function migrateWholePartRounding(grid: GridState): GridState {
  const { rounding, ...rest } = grid as LegacyRoundedGrid;
  const stripped = rest as GridState;
  if (!rounding?.corners) return stripped;

  const corners: [number, number][] = [
    [0, 0],
    [grid.width - 1, 0],
    [0, grid.height - 1],
    [grid.width - 1, grid.height - 1],
  ];
  const layers = stripped.layers.map((layer) => {
    let next: Layer | null = null;
    for (const [x, y] of corners) {
      const i = y * grid.width + x;
      const cell = layer[i];
      if (!cell || cell.type === CellType.Empty || cell.rounded) continue;
      next = next ?? layer.slice();
      next[i] = { ...cell, rounded: true };
    }
    return next ?? layer;
  });
  return { ...stripped, layers };
}

/** The per-cell circle fields files written before CircleRing carry (see migrateCircles). */
interface LegacyCircleCell extends Cell {
  circleDimension?: number;
  circleCol?: number;
  circleRow?: number;
  circleHollow?: boolean;
  circleOuterSquare?: boolean;
}

export function serializeProject(grid: GridState): string {
  const file: ProjectFile = { version: PROJECT_FILE_VERSION, grid };
  return JSON.stringify(file, null, 2);
}

/**
 * Rebuilds CircleRing objects from a file that stored the circle on every member cell.
 *
 * Every cell of a group carried the same dimension/hollow/outerSquare plus its OWN col/row, so a
 * group's identity is recoverable exactly: subtract a cell's offset within the group from its grid
 * position and you get the group's centre, which every member agrees on. Cells that agree on
 * (centre, dimension) are one ring — and cells that were never painted are simply absent, which is
 * how a partial circle written by the old format survives: the ring covers the full footprint, and
 * only the cells that were there stay members.
 *
 * The two flags are taken from the first member seen. They were always meant to be group-wide (the
 * old code fanned an edit out across every cell to keep them in step); if a hand-edited file
 * disagrees, one answer has to win, and picking one beats inventing a ring per variant.
 */
function migrateCircles(grid: GridState): GridState {
  if (grid.circles && grid.circles.length > 0) return grid;

  const circles: CircleRing[] = [];
  let seq = 0;
  const layers: Layer[] = grid.layers.map((layer, layerIndex) => {
    const groups = new Map<string, CircleRing>();
    const next = layer.map((raw, i) => {
      const cell = raw as LegacyCircleCell;
      if (cell.type !== CellType.CircleSolid) return raw;
      if (cell.circleId) return raw;
      if (cell.circleDimension === undefined) return raw;

      const x = i % grid.width;
      const y = Math.floor(i / grid.width);
      const dimension = Math.max(2, Math.round(cell.circleDimension));
      const centerIndex = (dimension - 1) / 2;
      // The group's centre, in the same asymmetric col/row convention the old cells used: `row`
      // counted down the group while grid y counts up.
      const centreX = x - ((cell.circleCol ?? 0) - centerIndex);
      const centreY = y - (centerIndex - (cell.circleRow ?? 0));
      const key = `${centreX}:${centreY}:${dimension}`;

      let ring = groups.get(key);
      if (!ring) {
        seq += 1;
        ring = normalizeCircleRing({
          id: `circle-legacy-${layerIndex}-${seq}`,
          layer: layerIndex,
          // centreX/centreY are half-integers for an even dimension (the group has no centre
          // cell), so the origin is derived by subtracting the same centreIndex rather than
          // going through originForCentre's click-anchored rounding.
          originX: Math.round(centreX - centerIndex),
          originY: Math.round(centreY - centerIndex),
          dimension,
          hollow: cell.circleHollow ?? false,
          outerSquare: cell.circleOuterSquare ?? false,
          plateFraction: cell.plateFraction,
          rounded: cell.rounded,
        });
        groups.set(key, ring);
        circles.push(ring);
      }

      const {
        circleDimension: _d,
        circleCol: _c,
        circleRow: _r,
        circleHollow: _h,
        circleOuterSquare: _o,
        ...rest
      } = cell;
      return { ...rest, circleId: ring.id } as Cell;
    });
    return next;
  });

  if (circles.length === 0) return { ...grid, circles: grid.circles ?? [] };
  return { ...grid, layers, circles };
}

export function deserializeProject(json: string): GridState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const file = parsed as Partial<ProjectFile>;
  if (!file || typeof file !== "object" || !file.grid || !Array.isArray(file.grid.layers)) {
    throw new Error("That file doesn't look like a BlockBuilder project.");
  }
  // Older saved files predate partClearance/holeClearance — default both to 0 (no change from
  // their original behaviour) rather than leaving them undefined against a type that says they're
  // always a number.
  return migrateWholePartRounding(
    migrateCircles({
    ...file.grid,
    partClearance: file.grid.partClearance ?? 0,
    holeClearance: file.grid.holeClearance ?? 0,
    sidewaysHoleClearance: file.grid.sidewaysHoleClearance ?? 0,
    // Per-layer spacing postdates the format too. A file without it was drawn entirely on the 8mm
    // lattice with 8mm connectors, so filling the array out to full length at the default
    // reproduces it exactly — and materialising it here (rather than leaving it short or absent)
    // means the rest of the app never has to reason about an array that doesn't line up with
    // `layers`.
    layerSpacing: file.grid.layers.map((_, i) => {
      const raw = file.grid!.layerSpacing?.[i];
      const pitch = normalizeStudPitch(raw?.pitch);
      return raw?.connectorPitch === undefined || normalizeStudPitch(raw.connectorPitch) === pitch
        ? { pitch }
        : { pitch, connectorPitch: normalizeStudPitch(raw.connectorPitch) };
    }),
    // Angled beams postdate the original file format too — a project saved before them simply has
    // none, rather than an undefined list every reader would have to guard.
    beams: file.grid.beams ?? [],
    // Normalised, not just defaulted to a list: a disc saved before a later field existed is
    // missing it outright, and an absent number reaches the UI as `undefined`, which turns its
    // input into an uncontrolled one that stops accepting edits.
    discs: (file.grid.discs ?? []).map(normalizeSlotDisc),
    circles: (file.grid.circles ?? []).map(normalizeCircleRing),
    }),
  );
}
