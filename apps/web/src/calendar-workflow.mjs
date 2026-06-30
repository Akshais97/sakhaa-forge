// V0-U1 approved calendar and manual export workflow. Pure, DOM-agnostic state functions unit
// tested in Node, plus a `calendarMarkup` renderer. An authorised production role
// (schedule_publish_approved_media: Owner/Admin/Client Manager; NOT Reviewer) creates one calendar
// post bound to one approved exact final-video version (finalVideoId + captured
// finalVideoSha256 + finalVideoVersion + the R2 approval token). A scheduled post (manualExport
// false) requires a valid future scheduledAt with an explicit UTC offset and is created SCHEDULED;
// a manual-export post (manualExport true) is created APPROVED with no scheduledAt and produces a
// retained manual-export Artifact whose sha256 is the deterministic manual-export package hash,
// leaving manualLiveUrl null for later verification. The workflow is never optimistic: it shows
// loading, calls the API with an Idempotency-Key, and renders the committed calendar post, the
// bound version + golden sha256, the public approval token, the scheduled time, the manual-export
// artifact content hash, or a calm error. Unapproved media is REVIEW_APPROVAL_REQUIRED, superseded
// media is PUBLISH_MEDIA_STALE, a past/invalid/conflicting schedule is PUBLISH_SCHEDULE_INVALID.
// Cross-workspace creates hide behind the same blocked state so the other workspace id never leaks.
// The approval token is a stable public reference; the export artifact sha256 is a public content
// hash; signed URLs, object keys, producer secrets, raw provider payloads and secrets never appear
// in the rendered markup. Browser code holds no database, Redis, provider or secret credentials
// beyond the caller JWT.

const PUBLISH_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "submitting",
  "accepted",
  "published_unverified",
  "published_verified",
  "failed",
  "cancelled"
];

// Map a calendar post status (lowercase per V0_STATUS_ENUMS.md) to a stable UI state, preserving
// unknown as a real state.
export function calendarPostState(body) {
  const status = String(body?.calendarPost?.status ?? "").toLowerCase();
  return PUBLISH_STATUSES.includes(status) ? status : "unknown";
}

// Map a calendar create problem to the workflow banner state. Cross-workspace and missing
// workspaces hide behind the same blocked state so the other workspace id never leaks; each guard
// gets its own honest state. Superseded media is recoverable by scheduling the latest version; an
// unapproved version is recoverable by recording an approve decision; an invalid schedule is
// recoverable by choosing a valid future time.
export function classifyCalendarError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
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
  };
  return map[problem.code] || "error";
}

function renderBannerText(state) {
  const texts = {
    empty: "No calendar post created yet.",
    loading: "Opening the calendar.",
    "create-loading": "Creating your calendar post.",
    "edit-loading": "Saving your calendar post.",
    "edit-saved": "Calendar post saved.",
    "post-scheduled": "Calendar post scheduled.",
    "manual-export-ready": "Manual export ready. Publish it manually and add the live URL later.",
    forbidden: "Your role cannot schedule or export approved media.",
    "blocked-hidden": "We could not find that approved media.",
    "missing-idempotency": "An idempotency key is required for this action.",
    "approval-required": "Approve this exact final-video version before scheduling.",
    "media-stale": "This final-video version has been superseded. Schedule the latest version.",
    "schedule-invalid": "Choose a valid future time for this account.",
    "idempotency-conflict": "This request identity was already used with different details.",
    "post-invalid": "The calendar post was not valid. Check the platform, account and caption.",
    "version-stale": "This calendar post changed after you opened it. Review the latest version.",
    "post-locked": "This calendar post can no longer be edited.",
    unknown: "We could not complete this calendar action. Try again.",
    error: "We could not complete this calendar action. Try again."
  };
  return texts[state] || texts.error;
}

