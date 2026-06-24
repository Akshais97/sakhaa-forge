import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";

test("simulated RLS denies cross-workspace reads between Aster Heights and Meridian Homes", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const userA = new V0Client({ baseUrl, authToken: signJwt("user-a", "asha.owner@example.test") });
      const userB = new V0Client({ baseUrl, authToken: signJwt("user-b", "bhavesh.owner@example.test") });

      const aster = await userA.createWorkspace(
        { name: "Aster Heights" },
        { idempotencyKey: "rls-create-aster-heights" }
      );
      const meridian = await userB.createWorkspace(
        { name: "Meridian Homes" },
        { idempotencyKey: "rls-create-meridian-homes" }
      );

      const userAReadsMeridian = await userA.getWorkspace(meridian.body.workspace.id);
      const userBReadsAster = await userB.getWorkspace(aster.body.workspace.id);
      const userAOwnList = await userA.listWorkspaces();
      const userBOwnList = await userB.listWorkspaces();

      assert.equal(userAReadsMeridian.status, 404);
      assert.equal(userAReadsMeridian.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(userAReadsMeridian.body).includes("Meridian Homes"), false);
      assert.equal(userBReadsAster.status, 404);
      assert.equal(userBReadsAster.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(userBReadsAster.body).includes("Aster Heights"), false);
      assert.deepEqual(
        userAOwnList.body.workspaces.map((workspace) => workspace.name),
        ["Aster Heights"]
      );
      assert.deepEqual(
        userBOwnList.body.workspaces.map((workspace) => workspace.name),
        ["Meridian Homes"]
      );
    }
  );
});

test("simulated RLS denies missing membership without exposing workspace existence", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const owner = new V0Client({ baseUrl, authToken: signJwt("user-a", "asha.owner@example.test") });
      const outsider = new V0Client({ baseUrl, authToken: signJwt("user-c", "chitra.reviewer@example.test") });

      const aster = await owner.createWorkspace(
        { name: "Aster Heights" },
        { idempotencyKey: "rls-missing-membership-aster" }
      );
      const outsiderRead = await outsider.getWorkspace(aster.body.workspace.id);
      const outsiderList = await outsider.listWorkspaces();

      assert.equal(outsiderRead.status, 404);
      assert.equal(outsiderRead.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(outsiderRead.body).includes("Aster Heights"), false);
      assert.deepEqual(outsiderList.body.workspaces, []);
    }
  );
});

function signJwt(userId, email) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
