import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareApprovedBrand } from "../helpers/script-tournament-fixtures.mjs";
import {
  AE_RENDER_SCHEMA_VERSION,
  goldenRenderHash
} from "../../apps/api/src/ae-render-provider.mjs";
import {
  AE_PLAN_SCHEMA_VERSION,
  DEFAULT_AE_CAPABILITY_VERSION
} from "../../apps/api/src/ae-capability-registry.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";
const simulatorSecret = "test-payment-simulator-secret";
const heygenSecret = "test-heygen-simulator-secret";

const baseEnv = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken,
  V0_PAYMENT_SIMULATOR_SECRET: simulatorSecret,
  V0_HEYGEN_SIMULATOR_SECRET: heygenSecret
};

const SCRIPT_ID = "31000000-0000-4000-8000-000000000002";

// V0-C2 reproducible final branded render. A validated AE plan renders one retained 9:16
// final MP4, thumbnail and captions through the deterministic AE worker simulator. The
// render preserves the plan input hash and capability version, validates the worker output
// (codec, duration, resolution, output hash) and retains a versioned FinalVideo with an
// immutable revision lineage: a new revision supersedes the prior current video without
// overwriting it. A worker crash is recovered once; capability drift and incompatible
// worker output are classified and never produce a final video. Render is a costly mutation
// producing retained artifacts, so it requires an Idempotency-Key. Cross-workspace existence
// never leaks.

test("C2 renders a validated plan into a retained 9:16 final video, thumbnail and captions", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "success" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-success") });
    const { compositionPlanId } = await prepareValidatedPlan(client, "C2 success");

    const rendered = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId: workspaceIdOf(client) },
      { idempotencyKey: "render-c2-success-1" }
    );
    assert.equal(rendered.status, 202, JSON.stringify(rendered.body));
    assert.equal(rendered.body.attempt.status, "succeeded");
    assert.equal(rendered.body.attempt.compositionInstructionId, compositionPlanId);
    assert.ok(rendered.body.attempt.aePlanId);
    assert.equal(rendered.body.attempt.version, 1);
    assert.equal(rendered.body.attempt.outputHash, rendered.body.finalVideo.sha256);

    assert.equal(rendered.body.finalVideo.status, "current");
    assert.equal(rendered.body.finalVideo.version, 1);
    assert.equal(rendered.body.finalVideo.resolution, "1080x1920");
    assert.equal(rendered.body.finalVideo.codec, "h264");
    assert.equal(rendered.body.finalVideo.durationSeconds, 30);
    assert.equal(rendered.body.finalVideo.capabilityVersion, DEFAULT_AE_CAPABILITY_VERSION);
    assert.equal(rendered.body.finalVideo.schemaVersion, AE_RENDER_SCHEMA_VERSION);
    assert.match(rendered.body.finalVideo.sha256, /^[0-9a-f]{64}$/);
    assert.equal(rendered.body.finalVideo.sha256, rendered.body.artifacts.finalVideo.sha256);

    assert.equal(rendered.body.artifacts.finalVideo.status, "CLEAN");
    assert.equal(rendered.body.artifacts.finalVideo.contentType, "video/mp4");
    assert.equal(rendered.body.artifacts.finalVideo.retentionClass, "final-video");
    assert.equal(rendered.body.artifacts.thumbnail.status, "CLEAN");
    assert.equal(rendered.body.artifacts.thumbnail.contentType, "image/jpeg");
    assert.equal(rendered.body.artifacts.thumbnail.retentionClass, "final-thumbnail");
    assert.equal(rendered.body.artifacts.captions.status, "CLEAN");
    assert.equal(rendered.body.artifacts.captions.contentType, "text/vtt");
    assert.equal(rendered.body.artifacts.captions.retentionClass, "final-captions");
    assert.equal(rendered.body.artifacts.logs.status, "CLEAN");
    assert.equal(rendered.body.artifacts.logs.contentType, "application/json");
    assert.equal(rendered.body.artifacts.logs.retentionClass, "render-logs");

    assert.equal(rendered.body.composition.status, "rendered");
    assert.equal(rendered.body.audit.eventType, "composition.render_succeeded");
    assert.equal(rendered.body.audit.targetType, "CompositionInstruction");

    // No signed URL, secret or provider payload leaks.
    assert.equal(/https?:\/\//i.test(JSON.stringify(rendered.body)), false);
    assert.equal(/secret|api[_-]?key|signature/i.test(JSON.stringify(rendered.body)), false);
  });
});

