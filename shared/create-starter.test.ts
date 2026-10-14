import { describe, expect, it } from "vitest";
import { createStarter } from "./create-starter";
import { STARTER_ROOMS, type StarterKey } from "./starter-rooms";
import {
  analyzeFloor,
  openingPosition,
  bounds,
  furniturePolygon,
} from "../packages/core/src/geometry";
import { documentSchema } from "../packages/core/src/model";
describe("Public plans preserve their physical layout when copied into the platform", () => {
  for (const key of Object.keys(STARTER_ROOMS) as StarterKey[])
    it(key, () => {
      const doc = createStarter(key),
        source = STARTER_ROOMS[key],
        floor = doc.floors[0];
      expect(
        documentSchema.safeParse(JSON.parse(JSON.stringify(doc))).success,
      ).toBe(true);
      expect(
        analyzeFloor(floor, doc.variants[0].items, 0).issues.filter(
          (issue) => issue.level === "error",
        ),
      ).toEqual([]);
      const door = floor.openings.find((o) => o.kind === "door")!;
      const wall = floor.walls.find((w) => w.id === door.wallId)!;
      const opening = openingPosition(wall, door);
      expect(Math.min(opening.start.x, opening.end.x)).toBe(
        source.doors[0].at * 10,
      );
      for (const [index, item] of source.items.entries()) {
        // The source plan stores the position of the physical dimension rectangle.
        // Rounded fabric and small recessed outlines do not change that placement.
        const box = bounds(
          furniturePolygon({
            ...doc.variants[0].items[index],
            contour: undefined,
          }),
        );
        expect(box.minX).toBeCloseTo(item.x * 10);
        expect(box.minY).toBeCloseTo(item.y * 10);
      }
      // Each copy is independent, including all object identifiers.
      expect(createStarter(key).floors[0].id).not.toBe(floor.id);
    });
});
