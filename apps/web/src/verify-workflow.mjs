import { banner, escapeHtml, renderBanner, stableState } from "./workflow-markup-utils.mjs";

export function verificationState(body) {
  return stableState(body?.verification?.status, ["pending", "checking", "processing_wait", "retry_scheduled", "verified", "failed", "identity_mismatch", "visibility_restricted", "manual_url_required"]);
}

export function classifyVerifyError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    VERIFY_IDENTITY_MISMATCH: "identity-mismatch",
    VERIFY_VISIBILITY_RESTRICTED: "visibility-restricted",
    VERIFY_MANUAL_URL_REQUIRED: "manual-url-required",
    PROVIDER_OUTPUT_INVALID: "verify-invalid",
    VALIDATION_FAILED: "verify-invalid"
  }[error?.code] ?? "error";
}

export function deriveVerifyState(input = {}) {
  if (input.phase === "error") return { banner: banner(classifyVerifyError(input.error), input.error?.code === "WORKSPACE_ACCESS_DENIED" ? "We could not find that calendar post in this workspace." : "Verification is not available."), calendarPost: null, verification: null, evidenceArtifact: null, notification: null, performanceSnapshot: null };
  if (input.body?.code === "VERIFY_PROCESSING_WAIT") return { banner: banner("processing-wait", "The platform is still processing the post.", { retryAfterMs: input.body.retryAfterMs }), calendarPost: input.body.calendarPost, verification: null, evidenceArtifact: null, notification: null, performanceSnapshot: null };
  const verification = input.body?.verification ? { ...input.body.verification, status: verificationState(input.body), observedAccount: undefined, observedMedia: undefined } : null;
  const notification = input.body?.notification ? { notificationType: input.body.notification.notificationType, channel: input.body.notification.channel, status: input.body.notification.status, duplicateCollapsed: input.body.notification.duplicateCollapsed } : null;
  const evidenceArtifact = input.body?.evidenceArtifact ? { sha256: input.body.evidenceArtifact.sha256, status: input.body.evidenceArtifact.status, retentionClass: input.body.evidenceArtifact.retentionClass, schemaVersion: input.body.evidenceArtifact.schemaVersion } : null;
  const state = verification?.status === "verified" ? "verified" : verification?.status ?? "unknown";
  return { banner: banner(state, "Verification state loaded."), calendarPost: input.body?.calendarPost ?? null, verification, evidenceArtifact, notification, performanceSnapshot: input.body?.performanceSnapshot ?? null };
}

export function verifyMarkup(descriptor) {
  const retry = descriptor.banner.retryAfterMs ? ` Check again in about ${Math.ceil(descriptor.banner.retryAfterMs / 60000)} minutes` : "";
  const verification = descriptor.verification ? `<dl><dt>Verification status</dt><dd>${escapeHtml(descriptor.verification.status)}</dd></dl>` : "";
  const evidence = descriptor.evidenceArtifact ? `<dl><dt>Evidence sha256</dt><dd class="mono">${escapeHtml(descriptor.evidenceArtifact.sha256)}</dd></dl>` : "";
  const notification = descriptor.notification ? `<dl><dt>Notification</dt><dd>${escapeHtml(descriptor.notification.notificationType)}</dd></dl>` : "";
  const manualUrl = descriptor.calendarPost?.manualLiveUrl ? `<dl><dt>Manual live URL</dt><dd class="mono url">${escapeHtml(descriptor.calendarPost.manualLiveUrl)}</dd></dl>` : "";
  return `${renderBanner("verify-status", { ...descriptor.banner, text: `${descriptor.banner.text}${retry}` })}${verification}${evidence}${notification}${manualUrl}`;
}
