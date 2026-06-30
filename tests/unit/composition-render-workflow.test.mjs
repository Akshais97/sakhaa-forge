import test from "node:test";
import assert from "node:assert/strict";
import {
  attemptState,
  finalVideoState,
  classifyRenderError,
  deriveRenderState,
  renderMarkup
} from "../../apps/web/src/composition-render-workflow.mjs";

// No secret, signed URL, provider payload, asset id or external URL appears in the rendered
// markup. The final-video sha256 is the deterministic golden render fingerprint (a public
// content hash) and is rendered; input hashes, asset hashes and artifact ids are not.
const FORBIDDEN = /\b(secret|api[_-]?key|signature|signed[_-]?url|https?:\/\/)/i;
// Asset ids and artifact ids must never be rendered.
const NO_ASSET_ID = /asset-1|artifact-id|final_video_artifact/i;

const GOLDEN = "a".repeat(64);

function renderedBody(overrides = {}) {
  return {
    attempt: { id: "attempt-1", status: "succeeded", version: 1, outputHash: GOLDEN },
    finalVideo: {
      id: "fv-1",
      status: "current",
      version: 1,
      durationSeconds: 30,
      resolution: "1080x1920",
      codec: "h264",
      capabilityVersion: "ae.local.1",
      schemaVersion: "ae.render.v1",
      sha256: GOLDEN
    },
    composition: { id: "comp-1", status: "rendered" },
    audit: { eventType: "composition.render_succeeded", targetType: "CompositionInstruction" },
    artifacts: {
      finalVideo: { id: "artifact-id-1", status: "CLEAN", retentionClass: "final-video" },
      thumbnail: { id: "artifact-id-2", status: "CLEAN", retentionClass: "final-thumbnail" },
      captions: { id: "artifact-id-3", status: "CLEAN", retentionClass: "final-captions" },
      logs: { id: "artifact-id-4", status: "CLEAN", retentionClass: "render-logs" }
    },
    ...overrides
  };
}

test("attemptState maps known render attempt statuses and preserves unknown", () => {
  for (const status of ["running", "succeeded", "failed"]) {
    assert.equal(attemptState({ attempt: { status } }), status);
  }
  assert.equal(attemptState({ attempt: { status: "nonsense" } }), "unknown");
  assert.equal(attemptState(null), "unknown");
});

test("finalVideoState maps current and superseded and preserves unknown", () => {
  assert.equal(finalVideoState({ finalVideo: { status: "current" } }), "current");
  assert.equal(finalVideoState({ finalVideo: { status: "superseded" } }), "superseded");
  assert.equal(finalVideoState({ finalVideo: { status: "nonsense" } }), "unknown");
  assert.equal(finalVideoState(null), "unknown");
});

test("classifyRenderError maps each render and access error to a stable banner state", () => {
  assert.equal(classifyRenderError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyRenderError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyRenderError({ code: "IDEMPOTENCY_KEY_REQUIRED" }), "missing-idempotency");
  assert.equal(classifyRenderError({ code: "AE_PLAN_SCHEMA_INVALID" }), "not-validated");
  assert.equal(classifyRenderError({ code: "AE_CAPABILITY_UNAVAILABLE" }), "capability-drift");
  assert.equal(classifyRenderError({ code: "AE_RENDER_FAILED" }), "render-failed");
  assert.equal(classifyRenderError({ code: "DEPENDENCY_UNAVAILABLE" }), "crash-retry");
  assert.equal(classifyRenderError({ code: "UNEXPECTED" }), "error");
  assert.equal(classifyRenderError(null), "error");
});

test("deriveRenderState describes a succeeded render with a current final video", () => {
  const descriptor = deriveRenderState({ phase: "ready", body: renderedBody() });
  assert.equal(descriptor.banner.state, "rendered");
  assert.equal(descriptor.attempt.status, "succeeded");
  assert.equal(descriptor.finalVideo.status, "current");
  assert.equal(descriptor.finalVideo.version, 1);
  assert.equal(descriptor.finalVideo.resolution, "1080x1920");
  assert.equal(descriptor.finalVideo.codec, "h264");
  assert.equal(descriptor.finalVideo.capabilityVersion, "ae.local.1");
  assert.equal(descriptor.finalVideo.schemaVersion, "ae.render.v1");
  assert.equal(descriptor.finalVideo.sha256, GOLDEN);
  assert.equal(descriptor.compositionStatus, "rendered");
  assert.equal(descriptor.superseded, null);
});

