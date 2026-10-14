import { chromium, devices, expect } from "@playwright/test";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
const origin = process.env.ROOMFIT_SMOKE_URL || "https://platform.roomfit.art";
const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({
  baseURL: origin,
  extraHTTPHeaders: { DNT: "1" },
});
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
    { timeout: 30000 },
  );
  await expect(page.locator(".three-host")).toHaveAttribute(
    "data-assets-failed",
    "0",
  );
  await page.locator(".three-objects summary").click();
  await page.locator(".three-objects button").click();
  await expect(page.getByLabel("Ширина, см", { exact: true })).toHaveValue(
    "180",
  );
  const mobile = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL: origin,
    storageState: await context.storageState(),
    extraHTTPHeaders: { DNT: "1" },
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on("pageerror", (e) => errors.push(e.message));
  await mobilePage.goto(`/project/${id}`);
  await mobilePage.getByRole("button", { name: "3D", exact: true }).click();
  await expect(mobilePage.locator(".three-host")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 30000 },
  );
  await mobilePage.locator(".three-objects summary").click();
  await mobilePage.locator(".three-objects button").click();
  await expect(mobilePage.locator(".three-host")).toHaveAttribute(
    "data-assets-loaded",
    "1",
    { timeout: 30000 },
  );
  await mobilePage
    .getByLabel("Материал мебели", { exact: true })
    .selectOption("graphite");
  await mobilePage.getByLabel("Ширина, см", { exact: true }).fill("190");
  await mobilePage.getByLabel("Ширина, см", { exact: true }).press("Tab");
  await expect
    .poll(
      async () =>
        (await (await mobile.request.get(`/api/projects/${id}`)).json())
          .document.variants[0].items[0].width,
      { timeout: 10000 },
    )
    .toBe(1900);
  await mobilePage.locator(".inspector .mobile-close").click();
  await mobilePage.getByRole("button", { name: "2D", exact: true }).click();
  await expect(mobilePage.locator(".editor-canvas [data-item-id]")).toHaveCount(
    1,
  );
  await expect(
    mobilePage.locator(".editor-canvas image[data-asset-id]"),
  ).toHaveAttribute("data-material-variant", "graphite");
  const finished = await (
    await mobile.request.get(`/api/projects/${id}`)
  ).json();
  if (
    finished.document.variants[0].items[0].materialVariant !== "graphite" ||
    !finished.document.variants[0].items[0].assetVersion
  )
    throw Error("Asset finish/version persistence mismatch");
  const library = await context.request.get("/assets/furniture/manifest.json");
  if (!library.ok())
    throw Error("Approved asset library was not published completely");
  const manifest = await library.json();
  if (
    Object.keys(manifest).length !== 26 ||
    !library.headers()["cache-control"]?.includes("no-cache")
  )
    throw Error("Asset manifest is incomplete or cannot be refreshed");
  for (const asset of Object.values(manifest)) {
    const model = await context.request.get(
      asset.base_url + asset.assets.model_3d,
    );
    const body = await model.body();
    const verification = await context.request.get(
      asset.base_url + "validation.json",
    );
    if (!verification.ok())
      throw Error("Missing asset validation: " + asset.asset_id);
    const report = await verification.json();
    if (
      !model.ok() ||
      body.toString("ascii", 0, 4) !== "glTF" ||
      body.length !== asset.glb_bytes ||
      crypto.createHash("sha256").update(body).digest("hex") !==
        report.model_sha256 ||
      report.status !== "approved"
    )
      throw Error("Invalid published asset: " + asset.asset_id);
    const top = await context.request.get(
      asset.base_url + asset.material_variants[0].top_128,
    );
    if (!top.ok() || (await top.body()).toString("ascii", 8, 12) !== "WEBP")
      throw Error("Missing top view: " + asset.asset_id);
  }
  const versions = JSON.parse(
    await readFile(
      new URL("../packages/core/src/asset-versions.json", import.meta.url),
      "utf8",
    ),
  );
  const latest = manifest["bed-double"];
  const previous = Object.values(versions).find(
    (asset) =>
      asset.asset_id === "bed-double" &&
      asset.generation_version !== latest.generation_version,
  );
  if (!previous)
    throw Error("The previous approved bed version must remain available");
  const legacyDocument = structuredClone(finished.document);
  const legacyBed = legacyDocument.variants[0].items[0];
  legacyBed.assetVersion = previous.generation_version;
  legacyBed.contour = previous.footprints.collision[0].outer;
  const me = await (await context.request.get("/api/auth/me")).json();
  const createdLegacy = await context.request.post("/api/projects", {
    headers: { "X-CSRF-Token": me.csrf },
    data: { document: legacyDocument },
  });
  if (!createdLegacy.ok())
    throw Error("Previous approved assets cannot be saved");
  const legacyProject = await createdLegacy.json();
  await page.goto(`/project/${legacyProject.id}`);
  await page
    .getByRole("button", { name: "Обновить мебель", exact: true })
    .click();
  const bedImage = page.locator(
    `.editor-canvas [data-item-id="${legacyBed.id}"] image`,
  );
  await expect(bedImage).toHaveAttribute(
    "data-asset-version",
    latest.generation_version,
  );
  await page.getByTitle("Отменить (Ctrl+Z)").click();
  await expect(bedImage).toHaveAttribute(
    "data-asset-version",
    previous.generation_version,
  );
  await page.getByTitle("Повторить (Ctrl+Shift+Z)").click();
  await expect
    .poll(
      async () =>
        (
          await (
            await context.request.get(`/api/projects/${legacyProject.id}`)
          ).json()
        ).document.variants[0].items[0].assetVersion,
    )
    .toBe(latest.generation_version);
  const upgraded = (
    await (
      await context.request.get(`/api/projects/${legacyProject.id}`)
    ).json()
  ).document.variants[0].items[0];
  for (const key of [
    "id",
    "floorId",
    "x",
    "y",
    "angle",
    "width",
    "depth",
    "height",
    "elevation",
    "locked",
    "shopping",
  ])
    expect(upgraded[key]).toEqual(legacyBed[key]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Обновить мебель", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".three-host")).toHaveAttribute(
    "data-assets-loaded",
    "1",
    { timeout: 30000 },
  );
  await expect(page.locator(".three-host")).toHaveAttribute(
    "data-assets-failed",
    "0",
  );
  for (const preset of ["oak", "light", "walnut", "tile"])
    for (const filename of ["color.jpg", "normal.png", "roughness.jpg"]) {
      const map = await context.request.get(
        `/assets/materials/floors/reference-v1/${preset}/${filename}`,
      );
      if (!map.ok())
        throw Error(`Missing floor PBR texture: ${preset}/${filename}`);
    }
  await mobile.close();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    JSON.stringify({
      origin,
      health: health.status(),
      registration: true,
      project: true,
      persistence: true,
      secureHttpOnlyCookie: true,
      threeDesktop: true,
      threeMobile: true,
      synchronizedAssetLibrary: 26,
      verifiedPublishedGLBAndWebP: 26,
      persistedMaterialVariant: true,
      existingRoomUpgradeUndoPersistence: true,
      floorPBRMaps: 12,
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
