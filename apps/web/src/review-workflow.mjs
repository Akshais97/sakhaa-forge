// V0-R1/R2 review and approval workflow. Pure, DOM-agnostic state functions unit tested in Node,
// plus a `reviewMarkup` renderer. A production role opens a review item bound to one exact
// final-video version; any comment-capable role (including Reviewer) adds timestamped append-only
// comments. V0-R2 lets an authorised production role (approve_reject_final_video: Owner/Admin/
// Client Manager; NOT Reviewer) record one terminal decision (approve/reject/request_changes)
// against the exact version; an approve produces a downstream approval reference bound to that
// version that scheduling may later consume. The workflow is never optimistic: it shows loading,
// calls the API with an Idempotency-Key, and renders the committed review item, comments, the
// collapsed notification state, the recorded decision and approval reference, or a calm error. A
// comment or decision against a superseded bound version is rejected (REVIEW_VERSION_STALE) and the
// review item is archived; prior comments are preserved. A second decision for the same review
// version is rejected (REVIEW_DECISION_ALREADY_RECORDED). The captured final-video sha256 is a
// public content hash; the approval token is a stable public reference; signed URLs, object keys,
// recipient user ids, payload hashes, raw provider payloads and secrets never appear in the
// rendered markup. Browser code holds no database, Redis, provider or secret credentials beyond the
// caller JWT.

const REVIEW_ITEM_STATUSES = [
  "internal_review",
  "client_review",
  "change_requested",
  "approved",
  "rejected",
  "archived"
];

const REVIEW_DECISIONS = ["approve", "reject", "request_changes"];

// Map a review item status (lowercase per V0_STATUS_ENUMS.md) to a stable UI state, preserving
// unknown as a real state.
export function reviewItemState(body) {
  const status = String(body?.reviewItem?.status ?? "").toLowerCase();
  return REVIEW_ITEM_STATUSES.includes(status) ? status : "unknown";
}

// Map a recorded review decision (lowercase per V0_STATUS_ENUMS.md) to a stable UI state,
// preserving unknown as a real state. Only the three V0-R2 decisions are valid.
export function reviewDecisionState(body) {
  const decision = String(body?.decision?.decision ?? "").toLowerCase();
  return REVIEW_DECISIONS.includes(decision) ? decision : "unknown";
}

// Map a review/comment/decision problem to the workflow banner state. Cross-workspace and missing
// workspaces hide behind the same blocked state so the other workspace id never leaks; each guard
// gets its own honest state. A superseded version is recoverable by opening the latest version,
// never a final failure. A second decision for the same review version is a calm conflict state.
export function classifyReviewError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    IDEMPOTENCY_KEY_REQUIRED: "missing-idempotency",
    REVIEW_VERSION_STALE: "stale-superseded",
    REVIEW_DECISION_ALREADY_RECORDED: "decision-already-recorded",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    VALIDATION_FAILED: "comment-invalid"
  };
  return map[problem.code] || "error";
}

function renderBannerText(state) {
  const texts = {
    empty: "No review item opened yet.",
    loading: "Opening this review item.",
    open: "Review item open. Add timestamped comments for the exact final-video version.",
    "comment-loading": "Adding your comment.",
    "comment-added": "Comment added.",
    "decision-loading": "Recording your review decision.",
    "decision-recorded": "Review decision recorded.",
    "decision-already-recorded": "A decision is already recorded for this review version.",
    "stale-superseded": "This review item is bound to a superseded final-video version. Open a review item for the latest version.",
    forbidden: "Your role cannot perform this review action.",
    "blocked-hidden": "We could not find that review item.",
    "missing-idempotency": "An idempotency key is required for this review action.",
    "idempotency-conflict": "This request identity was already used with different details.",
    "comment-invalid": "The comment was not valid. Check the body and timestamp.",
    "decision-invalid": "The decision was not valid. Choose approve, reject or request changes.",
    error: "We could not complete this review action. Try again."
  };
  return texts[state] || texts.error;
}

