import { describe, expect, it } from "vitest";
import {
  ASSET_MANIFEST,
  furnitureAsset,
  upgradeFurnitureAsset,
} from "./assets";
import { photoAssetSchema } from "./photo-assets";
import { createDocument, documentSchema, instantiate } from "./model";
import { furnitureGeometry, polygonArea } from "./geometry";

const chair = ASSET_MANIFEST.chair;
const photo = photoAssetSchema.parse({
  jobId: "5d8c4552-4100-4280-8023-c6ce306d719a",
  version: 1,
  dimensions: chair.dimensions,
  frame: chair.top_frame_mm,
  footprints: {
    visual: chair.footprints.visual,
    collision: chair.footprints.collision,
    volumes: chair.footprints.volumes,
  },
  triangles: chair.triangles,
  glbBytes: chair.glb_bytes,
  modelSha256: "a".repeat(64),
});
describe("Private photo furniture", () => {
  it("retains the pinned private model through instantiation and project JSON round trips", () => {
    const doc = createDocument();
    const item = instantiate(
      {
        id: crypto.randomUUID(),
        name: "Мой стул",
        type: "chair",
        category: "Моя мебель",
        width: 450,
        depth: 500,
        height: 850,
        color: "#ffffff",
        clearance: 0,
        tags: [],
        photoAsset: photo,
        contour: photo.footprints.collision[0].outer,
      },
      doc.floors[0].id,
      { x: 1500, y: 1400 },
    );
    doc.variants[0].items = [item];
    const reopened = documentSchema.parse(JSON.parse(JSON.stringify(doc)))
      .variants[0].items[0];
    expect(reopened.photoAsset).toEqual(photo);
    expect(furnitureAsset(reopened)?.asset.base_url).toBe(
      `/api/photo-furniture/assets/${photo.jobId}/1/`,
    );
    expect(upgradeFurnitureAsset(reopened)).toBeUndefined();
    expect(polygonArea(furnitureGeometry(reopened))).toBeGreaterThan(0);
  });
  it("rejects user-controlled asset paths and excessive geometry", () => {
    expect(
      photoAssetSchema.safeParse({ ...photo, jobId: "../../another-user" })
        .success,
    ).toBe(false);
    expect(
      photoAssetSchema.safeParse({ ...photo, triangles: 60001 }).success,
    ).toBe(false);
    expect(
      photoAssetSchema.safeParse({ ...photo, modelSha256: "invalid" }).success,
    ).toBe(false);
  });
});
