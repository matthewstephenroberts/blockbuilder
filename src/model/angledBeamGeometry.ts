import * as THREE from "three";
import {
  AngledBeam,
  beamAngleDegrees,
  beamHoleAxisAt,
  beamLeadIn,
  beamSpans,
  beamBodySpanStuds,
  beamDirection,
  beamEndsMeetingBeams,
  beamSuppressedHoles,
} from "./angledBeam";
import { CellType } from "./cellTypes";
import { footprintBlend, subtract, unionAll } from "./csg";
import { CircleRing } from "./circleRing";
import { Cell, GridState, inBounds, indexOf } from "./grid";
import { axleHoleGeometry, boxGeometry, pinHoleGeometry, studHoleGeometry } from "./primitives";
import { cellBuiltHalf, CELL_OVERLAP, CUT_EPSILON, PIN_HOLE_BOSS_RADIUS, STUD_PITCH } from "./units";
import { CELL_EDGE_RADIUS } from "./rounding";

/**
 * How far an in-plane bore reaches past the beam's own side faces, in mm.
 *
 * Big enough that the cut is never coplanar with the face it breaks — that is what keeps a hole a
 * circle instead of a starburst — and small enough that the notch it leaves in a block the beam is
 * buried in is finer than a print layer. CUT_EPSILON's own 0.5mm is the right answer for a cut into
 * open air and much too coarse for one landing inside a neighbour.
 */
const BORE_BREAKOUT = 0.05;

/**
 * Builds one angled beam (see AngledBeam) as a single solid, in the same world-mm space
 * buildGridGeometry places cells in.
 *
 * The whole beam is built along +X first — a plain straight beam, holes at the standard 8mm pitch
 * — and then rotated about Z into place. That ordering is the point of this file: every hole's own
 * primitive (pinHoleGeometry and friends) is built along a WORLD axis, so boring a hole "along the
 * beam's perpendicular at 26.57°" isn't something those primitives can express directly. Building
 * straight and rotating once at the end means the beam's own axis is the authoritative one — hole
 * pitch is a true 8mm along the run, and the bore direction follows the beam rather than the grid.
 *
 * Each hole bores along its OWN direction (see AngledBeam.holeAxes) — a beam can mix vertical and
 * in-plane holes, so everything below is decided per hole rather than once for the beam.
 *
 * ALL bore cutters are returned SEPARATELY rather than subtracted here. A beam is unioned with
 * everything else in the part, and a solid cell it passes through would then fill the holes back
 * in — the block wins simply by being unioned after the hole was cut. Handing the cutters back so
 * buildGridGeometry can subtract them from the finished union keeps a beam's holes open through
 * whatever they pass through.
 *
 * An in-plane bore used to be subtracted here, from the beam alone, out of a worry that it does
 * not have the vertical bore's guarantee of breaking out. That traded one problem for a worse one:
 * every hole where a beam ran through a block came out filled. The bore is still exactly the
 * BEAM's width either way — it is the beam's hole, and one wider than the part it belongs to is a
 * tunnel through whatever is next to it — so cutting it from the assembly opens the beam's own
 * hole and touches nothing beyond it.
 *
 * (Historical note, kept because it is the thing to check if a beam ever prints with a void in it:
 * a bore whose two ends both stop inside surrounding material is a sealed cavity. It cannot happen
 * for a vertical bore, which runs the full layer height and always breaks out top and bottom.
 * An in-plane one can, if a beam is buried deep enough inside a block that neither side of the
 * bore reaches air — turn that hole solid with the per-hole ✕ if it comes up.)
 *
 * Clearance settings are the project's own print-fit ones; a beam's holes are classified the same
 * way a cell's are — a "z" bore prints vertically on the bed and gets the base clearance only, an
 * in-plane ("perpendicular") bore prints horizontally and gets both, matching geometry.ts's own
 * holeClearanceFor.
 */
