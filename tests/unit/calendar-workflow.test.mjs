import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarPostState,
  classifyCalendarError,
  deriveCalendarState,
  calendarMarkup
} from "../../apps/web/src/calendar-workflow.mjs";

// No secret, signed URL, provider payload, object key or external URL appears in the rendered
// markup. The captured final-video sha256 and the manual-export artifact sha256 are public content
// hashes and are rendered; the approval token is a stable public reference and is rendered; signed
// URLs, object keys, producer secrets and raw provider payloads are not.
const FORBIDDEN = /\b(secret|api[_-]?key|signature|signed[_-]?url|https?:\/\/|payload[_-]?hash|object[_-]?key|producer[_-]?secret)\b/i;

const GOLDEN = "a".repeat(64);
const APPROVAL_TOKEN = "b".repeat(64);
const EXPORT_SHA = "c".repeat(64);

function scheduledBody(overrides = {}) {
  return {
    calendarPost: {
      id: "cal-1",
      status: "scheduled",
      platform: "meta",
      account: "sunrise-estates",
      finalVideoId: "fv-1",
      finalVideoSha256: GOLDEN,
      finalVideoVersion: 1,
      approvalToken: APPROVAL_TOKEN,
      scheduledAt: "2999-01-01T03:30:00.000Z",
      timezone: "Asia/Kolkata",
      manualExport: false,
      manualLiveUrl: null,
      exportArtifactId: null,
      version: 1
    },
    exportArtifact: null,
    ...overrides
  };
}

function manualBody(overrides = {}) {
  return {
    calendarPost: {
      id: "cal-2",
      status: "approved",
      platform: "manual",
      account: "sunrise-estates-manual",
      finalVideoId: "fv-1",
      finalVideoSha256: GOLDEN,
      finalVideoVersion: 1,
      approvalToken: APPROVAL_TOKEN,
      scheduledAt: null,
      timezone: "Asia/Kolkata",
      manualExport: true,
      manualLiveUrl: null,
      exportArtifactId: "art-1",
      version: 1
    },
    exportArtifact: {
      id: "art-1",
      sha256: EXPORT_SHA,
      retentionClass: "manual-export",
      schemaVersion: "calendar.manual_export.v1",
      status: "CLEAN"
    },
    ...overrides
  };
}

test("calendarPostState maps known publish statuses and preserves unknown", () => {
  for (const status of [
    "draft",
    "approved",
    "scheduled",
    "submitting",
    "accepted",
    "published_unverified",
    "published_verified",
    "failed",
    "cancelled"
  ]) {
    assert.equal(calendarPostState({ calendarPost: { status } }), status);
  }
  assert.equal(calendarPostState({ calendarPost: { status: "nonsense" } }), "unknown");
  assert.equal(calendarPostState(null), "unknown");
});

test("classifyCalendarError maps each calendar and access error to a stable banner state", () => {
  assert.equal(classifyCalendarError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyCalendarError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyCalendarError({ code: "IDEMPOTENCY_KEY_REQUIRED" }), "missing-idempotency");
  assert.equal(classifyCalendarError({ code: "REVIEW_APPROVAL_REQUIRED" }), "approval-required");
  assert.equal(classifyCalendarError({ code: "PUBLISH_MEDIA_STALE" }), "media-stale");
  assert.equal(classifyCalendarError({ code: "PUBLISH_SCHEDULE_INVALID" }), "schedule-invalid");
  assert.equal(classifyCalendarError({ code: "IDEMPOTENCY_INPUT_CONFLICT" }), "idempotency-conflict");
  assert.equal(classifyCalendarError({ code: "VALIDATION_FAILED" }), "post-invalid");
  assert.equal(classifyCalendarError({ code: "RESOURCE_VERSION_STALE" }), "version-stale");
  assert.equal(classifyCalendarError({ code: "PUBLISH_POST_LOCKED" }), "post-locked");
  assert.equal(classifyCalendarError({ code: "UNEXPECTED" }), "error");
  assert.equal(classifyCalendarError(null), "error");
});

test("deriveCalendarState shows the post-scheduled banner and bound version for a scheduled post", () => {
  const descriptor = deriveCalendarState({ phase: "ready", body: scheduledBody() });
  assert.equal(descriptor.banner.state, "post-scheduled");
  assert.equal(descriptor.calendarPost.status, "scheduled");
  assert.equal(descriptor.calendarPost.finalVideoVersion, 1);
  assert.equal(descriptor.calendarPost.finalVideoSha256, GOLDEN);
  assert.equal(descriptor.calendarPost.approvalToken, APPROVAL_TOKEN);
  assert.equal(descriptor.calendarPost.manualExport, false);
  assert.equal(descriptor.calendarPost.scheduledAt, "2999-01-01T03:30:00.000Z");
  assert.equal(descriptor.calendarPost.manualLiveUrl, null);
  assert.equal(descriptor.exportArtifact, null);
});

test("deriveCalendarState shows the manual-export-ready banner and export artifact for a manual post", () => {
  const descriptor = deriveCalendarState({ phase: "ready", body: manualBody() });
  assert.equal(descriptor.banner.state, "manual-export-ready");
  assert.equal(descriptor.calendarPost.status, "approved");
  assert.equal(descriptor.calendarPost.manualExport, true);
  assert.equal(descriptor.calendarPost.scheduledAt, null);
  assert.equal(descriptor.calendarPost.manualLiveUrl, null);
  assert.equal(descriptor.exportArtifact.sha256, EXPORT_SHA);
  assert.equal(descriptor.exportArtifact.retentionClass, "manual-export");
  assert.equal(descriptor.exportArtifact.schemaVersion, "calendar.manual_export.v1");
});

