import { banner, escapeHtml, renderBanner } from "./workflow-markup-utils.mjs";

export function variantEligibility(variant, evaluation) {
  return variant?.status === "generated" && evaluation?.status === "evaluated" ? "eligible" : "disabled";
}

export function classifySelectionError(error) {
  return {
    RESOURCE_VERSION_STALE: "stale",
    SCRIPT_ALREADY_SELECTED: "already-selected",
    SCRIPT_SELECTION_INVALID: "invalid"
  }[error?.code] ?? "error";
}

export function buildSelectRequest({ workspaceId, tournament, variant, humanOverride = false }) {
  return {
    workspaceId,
    tournamentId: tournament.id,
    variantId: variant.id,
    optimisticTournamentVersion: tournament.updatedAt,
    humanOverride
  };
}

export function deriveWorkflowState(input = {}) {
  if (input.phase === "empty") return { banner: banner("empty", "No tournament loaded."), tournament: null, variants: [] };
  if (input.phase === "loading-tournament" || input.phase === "selecting") return { banner: banner("loading", "Loading script tournament."), tournament: input.tournament ?? null, variants: [] };
  if (input.phase === "tournament-error") return { banner: banner("error", input.error?.code === "SCRIPT_VARIANT_COUNT_INSUFFICIENT" ? "Fewer than ten valid variants are available." : "Script tournament is not available."), tournament: null, variants: [] };
  const evaluations = new Map((input.evaluations ?? []).map((evaluation) => [evaluation.variantId, evaluation]));
  const variants = (input.variants ?? []).map((variant) => ({ ...variant, eligibility: variantEligibility(variant, evaluations.get(variant.id)), evaluation: evaluations.get(variant.id) ?? null }));
  if (input.phase === "selected") {
    return { banner: banner("success", "Script selected."), tournament: input.tournament, variants, selectedScript: input.selectionResponse?.selectedScript ?? null };
  }
  if (input.phase === "selection-error") {
    return { banner: banner(classifySelectionError(input.error), "Script selection could not be saved."), tournament: input.tournament ?? null, variants };
  }
  return { banner: banner("ready", "Choose one eligible script."), tournament: input.tournament ?? null, variants };
}

export function workflowMarkup(descriptor) {
  return {
    banner: renderBanner("script-tournament-status", descriptor.banner),
    variants: (descriptor.variants ?? []).map((variant) => {
      const disabled = variant.eligibility === "eligible" ? "" : " disabled";
      return `<article data-testid="script-variant" data-variant-id="${escapeHtml(variant.id)}" data-state="${escapeHtml(variant.eligibility)}"><button${disabled}>Select this script</button></article>`;
    }).join("")
  };
}
