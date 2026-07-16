import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("brand-extract frontend maps every Firecrawl v3 backend candidate group", async () => {
  const adapter = await readFile("apps/web/app/brand-extract/_components/candidate-adapter.ts", "utf8");
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");

  for (const fieldType of [
    "identity",
    "visual_identity",
    "copy_messaging",
    "social_proof",
    "voice",
    "audience",
    "publishing_social",
    "product_service",
    "claim",
    "rights_asset",
    "metadata",
    "vertical_conflict"
  ]) {
    assert.match(adapter, new RegExp(`["']${fieldType}["']`), `${fieldType} must be explicitly mapped`);
  }

  for (const section of [
    "identity",
    "visual",
    "copy",
    "voice",
    "proof",
    "products",
    "offers",
    "compliance",
    "audiences",
    "social",
    "metadata"
  ]) {
    assert.match(adapter, new RegExp(`["']${section}["']`), `${section} must be a dossier section`);
  }

  assert.match(studio, /adaptBrandCrawlRunResponse/);
  assert.match(studio, /buildApprovalDraftFromCandidates/);
  assert.match(studio, /providerCreditTelemetry/);
});

test("brand-extract frontend is wired to the real V0 API instead of local dummy crawl data", async () => {
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");
  const app = await readFile("apps/web/app/brand-extract/_components/BrandExtractApp.tsx", "utf8");
  const nextConfig = await readFile("apps/web/next.config.mjs", "utf8");

  assert.doesNotMatch(studio, /simulateLocalCrawl/);
  assert.doesNotMatch(studio, /crawl_local_99/);
  assert.doesNotMatch(studio, /Math\.random\(\)\.toString\(36\)/);
  assert.doesNotMatch(studio, /setTimeout\(\(\) =>/);
  assert.doesNotMatch(app, /BRANDS\[0\]/);

  assert.match(studio, /createGeneratedWorkflowClient/);
  assert.match(studio, /workspaceId/);
  assert.match(studio, /authToken/);
  assert.match(studio, /idempotencyKey/);
  assert.match(nextConfig, /rewrites\(\)/);
  assert.match(nextConfig, /V0_API_BASE_URL/);
});

test("brand-extract frontend exposes required crawl controls and validation", async () => {
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");

  assert.match(studio, /INDUSTRY_OPTIONS/);
  assert.match(studio, /<select[\s\S]*onboardingForm\.industry/);
  assert.match(studio, /Brand name is required/);
  assert.match(studio, /\/all/);
  assert.match(studio, /normalizePathPrefix/);
  assert.match(studio, /type="file"/);
  assert.match(studio, /initiateBrandAssetUpload/);
  assert.match(studio, /completeBrandAssetUpload/);
  assert.match(studio, /body:\s*file/);
  assert.match(studio, /listBrandAssets/);
  assert.match(studio, /sha256File/);
});

test("brand-extract frontend maps visible industry labels to backend brandType enum values", async () => {
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");

  assert.match(studio, /BACKEND_BRAND_TYPE_BY_LABEL/);
  assert.match(studio, /Real Estate['"]:\s*['"]real_estate/);
  assert.match(studio, /D2C \/ Ecommerce['"]:\s*['"]d2c_ecommerce/);
  assert.match(studio, /brandType:\s*toBackendBrandType\(setupForm\.brandType\)/);
});

test("brand-extract adapter renders harvested logos, keeps approved USPs and reads the grouped asset pack (F1a/F2a/F1c)", async () => {
  const adapter = await readFile("apps/web/app/brand-extract/_components/candidate-adapter.ts", "utf8");
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");

  // F1a: assetsFromCandidate handles a `logo` candidate (the only asset the demo crawl produces).
  assert.match(adapter, /candidate\.fieldType === ["']logo["']/, "adapter must have a logo branch in assetsFromCandidate");
  // F2a: buildApprovalDraftFromCandidates has a usp branch that writes differentiators.
  assert.match(adapter, /candidate\.fieldType === ["']usp["']/, "adapter must keep approved USPs");
  assert.match(adapter, /positioning\.differentiators/, "approved USPs must populate differentiators");
  // F1c: the studio calls the dedicated grouped asset-pack endpoint, not only getBrandCrawlRun.
  assert.match(studio, /getBrandAssetPack/, "studio must fetch the grouped asset pack on crawl completion");
});

test("brand-extract studio is honest about an unconfigured crawl provider instead of implying a depth lever (F3a/F3b)", async () => {
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");

  // F3b: the misleading "run depth crawls" lever copy is removed from the empty asset-pack state.
  assert.doesNotMatch(studio, /run depth crawls/, "do not imply crawl depth is the lever for an empty asset pack");
  // F3b: the empty state honestly points to the crawl provider or direct uploads.
  assert.match(studio, /crawl provider|direct upload/i, "empty asset-pack state must state the real cause");
  // F3a: the studio reads the backend crawlProvider status to warn when no provider is configured.
  assert.match(studio, /crawlProvider/i, "studio must surface the crawl provider configuration status");
});

test("brand-extract generated client binds browser fetch before passing it to V0Client", async () => {
  const actions = await readFile("apps/web/src/workflow/v0-actions.ts", "utf8");

  assert.match(actions, /globalThis\.fetch\.bind\(globalThis\)/);
  assert.match(actions, /fetchImpl:\s*boundFetchImpl/);
});

test("brand-extract candidate decisions remain pending until the generated client confirms them", async () => {
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");

  assert.match(studio, /client\.updateBrandCandidateDecision\(crawlRunId, candidateId, \{ status \}\)/);
  assert.doesNotMatch(studio, /Optimistically update/);
  assert.match(studio, /setCandidateMutation\(\{ candidateId, state: ['"]saving['"] \}\)/);
  assert.match(studio, /['"]stale-session['"]/);
  assert.match(studio, /This review session is no longer current\. Reload the crawl before changing decisions\./);
  assert.match(studio, /startPollingCrawl\(crawlRunId\)/);
});

test("brand-extract approval uses canonical server truth and does not invent a cryptographic hash", async () => {
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");

  assert.match(studio, /client\.approveBrandProfile/);
  assert.match(studio, /response\.status !== 201/);
  assert.doesNotMatch(studio, /approvalHash/);
  assert.doesNotMatch(studio, /cryptographically bound/i);
  assert.match(studio, /body\.approval\.id/);
});

test("brand-extract studio is an explicit interactive client component", async () => {
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");

  assert.match(studio, /^["']use client["'];/);
  assert.match(studio, /onClick=\{handleSaveOnboarding\}/);
});

test("brand-extract frontend auto-provisions a local backend demo session for testing", async () => {
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");
  const devScript = await readFile("scripts/dev.mjs", "utf8");
  const route = await readFile("apps/web/app/api/brand-extract/demo-session/route.ts", "utf8");

  assert.match(devScript, /SUPABASE_JWT_SECRET/);
  assert.match(route, /randomUUID/);
  assert.match(route, /createWorkspace/);
  assert.match(route, /local-dev-supabase-jwt-secret/);
  assert.match(studio, /\/api\/brand-extract\/demo-session/);
  assert.match(studio, /setApiContext/);
  assert.match(studio, /ensureDemoSession/);
  assert.match(studio, /await ensureDemoSession\(\)/);
});

test("brand-extract local demo mode completes crawl jobs through backend internal worker APIs", async () => {
  const studio = await readFile("apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx", "utf8");
  const devScript = await readFile("scripts/dev.mjs", "utf8");
  const route = await readFile("apps/web/app/api/brand-extract/demo-complete-crawl/route.ts", "utf8");

  assert.match(devScript, /V0_INTERNAL_WORKER_TOKEN/);
  assert.match(route, /internal\/jobs/);
  assert.match(route, /claim/);
  assert.match(route, /complete/);
  assert.match(route, /brand\.extraction\.output\.v1/);
  assert.match(studio, /\/api\/brand-extract\/demo-complete-crawl/);
  assert.match(studio, /source === 'local-demo'/);
});
