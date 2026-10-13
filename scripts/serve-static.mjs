import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(
  process.cwd().endsWith("landing") ? "dist" : "landing/dist",
);
const port = Number(process.argv[process.argv.indexOf("--port") + 1]) || 4185;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};
createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/events") {
      res.writeHead(204, { "Cache-Control": "no-store" }).end();
      return;
    }
    let file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    let status = 200;
    try {
      if ((await stat(file)).isDirectory()) {
        if (!url.pathname.endsWith("/")) {
          res
            .writeHead(301, { Location: url.pathname + "/" + url.search })
            .end();
          return;
        }
        file = resolve(file, "index.html");
      }
      await stat(file);
    } catch {
      file = resolve(root, "404.html");
      status = 404;
    }
    const body = await readFile(file);
    res.writeHead(status, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(400).end();
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`RoomFit static preview: http://127.0.0.1:${port}`),
);
