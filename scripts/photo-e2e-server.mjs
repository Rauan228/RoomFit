import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(root, "api", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const child = spawn(python, [path.join(root, "api/tests/photo_e2e_server.py")], { cwd: root, env: process.env, stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 1));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
