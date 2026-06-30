// V0-C2 reproducible final branded render workflow. Pure, DOM-agnostic state functions unit
// tested in Node, plus a `renderMarkup` renderer. A validated composition plan renders one
// retained 9:16 final MP4, thumbnail and captions through the deterministic AE worker. The
// workflow is never optimistic: it shows loading, calls the API with an Idempotency-Key, and
// renders the committed final video or a calm error. A worker crash is recovered once on
// retry; capability drift and incompatible worker output are classified and never claim a
// final video. The final-video sha256 is the deterministic golden render fingerprint (a public
// content hash); the input hash, asset hashes, artifact ids, signed URLs, raw worker payloads
// and secrets never appear in the rendered markup. Browser code holds no database, Redis,
// provider or secret credentials beyond the caller's Supabase JWT.

const ATTEMPT_STATUSES = ["running", "succeeded", "failed"];
const FINAL_VIDEO_STATUSES = ["current", "superseded"];

// Map a render attempt status (lowercase per V0_STATUS_ENUMS.md) to a stable UI state,
// preserving unknown as a real state.
export function attemptState(body) {
  const status = String(body?.attempt?.status ?? "").toLowerCase();
  return ATTEMPT_STATUSES.includes(status) ? status : "unknown";
}

export function finalVideoState(body) {
  const status = String(body?.finalVideo?.status ?? "").toLowerCase();
  return FINAL_VIDEO_STATUSES.includes(status) ? status : "unknown";
}

// Map a render problem to the workflow banner state. Cross-workspace and missing workspaces
// hide behind the same blocked state so the other workspace id never leaks; each render guard
// gets its own honest state. A crash is a recoverable retry, never a final failure.
export function classifyRenderError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    IDEMPOTENCY_KEY_REQUIRED: "missing-idempotency",
    AE_PLAN_SCHEMA_INVALID: "not-validated",
    AE_CAPABILITY_UNAVAILABLE: "capability-drift",
    AE_RENDER_FAILED: "render-failed",
    DEPENDENCY_UNAVAILABLE: "crash-retry"
  };
  return map[problem.code] || "error";
}

function renderBannerText(state) {
  const texts = {
    empty: "No final video loaded.",
    loading: "Rendering this composition plan through the AE worker.",
    rendered: "The plan rendered into a retained 9:16 final video. Ready to review.",
    unknown: "We could not confirm the render status. Try again.",
    "blocked-hidden": "We could not find that composition plan.",
    forbidden: "Your role cannot render a composition plan.",
    "missing-idempotency": "An idempotency key is required to render.",
    "not-validated": "Only a validated composition plan can be rendered.",
    "capability-drift": "The AE worker capability does not match the plan. No final video was retained.",
    "render-failed": "The AE worker output did not match the plan. No final video was retained.",
    "crash-retry": "The render worker was interrupted. Retry with the same idempotency key to resume.",
    error: "We could not render this plan. Try again."
  };
  return texts[state] || texts.error;
}

// Derive the workflow descriptor from the current phase and API response. The descriptor is a
// plain object so it can be asserted in Node without a DOM; the browser glue renders it via
// renderMarkup.
export function deriveRenderState({ phase, body = null, error = null }) {
  let banner = { state: "empty", text: renderBannerText("empty") };
  if (phase === "loading") {
    banner = { state: "loading", text: renderBannerText("loading") };
  } else if (phase === "error") {
    const state = classifyRenderError(error);
    banner = { state, text: renderBannerText(state) };
  } else if (phase === "ready") {
    const attempt = attemptState(body);
    const finalVideo = finalVideoState(body);
    if (attempt === "succeeded" && finalVideo === "current") {
      banner = { state: "rendered", text: renderBannerText("rendered") };
    } else {
      banner = { state: "unknown", text: renderBannerText("unknown") };
    }
  }

  const finalVideo = body && body.finalVideo
    ? {
        id: body.finalVideo.id,
        status: finalVideoState(body),
        version: body.finalVideo.version,
        durationSeconds: body.finalVideo.durationSeconds,
        resolution: body.finalVideo.resolution,
        codec: body.finalVideo.codec,
        capabilityVersion: body.finalVideo.capabilityVersion,
        schemaVersion: body.finalVideo.schemaVersion,
        sha256: body.finalVideo.sha256
      }
    : null;
  const attempt = body && body.attempt
    ? { id: body.attempt.id, status: attemptState(body), version: body.attempt.version }
    : null;
  const compositionStatus = body?.composition?.status ?? null;
  const superseded = body?.supersededFinalVideo
    ? {
        version: body.supersededFinalVideo.version,
        status: String(body.supersededFinalVideo.status ?? "").toLowerCase()
      }
    : null;
  return { banner, finalVideo, attempt, compositionStatus, superseded };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

// Render the workflow descriptor as a self-contained HTML card. Only status, version,
// resolution, codec, duration, capability/schema version and the golden render hash are
// rendered. The input hash, asset hashes, artifact ids, signed URLs, raw worker payloads and
// secrets never appear here.
export function renderMarkup(descriptor) {
  const { banner, finalVideo, attempt, compositionStatus, superseded } = descriptor;
  const lines = [];
  lines.push('<section class="composition-render" aria-live="polite">');
  lines.push(`<h2>Final branded render</h2>`);
  lines.push(`<p class="banner" data-state="${escapeHtml(banner.state)}">${escapeHtml(banner.text)}</p>`);
  if (compositionStatus) {
    lines.push(`<p class="status">Composition status: ${escapeHtml(compositionStatus)}</p>`);
  }
  if (attempt) {
    lines.push(`<p class="attempt" data-attempt-status="${escapeHtml(attempt.status)}">Render attempt version ${escapeHtml(attempt.version)} — ${escapeHtml(attempt.status)}</p>`);
  }
  if (finalVideo) {
    lines.push('<dl class="final-video">');
    lines.push(`<dt>Final video status</dt><dd>${escapeHtml(finalVideo.status)}</dd>`);
    lines.push(`<dt>Version</dt><dd>${escapeHtml(finalVideo.version)}</dd>`);
    lines.push(`<dt>Resolution</dt><dd class="mono">${escapeHtml(finalVideo.resolution)}</dd>`);
    lines.push(`<dt>Codec</dt><dd class="mono">${escapeHtml(finalVideo.codec)}</dd>`);
    lines.push(`<dt>Duration</dt><dd>${escapeHtml(finalVideo.durationSeconds)}s</dd>`);
    lines.push(`<dt>Capability version</dt><dd class="mono">${escapeHtml(finalVideo.capabilityVersion)}</dd>`);
    lines.push(`<dt>Schema version</dt><dd class="mono">${escapeHtml(finalVideo.schemaVersion)}</dd>`);
    lines.push(`<dt>Golden render hash</dt><dd class="mono sha">${escapeHtml(finalVideo.sha256)}</dd>`);
    lines.push("</dl>");
  }
  if (superseded) {
    lines.push(
      `<p class="superseded" data-superseded-status="${escapeHtml(superseded.status)}">Prior version ${escapeHtml(superseded.version)} is ${escapeHtml(superseded.status)}.</p>`
    );
  }
  lines.push("</section>");
  return lines.join("\n");
}
