import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import {
  openingPosition,
  type Floor,
  type Opening,
  type Room,
  type Wall,
} from "@roomfit/core";
import { polygonPrism, wallGeometry } from "./geometry";
import { PrimitivePart, type Part } from "./FurnitureMesh";
import { useSceneResources } from "./resources";

export function RoomMesh({
  room,
  onSelect,
}: {
  room: Room;
  onSelect: () => void;
}) {
  const resources = useSceneResources(),
    key = JSON.stringify(room.points);
  const geometry = useMemo(() => polygonPrism(room.points, -80, 0), [key]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      material={resources.floor(room.floor)}
      receiveShadow
      dispose={null}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    />
  );
}
function OpeningMesh({ wall, opening }: { wall: Wall; opening: Opening }) {
  const position = openingPosition(wall, opening);
  const width = opening.width / 1000,
    height = opening.height / 1000,
    thickness = wall.thickness / 1000;
  const sill = opening.kind === "window" ? opening.sill / 1000 : 0;
  const z = wall.roomId ? -thickness / 2 : 0;
  const frame = Math.min(0.045, width * 0.08, height * 0.08);
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    depth: number,
    color = "#d5c5a9",
  ): Part => ({ kind: "box", size: [w, h, d], position: [x, y, depth], color });
  const frameParts = [
    box(frame, height, thickness + 0.025, frame / 2, height / 2, z),
    box(frame, height, thickness + 0.025, width - frame / 2, height / 2, z),
    box(width, frame, thickness + 0.025, width / 2, height - frame / 2, z),
  ];
  if (opening.kind === "window")
    frameParts.push(
      box(width, frame, thickness + 0.025, width / 2, frame / 2, z),
      box(frame, height, 0.06, width / 2, height / 2, z),
    );
  const hinge = opening.flip ? width : 0;
  const turn =
    ((opening.flip ? 1 : -1) * (opening.inward ? 1 : -1) * Math.PI) / 2;
  return (
    <group
      position={[position.start.x / 1000, sill, position.start.y / 1000]}
      rotation={[0, (-position.angle * Math.PI) / 180, 0]}
    >
      {frameParts.map((part, i) => (
        <PrimitivePart key={i} part={part} />
      ))}
      {opening.kind === "window" ? (
        <mesh position={[width / 2, height / 2, z]}>
          <boxGeometry args={[width - frame * 2, height - frame * 2, 0.005]} />
          <meshPhysicalMaterial
            color="#b9dbdf"
            transparent
            opacity={0.23}
            roughness={0.08}
            metalness={0}
            depthWrite={false}
          />
        </mesh>
      ) : opening.kind === "sliding" ? (
        <>
          <PrimitivePart
            part={box(
              width / 2 - frame,
              height - frame,
              0.025,
              width * 0.25,
              (height - frame) / 2,
              z - 0.035,
            )}
          />
          <PrimitivePart
            part={box(
              width / 2 - frame,
              height - frame,
              0.025,
              width * 0.75,
              (height - frame) / 2,
              z + 0.035,
            )}
          />
        </>
      ) : opening.kind === "double" ? (
        [false, true].map((flip) => (
          <group
            key={String(flip)}
            position={[flip ? width : 0, 0, 0]}
            rotation={[
              0,
              ((flip ? 1 : -1) * (opening.inward ? 1 : -1) * Math.PI) / 2,
              0,
            ]}
          >
            <PrimitivePart
              part={box(
                width / 2 - frame,
                height - frame,
                0.035,
                ((flip ? -1 : 1) * (width / 2 - frame)) / 2,
                (height - frame) / 2,
                0,
              )}
            />
          </group>
        ))
      ) : (
        <group position={[hinge, 0, 0]} rotation={[0, turn, 0]}>
          <PrimitivePart
            part={box(
              width - frame * 2,
              height - frame,
              0.035,
              ((opening.flip ? -1 : 1) * (width - frame * 2)) / 2,
              (height - frame) / 2,
              0,
            )}
          />
          <PrimitivePart
            part={box(
              0.085,
              0.015,
              0.065,
              (opening.flip ? -1 : 1) * width * 0.83,
              height * 0.48,
              0.018,
              "#6a746d",
            )}
          />
        </group>
      )}
    </group>
  );
}
export function WallMesh({
  wall,
  floor,
  cutaway,
  center,
  onSelect,
}: {
  wall: Wall;
  floor: Floor;
  cutaway: boolean;
  center: [number, number, number];
  onSelect: () => void;
}) {
  const ref = useRef<Group>(null),
    resources = useSceneResources();
  const key = JSON.stringify([
    wall,
    floor.openings.filter((o) => o.wallId === wall.id),
    floor.walls.map((w) => [w.id, w.roomId, w.start, w.end, w.thickness]),
  ]);
  const geometry = useMemo(
    () => wallGeometry(wall, floor.openings, floor.walls),
    [key],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    const dx = wall.end.x - wall.start.x,
      dz = wall.end.y - wall.start.y;
    const middleX = (wall.start.x + wall.end.x) / 2000 - center[0],
      middleZ = (wall.start.y + wall.end.y) / 2000 - center[2];
    const side =
      -dz * (camera.position.x - middleX) + dx * (camera.position.z - middleZ);
    ref.current.visible = !cutaway || !wall.roomId || side >= -0.01;
  });
  return (
    <group
      ref={ref}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {geometry && (
        <mesh
          geometry={geometry}
          material={resources.material(
            wall.color === "#34383c" ? "#e4e2d7" : wall.color,
            0.94,
          )}
          castShadow
          receiveShadow
          dispose={null}
        />
      )}
      {floor.openings
        .filter((o) => o.wallId === wall.id)
        .map((opening) => (
          <OpeningMesh key={opening.id} wall={wall} opening={opening} />
        ))}
    </group>
  );
}
