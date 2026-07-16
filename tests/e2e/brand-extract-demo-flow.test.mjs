import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { withApiServer } from "../helpers/server.mjs";
import { POST as createDemoSession } from "../../apps/web/app/api/brand-extract/demo-session/route.ts";
import { POST as completeDemoCrawl } from "../../apps/web/app/api/brand-extract/demo-complete-crawl/route.ts";

const jwtSecret = "local-dev-supabase-jwt-secret";
const workerToken = "local-dev-worker-token";

test("brand-extract local demo flow runs end to end with filled fields and extracted brand assets", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const apiRoot = baseUrl.replace(/\/api\/v0$/, "");
      const priorApiBase = process.env.V0_API_BASE_URL;
      const priorJwtSecret = process.env.SUPABASE_JWT_SECRET;
      const priorWorkerToken = process.env.V0_INTERNAL_WORKER_TOKEN;
      process.env.V0_API_BASE_URL = apiRoot;
      process.env.SUPABASE_JWT_SECRET = jwtSecret;
      process.env.V0_INTERNAL_WORKER_TOKEN = workerToken;
      try {
        const session = await invokeRoute(createDemoSession);
        assert.equal(session.status, 200, JSON.stringify(session.body));
        assert.match(session.body.workspaceId, /^[0-9a-f-]{36}$/);
        assert.match(session.body.authToken, /^[^.]+\.[^.]+\.[^.]+$/);

        const assetBytes = Buffer.from("logo");
        const assetHash = createHash("sha256").update(assetBytes).digest("hex");
        const upload = await postJson(
          `${baseUrl}/brands/assets/uploads`,
          {
            workspaceId: session.body.workspaceId,
            fileName: "aster-logo.png",
            contentType: "image/png",
            byteSize: assetBytes.length,
            sha256: assetHash
          },
          {
            authorization: `Bearer ${session.body.authToken}`,
            "idempotency-key": "brand-extract-e2e-upload"
          }
        );
        assert.equal(upload.status, 201, JSON.stringify(upload.body));

        const retainedUpload = await fetch(new URL(upload.body.upload.url, baseUrl), {
          method: upload.body.upload.method,
          headers: upload.body.upload.headers,
          body: assetBytes
        });
        assert.equal(retainedUpload.status, 200, await retainedUpload.text());

        const completedUpload = await postJson(
          `${baseUrl}/brands/assets/uploads/${upload.body.artifact.id}/complete`,
          {
            workspaceId: session.body.workspaceId,
            byteSize: assetBytes.length,
            sha256: assetHash
          },
          { authorization: `Bearer ${session.body.authToken}` }
        );
        assert.equal(completedUpload.status, 200, JSON.stringify(completedUpload.body));
        assert.equal(completedUpload.body.artifact.status, "CLEAN");

        const crawl = await postJson(
          `${baseUrl}/brands/crawl-runs`,
          {
            workspaceId: session.body.workspaceId,
            websiteUrl: "https://aster.example.com/projects/",
            rightsAcknowledged: true,
            brandType: "real_estate",
            crawlScope: { maxPages: 5, permittedPathPrefixes: ["/"] },
            assets: [
              {
                artifactId: completedUpload.body.artifact.id,
                rightsBasis: "Owner Upload",
                permittedUse: "brand profile extraction"
              }
            ]
          },
          {
            authorization: `Bearer ${session.body.authToken}`,
            "idempotency-key": "brand-extract-e2e-crawl"
          }
        );
        assert.equal(crawl.status, 202, JSON.stringify(crawl.body));
        assert.equal(crawl.body.brandAssets.length, 1);
        assert.equal(crawl.body.brandAssets[0].artifactId, completedUpload.body.artifact.id);
        assert.equal(crawl.body.crawlRun.selectedBrandType, "real_estate");

        const demoCompleted = await invokeRoute(completeDemoCrawl, {
          workspaceId: session.body.workspaceId,
          jobId: crawl.body.job.id,
          websiteUrl: "https://aster.example.com/projects/",
          brandName: "Aster Heights",
          industry: "Real Estate"
        });
        assert.equal(demoCompleted.status, 200, JSON.stringify(demoCompleted.body));
        assert.equal(demoCompleted.body.job.status, "SUCCEEDED");

        const detail = await getJson(`${baseUrl}/brands/crawl-runs/${crawl.body.crawlRun.id}`, {
          authorization: `Bearer ${session.body.authToken}`
        });
        assert.equal(detail.status, 200, JSON.stringify(detail.body));
        assert.equal(detail.body.crawlRun.status, "SUCCEEDED");
        assert.equal(detail.body.brandAssets.length, 1);
        assert.ok(detail.body.candidates.length >= 8, "expected evidence-backed extracted candidates");
        assert.ok(detail.body.candidates.some((candidate) => candidate.fieldType === "summary"));
        assert.ok(detail.body.candidates.some((candidate) => candidate.fieldType === "usp"));
        assert.ok(detail.body.candidates.some((candidate) => candidate.fieldType === "logo"));
        assert.ok(detail.body.candidates.some((candidate) => candidate.fieldType === "color"));
        assert.ok(detail.body.candidates.every((candidate) => candidate.sourceEvidence.length > 0));

        const candidate = detail.body.candidates[0];
        const decision = await postJson(
          `${baseUrl}/brands/crawl-runs/${crawl.body.crawlRun.id}/candidates/${candidate.id}/status`,
          { status: "approved" },
          { authorization: `Bearer ${session.body.authToken}` }
        );
        assert.equal(decision.status, 200, JSON.stringify(decision.body));
        assert.equal(decision.body.candidate.decision, "approve");

        const staleDecision = await postJson(
          `${baseUrl}/brands/crawl-runs/${crawl.body.crawlRun.id}/candidates/00000000-0000-4000-8000-000000000000/status`,
          { status: "approved" },
          { authorization: `Bearer ${session.body.authToken}` }
        );
        assert.equal(staleDecision.status, 404, JSON.stringify(staleDecision.body));
        assert.equal(staleDecision.body.detail, "We could not find that item.");

        const assetPack = await getJson(`${baseUrl}/brands/crawl-runs/${crawl.body.crawlRun.id}/asset-pack`, {
          authorization: `Bearer ${session.body.authToken}`
        });
        assert.equal(assetPack.status, 200, JSON.stringify(assetPack.body));
        assert.ok(assetPack.body.assetPack.identity.length > 0);
        assert.ok(assetPack.body.assetPack.mediaInventory.some((candidate) => candidate.fieldType === "logo"));
        assert.ok(assetPack.body.assetPack.complianceRights.some((candidate) => candidate.fieldType === "prohibited_claim"));
        assert.equal(assetPack.body.assetPack.readiness.status, "approval_required");
      } finally {
        restoreEnv("V0_API_BASE_URL", priorApiBase);
        restoreEnv("SUPABASE_JWT_SECRET", priorJwtSecret);
        restoreEnv("V0_INTERNAL_WORKER_TOKEN", priorWorkerToken);
      }
    }
  );
});

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  return { response, status: response.status, body: await response.json() };
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  return { response, status: response.status, body: await response.json() };
}

async function invokeRoute(handler, body = {}) {
  const response = await handler(
    new Request("http://brand-extract.local/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  return { response, status: response.status, body: await response.json() };
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
