// V0-A1 complete creative lineage export workflow. Pure, DOM-agnostic state functions unit tested
// in Node, plus a `lineageMarkup` renderer. An authorised production role
// (view_lineage_and_performance: Owner/Admin/Client Manager; NOT Reviewer) exports the full
// ancestry of one final video as a bounded, redacted, hash-manifested record. The workflow maps the
// lineage status (complete / incomplete / blocked / unknown) and the export error codes to stable
// UI states, and renders the ancestry entries, the cost attribution, the provider timestamps and
// the manifest sha256 as observations only. Missing ancestry is shown as incomplete (named), a
// final-video sha256 mismatch is shown as blocked (named), and a missing or cross-workspace final
// video hides behind the same blocked state so the owning workspace id never leaks. No secret,
// signed URL, object key, raw provider payload, external id, request hash, idempotency key or
// source hash is ever rendered; each artifact entry shows its public content sha256 and never its
// object key. Browser code holds no database, Redis, provider or secret credentials beyond the
// caller JWT.

const LINEAGE_STATUSES = ["complete", "incomplete", "blocked"];

// Map a lineage export status to a stable UI state, preserving unknown as a real state.
export function lineageState(body) {
  const status = String(body?.status ?? "").toLowerCase();
  return LINEAGE_STATUSES.includes(status) ? status : "unknown";
}

// Map a lineage export problem to the workflow banner state. Cross-workspace and missing
// workspaces hide behind the same blocked state so the owning workspace id never leaks.
export function classifyLineageError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    VALIDATION_FAILED: "lineage-invalid"
  };
  return map[problem.code] || "error";
}

function renderBannerText(state) {
  const texts = {
    empty: "No lineage export loaded yet.",
    loading: "Loading the creative lineage.",
    "lineage-ready": "Creative lineage export ready.",
    forbidden: "Your role cannot export creative lineage.",
    "blocked-hidden": "We could not find that final video.",
    "lineage-invalid": "The lineage request was not valid.",
    unknown: "We could not load this lineage. Try again.",
    error: "We could not load this lineage. Try again."
  };
  return texts[state] || texts.error;
}

// Derive the workflow descriptor from the current phase and API response. The descriptor is a
// plain object so it can be asserted in Node without a DOM; the browser glue renders it via
// lineageMarkup.
export function deriveLineageState({ phase, body = null, error = null }) {
  let banner = { state: "empty", text: renderBannerText("empty") };
  if (phase === "loading") {
    banner = { state: "loading", text: renderBannerText("loading") };
  } else if (phase === "error") {
    const state = classifyLineageError(error);
    banner = { state, text: renderBannerText(state) };
  } else if (phase === "ready") {
    const status = lineageState(body);
    if (status === "unknown") {
      banner = { state: "unknown", text: renderBannerText("unknown") };
    } else {
      banner = { state: "lineage-ready", text: renderBannerText("lineage-ready") };
    }
  }

  const lineage =
    body && typeof body === "object" && body.finalVideoId
      ? {
          finalVideoId: body.finalVideoId,
          status: lineageState(body),
          missing: Array.isArray(body.missing) ? body.missing.slice() : [],
          mismatches: Array.isArray(body.mismatches) ? body.mismatches.slice() : [],
          manifestSha256: typeof body.manifestSha256 === "string" ? body.manifestSha256 : null,
          generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : null,
          cost: body.cost
            ? {
                providerTotalMinor: Number(body.cost.providerTotalMinor ?? 0),
                estimatedMaximumMinor: Number(body.cost.estimatedMaximumMinor ?? 0),
                currency: body.cost.currency ?? null,
                priceVersion: body.cost.priceVersion ?? null
              }
            : null,
          providerTimestamps: body.providerTimestamps ?? null,
          entries: Array.isArray(body.entries) ? body.entries.map(redactEntry) : []
        }
      : null;
  return { banner, lineage };
}

// Redact one lineage entry to the public surface the UI may render. The object key never surfaces;
// artifact entries carry only their public content sha256, content type and version.
function redactEntry(entry) {
  const base = {
    kind: entry.kind,
    id: entry.id,
    createdAt: entry.createdAt ?? null
  };
  if (entry.artifact) {
    base.artifact = {
      sha256: entry.artifact.sha256 ?? null,
      contentType: entry.artifact.contentType ?? null,
      version: Number.isInteger(entry.artifact.version) ? entry.artifact.version : null
    };
  }
  return base;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

// Render the workflow descriptor as a self-contained HTML card. Only the public ancestry surface is
// rendered: status, missing/mismatch names, the manifest sha256, cost attribution, provider
// timestamps and each entry's kind, id and public artifact sha256. Signed URLs, object keys, raw
// provider payloads, external ids, request hashes, idempotency keys, source hashes and secrets
// never appear here; the manifest sha256 is a public content fingerprint.
export function lineageMarkup(descriptor) {
  const { banner, lineage } = descriptor;
  const lines = [];
  lines.push('<section class="lineage" aria-live="polite">');
  lines.push(`<h2>Creative lineage</h2>`);
  lines.push(`<p class="banner" data-state="${escapeHtml(banner.state)}">${escapeHtml(banner.text)}</p>`);
  if (lineage) {
    lines.push('<dl class="lineage-summary">');
    lines.push(`<dt>Lineage status</dt><dd>${escapeHtml(lineage.status)}</dd>`);
    if (lineage.missing.length > 0) {
      lines.push(`<dt>Missing ancestry</dt><dd>${escapeHtml(lineage.missing.join(", "))}</dd>`);
    }
    if (lineage.mismatches.length > 0) {
      lines.push(`<dt>Hash mismatches</dt><dd>${escapeHtml(lineage.mismatches.join(", "))}</dd>`);
    }
    lines.push(`<dt>Manifest hash</dt><dd class="mono sha">${escapeHtml(lineage.manifestSha256)}</dd>`);
    if (lineage.cost) {
      lines.push(
        `<dt>Provider total</dt><dd>${escapeHtml(lineage.cost.providerTotalMinor)} ${escapeHtml(lineage.cost.currency)} (${escapeHtml(lineage.cost.priceVersion)})</dd>`
      );
    }
    lines.push("</dl>");
    lines.push('<ol class="lineage-entries">');
    for (const entry of lineage.entries) {
      const artifact = entry.artifact ? ` — sha ${escapeHtml(entry.artifact.sha256)}` : "";
      lines.push(`<li><span class="kind">${escapeHtml(entry.kind)}</span> ${escapeHtml(entry.id)}${artifact}</li>`);
    }
    lines.push("</ol>");
    lines.push('<p class="lineage-note">Observations only. This export is a record of what was produced, not a prediction.</p>');
  }
  lines.push("</section>");
  return lines.join("\n");
}
