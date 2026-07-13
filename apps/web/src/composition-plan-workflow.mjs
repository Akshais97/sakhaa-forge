import { banner, escapeHtml, renderBanner, stableState } from "./workflow-markup-utils.mjs";

export function compositionState(composition) {
  return stableState(composition?.status, ["draft", "planning", "validation_failed", "validated", "rendering", "rendered", "failed", "superseded"]);
}

export function validationOutcome(body) {
  return stableState(body?.plan?.status ?? body?.planStatus, ["validated", "validation_failed"]);
}

export function classifyCompositionError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    AE_PLAN_SCHEMA_INVALID: "malformed-plan",
    AE_ASSET_MISSING: "missing-asset",
    AE_CAPABILITY_UNAVAILABLE: "unsupported-capability",
    AE_TIMELINE_INVALID: "invalid-timeline"
  }[error?.code] ?? "error";
}

export function deriveCompositionState(input = {}) {
  if (input.phase === "loading") return { banner: banner("loading", "Validating composition plan."), plan: null, unsupported: [], compositionId: null, planId: null };
  if (input.phase === "error") {
    return { banner: banner(classifyCompositionError(input.error), "Composition plan validation failed."), plan: null, unsupported: input.body?.unsupported ?? input.error?.unsupported ?? [], compositionId: input.body?.compositionId ?? input.error?.compositionId ?? null, planId: input.body?.planId ?? input.error?.planId ?? null };
  }
  if (input.phase !== "ready") return { banner: banner("empty", "No composition plan loaded."), plan: null, unsupported: [], compositionId: null, planId: null };
  if (!input.body) return { banner: banner("unknown", "Composition plan state is unknown."), plan: null, unsupported: [], compositionId: null, planId: null };
  return { banner: banner(validationOutcome(input.body), "Composition plan validated."), plan: input.body.plan ?? null, unsupported: input.body.plan?.unsupportedItems ?? [], compositionId: input.body.composition?.id ?? null, planId: input.body.plan?.id ?? null };
}

export function compositionMarkup(descriptor) {
  const unsupported = (descriptor.unsupported ?? []).map((item) => `<li>${escapeHtml(item.code)} ${escapeHtml(item.field)} ${escapeHtml(item.detail)}</li>`).join("");
  return `<section data-state="${escapeHtml(descriptor.banner.state)}">${escapeHtml(descriptor.banner.text)} ${escapeHtml(descriptor.plan?.status ?? "validation_failed")} ${escapeHtml(descriptor.plan?.capabilityVersion ?? "")} ${escapeHtml(descriptor.plan?.schemaVersion ?? "")}<ul>${unsupported}</ul></section>`;
}
