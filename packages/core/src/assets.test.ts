import { describe, expect, it } from "vitest";
import { Euler, Vector3 } from "three";
import { ASSET_MANIFEST, assetById, furnitureAsset } from "./assets";
import { CATALOG } from "./catalog";
import {
  analyzeFloor,
  furnitureGeometry,
  furnitureOverlap,
  furnitureServiceGeometry,
  polygonArea,
} from "./geometry";
import { createDocument, documentSchema, instantiate } from "./model";

const item = (id: string, point = { x: 2000, y: 1600 }) =>
  instantiate(
    CATALOG.find((c) => c.id === id)!,
    createDocument().floors[0].id,
    point,
  );
describe("Synchronized asset instances", () => {
  it("counts an overlapping curved asset once in occupied area", () => {
    const doc = createDocument(),
      floor = doc.floors[0];
    const sofa = instantiate(
      CATALOG.find((c) => c.id === "sofa")!,
      floor.id,
      { x: 2000, y: 1600 },
    );
    expect(
      analyzeFloor(floor, [sofa, { ...sofa, id: crypto.randomUUID() }])
        .freeArea,
    ).toBe(analyzeFloor(floor, [sofa]).freeArea);
  });
  it("only exposes approved assets with real geometry and all four texture variants", () => {
    expect(Object.keys(ASSET_MANIFEST)).toHaveLength(26);
    for (const asset of Object.values(ASSET_MANIFEST)) {
      expect(asset.validation_status).toBe("approved");
      expect(asset.footprints.visual.length).toBeGreaterThan(0);
      expect(asset.footprints.collision.length).toBeGreaterThan(0);
      expect(asset.footprints.volumes.length).toBeGreaterThan(0);
      expect(asset.material_variants).toHaveLength(4);
      expect(asset.orientation).toMatchObject({
        front: "+Z",
        up: "+Y",
        pivot: "bottom_center",
      });
      expect(asset.glb_bytes).toBeLessThan(4_000_000);
      expect(asset.triangles).toBeLessThanOrEqual(60000);
    }
  });
  for (const angle of [0, 45, 90, 180, 270])
    it(`matches the 2D contour and Three.js rotation at ${angle} degrees`, () => {
      const sofa = { ...item("sofa-corner"), angle };
      const asset = furnitureAsset(sofa)!.asset;
      const source = asset.footprints.collision[0].outer;
      const plan = furnitureGeometry(sofa)[0][0];
      source.forEach((point, index) => {
        const world = new Vector3(
          ((point.x - 0.5) * sofa.width) / 1000,
          0,
          ((point.y - 0.5) * sofa.depth) / 1000,
        )
          .applyEuler(new Euler(0, (-angle * Math.PI) / 180, 0))
          .add(new Vector3(sofa.x / 1000, 0, sofa.y / 1000));
        expect(world.x * 1000).toBeCloseTo(plan[index][0], 6);
        expect(world.z * 1000).toBeCloseTo(plan[index][1], 6);
      });
    });
  it("allows a chair in the corner sofa's empty notch, but detects the occupied chaise", () => {
    const sofa = item("sofa-corner", { x: 2000, y: 2000 });
    expect(furnitureOverlap(sofa, item("chair", { x: 3000, y: 2600 }))).toBe(0);
    expect(
      furnitureOverlap(sofa, item("chair", { x: 1000, y: 2600 })),
    ).toBeGreaterThan(1);
  });
  it("uses actual height volumes for shelves and leaves the floor area underneath free", () => {
    const doc = createDocument(),
      floor = doc.floors[0];
    const shelf = instantiate(
      CATALOG.find((c) => c.id === "wall-shelf")!,
      floor.id,
      { x: 2000, y: 1600 },
    );
    const sofa = instantiate(
      CATALOG.find((c) => c.id === "sofa")!,
      floor.id,
      { x: 2000, y: 1600 },
    );
    expect(shelf.elevation).toBe(1500);
    expect(furnitureOverlap(shelf, sofa)).toBe(0);
    expect(
      furnitureOverlap({ ...shelf, elevation: 300 }, sofa),
    ).toBeGreaterThan(1);
    expect(analyzeFloor(floor, [shelf]).freeArea).toBe(
      analyzeFloor(floor, []).freeArea,
    );
  });
  it("places cabinet access zones in front and rotates them with the same instance", () => {
    const wardrobe = item("wardrobe", { x: 2000, y: 1800 });
    const original = furnitureServiceGeometry(wardrobe);
    expect(original[0][0].every(([, y]) => y >= 2100)).toBe(true);
    const rotated = furnitureServiceGeometry({ ...wardrobe, angle: 90 });
    expect(rotated[0][0].every(([x]) => x <= 1700 + 0.001)).toBe(true);
    expect(polygonArea(original)).toBeCloseTo(polygonArea(rotated), 3);
  });
  it("keeps IDs, dimensions, elevation and the selected finish in the saved JSON", () => {
    const doc = createDocument();
    const shelf = instantiate(
      CATALOG.find((c) => c.id === "wall-shelf")!,
      doc.floors[0].id,
      { x: 2000, y: 1600 },
    );
    const finish = assetById("wall-shelf")!.material_variants.find(
      (v) => v.id === "graphite",
    )!;
    shelf.materialVariant = finish.id;
    shelf.color = finish.color;
    doc.variants[0].items.push(shelf);
    doc.settings.furnitureMode = "technical";
    const reopened = documentSchema.parse(JSON.parse(JSON.stringify(doc)));
    expect(reopened.variants[0].items[0]).toEqual(shelf);
    expect(reopened.settings.furnitureMode).toBe("technical");
    const legacy = createDocument();
    legacy.variants[0].items.push({
      ...shelf,
      assetId: undefined,
      assetVersion: undefined,
      materialVariant: undefined,
      elevation: undefined,
    });
    expect(() => documentSchema.parse(legacy)).not.toThrow();
  });
});
