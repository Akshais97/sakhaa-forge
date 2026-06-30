import test from "node:test";
import assert from "node:assert/strict";
import {
  rehearseIncident,
  INCIDENT_REHEARSAL_PROVIDER,
  INCIDENT_REHEARSAL_SCENARIOS
} from "../../apps/api/src/incident-rehearsal-provider.mjs";

// V0-A2 incident/runbook rehearsal and rollback or forward-recovery record.
// The sprint contract requires an incident/runbook rehearsal and a rollback or
// forward-recovery result but pins no rehearsal procedure. Per CLAUDE.md
// section 1/19 the owner pins a deterministic simulator replacement: a fixed
// set of rehearsal scenarios, each a deterministic script of recovery steps
// with a recorded outcome and recovery type. V0 favours forward-recovery
// (immutable lineage, recover once) over destructive rollback; the rehearsal
// records which path each scenario exercises. The real recovery machinery
// (reconcile, recoverJob, settle crash-after-retain) is proven against real
// state in tests/integration/hardening-a2-drills; this provider is the
// deterministic rehearsal record.
test("incident rehearsal provider is the deterministic simulator boundary", () => {
  assert.equal(INCIDENT_REHEARSAL_PROVIDER, "incident-rehearsal-simulator");
});

test("incident rehearsal exposes the owner-pinned scenario set", () => {
  assert.deepEqual([...INCIDENT_REHEARSAL_SCENARIOS].sort(), [
    "crash_after_retain_forward_recover",
    "lease_expired_recover",
    "provider_unknown_reconcile",
    "rollback_to_clean_revision"
  ]);
});

test("incident rehearsal refuses when a non-simulator rehearsal mode is configured", () => {
  const result = rehearseIncident({ INCIDENT_REHEARSAL_MODE: "live" }, { workspaceId: "w1", scenario: "provider_unknown_reconcile" });
  assert.equal(result.ok, false);
  assert.equal(result.kind, "unavailable");
  assert.equal(result.errorCode, "INCIDENT_REHEARSAL_UNAVAILABLE");
});

test("incident rehearsal rejects an unknown scenario", () => {
  const result = rehearseIncident({}, { workspaceId: "w1", scenario: "bogus" });
  assert.equal(result.ok, false);
  assert.equal(result.kind, "invalid_scenario");
  assert.equal(result.errorCode, "VALIDATION_FAILED");
});

test("incident rehearsal records a deterministic forward-recovery script for the provider-unknown scenario", () => {
  const request = { workspaceId: "550e8400-e29b-41d4-a716-446655440000", scenario: "provider_unknown_reconcile", runId: "run-1" };
  const first = rehearseIncident({}, request);
  const second = rehearseIncident({}, request);
  assert.equal(first.ok, true);
  assert.equal(first.result, "observed");
  assert.equal(first.observation, "simulated");
  assert.equal(first.scenario, "provider_unknown_reconcile");
  assert.equal(first.outcome, "passed");
  assert.equal(first.recoveryType, "forward");
  assert.ok(first.steps.length >= 2, "expected at least two rehearsal steps");
  for (const step of first.steps) {
    assert.ok(typeof step.name === "string" && step.name.length > 0);
    assert.ok(typeof step.action === "string" && step.action.length > 0);
    assert.equal(step.outcome, "passed");
  }
  assert.ok(Array.isArray(first.recoveredEntityIds));
  assert.match(first.determinismSeed, /^[0-9a-f]{64}$/);
  // Deterministic: same input replays the same rehearsal.
  assert.deepEqual(second, first);
});

test("incident rehearsal records a rollback-to-clean-revision script for the rollback scenario", () => {
  const result = rehearseIncident({}, { workspaceId: "w1", scenario: "rollback_to_clean_revision" });
  assert.equal(result.ok, true);
  assert.equal(result.recoveryType, "rollback");
  assert.equal(result.outcome, "passed");
  assert.ok(result.steps.some((step) => /revision|supersede/i.test(step.name)));
});

test("incident rehearsal derives a stable run id when omitted", () => {
  const result = rehearseIncident({}, { workspaceId: "w1", scenario: "lease_expired_recover" });
  assert.equal(result.ok, true);
  assert.ok(typeof result.runId === "string" && result.runId.length > 0);
  assert.equal(result.recoveryType, "forward");
});
