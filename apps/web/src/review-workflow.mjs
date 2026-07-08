import { banner, escapeHtml, renderBanner, stableState } from "./workflow-markup-utils.mjs";

export function reviewItemState(body) {
  return stableState(body?.reviewItem?.status, ["internal_review", "client_review", "change_requested", "approved", "rejected", "archived"]);
}

export function reviewDecisionState(body) {
  return stableState(body?.decision?.decision, ["approve", "reject", "request_changes"]);
}

export function classifyReviewError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    IDEMPOTENCY_KEY_REQUIRED: "missing-idempotency",
    REVIEW_VERSION_STALE: "stale-superseded",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    VALIDATION_FAILED: "comment-invalid",
    REVIEW_DECISION_ALREADY_RECORDED: "decision-already-recorded"
  }[error?.code] ?? "error";
}

function publicReviewItem(item) {
  if (!item) return null;
  const { createdByUserId, ...safe } = item;
  return { ...safe, status: stableState(item.status, ["internal_review", "client_review", "change_requested", "approved", "rejected", "archived"]) };
}

export function deriveReviewState(input = {}) {
  if (input.phase === "error") return { banner: banner(classifyReviewError(input.error), "Review is not available."), reviewItem: null, comments: [], notification: null, decision: null, approvalReference: null };
  const reviewItem = publicReviewItem(input.body?.reviewItem);
  const comments = input.body?.comments ?? [];
  const notification = input.lastComment?.notification ? { status: input.lastComment.notification.status, duplicateCollapsed: input.lastComment.notification.duplicateCollapsed } : null;
  const decision = input.lastDecision?.decision ? { ...input.lastDecision.decision, decidedByUserId: undefined } : null;
  const approvalReference = input.lastDecision?.approvalReference ? { token: input.lastDecision.approvalReference.token, finalVideoVersion: input.lastDecision.approvalReference.finalVideoVersion } : null;
  const state = input.phase === "decision-recorded" ? "decision-recorded" : input.phase === "comment-added" ? "comment-added" : reviewItem?.status === "archived" ? "stale-superseded" : "open";
  return { banner: banner(state, "Review loaded."), reviewItem, comments, notification, decision, approvalReference };
}

export function reviewMarkup(descriptor) {
  const item = descriptor.reviewItem;
  const itemHtml = item ? `<dl><dt>Review status</dt><dd>${escapeHtml(item.status)}</dd><dt>Bound final-video version</dt><dd>${escapeHtml(item.finalVideoVersion)}</dd><dt>Final video hash</dt><dd class="mono sha">${escapeHtml(item.finalVideoSha256)}</dd></dl>` : "";
  const comments = (descriptor.comments ?? []).map((comment) => `<p>${escapeHtml(comment.body)}</p>`).join("");
  const notification = descriptor.notification ? `<div data-notification-status="${escapeHtml(descriptor.notification.status)}" data-duplicate-collapsed="${escapeHtml(descriptor.notification.duplicateCollapsed)}"></div>` : "";
  const decision = descriptor.decision ? `<dl><dt>Decision</dt><dd>${escapeHtml(descriptor.decision.decision)}</dd><dt>Reason</dt><dd>${escapeHtml(descriptor.decision.reason)}</dd></dl>` : "";
  const approval = descriptor.approvalReference ? `<p>Approval reference for version ${escapeHtml(descriptor.approvalReference.finalVideoVersion)} <span class="mono token">${escapeHtml(descriptor.approvalReference.token)}</span></p>` : "";
  return `${renderBanner("review-status", descriptor.banner)}${itemHtml}${comments}${notification}${decision}${approval}`;
}
