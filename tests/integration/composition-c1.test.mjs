import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareApprovedBrand } from "../helpers/script-tournament-fixtures.mjs";
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

const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";

// V0-C1 validated composition intent and AE plan. The user supplies structured composition
// direction bound to a retained generated asset; the API normalizes it into a versioned
// timeline JSON and validates it against the deterministic AE capability registry. A valid
// plan is retained as `validated`; a malformed plan or capability mismatch is retained as
// `validation_failed` with every unsupported item explained. The LLM cannot invent assets,
// fonts, plugins or effects. Plans reference retained artifact IDs, never signed URLs. No
// idempotency key is required (composition planning is not a paid or externally visible
// mutation). Cross-workspace existence never leaks.

test("C1 validates a well-formed plan bound to a retained generated asset", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c1-valid") });
    const prepared = await prepareApprovedBrand(client, "C1 valid");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-c1-valid");
    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-c1-valid" }
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
    assert.equal(created.body.composition.generationAssetId, assetId);
    assert.equal(created.body.composition.inputMode, "structured");
    assert.equal(created.body.plan.status, "validated");
    assert.equal(created.body.plan.capabilityVersion, DEFAULT_AE_CAPABILITY_VERSION);
    assert.equal(created.body.plan.schemaVersion, AE_PLAN_SCHEMA_VERSION);
    assert.equal(created.body.plan.unsupportedItems.length, 0);
    assert.ok(created.body.plan.planArtifactId);
    assert.equal(created.body.artifact.id, created.body.plan.planArtifactId);
    assert.equal(created.body.artifact.status, "CLEAN");
    assert.equal(created.body.artifact.contentType, "application/json");
    assert.match(created.body.artifact.sha256, /^[0-9a-f]{64}$/);
    assert.equal(created.body.artifact.retentionClass, "plan-artifact");
    assert.equal(created.body.audit.eventType, "composition.plan_validated");
    // No signed URL, secret or provider payload leaks.
    assert.equal(/https?:\/\//i.test(JSON.stringify(created.body)), false);
    assert.equal(/secret|api[_-]?key|signature/i.test(JSON.stringify(created.body)), false);
  });
});

test("C1 rejects an invented asset id and retains the plan as validation_failed", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c1-invented") });
    const prepared = await prepareApprovedBrand(client, "C1 invented asset");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-c1-invented");
    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-c1-invented" }
    );
    const realAssetId = settled.body.asset.id;
    const invented = "55555555-5555-4555-8555-555555555555";

    const created = await client.createCompositionPlan({
      workspaceId: prepared.workspaceId,
      generationAssetId: invented,
      inputMode: "structured",
      rawDirection: "reference a non-existent asset",
      timeline: validTimeline(invented)
    });
    assert.equal(created.status, 422, JSON.stringify(created.body));
    assert.equal(created.body.code, "AE_ASSET_MISSING");
    assert.equal(created.body.planStatus, "validation_failed");
    assert.ok(created.body.compositionId);
    assert.ok(created.body.planId);
    assert.ok(created.body.unsupported.some((item) => item.code === "AE_ASSET_MISSING"));
    // The real asset id from this workspace is not leaked in the failure response.
    assert.equal(JSON.stringify(created.body).includes(realAssetId), false);
  });
});

test("C1 rejects an unsupported font, plugin and template as a capability mismatch", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c1-cap") });
    const prepared = await prepareApprovedBrand(client, "C1 capability");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-c1-cap");
    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-c1-cap" }
    );
    const assetId = settled.body.asset.id;
    const timeline = validTimeline(assetId);
    timeline.fonts = [{ name: "ComicSans" }];
    timeline.plugins = [{ name: "third_party_fx" }];
    timeline.templates = [{ name: "cinematic_trailer" }];

    const created = await client.createCompositionPlan({
      workspaceId: prepared.workspaceId,
      generationAssetId: assetId,
      inputMode: "structured",
      rawDirection: "unsupported capability set",
      timeline
    });
    assert.equal(created.status, 409, JSON.stringify(created.body));
    assert.equal(created.body.code, "AE_CAPABILITY_UNAVAILABLE");
    assert.equal(created.body.planStatus, "validation_failed");
  });
});

