import { spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

try {
  loadEnvFile("apps/api/.env");
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

const command = process.execPath;
const args = [
  resolvePrismaEntrypoint(),
  "generate",
  "--schema",
  resolve("packages/db/prisma/schema.prisma")
];
const result = spawnSync(command, args, {
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function resolvePrismaEntrypoint() {
  const local = resolve("packages/db/node_modules/prisma/build/index.js");
  if (existsSync(local)) {
    return local;
  }
  throw new Error("Prisma CLI entrypoint not found. Run pnpm install before db:generate.");
}
