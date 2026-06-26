import test from "node:test";
import assert from "node:assert/strict";
import {
  reservationState,
  settlementOutcome,
  classifySettlementError,
  deriveSettlementState,
  settlementMarkup
} from "../../apps/web/src/generation-settlement-workflow.mjs";

// The transient provider URL, provider external id, raw content hash, signature,
// secret and signed URL never appear in the rendered markup. The external id pattern
// mirrors the G4 submission guard.
const FORBIDDEN = /\b(request_hash|requestHash|sha256|signature|secret|signed[_-]?url|b2|backblaze|hg_[a-z0-9_]+|https?:\/\/)/i;

function capturedBody(overrides = {}) {
  return {
    outcome: "captured",
    replay: false,
    operation: { id: "op-1", status: "completed", provider: "heygen-simulator", providerTotalMinor: 48000 },
    job: { id: "job-1", status: "generated" },
    artifact: {
      id: "art-1",
      status: "CLEAN",
      contentType: "video/mp4",
      sha256: "deadbeef".repeat(8)
    },
    segment: {
      id: "seg-1",
      durationSeconds: 30,
      contentType: "video/mp4",
      sha256: "deadbeef".repeat(8),
      externalId: "hg_secret-ref-123"
    },
    asset: { id: "asset-1", version: 1, status: "CLEAN", kind: "provider_video" },
    lineage: {
      id: "lin-1",
      generationJobId: "job-1",
      provider: "heygen-simulator",
      priceVersion: "v0.local.1"
    },
    ledgerEntry: { type: "CAPTURE", amountMinor: 0, currency: "INR" },
    reservation: { id: "res-1", status: "captured", amountMinor: 48000, currency: "INR" },
    wallet: { id: "wallet-1", balanceMinor: 2000, currency: "INR" },
    ...overrides
  };
}

function releasedBody() {
  return {
    outcome: "released",
    replay: false,
    operation: { id: "op-1", status: "failed" },
    job: { id: "job-1", status: "failed" },
    artifact: null,
    segment: null,
    asset: null,
    lineage: null,
    ledgerEntry: { type: "RELEASE", amountMinor: 48000, currency: "INR" },
    reservation: { id: "res-1", status: "released", amountMinor: 48000, currency: "INR" },
    wallet: { id: "wallet-1", balanceMinor: 50000, currency: "INR" }
  };
}

test("reservationState maps known reservation statuses and preserves unknown", () => {
  for (const status of ["active", "captured", "released", "expired", "adjusted"]) {
    assert.equal(reservationState({ status }), status);
  }
  assert.equal(reservationState({ status: "nonsense" }), "unknown");
  assert.equal(reservationState(null), "unknown");
});

test("settlementOutcome maps captured and released and preserves unknown", () => {
  assert.equal(settlementOutcome({ outcome: "captured" }), "captured");
  assert.equal(settlementOutcome({ outcome: "released" }), "released");
  assert.equal(settlementOutcome({ outcome: "nonsense" }), "unknown");
  assert.equal(settlementOutcome(null), "unknown");
});

test("classifySettlementError maps every V0-G5 settlement guard code", () => {
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    GENERATION_JOB_NOT_SUBMITTABLE: "not-submittable",
    PROVIDER_COST_EXCEEDS_AUTHORIZATION: "cost-exceeds",
    ASSET_MEDIA_MALFORMED: "media-malformed",
    DEPENDENCY_UNAVAILABLE: "dependency-unavailable",
    IDEMPOTENCY_KEY_REQUIRED: "idempotency-required"
  };
  for (const [code, state] of Object.entries(map)) {
    assert.equal(classifySettlementError({ code }), state);
  }
  assert.equal(classifySettlementError({ code: "UNMAPPED" }), "error");
  assert.equal(classifySettlementError(null), "error");
});

test("deriveSettlementState renders empty, loading, captured, released and replay phases", () => {
  assert.equal(deriveSettlementState({ phase: "empty" }).banner.state, "empty");
  assert.equal(deriveSettlementState({ phase: "loading" }).banner.state, "loading");

  const captured = deriveSettlementState({ phase: "ready", body: capturedBody() });
  assert.equal(captured.banner.state, "captured");
  assert.equal(captured.outcome, "captured");
  assert.equal(captured.replay, false);
  assert.equal(captured.media.artifact.state, "clean");
  assert.equal(captured.reservation.state, "captured");
  assert.equal(captured.ledger.type, "CAPTURE");

  const released = deriveSettlementState({ phase: "ready", body: releasedBody() });
  assert.equal(released.banner.state, "released");
  assert.equal(released.outcome, "released");
  assert.equal(released.media, null);
  assert.equal(released.reservation.state, "released");

  const replay = deriveSettlementState({ phase: "ready", body: capturedBody({ replay: true }) });
  assert.equal(replay.replay, true);
  assert.equal(replay.banner.text.includes("already settled"), true);
});

test("deriveSettlementState maps each settlement error to a calm banner", () => {
  for (const code of [
    "WORKSPACE_ACCESS_DENIED",
    "PERMISSION_DENIED",
    "GENERATION_JOB_NOT_SUBMITTABLE",
    "PROVIDER_COST_EXCEEDS_AUTHORIZATION",
    "ASSET_MEDIA_MALFORMED",
    "DEPENDENCY_UNAVAILABLE",
    "IDEMPOTENCY_KEY_REQUIRED"
  ]) {
    const descriptor = deriveSettlementState({ phase: "error", error: { code, detail: "x" } });
    assert.equal(descriptor.banner.state, classifySettlementError({ code }));
  }
});

test("settlementMarkup renders data-state attributes and never leaks the provider external id, hash or URL", () => {
  const descriptor = deriveSettlementState({ phase: "ready", body: capturedBody() });
  const markup = settlementMarkup(descriptor);
  const html = `${markup.banner}${markup.media}${markup.ledger}${markup.reservation}${markup.wallet}`;
  assert.match(markup.banner, /data-state="captured"/);
  assert.match(markup.media, /data-testid="generation-settlement-media"/);
  assert.match(markup.media, /data-state="clean"/);
  assert.match(markup.media, /Provider reference: retained/);
  assert.match(markup.ledger, /data-state="capture"/);
  assert.match(markup.reservation, /data-state="captured"/);
  // The raw provider external id, content hash, transient URL, signature, secret and
  // signed URL never appear in the rendered markup.
  assert.equal(FORBIDDEN.test(html), false, `markup leaked a secret: ${html}`);
});

test("settlementMarkup omits the media section for a released settlement", () => {
  const descriptor = deriveSettlementState({ phase: "ready", body: releasedBody() });
  const markup = settlementMarkup(descriptor);
  assert.equal(markup.media, "");
  assert.match(markup.reservation, /data-state="released"/);
});
