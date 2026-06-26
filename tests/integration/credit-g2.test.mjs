import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";
const simulatorSecret = "test-payment-simulator-secret";

const env = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken,
  V0_PAYMENT_SIMULATOR_SECRET: simulatorSecret
};

// V0-G2 creator wallet and verified credit purchase. Deterministic Razorpay
// (India, INR) and Stripe (international) simulators sign payment callbacks;
// the handler verifies the signature over the canonical envelope, enforces a
// timestamp window, deduplicates by provider event id, reconciles amount,
// currency, provider reference and workspace, then transitions the purchase and
// writes an append-only ledger entry. Forged or replayed callbacks and amount
// or currency mismatches must never create duplicate credit or edit ledger
// history. Money is integer minor units only; payment instrument details are
// never stored.
test("G2 verifies a signed Razorpay callback, credits the wallet and writes a PURCHASE ledger entry in integer minor units", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g2-owner") });
    const workspaceId = await createWorkspace(client, "G2 razorpay");

    const purchase = await client.createCreditPurchase(
      {
        workspaceId,
        provider: "razorpay",
        currency: "INR",
        amountMinor: 50000
      },
      { idempotencyKey: "purchase-razorpay-1" }
    );
    assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
    assert.equal(purchase.body.purchase.provider, "razorpay");
    assert.equal(purchase.body.purchase.currency, "INR");
    assert.equal(purchase.body.purchase.amountMinor, 50000);
    assert.equal(purchase.body.purchase.status, "initiated");
    assert.ok(purchase.body.purchase.providerReference, "simulator provider reference");
    assert.ok(purchase.body.wallet.id, "wallet id is returned");
    assert.equal(purchase.body.wallet.currency, "INR");
    // The simulator returns the signed callback envelope so the test can deliver
    // the webhook exactly as the provider would. The signing secret never
    // appears in the response.
    assert.ok(purchase.body.checkout.envelope);
    assert.ok(purchase.body.checkout.signature);
    assert.equal(/test-payment-simulator-secret/i.test(JSON.stringify(purchase.body)), false);
    assert.equal(/instrument|card|cvv|pan|expiry/i.test(JSON.stringify(purchase.body)), false);

    const callback = await client.postRazorpayCallback(
      purchase.body.checkout.envelope,
      purchase.body.checkout.signature
    );
    assert.equal(callback.status, 200, JSON.stringify(callback.body));
    assert.equal(callback.body.purchase.status, "succeeded");
    assert.equal(callback.body.ledgerEntry.type, "PURCHASE");
    assert.equal(callback.body.ledgerEntry.amountMinor, 50000);
    assert.equal(callback.body.ledgerEntry.currency, "INR");
    assert.equal(callback.body.wallet.balanceMinor, 50000);

    const ledger = await client.getWalletLedger(purchase.body.wallet.id, { workspaceId, limit: 50 });
    assert.equal(ledger.status, 200, JSON.stringify(ledger.body));
    assert.equal(ledger.body.wallet.balanceMinor, 50000);
    assert.equal(ledger.body.entries.length, 1);
    assert.equal(ledger.body.entries[0].type, "PURCHASE");
    assert.equal(ledger.body.entries[0].amountMinor, 50000);
    // Running balance is present and integer minor units only.
    assert.equal(ledger.body.entries[0].runningBalanceMinor, 50000);
    assert.equal(Number.isInteger(ledger.body.entries[0].amountMinor), true);
  });
});

test("G2 rejects a forged callback signature with PAYMENT_SIGNATURE_INVALID and writes no ledger entry", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g2-forged") });
    const workspaceId = await createWorkspace(client, "G2 forged");
    const purchase = await client.createCreditPurchase(
      { workspaceId, provider: "razorpay", currency: "INR", amountMinor: 30000 },
      { idempotencyKey: "purchase-forged-1" }
    );
    assert.equal(purchase.status, 202);

    const forged = await client.postRazorpayCallback(purchase.body.checkout.envelope, "deadbeef");
    assert.equal(forged.status, 401, JSON.stringify(forged.body));
    assert.equal(forged.body.code, "PAYMENT_SIGNATURE_INVALID");

    const ledger = await client.getWalletLedger(purchase.body.wallet.id, { workspaceId, limit: 50 });
    assert.equal(ledger.status, 200);
    assert.equal(ledger.body.entries.length, 0, "no ledger entry for a forged callback");
    assert.equal(ledger.body.wallet.balanceMinor, 0);
  });
});

