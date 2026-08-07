import { GridState } from "./grid";

const PROJECT_FILE_VERSION = 1;

interface ProjectFile {
  version: number;
  grid: GridState;
}

export function serializeProject(grid: GridState): string {
  const file: ProjectFile = { version: PROJECT_FILE_VERSION, grid };
  return JSON.stringify(file, null, 2);
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
  return {
    ...file.grid,
    partClearance: file.grid.partClearance ?? 0,
    holeClearance: file.grid.holeClearance ?? 0,
    sidewaysHoleClearance: file.grid.sidewaysHoleClearance ?? 0,
  };
}
