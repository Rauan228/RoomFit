import clip, { type Ring, type MultiPolygon } from "polygon-clipping";
import RBush from "rbush";
import {
  uid,
  type Point,
  type Furniture,
  type Floor,
  type Wall,
  type Opening,
  type Variant,
  type CatalogItem,
} from "./model";
const EPS = 0.01;
export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);
export const area = (p: Point[]) =>
  Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a.x * b.y - b.x * a.y;
    }, 0),
  ) / 2;
export const perimeter = (p: Point[]) =>
  p.reduce((s, a, i) => s + distance(a, p[(i + 1) % p.length]), 0);
export const ring = (p: Point[]): Ring => [...p, p[0]].map((v) => [v.x, v.y]);
export const polygonArea = (multi: MultiPolygon) =>
  multi.reduce(
    (s, p) =>
      s +
      p.reduce(
        (s, r, i) => s + (i ? -1 : 1) * area(r.map(([x, y]) => ({ x, y }))),
        0,
      ),
    0,
  );
const union = (polygons: MultiPolygon[]): MultiPolygon =>
  polygons.length ? clip.union(polygons[0], ...polygons.slice(1)) : [];
export function bounds(points: Point[]) {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
export function pointInside(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (segmentDistance(point, a, b) < EPS) return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = d
    ? Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / d,
        ),
      )
    : 0;
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function selfIntersects(p: Point[]) {
  if (area(p) < 1) return true;
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      const a = p[i],
        b = p[(i + 1) % p.length],
        c = p[j],
        d = p[(j + 1) % p.length];
      if (
        cross(a, b, c) * cross(a, b, d) <= EPS &&
        cross(c, d, a) * cross(c, d, b) <= EPS &&
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
          Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + EPS &&
        Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
          Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + EPS
      )
        return true;
    }
  return p.some((a, i) => distance(a, p[(i + 1) % p.length]) < 1);
}
export function rotate(point: Point, angle: number): Point {
  const t = (angle * Math.PI) / 180;
  return {
    x: point.x * Math.cos(t) - point.y * Math.sin(t),
    y: point.x * Math.sin(t) + point.y * Math.cos(t),
  };
}
export function furniturePolygon(item: Furniture, clearance = 0): Point[] {
  const contour = item.contour ?? [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  return contour.map((p) => {
    const r = rotate(
      {
        x: (p.x - 0.5) * (item.width + clearance * 2),
        y: (p.y - 0.5) * (item.depth + clearance * 2),
      },
      item.angle,
    );
    return { x: item.x + r.x, y: item.y + r.y };
  });
}
export function wallPolygon(w: Wall): Point[] {
  const l = distance(w.start, w.end),
    n = { x: -(w.end.y - w.start.y) / l, y: (w.end.x - w.start.x) / l },
    t = w.thickness;
  const inside = w.roomId ? 0 : t / 2,
    outside = w.roomId ? t : t / 2;
  return [
    { x: w.start.x + n.x * inside, y: w.start.y + n.y * inside },
    { x: w.end.x + n.x * inside, y: w.end.y + n.y * inside },
    { x: w.end.x - n.x * outside, y: w.end.y - n.y * outside },
    { x: w.start.x - n.x * outside, y: w.start.y - n.y * outside },
  ];
}
export function openingPosition(w: Wall, o: Opening) {
  const l = distance(w.start, w.end),
    u = { x: (w.end.x - w.start.x) / l, y: (w.end.y - w.start.y) / l };
  return {
    start: { x: w.start.x + u.x * o.offset, y: w.start.y + u.y * o.offset },
    end: {
      x: w.start.x + u.x * (o.offset + o.width),
      y: w.start.y + u.y * (o.offset + o.width),
    },
    angle: (Math.atan2(u.y, u.x) * 180) / Math.PI,
    u,
    normal: { x: -u.y * (o.inward ? 1 : -1), y: u.x * (o.inward ? 1 : -1) },
  };
}
export function doorPolygons(w: Wall, o: Opening): Point[][] {
  if (o.kind === "window" || o.kind === "sliding") return [];
  const { start, end, u, normal } = openingPosition(w, o);
  const sector = (hinge: Point, flipped: boolean, width: number): Point[] => [
    hinge,
    ...Array.from({ length: 19 }, (_, i) => {
      const t = ((i / 18) * Math.PI) / 2;
      return {
        x:
          hinge.x +
          width *
            (u.x * Math.cos(t) * (flipped ? -1 : 1) + normal.x * Math.sin(t)),
        y:
          hinge.y +
          width *
            (u.y * Math.cos(t) * (flipped ? -1 : 1) + normal.y * Math.sin(t)),
      };
    }),
  ];
  return o.kind === "double"
    ? [sector(start, false, o.width / 2), sector(end, true, o.width / 2)]
    : [sector(o.flip ? end : start, o.flip, o.width)];
}
export const intersectionArea = (a: Point[], b: Point[]) =>
  polygonArea(clip.intersection([ring(a)], [ring(b)]));
export function minimumDistance(a: Point[], b: Point[]) {
  if (intersectionArea(a, b) > EPS) return 0;
  let min = Infinity;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      min = Math.min(
        min,
        segmentDistance(a[i], b[j], b[(j + 1) % b.length]),
        segmentDistance(b[j], a[i], a[(i + 1) % a.length]),
      );
  return min;
}
export function fitsRoom(points: Point[], floor: Floor) {
  if (!floor.rooms.length) return false;
  const rooms = union(floor.rooms.map((r) => [[ring(r.points)]]));
  return polygonArea(clip.difference([ring(points)], rooms)) < 1;
}
export interface Issue {
  id: string;
  level: "error" | "warning";
  type: string;
  ids: string[];
  text: string;
  value?: number;
  point: Point;
}
export function analyzeFloor(
  floor: Floor,
  items: Furniture[],
  threshold = 800,
) {
  const visible = items.filter((i) => i.floorId === floor.id),
    solid = visible.filter((i) => i.type !== "rug"),
    issues: Issue[] = [],
    status: Record<string, "error" | "warning"> = {};
  const push = (
    level: Issue["level"],
    type: string,
    ids: string[],
    text: string,
    point: Point,
    value?: number,
  ) => {
    issues.push({
      id: `${type}:${ids.join(":")}`,
      level,
      type,
      ids,
      text,
      point,
      value,
    });
    ids.forEach((id) => {
      if (status[id] !== "error") status[id] = level;
    });
  };
  const shapes = solid.map((item) => ({
    item,
    points: furniturePolygon(item),
    ...bounds(furniturePolygon(item)),
  }));
  const index = new RBush<(typeof shapes)[number]>();
  index.load(shapes);
  const checked = new Set<string>();
  let minClearance = Infinity;
  for (const s of shapes) {
    if (!fitsRoom(s.points, floor))
      push(
        "error",
        "outside",
        [s.item.id],
        `${s.item.name}: за границей комнаты`,
        s.item,
      );
    for (const wall of floor.walls)
      if (intersectionArea(s.points, wallPolygon(wall)) > 1)
        push(
          "error",
          "wall",
          [s.item.id, wall.id],
          `${s.item.name}: пересечение со стеной`,
          s.item,
        );
    for (const opening of floor.openings) {
      const wall = floor.walls.find((w) => w.id === opening.wallId);
      if (
        wall &&
        doorPolygons(wall, opening).some(
          (p) => intersectionArea(s.points, p) > 1,
        )
      )
        push(
          "error",
          "door",
          [s.item.id, opening.id],
          `${s.item.name}: дверь не сможет открыться`,
          s.item,
        );
    }
    for (const zone of floor.zones.filter((z) => z.forbidden))
      if (intersectionArea(s.points, zone.points) > 1)
        push(
          "error",
          "zone",
          [s.item.id, zone.id],
          `${s.item.name}: в запрещённой зоне`,
          s.item,
        );
    const reach =
      Math.max(
        threshold,
        s.item.clearance,
        ...shapes.map((o) => o.item.clearance),
      ) * 1.5;
    const nearby = index.search({
      minX: s.minX - reach,
      minY: s.minY - reach,
      maxX: s.maxX + reach,
      maxY: s.maxY + reach,
    });
    for (const other of nearby) {
      if (other.item.id === s.item.id) continue;
      const key = [s.item.id, other.item.id].sort().join(":");
      if (checked.has(key)) continue;
      checked.add(key);
      const overlap = intersectionArea(s.points, other.points);
      if (overlap > 1)
        push(
          "error",
          "overlap",
          [s.item.id, other.item.id],
          `${s.item.name} пересекается с «${other.item.name}»`,
          s.item,
          overlap,
        );
      else {
        const gap = minimumDistance(s.points, other.points);
        if (
          gap > 80 &&
          !["plant", "lamp", "chair"].includes(s.item.type) &&
          !["plant", "lamp", "chair"].includes(other.item.type)
        ) {
          minClearance = Math.min(minClearance, gap);
          if (gap < threshold)
            push(
              "warning",
              "clearance",
              [s.item.id, other.item.id],
              `Проход ${Math.round(gap / 10)} см — на ${Math.round((threshold - gap) / 10)} см меньше выбранного минимума`,
              s.item,
              gap,
            );
        }
      }
      if (
        other.item.clearance > 0 &&
        intersectionArea(
          s.points,
          furniturePolygon(other.item, other.item.clearance),
        ) > 1 &&
        overlap <= 1
      )
        push(
          "warning",
          "service",
          [s.item.id, other.item.id],
          `${other.item.name}: недостаточно пространства для использования`,
          other.item,
        );
      if (
        s.item.clearance > 0 &&
        intersectionArea(
          other.points,
          furniturePolygon(s.item, s.item.clearance),
        ) > 1 &&
        overlap <= 1
      )
        push(
          "warning",
          "service",
          [other.item.id, s.item.id],
          `${s.item.name}: недостаточно пространства для использования`,
          s.item,
        );
    }
    const wallGaps = floor.walls
      .map((w) =>
        Math.min(...s.points.map((p) => segmentDistance(p, w.start, w.end))),
      )
      .filter((d) => d > 80);
    const gap = Math.min(...wallGaps);
    minClearance = Math.min(minClearance, gap);
    if (gap < threshold && !["plant", "lamp", "chair"].includes(s.item.type))
      push(
        "warning",
        "wall-gap",
        [s.item.id],
        `${s.item.name}: до стены ${Math.round(gap / 10)} см`,
        s.item,
        gap,
      );
  }
  for (const i of visible.filter((i) => i.type === "rug"))
    if (!fitsRoom(furniturePolygon(i), floor))
      push("error", "outside", [i.id], `${i.name}: за границей комнаты`, i);
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i],
        b = shapes[j];
      if (
        !checked.has([a.item.id, b.item.id].sort().join(":")) &&
        !["plant", "lamp", "chair"].includes(a.item.type) &&
        !["plant", "lamp", "chair"].includes(b.item.type)
      ) {
        const gap = minimumDistance(a.points, b.points);
        if (gap > 80) minClearance = Math.min(minClearance, gap);
      }
    }
  const rooms = union(floor.rooms.map((r) => [[ring(r.points)]])),
    occupied =
      solid.length && rooms.length
        ? clip.intersection(rooms, union(shapes.map((s) => [[ring(s.points)]])))
        : [];
  return {
    issues,
    status,
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
    freeArea: Math.max(0, polygonArea(rooms) - polygonArea(occupied)),
    totalArea: polygonArea(rooms),
    minClearance: Number.isFinite(minClearance)
      ? Math.round(minClearance)
      : null,
  };
}
export function moveWallVertex(floor: Floor, old: Point, next: Point): Floor {
  const move = (p: Point) =>
    distance(p, old) < 1 ? { x: Math.round(next.x), y: Math.round(next.y) } : p;
  const walls = floor.walls.map((w) => ({
    ...w,
    start: move(w.start),
    end: move(w.end),
  }));
  return {
    ...floor,
    rooms: floor.rooms.map((r) => ({ ...r, points: r.points.map(move) })),
    walls,
    openings: floor.openings.map((o) => {
      const wall = walls.find((w) => w.id === o.wallId)!;
      const width = Math.min(o.width, distance(wall.start, wall.end));
      return {
        ...o,
        width,
        offset: Math.max(
          0,
          Math.min(o.offset, distance(wall.start, wall.end) - width),
        ),
      };
    }),
  };
}
export function snap(point: Point, floor: Floor, grid = 100, scale = 1): Point {
  const tolerance = 12 / scale;
  let p = {
    x: Math.round(point.x / grid) * grid,
    y: Math.round(point.y / grid) * grid,
  };
  for (const wall of floor.walls)
    for (const v of [wall.start, wall.end])
      if (distance(point, v) < tolerance) p = v;
  return { x: Math.round(p.x), y: Math.round(p.y) };
}
export function routeClearance(
  floor: Floor,
  items: Furniture[],
  width: number,
) {
  if (!floor.rooms.length)
    return {
      step: 100,
      width,
      reachable: [] as Point[],
      unreachable: 0,
      hasEntry: false,
      conservative: true,
    };
  const points = floor.rooms.flatMap((r) => r.points),
    box = bounds(points),
    step = Math.max(
      100,
      Math.ceil(
        Math.sqrt(((box.maxX - box.minX) * (box.maxY - box.minY)) / 5000) / 50,
      ) * 50,
    ),
    radius = width / 2;
  const rooms = union(floor.rooms.map((r) => [[ring(r.points)]]));
  const boundary = rooms.flatMap((p) =>
    p.flatMap((r) => r.map(([x, y]) => ({ x, y }))),
  );
  const edges = rooms.flatMap((p) =>
    p.flatMap((r) =>
      r.slice(0, -1).map(
        ([x, y], i) =>
          [
            { x, y },
            { x: r[i + 1][0], y: r[i + 1][1] },
          ] as [Point, Point],
      ),
    ),
  );
  const wallParts = floor.walls.flatMap((w) => {
    const cuts = floor.openings
      .filter((o) => o.kind !== "window" && o.width >= width)
      .flatMap((o) => {
        const ow = floor.walls.find((t) => t.id === o.wallId);
        if (!ow) return [];
        const opening = openingPosition(ow, o);
        const same =
          ow.id === w.id ||
          (segmentDistance(opening.start, w.start, w.end) < 1 &&
            segmentDistance(opening.end, w.start, w.end) < 1);
        if (!same) return [];
        const { start, end, normal } = openingPosition(ow, o),
          t = Math.max(w.thickness, ow.thickness) + 10;
        return [
          [
            ring([
              { x: start.x + normal.x * t, y: start.y + normal.y * t },
              { x: end.x + normal.x * t, y: end.y + normal.y * t },
              { x: end.x - normal.x * t, y: end.y - normal.y * t },
              { x: start.x - normal.x * t, y: start.y - normal.y * t },
            ]),
          ],
        ];
      });
    const whole = [ring(wallPolygon(w))];
    const parts = cuts.length
      ? clip.difference(whole, cuts[0], ...cuts.slice(1))
      : [whole];
    return parts.flatMap((p) =>
      p.slice(0, 1).map((r) => r.map(([x, y]) => ({ x, y }))),
    );
  });
  const polygons = items
      .filter((i) => i.floorId === floor.id && i.type !== "rug")
      .map((i) => furniturePolygon(i)),
    forbidden = floor.zones.filter((z) => z.forbidden).map((z) => z.points),
    all = [...polygons, ...forbidden, ...wallParts];
  const nx = Math.ceil((box.maxX - box.minX) / step),
    ny = Math.ceil((box.maxY - box.minY) / step),
    free = new Set<number>(),
    reachable = new Set<number>();
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const p = {
        x: box.minX + (x + 0.5) * step,
        y: box.minY + (y + 0.5) * step,
      };
      if (!floor.rooms.some((r) => pointInside(p, r.points))) continue;
      const wallDist = Math.min(
        ...edges.map(([a, b]) => segmentDistance(p, a, b)),
      );
      if (wallDist < radius + step * 0.71) continue;
      if (
        all.some(
          (poly) =>
            pointInside(p, poly) ||
            Math.min(
              ...poly.map((a, i) =>
                segmentDistance(p, a, poly[(i + 1) % poly.length]),
              ),
            ) <
              radius + step * 0.71,
        )
      )
        continue;
      free.add(y * nx + x);
    }
  const doors = floor.openings.filter(
      (o) => o.kind !== "window" && o.width >= width,
    ),
    seeds: number[] = [];
  for (const o of doors) {
    const w = floor.walls.find((w) => w.id === o.wallId);
    if (!w) continue;
    const { start, end, normal } = openingPosition(w, o),
      mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      inside = (p: Point) => floor.rooms.some((r) => pointInside(p, r.points));
    const testA = {
        x: mid.x + normal.x * (w.thickness + 5),
        y: mid.y + normal.y * (w.thickness + 5),
      },
      testB = {
        x: mid.x - normal.x * (w.thickness + 5),
        y: mid.y - normal.y * (w.thickness + 5),
      };
    if (inside(testA) === inside(testB)) continue;
    const direction = inside(testA) ? 1 : -1,
      p = {
        x: mid.x + normal.x * direction * (radius + step * 2),
        y: mid.y + normal.y * direction * (radius + step * 2),
      };
    let best = -1,
      d = Infinity;
    for (const index of free) {
      const q = {
        x: box.minX + ((index % nx) + 0.5) * step,
        y: box.minY + (Math.floor(index / nx) + 0.5) * step,
      };
      const dist = distance(p, q);
      if (dist < d) {
        d = dist;
        best = index;
      }
    }
    if (best >= 0 && d < step * 2) seeds.push(best);
  }
  const queue = [...seeds];
  seeds.forEach((i) => reachable.add(i));
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k],
      x = i % nx,
      y = Math.floor(i / nx);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const xx = x + dx,
        yy = y + dy,
        j = yy * nx + xx;
      if (
        xx >= 0 &&
        yy >= 0 &&
        xx < nx &&
        yy < ny &&
        free.has(j) &&
        !reachable.has(j)
      ) {
        reachable.add(j);
        queue.push(j);
      }
    }
  }
  return {
    step,
    width,
    reachable: [...reachable].map((i) => ({
      x: box.minX + (i % nx) * step,
      y: box.minY + Math.floor(i / nx) * step,
    })),
    unreachable: free.size - reachable.size,
    hasEntry: seeds.length > 0,
    conservative: true,
  };
}
function physicallyFits(item: Furniture, floor: Floor, others: Furniture[]) {
  const p = furniturePolygon(item);
  return (
    fitsRoom(p, floor) &&
    !others
      .filter((i) => i.floorId === floor.id && i.type !== "rug")
      .some((i) => intersectionArea(p, furniturePolygon(i)) > 1) &&
    !floor.walls.some((w) => intersectionArea(p, wallPolygon(w)) > 1) &&
    !floor.zones
      .filter((z) => z.forbidden)
      .some((z) => intersectionArea(p, z.points) > 1) &&
    !floor.openings.some((o) => {
      const w = floor.walls.find((w) => w.id === o.wallId);
      return (
        w && doorPolygons(w, o).some((poly) => intersectionArea(p, poly) > 1)
      );
    })
  );
}
export function whatFits(
  floor: Floor,
  items: Furniture[],
  region: Point[],
  catalog: CatalogItem[],
  clearance = 800,
) {
  const b = bounds(region),
    results: {
      catalog: CatalogItem;
      angle: number;
      position: Point;
      recommended: boolean;
    }[] = [];
  for (const c of catalog)
    for (const angle of [0, 90]) {
      const w = angle ? c.depth : c.width,
        h = angle ? c.width : c.depth;
      if (w > b.maxX - b.minX || h > b.maxY - b.minY) continue;
      for (const p of [
        { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
        { x: b.minX + w / 2, y: b.minY + h / 2 },
        { x: b.maxX - w / 2, y: b.maxY - h / 2 },
      ]) {
        const item = {
          ...c,
          id: "candidate",
          catalogId: c.id,
          floorId: floor.id,
          ...p,
          angle,
          locked: false,
          shopping: { owned: false, price: 0, store: "", url: "", note: "" },
        };
        if (
          physicallyFits(item, floor, items) &&
          furniturePolygon(item).every((v) => pointInside(v, region))
        ) {
          results.push({
            catalog: c,
            angle,
            position: p,
            recommended: physicallyFits(
              {
                ...item,
                width: item.width + clearance,
                depth: item.depth + clearance,
              },
              floor,
              items,
            ),
          });
          break;
        }
      }
    }
  return {
    results,
    physicalBounds: { width: b.maxX - b.minX, depth: b.maxY - b.minY },
    note: "Проверены прямоугольные предметы в ориентациях 0° и 90°. Габариты области не являются гарантированным размером для любого положения.",
  };
}
export function smartLayouts(floor: Floor, variant: Variant): Variant[] {
  if (!floor.rooms.length) return [];
  const relevant = variant.items.filter((i) => i.floorId === floor.id),
    fixed = relevant.filter((i) => i.locked),
    moving = relevant
      .filter((i) => !i.locked)
      .sort((a, b) => b.width * b.depth - a.width * a.depth),
    box = bounds(floor.rooms.flatMap((r) => r.points)),
    solutions: Variant[] = [];
  if (moving.length > 40)
    throw new Error(
      "Авторасстановка поддерживает до 40 незакреплённых предметов на этаже",
    );
  const deadline = performance.now() + 6000;
  for (let mode = 0; mode < 6; mode++) {
    if (performance.now() > deadline) break;
    const placed = [...fixed];
    let success = true;
    for (const item of moving) {
      const candidates: Furniture[] = [];
      for (const angle of [item.angle, (item.angle + 90) % 360]) {
        const b = bounds(furniturePolygon({ ...item, x: 0, y: 0, angle })),
          halfW = (b.maxX - b.minX) / 2,
          halfH = (b.maxY - b.minY) / 2;
        for (const room of floor.rooms) {
          const rb = bounds(room.points),
            xs = [
              rb.minX + halfW + 1,
              rb.maxX - halfW - 1,
              (rb.minX + rb.maxX) / 2,
            ],
            ys = [
              rb.minY + halfH + 1,
              rb.maxY - halfH - 1,
              (rb.minY + rb.maxY) / 2,
            ];
          for (let x = rb.minX + halfW + 100; x < rb.maxX - halfW; x += 500)
            xs.push(x);
          for (let y = rb.minY + halfH + 100; y < rb.maxY - halfH; y += 500)
            ys.push(y);
          for (const x of xs)
            for (const y of ys)
              candidates.push({
                ...item,
                x: Math.round(x),
                y: Math.round(y),
                angle,
              });
        }
      }
      candidates.sort((a, b) =>
        mode % 3 === 0
          ? distance(a, { x: box.minX, y: box.minY }) -
            distance(b, { x: box.minX, y: box.minY })
          : mode % 3 === 1
            ? distance(a, { x: box.maxX, y: box.maxY }) -
              distance(b, { x: box.maxX, y: box.maxY })
            : a.x - b.x || (mode >= 3 ? b.y - a.y : a.y - b.y),
      );
      if (mode >= 3) candidates.reverse();
      const candidate = candidates.find(
        (c, index) =>
          index < 2000 &&
          performance.now() < deadline &&
          physicallyFits(c, floor, placed),
      );
      if (!candidate) {
        success = false;
        break;
      }
      placed.push(candidate);
    }
    if (success) {
      const signature = JSON.stringify(
        placed.map((i) => [i.id, i.x, i.y, i.angle]),
      );
      if (
        !solutions.some(
          (v) =>
            JSON.stringify(
              v.items
                .filter((i) => i.floorId === floor.id)
                .map((i) => [i.id, i.x, i.y, i.angle]),
            ) === signature,
        )
      )
        solutions.push({
          id: uid(),
          name: `Автовариант ${solutions.length + 1}`,
          items: [
            ...variant.items.filter((i) => i.floorId !== floor.id),
            ...placed,
          ],
        });
    }
    if (solutions.length >= 3) break;
  }
  return solutions;
}
