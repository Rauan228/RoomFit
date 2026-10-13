import { writeFileSync, existsSync } from "node:fs";
import { CATALOG } from "../packages/core/src/catalog";
if (existsSync("asset_factory/specifications.json")) {
  console.log(
    "Canonical specifications already exist. Edit specifications.json to change parameters; existing source data was preserved.",
  );
  process.exit(0);
}

const categories: Record<string, string> = {
  Кровати: "beds",
  Диваны: "sofas",
  Кресла: "armchairs",
  Столы: "tables",
  Стулья: "chairs",
  Шкафы: "wardrobes",
  Комоды: "dressers",
  Тумбы: "nightstands",
  Стеллажи: "shelves",
  Кухня: "kitchens",
  Сантехника: "bathroom",
  Техника: "appliances",
  Освещение: "lighting",
  Декор: "decor",
};
const items = [
  ...CATALOG.filter((c) => !["sofa-corner", "wall-shelf"].includes(c.id)),
  {
    id: "sofa-corner",
    name: "Угловой диван",
    type: "sofa-corner",
    category: "Диваны",
    width: 2800,
    depth: 1800,
    height: 850,
    color: "#819986",
    clearance: 0,
  },
  {
    id: "wall-shelf",
    name: "Настенная полка",
    type: "wall-shelf",
    category: "Стеллажи",
    width: 1000,
    depth: 260,
    height: 240,
    color: "#cbb99e",
    clearance: 400,
  },
];
writeFileSync(
  "asset_factory/specifications.json",
  JSON.stringify(
    items.map((item) => ({
      asset_id: item.id,
      name: item.name,
      category: categories[item.category],
      catalog_category: item.category,
      type: item.type,
      dimensions: {
        width_mm: item.width,
        depth_mm: item.depth,
        height_mm: item.height,
      },
      orientation: {
        front: "+Z",
        back: "-Z",
        left: "-X",
        right: "+X",
        up: "+Y",
        pivot: "bottom_center",
        units: "meters",
      },
      resizing: "scalable",
      installation: item.type === "wall-shelf" ? "wall" : "floor",
      elevation_mm: item.type === "wall-shelf" ? 1500 : 0,
      clearance_mm: item.clearance,
      license: "CC0-1.0",
      author: "RoomFit Asset Factory",
      material_variants: [
        {
          id: "original",
          name: "Оригинальный",
          color: item.color,
          roughness: 0.72,
        },
        { id: "sand", name: "Песочный", color: "#c9b696", roughness: 0.78 },
        {
          id: "graphite",
          name: "Графитовый",
          color: "#66716a",
          roughness: 0.67,
        },
        { id: "walnut", name: "Тёплый орех", color: "#927356", roughness: 0.5 },
      ],
    })),
    null,
    2,
  ),
);
console.log(`Exported ${items.length} canonical asset specifications.`);
