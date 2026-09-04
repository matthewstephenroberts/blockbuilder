import * as THREE from "three";
import { GridState } from "./grid";
import { axleHoleGeometry, pinHoleGeometry } from "./primitives";
import {
  chamferedSides,
  effectiveChamferMm,
  isSlotOpen,
  outerRadiusMm,
  floorThicknessMm,
  pocketDepthMm,
  ringRadiusMm,
  SlotDisc,
  slotSizeMm,
} from "./slotDisc";
import { STUD_PITCH } from "./units";

const CUT_EPSILON = 0.05;
const DISC_SEGMENTS = 128;

/**
 * A square-section frustum: a lead-in ramp for a pocket mouth, running from `sizeAtZMin` up to
 * `sizeAtZMax` over `height`, centred on the origin in X/Y and starting at z = 0.
 *
 * Built from a 4-segment cylinder, whose cross-section is a square inscribed in the given radius —
 * so the radius wanted is the square's half-DIAGONAL, and the whole thing needs turning 45° to put
 * its flats on the axes rather than its corners. Cheaper and more robust than lofting a real
 * bevelled extrusion, and the shape is identical.
 */
function squareFrustum(sizeAtZMin: number, sizeAtZMax: number, height: number): THREE.BufferGeometry {
  const circumradius = (size: number) => (size / 2) * Math.SQRT2;
  const geom = new THREE.CylinderGeometry(circumradius(sizeAtZMax), circumradius(sizeAtZMin), height, 4);
  geom.rotateY(Math.PI / 4); // corners -> flats, about the cylinder's own axis
  geom.rotateX(Math.PI / 2); // +Y (the sizeAtZMax end) -> +Z
  geom.translate(0, 0, height / 2);
  return geom;
}

/**
 * Builds one slot disc (see SlotDisc): a plain cylinder, with its centre bore and its ring of
 * pockets returned as cutters rather than subtracted here.
 *
 * Same reasoning as the angled beam's vertical bores — the disc is unioned with everything else in
 * the part, so anything cut into it now would simply be filled back in by a cell painted over it.
 * Every cutter this returns runs the full height of the layer (or from a pocket's floor up through
 * the top of it), so it always breaks out at the top: cutting from the finished assembly can only
 * open a hole, never seal a cavity.
 *
 * Each pocket is rotated to face radially, so its walls are the spokes and its outer face is
 * square to the rim — which is how a block actually sits in a carousel, rather than every pocket
 * being axis-aligned and only the four on the axes looking right.
 */
