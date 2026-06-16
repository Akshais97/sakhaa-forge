import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("pnpm resolves directly from the repository root", () => {
  const command = process.platform === "win32" ? "cmd.exe" : "sh";
  const args =
    process.platform === "win32"
      ? ["/d", "/c", "pnpm --version"]
      : ["-lc", "pnpm --version"];

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.equal(
    result.status,
    0,
    `expected direct pnpm invocation to succeed, got status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.match(result.stdout, /\d+\.\d+\.\d+/);
});
