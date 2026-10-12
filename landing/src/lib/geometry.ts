import type { Bounds, Furniture, Opening, Size } from "./types";

/** Coordinates and dimensions are centimetres. Rotation is in quarter turns. */
export function aabb(item: Furniture): Bounds {
  const quarter = (((item.rot ?? 0) % 180) + 180) % 180 === 90;
  return {
    x: item.x,
    y: item.y,
    w: quarter ? item.h : item.w,
    h: quarter ? item.w : item.h,
  };
}

export function doorZones(room: Size, doors: Opening[]): Bounds[] {
  return doors.map((d) => ({
    x: d.wall === "left" ? 0 : d.wall === "right" ? room.w - d.w : d.at,
    y: d.wall === "top" ? 0 : d.wall === "bottom" ? room.h - d.w : d.at,
    w: d.w,
    h: d.w,
  }));
}

export const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.w - 0.5 &&
  b.x < a.x + a.w - 0.5 &&
  a.y < b.y + b.h - 0.5 &&
  b.y < a.y + a.h - 0.5;

export interface Issue {
  level: "error" | "warning";
  ids: string[];
  text: string;
}
export function analyze(
  room: Size,
  items: Furniture[],
  doors: Opening[] = [],
  threshold = 60,
) {
  const status: Record<string, "ok" | "err" | "warn"> = Object.fromEntries(
    items.map((i) => [i.id, "ok"]),
  );
  const issues: Issue[] = [];
  const boxes = items
    .filter((i) => i.type !== "rug")
    .map((item) => ({ item, box: aabb(item) }));
  const flag = (ids: string[], level: Issue["level"], text: string) => {
    ids.forEach((id) => {
      if (status[id] !== "err") status[id] = level === "error" ? "err" : "warn";
    });
    issues.push({ ids, level, text });
  };
  for (const { item, box } of boxes) {
    if (
      box.x < 0 ||
      box.y < 0 ||
      box.x + box.w > room.w ||
      box.y + box.h > room.h
    )
      flag([item.id], "error", `${item.name} заходит за стену`);
    if (doorZones(room, doors).some((zone) => overlaps(zone, box)))
      flag([item.id], "error", `${item.name} мешает открыванию двери`);
    if (item.type !== "plant" && item.type !== "chair") {
      for (const gap of [
        box.x,
        box.y,
        room.w - box.x - box.w,
        room.h - box.y - box.h,
      ]) {
        if (gap > 8 && gap < threshold)
          flag(
            [item.id],
            "warning",
            `${item.name}: до стены ${Math.round(gap)} см`,
          );
      }
    }
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j],
        ids = [a.item.id, b.item.id];
      if (overlaps(a.box, b.box)) {
        flag(ids, "error", `${a.item.name} пересекается с «${b.item.name}»`);
        continue;
      }
      const yo =
        Math.min(a.box.y + a.box.h, b.box.y + b.box.h) -
        Math.max(a.box.y, b.box.y);
      const xo =
        Math.min(a.box.x + a.box.w, b.box.x + b.box.w) -
        Math.max(a.box.x, b.box.x);
      const gap =
        yo > 0
          ? Math.max(b.box.x - a.box.x - a.box.w, a.box.x - b.box.x - b.box.w)
          : xo > 0
            ? Math.max(b.box.y - a.box.y - a.box.h, a.box.y - b.box.y - b.box.h)
            : null;
      if (
        gap !== null &&
        gap > 8 &&
        gap < threshold &&
        ![a.item.type, b.item.type].some((t) => t === "plant" || t === "chair")
      )
        flag(
          ids,
          "warning",
          `Узкий проход ${Math.round(gap)} см: ${a.item.name} — ${b.item.name}`,
        );
    }
  // Rugs can cross furniture but must still remain inside the room.
  for (const item of items.filter((i) => i.type === "rug")) {
    const box = aabb(item);
    if (
      box.x < 0 ||
      box.y < 0 ||
      box.x + box.w > room.w ||
      box.y + box.h > room.h
    )
      flag([item.id], "error", `${item.name} заходит за стену`);
  }
  return {
    status,
    issues,
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
  };
}

export function fitInside(item: Furniture, room: Size): Furniture {
  const b = aabb(item);
  return {
    ...item,
    x: Math.round(Math.max(0, Math.min(item.x, room.w - b.w))),
    y: Math.round(Math.max(0, Math.min(item.y, room.h - b.h))),
  };
}

export function rotateItem(item: Furniture, room: Size): Furniture {
  const before = aabb(item);
  const next = { ...item, rot: ((item.rot ?? 0) + 90) % 360 };
  const after = aabb(next);
  return fitInside(
    {
      ...next,
      x: before.x + (before.w - after.w) / 2,
      y: before.y + (before.h - after.h) / 2,
    },
    room,
  );
}

export function rays(room: Size, items: Furniture[], id: string) {
  const item = items.find((i) => i.id === id);
  if (!item) return [];
  const a = aabb(item);
  const others = items.filter((i) => i.id !== id && i.type !== "rug").map(aabb);
  const yOverlap = (b: Bounds) =>
    Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
  const xOverlap = (b: Bounds) =>
    Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x);
  const left = Math.max(
    0,
    ...others
      .filter((b) => yOverlap(b) && b.x + b.w <= a.x)
      .map((b) => b.x + b.w),
  );
  const right = Math.min(
    room.w,
    ...others.filter((b) => yOverlap(b) && b.x >= a.x + a.w).map((b) => b.x),
  );
  const top = Math.max(
    0,
    ...others
      .filter((b) => xOverlap(b) && b.y + b.h <= a.y)
      .map((b) => b.y + b.h),
  );
  const bottom = Math.min(
    room.h,
    ...others.filter((b) => xOverlap(b) && b.y >= a.y + a.h).map((b) => b.y),
  );
  const cx = a.x + a.w / 2,
    cy = a.y + a.h / 2;
  return [
    { dir: "l", x1: left, x2: a.x, y1: cy, y2: cy, d: a.x - left },
    {
      dir: "r",
      x1: a.x + a.w,
      x2: right,
      y1: cy,
      y2: cy,
      d: right - a.x - a.w,
    },
    { dir: "t", x1: cx, x2: cx, y1: top, y2: a.y, d: a.y - top },
    {
      dir: "b",
      x1: cx,
      x2: cx,
      y1: a.y + a.h,
      y2: bottom,
      d: bottom - a.y - a.h,
    },
  ].filter((r) => r.d > 1);
}

export function fmt(cm: number, unit?: string) {
  return unit === "м"
    ? `${(cm / 100).toFixed(2).replace(".", ",")} м`
    : `${Math.round(cm)} см`;
}
