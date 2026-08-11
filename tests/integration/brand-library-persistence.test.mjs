import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";

test("a crawl resolves a durable recognizable brand and its assets remain addressable by brand id", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: "test-worker-token"
    },
    async ({ baseUrl }) => {
      const token = signJwt("brand-library");
      const client = new V0Client({ baseUrl, authToken: token });
      const created = await client.createWorkspace(
        { name: "Brand Library" },
        { idempotencyKey: "brand-library-workspace" }
      );
      const workspaceId = created.body.workspace.id;

      const crawl = await client.createBrandCrawlRun(
        {
          workspaceId,
          brandName: "Aster Homes",
          websiteUrl: "https://aster.example.com/projects",
          rightsAcknowledged: true,
          crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
        },
        { idempotencyKey: "brand-library-crawl" }
      );

      assert.equal(crawl.status, 202, JSON.stringify(crawl.body));
      assert.match(crawl.body.brand.id, /^[0-9a-f-]{36}$/i);
      assert.equal(crawl.body.brand.name, "Aster Homes");
      assert.equal(crawl.body.crawlRun.brandId, crawl.body.brand.id);

      const brands = await requestJson(`${baseUrl}/workspaces/${workspaceId}/brands`, token);
      assert.equal(brands.status, 200, JSON.stringify(brands.body));
      assert.deepEqual(brands.body.brands.map((brand) => brand.id), [crawl.body.brand.id]);

      const assets = await requestJson(`${baseUrl}/brands/${crawl.body.brand.id}/assets`, token);
      assert.equal(assets.status, 200, JSON.stringify(assets.body));
      assert.deepEqual(assets.body.assets, []);

      const bytes = Buffer.from("persistent-logo");
      const upload = await client.initiateBrandAssetUpload(
        {
          workspaceId,
          brandId: crawl.body.brand.id,
          fileName: "persistent-logo.png",
          contentType: "image/png",
          byteSize: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          rightsBasis: "Owner upload",
          permittedUse: "Approved brand video production"
        },
        { idempotencyKey: "brand-library-logo" }
      );
      const retained = await fetch(new URL(upload.body.upload.url, baseUrl), {
        method: upload.body.upload.method,
        headers: upload.body.upload.headers,
        body: bytes
      });
      assert.equal(retained.status, 200);
      const completed = await client.completeBrandAssetUpload(upload.body.artifact.id, {
        workspaceId,
        byteSize: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex")
      });
      assert.equal(completed.status, 200, JSON.stringify(completed.body));
      const persistentAssets = await client.listBrandAssets(crawl.body.brand.id);
      assert.equal(persistentAssets.status, 200, JSON.stringify(persistentAssets.body));
      assert.equal(persistentAssets.body.assets.length, 1);
      assert.equal(persistentAssets.body.assets[0].brandId, crawl.body.brand.id);
      assert.equal(persistentAssets.body.assets[0].artifactId, upload.body.artifact.id);

      const crossBrand = await client.createBrandCrawlRun(
        {
          workspaceId,
          brandName: "Meridian Homes",
          websiteUrl: "https://meridian.example.com",
          rightsAcknowledged: true,
          crawlScope: { maxPages: 2, permittedPathPrefixes: ["/"] },
          assets: [{ artifactId: upload.body.artifact.id, rightsBasis: "Owner upload", permittedUse: "Brand video production" }]
        },
        { idempotencyKey: "cross-brand-asset" }
      );
      assert.equal(crossBrand.status, 409);
      assert.equal(crossBrand.body.code, "BRAND_ASSET_NOT_APPROVED");
    }
  );
});

async function requestJson(url, token) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
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
