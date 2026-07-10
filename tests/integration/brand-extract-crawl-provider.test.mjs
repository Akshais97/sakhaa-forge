import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

// T5 (F3a) — when no crawl provider is configured the crawl run must SAY SO (an honest
// crawlProvider status on the public crawl run) instead of hanging QUEUED silently. The job
// itself stays QUEUED so the worker model is preserved (a real worker / test can still claim it).
test("brand crawl run surfaces an honest crawlProvider status when no provider is configured (F3a)", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("crawl-owner") });
      const created = await client.createWorkspace({ name: "Crawl Provider" }, { idempotencyKey: "crawl-provider-workspace" });
      const workspaceId = created.body.workspace.id;

      const crawl = await client.createBrandCrawlRun(
        {
          workspaceId,
          websiteUrl: "https://aster.example.com",
          rightsAcknowledged: true,
          crawlScope: { maxPages: 3, permittedPathPrefixes: ["/"] }
        },
        { idempotencyKey: "crawl-provider-run" }
      );
      assert.equal(crawl.status < 400, true, JSON.stringify(crawl.body));

      assert.equal(typeof crawl.body.crawlRun.crawlProvider, "object", "crawlRun.crawlProvider must be present on creation");
      assert.equal(crawl.body.crawlRun.crawlProvider.configured, false, "no FIRECRAWL_API_KEY in the test env -> not configured");

      // The worker model is preserved: the job stays QUEUED so a worker / test can still claim it.
      assert.equal(crawl.body.job.status, "QUEUED");

      const detail = await client.getBrandCrawlRun(crawl.body.crawlRun.id);
      assert.equal(detail.status, 200, JSON.stringify(detail.body));
      assert.equal(typeof detail.body.crawlRun.crawlProvider, "object", "crawlRun.crawlProvider must be present on detail read");
      assert.equal(detail.body.crawlRun.crawlProvider.configured, false);

      // No secrets leak through the crawlProvider status.
      assert.equal(/api[_-]?key|secret|signed[_-]?url/i.test(JSON.stringify(detail.body.crawlRun.crawlProvider)), false);
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
