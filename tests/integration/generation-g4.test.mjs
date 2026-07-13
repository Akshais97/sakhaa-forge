import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareApprovedBrand } from "../helpers/script-tournament-fixtures.mjs";

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

// V0-G4 exactly-once HeyGen submission. A durable ProviderOperation is persisted
// before network I/O; a timeout after possible acceptance is unknown and must be
// reconciled before any retry; blind resubmission, callback replay and worker
// crash never create a second paid operation. Provider payloads stay private and
// callbacks are signature-verified, windowed and deduplicated. Credit capture and
// release are V0-G5; V0-G4 only submits, reconciles and cancels.
test("G4 submits a queued generation job exactly once and a verified callback drives it to generated", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g4-success") });
    const prepared = await prepareApprovedBrand(client, "G4 success");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);

    const submitted = await client.submitGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "submit-g4-1" }
    );
    assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
    assert.equal(submitted.body.job.status, "accepted");
    assert.equal(submitted.body.operation.status, "accepted");
    assert.ok(submitted.body.operation.externalId, "provider external id is bound");
    assert.equal(submitted.body.operation.provider, "heygen-simulator");
    assert.equal(submitted.body.operation.estimatedMaximumMinor, 48000);
    assert.equal(submitted.body.operation.priceVersion, "v0.local.1");
    // The request hash is a server-side binding secret and must not leak.
    assert.equal("requestHash" in submitted.body.operation, false);

    // The simulator surfaces a signed callback envelope (no media URL) for the
    // deterministic test to post back, exactly as the Razorpay simulator does.
    const callback = submitted.body.callback;
    assert.ok(callback?.envelope, "simulator surfaces a callback envelope");
    assert.ok(callback?.signature, "simulator surfaces a callback signature");
    assert.equal("url" in callback.envelope, false, "no transient provider URL is retained");

    const acknowledged = await client.postHeygenCallback(callback.envelope, callback.signature);
    assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
    assert.equal(acknowledged.body.operation.status, "completed");
    assert.equal(acknowledged.body.job.status, "generated");
    assert.ok(acknowledged.body.operation.completedAt, "completedAt is recorded");

    // A replay of the same callback is deduplicated and never transitions twice.
    const replay = await client.postHeygenCallback(callback.envelope, callback.signature);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.duplicate, true);

    // A replay of the same submit idempotency key returns the existing operation
    // and never calls the provider again.
    const resubmit = await client.submitGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "submit-g4-1" }
    );
    assert.equal(resubmit.status, 202);
    assert.equal(resubmit.body.replay, true);
    assert.equal(resubmit.body.operation.id, submitted.body.operation.id);
  });
});

test("G4 treats a timeout after possible acceptance as unknown and never blindly resubmits", async () => {
  const env = { ...baseEnv, V0_HEYGEN_SIMULATOR_MODE: "timeout" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g4-timeout") });
    const prepared = await prepareApprovedBrand(client, "G4 timeout");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);

    const submitted = await client.submitGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "submit-g4-timeout" }
    );
    assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
    assert.equal(submitted.body.unknown, true);
    assert.equal(submitted.body.operation.status, "unknown");
    assert.equal(submitted.body.job.status, "unknown");
    assert.equal(submitted.body.operation.externalId, null, "no external id was assigned");
    assert.equal(submitted.body.callback, undefined, "no callback is surfaced for an unknown operation");

    // A retry with the same idempotency key returns the existing unknown operation
    // and never creates a second provider operation or a second provider call.
    const retry = await client.submitGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "submit-g4-timeout" }
    );
    assert.equal(retry.status, 202);
    assert.equal(retry.body.replay, true);
    assert.equal(retry.body.operation.id, submitted.body.operation.id);
    assert.equal(retry.body.operation.status, "unknown");

    // A second key for the same job is a conflict, never a second submission.
    const conflict = await client.submitGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "submit-g4-timeout-other" }
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");

    // Reconciliation resolves the unknown operation by querying the provider; it
    // never resubmits. The default reconcile outcome is completed.
    const reconciled = await client.reconcileGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "reconcile-g4-timeout" }
    );
    assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
    assert.equal(reconciled.body.operation.status, "completed");
    assert.equal(reconciled.body.job.status, "generated");
    assert.ok(reconciled.body.operation.reconciledAt, "reconciledAt is recorded");
    assert.ok(reconciled.body.operation.externalId, "external id bound on reconciliation");
  });
});

test("G4 fails a malformed provider response with PROVIDER_OUTPUT_INVALID and no callback", async () => {
  const env = { ...baseEnv, V0_HEYGEN_SIMULATOR_MODE: "malformed" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g4-malformed") });
    const prepared = await prepareApprovedBrand(client, "G4 malformed");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);

    const submitted = await client.submitGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "submit-g4-malformed" }
    );
    assert.equal(submitted.status, 422, JSON.stringify(submitted.body));
    assert.equal(submitted.body.code, "PROVIDER_OUTPUT_INVALID");

    const job = await client.getGenerationJob(jobId, { workspaceId: prepared.workspaceId });
    assert.equal(job.status, 200);
    assert.equal(job.body.job.status, "failed");
  });
});

