import { furnitureParts, type Furniture } from "@roomfit/core";

/** Orthographic projection of the exact primitives used by the technical 3D fallback. */
export default function FallbackArtwork({ item }: { item: Furniture }) {
  if (item.contour)
    return (
      <polygon
        points={item.contour
          .map((p) => `${p.x * 1000},${p.y * 1000}`)
          .join(" ")}
        fill={item.color}
        stroke="#77806c"
        strokeWidth={5}
      />
    );
  return (
    <>
      {furnitureParts(item)
        .sort(
          (a, b) =>
            a.position[1] + a.size[1] / 2 - b.position[1] - b.size[1] / 2,
        )
        .map((part, index) => {
          const x = (part.position[0] / (item.width / 1000) + 0.5) * 1000;
          const y = (part.position[2] / (item.depth / 1000) + 0.5) * 1000;
          const w = (part.size[0] / (item.width / 1000)) * 1000;
          const d = (part.size[2] / (item.depth / 1000)) * 1000;
          return part.kind === "box" ? (
            <rect
              key={index}
              x={x - w / 2}
              y={y - d / 2}
              width={w}
              height={d}
              rx={8}
              fill={part.color}
              stroke="#77806c"
              strokeWidth={3}
            />
          ) : (
            <ellipse
              key={index}
              cx={x}
              cy={y}
              rx={w / 2}
              ry={d / 2}
              fill={part.color}
              stroke="#77806c"
              strokeWidth={3}
            />
          );
        })}
    </>
  );
}
