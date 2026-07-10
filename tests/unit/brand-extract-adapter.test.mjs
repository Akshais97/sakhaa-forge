import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptBrandCrawlRunResponse,
  buildApprovalDraftFromCandidates
} from "../../apps/web/app/brand-extract/_components/candidate-adapter.ts";

// These tests exercise the brand-extract frontend adapter at runtime. The adapter module is
// TypeScript but contains only type annotations (no value imports), so Node's built-in type
// stripping loads it directly. They verify the three wiring fixes that the source-text contract
// tests in brand-extract-frontend-contract.test.mjs only lock as text.

// T1a (F1a) — a harvested `logo` candidate is the only asset candidate the demo crawl path
// produces. assetsFromCandidate must render it into the asset pack instead of dropping it.
test("brand-extract adapter renders a harvested logo candidate into the asset pack (F1a)", () => {
  const logoCandidate = {
    fieldType: "logo",
    value: { src: "https://aster.example.com/logo.svg", alt: "Aster Heights logo" },
    confidence: 0.7,
    sourceEvidence: [
      { sourceType: "website", locator: "https://aster.example.com/", excerpt: "https://aster.example.com/logo.svg" }
    ]
  };
  const adapted = adaptBrandCrawlRunResponse({
    crawlRun: { id: "run-logo", status: "SUCCEEDED", extractionSchemaVersion: "brand.extraction.output.v1" },
    candidates: [logoCandidate]
  });

  assert.equal(adapted.assetPack.length > 0, true, "logo candidate must produce an asset, not be dropped");
  const logo = adapted.assetPack.find((asset) => asset.locator === "https://aster.example.com/logo.svg");
  assert.ok(logo, "logo asset must keep the harvested locator");
  assert.equal(logo.category, "Logo");
  assert.equal(logo.name, "Aster Heights logo");
  assert.equal(logo.rightsBasis.length > 0, true);
  assert.equal(logo.permittedUse.length > 0, true);
});

// T1c (F1c) — when the backend grouped asset pack is supplied, the adapter merges it with
// candidate-derived assets instead of ignoring it.
test("brand-extract adapter merges the backend grouped asset pack with candidate assets (F1c)", () => {
  const logoCandidate = {
    fieldType: "logo",
    value: { src: "https://aster.example.com/logo.svg", alt: "Aster Heights logo" },
    confidence: 0.7,
    sourceEvidence: [
      { sourceType: "website", locator: "https://aster.example.com/", excerpt: "logo" }
    ]
  };
  const groupedAssetPack = {
    mediaInventory: [
      {
        fieldType: "visual_identity",
        value: { logoUrl: "https://aster.example.com/logo.svg", faviconUrl: "https://aster.example.com/favicon.ico" },
        confidence: 0.8,
        sourceEvidence: [{ sourceType: "website", locator: "https://aster.example.com/", excerpt: "visual identity" }]
      }
    ]
  };
  const adapted = adaptBrandCrawlRunResponse({
    crawlRun: { id: "run-merge", status: "SUCCEEDED", extractionSchemaVersion: "brand.extraction.output.v1" },
    candidates: [logoCandidate],
    assetPack: groupedAssetPack
  });

  const locators = adapted.assetPack.map((asset) => asset.locator).sort();
  assert.equal(locators.includes("https://aster.example.com/logo.svg"), true, "candidate-derived logo must survive the merge");
  assert.equal(locators.includes("https://aster.example.com/favicon.ico"), true, "grouped visual_identity asset must be merged in");
});

// T1b (F1b) — uploaded brand assets are returned by getBrandCrawlRun as brandAssets. The
// adapter must render them directly instead of waiting for a crawler-produced candidate.
test("brand-extract adapter renders uploaded brandAssets returned by the crawl detail (F1b)", () => {
  const adapted = adaptBrandCrawlRunResponse({
    crawlRun: { id: "run-upload", status: "SUCCEEDED", extractionSchemaVersion: "brand.extraction.output.v1" },
    brandAssets: [
      {
        id: "asset-uploaded-logo",
        artifactId: "artifact-logo",
        name: "Uploaded logo.png",
        category: "Uploaded brand asset",
        locator: "artifact:artifact-logo",
        rightsBasis: "Client approved upload",
        permittedUse: "Candidate review",
        status: "ACTIVE"
      }
    ]
  });

  assert.equal(adapted.assetPack.length, 1, "uploaded brandAssets must be visible in the asset pack");
  assert.deepEqual(adapted.assetPack[0], {
    id: "asset-uploaded-logo",
    category: "Uploaded brand asset",
    locator: "artifact:artifact-logo",
    rightsBasis: "Client approved upload",
    permittedUse: "Candidate review",
    name: "Uploaded logo.png",
    status: "ACTIVE"
  });
});

// T2 (F2a) — an approved USP candidate must populate positioning.differentiators in the
// approval draft instead of being silently discarded.
test("brand-extract adapter keeps approved USPs in positioning.differentiators (F2a)", () => {
  const uspCandidate = {
    fieldType: "usp",
    value: "Handmade in small batches",
    confidence: 0.84,
    decision: "approved",
    sourceEvidence: [
      { sourceType: "website", locator: "https://craft.example.com/", excerpt: "Handmade in small batches" }
    ]
  };
  const adapted = adaptBrandCrawlRunResponse({
    crawlRun: { id: "run-usp", status: "SUCCEEDED", extractionSchemaVersion: "brand.extraction.output.v1" },
    candidates: [uspCandidate]
  });
  // The approval builder only consumes candidates whose status is "approved".
  const approvedCandidates = adapted.candidates.map((candidate) => ({ ...candidate, status: "approved" }));
  const draft = buildApprovalDraftFromCandidates(approvedCandidates, baseApprovalDraft(), {
    selectedBrandType: "d2c_ecommerce",
    detectedBrandType: "d2c_ecommerce",
    extractionSchemaVersion: "brand.extraction.output.v1",
    crawlRunId: "run-usp"
  });

  assert.equal(
    draft.positioning.differentiators.includes("Handmade in small batches"),
    true,
    "approved USP must not be silently dropped from the approval draft"
  );
});

function baseApprovalDraft() {
  return {
    name: { public: "", legal: "" },
    industry: "",
    markets: [],
    positioning: { statement: "", differentiators: [], proof_points: [] },
    competitors: [],
    visual_identity: {
      logos: [],
      colors: [],
      fonts: { primary: "Inter", heading: "Space Grotesk", code: "JetBrains Mono" },
      imagery_rules: "",
      layout_rules: ""
    },
    voice: {
      attributes: [],
      avoid_list: [],
      formality: "balanced",
      languages: [],
      approved_examples: [],
      pronunciations: ""
    },
    products: [],
    audiences: [],
    offers: [],
    calls_to_action: [],
    claims: [],
    rules: { required_phrases: [], prohibited_phrases: [], required_disclosures: [] },
    source_summary: {
      selected_brand_type: "",
      detected_brand_type: "",
      conflict_flag: false,
      extraction_schema_version: "",
      crawl_run_ref: ""
    },
    rightsAttestationChecked: false,
    reviewerSignature: "",
    version: "1.0.0"
  };
}
