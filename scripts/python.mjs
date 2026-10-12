import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = path.join(
  root,
  "api",
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
function run(bin, args) {
  const r = spawnSync(bin, args, {
    cwd: path.join(root, "api"),
    stdio: "inherit",
  });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (!existsSync(executable))
  run(process.platform === "win32" ? "python" : "python3", [
    "-m",
    "venv",
    ".venv",
  ]);
if (process.argv[2] === "install")
  run(executable, ["-m", "pip", "install", "-r", "requirements.txt"]);
else if (process.argv[2] === "test") run(executable, ["-m", "pytest", "-q"]);
else
  run(executable, [
    "-m",
    "uvicorn",
    "roomfit.app:app",
    "--host",
    "127.0.0.1",
    "--port",
    "4182",
    ...process.argv.slice(3),
  ]);
