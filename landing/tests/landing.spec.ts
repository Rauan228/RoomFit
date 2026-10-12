import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("scroll entrances never flash visible before fading in or replay on return", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const card = page.locator(".gallery-card").first();
  await expect(card).toHaveCSS("opacity", "0");
  const samples = await card.evaluate(async (el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: top - window.innerHeight + 80,
      behavior: "instant",
    });
    const values = [Number(getComputedStyle(el).opacity)];
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const sample = () => {
        values.push(Number(getComputedStyle(el).opacity));
        if (performance.now() - started < 1100) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    return values;
  });
  expect(samples.length).toBeGreaterThan(5);
  expect(samples[0]).toBeLessThan(0.01);
  expect(samples.at(-1)).toBe(1);
  expect(
    samples.every((opacity, i) => i === 0 || opacity + 0.001 >= samples[i - 1]),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await card.evaluate((el) =>
    window.scrollTo({
      top: el.getBoundingClientRect().top + scrollY - 100,
      behavior: "instant",
    }),
  );
  await expect(card).toHaveCSS("opacity", "1");
  expect(
    await card.evaluate(
      (el) =>
        el.getAnimations().filter((a) => a.id === "roomfit-reveal").length,
    ),
  ).toBe(0);
});

test("motion can be disabled during use and FAQ closes completely", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) => a.id === "roomfit-reveal" && a.playState === "running",
            ).length,
      ),
    )
    .toBe(0);
  if (testInfo.project.name === "desktop") {
    await page.locator(".hero-visual").hover({ position: { x: 50, y: 50 } });
    await expect
      .poll(() =>
        page
          .locator(".editor-preview")
          .evaluate((el) =>
            (el as HTMLElement).style.getPropertyValue("--preview-x"),
          ),
      )
      .not.toBe("");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    )
    .toBe(0);
  await expect(page.locator(".hero-copy")).toHaveCSS("opacity", "1");
  await expect(page.locator(".editor-preview")).toHaveCSS("transform", "none");
  await page.locator("#faq-q-2").click();
  await page.locator("#faq-q-2").click();
  await expect(page.locator("#faq-a-2")).toHaveAttribute("aria-hidden", "true");
  expect(
    await page
      .locator("#faq-a-2")
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBe(0);
});

test("page reflows, assets load and no runtime errors occur", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Проверь, поместится ли мебель",
  );
  for (const width of [320, 340, 360, 375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(150);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".hero-copy")
        .evaluate(
          (el) => el.getBoundingClientRect().right <= window.innerWidth,
        ),
    ).toBe(true);
    expect(
      await page
        .locator(".hero-visual")
        .evaluate(
          (el) => el.getBoundingClientRect().right <= window.innerWidth,
        ),
    ).toBe(true);
  }
  await page.setViewportSize(
    testInfo.project.name === "mobile"
      ? { width: 375, height: 812 }
      : { width: 1440, height: 1000 },
  );
  await page.locator("#faq").scrollIntoViewIfNeeded();
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page
      .locator("img")
      .evaluateAll((images) =>
        images.every(
          (img) =>
            (img as HTMLImageElement).complete &&
            (img as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(100);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: `artifacts/landing-${testInfo.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
});

test("FAQ, roadmap dialog and mobile navigation are usable", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  if (testInfo.project.name === "mobile") {
    await page
      .getByRole("button", { name: "Открыть меню", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Мобильная навигация" })
      .getByRole("link", { name: "FAQ", exact: true })
      .click();
    await expect(
      page.getByRole("navigation", { name: "Мобильная навигация" }),
    ).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Когда появится 3D-режим?" }).click();
  await expect(
    page.getByRole("region", { name: "Когда появится 3D-режим?" }),
  ).toContainText("Точной даты пока нет");
  await page.getByRole("button", { name: "Что будет в 3D" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Что будет в 3D" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Открыть демо-редактор" }).click();
  await expect(
    page.getByRole("dialog").locator(".furniture-object"),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "Закрыть окно" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("demo adds furniture, detects collisions, undoes and exports PNG", async ({
  page,
}) => {
  await page.goto("/#demo");
  const editor = page.locator("#demo .demo-editor");
  const items = editor.locator(".furniture-object");
  await expect(items).toHaveCount(4);
  await expect(editor.locator(".editor-status")).toContainText(
    "Столкновений нет",
  );
  await editor
    .getByRole("button", { name: "Добавить: Комод", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Добавить: Комод", exact: true })
    .click();
  await expect(items).toHaveCount(6);
  await expect(editor.locator(".editor-status")).toContainText("Пересечения");
  await editor.getByRole("button", { name: "Отменить действие" }).click();
  await expect(items).toHaveCount(5);
  await editor.getByRole("button", { name: "Повторить действие" }).click();
  await expect(items).toHaveCount(6);
  await editor.getByRole("button", { name: "Удалить предмет" }).click();
  await expect(items).toHaveCount(5);
  const downloadPromise = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Скачать PNG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("roomfit-plan.png");
  expect(await download.failure()).toBeNull();
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor.getByRole("status").last()).toContainText(
    "План сохранён на этом устройстве",
  );
  await page.reload();
  await expect(page.locator("#demo .furniture-object")).toHaveCount(5);
});

test("furniture can be dragged, rotated and moved using the keyboard", async ({
  page,
}, testInfo) => {
  await page.goto("/#demo");
  const editor = page.locator("#demo .demo-editor");
  const item = editor.getByRole("button", {
    name: "Рабочий стол, 120 на 60 сантиметров",
    exact: true,
  });
  await item.scrollIntoViewIfNeeded();
  const before = await item.evaluate((el) => (el as HTMLElement).style.left);
  const b = (await item.boundingBox())!;
  if (testInfo.project.name === "mobile") {
    const client = await page.context().newCDPSession(page);
    const x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - 35, y: y + 30 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await client.detach();
  } else {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 35, b.y + b.height / 2 + 30, {
      steps: 8,
    });
    await page.mouse.up();
  }
  await expect
    .poll(async () => item.evaluate((el) => (el as HTMLElement).style.left))
    .not.toBe(before);
  await editor.getByRole("button", { name: "Отменить действие" }).click();
  await expect
    .poll(async () => item.evaluate((el) => (el as HTMLElement).style.left))
    .toBe(before);
  await item.focus();
  await item.press("ArrowLeft");
  await expect
    .poll(async () => item.evaluate((el) => (el as HTMLElement).style.left))
    .not.toBe(before);
  const width = await item.evaluate((el) => (el as HTMLElement).style.width);
  await item.press("r");
  await expect
    .poll(async () => item.evaluate((el) => (el as HTMLElement).style.width))
    .not.toBe(width);
});

test("templates, catalog search and accessible comparison slider work", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".gallery-card").filter({ hasText: "Детская" }).click();
  const editor = page.locator("#demo .demo-editor");
  await expect(editor.locator(".demo-project")).toContainText("Детская");
  await editor
    .getByRole("textbox", { name: "Поиск мебели" })
    .fill("несуществующий");
  await expect(editor.getByText("Ничего не найдено")).toBeVisible();
  await editor.getByRole("textbox", { name: "Поиск мебели" }).fill("стол");
  await expect(editor.locator(".catalog-item")).toHaveCount(1);
  const slider = page.getByRole("slider", {
    name: "Сравнить 2D-план и 3D-концепцию",
  });
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await slider.press("End");
  await expect(slider).toHaveValue("100");
});
