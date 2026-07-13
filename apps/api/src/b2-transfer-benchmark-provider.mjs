// V0-A2 India-to-Backblaze-B2 transfer benchmark adapter. The domain store
// calls this module; the domain never imports a provider SDK and never treats a
// provider acknowledgement as success. V0 runs against the deterministic B2
// transfer simulator only; the live B2 binding is not wired in V0 (local
// filesystem storage is the simulator stand-in). The adapter returns only a
// representative India-to-B2 transfer latency and egress cost derived
// deterministically from a sha256 seed, bounded by owner-pinned budgets, and
// clearly labels the result simulated. These are planning-grade simulator
// numbers, not measured production values; measured India-to-B2 results remain a
// post-V0 gate (docs/Project/Architecture/PROJECT_ARCHITECTURE_LOW_COST_INFRASTRUCTURE.md).
// Sources: docs/V0/Sprints/V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_SPRINT.md,
// docs/V0/V0_RISKS_AND_GATES.md, docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md.

import { createHash } from "node:crypto";

export const B2_TRANSFER_PROVIDER = "b2-transfer-simulator";

// Owner-pinned India-to-B2 budgets (owner-decision on an unpinned contract
// dimension, flagged for confirmation in the A2 evidence). The latency budget is
// a representative India-to-B2 transfer budget in milliseconds; the egress cost is
// integer INR minor units per gigabyte (never a float).
export const B2_LATENCY_BUDGET_MS = 2500;
export const B2_EGRESS_COST_MINOR_PER_GB = 8000;
const B2_LATENCY_FLOOR_MS = 800;
const B2_BYTES_PER_GB = 1_000_000_000;

// Resolve the bytes to transfer, defaulting to 1 GB. Negative or non-finite
// values are rejected.
function resolveBytesRequestedGb(request) {
  const value = Number(request?.bytesRequestedGb ?? 1);
  if (!Number.isFinite(value) || value <= 0 || value > 1000) {
    return { ok: false, problem: { kind: "invalid_input", errorCode: "VALIDATION_FAILED" } };
  }
  return { ok: true, value };
}

// Benchmark a representative India-to-B2 transfer. The adapter persists nothing;
// the domain persists the audit event. The latency is deterministic and bounded
// by the owner-pinned budget; the egress cost is integer minor units. The result
// is visibly simulated, never a measured production value or a promise.
export function benchmarkB2Transfer(env = process.env, request = {}) {
  if (env.B2_STORAGE_MODE && env.B2_STORAGE_MODE !== "simulator") {
    // V0 does not wire a live B2 binding; the adapter refuses so no unbound
    // provider call can escape the simulator boundary.
    return { ok: false, kind: "unavailable", errorCode: "B2_BENCHMARK_UNAVAILABLE" };
  }
  const bytes = resolveBytesRequestedGb(request);
  if (!bytes.ok) {
    return { ok: false, kind: bytes.problem.kind, errorCode: bytes.problem.errorCode };
  }
  const region = "india-to-b2";
  const seed = createHash("sha256")
    .update(
      [
        "b2.transfer.benchmark.v1",
        String(request.workspaceId ?? ""),
        String(bytes.value),
        region
      ].join(":")
    )
    .digest("hex");
  const n = Number.parseInt(seed.slice(0, 12), 16);
  const latencyRange = B2_LATENCY_BUDGET_MS - B2_LATENCY_FLOOR_MS;
  const simulatedLatencyMs = B2_LATENCY_FLOOR_MS + (n % latencyRange);
  return {
    ok: true,
    result: "observed",
    observation: "simulated",
    region,
    bytesTransferredBytes: Math.round(bytes.value * B2_BYTES_PER_GB),
    simulatedLatencyMs,
    egressBudgetMs: B2_LATENCY_BUDGET_MS,
    estimatedCostMinor: Math.round(bytes.value * B2_EGRESS_COST_MINOR_PER_GB),
    determinismSeed: seed
  };
}
