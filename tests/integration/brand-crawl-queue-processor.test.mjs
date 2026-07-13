import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { createApiServer } from "../../apps/api/src/server.mjs";
import { processBrandCrawlJob } from "../../workers/queue/src/brand-crawl-processor.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { shouldCompleteCrawlWithLocalDemo } from "../../apps/web/app/brand-extract/_components/candidate-adapter.ts";

const jwtSecret = "queue-brand-crawl-jwt-secret";
const workerToken = "queue-brand-crawl-worker-token";

test("API dispatches a real crawl in-process with a matching local worker token when Redis is absent", async () => {
  const env = {
    APP_ENV: "test",
    APP_VERSION: "test",
    SUPABASE_JWT_SECRET: jwtSecret,
    BRAND_CRAWL_MODE: "firecrawl",
    FIRECRAWL_API_KEY: "fc-local-dispatch-test",
    FIRECRAWL_API_BASE_URL: "https://api.firecrawl.dev/v2"
  };
  const dispatches = [];
  const app = await createApiServer(env, {
    processBrandCrawlJobImpl: async (jobId, options) => {
      dispatches.push({ jobId, options });
      return { ok: true };
    }
  });
  await app.listen(0, "127.0.0.1");
  const baseUrl = `${await app.getUrl()}/api/v0`;
  env.API_BASE_URL = baseUrl;

  try {
    const user = new V0Client({ baseUrl, authToken: signJwt("queue-local-owner") });
    const workspace = await user.createWorkspace({ name: "Local queue crawl" }, { idempotencyKey: "local-queue-workspace" });
    const crawl = await user.createBrandCrawlRun(
      {
        workspaceId: workspace.body.workspace.id,
        websiteUrl: "https://local-queue.example.com",
        rightsAcknowledged: true,
        brandType: "real_estate",
        crawlScope: { maxPages: 5, permittedPathPrefixes: ["/"] }
      },
      { idempotencyKey: "local-queue-crawl" }
    );

    await waitFor(() => dispatches.length === 1);
    assert.equal(dispatches[0].jobId, crawl.body.job.id);
    assert.equal(dispatches[0].options.workerToken, env.V0_INTERNAL_WORKER_TOKEN);
    assert.equal(dispatches[0].options.apiBaseUrl, baseUrl);
    assert.equal(typeof env.V0_INTERNAL_WORKER_TOKEN, "string");
    assert.notEqual(env.V0_INTERNAL_WORKER_TOKEN.length, 0);
    assert.deepEqual(crawl.body.crawlRun.crawlProvider, { mode: "firecrawl", configured: true });
    assert.equal(
      shouldCompleteCrawlWithLocalDemo({
        source: "local-demo",
        jobId: crawl.body.job.id,
        crawlProvider: crawl.body.crawlRun.crawlProvider
      }),
      false,
      "configured Firecrawl must keep one claim owner even when local demo auth is active"
    );
  } finally {
    await app.close();
  }
});

test("queue processor invokes Firecrawl with the server-side key and completes the canonical brand job", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken,
      BRAND_CRAWL_MODE: "simulator"
    },
    async ({ baseUrl }) => {
      const user = new V0Client({ baseUrl, authToken: signJwt("queue-crawl-owner") });
      const workspace = await user.createWorkspace({ name: "Queue crawl" }, { idempotencyKey: "queue-crawl-workspace" });
      const crawl = await user.createBrandCrawlRun(
        {
          workspaceId: workspace.body.workspace.id,
          websiteUrl: "https://queue-crawl.example.com",
          rightsAcknowledged: true,
          brandType: "real_estate",
          crawlScope: { maxPages: 5, permittedPathPrefixes: ["/"] }
        },
        { idempotencyKey: "queue-crawl-run" }
      );
      const providerCalls = [];
      const assetCalls = [];

      const processed = await processBrandCrawlJob(crawl.body.job.id, {
        apiBaseUrl: baseUrl,
        workerToken,
        env: {
          BRAND_CRAWL_MODE: "firecrawl",
          FIRECRAWL_API_KEY: "fc-queue-secret",
          FIRECRAWL_API_BASE_URL: "https://api.firecrawl.dev/v2",
          FIRECRAWL_TIMEOUT_MS: "60000"
        },
        providerFetchImpl: async (url, init) => {
          providerCalls.push({ url, authorization: init.headers.authorization, body: JSON.parse(init.body) });
          return { ok: true, status: 200, json: async () => providerFixture(JSON.parse(init.body)) };
        },
        assetFetchImpl: async (url) => {
          assetCalls.push(url);
          const bytes = Buffer.from(`image-bytes:${url}`);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": url.endsWith(".svg") ? "image/svg+xml" : "image/jpeg", "content-length": String(bytes.length) }),
            arrayBuffer: async () => bytes
          };
        },
        storageRoot: `D:/tmp/sakhaa-brand-crawl-${crawl.body.job.id}`
      });

      assert.equal(processed.ok, true, JSON.stringify(processed));
      assert.equal(providerCalls.length >= 6, true);
      assert.equal(providerCalls.every((call) => call.authorization === "Bearer fc-queue-secret"), true);
      assert.equal(providerCalls.some((call) => call.body.url === "https://queue-crawl.example.com/about-us"), true);
      assert.equal(providerCalls.some((call) => call.body.url === "https://queue-crawl.example.com/listings"), true);
      assert.equal(assetCalls.length >= 2, true);

      const detail = await user.getBrandCrawlRun(crawl.body.crawlRun.id);
      assert.equal(detail.body.crawlRun.status, "SUCCEEDED");
      assert.equal(detail.body.crawlRun.extractionSchemaVersion, "brand.extraction.output.v3");
      assert.equal(detail.body.candidates.some((candidate) => candidate.fieldType === "usp" && candidate.value === "Metro-connected homes"), true);
      assert.equal(detail.body.brandAssets.length >= 2, true);
      assert.equal(detail.body.brandAssets.every((asset) => asset.locator.startsWith("artifact:")), true);
      assert.doesNotMatch(JSON.stringify(detail.body), /fc-queue-secret/);
    }
  );
});

function providerFixture(body) {
  if (body.url.endsWith("/listings")) {
    return {
      data: {
        metadata: { sourceURL: body.url, title: "Listings" },
        markdown: "Aster One. RERA-123.",
        images: ["https://queue-crawl.example.com/project.jpg"],
        json: { listing_names: ["Aster One"], listing_urls: [], rera_numbers: ["RERA-123"] }
      }
    };
  }
  return {
    data: {
      metadata: { sourceURL: body.url, title: "Aster" },
      markdown: "Aster builds metro-connected homes.",
      links: [
        "https://queue-crawl.example.com/about-us",
        "https://queue-crawl.example.com/testimonials",
        "https://queue-crawl.example.com/help",
        "https://queue-crawl.example.com/insights"
      ],
      images: ["https://queue-crawl.example.com/hero.jpg"],
      branding: { images: { logo: "https://queue-crawl.example.com/logo.svg" }, colors: { primary: "#173B57" } },
      json: {
        brand_name: "Aster",
        unique_selling_points: ["Metro-connected homes"],
        schema_type: "RealEstateListing",
        vertical_signals: ["RERA", "BHK"]
      }
    }
  };
}

function signJwt(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: userId, email: `${userId}@example.test`, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error("Timed out waiting for local crawl dispatch.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
