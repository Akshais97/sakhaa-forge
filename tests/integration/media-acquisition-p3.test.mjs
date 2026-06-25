import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("P3 extracts authorised media into retained artifact and thumbnail blueprint", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p3-manager") });
      const prepared = await prepareCandidate(client);

      const extracted = await client.extractViralCandidateBlueprint(prepared.candidateId, {
        workspaceId: prepared.workspaceId,
        rightsDecision: {
          rightsBasis: "platform-terms-review-and-internal-analysis",
          permittedUse: "internal_structural_analysis",
          sourceOwner: "Aster source account",
          retainedCopyAllowed: true,
          reviewedAt: "2026-06-24T09:00:00.000Z"
        },
        retrievalPolicy: "retained_analysis_copy",
        acquisitionMode: "fixture_authorized",
        expectedSourceHash: prepared.sourceHash
      });

      assert.equal(extracted.status, 202, JSON.stringify(extracted.body));
      assert.equal(extracted.body.acquisition.status, "media_acquired");
      assert.equal(extracted.body.acquisition.rightsDecision.retainedCopyAllowed, true);
      assert.equal(extracted.body.acquisition.sourceHash, prepared.sourceHash);
      assert.match(extracted.body.analysisArtifact.sha256, /^[a-f0-9]{64}$/);
      assert.equal(extracted.body.analysisArtifact.status, "CLEAN");
      assert.equal(extracted.body.thumbnailBlueprint.status, "thumbnail_deciphered");
      assert.equal(extracted.body.thumbnailBlueprint.ocr.confidence, 0.91);
      assert.ok(extracted.body.thumbnailBlueprint.directorGuidance.replacements.length > 0);
      assert.equal(extracted.body.job.type, "media_acquire");
      assert.equal(extracted.body.audit.eventType, "media.acquisition.completed");
    }
  );
});

test("P3 blocks unavailable rights, hash mismatch and low-confidence OCR", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p3-blocked") });
      const prepared = await prepareCandidate(client);

      const rightsBlocked = await client.extractViralCandidateBlueprint(prepared.candidateId, {
        workspaceId: prepared.workspaceId,
        rightsDecision: {
          rightsBasis: "public-link-review-only",
          permittedUse: "reference_only",
          sourceOwner: "Unknown",
          retainedCopyAllowed: false,
          reviewedAt: "2026-06-24T09:00:00.000Z"
        },
        retrievalPolicy: "retained_analysis_copy",
        acquisitionMode: "fixture_authorized",
        expectedSourceHash: prepared.sourceHash
      });
      assert.equal(rightsBlocked.status, 409, JSON.stringify(rightsBlocked.body));
      assert.equal(rightsBlocked.body.code, "MEDIA_ACQUISITION_BLOCKED");
      assert.equal(rightsBlocked.body.acquisition.status, "blocked");
      assert.equal(rightsBlocked.body.thumbnailBlueprint, null);

      const hashMismatch = await client.extractViralCandidateBlueprint(prepared.candidateId, {
        workspaceId: prepared.workspaceId,
        rightsDecision: {
          rightsBasis: "platform-terms-review-and-internal-analysis",
          permittedUse: "internal_structural_analysis",
          sourceOwner: "Aster source account",
          retainedCopyAllowed: true,
          reviewedAt: "2026-06-24T09:00:00.000Z"
        },
        retrievalPolicy: "retained_analysis_copy",
        acquisitionMode: "hash_mismatch",
        expectedSourceHash: prepared.sourceHash
      });
      assert.equal(hashMismatch.status, 409, JSON.stringify(hashMismatch.body));
      assert.equal(hashMismatch.body.code, "ARTIFACT_HASH_MISMATCH");

      const lowConfidence = await client.extractViralCandidateBlueprint(prepared.candidateId, {
        workspaceId: prepared.workspaceId,
        rightsDecision: {
          rightsBasis: "platform-terms-review-and-internal-analysis",
          permittedUse: "internal_structural_analysis",
          sourceOwner: "Aster source account",
          retainedCopyAllowed: true,
          reviewedAt: "2026-06-24T09:00:00.000Z"
        },
        retrievalPolicy: "retained_analysis_copy",
        acquisitionMode: "low_confidence_ocr",
        expectedSourceHash: prepared.sourceHash
      });
      assert.equal(lowConfidence.status, 409, JSON.stringify(lowConfidence.body));
      assert.equal(lowConfidence.body.code, "BLUEPRINT_STAGE_INCOMPLETE");
      assert.equal(lowConfidence.body.thumbnailBlueprint.status, "blocked");
      assert.equal(lowConfidence.body.thumbnailBlueprint.ocr.confidence < 0.7, true);
    }
  );
});

async function prepareCandidate(client) {
  const created = await client.createWorkspace(
    { name: `P3 ${randomUUID().slice(0, 8)}` },
    { idempotencyKey: `p3-workspace-${randomUUID()}` }
  );
  const workspaceId = created.body.workspace.id;
  const crawl = await client.createBrandCrawlRun(
    {
      workspaceId,
      websiteUrl: "https://aster.example.com/projects/",
      rightsAcknowledged: true,
      crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
    },
    { idempotencyKey: `p3-crawl-${randomUUID()}` }
  );
  const approved = await client.approveBrandProfile(randomUUID(), approvalPayload(workspaceId, crawl.body.crawlRun.id, 0));
  const request = await client.createBlueprintRequest({
    workspaceId,
    brandProfileId: approved.body.profile.id,
    brandProfileVersion: approved.body.profile.version,
    path: "new_discovery",
    objectiveType: "site_visit",
    objective: "Create a site-visit short for Aster Heights."
  });
  const search = await client.searchViralCandidates({
    workspaceId,
    blueprintRequestId: request.body.request.id,
    niche: "Bengaluru real-estate site visit",
    market: "Bengaluru",
    objectiveType: "site_visit",
    providerMode: "fixture_success",
    limit: 1
  });
  assert.equal(search.status, 202, JSON.stringify(search.body));
  return {
    workspaceId,
    candidateId: search.body.candidates[0].id,
    sourceHash: search.body.candidates[0].sourceHash
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
