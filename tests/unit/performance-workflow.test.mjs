import test from "node:test";
import assert from "node:assert/strict";
import {
  performanceState,
  classifyPerformanceError,
  derivePerformanceState,
  performanceMarkup
} from "../../apps/web/src/performance-workflow.mjs";

// No secret, signed URL, object key, raw provider payload, account id, idempotency key, source hash
// or credential appears in the rendered markup. Observed metrics (views, likes, comments, shares,
// saves) are public observations of past platform state and ARE rendered; the source hash and any
// platform account id stay server-side.
const FORBIDDEN = /\b(secret|api[_-]?key|signature|signed[_-]?url|object[_-]?key|payload[_-]?hash|producer[_-]?secret|request[_-]?hash|idempotency[_-]?key|source[_-]?hash|account[_-]?id|credential)\b/i;

function verifiedBody(snapshots = []) {
  return {
    calendarPost: { id: "cp-1", status: "published_verified" },
    snapshots
  };
}

function observedSnapshot(overrides = {}) {
  return {
    id: "ps-1",
    source: "performance_collect_simulator",
    observation: "simulated",
    observationWindowStart: "2026-06-29T00:00:00.000Z",
    observationWindowEnd: "2026-06-29T00:05:00.000Z",
    stale: false,
    metrics: { views: 1000, likes: 50, comments: 4, shares: 6, saves: 2 },
    ...overrides
  };
}

test("performanceState derives the observed surface from post status and snapshot count", () => {
  assert.equal(performanceState(verifiedBody([observedSnapshot()])), "observed");
  assert.equal(performanceState({ calendarPost: { status: "scheduled" }, snapshots: [observedSnapshot()] }), "stale");
  assert.equal(performanceState(verifiedBody([])), "awaiting-collection");
  assert.equal(performanceState({ calendarPost: { status: "scheduled" }, snapshots: [] }), "not-observable");
  assert.equal(performanceState({}), "unknown");
});

test("classifyPerformanceError maps performance error codes to honest banner states", () => {
  assert.equal(classifyPerformanceError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyPerformanceError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyPerformanceError({ code: "IDEMPOTENCY_KEY_REQUIRED" }), "missing-idempotency");
  assert.equal(classifyPerformanceError({ code: "PERFORMANCE_NOT_OBSERVABLE" }), "not-observable");
  assert.equal(classifyPerformanceError({ code: "IDEMPOTENCY_INPUT_CONFLICT" }), "idempotency-conflict");
  assert.equal(classifyPerformanceError({ code: "PERFORMANCE_PROCESSING_WAIT" }), "processing-wait");
  assert.equal(classifyPerformanceError({ code: "VALIDATION_FAILED" }), "performance-invalid");
  assert.equal(classifyPerformanceError({ code: "OTHER" }), "error");
  assert.equal(classifyPerformanceError(null), "error");
});

test("derivePerformanceState surfaces observed snapshots with metrics and no predictive claim", () => {
  const descriptor = derivePerformanceState({ phase: "ready", body: verifiedBody([observedSnapshot()]) });
  assert.equal(descriptor.banner.state, "observed");
  assert.equal(descriptor.snapshots.length, 1);
  assert.deepEqual(descriptor.snapshots[0].metrics, { views: 1000, likes: 50, comments: 4, shares: 6, saves: 2 });
  assert.equal(descriptor.snapshots[0].stale, false);
});

test("derivePerformanceState marks a snapshot stale when the post is no longer verified", () => {
  const descriptor = derivePerformanceState({
    phase: "ready",
    body: { calendarPost: { status: "scheduled" }, snapshots: [observedSnapshot()] }
  });
  assert.equal(descriptor.banner.state, "stale");
  // The read path attaches the stale flag server-side; the unit path trusts the body's stale flag.
  assert.equal(descriptor.snapshots[0].stale, false);
});

test("derivePerformanceState distinguishes a fresh collect from a replay", () => {
  const fresh = derivePerformanceState({ phase: "collect-ready", body: { performanceSnapshot: observedSnapshot() }, replay: false });
  assert.equal(fresh.banner.state, "collect-ready");
  const replay = derivePerformanceState({ phase: "collect-ready", body: { performanceSnapshot: observedSnapshot() }, replay: true });
  assert.equal(replay.banner.state, "collect-replay");
});

test("performanceMarkup renders observed metrics and the observations-only note without leaking", () => {
  const descriptor = derivePerformanceState({ phase: "ready", body: verifiedBody([observedSnapshot()]) });
  const html = performanceMarkup(descriptor);
  assert.match(html, /Performance/);
  assert.match(html, /1000/);
  assert.match(html, /not a prediction, forecast or promise of reach, virality, conversion or causal performance/);
  assert.equal(FORBIDDEN.test(html), false, "no forbidden field surfaces in markup");
});

test("performanceMarkup hides a cross-workspace denial without leaking the owning workspace", () => {
  const descriptor = derivePerformanceState({ phase: "error", error: { code: "WORKSPACE_ACCESS_DENIED" } });
  assert.equal(descriptor.banner.state, "blocked-hidden");
  const html = performanceMarkup(descriptor);
  assert.match(html, /could not find that calendar post/);
  assert.equal(html.includes("cp-1"), false, "owning calendar post id never leaks on denial");
});
