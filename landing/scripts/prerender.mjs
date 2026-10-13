import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import {
  render,
  PUBLIC_PATHS,
  GUIDES,
  planSvg,
  starterDocuments,
} from "../.ssg/entry-server.js";

const dist = resolve("dist");
const shell = await readFile(join(dist, "index.html"), "utf8");
if (
  !shell.includes('<div id="root"></div>') ||
  !shell.includes("<!--seo-start-->")
)
  throw Error("Prerender HTML placeholders missing");
const assets = await readdir(join(dist, "assets"));
const fonts = assets.filter(
  (name) =>
    /^manrope-cyrillic-wght-normal.*\.woff2$/.test(name) ||
    /^manrope-latin-wght-normal.*\.woff2$/.test(name),
);
const preload = fonts
  .map(
    (name) =>
      `<link rel="preload" href="/assets/${name}" as="font" type="font/woff2" crossorigin />`,
  )
  .join("");
for (const path of [...PUBLIC_PATHS, "/404/"]) {
  const { html, head } = render(path);
  const result = shell
    .replace(/<!--seo-start-->[\s\S]*?<!--seo-end-->/, head + preload)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);
  const file =
    path === "/404/"
      ? join(dist, "404.html")
      : join(dist, path.slice(1), "index.html");
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file, result);
}
await mkdir(join(dist, "assets/guides"), { recursive: true });
for (const guide of [
  ...GUIDES,
  { slug: "roomfit-cover", template: "living" },
]) {
  const image = Buffer.from(planSvg(guide.template));
  await sharp(image)
    .resize(600, 480)
    .webp({ quality: 85 })
    .toFile(join(dist, "assets/guides", `${guide.slug}.webp`));
  await sharp(image)
    .resize(1200, 630, { fit: "contain", background: "#f2efe6" })
    .png()
    .toFile(join(dist, "assets/guides", `${guide.slug}.png`));
}
await mkdir(join(dist, "templates"), { recursive: true });
for (const [key, doc] of Object.entries(starterDocuments()))
  await writeFile(join(dist, "templates", `${key}.json`), JSON.stringify(doc));
// No artificial lastmod dates: deployment time is not content modification time.
await writeFile(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PATHS.map((path) => `  <url><loc>https://roomfit.art${path}</loc></url>`).join("\n")}\n</urlset>\n`,
);
console.log(
  `Pre-rendered ${PUBLIC_PATHS.length} public pages, 404, 6 image sets and 4 editable templates.`,
);
