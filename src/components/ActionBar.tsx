import { Paintbrush, MousePointer } from "lucide-react";
import { CELL_TYPE_INFO, CELL_TYPE_ORDER, CellType } from "../model/cellTypes";
import { ToolMode } from "../state/useProjectStore";
import { useEffect, useState } from "react";
import { getBrushPreview, clearBrushPreviewCache } from "../model/brushPreview";
import { getCellTypeHexColor } from "../model/colorMap";

interface Props {
  tool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  brush: CellType;
  onBrushChange: (type: CellType) => void;
  theme: 'dark' | 'light';
}

function BrushButton({ type, isActive, onSelect, theme }: { type: CellType; isActive: boolean; onSelect: () => void; theme: 'dark' | 'light' }) {
  const [preview, setPreview] = useState<string>("");
  const info = CELL_TYPE_INFO[type];
  const hexColor = getCellTypeHexColor(type);

  useEffect(() => {
    getBrushPreview(type, theme).then(setPreview);
  }, [type, theme]);

  return (
    <button
      className={`brush-btn-with-preview${isActive ? " active" : ""}`}
      onClick={onSelect}
      title={info.label}
    >
      <div className="brush-preview-container">
        {preview ? (
          <img src={preview} alt={info.label} className="brush-preview-img" />
        ) : (
          <div
            className="brush-preview-swatch"
            style={{ backgroundColor: hexColor }}
          />
        )}
        <div
          className="brush-color-indicator"
          style={{ backgroundColor: hexColor }}
          title={`Color: ${hexColor}`}
        />
      </div>
      <span className="brush-label">{info.shortLabel}</span>
    </button>
  );
}

export default function ActionBar({ tool, onToolChange, brush, onBrushChange, theme }: Props) {
  useEffect(() => {
    clearBrushPreviewCache();
  }, [theme]);

  return (
    <div className="action-bar">
      <div className="tool-group">
        <button
          className={`icon-btn${tool === "paint" ? " active" : ""}`}
          onClick={() => onToolChange("paint")}
          title="Paint tool - click/drag to paint with selected brush"
        >
          <Paintbrush size={18} />
        </button>
        <button
          className={`icon-btn${tool === "edit" ? " active" : ""}`}
          onClick={() => onToolChange("edit")}
          title="Edit tool - inspect and adjust existing cells"
        >
          <MousePointer size={18} />
        </button>
      </div>

      <div className="brush-group">
        {CELL_TYPE_ORDER.map((type) => (
          <BrushButton
            key={type}
            type={type}
            isActive={brush === type}
            onSelect={() => onBrushChange(type)}
            theme={theme}
          />
        ))}
      </div>
    </div>
  );
}
