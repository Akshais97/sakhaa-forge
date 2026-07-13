import test from "node:test";
import assert from "node:assert/strict";
import {
  variantEligibility,
  classifySelectionError,
  buildSelectRequest,
  deriveWorkflowState,
  workflowMarkup
} from "../../apps/web/src/script-tournament-workflow.mjs";

test("variantEligibility marks only generated+evaluated variants as eligible", () => {
  assert.equal(variantEligibility({ status: "generated" }, { status: "evaluated" }), "eligible");
  assert.equal(variantEligibility({ status: "generated" }, { status: "unevaluated" }), "disabled");
  assert.equal(variantEligibility({ status: "generated" }, null), "disabled");
  assert.equal(variantEligibility({ status: "policy_refused" }, { status: "evaluated" }), "disabled");
  assert.equal(variantEligibility(null, null), "disabled");
});

test("classifySelectionError maps problem codes to workflow states", () => {
  assert.equal(classifySelectionError({ code: "RESOURCE_VERSION_STALE" }), "stale");
  assert.equal(classifySelectionError({ code: "SCRIPT_ALREADY_SELECTED" }), "already-selected");
  assert.equal(classifySelectionError({ code: "SCRIPT_SELECTION_INVALID" }), "invalid");
  assert.equal(classifySelectionError({ code: "VALIDATION_FAILED" }), "error");
  assert.equal(classifySelectionError(null), "error");
  assert.equal(classifySelectionError({}), "error");
});

test("buildSelectRequest carries the optimistic tournament version and variant id", () => {
  const request = buildSelectRequest({
    workspaceId: "ws-1",
    tournament: { id: "t-1", updatedAt: "2026-06-25T00:00:00.000Z" },
    variant: { id: "v-1" },
    humanOverride: true
  });
  assert.deepEqual(request, {
    workspaceId: "ws-1",
    tournamentId: "t-1",
    variantId: "v-1",
    optimisticTournamentVersion: "2026-06-25T00:00:00.000Z",
    humanOverride: true
  });
});

test("deriveWorkflowState renders empty, loading and ready states", () => {
  assert.equal(deriveWorkflowState({ phase: "empty" }).banner.state, "empty");
  assert.equal(deriveWorkflowState({ phase: "loading-tournament" }).banner.state, "loading");
  assert.equal(deriveWorkflowState({ phase: "selecting" }).banner.state, "loading");

  const ready = deriveWorkflowState({
    phase: "ready",
    tournament: { id: "t-1", status: "ready_for_selection", updatedAt: "v1", validVariantCount: 12 },
    variants: variants(12),
    evaluations: evaluations(12)
  });
  assert.equal(ready.banner.state, "ready");
  assert.equal(ready.variants.length, 12);
  assert.ok(ready.variants.every((card) => card.eligibility === "eligible"));
  assert.equal(ready.tournament.id, "t-1");
});

test("deriveWorkflowState disables refused and unevaluated variants", () => {
  const mixed = deriveWorkflowState({
    phase: "ready",
    tournament: { id: "t-1", status: "ready_for_selection", updatedAt: "v1", validVariantCount: 10 },
    variants: [
      { id: "v0", index: 0, status: "generated", hookType: "question" },
      { id: "v1", index: 1, status: "policy_refused", hookType: "claim" },
      { id: "v2", index: 2, status: "generated", hookType: "pattern" }
    ],
    evaluations: [
      { variantId: "v0", status: "evaluated", modelScore: 88 },
      { variantId: "v1", status: "policy_refused", modelScore: 0 },
      { variantId: "v2", status: "unevaluated", modelScore: 0 }
    ]
  });
  assert.equal(mixed.variants[0].eligibility, "eligible");
  assert.equal(mixed.variants[1].eligibility, "disabled");
  assert.equal(mixed.variants[2].eligibility, "disabled");
});

test("deriveWorkflowState renders success, stale, already-selected and error states", () => {
  const success = deriveWorkflowState({
    phase: "selected",
    tournament: { id: "t-1", status: "selected", updatedAt: "v2", validVariantCount: 10 },
    variants: variants(1),
    evaluations: evaluations(1),
    selectionResponse: selectionResponse()
  });
  assert.equal(success.banner.state, "success");
  assert.equal(success.selectedScript.immutable, true);
  assert.equal(success.selectedScript.version, 1);

  const stale = deriveWorkflowState({
    phase: "selection-error",
    tournament: { id: "t-1", status: "ready_for_selection", updatedAt: "v1", validVariantCount: 10 },
    variants: variants(1),
    evaluations: evaluations(1),
    error: { code: "RESOURCE_VERSION_STALE" }
  });
  assert.equal(stale.banner.state, "stale");

  const already = deriveWorkflowState({
    phase: "selection-error",
    tournament: { id: "t-1", status: "selected", updatedAt: "v2", validVariantCount: 10 },
    variants: variants(1),
    evaluations: evaluations(1),
    error: { code: "SCRIPT_ALREADY_SELECTED" }
  });
  assert.equal(already.banner.state, "already-selected");

  const invalid = deriveWorkflowState({
    phase: "selection-error",
    tournament: { id: "t-1", status: "ready_for_selection", updatedAt: "v1", validVariantCount: 10 },
    variants: variants(1),
    evaluations: evaluations(1),
    error: { code: "SCRIPT_SELECTION_INVALID" }
  });
  assert.equal(invalid.banner.state, "invalid");

  const tournamentError = deriveWorkflowState({
    phase: "tournament-error",
    error: { code: "SCRIPT_VARIANT_COUNT_INSUFFICIENT" }
  });
  assert.equal(tournamentError.banner.state, "error");
  assert.match(tournamentError.banner.text, /Fewer than ten valid variants/);
});

test("workflowMarkup renders variant cards with data-state and disabled select for ineligible variants", () => {
  const markup = workflowMarkup(
    deriveWorkflowState({
      phase: "ready",
      tournament: { id: "t-1", status: "ready_for_selection", updatedAt: "v1", validVariantCount: 10 },
      variants: [
        { id: "v0", index: 0, status: "generated", hookType: "question" },
        { id: "v1", index: 1, status: "policy_refused", hookType: "claim" }
      ],
      evaluations: [
        { variantId: "v0", status: "evaluated", modelScore: 88 },
        { variantId: "v1", status: "policy_refused", modelScore: 0 }
      ]
    })
  );
  assert.match(markup.banner, /data-state="ready"/);
  assert.match(markup.variants, /data-testid="script-variant" data-variant-id="v0" data-state="eligible"/);
  assert.match(markup.variants, /data-state="disabled"/);
  assert.match(markup.variants, /<button[^>]*disabled[^>]*>Select this script<\/button>/);
});

function variants(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `v${index}`,
    index,
    status: "generated",
    hookType: "question"
  }));
}

function evaluations(count) {
  return Array.from({ length: count }, (_, index) => ({
    variantId: `v${index}`,
    status: "evaluated",
    modelScore: 90 - index
  }));
}

function selectionResponse() {
  return {
    selectedScript: {
      id: "ss-1",
      version: 1,
      immutable: true,
      variantId: "v0",
      approverUserId: "approver-1"
    }
  };
}
