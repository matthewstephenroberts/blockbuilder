import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildGridGeometry } from "../model/geometry";
import { GridState } from "../model/grid";
import GeometryViewport from "./GeometryViewport";

// Rebuilding the full model (including several CSG boolean ops per hole/pin cell) is not cheap,
// and a paint drag fires many grid updates a second — rebuilding synchronously on every one of
// those blocked the main thread and made painting feel laggy. Debouncing the rebuild lets the 2D
// grid (cheap) update instantly on every cell while the 3D viewport only regenerates once the
// user pauses, which is the expensive part anyway.
const REBUILD_DEBOUNCE_MS = 150;

export default function Viewport3D({ grid, hiddenLayers }: { grid: GridState; hiddenLayers?: ReadonlySet<number> }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      buildGridGeometry(grid, hiddenLayers)
        .then((geom) => {
          if (!cancelled) setGeometry(geom);
        })
        // Without this, a failed CSG boolean rejects into nothing: `geometry` stays undefined, this
        // component renders null, and the viewport goes completely blank (no model, not even the
        // reference grid) with no clue why — which reads exactly like a hang and cost real debugging
        // time once already. Keep the last good geometry on screen and say what happened instead.
        .catch((err) => {
          console.error("[BlockBuilder] geometry build failed:", err);
        });
    }, REBUILD_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [grid, hiddenLayers]);

  if (!geometry) return null;
  // Calculate bounding box to determine proper camera distance
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  const bboxSize = bbox ? bbox.getSize(new THREE.Vector3()) : null;
  const maxDim = bboxSize ? Math.max(bboxSize.x, bboxSize.y, bboxSize.z) : Math.max(grid.width, grid.height) * 8;
  const cameraDistance = Math.max(maxDim * 2, Math.max(grid.width, grid.height) * 8);

  return <GeometryViewport geometry={geometry} cameraDistance={cameraDistance} main />;
}
