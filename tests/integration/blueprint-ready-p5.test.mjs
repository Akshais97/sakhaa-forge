import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("P5 extracted and default paths produce the same immutable script input contract", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p5-manager") });
      const extractedInput = await prepareExtractedBlueprintInput(client);
      const defaultInput = await prepareDefaultBlueprintInput(client);

      const extracted = await client.createReadyBlueprint(extractedInput.blueprintRequestId, {
        workspaceId: extractedInput.workspaceId,
        sourceType: "extracted_blueprint",
        videoBlueprintId: extractedInput.videoBlueprintId
      });
      const defaultReady = await client.createReadyBlueprint(defaultInput.blueprintRequestId, {
        workspaceId: defaultInput.workspaceId,
        sourceType: "default_formula"
      });

      for (const response of [extracted, defaultReady]) {
        assert.equal(response.status, 202, JSON.stringify(response.body));
        assert.equal(response.body.scriptInputContract.schemaVersion, "v0.script-input.1");
        assert.equal(response.body.scriptInputContract.brandProfileId, response.body.readyBlueprint.brandProfileId);
        assert.equal(response.body.scriptInputContract.brandProfileVersion, response.body.readyBlueprint.brandProfileVersion);
        assert.equal(response.body.readyBlueprint.status, "ready");
        assert.equal(response.body.formula.status, "formula_done");
        assert.equal(response.body.directorPrompt.status, "director_prompt_done");
        assert.match(response.body.formula.id, /^[0-9a-f-]{36}$/);
        assert.match(response.body.directorPrompt.id, /^[0-9a-f-]{36}$/);
        assert.ok(response.body.formula.slots.length >= 4);
        assert.ok(response.body.directorPrompt.replacementSlots.includes("brand_public_name"));
        assert.deepEqual(response.body.jobs.map((job) => job.type), [
          "blueprint_merge",
          "formula_derive",
          "director_prompt_generate"
        ]);
        assert.ok(response.body.jobs.every((job) => job.status === "SUCCEEDED"));
        assert.equal(response.body.audit.eventType, "blueprint.ready.created");
      }
      assert.deepEqual(
        Object.keys(extracted.body.scriptInputContract).sort(),
        Object.keys(defaultReady.body.scriptInputContract).sort()
      );
      assert.notEqual(extracted.body.readyBlueprint.id, defaultReady.body.readyBlueprint.id);

      const duplicate = await client.createReadyBlueprint(extractedInput.blueprintRequestId, {
        workspaceId: extractedInput.workspaceId,
        sourceType: "extracted_blueprint",
        videoBlueprintId: extractedInput.videoBlueprintId
      });
      assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
      assert.equal(duplicate.body.code, "RESOURCE_VERSION_STALE");
    }
  );
});

test("P5 rejects incomplete stages and invalid formula slots", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p5-blocked") });
      const incomplete = await prepareExtractedBlueprintInput(client, "empty_transcript");
      const invalidSlot = await prepareExtractedBlueprintInput(client);

      const incompleteReady = await client.createReadyBlueprint(incomplete.blueprintRequestId, {
        workspaceId: incomplete.workspaceId,
        sourceType: "extracted_blueprint",
        videoBlueprintId: incomplete.videoBlueprintId
      });
      assert.equal(incompleteReady.status, 409, JSON.stringify(incompleteReady.body));
      assert.equal(incompleteReady.body.code, "BLUEPRINT_STAGE_INCOMPLETE");

      const invalidReady = await client.createReadyBlueprint(invalidSlot.blueprintRequestId, {
        workspaceId: invalidSlot.workspaceId,
        sourceType: "extracted_blueprint",
        videoBlueprintId: invalidSlot.videoBlueprintId,
        overrideFormulaSlots: ["hook", "unsupported_slot"]
      });
      assert.equal(invalidReady.status, 422, JSON.stringify(invalidReady.body));
      assert.equal(invalidReady.body.code, "BLUEPRINT_FORMULA_INVALID");
    }
  );
});

async function prepareDefaultBlueprintInput(client) {
  const approved = await prepareApprovedBrand(client, "P5 default");
  const request = await client.createBlueprintRequest({
    workspaceId: approved.workspaceId,
    brandProfileId: approved.brandProfileId,
    brandProfileVersion: approved.brandProfileVersion,
    path: "default_formula",
    objectiveType: "site_visit",
    objective: "Create a site-visit short for Aster Heights."
  });
  assert.equal(request.status, 202, JSON.stringify(request.body));
  return { ...approved, blueprintRequestId: request.body.request.id };
}

