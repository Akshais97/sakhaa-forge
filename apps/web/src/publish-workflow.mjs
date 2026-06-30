// V0-U2 idempotent Meta publication workflow. Pure, DOM-agnostic state functions unit tested in
// Node, plus a `publishMarkup` renderer. An authorised production role
// (schedule_publish_approved_media: Owner/Admin/Client Manager; NOT Reviewer) publishes an
// approved scheduled calendar post to the intended Meta account exactly once. A durable
// PublishOperation is persisted BEFORE the Meta network I/O so a crash between persistence and
// the network response leaves a resumable operation, never a blind duplicate. The operation
// binds the workspace, the calendar post, the Meta provider route, the idempotency key and a
// server-side request hash, and stores the external post id and the public post URL only once
// the provider identity is known. A timeout after possible acceptance marks the operation
// unknown and the caller must reconcile before any retry; blind resubmission is prohibited.
// The Meta callback is signature-verified, windowed and deduplicated; a replay never transitions
// a second time. The wrong-account check rejects a publish whose body account does not match the
// calendar post's bound account; a manual-export post cannot be submitted to a provider. The
// workflow is never optimistic: it shows loading, calls the API with an Idempotency-Key, and
// renders the committed operation, the bound calendar post, the external post id and the public
// post URL (only once live), or a calm error. The request hash is a server-side binding secret
// and is never surfaced; signed URLs, object keys, producer secrets, raw provider payloads and
// credentials never appear in the rendered markup. The public post URL is the audience-facing
// URL and is rendered only once the post is live; the external post id is a public provider
// identity and is rendered. Browser code holds no database, Redis, provider or secret
// credentials beyond the caller JWT.

const PUBLISH_OPERATION_STATUSES = [
  "created",
  "submitting",
  "accepted",
  "unknown",
  "processing",
  "completed",
  "rejected",
  "failed",
  "cancelled"
];

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

// Map a publish operation status (lowercase per V0_STATUS_ENUMS.md) to a stable UI state,
// preserving unknown as a real state. The post-level PublishStatus enum has no unknown; the
// operation carries the precise uncertain truth while the post stays submitting.
export function publishOperationState(body) {
  const status = String(body?.operation?.status ?? "").toLowerCase();
  return PUBLISH_OPERATION_STATUSES.includes(status) ? status : "unknown";
}

// Map the calendar post's publish status to a stable UI state, preserving unknown.
function publishPostState(body) {
  const status = String(body?.calendarPost?.status ?? "").toLowerCase();
  return PUBLISH_STATUSES.includes(status) ? status : "unknown";
}

// Map a publish problem to the workflow banner state. Cross-workspace and missing workspaces
// hide behind the same blocked state so the other workspace id never leaks; each guard gets its
// own honest state. A wrong account is recoverable by re-issuing with the bound account; a
// manual-export post is recoverable by publishing manually; an unknown operation is recoverable
// by reconciling before any retry; stale media is recoverable by publishing the latest version;
// a quota-exhausted platform is recoverable by retrying after the shown window or exporting
// manually; an unsupported platform is recoverable by exporting manually.
export function classifyPublishError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    IDEMPOTENCY_KEY_REQUIRED: "missing-idempotency",
    PUBLISH_ACCOUNT_MISMATCH: "account-mismatch",
    PUBLISH_NOT_SUBMITTABLE: "not-submittable",
    PUBLISH_QUOTA_EXHAUSTED: "quota-exhausted",
    PUBLISH_PLATFORM_UNSUPPORTED: "platform-unsupported",
    PROVIDER_CALLBACK_INVALID: "callback-invalid",
    PROVIDER_OUTPUT_INVALID: "post-invalid",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    PUBLISH_MEDIA_STALE: "media-stale",
    REVIEW_APPROVAL_REQUIRED: "approval-required",
    VALIDATION_FAILED: "post-invalid"
  };
  return map[problem.code] || "error";
}

