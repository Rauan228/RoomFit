import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  CATALOG,
  createDocument,
  instantiate,
  type Furniture,
} from "@roomfit/core";

// Real browser screenshots of furnished demo rooms with the approved library.
test.use({
  launchOptions: {
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
});
test.setTimeout(240000);

type Placement = [id: string, x: number, y: number, angle?: number];
const rooms: Record<string, { size: [number, number]; items: Placement[] }> =
  {
    bedroom: {
      size: [4200, 3600],
      items: [
        ["rug", 2100, 1700],
        ["bed-double", 2100, 1090],
        ["nightstand", 900, 230],
        ["nightstand", 3300, 230],
        ["wardrobe", 330, 2550, 90],
        ["plant", 3850, 3250],
        ["lamp", 3750, 2450],
      ],
    },
    dining: {
      size: [4000, 3400],
      items: [
        ["rug", 2000, 1700],
        ["table", 2000, 1700],
        ["chair", 1650, 1000],
        ["chair", 2350, 1000],
        ["chair", 1650, 2400, 180],
        ["chair", 2350, 2400, 180],
        ["shelf", 3500, 200],
        ["plant", 400, 300],
      ],
    },
    living: {
      size: [4600, 3800],
      items: [
        ["rug", 2300, 1900],
        ["sofa", 2300, 3300, 180],
        ["armchair", 900, 1700, 90],
        ["coffee", 2300, 1950],
        ["lamp", 3900, 3300],
        ["wall-shelf", 2300, 140],
        ["plant", 4200, 400],
      ],
    },
    kitchen: {
      size: [4200, 3200],
      items: [
        ["kitchen", 1500, 300],
        ["stove", 3000, 300],
        ["fridge", 3700, 325],
        ["washer", 300, 2600, 90],
        ["table", 2400, 2200],
        ["chair", 1340, 2200, 90],
        ["chair", 3460, 2200, 270],
      ],
    },
  };

async function scene(page: Page, name: string, info: { project: { name: string } }) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const password = "roomfit-showcase-password";
  await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": me.csrf },
    data: {
      name: "Showcase",
      email: `showcase-${name}-${info.project.name}-${Date.now()}@example.com`,
      password,
    },
  });
  const room = rooms[name];
  const doc = createDocument(`Демо: ${name}`, ...room.size),
    floor = doc.floors[0];
  doc.variants[0].items = room.items.map(([id, x, y, angle]) => {
    const item: Furniture = instantiate(CATALOG.find((c) => c.id === id)!, floor.id, { x, y });
    return { ...item, angle: angle ?? 0 };
  });
  const csrf = (await (await page.request.get("/api/auth/me")).json()).csrf;
  const created = await page.request.post("/api/projects", {
    headers: { "X-CSRF-Token": csrf },
    data: { document: doc },
  });
  expect(created.ok(), await created.text()).toBe(true);
  return { project: await created.json(), password, count: room.items.length };
}

for (const name of Object.keys(rooms))
  test(`showcase room: ${name}`, async ({ page }, info) => {
    const { project, password } = await scene(page, name, info);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(`/project/${project.id}`);
      await page.getByRole("button", { name: "3D", exact: true }).click();
      await expect(page.locator(".three-host")).toHaveAttribute(
        "data-scene-ready",
        "true",
        { timeout: 60000 },
      );
      const unique = new Set(rooms[name].items.map((i) => i[0])).size;
      await expect(page.locator(".three-host")).toHaveAttribute(
        "data-assets-loaded",
        String(unique),
        { timeout: 120000 },
      );
      await expect(page.locator(".three-host")).toHaveAttribute(
        "data-assets-failed",
        "0",
      );
      await page.getByLabel("Качество 3D").selectOption("high");
      await page.waitForTimeout(1500);
      await mkdir("artifacts/showcase", { recursive: true });
      await page.screenshot({
        path: `artifacts/showcase/${name}-${info.project.name}.png`,
      });
      // A closer look at room scale: zoom the orbit camera in on the centre.
      const canvas = page.locator(".three-host canvas");
      const box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, -240);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(1200);
      await page.screenshot({
        path: `artifacts/showcase/${name}-${info.project.name}-close.png`,
      });
      expect(errors).toEqual([]);
    } finally {
      const me = await (await page.request.get("/api/auth/me")).json();
      await page.request.delete("/api/profile", {
        headers: { "X-CSRF-Token": me.csrf },
        data: { currentPassword: password },
      });
    }
  });
