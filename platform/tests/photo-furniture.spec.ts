import { test, expect } from "@playwright/test";
import { createDocument, ASSET_MANIFEST } from "@roomfit/core";
import { mkdir } from "node:fs/promises";
test.use({
  launchOptions: {
    channel: "chromium",
  },
});
const password = "photo-browser-test-password";
async function setup(page: import("@playwright/test").Page) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const registration = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": me.csrf },
    data: {
      email: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: "Photo Test",
      password,
    },
  });
  expect(registration.ok()).toBe(true);
  const created = await page.request.post("/api/projects", {
    headers: { "X-CSRF-Token": me.csrf },
    data: { document: createDocument("Моя мебель по фото", 4000, 3200) },
  });
  expect(created.ok()).toBe(true);
  const project = await created.json();
  await page.goto(`/project/${project.id}`);
  return project;
}
async function cleanup(page: import("@playwright/test").Page) {
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

test("photo wizard, private catalog, synchronized 2D/3D, save and reopen", async ({
  page,
}, info) => {
  const project = await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "Мебель и свойства" }).click();
    await page
      .getByRole("button", { name: "Создать мебель по фото", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Создать мебель по фото", exact: true })
      .click();
    await dialog
      .getByLabel("Фото: Спереди или под углом", { exact: true })
      .setInputFiles("api/tests/fixtures/photo-input.png");
    await dialog
      .getByLabel("Фото: Сзади", { exact: true })
      .setInputFiles("api/tests/fixtures/photo-input.png");
    await dialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    await dialog.getByLabel("Название", { exact: true }).fill("Мой синий стул");
    await dialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    const dims = ASSET_MANIFEST.chair.dimensions;
    await dialog
      .getByRole("spinbutton", { name: "Ширина", exact: true })
      .fill(String(dims.width_mm / 10));
    await dialog
      .getByRole("spinbutton", { name: "Глубина", exact: true })
      .fill(String(dims.depth_mm / 10));
    await dialog
      .getByRole("spinbutton", { name: "Полная высота", exact: true })
      .fill(String(dims.height_mm / 10));
    await expect(dialog.getByText(/Сейчас размеры примерные/)).toBeVisible();
    await dialog
      .getByRole("checkbox", { name: "Я измерил предмет рулеткой" })
      .check();
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: `artifacts/photo-dimensions-${info.project.name}.png`,
    });
    await dialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Создать 3D-модель", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("checkbox", { name: /Передать эти фото Tripo/ })
      .check();
    await dialog
      .getByRole("button", { name: "Создать 3D-модель", exact: true })
      .click();
    await expect(
      dialog.getByText("Модель готова", { exact: true }),
    ).toBeVisible({ timeout: 45000 });
    await dialog.getByRole("button", { name: "Вращать модель в 3D" }).click();
    await expect(dialog.locator(".photo-3d-viewer")).toHaveAttribute(
      "data-assets-loaded",
      "1",
      { timeout: 30000 },
    );
    await expect(dialog.locator(".photo-3d-viewer")).toHaveAttribute(
      "data-assets-failed",
      "0",
    );
    await page.screenshot({
      path: `artifacts/photo-result-${info.project.name}.png`,
    });
    const jobs = await (
      await page.request.get("/api/photo-furniture/jobs")
    ).json();
    expect(jobs[0].status).toBe("ready_for_review");
    expect(
      (await (await page.request.get(`/api/projects/${project.id}`)).json())
        .document.variants[0].items,
    ).toHaveLength(0);
    await dialog
      .getByRole("button", { name: "Добавить в текущую комнату", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.locator(".editor-canvas image[data-asset-id]"),
    ).toHaveCount(1);
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/projects/${project.id}`)).json())
            .document.variants[0].items.length,
      )
      .toBe(1);
    const saved = (
      await (await page.request.get(`/api/projects/${project.id}`)).json()
    ).document.variants[0].items[0];
    expect(saved.photoAsset.jobId).toBe(jobs[0].id);
    expect(saved.width).toBe(dims.width_mm);
    await page.reload();
    await expect(
      page.locator(".editor-canvas image[data-asset-id]"),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveAttribute(
      "data-assets-loaded",
      "1",
      { timeout: 30000 },
    );
    await page.locator(".three-objects summary").click();
    await page.locator(".three-objects button").click();
    await expect(page.getByLabel("Ширина, см", { exact: true })).toHaveValue(
      String(dims.width_mm / 10),
    );
    await expect(
      page.getByLabel("Материал мебели", { exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await cleanup(page);
  }
});

test("photo wizard reports missing inputs and saves a resumable draft without generation", async ({
  page,
}, info) => {
  await setup(page);
  try {
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "Мебель и свойства" }).click();
    await page
      .getByRole("button", { name: "Создать мебель по фото", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Создать мебель по фото", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Добавь основное фото",
    );
    await dialog
      .getByLabel("Фото: Спереди или под углом", { exact: true })
      .setInputFiles("api/tests/fixtures/photo-input.png");
    for (let n = 0; n < 3; n++)
      await dialog
        .getByRole("button", { name: "Продолжить", exact: true })
        .click();
    await dialog
      .getByRole("button", { name: "Сохранить черновик", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await (await page.request.get("/api/photo-furniture/jobs")).json()
          )[0]?.status,
      )
      .toBe("draft");
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page
      .getByRole("button", { name: "Создать мебель по фото", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    await expect(
      dialog.getByAltText("Мебель: Спереди или под углом"),
    ).toBeVisible();
    expect(
      (await (await page.request.get("/api/furniture")).json()).length,
    ).toBe(0);
  } finally {
    await cleanup(page);
  }
});
