import * as THREE from "three";
import Module, { Manifold } from "manifold-3d";
// Vite's `?url` suffix resolves this to the actual served/hashed asset URL instead of trying to
// import the .wasm binary as JS — without it, Module()'s default relative-path lookup resolves
// against the dev server's own URL space and gets index.html's HTML back instead of the wasm
// binary (a "wrong MIME type" / bad magic-number error deep in Emscripten's loader).
import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";
import { CELL_OVERLAP } from "./units";

// Every previous CSG attempt in this codebase went through three-bvh-csg, whose BSP-based
// triangle splitting turned out to leave T-junctions (a vertex sits mid-edge on one side of a
// seam but not the other) in essentially every boolean result — confirmed even for the simplest
// possible case (a plain box minus a plain cylinder), in both the pinned version and the newest
// release. Many mesh-manifold checks (and some slicers) flag those as non-manifold edges even
// though there's no actual gap. manifold-3d is built around a different guarantee entirely: its
// constructor throws if a mesh isn't a valid oriented 2-manifold, and every boolean op is
// guaranteed to preserve that — there's no "mostly watertight" output to debug here.
//
// The one cost is that it's a WASM module with an async init, so every CSG operation in this
// codebase (holes, pin/ball-pin flex slots, corner rounding) is now async where it used to be
// synchronous — callers await a Promise<BufferGeometry> instead of getting one back directly.

let modulePromise: ReturnType<typeof Module> | undefined;

function getModule() {
  if (!modulePromise) {
    modulePromise = Module({ locateFile: () => manifoldWasmUrl }).then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return modulePromise;
}

/** Converts a (position-only is fine) BufferGeometry into a Manifold, applying no transform of its own — bake any translate/rotate into the geometry first. */
async function toManifold(geom: THREE.BufferGeometry): Promise<InstanceType<typeof Manifold>> {
  const wasm = await getModule();
  const indexed = geom.index ? geom : mergeToIndexed(geom);
  const position = indexed.attributes.position;
  const vertProperties = new Float32Array(position.array as ArrayLike<number>);
  const triVerts = new Uint32Array(indexed.index!.array as ArrayLike<number>);
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties, triVerts });
  mesh.merge();
  return new wasm.Manifold(mesh);
}

/** three's own `mergeVertices` needs an indexed *or* non-indexed source but always fine either way; this just guarantees an index exists, since Manifold's Mesh requires triVerts. */
function mergeToIndexed(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geom.attributes.position;
  const count = position.count;
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;
  const indexed = geom.clone();
  indexed.setIndex(new THREE.BufferAttribute(indices, 1));
  return indexed;
}

function fromManifold(manifold: InstanceType<typeof Manifold>): THREE.BufferGeometry {
  const mesh = manifold.getMesh();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(mesh.vertProperties), mesh.numProp));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));
  // manifold-3d returns a fully-welded indexed mesh — a box corner has ONE vertex shared by three
  // faces pointing in three different directions. computeVertexNormals() on that indexed form
  // averages all of them together, smearing every hard edge (box corners, the rim of a hole) into
  // a smooth blob instead of the real part's crisp flat plastic faces. Converting to non-indexed first
  // duplicates each triangle's own vertices so nothing is shared between faces any more — then
  // computeVertexNormals() has nothing left to average and just gives each triangle its own flat
  // face normal, which is also the geometrically correct choice for an STL-bound shape: STL itself
  // has no smoothing information, only per-triangle facets.
  const flat = geom.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

async function op(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
  run: (a: InstanceType<typeof Manifold>, b: InstanceType<typeof Manifold>) => InstanceType<typeof Manifold>,
): Promise<THREE.BufferGeometry> {
  const [ma, mb] = await Promise.all([toManifold(a), toManifold(b)]);
  const result = run(ma, mb);
  const geom = fromManifold(result);
  ma.delete();
  mb.delete();
  result.delete();
  return geom;
}

export async function subtract(a: THREE.BufferGeometry, b: THREE.BufferGeometry): Promise<THREE.BufferGeometry> {
  return op(a, b, (ma, mb) => ma.subtract(mb));
}

