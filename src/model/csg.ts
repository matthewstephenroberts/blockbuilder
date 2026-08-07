import * as THREE from "three";
import Module, { Manifold } from "manifold-3d";
// Vite's `?url` suffix resolves this to the actual served/hashed asset URL instead of trying to
// import the .wasm binary as JS — without it, Module()'s default relative-path lookup resolves
// against the dev server's own URL space and gets index.html's HTML back instead of the wasm
// binary (a "wrong MIME type" / bad magic-number error deep in Emscripten's loader).
import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";

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
