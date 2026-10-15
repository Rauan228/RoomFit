import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
  type Mesh,
  type Texture,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** A self-contained object viewer: no room editor state or second React renderer. */
export default function PhotoModelPreview({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    const element = host.current!;
    let alive = true,
      frame = 0;
    const scene = new Scene();
    scene.background = new Color("#f0efec");
    const camera = new PerspectiveCamera(38, 1, 0.01, 100);
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setState("failed");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 0.15;
    controls.maxPolarAngle = Math.PI * 0.95;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (alive) renderer.render(scene, camera);
      });
    };
    controls.addEventListener("change", draw);
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) {
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        draw();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    scene.add(new AmbientLight("#ffffff", 1.1));
    const key = new DirectionalLight("#fff4e6", 2.4);
    key.position.set(3, 5, 4);
    scene.add(key);
    const generator = new PMREMGenerator(renderer),
      studio = new RoomEnvironment();
    const environment = generator.fromScene(studio, 0.06);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.8;
    generator.dispose();
    studio.dispose();
    const lost = (e: Event) => {
      e.preventDefault();
      if (alive) setState("failed");
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    const disposeModel = (root: Scene | import("three").Group) => {
      const textures = new Set<Texture>();
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          for (const value of Object.values(material))
            if (value && typeof value === "object" && "isTexture" in value)
              textures.add(value as Texture);
          material.dispose();
        }
      });
      textures.forEach((t) => {
        t.dispose();
        if (
          typeof ImageBitmap !== "undefined" &&
          t.source.data instanceof ImageBitmap
        )
          t.source.data.close();
      });
    };
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (!alive) {
          disposeModel(gltf.scene);
          return;
        }
        scene.add(gltf.scene);
        const box = new Box3().setFromObject(gltf.scene),
          center = box.getCenter(new Vector3()),
          size = box.getSize(new Vector3());
        const span = Math.max(size.x, size.y, size.z, 0.1);
        controls.target.copy(center);
        controls.maxDistance = span * 8;
        camera.position
          .copy(center)
          .add(new Vector3(span * 1.5, span * 0.9, span * 1.7));
        camera.lookAt(center);
        controls.update();
        resize();
        setState("ready");
        draw();
      },
      undefined,
      () => {
        if (alive) setState("failed");
      },
    );
    resize();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      disposeModel(scene);
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);
  return (
    <div
      ref={host}
      className="photo-3d-viewer"
      role="img"
      aria-label="Вращаемая 3D-модель своей мебели"
      data-assets-loaded={state === "ready" ? 1 : 0}
      data-assets-failed={state === "failed" ? 1 : 0}
    >
      {state !== "ready" && (
        <p className="photo-viewer-status" role="status">
          {state === "failed"
            ? "Не удалось открыть 3D. Вид сверху и готовый рендер остаются доступны."
            : "Открываем 3D…"}
        </p>
      )}
    </div>
  );
}
