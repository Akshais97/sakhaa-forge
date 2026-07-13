import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("Next app scaffolds canonical V0 public and workspace routes", async () => {
  const publicRoutes = [
    "apps/web/app/sign-in/page.tsx",
    "apps/web/app/app/signup/page.tsx",
    "apps/web/app/app/onboarding/page.tsx",
    "apps/web/app/app/profile/page.tsx",
    "apps/web/app/auth/callback/page.tsx",
    "apps/web/app/access-denied/page.tsx",
  ];

  for (const routeFile of publicRoutes) {
    const content = await readFile(routeFile, "utf8");
    assert.match(content, /Sakhaa Forge/);
  }

  const workspace = await readFile("apps/web/app/w/[workspaceSlug]/[...segments]/page.tsx", "utf8");
  const appModel = await readFile("apps/web/src/workflow/v0-workflow.ts", "utf8");
  const workspaceApp = await readFile("apps/web/src/components/ForgeWorkspaceApp.tsx", "utf8");

  for (const required of [
    "Submit brand sources",
    "Review extracted candidates",
    "Approve brand profile",
    "Discover viral candidate",
    "Run script tournament",
    "Track HeyGen generation",
    "Approve exact version",
    "Verify live post",
    "Lineage",
    "Unknown — checking",
    "Maximum authorisation",
    "Audience verification",
    "Provider acknowledgement is not final success",
    "WORKSPACE_SURFACES",
  ]) {
    assert.match(`${workspace}\n${appModel}\n${workspaceApp}`, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of [
    "guaranteed virality",
    "guaranteed reach",
    "predicts the winning video",
    "scientifically proven",
    "magic",
  ]) {
    assert.doesNotMatch(`${workspace}\n${appModel}\n${workspaceApp}`.toLowerCase(), new RegExp(forbidden));
  }
});

test("branding route authority lives under /app/branding and /branding redirects", async () => {
  const legacyBranding = await readFile("apps/web/app/branding/page.tsx", "utf8");
  const appBranding = await readFile("apps/web/app/app/branding/page.tsx", "utf8");
  const brandExtract = await readFile("apps/web/app/brand-extract/page.tsx", "utf8");
  const informationArchitecture = await readFile("docs/V0/V0_INFORMATION_ARCHITECTURE.md", "utf8");
  const screenInventory = await readFile("docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md", "utf8");

  assert.match(legacyBranding, /redirect\(["']\/app\/branding["']\)/);
  assert.doesNotMatch(legacyBranding, /BRANDS|BrandIntakeSection|setTimeout|fake timer/i);
  assert.match(appBranding, /\/app\/branding\?crawlRunId=<uuid>/);
  assert.match(appBranding, /Scan URL/);
  assert.match(appBranding, /Upload brand assets/);
  assert.match(appBranding, /Review candidates/);
  assert.match(appBranding, /Request missing assets/);
  assert.match(appBranding, /Approve this profile/);
  assert.match(appBranding, /getBrandCrawlRun/);
  assert.match(appBranding, /createBrandCrawlRun/);
  assert.match(appBranding, /getBrandAssetPack/);
  assert.match(appBranding, /approveBrandProfile/);
  assert.match(appBranding, /href="\/app\/profile"/);
  assert.doesNotMatch(appBranding, /setTimeout|fake timer|BRANDS/i);
  assert.doesNotMatch(appBranding, /href=["']https?:\/\//i);

  assert.match(brandExtract, /BrandExtractApp/);
  assert.match(brandExtract, /\/brand-extract/);
  assert.match(brandExtract, /Firecrawl/);
  assert.match(brandExtract, /BrandExtractionStudio/);
  assert.match(`${brandExtract}\n${appBranding}`, /createBrandCrawlRun/);
  assert.match(`${brandExtract}\n${appBranding}`, /getBrandCrawlRun/);
  assert.match(`${brandExtract}\n${appBranding}`, /getBrandAssetPack/);
  assert.match(`${brandExtract}\n${appBranding}`, /Universal candidate groups/);
  assert.match(`${brandExtract}\n${appBranding}`, /Selected\/detected brand-type conflict/);
  assert.doesNotMatch(brandExtract, /BrandAtelier/);
  assert.doesNotMatch(brandExtract, /href=["']https?:\/\//i);
  assert.match(informationArchitecture, /\/brand-extract/);
  assert.match(screenInventory, /\/brand-extract/);
});
