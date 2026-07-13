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

// V0-G5 retained generated media and settled credits. Completed HeyGen media is copied
// into private V0 storage through the adapter only, quarantined, validated and hashed,
// then bound to GeneratedSegment/GeneratedAsset/CreativeLineage. The provider total is
// reconciled against the authorized maximum and credits are captured once on success or
// released once on failure. A crash between media retention and ledger settlement is
// recovered without orphaned capture or duplicate release. The transient provider URL is
// never retained; media is not clean until validation passes; settlement is idempotent and
// append-only.
test("G5 settles a completed generation by retaining validated media and capturing credits once", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g5-success") });
    const prepared = await prepareApprovedBrand(client, "G5 success");
    const walletId = await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-g5-1");

    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-g5-1" }
    );
    assert.equal(settled.status, 202, JSON.stringify(settled.body));
    assert.equal(settled.body.outcome, "captured");
    assert.equal(settled.body.replay, false);
    // Media retained and validated clean: artifact, segment, asset and lineage exist.
    assert.ok(settled.body.artifact.id);
    assert.equal(settled.body.artifact.status, "CLEAN");
    assert.match(settled.body.artifact.sha256, /^[0-9a-f]{64}$/);
    assert.ok(settled.body.segment.id);
    assert.equal(settled.body.segment.durationSeconds, 30);
    assert.equal(settled.body.segment.artifactId, settled.body.artifact.id);
    assert.ok(settled.body.asset.id);
    assert.equal(settled.body.asset.version, 1);
    assert.equal(settled.body.asset.artifactId, settled.body.artifact.id);
    assert.ok(settled.body.lineage.id);
    assert.equal(settled.body.lineage.generationJobId, jobId);
    // Credits captured exactly once: one CAPTURE ledger entry and a captured reservation.
    assert.equal(settled.body.ledgerEntry.type, "CAPTURE");
    assert.equal(settled.body.reservation.status, "captured");
    // The authorized maximum was 48,000 and the actual provider total equals it, so the
    // unused return is 0 and the wallet balance stays at 2,000 (integer minor units).
    assert.equal(settled.body.wallet.balanceMinor, 2000);
    // The transient provider URL and provider payloads never appear in the response.
    assert.equal(/https?:\/\//i.test(JSON.stringify(settled.body)), false);
    assert.equal(/transient|provider[_-]?url|heygen\.com/i.test(JSON.stringify(settled.body)), false);
    const captureCount = await ledgerTypeCount(client, prepared.workspaceId, walletId, "CAPTURE");
    assert.equal(captureCount, "1", "exactly one CAPTURE ledger entry");
  });
});

test("G5 releases the full reservation once when the provider operation failed", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g5-failure") });
    const prepared = await prepareApprovedBrand(client, "G5 failure");
    const walletId = await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToFailed(client, prepared, jobId, "submit-g5-fail");

    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-g5-fail" }
    );
    assert.equal(settled.status, 202, JSON.stringify(settled.body));
    assert.equal(settled.body.outcome, "released");
    assert.equal(settled.body.ledgerEntry.type, "RELEASE");
    assert.equal(settled.body.reservation.status, "released");
    // The full 48,000 reservation is returned; the wallet is restored to 50,000.
    assert.equal(settled.body.wallet.balanceMinor, 50000);
    // No media is retained for a failed operation.
    assert.equal(settled.body.artifact, null);
    assert.equal(settled.body.segment, null);
    const releaseCount = await ledgerTypeCount(client, prepared.workspaceId, walletId, "RELEASE");
    assert.equal(releaseCount, "1", "exactly one RELEASE ledger entry");
  });
});

test("G5 blocks settlement when the provider total exceeds the authorized maximum", async () => {
  const env = { ...baseEnv, V0_G5_SIMULATOR_MODE: "cost_mismatch" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g5-cost") });
    const prepared = await prepareApprovedBrand(client, "G5 cost mismatch");
    const walletId = await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-g5-cost");

    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-g5-cost" }
    );
    assert.equal(settled.status, 409, JSON.stringify(settled.body));
    assert.equal(settled.body.code, "PROVIDER_COST_EXCEEDS_AUTHORIZATION");
    // No capture or release; the reservation stays active and the wallet is untouched.
    const captureCount = await ledgerTypeCount(client, prepared.workspaceId, walletId, "CAPTURE");
    const releaseCount = await ledgerTypeCount(client, prepared.workspaceId, walletId, "RELEASE");
    assert.equal(captureCount, "0");
    assert.equal(releaseCount, "0");
  });
});

test("G5 rejects corrupt provider media and never captures credits", async () => {
  const env = { ...baseEnv, V0_G5_SIMULATOR_MODE: "malformed_media" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g5-malformed") });
    const prepared = await prepareApprovedBrand(client, "G5 malformed media");
    const walletId = await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-g5-malformed");

    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-g5-malformed" }
    );
    assert.equal(settled.status, 422, JSON.stringify(settled.body));
    assert.equal(settled.body.code, "ASSET_MEDIA_MALFORMED");
    const captureCount = await ledgerTypeCount(client, prepared.workspaceId, walletId, "CAPTURE");
    assert.equal(captureCount, "0", "no capture for corrupt media");
  });
});