export function buildSlotDiscGeometry(
  grid: Pick<GridState, "width" | "height" | "partClearance" | "holeClearance">,
  disc: SlotDisc,
  layerBase: number,
  discHeight: number,
  layerHeight: number,
  /** The disc's layer's own lattice pitch — its position, ring radius and pocket sizes follow it. */
  pitch: number = STUD_PITCH,
  /** The disc's layer's own connector scale — only its centre BORE follows this, not its lattice. */
  connectorScale = 1,
): { body: THREE.BufferGeometry; throughCutters: THREE.BufferGeometry[]; bodyCutters: THREE.BufferGeometry[] } {
  const cx = (disc.centreX - (grid.width - 1) / 2) * pitch;
  const cy = (disc.centreY - (grid.height - 1) / 2) * pitch;
  // partClearance pulls the disc's rim in — see outerRadiusMm. Only the OUTER skin: the pockets and
  // the bore keep their own fitted sizes, exactly as a cell's holes do.
  const outerR = outerRadiusMm(disc, grid.partClearance, pitch);

  // A square disc keeps the SAME half-width, so every pocket sits exactly where it does on the
  // round one and only the waste corners are filled in — that's the point of it: a round rim inside
  // a square cell footprint leaves triangular gaps at the corners, and this closes them.
  const body =
    disc.outerShape === "square"
      ? new THREE.BoxGeometry(outerR * 2, outerR * 2, discHeight)
      : (() => {
          const cyl = new THREE.CylinderGeometry(outerR, outerR, discHeight, DISC_SEGMENTS);
          cyl.rotateX(Math.PI / 2); // three's cylinder runs along Y; the disc's axis is Z
          return cyl;
        })();
  body.translate(cx, cy, layerBase + discHeight / 2);

  const throughCutters: THREE.BufferGeometry[] = [];
  // Mouth ramps are shaped into the DISC only, never into the finished assembly — see below.
  const bodyCutters: THREE.BufferGeometry[] = [];

  // Cut to the LAYER's height, not the disc's, so a taller cell sharing the layer is drilled
  // through as well rather than capping the hole part-way up — same rule the beams use.
  const boreLength = Math.max(discHeight, layerHeight);
  const boreZ = layerBase + boreLength / 2;
  if (disc.bore !== "none") {
    // The project's own print fit, exactly as a cell's or a beam's hole gets it. Missing it here
    // meant a disc's bore was the ONE hole in the model built at bare reference size however far
    // Hole clearance was turned up — an axle bore that came out tight with no setting that touched
    // it. A vertical bore takes the base clearance only (see geometry.ts's holeClearanceFor); the
    // sideways extra exists for bores printed on their side, and this one never is.
    const boreClearance = grid.holeClearance ?? 0;
    const bore = (
      disc.bore === "axleHole"
        ? axleHoleGeometry(boreLength, "z", boreClearance, connectorScale)
        : pinHoleGeometry(boreLength, "z", boreClearance, connectorScale)
    ).clone();
    bore.translate(cx, cy, boreZ);
    throughCutters.push(bore);
  }

  const size = slotSizeMm(disc, pitch);
  const ringR = ringRadiusMm(disc, pitch);
  const floor = floorThicknessMm(disc, pitch);
  // A through pocket spans the whole layer (so nothing above or below can plug it); a floored one
  // starts at its floor and still runs out through the top, which is the face a block loads from.
  const cutBottom = floor > 0 ? layerBase + floor : layerBase - CUT_EPSILON;
  const cutTop = layerBase + boreLength + CUT_EPSILON;
  const cutHeight = cutTop - cutBottom;

  // Reaching past the rim opens the pocket through the outer edge; otherwise it stops inside it.
  const radialLength = disc.openOuter ? outerR - ringR + size / 2 + CUT_EPSILON * 2 : size;
  // Grown outward only, so the pocket's INNER face stays put and the hub wall isn't eaten into.
  const radialCentre = disc.openOuter ? ringR - size / 2 + radialLength / 2 : ringR;

  // Which faces get a ramp is the user's choice (see chamferedSides); how BIG the ramp is doesn't
  // depend on that choice — see effectiveChamferMm.
  // Measured against the DISC's own material, not the cutter's span — see pocketDepthMm.
  const sides = chamferedSides(disc);
  const chamfer = effectiveChamferMm(disc, pocketDepthMm(disc, discHeight, pitch));
  // The mouths sit at the disc's own faces, not at the cutter's ends — the cutter deliberately
  // overshoots past both (see cutBottom/cutTop) so it always breaks out, and a chamfer placed at
  // the overshoot would be cut off in mid-air outside the material.
  const topFace = layerBase + discHeight;
  const bottomFace = layerBase;

  for (let i = 0; i < disc.slots; i++) {
    // A closed position still counts toward the ring's spacing — it just isn't cut. That's what
    // lets a gate plate share the carousel's geometry exactly while opening only one of them.
    if (!isSlotOpen(disc, i)) continue;
    const angle = ((disc.startAngleDeg + (360 / disc.slots) * i) * Math.PI) / 180;
    // Built along +X — its own radial direction — then swung round to this pocket's angle, so the
    // box's length axis stays radial and its width stays tangential whatever the angle is.
    const place = (piece: THREE.BufferGeometry, z: number, into: THREE.BufferGeometry[]) => {
      piece.translate(radialCentre, 0, z);
      piece.rotateZ(angle);
      piece.translate(cx, cy, 0);
      into.push(piece);
    };

    const pocket = new THREE.BoxGeometry(radialLength, size, cutHeight);
    place(pocket, cutBottom + cutHeight / 2, throughCutters);

    if (chamfer > 0) {
      // These go to bodyCutters, NOT throughCutters. A ramp is a lead-in shaped into the disc's own
      // face; a through cutter is subtracted from the WHOLE assembly, and a ramp flares outward at a
      // shallow angle, so as a through cutter it also shaved thin triangular nicks out of any solid
      // cell sharing the disc's face plane — visible as scattered triangular facets around the
      // pockets. Cutting it into the disc alone means a cell painted over the disc simply fills the
      // ramp back in, which is the right answer: an unexposed face has no mouth to chamfer.
      // Widest at the face and narrowing inward, so a block meets a ramp rather than an edge.
      // Stretched radially when the pocket is elongated (openOuter) so the ramp still spans it —
      // which scales the radial chamfer with it. Harmless: that end has broken through the rim, so
      // its ramp is cosmetic, while the tangential chamfer a block actually lands on is exact. In
      // the normal case radialLength === size and the scale is 1.
      const stretch = radialLength / size;
      for (const side of sides) {
        const ramp =
          side === "top"
            ? squareFrustum(size, size + chamfer * 2, chamfer)
            : squareFrustum(size + chamfer * 2, size, chamfer);
        ramp.scale(stretch, 1, 1);
        place(ramp, side === "top" ? topFace - chamfer : bottomFace, bodyCutters);
      }
    }
  }

  return { body, throughCutters, bodyCutters };
}