export async function union(a: THREE.BufferGeometry, b: THREE.BufferGeometry): Promise<THREE.BufferGeometry> {
  return op(a, b, (ma, mb) => ma.add(mb));
}

export async function intersect(a: THREE.BufferGeometry, b: THREE.BufferGeometry): Promise<THREE.BufferGeometry> {
  return op(a, b, (ma, mb) => ma.intersect(mb));
}

/**
 * A Z-axis cylinder built by manifold ITSELF, cut against `geom` — never a THREE.CylinderGeometry
 * converted across.
 *
 * The difference is the seam. A triangle-mesh cylinder has to close its ring of segments
 * somewhere, and THREE's builds that closure by DUPLICATING the vertex column there (it needs two
 * texture coordinates for one position). Welding on the way in gets most of it, but where that
 * column lands on a cut the boolean can still leave a hairline crease instead of continuous
 * surface — one vertical groove down an otherwise perfect ring, always at the same bearing,
 * showing on the outer wall and the bore alike, and present in the exported STL as well as the
 * preview. Confirmed by rotating the seam: the groove moved with it.
 *
 * manifold's own cylinder is a closed solid with a single vertex column at the closure, so there
 * is nothing there for a boolean to catch on.
 *
 * @param cx - Cylinder centre in world mm; its axis runs along Z through this point.
 */
async function cylinderOp(
  geom: THREE.BufferGeometry,
  radius: number,
  height: number,
  cx: number,
  cy: number,
  cz: number,
  segments: number,
  run: (a: InstanceType<typeof Manifold>, b: InstanceType<typeof Manifold>) => InstanceType<typeof Manifold>,
): Promise<THREE.BufferGeometry> {
  const wasm = await getModule();
  const ma = await toManifold(geom);
  // center: true puts it on the origin, so one translate lands it — manifold's cylinder runs along
  // Z already, unlike THREE's, so there is no rotation to bake in either.
  const raw = wasm.Manifold.cylinder(height, radius, radius, segments, true);
  const mb = raw.translate([cx, cy, cz]);
  const result = run(ma, mb);
  const out = fromManifold(result);
  ma.delete();
  raw.delete();
  mb.delete();
  result.delete();
  return out;
}

/** Keeps only what falls INSIDE the cylinder — see cylinderOp on why the cylinder is built here. */
export async function intersectCylinderZ(
  geom: THREE.BufferGeometry,
  radius: number,
  height: number,
  cx: number,
  cy: number,
  cz: number,
  segments: number,
): Promise<THREE.BufferGeometry> {
  return cylinderOp(geom, radius, height, cx, cy, cz, segments, (a, b) => a.intersect(b));
}

/** Bores the cylinder out of `geom` — see cylinderOp. */
export async function subtractCylinderZ(
  geom: THREE.BufferGeometry,
  radius: number,
  height: number,
  cx: number,
  cy: number,
  cz: number,
  segments: number,
): Promise<THREE.BufferGeometry> {
  return cylinderOp(geom, radius, height, cx, cy, cz, segments, (a, b) => a.subtract(b));
}

export async function unionAll(geoms: THREE.BufferGeometry[]): Promise<THREE.BufferGeometry> {
  if (geoms.length === 0) return new THREE.BufferGeometry();
  const wasm = await getModule();
  const manifolds = await Promise.all(geoms.map(toManifold));
  const result = wasm.Manifold.union(manifolds);
  const geom = fromManifold(result);
  for (const m of manifolds) m.delete();
  result.delete();
  return geom;
}

/** A closed 2D contour in world mm, as manifold's CrossSection wants it. */
export type Contour = [number, number][];

