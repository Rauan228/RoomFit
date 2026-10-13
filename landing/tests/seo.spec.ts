import { test, expect } from "@playwright/test";
import { GUIDES, guidePath } from "../src/content/guides";

test("robots, sitemap, real 404 and canonical redirects", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.headers()["content-type"]).toContain("text/plain");
  expect(await robots.text()).toContain("OAI-SearchBot");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const xml = await sitemap.text();
  for (const guide of GUIDES)
    expect(xml).toContain(`https://roomfit.art${guidePath(guide)}`);
  expect(xml).not.toContain("platform.roomfit.art");
  const missing = await request.get("/no-such-roomfit-page");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("noindex,follow");
  const redirect = await request.get("/planirovka-spalni-12-m2?ref=demo", {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(301);
  expect(redirect.headers().location).toBe(
    "/planirovka-spalni-12-m2/?ref=demo",
  );
});

test("public content and links are available with JavaScript disabled", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4185/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("мебель");
  await expect(
    page.getByRole("link", { name: "Все планы и инструкции →" }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:4185/planirovka-spalni-12-m2/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("12 м²");
  await page
    .getByText("Поместится ли кровать 180 см?", { exact: true })
    .click();
  await expect(
    page.getByText("Это зависит от внешних размеров каркаса", { exact: false }),
  ).toBeVisible();
  await context.close();
});

for (const guide of GUIDES)
  test(`${guide.slug}: hydration, metadata, image and mobile layout`, async ({
    page,
    request,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (e) => {
      if (e.type() === "error") errors.push(e.text());
    });
    const html = await (await request.get(guidePath(guide))).text();
    expect(html).toContain(guide.intro);
    await page.goto(guidePath(guide));
    await expect(page).toHaveTitle(guide.title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://roomfit.art${guidePath(guide)}`,
    );
    expect(
      (
        await page.locator('script[type="application/ld+json"]').textContent()
      )?.includes('"Article"'),
    ).toBe(true);
    const image = await request.get(`/assets/guides/${guide.slug}.png`);
    expect(image.ok()).toBe(true);
    expect(image.headers()["content-type"]).toBe("image/png");
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await expect(
      page.getByRole("link", { name: "Изменить этот план" }),
    ).toHaveAttribute("href", new RegExp(`template=${guide.template}`));
    if (info.project.name === "mobile") {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.getByRole("button", { name: "Открыть меню" }).click();
      await expect(
        page.getByRole("navigation", { name: "Мобильная навигация" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Закрыть меню" }).click();
    }
    await page.screenshot({
      path: `artifacts/guide-${guide.slug}-${info.project.name}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

test("anonymous event respects Do Not Track and carries no private IDs", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const events: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/events")
      events.push(request.url());
  });
  await page.goto("http://127.0.0.1:4185/?rf_source=google");
  await expect.poll(() => events.length).toBe(1);
  expect(new URL(events[0]).searchParams.get("source")).toBe("google");
  expect([...new URL(events[0]).searchParams.keys()].sort()).toEqual([
    "event",
    "page",
    "source",
  ]);
  await context.close();
  const privateContext = await browser.newContext();
  await privateContext.addInitScript(() =>
    Object.defineProperty(navigator, "doNotTrack", { value: "1" }),
  );
  const privatePage = await privateContext.newPage();
  const privateEvents: string[] = [];
  privatePage.on("request", (request) => {
    if (new URL(request.url()).pathname === "/events")
      privateEvents.push(request.url());
  });
  await privatePage.goto("http://127.0.0.1:4185/");
  await privatePage.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  expect(privateEvents).toEqual([]);
  await privateContext.close();
});
