import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMinor,
  estimateState,
  reservationState,
  generationJobState,
  classifyConfirmationError,
  deriveConfirmationState,
  confirmationMarkup
} from "../../apps/web/src/generation-confirmation-workflow.mjs";

test("formatMinor renders integer minor units with integer math and never floats", () => {
  assert.equal(formatMinor(48000, "INR"), "INR 480.00");
  assert.equal(formatMinor(0, "INR"), "INR 0.00");
  // The authorized maximum for a 30-second v0.local.1 estimate is 48,000 minor.
  assert.equal(formatMinor(48000, "INR"), "INR 480.00");
  // A RESERVE debit renders as a negative signed amount.
  assert.equal(formatMinor(-48000, "INR"), "-INR 480.00");
  // No floating-point rounding: 1050 minor units is 10.50, not 10.4999...
  assert.equal(formatMinor(1050, "INR"), "INR 10.50");
});

test("estimateState maps awaiting and reserved estimates and preserves unknown", () => {
  assert.equal(estimateState({ status: "awaiting_confirmation" }), "awaiting");
  assert.equal(estimateState({ status: "credits_reserved" }), "reserved");
  assert.equal(estimateState({ status: "queued" }), "unknown");
  assert.equal(estimateState(null), "unknown");
});

test("reservationState maps the V0_STATUS_ENUMS Reservation contract and preserves unknown", () => {
  assert.equal(reservationState({ status: "active" }), "active");
  assert.equal(reservationState({ status: "captured" }), "captured");
  assert.equal(reservationState({ status: "released" }), "released");
  assert.equal(reservationState({ status: "expired" }), "expired");
  assert.equal(reservationState({ status: "adjusted" }), "adjusted");
  assert.equal(reservationState({ status: "ACTIVE" }), "active", "uppercase db enum is lowercased");
  assert.equal(reservationState({ status: "future_state" }), "unknown");
  assert.equal(reservationState(null), "unknown");
});

test("generationJobState maps the Generation contract and preserves unknown as a real state", () => {
  assert.equal(generationJobState({ status: "queued" }), "queued");
  assert.equal(generationJobState({ status: "submitting" }), "submitting");
  assert.equal(generationJobState({ status: "unknown" }), "unknown");
  assert.equal(generationJobState({ status: "generated" }), "generated");
  assert.equal(generationJobState({ status: "cancelled" }), "cancelled");
  assert.equal(generationJobState({ status: "not_a_real_status" }), "unknown");
  assert.equal(generationJobState(null), "unknown");
});

test("classifyConfirmationError maps every G3 guard to its own honest state", () => {
  assert.equal(classifyConfirmationError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyConfirmationError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyConfirmationError({ code: "CREDIT_BALANCE_INSUFFICIENT" }), "insufficient");
  assert.equal(classifyConfirmationError({ code: "ESTIMATE_EXPIRED" }), "expired");
  assert.equal(classifyConfirmationError({ code: "ESTIMATE_INPUT_CHANGED" }), "input-changed");
  assert.equal(classifyConfirmationError({ code: "RESOURCE_VERSION_STALE" }), "stale");
  assert.equal(classifyConfirmationError({ code: "CREDIT_RESERVATION_CONFLICT" }), "conflict");
  assert.equal(classifyConfirmationError({ code: "IDEMPOTENCY_KEY_REQUIRED" }), "idempotency-required");
  assert.equal(classifyConfirmationError({ code: "UNMAPPED_CODE" }), "error");
  assert.equal(classifyConfirmationError(null), "error");
  assert.equal(classifyConfirmationError({}), "error");
});

test("deriveConfirmationState renders empty, loading, ready and error phases", () => {
  assert.equal(deriveConfirmationState({ phase: "empty" }).banner.state, "empty");
  assert.equal(deriveConfirmationState({ phase: "loading" }).banner.state, "loading");

  const ready = deriveConfirmationState({
    phase: "ready",
    estimate: estimate("est-1", "credits_reserved"),
    wallet: { id: "w1", currency: "INR", balanceMinor: 2000 },
    confirmation: {
      job: { id: "job-1", status: "queued", estimateId: "est-1", maximumAuthorizedMinor: 48000 },
      reservation: { id: "res-1", status: "active", amountMinor: 48000, currency: "INR", generationJobId: "job-1" },
      ledgerEntry: { type: "RESERVE", amountMinor: -48000, currency: "INR", generationJobId: "job-1" }
    }
  });
  assert.equal(ready.banner.state, "reserved");
  assert.match(ready.banner.text, /Provider submission has not started/);
  assert.equal(ready.estimate.state, "reserved");
  assert.equal(ready.estimate.maximumAuthorizedDisplay, "INR 480.00");
  assert.equal(ready.wallet.balanceDisplay, "INR 20.00");
  assert.equal(ready.confirmation.job.state, "queued");
  assert.equal(ready.confirmation.reservation.state, "active");
  assert.equal(ready.confirmation.reservation.amountDisplay, "INR 480.00");
  assert.equal(ready.confirmation.ledgerEntry.amountDisplay, "-INR 480.00");

  const loading = deriveConfirmationState({ phase: "loading" });
  assert.equal(loading.banner.state, "loading");
  assert.equal(loading.estimate, null);
  assert.equal(loading.confirmation, null);
});