test("G2 deduplicates a replayed callback to one transition and never credits twice", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g2-replay") });
    const workspaceId = await createWorkspace(client, "G2 replay");
    const purchase = await client.createCreditPurchase(
      { workspaceId, provider: "razorpay", currency: "INR", amountMinor: 20000 },
      { idempotencyKey: "purchase-replay-1" }
    );
    const envelope = purchase.body.checkout.envelope;
    const signature = purchase.body.checkout.signature;

    const first = await client.postRazorpayCallback(envelope, signature);
    assert.equal(first.status, 200);
    assert.equal(first.body.purchase.status, "succeeded");

    const replay = await client.postRazorpayCallback(envelope, signature);
    assert.equal(replay.status, 200, "a duplicate callback acknowledges, not errors");
    assert.equal(replay.body.purchase.status, "succeeded");
    assert.equal(replay.body.duplicate, true, "duplicate flag marks the deduplicated transition");

    const ledger = await client.getWalletLedger(purchase.body.wallet.id, { workspaceId, limit: 50 });
    assert.equal(ledger.body.entries.length, 1, "replay must not create a second ledger entry");
    assert.equal(ledger.body.wallet.balanceMinor, 20000, "wallet credited exactly once");
  });
});

test("G2 rejects amount and currency mismatches with PAYMENT_AMOUNT_MISMATCH and credits nothing", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g2-mismatch") });
    const workspaceId = await createWorkspace(client, "G2 mismatch");
    const purchase = await client.createCreditPurchase(
      { workspaceId, provider: "razorpay", currency: "INR", amountMinor: 10000 },
      { idempotencyKey: "purchase-mismatch-1" }
    );

    // Tamper the amount in the envelope but keep the old signature: the
    // canonical-form signature verification catches the tampering first.
    const tamperedAmount = { ...purchase.body.checkout.envelope, amountMinor: 99999999 };
    const amountTamper = await client.postRazorpayCallback(tamperedAmount, purchase.body.checkout.signature);
    assert.equal(amountTamper.status, 401, JSON.stringify(amountTamper.body));
    assert.equal(amountTamper.body.code, "PAYMENT_SIGNATURE_INVALID");

    // A correctly-signed envelope with the wrong currency is a reconciliation
    // failure, not a signature failure.
    const wrongCurrencyEnvelope = await signEnvelope(
      { ...purchase.body.checkout.envelope, currency: "USD" },
      simulatorSecret
    );
    const currencyMismatch = await client.postRazorpayCallback(
      wrongCurrencyEnvelope.envelope,
      wrongCurrencyEnvelope.signature
    );
    assert.equal(currencyMismatch.status, 409, JSON.stringify(currencyMismatch.body));
    assert.equal(currencyMismatch.body.code, "PAYMENT_AMOUNT_MISMATCH");

    const ledger = await client.getWalletLedger(purchase.body.wallet.id, { workspaceId, limit: 50 });
    assert.equal(ledger.body.entries.length, 0, "no credit for mismatched callbacks");
    assert.equal(ledger.body.wallet.balanceMinor, 0);
  });
});

