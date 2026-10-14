import { useEffect, useMemo } from "react";
import { BoxGeometry, EdgesGeometry } from "three";
import {
  furnitureAsset,
  furnitureParts,
  type Furniture,
  type Part,
} from "@roomfit/core";
export { furnitureParts } from "@roomfit/core";
export type { Part } from "@roomfit/core";
import AssetModel from "./AssetModel";
import { furniturePose, polygonPrism } from "./geometry";
import { useSceneResources } from "./resources";

export function PrimitivePart({
  part,
  override,
}: {
  part: Part;
  override?: string;
}) {
  const resources = useSceneResources();
  return (
    <mesh
      geometry={resources.geometries[part.kind]}
      material={resources.material(
        override || part.color,
        part.roughness,
        part.metalness,
      )}
      position={part.position}
      scale={part.size}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
export default function FurnitureMesh({
  item,
  selected,
  status,
  onSelect,
  active = true,
}: {
  item: Furniture;
  selected: boolean;
  status?: string;
  onSelect: () => void;
  active?: boolean;
}) {
  const pose = furniturePose(item),
    resources = useSceneResources();
  const outline = useMemo(() => {
    const box = new BoxGeometry(...pose.size);
    const edge = new EdgesGeometry(box);
    box.dispose();
    return edge;
  }, [item.width, item.height, item.depth]);
  const contourKey = JSON.stringify(item.contour);
  const contour = useMemo(
    () =>
      item.contour || item.height === 0
        ? polygonPrism(
            (
              item.contour || [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 1, y: 1 },
                { x: 0, y: 1 },
              ]
            ).map((p) => ({
              x: (p.x - 0.5) * item.width,
              y: (p.y - 0.5) * item.depth,
            })),
            0,
            item.height,
          )
        : null,
    [contourKey, item.width, item.depth, item.height],
  );
  useEffect(() => () => outline.dispose(), [outline]);
  useEffect(() => () => contour?.dispose(), [contour]);
  const fallback = contour ? (
    <mesh
      geometry={contour}
      renderOrder={item.height === 0 ? 2 : 0}
      material={resources.material(status === "error" ? "#ad6856" : item.color)}
      castShadow
      receiveShadow
      dispose={null}
    />
  ) : (
    furnitureParts(item).map((part, index) => (
      <PrimitivePart
        key={index}
        part={part}
        override={status === "error" ? "#ad6856" : undefined}
      />
    ))
  );
  return (
    <group
      position={pose.position}
      rotation={[0, pose.yaw, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {furnitureAsset(item) && (item.height > 0 || item.type === "rug") ? (
        <AssetModel
          item={item}
          status={status}
          fallback={fallback}
          active={active}
        />
      ) : contour ? (
        <mesh
          geometry={contour}
          position={[0, item.height === 0 ? 0.0005 : 0, 0]}
          renderOrder={item.height === 0 ? 2 : 0}
          material={resources.material(
            status === "error" ? "#ad6856" : item.color,
          )}
          castShadow
          receiveShadow
          dispose={null}
        />
      ) : (
        furnitureParts(item).map((part, index) => (
          <PrimitivePart
            key={index}
            part={part}
            override={status === "error" ? "#ad6856" : undefined}
          />
        ))
      )}
      {(selected || status === "error") && (
        <lineSegments
          geometry={outline}
          raycast={() => undefined}
          material={resources.line(
            status === "error" ? "#c7553d" : "#d8ac63",
          )}
          position={[0, item.height / 2000, 0]}
          dispose={null}
        />
      )}
    </group>
  );
}