test("C2 rejects an AE worker capability drift", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "capability_drift" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-cap") });
    const { compositionPlanId } = await prepareValidatedPlan(client, "C2 capability drift");

    const rendered = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId: workspaceIdOf(client) },
      { idempotencyKey: "render-c2-cap" }
    );
    assert.equal(rendered.status, 409, JSON.stringify(rendered.body));
    assert.equal(rendered.body.code, "AE_CAPABILITY_UNAVAILABLE");
    assert.equal(rendered.body.attemptStatus, "failed");
    assert.ok(rendered.body.compositionId);
    assert.ok(rendered.body.attemptId);
    // No final video is retained for a capability drift.
    assert.equal("finalVideo" in rendered.body, false);
  });
});

test("C2 rejects an incompatible worker output hash", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "bad_output" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-bad") });
    const { compositionPlanId } = await prepareValidatedPlan(client, "C2 bad output");

    const rendered = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId: workspaceIdOf(client) },
      { idempotencyKey: "render-c2-bad" }
    );
    assert.equal(rendered.status, 422, JSON.stringify(rendered.body));
    assert.equal(rendered.body.code, "AE_RENDER_FAILED");
    assert.equal(rendered.body.attemptStatus, "failed");
    assert.equal("finalVideo" in rendered.body, false);
  });
});

test("C2 recovers a worker crash and renders exactly once", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "crash" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-crash") });
    const { compositionPlanId } = await prepareValidatedPlan(client, "C2 crash");

    const first = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId: workspaceIdOf(client) },
      { idempotencyKey: "render-c2-crash" }
    );
    assert.equal(first.status, 503, JSON.stringify(first.body));
    assert.equal(first.body.code, "DEPENDENCY_UNAVAILABLE");

    const second = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId: workspaceIdOf(client) },
      { idempotencyKey: "render-c2-crash" }
    );
    assert.equal(second.status, 202, JSON.stringify(second.body));
    assert.equal(second.body.attempt.status, "succeeded");
    assert.equal(second.body.finalVideo.status, "current");
    assert.equal(second.body.finalVideo.version, 1);
    const finalVideoId = second.body.finalVideo.id;

    // A third call with the same idempotency key replays the same render, never a second
    // final video.
    const replay = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId: workspaceIdOf(client) },
      { idempotencyKey: "render-c2-crash" }
    );
    assert.equal(replay.status, 202, JSON.stringify(replay.body));
    assert.equal(replay.body.finalVideo.id, finalVideoId);
    assert.equal(replay.body.attempt.status, "succeeded");
  });
});

test("C2 preserves prior final-video revisions immutably", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "success" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-revision") });
    const { compositionPlanId } = await prepareValidatedPlan(client, "C2 revision");

    const first = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId: workspaceIdOf(client) },
      { idempotencyKey: "render-c2-rev-1" }
    );
    assert.equal(first.status, 202, JSON.stringify(first.body));
    assert.equal(first.body.finalVideo.version, 1);
    assert.equal(first.body.finalVideo.status, "current");
    const firstFinalVideoId = first.body.finalVideo.id;
    const goldenHash = first.body.finalVideo.sha256;

    const second = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId: workspaceIdOf(client) },
      { idempotencyKey: "render-c2-rev-2" }
    );
    assert.equal(second.status, 202, JSON.stringify(second.body));
    assert.equal(second.body.finalVideo.version, 2);
    assert.equal(second.body.finalVideo.status, "current");
    assert.notEqual(second.body.finalVideo.id, firstFinalVideoId);

    // The prior revision is retained as superseded, never overwritten.
    assert.ok(second.body.supersededFinalVideo);
    assert.equal(second.body.supersededFinalVideo.id, firstFinalVideoId);
    assert.equal(second.body.supersededFinalVideo.version, 1);
    assert.equal(second.body.supersededFinalVideo.status, "superseded");

    // Golden render: the same plan yields the same deterministic output hash across revisions.
    assert.equal(second.body.finalVideo.sha256, goldenHash);

    assert.equal(second.body.audit.eventType, "composition.render_succeeded");
    assert.equal(second.body.supersededAudit.eventType, "composition.video_superseded");
  });
});