test("G5 recovers a crash between media retention and ledger settlement without orphaned capture or duplicate release", async () => {
  const env = { ...baseEnv, V0_G5_SIMULATOR_MODE: "crash_after_retain" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g5-crash") });
    const prepared = await prepareApprovedBrand(client, "G5 crash window");
    const walletId = await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-g5-crash");

    // First settle call retains the media then is interrupted before the ledger entry,
    // simulating a crash between media retention and credit settlement.
    const interrupted = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-g5-crash-1" }
    );
    assert.equal(interrupted.status, 503, JSON.stringify(interrupted.body));
    assert.equal(interrupted.body.code, "DEPENDENCY_UNAVAILABLE");
    // Media was retained before the crash, but no capture was written.
    const captureBefore = await ledgerTypeCount(client, prepared.workspaceId, walletId, "CAPTURE");
    assert.equal(captureBefore, "0", "no capture before recovery");

    // A second settle call recovers: media is already retained, so settlement completes
    // the ledger exactly once without re-retaining or double-capturing.
    const recovered = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-g5-crash-2" }
    );
    assert.equal(recovered.status, 202, JSON.stringify(recovered.body));
    assert.equal(recovered.body.outcome, "captured");
    assert.equal(recovered.body.reservation.status, "captured");
    assert.equal(recovered.body.wallet.balanceMinor, 2000);
    const captureAfter = await ledgerTypeCount(client, prepared.workspaceId, walletId, "CAPTURE");
    assert.equal(captureAfter, "1", "exactly one CAPTURE after crash recovery");
  });
});

test("G5 settles exactly once: an idempotent replay returns the original settlement and never captures twice", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g5-replay") });
    const prepared = await prepareApprovedBrand(client, "G5 replay");
    const walletId = await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    await driveToCompleted(client, prepared, jobId, "submit-g5-replay");

    const first = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-g5-replay" }
    );
    assert.equal(first.status, 202);
    assert.equal(first.body.outcome, "captured");
    const operationId = first.body.operation.id;

    const replay = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-g5-replay-replay" }
    );
    assert.equal(replay.status, 202);
    assert.equal(replay.body.replay, true);
    assert.equal(replay.body.outcome, "captured");
    assert.equal(replay.body.operation.id, operationId);
    const captureCount = await ledgerTypeCount(client, prepared.workspaceId, walletId, "CAPTURE");
    assert.equal(captureCount, "1", "replay never captures a second time");
  });
});

test("G5 hides a cross-workspace settlement behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("g5-cross-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("g5-cross-b") });
    const preparedA = await prepareApprovedBrand(clientA, "G5 cross A");
    const preparedB = await prepareApprovedBrand(clientB, "G5 cross B");
    await fundWallet(clientA, preparedA.workspaceId, 50000);
    const jobId = await confirmJob(clientA, preparedA);
    await driveToCompleted(clientA, preparedA, jobId, "submit-g5-cross");

    const cross = await clientB.settleGenerationJob(
      jobId,
      { workspaceId: preparedB.workspaceId },
      { idempotencyKey: "settle-g5-cross" }
    );
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(preparedA.workspaceId), false);
  });
});

test("G5 refuses to settle a generation whose provider operation is not terminal", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g5-noterminal") });
    const prepared = await prepareApprovedBrand(client, "G5 not terminal");
    const walletId = await fundWallet(client, prepared.workspaceId, 50000);
    const jobId = await confirmJob(client, prepared);
    // Submit succeeds (ACCEPTED) but no callback is posted, so the operation is not
    // terminal and settlement must refuse.
    const submitted = await client.submitGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "submit-g5-noterminal" }
    );
    assert.equal(submitted.status, 202);

    const settled = await client.settleGenerationJob(
      jobId,
      { workspaceId: prepared.workspaceId },
      { idempotencyKey: "settle-g5-noterminal" }
    );
    assert.equal(settled.status, 409, JSON.stringify(settled.body));
    assert.equal(settled.body.code, "GENERATION_JOB_NOT_SUBMITTABLE");
    const captureCount = await ledgerTypeCount(client, prepared.workspaceId, walletId, "CAPTURE");
    assert.equal(captureCount, "0");
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
  const confirmed = await client.confirmGenerationEstimate(
    estimate.body.estimate.id,
    {
      workspaceId: prepared.workspaceId,
      version: estimate.body.estimate.version,
      selectedScriptId: SCRIPT_ID,
      avatarProfileId: eligible.id,
      durationSeconds: 30
    },
    { idempotencyKey: `confirm-g5-${suffix || "1"}-${randomUUID()}` }
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
  assert.ok(submitted.body.callback, "simulator surfaces a callback envelope");
  const acknowledged = await client.postHeygenCallback(
    submitted.body.callback.envelope,
    submitted.body.callback.signature
  );
  assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
  assert.equal(acknowledged.body.operation.status, "completed");
  return acknowledged.body.operation;
}

async function driveToFailed(client, prepared, jobId, submitKey) {
  const submitted = await client.submitGenerationJob(
    jobId,
    { workspaceId: prepared.workspaceId },
    { idempotencyKey: submitKey }
  );
  assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
  const envelope = {
    ...submitted.body.callback.envelope,
    eventType: "generation.failed",
    eventId: `evt_failed_${submitted.body.operation.id}`
  };
  const failed = await client.postHeygenCallback(envelope, signHeygen(envelope));
  assert.equal(failed.status, 200, JSON.stringify(failed.body));
  assert.equal(failed.body.operation.status, "failed");
  return failed.body.operation;
}

async function ledgerTypeCount(client, workspaceId, walletId, type) {
  const ledger = await client.getWalletLedger(walletId, {
    workspaceId,
    limit: 100
  });
  assert.equal(ledger.status, 200, JSON.stringify(ledger.body));
  const count = ledger.body.entries.filter((entry) => entry.type === type).length;
  return String(count);
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
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
