// V0-U4 audience-facing verification workflow. Pure, DOM-agnostic state functions unit tested in
// Node, plus a `verifyMarkup` renderer. An authorised production role
// (schedule_publish_approved_media: Owner/Admin/Client Manager; NOT Reviewer) independently
// verifies the audience-facing live post against the approved calendar post. Provider
// acknowledgement alone never becomes success: a not-yet-live post is VERIFY_PROCESSING_WAIT
// (202) and the workflow shows a calm processing-wait state with a retry-after, never a success.
// Only a verified PostVerification advances the post to published_verified and shows the verified
// state with the one completion notification (deduplicated, never a second send). Wrong media or
// account (VERIFY_IDENTITY_MISMATCH) and restricted visibility (VERIFY_VISIBILITY_RESTRICTED) are
// explicit non-successes and send no notification; a manual-export post without a live URL is
// VERIFY_MANUAL_URL_REQUIRED until one is supplied. The workflow is never optimistic: it shows
// loading, calls the API (no Idempotency-Key is required; exactly-once is the
// one-verification-per-post row), and renders the verification result, the audience evidence
// reference (a public sha256; the object key is never rendered), the one notification and the
// initial performance snapshot, or a calm error. The object key, recipient user id, payload hash,
// raw observed identity values and raw provider payloads never appear in the rendered markup.
// Browser code holds no database, Redis, provider or secret credentials beyond the caller JWT.

const VERIFICATION_STATUSES = [
  "pending",
  "checking",
  "processing_wait",
  "retry_scheduled",
  "verified",
  "failed",
  "identity_mismatch",
  "visibility_restricted",
  "manual_url_required"
];

const CALENDAR_STATUSES = [
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

// Map a verification status (lowercase per V0_STATUS_ENUMS.md) to a stable UI state, preserving
// unknown as a real state. The verification record is the durable audience-facing truth.
export function verificationState(body) {
  const status = String(body?.verification?.status ?? "").toLowerCase();
  if (VERIFICATION_STATUSES.includes(status)) {
    return status;
  }
  return "unknown";
}

// Map the calendar post's publish status to a stable UI state, preserving unknown.
function calendarPostState(body) {
  const status = String(body?.calendarPost?.status ?? "").toLowerCase();
  return CALENDAR_STATUSES.includes(status) ? status : "unknown";
}

// Map a verify problem to the workflow banner state. Cross-workspace and missing posts hide behind
// the same blocked state so the other workspace id never leaks; each guard gets its own honest
// state. VERIFY_PROCESSING_WAIT is NOT an error: it is a 202 success surfaced as a processing-wait
// banner with a retry-after, so it is handled in the ready phase, not here.
export function classifyVerifyError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    VERIFY_IDENTITY_MISMATCH: "identity-mismatch",
    VERIFY_VISIBILITY_RESTRICTED: "visibility-restricted",
    VERIFY_MANUAL_URL_REQUIRED: "manual-url-required",
    PROVIDER_OUTPUT_INVALID: "verify-invalid",
    VALIDATION_FAILED: "verify-invalid"
  };
  return map[problem.code] || "error";
}

function renderBannerText(state) {
  const texts = {
    empty: "No audience verification yet.",
    loading: "Loading the audience verification.",
    "verify-loading": "Verifying the live post.",
    "processing-wait": "The platform is still processing the post. We will check again.",
    verified: "Verified. The live post matches the approved media and is public.",
    "verify-failed": "The verification did not complete. Try again.",
    "identity-mismatch": "The live post does not match the approved account or media.",
    "visibility-restricted": "The post is not visible to the required audience.",
    "manual-url-required": "Add the live post URL before verification.",
    "blocked-hidden": "We could not find that calendar post.",
    forbidden: "Your role cannot verify audience posts.",
    "verify-invalid": "The live post could not be read for verification.",
    unknown: "We could not complete this verification. Try again.",
    error: "We could not complete this verification. Try again."
  };
  return texts[state] || texts.error;
}

