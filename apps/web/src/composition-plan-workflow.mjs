// V0-C1 composition plan review workflow. Pure, DOM-agnostic state functions unit-tested in
// Node, plus a `compositionMarkup` renderer and a browser glue that wires the generated
// V0Client to the page. The user supplies composition direction bound to a retained generated
// asset; the API normalizes it into a versioned timeline JSON and validates it against the
// deterministic AE capability registry. A valid plan renders `validated`; a malformed plan or
// capability mismatch renders `validation_failed` with every unsupported item explained. The
// LLM cannot invent assets, fonts, plugins or effects. The workflow is never optimistic: it
// shows loading, calls the API, and renders the committed plan or a calm error. The plan
// artifact sha256, asset IDs, signed URLs, provider payloads and secrets never appear in the
// rendered markup. Browser code holds no database, Redis, provider or secret credentials
// beyond the caller's Supabase JWT. V0Client is imported dynamically inside the browser glue
// so the pure functions can be imported and tested in Node.

const COMPOSITION_STATUSES = [
  "draft",
  "planning",
  "validation_failed",
  "validated",
  "rendering",
  "rendered",
  "failed",
  "superseded"
];

// Map a composition status (lowercase per V0_STATUS_ENUMS.md) to a stable UI state.
export function compositionState(plan) {
  const status = String(plan?.status ?? "").toLowerCase();
  return COMPOSITION_STATUSES.includes(status) ? status : "unknown";
}

// Map the plan validation outcome to a stable UI state.
export function validationOutcome(body) {
  const status = String(body?.plan?.status ?? body?.planStatus ?? "").toLowerCase();
  if (status === "validated") return "validated";
  if (status === "validation_failed") return "validation_failed";
  return "unknown";
}

// Map a composition problem to the workflow banner state. Cross-workspace and missing
// workspaces hide behind the same blocked state so the other workspace id never leaks; each
// composition guard gets its own honest state.
export function classifyCompositionError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    AE_PLAN_SCHEMA_INVALID: "malformed-plan",
    AE_ASSET_MISSING: "missing-asset",
    AE_CAPABILITY_UNAVAILABLE: "unsupported-capability",
    AE_TIMELINE_INVALID: "invalid-timeline"
  };
  return map[problem.code] || "error";
}

function compositionBannerText(state) {
  const texts = {
    empty: "No composition plan loaded.",
    loading: "Validating this composition plan against the AE capability registry.",
    validated: "The plan validates against the available capability registry. Ready to render.",
    validation_failed: "The plan is not valid. Fix every unsupported item before rendering.",
    unknown: "We could not confirm the plan status. Try again.",
    "blocked-hidden": "We could not find that composition.",
    forbidden: "Your role cannot create a composition plan.",
    "malformed-plan": "The plan is malformed. Fix the structure and validate again.",
    "missing-asset": "A referenced media asset is missing or unavailable. Restore or reselect it.",
    "unsupported-capability": "The plan uses a font, plugin, template or effect the AE worker does not support.",
    "invalid-timeline": "The timeline has invalid timing, overlaps or unsafe zones.",
    error: "We could not validate this plan. Try again."
  };
  return texts[state] || texts.error;
}

// Collect every unsupported item from a success body (`plan.unsupportedItems`) or a failure
// problem (`unsupported`). Each item is normalized to `{ code, field, detail }`.
function collectUnsupported(body, error) {
  const items =
    (body && Array.isArray(body.unsupported) && body.unsupported) ||
    (body && body.plan && Array.isArray(body.plan.unsupportedItems) && body.plan.unsupportedItems) ||
    (error && Array.isArray(error.unsupported) && error.unsupported) ||
    [];
  return items.map((item) => ({
    code: String(item?.code ?? ""),
    field: item?.field || null,
    detail: String(item?.detail ?? "")
  }));
}

// Derive the workflow descriptor from the current phase and API response. The descriptor is a
// plain object so it can be asserted in Node without a DOM; the browser glue renders it via
// compositionMarkup.
export function deriveCompositionState({ phase, body = null, error = null }) {
  let banner = { state: "empty", text: compositionBannerText("empty") };
  if (phase === "loading") {
    banner = { state: "loading", text: compositionBannerText("loading") };
  } else if (phase === "error") {
    const state = classifyCompositionError(error);
    banner = { state, text: compositionBannerText(state) };
  } else if (phase === "ready") {
    const outcome = validationOutcome(body);
    if (outcome === "validated") {
      banner = { state: "validated", text: compositionBannerText("validated") };
    } else if (outcome === "validation_failed") {
      banner = { state: "validation_failed", text: compositionBannerText("validation_failed") };
    } else {
      banner = { state: "unknown", text: compositionBannerText("unknown") };
    }
  }

  const plan = body && body.plan
    ? {
        id: body.plan.id,
        status: compositionState(body.plan),
        capabilityVersion: body.plan.capabilityVersion,
        schemaVersion: body.plan.schemaVersion,
        version: body.plan.version
      }
    : null;

  const unsupported = collectUnsupported(body, error);
  const compositionId = body?.composition?.id ?? body?.compositionId ?? null;
  const planId = body?.plan?.id ?? body?.planId ?? null;
  const planStatus = body?.planStatus ?? (plan ? plan.status : null);
  return { banner, plan, unsupported, compositionId, planId, planStatus };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

// Render the workflow descriptor as a self-contained HTML card. Only status, capability
// version, schema version and unsupported items are rendered. The plan artifact sha256,
// asset IDs, signed URLs, provider payloads and secrets never appear here.
export function compositionMarkup(descriptor) {
  const { banner, plan, unsupported, planStatus } = descriptor;
  const lines = [];
  lines.push('<section class="composition-plan" aria-live="polite">');
  lines.push(`<h2>Composition plan</h2>`);
  lines.push(`<p class="banner" data-state="${escapeHtml(banner.state)}">${escapeHtml(banner.text)}</p>`);
  if (planStatus) {
    lines.push(`<p class="status">Status: ${escapeHtml(planStatus)}</p>`);
  }
  if (plan) {
    lines.push('<dl class="plan-meta">');
    lines.push(`<dt>Status</dt><dd>${escapeHtml(plan.status)}</dd>`);
    lines.push(`<dt>Capability version</dt><dd class="mono">${escapeHtml(plan.capabilityVersion)}</dd>`);
    lines.push(`<dt>Schema version</dt><dd class="mono">${escapeHtml(plan.schemaVersion)}</dd>`);
    if (plan.version !== undefined) lines.push(`<dt>Plan version</dt><dd>${escapeHtml(plan.version)}</dd>`);
    lines.push("</dl>");
  }
  if (unsupported.length > 0) {
    lines.push('<ul class="unsupported" aria-label="Unsupported items">');
    for (const item of unsupported) {
      const label = item.field ? `${escapeHtml(item.code)} · ${escapeHtml(item.field)}` : escapeHtml(item.code);
      lines.push(`<li><span class="code">${label}</span> — ${escapeHtml(item.detail)}</li>`);
    }
    lines.push("</ul>");
  }
  lines.push("</section>");
  return lines.join("\n");
}
