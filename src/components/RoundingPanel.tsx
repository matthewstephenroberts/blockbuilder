import { RoundingConfig } from "../model/grid";

interface Props {
  rounding: RoundingConfig;
  onCornersChange: (value: boolean) => void;
}

export default function RoundingPanel({ rounding, onCornersChange }: Props) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Rounding</h2>
      </div>
      <p className="muted sm">
        Softens the part's 4 vertical corners with a small fillet — matching real Technic plates,
        which usually have rounded corners rather than sharp rectangular edges.
      </p>
      <div className="rounding-rows">
        <label
          className="toggle-row"
          title="Softens all 4 vertical corners of the footprint with a small fillet."
        >
          <input type="checkbox" checked={rounding.corners} onChange={(e) => onCornersChange(e.target.checked)} />
          <span>Round corners</span>
        </label>
      </div>
    </div>
  );
}
