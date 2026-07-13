import test from "node:test";
import assert from "node:assert/strict";
import {
  reviewItemState,
  reviewDecisionState,
  classifyReviewError,
  deriveReviewState,
  reviewMarkup
} from "../../apps/web/src/review-workflow.mjs";

// No secret, signed URL, provider payload, recipient user id, payload hash or external URL
// appears in the rendered markup. The captured final-video sha256 is a public content hash and
// is rendered; signed URLs, object keys and notification payload hashes are not.
const FORBIDDEN = /\b(secret|api[_-]?key|signature|signed[_-]?url|https?:\/\/|payload[_-]?hash|object[_-]?key|recipient[_-]?user)\b/i;

const GOLDEN = "a".repeat(64);

function openBody(overrides = {}) {
  return {
    reviewItem: {
      id: "review-1",
      status: "internal_review",
      reviewStage: "internal_review",
      finalVideoId: "fv-1",
      finalVideoSha256: GOLDEN,
      finalVideoVersion: 1,
      compositionInstructionId: "comp-1",
      createdByUserId: "user-secret-recipient"
    },
    comments: [
      { id: "comment-1", authorUserId: "user-1", body: "Tighten the lower-third at 0:12.", timestampMs: 12000, threadId: null }
    ],
    ...overrides
  };
}

test("reviewItemState maps known review item statuses and preserves unknown", () => {
  for (const status of [
    "internal_review",
    "client_review",
    "change_requested",
    "approved",
    "rejected",
    "archived"
  ]) {
    assert.equal(reviewItemState({ reviewItem: { status } }), status);
  }
  assert.equal(reviewItemState({ reviewItem: { status: "nonsense" } }), "unknown");
  assert.equal(reviewItemState(null), "unknown");
});

test("classifyReviewError maps each review and access error to a stable banner state", () => {
  assert.equal(classifyReviewError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyReviewError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyReviewError({ code: "IDEMPOTENCY_KEY_REQUIRED" }), "missing-idempotency");
  assert.equal(classifyReviewError({ code: "REVIEW_VERSION_STALE" }), "stale-superseded");
  assert.equal(classifyReviewError({ code: "IDEMPOTENCY_INPUT_CONFLICT" }), "idempotency-conflict");
  assert.equal(classifyReviewError({ code: "VALIDATION_FAILED" }), "comment-invalid");
  assert.equal(classifyReviewError({ code: "UNEXPECTED" }), "error");
  assert.equal(classifyReviewError(null), "error");
});

test("deriveReviewState shows the open banner and bound version for a current review item", () => {
  const descriptor = deriveReviewState({ phase: "ready", body: openBody() });
  assert.equal(descriptor.banner.state, "open");
  assert.equal(descriptor.reviewItem.status, "internal_review");
  assert.equal(descriptor.reviewItem.finalVideoVersion, 1);
  assert.equal(descriptor.reviewItem.finalVideoSha256, GOLDEN);
  assert.equal(descriptor.comments.length, 1);
  assert.equal(descriptor.comments[0].body, "Tighten the lower-third at 0:12.");
});

test("deriveReviewState surfaces stale-superseded for an archived review item", () => {
  const descriptor = deriveReviewState({
    phase: "ready",
    body: openBody({ reviewItem: { ...openBody().reviewItem, status: "archived" } })
  });
  assert.equal(descriptor.banner.state, "stale-superseded");
  assert.equal(descriptor.reviewItem.status, "archived");
});

test("deriveReviewState surfaces the duplicateCollapsed notification state after a comment", () => {
  const descriptor = deriveReviewState({
    phase: "comment-added",
    body: openBody(),
    lastComment: {
      notification: { id: "notification-1", status: "sent", duplicateCollapsed: true }
    }
  });
  assert.equal(descriptor.banner.state, "comment-added");
  assert.equal(descriptor.notification.status, "sent");
  assert.equal(descriptor.notification.duplicateCollapsed, true);
});