test("C2 requires an idempotency key for render", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "success" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-idem") });
    const { compositionPlanId } = await prepareValidatedPlan(client, "C2 idempotency");

    const rendered = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId: workspaceIdOf(client) }
    );
    assert.equal(rendered.status, 400, JSON.stringify(rendered.body));
    assert.equal(rendered.body.code, "IDEMPOTENCY_KEY_REQUIRED");
  });
});

test("C2 hides a cross-workspace render behind WORKSPACE_ACCESS_DENIED", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "success" };
  await withApiServer(env, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("c2-cross-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("c2-cross-b") });
    const planA = await prepareValidatedPlan(clientA, "C2 cross A");
    const preparedB = await prepareApprovedBrand(clientB, "C2 cross B");

    const rendered = await clientB.renderCompositionPlan(
      planA.compositionPlanId,
      { workspaceId: preparedB.workspaceId },
      { idempotencyKey: "render-c2-cross" }
    );
    assert.equal(rendered.status, 404, JSON.stringify(rendered.body));
    assert.equal(rendered.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(rendered.body).includes(planA.workspaceId), false);
  });
});

test("C2 hides a missing workspace behind WORKSPACE_ACCESS_DENIED", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "success" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-missing-ws") });

    const rendered = await client.renderCompositionPlan(
      randomUUID(),
      { workspaceId: randomUUID() },
      { idempotencyKey: "render-c2-missing" }
    );
    assert.equal(rendered.status, 404, JSON.stringify(rendered.body));
    assert.equal(rendered.body.code, "WORKSPACE_ACCESS_DENIED");
  });
});

// The deterministic golden render hash is stable for the same plan input hash and duration,
// independent of the revision version. This is the golden-video comparison contract.
test("C2 golden render hash is deterministic for the same plan input", () => {
  const planHash = "a".repeat(64);
  assert.equal(
    goldenRenderHash(planHash, 30),
    goldenRenderHash(planHash, 30)
  );
  assert.notEqual(goldenRenderHash(planHash, 30), goldenRenderHash(planHash, 45));
  assert.match(goldenRenderHash(planHash, 30), /^[0-9a-f]{64}$/);
});

// V0-C2 render idempotency is input-bound: an idempotency key is scoped to the exact render
// operation input (workspace, composition instruction, AE plan, plan canonical hash, input asset
// hashes, capability version). The same key replayed against a different composition is a
// conflict, never a silent replay of the wrong final video. This is required before R1/R2 trust
// the FinalVideo and render lineage as exact media truth.
test("C2 conflicts when an idempotency key is replayed against a different composition (succeeded)", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "success" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-conf-succ") });
    const planA = await prepareValidatedPlan(client, "C2 conflict A");
    const workspaceId = planA.workspaceId;

    // A second, distinct composition plan in the same workspace (same retained asset, different
    // composition instruction, AE plan and timeline) is a different render operation input.
    const planB = await client.createCompositionPlan({
      workspaceId,
      generationAssetId: planA.assetId,
      inputMode: "structured",
      rawDirection: "9:16 reel with an intro caption and a zoom-in outro",
      timeline: {
        schemaVersion: AE_PLAN_SCHEMA_VERSION,
        capabilityVersion: DEFAULT_AE_CAPABILITY_VERSION,
        durationSeconds: 30,
        resolution: "1080x1920",
        tracks: [
          { id: "t1", kind: "video", assetId: planA.assetId, startSeconds: 0, endSeconds: 30, safeZone: "center" }
        ],
        overlays: [
          { id: "o1", kind: "caption", text: "Aster Heights — Book a site visit", startSeconds: 0, endSeconds: 5, safeZone: "lower_third" }
        ],
        effects: [{ name: "zoom_in", plugin: "ae_builtin" }],
        fonts: [{ name: "Satoshi" }],
        plugins: [{ name: "ae_builtin" }],
        templates: [{ name: "realestate_listing" }]
      }
    });
    assert.equal(planB.status, 202, JSON.stringify(planB.body));
    assert.equal(planB.body.composition.status, "validated");
    const planBId = planB.body.composition.id;

    // Render composition A with key render-conflict-x.
    const renderA = await client.renderCompositionPlan(
      planA.compositionPlanId,
      { workspaceId },
      { idempotencyKey: "render-conflict-x" }
    );
    assert.equal(renderA.status, 202, JSON.stringify(renderA.body));
    assert.equal(renderA.body.attempt.status, "succeeded");
    const finalVideoA = renderA.body.finalVideo.id;

    // Replaying the same key against composition B is a conflict, never a replay of A's video.
    const renderB = await client.renderCompositionPlan(
      planBId,
      { workspaceId },
      { idempotencyKey: "render-conflict-x" }
    );
    assert.equal(renderB.status, 409, JSON.stringify(renderB.body));
    assert.equal(renderB.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
    assert.equal("finalVideo" in renderB.body, false);
    assert.equal("attempt" in renderB.body, false);

    // Composition B was never rendered and no second final video was retained for B.
    const replayB = await client.renderCompositionPlan(
      planBId,
      { workspaceId },
      { idempotencyKey: "render-conflict-b" }
    );
    assert.equal(replayB.status, 202, JSON.stringify(replayB.body));
    assert.equal(replayB.body.finalVideo.version, 1);
    assert.notEqual(replayB.body.finalVideo.id, finalVideoA);
    assert.equal(replayB.body.finalVideo.compositionInstructionId, planBId);
  });
});

