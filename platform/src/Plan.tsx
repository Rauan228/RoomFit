import { FurnitureShape } from "./FurnitureShape";
export { FurnitureShape } from "./FurnitureShape";
import { useId, type ReactNode } from "react";
import {
  bounds,
  distance,
  furniturePolygon,
  openingPosition,
  doorPolygons,
  formatLength,
  perimeter,
  area,
  wallPolygon,
  type Floor,
  type Furniture,
  type ProjectDocument,
  type Point,
  type Opening,
  type Wall,
} from "@roomfit/core";
export const polygonPoints = (p: Point[]) =>
  p.map((v) => `${v.x},${v.y}`).join(" ");
export function planBounds(floor: Floor, items: Furniture[] = []) {
  const b = bounds([
    ...floor.rooms.flatMap((r) => r.points),
    ...floor.walls.flatMap((w) => wallPolygon(w)),
    ...floor.openings.flatMap((o) => {
      const w = floor.walls.find((w) => w.id === o.wallId);
      return w ? doorPolygons(w, o).flat() : [];
    }),
    ...floor.measurements.flatMap((m) => [m.start, m.end]),
    ...floor.zones.flatMap((z) => z.points),
    ...floor.annotations.flatMap((a) => [
      a.point,
      { x: a.point.x + a.text.length * 100, y: a.point.y - 120 },
    ]),
    ...(floor.underlay
      ? [
          { x: floor.underlay.x, y: floor.underlay.y },
          {
            x: floor.underlay.x + floor.underlay.width,
            y: floor.underlay.y + floor.underlay.height,
          },
        ]
      : []),
    ...items
      .filter((i) => i.floorId === floor.id)
      .flatMap((i) => furniturePolygon(i)),
  ]);
  if (!Number.isFinite(b.minX))
    return { x: -400, y: -400, width: 4800, height: 4000 };
  return {
    x: b.minX - 500,
    y: b.minY - 500,
    width: b.maxX - b.minX + 1000,
    height: b.maxY - b.minY + 1000,
  };
}
export function OpeningShape({
  opening: o,
  wall: w,
  selected = false,
  onPointerDown,
}: {
  opening: Opening;
  wall: Wall;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
}) {
  const { start, end, normal, angle, u } = openingPosition(w, o),
    sweep = doorPolygons(w, o),
    inside = w.roomId ? 0 : w.thickness / 2,
    outside = w.roomId ? w.thickness : w.thickness / 2;
  return (
    <g
      data-opening-id={o.id}
      data-opening-kind={o.kind}
      onPointerDown={onPointerDown}
      style={{ cursor: onPointerDown ? "move" : undefined }}
    >
      <path
        d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
        stroke="#fffefa"
        strokeWidth={w.thickness * 2 + 15}
      />
      <path
        d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
        stroke={
          selected ? "#28786a" : o.kind === "window" ? "#6e9dba" : "#8e7a5b"
        }
        strokeWidth={o.kind === "window" ? 30 : 15}
      />
      {o.kind !== "window" &&
        sweep.map((p, i) => (
          <polygon
            key={i}
            points={polygonPoints(p)}
            fill="#dcb782"
            fillOpacity=".09"
            stroke={selected ? "#28786a" : "#ac9169"}
            strokeWidth="10"
          />
        ))}
      <g
        transform={`translate(${start.x} ${start.y}) rotate(${angle})`}
        pointerEvents="none"
      >
        {o.kind === "window" && (
          <>
            <rect
              x="8"
              y={-outside + 8}
              width={Math.max(10, o.width - 16)}
              height={Math.max(8, w.thickness - 16)}
              rx="5"
              fill="#dbeae8"
              stroke={selected ? "#28786a" : "#7e9c9b"}
              strokeWidth="12"
            />
            <path
              d={`M 15 ${-outside + w.thickness * 0.35} H ${o.width - 15} M 15 ${-outside + w.thickness * 0.65} H ${o.width - 15}`}
              stroke="#f9fcf5"
              strokeWidth="8"
            />
            <path
              d={`M ${o.width / 2} ${-outside + 6} V ${inside - 6} M -8 ${inside + 23} H ${o.width + 8}`}
              stroke="#819b95"
              strokeWidth="14"
            />
          </>
        )}
        {[0, o.width].map((x) => (
          <rect
            key={x}
            x={x - 15}
            y={-outside - 8}
            width="30"
            height={w.thickness + 16}
            rx="4"
            fill={o.kind === "window" ? "#a5b8ad" : "#c4ae89"}
            stroke={selected ? "#28786a" : "#8e8b70"}
            strokeWidth="6"
          />
        ))}
        {o.kind === "sliding" && (
          <>
            <path
              d={`M 24 ${-outside + w.thickness * 0.33} H ${o.width * 0.64} M ${o.width * 0.36} ${-outside + w.thickness * 0.67} H ${o.width - 24}`}
              stroke="#b7a283"
              strokeWidth="27"
            />
            <path
              d={`M ${o.width * 0.59} ${-outside + w.thickness * 0.33 - 20} V ${-outside + w.thickness * 0.33 + 20}`}
              stroke="#748577"
              strokeWidth="10"
            />
          </>
        )}
      </g>
      {(o.kind === "door" || o.kind === "double") &&
        (o.kind === "double"
          ? [
              { hinge: start, width: o.width / 2, flip: false },
              { hinge: end, width: o.width / 2, flip: true },
            ]
          : [{ hinge: o.flip ? end : start, width: o.width, flip: o.flip }]
        ).map((leaf, i) => {
          const endX = leaf.hinge.x + normal.x * leaf.width,
            endY = leaf.hinge.y + normal.y * leaf.width,
            handleX = leaf.hinge.x + normal.x * leaf.width * 0.84,
            handleY = leaf.hinge.y + normal.y * leaf.width * 0.84,
            side = leaf.flip ? -1 : 1;
          return (
            <g key={i} pointerEvents="none">
              <path
                d={`M ${leaf.hinge.x} ${leaf.hinge.y} L ${endX} ${endY}`}
                stroke={selected ? "#28786a" : "#9a8667"}
                strokeWidth="36"
                strokeLinecap="round"
              />
              <path
                d={`M ${leaf.hinge.x + u.x * 4} ${leaf.hinge.y + u.y * 4} L ${endX + u.x * 4} ${endY + u.y * 4}`}
                stroke="#e1cfad"
                strokeWidth="16"
                strokeLinecap="round"
              />
              <path
                d={`M ${handleX} ${handleY} L ${handleX + u.x * 50 * side} ${handleY + u.y * 50 * side}`}
                stroke="#778273"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <circle
                cx={leaf.hinge.x}
                cy={leaf.hinge.y}
                r="17"
                fill="#7b8b78"
              />
            </g>
          );
        })}
      {onPointerDown && (
        <path
          d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
          stroke="transparent"
          strokeWidth={Math.max(180, w.thickness * 2 + 60)}
        />
      )}
    </g>
  );
}
export function PlanContent({
  floor,
  items,
  doc,
  selected = [],
  selectedEntity = "",
  status = {},
  selectItem,
  selectEntity,
  children,
}: {
  floor: Floor;
  items: Furniture[];
  doc: ProjectDocument;
  selected?: string[];
  selectedEntity?: string;
  status?: Record<string, string>;
  selectItem?: (item: Furniture, e: React.PointerEvent<SVGGElement>) => void;
  selectEntity?: (
    id: string,
    kind: string,
    e: React.PointerEvent<SVGElement>,
  ) => void;
  children?: ReactNode;
}) {
  const rawId = useId(),
    id = rawId.replace(/:/g, ""),
    layers = doc.settings.layers,
    box = planBounds(floor, items),
    unit = doc.units;
  const points = (p: Point[]) => polygonPoints(p);
  return (
    <>
      <defs>
        <pattern
          id={`grid-${id}`}
          width={doc.settings.gridSize}
          height={doc.settings.gridSize}
          patternUnits="userSpaceOnUse"
        >
          <circle r="4" fill="#c5c9c3" />
        </pattern>
        <pattern
          id={`oak-${id}`}
          width="170"
          height="1400"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(0)"
        >
          <rect width="170" height="1400" fill="#eee7db" />
          <path
            d="M 0 0 H 170 V 1400 H 0 Z M 80 300 V 900 M 130 600 V 1300"
            fill="none"
            stroke="#e0d6c6"
            strokeWidth="5"
          />
        </pattern>
      </defs>
      {layers.grid && (
        <rect
          x={box.x - 20000}
          y={box.y - 20000}
          width={box.width + 40000}
          height={box.height + 40000}
          fill={`url(#grid-${id})`}
          pointerEvents="none"
        />
      )}
      {floor.rooms.map((room) => (
        <g key={room.id}>
          <polygon
            points={points(room.points)}
            fill={
              room.floor === "oak"
                ? `url(#oak-${id})`
                : room.floor === "walnut"
                  ? "#c9b299"
                  : room.floor === "tile"
                    ? "#e1e4df"
                    : "#f2efe9"
            }
            stroke="#d8d4cb"
            strokeWidth="10"
            fillOpacity={floor.underlay ? 0.65 : 1}
            onPointerDown={(e) => selectEntity?.(room.id, "room", e)}
          />
          {layers.names && (
            <text
              x={room.points.reduce((s, p) => s + p.x, 0) / room.points.length}
              y={room.points.reduce((s, p) => s + p.y, 0) / room.points.length}
              textAnchor="middle"
              fontSize="100"
              fill="#837966"
              pointerEvents="none"
            >
              {room.name} · {(area(room.points) / 1e6).toFixed(2)} м²
            </text>
          )}
        </g>
      ))}
      {layers.underlay && floor.underlay && (
        <image
          href={floor.underlay.src}
          x={floor.underlay.x}
          y={floor.underlay.y}
          width={floor.underlay.width}
          height={floor.underlay.height}
          opacity={floor.underlay.opacity}
          preserveAspectRatio="none"
          pointerEvents="none"
        />
      )}
      {layers.zones &&
        floor.zones.map((z) => (
          <polygon
            key={z.id}
            points={points(z.points)}
            fill={z.forbidden ? "#e7907e" : "#b8d9bd"}
            fillOpacity=".35"
            stroke={
              selectedEntity === z.id
                ? "#28786a"
                : z.forbidden
                  ? "#b15e4c"
                  : "#689576"
            }
            strokeWidth="12"
            strokeDasharray="45 25"
            onPointerDown={(e) => selectEntity?.(z.id, "zone", e)}
          />
        ))}
      {layers.walls &&
        floor.walls.map((w) => (
          <polygon
            key={w.id}
            data-wall-id={w.id}
            points={points(wallPolygon(w))}
            fill={selectedEntity === w.id ? "#28786a" : w.color}
            stroke={selectedEntity === w.id ? "#8dc2b5" : w.color}
            strokeWidth="8"
            onPointerDown={(e) => selectEntity?.(w.id, "wall", e)}
          />
        ))}
      {layers.openings &&
        floor.openings.map((o) => {
          const w = floor.walls.find((v) => v.id === o.wallId);
          if (!w) return null;
          return (
            <OpeningShape
              key={o.id}
              opening={o}
              wall={w}
              selected={selectedEntity === o.id}
              onPointerDown={
                selectEntity
                  ? (e) => selectEntity(o.id, "opening", e)
                  : undefined
              }
            />
          );
        })}
      {layers.furniture &&
        [...items.filter((i) => i.floorId === floor.id)]
          .sort((a, b) => Number(b.type === "rug") - Number(a.type === "rug"))
          .map((item) => (
            <FurnitureShape
              key={item.id}
              item={item}
              selected={selected.includes(item.id)}
              status={status[item.id]}
              units={unit}
              names={layers.names}
              onPointerDown={
                selectItem ? (e) => selectItem(item, e) : undefined
              }
            />
          ))}
      {layers.dimensions &&
        floor.walls
          .filter((w) => w.roomId)
          .map((w) => {
            const l = distance(w.start, w.end),
              x = (w.start.x + w.end.x) / 2,
              y = (w.start.y + w.end.y) / 2,
              a =
                (Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * 180) /
                Math.PI;
            return (
              <g
                key={`dim-${w.id}`}
                transform={`translate(${x} ${y}) rotate(${a > 90 || a <= -90 ? a + 180 : a})`}
                pointerEvents="none"
              >
                <rect
                  x="-250"
                  y="-255"
                  width="500"
                  height="130"
                  fill="#faf9f6"
                  rx="30"
                />
                <text y="-160" textAnchor="middle" fontSize="85" fill="#6c6b63">
                  {formatLength(l, unit)}
                </text>
              </g>
            );
          })}
      {layers.dimensions &&
        floor.measurements.map((m) => (
          <g
            key={m.id}
            onPointerDown={(e) => selectEntity?.(m.id, "measurement", e)}
          >
            <path
              d={`M ${m.start.x} ${m.start.y} L ${m.end.x} ${m.end.y}`}
              stroke="#28786a"
              strokeWidth="10"
              strokeDasharray="30 15"
            />
            <circle cx={m.start.x} cy={m.start.y} r="25" fill="#28786a" />
            <circle cx={m.end.x} cy={m.end.y} r="25" fill="#28786a" />
            <text
              x={(m.start.x + m.end.x) / 2}
              y={(m.start.y + m.end.y) / 2 - 55}
              textAnchor="middle"
              fontSize="95"
              fill="#28786a"
            >
              {formatLength(distance(m.start, m.end), unit)}
            </text>
          </g>
        ))}
      {layers.names &&
        floor.annotations.map((a) => (
          <text
            key={a.id}
            x={a.point.x}
            y={a.point.y}
            fontSize="120"
            fill="#403c34"
            onPointerDown={(e) => selectEntity?.(a.id, "annotation", e)}
          >
            {a.text}
          </text>
        ))}
      {children}
    </>
  );
}
export function MiniPlan({ doc }: { doc: ProjectDocument }) {
  const floor = doc.floors[0],
    items = doc.variants.find((v) => v.id === doc.activeVariantId)!.items,
    b = planBounds(floor, items);
  return (
    <svg
      className="mini-plan"
      viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`}
      aria-label="План проекта"
    >
      <PlanContent
        floor={floor}
        items={items}
        doc={{
          ...doc,
          settings: {
            ...doc.settings,
            layers: {
              ...doc.settings.layers,
              names: false,
              dimensions: false,
              grid: false,
            },
          },
        }}
      />
    </svg>
  );
}
export function roomSummary(floor: Floor) {
  return {
    area: floor.rooms.reduce((s, r) => s + area(r.points), 0) / 1e6,
    perimeter: floor.rooms.reduce((s, r) => s + perimeter(r.points), 0) / 1000,
  };
}
