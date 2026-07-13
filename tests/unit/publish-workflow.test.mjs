import test from "node:test";
import assert from "node:assert/strict";
import {
  publishOperationState,
  classifyPublishError,
  derivePublishState,
  publishMarkup
} from "../../apps/web/src/publish-workflow.mjs";

// No secret, signed URL, request hash, object key, provider payload or credential appears in the
// rendered markup. The public post URL is the audience-facing URL and IS rendered once the post is
// live; the external post id is a public provider identity and is rendered. The request hash is a
// server-side binding secret and is never rendered.
const FORBIDDEN = /\b(secret|api[_-]?key|signature|signed[_-]?url|object[_-]?key|payload[_-]?hash|producer[_-]?secret|request[_-]?hash|credential)\b/i;

const EXTERNAL_ID = "meta_abc123def456";
const PUBLIC_URL = "https://meta.example.test/p/meta_abc123def456";

function operationBody(overrides = {}) {
  return {
    calendarPost: {
      id: "cal-1",
      status: "accepted",
      platform: "meta",
      account: "sunrise-estates",
      finalVideoId: "fv-1",
      finalVideoSha256: "a".repeat(64),
      finalVideoVersion: 1,
      approvalToken: "b".repeat(64),
      scheduledAt: "2999-01-01T03:30:00.000Z",
      timezone: "Asia/Kolkata",
      manualExport: false,
      manualLiveUrl: null,
      exportArtifactId: null
    },
    operation: {
      id: "op-1",
      workspaceId: "ws-1",
      calendarPostId: "cal-1",
      provider: "meta-simulator",
      operationType: "publish_post",
      status: "accepted",
      idempotencyKey: "u2-publish-1",
      externalId: EXTERNAL_ID,
      publicUrl: null,
      retryAfterMs: null,
      lastErrorCode: null,
      submittedAt: "2999-01-01T03:29:00.000Z",
      acceptedAt: "2999-01-01T03:30:00.000Z",
      completedAt: null,
      reconciledAt: null,
      cancelledAt: null,
      createdAt: "2999-01-01T03:29:00.000Z",
      updatedAt: "2999-01-01T03:30:00.000Z"
    },
    ...overrides
  };
}

test("publishOperationState maps known publish operation statuses and preserves unknown", () => {
  for (const status of [
    "created",
    "submitting",
    "accepted",
    "unknown",
    "processing",
    "completed",
    "rejected",
    "failed",
    "cancelled"
  ]) {
    assert.equal(publishOperationState({ operation: { status } }), status);
  }
  assert.equal(publishOperationState({ operation: { status: "nonsense" } }), "unknown");
  assert.equal(publishOperationState(null), "unknown");
});

test("classifyPublishError maps each publish and access error to a stable banner state", () => {
  assert.equal(classifyPublishError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyPublishError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyPublishError({ code: "IDEMPOTENCY_KEY_REQUIRED" }), "missing-idempotency");
  assert.equal(classifyPublishError({ code: "PUBLISH_ACCOUNT_MISMATCH" }), "account-mismatch");
  assert.equal(classifyPublishError({ code: "PUBLISH_NOT_SUBMITTABLE" }), "not-submittable");
  assert.equal(classifyPublishError({ code: "PROVIDER_CALLBACK_INVALID" }), "callback-invalid");
  assert.equal(classifyPublishError({ code: "PROVIDER_OUTPUT_INVALID" }), "post-invalid");
  assert.equal(classifyPublishError({ code: "IDEMPOTENCY_INPUT_CONFLICT" }), "idempotency-conflict");
  assert.equal(classifyPublishError({ code: "PUBLISH_MEDIA_STALE" }), "media-stale");
  assert.equal(classifyPublishError({ code: "REVIEW_APPROVAL_REQUIRED" }), "approval-required");
  assert.equal(classifyPublishError({ code: "VALIDATION_FAILED" }), "post-invalid");
  assert.equal(classifyPublishError({ code: "UNEXPECTED" }), "error");
  assert.equal(classifyPublishError(null), "error");
});

test("derivePublishState shows publish-accepted with the external id and no public URL when accepted", () => {
  const descriptor = derivePublishState({ phase: "ready", body: operationBody() });
  assert.equal(descriptor.banner.state, "publish-accepted");
  assert.equal(descriptor.operation.status, "accepted");
  assert.equal(descriptor.operation.externalId, EXTERNAL_ID);
  assert.equal(descriptor.operation.publicUrl, null);
  assert.equal(descriptor.calendarPost.status, "accepted");
});

test("derivePublishState shows published-unverified with the public URL when the operation completes", () => {
  const body = operationBody({
    calendarPost: { ...operationBody().calendarPost, status: "published_unverified" },
    operation: { ...operationBody().operation, status: "completed", publicUrl: PUBLIC_URL, completedAt: "2999-01-01T03:31:00.000Z" }
  });
  const descriptor = derivePublishState({ phase: "ready", body });
  assert.equal(descriptor.banner.state, "published-unverified");
  assert.equal(descriptor.operation.status, "completed");
  assert.equal(descriptor.operation.publicUrl, PUBLIC_URL);
  assert.equal(descriptor.calendarPost.status, "published_unverified");
});

