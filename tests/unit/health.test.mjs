import test from "node:test";
import assert from "node:assert/strict";
import { getHealth, getReadiness } from "../../apps/api/src/readiness.mjs";

test("health payload is public-safe and does not expose connection strings", () => {
  const health = getHealth({
    APP_ENV: "local",
    APP_VERSION: "test",
    DATABASE_URL: "postgresql://secret@example/v0"
  });

  assert.equal(health.status, "ok");
  assert.equal(health.product, "Sakhaa Forge");
  assert.equal(JSON.stringify(health).includes("postgresql://"), false);
});

test("readiness reports available local simulator dependencies", () => {
  const readiness = getReadiness({
    APP_ENV: "local",
    APP_VERSION: "test"
  });

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.dependencies.postgres.status, "available");
  assert.equal(readiness.dependencies.fakeWorker.status, "available");
});