test("deriveCalendarState surfaces each error banner state from a problem code", () => {
  for (const [code, state] of [
    ["WORKSPACE_ACCESS_DENIED", "blocked-hidden"],
    ["PERMISSION_DENIED", "forbidden"],
    ["REVIEW_APPROVAL_REQUIRED", "approval-required"],
    ["PUBLISH_MEDIA_STALE", "media-stale"],
    ["PUBLISH_SCHEDULE_INVALID", "schedule-invalid"],
    ["IDEMPOTENCY_INPUT_CONFLICT", "idempotency-conflict"],
    ["VALIDATION_FAILED", "post-invalid"],
    ["RESOURCE_VERSION_STALE", "version-stale"],
    ["PUBLISH_POST_LOCKED", "post-locked"]
  ]) {
    const descriptor = deriveCalendarState({ phase: "error", error: { code } });
    assert.equal(descriptor.banner.state, state, `${code} -> ${state}`);
  }
});

test("deriveCalendarState shows the edit-loading banner while an edit is in flight", () => {
  const descriptor = deriveCalendarState({ phase: "edit-loading", body: scheduledBody() });
  assert.equal(descriptor.banner.state, "edit-loading");
  assert.equal(descriptor.banner.text, "Saving your calendar post.");
  // The bound post is still surfaced so the UI can keep showing context during the save.
  assert.equal(descriptor.calendarPost.status, "scheduled");
});

test("deriveCalendarState shows the edit-saved banner and bumped version after a successful edit", () => {
  const body = scheduledBody({ calendarPost: { ...scheduledBody().calendarPost, version: 2, caption: "Updated caption" } });
  const descriptor = deriveCalendarState({ phase: "edit-ready", body });
  assert.equal(descriptor.banner.state, "edit-saved");
  assert.equal(descriptor.banner.text, "Calendar post saved.");
  assert.equal(descriptor.calendarPost.version, 2);
  assert.equal(descriptor.calendarPost.status, "scheduled");
});

test("calendarMarkup renders the version-stale and post-locked banners without leaking", () => {
  for (const code of ["RESOURCE_VERSION_STALE", "PUBLISH_POST_LOCKED"]) {
    const descriptor = deriveCalendarState({ phase: "error", error: { code } });
    const markup = calendarMarkup(descriptor);
    assert.equal(FORBIDDEN.test(markup), false, `${code} markup leaked a forbidden value:\n${markup}`);
  }
  const stale = calendarMarkup(deriveCalendarState({ phase: "error", error: { code: "RESOURCE_VERSION_STALE" } }));
  assert.match(stale, /data-state="version-stale"/);
  assert.match(stale, /changed after you opened it/);
  const locked = calendarMarkup(deriveCalendarState({ phase: "error", error: { code: "PUBLISH_POST_LOCKED" } }));
  assert.match(locked, /data-state="post-locked"/);
  assert.match(locked, /can no longer be edited/);
});

test("calendarMarkup renders the scheduled post, golden hash and approval token without leaking secrets", () => {
  const descriptor = deriveCalendarState({ phase: "ready", body: scheduledBody() });
  const markup = calendarMarkup(descriptor);
  assert.match(markup, /data-state="post-scheduled"/);
  assert.match(markup, /Calendar status<\/dt><dd>scheduled/);
  assert.match(markup, /Bound final-video version<\/dt><dd>1/);
  assert.match(markup, /Scheduled at<\/dt><dd>2999-01-01T03:30:00.000Z \(Asia\/Kolkata\)/);
  assert.match(markup, /Manual live URL<\/dt><dd>Not provided yet/);
  assert.match(markup, new RegExp(`Approval reference</dt><dd class="mono token">${APPROVAL_TOKEN}`));
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("calendarMarkup renders the manual export artifact content hash without leaking the object key", () => {
  const descriptor = deriveCalendarState({ phase: "ready", body: manualBody() });
  const markup = calendarMarkup(descriptor);
  assert.match(markup, /data-state="manual-export-ready"/);
  assert.match(markup, /Manual export<\/dt><dd>Manual export ready, no scheduled time./);
  assert.match(markup, /Export package<\/dt><dd>manual-export \(calendar.manual_export.v1\)/);
  assert.match(markup, new RegExp(`Export content hash</dt><dd class="mono sha">${EXPORT_SHA}`));
  assert.equal(/manual-exports\//.test(markup), false, "export object key prefix leaked into markup");
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("calendarMarkup never renders an unknown status as a real publish state", () => {
  const descriptor = deriveCalendarState({
    phase: "ready",
    body: scheduledBody({ calendarPost: { ...scheduledBody().calendarPost, status: "nonsense" } })
  });
  assert.equal(descriptor.banner.state, "unknown");
  assert.equal(descriptor.calendarPost.status, "unknown");
  const markup = calendarMarkup(descriptor);
  assert.match(markup, /data-state="unknown"/);
  assert.match(markup, /Calendar status<\/dt><dd>unknown/);
});

test("calendarMarkup hides a cross-workspace create behind the same blocked banner without leaking", () => {
  const descriptor = deriveCalendarState({ phase: "error", error: { code: "WORKSPACE_ACCESS_DENIED" } });
  const markup = calendarMarkup(descriptor);
  assert.match(markup, /data-state="blocked-hidden"/);
  assert.match(markup, /We could not find that approved media/);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});
