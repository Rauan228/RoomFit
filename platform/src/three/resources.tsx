import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  LineBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
} from "three";
import type { Room } from "@roomfit/core";

class SceneResources {
  geometries = {
    box: new BoxGeometry(1, 1, 1),
    cylinder: new CylinderGeometry(0.5, 0.5, 1, 20),
    sphere: new SphereGeometry(0.5, 20, 12),
  };
  materials = new Map<string, MeshStandardMaterial>();
  lines = new Map<string, LineBasicMaterial>();
  textures = new Map<string, CanvasTexture>();
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
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      const colors = {
        oak: "#bea987",
        light: "#ded8c8",
        walnut: "#806448",
        tile: "#dbddd7",
      };
      ctx.fillStyle = colors[preset];
      ctx.fillRect(0, 0, 256, 256);
      if (preset === "tile") {
        ctx.strokeStyle = "#f6f5ef";
        ctx.lineWidth = 2;
        for (let n = 0; n <= 256; n += 128) {
          ctx.beginPath();
          ctx.moveTo(n, 0);
          ctx.lineTo(n, 256);
          ctx.moveTo(0, n);
          ctx.lineTo(256, n);
          ctx.stroke();
        }
      } else {
        for (let x = 0; x < 256; x += 32) {
          ctx.fillStyle = x % 64 ? "#ffffff08" : "#00000008";
          ctx.fillRect(x, 0, 32, 256);
          ctx.fillStyle = "#62523f26";
          ctx.fillRect(x, 0, 1, 256);
        }
        ctx.strokeStyle = "#5d493b16";
        ctx.lineWidth = 0.6;
        for (let n = 0; n < 170; n++) {
          const x = (n * 47) % 256;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(
            x + Math.sin(n) * 4,
            85,
            x + Math.cos(n) * 3,
            165,
            x,
            256,
          );
          ctx.stroke();
        }
      }
      const texture = new CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(
        preset === "tile" ? 1 : 1.6,
        preset === "tile" ? 1 : 0.7,
      );
      texture.colorSpace = SRGBColorSpace;
      this.textures.set(key, texture);
      this.materials.set(
        key,
        new MeshStandardMaterial({
          map: texture,
          roughness: preset === "tile" ? 0.4 : 0.8,
        }),
      );
    }
    return this.materials.get(key)!;
  }
  dispose() {
    Object.values(this.geometries).forEach((geometry) => geometry.dispose());
    this.materials.forEach((m) => m.dispose());
    this.lines.forEach((m) => m.dispose());
    this.textures.forEach((texture) => texture.dispose());
  }
}
const Resources = createContext<SceneResources | null>(null);
export function SceneResourceProvider({ children }: { children: ReactNode }) {
  const resources = useMemo(() => new SceneResources(), []);
  useEffect(() => () => resources.dispose(), [resources]);
  return <Resources.Provider value={resources}>{children}</Resources.Provider>;
}
export function useSceneResources() {
  return useContext(Resources)!;
}
