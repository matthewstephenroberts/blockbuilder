import { PRINT_HOLE_CLEARANCE_DEFAULT, PRINT_SIDEWAYS_HOLE_CLEARANCE_DEFAULT } from "../model/units";

interface Props {
  partClearance: number;
  onPartClearanceChange: (value: number) => void;
  holeClearance: number;
  onHoleClearanceChange: (value: number) => void;
  sidewaysHoleClearance: number;
  onSidewaysHoleClearanceChange: (value: number) => void;
}

/**
 * Both fields default to 0 — a fresh project's dimensions match the real part's own reference
 * measurements exactly. Nudge either one up only if your own printer needs it; the
 * numbers here don't change what "correct" looks like, just how forgiving this one print of it is.
 */
export default function PrintFitPanel({
  partClearance,
  onPartClearanceChange,
  holeClearance,
  onHoleClearanceChange,
  sidewaysHoleClearance,
  onSidewaysHoleClearanceChange,
}: Props) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Print fit</h2>
      </div>
      <p className="muted sm">
        Both default to 0, matching the reference part's own dimensions exactly. Increase either
        only if your printer needs more room than that to actually assemble.
      </p>
      <label className="field" style={{ width: "100%" }}>
        <span>Hole clearance (mm)</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={holeClearance}
          onChange={(e) => onHoleClearanceChange(Number(e.target.value) || 0)}
          title={`Extra radius added to every Technic/stud/axle hole so a printed connector isn't friction-fit tighter than your printer can reproduce. Try ${PRINT_HOLE_CLEARANCE_DEFAULT}mm if holes print too tight to insert a pin/axle at all.`}
        />
      </label>
      <label className="field" style={{ width: "100%", marginTop: 10 }}>
        <span>Sideways hole extra (mm)</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={sidewaysHoleClearance}
          onChange={(e) => onSidewaysHoleClearanceChange(Number(e.target.value) || 0)}
          title={`Added on top of Hole clearance, but only to holes bored sideways (X/Y). Those lie horizontal on the bed and print undersized \u2014 their unsupported top arch sags \u2014 while vertical (Z) holes come out close to nominal. Try ${PRINT_SIDEWAYS_HOLE_CLEARANCE_DEFAULT}mm if a pin fits your Z holes nicely but is tight in the sideways ones.`}
        />
      </label>
      <label className="field" style={{ width: "100%", marginTop: 10 }}>
        <span>Outer clearance (mm)</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={partClearance}
          onChange={(e) => onPartClearanceChange(Number(e.target.value) || 0)}
          title="Shrinks this part's true outer skin (perimeter walls, top/bottom faces) inward by this much per exterior face — for when this part is meant to slot as a separate piece into a pocket cut in another part. Doesn't touch internal joints or connector holes/pins, which stay at their normal fitted size."
        />
      </label>
    </div>
  );
}
