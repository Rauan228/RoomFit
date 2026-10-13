import {
  bounds,
  distance,
  furniturePoints,
  wallPolygon,
  type Floor,
  type Furniture,
  type Opening,
  type Point,
  type Wall,
} from "@roomfit/core";
import {
  ExtrudeGeometry,
  Shape,
  ShapeGeometry,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const MM_TO_M = 0.001;
export const toWorld = (point: Point, height = 0): [number, number, number] => [
  point.x * MM_TO_M,
  height * MM_TO_M,
  point.y * MM_TO_M,
];
export const furniturePose = (item: Furniture) => ({
  position: toWorld(item, item.elevation || 0),
  yaw: (-item.angle * Math.PI) / 180,
  size: [item.width * MM_TO_M, item.height * MM_TO_M, item.depth * MM_TO_M] as [
    number,
    number,
    number,
  ],
});

const samePoint = (a: Point, b: Point) => distance(a, b) < 0.01;
function lineIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point | null {
  const ax = b.x - a.x,
    ay = b.y - a.y,
    bx = d.x - c.x,
    by = d.y - c.y;
  const divisor = ax * by - ay * bx;
  if (Math.abs(divisor) < 1e-8) return null;
  const t = ((c.x - a.x) * by - (c.y - a.y) * bx) / divisor;
  return { x: a.x + t * ax, y: a.y + t * ay };
}
/** Interior wall faces stay exactly on the core's room boundary. */
export function wallFootprint(wall: Wall, walls: Wall[]) {
  const points = wallPolygon(wall);
  if (!wall.roomId) return points;
  for (const [vertex, index] of [
    [wall.start, 3],
    [wall.end, 2],
  ] as const) {
    const neighbour = walls.find(
      (other) =>
        other.id !== wall.id &&
        other.roomId === wall.roomId &&
        (samePoint(vertex, other.start) || samePoint(vertex, other.end)),
    );
    if (!neighbour) continue;
    const adjacent = wallPolygon(neighbour);
    const join = lineIntersection(
      points[3],
      points[2],
      adjacent[3],
      adjacent[2],
    );
    if (
      join &&
      distance(join, vertex) <=
        5 * Math.max(wall.thickness, neighbour.thickness)
    )
      points[index] = join;
  }
  return points;
}
function clipAlong(
  points: Point[],
  wall: Wall,
  offset: number,
  keepAfter: boolean,
) {
  const length = distance(wall.start, wall.end);
  const u = {
    x: (wall.end.x - wall.start.x) / length,
    y: (wall.end.y - wall.start.y) / length,
  };
  const signed = (p: Point) =>
    ((p.x - wall.start.x) * u.x + (p.y - wall.start.y) * u.y - offset) *
    (keepAfter ? 1 : -1);
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      da = signed(a),
      db = signed(b);
    if (da >= -1e-8) result.push(a);
    if (da < 0 !== db < 0) {
      const t = da / (da - db);
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return result;
}
export interface WallPart {
  points: Point[];
  bottom: number;
  top: number;
}
/** Complement of real openings: no opaque geometry is left across an aperture. */
export function wallSolidParts(wall: Wall, openings: Opening[], walls: Wall[]) {
  const length = distance(wall.start, wall.end);
  if (length < 0.01) return [];
  const cuts = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({
      start: Math.max(0, o.offset),
      end: Math.min(length, o.offset + o.width),
      bottom: o.kind === "window" ? o.sill : 0,
      top: (o.kind === "window" ? o.sill : 0) + o.height,
    }))
    .filter((o) => o.end > o.start);
  const xs = [
    ...new Set([0, length, ...cuts.flatMap((o) => [o.start, o.end])]),
  ].sort((a, b) => a - b);
  const footprint = wallFootprint(wall, walls),
    parts: WallPart[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const start = xs[i],
      end = xs[i + 1],
      middle = (start + end) / 2;
    let points = footprint;
    if (start > 0) points = clipAlong(points, wall, start, true);
    if (end < length) points = clipAlong(points, wall, end, false);
    if (points.length < 3) continue;
    const holes = cuts
      .filter((o) => middle > o.start && middle < o.end)
      .sort((a, b) => a.bottom - b.bottom);
    let bottom = 0;
    for (const hole of holes) {
      const before = Math.max(0, Math.min(wall.height, hole.bottom));
      if (before > bottom) parts.push({ points, bottom, top: before });
      bottom = Math.max(bottom, Math.min(wall.height, hole.top));
    }
    if (bottom < wall.height) parts.push({ points, bottom, top: wall.height });
  }
  return parts;
}
export function polygonPrism(points: Point[], bottom: number, top: number) {
  const shape = new Shape();
  points.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x * MM_TO_M, -p.y * MM_TO_M);
    else shape.lineTo(p.x * MM_TO_M, -p.y * MM_TO_M);
  });
  shape.closePath();
  const geometry =
    top === bottom
      ? new ShapeGeometry(shape)
      : new ExtrudeGeometry(shape, {
          depth: Math.max(0, top - bottom) * MM_TO_M,
          bevelEnabled: false,
          steps: 1,
          curveSegments: 1,
        });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom * MM_TO_M, 0);
  return geometry;
}
export function wallGeometry(
  wall: Wall,
  openings: Opening[],
  walls: Wall[],
): BufferGeometry | null {
  const parts = wallSolidParts(wall, openings, walls).map((part) =>
    polygonPrism(part.points, part.bottom, part.top),
  );
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return merged;
}
export function sceneBounds(floor: Floor, items: Furniture[]) {
  const floorItems = items.filter((item) => item.floorId === floor.id);
  const points = [
    ...floor.rooms.flatMap((room) => room.points),
    ...floor.walls.flatMap((wall) => [wall.start, wall.end]),
  ];
  for (const item of floorItems) points.push(...furniturePoints(item));
  const box = points.length
    ? bounds(points)
    : { minX: 0, minY: 0, maxX: 4000, maxY: 3200 };
  return {
    center: [(box.minX + box.maxX) / 2000, 0, (box.minY + box.maxY) / 2000] as [
      number,
      number,
      number,
    ],
    span: Math.max(
      2,
      (box.maxX - box.minX) / 1000,
      (box.maxY - box.minY) / 1000,
      ...floor.walls.map((w) => w.height / 1000),
      ...floorItems.map((item) => (item.height + (item.elevation || 0)) / 1000),
    ),
  };
}
