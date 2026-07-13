import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareApprovedBrand } from "../helpers/script-tournament-fixtures.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";
const simulatorSecret = "test-payment-simulator-secret";

const baseEnv = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken,
  V0_PAYMENT_SIMULATOR_SECRET: simulatorSecret
};

const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";

// V0-G3 versioned generation estimate and atomic reservation. Confirming a
// versioned estimate must create exactly one GenerationJob, one active
// CreditReservation and one RESERVE ledger entry that debits the workspace
// wallet in integer minor units, all before any provider network I/O. Stale,
// changed, insufficient-balance, double-click and concurrent confirmations
// must never create a duplicate reservation, a duplicate generation or a second
// debit. Reservation does not imply provider submission. Money is integer
// minor units only; the input hash is a server-side validation secret and is
// never returned.
test("G3 confirms a versioned estimate and atomically reserves credits with one RESERVE ledger entry", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g3-confirm") });
    const prepared = await prepareApprovedBrand(client, "G3 confirm");
    const walletId = await fundWallet(client, prepared.workspaceId, 50000);
    const { estimateId, estimate } = await createEstimate(client, prepared);

    assert.equal(estimate.status, "awaiting_confirmation");
    assert.equal(estimate.priceVersion, "v0.local.1");
    assert.equal(estimate.maximumAuthorizedMinor, 48000);
    assert.equal(estimate.version, 1);
    assert.ok(estimate.expiresAt, "estimate carries an expiry");
    // The input hash is a server-side validation secret; it must not leak.
    assert.equal("inputHash" in estimate, false);

    const confirmed = await client.confirmGenerationEstimate(
      estimateId,
      {
        workspaceId: prepared.workspaceId,
        version: estimate.version,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: estimate.avatarProfileId,
        durationSeconds: 30
      },
      { idempotencyKey: "confirm-g3-1" }
    );
    assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.estimate.status, "credits_reserved");
    assert.equal(confirmed.body.estimate.confirmedAt, confirmed.body.estimate.updatedAt);
    assert.equal(confirmed.body.job.status, "queued");
    assert.equal(confirmed.body.job.estimateId, estimateId);
    assert.equal(confirmed.body.job.maximumAuthorizedMinor, 48000);
    assert.equal(confirmed.body.reservation.status, "active");
    assert.equal(confirmed.body.reservation.amountMinor, 48000);
    assert.equal(confirmed.body.reservation.generationJobId, confirmed.body.job.id);
    assert.equal(confirmed.body.ledgerEntry.type, "RESERVE");
    assert.equal(confirmed.body.ledgerEntry.amountMinor, -48000, "reserve is a negative signed debit");
    assert.equal(confirmed.body.ledgerEntry.generationJobId, confirmed.body.job.id);
    assert.equal(confirmed.body.wallet.balanceMinor, 2000, "wallet debited by the authorized maximum");

    // One-reservation ledger proof: exactly one RESERVE entry, one reservation,
    // one job, and the wallet ledger shows PURCHASE then RESERVE in order.
    const ledger = await client.getWalletLedger(walletId, { workspaceId: prepared.workspaceId, limit: 50 });
    assert.equal(ledger.status, 200);
    const types = ledger.body.entries.map((entry) => entry.type);
    assert.deepEqual(types, ["PURCHASE", "RESERVE"]);
    assert.equal(ledger.body.wallet.balanceMinor, 2000);

    const job = await client.getGenerationJob(confirmed.body.job.id, { workspaceId: prepared.workspaceId });
    assert.equal(job.status, 200, JSON.stringify(job.body));
    assert.equal(job.body.job.id, confirmed.body.job.id);
    assert.equal(job.body.reservation.id, confirmed.body.reservation.id);
    assert.equal(job.body.reservation.status, "active");
  });
});

