import { useState } from "react";
import { furnitureAsset, type Furniture } from "@roomfit/core";

export default function AssetArtwork({
  item,
  mode = "detailed",
  thumbnail = false,
  highResolution = false,
}: {
  item: Furniture;
  mode?: "detailed" | "technical";
  thumbnail?: boolean;
  highResolution?: boolean;
}) {
  const resolved = furnitureAsset(item);
  const [failed, setFailed] = useState<string>();
  if (!resolved) return null;
  const { asset, variant } = resolved;
  const url =
    asset.base_url +
    (mode === "technical"
      ? asset.assets.technical_2d
      : thumbnail
        ? variant.top_128
        : highResolution
          ? variant.top_2d.replace("top_view_512.webp", "top_view_1024.png")
          : variant.top_2d);
  const frame =
    mode === "technical"
      ? {
          frame_width_mm: asset.dimensions.width_mm,
          frame_depth_mm: asset.dimensions.depth_mm,
        }
      : asset.top_frame_mm;
  const width = (frame.frame_width_mm / asset.dimensions.width_mm) * 1000;
  const depth = (frame.frame_depth_mm / asset.dimensions.depth_mm) * 1000;
  if (failed === url)
    return (
      <path
        d={asset.footprints.visual
          .map((p) =>
            [p.outer, ...p.holes]
              .map(
                (ring) =>
                  "M " +
                  ring.map((v) => `${v.x * 1000},${v.y * 1000}`).join(" L ") +
                  " Z",
              )
              .join(" "),
          )
          .join(" ")}
        fillRule="evenodd"
        fill={variant.color}
        stroke="#526052"
        strokeWidth={5}
      />
    );
  return (
    <image
      data-asset-id={asset.asset_id}
      data-asset-version={asset.generation_version}
      data-material-variant={variant.id}
      href={url}
      x={(1000 - width) / 2}
      y={(1000 - depth) / 2}
      width={width}
      height={depth}
      preserveAspectRatio="none"
      onError={() => setFailed(url)}
    />
  );
}
