import { spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile("apps/api/.env");
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = ["--filter", "@sakhaa-forge/db", "exec", "prisma", "generate", "--schema", ".\\prisma\\schema.prisma"];
const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
