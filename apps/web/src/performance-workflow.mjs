import { banner, escapeHtml, renderBanner } from "./workflow-markup-utils.mjs";

export function performanceState(body) {
  const snapshots = body?.snapshots ?? [];
  if (body?.calendarPost?.status === "published_verified" && snapshots.length > 0) return "observed";
  if (body?.calendarPost?.status === "published_verified") return "awaiting-collection";
  if (body?.calendarPost && snapshots.length > 0) return "stale";
  if (body?.calendarPost) return "not-observable";
  return "unknown";
}

export function classifyPerformanceError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    IDEMPOTENCY_KEY_REQUIRED: "missing-idempotency",
    PERFORMANCE_NOT_OBSERVABLE: "not-observable",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    PERFORMANCE_PROCESSING_WAIT: "processing-wait",
    VALIDATION_FAILED: "performance-invalid"
  }[error?.code] ?? "error";
}

export function derivePerformanceState(input = {}) {
  if (input.phase === "error") return { banner: banner(classifyPerformanceError(input.error), input.error?.code === "WORKSPACE_ACCESS_DENIED" ? "We could not find that calendar post in this workspace." : "Performance is not available."), snapshots: [] };
  if (input.phase === "collect-ready") {
    return { banner: banner(input.replay ? "collect-replay" : "collect-ready", "Performance observation retained."), snapshots: input.body?.performanceSnapshot ? [input.body.performanceSnapshot] : [] };
  }
  const snapshots = input.body?.snapshots ?? [];
  return { banner: banner(performanceState(input.body), "Performance observations loaded."), snapshots };
}

export function performanceMarkup(descriptor) {
  const metrics = (descriptor.snapshots ?? []).map((snapshot) => `<li>${escapeHtml(snapshot.metrics?.views ?? 0)} ${escapeHtml(snapshot.metrics?.likes ?? 0)} ${escapeHtml(snapshot.metrics?.comments ?? 0)} ${escapeHtml(snapshot.metrics?.shares ?? 0)} ${escapeHtml(snapshot.metrics?.saves ?? 0)}</li>`).join("");
  return `${renderBanner("performance-status", descriptor.banner)}<section>Performance<ul>${metrics}</ul><p>Observed metrics are not a prediction, forecast or promise of reach, virality, conversion or causal performance.</p></section>`;
}
