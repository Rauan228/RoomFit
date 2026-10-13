import manifest from "./asset-manifest.json" with { type: "json" };
import versions from "./asset-versions.json" with { type: "json" };
import type { Furniture, Point } from "./model";

export interface AssetPolygon {
  outer: Point[];
  holes: Point[][];
}
export interface AssetMetadata {
  asset_id: string;
  generation_version: string;
  name: string;
  category: string;
  catalog_category: string;
  type: string;
  resizing: "fixed" | "scalable" | "parametric";
  dimensions: { width_mm: number; depth_mm: number; height_mm: number };
  orientation: {
    front: "+Z";
    up: "+Y";
    pivot: "bottom_center";
    units: "meters";
  };
  installation: "floor" | "wall";
  elevation_mm: number;
  clearance_mm: number;
  base_url: string;
  validation_status: "approved" | "rejected";
  assets: {
    model_3d: string;
    top_2d: string;
    technical_2d: string;
    preview: string;
    comparison: string;
  };
  top_frame_mm: { frame_width_mm: number; frame_depth_mm: number };
  footprints: {
    visual: AssetPolygon[];
    collision: AssetPolygon[];
    volumes: {
      min_height_mm: number;
      max_height_mm: number;
      footprints: AssetPolygon[];
    }[];
    technical_features: AssetPolygon[];
    clearance_zones: { kind: string; depth_mm: number; points: Point[] }[];
  };
  material_variants: {
    id: string;
    name: string;
    color: string;
    roughness: number;
    top_2d: string;
    top_128: string;
    top_256: string;
  }[];
  triangles: number;
  glb_bytes: number;
  license: string;
}
export const ASSET_MANIFEST = manifest as unknown as Record<
  string,
  AssetMetadata
>;
export const ASSET_VERSIONS = versions as unknown as Record<
  string,
  AssetMetadata
>;

export function assetById(
  id?: string,
  version?: string,
): AssetMetadata | undefined {
  if (!id) return;
  const asset = version
    ? ASSET_VERSIONS[`${id}@${version}`] ||
      (ASSET_MANIFEST[id]?.generation_version === version
        ? ASSET_MANIFEST[id]
        : undefined)
    : ASSET_MANIFEST[id];
  return asset?.validation_status === "approved" ? asset : undefined;
}
export function furnitureAsset(
  item: Pick<
    Furniture,
    | "catalogId"
    | "assetId"
    | "assetVersion"
    | "color"
    | "materialVariant"
    | "contour"
  >,
) {
  const asset = assetById(item.assetId || item.catalogId, item.assetVersion);
  if (!asset) return;
  // A custom contour or a legacy arbitrary paint does not silently become a different model.
  if (item.contour) {
    const canonical = asset.footprints.collision[0]?.outer;
    if (
      !canonical ||
      item.contour.length !== canonical.length ||
      item.contour.some(
        (p, i) =>
          Math.abs(p.x - canonical[i].x) > 0.00001 ||
          Math.abs(p.y - canonical[i].y) > 0.00001,
      )
    )
      return;
  }
  const variant = item.materialVariant
    ? asset.material_variants.find((v) => v.id === item.materialVariant)
    : asset.material_variants.find(
        (v) => v.color.toLowerCase() === item.color.toLowerCase(),
      );
  return variant ? { asset, variant } : undefined;
}
export function assetCatalogFields(id: string) {
  const asset = assetById(id);
  return asset
    ? {
        assetId: id,
        assetVersion: asset.generation_version,
        materialVariant: "original",
        elevation: asset.elevation_mm,
        contour: asset.footprints.collision[0].outer,
        color: asset.material_variants[0].color,
        clearance: asset.clearance_mm,
        width: asset.dimensions.width_mm,
        depth: asset.dimensions.depth_mm,
        height: asset.dimensions.height_mm,
      }
    : {};
}
