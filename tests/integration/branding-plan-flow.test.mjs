import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { uploadInitiatedArtifact, withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("branding plan profile, onboarding, crawl detail and asset pack stay tenant-safe and redacted", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("branding-owner") });
      const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
      const created = await client.createWorkspace({ name: "Branding Flow" }, { idempotencyKey: "branding-flow-workspace" });
      const workspaceId = created.body.workspace.id;

      const savedProfile = await client.updateUserProfile({
        name: "Asha Rao",
        contactEmail: "asha@example.test",
        websiteUrl: "https://aster.example.com",
        industry: "real_estate",
        primaryMarket: "India",
        language: "en-IN",
        onboardingSkipped: false
      });
      const profile = await client.getUserProfile();
      const context = await client.saveOnboardingBrandContext({
        workspaceId,
        brandName: "Aster Heights",
        websiteUrl: "https://aster.example.com",
        industry: "real_estate",
        videoGoal: "site visits",
        primaryMarket: "India",
        language: "en-IN",
        targetPlatforms: ["meta", "youtube-shorts"]
      });
      const rereadContext = await client.getOnboardingBrandContext({ workspaceId });

      const logoHash = sha256("logo");
      const upload = await client.initiateBrandAssetUpload(
        { workspaceId, fileName: "logo.png", contentType: "image/png", byteSize: 4, sha256: logoHash },
        { idempotencyKey: "branding-flow-logo" }
      );
      await uploadInitiatedArtifact(baseUrl, upload, "logo");
      await client.completeBrandAssetUpload(upload.body.artifact.id, { workspaceId, byteSize: 4, sha256: logoHash });
      const crawl = await client.createBrandCrawlRun(
        {
          workspaceId,
          websiteUrl: "https://aster.example.com",
          rightsAcknowledged: true,
          crawlScope: { maxPages: 3, permittedPathPrefixes: ["/"] },
          assets: [{ artifactId: upload.body.artifact.id, rightsBasis: "owned asset", permittedUse: "brand profile extraction" }]
        },
        { idempotencyKey: "branding-flow-crawl" }
      );
      const claimed = await worker.claimJob(crawl.body.job.id, { resourceClass: "CPU" });
      const completed = await worker.completeJob(crawl.body.job.id, {
        leaseToken: claimed.body.attempt.leaseToken,
        workspaceId,
        schemaVersion: "brand.extraction.output.v2",
        scrape: scrapeFixture()
      });
      const detail = await client.getBrandCrawlRun(crawl.body.crawlRun.id);
      const assetPack = await client.getBrandAssetPack(crawl.body.crawlRun.id);

      assert.equal(savedProfile.status, 200, JSON.stringify(savedProfile.body));
      assert.equal(profile.body.profile.name, "Asha Rao");
      assert.equal(context.status, 201, JSON.stringify(context.body));
      assert.equal(rereadContext.body.brandContext.brandName, "Aster Heights");
      assert.equal(completed.status, 200, JSON.stringify(completed.body));
      assert.equal(detail.body.crawlRun.status, "SUCCEEDED");
      assert.equal(detail.body.candidates.length > 0, true);
      assert.equal(assetPack.body.assetPack.identity.length > 0, true);
      assert.equal(assetPack.body.assetPack.mediaInventory.length > 0, true);
      assert.equal(assetPack.body.assetPack.readiness.score, 75);
      assert.equal(/signed_url|objectKey|secret|prompt|rawProviderPayload/i.test(JSON.stringify(assetPack.body)), false);
    }
  );
});

