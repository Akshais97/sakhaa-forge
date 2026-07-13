import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("brand extraction correctly maps unique_selling_points to candidates and implements fallback vertical images", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("usp-owner") });
      const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
      
      const created = await client.createWorkspace(
        { name: "USP Workspace" },
        { idempotencyKey: "usp-workspace" }
      );
      const workspaceId = created.body.workspace.id;
      
      const crawl = await client.createBrandCrawlRun(
        {
          workspaceId,
          websiteUrl: "https://usp-test-brand.com",
          rightsAcknowledged: true,
          crawlScope: { maxPages: 5, permittedPathPrefixes: ["/"] }
        },
        { idempotencyKey: "usp-crawl" }
      );
      
      const claimed = await worker.claimJob(crawl.body.job.id, { resourceClass: "CPU" });
      
      // Perform the complete job call using v3 schema with unique_selling_points mapped
      const completed = await worker.completeJob(crawl.body.job.id, {
        leaseToken: claimed.body.attempt.leaseToken,
        workspaceId,
        schemaVersion: "brand.extraction.output.v3",
        provider: "firecrawl",
        universal: {
          sourceGuide: "docs/V0/Features/Firecrawl/brand-crawl-universal.md",
          profile: {
            visual_identity: {
              logo_url: "https://usp-test-brand.com/logo.png",
              colors: { primary: "#FFFFFF", secondary: "#000000" },
              downloaded_images: [
                { url: "https://usp-test-brand.com/image1.jpg", category: "lifestyle" }
              ]
            },
            copy_messaging: {
              brand_name: "USP Test Brand",
              unique_selling_points: [
                "USP Item 1: High Quality Design",
                "USP Item 2: Sustainable Materials",
                "USP Item 3: Fast Delivery"
              ]
            },
            social_proof: { testimonials: [] },
            brand_personality: { tone_signals: ["bold"] },
            metadata: { schema_org_type: "Product" },
            raw_pages: { homepage_markdown: "Home" }
          }
        },
        vertical: {
          sourceGuide: "docs/V0/Features/Firecrawl/brand-crawl-verticals.md",
          selectedBrandType: "d2c_ecommerce",
          detectedBrandType: "d2c_ecommerce",
          conflict: false,
          assets: {
            detected_vertical: "d2c_ecommerce",
            vertical_label: "D2C",
            products_or_services: ["Product A"],
            visual_assets: {
              product_images: [],
              lifestyle_images: []
            },
            copy_assets: {},
            raw_vertical_data: {}
          }
        },
        pages: [
          {
            url: "https://usp-test-brand.com/",
            title: "Home page",
            markdown: "Welcome to USP Test Brand.",
            images: [
              "https://usp-test-brand.com/banner-unmatched.jpg",
              "https://usp-test-brand.com/logo.png"
            ]
          }
        ],
        assets: [
          {
            type: "image",
            locator: "https://usp-test-brand.com/banner-unmatched.jpg",
            rightsBasis: "public website crawl evidence",
            permittedUse: "candidate review"
          }
        ]
      });
      
      assert.equal(completed.status, 200, JSON.stringify(completed.body));
      assert.equal(completed.body.job.status, "SUCCEEDED");
      
      const candidates = await client.listBrandCandidates(crawl.body.crawlRun.id);
      assert.equal(candidates.status, 200, JSON.stringify(candidates.body));
      
      // Verify USP candidates are extracted
      const uspCandidates = candidates.body.candidates.filter(c => c.fieldType === "usp");
      assert.equal(uspCandidates.length >= 3, true, `Expected at least 3 USP candidates, got ${uspCandidates.length}`);
      
      const uspValues = uspCandidates.map(c => c.value);
      assert.ok(uspValues.includes("USP Item 1: High Quality Design"));
      assert.ok(uspValues.includes("USP Item 2: Sustainable Materials"));
      assert.ok(uspValues.includes("USP Item 3: Fast Delivery"));
      
      // Verify assets are returned (including the fallback matching image)
      const rightsAssets = candidates.body.candidates.filter(c => c.fieldType === "rights_asset");
      assert.equal(rightsAssets.length >= 1, true, `Expected at least 1 rights_asset candidate, got ${rightsAssets.length}`);
    }
  );
});

test("API server startup throws config error when BRAND_CRAWL_MODE is firecrawl but key is missing", async () => {
  const { createApiServer } = await import("../../apps/api/src/server.mjs");
  await assert.rejects(
    async () => {
      await createApiServer({
        APP_ENV: "test",
        SUPABASE_JWT_SECRET: jwtSecret,
        V0_INTERNAL_WORKER_TOKEN: workerToken,
        BRAND_CRAWL_MODE: "firecrawl",
        FIRECRAWL_API_KEY: "" // missing API key
      });
    },
    {
      message: "Firecrawl provider is not configured."
    }
  );
});

