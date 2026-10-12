import { useId, type PointerEventHandler } from "react";
import {
  furniturePolygon,
  formatLength,
  type Furniture,
  type ProjectDocument,
} from "@roomfit/core";
import { FurnitureArtwork } from "./FurnitureArtwork";

export function FurnitureShape({
  item,
  selected = false,
  status,
  names,
  units,
  onPointerDown,
}: {
  item: Furniture;
  selected?: boolean;
  status?: string;
  names?: boolean;
  units: ProjectDocument["units"];
  onPointerDown?: PointerEventHandler<SVGGElement>;
}) {
  const clipId = `footprint-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`,
    footprint = furniturePolygon(item),
    points = (p: { x: number; y: number }[]) =>
      p.map((v) => `${v.x},${v.y}`).join(" "),
    contour = item.contour || [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    outline =
      status === "error"
        ? "#c34638"
        : status === "warning"
          ? "#ba8426"
          : "#28786a";
  return (
    <g
      data-item-id={item.id}
      onPointerDown={onPointerDown}
      className={onPointerDown ? "furniture-object" : ""}
      role={onPointerDown ? "button" : undefined}
      aria-label={`${item.name}, ${formatLength(item.width, units)} × ${formatLength(item.depth, units)}`}
    >
      <defs>
        <clipPath id={clipId}>
          <polygon
            points={contour.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
          />
        </clipPath>
      </defs>
      <polygon
        points={points(footprint)}
        fill="transparent"
        pointerEvents="all"
      />
      <g
        transform={`translate(${item.x} ${item.y}) rotate(${item.angle}) translate(${-item.width / 2} ${-item.depth / 2}) scale(${item.width / 1000} ${item.depth / 1000})`}
        pointerEvents="none"
        clipPath={`url(#${clipId})`}
      >
        <FurnitureArtwork
          type={item.type}
          color={item.color}
          width={item.width}
          depth={item.depth}
          catalogId={item.catalogId}
        />
      </g>
      {(status || item.contour) && (
        <polygon
          points={points(footprint)}
          fill="none"
          stroke={status ? outline : "#7b8070"}
          strokeWidth={status ? 18 : 10}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      {selected && (
        <polygon
          points={points(furniturePolygon(item, 45))}
          fill="none"
          stroke="#28786a"
          strokeWidth="15"
          strokeDasharray="55 25"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      {names && (
        <text
          x={item.x}
          y={Math.max(...footprint.map((p) => p.y)) + 145}
          textAnchor="middle"
          fontSize="95"
          fill="#3a3936"
          pointerEvents="none"
        >
          {item.name}
        </text>
      )}
      {item.locked && (
        <text
          x={item.x}
          y={item.y}
          textAnchor="middle"
          fontSize="120"
          pointerEvents="none"
        >
          ▣
        </text>
      )}
    </g>
  );
}
