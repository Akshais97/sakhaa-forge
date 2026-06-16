import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "apps/api/src/server.mjs",
  "apps/web/src/server.mjs",
  "workers/queue/src/processor.mjs",
  "workers/python/fake_worker.py",
  "scripts/install-pnpm-shim.mjs",
  "packages/contracts/generated/v0-client.mjs",
  "packages/config/src/storage.mjs",
  "packages/db/prisma/schema.prisma",
  "infra/docker/docker-compose.local.yml"
];

const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
  throw new Error(`Missing required F0 files:\n${missing.join("\n")}`);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
if (!packageJson.packageManager?.startsWith("pnpm@11.")) {
  throw new Error("Root packageManager must pin pnpm release line 11.");
}

console.log("Typecheck placeholder passed: F0 workspace files and toolchain pins are present.");