test("brand extraction prioritizes LLM-extracted CTAs and audiences over regex heuristics", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("heuristics-owner") });
      const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
      
      const created = await client.createWorkspace(
        { name: "Heuristics Workspace" },
        { idempotencyKey: "heuristics-workspace" }
      );
      const workspaceId = created.body.workspace.id;
      
      const crawl = await client.createBrandCrawlRun(
        {
          workspaceId,
          websiteUrl: "https://heuristics-test-brand.com",
          rightsAcknowledged: true,
          crawlScope: { maxPages: 1, permittedPathPrefixes: ["/"] }
        },
        { idempotencyKey: "heuristics-crawl" }
      );
      
      const claimed = await worker.claimJob(crawl.body.job.id, { resourceClass: "CPU" });
      
      const completed = await worker.completeJob(crawl.body.job.id, {
        keepInMemory: true,
        leaseToken: claimed.body.attempt.leaseToken,
        workspaceId,
        schemaVersion: "brand.extraction.output.v1",
        scrape: {
          pages: [
            {
              url: "https://heuristics-test-brand.com/",
              title: "Home",
              text: "Welcome to our store. We sell products to busy developers. Contact us now.",
              json: {
                cta_buttons: ["Get Started Free Today"],
                who_its_for: "Professional software engineers"
              }
            }
          ]
        }
      });
      
      assert.equal(completed.status, 200, JSON.stringify(completed.body));
      
      const candidates = await client.listBrandCandidates(crawl.body.crawlRun.id);
      assert.equal(candidates.status, 200, JSON.stringify(candidates.body));
      
      // Verify CTA candidate is the LLM one with high confidence (0.9), not regex "Contact us now"
      const ctas = candidates.body.candidates.filter(c => c.fieldType === "cta");
      assert.ok(ctas.some(c => c.value === "Get started free today" && c.confidence === 0.9));
      
      // Verify Audience candidate is the LLM one with high confidence (0.85), not regex
      const audiences = candidates.body.candidates.filter(c => c.fieldType === "audience");
      assert.ok(audiences.some(c => c.value === "professional software engineers" && c.confidence === 0.85));
    }
  );
});

test("brand extraction supports updating candidate decision status", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("status-owner") });
      const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
      
      const created = await client.createWorkspace(
        { name: "Status Workspace" },
        { idempotencyKey: "status-workspace" }
      );
      const workspaceId = created.body.workspace.id;
      
      const crawl = await client.createBrandCrawlRun(
        {
          workspaceId,
          websiteUrl: "https://status-test-brand.com",
          rightsAcknowledged: true,
          crawlScope: { maxPages: 1, permittedPathPrefixes: ["/"] }
        },
        { idempotencyKey: "status-crawl" }
      );
      
      const claimed = await worker.claimJob(crawl.body.job.id, { resourceClass: "CPU" });
      
      await worker.completeJob(crawl.body.job.id, {
        keepInMemory: true,
        leaseToken: claimed.body.attempt.leaseToken,
        workspaceId,
        schemaVersion: "brand.extraction.output.v1",
        scrape: {
          pages: [
            {
              url: "https://status-test-brand.com/",
              title: "Home",
              text: "Welcome home.",
              json: {
                cta_buttons: ["Contact Us"]
              }
            }
          ]
        }
      });
      
      const candidatesResponse = await client.listBrandCandidates(crawl.body.crawlRun.id);
      assert.equal(candidatesResponse.status, 200);
      const candidate = candidatesResponse.body.candidates[0];
      assert.ok(candidate);
      assert.equal(candidate.decision, "candidate");
      
      // Update status to approved
      const updateUrl = `${baseUrl}/brands/crawl-runs/${crawl.body.crawlRun.id}/candidates/${candidate.id}/status`;
      const updateResponse = await fetch(updateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${signJwt("status-owner")}`
        },
        body: JSON.stringify({ status: "approved" })
      });
      if (updateResponse.status !== 200) {
        const bodyText = await updateResponse.text();
        console.error("FAILED UPDATE RESPONSE:", updateResponse.status, bodyText);
      }
      assert.equal(updateResponse.status, 200);
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true);
      assert.equal(updateBody.candidate.decision, "approve");
      
      // Verify list returns updated status
      const updatedCandidates = await client.listBrandCandidates(crawl.body.crawlRun.id);
      const updatedCandidate = updatedCandidates.body.candidates.find(c => c.id === candidate.id);
      assert.equal(updatedCandidate.decision, "approve");
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