test("G3 blocks confirmation when the wallet balance is below the authorized maximum", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g3-insufficient") });
    const prepared = await prepareApprovedBrand(client, "G3 insufficient");
    // Fund only 40,000 minor units; the authorized maximum is 48,000.
    await fundWallet(client, prepared.workspaceId, 40000);
    const { estimateId, estimate } = await createEstimate(client, prepared);

    const confirmed = await client.confirmGenerationEstimate(
      estimateId,
      {
        workspaceId: prepared.workspaceId,
        version: estimate.version,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: estimate.avatarProfileId,
        durationSeconds: 30
      },
      { idempotencyKey: "confirm-g3-insufficient" }
    );
    assert.equal(confirmed.status, 409, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.code, "CREDIT_BALANCE_INSUFFICIENT");
    // No reservation, job or debit is created for an insufficient confirmation.
    assert.equal(confirmed.body.job, undefined);
    assert.equal(confirmed.body.reservation, undefined);
  });
});

test("G3 rejects a changed script at confirmation with ESTIMATE_INPUT_CHANGED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g3-input") });
    const prepared = await prepareApprovedBrand(client, "G3 input");
    await fundWallet(client, prepared.workspaceId, 50000);
    const { estimateId, estimate } = await createEstimate(client, prepared);

    const changedScript = "31000000-0000-4000-8000-000000000099";
    const confirmed = await client.confirmGenerationEstimate(
      estimateId,
      {
        workspaceId: prepared.workspaceId,
        version: estimate.version,
        selectedScriptId: changedScript,
        avatarProfileId: estimate.avatarProfileId,
        durationSeconds: 30
      },
      { idempotencyKey: "confirm-g3-input" }
    );
    assert.equal(confirmed.status, 409, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.code, "ESTIMATE_INPUT_CHANGED");
  });
});

test("G3 rejects a stale estimate with ESTIMATE_EXPIRED", async () => {
  const env = { ...baseEnv, V0_ESTIMATE_TTL_MS: 1 };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g3-stale") });
    const prepared = await prepareApprovedBrand(client, "G3 stale");
    await fundWallet(client, prepared.workspaceId, 50000);
    const { estimateId, estimate } = await createEstimate(client, prepared);
    // Let the short estimate TTL elapse so the estimate is stale at confirmation.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const confirmed = await client.confirmGenerationEstimate(
      estimateId,
      {
        workspaceId: prepared.workspaceId,
        version: estimate.version,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: estimate.avatarProfileId,
        durationSeconds: 30
      },
      { idempotencyKey: "confirm-g3-stale" }
    );
    assert.equal(confirmed.status, 409, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.code, "ESTIMATE_EXPIRED");
  });
});

test("G3 rejects an optimistic-version mismatch with RESOURCE_VERSION_STALE", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g3-version") });
    const prepared = await prepareApprovedBrand(client, "G3 version");
    await fundWallet(client, prepared.workspaceId, 50000);
    const { estimateId, estimate } = await createEstimate(client, prepared);

    const confirmed = await client.confirmGenerationEstimate(
      estimateId,
      {
        workspaceId: prepared.workspaceId,
        version: estimate.version + 1,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: estimate.avatarProfileId,
        durationSeconds: 30
      },
      { idempotencyKey: "confirm-g3-version" }
    );
    assert.equal(confirmed.status, 409, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.code, "RESOURCE_VERSION_STALE");
  });
});

