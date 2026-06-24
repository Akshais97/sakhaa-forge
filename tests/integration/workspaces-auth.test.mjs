import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";

function authHeaders(userId, email = `${userId}@example.test`) {
  return {
    authorization: `Bearer ${signJwt({
      sub: userId,
      email,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600
    })}`,
    "content-type": "application/json",
    accept: "application/json"
  };
}

function signJwt(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", jwtSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

test("workspace creation requires authentication before tenant state is created", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/workspaces`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({ name: "Aster Heights" })
      });
      const body = await response.json();

      assert.equal(response.status, 401);
      assert.equal(body.code, "AUTH_REQUIRED");
      assert.equal(body.title, "Auth required");
      assert.equal(body.detail, "Sign in to continue.");
      assert.equal(JSON.stringify(body).includes("Aster Heights"), false);
    }
  );
});

test("authenticated user creates workspace and receives owner membership", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/workspaces`, {
        method: "POST",
        headers: { ...authHeaders("user-a", "asha.owner@example.test"), "idempotency-key": "create-aster-user-a" },
        body: JSON.stringify({ name: "Aster Heights" })
      });
      const body = await response.json();

      assert.equal(response.status, 201);
      assert.equal(body.workspace.name, "Aster Heights");
      assert.equal(body.membership.role, "OWNER");
      assert.equal(body.audit.eventType, "workspace.created");
      assert.equal(body.audit.actorUserId, "user-a");
    }
  );
});

test("workspace list returns only memberships for authenticated user", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      await fetch(`${baseUrl}/workspaces`, {
        method: "POST",
        headers: { ...authHeaders("user-a"), "idempotency-key": "create-aster-user-a" },
        body: JSON.stringify({ name: "Aster Heights" })
      });
      await fetch(`${baseUrl}/workspaces`, {
        method: "POST",
        headers: { ...authHeaders("user-b"), "idempotency-key": "create-meridian-user-b" },
        body: JSON.stringify({ name: "Meridian Homes" })
      });

      const response = await fetch(`${baseUrl}/workspaces`, {
        method: "GET",
        headers: authHeaders("user-a")
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(
        body.workspaces.map((workspace) => workspace.name),
        ["Aster Heights"]
      );
    }
  );
});

test("direct object reference to another workspace returns existence-hiding not found", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const createB = await fetch(`${baseUrl}/workspaces`, {
        method: "POST",
        headers: { ...authHeaders("user-b"), "idempotency-key": "create-meridian-user-b" },
        body: JSON.stringify({ name: "Meridian Homes" })
      });
      const created = await createB.json();

      const response = await fetch(`${baseUrl}/workspaces/${created.workspace.id}`, {
        method: "GET",
        headers: authHeaders("user-a")
      });
      const body = await response.json();

      assert.equal(response.status, 404);
      assert.equal(body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(body.detail, "We could not find that item.");
      assert.equal(JSON.stringify(body).includes("Meridian"), false);
    }
  );
});
