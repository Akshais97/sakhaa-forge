// V0-A2 incident/runbook rehearsal and rollback or forward-recovery adapter.
// The sprint contract requires an incident/runbook rehearsal and a rollback or
// forward-recovery result but pins no rehearsal procedure. Per CLAUDE.md
// section 1/19 the owner pins a deterministic simulator replacement: a fixed
// set of rehearsal scenarios, each a deterministic script of recovery steps
// with a recorded outcome and a recovery type. V0 favours forward-recovery
// (immutable lineage, recover once) over destructive rollback; the rehearsal
// records which path each scenario exercises. The real recovery machinery
// (reconcile, recoverJob, settle crash-after-retain, final-video supersession)
// is proven against real state in tests/integration/hardening-a2-drills; this
// provider is the deterministic rehearsal record.
// Sources: docs/V0/Sprints/V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_SPRINT.md,
// docs/V0/V0_JOBS.md, docs/V0/V0_SECURITY.md.

import { createHash } from "node:crypto";

export const INCIDENT_REHEARSAL_PROVIDER = "incident-rehearsal-simulator";

// Owner-pinned rehearsal scenario set (owner-decision on an unpinned contract
// dimension, flagged for confirmation in the A2 evidence).
export const INCIDENT_REHEARSAL_SCENARIOS = new Set([
  "provider_unknown_reconcile",
  "lease_expired_recover",
  "crash_after_retain_forward_recover",
  "rollback_to_clean_revision"
]);

const REHEARSAL_SCRIPTS = {
  provider_unknown_reconcile: {
    recoveryType: "forward",
    steps: [
      { name: "Detect provider timeout after acceptance", action: "mark_unknown" },
      { name: "Reconcile by external id without resubmit", action: "reconcile_no_resubmit" },
      { name: "Resolve unknown to a terminal state", action: "resolve_unknown" }
    ]
  },
  lease_expired_recover: {
    recoveryType: "forward",
    steps: [
      { name: "Detect stale worker lease", action: "expire_lease" },
      { name: "Requeue the expired job", action: "requeue" },
      { name: "Reclaim and complete exactly once", action: "reclaim_complete" }
    ]
  },
  crash_after_retain_forward_recover: {
    recoveryType: "forward",
    steps: [
      { name: "Retain generated media", action: "retain_segment" },
      { name: "Detect crash before ledger settlement", action: "detect_crash" },
      { name: "Forward-recover settlement once", action: "settle_once" }
    ]
  },
  rollback_to_clean_revision: {
    recoveryType: "rollback",
    steps: [
      { name: "Detect a bad final-video revision", action: "detect_bad_revision" },
      { name: "Supersede to the prior clean revision", action: "supersede_revision" },
      { name: "Rebind review approval to the clean version", action: "rebind_approval" }
    ]
  }
};

// Rehearse one incident scenario as a deterministic script. The adapter persists
// nothing; the domain persists the audit event. Every step is recorded as passed
// for a deterministic rehearsal; the real recovery is proven against real state
// elsewhere. The recovery type records whether the scenario exercises
// forward-recovery or rollback-to-clean-revision.
export function rehearseIncident(env = process.env, request = {}) {
  if (env.INCIDENT_REHEARSAL_MODE && env.INCIDENT_REHEARSAL_MODE !== "simulator") {
    return { ok: false, kind: "unavailable", errorCode: "INCIDENT_REHEARSAL_UNAVAILABLE" };
  }
  const scenario = request.scenario;
  const script = INCIDENT_REHEARSAL_SCENARIOS.has(scenario) ? REHEARSAL_SCRIPTS[scenario] : null;
  if (!script) {
    return { ok: false, kind: "invalid_scenario", errorCode: "VALIDATION_FAILED" };
  }
  const runId = typeof request.runId === "string" && request.runId.length > 0
    ? request.runId
    : `rehearsal-${String(request.workspaceId ?? "")}-${scenario}`;
  const seed = createHash("sha256")
    .update(
      [
        "incident.rehearsal.v1",
        String(request.workspaceId ?? ""),
        scenario,
        runId
      ].join(":")
    )
    .digest("hex");
  const steps = script.steps.map((step) => ({ ...step, outcome: "passed" }));
  return {
    ok: true,
    result: "observed",
    observation: "simulated",
    runId,
    scenario,
    steps,
    outcome: "passed",
    recoveryType: script.recoveryType,
    recoveredEntityIds: [`recovered:${seed.slice(0, 12)}`],
    determinismSeed: seed
  };
}
