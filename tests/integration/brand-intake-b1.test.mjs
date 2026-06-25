import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";

test("brand crawl intake rejects private URL before creating a run", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: "test-worker-token"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("brand-ssrf") });
      const created = await client.createWorkspace(
        { name: "Brand SSRF" },
        { idempotencyKey: "b1-ssrf-workspace" }
      );

      const blocked = await client.createBrandCrawlRun(
        {
          workspaceId: created.body.workspace.id,
          websiteUrl: "http://169.254.169.254/latest/meta-data",
          rightsAcknowledged: true,
          crawlScope: { maxPages: 3, permittedPathPrefixes: ["/"] }
        },
        { idempotencyKey: "b1-ssrf-run" }
      );

      assert.equal(blocked.status, 422);
      assert.equal(blocked.body.code, "CRAWL_SSRF_BLOCKED");
    }
  );
});

test("brand crawl intake rejects missing rights acknowledgement", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: "test-worker-token"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("brand-rights") });
      const created = await client.createWorkspace(
        { name: "Brand Rights" },
        { idempotencyKey: "b1-rights-workspace" }
      );

      const missingRights = await client.createBrandCrawlRun(
        {
          workspaceId: created.body.workspace.id,
          websiteUrl: "https://aster.example.com",
          rightsAcknowledged: false,
          crawlScope: { maxPages: 3, permittedPathPrefixes: ["/"] }
        },
        { idempotencyKey: "b1-rights-run" }
      );

      assert.equal(missingRights.status, 409);
      assert.equal(missingRights.body.code, "SOURCE_RIGHTS_REQUIRED");
    }
  );
});

test("brand crawl intake creates durable crawl run, brand asset rights and queued job", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: "test-worker-token"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("brand-happy") });
      const created = await client.createWorkspace(
        { name: "Brand Happy" },
        { idempotencyKey: "b1-happy-workspace" }
      );
      const workspaceId = created.body.workspace.id;
      const logoHash = sha256("logo");
      const upload = await client.initiateBrandAssetUpload(
        {
          workspaceId,
          fileName: "logo.png",
          contentType: "image/png",
          byteSize: 4,
          sha256: logoHash
        },
        { idempotencyKey: "b1-logo-upload" }
      );
      await client.completeBrandAssetUpload(upload.body.artifact.id, {
        workspaceId,
        byteSize: 4,
        sha256: logoHash
      });

      const run = await client.createBrandCrawlRun(
        {
          workspaceId,
          websiteUrl: "https://Aster.example.com//projects/?utm_source=ad",
          rightsAcknowledged: true,
          crawlScope: { maxPages: 5, permittedPathPrefixes: ["/projects"] },
          assets: [
            {
              artifactId: upload.body.artifact.id,
              rightsBasis: "owned logo",
              permittedUse: "brand profile extraction"
            }
          ]
        },
        { idempotencyKey: "b1-happy-run" }
      );
      const job = await client.getJob(run.body.job.id);

      assert.equal(run.status, 202, JSON.stringify(run.body));
      assert.equal(run.body.crawlRun.status, "QUEUED");
      assert.equal(run.body.crawlRun.normalizedUrl, "https://aster.example.com/projects/");
      assert.equal(run.body.brandAssets.length, 1);
      assert.equal(run.body.brandAssets[0].artifactId, upload.body.artifact.id);
      assert.equal(run.body.job.type, "brand_crawl");
      assert.equal(job.body.job.status, "QUEUED");
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
