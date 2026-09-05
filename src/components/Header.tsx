import { Save, SaveAll, FolderOpen, Eraser, Download, RotateCcw, RotateCw } from "lucide-react";
import { rememberedName } from "../export/saveTarget";
import { downloadGeometryAsSTL } from "../export/stlExport";
import { buildGridGeometry } from "../model/geometry";
import { GridState } from "../model/grid";

interface Props {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  grid: GridState;
  /** `saveAs` forces the file dialog; without it the save goes back to the file chosen last time. */
  onSaveProject: (saveAs: boolean) => void | Promise<void>;
  onLoadProject: () => void;
  onClearProject: () => void;
  onError: (message: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Layers currently hidden from the 3D preview. Export leaves them out too — an assembly whose
   * parts move against each other (a carousel and the gate plate under it, say) lives on separate
   * layers of one project but has to reach the printer as separate STLs, and hiding a layer is
   * already the control for "not this bit". Exporting the whole stack regardless just fused them.
   */
  hiddenLayers: ReadonlySet<number>;
}

export default function Header({ theme, onToggleTheme, grid, onSaveProject, onLoadProject, onClearProject, onError, onUndo, onRedo, canUndo, canRedo, hiddenLayers }: Props) {
  const hiddenCount = hiddenLayers.size;
  const savedName = rememberedName("project");
  const handleExportSTL = async () => {
    try {
      const geometry = await buildGridGeometry(grid, hiddenLayers);
      await downloadGeometryAsSTL(geometry, "blockbuilder-part.stl", "part");
    } catch (err) {
      console.error("Failed to export STL:", err);
      onError(`Failed to export STL: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <header className="app-header">
      <div>
        <h1>
          <span className="logo-brick">🧱</span>
          Block<span className="accent">Builder</span>
        </h1>
        <p className="sub">Parametric Technic tile &amp; brick designer</p>
      </div>
      <div className="header-actions">
        <button
          className="icon-btn ghost"
          onClick={() => onSaveProject(false)}
          title={`Save project — straight back to the file you saved to last${savedName ? ` (${savedName})` : ", after choosing one"}`}
        >
          <Save size={18} />
        </button>
        <button
          className="icon-btn ghost"
          onClick={() => onSaveProject(true)}
          title="Save project as… — choose a new file, which later saves then go back to"
        >
          <SaveAll size={18} />
        </button>
        <button
          className="icon-btn ghost"
          onClick={onLoadProject}
          title="Load project from file"
        >
          <FolderOpen size={18} />
        </button>
        <button
          className="icon-btn ghost"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <RotateCcw size={18} />
        </button>
        <button
          className="icon-btn ghost"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <RotateCw size={18} />
        </button>
        <button
          className="icon-btn ghost"
          onClick={handleExportSTL}
          title={
            hiddenCount > 0
              ? `Export as STL — ${hiddenCount} hidden layer${hiddenCount === 1 ? "" : "s"} left out. Hide a layer to export one part of an assembly on its own.`
              : "Export as STL"
          }
        >
          <Download size={18} />
        </button>
        <button
          className="icon-btn ghost"
          onClick={onClearProject}
          title="Clear all and start over"
        >
          <Eraser size={18} />
        </button>
        <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme">
          {theme === "dark" ? "🌙" : "☀️"}
        </button>
      </div>
    </header>
  );
}
