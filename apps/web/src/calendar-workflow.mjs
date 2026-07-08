import { banner, escapeHtml, renderBanner, stableState } from "./workflow-markup-utils.mjs";

export function calendarPostState(body) {
  return stableState(body?.calendarPost?.status, ["draft", "approved", "scheduled", "submitting", "accepted", "published_unverified", "published_verified", "failed", "cancelled"]);
}

export function classifyCalendarError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    IDEMPOTENCY_KEY_REQUIRED: "missing-idempotency",
    REVIEW_APPROVAL_REQUIRED: "approval-required",
    PUBLISH_MEDIA_STALE: "media-stale",
    PUBLISH_SCHEDULE_INVALID: "schedule-invalid",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    VALIDATION_FAILED: "post-invalid",
    RESOURCE_VERSION_STALE: "version-stale",
    PUBLISH_POST_LOCKED: "post-locked"
  }[error?.code] ?? "error";
}

function publicPost(post) {
  if (!post) return null;
  return { ...post, status: stableState(post.status, ["draft", "approved", "scheduled", "submitting", "accepted", "published_unverified", "published_verified", "failed", "cancelled"]) };
}

export function deriveCalendarState(input = {}) {
  if (input.phase === "error") {
    const state = classifyCalendarError(input.error);
    const text = state === "blocked-hidden" ? "We could not find that approved media in this workspace." : state === "version-stale" ? "The calendar post changed after you opened it." : state === "post-locked" ? "This calendar post can no longer be edited." : "Calendar post is not available.";
    return { banner: banner(state, text), calendarPost: null, exportArtifact: null };
  }
  const post = publicPost(input.body?.calendarPost);
  const exportArtifact = input.body?.exportArtifact ?? null;
  if (input.phase === "edit-loading") return { banner: banner("edit-loading", "Saving your calendar post."), calendarPost: post, exportArtifact };
  if (input.phase === "edit-ready") return { banner: banner("edit-saved", "Calendar post saved."), calendarPost: post, exportArtifact };
  if (!post) return { banner: banner("unknown", "Calendar post state is unknown."), calendarPost: null, exportArtifact: null };
  const state = post.status === "scheduled" ? "post-scheduled" : post.manualExport ? "manual-export-ready" : post.status === "unknown" ? "unknown" : post.status;
  return { banner: banner(state, "Calendar post loaded."), calendarPost: post, exportArtifact };
}

export function calendarMarkup(descriptor) {
  const post = descriptor.calendarPost;
  const rows = post ? `<dl><dt>Calendar status</dt><dd>${escapeHtml(post.status)}</dd><dt>Bound final-video version</dt><dd>${escapeHtml(post.finalVideoVersion)}</dd><dt>Scheduled at</dt><dd>${post.scheduledAt ? `${escapeHtml(post.scheduledAt)} (${escapeHtml(post.timezone)})` : "Not scheduled"}</dd><dt>Manual export</dt><dd>${post.manualExport ? "Manual export ready, no scheduled time." : "Scheduled publication"}</dd><dt>Manual live URL</dt><dd>${post.manualLiveUrl ? escapeHtml(post.manualLiveUrl) : "Not provided yet"}</dd><dt>Approval reference</dt><dd class="mono token">${escapeHtml(post.approvalToken ?? "")}</dd></dl>` : "";
  const artifact = descriptor.exportArtifact ? `<dl><dt>Export package</dt><dd>${escapeHtml(descriptor.exportArtifact.retentionClass)} (${escapeHtml(descriptor.exportArtifact.schemaVersion)})</dd><dt>Export content hash</dt><dd class="mono sha">${escapeHtml(descriptor.exportArtifact.sha256)}</dd></dl>` : "";
  return `${renderBanner("calendar-status", descriptor.banner)}${rows}${artifact}`;
}