test("derivePublishState shows unknown-checking when the operation is unknown and never claims success or failure", () => {
  const body = operationBody({
    calendarPost: { ...operationBody().calendarPost, status: "submitting" },
    operation: { ...operationBody().operation, status: "unknown", acceptedAt: null }
  });
  const descriptor = derivePublishState({ phase: "ready", body });
  assert.equal(descriptor.banner.state, "unknown-checking");
  assert.equal(descriptor.operation.status, "unknown");
  assert.equal(descriptor.operation.publicUrl, null);
});

test("derivePublishState shows publish-failed when the operation fails", () => {
  const body = operationBody({
    calendarPost: { ...operationBody().calendarPost, status: "failed" },
    operation: { ...operationBody().operation, status: "failed", lastErrorCode: "PROVIDER_OUTPUT_INVALID", acceptedAt: null }
  });
  const descriptor = derivePublishState({ phase: "ready", body });
  assert.equal(descriptor.banner.state, "publish-failed");
  assert.equal(descriptor.operation.status, "failed");
});

test("derivePublishState surfaces each error banner state from a problem code", () => {
  for (const [code, state] of [
    ["WORKSPACE_ACCESS_DENIED", "blocked-hidden"],
    ["PERMISSION_DENIED", "forbidden"],
    ["PUBLISH_ACCOUNT_MISMATCH", "account-mismatch"],
    ["PUBLISH_NOT_SUBMITTABLE", "not-submittable"],
    ["PROVIDER_CALLBACK_INVALID", "callback-invalid"],
    ["IDEMPOTENCY_INPUT_CONFLICT", "idempotency-conflict"]
  ]) {
    const descriptor = derivePublishState({ phase: "error", error: { code } });
    assert.equal(descriptor.banner.state, state, `${code} -> ${state}`);
  }
});

