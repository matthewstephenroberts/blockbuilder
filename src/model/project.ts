import { CircleRing, normalizeCircleRing } from "./circleRing";
import { CellType } from "./cellTypes";
import { Cell, GridState, Layer } from "./grid";
import { normalizeSlotDisc } from "./slotDisc";

const PROJECT_FILE_VERSION = 1;

interface ProjectFile {
  version: number;
  grid: GridState;
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
  return migrateCircles({
    ...file.grid,
    partClearance: file.grid.partClearance ?? 0,
    holeClearance: file.grid.holeClearance ?? 0,
    sidewaysHoleClearance: file.grid.sidewaysHoleClearance ?? 0,
    // Angled beams postdate the original file format too — a project saved before them simply has
    // none, rather than an undefined list every reader would have to guard.
    beams: file.grid.beams ?? [],
    // Normalised, not just defaulted to a list: a disc saved before a later field existed is
    // missing it outright, and an absent number reaches the UI as `undefined`, which turns its
    // input into an uncontrolled one that stops accepting edits.
    discs: (file.grid.discs ?? []).map(normalizeSlotDisc),
    circles: (file.grid.circles ?? []).map(normalizeCircleRing),
  });
}
