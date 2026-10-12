import { useId, type PointerEventHandler, type ReactNode } from "react";
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
  const w = item.width,
    d = item.depth,
    outline =
      status === "error"
        ? "#c34638"
        : status === "warning"
          ? "#ba8426"
          : "#796f60";
  return (
    <g
      data-item-id={item.id}
      onPointerDown={onPointerDown}
      className={onPointerDown ? "furniture-object" : ""}
      role={onPointerDown ? "button" : undefined}
      aria-label={`${item.name}, ${formatLength(w, units)} × ${formatLength(d, units)}`}
    >
      <polygon
        points={polygonPoints(furniturePolygon(item))}
        fill={item.color}
        fillOpacity={item.type === "rug" ? 0.5 : 1}
        stroke={outline}
        strokeWidth={selected ? 24 : 12}
        strokeLinejoin="round"
      />
      <g
        transform={`translate(${item.x} ${item.y}) rotate(${item.angle})`}
        pointerEvents="none"
        stroke={outline}
        strokeWidth="10"
        fill="none"
      >
        {item.type === "bed" && (
          <>
            <rect
              x={-w / 2 + 40}
              y={-d / 2 + 45}
              width={w - 80}
              height={d - 90}
              rx="45"
            />
            <path d={`M ${-w / 2 + 50} ${-d / 2 + 440} H ${w / 2 - 50}`} />
            <rect
              x={-w / 2 + 90}
              y={-d / 2 + 90}
              width={w > 1100 ? w / 2 - 140 : w - 180}
              height="280"
              rx="45"
              fill="#f6f2ea"
            />
            {w > 1100 && (
              <rect
                x="50"
                y={-d / 2 + 90}
                width={w / 2 - 140}
                height="280"
                rx="45"
                fill="#f6f2ea"
              />
            )}
          </>
        )}
        {item.type === "sofa" && (
          <>
            <rect
              x={-w / 2 + 130}
              y={-d / 2 + 180}
              width={w - 260}
              height={d - 230}
              rx="55"
            />
            <path
              d={`M 0 ${-d / 2 + 180} V ${d / 2 - 50} M ${-w / 2 + 120} ${-d / 2 + 40} H ${w / 2 - 120}`}
            />
          </>
        )}
        {item.type === "wardrobe" && (
          <>
            <path d={`M 0 ${-d / 2} V ${d / 2}`} />
            <circle cx="-65" cy="40" r="15" />
            <circle cx="65" cy="40" r="15" />
          </>
        )}
        {["desk", "table", "coffee", "nightstand"].includes(item.type) && (
          <rect
            x={-w / 2 + 40}
            y={-d / 2 + 40}
            width={w - 80}
            height={d - 80}
            rx="35"
          />
        )}
        {["chair", "armchair"].includes(item.type) && (
          <>
            <rect
              x={-w / 2 + 60}
              y={-d / 2 + 90}
              width={w - 120}
              height={d - 140}
              rx="60"
            />
            <path d={`M ${-w / 2 + 50} ${-d / 2 + 50} H ${w / 2 - 50}`} />
          </>
        )}
        {item.type === "plant" && (
          <>
            <circle r={w * 0.38} fill="#789a70" />
            {[0, 60, 120].map((a) => (
              <ellipse
                key={a}
                ry={d * 0.32}
                rx={w * 0.13}
                transform={`rotate(${a})`}
                fill="#a6bea0"
              />
            ))}
          </>
        )}
        {item.type === "rug" && (
          <rect
            x={-w / 2 + 65}
            y={-d / 2 + 65}
            width={w - 130}
            height={d - 130}
            strokeDasharray="30 25"
          />
        )}
        {item.type === "bath" && (
          <rect
            x={-w / 2 + 65}
            y={-d / 2 + 65}
            width={w - 130}
            height={d - 130}
            rx="200"
            fill="#f5f5ee"
          />
        )}
        {item.type === "sink" && (
          <ellipse rx={w * 0.32} ry={d * 0.32} fill="#f5f5ee" />
        )}
      </g>
      {selected && (
        <polygon
          points={polygonPoints(furniturePolygon(item, 45))}
          fill="none"
          stroke="#28786a"
          strokeWidth="15"
          strokeDasharray="55 25"
          pointerEvents="none"
        />
      )}
      {names && (
        <text
          x={item.x}
          y={item.y + item.depth / 2 + 130}
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
          const { start, end, normal } = openingPosition(w, o),
            sweep = doorPolygons(w, o);
          return (
            <g
              key={o.id}
              onPointerDown={(e) => selectEntity?.(o.id, "opening", e)}
              style={{ cursor: selectEntity ? "pointer" : undefined }}
            >
              <path
                d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                stroke="#fffefa"
                strokeWidth={w.thickness * 2 + 15}
              />
              <path
                d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                stroke={
                  selectedEntity === o.id
                    ? "#28786a"
                    : o.kind === "window"
                      ? "#6e9dba"
                      : "#8e7a5b"
                }
                strokeWidth={o.kind === "window" ? 30 : 15}
              />
              {o.kind === "window" ? (
                <path
                  d={`M ${start.x + normal.x * 40} ${start.y + normal.y * 40} L ${end.x + normal.x * 40} ${end.y + normal.y * 40}`}
                  stroke="#6e9dba"
                  strokeWidth="15"
                />
              ) : (
                sweep.map((p, i) => (
                  <polygon
                    key={i}
                    points={points(p)}
                    fill="#dcb782"
                    fillOpacity=".12"
                    stroke="#ac9169"
                    strokeWidth="10"
                  />
                ))
              )}
            </g>
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
