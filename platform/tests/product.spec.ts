import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("register → room → furniture → check → autosave → reopen → export", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Имя", { exact: true }).fill("RoomFit Test");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("test-roomfit-password");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(
    page.getByRole("heading", { name: "Мои проекты" }),
  ).toBeVisible();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: `artifacts/platform-dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Новый проект", exact: true }).click();
  await page.getByLabel("Название проекта").fill("Проверка спальни");
  await page.getByLabel("Ширина, см", { exact: true }).fill("400");
  await page.getByLabel("Глубина, см", { exact: true }).fill("300");
  await page
    .getByRole("button", { name: "Создать комнату", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "2D-план комнаты" }),
  ).toBeVisible();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Мебель и свойства" }).click();
  await page.getByRole("button", { name: /Кровать двуспальная/ }).click();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Мебель и свойства" }).click();
  await expect(page.getByLabel("Название предмета")).toHaveValue(
    "Кровать двуспальная",
  );
  await page.getByLabel("Ширина, см", { exact: true }).fill("170");
  await page.getByLabel("Ширина, см", { exact: true }).press("Tab");
  await page.getByLabel("Поворот, °").fill("35");
  await page.getByLabel("Поворот, °").press("Tab");
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: /^Проверка/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Проверка плана" }),
  ).toBeVisible();
  if (info.project.name === "mobile")
    await page.locator(".mobile-close").click();
  await expect(
    page.getByRole("status").filter({ hasText: "Сохранено" }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/platform-editor-${info.project.name}.png`,
    fullPage: true,
  });
  const projectUrl = page.url();
  await page.reload();
  await expect(page.locator("[data-item-id]")).toHaveCount(1);
  const stored = await page.request.get(
    `/api/projects/${projectUrl.split("/").pop()}`,
  );
  const saved = await stored.json();
  expect(saved.document.variants[0].items[0].width).toBe(1700);
  expect(saved.document.variants[0].items[0].angle).toBe(35);
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const png = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать план", exact: true }).click();
  const file = await png;
  expect(file.suggestedFilename()).toContain(".png");
  expect(await file.failure()).toBeNull();
  await file.saveAs(`artifacts/export-${info.project.name}.png`);
  await page
    .getByRole("combobox", { name: "Формат", exact: true })
    .selectOption("pdf");
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать план", exact: true }).click();
  const pdfFile = await pdf;
  expect(pdfFile.suggestedFilename()).toContain(".pdf");
  await pdfFile.saveAs(`artifacts/export-${info.project.name}.pdf`);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("readonly link exposes no write controls and revocation invalidates it", async ({
  page,
}) => {
  const r = await page.request.get("/api/auth/me"),
    csrf = (await r.json()).csrf;
  await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      name: "Share Test",
      email: `share-${Date.now()}@example.com`,
      password: "test-roomfit-password",
    },
  });
  const { createDocument } = await import("../../packages/core/src/model");
  const p = await page.request.post("/api/projects", {
    headers: { "X-CSRF-Token": csrf },
    data: { document: createDocument("Shared room") },
  });
  const id = (await p.json()).id;
  const share = await page.request.post(`/api/projects/${id}/shares`, {
    headers: { "X-CSRF-Token": csrf },
    data: {},
  });
  const token = await share.json();
  await page.goto(`/share/${token.token}`);
  await expect(page.getByText("Только просмотр")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Контур комнаты", exact: true }),
  ).toHaveCount(0);
  await page.request.delete(`/api/projects/${id}/shares/${token.id}`, {
    headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Ссылка недействительна");
});

test("editor preserves dimensions under zoom, undo and offline recovery", async ({
  page,
}, info) => {
  const bootstrap = await page.request.get("/api/auth/me"),
    csrf = (await bootstrap.json()).csrf;
  await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      name: "Recovery Test",
      email: `recovery-${info.project.name}-${Date.now()}@example.com`,
      password: "test-roomfit-password",
    },
  });
  const { createTemplate } = await import("../../packages/core/src/catalog");
  const created = await page.request.post("/api/projects", {
    headers: { "X-CSRF-Token": csrf },
    data: { document: createTemplate("Кабинет") },
  });
  const project = await created.json();
  await page.goto(`/project/${project.id}`);
  await expect(page.locator(".editor-canvas [data-item-id]")).toHaveCount(3);
  const before = await page.locator(".editor-canvas").getAttribute("viewBox");
  await page.getByRole("button", { name: "Увеличить", exact: true }).click();
  expect(await page.locator(".editor-canvas").getAttribute("viewBox")).not.toBe(
    before,
  );
  await page
    .getByRole("button", { name: "Дублировать вариант", exact: true })
    .click();
  await expect(
    page
      .getByRole("combobox", { name: "Вариант", exact: true })
      .locator("option"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Отменить (Ctrl+Z)", exact: true })
    .click();
  await expect(
    page
      .getByRole("combobox", { name: "Вариант", exact: true })
      .locator("option"),
  ).toHaveCount(1);
  await page.route("**/api/projects/*", async (route) => {
    if (route.request().method() === "PUT") await route.abort("failed");
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Дублировать вариант", exact: true })
    .click();
  await expect(page.locator(".save-status")).toContainText("Ошибка сохранения");
  const recovery = await page.evaluate(() =>
    Object.keys(localStorage).some((k) => k.startsWith("roomfit:recovery:")),
  );
  expect(recovery).toBe(true);
  page.on("dialog", (d) => void d.accept());
  await page.reload();
  await expect(
    page.getByText("Найдена несохранённая локальная копия."),
  ).toBeVisible();
  await page.unroute("**/api/projects/*");
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText("Сохранено");
  const after = await (
    await page.request.get(`/api/projects/${project.id}`)
  ).json();
  expect(after.document.variants).toHaveLength(2);
  expect(after.document.variants[0].items[0].width).toBe(
    project.document.variants[0].items[0].width,
  );
});
