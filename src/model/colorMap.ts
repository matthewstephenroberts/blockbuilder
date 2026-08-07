import { CellType, CELL_TYPE_INFO } from "./cellTypes";

// Map CSS color variables and color names to actual hex values
const COLOR_HEX_MAP: Record<string, string> = {
  "var(--lego-red)": "#d5192a",
  "var(--lego-yellow)": "#ffd500",
  "var(--lego-blue)": "#0059ab",
  "var(--lego-azure)": "#06a2d6",
  "var(--lego-green)": "#00a651",
  "var(--lego-orange)": "#ff8200",
  "var(--lego-teal)": "#00aad4",
  "transparent": "#808080", // fallback gray for transparent
};

// Get hex color for a cell type, with fallback to gray
export function getCellTypeHexColor(type: CellType): string {
  const info = CELL_TYPE_INFO[type];
  const color = info.colour;

  // If it's already a hex color, return it
  if (color.startsWith("#")) {
    return color;
  }

  // Check if it's a CSS variable or special value
  if (color in COLOR_HEX_MAP) {
    return COLOR_HEX_MAP[color];
  }

  // Fallback to a neutral gray if we can't parse it
  return "#808080";
}

// Get a unique, readable hex color for each brush in the editor
// This ensures each cell type is visually distinct in the grid
export function getEditorDisplayColor(type: CellType): string {
  // Use the hex color for rendering in the editor
  return getCellTypeHexColor(type);
}
