// V0-A1 performance snapshot workflow. Pure, DOM-agnostic state functions unit tested in Node,
// plus a `performanceMarkup` renderer. An authorised production role (view_lineage_and_performance:
// Owner/Admin/Client Manager; NOT Reviewer) reads every immutable PerformanceSnapshot for one
// calendar post and may collect a fresh observed snapshot (schedule_publish_approved_media with an
// Idempotency-Key). The workflow maps the snapshot list and the collect/read error codes to stable
// UI states, and renders the observed metrics as observations of past platform state only, never as
// a forecast, projection or promise of reach, virality, conversion or causal performance. A
// snapshot is flagged stale when the post is no longer published_verified. A missing or
// cross-workspace post hides behind the same blocked state so the owning workspace id never leaks.
// No secret, signed URL, object key, raw provider payload, account id or source hash is ever
// rendered. Browser code holds no database, Redis, provider or secret credentials beyond the
// caller JWT.

// Map a performance read body to a stable UI state derived from the post status and snapshot
// count, preserving unknown as a real state.
export function performanceState(body) {
  const status = String(body?.calendarPost?.status ?? "").toLowerCase();
  const snapshots = Array.isArray(body?.snapshots) ? body.snapshots : [];
  if (status === "published_verified" && snapshots.length > 0) {
    return "observed";
  }
  if (snapshots.length > 0) {
    return "stale";
  }
  if (status === "published_verified") {
    return "awaiting-collection";
  }
  if (status.length > 0) {
    return "not-observable";
  }
  return "unknown";
}

// Map a performance collect/read problem to the workflow banner state. Cross-workspace and
// missing posts hide behind the same blocked state so the owning workspace id never leaks; a
// not-yet-verified post is honestly not observable.
export function classifyPerformanceError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    IDEMPOTENCY_KEY_REQUIRED: "missing-idempotency",
    PERFORMANCE_NOT_OBSERVABLE: "not-observable",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    PERFORMANCE_PROCESSING_WAIT: "processing-wait",
    VALIDATION_FAILED: "performance-invalid"
  };
  return map[problem.code] || "error";
}

function renderBannerText(state) {
  const texts = {
    empty: "No performance observations yet.",
    loading: "Loading performance observations.",
    "collect-loading": "Collecting observed platform metrics.",
    "collect-ready": "Observed platform metrics retained.",
    "collect-replay": "This observation was already retained.",
    observed: "Observed platform metrics are available.",
    "awaiting-collection": "The post is verified. Collect observed metrics when ready.",
    stale: "These observations are stale because the post is no longer verified.",
    "not-observable": "Platform metrics can only be observed for a verified post.",
    "processing-wait": "The platform is still reporting. Check again shortly.",
    forbidden: "Your role cannot read or collect performance.",
    "blocked-hidden": "We could not find that calendar post.",
    "missing-idempotency": "An idempotency key is required to collect performance.",
    "idempotency-conflict": "This request identity was already used with different details.",
    "performance-invalid": "The performance request was not valid.",
    unknown: "We could not load performance. Try again.",
    error: "We could not load performance. Try again."
  };
  return texts[state] || texts.error;
}

// Derive the workflow descriptor from the current phase and API response. The descriptor is a
// plain object so it can be asserted in Node without a DOM; the browser glue renders it via
// performanceMarkup. `collect` carries a single collected snapshot response; `read` carries the
// snapshot list. Both are reduced to the public observed surface.
export function derivePerformanceState({ phase, body = null, error = null, replay = false }) {
  let banner = { state: "empty", text: renderBannerText("empty") };
  if (phase === "loading") {
    banner = { state: "loading", text: renderBannerText("loading") };
  } else if (phase === "collect-loading") {
    banner = { state: "collect-loading", text: renderBannerText("collect-loading") };
  } else if (phase === "error") {
    const state = classifyPerformanceError(error);
    banner = { state, text: renderBannerText(state) };
  } else if (phase === "collect-ready") {
    banner = {
      state: replay ? "collect-replay" : "collect-ready",
      text: renderBannerText(replay ? "collect-replay" : "collect-ready")
    };
  } else if (phase === "ready") {
    const state = performanceState(body);
    banner = { state, text: renderBannerText(state) };
  }

  const snapshots = [];
  if (body && Array.isArray(body.snapshots)) {
    for (const snapshot of body.snapshots) {
      snapshots.push(redactSnapshot(snapshot));
    }
  } else if (body && body.performanceSnapshot) {
    snapshots.push(redactSnapshot(body.performanceSnapshot));
  }
  return { banner, snapshots };
}

// Redact one snapshot to the public observed surface. The source hash and any account id stay
// server-side; the UI shows the source, the observation window, the observation label, the stale
// flag and the observed metrics only.
function redactSnapshot(snapshot) {
  return {
    id: snapshot.id ?? null,
    source: snapshot.source ?? null,
    observation: snapshot.observation ?? null,
    observationWindowStart: snapshot.observationWindowStart ?? null,
    observationWindowEnd: snapshot.observationWindowEnd ?? null,
    stale: Boolean(snapshot.stale),
    metrics: snapshot.metrics && typeof snapshot.metrics === "object" ? { ...snapshot.metrics } : {}
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

// Render the workflow descriptor as a self-contained HTML card. Only the public observed surface is
// rendered: each snapshot's source, observation window, observation label, stale flag and observed
// metrics. Signed URLs, object keys, raw provider payloads, account ids, source hashes and secrets
// never appear here. A clear note states the metrics are observations of past platform state, never
// a prediction of reach, virality, conversion or causal performance.
export function performanceMarkup(descriptor) {
  const { banner, snapshots } = descriptor;
  const lines = [];
  lines.push('<section class="performance" aria-live="polite">');
  lines.push(`<h2>Performance</h2>`);
  lines.push(`<p class="banner" data-state="${escapeHtml(banner.state)}">${escapeHtml(banner.text)}</p>`);
  if (snapshots.length > 0) {
    lines.push('<ol class="performance-snapshots">');
    for (const snapshot of snapshots) {
      lines.push('<li class="performance-snapshot">');
      lines.push(`<p class="source">${escapeHtml(snapshot.source)}${snapshot.stale ? " (stale)" : ""}</p>`);
      lines.push(
        `<p class="window">${escapeHtml(snapshot.observationWindowStart)} → ${escapeHtml(snapshot.observationWindowEnd)}</p>`
      );
      const metricKeys = Object.keys(snapshot.metrics).sort();
      if (metricKeys.length > 0) {
        lines.push('<dl class="metrics">');
        for (const key of metricKeys) {
          lines.push(`<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(snapshot.metrics[key])}</dd>`);
        }
        lines.push("</dl>");
      } else {
        lines.push('<p class="metrics-empty">No observed metrics yet for this snapshot.</p>');
      }
      lines.push("</li>");
    }
    lines.push("</ol>");
    lines.push(
      '<p class="performance-note">Observations of past platform state only. These counts are not a prediction, forecast or promise of reach, virality, conversion or causal performance.</p>'
    );
  }
  lines.push("</section>");
  return lines.join("\n");
}
