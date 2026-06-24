import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";

test("same idempotency key replays workspace creation and different input is rejected", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("user-a") });

      const created = await client.createWorkspace(
        { name: "Aster Heights" },
        { idempotencyKey: "idem-workspace-create-1" }
      );
      const replayed = await client.createWorkspace(
        { name: "Aster Heights" },
        { idempotencyKey: "idem-workspace-create-1" }
      );
      const conflicted = await client.createWorkspace(
        { name: "Meridian Homes" },
        { idempotencyKey: "idem-workspace-create-1" }
      );
      const listed = await client.listWorkspaces();

      assert.equal(created.status, 201);
      assert.equal(replayed.status, 201);
      assert.deepEqual(replayed.body, created.body);
      assert.equal(conflicted.status, 409);
      assert.equal(conflicted.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
      assert.deepEqual(
        listed.body.workspaces.map((workspace) => workspace.name),
        ["Aster Heights"]
      );
    }
  );
});

test("missing idempotency key returns catalogued problem details before workspace state is created", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("user-a") });

      const response = await client.createWorkspace({ name: "Aster Heights" });
      const listed = await client.listWorkspaces();

      assert.equal(response.status, 400);
      assert.equal(response.body.code, "IDEMPOTENCY_KEY_REQUIRED");
      assert.equal(response.body.detail, "This action needs a request identity. Refresh and try again.");
      assert.deepEqual(listed.body.workspaces, []);
    }
  );
});

function signJwt(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: `${userId}@example.test`,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