test("deriveConfirmationState maps each error code to its banner state and a calm message", () => {
  const insufficient = deriveConfirmationState({ phase: "error", error: { code: "CREDIT_BALANCE_INSUFFICIENT" } });
  assert.equal(insufficient.banner.state, "insufficient");
  assert.match(insufficient.banner.text, /Add creator credits/);

  const expired = deriveConfirmationState({ phase: "error", error: { code: "ESTIMATE_EXPIRED" } });
  assert.equal(expired.banner.state, "expired");
  assert.match(expired.banner.text, /estimate expired/);

  const changed = deriveConfirmationState({ phase: "error", error: { code: "ESTIMATE_INPUT_CHANGED" } });
  assert.equal(changed.banner.state, "input-changed");
  assert.match(changed.banner.text, /script, avatar or settings changed/);

  const stale = deriveConfirmationState({ phase: "error", error: { code: "RESOURCE_VERSION_STALE" } });
  assert.equal(stale.banner.state, "stale");
  assert.match(stale.banner.text, /changed after you opened it/);

  const conflict = deriveConfirmationState({ phase: "error", error: { code: "CREDIT_RESERVATION_CONFLICT" } });
  assert.equal(conflict.banner.state, "conflict");
  assert.match(conflict.banner.text, /already reserved/);

  const blocked = deriveConfirmationState({ phase: "error", error: { code: "WORKSPACE_ACCESS_DENIED" } });
  assert.equal(blocked.banner.state, "blocked-hidden");
  // A cross-workspace error never names the other workspace or estimate id.
  assert.equal(/est-1|ws-other/.test(blocked.banner.text), false);
});

test("confirmationMarkup renders the estimate, wallet and confirmation with data-state and no secrets", () => {
  const markup = confirmationMarkup(
    deriveConfirmationState({
      phase: "ready",
      estimate: estimate("est-1", "credits_reserved"),
      wallet: { id: "w1", currency: "INR", balanceMinor: 2000 },
      confirmation: {
        job: { id: "job-1", status: "queued", estimateId: "est-1", maximumAuthorizedMinor: 48000 },
        reservation: { id: "res-1", status: "active", amountMinor: 48000, currency: "INR", generationJobId: "job-1" },
        ledgerEntry: { type: "RESERVE", amountMinor: -48000, currency: "INR", generationJobId: "job-1" }
      }
    })
  );
  assert.match(markup.banner, /data-testid="generation-confirmation-status" data-state="reserved"/);
  assert.match(markup.estimate, /data-testid="generation-estimate" data-estimate-id="est-1" data-state="reserved"/);
  assert.match(markup.estimate, /Maximum authorization: INR 480.00/);
  assert.match(markup.estimate, /Price version: v0.local.1/);
  assert.match(markup.wallet, /data-testid="generation-wallet-balance" data-state="ready" data-currency="INR"/);
  assert.match(markup.wallet, /Wallet balance: INR 20.00/);
  assert.match(markup.confirmation, /data-testid="generation-confirmation" data-state="reserved"/);
  assert.match(markup.confirmation, /Generation job: queued/);
  assert.match(markup.confirmation, /Ledger: RESERVE -INR 480.00/);
  // The input hash, signed URLs, provider payloads and secrets never appear.
  const all = markup.banner + markup.estimate + markup.wallet + markup.confirmation;
  assert.equal(/\b(input_hash|inputHash|sha256|signature|secret|signed[_-]?url|b2|backblaze)\b/i.test(all), false);
});

test("confirmationMarkup hides the wallet and confirmation sections when they are absent", () => {
  const markup = confirmationMarkup(
    deriveConfirmationState({
      phase: "estimate",
      estimate: estimate("est-1", "awaiting_confirmation"),
      wallet: null,
      confirmation: null
    })
  );
  assert.equal(markup.wallet, "");
  assert.equal(markup.confirmation, "");
  assert.match(markup.estimate, /data-state="awaiting"/);
});

function estimate(id, status) {
  return {
    id,
    status,
    provider: "heygen-simulator",
    priceVersion: "v0.local.1",
    currency: "INR",
    maximumAuthorizedMinor: 48000,
    version: 1,
    expiresAt: "2026-06-26T06:00:00.000Z",
    durationSeconds: 30,
    avatarProfileId: "avatar-1"
  };
}