test("C2 conflicts when an idempotency key is replayed against a different composition (failed)", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "bad_output" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-conf-fail") });
    const planA = await prepareValidatedPlan(client, "C2 conflict fail A");
    const workspaceId = planA.workspaceId;
    const planB = await client.createCompositionPlan({
      workspaceId,
      generationAssetId: planA.assetId,
      inputMode: "structured",
      rawDirection: "9:16 reel with a side caption",
      timeline: validTimeline(planA.assetId)
    });
    assert.equal(planB.status, 202, JSON.stringify(planB.body));
    const planBId = planB.body.composition.id;

    // Composition A fails (incompatible worker output).
    const renderA = await client.renderCompositionPlan(
      planA.compositionPlanId,
      { workspaceId },
      { idempotencyKey: "render-conflict-fail" }
    );
    assert.equal(renderA.status, 422, JSON.stringify(renderA.body));
    assert.equal(renderA.body.code, "AE_RENDER_FAILED");

    // Replaying the same key against composition B is still a conflict, even though A failed.
    const renderB = await client.renderCompositionPlan(
      planBId,
      { workspaceId },
      { idempotencyKey: "render-conflict-fail" }
    );
    assert.equal(renderB.status, 409, JSON.stringify(renderB.body));
    assert.equal(renderB.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
    assert.equal("finalVideo" in renderB.body, false);
  });
});

test("C2 conflicts when an idempotency key is replayed against a different composition (running)", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "crash" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-conf-run") });
    const planA = await prepareValidatedPlan(client, "C2 conflict run A");
    const workspaceId = planA.workspaceId;
    const planB = await client.createCompositionPlan({
      workspaceId,
      generationAssetId: planA.assetId,
      inputMode: "structured",
      rawDirection: "9:16 reel with a lower-third CTA",
      timeline: validTimeline(planA.assetId)
    });
    assert.equal(planB.status, 202, JSON.stringify(planB.body));
    const planBId = planB.body.composition.id;

    // Composition A is left RUNNING (crash window).
    const renderA = await client.renderCompositionPlan(
      planA.compositionPlanId,
      { workspaceId },
      { idempotencyKey: "render-conflict-run" }
    );
    assert.equal(renderA.status, 503, JSON.stringify(renderA.body));
    assert.equal(renderA.body.code, "DEPENDENCY_UNAVAILABLE");

    // Replaying the same key against composition B is a conflict, never a resume of A for B.
    const renderB = await client.renderCompositionPlan(
      planBId,
      { workspaceId },
      { idempotencyKey: "render-conflict-run" }
    );
    assert.equal(renderB.status, 409, JSON.stringify(renderB.body));
    assert.equal(renderB.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
    assert.equal("finalVideo" in renderB.body, false);
  });
});

