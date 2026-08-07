import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { downloadBlob } from "./download";

const exporter = new STLExporter();

export async function downloadGeometryAsSTL(geometry: THREE.BufferGeometry, filename = "blockbuilder-part.stl") {
  // Ensure geometry has vertices
  if (!geometry.getAttribute('position')) {
    throw new Error("Geometry has no vertex data to export");
  }

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());

  try {
    const stl = exporter.parse(mesh, { binary: true }) as unknown as DataView;
    const bytes = new Uint8Array(stl.buffer as ArrayBuffer, stl.byteOffset, stl.byteLength);
    await downloadBlob(new Blob([bytes], { type: "application/octet-stream" }), filename);
  } catch (err) {
    console.error("STL export failed:", err);
    throw new Error(`Failed to export geometry as STL: ${err instanceof Error ? err.message : String(err)}`);
  }
}