export async function buildAngledBeamGeometry(
  grid: Pick<GridState, "width" | "height" | "holeClearance" | "sidewaysHoleClearance" | "layers">,
  beam: AngledBeam,
  layerBase: number,
  beamHeight: number,
  beamWidth: number,
  /** The beam's layer's own full height. A vertical bore is cut to this rather than to the beam's
   * own height, so a taller cell sharing the layer gets drilled through instead of capping the
   * hole off part-way up. */
  layerHeight: number,
  /**
   * Which ends land on another beam's hole — see beamEndsMeetingBeams. Such an end caps in plan so
   * the two beams' caps coincide instead of one standing proud of the other.
   */
  joinedEnds: { start: boolean; end: boolean } = { start: false, end: false },
  /** The beam's layer's own lattice pitch — its hole spacing and cap radii follow it. */
  pitch: number = STUD_PITCH,
  /** The beam's layer's own connector scale — its BORES follow it, independently of `pitch`. */
  connectorScale = 1,
): Promise<{ body: THREE.BufferGeometry; throughCutters: THREE.BufferGeometry[] }> {
  const span = beamSpans(beam);
  const runLength = span * pitch;
  const rounded = beam.roundedEnds ?? true;
  const halfHeight = beamHeight / 2;

  // The beam's own axis, measured from the ANCHOR: the first hole sits `lead.start` along it, not
  // at 0. That gap is the whole of AngledBeam.leadInStart — body that reaches a cell centre the
  // hole pitch can't, without the pitch itself budging. With no lead-in (every beam that predates
  // the field) the first hole is at 0 and everything below is what it always was.
  const lead = beamLeadIn(beam);
  const firstHole = lead.start;
  const lastHole = firstHole + runLength;

  // A square-ended beam has to grow half a stud past each end hole to leave the same wall around
  // it a rounded end's cap does; a rounded one gets that material from the caps themselves. A
  // FITTED end needs neither — its lead-in already carries the material out to the cell — so it
  // ends flush at the cell centre, square, with nothing overhanging for a gusset to fight.
  const capStart = rounded && lead.start <= 0;
  const capEnd = rounded && lead.end <= 0;
  // A FITTED end (one carrying a lead-in) has no end hole at its tip to be concentric with, so it
  // cannot take the liftarm's D cap. It can still be rounded: a STADIUM end — the straight body
  // stopping a cap-radius short and a half-round centred there carrying it the rest of the way, so
  // the end reaches exactly as far as the square face did and the fit is untouched.
  //
  // Only where the end hangs in air. An end buried in the block it lands on keeps its flat face:
  // the cap would be invisible inside the material, and the end blend wants a straight wall to sit
  // its fillet against.
  const bodySpan = beamBodySpanStuds(beam, pitch);
  const stadiumStart = rounded && lead.start > 0 && !beamEndIsBuried(grid, beam, bodySpan.from);
  const stadiumEnd = rounded && lead.end > 0 && !beamEndIsBuried(grid, beam, bodySpan.to);
  // How far the body runs PAST each end hole: its lead-in when there is one, and otherwise the
  // half-stud a square end needs (a rounded one gets its material from the cap, and only overlaps
  // it enough to union cleanly).
  const extStart = lead.start > 0 ? lead.start : rounded ? CELL_OVERLAP / 2 : pitch / 2;
  const extEnd = lead.end > 0 ? lead.end : rounded ? CELL_OVERLAP / 2 : pitch / 2;

  const stadiumRadius = Math.min(pitch / 2, beamWidth / 2);
  const bodyFrom = firstHole - extStart + (stadiumStart ? stadiumRadius : 0);
  const bodyTo = lastHole + extEnd - (stadiumEnd ? stadiumRadius : 0);
  const bodyLength = bodyTo - bodyFrom;

  const parts: THREE.BufferGeometry[] = [];

  if (bodyLength > 0) {
    const body = boxGeometry(bodyLength, beamWidth, beamHeight).clone();
    body.translate((bodyFrom + bodyTo) / 2, 0, 0);
    parts.push(body);
  }

  // Which holes are not bored at all — needed by the caps below as well as by the cutters further
  // down, so it is worked out once here.
  const suppressedHoles = new Set(beamSuppressedHoles(beam));

  // The stadium caps: plain upright half-rounds on the body's own ends, not on any hole.
  for (const [use, at] of [
    [stadiumStart && bodyLength > 0, bodyFrom],
    [stadiumEnd && bodyLength > 0, bodyTo],
  ] as const) {
    if (!use) continue;
    const cap = new THREE.CylinderGeometry(stadiumRadius, stadiumRadius, beamHeight, 48);
    cap.rotateX(Math.PI / 2);
    cap.translate(at, 0, 0);
    parts.push(cap);
  }

  if (capStart || capEnd) {
    // A real liftarm's end is a genuine half-circle, concentric with the end hole — and which
    // plane that circle lies in follows THAT hole's own axis, exactly as a rounded cell's cap
    // follows its own bore (see rounding.ts's cellCapCylinder). A vertical end hole is round in
    // plan view; an in-plane one is round in elevation. Each end is therefore capped from its own
    // hole's direction, not from a single beam-wide one — on a beam that mixes the two, the two
    // ends genuinely differ.
    const ends: { at: number; hole: number; capped: boolean }[] = (
      span > 0
        ? [
            { at: firstHole, hole: 0, capped: capStart },
            { at: lastHole, hole: beam.holes - 1, capped: capEnd },
          ]
        : [{ at: firstHole, hole: 0, capped: capStart && capEnd }]
    ).filter((e) => e.capped);
    for (const end of ends) {
      // A cap's plane follows its end hole's own bore, because it is meant to be concentric with
      // that hole — round in plan for a vertical bore, round in elevation for an in-plane one. With
      // the hole left SOLID there is no hole to be concentric with, and following the bore anyway
      // curves the end top-to-bottom when what is wanted is the beam's outline eased side wall to
      // side wall. So a solid end caps in plan whatever the beam's bores do.
      const joined = end.hole === 0 ? joinedEnds.start : joinedEnds.end;
      const capAxis =
        suppressedHoles.has(end.hole) || joined ? "z" : beamHoleAxisAt(beam, end.hole);
      const capRadius =
        capAxis === "z" ? Math.min(pitch / 2, beamWidth / 2) : Math.min(pitch / 2, halfHeight);
      const capLength = capAxis === "z" ? beamHeight : beamWidth;
      const cap = new THREE.CylinderGeometry(capRadius, capRadius, capLength, 48);
      // THREE's cylinder runs along Y. A "z" cap stands upright; an in-plane cap already points
      // along the beam's own perpendicular, which is +Y in this pre-rotation frame.
      if (capAxis === "z") cap.rotateX(Math.PI / 2);
      cap.translate(end.at, 0, 0);
      parts.push(cap);
    }
  }

  const solid = parts.length === 1 ? parts[0] : await unionAll(parts);

  // Split by the direction each hole actually bores: a vertical one goes through the finished
  // assembly, an in-plane one is cut here into the beam alone. See this function's own doc for why
  // the two can't be treated the same.
  const throughCutters: THREE.BufferGeometry[] = [];
  if (beam.holeType !== "none" && beam.holes > 0) {
    // An end hole with too little material left between it and the end face is left SOLID rather
    // than bored — see beamSuppressedHoles. Boring it anyway wouldn't produce a hole, it would
    // produce a notch open to the end of the beam, which holds no pin and prints as a hook.
    const suppressed = suppressedHoles;
    for (let i = 0; i < beam.holes; i++) {
      if (suppressed.has(i)) continue;
      const holeAxis = beamHoleAxisAt(beam, i);
      const vertical = holeAxis === "z";
      const clearance = grid.holeClearance + (vertical ? 0 : grid.sidewaysHoleClearance);
      // An in-plane bore is normally the beam's own width, matching how a cell's sideways hole
      // bores only through its own cell and leaves a neighbour to paint its own. But a beam runs
      // THROUGH the blocks it joins, and a hole inside one of those was coming out blocked: the
      // bore stopped at the beam's own side faces and the cell — unioned in afterwards — simply
      // filled it back in. `inPlaneBreakout` measures how far the bore has to reach to come out
      // the other side of whatever surrounds it, and returns null when it never does; a bore that
      // can't break out stays the beam's width and stays local, because lengthening one that ends
      // inside solid material would carve a sealed cavity — unprintable, and worse than the filled
      // hole it was meant to fix.
      // An in-plane bore is exactly the beam's own width — it is the BEAM's hole, and a hole wider
      // than the part it belongs to is a tunnel through whatever happens to be next to it. What it
      // must not be is filled in: a cell the beam passes through used to close the bore back up,
      // because the bore was cut from the beam alone and the cell was unioned on afterwards. That
      // is fixed by cutting it from the finished ASSEMBLY instead (below), not by making it longer.
      // Every hole primitive grows CUT_EPSILON past each end of the length it is given, so that a
      // cut into a lone solid breaks its surface instead of ending flush with it. For a VERTICAL
      // bore that overshoot goes up and down into open air and costs nothing. For an IN-PLANE one
      // it goes sideways — into whatever block the beam is buried in — and since these are cut from
      // the assembly, 0.5mm of it scalloped the block alongside the beam's edge at every hole: a
      // line hugging the join, one bite per hole.
      //
      // The overshoot cannot simply be removed. Ending the bore exactly flush with the beam's side
      // faces makes the cut coplanar with the surface it breaks, and the boolean answers that with
      // degenerate slivers — holes that come out as a starburst of radial spikes rather than
      // circles. What it can be is SMALL: BORE_BREAKOUT keeps the faces off each other so the cut
      // stays robust, while the bite it takes out of an adjacent block is finer than a print layer.
      const boreLength = vertical
        ? Math.max(beamHeight, layerHeight)
        : Math.max(0.1, beamWidth - CUT_EPSILON * 2 + BORE_BREAKOUT * 2);
      // Built along "z" for a vertical bore, or along "y" for an in-plane one — "y" is this
      // pre-rotation frame's own perpendicular, so the single Z rotation below carries it onto the
      // beam's true perpendicular without the primitive ever needing to know about angles.
      const boreAxis = vertical ? "z" : "y";
      const base =
        beam.holeType === "technicHole"
          ? pinHoleGeometry(boreLength, boreAxis, clearance, connectorScale)
          : beam.holeType === "axleHole"
            ? axleHoleGeometry(boreLength, boreAxis, clearance, connectorScale)
            : studHoleGeometry(boreLength, boreAxis, clearance, connectorScale);
      const cutter = base.clone();
      cutter.translate(firstHole + i * pitch, 0, 0);
      // Every bore is held back and cut from the finished assembly — the only place a cell that
      // would otherwise fill it can be reached. It stays the beam's own width either way, so this
      // clears the beam's hole and nothing beyond it.
      throughCutters.push(cutter);
    }
  }

  // Straight-and-centred-on-the-origin until now; rotate onto the beam's real angle, then move the
  // beam's FIRST hole onto its anchor cell's own centre — the same (x, y) -> world mapping every
  // cell uses, so a beam anchored at a cell shares that cell's hole centre exactly.
  // The beam's own shift across its run (see AngledBeam.acrossOffset) — applied here, in the
  // pre-rotation frame where "across" is simply +Y, so the rotation below carries it onto the real
  // perpendicular. Everything the beam is made of moves together, holes included.
  const across = beam.acrossOffset ?? 0;
  if (across !== 0) {
    solid.translate(0, across, 0);
    for (const cutter of throughCutters) cutter.translate(0, across, 0);
  }

  const angle = (beamAngleDegrees(beam) * Math.PI) / 180;
  const ax = (beam.anchorX - (grid.width - 1) / 2) * pitch;
  const ay = (beam.anchorY - (grid.height - 1) / 2) * pitch;
  solid.rotateZ(angle);
  solid.translate(ax, ay, layerBase + halfHeight);
  // A vertical bore is cut to the LAYER's height, so it's centred on the layer rather than on the
  // beam — a beam shorter than its layer would otherwise carry its hole up above the layer's own
  // top instead of down through the taller material beside it.
  const cutterZ = layerBase + Math.max(beamHeight, layerHeight) / 2;
  for (const cutter of throughCutters) {
    cutter.rotateZ(angle);
    cutter.translate(ax, ay, cutterZ);
  }
  return { body: solid, throughCutters };
}


