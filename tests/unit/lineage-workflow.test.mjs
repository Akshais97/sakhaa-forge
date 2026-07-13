import test from "node:test";
import assert from "node:assert/strict";
import {
  lineageState,
  classifyLineageError,
  deriveLineageState,
  lineageMarkup
} from "../../apps/web/src/lineage-workflow.mjs";

// No secret, signed URL, object key, raw provider payload, external id, request hash, idempotency
// key, source hash or credential appears in the rendered markup. The manifest sha256 and each
// artifact sha256 are public content fingerprints and ARE rendered; the object key is never
// rendered.
const FORBIDDEN = /\b(secret|api[_-]?key|signature|signed[_-]?url|object[_-]?key|payload[_-]?hash|producer[_-]?secret|request[_-]?hash|idempotency[_-]?key|source[_-]?hash|credential)\b/i;

const FINAL_VIDEO_ID = "11111111-1111-4111-8111-111111111111";
const MANIFEST = "a".repeat(64);
const ASSET_SHA = "b".repeat(64);
const FINAL_SHA = "c".repeat(64);

function completeBody(overrides = {}) {
  return {
    workspaceId: "ws-1",
    finalVideoId: FINAL_VIDEO_ID,
    status: "complete",
    missing: [],
    mismatches: [],
    manifestSha256: MANIFEST,
    generatedAt: "2026-06-29T00:00:00.000Z",
    cost: { providerTotalMinor: 48000, estimatedMaximumMinor: 48000, currency: "INR", priceVersion: "v0.local.1" },
    providerTimestamps: { submittedAt: "2026-06-29T00:00:00.000Z", acceptedAt: null, completedAt: null },
    entries: [
      { kind: "brand_profile", id: "bp-1", createdAt: "2026-06-29T00:00:00.000Z" },
      { kind: "generated_asset", id: "ga-1", status: "clean", durationSeconds: 30, artifact: { sha256: ASSET_SHA, contentType: "video/mp4", version: 1 }, createdAt: "2026-06-29T00:00:00.000Z" },
      { kind: "final_video", id: "fv-1", version: 1, durationSeconds: 30, resolution: "1080x1920", codec: "h264", capabilityVersion: "v1", schemaVersion: "v1", artifact: { sha256: FINAL_SHA, byteSize: 4096 }, createdAt: "2026-06-29T00:00:00.000Z" }
    ],
    ...overrides
  };
}

test("lineageState maps export status and preserves unknown", () => {
  assert.equal(lineageState({ status: "complete" }), "complete");
  assert.equal(lineageState({ status: "incomplete" }), "incomplete");
  assert.equal(lineageState({ status: "blocked" }), "blocked");
  assert.equal(lineageState({ status: "garbage" }), "unknown");
  assert.equal(lineageState({}), "unknown");
});

test("classifyLineageError maps export error codes to honest banner states", () => {
  assert.equal(classifyLineageError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyLineageError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyLineageError({ code: "VALIDATION_FAILED" }), "lineage-invalid");
  assert.equal(classifyLineageError({ code: "SOMETHING_ELSE" }), "error");
  assert.equal(classifyLineageError(null), "error");
});

test("deriveLineageState surfaces complete ancestry with manifest, cost and redacted entries", () => {
  const descriptor = deriveLineageState({ phase: "ready", body: completeBody() });
  assert.equal(descriptor.banner.state, "lineage-ready");
  assert.equal(descriptor.lineage.status, "complete");
  assert.equal(descriptor.lineage.manifestSha256, MANIFEST);
  assert.equal(descriptor.lineage.cost.providerTotalMinor, 48000);
  assert.equal(descriptor.lineage.entries.length, 3);
  const generatedAsset = descriptor.lineage.entries.find((e) => e.kind === "generated_asset");
  assert.equal(generatedAsset.artifact.sha256, ASSET_SHA);
  assert.equal("objectKey" in generatedAsset.artifact, false, "object key never surfaces");
});

test("deriveLineageState surfaces incomplete and blocked ancestry honestly", () => {
  const incomplete = deriveLineageState({ phase: "ready", body: completeBody({ status: "incomplete", missing: ["selected_script"] }) });
  assert.equal(incomplete.lineage.status, "incomplete");
  assert.deepEqual(incomplete.lineage.missing, ["selected_script"]);
  const blocked = deriveLineageState({ phase: "ready", body: completeBody({ status: "blocked", mismatches: ["final_video"] }) });
  assert.equal(blocked.lineage.status, "blocked");
  assert.deepEqual(blocked.lineage.mismatches, ["final_video"]);
});

test("lineageMarkup renders the public ancestry without leaking secrets or object keys", () => {
  const descriptor = deriveLineageState({ phase: "ready", body: completeBody() });
  const html = lineageMarkup(descriptor);
  assert.match(html, /Creative lineage/);
  assert.match(html, new RegExp(MANIFEST));
  assert.match(html, new RegExp(ASSET_SHA));
  assert.equal(FORBIDDEN.test(html), false, "no forbidden field surfaces in markup");
  assert.equal(html.includes("objectKey"), false, "object key never rendered");
});

test("lineageMarkup hides a cross-workspace denial without leaking the owning workspace", () => {
  const descriptor = deriveLineageState({ phase: "error", error: { code: "WORKSPACE_ACCESS_DENIED" } });
  assert.equal(descriptor.banner.state, "blocked-hidden");
  const html = lineageMarkup(descriptor);
  assert.match(html, /could not find that final video/);
  assert.equal(html.includes("ws-1"), false, "owning workspace id never leaks");
});