// Derive the workflow descriptor from the current phase and API response. The descriptor is a
// plain object so it can be asserted in Node without a DOM; the browser glue renders it via
// reviewMarkup.
export function deriveReviewState({ phase, body = null, error = null, lastComment = null, lastDecision = null }) {
  let banner = { state: "empty", text: renderBannerText("empty") };
  if (phase === "loading") {
    banner = { state: "loading", text: renderBannerText("loading") };
  } else if (phase === "comment-loading") {
    banner = { state: "comment-loading", text: renderBannerText("comment-loading") };
  } else if (phase === "decision-loading") {
    banner = { state: "decision-loading", text: renderBannerText("decision-loading") };
  } else if (phase === "error") {
    const state = classifyReviewError(error);
    banner = { state, text: renderBannerText(state) };
  } else if (phase === "ready") {
    const status = reviewItemState(body);
    if (status === "archived") {
      banner = { state: "stale-superseded", text: renderBannerText("stale-superseded") };
    } else if (status === "unknown") {
      banner = { state: "unknown", text: renderBannerText("error") };
    } else {
      banner = { state: "open", text: renderBannerText("open") };
    }
  } else if (phase === "comment-added") {
    banner = { state: "comment-added", text: renderBannerText("comment-added") };
  } else if (phase === "decision-recorded") {
    banner = { state: "decision-recorded", text: renderBannerText("decision-recorded") };
  }

  const reviewItem = body && body.reviewItem
    ? {
        id: body.reviewItem.id,
        status: reviewItemState(body),
        reviewStage: String(body.reviewItem.reviewStage ?? "").toLowerCase(),
        finalVideoId: body.reviewItem.finalVideoId,
        finalVideoSha256: body.reviewItem.finalVideoSha256,
        finalVideoVersion: body.reviewItem.finalVideoVersion,
        compositionInstructionId: body.reviewItem.compositionInstructionId
      }
    : null;
  const comments = Array.isArray(body?.comments)
    ? body.comments.map((comment) => ({
        id: comment.id,
        authorUserId: comment.authorUserId,
        body: comment.body,
        timestampMs: comment.timestampMs,
        threadId: comment.threadId ?? null
      }))
    : [];
  const notification = lastComment && lastComment.notification
    ? {
        status: String(lastComment.notification.status ?? "").toLowerCase(),
        duplicateCollapsed: Boolean(lastComment.notification.duplicateCollapsed)
      }
    : null;
  // V0-R2: the recorded decision and, for an approve, the downstream approval reference bound to
  // the exact final-video version. The approval token is a stable public reference (not a secret).
  const decision = lastDecision && lastDecision.decision
    ? {
        decision: reviewDecisionState(lastDecision),
        reason: lastDecision.decision.reason ?? "",
        finalVideoVersion: Number(lastDecision.decision.finalVideoVersion ?? 0),
        finalVideoSha256: lastDecision.decision.finalVideoSha256 ?? "",
        decidedByUserId: lastDecision.decision.decidedByUserId ?? ""
      }
    : null;
  const approvalReference = lastDecision && lastDecision.approvalReference
    ? {
        token: lastDecision.approvalReference.token,
        finalVideoVersion: Number(lastDecision.approvalReference.finalVideoVersion ?? 0),
        finalVideoSha256: lastDecision.approvalReference.finalVideoSha256 ?? ""
      }
    : null;
  return { banner, reviewItem, comments, notification, decision, approvalReference };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

// Render the workflow descriptor as a self-contained HTML card. Only the review-item status,
// review stage, the bound final-video version and golden sha256, the comment bodies, the
// collapsed-notification state, the recorded decision and the approval reference are rendered.
// Signed URLs, object keys, recipient user ids, payload hashes and secrets never appear here; the
// approval token is a stable public reference, not a secret.
export function reviewMarkup(descriptor) {
  const { banner, reviewItem, comments, notification, decision, approvalReference } = descriptor;
  const lines = [];
  lines.push('<section class="review-item" aria-live="polite">');
  lines.push(`<h2>Review</h2>`);
  lines.push(`<p class="banner" data-state="${escapeHtml(banner.state)}">${escapeHtml(banner.text)}</p>`);
  if (reviewItem) {
    lines.push('<dl class="review-item-summary">');
    lines.push(`<dt>Review status</dt><dd>${escapeHtml(reviewItem.status)}</dd>`);
    lines.push(`<dt>Review stage</dt><dd>${escapeHtml(reviewItem.reviewStage)}</dd>`);
    lines.push(`<dt>Bound final-video version</dt><dd>${escapeHtml(reviewItem.finalVideoVersion)}</dd>`);
    lines.push(`<dt>Golden render hash</dt><dd class="mono sha">${escapeHtml(reviewItem.finalVideoSha256)}</dd>`);
    lines.push("</dl>");
  }
  if (comments.length > 0) {
    lines.push('<ul class="review-comments">');
    for (const comment of comments) {
      lines.push(
        `<li class="review-comment" data-comment-id="${escapeHtml(comment.id)}">` +
          `<span class="timestamp">@${escapeHtml(comment.timestampMs)}ms</span> ` +
          `<span class="body">${escapeHtml(comment.body)}</span>` +
          `</li>`
      );
    }
    lines.push("</ul>");
  }
  if (notification) {
    lines.push(
      `<p class="notification" data-notification-status="${escapeHtml(notification.status)}" ` +
        `data-duplicate-collapsed="${escapeHtml(String(notification.duplicateCollapsed))}">` +
        `Notification ${escapeHtml(notification.status)}${notification.duplicateCollapsed ? " (collapsed duplicate)" : ""}.` +
        `</p>`
    );
  }
  if (decision) {
    lines.push('<dl class="review-decision">');
    lines.push(`<dt>Decision</dt><dd>${escapeHtml(decision.decision)}</dd>`);
    if (decision.reason) {
      lines.push(`<dt>Reason</dt><dd>${escapeHtml(decision.reason)}</dd>`);
    }
    lines.push(`<dt>Bound final-video version</dt><dd>${escapeHtml(decision.finalVideoVersion)}</dd>`);
    lines.push(`<dt>Golden render hash</dt><dd class="mono sha">${escapeHtml(decision.finalVideoSha256)}</dd>`);
    lines.push("</dl>");
  }
  if (approvalReference) {
    lines.push(
      `<p class="approval-reference" data-final-video-version="${escapeHtml(approvalReference.finalVideoVersion)}">` +
        `Approval reference for version ${escapeHtml(approvalReference.finalVideoVersion)}: ` +
        `<span class="mono token">${escapeHtml(approvalReference.token)}</span>` +
        `</p>`
    );
  }
  lines.push("</section>");
  return lines.join("\n");
}
