import { banner, escapeHtml, renderBanner, stableState } from "./workflow-markup-utils.mjs";

export function lineageState(body) {
  return stableState(body?.status, ["complete", "incomplete", "blocked"]);
}

export function classifyLineageError(error) {
  return { WORKSPACE_ACCESS_DENIED: "blocked-hidden", PERMISSION_DENIED: "forbidden", VALIDATION_FAILED: "lineage-invalid" }[error?.code] ?? "error";
}

function redactEntry(entry) {
  if (!entry) return entry;
  const artifact = entry.artifact ? {
    sha256: entry.artifact.sha256,
    contentType: entry.artifact.contentType,
    version: entry.artifact.version,
    byteSize: entry.artifact.byteSize
  } : undefined;
  return { ...entry, artifact };
}

export function deriveLineageState(input = {}) {
  if (input.phase === "error") return { banner: banner(classifyLineageError(input.error), input.error?.code === "WORKSPACE_ACCESS_DENIED" ? "We could not find that final video in this workspace." : "Creative lineage is not available."), lineage: null };
  const lineage = input.body ? { ...input.body, status: lineageState(input.body), entries: (input.body.entries ?? []).map(redactEntry) } : null;
  const state = lineage?.status === "complete" ? "lineage-ready" : lineage?.status ?? "unknown";
  return { banner: banner(state, "Creative lineage loaded."), lineage };
}

export function lineageMarkup(descriptor) {
  const entries = (descriptor.lineage?.entries ?? []).map((entry) => `<li>${escapeHtml(entry.kind)} ${escapeHtml(entry.artifact?.sha256 ?? "")}</li>`).join("");
  return `${renderBanner("lineage-status", descriptor.banner)}<section>Creative lineage ${escapeHtml(descriptor.lineage?.manifestSha256 ?? "")}<ul>${entries}</ul></section>`;
}
