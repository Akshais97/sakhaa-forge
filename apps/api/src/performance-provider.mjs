// V0-A1 performance observation adapter. The domain store calls this module; the domain never
// imports a provider SDK and never treats a provider acknowledgement as success. V0 runs against
// the deterministic performance simulator only; the live platform-insights integration is not
// wired in V0. The adapter observes platform metrics for a verified audience-facing post and
// returns only observed counts and an explicit observation label, never raw provider response
// bodies, account ids, tokens, signed URLs or secrets. The metrics are observations of past
// platform state, never a prediction, projection or promise of reach, virality, conversion or
// causal performance. Sources: docs/V0/V0_API.md, docs/V0/V0_STATUS_ENUMS.md, docs/V0/V0_JOBS.md,
// docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md, docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md.

import { createHash } from "node:crypto";

export const PERFORMANCE_PROVIDER = "performance-simulator";

// Simulator modes for deterministic performance-observation tests. The domain resolves the mode
// from V0_PERFORMANCE_SIMULATOR_MODE, defaulting to the happy path (the platform reports observed
// counts for the live post).
const PERFORMANCE_MODES = new Set(["observed", "processing"]);

// Retry-after for a still-processing platform, in milliseconds. The caller checks again after the
// shown interval. Conservative default; the contract does not name a value.
export const PERFORMANCE_PROCESSING_RETRY_AFTER_MS = 60_000;

export function resolvePerformanceMode(env = process.env, request = {}) {
  const fromRequest = typeof request.mode === "string" ? request.mode : "";
  if (PERFORMANCE_MODES.has(fromRequest)) {
    return fromRequest;
  }
  const fromEnv = typeof env.V0_PERFORMANCE_SIMULATOR_MODE === "string" ? env.V0_PERFORMANCE_SIMULATOR_MODE : "";
  if (PERFORMANCE_MODES.has(fromEnv)) {
    return fromEnv;
  }
  return "observed";
}

// Observe platform metrics for one verified audience-facing post. The adapter persists nothing; the
// domain persists the immutable PerformanceSnapshot. A "processing" result means the platform has
// not finished reporting yet (delayed propagation): the caller checks again. An "observed" result
// carries deterministic, clearly-simulated counts derived from the calendar post id and the
// collect sequence so replays are stable and the numbers are visibly synthetic, never a forecast.
// The counts are observations of past platform state only.
export function collectPerformanceObservation(env = process.env, request = {}) {
  if (env.PERFORMANCE_MODE && env.PERFORMANCE_MODE !== "simulator") {
    // V0 does not wire a live insights provider; the adapter refuses so no unbound provider call
    // can escape the simulator boundary.
    return { ok: false, kind: "unavailable", errorCode: "PERFORMANCE_PROVIDER_UNAVAILABLE" };
  }
  const mode = resolvePerformanceMode(env, request);
  if (mode === "processing") {
    return { ok: true, result: "processing_wait", retryAfterMs: PERFORMANCE_PROCESSING_RETRY_AFTER_MS };
  }

  // observed: deterministic synthetic counts. The seed binds the observation to the exact post and
  // the collect sequence, so the same collect key replays the same numbers and later collects
  // produce different observations. These are observed counts, never predictive.
  const seed = createHash("sha256")
    .update(
      [
        "performance.observation.v1",
        request.calendarPostId ?? "",
        String(request.collectSequence ?? 0),
        String(request.platform ?? "")
      ].join(":")
    )
    .digest("hex");
  const n = Number.parseInt(seed.slice(0, 12), 16);
  const metrics = {
    views: 1000 + (n % 5000),
    likes: 50 + (n % 400),
    comments: 5 + (n % 60),
    shares: 1 + (n % 30),
    saves: 2 + (n % 40)
  };
  return { ok: true, result: "observed", observation: "simulated", metrics };
}
