import { test, expect } from "@playwright/test";
test("public template survives register/login switching and creates an editable copy", async ({
  page,
}, info) => {
  const password = "test-roomfit-starter-password";
  await page.goto("/register?template=bedroom12&rf_source=google");
  await page.getByRole("link", { name: "Войти", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("template")).toBe("bedroom12");
  await page
    .getByRole("link", { name: "Создать аккаунт", exact: true })
    .click();
  expect(new URL(page.url()).searchParams.get("rf_source")).toBe("google");
  await page.getByLabel("Имя", { exact: true }).fill("Starter Test");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`starter-${info.project.name}-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Спальня 12 м²", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Создать проект по этому плану" })
    .click();
  await expect(page.locator(".editor-canvas")).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const project = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(project.document.name).toBe("Спальня 12 м²");
  expect(project.document.floors[0].openings).toHaveLength(2);
  expect(project.document.variants[0].items).toHaveLength(3);
  const me = await (await page.request.get("/api/auth/me")).json();
  await page.request.delete("/api/profile", {
    headers: { "X-CSRF-Token": me.csrf },
    data: { currentPassword: password },
  });
});