test("publishMarkup renders the accepted operation and external id without leaking secrets", () => {
  const descriptor = derivePublishState({ phase: "ready", body: operationBody() });
  const markup = publishMarkup(descriptor);
  assert.match(markup, /data-state="publish-accepted"/);
  assert.match(markup, /Publish status<\/dt><dd>accepted/);
  assert.match(markup, new RegExp(`External post id</dt><dd class="mono external">${EXTERNAL_ID}`));
  assert.match(markup, /Public post URL<\/dt><dd>Not live yet/);
  assert.equal("requestHash" in (descriptor.operation || {}), false);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("publishMarkup renders the public post URL when the operation completes without leaking secrets", () => {
  const body = operationBody({
    calendarPost: { ...operationBody().calendarPost, status: "published_unverified" },
    operation: { ...operationBody().operation, status: "completed", publicUrl: PUBLIC_URL, completedAt: "2999-01-01T03:31:00.000Z" }
  });
  const descriptor = derivePublishState({ phase: "ready", body });
  const markup = publishMarkup(descriptor);
  assert.match(markup, /data-state="published-unverified"/);
  assert.match(markup, new RegExp(`Public post URL</dt><dd class="mono url">${PUBLIC_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("publishMarkup never renders an unknown operation status as a real publish state", () => {
  const body = operationBody({
    calendarPost: { ...operationBody().calendarPost, status: "submitting" },
    operation: { ...operationBody().operation, status: "nonsense" }
  });
  const descriptor = derivePublishState({ phase: "ready", body });
  assert.equal(descriptor.banner.state, "unknown-checking");
  assert.equal(descriptor.operation.status, "unknown");
  const markup = publishMarkup(descriptor);
  assert.match(markup, /data-state="unknown-checking"/);
  assert.match(markup, /Publish status<\/dt><dd>unknown/);
});

test("publishMarkup hides a cross-workspace publish behind the same blocked banner without leaking", () => {
  const descriptor = derivePublishState({ phase: "error", error: { code: "WORKSPACE_ACCESS_DENIED" } });
  const markup = publishMarkup(descriptor);
  assert.match(markup, /data-state="blocked-hidden"/);
  assert.match(markup, /We could not find that calendar post/);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

// V0-U3: YouTube Shorts publication, quota exhaustion, unsupported platform, delayed
// processing, and provider-aware banner copy. The provider label is derived from the calendar
// post's platform so the banner reflects backend truth (Meta vs YouTube) instead of a hardcoded
// provider name.

const YT_EXTERNAL_ID = "yt_u3publishprocessin";
const YT_PUBLIC_URL = "https://youtube.example.test/shorts/yt_u3publishprocessin";

function youtubeBody(overrides = {}) {
  return {
    calendarPost: {
      id: "cal-yt",
      status: "accepted",
      platform: "youtube-shorts",
      account: "sunrise-estates-yt",
      finalVideoId: "fv-yt",
      finalVideoSha256: "a".repeat(64),
      finalVideoVersion: 1,
      approvalToken: "b".repeat(64),
      scheduledAt: "2999-01-01T03:30:00.000Z",
      timezone: "Asia/Kolkata",
      manualExport: false,
      manualLiveUrl: null,
      exportArtifactId: null
    },
    operation: {
      id: "op-yt",
      workspaceId: "ws-yt",
      calendarPostId: "cal-yt",
      provider: "youtube-simulator",
      operationType: "publish_post",
      status: "accepted",
      idempotencyKey: "u3-publish-1",
      externalId: YT_EXTERNAL_ID,
      publicUrl: null,
      retryAfterMs: null,
      lastErrorCode: null,
      submittedAt: "2999-01-01T03:29:00.000Z",
      acceptedAt: "2999-01-01T03:30:00.000Z",
      completedAt: null,
      reconciledAt: null,
      cancelledAt: null,
      createdAt: "2999-01-01T03:29:00.000Z",
      updatedAt: "2999-01-01T03:30:00.000Z"
    },
    ...overrides
  };
}

test("U3 classifyPublishError maps quota-exhausted and platform-unsupported to honest banner states", () => {
  assert.equal(classifyPublishError({ code: "PUBLISH_QUOTA_EXHAUSTED" }), "quota-exhausted");
  assert.equal(classifyPublishError({ code: "PUBLISH_PLATFORM_UNSUPPORTED" }), "platform-unsupported");
});

test("U3 derivePublishState uses the YouTube provider label in the accepted banner", () => {
  const descriptor = derivePublishState({ phase: "ready", body: youtubeBody() });
  assert.equal(descriptor.banner.state, "publish-accepted");
  assert.match(descriptor.banner.text, /live on YouTube/);
  assert.equal(descriptor.operation.provider, "youtube-simulator");
  assert.equal(descriptor.calendarPost.platform, "youtube-shorts");
});

test("U3 derivePublishState shows publish-processing while the upload is still being processed", () => {
  const body = youtubeBody({
    operation: { ...youtubeBody().operation, status: "processing" }
  });
  const descriptor = derivePublishState({ phase: "ready", body });
  assert.equal(descriptor.banner.state, "publish-processing");
  assert.match(descriptor.banner.text, /YouTube is processing the post/);
  assert.equal(descriptor.operation.status, "processing");
  assert.equal(descriptor.operation.publicUrl, null, "no public URL while processing");
});

test("U3 derivePublishState binds the YouTube public short URL on completion", () => {
  const body = youtubeBody({
    calendarPost: { ...youtubeBody().calendarPost, status: "published_unverified" },
    operation: { ...youtubeBody().operation, status: "completed", publicUrl: YT_PUBLIC_URL, completedAt: "2999-01-01T03:31:00.000Z" }
  });
  const descriptor = derivePublishState({ phase: "ready", body });
  assert.equal(descriptor.banner.state, "published-unverified");
  assert.equal(descriptor.operation.publicUrl, YT_PUBLIC_URL);
  const markup = publishMarkup(descriptor);
  assert.match(markup, new RegExp(`Public post URL</dt><dd class="mono url">${YT_PUBLIC_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("U3 derivePublishState surfaces the retry-after on a quota-exhausted banner", () => {
  const descriptor = derivePublishState({
    phase: "error",
    error: { code: "PUBLISH_QUOTA_EXHAUSTED", retryAfterMs: 24 * 60 * 60 * 1000 }
  });
  assert.equal(descriptor.banner.state, "quota-exhausted");
  assert.equal(descriptor.banner.retryAfterMs, 24 * 60 * 60 * 1000);
  assert.equal(descriptor.operation, null, "no operation for a pre-flight quota refusal");
  const markup = publishMarkup(descriptor);
  assert.match(markup, /data-state="quota-exhausted"/);
  assert.match(markup, /data-retry-minutes="1440"/);
  assert.match(markup, /Retry in about 1440 minutes/);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("U3 derivePublishState shows a platform-unsupported banner for an unsupported platform", () => {
  const descriptor = derivePublishState({ phase: "error", error: { code: "PUBLISH_PLATFORM_UNSUPPORTED" } });
  assert.equal(descriptor.banner.state, "platform-unsupported");
  const markup = publishMarkup(descriptor);
  assert.match(markup, /data-state="platform-unsupported"/);
  assert.match(markup, /not supported for direct publication/);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("U3 publishMarkup renders the processing YouTube operation without leaking secrets", () => {
  const body = youtubeBody({
    operation: { ...youtubeBody().operation, status: "processing" }
  });
  const descriptor = derivePublishState({ phase: "ready", body });
  const markup = publishMarkup(descriptor);
  assert.match(markup, /data-state="publish-processing"/);
  assert.match(markup, /Publish status<\/dt><dd>processing/);
  assert.match(markup, /Provider<\/dt><dd>youtube-simulator/);
  assert.equal("requestHash" in (descriptor.operation || {}), false);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});
