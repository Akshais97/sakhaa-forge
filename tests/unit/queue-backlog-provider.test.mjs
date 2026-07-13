import test from "node:test";
import assert from "node:assert/strict";
import {
  simulateQueueBacklog,
  QUEUE_BACKLOG_PROVIDER,
  QUEUE_BACKLOG_DEFAULT_DURATION_MS,
  QUEUE_AGE_SLO_MS
} from "../../apps/api/src/queue-backlog-provider.mjs";

// V0-A2 load-shaped queue backlog simulation. The sprint contract names a
// two-hour queue-backlog simulation but does not pin a deterministic backlog
// growth model or duration. Per CLAUDE.md section 1/19 the owner pins a
// deterministic simulator replacement: a two-hour simulated duration
// (V0_BACKLOG_SIM_DURATION_MS, default 7,200,000 ms) and a linear-growth-then-
// drain model bounded by the queue-age SLO (V0_QUEUE_AGE_SLO_MS, default
// 3,600,000 ms). The simulator derives the backlog curve, the SLO breach point
// and the recovery invariants deterministically from a sha256 seed. The "no
// duplicate paid work" and "no silent job loss" invariants are additionally
// proven against real queue state in tests/integration/hardening-a2-drills.
test("queue backlog provider is the deterministic simulator boundary", () => {
  assert.equal(QUEUE_BACKLOG_PROVIDER, "queue-backlog-simulator");
});

test("queue backlog refuses when a non-simulator queue mode is configured", () => {
  const result = simulateQueueBacklog({ QUEUE_BACKLOG_MODE: "live" }, { workspaceId: "w1", targetDepth: 10 });
  assert.equal(result.ok, false);
  assert.equal(result.kind, "unavailable");
  assert.equal(result.errorCode, "QUEUE_BACKLOG_UNAVAILABLE");
});

test("queue backlog models a two-hour load-shaped growth-then-drain curve with an SLO breach", () => {
  const request = { workspaceId: "550e8400-e29b-41d4-a716-446655440000", targetDepth: 50, simulatedDurationMs: QUEUE_BACKLOG_DEFAULT_DURATION_MS };
  const first = simulateQueueBacklog({}, request);
  const second = simulateQueueBacklog({}, request);
  assert.equal(first.ok, true);
  assert.equal(first.result, "observed");
  assert.equal(first.observation, "simulated");
  assert.equal(first.targetDepth, 50);
  assert.equal(first.simulatedDurationMs, QUEUE_BACKLOG_DEFAULT_DURATION_MS);
  assert.equal(first.peakDepth, 50);
  // Growth rises to the target depth, then drains back to zero.
  assert.ok(first.growthCurve.length >= 2, "growth curve must have at least two points");
  assert.ok(first.drainCurve.length >= 2, "drain curve must have at least two points");
  assert.equal(first.growthCurve[0].depth, 0);
  assert.equal(first.growthCurve.at(-1).depth, 50);
  assert.equal(first.drainCurve.at(-1).depth, 0);
  // The SLO breach point is within the simulated duration and beyond the SLO.
  assert.ok(first.sloBreachedAtMs > 0, "expected a SLO breach point");
  assert.ok(first.sloBreachedAtMs <= first.simulatedDurationMs, "breach beyond duration");
  assert.ok(first.oldestQueueAgeMs > QUEUE_AGE_SLO_MS, "expected the backlog to breach the queue-age SLO");
  // Recovery invariants declared by the model and proven against real state elsewhere.
  assert.equal(first.duplicatePaidWork, false);
  assert.equal(first.silentJobLoss, false);
  assert.ok(first.recoveredOperations >= 1, "expected at least one recovered operation");
  assert.match(first.determinismSeed, /^[0-9a-f]{64}$/);
  // Deterministic: same input replays the same curve.
  assert.deepEqual(second, first);
});

test("queue backlog defaults to the two-hour duration when omitted", () => {
  const result = simulateQueueBacklog({}, { workspaceId: "w-default", targetDepth: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.simulatedDurationMs, QUEUE_BACKLOG_DEFAULT_DURATION_MS);
  assert.equal(result.peakDepth, 5);
});

test("queue backlog validates targetDepth", () => {
  const tooLarge = simulateQueueBacklog({}, { workspaceId: "w1", targetDepth: 100_000 });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.kind, "invalid_input");
  assert.equal(tooLarge.errorCode, "VALIDATION_FAILED");
});
