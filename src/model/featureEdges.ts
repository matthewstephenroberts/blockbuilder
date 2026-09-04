import * as THREE from "three";

/**
 * The part's genuine feature edges — the creases where two faces meet at more than `thresholdDeg`.
 *
 * A drop-in replacement for three's own `EdgesGeometry`, differing in one deliberate way: an edge
 * that belongs to only ONE triangle is DISCARDED rather than emitted.
 *
 * That single difference is the whole point. EdgesGeometry treats an unpaired edge as a boundary of
 * an open surface and always draws it, which is right for a plane or a ribbon and wrong for
 * everything this app builds — every part here is a closed solid, so a genuine boundary edge cannot
 * exist. Any unpaired edge is therefore an artifact of how the mesh happens to be triangulated, and
 * drawing it puts a hairline dark streak across the middle of a flat face.
 *
 * They arise because cell boxes are built deliberately oversized so neighbours overlap (see
 * CELL_OVERLAP), which leaves an auto-filled plate's top as one large coplanar face stitched from
 * dozens of 0.05mm seams. Retriangulating that leaves T-junctions — a vertex from one triangle
 * sitting partway along a neighbour's edge — so the long edge A–C never pairs with the A–B and B–C
 * that cover it, and all three read as "boundary". The solid itself is perfectly closed; only the
 * edge extraction was fooled. Skipping unpaired edges costs nothing real: on a closed solid every
 * true crease is shared by exactly two faces and still comes through.
 *
 * Vertices are matched on their rounded position rather than their index, so the welding this needs
 * works on the non-indexed, per-face-duplicated geometry the CSG pipeline produces (see csg.ts).
 */
export function featureEdgesGeometry(geometry: THREE.BufferGeometry, thresholdDeg = 24): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const position = geometry.attributes.position;
  if (!position || position.count === 0) return out;

  const pos = position.array as ArrayLike<number>;
  const index = geometry.index?.array as ArrayLike<number> | undefined;
  const triCount = (index ? index.length : position.count) / 3;
  const vertexAt = (corner: number) => (index ? index[corner] : corner) * 3;

  // 1e-4mm buckets: far finer than any feature these parts have, but coarse enough that two
  // corners meant to be the same point survive float32 round-tripping through the CSG engine.
  const key = (o: number) => `${Math.round(pos[o] * 1e4)},${Math.round(pos[o + 1] * 1e4)},${Math.round(pos[o + 2] * 1e4)}`;

  interface Edge { a: number; b: number; faces: number; n: THREE.Vector3[] }
  const edges = new Map<string, Edge>();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const o = [vertexAt(t * 3), vertexAt(t * 3 + 1), vertexAt(t * 3 + 2)];
    ab.set(pos[o[1]] - pos[o[0]], pos[o[1] + 1] - pos[o[0] + 1], pos[o[1] + 2] - pos[o[0] + 2]);
    ac.set(pos[o[2]] - pos[o[0]], pos[o[2] + 1] - pos[o[0] + 1], pos[o[2] + 2] - pos[o[0] + 2]);
    const normal = new THREE.Vector3().crossVectors(ab, ac);
    // A zero-area triangle has no meaningful normal — including it would compare a crease against
    // a direction that is really just float noise.
    if (normal.lengthSq() === 0) continue;
    normal.normalize();

    const k = [key(o[0]), key(o[1]), key(o[2])];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (k[i] === k[j]) continue; // collapsed edge
      const id = k[i] < k[j] ? `${k[i]}|${k[j]}` : `${k[j]}|${k[i]}`;
      const existing = edges.get(id);
      if (existing) {
        existing.faces++;
        existing.n.push(normal);
      } else {
        edges.set(id, { a: o[i], b: o[j], faces: 1, n: [normal] });
      }
    }
  }

  const cosLimit = Math.cos((thresholdDeg * Math.PI) / 180);
  const verts: number[] = [];
  for (const edge of edges.values()) {
    // Exactly two faces, or it is not an edge of this solid's surface: one face means a
    // triangulation artifact (see the doc above), three or more means non-manifold geometry, and
    // neither describes a crease worth drawing.
    if (edge.faces !== 2) continue;
    if (edge.n[0].dot(edge.n[1]) > cosLimit) continue; // too shallow to read as an edge
    verts.push(pos[edge.a], pos[edge.a + 1], pos[edge.a + 2], pos[edge.b], pos[edge.b + 1], pos[edge.b + 2]);
  }

  out.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  return out;
}