/**
 * True when the beam's body ENDS inside an occupied cell — buried in the block it lands on rather
 * than finishing in open air.
 *
 * A buried end wants a flat face: nothing of it is visible, and the end blend needs a straight wall
 * to sit its fillet against. An end hanging in the air wants its cap, whatever the fit did — which
 * is the whole difference between a beam fused between two blocks and one whose fitted end simply
 * sticks out.
 *
 * `along` is in hole-spacings from the anchor, matching beamBodySpanStuds. acrossOffset is ignored
 * for the same reason the store's own buried test ignores it: half a millimetre sideways never
 * changes which cell an end is in.
 */
function beamEndIsBuried(
  grid: Pick<GridState, "width" | "height" | "layers">,
  beam: AngledBeam,
  along: number,
): boolean {
  const layer = grid.layers[beam.layer];
  if (!layer) return false;
  const dir = beamDirection(beam);
  const gx = Math.round(beam.anchorX + dir.x * along);
  const gy = Math.round(beam.anchorY + dir.y * along);
  if (!inBounds({ width: grid.width, height: grid.height }, gx, gy)) return false;
  return layer[indexOf({ width: grid.width }, gx, gy)].type !== CellType.Empty;
}

/**
 * The join blend between one beam and the blocks it runs into: material to add in the concave
 * corners, material to take off the convex ones. Both come from one 2D morphological operation on
 * the two footprints — see `footprintBlend`, which is where the actual reasoning lives.
 *
 * All this does is hand it the two outlines. The beam's is its own body rectangle; the blocks' are
 * the cell squares near enough to matter, at their true body size so the blend lands on the wall
 * that will actually be there rather than on the cell pitch a stud is measured by.
 */