// A succeeded replay returns the same composition's attempt, final video and lineage — never a
// final video from a different composition mixed with the requested composition's response.
test("C2 replay returns the same composition's attempt, final video and lineage", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "success" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-replay-consistency") });
    const { compositionPlanId, workspaceId } = await prepareValidatedPlan(client, "C2 replay consistency");

    const first = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId },
      { idempotencyKey: "render-replay-x" }
    );
    assert.equal(first.status, 202, JSON.stringify(first.body));
    const attemptId = first.body.attempt.id;
    const finalVideoId = first.body.finalVideo.id;

    const replay = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId },
      { idempotencyKey: "render-replay-x" }
    );
    assert.equal(replay.status, 202, JSON.stringify(replay.body));
    // The replayed attempt, final video and composition all belong to the same composition.
    assert.equal(replay.body.attempt.id, attemptId);
    assert.equal(replay.body.finalVideo.id, finalVideoId);
    assert.equal(replay.body.attempt.compositionInstructionId, compositionPlanId);
    assert.equal(replay.body.finalVideo.compositionInstructionId, compositionPlanId);
    assert.equal(replay.body.composition.id, compositionPlanId);
    assert.equal(replay.body.attempt.compositionInstructionId, replay.body.finalVideo.compositionInstructionId);
  });
});

// V0-C2 retains a first-class render-level CreativeLineage row per FinalVideo, copying the G5
// ancestry (brand, script, avatar, estimate, provider, price version, generated asset) and
// binding the composition instruction, AE plan, render attempt and final video. A revision
// creates a new immutable lineage row for the new final video and never overwrites the prior row.
test("C2 retains render-level creative lineage and preserves prior lineage on revision", async () => {
  const env = { ...baseEnv, V0_C2_SIMULATOR_MODE: "success" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c2-lineage") });
    const { compositionPlanId, workspaceId, assetId } = await prepareValidatedPlan(client, "C2 lineage");

    const first = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId },
      { idempotencyKey: "render-lineage-1" }
    );
    assert.equal(first.status, 202, JSON.stringify(first.body));
    assert.ok(first.body.lineage, "render success carries render-level lineage");
    const lineage1 = first.body.lineage;
    assert.equal(lineage1.compositionInstructionId, compositionPlanId);
    assert.equal(lineage1.aePlanId, first.body.attempt.aePlanId);
    assert.equal(lineage1.renderAttemptId, first.body.attempt.id);
    assert.equal(lineage1.finalVideoId, first.body.finalVideo.id);
    assert.equal(lineage1.generationJobId, null, "render-level lineage is identified by final video, not the generation job");
    assert.equal(lineage1.generatedAssetId, assetId, "render-level lineage copies the G5 generated-asset ancestry");
    assert.ok(lineage1.brandProfileId, "render-level lineage copies the G5 brand ancestry");
    assert.equal(lineage1.provider, "heygen-simulator");
    assert.match(lineage1.id, /^[0-9a-f-]{36}$/);
    const v1FinalVideoId = first.body.finalVideo.id;
    const lineage1Id = lineage1.id;

    // A revision creates a new current final video and a new immutable lineage row for it.
    const second = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId },
      { idempotencyKey: "render-lineage-2" }
    );
    assert.equal(second.status, 202, JSON.stringify(second.body));
    assert.ok(second.body.lineage);
    const lineage2 = second.body.lineage;
    assert.equal(lineage2.finalVideoId, second.body.finalVideo.id);
    assert.equal(lineage2.renderAttemptId, second.body.attempt.id);
    assert.notEqual(lineage2.id, lineage1Id);
    assert.notEqual(lineage2.finalVideoId, v1FinalVideoId);

    // The prior revision's lineage is preserved immutably: replaying the first key returns the
    // original final video (now superseded) and the original lineage row, unchanged.
    const replayFirst = await client.renderCompositionPlan(
      compositionPlanId,
      { workspaceId },
      { idempotencyKey: "render-lineage-1" }
    );
    assert.equal(replayFirst.status, 202, JSON.stringify(replayFirst.body));
    assert.equal(replayFirst.body.finalVideo.id, v1FinalVideoId);
    assert.equal(replayFirst.body.lineage.id, lineage1Id);
    assert.equal(replayFirst.body.lineage.finalVideoId, v1FinalVideoId);
    assert.equal(replayFirst.body.lineage.renderAttemptId, first.body.attempt.id);
  });
});

