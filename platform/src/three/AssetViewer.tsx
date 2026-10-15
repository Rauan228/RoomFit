import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ACESFilmicToneMapping, PCFSoftShadowMap } from "three";
import { CATALOG, instantiate, type AssetMetadata } from "@roomfit/core";
import AssetModel from "./AssetModel";
import { SceneResourceProvider } from "./resources";
import StudioLighting from "./StudioLighting";

/** Single-model studio view: the same GLB, materials and lighting as the editor. */
export default function AssetViewer({
  asset,
  variant,
  onAssets,
}: {
  asset: AssetMetadata;
  variant: string;
  onAssets?: (loaded: number, loading: number, failed: number) => void;
}) {
  const d = asset.dimensions;
  const w = d.width_mm / 1000,
    h = Math.max(d.height_mm / 1000, 0.05),
    depth = d.depth_mm / 1000;
  const span = Math.max(w, h, depth);
  const item = useMemo(() => {
    const catalog = CATALOG.find((c) => c.id === asset.asset_id)!;
    return {
      ...instantiate(catalog, crypto.randomUUID(), { x: 0, y: 0 }),
      materialVariant: variant,
      color: asset.material_variants.find((v) => v.id === variant)!.color,
      // A flat rug is shown with its real pile height.
      height: d.height_mm,
    };
  }, [asset, variant]);
  return (
    <Canvas
      key={asset.asset_id}
      shadows={{ type: PCFSoftShadowMap }}
      frameloop="demand"
      dpr={[1, 2]}
      camera={{
        position: [span * 1.25, span * 0.95 + h * 0.3, span * 1.55],
        fov: 35,
        near: 0.01,
        far: 100,
      }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
    >
      <color attach="background" args={["#f0efec"]} />
      <StudioLighting />
      <hemisphereLight args={["#fffaf3", "#bbb8b2", 0.65]} />
      <directionalLight
        position={[-span * 1.2, span * 2.6, span * 1.4]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span * 1.5}
        shadow-camera-right={span * 1.5}
        shadow-camera-top={span * 1.5}
        shadow-camera-bottom={-span * 1.5}
        shadow-normalBias={0.02}
        shadow-bias={-0.0002}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[span * 3, 64]} />
        <shadowMaterial transparent opacity={0.16} />
      </mesh>
      <SceneResourceProvider onAssets={onAssets}>
        <AssetModel
          item={item}
          fallback={
            <mesh position={[0, h / 2, 0]}>
              <boxGeometry args={[w, h, depth]} />
              <meshStandardMaterial color="#d8d4cc" />
            </mesh>
          }
        />
      </SceneResourceProvider>
      <OrbitControls
        makeDefault
        target={[0, h * 0.45, 0]}
        enableDamping
        dampingFactor={0.09}
        minDistance={span * 0.25}
        maxDistance={span * 6}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  );
}