export async function buildBeamJoinBlend(
  grid: Pick<GridState, "width" | "height" | "layers" | "holeClearance" | "sidewaysHoleClearance" | "circles">,
  beam: AngledBeam,
  layerBase: number,
  beamHeight: number,
  beamWidth: number,
  radius: number,
  /**
   * The OTHER beams sharing this layer, with the width each is built at.
   *
   * A beam meets beams as often as it meets blocks — a frame made of beams alone has no cells in it
   * at all — and a corner is a corner whichever it is. Without these the blend simply found nothing
   * to work with on such a part and left every join as two rounded ends overlapping.
   */
  others: readonly { beam: AngledBeam; width: number }[] = [],
  /** The beam's layer's own lattice pitch — see buildAngledBeamGeometry. */
  pitch: number = STUD_PITCH,
  /** The beam's layer's own connector scale, which sizes the hole mouths this blend keeps clear. */
  connectorScale = 1,
): Promise<{ fill: THREE.BufferGeometry | null; carve: THREE.BufferGeometry | null }> {
  const layer = grid.layers[beam.layer];
  if (!layer || radius <= 0) return { fill: null, carve: null };

  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const body = beamBodySpanStuds(beam, pitch);
  const ax = (beam.anchorX - (grid.width - 1) / 2) * pitch;
  const ay = (beam.anchorY - (grid.height - 1) / 2) * pitch;
  const at = (along: number, across: number): [number, number] => [
    ax + along * dir.x + across * perp.x,
    ay + along * dir.y + across * perp.y,
  ];
  /** Grid coords of a point given in the beam's own (along, across) frame, in mm. */
  const studAt = (along: number, acrossMm: number) => ({
    x: beam.anchorX + (along * dir.x + acrossMm * perp.x) / pitch,
    y: beam.anchorY + (along * dir.y + acrossMm * perp.y) / pitch,
  });
  const from = body.from * pitch;
  const to = body.to * pitch;
  const hw = beamWidth / 2;
  const across = beam.acrossOffset ?? 0;
  const beamPoly: [number, number][] = [
    at(from, across - hw),
    at(to, across - hw),
    at(to, across + hw),
    at(from, across + hw),
  ];

  // Cells within reach of the beam's own span. Anything further can't be part of this join, and
  // feeding the whole layer in would make the offsets do work that gets masked away anyway.
  // The cell size AS BUILT — see CELL_BUILT_HALF. The blend has to meet the walls the part will
  // really have: the nominal block body is 0.15mm inside them and the stud pitch 0.05mm inside,
  // and either mismatch leaves the fillet abutting a surface that isn't there.
  const half = cellBuiltHalf(pitch);
  const reach = pitch + 2 * radius + hw;
  const cellPolys: [number, number][][] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (layer[indexOf(grid, x, y)]?.type === CellType.Empty) continue;
      const cx = (x - (grid.width - 1) / 2) * pitch;
      const cy = (y - (grid.height - 1) / 2) * pitch;
      // Distance from the cell centre to the beam's own segment, so only the cells the beam
      // actually passes near are considered.
      const t = Math.max(from, Math.min(to, (cx - ax) * dir.x + (cy - ay) * dir.y));
      const [px, py] = at(t, 0);
      if (Math.hypot(cx - px, cy - py) > reach + half) continue;
      // A circle cell can have NO footprint at all — one swallowed by its ring's own bore — and an
      // empty outline is not a polygon the blend can use.
      const poly = cellFootprint(grid, layer, x, y, cx, cy, pitch);
      if (poly.length >= 3) cellPolys.push(poly);
    }
  }
  for (const other of others) {
    if (other.beam.id === beam.id || other.beam.layer !== beam.layer) continue;
    if (other.beam.holes < 1) continue;
    cellPolys.push(
      beamOutline(
        grid,
        other.beam,
        other.width,
        beamEndsMeetingBeams(other.beam, [beam, ...others.map((o) => o.beam)]),
        pitch,
      ),
    );
  }
  if (cellPolys.length === 0) return { fill: null, carve: null };

  // Keep the blend off the mouths of the beam's own in-plane bores. Those are cut to the beam's
  // width and no further (see BORE_BREAKOUT), so anything a fillet adds beyond the beam's side face
  // is out of their reach and stays as a film across the opening. A vertical bore needs no such
  // help: it runs the layer's full height and cuts whatever is over it.
  const blend = await footprintBlend([beamPoly], cellPolys, radius, beamHeight, layerBase);
  if (!blend.fill) return blend;

  // Keep the blend clear of the mouths of the beam's own in-plane bores. Those are cut to the
  // beam's width and no further (see BORE_BREAKOUT), so anything a fillet adds beyond the beam's
  // side face is out of their reach and stays as a film across the opening.
  //
  // The cutter is the BORE'S OWN SHAPE — a cylinder on its axis, standing off the face — not a
  // footprint in plan. A fillet spans the beam's full height while the mouth is a circle partway up
  // it, so a plan footprint takes out everything above and below the opening too: material that was
  // never in the way, cut to a rectangle nothing in the part is shaped like.
  //
  // Per SIDE, and only where the bore opens into air: where it meets a block there is no mouth at
  // all — the bore ends inside that material — and cutting there just bites into a fillet doing its
  // job. A vertical bore needs none of this; it runs the layer's full height and cuts what is over
  // it.
  const mouths: THREE.BufferGeometry[] = [];
  if (beam.holeType !== "none") {
    const suppressed = new Set(beamSuppressedHoles(beam));
    const lead = beamLeadIn(beam);
    const mouthRadius = PIN_HOLE_BOSS_RADIUS * connectorScale + grid.holeClearance + grid.sidewaysHoleClearance;
    // Half the blend's reach, not all of it. The fillet's face curves away from the bore as it
    // goes, so past about half the standoff it is no longer in front of the mouth — clearing the
    // full depth only takes out material that was already out of the way.
    const reach = radius / 2 + CELL_OVERLAP * 2;
    const angle = (beamAngleDegrees(beam) * Math.PI) / 180;
    for (let i = 0; i < beam.holes; i++) {
      if (suppressed.has(i) || beamHoleAxisAt(beam, i) === "z") continue;
      const u = lead.start + i * pitch;
      for (const side of [1, -1]) {
        const probe = studAt(u, across + side * (hw + pitch / 4));
        const px = Math.round(probe.x);
        const py = Math.round(probe.y);
        if (inBounds(grid, px, py) && layer[indexOf(grid, px, py)]?.type !== CellType.Empty) continue;
        // THREE's cylinder runs along Y, which is this pre-rotation frame's own perpendicular —
        // the bore's axis — so it needs no rotation of its own before the beam's.
        const cyl = new THREE.CylinderGeometry(mouthRadius, mouthRadius, reach, 32);
        cyl.translate(u, across + side * (hw + reach / 2 - CELL_OVERLAP), 0);
        cyl.rotateZ(angle);
        cyl.translate(ax, ay, layerBase + beamHeight / 2);
        mouths.push(cyl);
      }
    }
  }
  if (mouths.length === 0) return blend;

  return {
    fill: await subtract(blend.fill, mouths.length === 1 ? mouths[0] : await unionAll(mouths)),
    carve: blend.carve,
  };
}