// Map a calendar post platform to a short, honest provider label for banner copy. Unknown
// platforms fall back to a neutral label so the UI never claims a specific provider the backend
// did not bind. The provider name is the only provider-facing string rendered; the platform field
// itself is rendered separately in the calendar-post summary.
function platformLabel(platform) {
  if (platform === "meta") {
    return "Meta";
  }
  if (platform === "youtube-shorts") {
    return "YouTube";
  }
  return "the provider";
}

function renderBannerText(state, label = "the provider") {
  const texts = {
    empty: "No publish operation yet.",
    loading: "Loading the publish operation.",
    "publish-loading": `Submitting the post to ${label}.`,
    "reconcile-loading": "Reconciling the publish operation.",
    "publish-created": "The publish operation is queued.",
    "publish-submitting": `Submitting the post to ${label}.`,
    "publish-accepted": `Publish accepted. The post is live on ${label}, awaiting verification.`,
    "publish-processing": `${label} is processing the post.`,
    "published-unverified": "Published. The post is live; verification pending.",
    "unknown-checking": `We are checking the publish status with ${label}. No duplicate will be created.`,
    "publish-failed": "The publish failed. Reconcile before retrying.",
    "publish-cancelled": "The publish was cancelled.",
    "publish-rejected": `${label} rejected the post.`,
    forbidden: "Your role cannot publish approved media.",
    "blocked-hidden": "We could not find that calendar post.",
    "missing-idempotency": "An idempotency key is required for this action.",
    "account-mismatch": "The account in the request does not match the calendar post's account.",
    "not-submittable": "This post cannot be submitted to a provider.",
    "quota-exhausted": "The platform upload quota is exhausted. Retry at the shown time or export manually.",
    "platform-unsupported": "This platform is not supported for direct publication. Export manually.",
    "callback-invalid": "The publishing callback could not be verified.",
    "post-invalid": "The publish request was not valid.",
    "idempotency-conflict": "This request identity was already used with different details.",
    "media-stale": "The bound final-video version is stale. Publish the latest version.",
    "approval-required": "Approve this exact final-video version before publishing.",
    unknown: "We could not complete this publish action. Try again.",
    error: "We could not complete this publish action. Try again."
  };
  return texts[state] || texts.error;
}

