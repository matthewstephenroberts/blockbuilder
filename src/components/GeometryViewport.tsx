import { GizmoHelper, GizmoViewport, OrbitControls, Grid } from "@react-three/drei";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRef, useState, useEffect } from "react";
import { Home } from "lucide-react";

interface Props {
  geometry: THREE.BufferGeometry;
  color?: string;
  cameraDistance?: number;
  // Only the primary 3D viewport (Viewport3D) should respond to the global triggerHomeAnimation()
  // call CatalogPanel fires on load — PinPanel renders its own small preview instance and must not
  // fight over the same trigger.
  main?: boolean;
}

interface InstanceState {
  camera: THREE.PerspectiveCamera | null;
  controls: any;
  startAnimation: (anim: any) => void;
}

// Module-level so CatalogPanel (outside the R3F tree) can reach the main viewport's home handler —
// but this must point at only ONE instance's handler, never be written to by every mounted
// GeometryViewport, or PinPanel's small preview silently steals control of the main view's camera.
let mainTriggerHome: () => void = () => {};

export function triggerHomeAnimation(): void {
  mainTriggerHome();
}

function ViewportContent({
  geometry,
  color = "#4ea8ff",
  state,
}: {
  geometry: THREE.BufferGeometry;
  color?: string;
  state: InstanceState;
}) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const [homeAnimation, setHomeAnimation] = useState<any>(null);

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
      <ambientLight intensity={0.6} />
      <directionalLight position={[60, -80, 120]} intensity={1.1} castShadow />
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
      </mesh>
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

  const handleHome = () => {
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
      center.x - cameraZ * 0.67,
      center.y - cameraZ * 0.67,
      center.z + cameraZ * 0.75
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

  // Expose home trigger function for external calls (e.g., from CatalogPanel) — only the main
  // viewport instance registers itself, so PinPanel's preview never hijacks the trigger.
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
        <ViewportContent geometry={geometry} color={color} state={instanceState} />
      </Canvas>
      <button
        onClick={handleHome}
        className="viewport-home-btn"
        title="Reset to isometric view"
      >
        <Home size={18} />
      </button>
    </div>
  );
}
