import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("P4 creates independent scene blueprint stages with artifacts and resource isolation", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p4-manager") });
      const prepared = await prepareSceneInput(client);

      const sceneBlueprint = await client.createSceneBlueprint(prepared.candidateId, {
        workspaceId: prepared.workspaceId,
        mediaAcquisitionId: prepared.mediaAcquisitionId,
        thumbnailBlueprintId: prepared.thumbnailBlueprintId,
        expectedSourceHash: prepared.sourceHash,
        simulatorMode: "fixture_success"
      });

      assert.equal(sceneBlueprint.status, 202, JSON.stringify(sceneBlueprint.body));
      assert.equal(sceneBlueprint.body.videoBlueprint.status, "ocr_done");
      assert.equal(sceneBlueprint.body.videoBlueprint.sourceHash, prepared.sourceHash);
      assert.equal(sceneBlueprint.body.stageJobs.length, 5);
      assert.deepEqual(sceneBlueprint.body.stageJobs.map((job) => job.type), [
        "scene_detect",
        "transcribe",
        "keyframe_extract",
        "vision_analyze",
        "ocr_extract"
      ]);
      assert.equal(sceneBlueprint.body.stageJobs.find((job) => job.type === "vision_analyze").resourceClass, "GPU");
      assert.equal(sceneBlueprint.body.stageJobs.find((job) => job.type === "ocr_extract").resourceClass, "CPU");
      assert.deepEqual(sceneBlueprint.body.dependencies.map((edge) => edge.childType), [
        "transcribe",
        "keyframe_extract",
        "vision_analyze",
        "ocr_extract"
      ]);
      assert.equal(sceneBlueprint.body.stageArtifacts.length, 5);
      assert.ok(sceneBlueprint.body.stageArtifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256)));
      assert.ok(sceneBlueprint.body.stageArtifacts.some((artifact) => artifact.schemaVersion === "v0.scene-detect.stage.1"));
      assert.equal(sceneBlueprint.body.scenes.length, 2);
      assert.equal(sceneBlueprint.body.scenes[0].transcript.text, "Start with the site entrance and commute proof.");
      assert.equal(sceneBlueprint.body.scenes[0].shot.type, "wide_site_establishing");
      assert.equal(sceneBlueprint.body.scenes[0].motion.camera, "slow_push_in");
      assert.equal(sceneBlueprint.body.scenes[0].onScreenText[0].text, "2 min to metro");
      assert.ok(sceneBlueprint.body.scenes[0].replacements.length > 0);
    }
  );
});

test("P4 blocks incomplete or malformed stages instead of reporting a complete blueprint", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p4-blocked") });
      const prepared = await prepareSceneInput(client);

      const emptyTranscript = await client.createSceneBlueprint(prepared.candidateId, {
        workspaceId: prepared.workspaceId,
        mediaAcquisitionId: prepared.mediaAcquisitionId,
        thumbnailBlueprintId: prepared.thumbnailBlueprintId,
        expectedSourceHash: prepared.sourceHash,
        simulatorMode: "empty_transcript"
      });
      assert.equal(emptyTranscript.status, 409, JSON.stringify(emptyTranscript.body));
      assert.equal(emptyTranscript.body.code, "BLUEPRINT_STAGE_INCOMPLETE");
      assert.equal(emptyTranscript.body.videoBlueprint.status, "blocked");
      assert.equal(emptyTranscript.body.stageStates.transcribe.status, "blocked");
      assert.notEqual(emptyTranscript.body.videoBlueprint.status, "ocr_done");

      const malformedVision = await client.createSceneBlueprint(prepared.candidateId, {
        workspaceId: prepared.workspaceId,
        mediaAcquisitionId: prepared.mediaAcquisitionId,
        thumbnailBlueprintId: prepared.thumbnailBlueprintId,
        expectedSourceHash: prepared.sourceHash,
        simulatorMode: "malformed_model_json"
      });
      assert.equal(malformedVision.status, 422, JSON.stringify(malformedVision.body));
      assert.equal(malformedVision.body.code, "AI_OUTPUT_SCHEMA_INVALID");
      assert.equal(malformedVision.body.stageStates.vision_analyze.status, "failed");

      const timeout = await client.createSceneBlueprint(prepared.candidateId, {
        workspaceId: prepared.workspaceId,
        mediaAcquisitionId: prepared.mediaAcquisitionId,
        thumbnailBlueprintId: prepared.thumbnailBlueprintId,
        expectedSourceHash: prepared.sourceHash,
        simulatorMode: "worker_timeout"
      });
      assert.equal(timeout.status, 422, JSON.stringify(timeout.body));
      assert.equal(timeout.body.code, "BLUEPRINT_STAGE_FAILED");
      assert.equal(timeout.body.stageStates.keyframe_extract.errorCode, "WORKER_TIMEOUT");

      const oom = await client.createSceneBlueprint(prepared.candidateId, {
        workspaceId: prepared.workspaceId,
        mediaAcquisitionId: prepared.mediaAcquisitionId,
        thumbnailBlueprintId: prepared.thumbnailBlueprintId,
        expectedSourceHash: prepared.sourceHash,
        simulatorMode: "worker_oom"
      });
      assert.equal(oom.status, 422, JSON.stringify(oom.body));
      assert.equal(oom.body.code, "BLUEPRINT_STAGE_FAILED");
      assert.equal(oom.body.stageStates.vision_analyze.errorCode, "WORKER_OOM");
    }
  );
});

async function prepareSceneInput(client) {
  const created = await client.createWorkspace(
    { name: `P4 ${randomUUID().slice(0, 8)}` },
    { idempotencyKey: `p4-workspace-${randomUUID()}` }
  );
  const workspaceId = created.body.workspace.id;
  const crawl = await client.createBrandCrawlRun(
    {
      workspaceId,
      websiteUrl: "https://aster.example.com/projects/",
      rightsAcknowledged: true,
      crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
    },
    { idempotencyKey: `p4-crawl-${randomUUID()}` }
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
  const candidate = search.body.candidates[0];
  const extracted = await client.extractViralCandidateBlueprint(candidate.id, {
    workspaceId,
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
  return {
    workspaceId,
    candidateId: candidate.id,
    sourceHash: candidate.sourceHash,
    mediaAcquisitionId: extracted.body.acquisition.id,
    thumbnailBlueprintId: extracted.body.thumbnailBlueprint.id
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
