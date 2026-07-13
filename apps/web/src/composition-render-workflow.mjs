import { banner, escapeHtml, renderBanner, stableState } from "./workflow-markup-utils.mjs";

export function attemptState(body) {
  return stableState(body?.attempt?.status, ["running", "succeeded", "failed"]);
}

export function finalVideoState(body) {
  return stableState(body?.finalVideo?.status, ["current", "superseded"]);
}

export function classifyRenderError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    IDEMPOTENCY_KEY_REQUIRED: "missing-idempotency",
    AE_PLAN_SCHEMA_INVALID: "not-validated",
    AE_CAPABILITY_UNAVAILABLE: "capability-drift",
    AE_RENDER_FAILED: "render-failed",
    DEPENDENCY_UNAVAILABLE: "crash-retry"
  }[error?.code] ?? "error";
}

export function deriveRenderState(input = {}) {
  if (input.phase === "loading") return { banner: banner("loading", "Rendering final video."), attempt: null, finalVideo: null, compositionStatus: null, superseded: null };
  if (input.phase === "error") {
    const state = classifyRenderError(input.error);
    const text = state === "crash-retry" ? "Worker crashed; retry with the same idempotency key." : "Render is not available.";
    return { banner: banner(state, text), attempt: null, finalVideo: null, compositionStatus: null, superseded: null };
  }
  if (input.phase !== "ready") return { banner: banner("empty", "No render loaded."), attempt: null, finalVideo: null, compositionStatus: null, superseded: null };
  if (!input.body) return { banner: banner("unknown", "Render state is unknown."), attempt: null, finalVideo: null, compositionStatus: null, superseded: null };
  const attempt = input.body.attempt ? { ...input.body.attempt, status: attemptState(input.body) } : null;
  const finalVideo = input.body.finalVideo ? { ...input.body.finalVideo, status: finalVideoState(input.body) } : null;
  const rendered = attempt?.status === "succeeded" && finalVideo?.status === "current";
  return { banner: banner(rendered ? "rendered" : "unknown", rendered ? "Final video rendered." : "Render state is unknown."), attempt, finalVideo, compositionStatus: input.body.composition?.status ?? null, superseded: input.body.supersededFinalVideo ?? null };
}

export function renderMarkup(descriptor) {
  const finalVideo = descriptor.finalVideo ?? {};
  const prior = descriptor.superseded ? ` Prior version ${escapeHtml(descriptor.superseded.version)} superseded.` : "";
  return `<section data-state="${escapeHtml(descriptor.banner.state)}">${escapeHtml(descriptor.banner.text)} ${escapeHtml(finalVideo.resolution ?? "")} ${escapeHtml(finalVideo.codec ?? "")} ${escapeHtml(finalVideo.capabilityVersion ?? "")} ${escapeHtml(finalVideo.schemaVersion ?? "")} ${escapeHtml(finalVideo.sha256 ?? "")}${prior}</section>`;
}
