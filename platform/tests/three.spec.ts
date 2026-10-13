import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  CATALOG,
  createDocument,
  instantiate,
  type ProjectDocument,
} from "@roomfit/core";
import { PerspectiveCamera, Vector3 } from "three";

test.use({
  launchOptions: {
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
});

async function createScene(
  page: import("@playwright/test").Page,
  name: string,
  setup?: (doc: ProjectDocument) => void,
) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const password = "roomfit-three-test-password";
  await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": me.csrf },
    data: {
      name,
      email: `three-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      password,
    },
  });
  const doc = createDocument("3D комната", 4000, 3200),
    floor = doc.floors[0];
  doc.variants[0].items.push(
    instantiate(CATALOG[0], floor.id, { x: 2000, y: 1000 }),
  );
  floor.openings.push(
    {
      id: crypto.randomUUID(),
      wallId: floor.walls[0].id,
      kind: "window",
      offset: 500,
      width: 1200,
      height: 1400,
      sill: 900,
      flip: false,
      inward: true,
    },
    {
      id: crypto.randomUUID(),
      wallId: floor.walls[2].id,
      kind: "door",
      offset: 200,
      width: 800,
      height: 2100,
      sill: 0,
      flip: true,
      inward: true,
    },
  );
  setup?.(doc);
  const result = await page.request.post("/api/projects", {
    headers: { "X-CSRF-Token": me.csrf },
    data: { document: doc },
  });
  expect(result.ok()).toBe(true);
  const project = await result.json();
  return { project, password, doc };
}
async function cleanup(
  page: import("@playwright/test").Page,
  password: string,
) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const result = await page.request.delete("/api/profile", {
    headers: { "X-CSRF-Token": me.csrf },
    data: { currentPassword: password },
  });
  expect(result.ok()).toBe(true);
}

test("lazy 3D, ray selection, shared properties, Undo and persistence", async ({
  page,
}, info) => {
  const { project, password, doc } = await createScene(page, "3D Test");
  const errors: string[] = [],
    loaded: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/Scene3D")) loaded.push(r.url());
  });
  try {
    await page.goto(`/project/${project.id}`);
    await expect(page.locator(".editor-canvas")).toBeVisible();
    expect(loaded).toEqual([]);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 30000 },
    );
    await expect(page.locator(".three-host canvas")).toBeVisible();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-loaded",
      "1",
    );
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-failed",
      "0",
    );
    const box = (await page.locator(".three-host canvas").boundingBox())!;
    const factor = box.width < box.height ? 1.5 : 1,
      camera = new PerspectiveCamera(45, box.width / box.height, 0.01, 200);
    camera.position.set(
      4 * 1.05 * factor,
      4 * 0.85 * factor,
      4 * 1.05 * factor,
    );
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const projected = new Vector3(0, 0.3, -0.6).project(camera);
    const x = box.x + ((projected.x + 1) * box.width) / 2,
      y = box.y + ((1 - projected.y) * box.height) / 2;
    if (info.project.name === "mobile") await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await expect(page.getByLabel("Ширина, см", { exact: true })).toHaveValue(
      "160",
    );
    await page.getByLabel("Ширина, см", { exact: true }).fill("180");
    await page.getByLabel("Ширина, см", { exact: true }).press("Tab");
    if (info.project.name === "mobile")
      await page.locator(".inspector .mobile-close").click();
    await page.getByTitle("Отменить (Ctrl+Z)").click();
    await expect(page.getByLabel("Ширина, см", { exact: true })).toHaveValue(
      "160",
    );
    await page.getByTitle("Повторить (Ctrl+Shift+Z)").click();
    await expect(page.getByLabel("Ширина, см", { exact: true })).toHaveValue(
      "180",
    );
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await expect(page.locator(".editor-canvas")).toBeVisible();
    await expect(
      page.locator(
        `.editor-canvas [data-item-id="${doc.variants[0].items[0].id}"]`,
      ),
    ).toBeAttached();
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/projects/${project.id}`)).json())
            .document.variants[0].items[0].width,
      )
      .toBe(1800);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-scene-ready",
      "true",
    );
    await page.getByLabel("Качество 3D").selectOption("high");
    await page.getByRole("button", { name: "Сбросить 3D-камеру" }).click();
    await expect(
      page.getByRole("button", { name: "Экспорт 2D", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: `artifacts/platform-three-${info.project.name}.png`,
    });
    await page.reload();
    await expect(page.locator(".editor-canvas")).toBeVisible();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 30000 },
    );
    expect(errors).toEqual([]);
  } finally {
    await cleanup(page, password);
  }
});

