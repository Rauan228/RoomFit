import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useThree } from "@react-three/fiber";
import {
  BoxGeometry,
  CylinderGeometry,
  LineBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Material,
  type Mesh,
  type Texture,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { Room } from "@roomfit/core";

class SceneResources {
  alive = true;
  models = new Map<
    string,
    { promise: Promise<GLTF>; value?: GLTF; failed?: boolean }
  >();
  constructor(
    private onAssets?: (
      loaded: number,
      loading: number,
      failed: number,
    ) => void,
    private invalidate?: () => void,
  ) {}
  report() {
    const entries = [...this.models.values()];
    queueMicrotask(
      () =>
        this.alive &&
        this.onAssets?.(
          entries.filter((e) => e.value).length,
          entries.filter((e) => !e.value && !e.failed).length,
          entries.filter((e) => e.failed).length,
        ),
    );
  }
  model(url: string) {
    if (!this.models.has(url)) {
      const entry: { promise: Promise<GLTF>; value?: GLTF; failed?: boolean } =
        { promise: Promise.resolve(null as unknown as GLTF) };
      entry.promise = new Promise((resolve, reject) =>
        new GLTFLoader().load(
          url,
          (value) => {
            entry.value = value;
            if (!this.alive) disposeModel(value);
            this.report();
            resolve(value);
          },
          undefined,
          (error) => {
            entry.failed = true;
            this.report();
            reject(error);
          },
        ),
      );
      this.models.set(url, entry);
      this.report();
    }
    return this.models.get(url)!.promise;
  }
  assetMaterial(
    url: string,
    original: MeshStandardMaterial,
    variant: { id: string; color: string; roughness: number },
    collision = false,
  ) {
    if (original.userData.slot !== "primary" && !collision) return original;
    const key = `asset:${url}:${original.uuid}:${variant.id}:${collision}`;
    if (!this.materials.has(key)) {
      const material = original.clone();
      if (original.userData.slot === "primary") {
        material.color.set(variant.color);
        material.roughness = variant.roughness;
      }
      if (collision) {
        material.emissive.set("#782a20");
        material.emissiveIntensity = 0.12;
      }
      this.materials.set(key, material);
    }
    return this.materials.get(key)!;
  }
  geometries = {
    box: new BoxGeometry(1, 1, 1),
    cylinder: new CylinderGeometry(0.5, 0.5, 1, 20),
    sphere: new SphereGeometry(0.5, 20, 12),
  };
  materials = new Map<string, MeshStandardMaterial>();
  lines = new Map<string, LineBasicMaterial>();
  textures = new Map<string, Texture>();
  material(color: string, roughness = 0.72, metalness = 0) {
    const key = `${color}:${roughness}:${metalness}`;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new MeshStandardMaterial({ color, roughness, metalness }),
      );
    return this.materials.get(key)!;
  }
  line(color: string) {
    if (!this.lines.has(color))
      this.lines.set(color, new LineBasicMaterial({ color }));
    return this.lines.get(color)!;
  }
  floor(preset: Room["floor"]) {
    const key = `floor:${preset}`;
    if (!this.materials.has(key)) {
      const colors = {
        oak: "#bea987",
        light: "#ded8c8",
        walnut: "#806448",
        tile: "#dbddd7",
      };
      const material = new MeshStandardMaterial({
        color: colors[preset],
        roughness: preset === "tile" ? 0.5 : 0.83,
      });
      this.materials.set(key, material);
      const loader = new TextureLoader();
      for (const [file, slot] of [
        ["color.jpg", "map"],
        ["normal.png", "normalMap"],
        ["roughness.jpg", "roughnessMap"],
      ] as const) {
        const texture = loader.load(
          `/assets/materials/floors/reference-v1/${preset}/${file}`,
          (loaded) => {
            if (!this.alive) {
              loaded.dispose();
              return;
            }
            if (slot === "map") material.color.set("#ffffff");
            material[slot] = loaded;
            material.needsUpdate = true;
            this.invalidate?.();
          },
        );
        if (slot === "map") texture.colorSpace = SRGBColorSpace;
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.repeat.set(1 / 1.8, 1 / 1.8);
        texture.anisotropy = 4;
        this.textures.set(`${key}:${slot}`, texture);
      }
      material.normalScale.set(0.22, 0.22);
    }
    return this.materials.get(key)!;
  }
  dispose() {
    this.alive = false;
    this.models.forEach((entry) => entry.value && disposeModel(entry.value));
    Object.values(this.geometries).forEach((geometry) => geometry.dispose());
    this.materials.forEach((m) => m.dispose());
    this.lines.forEach((m) => m.dispose());
    this.textures.forEach((texture) => texture.dispose());
  }
}
function disposeModel(model: GLTF) {
  const geometries = new Set<Mesh["geometry"]>(),
    materials = new Set<Material>(),
    textures = new Set<Texture>();
  model.scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value && typeof value === "object" && "isTexture" in value)
          textures.add(value as Texture);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => {
    t.dispose();
    const bitmap = t.source.data;
    if (typeof ImageBitmap !== "undefined" && bitmap instanceof ImageBitmap)
      bitmap.close();
  });
}
const Resources = createContext<SceneResources | null>(null);
export function SceneResourceProvider({
  children,
  onAssets,
}: {
  children: ReactNode;
  onAssets?: (loaded: number, loading: number, failed: number) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const resources = useMemo(() => new SceneResources(onAssets, invalidate), []);
  useEffect(() => {
    resources.alive = true;
    return () => {
      resources.alive = false;
      queueMicrotask(() => {
        if (!resources.alive) resources.dispose();
      });
    };
  }, [resources]);
  return <Resources.Provider value={resources}>{children}</Resources.Provider>;
}
export function useSceneResources() {
  return useContext(Resources)!;
}