test("G2 models refund and dispute callbacks as append-only REFUND ledger entries that debit the wallet", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g2-refund") });
    const workspaceId = await createWorkspace(client, "G2 refund");
    const purchase = await client.createCreditPurchase(
      { workspaceId, provider: "stripe", currency: "USD", amountMinor: 2500 },
      { idempotencyKey: "purchase-stripe-1" }
    );
    assert.equal(purchase.body.purchase.provider, "stripe");
    assert.equal(purchase.body.purchase.currency, "USD");

    const paid = await client.postStripeCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);
    assert.equal(paid.status, 200);
    assert.equal(paid.body.purchase.status, "succeeded");
    assert.equal(paid.body.wallet.balanceMinor, 2500);

    const refundEnvelope = await signEnvelope(
      {
        ...purchase.body.checkout.envelope,
        eventType: "payment.refunded",
        eventId: `${purchase.body.checkout.envelope.eventId}-refund`
      },
      simulatorSecret
    );
    const refund = await client.postStripeCallback(refundEnvelope.envelope, refundEnvelope.signature);
    assert.equal(refund.status, 200, JSON.stringify(refund.body));
    assert.equal(refund.body.purchase.status, "refunded");
    assert.equal(refund.body.ledgerEntry.type, "REFUND");
    assert.equal(refund.body.ledgerEntry.amountMinor, -2500, "refund is a negative signed entry");
    assert.equal(refund.body.wallet.balanceMinor, 0);

    const disputeEnvelope = await signEnvelope(
      {
        ...purchase.body.checkout.envelope,
        eventType: "payment.disputed",
        eventId: `${purchase.body.checkout.envelope.eventId}-dispute`
      },
      simulatorSecret
    );
    // A second purchase to dispute, so the dispute reversal is observable.
    const purchase2 = await client.createCreditPurchase(
      { workspaceId, provider: "stripe", currency: "USD", amountMinor: 1500 },
      { idempotencyKey: "purchase-stripe-2" }
    );
    const paid2 = await client.postStripeCallback(purchase2.body.checkout.envelope, purchase2.body.checkout.signature);
    assert.equal(paid2.status, 200);
    assert.equal(paid2.body.wallet.balanceMinor, 1500);

    const disputeFor2 = await signEnvelope(
      {
        ...purchase2.body.checkout.envelope,
        eventType: "payment.disputed",
        eventId: `${purchase2.body.checkout.envelope.eventId}-dispute`
      },
      simulatorSecret
    );
    const dispute = await client.postStripeCallback(disputeFor2.envelope, disputeFor2.signature);
    assert.equal(dispute.status, 200, JSON.stringify(dispute.body));
    assert.equal(dispute.body.purchase.status, "disputed");
    assert.equal(dispute.body.ledgerEntry.type, "REFUND");
    assert.equal(dispute.body.ledgerEntry.amountMinor, -1500);
    assert.equal(dispute.body.wallet.balanceMinor, 0);

    const ledger = await client.getWalletLedger(purchase.body.wallet.id, { workspaceId, limit: 50 });
    // Ledger is append-only: PURCHASE, REFUND, PURCHASE(2), REFUND(dispute) for
    // the same USD wallet, never edited in place.
    const types = ledger.body.entries.map((entry) => entry.type);
    assert.deepEqual(types, ["PURCHASE", "REFUND", "PURCHASE", "REFUND"]);
    assert.equal(ledger.body.wallet.balanceMinor, 0);
  });
});

test("G2 lets an Owner record a compensating credit adjustment as an append-only ADJUSTMENT entry", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const owner = new V0Client({ baseUrl, authToken: signJwt("g2-adj-owner") });
    const workspaceId = await createWorkspace(owner, "G2 adjustment");
    const purchase = await owner.createCreditPurchase(
      { workspaceId, provider: "razorpay", currency: "INR", amountMinor: 10000 },
      { idempotencyKey: "purchase-adj-1" }
    );
    const paid = await owner.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);
    assert.equal(paid.status, 200);
    const walletId = purchase.body.wallet.id;

    const adjustment = await owner.createCreditAdjustment(
      walletId,
      { workspaceId, direction: "credit", amountMinor: 5000, currency: "INR", reason: "goodwill credit for delayed generation" },
      { idempotencyKey: "adjustment-1" }
    );
    assert.equal(adjustment.status, 200, JSON.stringify(adjustment.body));
    assert.equal(adjustment.body.ledgerEntry.type, "ADJUSTMENT");
    assert.equal(adjustment.body.ledgerEntry.amountMinor, 5000);
    assert.equal(adjustment.body.ledgerEntry.reason, "goodwill credit for delayed generation");
    assert.equal(adjustment.body.wallet.balanceMinor, 15000);

    // A debit adjustment is a negative signed entry that reduces the balance.
    const debit = await owner.createCreditAdjustment(
      walletId,
      { workspaceId, direction: "debit", amountMinor: 2000, currency: "INR", reason: "correct over-credit" },
      { idempotencyKey: "adjustment-2" }
    );
    assert.equal(debit.status, 200, JSON.stringify(debit.body));
    assert.equal(debit.body.ledgerEntry.type, "ADJUSTMENT");
    assert.equal(debit.body.ledgerEntry.amountMinor, -2000);
    assert.equal(debit.body.wallet.balanceMinor, 13000);

    // A cross-workspace wallet id is hidden behind WORKSPACE_ACCESS_DENIED; the
    // other workspace's id must not leak into the error body.
    const other = new V0Client({ baseUrl, authToken: signJwt("g2-adj-other") });
    const otherWorkspaceId = await createWorkspace(other, "G2 adjustment other");
    const cross = await other.createCreditAdjustment(
      walletId,
      { workspaceId: otherWorkspaceId, direction: "credit", amountMinor: 1000, currency: "INR", reason: "cross-tenant" },
      { idempotencyKey: "adjustment-3" }
    );
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(workspaceId), false);

    const ledger = await owner.getWalletLedger(walletId, { workspaceId, limit: 50 });
    const types = ledger.body.entries.map((entry) => entry.type);
    assert.deepEqual(types, ["PURCHASE", "ADJUSTMENT", "ADJUSTMENT"], "adjustments are append-only alongside the purchase");
    assert.equal(ledger.body.wallet.balanceMinor, 13000);
  });
});

