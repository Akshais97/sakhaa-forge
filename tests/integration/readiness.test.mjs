import test from "node:test";
import assert from "node:assert/strict";
import { withApiServer } from "../helpers/server.mjs";

test("readiness returns 503 with only the unavailable dependency named", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_LOCAL_DEPENDENCY_FAILURE: "redis"
    },
    async ({ baseUrl }) => {
      const healthResponse = await fetch(`${baseUrl}/health`);
      assert.equal(healthResponse.status, 200);

      const readyResponse = await fetch(`${baseUrl}/ready`);
      const body = await readyResponse.json();

      assert.equal(readyResponse.status, 503);
      assert.equal(body.status, "degraded");
      assert.equal(body.dependencies.redis.status, "unavailable");
      assert.equal(body.dependencies.postgres.status, "available");
      assert.equal(JSON.stringify(body).includes("DATABASE_URL"), false);
    }
  );
});
