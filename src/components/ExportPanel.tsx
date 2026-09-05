import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadGeometryAsSTL } from "../export/stlExport";
import { buildGridGeometry, computeLayerHeights } from "../model/geometry";
import { allLayerSpacing, GridState, maxLayerPitch } from "../model/grid";

export default function ExportPanel({ grid, onError }: { grid: GridState; onError: (message: string) => void }) {
  const [exporting, setExporting] = useState(false);
  // The part's footprint is set by its WIDEST layer — every layer is centred on the same point, so
  // a narrower one sits inside that envelope rather than extending it.
  const outerPitch = maxLayerPitch(grid);
  const widthMm = grid.width * outerPitch;
  const depthMm = grid.height * outerPitch;
  const pitches = Array.from(new Set(allLayerSpacing(grid).map((sp) => sp.pitch))).sort((a, b) => a - b);
  const heightMm = useMemo(
    () => computeLayerHeights(grid).reduce((sum, h) => sum + h, 0),
    [grid],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const geometry = await buildGridGeometry(grid);
      await downloadGeometryAsSTL(geometry, "blockbuilder-part.stl", "part");
    } catch (err) {
      console.error("Failed to export STL:", err);
      onError(`Failed to export STL: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Export</h2>
      </div>
      <p className="meta">
        {grid.width} x {grid.height} studs &middot; {grid.layers.length} layer
        {grid.layers.length !== 1 ? "s" : ""} &middot; {widthMm.toFixed(1)} x {depthMm.toFixed(1)} x{" "}
        {heightMm.toFixed(1)} mm &middot; {pitches.join("/")}mm pitch
      </p>
      <button className="primary" onClick={handleExport} disabled={exporting}>
        <Download size={16} /> {exporting ? "Building…" : "Export STL"}
      </button>
    </div>
  );
}
