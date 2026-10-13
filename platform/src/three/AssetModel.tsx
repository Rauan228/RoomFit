import { useEffect, useMemo, useState, type ReactNode } from "react";
import { type Mesh, type MeshStandardMaterial } from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { furnitureAsset, type Furniture } from "@roomfit/core";
import { useSceneResources } from "./resources";

export default function AssetModel({
  item,
  status,
  fallback,
}: {
  item: Furniture;
  status?: string;
  fallback: ReactNode;
}) {
  const resolved = furnitureAsset(item)!,
    resources = useSceneResources();
  const url = resolved.asset.base_url + resolved.asset.assets.model_3d;
  const [model, setModel] = useState<GLTF>();
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    let current = true;
    setModel(undefined);
    resources.model(url).then(
      (value) => {
        if (current) setModel(value);
      },
      () => {
        if (current) setFailed(url);
      },
    );
    return () => {
      current = false;
    };
  }, [resources, url]);
  const scene = useMemo(() => {
    if (!model) return;
    const cloned = model.scene.clone(true);
    cloned.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      const material = (source: MeshStandardMaterial) =>
        status === "error"
          ? resources.material("#ad6856", 0.8)
          : resources.assetMaterial(url, source, resolved.variant);
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => material(m as MeshStandardMaterial))
        : material(mesh.material as MeshStandardMaterial);
    });
    return cloned;
  }, [model, resolved.variant.id, resources, url, status]);
  if (!scene || failed === url) return fallback;
  const d = resolved.asset.dimensions;
  return (
    <primitive
      object={scene}
      scale={[
        item.width / d.width_mm,
        item.height / d.height_mm,
        item.depth / d.depth_mm,
      ]}
      dispose={null}
    />
  );
}