/**
 * One cell's outline as the part will really have it: a square, with any ROUNDED quadrant replaced
 * by its arc.
 *
 * A square for every cell is wrong as soon as one is rounded, and wrong by a lot — a cell's corner
 * sits 5.73mm from its centre while the arc that replaces it is at 4mm. The blend finds its corners
 * by crossing the two outlines, so an outline that isn't there produces crossings that aren't
 * either: fillets appear along the outer wall, where the real geometry runs smoothly past.
 *
 * Which quadrants are rounded follows geometry.ts's own rule (see exteriorCorners): a corner rounds
 * when both of its orthogonal neighbours are clear, since a shared wall has to stay flat for two
 * cells to sit flush. And the arc is concentric with the CELL — rounding.ts intersects the cell
 * with a cylinder on its own centre — so a rounded quadrant is a quarter of a circle of
 * CELL_EDGE_RADIUS, not a corner eased by it.
 */
function cellFootprint(
  grid: Pick<GridState, "width" | "height" | "circles">,
  layer: readonly Cell[],
  x: number,
  y: number,
  cx: number,
  cy: number,
  pitch: number = STUD_PITCH,
): [number, number][] {
  const half = cellBuiltHalf(pitch);
  const cell = layer[indexOf(grid, x, y)];
  const clear = (dx: number, dy: number) =>
    !inBounds(grid, x + dx, y + dy) ||
    layer[indexOf(grid, x + dx, y + dy)]?.type === CellType.Empty;

  const points: [number, number][] = [];
  // Anticlockwise from +x, one quadrant at a time, emitting each quadrant's own two axis points so
  // the small step where a rounded quadrant meets a square one is carried rather than smoothed.
  const quadrants: [number, number][] = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  for (const [sx, sy] of quadrants) {
    const rounded = (cell?.rounded ?? false) && clear(sx, 0) && clear(0, sy);
    const radius = Math.min(CELL_EDGE_RADIUS, half);
    // Which axis this quadrant starts and ends on, going anticlockwise.
    const start: [number, number] = sx * sy > 0 ? [sx, 0] : [0, sy];
    const end: [number, number] = sx * sy > 0 ? [0, sy] : [sx, 0];
    if (!rounded) {
      points.push([cx + start[0] * half, cy + start[1] * half]);
      points.push([cx + sx * half, cy + sy * half]);
      points.push([cx + end[0] * half, cy + end[1] * half]);
      continue;
    }
    const a0 = Math.atan2(start[1], start[0]);
    let a1 = Math.atan2(end[1], end[0]);
    while (a1 < a0) a1 += Math.PI * 2;
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
    }
  }
  return clipToCircleRing(grid, cell, points, pitch);
}

