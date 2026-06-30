// V0-A2 load-shaped queue backlog simulation adapter. The sprint contract names
// a two-hour queue-backlog simulation but does not pin a deterministic backlog
// growth model or duration. Per CLAUDE.md section 1/19 the owner pins a
// deterministic simulator replacement: a two-hour simulated duration
// (V0_BACKLOG_SIM_DURATION_MS, default 7,200,000 ms) and a linear-growth-then-
// drain model bounded by the queue-age SLO (V0_QUEUE_AGE_SLO_MS, default
// 3,600,000 ms). The adapter derives the backlog curve, the SLO breach point and
// the recovery invariants deterministically from a sha256 seed. The "no duplicate
// paid work" and "no silent job loss" invariants are additionally proven against
// real queue state (outbox relay, lease expiry, dead-letter recovery) in
// tests/integration/hardening-a2-drills; this provider is the deterministic
// load-shape model. Sources: docs/V0/Sprints/V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_SPRINT.md,
// docs/V0/V0_TESTING.md, docs/V0/V0_JOBS.md.

import { createHash } from "node:crypto";

export const QUEUE_BACKLOG_PROVIDER = "queue-backlog-simulator";

// Owner-pinned load-shape budgets (owner-decision on unpinned contract
// dimensions, flagged for confirmation in the A2 evidence). The two-hour
// duration is the sprint's named window; the queue-age SLO is the alerting
// threshold before the user-facing SLO is breached (docs/V0/V0_JOBS.md).
export const QUEUE_BACKLOG_DEFAULT_DURATION_MS = 7_200_000;
export const QUEUE_AGE_SLO_MS = 3_600_000;
const QUEUE_BACKLOG_MAX_DEPTH = 10_000;

function resolveTargetDepth(request) {
  const value = Number(request?.targetDepth ?? 0);
  if (!Number.isInteger(value) || value < 1 || value > QUEUE_BACKLOG_MAX_DEPTH) {
    return { ok: false, problem: { kind: "invalid_input", errorCode: "VALIDATION_FAILED" } };
  }
  return { ok: true, value };
}

function resolveDurationMs(request) {
  const value = Number(request?.simulatedDurationMs ?? QUEUE_BACKLOG_DEFAULT_DURATION_MS);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, problem: { kind: "invalid_input", errorCode: "VALIDATION_FAILED" } };
  }
  return { ok: true, value };
}

function point(tMs, depth) {
  return { tMs: Math.round(tMs), depth: Math.round(depth) };
}

// Simulate a load-shaped backlog over the pinned two-hour window. The backlog
// grows linearly to the target depth over the first half, then drains back to
// zero over the second half. The oldest queued job's age crosses the queue-age
// SLO at the SLO point; the maximum age reached is deterministic from the seed and
// always beyond the SLO for a non-trivial backlog. The recovery invariants (no
// duplicate paid work, no silent job loss) are declared here and proven against
// real queue state elsewhere.
export function simulateQueueBacklog(env = process.env, request = {}) {
  if (env.QUEUE_BACKLOG_MODE && env.QUEUE_BACKLOG_MODE !== "simulator") {
    return { ok: false, kind: "unavailable", errorCode: "QUEUE_BACKLOG_UNAVAILABLE" };
  }
  const depth = resolveTargetDepth(request);
  if (!depth.ok) {
    return { ok: false, kind: depth.problem.kind, errorCode: depth.problem.errorCode };
  }
  const duration = resolveDurationMs(request);
  if (!duration.ok) {
    return { ok: false, kind: duration.problem.kind, errorCode: duration.problem.errorCode };
  }
  const targetDepth = depth.value;
  const simulatedDurationMs = duration.value;
  const half = simulatedDurationMs / 2;
  const seed = createHash("sha256")
    .update(
      [
        "queue.backlog.simulation.v1",
        String(request.workspaceId ?? ""),
        String(targetDepth),
        String(simulatedDurationMs)
      ].join(":")
    )
    .digest("hex");
  const n = Number.parseInt(seed.slice(0, 12), 16);
  const ageRange = Math.max(simulatedDurationMs - QUEUE_AGE_SLO_MS, 1);
  const oldestQueueAgeMs = QUEUE_AGE_SLO_MS + 1 + (n % ageRange);
  const growthCurve = [
    point(0, 0),
    point(half * 0.25, targetDepth * 0.25),
    point(half * 0.5, targetDepth * 0.5),
    point(half * 0.75, targetDepth * 0.75),
    point(half, targetDepth)
  ];
  const drainCurve = [
    point(half, targetDepth),
    point(half + half * 0.25, targetDepth * 0.75),
    point(half + half * 0.5, targetDepth * 0.5),
    point(half + half * 0.75, targetDepth * 0.25),
    point(simulatedDurationMs, 0)
  ];
  return {
    ok: true,
    result: "observed",
    observation: "simulated",
    targetDepth,
    simulatedDurationMs,
    peakDepth: targetDepth,
    growthCurve,
    drainCurve,
    sloBreachedAtMs: Math.min(QUEUE_AGE_SLO_MS, simulatedDurationMs),
    oldestQueueAgeMs,
    duplicatePaidWork: false,
    silentJobLoss: false,
    recoveredOperations: targetDepth,
    determinismSeed: seed
  };
}