/**
 * True corner fillets between two footprints: the material to ADD at every concave corner the two
 * make where they cross, and the material to REMOVE at every convex one.
 *
 * This works from the CROSSING POINTS of the two outlines, not from a global offset of their union,
 * and that is the whole point. Morphological close/open produces a correct fillet at a corner, but
 * it cannot tell a corner from a gap: `close` fills any concave gap narrower than twice the radius,
 * so as the radius grows it starts webbing across openings in the design that were never corners,
 * leaving a tapering tongue between two surfaces that never met. Which radii do that depends on
 * what gaps the part happens to contain — on the sample frame it was fine at 1.5mm and 2.5mm and
 * silvered at 1mm and 3mm — so it is not something a threshold can fix.
 *
 * A crossing point cannot bridge anything: it exists only where the two outlines actually meet.
 *
 * At each crossing the union's boundary turns through some angle φ between the two edges meeting
 * there. The material occupies that φ wedge at a convex corner and the air occupies it at a concave
 * one, so the same shape serves both — the tip out to the tangent points, less the arc that is
 * tangent to both edges — and only the sign differs: added at a concave corner, taken away at a
 * convex one.
 *
 * Corners belonging to one part alone are skipped: they are found by their coordinates surviving
 * from the input, since a boolean only invents vertices where edges cross. That is also what keeps
 * the 0.2mm seams between neighbouring cell bodies harmless — a beam crossing one makes two
 * crossings a fraction of a millimetre apart, and the clamp below sizes their fillets to the edges
 * available, which is next to nothing.
 */
/** Below this tangent distance a corner is not worth filleting — see its use. */
const MIN_FILLET_TANGENT = 0.3;

