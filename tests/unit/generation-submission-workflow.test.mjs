import test from "node:test";
import assert from "node:assert/strict";
import {
  operationState,
  generationJobState,
  classifySubmissionError,
  deriveSubmissionState,
  submissionMarkup
} from "../../apps/web/src/generation-submission-workflow.mjs";

const FORBIDDEN = /\b(request_hash|requestHash|sha256|signature|secret|signed[_-]?url|b2|backblaze|hg_[a-z0-9_]+)\b/i;

function operation(status, overrides = {}) {
  return {
    id: "op-1",
    workspaceId: "ws-1",
    generationJobId: "job-1",
    provider: "heygen-simulator",
    operationType: "provider_generate",
    status,
    idempotencyKey: "submit-1",
    requestHash: "server-side-request-hash-secret",
    externalId: overrides.externalId ?? null,
    priceVersion: "v0.local.1",
    estimatedMaximumMinor: 48000,
    currency: "INR",
    retryAfterMs: overrides.retryAfterMs ?? null,
    lastErrorCode: overrides.lastErrorCode ?? null,
    submittedAt: "2026-06-26T00:00:00.000Z",
    acceptedAt: overrides.acceptedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    reconciledAt: overrides.reconciledAt ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  };
}

function job(status) {
  return {
    id: "job-1",
    workspaceId: "ws-1",
    estimateId: "est-1",
    brandProfileId: "brand-1",
    selectedScriptId: "script-1",
    avatarProfileId: "avatar-1",
    status,
    idempotencyKey: "confirm-1",
    version: 1,
    durationSeconds: 30,
    maximumAuthorizedMinor: 48000,
    currency: "INR",
    priceVersion: "v0.local.1",
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  };
}

test("operationState maps known provider operation statuses and preserves unknown", () => {
  for (const status of ["created", "submitting", "accepted", "unknown", "processing", "completed", "rejected", "failed", "cancelled"]) {
    assert.equal(operationState(operation(status)), status);
  }
  assert.equal(operationState(operation("nonsense")), "unknown");
  assert.equal(operationState(null), "unknown");
});

test("generationJobState maps all V0 Generation enum values and preserves unknown", () => {
  for (const status of ["queued", "submitting", "accepted", "unknown", "generating", "generated", "failed", "cancel_requested", "cancelled"]) {
    assert.equal(generationJobState(job(status)), status);
  }
  assert.equal(generationJobState(job("nonsense")), "unknown");
});

test("classifySubmissionError maps every V0-G4 provider guard code", () => {
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    GENERATION_JOB_NOT_SUBMITTABLE: "not-submittable",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    IDEMPOTENCY_KEY_REQUIRED: "idempotency-required",
    PROVIDER_RATE_LIMITED: "rate-limited",
    PROVIDER_OUTPUT_INVALID: "provider-invalid",
    PROVIDER_CALLBACK_INVALID: "callback-invalid"
  };
  for (const [code, state] of Object.entries(map)) {
    assert.equal(classifySubmissionError({ code }), state);
  }
  assert.equal(classifySubmissionError({ code: "UNMAPPED" }), "error");
  assert.equal(classifySubmissionError(null), "error");
});

test("deriveSubmissionState renders empty, loading, accepted, unknown, uncertain and replay phases", () => {
  assert.equal(deriveSubmissionState({ phase: "empty" }).banner.state, "empty");
  assert.equal(deriveSubmissionState({ phase: "loading" }).banner.state, "loading");

  const accepted = deriveSubmissionState({ phase: "ready", job: job("accepted"), operation: operation("accepted", { externalId: "hg_secret-ref-123", acceptedAt: "2026-06-26T00:00:01.000Z" }) });
  assert.equal(accepted.banner.state, "accepted");
  assert.equal(accepted.operation.externalId, "hg_secret-ref-123");
  assert.equal(accepted.unknown, false);

  const unknown = deriveSubmissionState({ phase: "ready", job: job("unknown"), operation: operation("unknown"), unknown: true });
  assert.equal(unknown.banner.state, "unknown");
  assert.equal(unknown.banner.text.includes("Do not submit again"), true);

  const uncertain = deriveSubmissionState({ phase: "ready", job: job("cancel_requested"), operation: operation("unknown"), uncertain: true });
  assert.equal(uncertain.banner.state, "cancel_requested");

  const replay = deriveSubmissionState({ phase: "ready", job: job("accepted"), operation: operation("accepted"), replay: true });
  assert.equal(replay.replay, true);
  assert.equal(replay.banner.text.includes("already submitted"), true);
});

test("deriveSubmissionState maps each submission error to a calm banner", () => {
  for (const code of ["WORKSPACE_ACCESS_DENIED", "PERMISSION_DENIED", "GENERATION_JOB_NOT_SUBMITTABLE", "IDEMPOTENCY_INPUT_CONFLICT", "IDEMPOTENCY_KEY_REQUIRED", "PROVIDER_RATE_LIMITED", "PROVIDER_OUTPUT_INVALID", "PROVIDER_CALLBACK_INVALID"]) {
    const descriptor = deriveSubmissionState({ phase: "error", error: { code, detail: "x" } });
    assert.equal(descriptor.banner.state, classifySubmissionError({ code }));
  }
});

test("submissionMarkup renders data-state attributes and never leaks the request hash, provider payload or external id", () => {
  const descriptor = deriveSubmissionState({
    phase: "ready",
    job: job("accepted"),
    operation: operation("accepted", { externalId: "hg_secret-ref-123", acceptedAt: "2026-06-26T00:00:01.000Z" })
  });
  const markup = submissionMarkup(descriptor);
  const html = `${markup.banner}${markup.job}${markup.operation}`;
  assert.match(markup.banner, /data-state="accepted"/);
  assert.match(markup.job, /data-testid="generation-submission-job"/);
  assert.match(markup.job, /data-state="accepted"/);
  assert.match(markup.operation, /data-testid="generation-submission-operation"/);
  assert.match(markup.operation, /data-state="accepted"/);
  assert.match(markup.operation, /Provider reference: retained/);
  // The raw provider external id, request hash, signature, secret and signed URL
  // never appear in the rendered markup.
  assert.equal(FORBIDDEN.test(html), false, `markup leaked a secret: ${html}`);
});

test("submissionMarkup omits the operation section when no operation is present", () => {
  const descriptor = deriveSubmissionState({ phase: "ready", job: job("cancelled") });
  const markup = submissionMarkup(descriptor);
  assert.equal(markup.operation, "");
  assert.match(markup.job, /data-state="cancelled"/);
});
