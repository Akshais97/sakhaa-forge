import { banner, escapeHtml, renderBanner, stableState } from "./workflow-markup-utils.mjs";

export function publishOperationState(body) {
  return stableState(body?.operation?.status, ["created", "submitting", "accepted", "unknown", "processing", "completed", "rejected", "failed", "cancelled"]);
}

export function classifyPublishError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    IDEMPOTENCY_KEY_REQUIRED: "missing-idempotency",
    PUBLISH_ACCOUNT_MISMATCH: "account-mismatch",
    PUBLISH_NOT_SUBMITTABLE: "not-submittable",
    PROVIDER_CALLBACK_INVALID: "callback-invalid",
    PROVIDER_OUTPUT_INVALID: "post-invalid",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    PUBLISH_MEDIA_STALE: "media-stale",
    REVIEW_APPROVAL_REQUIRED: "approval-required",
    VALIDATION_FAILED: "post-invalid",
    PUBLISH_QUOTA_EXHAUSTED: "quota-exhausted",
    PUBLISH_PLATFORM_UNSUPPORTED: "platform-unsupported"
  }[error?.code] ?? "error";
}

function providerLabel(platform) {
  return platform === "youtube-shorts" ? "YouTube" : "Meta";
}

function redactOperation(operation) {
  if (!operation) return null;
  const { requestHash, ...safe } = operation;
  return { ...safe, status: stableState(operation.status, ["created", "submitting", "accepted", "unknown", "processing", "completed", "rejected", "failed", "cancelled"]) };
}

export function derivePublishState(input = {}) {
  if (input.phase === "error") {
    const state = classifyPublishError(input.error);
    return { banner: banner(state, state === "platform-unsupported" ? "This platform is not supported for direct publication." : state === "blocked-hidden" ? "We could not find that calendar post in this workspace." : "Publication is not available.", { retryAfterMs: input.error?.retryAfterMs }), calendarPost: null, operation: null };
  }
  const calendarPost = input.body?.calendarPost ?? null;
  const operation = redactOperation(input.body?.operation);
  if (!operation) return { banner: banner("unknown-checking", "Publication state is unknown."), calendarPost, operation: null };
  let state = "unknown-checking";
  if (operation.status === "accepted") state = "publish-accepted";
  if (operation.status === "processing") state = "publish-processing";
  if (operation.status === "completed") state = "published-unverified";
  if (operation.status === "failed") state = "publish-failed";
  const label = providerLabel(calendarPost?.platform);
  const text = state === "publish-processing" ? `${label} is processing the post.` : state === "publish-accepted" ? `The post was accepted and is not live on ${label} yet.` : "Publication state loaded.";
  return { banner: banner(state, text), calendarPost, operation };
}

export function publishMarkup(descriptor) {
  const retry = descriptor.banner.retryAfterMs ? ` Retry in about ${Math.ceil(descriptor.banner.retryAfterMs / 60000)} minutes` : "";
  const op = descriptor.operation;
  const urlValue = op?.publicUrl ? `<dd class="mono url">${escapeHtml(op.publicUrl)}</dd>` : "<dd>Not live yet</dd>";
  const rows = op ? `<dl><dt>Publish status</dt><dd>${escapeHtml(op.status)}</dd><dt>Provider</dt><dd>${escapeHtml(op.provider)}</dd><dt>External post id</dt><dd class="mono external">${escapeHtml(op.externalId ?? "")}</dd><dt>Public post URL</dt>${urlValue}</dl>` : "";
  return `${renderBanner("publish-status", { ...descriptor.banner, text: `${descriptor.banner.text}${retry}` })}${rows}`;
}
