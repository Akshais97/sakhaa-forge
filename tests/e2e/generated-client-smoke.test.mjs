import test from "node:test";
import assert from "node:assert/strict";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

test("generated client can fetch readiness from the API", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl });
      const readiness = await client.getReadiness();

      assert.equal(readiness.status, 200);
      assert.equal(readiness.body.status, "ready");
      assert.equal(readiness.body.product, "Sakhaa Forge");
    }
  );
});