// Derive the workflow descriptor from the current phase and API response. The descriptor is a
// plain object so it can be asserted in Node without a DOM; the browser glue renders it via
// verifyMarkup. The descriptor never carries the evidence object key (a storage secret), the
// notification recipient user id or payload hash, the raw observed identity values, or the
// workspace id (the page is already workspace-scoped).
export function deriveVerifyState({ phase, body = null, error = null }) {
  let banner = { state: "empty", text: renderBannerText("empty") };
  if (phase === "loading") {
    banner = { state: "loading", text: renderBannerText("loading") };
  } else if (phase === "verify-loading") {
    banner = { state: "verify-loading", text: renderBannerText("verify-loading") };
  } else if (phase === "error") {
    const state = classifyVerifyError(error);
    banner = { state, text: renderBannerText(state) };
  } else if (phase === "ready") {
    // A 202 VERIFY_PROCESSING_WAIT is a calm processing-wait state, never a success or an error.
    if (body && body.code === "VERIFY_PROCESSING_WAIT") {
      banner = { state: "processing-wait", text: renderBannerText("processing-wait") };
      if (typeof body.retryAfterMs === "number") {
        banner.retryAfterMs = body.retryAfterMs;
      }
    } else {
      const status = verificationState(body);
      const stateMap = {
        verified: "verified",
        processing_wait: "processing-wait",
        identity_mismatch: "identity-mismatch",
        visibility_restricted: "visibility-restricted",
        manual_url_required: "manual-url-required",
        failed: "verify-failed",
        pending: "processing-wait",
        checking: "processing-wait",
        retry_scheduled: "processing-wait",
        unknown: "unknown"
      };
      const state = stateMap[status] || "unknown";
      banner = { state, text: renderBannerText(state) };
    }
  }

  const verification =
    body && body.verification
      ? {
          id: body.verification.id,
          status: verificationState(body),
          provider: body.verification.provider,
          attempts: body.verification.attempts ?? null,
          accountMatched: body.verification.accountMatched ?? null,
          mediaSha256Matched: body.verification.mediaSha256Matched ?? null,
          captionMatched: body.verification.captionMatched ?? null,
          visibility: body.verification.visibility ?? null,
          evidenceArtifactId: body.verification.evidenceArtifactId ?? null,
          verifiedAt: body.verification.verifiedAt ?? null
        }
      : null;

  const evidenceArtifact =
    body && body.evidenceArtifact
      ? {
          id: body.evidenceArtifact.id,
          sha256: body.evidenceArtifact.sha256,
          status: body.evidenceArtifact.status,
          retentionClass: body.evidenceArtifact.retentionClass,
          schemaVersion: body.evidenceArtifact.schemaVersion
        }
      : null;

  const notification =
    body && body.notification
      ? {
          id: body.notification.id,
          notificationType: body.notification.notificationType,
          channel: body.notification.channel,
          status: body.notification.status,
          duplicateCollapsed: Boolean(body.notification.duplicateCollapsed)
        }
      : null;

  const performanceSnapshot =
    body && body.performanceSnapshot
      ? {
          id: body.performanceSnapshot.id,
          calendarPostId: body.performanceSnapshot.calendarPostId,
          platform: body.performanceSnapshot.platform,
          source: body.performanceSnapshot.source,
          observationWindowStart: body.performanceSnapshot.observationWindowStart ?? null,
          observationWindowEnd: body.performanceSnapshot.observationWindowEnd ?? null
        }
      : null;

  const calendarPost =
    body && body.calendarPost
      ? {
          id: body.calendarPost.id,
          status: calendarPostState(body),
          platform: body.calendarPost.platform,
          account: body.calendarPost.account,
          manualExport: Boolean(body.calendarPost.manualExport),
          manualLiveUrl: body.calendarPost.manualLiveUrl ?? null
        }
      : null;

  return { banner, verification, evidenceArtifact, notification, performanceSnapshot, calendarPost };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

// Render the workflow descriptor as a self-contained HTML card. Only the verification status, the
// bound provider, the audience evidence sha256 (a public content fingerprint; the object key is
// never rendered), the match flags, the one notification summary and the bound calendar post
// summary are rendered. The object key, recipient user id, payload hash, raw observed identity
// values and raw provider payloads never appear here.
export function verifyMarkup(descriptor) {
  const { banner, verification, evidenceArtifact, notification, performanceSnapshot, calendarPost } = descriptor;
  const lines = [];
  lines.push('<section class="audience-verification" aria-live="polite">');
  lines.push(`<h2>Audience verification</h2>`);
  lines.push(`<p class="banner" data-state="${escapeHtml(banner.state)}">${escapeHtml(banner.text)}</p>`);
  if (banner.retryAfterMs && banner.state === "processing-wait") {
    const minutes = Math.max(1, Math.round(banner.retryAfterMs / 60000));
    lines.push(`<p class="verify-retry" data-retry-minutes="${escapeHtml(String(minutes))}">Check again in about ${escapeHtml(String(minutes))} minutes.</p>`);
  }
  if (verification) {
    lines.push('<dl class="verification-summary">');
    lines.push(`<dt>Verification status</dt><dd>${escapeHtml(verification.status)}</dd>`);
    lines.push(`<dt>Provider</dt><dd>${escapeHtml(verification.provider)}</dd>`);
    if (verification.attempts !== null) {
      lines.push(`<dt>Attempts</dt><dd>${escapeHtml(String(verification.attempts))}</dd>`);
    }
    if (verification.accountMatched !== null) {
      lines.push(`<dt>Account matched</dt><dd>${escapeHtml(String(verification.accountMatched))}</dd>`);
    }
    if (verification.mediaSha256Matched !== null) {
      lines.push(`<dt>Media matched</dt><dd>${escapeHtml(String(verification.mediaSha256Matched))}</dd>`);
    }
    if (verification.captionMatched !== null) {
      lines.push(`<dt>Caption matched</dt><dd>${escapeHtml(String(verification.captionMatched))}</dd>`);
    }
    if (verification.visibility) {
      lines.push(`<dt>Visibility</dt><dd>${escapeHtml(verification.visibility)}</dd>`);
    }
    if (verification.verifiedAt) {
      lines.push(`<dt>Verified at</dt><dd>${escapeHtml(verification.verifiedAt)}</dd>`);
    }
    lines.push("</dl>");
  }
  if (evidenceArtifact) {
    lines.push('<dl class="evidence-summary">');
    lines.push(`<dt>Evidence sha256</dt><dd class="mono">${escapeHtml(evidenceArtifact.sha256)}</dd>`);
    lines.push(`<dt>Evidence status</dt><dd>${escapeHtml(evidenceArtifact.status)}</dd>`);
    lines.push(`<dt>Retention class</dt><dd>${escapeHtml(evidenceArtifact.retentionClass)}</dd>`);
    lines.push("</dl>");
  }
  if (notification) {
    lines.push('<dl class="notification-summary">');
    lines.push(`<dt>Notification</dt><dd>${escapeHtml(notification.notificationType)}</dd>`);
    lines.push(`<dt>Notification status</dt><dd>${escapeHtml(notification.status)}</dd>`);
    lines.push(`<dt>Duplicate collapsed</dt><dd>${escapeHtml(String(notification.duplicateCollapsed))}</dd>`);
    lines.push("</dl>");
  }
  if (performanceSnapshot) {
    lines.push('<dl class="performance-snapshot-summary">');
    lines.push(`<dt>Snapshot source</dt><dd>${escapeHtml(performanceSnapshot.source)}</dd>`);
    if (performanceSnapshot.observationWindowStart) {
      lines.push(`<dt>Observation window start</dt><dd>${escapeHtml(performanceSnapshot.observationWindowStart)}</dd>`);
    }
    lines.push("</dl>");
  }
  if (calendarPost) {
    lines.push('<dl class="calendar-post-summary">');
    lines.push(`<dt>Calendar status</dt><dd>${escapeHtml(calendarPost.status)}</dd>`);
    lines.push(`<dt>Platform</dt><dd>${escapeHtml(calendarPost.platform)}</dd>`);
    lines.push(`<dt>Account</dt><dd>${escapeHtml(calendarPost.account)}</dd>`);
    if (calendarPost.manualLiveUrl) {
      lines.push(`<dt>Manual live URL</dt><dd class="mono url">${escapeHtml(calendarPost.manualLiveUrl)}</dd>`);
    }
    lines.push("</dl>");
  }
  lines.push("</section>");
  return lines.join("\n");
}
