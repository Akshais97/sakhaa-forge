import test from "node:test";
import assert from "node:assert/strict";
import {
  verificationState,
  classifyVerifyError,
  deriveVerifyState,
  verifyMarkup
} from "../../apps/web/src/verify-workflow.mjs";

// No secret, signed URL, object key, recipient user id, payload hash, raw observed identity value
// or provider payload appears in the rendered markup. The audience evidence sha256 is a public
// content fingerprint and IS rendered; the evidence object key is never rendered.
const FORBIDDEN = /\b(secret|api[_-]?key|signature|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user|observed[_-]?account|observed[_-]?media|credential)\b/i;

const EVIDENCE_SHA = "c".repeat(64);

function verifiedBody(overrides = {}) {
  return {
    calendarPost: {
      id: "cal-1",
      status: "published_verified",
      platform: "meta",
      account: "sunrise-estates",
      manualExport: false,
      manualLiveUrl: null
    },
    verification: {
      id: "pv-1",
      calendarPostId: "cal-1",
      provider: "verify-simulator",
      status: "verified",
      attempts: 1,
      accountMatched: true,
      mediaSha256Matched: true,
      captionMatched: true,
      visibility: "public",
      evidenceArtifactId: "ev-1",
      verifiedAt: "2999-01-01T03:32:00.000Z",
      createdAt: "2999-01-01T03:31:30.000Z",
      updatedAt: "2999-01-01T03:32:00.000Z"
    },
    evidenceArtifact: {
      id: "ev-1",
      sha256: EVIDENCE_SHA,
      status: "CLEAN",
      retentionClass: "audience-evidence",
      schemaVersion: "calendar.verify_evidence.v1"
    },
    notification: {
      id: "n-1",
      notificationType: "publish_completed",
      channel: "in_app",
      status: "sent",
      duplicateCollapsed: false
    },
    performanceSnapshot: {
      id: "ps-1",
      calendarPostId: "cal-1",
      platform: "meta",
      source: "audience_verification_initial",
      observationWindowStart: "2999-01-01T03:32:00.000Z",
      observationWindowEnd: "2999-01-01T03:32:00.000Z"
    },
    replay: false,
    ...overrides
  };
}

function processingWaitBody(overrides = {}) {
  return {
    code: "VERIFY_PROCESSING_WAIT",
    message: "The platform is still processing the post. We will check again.",
    calendarPost: {
      id: "cal-1",
      status: "accepted",
      platform: "meta",
      account: "sunrise-estates",
      manualExport: false,
      manualLiveUrl: null
    },
    retryAfterMs: 60000,
    ...overrides
  };
}

test("verificationState maps known verification statuses and preserves unknown", () => {
  for (const status of [
    "pending",
    "checking",
    "processing_wait",
    "retry_scheduled",
    "verified",
    "failed",
    "identity_mismatch",
    "visibility_restricted",
    "manual_url_required"
  ]) {
    assert.equal(verificationState({ verification: { status } }), status);
  }
  assert.equal(verificationState({ verification: { status: "nonsense" } }), "unknown");
  assert.equal(verificationState(null), "unknown");
});

test("classifyVerifyError maps each verify and access error to a stable banner state", () => {
  assert.equal(classifyVerifyError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyVerifyError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyVerifyError({ code: "VERIFY_IDENTITY_MISMATCH" }), "identity-mismatch");
  assert.equal(classifyVerifyError({ code: "VERIFY_VISIBILITY_RESTRICTED" }), "visibility-restricted");
  assert.equal(classifyVerifyError({ code: "VERIFY_MANUAL_URL_REQUIRED" }), "manual-url-required");
  assert.equal(classifyVerifyError({ code: "PROVIDER_OUTPUT_INVALID" }), "verify-invalid");
  assert.equal(classifyVerifyError({ code: "VALIDATION_FAILED" }), "verify-invalid");
  assert.equal(classifyVerifyError({ code: "UNEXPECTED" }), "error");
  assert.equal(classifyVerifyError(null), "error");
});

test("deriveVerifyState shows verified with the evidence sha256 and one notification when verified", () => {
  const descriptor = deriveVerifyState({ phase: "ready", body: verifiedBody() });
  assert.equal(descriptor.banner.state, "verified");
  assert.equal(descriptor.verification.status, "verified");
  assert.equal(descriptor.verification.provider, "verify-simulator");
  assert.equal(descriptor.verification.accountMatched, true);
  assert.equal(descriptor.verification.mediaSha256Matched, true);
  assert.equal(descriptor.verification.evidenceArtifactId, "ev-1");
  assert.equal(descriptor.evidenceArtifact.sha256, EVIDENCE_SHA);
  assert.equal(descriptor.notification.notificationType, "publish_completed");
  assert.equal(descriptor.notification.duplicateCollapsed, false);
  assert.equal(descriptor.performanceSnapshot.source, "audience_verification_initial");
  assert.equal(descriptor.calendarPost.status, "published_verified");
});