test("G4 rejects a malformed callback and a bad-signature callback without leaking existence", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g4-callback") });
    const prepared = await prepareApprovedBrand(client, "G4 callback");
    await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);

    const submitted = await client.submitGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "submit-g4-callback" }
    );
    assert.equal(submitted.status, 202);
    const callback = submitted.body.callback;

    // A bad signature is rejected as an unverified update.
    const badSignature = await client.postHeygenCallback(callback.envelope, "not-a-valid-signature");
    assert.equal(badSignature.status, 401);
    assert.equal(badSignature.body.code, "PROVIDER_CALLBACK_INVALID");

    // A correctly signed but malformed callback (missing required fields) is
    // rejected without transitioning the operation.
    const malformedEnvelope = { workspaceId: prepared.workspaceId, eventId: "evt_malformed", timestamp: Date.now() };
    const malformedSignature = signHeygen(malformedEnvelope);
    const malformed = await client.postHeygenCallback(malformedEnvelope, malformedSignature);
    assert.equal(malformed.status, 422);
    assert.equal(malformed.body.code, "PROVIDER_OUTPUT_INVALID");

    // An out-of-window callback is rejected as unverified.
    const staleEnvelope = { ...callback.envelope, timestamp: Date.now() - 10 * 60 * 1000, eventId: "evt_stale" };
    const staleSignature = signHeygen(staleEnvelope);
    const stale = await client.postHeygenCallback(staleEnvelope, staleSignature);
    assert.equal(stale.status, 401);
    assert.equal(stale.body.code, "PROVIDER_CALLBACK_INVALID");

    // The operation is still accepted, untouched by the rejected callbacks.
    const job = await client.getGenerationJob(jobId, { workspaceId: prepared.workspaceId });
    assert.equal(job.body.job.status, "accepted");
  });
});

test("G4 enforces the HeyGen concurrency limit and rejects the overflow with PROVIDER_RATE_LIMITED", async () => {
  const env = { ...baseEnv, V0_HEYGEN_CONCURRENCY_LIMIT: "2" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g4-concurrency") });
    const prepared = await prepareApprovedBrand(client, "G4 concurrency");
    await fundWallet(client, prepared.workspaceId, 150000);

    const jobA = await confirmJob(client, prepared, "a");
    const jobB = await confirmJob(client, prepared, "b");
    const jobC = await confirmJob(client, prepared, "c");

    const a = await client.submitGenerationJob(jobA, { workspaceId: prepared.workspaceId }, { idempotencyKey: "submit-c-a" });
    assert.equal(a.status, 202, JSON.stringify(a.body));
    const b = await client.submitGenerationJob(jobB, { workspaceId: prepared.workspaceId }, { idempotencyKey: "submit-c-b" });
    assert.equal(b.status, 202, JSON.stringify(b.body));

    const overflow = await client.submitGenerationJob(jobC, { workspaceId: prepared.workspaceId }, { idempotencyKey: "submit-c-c" });
    assert.equal(overflow.status, 429, JSON.stringify(overflow.body));
    assert.equal(overflow.body.code, "PROVIDER_RATE_LIMITED");
    assert.equal(overflow.body.retryable, true);

    // The overflowed job is still queued and has no provider operation.
    const job = await client.getGenerationJob(jobC, { workspaceId: prepared.workspaceId });
    assert.equal(job.body.job.status, "queued");
  });
});

test("G4 cancels an uncertain generation by reconciling first and never resubmits", async () => {
  const env = { ...baseEnv, V0_HEYGEN_SIMULATOR_MODE: "timeout", V0_HEYGEN_SIMULATOR_RECONCILE: "pending" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g4-cancel") });
    const prepared = await prepareApprovedBrand(client, "G4 cancel");
    await fundWallet(client, prepared.workspaceId, 100000);
    const jobId = await confirmJob(client, prepared);

    const submitted = await client.submitGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "submit-g4-cancel" }
    );
    assert.equal(submitted.status, 202);
    assert.equal(submitted.body.operation.status, "unknown");
    const operationId = submitted.body.operation.id;

    // Cancellation of an uncertain operation reconciles first. Reconciliation is
    // still pending, so the job is cancel_requested and the caller is told we are
    // checking (GENERATION_CANCEL_UNCERTAIN). No second submission is made.
    const cancelled = await client.cancelGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "cancel-g4-cancel" }
    );
    assert.equal(cancelled.status, 202, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.uncertain, true);
    assert.equal(cancelled.body.job.status, "cancel_requested");
    assert.equal(cancelled.body.operation.id, operationId);
    assert.equal(cancelled.body.operation.status, "unknown");

    // A queued, never-submitted job cancels directly to cancelled.
    const queuedJob = await confirmJob(client, prepared, "queued");
    const directCancel = await client.cancelGenerationJob(
      queuedJob,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "cancel-g4-queued" }
    );
    assert.equal(directCancel.status, 202);
    assert.equal(directCancel.body.job.status, "cancelled");
  });
});

test("G4 hides a cross-workspace generation job submission behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("g4-cross-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("g4-cross-b") });
    const preparedA = await prepareApprovedBrand(clientA, "G4 cross A");
    const preparedB = await prepareApprovedBrand(clientB, "G4 cross B");
    await fundWallet(clientA, preparedA.workspaceId, 50000);
    const jobId = await confirmJob(clientA, preparedA);

    const cross = await clientB.submitGenerationJob(
      jobId,
      { workspaceId: preparedB.workspaceId },
      { idempotencyKey: "submit-g4-cross" }
    );
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(preparedA.workspaceId), false);
  });
});

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

async function confirmJob(client, prepared, suffix = "") {
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
  const estimateId = estimate.body.estimate.id;
  const confirmed = await client.confirmGenerationEstimate(
    estimateId,
    {
      workspaceId: prepared.workspaceId,
      version: estimate.body.estimate.version,
      selectedScriptId: SCRIPT_ID,
      avatarProfileId: eligible.id,
      durationSeconds: 30
    },
    { idempotencyKey: `confirm-g4-${suffix || "1"}-${randomUUID()}` }
  );
  assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
  return confirmed.body.job.id;
}

function signHeygen(envelope) {
  return createHmac("sha256", heygenSecret).update(stableJson(envelope)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function signJwt(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: `${userId}@example.test`,
      aud: "authenticated",
      role: "authenticated",
      app_role: "OWNER",
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