/** Longest segment (mm) left in an outline before it is clipped to a ring's arc. Short enough that
 * the sampled arc sits within a few hundredths of a millimetre of the true circle at any ring size
 * this app builds. */
const RING_CLIP_STEP = 0.5;

/**
 * Re-cuts a cell outline to the arcs its ring actually builds it with — the circle counterpart of
 * the rounded-corner handling above, and for the same reason.
 *
 * A CircleSolid cell is its square INTERSECTED with the group's shared circle, and bored by the
 * inner one when the ring is hollow (see circleSolidGeometry). Handing the blend a plain square
 * therefore describes a wall that isn't there: on a round-outer ring the square's corner stands
 * 5.7mm from the cell centre where the real material stops at the arc, so the beam's outline
 * crosses an edge that only exists in the blend's arithmetic. The fillet it computes there hangs
 * over the arc in mid-air.
 *
 * Clipping is radial rather than analytic: the outline is densified and every point pulled onto
 * whichever circle it falls outside of. For a convex square against a concentric circle that IS the
 * intersection — the part outside collapses onto the arc — and it handles the hollow bore's concave
 * bite in the same pass without a second code path.
 *
 * Returns an empty outline for a cell with no material left (one entirely inside the bore), which
 * geometry.ts short-circuits in the same way.
 */
