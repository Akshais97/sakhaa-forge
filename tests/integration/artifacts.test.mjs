import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";

test("workspace user uploads a clean artifact and receives authorized retrieval only", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const userA = new V0Client({ baseUrl, authToken: signJwt("user-a") });
      const userB = new V0Client({ baseUrl, authToken: signJwt("user-b") });
      const created = await userA.createWorkspace(
        { name: "Aster Heights" },
        { idempotencyKey: "f3-create-aster-clean" }
      );
      const workspaceId = created.body.workspace.id;
      const expectedHash = sha256("clean-image-bytes");

      const initiated = await userA.initiateBrandAssetUpload(
        {
          workspaceId,
          fileName: "logo.png",
          contentType: "image/png",
          byteSize: 17,
          sha256: expectedHash
        },
        { idempotencyKey: "f3-upload-clean-logo" }
      );
      const completed = await userA.completeBrandAssetUpload(initiated.body.artifact.id, {
        workspaceId,
        byteSize: 17,
        sha256: expectedHash
      });
      const download = await userA.createArtifactDownload(initiated.body.artifact.id, { workspaceId });
      const crossTenantDownload = await userB.createArtifactDownload(initiated.body.artifact.id, { workspaceId });

      assert.equal(initiated.status, 201);
      assert.equal(initiated.body.artifact.status, "QUARANTINED");
      assert.equal(initiated.body.artifact.workspaceId, workspaceId);
      assert.equal(initiated.body.artifact.sha256, expectedHash);
      assert.equal(initiated.body.upload.method, "PUT");
      assert.equal(initiated.body.upload.expiresAt.length > 0, true);
      assert.equal(completed.status, 200);
      assert.equal(completed.body.artifact.status, "CLEAN");
      assert.equal(completed.body.artifact.retentionClass, "clean-media");
      assert.equal(download.status, 200);
      assert.equal(download.body.artifact.id, initiated.body.artifact.id);
      assert.equal(download.body.download.method, "GET");
      assert.equal(crossTenantDownload.status, 404);
      assert.equal(crossTenantDownload.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(crossTenantDownload.body).includes("logo.png"), false);
      assert.equal(JSON.stringify(crossTenantDownload.body).includes(download.body.download.token), false);
    }
  );
});

test("hash mismatch rejects artifact substitution and keeps artifact out of clean media", async () => {
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
        { idempotencyKey: "f3-create-aster-hash" }
      );
      const workspaceId = created.body.workspace.id;
      const initiated = await client.initiateBrandAssetUpload(
        {
          workspaceId,
          fileName: "render.mp4",
          contentType: "video/mp4",
          byteSize: 19,
          sha256: sha256("expected-video-bytes")
        },
        { idempotencyKey: "f3-upload-video-hash" }
      );

      const completed = await client.completeBrandAssetUpload(initiated.body.artifact.id, {
        workspaceId,
        byteSize: 19,
        sha256: sha256("substituted-video-bytes")
      });

      assert.equal(completed.status, 409);
      assert.equal(completed.body.code, "ARTIFACT_HASH_MISMATCH");
      assert.equal(completed.body.artifact.status, "REJECTED");
      assert.equal(completed.body.artifact.retentionClass, "quarantine");
    }
  );
});

test("unsupported file type becomes a retained rejected artifact", async () => {
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
        { idempotencyKey: "f3-create-aster-rejected" }
      );
      const workspaceId = created.body.workspace.id;
      const hash = sha256("binary-executable");
      const initiated = await client.initiateBrandAssetUpload(
        {
          workspaceId,
          fileName: "payload.exe",
          contentType: "application/x-msdownload",
          byteSize: 17,
          sha256: hash
        },
        { idempotencyKey: "f3-upload-rejected-exe" }
      );

      const completed = await client.completeBrandAssetUpload(initiated.body.artifact.id, {
        workspaceId,
        byteSize: 17,
        sha256: hash
      });

      assert.equal(initiated.status, 201);
      assert.equal(completed.status, 415);
      assert.equal(completed.body.code, "ASSET_TYPE_UNSUPPORTED");
      assert.equal(completed.body.artifact.status, "REJECTED");
      assert.equal(completed.body.artifact.retentionClass, "quarantine");
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