async function prepareExtractedBlueprintInput(client, simulatorMode = "fixture_success") {
  const approved = await prepareApprovedBrand(client, `P5 ${simulatorMode}`);
  const request = await client.createBlueprintRequest({
    workspaceId: approved.workspaceId,
    brandProfileId: approved.brandProfileId,
    brandProfileVersion: approved.brandProfileVersion,
    path: "new_discovery",
    objectiveType: "site_visit",
    objective: "Create a site-visit short for Aster Heights."
  });
  assert.equal(request.status, 202, JSON.stringify(request.body));
  const search = await client.searchViralCandidates({
    workspaceId: approved.workspaceId,
    blueprintRequestId: request.body.request.id,
    niche: "Bengaluru real-estate site visit",
    market: "Bengaluru",
    objectiveType: "site_visit",
    providerMode: "fixture_success",
    limit: 1
  });
  assert.equal(search.status, 202, JSON.stringify(search.body));
  const candidate = search.body.candidates[0];
  const extracted = await client.extractViralCandidateBlueprint(candidate.id, {
    workspaceId: approved.workspaceId,
    rightsDecision: {
      rightsBasis: "platform-terms-review-and-internal-analysis",
      permittedUse: "internal_structural_analysis",
      sourceOwner: "Aster source account",
      retainedCopyAllowed: true,
      reviewedAt: "2026-06-24T09:00:00.000Z"
    },
    retrievalPolicy: "retained_analysis_copy",
    acquisitionMode: "fixture_authorized",
    expectedSourceHash: candidate.sourceHash
  });
  assert.equal(extracted.status, 202, JSON.stringify(extracted.body));
  const scene = await client.createSceneBlueprint(candidate.id, {
    workspaceId: approved.workspaceId,
    mediaAcquisitionId: extracted.body.acquisition.id,
    thumbnailBlueprintId: extracted.body.thumbnailBlueprint.id,
    expectedSourceHash: candidate.sourceHash,
    simulatorMode
  });
  assert.equal(scene.status, simulatorMode === "fixture_success" ? 202 : 409, JSON.stringify(scene.body));
  return {
    ...approved,
    blueprintRequestId: request.body.request.id,
    videoBlueprintId: scene.body.videoBlueprint.id
  };
}

async function prepareApprovedBrand(client, label) {
  const created = await client.createWorkspace(
    { name: `${label} ${randomUUID().slice(0, 8)}` },
    { idempotencyKey: `p5-workspace-${randomUUID()}` }
  );
  const workspaceId = created.body.workspace.id;
  const crawl = await client.createBrandCrawlRun(
    {
      workspaceId,
      websiteUrl: "https://aster.example.com/projects/",
      rightsAcknowledged: true,
      crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
    },
    { idempotencyKey: `p5-crawl-${randomUUID()}` }
  );
  const approved = await client.approveBrandProfile(randomUUID(), approvalPayload(workspaceId, crawl.body.crawlRun.id, 0));
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
  return {
    workspaceId,
    brandProfileId: approved.body.profile.id,
    brandProfileVersion: approved.body.profile.version
  };
}

function approvalPayload(workspaceId, crawlRunId, optimisticVersion) {
  return {
    workspaceId,
    crawlRunId,
    decision: "approve",
    optimisticVersion,
    profile: {
      publicName: "Aster Heights",
      industry: "real_estate",
      markets: ["Bengaluru"],
      positioningStatement: "Premium, practical homes for urban professionals and families.",
      products: [{ name: "Aster Heights", category: "residential_project", status: "active" }],
      audiences: [{ name: "Urban professionals and families", geography: ["Bengaluru"] }],
      callsToAction: [{ label: "Book a site visit", actionType: "lead_form" }],
      voice: {
        attributes: ["calm", "premium", "direct", "informative"],
        avoid: ["hype", "guaranteed return", "pressure selling"],
        formality: "balanced",
        languages: ["en-IN"]
      },
      rightsAttestation: true
    },
    rules: [
      { type: "prohibited_claim", value: "Guaranteed appreciation", severity: "critical", rationale: "Unsupported real-estate performance claim." }
    ]
  };
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