// Derive the workflow descriptor from the current phase and API response. The descriptor is a
// plain object so it can be asserted in Node without a DOM; the browser glue renders it via
// calendarMarkup.
export function deriveCalendarState({ phase, body = null, error = null }) {
  let banner = { state: "empty", text: renderBannerText("empty") };
  if (phase === "loading") {
    banner = { state: "loading", text: renderBannerText("loading") };
  } else if (phase === "create-loading") {
    banner = { state: "create-loading", text: renderBannerText("create-loading") };
  } else if (phase === "edit-loading") {
    banner = { state: "edit-loading", text: renderBannerText("edit-loading") };
  } else if (phase === "error") {
    const state = classifyCalendarError(error);
    banner = { state, text: renderBannerText(state) };
  } else if (phase === "edit-ready") {
    // An edit success returns the updated post; show a saved banner and let the post summary
    // reflect the new status, version and bound media.
    const status = calendarPostState(body);
    if (status === "unknown") {
      banner = { state: "unknown", text: renderBannerText("unknown") };
    } else {
      banner = { state: "edit-saved", text: renderBannerText("edit-saved") };
    }
  } else if (phase === "ready") {
    const status = calendarPostState(body);
    if (status === "unknown") {
      banner = { state: "unknown", text: renderBannerText("unknown") };
    } else if (status === "approved") {
      banner = { state: "manual-export-ready", text: renderBannerText("manual-export-ready") };
    } else {
      banner = { state: "post-scheduled", text: renderBannerText("post-scheduled") };
    }
  }

  const calendarPost = body && body.calendarPost
    ? {
        id: body.calendarPost.id,
        status: calendarPostState(body),
        platform: body.calendarPost.platform,
        account: body.calendarPost.account,
        finalVideoId: body.calendarPost.finalVideoId,
        finalVideoSha256: body.calendarPost.finalVideoSha256,
        finalVideoVersion: body.calendarPost.finalVideoVersion,
        approvalToken: body.calendarPost.approvalToken,
        scheduledAt: body.calendarPost.scheduledAt ?? null,
        timezone: body.calendarPost.timezone,
        manualExport: Boolean(body.calendarPost.manualExport),
        manualLiveUrl: body.calendarPost.manualLiveUrl ?? null,
        exportArtifactId: body.calendarPost.exportArtifactId ?? null,
        version: Number.isInteger(body.calendarPost.version) ? body.calendarPost.version : null
      }
    : null;
  // V0-U1: the manual-export artifact content hash is a public content hash; the object key is
  // never surfaced (publicArtifact omits it and the web layer never re-adds it).
  const exportArtifact =
    body && body.exportArtifact
      ? {
          id: body.exportArtifact.id,
          sha256: body.exportArtifact.sha256,
          retentionClass: body.exportArtifact.retentionClass,
          schemaVersion: body.exportArtifact.schemaVersion,
          status: String(body.exportArtifact.status ?? "").toLowerCase()
        }
      : null;
  return { banner, calendarPost, exportArtifact };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

// Render the workflow descriptor as a self-contained HTML card. Only the calendar post status,
// platform, account, the bound final-video version and golden sha256, the public approval token,
// the scheduled time and timezone, the manual live URL (null until later verification) and the
// manual-export artifact content hash are rendered. Signed URLs, object keys, producer secrets and
// raw provider payloads never appear here; the approval token is a stable public reference and the
// export artifact sha256 is a public content hash.
export function calendarMarkup(descriptor) {
  const { banner, calendarPost, exportArtifact } = descriptor;
  const lines = [];
  lines.push('<section class="calendar-post" aria-live="polite">');
  lines.push(`<h2>Calendar</h2>`);
  lines.push(`<p class="banner" data-state="${escapeHtml(banner.state)}">${escapeHtml(banner.text)}</p>`);
  if (calendarPost) {
    lines.push('<dl class="calendar-post-summary">');
    lines.push(`<dt>Calendar status</dt><dd>${escapeHtml(calendarPost.status)}</dd>`);
    lines.push(`<dt>Platform</dt><dd>${escapeHtml(calendarPost.platform)}</dd>`);
    lines.push(`<dt>Account</dt><dd>${escapeHtml(calendarPost.account)}</dd>`);
    lines.push(`<dt>Bound final-video version</dt><dd>${escapeHtml(calendarPost.finalVideoVersion)}</dd>`);
    lines.push(`<dt>Golden render hash</dt><dd class="mono sha">${escapeHtml(calendarPost.finalVideoSha256)}</dd>`);
    lines.push(`<dt>Approval reference</dt><dd class="mono token">${escapeHtml(calendarPost.approvalToken)}</dd>`);
    if (calendarPost.scheduledAt) {
      lines.push(`<dt>Scheduled at</dt><dd>${escapeHtml(calendarPost.scheduledAt)} (${escapeHtml(calendarPost.timezone)})</dd>`);
    } else if (calendarPost.manualExport) {
      lines.push(`<dt>Manual export</dt><dd>Manual export ready, no scheduled time.</dd>`);
    }
    lines.push(
      `<dt>Manual live URL</dt><dd>${calendarPost.manualLiveUrl ? escapeHtml(calendarPost.manualLiveUrl) : "Not provided yet"}</dd>`
    );
    lines.push("</dl>");
  }
  if (exportArtifact) {
    lines.push('<dl class="manual-export-artifact">');
    lines.push(`<dt>Export package</dt><dd>${escapeHtml(exportArtifact.retentionClass)} (${escapeHtml(exportArtifact.schemaVersion)})</dd>`);
    lines.push(`<dt>Export content hash</dt><dd class="mono sha">${escapeHtml(exportArtifact.sha256)}</dd>`);
    lines.push("</dl>");
  }
  lines.push("</section>");
  return lines.join("\n");
}