// ---- helpers ----

// prepareValidatedPlan runs the predecessor G5 + C1 flow and returns the validated
// composition plan id plus the workspace id. The workspace id is stashed on the client so
// the test can read it without re-threading it through every assertion.
async function prepareValidatedPlan(client, label) {
  const prepared = await prepareApprovedBrand(client, label);
  client.__workspaceId = prepared.workspaceId;
  await fundWallet(client, prepared.workspaceId, 50000);
  const jobId = await confirmJob(client, prepared);
  await driveToCompleted(client, prepared, jobId, `submit-${label}-${randomUUID()}`);
  const settled = await client.settleGenerationJob(
    jobId,
    { workspaceId: prepared.workspaceId },
    { idempotencyKey: `settle-${label}-${randomUUID()}` }
  );
  assert.equal(settled.status, 202, JSON.stringify(settled.body));
  const assetId = settled.body.asset.id;

  const created = await client.createCompositionPlan({
    workspaceId: prepared.workspaceId,
    generationAssetId: assetId,
    inputMode: "structured",
    rawDirection: "9:16 reel with a lower-third caption and a zoom-in intro",
    timeline: validTimeline(assetId)
  });
  assert.equal(created.status, 202, JSON.stringify(created.body));
  assert.equal(created.body.composition.status, "validated");
  return {
    compositionPlanId: created.body.composition.id,
    workspaceId: prepared.workspaceId,
    assetId,
    brandProfileId: prepared.brandProfileId
  };
}

function workspaceIdOf(client) {
  return client.__workspaceId;
}

function validTimeline(assetId) {
  return {
    schemaVersion: AE_PLAN_SCHEMA_VERSION,
    capabilityVersion: DEFAULT_AE_CAPABILITY_VERSION,
    durationSeconds: 30,
    resolution: "1080x1920",
    tracks: [
      { id: "t1", kind: "video", assetId, startSeconds: 0, endSeconds: 30, safeZone: "center" }
    ],
    overlays: [
      { id: "o1", kind: "caption", text: "Sunrise Estates", startSeconds: 0, endSeconds: 5, safeZone: "lower_third" }
    ],
    effects: [{ name: "zoom_in", plugin: "ae_builtin" }],
    fonts: [{ name: "Satoshi" }],
    plugins: [{ name: "ae_builtin" }],
    templates: [{ name: "realestate_listing" }]
  };
}

async function fundWallet(client, workspaceId, amountMinor) {
  const purchase = await client.createCreditPurchase(
    { workspaceId, provider: "razorpay", currency: "INR", amountMinor },
    { idempotencyKey: `purchase-${randomUUID()}` }
  );
  assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
  const paid = await client.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  return purchase.body.wallet.id;
}

async function confirmJob(client, prepared) {
  const listed = await client.listAvatars({
    workspaceId: prepared.workspaceId,
    brandProfileId: prepared.brandProfileId,
    limit: 50
  });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
  assert.ok(eligible, "expected an eligible avatar for the estimate");
  const estimate = await client.createGenerationEstimate({
    workspaceId: prepared.workspaceId,
    brandProfileId: prepared.brandProfileId,
    selectedScriptId: SCRIPT_ID,
    avatarProfileId: eligible.id,
    durationSeconds: 30
  });
  assert.equal(estimate.status, 202, JSON.stringify(estimate.body));
  const confirmed = await client.confirmGenerationEstimate(
    estimate.body.estimate.id,
    {
      workspaceId: prepared.workspaceId,
      version: estimate.body.estimate.version,
      selectedScriptId: SCRIPT_ID,
      avatarProfileId: eligible.id,
      durationSeconds: 30
    },
    { idempotencyKey: `confirm-c2-${randomUUID()}` }
  );
  assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
  return confirmed.body.job.id;
}

async function driveToCompleted(client, prepared, jobId, submitKey) {
  const submitted = await client.submitGenerationJob(
    jobId,
    { workspaceId: prepared.workspaceId },
    { idempotencyKey: submitKey }
  );
  assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
  const acknowledged = await client.postHeygenCallback(
    submitted.body.callback.envelope,
    submitted.body.callback.signature
  );
  assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
  assert.equal(acknowledged.body.operation.status, "completed");
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
