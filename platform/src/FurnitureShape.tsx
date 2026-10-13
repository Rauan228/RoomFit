import { useId, type PointerEventHandler } from "react";
import {
  furnitureAsset,
  furnitureGeometry,
  furniturePoints,
  formatLength,
  type Furniture,
  type ProjectDocument,
} from "@roomfit/core";
import FallbackArtwork from "./FallbackArtwork";
import AssetArtwork from "./AssetArtwork";

export function FurnitureShape({
  item,
  selected = false,
  status,
  names,
  units,
  onPointerDown,
  displayMode = "detailed",
  thumbnail = false,
  highResolution = false,
}: {
  item: Furniture;
  selected?: boolean;
  status?: string;
  names?: boolean;
  units: ProjectDocument["units"];
  onPointerDown?: PointerEventHandler<SVGGElement>;
  displayMode?: "detailed" | "technical";
  thumbnail?: boolean;
  highResolution?: boolean;
}) {
  const clipId = `footprint-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`,
    resolved = furnitureAsset(item),
    shape = furnitureGeometry(item),
    shapePath = (geometry: typeof shape) =>
      geometry
        .map((poly) =>
          poly
            .map(
              (ring) =>
                "M " + ring.map(([x, y]) => `${x},${y}`).join(" L ") + " Z",
            )
            .join(" "),
        )
        .join(" "),
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
      <path
        d={shapePath(shape)}
        fill="transparent"
        fillRule="evenodd"
        pointerEvents="all"
      />
      <g
        transform={`translate(${item.x} ${item.y}) rotate(${item.angle}) translate(${-item.width / 2} ${-item.depth / 2}) scale(${item.width / 1000} ${item.depth / 1000})`}
        pointerEvents="none"
        clipPath={resolved ? undefined : `url(#${clipId})`}
      >
        {resolved ? (
          <AssetArtwork
            item={item}
            mode={displayMode}
            thumbnail={thumbnail}
            highResolution={highResolution}
          />
        ) : (
          <FallbackArtwork item={item} />
        )}
      </g>
      {(status || item.contour) && (
        <path
          d={shapePath(shape)}
          fill="none"
          stroke={status ? outline : "#7b8070"}
          strokeWidth={status ? 18 : 10}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      {selected && (
        <path
          d={shapePath(
            furnitureGeometry({
              ...item,
              width: item.width + 90,
              depth: item.depth + 90,
            }),
          )}
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
          y={Math.max(...furniturePoints(item).map((p) => p.y)) + 145}
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