test("G3 prevents double-click and concurrent over-reservation and deduplicates idempotent replays", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g3-concurrent") });
    const prepared = await prepareApprovedBrand(client, "G3 concurrent");
    const walletId = await fundWallet(client, prepared.workspaceId, 50000);
    const { estimateId, estimate } = await createEstimate(client, prepared);

    const confirmInput = {
      workspaceId: prepared.workspaceId,
      version: estimate.version,
      selectedScriptId: SCRIPT_ID,
      avatarProfileId: estimate.avatarProfileId,
      durationSeconds: 30
    };

    // Two concurrent confirmations with different idempotency keys: only one
    // may reserve credits for the same estimate; the other is a conflict.
    const [first, second] = await Promise.all([
      client.confirmGenerationEstimate(estimateId, confirmInput, { idempotencyKey: "confirm-g3-concurrent-a" }),
      client.confirmGenerationEstimate(estimateId, confirmInput, { idempotencyKey: "confirm-g3-concurrent-b" })
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [202, 409], "one confirmation succeeds and one is a conflict");
    const conflict = first.status === 409 ? first : second;
    assert.equal(conflict.body.code, "CREDIT_RESERVATION_CONFLICT");

    // An idempotent replay with the winning key returns the original
    // confirmation and never reserves a second time.
    const winnerKey = first.status === 202 ? "confirm-g3-concurrent-a" : "confirm-g3-concurrent-b";
    const winner = first.status === 202 ? first : second;
    const replay = await client.confirmGenerationEstimate(estimateId, confirmInput, { idempotencyKey: winnerKey });
    assert.equal(replay.status, 202);
    assert.equal(replay.body.job.id, winner.body.job.id, "replay returns the same generation job");

    // Exactly one RESERVE ledger entry and one reservation exist regardless of
    // the concurrent attempts and the replay.
    const ledger = await client.getWalletLedger(walletId, { workspaceId: prepared.workspaceId, limit: 50 });
    const reserveEntries = ledger.body.entries.filter((entry) => entry.type === "RESERVE");
    assert.equal(reserveEntries.length, 1, "concurrent confirmation must not create a second debit");
    assert.equal(ledger.body.wallet.balanceMinor, 2000, "wallet debited exactly once");
  });
});

test("G3 requires an idempotency key to confirm a paid generation", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g3-idem") });
    const prepared = await prepareApprovedBrand(client, "G3 idem");
    await fundWallet(client, prepared.workspaceId, 50000);
    const { estimateId, estimate } = await createEstimate(client, prepared);

    const missing = await client.confirmGenerationEstimate(estimateId, {
      workspaceId: prepared.workspaceId,
      version: estimate.version,
      selectedScriptId: SCRIPT_ID,
      avatarProfileId: estimate.avatarProfileId,
      durationSeconds: 30
    });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.code, "IDEMPOTENCY_KEY_REQUIRED");
  });
});

test("G3 hides a cross-workspace estimate confirmation behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("g3-cross-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("g3-cross-b") });
    const preparedA = await prepareApprovedBrand(clientA, "G3 cross A");
    const preparedB = await prepareApprovedBrand(clientB, "G3 cross B");
    await fundWallet(clientA, preparedA.workspaceId, 50000);
    const { estimateId, estimate } = await createEstimate(clientA, preparedA);

    // Workspace B attempts to confirm workspace A's estimate. The estimate must
    // not leak; the error hides existence behind the same 404 as every
    // cross-workspace read, and the other workspace id never appears.
    const cross = await clientB.confirmGenerationEstimate(
      estimateId,
      {
        workspaceId: preparedB.workspaceId,
        version: estimate.version,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: estimate.avatarProfileId,
        durationSeconds: 30
      },
      { idempotencyKey: "confirm-g3-cross" }
    );
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(preparedA.workspaceId), false);
  });
});

test("G3 hides a cross-workspace generation job behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("g3-job-cross-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("g3-job-cross-b") });
    const preparedA = await prepareApprovedBrand(clientA, "G3 job cross A");
    const preparedB = await prepareApprovedBrand(clientB, "G3 job cross B");
    await fundWallet(clientA, preparedA.workspaceId, 50000);
    const { estimateId, estimate } = await createEstimate(clientA, preparedA);
    const confirmed = await clientA.confirmGenerationEstimate(
      estimateId,
      {
        workspaceId: preparedA.workspaceId,
        version: estimate.version,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: estimate.avatarProfileId,
        durationSeconds: 30
      },
      { idempotencyKey: "confirm-g3-job-cross" }
    );
    assert.equal(confirmed.status, 202);
    const jobId = confirmed.body.job.id;

    const cross = await clientB.getGenerationJob(jobId, { workspaceId: preparedB.workspaceId });
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

async function createEstimate(client, prepared) {
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
  return { estimateId: estimate.body.estimate.id, estimate: estimate.body.estimate };
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