test("reviewMarkup renders the review status, comments and golden hash without leaking secrets", () => {
  const descriptor = deriveReviewState({
    phase: "comment-added",
    body: openBody(),
    lastComment: {
      notification: { id: "notification-1", status: "sent", duplicateCollapsed: false }
    }
  });
  const markup = reviewMarkup(descriptor);
  assert.match(markup, /data-state="comment-added"/);
  assert.match(markup, /Review status<\/dt><dd>internal_review/);
  assert.match(markup, /Bound final-video version<\/dt><dd>1/);
  assert.match(markup, /Tighten the lower-third at 0:12./);
  assert.match(markup, /data-notification-status="sent"/);
  assert.match(markup, /data-duplicate-collapsed="false"/);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("reviewMarkup renders the stale-superseded banner for an archived review item without leaking", () => {
  const descriptor = deriveReviewState({
    phase: "ready",
    body: openBody({ reviewItem: { ...openBody().reviewItem, status: "archived" } })
  });
  const markup = reviewMarkup(descriptor);
  assert.match(markup, /data-state="stale-superseded"/);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
});

test("reviewMarkup never renders the recipient user id or notification id", () => {
  const descriptor = deriveReviewState({
    phase: "comment-added",
    body: openBody(),
    lastComment: {
      notification: { id: "notification-1", status: "sent", duplicateCollapsed: true }
    }
  });
  const markup = reviewMarkup(descriptor);
  assert.equal(/notification-1/.test(markup), false, "notification id leaked into markup");
  assert.equal(/user-secret-recipient/.test(markup), false, "recipient user id leaked into markup");
});

test("reviewDecisionState maps known review decisions and preserves unknown", () => {
  for (const decision of ["approve", "reject", "request_changes"]) {
    assert.equal(reviewDecisionState({ decision: { decision } }), decision);
  }
  assert.equal(reviewDecisionState({ decision: { decision: "nonsense" } }), "unknown");
  assert.equal(reviewDecisionState(null), "unknown");
});

test("classifyReviewError maps the V0-R2 decision conflict to a stable banner state", () => {
  assert.equal(classifyReviewError({ code: "REVIEW_DECISION_ALREADY_RECORDED" }), "decision-already-recorded");
  assert.equal(classifyReviewError({ code: "REVIEW_VERSION_STALE" }), "stale-superseded");
  assert.equal(classifyReviewError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyReviewError({ code: "IDEMPOTENCY_INPUT_CONFLICT" }), "idempotency-conflict");
});

test("deriveReviewState shows the decision-recorded banner and approval reference for an approve", () => {
  const descriptor = deriveReviewState({
    phase: "decision-recorded",
    body: openBody({ reviewItem: { ...openBody().reviewItem, status: "approved" } }),
    lastDecision: {
      decision: {
        id: "decision-1",
        decision: "approve",
        reason: "Approved for scheduling.",
        finalVideoId: "fv-1",
        finalVideoSha256: GOLDEN,
        finalVideoVersion: 1,
        decidedByUserId: "user-decider"
      },
      approvalReference: {
        token: "a".repeat(64),
        reviewItemId: "review-1",
        finalVideoId: "fv-1",
        finalVideoSha256: GOLDEN,
        finalVideoVersion: 1,
        decidedByUserId: "user-decider",
        decidedAt: "2026-06-27T00:00:00.000Z"
      }
    }
  });
  assert.equal(descriptor.banner.state, "decision-recorded");
  assert.equal(descriptor.reviewItem.status, "approved");
  assert.equal(descriptor.decision.decision, "approve");
  assert.equal(descriptor.decision.reason, "Approved for scheduling.");
  assert.equal(descriptor.approvalReference.token, "a".repeat(64));
  assert.equal(descriptor.approvalReference.finalVideoVersion, 1);
});

test("deriveReviewState surfaces no approval reference for a reject or request_changes", () => {
  const rejectDescriptor = deriveReviewState({
    phase: "decision-recorded",
    body: openBody({ reviewItem: { ...openBody().reviewItem, status: "rejected" } }),
    lastDecision: {
      decision: { decision: "reject", reason: "Brand colour is off.", finalVideoVersion: 1, finalVideoSha256: GOLDEN, decidedByUserId: "user-decider" }
    }
  });
  assert.equal(rejectDescriptor.decision.decision, "reject");
  assert.equal(rejectDescriptor.approvalReference, null);

  const changesDescriptor = deriveReviewState({
    phase: "decision-recorded",
    body: openBody({ reviewItem: { ...openBody().reviewItem, status: "change_requested" } }),
    lastDecision: {
      decision: { decision: "request_changes", reason: "Tighten the lower-third.", finalVideoVersion: 1, finalVideoSha256: GOLDEN, decidedByUserId: "user-decider" }
    }
  });
  assert.equal(changesDescriptor.decision.decision, "request_changes");
  assert.equal(changesDescriptor.approvalReference, null);
});

test("reviewMarkup renders the decision and approval reference without leaking secrets", () => {
  const descriptor = deriveReviewState({
    phase: "decision-recorded",
    body: openBody({ reviewItem: { ...openBody().reviewItem, status: "approved" } }),
    lastDecision: {
      decision: {
        id: "decision-1",
        decision: "approve",
        reason: "Approved for scheduling.",
        finalVideoId: "fv-1",
        finalVideoSha256: GOLDEN,
        finalVideoVersion: 1,
        decidedByUserId: "user-decider"
      },
      approvalReference: {
        token: "a".repeat(64),
        reviewItemId: "review-1",
        finalVideoId: "fv-1",
        finalVideoSha256: GOLDEN,
        finalVideoVersion: 1,
        decidedByUserId: "user-decider",
        decidedAt: "2026-06-27T00:00:00.000Z"
      }
    }
  });
  const markup = reviewMarkup(descriptor);
  assert.match(markup, /data-state="decision-recorded"/);
  assert.match(markup, /Decision<\/dt><dd>approve/);
  assert.match(markup, /Approval reference for version 1/);
  assert.match(markup, /class="mono token"/);
  assert.equal(FORBIDDEN.test(markup), false, `markup leaked a forbidden value:\n${markup}`);
  // The decider user id and the approval token object key never render as copyable leaks; the
  // token is a public reference but the decider id is not rendered.
  assert.equal(/user-decider/.test(markup), false, "decider user id leaked into markup");
});
