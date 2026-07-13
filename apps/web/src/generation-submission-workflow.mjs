import { banner, escapeHtml, renderBanner } from "./workflow-markup-utils.mjs";

export function operationState(operation) {
  return ["created", "submitting", "accepted", "unknown", "processing", "completed", "rejected", "failed", "cancelled"].includes(operation?.status) ? operation.status : "unknown";
}

export function generationJobState(job) {
  return ["queued", "submitting", "accepted", "unknown", "generating", "generated", "failed", "cancel_requested", "cancelled"].includes(job?.status) ? job.status : "unknown";
}

export function classifySubmissionError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    GENERATION_JOB_NOT_SUBMITTABLE: "not-submittable",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    IDEMPOTENCY_KEY_REQUIRED: "idempotency-required",
    PROVIDER_RATE_LIMITED: "rate-limited",
    PROVIDER_OUTPUT_INVALID: "provider-invalid",
    PROVIDER_CALLBACK_INVALID: "callback-invalid"
  }[error?.code] ?? "error";
}

function redactOperation(operation) {
  if (!operation) return null;
  const { requestHash, ...safe } = operation;
  return { ...safe, status: operationState(operation) };
}

export function deriveSubmissionState(input = {}) {
  if (input.phase === "loading") return { banner: banner("loading", "Submitting generation."), job: null, operation: null, unknown: false, replay: false };
  if (input.phase === "error") return { banner: banner(classifySubmissionError(input.error), "Provider submission is not available."), job: null, operation: null, unknown: false, replay: false };
  const job = input.job ? { ...input.job, status: generationJobState(input.job) } : null;
  const operation = redactOperation(input.operation);
  if (!job && !operation) return { banner: banner("empty", "No generation job loaded."), job, operation, unknown: false, replay: false };
  const state = input.uncertain && job?.status === "cancel_requested" ? "cancel_requested" : operation?.status === "unknown" || job?.status === "unknown" ? "unknown" : operation?.status ?? job?.status ?? "unknown";
  const replayText = input.replay ? " This request was already submitted." : "";
  const text = state === "unknown" ? `Submission outcome is unknown. Do not submit again.${replayText}` : `Generation submission is ${state}.${replayText}`;
  return { banner: banner(state, text), job, operation, unknown: state === "unknown", replay: Boolean(input.replay) };
}

export function submissionMarkup(descriptor) {
  return {
    banner: renderBanner("generation-submission-status", descriptor.banner),
    job: descriptor.job ? `<section data-testid="generation-submission-job" data-state="${escapeHtml(descriptor.job.status)}">Generation job: ${escapeHtml(descriptor.job.status)}</section>` : "",
    operation: descriptor.operation ? `<section data-testid="generation-submission-operation" data-state="${escapeHtml(descriptor.operation.status)}">Provider reference: retained</section>` : ""
  };
}
