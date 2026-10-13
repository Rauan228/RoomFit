import type { Furniture } from "./model";
type Triple = [number, number, number];
export interface Part {
  kind: "box" | "cylinder" | "sphere";
  position: Triple;
  size: Triple;
  color: string;
  roughness?: number;
  metalness?: number;
}
/** Parts are rebuilt in physical units; the whole object is never stretched. */
export function furnitureParts(item: Furniture): Part[] {
  const w = item.width / 1000,
    d = item.depth / 1000,
    h = item.height / 1000,
    color = item.color;
  const parts: Part[] = [],
    white = "#eee9dd",
    wood = "#a98d6a",
    metal = "#58605b";
  const box = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    shade = color,
    kind: Part["kind"] = "box",
    roughness = 0.72,
    metalness = 0,
  ) => {
    if (width <= 0 || height <= 0 || depth <= 0) return;
    parts.push({
      kind,
      size: [width, height, depth],
      position: [x, y, z],
      color: shade,
      roughness,
      metalness,
    });
  };
  const legs = (height: number, thickness: number, inset = 0.08) => {
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        box(
          thickness,
          height,
          thickness,
          x * w * (0.5 - inset),
          height / 2,
          z * d * (0.5 - inset),
          wood,
        );
  };
  if (item.type === "bed") {
    legs(h * 0.2, Math.min(w, d) * 0.07);
    box(w, h * 0.28, d, 0, h * 0.34, 0, wood);
    box(w * 0.97, h * 0.25, d * 0.96, 0, h * 0.605, 0, white);
    box(w * 0.97, h * 0.06, d * 0.65, 0, h * 0.76, d * 0.12, color);
    box(w, h, d * 0.035, 0, h / 2, -d * 0.4825, wood);
    const count = w >= 1.25 ? 2 : 1;
    for (let n = 0; n < count; n++)
      box(
        (w * 0.8) / count,
        h * 0.12,
        d * 0.18,
        ((n - (count - 1) / 2) * w) / count,
        h * 0.79,
        -d * 0.32,
        "#fffdf4",
      );
  } else if (item.type === "sofa" || item.type === "armchair") {
    legs(h * 0.14, Math.min(w, d) * 0.065);
    box(w * 0.94, h * 0.22, d * 0.93, 0, h * 0.25, 0);
    box(w, h * 0.69, d * 0.2, 0, h * 0.655, -d * 0.4);
    for (const x of [-1, 1])
      box(w * 0.08, h * 0.51, d, x * w * 0.46, h * 0.395, 0);
    const seats =
      item.type === "armchair"
        ? 1
        : Math.max(2, Math.min(4, Math.round(w / 0.8)));
    for (let n = 0; n < seats; n++) {
      const x = ((n - (seats - 1) / 2) * w * 0.8) / seats;
      box(
        (w * 0.77) / seats,
        h * 0.13,
        d * 0.7,
        x,
        h * 0.43,
        d * 0.075,
        "#d9c8ad",
      );
      box(
        (w * 0.77) / seats,
        h * 0.38,
        d * 0.13,
        x,
        h * 0.75,
        -d * 0.32,
        "#d9c8ad",
      );
    }
  } else if (["desk", "table", "coffee"].includes(item.type)) {
    legs(h * 0.94, Math.min(w, d) * 0.055);
    box(w, h * 0.06, d, 0, h * 0.97, 0);
    if (item.type === "desk")
      box(w * 0.22, h * 0.21, d * 0.85, w * 0.32, h * 0.82, 0, wood);
  } else if (item.type === "chair") {
    legs(h * 0.49, Math.min(w, d) * 0.07);
    box(w, h * 0.08, d, 0, h * 0.53, 0);
    box(w, h * 0.42, d * 0.085, 0, h * 0.79, -d * 0.4575);
  } else if (
    ["wardrobe", "dresser", "nightstand", "shelf", "kitchen"].includes(
      item.type,
    )
  ) {
    box(w, h * 0.06, d, 0, h * 0.97, 0);
    box(w, h * 0.06, d, 0, h * 0.03, 0, wood);
    for (const x of [-1, 1])
      box(w * 0.03, h * 0.94, d, x * w * 0.485, h / 2, 0, wood);
    box(w, h, d * 0.035, 0, h / 2, -d * 0.4825, wood);
    if (item.type === "shelf") {
      const count = Math.max(2, Math.min(6, Math.round(h / 0.38)));
      for (let n = 1; n < count; n++)
        box(w, h * 0.018, d, 0, (h * n) / count, 0);
      box(w * 0.15, h * 0.22, d * 0.62, -w * 0.22, h * 0.19, 0, "#819475");
      box(w * 0.19, h * 0.15, d * 0.5, w * 0.2, h * 0.66, 0, "#c0ad87");
    } else {
      const columns =
        item.type === "wardrobe" || item.type === "kitchen"
          ? Math.max(2, Math.min(5, Math.round(w / 0.6)))
          : 1;
      const rows =
        item.type === "dresser" || item.type === "nightstand" ? 3 : 1;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < columns; col++) {
          const x = ((col - (columns - 1) / 2) * w) / columns,
            y = h * (0.06 + ((row + 0.5) * 0.88) / rows);
          box(
            (w * 0.93) / columns,
            (h * 0.86) / rows,
            d * 0.04,
            x,
            y,
            d * 0.48,
          );
          box(
            (w * 0.12) / columns,
            h * 0.012,
            d * 0.025,
            x,
            y,
            d * 0.4875,
            metal,
            "box",
            0.3,
            0.65,
          );
        }
    }
  } else if (item.type === "fridge") {
    box(w, h, d * 0.95, 0, h / 2, -d * 0.025, "#dddeda");
    for (const [height, y] of [
      [h * 0.28, h * 0.85],
      [h * 0.69, h * 0.345],
    ])
      box(w * 0.97, height, d * 0.05, 0, y, d * 0.475, "#e9eae5");
    box(
      w * 0.025,
      h * 0.18,
      d * 0.025,
      w * 0.36,
      h * 0.66,
      d * 0.4875,
      metal,
      "box",
      0.2,
      0.7,
    );
  } else if (item.type === "washer") {
    box(w, h, d, 0, h / 2, 0, white);
    box(w * 0.61, h * 0.5, d * 0.02, 0, h * 0.46, d * 0.49, metal);
    box(w * 0.5, h * 0.39, d * 0.025, 0, h * 0.46, d * 0.4875, "#789087");
    box(w * 0.72, h * 0.07, d * 0.025, 0, h * 0.87, d * 0.4875, "#cbcfc9");
  } else if (item.type === "stove") {
    box(w, h, d, 0, h / 2, 0, white);
    box(w * 0.9, h * 0.55, d * 0.02, 0, h * 0.4, d * 0.49, "#3c4542");
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        box(
          w * 0.27,
          h * 0.015,
          d * 0.27,
          x * w * 0.24,
          h * 0.9925,
          z * d * 0.24,
          metal,
          "cylinder",
          0.25,
          0.6,
        );
  } else if (item.type === "bath" || item.type === "sink") {
    box(w, h * 0.8, d, 0, h * 0.4, 0, "#f1f0e8");
    box(w * 0.84, h * 0.025, d * 0.76, 0, h * 0.82, 0, "#9cbbb6");
    for (const x of [-1, 1])
      box(w * 0.06, h * 0.2, d, x * w * 0.47, h * 0.9, 0, white);
    for (const z of [-1, 1])
      box(w, h * 0.2, d * 0.06, 0, h * 0.9, z * d * 0.47, white);
  } else if (item.type === "toilet") {
    box(w * 0.72, h * 0.52, d * 0.62, 0, h * 0.26, d * 0.12, white, "cylinder");
    box(w, h * 0.08, d * 0.76, 0, h * 0.57, d * 0.12, white, "cylinder");
    box(w * 0.9, h, d * 0.21, 0, h / 2, -d * 0.395, white);
  } else if (item.type === "lamp") {
    box(
      w * 0.7,
      h * 0.035,
      d * 0.7,
      0,
      h * 0.0175,
      0,
      metal,
      "cylinder",
      0.3,
      0.5,
    );
    box(
      w * 0.045,
      h * 0.86,
      d * 0.045,
      0,
      h * 0.465,
      0,
      metal,
      "cylinder",
      0.3,
      0.5,
    );
    box(w, h * 0.2, d, 0, h * 0.9, 0, white, "cylinder");
  } else if (item.type === "plant") {
    box(w * 0.58, h * 0.3, d * 0.58, 0, h * 0.15, 0, wood, "cylinder");
    box(w * 0.04, h * 0.6, d * 0.04, 0, h * 0.59, 0, wood, "cylinder");
    box(w, h * 0.64, d, 0, h * 0.68, 0, "#81966b", "sphere");
  } else if (item.type === "rug") box(w, h, d, 0, h / 2, 0);
  else box(w, h, d, 0, h / 2, 0);
  return parts;
}
