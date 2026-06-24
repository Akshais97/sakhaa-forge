import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("verify script reports the current local F0-F4 verification scope", async () => {
  const script = await readFile("scripts/verify.mjs", "utf8");

  assert.match(script, /V0-F0\/F1\/F2\/F3\/F4 local verification passed/);
  assert.doesNotMatch(script, /V0-F0\/F1\/F2\/F3 local verification passed/);
  assert.match(script, /packages\/db\/scripts\/db-generate\.mjs/);
  assert.match(script, /packages\/db\/scripts\/db-migrate-dev\.mjs/);
  assert.match(script, /tests\/integration\/prisma-runtime\.test\.mjs/);
  assert.match(script, /V0_RUNTIME_DB_PROOF/);
});