function clipToCircleRing(
  // Threaded through from cellFootprint: the ring's radii are lattice measurements.
  grid: Pick<GridState, "width" | "height" | "circles">,
  cell: Cell | undefined,
  points: [number, number][],
  pitch: number,
): [number, number][] {
  if (!cell || cell.type !== CellType.CircleSolid || !cell.circleId) return points;
  const ring = (grid.circles ?? []).find((c) => c.id === cell.circleId);
  if (!ring) return points;
  // Nothing to clip against: a square-outer ring's outer wall really is the cell square, and
  // without a bore there is no inner arc either.
  if (ring.outerSquare && !ring.hollow) return points;

  const { centreX, centreY } = ringCentreCell(ring);
  const gx = (centreX - (grid.width - 1) / 2) * pitch;
  const gy = (centreY - (grid.height - 1) / 2) * pitch;
  const outerR = ring.outerSquare ? Infinity : (ring.dimension / 2) * pitch;
  const innerR = ring.hollow ? ((ring.dimension - 1) / 2) * pitch : 0;

  const dist = (p: [number, number]) => Math.hypot(p[0] - gx, p[1] - gy);
  const far = Math.max(...points.map(dist));
  // Entirely inside the bore — the cell builds nothing, so it has no outline. Same test, same
  // reason, as buildCircleSolidGeometry's own farthest-corner short circuit.
  if (innerR > 0 && far <= innerR) return [];

  const clipped: [number, number][] = [];
  const push = (p: [number, number]) => {
    const r = Math.hypot(p[0] - gx, p[1] - gy);
    // A point exactly on the ring's centre has no direction to be pushed in — and can't arise on a
    // cell that still has material, since such a cell is wholly inside the bore and returned above.
    if (r < 1e-9) return;
    const target = r > outerR ? outerR : r < innerR ? innerR : r;
    if (target === r) {
      clipped.push(p);
      return;
    }
    clipped.push([gx + ((p[0] - gx) / r) * target, gy + ((p[1] - gy) / r) * target]);
  };

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(span / RING_CLIP_STEP));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return clipped;
}