test("Firecrawl v3 brand crawl keeps selected and detected vertical evidence as candidates", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("firecrawl-v3-owner") });
      const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
      const created = await client.createWorkspace({ name: "Firecrawl V3" }, { idempotencyKey: "firecrawl-v3-workspace" });
      const workspaceId = created.body.workspace.id;

      const invalidType = await client.createBrandCrawlRun(
        {
          workspaceId,
          websiteUrl: "https://aster.example.com",
          rightsAcknowledged: true,
          brandType: "unknown_vertical",
          crawlScope: { maxPages: 3, permittedPathPrefixes: ["/"] }
        },
        { idempotencyKey: "firecrawl-v3-invalid-type" }
      );
      assert.equal(invalidType.status, 422);
      assert.equal(invalidType.body.code, "VALIDATION_FAILED");

      const crawl = await client.createBrandCrawlRun(
        {
          workspaceId,
          websiteUrl: "https://aster.example.com",
          rightsAcknowledged: true,
          brandType: "real_estate",
          crawlScope: { maxPages: 3, permittedPathPrefixes: ["/", "/projects", "/rera"] }
        },
        { idempotencyKey: "firecrawl-v3-crawl" }
      );
      assert.equal(crawl.status, 202, JSON.stringify(crawl.body));
      assert.equal(crawl.body.crawlRun.selectedBrandType, "real_estate");
      assert.equal(crawl.body.job.input, undefined);

      const claimed = await worker.claimJob(crawl.body.job.id, { resourceClass: "CPU" });
      const completed = await worker.completeJob(crawl.body.job.id, {
        leaseToken: claimed.body.attempt.leaseToken,
        workspaceId,
        schemaVersion: "brand.extraction.output.v3",
        provider: "firecrawl",
        universal: {
          sourceGuide: "docs/V0/Features/Firecrawl/brand-crawl-universal.md",
          profile: {
            copy_messaging: {
              brand_name: "Aster Heights",
              hero_h1: "Premium homes near the metro",
              cta_buttons: ["Book a site visit"]
            },
            visual_identity: {
              colors: { primary: "#173B57" },
              typography: { heading_font: "Manrope" },
              logo_url: "https://aster.example.com/logo.svg"
            },
            social_proof: {
              trust_badges: ["RERA registered"]
            },
            brand_personality: {
              tone_signals: ["calm", "premium"],
              vocabulary_signature: ["metro-connected"]
            },
            metadata: {
              schema_org_type: "SoftwareApplication",
              vertical_signals: ["dashboard", "integrations"]
            },
            raw_pages: {
              homepage_markdown: "Aster Heights offers premium homes. Book a site visit."
            }
          }
        },
        vertical: {
          sourceGuide: "docs/V0/Features/Firecrawl/brand-crawl-verticals.md",
          selectedBrandType: "real_estate",
          detectedBrandType: "b2b_saas",
          conflict: true,
          assets: {
            detected_vertical: "G8",
            vertical_label: "RealEstate",
            products_or_services: ["Aster Heights Phase 1"],
            visual_assets: {
              product_images: ["https://aster.example.com/project.jpg"],
              lifestyle_images: [],
              facility_images: [],
              team_images: [],
              before_after_pairs: [],
              screenshots: []
            },
            copy_assets: {
              pricing_summary: "From INR 90 lakh",
              compliance_disclaimers: ["RERA registration available"]
            },
            raw_vertical_data: {
              listing_names: ["Aster Heights Phase 1"],
              rera_numbers: ["RERA-KA-123"],
              amenities: ["clubhouse", "parking"],
              price_range: "From INR 90 lakh"
            }
          }
        },
        pages: [
          {
            url: "https://aster.example.com/",
            title: "Aster Heights",
            text: "Aster Heights offers premium homes. Book a site visit. RERA-KA-123. From INR 90 lakh.",
            branding: {
              colors: { primary: "#173B57" },
              typography: { fontFamilies: { heading: "Manrope" } },
              personality: { tone: "premium", targetAudience: "home buyers" },
              images: { logo: "https://aster.example.com/logo.svg" }
            }
          }
        ],
        assets: [
          {
            type: "screenshot",
            locator: "homepage above fold",
            rightsBasis: "public website crawl evidence",
            permittedUse: "candidate review"
          }
        ],
        creditUsage: { estimatedCredits: 64, observedCredits: 59 },
        rawProviderPayload: { apiKey: "fc-should-not-leak", crawlId: "provider-secret-id" }
      });

      assert.equal(completed.status, 200, JSON.stringify(completed.body));
      const detail = await client.getBrandCrawlRun(crawl.body.crawlRun.id);
      const candidateResponse = await client.listBrandCandidates(crawl.body.crawlRun.id);
      const assetPack = await client.getBrandAssetPack(crawl.body.crawlRun.id);
      const fieldTypes = candidateResponse.body.candidates.map((candidate) => candidate.fieldType);

      assert.equal(detail.body.crawlRun.extractionSchemaVersion, "brand.extraction.output.v3");
      assert.equal(detail.body.crawlRun.selectedBrandType, "real_estate");
      assert.equal(detail.body.crawlRun.detectedBrandType, "b2b_saas");
      assert.equal(detail.body.crawlRun.providerCreditTelemetry.observedCredits, 59);
      assert.equal(fieldTypes.includes("vertical_conflict"), true);
      assert.equal(fieldTypes.includes("product_service"), true);
      assert.equal(fieldTypes.includes("claim"), true);
      assert.equal(fieldTypes.includes("rights_asset"), true);
      assert.equal(assetPack.body.assetPack.vertical.length >= 3, true);
      assert.equal(/fc-should-not-leak|provider-secret-id|rawProviderPayload|signed_url|objectKey/i.test(JSON.stringify({ detail: detail.body, candidateResponse: candidateResponse.body, assetPack: assetPack.body })), false);
    }
  );
});

function scrapeFixture() {
  return {
    pages: [
      {
        url: "https://aster.example.com/",
        title: "Aster Heights",
        text: "Aster Heights offers practical Bengaluru homes. Book a site visit. RERA details available.",
        branding: {
          colors: { primary: "#173B57" },
          typography: { fontFamilies: { heading: "Manrope" } },
          personality: { tone: "professional", targetAudience: "families" },
          images: { logo: "https://aster.example.com/logo.svg" }
        }
      }
    ]
  };
}

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
