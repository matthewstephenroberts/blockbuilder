import * as THREE from "three";
import { buildGridGeometry } from "./geometry";
import { GridState } from "./grid";

// A single reused WebGL context, snapshotted per part into a data URL — one offscreen canvas,
// drawn into each item's own <canvas> via drawImage, rather than mounting one live WebGL context
// per thumbnail, which runs into the browser's per-page context limit once the catalog has more
// than a handful of entries.
let renderer: THREE.WebGLRenderer | null = null;

function getRenderer(size: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  }
  renderer.setSize(size, size, false);
  return renderer;
}

/** Builds the part's mesh and renders one static isometric snapshot, returned as a PNG data URL. */
export async function renderCatalogThumbnail(grid: GridState, size = 96): Promise<string> {
  const geometry = await buildGridGeometry(grid);

  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.5, metalness: 0.05 });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(40, -60, 90);
  scene.add(light);

  const span = Math.max(grid.width, grid.height, grid.layers.length, 1);
  const distance = span * 10 + 14;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, distance * 10);
  camera.up.set(0, 0, 1);
  // Camera position matches main viewport: left-front-up isometric view
  camera.position.set(-distance * 0.67, -distance * 0.67, distance * 0.75);
  camera.lookAt(0, 0, 0);

  const gl = getRenderer(size);
  gl.setClearColor(0x000000, 0);
  gl.render(scene, camera);
  const dataUrl = gl.domElement.toDataURL("image/png");

  geometry.dispose();
  material.dispose();
  return dataUrl;
}
