import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";

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

test("generated client receives auth-required problem details for workspace creation", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl });
      const result = await client.createWorkspace({ name: "Aster Heights" });

      assert.equal(result.status, 401);
      assert.equal(result.body.code, "AUTH_REQUIRED");
      assert.equal(JSON.stringify(result.body).includes("Aster Heights"), false);
    }
  );
});

test("generated client can create, list and select an owned workspace", async () => {
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
        { idempotencyKey: "create-aster-user-a" }
      );
      const listed = await client.listWorkspaces();
      const selected = await client.getWorkspace(created.body.workspace.id);

      assert.equal(created.status, 201);
      assert.equal(listed.status, 200);
      assert.equal(listed.body.workspaces.length, 1);
      assert.equal(selected.status, 200);
      assert.equal(selected.body.workspace.name, "Aster Heights");
      assert.equal(selected.body.membership.role, "OWNER");
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
