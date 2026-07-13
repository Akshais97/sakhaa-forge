import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(currentDir, "../apps/api/.env");

const localEnv = {};
try {
  const text = await readFile(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    localEnv[key] = value;
  }
} catch (e) {
  console.log("No apps/api/.env file found, using process.env only.");
}

const services = [
  ["api", "node", ["apps/api/src/server.mjs"], { PORT: "3001" }],
  ["web", "pnpm", ["--filter", "@sakhaa-forge/web", "dev"], { PORT: process.env.PORT_WEB || "3005" }],
  ["queue", "node", ["workers/queue/src/processor.mjs"], {}]
];

const localAuthEnv = {
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || "local-dev-supabase-jwt-secret",
  V0_INTERNAL_WORKER_TOKEN: process.env.V0_INTERNAL_WORKER_TOKEN || "local-dev-worker-token"
};

for (const [name, command, args, env] of services) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...localEnv,
      ...localAuthEnv,
      ...process.env,
      ...env
    }
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${name} exited with code ${code}`);
      process.exitCode = code;
    }
  });
}
