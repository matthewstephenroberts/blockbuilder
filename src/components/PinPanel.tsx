import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { downloadGeometryAsSTL } from "../export/stlExport";
import { buildPinGeometry, PIN_DEFAULT_LENGTH_STUDS, PIN_MIN_LENGTH_STUDS } from "../model/pin";
import { STUD_PITCH } from "../model/units";
import * as THREE from "three";
import GeometryViewport from "./GeometryViewport";

export default function PinPanel({ onError }: { onError: (message: string) => void }) {
  const [lengthStuds, setLengthStuds] = useState(PIN_DEFAULT_LENGTH_STUDS);
  const lengthMm = lengthStuds * STUD_PITCH;
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    buildPinGeometry({ length: lengthMm }).then((geom) => {
      if (!cancelled) setGeometry(geom);
    });
    return () => {
      cancelled = true;
    };
  }, [lengthMm]);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Technic pin</h2>
      </div>
      <p className="muted sm">
        A separate printable connector pin — a plain, undersized shaft (matching a real Technic
        pin's own smooth profile) with a flex split cut in from each tip (the middle stays solid,
        so it's one connected piece) so the ends compress slightly and clip into a technic hole
        snugly instead of rattling, jamming, or falling apart.
      </p>
      <label className="field">
        <span>Length (studs)</span>
        <input
          type="number"
          min={PIN_MIN_LENGTH_STUDS}
          step={0.5}
          max={10}
          value={lengthStuds}
          onChange={(e) => setLengthStuds(Number(e.target.value) || PIN_MIN_LENGTH_STUDS)}
        />
      </label>
      <p className="muted sm">{lengthMm.toFixed(1)} mm</p>
      <div className="pin-preview">
        {geometry && <GeometryViewport geometry={geometry} color="#ffd500" cameraDistance={30} />}
      </div>
      <button
        className="primary"
        style={{ marginTop: 12 }}
        disabled={!geometry}
        onClick={() => {
          if (geometry) {
            downloadGeometryAsSTL(geometry, "blockbuilder-pin.stl").catch((err) => {
              console.error("Failed to export pin STL:", err);
              onError(`Failed to export pin STL: ${err instanceof Error ? err.message : 'Unknown error'}`);
            });
          }
        }}
      >
        <Download size={16} /> Export pin STL
      </button>
    </div>
  );
}