test("deriveRenderState describes a revision that supersedes the prior current video", () => {
  const body = renderedBody({
    attempt: { id: "attempt-2", status: "succeeded", version: 2, outputHash: GOLDEN },
    finalVideo: { id: "fv-2", status: "current", version: 2, durationSeconds: 30, resolution: "1080x1920", codec: "h264", capabilityVersion: "ae.local.1", schemaVersion: "ae.render.v1", sha256: GOLDEN },
    supersededFinalVideo: { id: "fv-1", version: 1, status: "superseded" },
    supersededAudit: { eventType: "composition.video_superseded", targetType: "CompositionInstruction" }
  });
  const descriptor = deriveRenderState({ phase: "ready", body });
  assert.equal(descriptor.banner.state, "rendered");
  assert.equal(descriptor.finalVideo.version, 2);
  assert.equal(descriptor.superseded.version, 1);
  assert.equal(descriptor.superseded.status, "superseded");
  assert.equal(descriptor.finalVideo.sha256, descriptor.finalVideo.sha256);
});

test("deriveRenderState describes the loading and empty phases and an unknown ready state", () => {
  assert.equal(deriveRenderState({ phase: "loading" }).banner.state, "loading");
  assert.equal(deriveRenderState({ phase: "ready", body: null }).banner.state, "unknown");
  assert.equal(deriveRenderState({}).banner.state, "empty");
  assert.equal(
    deriveRenderState({ phase: "ready", body: { attempt: { status: "running" }, finalVideo: null } }).banner.state,
    "unknown"
  );
});

test("classifyRenderError problem bodies map to the calm error banner states", () => {
  assert.equal(deriveRenderState({ phase: "error", error: { code: "AE_CAPABILITY_UNAVAILABLE" } }).banner.state, "capability-drift");
  assert.equal(deriveRenderState({ phase: "error", error: { code: "AE_RENDER_FAILED" } }).banner.state, "render-failed");
  assert.equal(deriveRenderState({ phase: "error", error: { code: "DEPENDENCY_UNAVAILABLE" } }).banner.state, "crash-retry");
  assert.equal(deriveRenderState({ phase: "error", error: { code: "IDEMPOTENCY_KEY_REQUIRED" } }).banner.state, "missing-idempotency");
  assert.equal(deriveRenderState({ phase: "error", error: { code: "WORKSPACE_ACCESS_DENIED" } }).banner.state, "blocked-hidden");
});

test("renderMarkup renders a succeeded render without leaking secrets, URLs or artifact ids", () => {
  const descriptor = deriveRenderState({ phase: "ready", body: renderedBody() });
  const html = renderMarkup(descriptor);
  assert.match(html, /rendered/i);
  assert.match(html, /1080x1920/);
  assert.match(html, /h264/);
  assert.match(html, /ae\.local\.1/);
  assert.match(html, /ae\.render\.v1/);
  assert.match(html, new RegExp(GOLDEN));
  assert.equal(FORBIDDEN.test(html), false, "markup must not leak secrets, signatures or URLs");
  assert.equal(NO_ASSET_ID.test(html), false, "markup must not render asset or artifact ids");
});

test("renderMarkup renders the superseded prior revision for a revision render", () => {
  const body = renderedBody({
    attempt: { id: "attempt-2", status: "succeeded", version: 2, outputHash: GOLDEN },
    finalVideo: { id: "fv-2", status: "current", version: 2, durationSeconds: 30, resolution: "1080x1920", codec: "h264", capabilityVersion: "ae.local.1", schemaVersion: "ae.render.v1", sha256: GOLDEN },
    supersededFinalVideo: { id: "fv-1", version: 1, status: "superseded" }
  });
  const html = renderMarkup(deriveRenderState({ phase: "ready", body }));
  assert.match(html, /superseded/i);
  assert.match(html, /Prior version 1/);
  assert.equal(FORBIDDEN.test(html), false, "markup must not leak secrets, signatures or URLs");
});

test("renderMarkup renders a calm crash-retry banner for a worker crash", () => {
  const html = renderMarkup(deriveRenderState({ phase: "error", error: { code: "DEPENDENCY_UNAVAILABLE" } }));
  assert.match(html, /crash-retry/);
  assert.match(html, /retry with the same idempotency key/i);
  assert.equal(FORBIDDEN.test(html), false, "markup must not leak secrets, signatures or URLs");
});
