import { useEffect, useRef, useState } from "react";
import ActionBar from "./components/ActionBar";
import AutoFillDialog from "./components/AutoFillDialog";
import CatalogPanel from "./components/CatalogPanel";
import ConfirmDialog from "./components/ConfirmDialog";
import GridEditor from "./components/GridEditor";
import Header from "./components/Header";
import PinPanel from "./components/PinPanel";
import PrintFitPanel from "./components/PrintFitPanel";
import RoundingPanel from "./components/RoundingPanel";
import Toolbar from "./components/Toolbar";
import Viewport3D from "./components/Viewport3D";
import { createEmptyGrid } from "./model/grid";
import { deserializeProject, serializeProject } from "./model/project";
import { useProjectStore } from "./state/useProjectStore";
import { downloadText } from "./export/download";

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("blockbuilder-theme");
    return (saved === "light" ? "light" : "dark");
  });
  const store = useProjectStore(10, 10);
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(() => {
    const saved = localStorage.getItem("blockbuilder-viewport-height");
    return saved ? Math.max(20, Math.min(80, parseFloat(saved))) : 55;
  });
  const [actionBarHeight, setActionBarHeight] = useState(() => {
    const saved = localStorage.getItem("blockbuilder-actionbar-height");
    return saved ? Math.max(70, Math.min(180, parseFloat(saved))) : 90;
  });
  const splitPanelRef = useRef<HTMLDivElement>(null);
  const appShellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("blockbuilder-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("blockbuilder-actionbar-height", actionBarHeight.toString());
  }, [actionBarHeight]);

  useEffect(() => {
    localStorage.setItem("blockbuilder-viewport-height", viewportHeight.toString());
  }, [viewportHeight]);

  const handleActionBarResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = actionBarHeight;

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = startHeight + delta;
      const clamped = Math.max(70, Math.min(180, newHeight));
      setActionBarHeight(clamped);
    };

    const handleEnd = () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleEnd);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleEnd);
  };

  const handleSplitStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = viewportHeight;
    const panel = splitPanelRef.current;
    if (!panel) return;
    const panelHeight = panel.clientHeight;

    const handleMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = startHeight + (delta / panelHeight) * 100;
      const clamped = Math.max(20, Math.min(80, newHeight));
      setViewportHeight(clamped);
    };

    const handleEnd = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleEnd);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
  };

  const handleLoadProject = async (file: File) => {
    try {
      const text = await file.text();
      store.loadProject(deserializeProject(text));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't load that project file.");
    }
  };

  return (
    <div className="app-shell" ref={appShellRef}>
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        grid={store.grid}
        onSaveProject={() => downloadText(serializeProject(store.grid), "blockbuilder-project.json")}
        onLoadProject={() => fileInput.current?.click()}
        onClearProject={() => setConfirmingClear(true)}
        onError={setErrorMessage}
        onUndo={store.undo}
        onRedo={store.redo}
        canUndo={store.canUndo}
        canRedo={store.canRedo}
        hiddenLayers={store.hiddenLayers}
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleLoadProject(file);
          e.target.value = "";
        }}
      />
      <div className="action-bar-wrapper" style={{ height: `${actionBarHeight}px`, '--actionbar-height': `${actionBarHeight}px` } as React.CSSProperties}>
        <ActionBar
          tool={store.tool}
          onToolChange={store.setTool}
          brush={store.brush}
          onBrushChange={store.setBrush}
          theme={theme}
        />
      </div>
      <div
        className="split-handle split-handle-horizontal"
        onMouseDown={handleActionBarResizeStart}
        title="Drag to resize brush icons"
      >
        <div className="split-handle-bar" />
      </div>
      <main className="app-main">
        <div className="side-panel panel-scroll">
          <Toolbar
            grid={store.grid}
            brush={store.brush}
            onBrushChange={store.setBrush}
            axis={store.axis}
            onAxisChange={store.setAxis}
            flip={store.flip}
            onFlipChange={store.setFlip}
            plateFraction={store.plateFraction}
            onPlateFractionChange={store.setPlateFraction}
            widthFraction={store.widthFraction}
            onWidthFractionChange={store.setWidthFraction}
            roundedEdges={store.roundedEdges}
            onRoundedEdgesChange={store.setRoundedEdges}
            chamferMm={store.chamferMm}
            onChamferMmChange={store.setChamferMm}
            blendXPos={store.blendXPos}
            onBlendXPosChange={store.setBlendXPos}
            blendXNeg={store.blendXNeg}
            onBlendXNegChange={store.setBlendXNeg}
            blendYPos={store.blendYPos}
            onBlendYPosChange={store.setBlendYPos}
            blendYNeg={store.blendYNeg}
            onBlendYNegChange={store.setBlendYNeg}
            cornerBlendXPosYPos={store.cornerBlendXPosYPos}
            onCornerBlendXPosYPosChange={store.setCornerBlendXPosYPos}
            cornerBlendXPosYNeg={store.cornerBlendXPosYNeg}
            onCornerBlendXPosYNegChange={store.setCornerBlendXPosYNeg}
            cornerBlendXNegYPos={store.cornerBlendXNegYPos}
            onCornerBlendXNegYPosChange={store.setCornerBlendXNegYPos}
            cornerBlendXNegYNeg={store.cornerBlendXNegYNeg}
            onCornerBlendXNegYNegChange={store.setCornerBlendXNegYNeg}
            circleDimension={store.circleDimension}
            onCircleDimensionChange={store.setCircleDimension}
            circleHollow={store.circleHollow}
            onCircleHollowChange={store.setCircleHollow}
            circleOuterSquare={store.circleOuterSquare}
            onCircleOuterSquareChange={store.setCircleOuterSquare}
            selectedCircle={store.selectedCircle}
            onRemoveCircle={store.removeCircle}
            tool={store.tool}
            onToolChange={store.setTool}
            onResize={store.resize}
            onUndo={store.undo}
            onRedo={store.redo}
            canUndo={store.canUndo}
            canRedo={store.canRedo}
            selectedCell={store.selectedCell}
            onRemoveCell={store.removeCell}
            selectedBeam={(store.grid.beams ?? []).find((b) => b.id === store.selectedBeamId) ?? null}
            onBeamHoleSolidAtChange={store.setBeamHoleSolidAt}
            beamGusset={store.beamGusset}
            beamFit={store.beamFit}
            onBeamFitChange={store.setBeamFit}
            onRefitBeam={store.refitBeam}
            onBeamGussetChange={store.setBeamGusset}
            onClearBeamFit={store.clearBeamFit}
            onFlushBeam={store.flushBeamToBlocks}
            onBeamAcrossOffsetChange={(mm) => store.updateBeam(store.selectedBeamId!, { acrossOffset: mm || undefined })}
            onRemoveBeam={store.removeBeam}
            beamAngleId={store.beamAngleId}
            onBeamAngleIdChange={store.setBeamAngleId}
            beamCustomDegrees={store.beamCustomDegrees}
            onBeamCustomDegreesChange={store.setBeamCustomDegrees}
            beamMirror={store.beamMirror}
            beamReverse={store.beamReverse}
            onBeamQuadrantChange={store.setBeamQuadrant}
            beamHoles={store.beamHoles}
            onBeamHolesChange={store.setBeamHoles}
            beamHoleType={store.beamHoleType}
            onBeamHoleTypeChange={store.setBeamHoleType}
            beamHoleAxis={store.beamHoleAxis}
            onBeamHoleAxisChange={store.setBeamHoleAxis}
            onBeamHoleAxisAtChange={store.setBeamHoleAxisAt}
            onClearBeamHoleAxes={store.clearBeamHoleAxes}
            discSettings={store.discSettings}
            onDiscSettingsChange={store.setDiscSettings}
            onSlotMaskChange={store.setSlotMask}
            selectedDisc={(store.grid.discs ?? []).find((d) => d.id === store.selectedDiscId) ?? null}
            onRemoveDisc={store.removeDisc}
          />
          {/* Only up while angled beams are actually what's being worked on — with the beam brush
              picked, or a beam selected for editing. It's the same condition Toolbar's own beam
              pickers use (`beamMode`), so the beam controls and the beam list appear and disappear
              together instead of the list sitting under every cell brush as permanent furniture. */}
          <RoundingPanel rounding={store.grid.rounding} onCornersChange={store.setRoundingCorners} />
          <PrintFitPanel
            partClearance={store.grid.partClearance}
            onPartClearanceChange={store.setPartClearance}
            holeClearance={store.grid.holeClearance}
            onHoleClearanceChange={store.setHoleClearance}
            sidewaysHoleClearance={store.grid.sidewaysHoleClearance}
            onSidewaysHoleClearanceChange={store.setSidewaysHoleClearance}
          />
          <AutoFillDialog
            defaultWidth={store.grid.width}
            defaultHeight={store.grid.height}
            onGenerate={store.autoFill}
          />
          <CatalogPanel onLoad={store.loadProject} />
          <PinPanel onError={setErrorMessage} />
        </div>
        <div className="centre-panel" ref={splitPanelRef}>
          <div className="viewport-wrap" style={{ flex: `0 0 ${viewportHeight}%` }}>
            <Viewport3D grid={store.grid} hiddenLayers={store.hiddenLayers} />
          </div>
          <div className="split-handle" onMouseDown={handleSplitStart}>
            <div className="split-handle-bar" />
          </div>
          <div className="editor-wrap" style={{ flex: `0 0 ${100 - viewportHeight}%` }}>
            <GridEditor
              grid={store.grid}
              brush={store.brush}
              tool={store.tool}
              beamHoleType={store.beamHoleType}
              beamHoleAxis={store.beamHoleAxis}
              beamFit={store.beamFit}
              selectedCircle={store.selectedCircle}
              onSelectCircle={store.selectCircle}
              onBeginCircleDrag={store.beginCircleDrag}
              onEndCircleDrag={store.endCircleDrag}
              onBeginCellDrag={store.beginCellDrag}
              onEndCellDrag={store.endCellDrag}
              onMoveCircleRing={store.setCircleCentre}
              onPaintRect={store.paintRect}
              onSelectLayer={store.setActiveLayer}
              selectedCell={store.selectedCell}
              onSelectCell={store.selectCell}
              onAddLayer={store.addLayer}
              onDuplicateLayer={store.duplicateLayer}
              onRemoveLayer={store.removeLayer}
              onMoveLayerUp={store.moveLayerUp}
              onMoveLayerDown={store.moveLayerDown}
              onResize={store.resize}
              hiddenLayers={store.hiddenLayers}
              onToggleLayerVisibility={store.toggleLayerVisibility}
              selectedBeamId={store.selectedBeamId}
              onSelectBeam={store.selectBeam}
              selectedDiscId={store.selectedDiscId}
              onSelectDisc={store.selectDisc}
              onMoveDiscCentre={(id, centreX, centreY) => store.setDiscCentre(id, centreX, centreY)}
              onBeginBeamDrag={store.checkpoint}
              onMoveBeamAnchor={(id, anchorX, anchorY) => store.updateBeam(id, { anchorX, anchorY }, false)}
              onMoveCell={store.moveCell}
            />
          </div>
        </div>
      </main>
      {confirmingClear && (
        <ConfirmDialog
          title="Clear the grid?"
          message="This replaces the current project with a blank grid and can't be undone."
          confirmLabel="Clear"
          onConfirm={() => {
            store.loadProject(createEmptyGrid(store.grid.width, store.grid.height));
            setConfirmingClear(false);
          }}
          onCancel={() => setConfirmingClear(false)}
        />
      )}
      {errorMessage && (
        <ConfirmDialog title="Error" message={errorMessage} onConfirm={() => setErrorMessage(null)} />
      )}
    </div>
  );
}