// Derive the workflow descriptor from the current phase and API response. The descriptor is a
// plain object so it can be asserted in Node without a DOM; the browser glue renders it via
// publishMarkup. The operation descriptor never carries the request hash (a server-side binding
// secret) or the workspace id (the page is already workspace-scoped).
export function derivePublishState({ phase, body = null, error = null }) {
  // The platform label threads the bound provider into the banner copy so the UI reflects the
  // backend truth (Meta vs YouTube) rather than a hardcoded provider name. It is derived from the
  // calendar post when present; error phases (no body) use the neutral label.
  const label = platformLabel(body?.calendarPost?.platform);
  let banner = { state: "empty", text: renderBannerText("empty", label) };
  if (phase === "loading") {
    banner = { state: "loading", text: renderBannerText("loading", label) };
  } else if (phase === "publish-loading") {
    banner = { state: "publish-loading", text: renderBannerText("publish-loading", label) };
  } else if (phase === "reconcile-loading") {
    banner = { state: "reconcile-loading", text: renderBannerText("reconcile-loading", label) };
  } else if (phase === "error") {
    const state = classifyPublishError(error);
    banner = { state, text: renderBannerText(state, label) };
    // A quota-exhausted refusal carries a server-provided retry-after; surface it on the banner so
    // the user knows when to retry. The retry-after is the only quota metadata rendered.
    if (state === "quota-exhausted" && error && typeof error.retryAfterMs === "number") {
      banner.retryAfterMs = error.retryAfterMs;
    }
  } else if (phase === "ready") {
    const status = publishOperationState(body);
    const stateMap = {
      created: "publish-created",
      submitting: "publish-submitting",
      accepted: "publish-accepted",
      processing: "publish-processing",
      completed: "published-unverified",
      failed: "publish-failed",
      cancelled: "publish-cancelled",
      rejected: "publish-rejected",
      unknown: "unknown-checking"
    };
    const state = stateMap[status] || "unknown-checking";
    banner = { state, text: renderBannerText(state, label) };
  }

  const operation =
    body && body.operation
      ? {
          id: body.operation.id,
          status: publishOperationState(body),
          provider: body.operation.provider,
          operationType: body.operation.operationType,
          externalId: body.operation.externalId ?? null,
          publicUrl: body.operation.publicUrl ?? null,
          retryAfterMs: body.operation.retryAfterMs ?? null,
          lastErrorCode: body.operation.lastErrorCode ?? null,
          acceptedAt: body.operation.acceptedAt ?? null,
          completedAt: body.operation.completedAt ?? null,
          reconciledAt: body.operation.reconciledAt ?? null,
          updatedAt: body.operation.updatedAt ?? null
        }
      : null;

  const calendarPost =
    body && body.calendarPost
      ? {
          id: body.calendarPost.id,
          status: publishPostState(body),
          platform: body.calendarPost.platform,
          account: body.calendarPost.account,
          finalVideoId: body.calendarPost.finalVideoId,
          scheduledAt: body.calendarPost.scheduledAt ?? null,
          timezone: body.calendarPost.timezone,
          manualExport: Boolean(body.calendarPost.manualExport)
        }
      : null;

  return { banner, operation, calendarPost };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

// Render the workflow descriptor as a self-contained HTML card. Only the publish operation
// status, provider, the external post id (a public provider identity), the public post URL
// (the audience-facing URL, only once live) and the bound calendar post summary are rendered.
// The request hash, signed URLs, object keys, producer secrets, raw provider payloads and
// credentials never appear here; the public post URL is the only URL rendered and only once the
// post is live.
export function publishMarkup(descriptor) {
  const { banner, operation, calendarPost } = descriptor;
  const lines = [];
  lines.push('<section class="publish-operation" aria-live="polite">');
  lines.push(`<h2>Publish</h2>`);
  lines.push(`<p class="banner" data-state="${escapeHtml(banner.state)}">${escapeHtml(banner.text)}</p>`);
  if (banner.retryAfterMs && banner.state === "quota-exhausted") {
    // Render the server-provided retry-after (whole milliseconds) as a calm hint. No operation or
    // calendar post exists for a pre-flight quota refusal, so this is the only extra line.
    const minutes = Math.max(1, Math.round(banner.retryAfterMs / 60000));
    lines.push(`<p class="quota-retry" data-retry-minutes="${escapeHtml(String(minutes))}">Retry in about ${escapeHtml(String(minutes))} minutes, or export manually.</p>`);
  }
  if (operation) {
    lines.push('<dl class="publish-operation-summary">');
    lines.push(`<dt>Publish status</dt><dd>${escapeHtml(operation.status)}</dd>`);
    lines.push(`<dt>Provider</dt><dd>${escapeHtml(operation.provider)}</dd>`);
    lines.push(
      `<dt>External post id</dt><dd class="mono external">${
        operation.externalId ? escapeHtml(operation.externalId) : "Not assigned yet"
      }</dd>`
    );
    if (operation.publicUrl) {
      lines.push(`<dt>Public post URL</dt><dd class="mono url">${escapeHtml(operation.publicUrl)}</dd>`);
    } else {
      lines.push(`<dt>Public post URL</dt><dd>Not live yet</dd>`);
    }
    if (operation.lastErrorCode) {
      lines.push(`<dt>Last error</dt><dd>${escapeHtml(operation.lastErrorCode)}</dd>`);
    }
    lines.push("</dl>");
  }
  if (calendarPost) {
    lines.push('<dl class="calendar-post-summary">');
    lines.push(`<dt>Calendar status</dt><dd>${escapeHtml(calendarPost.status)}</dd>`);
    lines.push(`<dt>Platform</dt><dd>${escapeHtml(calendarPost.platform)}</dd>`);
    lines.push(`<dt>Account</dt><dd>${escapeHtml(calendarPost.account)}</dd>`);
    if (calendarPost.scheduledAt) {
      lines.push(
        `<dt>Scheduled at</dt><dd>${escapeHtml(calendarPost.scheduledAt)} (${escapeHtml(calendarPost.timezone)})</dd>`
      );
    }
    lines.push("</dl>");
  }
  lines.push("</section>");
  return lines.join("\n");
}
