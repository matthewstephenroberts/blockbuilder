import { useState } from "react";
import { AutoFillBorderType, AutoFillOptions } from "../model/autofill";
import { CELL_TYPE_INFO, CellType, PLATE_FRACTION_INFO, PLATE_FRACTION_ORDER, PlateFraction } from "../model/cellTypes";

interface Props {
  defaultWidth: number;
  defaultHeight: number;
  onGenerate: (opts: AutoFillOptions) => void;
}

const BORDER_OPTIONS: AutoFillBorderType[] = [
  CellType.TechnicHole,
  CellType.StudHole,
  CellType.AxleHole,
  CellType.BallJoint,
  CellType.Solid,
];

export default function AutoFillDialog({ defaultWidth, defaultHeight, onGenerate }: Props) {
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);
  const [border, setBorder] = useState(1);
  const [interiorPlateFraction, setInteriorPlateFraction] = useState<PlateFraction>("full");
  const [interiorRounded, setInteriorRounded] = useState(false);
  const [borderPlateFraction, setBorderPlateFraction] = useState<PlateFraction>("full");
  const [borderType, setBorderType] = useState<AutoFillBorderType>(CellType.TechnicHole);
  const [borderPattern, setBorderPattern] = useState<"edge" | "alternating">("edge");
  const [borderRounded, setBorderRounded] = useState(false);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Auto-fill a plate</h2>
      </div>
      <p className="muted sm">
        Generates a whole plate in one shot on the currently active layer, with a customisable
        interior and border. Tweak individual cells afterward with the brush.
      </p>
      <div className="row gap">
        <label className="field">
          <span>Width (studs)</span>
          <input type="number" min={1} max={40} value={width} onChange={(e) => setWidth(Number(e.target.value) || 1)} />
        </label>
        <label className="field">
          <span>Depth (studs)</span>
          <input type="number" min={1} max={40} value={height} onChange={(e) => setHeight(Number(e.target.value) || 1)} />
        </label>
        <label className="field">
          <span>Border rings</span>
          <input type="number" min={0} max={5} value={border} onChange={(e) => setBorder(Number(e.target.value) || 0)} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>Interior plate height</span>
        <select
          value={interiorPlateFraction}
          onChange={(e) => setInteriorPlateFraction(e.target.value as PlateFraction)}
        >
          {PLATE_FRACTION_ORDER.map((f) => (
            <option key={f} value={f}>
              {PLATE_FRACTION_INFO[f].label}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          type="checkbox"
          id="interior-rounded"
          checked={interiorRounded}
          onChange={(e) => setInteriorRounded(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="interior-rounded" style={{ margin: 0, color: 'var(--text)', fontSize: '13px', cursor: 'pointer' }}>
          Round interior edges
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>Border cells</span>
        <select value={borderType} onChange={(e) => setBorderType(e.target.value as AutoFillBorderType)}>
          {BORDER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t === CellType.Solid ? "None (no border ring)" : CELL_TYPE_INFO[t].label}
            </option>
          ))}
        </select>
      </label>
      {borderType !== CellType.Solid && (
        <>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Border plate height</span>
            <select
              value={borderPlateFraction}
              onChange={(e) => setBorderPlateFraction(e.target.value as PlateFraction)}
            >
              {PLATE_FRACTION_ORDER.map((f) => (
                <option key={f} value={f}>
                  {PLATE_FRACTION_INFO[f].label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Border pattern</span>
            <select value={borderPattern} onChange={(e) => setBorderPattern(e.target.value as "edge" | "alternating")}>
              <option value="edge">Orient to nearest edge</option>
              <option value="alternating">Alternating pattern (X/Y with Z)</option>
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              id="border-rounded"
              checked={borderRounded}
              onChange={(e) => setBorderRounded(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="border-rounded" style={{ margin: 0, color: 'var(--text)', fontSize: '13px', cursor: 'pointer' }}>
              Round border edges
            </label>
          </div>
        </>
      )}
      <button
        className="primary"
        style={{ marginTop: 12 }}
        onClick={() =>
          onGenerate({
            width,
            height,
            borderThickness: border,
            borderType,
            interiorPlateFraction,
            interiorRounded,
            borderPlateFraction: borderType !== CellType.Solid ? borderPlateFraction : undefined,
            borderPattern: borderType !== CellType.Solid ? borderPattern : undefined,
            borderRounded: borderType !== CellType.Solid ? borderRounded : undefined,
          })
        }
      >
        Generate plate
      </button>
    </div>
  );
}
