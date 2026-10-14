import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  CATALOG,
  ASSET_VERSIONS,
  assetById,
  createDocument,
  instantiate,
} from "@roomfit/core";

test.use({
  launchOptions: {
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
});
const pilotIds = [
  "sofa",
  "bed-double",
  "table",
  "wardrobe",
  "armchair",
  "sofa-corner",
  "wall-shelf",
];

test("older rooms upgrade stock furniture with one undoable action and retain private objects", async ({
  page,
}, info) => {
  const csrf = (await (await page.request.get("/api/auth/me")).json()).csrf;
  const password = "asset-upgrade-test-password";
  const registration = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      name: "Furniture Upgrade",
      email: `upgrade-${Date.now()}-${info.project.name}@example.com`,
      password,
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);
  const doc = createDocument("Комната до обновления", 6000, 5000),
    floor = doc.floors[0];
  const previous = Object.values(ASSET_VERSIONS).find(
    (asset) =>
      asset.asset_id === "bed-double" &&
      asset.generation_version !== assetById("bed-double")!.generation_version,
  )!;
  expect(previous).toBeDefined();
  const bed = {
    ...instantiate(
      CATALOG.find((c) => c.id === "bed-double")!,
      floor.id,
      { x: 2200, y: 1900 },
    ),
    assetVersion: previous.generation_version,
    contour: previous.footprints.collision[0].outer,
    width: 1800,
    depth: 2100,
    angle: 45,
  };
  const chair = {
    ...instantiate(
      CATALOG.find((c) => c.id === "chair")!,
      floor.id,
      { x: 4400, y: 3500 },
    ),
    assetId: undefined,
    assetVersion: undefined,
    materialVariant: undefined,
    contour: undefined,
    color: "#050505",
  };
  const custom = {
    ...chair,
    id: crypto.randomUUID(),
    catalogId: "private-object",
    x: 1000,
    y: 3600,
    contour: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.4, y: 1 },
    ],
  };
  doc.variants[0].items = [bed, chair, custom];
  const response = await page.request.post("/api/projects", {
    headers: { "X-CSRF-Token": csrf },
    data: { document: doc },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const project = await response.json();
  try {
    await page.goto(`/project/${project.id}`);
    await page
      .getByRole("button", { name: "Обновить мебель", exact: true })
      .click();
    await expect(
      page.locator(`.editor-canvas [data-item-id="${bed.id}"] image`),
    ).toHaveAttribute(
      "data-asset-version",
      assetById("bed-double")!.generation_version,
    );
    await expect(
      page.locator(`.editor-canvas [data-item-id="${chair.id}"] image`),
    ).toHaveAttribute("data-material-variant", "graphite");
    await page.getByTitle("Отменить (Ctrl+Z)").click();
    await expect(
      page.locator(`.editor-canvas [data-item-id="${bed.id}"] image`),
    ).toHaveAttribute("data-asset-version", previous.generation_version);
    await expect(
      page.locator(`.editor-canvas [data-item-id="${chair.id}"] image`),
    ).toHaveCount(0);
    await page.getByTitle("Повторить (Ctrl+Shift+Z)").click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/projects/${project.id}`)).json())
            .document.variants[0].items[0].assetVersion,
      )
      .toBe(assetById("bed-double")!.generation_version);
    const saved = (
      await (await page.request.get(`/api/projects/${project.id}`)).json()
    ).document.variants[0].items;
    expect(saved[0]).toMatchObject({
      id: bed.id,
      x: bed.x,
      y: bed.y,
      width: bed.width,
      depth: bed.depth,
      height: bed.height,
      angle: 45,
    });
    expect(saved[2]).toEqual(custom);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Обновить мебель", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-loaded",
      "2",
      { timeout: 40000 },
    );
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-failed",
      "0",
    );
    const addedGLBs: string[] = [];
    page.on("request", (request) => {
      if (/\/model\.glb(?:\?|$)/.test(request.url()))
        addedGLBs.push(request.url());
    });
    await page.getByRole("button", { name: "2D", exact: true }).click();
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "Мебель и свойства" }).click();
    await page.getByRole("button", { name: /^Растение/ }).click();
    await expect(page.locator(".editor-canvas [data-item-id]")).toHaveCount(4);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expect(addedGLBs).toEqual([]);
    if (await page.locator(".inspector .mobile-close").isVisible())
      await page.locator(".inspector .mobile-close").click();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-loaded",
      "3",
      { timeout: 40000 },
    );
    expect(addedGLBs).toHaveLength(1);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: `artifacts/furniture-upgrade-${info.project.name}.png`,
    });
  } finally {
    const me = await (await page.request.get("/api/auth/me")).json();
    expect(
      (
        await page.request.delete("/api/profile", {
          headers: { "X-CSRF-Token": me.csrf },
          data: { currentPassword: password },
        })
      ).ok(),
    ).toBe(true);
  }
});
test("asset factory: shared models, materials, technical view, exports and persistence", async ({
  page,
}, info) => {
  const ids = pilotIds.filter((id) => assetById(id));
  expect(ids.length).toBeGreaterThan(0);
  const csrf = (await (await page.request.get("/api/auth/me")).json()).csrf;
  const password = "asset-factory-test-password";
  const registered = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      name: "Asset Test",
      email: `assets-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      password,
    },
  });
  expect(registered.ok()).toBe(true);
  const errors: string[] = [],
    glbs: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/model\.glb(?:\?|$)/.test(request.url())) glbs.push(request.url());
  });
  const doc = createDocument("Синхронные ассеты", 12000, 12000);
  const floor = doc.floors[0];
  doc.variants[0].items = ids.map((id, i) =>
    instantiate(
      CATALOG.find((c) => c.id === id)!,
      floor.id,
      { x: 2000 + (i % 3) * 3500, y: 2000 + Math.floor(i / 3) * 3500 },
    ),
  );
  doc.variants[0].items.push(
    instantiate(
      CATALOG.find((c) => c.id === "sofa")!,
      floor.id,
      { x: 7000, y: 10000 },
    ),
  );
  const created = await page.request.post("/api/projects", {
    headers: { "X-CSRF-Token": csrf },
    data: { document: doc },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const project = await created.json();
  try {
    await page.goto(`/project/${project.id}`);
    await expect(
      page.locator(".editor-canvas image[data-asset-id]"),
    ).toHaveCount(ids.length + 1);
    expect(glbs).toEqual([]);
    await page
      .getByLabel("Представление мебели в 2D")
      .selectOption("technical");
    await expect(
      page.locator('.editor-canvas image[data-asset-id="sofa"]').first(),
    ).toHaveAttribute("href", /technical\.svg$/);
    await page.getByLabel("Представление мебели в 2D").selectOption("detailed");
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-loaded",
      String(ids.length),
      { timeout: 40000 },
    );
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-failed",
      "0",
    );
    expect(glbs.length).toBe(ids.length);
    expect(new Set(glbs).size).toBe(ids.length);
    await page.locator(".three-objects summary").click();
    for (const [i, id] of ids.entries()) {
      const instance = doc.variants[0].items[i];
      await page.locator(`[data-item-3d="${instance.id}"]`).click();
      await page
        .getByLabel("Материал мебели", { exact: true })
        .selectOption("graphite");
      await expect(page.getByLabel("Ширина, см", { exact: true })).toHaveValue(
        String(instance.width / 10),
      );
      if (info.project.name === "mobile")
        await page.locator(".inspector .mobile-close").click();
      await page.getByRole("button", { name: "2D", exact: true }).click();
      await expect(
        page.locator(`.editor-canvas [data-item-id="${instance.id}"] image`),
      ).toHaveAttribute("data-material-variant", "graphite");
      await expect(
        page.locator(`.editor-canvas [data-item-id="${instance.id}"] image`),
      ).toHaveAttribute("data-asset-id", id);
      await page.getByRole("button", { name: "3D", exact: true }).click();
      expect(glbs.length).toBe(ids.length);
    }
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/projects/${project.id}`)).json())
            .document.variants[0].items[ids.length - 1].materialVariant,
      )
      .toBe("graphite");
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await page.getByRole("button", { name: "Экспорт", exact: true }).click();
    await page.getByLabel("Формат", { exact: true }).selectOption("svg");
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Скачать план", exact: true })
      .click();
    const file = await downloaded;
    expect(await file.failure()).toBeNull();
    const stream = (await file.createReadStream())!,
      chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const svg = Buffer.concat(chunks).toString("utf8");
    expect(svg).toContain("data:image/png;base64,");
    expect(svg).not.toMatch(/href="\/assets\/furniture\//);
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.reload();
    for (const instance of doc.variants[0].items.slice(0, ids.length))
      await expect(
        page.locator(`.editor-canvas [data-item-id="${instance.id}"] image`),
      ).toHaveAttribute("data-material-variant", "graphite");
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-loaded",
      String(ids.length),
      { timeout: 40000 },
    );
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: `artifacts/asset-factory-${info.project.name}.png`,
    });
    expect(errors).toEqual([]);
    await writeFile(
      `artifacts/asset-factory-pilot-${info.project.name}.json`,
      JSON.stringify({
        status: "approved",
        mode: info.project.name,
        assets: ids.map((id) => ({
          id,
          generation_version: assetById(id)!.generation_version,
        })),
        sharedMaterial: true,
        persistentIds: true,
        glbLoadedOncePerURL: true,
        technicalMode: true,
        embeddedExport: true,
      }),
    );
  } finally {
    const me = await (await page.request.get("/api/auth/me")).json();
    expect(
      (
        await page.request.delete("/api/profile", {
          headers: { "X-CSRF-Token": me.csrf },
          data: { currentPassword: password },
        })
      ).ok(),
    ).toBe(true);
  }
});

test("an unavailable GLB keeps a visible fallback and preserves 2D and project data", async ({
  page,
}) => {
  const csrf = (await (await page.request.get("/api/auth/me")).json()).csrf;
  const password = "asset-fallback-test-password";
  await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      name: "Asset Fallback",
      email: `asset-fallback-${Date.now()}@example.com`,
      password,
    },
  });
  const document = createDocument("Модель недоступна");
  document.variants[0].items.push(
    instantiate(
      CATALOG.find((c) => c.id === "sofa")!,
      document.floors[0].id,
      { x: 2000, y: 1600 },
    ),
  );
  const response = await page.request.post("/api/projects", {
    headers: { "X-CSRF-Token": csrf },
    data: { document },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const project = await response.json();
  try {
    await page.route("**/model.glb", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await page.goto(`/project/${project.id}`);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-failed",
      "1",
    );
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "упрощённый вид" }),
    ).toBeVisible();
    await page.locator(".three-objects summary").click();
    await page.locator(".three-objects button").click();
    await expect(page.getByLabel("Ширина, см", { exact: true })).toHaveValue(
      "220",
    );
    if (await page.locator(".inspector .mobile-close").isVisible())
      await page.locator(".inspector .mobile-close").click();
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await expect(
      page.locator('.editor-canvas image[data-asset-id="sofa"]'),
    ).toHaveCount(1);
    expect(
      (await (await page.request.get(`/api/projects/${project.id}`)).json())
        .document.variants[0].items[0].id,
    ).toBe(document.variants[0].items[0].id);
  } finally {
    const me = await (await page.request.get("/api/auth/me")).json();
    expect(
      (
        await page.request.delete("/api/profile", {
          headers: { "X-CSRF-Token": me.csrf },
          data: { currentPassword: password },
        })
      ).ok(),
    ).toBe(true);
  }
});
