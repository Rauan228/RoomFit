import {
  createDocument,
  instantiate,
  documentSchema,
  uid,
} from "../packages/core/src/model";
import { CATALOG } from "../packages/core/src/catalog";
import { STARTER_ROOMS, type StarterKey } from "./starter-rooms";

export function createStarter(key: StarterKey) {
  const source = STARTER_ROOMS[key];
  const doc = createDocument(source.name, source.w * 10, source.h * 10);
  const floor = doc.floors[0];
  for (const [kind, openings] of [
    ["door", source.doors],
    ["window", source.windows],
  ] as const) {
    for (const opening of openings) {
      const wallIndex = { top: 0, right: 1, bottom: 2, left: 3 }[opening.wall];
      const length =
        opening.wall === "top" || opening.wall === "bottom"
          ? source.w
          : source.h;
      floor.openings.push({
        id: uid(),
        wallId: floor.walls[wallIndex].id,
        kind,
        width: opening.w * 10,
        offset:
          (wallIndex < 2 ? opening.at : length - opening.at - opening.w) * 10,
        height: kind === "door" ? 2100 : 1400,
        sill: kind === "door" ? 0 : 900,
        flip: wallIndex >= 2,
        inward: true,
      });
    }
  }
  doc.variants[0].items = source.items.map((item) => {
    const catalog = CATALOG.find((entry) => entry.id === item.catalogId)!;
    const angle = "rot" in item ? (item.rot ?? 0) : 0;
    const turned = angle % 180 !== 0;
    return {
      ...instantiate(catalog, floor.id, {
        x: (item.x + (turned ? item.h : item.w) / 2) * 10,
        y: (item.y + (turned ? item.w : item.h) / 2) * 10,
      }),
      name: item.name,
      width: item.w * 10,
      depth: item.h * 10,
      angle,
    };
  });
  return documentSchema.parse(doc);
}