test("3D follows floors and variants, while shared projects remain readonly", async ({
  page,
}, info) => {
  const { project, password, doc } = await createScene(
    page,
    "Floor Test",
    (doc) => {
      const second = createDocument("Г-образная комната", 5000, 4000, "l")
        .floors[0];
      second.name = "2 этаж";
      doc.floors.push(second);
      doc.variants[0].items.push(
        instantiate(
          CATALOG.find((item) => item.type === "desk")!,
          second.id,
          { x: 1000, y: 1000 },
        ),
      );
      doc.variants.push({
        id: crypto.randomUUID(),
        name: "Пустой вариант",
        items: [],
      });
      doc.floors[0].walls[3].height = 2400;
    },
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`/project/${project.id}`);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 30000 },
    );
    await page.locator(".three-objects summary").click();
    await expect(page.locator(".three-objects button")).toHaveCount(1);
    await expect(page.locator(".three-objects button")).toContainText(
      "Кровать",
    );
    await page
      .getByLabel("Этаж", { exact: true })
      .selectOption(doc.floors[1].id);
    await expect(page.locator(".three-objects button")).toContainText(
      "Рабочий стол",
    );
    await page
      .getByLabel("Вариант", { exact: true })
      .selectOption(doc.variants[1].id);
    await expect(page.locator(".three-objects button")).toHaveCount(0);
    await expect(page.locator(".three-objects")).toContainText(
      "Добавь мебель из каталога",
    );
    await page
      .getByLabel("Вариант", { exact: true })
      .selectOption(doc.variants[0].id);
    await page
      .getByLabel("Этаж", { exact: true })
      .selectOption(doc.floors[0].id);
    await page.getByRole("button", { name: "2D", exact: true }).click();
    // Room selection uses the existing 2D layer, and the common Inspector updates 3D wall heights.
    const roomPoint = await page
      .locator(".editor-canvas")
      .evaluate((canvas) => {
        const point = new DOMPoint(500, 2500).matrixTransform(
          (canvas as SVGSVGElement).getScreenCTM()!,
        );
        return { x: point.x, y: point.y };
      });
    if (info.project.name === "mobile")
      await page.touchscreen.tap(roomPoint.x, roomPoint.y);
    else await page.mouse.click(roomPoint.x, roomPoint.y);
    if (
      info.project.name === "mobile" &&
      !(await page.locator(".inspector.mobile-open").count())
    )
      await page.getByRole("button", { name: "Мебель и свойства" }).click();
    await page
      .locator(".inspector-tabs")
      .getByRole("button", { name: "Свойства", exact: true })
      .click();
    await page.getByLabel("Высота помещения, см", { exact: true }).fill("320");
    await page.getByLabel("Высота помещения, см", { exact: true }).press("Tab");
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/projects/${project.id}`)).json())
            .document.floors[0].rooms[0].height,
      )
      .toBe(3200);
    const saved = await (
      await page.request.get(`/api/projects/${project.id}`)
    ).json();
    expect(
      saved.document.floors[0].walls.map(
        (wall: { height: number }) => wall.height,
      ),
    ).toEqual([3200, 3200, 3200, 2400]);
    if (info.project.name === "mobile")
      await page.locator(".inspector .mobile-close").click();
    const me = await (await page.request.get("/api/auth/me")).json();
    const share = await page.request.post(
      `/api/projects/${project.id}/shares`,
      { headers: { "X-CSRF-Token": me.csrf }, data: {} },
    );
    const token = await share.json();
    await page.goto(`/share/${token.token}`);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 30000 },
    );
    await page.locator(".three-objects summary").click();
    await page.locator(".three-objects button").click();
    await expect(page.getByLabel("Ширина, см", { exact: true })).toBeDisabled();
    await expect(page.getByTitle("Отменить (Ctrl+Z)")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await cleanup(page, password);
  }
});

test("lost graphics context allows returning to the unchanged 2D project", async ({
  page,
}) => {
  const { project, password } = await createScene(page, "Context Test");
  try {
    await page.goto(`/project/${project.id}`);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 30000 },
    );
    await page.locator(".three-host canvas").evaluate((canvas) => {
      const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await expect(
      page.getByRole("heading", { name: "3D сейчас недоступен" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Вернуться в 2D" }).click();
    await expect(page.locator(".editor-canvas [data-item-id]")).toHaveCount(1);
    expect(
      (await (await page.request.get(`/api/projects/${project.id}`)).json())
        .document.variants[0].items[0].width,
    ).toBe(1600);
  } finally {
    await cleanup(page, password);
  }
});

test("missing WebGL keeps the project editable in 2D", async ({ page }) => {
  const { project, password } = await createScene(page, "No WebGL Test");
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (
        type === "webgl" ||
        type === "webgl2" ||
        type === "experimental-webgl"
      )
        return null;
      return getContext.call(this, type as "2d", ...args);
    } as typeof getContext;
  });
  try {
    await page.goto(`/project/${project.id}`);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "3D сейчас недоступен" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Вернуться в 2D" }).click();
    await expect(page.locator(".editor-canvas")).toBeVisible();
    await expect(page.locator(".editor-canvas [data-item-id]")).toHaveCount(1);
    expect(
      (await (await page.request.get(`/api/projects/${project.id}`)).json())
        .document.name,
    ).toBe("3D комната");
  } finally {
    await cleanup(page, password);
  }
});
