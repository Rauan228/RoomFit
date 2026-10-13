import { describe, expect, it } from "vitest";
import {
  analyzeFloor,
  fitsRoom,
  furniturePolygon,
  intersectionArea,
  minimumDistance,
  moveWallVertex,
  selfIntersects,
  routeClearance,
  smartLayouts,
  whatFits,
  openingPlacement,
} from "./geometry";
import {
  createDocument,
  instantiate,
  documentSchema,
  fromDisplay,
  toDisplay,
  rectangle,
} from "./model";
import { CATALOG, createTemplate, TEMPLATE_NAMES } from "./catalog";
const room = () => createDocument("Test", 4000, 3200);
const item = (
  doc = room(),
  x = 2000,
  y = 1600,
  w = 800,
  d = 800,
  angle = 0,
) => ({
  ...instantiate(
    CATALOG.find((c) => c.id === "coffee")!,
    doc.floors[0].id,
    { x, y },
  ),
  width: w,
  depth: d,
  angle,
});
describe("millimetre geometry independent from viewport", () => {
  it("places openings on walls, clamps corners and rejects empty space or occupied spans", () => {
    const floor = room().floors[0];
    const placed = openingPlacement(floor, { x: 1300, y: -60 }, 800, 100)!;
    expect(placed.wall.id).toBe(floor.walls[0].id);
    expect(placed.offset).toBe(900);
    expect(placed.inward).toBe(true);
    expect(openingPlacement(floor, { x: 30, y: 0 }, 800, 100)?.offset).toBe(0);
    expect(openingPlacement(floor, { x: 2000, y: 1600 }, 800, 100)).toBeNull();
    expect(openingPlacement(floor, { x: 1500, y: 0 }, 5000, 100)).toBeNull();
    floor.openings.push({
      id: crypto.randomUUID(),
      wallId: placed.wall.id,
      kind: "door",
      offset: placed.offset,
      width: 800,
      height: 2100,
      sill: 0,
      flip: false,
      inward: true,
    });
    expect(openingPlacement(floor, { x: 1400, y: 0 }, 800, 100)).toBeNull();
    expect(
      openingPlacement(floor, { x: 1400, y: 0 }, 800, 100, floor.openings[0].id)
        ?.offset,
    ).toBe(1000);
  });
  it("projects openings onto diagonal and reversed walls and chooses the side of a partition", () => {
    const floor = room().floors[0];
    floor.walls = [
      {
        ...floor.walls[0],
        roomId: undefined,
        start: { x: 3000, y: 3000 },
        end: { x: 0, y: 0 },
      },
    ];
    const placed = openingPlacement(floor, { x: 2000, y: 2010 }, 800, 100)!;
    expect(placed.offset).toBeCloseTo(1007, 0);
    expect(placed.inward).toBe(false);
    expect(
      openingPlacement(floor, { x: 2010, y: 2000 }, 800, 100)?.inward,
    ).toBe(true);
  });
  it("instantiates UUIDs and validates every template", () => {
    for (const name of TEMPLATE_NAMES)
      expect(documentSchema.safeParse(createTemplate(name)).success).toBe(true);
  });
  it("roundtrips cm/m/feet with at most 1 mm rounding", () => {
    for (const u of ["cm", "m", "ft"] as const)
      for (const mm of [0, 600, 3048, -321])
        expect(
          Math.abs(fromDisplay(toDisplay(mm, u), u) - mm),
        ).toBeLessThanOrEqual(1);
  });
  it("rotates around center preserving area and checks the rotated outline", () => {
    const doc = room(),
      f = doc.floors[0],
      i = item(doc, 400, 400, 800, 800);
    expect(fitsRoom(furniturePolygon(i), f)).toBe(true);
    expect(fitsRoom(furniturePolygon({ ...i, angle: 45 }), f)).toBe(false);
  });
  it("treats edge contact as no physical overlap and measures a gap exactly", () => {
    const a = rectangle(800, 800),
      b = rectangle(800, 800, 800, 0);
    expect(intersectionArea(a, b)).toBe(0);
    expect(minimumDistance(a, b)).toBe(0);
    expect(minimumDistance(a, rectangle(800, 800, 1450, 0))).toBe(650);
  });
  it("uses concave room polygon, not bounding box", () => {
    const doc = createDocument("L", 4000, 3200, "l"),
      f = doc.floors[0];
    expect(fitsRoom(furniturePolygon(item(doc, 3400, 2600, 600, 600)), f)).toBe(
      false,
    );
    expect(fitsRoom(furniturePolygon(item(doc, 500, 2500, 600, 600)), f)).toBe(
      true,
    );
  });
  it("detects self crossings and duplicate adjacent vertices", () => {
    expect(
      selfIntersects([
        { x: 0, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
        { x: 1000, y: 0 },
      ]),
    ).toBe(true);
    expect(selfIntersects(rectangle(1000, 1000))).toBe(false);
  });
  it("distinguishes collision from 650 mm clearance warning at 800 mm threshold", () => {
    const doc = room(),
      f = doc.floors[0],
      a = item(doc, 1000, 1500),
      b = item(doc, 2450, 1500);
    const report = analyzeFloor(f, [a, b], 800);
    expect(report.issues.some((i) => i.type === "overlap")).toBe(false);
    expect(report.issues.find((i) => i.type === "clearance")?.value).toBe(650);
    expect(
      analyzeFloor(f, [a, { ...b, x: 1500 }]).issues.some(
        (i) => i.type === "overlap",
      ),
    ).toBe(true);
  });
  it("door sweep creates physical conflict independently from furniture overlap", () => {
    const doc = room(),
      f = doc.floors[0];
    f.openings.push({
      id: crypto.randomUUID(),
      wallId: f.walls[0].id,
      kind: "door",
      offset: 0,
      width: 900,
      height: 2100,
      sill: 0,
      inward: true,
      flip: false,
    });
    expect(
      analyzeFloor(f, [item(doc, 350, 350, 300, 300)]).issues.some(
        (i) => i.type === "door",
      ),
    ).toBe(true);
  });
  it("updates wall connectivity and clamps opening to shortened wall", () => {
    const doc = room(),
      f = doc.floors[0],
      o = {
        id: crypto.randomUUID(),
        wallId: f.walls[0].id,
        kind: "window" as const,
        offset: 2500,
        width: 1400,
        height: 1500,
        sill: 900,
        inward: true,
        flip: false,
      };
    f.openings.push(o);
    const next = moveWallVertex(f, { x: 4000, y: 0 }, { x: 2000, y: 0 });
    expect(next.rooms[0].points[1].x).toBe(2000);
    expect(next.walls[1].start.x).toBe(2000);
    expect(
      next.openings[0].offset + next.openings[0].width,
    ).toBeLessThanOrEqual(2000);
  });
  it("computes union area so overlapping furniture is not counted twice", () => {
    const doc = room(),
      f = doc.floors[0],
      a = {
        ...item(doc),
        catalogId: undefined,
        assetId: undefined,
        assetVersion: undefined,
        contour: undefined,
      };
    const b = { ...a, id: crypto.randomUUID() };
    const result = analyzeFloor(f, [a, b]);
    expect(result.freeArea).toBe(12_800_000 - 640_000);
  });
  it("supports empty floors and marks all furniture outside", () => {
    const doc = room(),
      f = { ...doc.floors[0], rooms: [], walls: [] };
    expect(analyzeFloor(f, [item(doc)]).errors).toBe(1);
  });
  it("checks What Fits against furniture and zone obstacles", () => {
    const doc = room(),
      f = doc.floors[0],
      region = rectangle(1200, 1000, 900, 900),
      catalog = [CATALOG.find((c) => c.id === "coffee")!];
    expect(whatFits(f, [], region, catalog).results.length).toBeGreaterThan(0);
    f.zones.push({
      id: crypto.randomUUID(),
      name: "No",
      points: region,
      forbidden: true,
    });
    expect(whatFits(f, [], region, catalog).results).toHaveLength(0);
  });
  it("smart layouts preserve locked items and other floors", () => {
    const doc = room(),
      f = doc.floors[0],
      locked = { ...item(doc, 500, 500, 600, 600), locked: true };
    const variants = smartLayouts(f, {
      ...doc.variants[0],
      items: [locked, item(doc)],
    });
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      expect(v.items.find((i) => i.id === locked.id)).toEqual(locked);
      expect(analyzeFloor(f, v.items).errors).toBe(0);
    }
  });
  it("route has no entry without a sufficiently wide doorway", () => {
    const doc = room();
    const r = routeClearance(doc.floors[0], [], 800);
    expect(r.hasEntry).toBe(false);
    expect(r.reachable).toHaveLength(0);
    expect(r.unreachable).toBeGreaterThan(0);
  });
  it("route cannot cross a partition and does cross a sufficiently wide internal doorway", () => {
    const doc = room(),
      f = doc.floors[0],
      wall = {
        id: crypto.randomUUID(),
        start: { x: 2000, y: 0 },
        end: { x: 2000, y: 3200 },
        thickness: 100,
        height: 2800,
        color: "#34383c",
      };
    f.walls.push(wall);
    f.openings.push({
      id: crypto.randomUUID(),
      wallId: f.walls[3].id,
      kind: "sliding",
      offset: 1000,
      width: 1200,
      height: 2100,
      sill: 0,
      flip: false,
      inward: true,
    });
    const blocked = routeClearance(f, [], 800);
    expect(blocked.hasEntry).toBe(true);
    expect(blocked.unreachable).toBeGreaterThan(0);
    f.openings.push({
      id: crypto.randomUUID(),
      wallId: wall.id,
      kind: "sliding",
      offset: 800,
      width: 1600,
      height: 2100,
      sill: 0,
      flip: false,
      inward: true,
    });
    expect(routeClearance(f, [], 800).unreachable).toBe(0);
    f.openings = f.openings.slice(1);
    expect(routeClearance(f, [], 800).hasEntry).toBe(false);
  });
});
