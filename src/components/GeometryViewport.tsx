import { GizmoHelper, GizmoViewport, OrbitControls, Grid } from "@react-three/drei";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRef, useState, useEffect, useMemo } from "react";
import { ArrowUpFromLine, Home } from "lucide-react";
import { featureEdgesGeometry } from "../model/featureEdges";

interface Props {
  geometry: THREE.BufferGeometry;
  color?: string;
  cameraDistance?: number;
  // Only the primary 3D viewport (Viewport3D) should respond to the global triggerHomeAnimation()
  // call CatalogPanel fires on load. Nothing else mounts a GeometryViewport today, but any small
  // inline preview added later would otherwise fight over the same trigger.
  main?: boolean;
}

interface InstanceState {
  camera: THREE.PerspectiveCamera | null;
  controls: any;
  startAnimation: (anim: any) => void;
}

// Module-level so CatalogPanel (outside the R3F tree) can reach the main viewport's home handler —
// but this must point at only ONE instance's handler, never be written to by every mounted
// GeometryViewport, or a secondary inline preview would silently steal the main view's camera.
let mainTriggerHome: () => void = () => {};

export function triggerHomeAnimation(): void {
  mainTriggerHome();
}

function ViewportContent({
  geometry,
  color = "#4ea8ff",
  state,
  isDarkTheme,
}: {
  geometry: THREE.BufferGeometry;
  color?: string;
  state: InstanceState;
  isDarkTheme: boolean;
}) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const [homeAnimation, setHomeAnimation] = useState<any>(null);
  // An empty project builds a bare BufferGeometry with no attributes at all (see
  // buildGridGeometry's own early return). EdgesGeometry reads `attributes.position.count`
  // unguarded and throws on it, which took the whole canvas down with it — a blank grid is the
  // FIRST thing the app renders, so this has to be checked, not assumed.
  const hasGeometry = (geometry.attributes?.position?.count ?? 0) > 0;
  // Rebuilt only when the part is, since the extraction walks every triangle of it.
  const featureEdges = useMemo(
    () => (hasGeometry ? featureEdgesGeometry(geometry, 24) : null),
    [geometry, hasGeometry],
  );

  // Store camera and controls for home button to use — scoped to THIS instance's own state object,
  // not shared across every GeometryViewport mounted on the page (see InstanceState doc above).
  state.camera = camera as THREE.PerspectiveCamera;
  state.controls = controlsRef.current;
  state.startAnimation = setHomeAnimation;

  useFrame(() => {
    if (homeAnimation) {
      const elapsed = Date.now() - homeAnimation.startTime;
      const progress = Math.min(elapsed / homeAnimation.duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // ease-out-cubic

      camera.position.lerpVectors(homeAnimation.startPos, homeAnimation.targetPos, easeProgress);
      controlsRef.current.target.lerpVectors(homeAnimation.startTarget, homeAnimation.targetLookAt, easeProgress);
      controlsRef.current.update();

      if (progress >= 1) {
        setHomeAnimation(null);
      }
    }
  });

  return (
    <>
      {/*
        Lit so that a face's ORIENTATION is what changes its brightness. The old setup was a strong
        ambient plus one directional from high above, which lights a flat top face and a 45° ramp
        beside it to within a few percent of each other — so a chamfer, whose entire visual signature
        is a narrow band at 45°, disappeared into the face it was cut into. That made a correct
        chamfer indistinguishable from a missing one by eye.

        Ambient is dropped and replaced by a hemisphere light: sky colour from above, ground colour
        from below, so a surface's tilt shifts its HUE as well as its brightness and a ramp reads
        even where the contrast is low. The key light comes from a shallower angle for longer,
        clearer gradients across a 45° face, and a dim fill from the opposite side keeps the
        away-facing surfaces from going flat black.
      */}
      <hemisphereLight
        args={[isDarkTheme ? "#9fc7ff" : "#ffffff", isDarkTheme ? "#141a24" : "#8d9099", 0.85]}
      />
      <ambientLight intensity={0.18} />
      {/*
        A CAST shadow and a HOLE look the same when the shadow goes black: both are a dark patch
        with a hard edge sitting on a flat face. That's a real problem here, because this part
        self-shadows heavily — a raised rim throws a sharp wedge across the disc inside it, and it
        reads as a cut-out that isn't there.

        So the shadow is deliberately weak (`shadow-intensity`) rather than opaque. A shadowed face
        drops in brightness but keeps the part's own hue, while a genuine opening shows the dark
        background through it — which makes the two tell-apart-able at a glance. The bigger map and
        tightened bias keep the softened edge from acquiring its own artefacts.
      */}
      <directionalLight
        position={[70, -90, 70]}
        intensity={1.0}
        castShadow
        shadow-intensity={0.32}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0005}
        shadow-normalBias={0.4}
      />
      <directionalLight position={[-80, 60, 30]} intensity={0.3} />
      <mesh geometry={geometry} castShadow receiveShadow>
        {/* Explicit flat shading: the CSG output is already per-face (see csg.ts) but saying so
            keeps every facet's own normal even if that ever changes. Rougher and non-metallic so
            the difference between faces is the light's angle rather than a moving specular. */}
        <meshStandardMaterial color={color} roughness={0.62} metalness={0} flatShading />
      </mesh>
      {/* Feature edges over the top. This is what makes a chamfer unambiguous: a ramp is bounded by
          two hard edges, so it reads as a distinct band whatever the lighting does. The 24° threshold keeps it to real edges — a 128-segment circle's own facets are far below it, so
          curves don't turn into wireframe.

          Deliberately NOT three's own <edgesGeometry>: it also draws every edge that belongs to a
          single triangle, which on a closed solid is never a real edge, only an artifact of how the
          coplanar faces got triangulated — and it painted hairline streaks across the middle of
          flat faces. See featureEdgesGeometry. */}
      {featureEdges && (
        <lineSegments geometry={featureEdges}>
          <lineBasicMaterial
            color={isDarkTheme ? "#0b1017" : "#1d2430"}
            transparent
            opacity={isDarkTheme ? 0.45 : 0.3}
          />
        </lineSegments>
      )}
      <Grid
        args={[400, 400]}
        cellSize={8}
        sectionSize={80}
        infiniteGrid
        fadeDistance={300}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <OrbitControls makeDefault target={[0, 0, 0]} ref={controlsRef} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={["#ff6b6b", "#5fd35f", "#4ea8ff"]} labelColor="black" />
      </GizmoHelper>
    </>
  );
}