/** The grid cell a ring is centred on — half-integer for an even dimension, which is exactly right:
 * such a ring's centre IS a cell corner. */
function ringCentreCell(ring: CircleRing): { centreX: number; centreY: number } {
  const back = (ring.dimension - 1) / 2;
  return { centreX: ring.originX + back, centreY: ring.originY + back };
}

/**
 * A beam's own footprint in world mm — its body rectangle, with a half-round at each end that has
 * one. This is what another beam's blend crosses against, and it has to be the outline that beam is
 * actually built with (see buildAngledBeamGeometry): the same body span, the same width, the same
 * decision about which ends are capped.
 */
function beamOutline(
  grid: Pick<GridState, "width" | "height" | "layers">,
  beam: AngledBeam,
  width: number,
  joinedEnds: { start: boolean; end: boolean } = { start: false, end: false },
  pitch: number = STUD_PITCH,
): [number, number][] {
  const dir = beamDirection(beam);
  const perp = { x: -dir.y, y: dir.x };
  const body = beamBodySpanStuds(beam, pitch);
  const lead = beamLeadIn(beam);
  const rounded = beam.roundedEnds ?? true;
  const across = beam.acrossOffset ?? 0;
  const ax = (beam.anchorX - (grid.width - 1) / 2) * pitch;
  const ay = (beam.anchorY - (grid.height - 1) / 2) * pitch;
  const at = (along: number, over: number): [number, number] => [
    ax + along * dir.x + (over + across) * perp.x,
    ay + along * dir.y + (over + across) * perp.y,
  ];
  const hw = width / 2;
  const from = body.from * pitch;
  const to = body.to * pitch;
  // A cap is only there when that end has no lead-in — the same rule the builder uses, since a
  // lead-in carries the body past its end hole and a cap concentric with that hole is then wrong.
  // Round in PLAN only where the built cap is: a "z" cap is a vertical cylinder and shows as a
  // half-round from above, while an in-plane one rounds top-to-bottom and leaves the plan outline
  // square. A solid end hole caps in plan whatever its bores do — see buildAngledBeamGeometry.
  const suppressed = new Set(beamSuppressedHoles(beam));
  const capsInPlan = (index: number) =>
    suppressed.has(index) ||
    (index === 0 ? joinedEnds.start : joinedEnds.end) ||
    beamHoleAxisAt(beam, index) === "z";
  const capStart = rounded && lead.start <= 0 && capsInPlan(0);
  const capEnd = rounded && lead.end <= 0 && capsInPlan(Math.max(0, beam.holes - 1));
  // A fitted end that hangs in air is built as a stadium (see buildAngledBeamGeometry), and the
  // blend has to cross against the outline the part really has — a square corner that isn't there
  // manufactures a fillet that isn't either.
  const stadiumStart = rounded && lead.start > 0 && !beamEndIsBuried(grid, beam, body.from);
  const stadiumEnd = rounded && lead.end > 0 && !beamEndIsBuried(grid, beam, body.to);
  const capRadius = Math.min(pitch / 2, hw);

  const points: [number, number][] = [];
  const arc = (centre: number, fromAngle: number, toAngle: number) => {
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const a = fromAngle + ((toAngle - fromAngle) * i) / steps;
      points.push(at(centre + Math.cos(a) * capRadius, Math.sin(a) * capRadius));
    }
  };
  // A capped end that does NOT cap in plan still reaches capRadius along the beam — its cap lies
  // across the beam and is square from above. Stopping at the hole would leave the blend crossing
  // against an outline shorter than the part.
  const flatOver = (atStart: boolean) =>
    rounded && (atStart ? lead.start <= 0 : lead.end <= 0) ? capRadius : 0;
  if (capEnd) arc(to, -Math.PI / 2, Math.PI / 2);
  else if (stadiumEnd) arc(to - capRadius, -Math.PI / 2, Math.PI / 2);
  else {
    const over = flatOver(false);
    points.push(at(to + over, -hw));
    points.push(at(to + over, hw));
  }
  if (capStart) arc(from, Math.PI / 2, (Math.PI * 3) / 2);
  else if (stadiumStart) arc(from + capRadius, Math.PI / 2, (Math.PI * 3) / 2);
  else {
    const over = flatOver(true);
    points.push(at(from - over, hw));
    points.push(at(from - over, -hw));
  }
  return points;
}