test("C1 rejects invalid timing and an unsafe zone", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c1-timing") });
    const prepared = await prepareApprovedBrand(client, "C1 timing");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-c1-timing");
    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-c1-timing" }
    );
    const assetId = settled.body.asset.id;

    const overlap = validTimeline(assetId);
    overlap.tracks = [
      { id: "t1", kind: "video", assetId, startSeconds: 0, endSeconds: 20, safeZone: "center" },
      { id: "t2", kind: "video", assetId, startSeconds: 10, endSeconds: 30, safeZone: "center" }
    ];
    const overlapResp = await client.createCompositionPlan({
      workspaceId: prepared.workspaceId,
      generationAssetId: assetId,
      inputMode: "structured",
      rawDirection: "overlapping video tracks",
      timeline: overlap
    });
    assert.equal(overlapResp.status, 422, JSON.stringify(overlapResp.body));
    assert.equal(overlapResp.body.code, "AE_TIMELINE_INVALID");
    assert.equal(overlapResp.body.planStatus, "validation_failed");

    const unsafe = validTimeline(assetId);
    unsafe.tracks = [{ id: "t1", kind: "video", assetId, startSeconds: 0, endSeconds: 30, safeZone: "offscreen_bleed" }];
    const unsafeResp = await client.createCompositionPlan({
      workspaceId: prepared.workspaceId,
      generationAssetId: assetId,
      inputMode: "structured",
      rawDirection: "unsafe zone",
      timeline: unsafe
    });
    assert.equal(unsafeResp.status, 422, JSON.stringify(unsafeResp.body));
    assert.equal(unsafeResp.body.code, "AE_TIMELINE_INVALID");
  });
});

test("C1 rejects a capability version mismatch", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c1-version") });
    const prepared = await prepareApprovedBrand(client, "C1 version");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-c1-version");
    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-c1-version" }
    );
    const assetId = settled.body.asset.id;
    const timeline = validTimeline(assetId);
    timeline.capabilityVersion = "ae.local.9";

    const created = await client.createCompositionPlan({
      workspaceId: prepared.workspaceId,
      generationAssetId: assetId,
      inputMode: "structured",
      rawDirection: "stale capability version",
      timeline
    });
    assert.equal(created.status, 409, JSON.stringify(created.body));
    assert.equal(created.body.code, "AE_CAPABILITY_UNAVAILABLE");
    assert.equal(created.body.planStatus, "validation_failed");
  });
});

test("C1 rejects a malformed timeline schema", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c1-schema") });
    const prepared = await prepareApprovedBrand(client, "C1 schema");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-c1-schema");
    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-c1-schema" }
    );
    const assetId = settled.body.asset.id;
    const timeline = validTimeline(assetId);
    delete timeline.schemaVersion;

    const created = await client.createCompositionPlan({
      workspaceId: prepared.workspaceId,
      generationAssetId: assetId,
      inputMode: "structured",
      rawDirection: "missing schema version",
      timeline
    });
    assert.equal(created.status, 422, JSON.stringify(created.body));
    assert.equal(created.body.code, "AE_PLAN_SCHEMA_INVALID");
    assert.equal(created.body.planStatus, "validation_failed");
  });
});

test("C1 hides a cross-workspace asset reference behind AE_ASSET_MISSING", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("c1-cross-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("c1-cross-b") });
    const preparedA = await prepareApprovedBrand(clientA, "C1 cross A");
    const preparedB = await prepareApprovedBrand(clientB, "C1 cross B");
    await fundWallet(clientA, preparedA.workspaceId, 50000);
    const jobId = await confirmJob(clientA, preparedA);
    await driveToCompleted(clientA, preparedA, jobId, "submit-c1-cross");
    const settled = await clientA.settleGenerationJob(
      jobId,
      { workspaceId: preparedA.workspaceId },
      { idempotencyKey: "settle-c1-cross" }
    );
    const assetA = settled.body.asset.id;

    // clientB references workspaceA's retained asset from its own workspace; the asset does
    // not exist in workspaceB, so the plan fails without leaking that the asset exists in A.
    const created = await clientB.createCompositionPlan({
      workspaceId: preparedB.workspaceId,
      generationAssetId: assetA,
      inputMode: "structured",
      rawDirection: "reference another workspace asset",
      timeline: validTimeline(assetA)
    });
    assert.equal(created.status, 422, JSON.stringify(created.body));
    assert.equal(created.body.code, "AE_ASSET_MISSING");
    assert.equal(JSON.stringify(created.body).includes(preparedA.workspaceId), false);
  });
});

test("C1 hides a missing workspace behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("c1-missing-ws") });
    const prepared = await prepareApprovedBrand(client, "C1 missing workspace");

    const created = await client.createCompositionPlan({
      workspaceId: randomUUID(),
      generationAssetId: randomUUID(),
      inputMode: "structured",
      rawDirection: "missing workspace",
      timeline: validTimeline(randomUUID())
    });
    assert.equal(created.status, 404, JSON.stringify(created.body));
    assert.equal(created.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(created.body).includes(prepared.workspaceId), false);
  });
});

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
    { idempotencyKey: `confirm-c1-${randomUUID()}` }
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
