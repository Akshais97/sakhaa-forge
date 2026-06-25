// S1/S2 script tournament workflow. Pure, DOM-agnostic state functions that are
// unit-tested in Node, plus a browser glue that wires the generated V0Client to
// the page. Selection is irreversible, so the browser glue confirms before calling
// V0Client.selectScriptVariant (no optimistic UI). Browser code never holds
// database, Redis, provider or secret credentials beyond the caller's Supabase JWT.
// V0Client is imported dynamically inside the browser glue so the pure functions
// below can be imported and tested in Node without a browser module resolution.

// Eligibility drives the Select action: only a generated variant with an
// evaluated evaluation is selectable. Refused, unevaluated or superseded
// variants render as disabled and never call the select endpoint.
export function variantEligibility(variant, evaluation) {
  if (!variant || variant.status !== "generated") {
    return "disabled";
  }
  if (!evaluation || evaluation.status !== "evaluated") {
    return "disabled";
  }
  return "eligible";
}

// Map a select problem to the workflow banner state. The stale and
// already-selected states let the user reload the latest comparison; the invalid
// state points at an ineligible variant; anything else is a recoverable error.
export function classifySelectionError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  if (problem.code === "RESOURCE_VERSION_STALE") {
    return "stale";
  }
  if (problem.code === "SCRIPT_ALREADY_SELECTED") {
    return "already-selected";
  }
  if (problem.code === "SCRIPT_SELECTION_INVALID") {
    return "invalid";
  }
  return "error";
}

// Build the select request body from the comparison tab state. The tournament
// version is the optimistic guard captured when the variants were loaded.
export function buildSelectRequest({ workspaceId, tournament, variant, humanOverride = false }) {
  return {
    workspaceId,
    tournamentId: tournament.id,
    variantId: variant.id,
    optimisticTournamentVersion: tournament.updatedAt,
    humanOverride: humanOverride === true
  };
}

// Derive the workflow descriptor from the current phase and API responses. The
// descriptor is a plain object so it can be asserted in Node without a DOM; the
// browser glue renders it via workflowMarkup.
export function deriveWorkflowState({
  phase,
  tournament = null,
  variants = [],
  evaluations = [],
  selectionResponse = null,
  error = null
}) {
  const evaluationByVariantId = new Map(evaluations.map((evaluation) => [evaluation.variantId, evaluation]));
  const variantCards = variants.map((variant) => {
    const evaluation = evaluationByVariantId.get(variant.id) || null;
    return {
      id: variant.id,
      index: variant.index,
      status: variant.status,
      hookType: variant.hookType,
      modelScore: evaluation ? evaluation.modelScore : null,
      evaluationStatus: evaluation ? evaluation.status : "unevaluated",
      eligibility: variantEligibility(variant, evaluation)
    };
  });

  let banner = { state: "empty", text: "No tournament loaded." };
  if (phase === "loading-tournament") {
    banner = { state: "loading", text: "Generating and evaluating variants." };
  } else if (phase === "tournament-error") {
    banner = { state: "error", text: tournamentErrorMessage(error) };
  } else if (phase === "ready" && tournament) {
    banner = {
      state: "ready",
      text: `${variantCards.length} variants ready to compare. Choose one exact script version.`
    };
  } else if (phase === "selecting") {
    banner = { state: "loading", text: "Selecting the immutable script version." };
  } else if (phase === "selected" && selectionResponse) {
    banner = { state: "success", text: selectedMessage(selectionResponse) };
  } else if (phase === "selection-error") {
    const state = classifySelectionError(error);
    banner = { state, text: selectionErrorMessage(state, error) };
  }

  return {
    phase,
    banner,
    tournament: tournament
      ? {
          id: tournament.id,
          status: tournament.status,
          updatedAt: tournament.updatedAt,
          validVariantCount: tournament.validVariantCount
        }
      : null,
    variants: variantCards,
    selectedScript: selectionResponse ? publicSelectedScript(selectionResponse) : null
  };
}

function publicSelectedScript(response) {
  const selected = response.selectedScript;
  return {
    id: selected.id,
    version: selected.version,
    immutable: selected.immutable,
    variantId: selected.variantId,
    approverUserId: selected.approverUserId
  };
}

function tournamentErrorMessage(error) {
  if (!error) {
    return "Could not run the script tournament. Try again.";
  }
  if (error.code === "SCRIPT_VARIANT_COUNT_INSUFFICIENT") {
    return "Fewer than ten valid variants. Refused variants stay visible and block advancement.";
  }
  if (error.code === "AI_REQUEST_REFUSED" || error.code === "AI_OUTPUT_SCHEMA_INVALID") {
    return "The simulator refused or produced invalid output. No fabricated variants.";
  }
  return error.detail || "Could not run the script tournament. Try again.";
}

function selectedMessage(response) {
  const script = response.selectedScript;
  return `Selected immutable script version ${script.version}. The tournament now has one canonical script version bound to the chosen variant.`;
}

function selectionErrorMessage(state, error) {
  if (state === "stale") {
    return "This comparison tab is stale. Reload the latest variants before selecting.";
  }
  if (state === "already-selected") {
    return "This tournament already has a selected script.";
  }
  if (state === "invalid") {
    return "Select an evaluated, eligible script.";
  }
  return (error && error.detail) || "Selection failed. Try again.";
}

