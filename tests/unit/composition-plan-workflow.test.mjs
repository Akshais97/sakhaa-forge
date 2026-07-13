import test from "node:test";
import assert from "node:assert/strict";
import {
  compositionState,
  validationOutcome,
  classifyCompositionError,
  deriveCompositionState,
  compositionMarkup
} from "../../apps/web/src/composition-plan-workflow.mjs";

// No secret, signed URL, provider payload or external URL appears in the rendered markup.
// Plan artifact hashes and asset IDs are retained server-side; the composition surface shows
// status, capability version and unsupported items only.
const FORBIDDEN = /\b(secret|api[_-]?key|signature|signed[_-]?url|https?:\/\/)/i;

function validatedBody(overrides = {}) {
  return {
    composition: { id: "comp-1", status: "validated", generationAssetId: "asset-1", inputMode: "structured" },
    plan: {
      id: "plan-1",
      status: "validated",
      capabilityVersion: "ae.local.1",
      schemaVersion: "ae.plan.v1",
      version: 1,
      unsupportedItems: []
    },
    artifact: {
      id: "art-1",
      status: "CLEAN",
      contentType: "application/json",
      sha256: "deadbeef".repeat(8),
      retentionClass: "plan-artifact"
    },
    audit: { eventType: "composition.plan_validated", targetType: "CompositionInstruction" },
    ...overrides
  };
}

function failedProblem(overrides = {}) {
  return {
    code: "AE_ASSET_MISSING",
    status: 422,
    planStatus: "validation_failed",
    compositionId: "comp-2",
    planId: "plan-2",
    unsupported: [
      { code: "AE_ASSET_MISSING", field: "tracks[0].assetId", detail: "A referenced media asset is missing or unavailable." }
    ],
    ...overrides
  };
}

test("compositionState maps known composition statuses and preserves unknown", () => {
  for (const status of ["draft", "planning", "validation_failed", "validated", "rendering", "rendered", "failed", "superseded"]) {
    assert.equal(compositionState({ status }), status);
  }
  assert.equal(compositionState({ status: "nonsense" }), "unknown");
  assert.equal(compositionState(null), "unknown");
});

test("validationOutcome maps validated and validation_failed and preserves unknown", () => {
  assert.equal(validationOutcome({ plan: { status: "validated" } }), "validated");
  assert.equal(validationOutcome({ plan: { status: "validation_failed" } }), "validation_failed");
  assert.equal(validationOutcome({ planStatus: "validation_failed" }), "validation_failed");
  assert.equal(validationOutcome({ plan: { status: "rendering" } }), "unknown");
  assert.equal(validationOutcome(null), "unknown");
});

test("classifyCompositionError maps each AE and access error to a stable banner state", () => {
  assert.equal(classifyCompositionError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyCompositionError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyCompositionError({ code: "AE_PLAN_SCHEMA_INVALID" }), "malformed-plan");
  assert.equal(classifyCompositionError({ code: "AE_ASSET_MISSING" }), "missing-asset");
  assert.equal(classifyCompositionError({ code: "AE_CAPABILITY_UNAVAILABLE" }), "unsupported-capability");
  assert.equal(classifyCompositionError({ code: "AE_TIMELINE_INVALID" }), "invalid-timeline");
  assert.equal(classifyCompositionError({ code: "UNEXPECTED" }), "error");
  assert.equal(classifyCompositionError(null), "error");
});

test("deriveCompositionState describes a validated plan", () => {
  const descriptor = deriveCompositionState({ phase: "ready", body: validatedBody() });
  assert.equal(descriptor.banner.state, "validated");
  assert.equal(descriptor.plan.status, "validated");
  assert.equal(descriptor.plan.capabilityVersion, "ae.local.1");
  assert.equal(descriptor.plan.schemaVersion, "ae.plan.v1");
  assert.equal(descriptor.unsupported.length, 0);
  assert.equal(descriptor.compositionId, "comp-1");
  assert.equal(descriptor.planId, "plan-1");
});

test("deriveCompositionState describes a validation_failed plan from a problem body", () => {
  const descriptor = deriveCompositionState({ phase: "error", body: { planStatus: "validation_failed", unsupported: failedProblem().unsupported, compositionId: "comp-2", planId: "plan-2" }, error: failedProblem() });
  assert.equal(descriptor.banner.state, "missing-asset");
  assert.equal(descriptor.plan, null);
  assert.equal(descriptor.unsupported.length, 1);
  assert.equal(descriptor.unsupported[0].code, "AE_ASSET_MISSING");
  assert.equal(descriptor.compositionId, "comp-2");
  assert.equal(descriptor.planId, "plan-2");
});

test("deriveCompositionState describes the loading and empty phases", () => {
  assert.equal(deriveCompositionState({ phase: "loading" }).banner.state, "loading");
  assert.equal(deriveCompositionState({ phase: "ready", body: null }).banner.state, "unknown");
  assert.equal(deriveCompositionState({}).banner.state, "empty");
});

test("compositionMarkup renders a validated plan without leaking secrets or URLs", () => {
  const descriptor = deriveCompositionState({ phase: "ready", body: validatedBody() });
  const html = compositionMarkup(descriptor);
  assert.match(html, /validated/i);
  assert.match(html, /ae\.local\.1/);
  assert.match(html, /ae\.plan\.v1/);
  assert.equal(FORBIDDEN.test(html), false, "markup must not leak secrets, signatures or URLs");
});

test("compositionMarkup renders every unsupported item for a validation_failed plan", () => {
  const problem = failedProblem({
    code: "AE_CAPABILITY_UNAVAILABLE",
    status: 409,
    unsupported: [
      { code: "AE_CAPABILITY_UNAVAILABLE", field: "fonts[0].name", detail: "Font ComicSans is not in the capability registry." },
      { code: "AE_ASSET_MISSING", field: "tracks[0].assetId", detail: "A referenced media asset is missing or unavailable." }
    ]
  });
  const descriptor = deriveCompositionState({ phase: "error", body: problem, error: problem });
  const html = compositionMarkup(descriptor);
  assert.match(html, /ComicSans/);
  assert.match(html, /missing or unavailable/i);
  assert.match(html, /validation_failed/i);
  assert.equal(FORBIDDEN.test(html), false, "markup must not leak secrets, signatures or URLs");
});
