import {
  Component,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Canvas,
  events,
  useFrame,
  useThree,
  type RootState,
} from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  type Object3D,
  type WebGLRenderer,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { RotateCcw, Box, ChevronDown } from "lucide-react";
import type { Floor, Furniture } from "@roomfit/core";
import { sceneBounds } from "./geometry";
import FurnitureMesh from "./FurnitureMesh";
import { RoomMesh, WallMesh } from "./RoomMeshes";
import { SceneResourceProvider } from "./resources";
import "./three.css";

type Quality = "low" | "medium" | "high";
export interface Scene3DProps {
  floor: Floor;
  items: Furniture[];
  selected: string[];
  status: Record<string, string>;
  active: boolean;
  onSelect: (id: string, kind: "item" | "room" | "wall") => void;
  onClear: () => void;
  onBack: () => void;
}
function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}
function Fallback({ onBack }: { onBack: () => void }) {
  return (
    <div className="three-fallback" role="status">
      <Box size={34} />
      <h2>3D сейчас недоступен</h2>
      <p>
        Браузер не смог открыть графическую сцену. Можно продолжить работу с
        проектом в 2D.
      </p>
      <button className="primary" onClick={onBack}>
        Вернуться в 2D
      </button>
    </div>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode; onBack: () => void; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? (
      <Fallback onBack={this.props.onBack} />
    ) : (
      this.props.children
    );
  }
}
function CameraRig({
  span,
  reset,
  floorId,
  active,
}: {
  span: number;
  reset: number;
  floorId: string;
  active: boolean;
}) {
  const { camera, invalidate, size } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const lastFrame = useRef("");
  useEffect(() => {
    if (!size.width || !size.height) return;
    const frame = `${floorId}:${span}:${reset}:${size.width}:${size.height}`;
    if (lastFrame.current === frame) return;
    lastFrame.current = frame;
    const factor = size.width < size.height ? 1.5 : 1;
    camera.position.set(
      span * 1.05 * factor,
      span * 0.85 * factor,
      span * 1.05 * factor,
    );
    controls.current?.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    controls.current?.update();
    invalidate();
  }, [span, reset, floorId, camera, invalidate, size.width, size.height]);
  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 0, 0]}
      enableDamping
      dampingFactor={0.09}
      minDistance={0.3}
      maxDistance={span * 8}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 - 0.04}
      enabled={active}
    />
  );
}
function sceneEvents(store: Parameters<typeof events>[0]) {
  return {
    ...events(store),
    filter: (hits: Parameters<NonNullable<RootState["events"]["filter"]>>[0]) =>
      hits.filter(({ object }) => {
        // Three.js raycasting also hits invisible meshes. Cutaway walls must let clicks through.
        for (let node: Object3D | null = object; node; node = node.parent)
          if (!node.visible) return false;
        return true;
      }),
  };
}
function FirstFrame({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (!done.current) {
      done.current = true;
      queueMicrotask(onReady);
    }
  });
  return null;
}
function ContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}
export default function Scene3D(props: Scene3DProps) {
  const { floor, selected, active, onSelect, onClear, onBack, status } = props;
  const items = props.items.filter((item) => item.floorId === floor.id);
  const [available] = useState(supportsWebGL),
    [lost, setLost] = useState(false),
    [ready, setReady] = useState(false);
  const [quality, setQuality] = useState<Quality>(() =>
    matchMedia("(max-width: 760px)").matches ? "low" : "medium",
  );
  const [cutaway, setCutaway] = useState(true),
    [reset, setReset] = useState(0);
  const [assets, setAssets] = useState({ loaded: 0, loading: 0, failed: 0 });
  const onAssets = useCallback(
    (loaded: number, loading: number, failed: number) =>
      setAssets({ loaded, loading, failed }),
    [],
  );
  const frame = useMemo(() => sceneBounds(floor, items), [floor, props.items]);
  const span = frame.span;
  return (
    <section
      className="three-host"
      hidden={!active}
      aria-label="3D-план комнаты"
      data-scene-ready={ready ? "true" : "false"}
      data-assets-loaded={assets.loaded}
      data-assets-loading={assets.loading}
      data-assets-failed={assets.failed}
    >
      {!available || lost ? (
        <Fallback onBack={onBack} />
      ) : (
        <>
          <SceneBoundary onBack={onBack} onFailure={() => setLost(true)}>
            <Canvas
              events={sceneEvents}
              shadows={quality !== "low" ? { type: PCFShadowMap } : false}
              frameloop={active ? "demand" : "never"}
              dpr={quality === "low" ? 1 : quality === "high" ? 2 : 1.5}
              camera={{
                position: [6, 6, 6],
                fov: 45,
                near: 0.01,
                far: Math.max(200, span * 20),
              }}
              gl={{
                antialias: true,
                alpha: false,
                toneMapping: ACESFilmicToneMapping,
              }}
              fallback={<Fallback onBack={onBack} />}
              onPointerMissed={() => onClear()}
              onCreated={({ gl }) => {
                (gl as WebGLRenderer).toneMappingExposure = 1.1;
              }}
            >
              <color attach="background" args={["#efeee7"]} />
              <hemisphereLight args={["#fff9ef", "#a7aa91", 2.1]} />
              <directionalLight
                position={[-span * 0.7, span * 1.9, -span * 0.8]}
                intensity={3.1}
                castShadow={quality !== "low"}
                shadow-mapSize={[
                  quality === "high" ? 2048 : 1024,
                  quality === "high" ? 2048 : 1024,
                ]}
                shadow-camera-left={-span}
                shadow-camera-right={span}
                shadow-camera-top={span}
                shadow-camera-bottom={-span}
                shadow-camera-far={span * 6}
                shadow-normalBias={0.02}
              />
              <CameraRig
                span={span}
                reset={reset}
                floorId={floor.id}
                active={active}
              />
              <ContextGuard onLost={() => setLost(true)} />
              <FirstFrame onReady={() => setReady(true)} />
              <SceneResourceProvider onAssets={onAssets}>
                <group position={[-frame.center[0], 0, -frame.center[2]]}>
                  {floor.rooms.map((room) => (
                    <RoomMesh
                      key={room.id}
                      room={room}
                      onSelect={() => onSelect(room.id, "room")}
                    />
                  ))}
                  {floor.walls.map((wall) => (
                    <WallMesh
                      key={wall.id}
                      wall={wall}
                      floor={floor}
                      center={frame.center}
                      cutaway={cutaway}
                      onSelect={() => onSelect(wall.id, "wall")}
                    />
                  ))}
                  {items.map((item) => (
                    <FurnitureMesh
                      key={item.id}
                      item={item}
                      selected={selected.includes(item.id)}
                      status={status[item.id]}
                      onSelect={() => onSelect(item.id, "item")}
                    />
                  ))}
                </group>
              </SceneResourceProvider>
            </Canvas>
          </SceneBoundary>
          {!ready && (
            <div className="three-loading" role="status">
              Строим 3D-сцену…
            </div>
          )}
          <div className="three-caption">
            <span className="three-badge">
              <Box size={14} /> 3D · ранний доступ
            </span>
            {(assets.loading > 0 || assets.failed > 0) && (
              <span role="status">
                {assets.loading
                  ? `Загружаем модели: ${assets.loading}…`
                  : "Часть моделей недоступна — показан упрощённый вид."}
              </span>
            )}
            <span>
              Вращай обзор мышью или пальцем. Выбери предмет, чтобы изменить
              свойства.
            </span>
          </div>
          <div className="three-controls">
            <label>
              <input
                type="checkbox"
                checked={cutaway}
                onChange={(event) => setCutaway(event.target.checked)}
              />{" "}
              Срез стен
            </label>
            <label className="three-quality">
              Качество
              <select
                aria-label="Качество 3D"
                value={quality}
                onChange={(event) => setQuality(event.target.value as Quality)}
              >
                <option value="low">Быстрое</option>
                <option value="medium">Обычное</option>
                <option value="high">Высокое</option>
              </select>
            </label>
            <button
              className="icon"
              aria-label="Сбросить 3D-камеру"
              onClick={() => setReset((n) => n + 1)}
            >
              <RotateCcw size={18} />
            </button>
          </div>
          <details className="three-objects">
            <summary>
              Объекты · {items.length}
              <ChevronDown size={14} />
            </summary>
            <div>
              {items.length ? (
                items.map((item) => (
                  <button
                    key={item.id}
                    data-item-3d={item.id}
                    className={selected.includes(item.id) ? "active" : ""}
                    onClick={() => onSelect(item.id, "item")}
                  >
                    <span>{item.name}</span>
                    <small>
                      {Math.round(item.width / 10)} ×{" "}
                      {Math.round(item.depth / 10)} ×{" "}
                      {Math.round(item.height / 10)} см
                    </small>
                  </button>
                ))
              ) : (
                <p>Добавь мебель из каталога.</p>
              )}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
