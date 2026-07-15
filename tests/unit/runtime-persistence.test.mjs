import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../../apps/api/src/workspace-store.mjs";

test("staging and production cannot silently fall back to the in-memory domain store", () => {
  assert.throws(() => createStore({ APP_ENV: "staging" }), /V0_RUNTIME_DB=prisma is required/);
  assert.throws(() => createStore({ APP_ENV: "production" }), /V0_RUNTIME_DB=prisma is required/);
});
