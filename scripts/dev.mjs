import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = ["landing", "platform"].map((name) =>
  spawn(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      name === "landing" ? "4178" : "4181",
      "--strictPort",
    ],
    { cwd: path.join(root, name), stdio: "inherit" },
  ),
);
children.push(
  spawn(process.execPath, [path.join(root, "scripts/python.mjs"), "dev"], {
    cwd: root,
    stdio: "inherit",
  }),
);
const close = () => children.forEach((child) => child.kill());
process.on("SIGINT", close);
process.on("SIGTERM", close);
children.forEach((child) =>
  child.on("exit", (code) => {
    if (code) {
      close();
      process.exit(code);
    }
  }),
);
