import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadGeometryAsSTL } from "../export/stlExport";
import { buildGridGeometry, computeLayerHeights } from "../model/geometry";
import { GridState } from "../model/grid";
import { STUD_PITCH } from "../model/units";

export default function ExportPanel({ grid, onError }: { grid: GridState; onError: (message: string) => void }) {
  const [exporting, setExporting] = useState(false);
  const widthMm = grid.width * STUD_PITCH;
  const depthMm = grid.height * STUD_PITCH;
  const heightMm = useMemo(
    () => computeLayerHeights(grid).reduce((sum, h) => sum + h, 0),
    [grid],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const geometry = await buildGridGeometry(grid);
      await downloadGeometryAsSTL(geometry, "blockbuilder-part.stl");
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
        {heightMm.toFixed(1)} mm
      </p>
      <button className="primary" onClick={handleExport} disabled={exporting}>
        <Download size={16} /> {exporting ? "Building…" : "Export STL"}
      </button>
    </div>
  );
}