test("G2 reconciliation summary matches the wallet ledger totals against the deterministic simulator", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g2-reconcile") });
    const workspaceId = await createWorkspace(client, "G2 reconcile");
    const purchase = await client.createCreditPurchase(
      { workspaceId, provider: "razorpay", currency: "INR", amountMinor: 40000 },
      { idempotencyKey: "purchase-reconcile-1" }
    );
    await client.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);

    const ledger = await client.getWalletLedger(purchase.body.wallet.id, { workspaceId, limit: 50 });
    assert.equal(ledger.status, 200);
    assert.ok(ledger.body.reconciliation, "Owner/Admin ledger view carries a reconciliation summary");
    assert.equal(ledger.body.reconciliation.ledgerPurchaseMinor, 40000);
    assert.equal(ledger.body.reconciliation.ledgerRefundMinor, 0);
    assert.equal(ledger.body.reconciliation.simulatorPaidMinor, 40000);
    assert.equal(ledger.body.reconciliation.matched, true);
  });
});

test("G2 enforces provider currency policy: Razorpay is INR only and Stripe is international only", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g2-policy") });
    const workspaceId = await createWorkspace(client, "G2 policy");

    const razorpayUsd = await client.createCreditPurchase(
      { workspaceId, provider: "razorpay", currency: "USD", amountMinor: 1000 },
      { idempotencyKey: "purchase-policy-1" }
    );
    assert.equal(razorpayUsd.status, 422, JSON.stringify(razorpayUsd.body));

    const stripeInr = await client.createCreditPurchase(
      { workspaceId, provider: "stripe", currency: "INR", amountMinor: 1000 },
      { idempotencyKey: "purchase-policy-2" }
    );
    assert.equal(stripeInr.status, 422, JSON.stringify(stripeInr.body));

    // Auto-select by currency when provider is omitted: INR -> razorpay.
    const autoInr = await client.createCreditPurchase(
      { workspaceId, currency: "INR", amountMinor: 1000 },
      { idempotencyKey: "purchase-policy-3" }
    );
    assert.equal(autoInr.status, 202);
    assert.equal(autoInr.body.purchase.provider, "razorpay");

    const autoUsd = await client.createCreditPurchase(
      { workspaceId, currency: "USD", amountMinor: 1000 },
      { idempotencyKey: "purchase-policy-4" }
    );
    assert.equal(autoUsd.status, 202);
    assert.equal(autoUsd.body.purchase.provider, "stripe");
  });
});

test("G2 requires an idempotency key for credit purchases and adjustments", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g2-idem") });
    const workspaceId = await createWorkspace(client, "G2 idem");
    const missingKey = await client.createCreditPurchase({
      workspaceId,
      provider: "razorpay",
      currency: "INR",
      amountMinor: 1000
    });
    assert.equal(missingKey.status, 400);
    assert.equal(missingKey.body.code, "IDEMPOTENCY_KEY_REQUIRED");
  });
});

test("G2 hides a cross-workspace wallet ledger behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("g2-ws-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("g2-ws-b") });
    const workspaceA = await createWorkspace(clientA, "G2 ws A");
    const workspaceB = await createWorkspace(clientB, "G2 ws B");
    const purchaseB = await clientB.createCreditPurchase(
      { workspaceId: workspaceB, provider: "razorpay", currency: "INR", amountMinor: 1000 },
      { idempotencyKey: "purchase-cross-1" }
    );
    const walletB = purchaseB.body.wallet.id;

    const cross = await clientA.getWalletLedger(walletB, { workspaceId: workspaceA, limit: 50 });
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(workspaceB), false);
  });
});

async function createWorkspace(client, label) {
  const created = await client.createWorkspace({ name: `${label} ${Math.random().toString(36).slice(2, 8)}` }, { idempotencyKey: `ws-${Math.random().toString(36).slice(2)}` });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.workspace.id;
}

async function signEnvelope(envelope, secret) {
  const canonical = stableCanonical(envelope);
  const signature = createHmac("sha256", secret).update(canonical).digest("hex");
  return { envelope, signature };
}

function stableCanonical(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableCanonical).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableCanonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function signJwt(userId) {
  return signJwtWithMembership(userId, "OWNER");
}

function signJwtWithMembership(userId, role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: `${userId}@example.test`,
      aud: "authenticated",
      role: "authenticated",
      app_role: role,
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
