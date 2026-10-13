import { describe, expect, it } from "vitest";
import {
  CATALOG,
  createDocument,
  furniturePolygon,
  furniturePoints,
  bounds,
  instantiate,
  area,
  type Opening,
} from "@roomfit/core";
import {
  Box3,
  Euler,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import {
  furniturePose,
  polygonPrism,
  sceneBounds,
  toWorld,
  wallFootprint,
  wallGeometry,
} from "./geometry";
import { furnitureParts } from "./FurnitureMesh";

describe("Physical conversion between the plan and scene", () => {
  it("maps millimetres and height to x/y/z without a second coordinate store", () => {
    expect(toWorld({ x: 4000, y: 3200 }, 2700)).toEqual([4, 2.7, 3.2]);
    expect(toWorld({ x: -1250, y: 4500 }, 2000)).toEqual([-1.25, 2, 4.5]);
  });
  it("preserves the direction of positive 2D rotations", () => {
    const item = {
      ...instantiate(CATALOG[0], crypto.randomUUID(), { x: 2300, y: 1400 }),
      angle: 45,
    };
    const pose = furniturePose(item);
    const point = item.contour?.[0] || { x: 0, y: 0 };
    const corner = new Vector3(
      ((point.x - 0.5) * item.width) / 1000,
      0,
      ((point.y - 0.5) * item.depth) / 1000,
    )
      .applyEuler(new Euler(0, pose.yaw, 0))
      .add(new Vector3(...pose.position));
    const planCorner = furniturePolygon(item)[0];
    expect(corner.x).toBeCloseTo(planCorner.x / 1000, 8);
    expect(corner.z).toBeCloseTo(planCorner.y / 1000, 8);
  });
  it("fits rotated and unusually tall furniture into the camera frame", () => {
    const floor = createDocument("Bounds", 2000, 2000).floors[0];
    const item = {
      ...instantiate(CATALOG[0], floor.id, { x: 1000, y: 1000 }),
      width: 4000,
      depth: 4000,
      height: 6000,
      angle: 45,
    };
    const frame = sceneBounds(floor, [item]);
    expect(frame.center).toEqual([1, 0, 1]);
    expect(frame.span).toBe(6);
    const footprint = bounds(furniturePoints(item));
    expect(sceneBounds(floor, [{ ...item, height: 500 }]).span).toBeCloseTo(
      Math.max(
        footprint.maxX - footprint.minX,
        footprint.maxY - footprint.minY,
      ) / 1000,
      6,
    );
  });
  for (const shape of ["rectangle", "l", "u"])
    it(`triangulates ${shape} floor without filling notches`, () => {
      const room = createDocument("Тест", 4000, 3200, shape).floors[0].rooms[0];
      const geometry = polygonPrism(room.points, -80, 0),
        positions = geometry.getAttribute("position"),
        normals = geometry.getAttribute("normal");
      let topArea = 0;
      for (let i = 0; i < positions.count; i += 3) {
        if (normals.getY(i) < 0.999) continue;
        const a = new Vector3().fromBufferAttribute(positions, i),
          b = new Vector3().fromBufferAttribute(positions, i + 1),
          c = new Vector3().fromBufferAttribute(positions, i + 2);
        topArea += b.sub(a).cross(c.sub(a)).length() / 2;
      }
      expect(topArea).toBeCloseTo(area(room.points) / 1e6, 4);
      const box = new Box3().setFromBufferAttribute(positions);
      expect(box.min.y).toBeCloseTo(-0.08, 6);
      expect(box.max.y).toBeCloseTo(0, 6);
      geometry.dispose();
    });
  it("joins outward room walls at a shared miter without shrinking the floor", () => {
    const floor = createDocument().floors[0],
      first = wallFootprint(floor.walls[0], floor.walls),
      last = wallFootprint(floor.walls[3], floor.walls);
    expect(first[0]).toEqual({ x: 0, y: 0 });
    expect(first[1]).toEqual({ x: 4000, y: 0 });
    expect(first[3]).toEqual({ x: -100, y: -100 });
    expect(last[2]).toEqual(first[3]);
  });
  it("has actual door and window holes, with solid lintel and sill", () => {
    const floor = createDocument().floors[0],
      wall = floor.walls[0];
    const openings: Opening[] = [
      {
        id: crypto.randomUUID(),
        wallId: wall.id,
        kind: "door",
        offset: 700,
        width: 800,
        height: 2100,
        sill: 0,
        flip: false,
        inward: true,
      },
      {
        id: crypto.randomUUID(),
        wallId: wall.id,
        kind: "window",
        offset: 2400,
        width: 900,
        height: 1200,
        sill: 900,
        flip: false,
        inward: true,
      },
    ];
    const geometry = wallGeometry(wall, openings, floor.walls)!,
      material = new MeshBasicMaterial(),
      mesh = new Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const hit = (x: number, height: number) =>
      new Raycaster(
        new Vector3(x, height, -1),
        new Vector3(0, 0, 1),
      ).intersectObject(mesh).length > 0;
    expect(hit(1, 1)).toBe(false);
    expect(hit(0.3, 1)).toBe(true);
    expect(hit(1, 2.5)).toBe(true);
    expect(hit(2.8, 1.4)).toBe(false);
    expect(hit(2.8, 0.5)).toBe(true);
    expect(hit(2.8, 2.5)).toBe(true);
    geometry.dispose();
    material.dispose();
  });
  it("keeps every catalog prototype inside its physical dimensions", () => {
    for (const catalog of CATALOG) {
      const item = instantiate(catalog, crypto.randomUUID(), { x: 0, y: 0 });
      const parts = furnitureParts(item);
      expect(parts.length).toBeGreaterThan(0);
      for (const part of parts) {
        expect(
          Math.abs(part.position[0]) + part.size[0] / 2,
        ).toBeLessThanOrEqual(item.width / 2000 + 1e-8);
        expect(
          Math.abs(part.position[2]) + part.size[2] / 2,
        ).toBeLessThanOrEqual(item.depth / 2000 + 1e-8);
        expect(part.position[1] - part.size[1] / 2).toBeGreaterThanOrEqual(
          -1e-8,
        );
        expect(part.position[1] + part.size[1] / 2).toBeLessThanOrEqual(
          item.height / 1000 + 1e-8,
        );
      }
    }
  });
});
