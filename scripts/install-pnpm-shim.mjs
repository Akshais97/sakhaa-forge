import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.platform !== "win32") {
  console.log("No pnpm shim install is required on this platform.");
  process.exit(0);
}

const binDir = join(homedir(), ".local", "bin");
const shimPath = join(binDir, "pnpm.cmd");

await mkdir(binDir, { recursive: true });
await writeFile(shimPath, "@echo off\r\ncorepack pnpm %*\r\n", "ascii");

console.log(`Installed pnpm shim at ${shimPath}`);
