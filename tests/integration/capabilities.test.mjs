import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";

test("Owner disables simulated media capability and new job starts are blocked without hiding existing workspace", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: "test-worker-token"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("capability-owner") });
      const created = await client.createWorkspace(
        { name: "Capability Aster" },
        { idempotencyKey: "f5-capability-workspace" }
      );
      const workspaceId = created.body.workspace.id;
      const sourceHash = sha256("capability-source");
      const source = await client.initiateBrandAssetUpload(
        {
          workspaceId,
          fileName: "source.mp4",
          contentType: "video/mp4",
          byteSize: 12,
          sha256: sourceHash
        },
        { idempotencyKey: "f5-capability-source" }
      );
      await client.completeBrandAssetUpload(source.body.artifact.id, {
        workspaceId,
        byteSize: 12,
        sha256: sourceHash
      });

      const disabled = await client.setWorkspaceCapability(workspaceId, {
        capability: "media_processing",
        enabled: false,
        reason: "F5 capability-disable proof"
      });
      const blocked = await client.startSimulatedMediaProcessing(
        {
          workspaceId,
          inputArtifactId: source.body.artifact.id,
          outputFileName: "processed.mp4"
        },
        { idempotencyKey: "f5-capability-blocked-job" }
      );
      const workspace = await client.getWorkspace(workspaceId);

      assert.equal(disabled.status, 200);
      assert.equal(disabled.body.capability.enabled, false);
      assert.equal(blocked.status, 404);
      assert.equal(blocked.body.code, "CAPABILITY_DISABLED");
      assert.equal(workspace.status, 200);
      assert.equal(workspace.body.workspace.id, workspaceId);
    }
  );
});

test("cross-workspace user cannot disable another workspace capability", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: "test-worker-token"
    },
    async ({ baseUrl }) => {
      const owner = new V0Client({ baseUrl, authToken: signJwt("capability-owner-b") });
      const outsider = new V0Client({ baseUrl, authToken: signJwt("capability-outsider") });
      const created = await owner.createWorkspace(
        { name: "Capability Meridian" },
        { idempotencyKey: "f5-capability-workspace-b" }
      );

      const denied = await outsider.setWorkspaceCapability(created.body.workspace.id, {
        capability: "media_processing",
        enabled: false,
        reason: "must not cross tenant"
      });

      assert.equal(denied.status, 404);
      assert.equal(denied.body.code, "WORKSPACE_ACCESS_DENIED");
    }
  );
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

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
