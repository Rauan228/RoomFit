import { describe, expect, it } from "vitest";
import { aabb, analyze, fitInside, rays, rotateItem } from "./geometry";
import type { Furniture } from "./types";
import { initialItems, ROOMS } from "./data";
const room = { w: 400, h: 320 };
const bed: Furniture = {
  id: "bed",
  type: "bed",
  name: "Кровать",
  w: 160,
  h: 200,
  x: 0,
  y: 0,
  rot: 0,
};

describe("RoomFit centimetre geometry", () => {
  it("starts the landing demo without collisions or narrow passages", () => {
    const template = ROOMS.bedroom;
    expect(analyze(template.room, initialItems(), template.doors).issues).toEqual([]);
  });
  it("keeps quarter-turn bounds exact and rotation inside the walls", () => {
    expect(aabb({ ...bed, rot: 90 })).toEqual({ x: 0, y: 0, w: 200, h: 160 });
    let item = { ...bed, x: 200, y: 100 };
    for (let n = 0; n < 4; n++) item = rotateItem(item, room) as typeof item;
    expect(item.rot).toBe(0);
    const bounds = aabb(item);
    expect(bounds.x + bounds.w).toBeLessThanOrEqual(room.w);
    expect(bounds.y + bounds.h).toBeLessThanOrEqual(room.h);
    expect(fitInside({ ...bed, x: -30, y: 300 }, room)).toMatchObject({
      x: 0,
      y: 120,
    });
  });
  it("flags overlap, a blocked door and furniture outside the room", () => {
    const cabinet: Furniture = {
      ...bed,
      id: "cabinet",
      type: "wardrobe",
      name: "Шкаф",
      x: 120,
      y: 80,
      w: 100,
      h: 60,
    };
    expect(analyze(room, [bed, cabinet]).status).toEqual({
      bed: "err",
      cabinet: "err",
    });
    const blocked = analyze(
      room,
      [{ ...bed, x: 260, y: 200, w: 80, h: 80 }],
      [{ wall: "bottom", at: 300, w: 80 }],
    );
    expect(
      blocked.issues.some((i) => i.text.includes("открыванию двери")),
    ).toBe(true);
    expect(analyze(room, [{ ...bed, x: 300 }]).errors).toBeGreaterThan(0);
  });
  it("allows rugs under furniture and reports narrow passages", () => {
    const rug: Furniture = { ...bed, id: "rug", type: "rug", name: "Ковёр" };
    expect(analyze(room, [bed, rug]).errors).toBe(0);
    const cabinet: Furniture = {
      ...bed,
      id: "cabinet",
      type: "wardrobe",
      name: "Шкаф",
      x: 200,
      y: 0,
      w: 100,
      h: 60,
    };
    expect(
      analyze(room, [bed, cabinet]).issues.some((i) =>
        i.text.includes("проход 40 см"),
      ),
    ).toBe(true);
  });
  it("measures to the nearest obstacle instead of the distant wall", () => {
    const desk: Furniture = {
      ...bed,
      id: "desk",
      type: "desk",
      name: "Стол",
      x: 230,
      y: 0,
      w: 120,
      h: 60,
    };
    expect(rays(room, [bed, desk], "bed").find((r) => r.dir === "r")?.d).toBe(
      70,
    );
    expect(rays(room, [bed], "missing")).toEqual([]);
  });
});