// Render the descriptor as HTML for the page. The status banner carries a
// data-state attribute so the e2e suite can assert empty/loading/error/stale/
// disabled/success states.
export function workflowMarkup(descriptor) {
  const banner = `<p class="status workflow-status" data-testid="script-tournament-status" data-state="${escapeAttribute(descriptor.banner.state)}">${escapeText(descriptor.banner.text)}</p>`;
  const selectionBanner = `<p class="status workflow-status" data-testid="script-selection-status" data-state="${escapeAttribute(descriptor.banner.state)}">${escapeText(descriptor.banner.text)}</p>`;
  const cards = descriptor.variants
    .map((card) => {
      const disabled = card.eligibility === "disabled" ? "disabled" : "";
      const score = card.modelScore === null ? "No score" : `Model score ${card.modelScore}`;
      return `<article class="candidate" data-testid="script-variant" data-variant-id="${escapeAttribute(card.id)}" data-state="${escapeAttribute(card.eligibility)}">
        <h3>Variant ${card.index + 1}</h3>
        <p>Hook type: ${escapeText(card.hookType || "unknown")}</p>
        <p>${score}</p>
        <p>Evaluation: ${escapeText(card.evaluationStatus)}</p>
        <button type="button" data-testid="script-variant-select" data-variant-id="${escapeAttribute(card.id)}" ${disabled}>Select this script</button>
      </article>`;
    })
    .join("");
  const variants = `<div class="candidate-grid" data-testid="script-tournament-variants">${cards}</div>`;
  return { banner, selectionBanner, variants };
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Browser glue. Wires the form + variant container to the generated V0Client.
// Only runs in the browser; the pure functions above are exported for Node tests.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const apiBase = window.location.origin.replace(/:\d+$/, ":3001") + "/api/v0";
  const form = document.querySelector("[data-testid='script-tournament-form']");
  const tournamentSection = document.querySelector("[data-testid='script-tournament-contract']");
  const selectionSection = document.querySelector("[data-testid='script-selection-contract']");
  let current = null;
  let clientModulePromise = null;
  function client() {
    const sessionToken = form.elements.sessionToken.value.trim();
    clientModulePromise ??= import("/v0-client.mjs");
    return clientModulePromise.then(({ V0Client }) => new V0Client({ baseUrl: apiBase, authToken: sessionToken }));
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const workspaceId = form.elements.workspaceId.value.trim();
    const blueprintRequestId = form.elements.blueprintRequestId.value.trim();
    const variantCount = Number.parseInt(form.elements.variantCount.value, 10);
    render(deriveWorkflowState({ phase: "loading-tournament" }));
    try {
      const v0 = await client();
      const response = await v0.createScriptTournament(
        { workspaceId, blueprintRequestId, variantCount },
        { idempotencyKey: `web-tournament-${crypto.randomUUID()}` }
      );
      if (response.status === 202 && response.body.tournament) {
        current = {
          workspaceId,
          tournament: response.body.tournament,
          variants: response.body.variants,
          evaluations: response.body.evaluations
        };
        render(deriveWorkflowState({ phase: "ready", ...current }));
      } else {
        render(deriveWorkflowState({ phase: "tournament-error", error: response.body }));
      }
    } catch (fetchError) {
      render(deriveWorkflowState({ phase: "tournament-error", error: { detail: fetchError.message } }));
    }
  });

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!target || !target.matches?.("[data-testid='script-variant-select']") || target.disabled) {
      return;
    }
    if (!current) {
      return;
    }
    const variantId = target.getAttribute("data-variant-id");
    const variant = current.variants.find((item) => item.id === variantId);
    if (!variant) {
      return;
    }
    // Selection is irreversible: confirm before calling the endpoint (no optimistic UI).
    if (!window.confirm("Select this exact immutable script version for generation?")) {
      return;
    }
    render(deriveWorkflowState({ phase: "selecting", ...current }));
    try {
      const v0 = await client();
      const response = await v0.selectScriptVariant(
        current.tournament.id,
        buildSelectRequest({ workspaceId: current.workspaceId, tournament: current.tournament, variant }),
        { idempotencyKey: `web-select-${crypto.randomUUID()}` }
      );
      if (response.status === 200) {
        render(deriveWorkflowState({ phase: "selected", ...current, selectionResponse: response.body }));
      } else {
        render(deriveWorkflowState({ phase: "selection-error", ...current, error: response.body }));
      }
    } catch (fetchError) {
      render(deriveWorkflowState({ phase: "selection-error", ...current, error: { detail: fetchError.message } }));
    }
  });

  function render(descriptor) {
    const markup = workflowMarkup(descriptor);
    tournamentSection.querySelector("[data-testid='script-tournament-status']")?.replaceWith(createBanner(markup.banner));
    selectionSection.querySelector("[data-testid='script-selection-status']")?.replaceWith(createBanner(markup.selectionBanner));
    tournamentSection.querySelector("[data-testid='script-tournament-variants']")?.replaceWith(createFragment(markup.variants));
  }

  function createBanner(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function createFragment(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content;
  }
}
