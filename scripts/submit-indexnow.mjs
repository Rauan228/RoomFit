import { readdir, readFile } from "node:fs/promises";
const files = (
  await readdir(new URL("../landing/public/", import.meta.url))
).filter((name) => /^[a-f0-9]{32}\.txt$/.test(name));
if (files.length !== 1)
  throw Error("Expected one public IndexNow verification file");
const key = files[0].slice(0, -4),
  host = "roomfit.art";
const keyLocation = `https://${host}/${files[0]}`;
const response = await fetch(keyLocation);
if (!response.ok || (await response.text()).trim() !== key)
  throw Error("Deploy the public IndexNow verification file first");
const sitemap = await fetch(`https://${host}/sitemap.xml`);
if (!sitemap.ok || !sitemap.headers.get("content-type")?.includes("xml"))
  throw Error("Public XML sitemap unavailable");
const urlList = [
  ...(await sitemap.text()).matchAll(
    /<loc>(https:\/\/roomfit\.art\/[^<]*)<\/loc>/g,
  ),
].map((match) => match[1]);
if (!urlList.length) throw Error("No public URLs in sitemap");
if (process.argv.includes("--dry-run")) {
  console.log(
    `IndexNow ready: ${urlList.length} public URLs, verification file available.`,
  );
  process.exit(0);
}
const submitted = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation, urlList }),
});
if (![200, 202].includes(submitted.status))
  throw Error(
    `IndexNow rejected submission: HTTP ${submitted.status} ${(await submitted.text()).slice(0, 300)}`,
  );
console.log(
  `IndexNow accepted ${urlList.length} public URLs: HTTP ${submitted.status}. This is a crawl notification, not a ranking guarantee.`,
);
