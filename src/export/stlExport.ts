import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { downloadBlob } from "./download";
import { GridState } from "../model/grid";

const exporter = new STLExporter();

export async function downloadGeometryAsSTL(
  geometry: THREE.BufferGeometry,
  filename = "blockbuilder-part.stl",
  key = filename,
  saveAs = false,
) {
  // Ensure geometry has vertices
  if (!geometry.getAttribute('position')) {
    throw new Error("Geometry has no vertex data to export");
  }

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());

  try {
    const stl = exporter.parse(mesh, { binary: true }) as unknown as DataView;
    const bytes = new Uint8Array(stl.buffer as ArrayBuffer, stl.byteOffset, stl.byteLength);
    await downloadBlob(new Blob([bytes], { type: "application/octet-stream" }), filename, key, saveAs);
  } catch (err) {
    console.error("STL export failed:", err);
    throw new Error(`Failed to export geometry as STL: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * One layer of a project, on its own, as an STL — the whole model built with every OTHER layer
 * left out, then dropped so its underside sits on Z=0.
 *
 * Printing a stack as one STL is right only when the stack is one part. A project whose layers
 * move against each other — a plate and the carousel that turns on it — is several parts sharing
 * one grid, and exporting the assembly fuses them into a single lump. The Z drop is what makes the
 * result printable without touching the slicer: a layer built in place carries the height of
 * everything beneath it, so layer 3 of a stack would arrive floating 16mm above the plate.
 */
export async function downloadLayerAsSTL(
  grid: GridState,
  layer: number,
  build: (grid: GridState, hidden: ReadonlySet<number>) => Promise<THREE.BufferGeometry>,
  filename = `blockbuilder-layer-${layer + 1}.stl`,
  saveAs = false,
) {
  const hidden = new Set(grid.layers.map((_, i) => i).filter((i) => i !== layer));
  const geometry = await build(grid, hidden);
  geometry.computeBoundingBox();
  const minZ = geometry.boundingBox?.min.z ?? 0;
  if (minZ !== 0) geometry.translate(0, 0, -minZ);
  // Each layer remembers its own file, so re-exporting layer 2 overwrites layer 2 rather than
  // landing on whatever was saved last.
  await downloadGeometryAsSTL(geometry, filename, `layer-${layer + 1}`, saveAs);
}
