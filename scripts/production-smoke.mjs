import { chromium } from "@playwright/test";
import crypto from "node:crypto";
const origin =
  process.env.ROOMFIT_SMOKE_URL || "https://roomfit.212.19.134.179.sslip.io";
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: origin });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const password = crypto.randomBytes(24).toString("base64url"),
  email = `production-check-${Date.now()}@example.com`;
try {
  const health = await context.request.get("/api/health");
  if (!health.ok()) throw Error("Health check failed");
  await page.goto("/register");
  await page.getByLabel("Имя", { exact: true }).fill("Проверка деплоя");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Мои проекты", exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Новый проект", exact: true }).click();
  await page.getByLabel("Название проекта").fill("Проверка VPS");
  await page
    .getByRole("button", { name: "Создать комнату", exact: true })
    .click();
  await page.locator(".editor-canvas").waitFor();
  await page.getByRole("button", { name: /Кровать двуспальная/ }).click();
  await page.getByLabel("Ширина, см", { exact: true }).fill("180");
  await page.getByLabel("Ширина, см", { exact: true }).press("Tab");
  await page.waitForFunction(() =>
    document.querySelector(".save-status")?.textContent.includes("Сохранено"),
  );
  const id = new URL(page.url()).pathname.split("/").pop();
  await page.reload();
  await page.locator(".editor-canvas [data-item-id]").waitFor();
  const saved = await (await context.request.get(`/api/projects/${id}`)).json();
  if (saved.document.variants[0].items[0].width !== 1800)
    throw Error("Persistence mismatch");
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "roomfit_session");
  if (!session?.secure || !session?.httpOnly)
    throw Error("Session cookie flags incorrect");
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    JSON.stringify({
      origin,
      health: health.status(),
      registration: true,
      project: true,
      persistence: true,
      secureHttpOnlyCookie: true,
      runtimeErrors: 0,
    }),
  );
} finally {
  const me = await context.request.get("/api/auth/me");
  const state = await me.json();
  if (state.user?.email === email) {
    const result = await context.request.delete("/api/profile", {
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": state.csrf,
      },
      data: { currentPassword: password },
    });
    if (!result.ok()) console.error("Temporary test account cleanup failed");
  }
  await browser.close();
}