export default function GeometryViewport({ geometry, color = "#4ea8ff", cameraDistance = 120, main = false }: Props) {
  const [isDarkTheme, setIsDarkTheme] = useState(!document.documentElement.getAttribute('data-theme') ||
                                                  document.documentElement.getAttribute('data-theme') === 'dark');
  // One state object per mounted GeometryViewport — see InstanceState doc above for why this can't
  // be a module-level singleton.
  const instanceState = useRef<InstanceState>({ camera: null, controls: null, startAnimation: () => {} }).current;

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const theme = document.documentElement.getAttribute('data-theme');
      setIsDarkTheme(!theme || theme === 'dark');
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  /**
   * Frames the model from `direction` — a unit-ish vector scaled to the model's own size.
   *
   * `fromBelow` matters more than it sounds: anything cut into the part's UNDERSIDE (a slot disc's
   * bottom mouth chamfer, most obviously) is invisible from every default view, so a setting that
   * only affects the bottom face reads as doing nothing at all. Orbiting under the model by hand
   * works but nobody thinks to try it.
   */
  const frameFrom = (direction: THREE.Vector3) => {
    if (!instanceState.camera || !instanceState.controls || !instanceState.startAnimation) return;

    const camera = instanceState.camera;

    // Calculate bounding box to auto-fit view
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    if (!bbox) return;

    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Ensure minimum distance for very small models
    let cameraDistance = Math.max(maxDim * 2, 40);

    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ = Math.max(cameraZ * 1.5, cameraDistance * 0.75); // padding, ensure Z is adequate

    // Isometric angle positioned to match 2D cell editor view
    // Camera positioned from left-front-up to view the grid correctly
    const targetPos = new THREE.Vector3(
      center.x + cameraZ * direction.x,
      center.y + cameraZ * direction.y,
      center.z + cameraZ * direction.z
    );
    const targetLookAt = center;

    instanceState.startAnimation({
      startPos: camera.position.clone(),
      startTarget: instanceState.controls?.target?.clone() || new THREE.Vector3(0, 0, 0),
      targetPos,
      targetLookAt,
      startTime: Date.now(),
      duration: 500,
    });
  };

  // The established isometric home view — see COORDINATE_SYSTEM.md, which pins these exact
  // multipliers as the orientation the 2D plan is drawn to match.
  const handleHome = () => frameFrom(new THREE.Vector3(-0.67, -0.67, 0.75));
  // The same angle mirrored under the part, so the underside reads the same way round.
  const handleUnderside = () => frameFrom(new THREE.Vector3(-0.67, -0.67, -0.75));

  // Expose home trigger function for external calls (e.g., from CatalogPanel) — only the main
  // viewport instance registers itself, so no secondary preview can hijack the trigger.
  if (main) {
    mainTriggerHome = handleHome;
  }

  const bgColor = isDarkTheme ? 0x0e1116 : 0xf4f6fb;
  const bgColorHex = `#${bgColor.toString(16).padStart(6, '0')}`;

  return (
    <div className="viewport-container">
      <Canvas
        shadows
        camera={{ position: [-cameraDistance * 0.67, -cameraDistance * 0.67, cameraDistance * 0.75], up: [0, 0, 1], fov: 40 }}
        className="viewport-canvas"
      >
        <color attach="background" args={[bgColorHex]} />
        <ViewportContent geometry={geometry} color={color} state={instanceState} isDarkTheme={isDarkTheme} />
      </Canvas>
      <button
        onClick={handleHome}
        className="viewport-home-btn"
        title="Reset to isometric view"
      >
        <Home size={18} />
      </button>
      <button
        onClick={handleUnderside}
        className="viewport-home-btn viewport-underside-btn"
        title="View from underneath — the only way to see anything cut into the part's bottom face, such as a slot disc's bottom mouth chamfer."
      >
        <ArrowUpFromLine size={18} />
      </button>
    </div>
  );
}
