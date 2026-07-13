import test from "node:test";
import assert from "node:assert/strict";
import {
  benchmarkB2Transfer,
  B2_TRANSFER_PROVIDER,
  B2_LATENCY_BUDGET_MS,
  B2_EGRESS_COST_MINOR_PER_GB
} from "../../apps/api/src/b2-transfer-benchmark-provider.mjs";

// V0-A2 India-to-Backblaze-B2 transfer benchmark simulator. The canonical
// contracts name the India-to-B2 benchmark as required A2 evidence but do not
// pin a deterministic latency/cost model (V0 has no live B2 binding; local
// storage is the simulator stand-in). Per CLAUDE.md section 1/19 the owner pins
// a deterministic simulator replacement so the benchmark is reproducible, not
// guessed. The simulator derives a representative India-to-B2 transfer latency
// and egress cost deterministically from a sha256 seed, bounded by owner-pinned
// budgets, and clearly labels the result simulated. Production measured values
// remain a post-V0 gate.
test("B2 benchmark provider is the deterministic simulator boundary", () => {
  assert.equal(B2_TRANSFER_PROVIDER, "b2-transfer-simulator");
});

test("B2 benchmark refuses when a non-simulator storage mode is configured", () => {
  const result = benchmarkB2Transfer({ B2_STORAGE_MODE: "live" }, { workspaceId: "w1", bytesRequestedGb: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.kind, "unavailable");
  assert.equal(result.errorCode, "B2_BENCHMARK_UNAVAILABLE");
});

test("B2 benchmark derives a deterministic India-to-B2 latency and egress cost within the pinned budgets", () => {
  const request = { workspaceId: "550e8400-e29b-41d4-a716-446655440000", bytesRequestedGb: 2, region: "india" };
  const first = benchmarkB2Transfer({}, request);
  const second = benchmarkB2Transfer({}, request);
  assert.equal(first.ok, true);
  assert.equal(first.result, "observed");
  assert.equal(first.observation, "simulated");
  assert.equal(first.region, "india-to-b2");
  // Bytes transferred is the request, not a forecast.
  assert.equal(first.bytesTransferredBytes, 2 * 1_000_000_000);
  // Latency is deterministic and within the owner-pinned India-to-B2 budget.
  assert.ok(first.simulatedLatencyMs >= 800, `latency below floor: ${first.simulatedLatencyMs}`);
  assert.ok(first.simulatedLatencyMs <= B2_LATENCY_BUDGET_MS, `latency exceeds budget: ${first.simulatedLatencyMs}`);
  // Egress cost is integer minor units (INR), bytes * pinned minor-per-GB. Never a float.
  assert.equal(first.estimatedCostMinor, 2 * B2_EGRESS_COST_MINOR_PER_GB);
  assert.equal(first.egressBudgetMs, B2_LATENCY_BUDGET_MS);
  assert.match(first.determinismSeed, /^[0-9a-f]{64}$/);
  // Deterministic: same input replays the same numbers.
  assert.deepEqual(second, first);
  // Different bytes produce a different (but still bounded) latency and cost.
  const bigger = benchmarkB2Transfer({}, { ...request, bytesRequestedGb: 4 });
  assert.equal(bigger.estimatedCostMinor, 4 * B2_EGRESS_COST_MINOR_PER_GB);
  assert.ok(bigger.simulatedLatencyMs <= B2_LATENCY_BUDGET_MS);
});

test("B2 benchmark defaults bytes to 1GB and region to india when omitted", () => {
  const result = benchmarkB2Transfer({}, { workspaceId: "w-default" });
  assert.equal(result.ok, true);
  assert.equal(result.bytesTransferredBytes, 1_000_000_000);
  assert.equal(result.region, "india-to-b2");
  assert.equal(result.estimatedCostMinor, B2_EGRESS_COST_MINOR_PER_GB);
});