export async function footprintBlend(
  /** One of the two footprints being joined — the beam. */
  partA: Contour[],
  /** The other — the blocks it runs into. Give these EXACTLY as the part will be built. */
  partB: Contour[],
  radius: number,
  height: number,
  baseZ: number,
  /**
   * Ground a blend may not cover — the plan footprint of anything hollow it would otherwise grow
   * across. A fillet is computed from outlines, which know nothing about holes, so at a corner
   * beside one it happily lays material over the opening; and a bore clipped to its own part's
   * width cannot reach out to cut it away again, leaving a film across the mouth.
   */
  exclude: Contour[] = [],
): Promise<{ fill: THREE.BufferGeometry | null; carve: THREE.BufferGeometry | null }> {
  if (radius <= 0 || partA.length === 0 || partB.length === 0) return { fill: null, carve: null };
  const wasm = await getModule();
  const CS = wasm.CrossSection;
  const a = new CS(partA, "Positive");
  const b = new CS(partB, "Positive");
  const union = a.add(b);

  // A vertex the boolean invented is a crossing; one carried over from an input is a corner that
  // part already had on its own and is none of our business.
  const key = (p: readonly number[]) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
  const original = new Set<string>();
  for (const poly of [...partA, ...partB]) for (const pt of poly) original.add(key(pt));

  const fillPolys: [number, number][][] = [];
  const carvePolys: [number, number][][] = [];

  for (const contour of union.toPolygons()) {
    const n = contour.length;
    if (n < 3) continue;

    for (let i = 0; i < n; i++) {
      const v = contour[i];
      if (original.has(key(v))) continue;
      const prev = contour[(i - 1 + n) % n];
      const next = contour[(i + 1) % n];

      // How far the flat face actually runs from this corner, in each direction. Walking to the
      // NEXT VERTEX is not the same thing: the union's contour carries a vertex at every break,
      // including ones where the boundary carries straight on — a block corner the beam's wall
      // passes, the far side of a 0.2mm seam — so measuring to it clamped every fillet to about a
      // millimetre and the radius stopped doing anything. Collinear runs are followed through.
      const runFrom = (step: number): { u: number[]; len: number; shared: boolean } | null => {
        let idx = i;
        let acc = 0;
        let dir: number[] | null = null;
        let end = i;
        for (let guard = 0; guard < n; guard++) {
          const from = contour[((idx % n) + n) % n];
          const to = contour[(((idx + step) % n) + n) % n];
          const e = [to[0] - from[0], to[1] - from[1]];
          const l = Math.hypot(e[0], e[1]);
          if (l < 1e-9) {
            idx += step;
            continue;
          }
          const u = [e[0] / l, e[1] / l];
          if (dir === null) dir = u;
          else if (dir[0] * u[0] + dir[1] * u[1] < Math.cos(0.02)) break; // turned: face ends here
          acc += l;
          idx += step;
          end = idx;
        }
        // Whether the far end of this face is another crossing, and so will want a fillet of its
        // own out of the same run.
        const far = contour[(((end % n) + n) % n)];
        return dir === null ? null : { u: dir, len: acc, shared: !original.has(key(far)) };
      };
      const run1 = runFrom(-1);
      const run2 = runFrom(1);
      if (!run1 || !run2) continue;
      const u1 = run1.u;
      const u2 = run2.u;
      const l1 = run1.len;
      const l2 = run2.len;
      const phi = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
      // Straight through, or doubled back on itself: no corner to round either way.
      if (phi < 0.02 || phi > Math.PI - 0.02) continue;

      // A left turn is a convex corner, on EVERY contour. Outer contours come back anticlockwise
      // and holes clockwise precisely so that material is on the left throughout, which is what
      // makes one rule serve both: a hole's corners are traversed as right turns and are concave
      // for the material, exactly as the test says.
      //
      // Inverting this for holes — which looks right until you check it — flipped every corner on
      // them. It stayed hidden while cell squares were built undersized and disjoint, so the
      // corners that mattered all sat on outer contours; building them at CELL_BUILT_HALF makes
      // them overlap into one region with a hole down the middle, and every fillet on that hole
      // silently became a cut.
      const turn = (v[0] - prev[0]) * (next[1] - v[1]) - (v[1] - prev[1]) * (next[0] - v[0]);
      const convex = turn > 0;

      // Tangent distance for the asked-for radius, clamped to the edges actually available — half
      // of each, so two fillets sharing an edge can never run into each other. The radius follows
      // the clamp rather than the other way round.
      const half = Math.tan(phi / 2);
      let t = radius / half;
      // A fillet may use a whole face, but only HALF of one whose far end is another crossing —
      // that corner wants a fillet out of the same run and the two must not eat into each other.
      // Halving unconditionally was what pinned every fillet to about 2mm however large a radius
      // was asked for: the faces here are 4.7mm and 18mm, and most of them are shared with nothing.
      t = Math.min(t, run1.shared ? l1 / 2 : l1, run2.shared ? l2 / 2 : l2);
      // Below this a "fillet" is not one — it is the crossing where a beam clips the 0.2mm seam
      // between two cell bodies, or something equally incidental. Skipping them at source is
      // cleaner than making them and filtering the crumbs out afterwards.
      if (t < MIN_FILLET_TANGENT) continue;
      const r = t * half;

      const t1: [number, number] = [v[0] + u1[0] * t, v[1] + u1[1] * t];
      const t2: [number, number] = [v[0] + u2[0] * t, v[1] + u2[1] * t];
      const bis = [u1[0] + u2[0], u1[1] + u2[1]];
      const bl = Math.hypot(bis[0], bis[1]);
      if (bl < 1e-9) continue;
      const d = r / Math.sin(phi / 2);
      const c = [v[0] + (bis[0] / bl) * d, v[1] + (bis[1] / bl) * d];

      // The tip, less the arc tangent to both edges: swept the short way round, which is the way
      // that passes nearest the corner.
      const a1 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
      const a2 = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
      let delta = a2 - a1;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const steps = Math.max(4, Math.ceil((Math.abs(delta) / (Math.PI / 2)) * 12));
      const poly: [number, number][] = [[v[0], v[1]], t1];
      for (let k = 1; k < steps; k++) {
        const ang = a1 + (delta * k) / steps;
        poly.push([c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r]);
      }
      poly.push(t2);
      (convex ? carvePolys : fillPolys).push(poly);
    }
  }

  // Voids the join ENCLOSES, as opposed to corners it makes.
  //
  // A corner fillet can only ever round a void's corners; it cannot close it. Where a diagonal beam
  // runs along a stepped edge — the staircase of square cells a circle is built from is exactly
  // this — each step traps a triangle of air between the beam's wall and the two cell faces, and
  // those triangles come back as HOLES in the union. Rounding their corners leaves the hole; what
  // the join wants is the hole gone.
  //
  // Two tests decide it, and between them they are why this is not the morphological close the
  // header warns about:
  //
  //  - The void must be narrower than the blend everywhere: eroding it by the radius leaves
  //    nothing. A real opening in the design survives its own erosion and is left alone, so the
  //    radius keeps meaning what it says instead of becoming a size threshold in disguise.
  //  - The void must touch BOTH parts. A void enclosed by one part alone is that part's own
  //    business — a lightening pocket, a bore, the ring's own bore — and filling it would be
  //    editing the design rather than finishing a join.
  const holeFills: [number, number][][] = [];
  // Purely a short circuit: a void this much larger than the blend cannot survive the erosion test
  // anyway, and the ring bores this runs into are thousands of square millimetres.
  const maxNotchArea = (2 * radius) * (2 * radius) * 16;
  for (const contour of union.toPolygons()) {
    if (contour.length < 3) continue;
    let twice = 0;
    for (let i = 0; i < contour.length; i++) {
      const p = contour[i];
      const q = contour[(i + 1) % contour.length];
      twice += p[0] * q[1] - q[0] * p[1];
    }
    // Holes come back wound the opposite way to outer contours — see the corner loop's own note on
    // why material is always on the left.
    if (twice >= 0) continue;
    const area = -twice / 2;
    if (area > maxNotchArea) continue;
    const asRegion: [number, number][] = contour.map((p) => [p[0], p[1]] as [number, number]).reverse();

    const holeCs = new CS([asRegion], "Positive");
    const eroded = holeCs.offset(-radius, "Round");
    const narrow = eroded.isEmpty();
    eroded.delete();
    if (!narrow) {
      holeCs.delete();
      continue;
    }
    // Touching is tested with a hair of growth: the void's edges lie ON the two parts' walls, and
    // two regions that merely share a boundary intersect in nothing.
    const grown = holeCs.offset(0.05, "Round");
    const touchA = grown.intersect(a);
    const touchB = grown.intersect(b);
    const joins = !touchA.isEmpty() && !touchB.isEmpty();
    touchA.delete();
    touchB.delete();
    grown.delete();
    holeCs.delete();
    if (joins) holeFills.push(asRegion);
  }
  if (holeFills.length > 0) fillPolys.push(...holeFills);

  const keepOut = exclude.length > 0 ? new CS(exclude, "Positive") : null;
  const toGeom = (polys: [number, number][][], grow: boolean, pad: number) => {
    if (polys.length === 0) return null;
    const raw = new CS(polys, "Positive");
    const cs = keepOut ? raw.subtract(keepOut) : raw;
    if (cs !== raw) raw.delete();
    // A fillet built this way ABUTS the part along its two straight edges — it shares their faces
    // rather than overlapping them, and two solids that merely touch are not reliably one solid.
    // Growing it and clipping the growth to the material it grew into gives it a real bite while
    // leaving its own arc exactly where it was placed.
    const solidified = grow ? cs.offset(CELL_OVERLAP, "Round").intersect(cs.add(union)) : cs;
    if (solidified.isEmpty()) {
      cs.delete();
      if (solidified !== cs) solidified.delete();
      return null;
    }
    const m = solidified.extrude(height + pad * 2);
    const moved = m.translate([0, 0, baseZ - pad]);
    const geom = fromManifold(moved);
    m.delete();
    moved.delete();
    cs.delete();
    if (solidified !== cs) solidified.delete();
    return geom;
  };

  // The carve is grown a hair in Z so it breaks cleanly out of the top and bottom faces rather than
  // ending exactly on them, which is the usual way a coplanar cut leaves a zero-thickness shell.
  const fill = toGeom(fillPolys, true, 0);
  const carve = toGeom(carvePolys, false, CELL_OVERLAP);

  keepOut?.delete();
  a.delete();
  b.delete();
  union.delete();
  return { fill, carve };
}
