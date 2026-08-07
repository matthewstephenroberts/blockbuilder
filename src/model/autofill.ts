import { CellType, PlateFraction } from "./cellTypes";
import { indexOf, Layer } from "./grid";

/** Border cell types worth offering — Solid disables the border ring entirely. */
export type AutoFillBorderType =
  | CellType.TechnicHole
  | CellType.StudHole
  | CellType.AxleHole
  | CellType.BallJoint
  | CellType.Solid;

export interface AutoFillOptions {
  width: number;
  height: number;
  /** How many rings of border cells to place around the perimeter. */
  borderThickness: number;
  /** Cell type for the border rings. */
  borderType: AutoFillBorderType;
  /** Plate height for the interior's Solid cells — same universal picker every cell type gets. */
  interiorPlateFraction?: PlateFraction;
  /** Plate height for the border rings' connector cells. */
  borderPlateFraction?: PlateFraction;
  /** Pattern for border holes: "edge" orients to nearest edge, "alternating" alternates X/Y with Z holes. */
  borderPattern?: "edge" | "alternating";
  /** Whether to round interior cell edges. */
  interiorRounded?: boolean;
  /** Whether to round border cell edges. */
  borderRounded?: boolean;
}

/**
 * The core "quickly build a large tile" generator: fills the interior solid (at whatever plate
 * height was chosen — full height for strength/speed, or a thinner one to save material) and
 * rings the perimeter with the requested connector cell type (so the tile still connects to other
 * Technic parts on every edge), matching how large Technic plates are conventionally built by
 * hand. Generates a single layer — applied to whichever layer is currently active.
 */
export function generateAutoFillLayer(opts: AutoFillOptions): Layer {
  const { width, height, borderThickness, borderType, interiorPlateFraction, borderPlateFraction, borderPattern = "edge", interiorRounded = false, borderRounded = false } = opts;
  const border = Math.max(0, Math.min(borderThickness, Math.ceil(Math.min(width, height) / 2)));
  const layer: Layer = Array.from({ length: width * height }, () => ({ type: CellType.Empty }));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distX = Math.min(x, width - 1 - x);
      const distY = Math.min(y, height - 1 - y);
      const distFromEdge = Math.min(distX, distY);
      const isBorder = distFromEdge < border && borderType !== CellType.Solid;
      if (!isBorder) {
        layer[indexOf({ width }, x, y)] = { type: CellType.Solid, plateFraction: interiorPlateFraction, rounded: interiorRounded };
        continue;
      }

      let axis: "x" | "y" | "z" = "x";
      if (borderPattern === "alternating") {
        // Alternate between X/Y holes and Z holes in a checkerboard pattern
        const isCheckerboard = (x + y) % 2 === 0;
        axis = isCheckerboard ? "z" : (distX <= distY ? "x" : "y");
      } else {
        // Orient each border hole so it bores out through the nearer edge (left/right beam ->
        // axis along x, top/bottom beam -> axis along y), matching how a real Technic beam's
        // holes run parallel to its own long edge.
        axis = distX <= distY ? "x" : "y";
      }

      layer[indexOf({ width }, x, y)] = { type: borderType, axis, plateFraction: borderPlateFraction, rounded: borderRounded };
    }
  }
  return layer;
}
