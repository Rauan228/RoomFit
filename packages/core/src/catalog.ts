import {
  createDocument,
  instantiate,
  makeRoom,
  rectangle,
  type CatalogItem,
  type ProjectDocument,
} from "./model";
import { assetCatalogFields } from "./assets";
const entries: [string, string, string, number, number, number][] = [
  ["bed-double", "Кровать двуспальная", "Кровати", 1760, 2180, 1100],
  ["bed-single", "Кровать односпальная", "Кровати", 970, 2130, 860],
  ["bed-kids", "Детская кровать", "Кровати", 850, 1650, 660],
  ["sofa", "Диван", "Диваны", 2200, 950, 850],
  ["sofa-small", "Компактный диван", "Диваны", 1600, 900, 800],
  ["armchair", "Кресло", "Кресла", 800, 800, 900],
  ["desk", "Рабочий стол", "Столы", 1200, 600, 750],
  ["table", "Обеденный стол", "Столы", 1400, 800, 750],
  ["coffee", "Журнальный стол", "Столы", 800, 550, 450],
  ["chair", "Стул", "Стулья", 480, 560, 860],
  ["wardrobe", "Шкаф", "Шкафы", 1800, 600, 2200],
  ["dresser", "Комод", "Комоды", 1000, 450, 900],
  ["nightstand", "Тумба", "Тумбы", 500, 400, 500],
  ["shelf", "Стеллаж", "Стеллажи", 800, 350, 1800],
  ["kitchen", "Кухонный гарнитур", "Кухня", 2400, 600, 900],
  ["sink", "Раковина", "Сантехника", 600, 500, 850],
  ["bath", "Ванна", "Сантехника", 1700, 750, 600],
  ["toilet", "Унитаз", "Сантехника", 400, 650, 750],
  ["fridge", "Холодильник", "Техника", 600, 650, 1900],
  ["washer", "Стиральная машина", "Техника", 600, 600, 850],
  ["stove", "Плита", "Техника", 600, 600, 850],
  ["lamp", "Торшер", "Освещение", 400, 400, 1700],
  ["plant", "Растение", "Декор", 450, 450, 1000],
  ["rug", "Ковёр", "Декор", 2000, 1400, 10],
  ["sofa-corner", "Угловой диван", "Диваны", 2800, 1800, 850],
  ["wall-shelf", "Настенная полка", "Стеллажи", 1000, 260, 240],
];
export const CATALOG: CatalogItem[] = entries.map(
  ([id, name, category, width, depth, height]) => ({
    id,
    name,
    category,
    width,
    depth,
    height,
    type: id.startsWith("bed") ? "bed" : id.startsWith("sofa") ? "sofa" : id,
    color: ["sofa", "armchair"].includes(id)
      ? "#819986"
      : id.startsWith("bed")
        ? "#e9e0d1"
        : id === "plant"
          ? "#639568"
          : "#cbb99e",
    clearance: ["wardrobe", "dresser"].includes(id) ? 600 : 0,
    tags: [category],
    ...assetCatalogFields(id),
  }),
);
export const CATEGORIES = [...new Set(CATALOG.map((c) => c.category))];
export const TEMPLATE_NAMES = [
  "Спальня",
  "Гостиная",
  "Детская",
  "Кухня",
  "Кабинет",
  "Студия",
  "Небольшая квартира",
];
// Templates place stock beds against the wall from their actual outer depth.
const catalogWidth = (id: string) => CATALOG.find((c) => c.id === id)!.width;
const bedAgainstWall = (id: string) =>
  CATALOG.find((c) => c.id === id)!.depth / 2;
export function createTemplate(name: string): ProjectDocument {
  if (name === "Небольшая квартира") {
    const doc = createDocument(name, 4000, 6400),
      f = doc.floors[0],
      bedroom = makeRoom("Спальня", rectangle(3400, 3200, 4000, 0)),
      kitchen = makeRoom("Кухня", rectangle(3400, 3200, 4000, 3200));
    f.rooms[0].name = "Гостиная";
    f.rooms.push(bedroom.room, kitchen.room);
    f.walls.push(...bedroom.walls, ...kitchen.walls);
    doc.variants[0].items = [
      ["sofa", 2000, 5400],
      ["coffee", 2000, 4200],
      ["bed-double", 5900, bedAgainstWall("bed-double")],
      ["wardrobe", 5300, 2900],
      ["kitchen", 5600, 3500],
      ["table", 5900, 5100],
    ].map(([key, x, y]) =>
      instantiate(
        CATALOG.find((c) => c.id === key)!,
        f.id,
        { x: Number(x), y: Number(y) },
      ),
    );
    f.openings = f.rooms.map((r) => ({
      id: crypto.randomUUID(),
      wallId: f.walls.filter((w) => w.roomId === r.id)[r === f.rooms[0] ? 0 : 3]
        .id,
      kind: "sliding",
      offset: r === f.rooms[0] ? 100 : 1000,
      width: 1100,
      height: 2100,
      sill: 0,
      flip: false,
      inward: true,
    }));
    return doc;
  }
  const doc = createDocument(
    name,
    name === "Студия" ? 6000 : 4000,
    name === "Студия" ? 4500 : 3200,
  );
  const floor = doc.floors[0];
  const items =
    name === "Спальня" || name === "Детская"
      ? [
          [
            name === "Детская" ? "bed-kids" : "bed-double",
            2000,
            bedAgainstWall(name === "Детская" ? "bed-kids" : "bed-double"),
          ],
          ["wardrobe", 900, 2900],
          [
            "nightstand",
            2000 -
              catalogWidth(name === "Детская" ? "bed-kids" : "bed-double") / 2 -
              270,
            250,
          ],
        ]
      : name === "Кухня"
        ? [
            ["kitchen", 1200, 300],
            ["table", 1800, 2000],
            ["fridge", 3650, 325],
          ]
        : name === "Кабинет"
          ? [
              ["desk", 2800, 300],
              ["chair", 2800, 950],
              ["shelf", 400, 2000],
            ]
          : [
              ["sofa", 1800, 2650],
              ["coffee", 1800, 1550],
              ["armchair", 3450, 1600],
              ["plant", 300, 300],
            ];
  doc.variants[0].items = items.map(([key, x, y]) =>
    instantiate(
      CATALOG.find((c) => c.id === key)!,
      floor.id,
      { x: Number(x), y: Number(y) },
    ),
  );
  floor.openings = [
    {
      id: crypto.randomUUID(),
      wallId: floor.walls[0].id,
      kind: "window",
      offset: 1400,
      width: 1400,
      height: 1500,
      sill: 900,
      flip: false,
      inward: true,
    },
    {
      id: crypto.randomUUID(),
      wallId: floor.walls[2].id,
      kind: "door",
      offset: 100,
      width: 800,
      height: 2100,
      sill: 0,
      flip: false,
      inward: true,
    },
  ];
  return doc;
}