test("deriveVerifyState shows processing-wait with a retry-after and never claims success for a 202", () => {
  const descriptor = deriveVerifyState({ phase: "ready", body: processingWaitBody() });
  assert.equal(descriptor.banner.state, "processing-wait");
  assert.equal(descriptor.banner.retryAfterMs, 60000);
  assert.equal(descriptor.verification, null, "no verification record is surfaced while processing");
  assert.equal(descriptor.notification, null, "no completion notification while processing");
  assert.equal(descriptor.calendarPost.status, "accepted", "the post stays accepted, never promoted");
});

test("deriveVerifyState surfaces each error banner state from a problem code", () => {
  for (const [code, state] of [
    ["WORKSPACE_ACCESS_DENIED", "blocked-hidden"],
    ["PERMISSION_DENIED", "forbidden"],
    ["VERIFY_IDENTITY_MISMATCH", "identity-mismatch"],
    ["VERIFY_VISIBILITY_RESTRICTED", "visibility-restricted"],
    ["VERIFY_MANUAL_URL_REQUIRED", "manual-url-required"]
  ]) {
    const descriptor = deriveVerifyState({ phase: "error", error: { code } });
    assert.equal(descriptor.banner.state, state, `${code} -> ${state}`);
  }
});

test("verifyMarkup renders the verified result and evidence sha256 without leaking secrets", () => {
  const descriptor = deriveVerifyState({ phase: "ready", body: verifiedBody() });
  const markup = verifyMarkup(descriptor);
  assert.match(markup, /data-state="verified"/);
  assert.match(markup, /Verification status<\/dt><dd>verified/);
  assert.match(markup, new RegExp(`Evidence sha256</dt><dd class="mono">${EVIDENCE_SHA}`));
  assert.match(markup, /Notification<\/dt><dd>publish_completed/);
  assert.equal(descriptor.evidenceArtifact && "objectKey" in descriptor.evidenceArtifact, false);
  assert.equal(descriptor.notification && "recipientUserId" in descriptor.notification, false);
  assert.equal(descriptor.notification && "payloadHash" in descriptor.notification, false);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("verifyMarkup renders the processing-wait banner with a retry and never claims success", () => {
  const descriptor = deriveVerifyState({ phase: "ready", body: processingWaitBody() });
  const markup = verifyMarkup(descriptor);
  assert.match(markup, /data-state="processing-wait"/);
  assert.match(markup, /data-retry-minutes="1"/);
  assert.match(markup, /Check again in about 1 minutes/);
  assert.equal(/Verification status<\/dt><dd>verified/.test(markup), false, "never claims verified while processing");
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("verifyMarkup hides a cross-workspace verify behind the same blocked banner without leaking", () => {
  const descriptor = deriveVerifyState({ phase: "error", error: { code: "WORKSPACE_ACCESS_DENIED" } });
  const markup = verifyMarkup(descriptor);
  assert.match(markup, /data-state="blocked-hidden"/);
  assert.match(markup, /We could not find that calendar post/);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("verifyMarkup renders the manual live URL on a manual-export verified post without leaking", () => {
  const body = verifiedBody({
    calendarPost: { id: "cal-1", status: "published_verified", platform: "meta", account: "sunrise-estates", manualExport: true, manualLiveUrl: "https://meta.example.test/p/manual-sunrise-estates" }
  });
  const descriptor = deriveVerifyState({ phase: "ready", body });
  const markup = verifyMarkup(descriptor);
  assert.match(markup, /data-state="verified"/);
  assert.match(markup, /Manual live URL<\/dt><dd class="mono url">https:\/\/meta\.example\.test\/p\/manual-sunrise-estates/);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("verifyMarkup never renders an unknown verification status as a verified state", () => {
  const body = verifiedBody({ verification: { ...verifiedBody().verification, status: "nonsense" } });
  const descriptor = deriveVerifyState({ phase: "ready", body });
  assert.equal(descriptor.banner.state, "unknown");
  assert.equal(descriptor.verification.status, "unknown");
  const markup = verifyMarkup(descriptor);
  assert.match(markup, /data-state="unknown"/);
  assert.equal(/Verification status<\/dt><dd>verified/.test(markup), false);
});
