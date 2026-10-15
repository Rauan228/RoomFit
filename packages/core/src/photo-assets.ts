import { z } from "zod";
import type { AssetMetadata } from "./assets";

const point = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
const polygon = z.object({
  outer: z.array(point).min(3).max(200),
  holes: z.array(z.array(point).min(3).max(200)).max(8),
});
const polygons = z.array(polygon).min(1).max(32);
export const photoAssetSchema = z.object({
  jobId: z.string().uuid(),
  version: z.number().int().min(1).max(10000),
  dimensions: z.object({
    width_mm: z.number().min(10).max(20000),
    depth_mm: z.number().min(10).max(20000),
    height_mm: z.number().min(10).max(20000),
  }),
  frame: z.object({
    frame_width_mm: z.number().positive().max(50000),
    frame_depth_mm: z.number().positive().max(50000),
  }),
  footprints: z.object({
    visual: polygons,
    collision: polygons,
    volumes: z
      .array(
        z.object({
          min_height_mm: z.number().min(0),
          max_height_mm: z.number().positive(),
          footprints: polygons,
        }),
      )
      .max(32),
  }),
  triangles: z.number().int().positive().max(60000),
  glbBytes: z.number().int().positive().max(12000000),
  modelSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PhotoAsset = z.infer<typeof photoAssetSchema>;

/** Self-contained geometry travels with the instance, including exports and layout workers.
 * URLs can only address the authorized API, never arbitrary user-supplied locations.
 */
export function photoAssetMetadata(
  photo: PhotoAsset,
  name: string,
  type: string,
): AssetMetadata {
  return {
    asset_id: `photo_${photo.jobId}`,
    generation_version: `photo-v${photo.version}`,
    name,
    type,
    category: "personal",
    catalog_category: "Моя мебель",
    resizing: "scalable",
    dimensions: photo.dimensions,
    orientation: {
      front: "+Z",
      up: "+Y",
      pivot: "bottom_center",
      units: "meters",
    },
    installation: "floor",
    elevation_mm: 0,
    clearance_mm: 0,
    base_url: `/api/photo-furniture/assets/${photo.jobId}/${photo.version}/`,
    validation_status: "approved",
    assets: {
      model_3d: "3d/model.glb",
      top_2d: "2d/original/top_view_512.webp",
      technical_2d: "2d/technical.svg",
      preview: "previews/isometric.webp",
      comparison: "comparison.jpg",
    },
    top_frame_mm: photo.frame,
    footprints: {
      ...photo.footprints,
      technical_features: [],
      clearance_zones: [],
    },
    material_variants: [
      {
        id: "original",
        name: "Материал с фотографии",
        color: "#ffffff",
        roughness: 0.7,
        top_2d: "2d/original/top_view_512.webp",
        top_128: "2d/original/top_view_128.webp",
        top_256: "2d/original/top_view_256.webp",
      },
    ],
    triangles: photo.triangles,
    glb_bytes: photo.glbBytes,
    license: "User-generated; Tripo terms apply",
  };
}
