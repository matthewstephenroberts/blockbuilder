import * as THREE from "three";
import { CellType } from "./cellTypes";
import { buildGridGeometry } from "./geometry";
import { createEmptyGrid } from "./grid";
import { getCellTypeHexColor } from "./colorMap";

/**
 * Generate a preview thumbnail for a cell type.
 * Returns a data URL that can be used as an image src.
 */
export async function generateBrushPreview(type: CellType, width: number = 60, height: number = 60, themeOverride?: 'dark' | 'light'): Promise<string> {
  // Create scene with theme-aware background
  const scene = new THREE.Scene();
  const theme = themeOverride ?? globalThis.document?.documentElement?.getAttribute('data-theme');
  const isLightTheme = theme === 'light';
  const bgColor = isLightTheme ? 0xf0f3f9 : 0x1c2230;
  scene.background = new THREE.Color(bgColor);

  // Create camera - isometric view, zoomed in on the single block
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.set(20, -20, 20);
  camera.lookAt(0, 0, 0);

  // Create renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
  directionalLight.position.set(60, -80, 120);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Create a minimal grid with single cell of the requested type
  try {
    const grid = createEmptyGrid(1, 1);
    grid.layers[0][0] = {
      type,
      axis: "x",
      flip: false,
      plateFraction: "full",
      widthFraction: undefined,
      rounded: false,
    };

    const geometry = await buildGridGeometry(grid);

    // Get hex color for this cell type
    const colorValue = getCellTypeHexColor(type);

    const material = new THREE.MeshStandardMaterial({
      color: colorValue,
      roughness: 0.45,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Render and get image data
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");

    // Cleanup
    renderer.dispose();
    geometry.dispose();
    material.dispose();

    return dataUrl;
  } catch (err) {
    console.error("Failed to generate brush preview for", type, ":", err);
    renderer.dispose();
    // Return empty string on error
    return "";
  }
}

// Cache for generated previews (includes theme in key)
const previewCache = new Map<string, string>();
const previewPromiseCache = new Map<string, Promise<string>>();

function getCacheKey(type: CellType, theme: 'dark' | 'light'): string {
  return `${type}:${theme}`;
}

function getCurrentTheme(): 'dark' | 'light' {
  const theme = globalThis.document?.documentElement?.getAttribute('data-theme');
  return theme === 'light' ? 'light' : 'dark';
}

export function clearBrushPreviewCache(): void {
  previewCache.clear();
  previewPromiseCache.clear();
}

export async function getBrushPreview(type: CellType, theme?: 'dark' | 'light'): Promise<string> {
  const currentTheme = theme ?? getCurrentTheme();
  const cacheKey = getCacheKey(type, currentTheme);

  // Check cache first
  if (previewCache.has(cacheKey)) {
    return previewCache.get(cacheKey)!;
  }

  // Check if already generating
  if (previewPromiseCache.has(cacheKey)) {
    return previewPromiseCache.get(cacheKey)!;
  }

  // Generate and cache, passing the theme explicitly to ensure it matches the cache key
  const promise = generateBrushPreview(type, 60, 60, currentTheme);
  previewPromiseCache.set(cacheKey, promise);

  try {
    const preview = await promise;
    previewCache.set(cacheKey, preview);
    return preview;
  } finally {
    previewPromiseCache.delete(cacheKey);
  }
}
