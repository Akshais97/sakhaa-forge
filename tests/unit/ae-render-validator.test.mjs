import test from "node:test";
import assert from "node:assert/strict";
import {
  AE_RENDER_SCHEMA_VERSION,
  AE_RENDER_RESOLUTION,
  AE_RENDER_CODEC,
  goldenRenderHash,
  renderAeVideo,
  validateAeRenderOutput,
  resolveAeRenderMode
} from "../../apps/api/src/ae-render-provider.mjs";
import { DEFAULT_AE_CAPABILITY_VERSION } from "../../apps/api/src/ae-capability-registry.mjs";

// V0-C2 AE render worker adapter and validator. The deterministic golden render hash is
// stable for the same plan input hash and duration, independent of the revision version, so a
// golden-video comparison is reproducible. The validator classifies a worker render descriptor
// against the plan: capability drift (AE_CAPABILITY_UNAVAILABLE) ranks above output/input/hash
// failures (AE_RENDER_FAILED). The adapter keeps worker payloads private and never returns a
// transient URL, signed URL, secret or raw worker response. V0 runs against the deterministic
// simulator only; a live licensed AE worker is refused.

const PLAN_HASH = "b".repeat(64);
const CAP = DEFAULT_AE_CAPABILITY_VERSION;

function validDescriptor(overrides = {}) {
  const base = renderAeVideo({ V0_C2_SIMULATOR_MODE: "success" }, {
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30,
    capabilityVersion: CAP
  });
  return { ...base.render, ...overrides };
}

test("resolveAeRenderMode defaults to success and accepts the documented simulator modes", () => {
  assert.equal(resolveAeRenderMode({}), "success");
  assert.equal(resolveAeRenderMode({ V0_C2_SIMULATOR_MODE: "crash" }), "crash");
  assert.equal(resolveAeRenderMode({ V0_C2_SIMULATOR_MODE: "bad_output" }), "bad_output");
  assert.equal(resolveAeRenderMode({ V0_C2_SIMULATOR_MODE: "capability_drift" }), "capability_drift");
  assert.equal(resolveAeRenderMode({ V0_C2_SIMULATOR_MODE: "nonsense" }), "success");
});

test("goldenRenderHash is deterministic for the same plan input and varies with duration", () => {
  assert.equal(goldenRenderHash(PLAN_HASH, 30), goldenRenderHash(PLAN_HASH, 30));
  assert.notEqual(goldenRenderHash(PLAN_HASH, 30), goldenRenderHash(PLAN_HASH, 45));
  assert.notEqual(goldenRenderHash(PLAN_HASH, 30), goldenRenderHash("c".repeat(64), 30));
  assert.match(goldenRenderHash(PLAN_HASH, 30), /^[0-9a-f]{64}$/);
});

test("renderAeVideo returns a valid success descriptor whose final-video hash is the golden hash", () => {
  const result = renderAeVideo({ V0_C2_SIMULATOR_MODE: "success" }, {
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30,
    capabilityVersion: CAP
  });
  assert.equal(result.ok, true);
  assert.equal(result.render.workerCapabilityVersion, CAP);
  assert.equal(result.render.inputHash, PLAN_HASH);
  assert.equal(result.render.finalVideo.sha256, goldenRenderHash(PLAN_HASH, 30));
  assert.equal(result.render.finalVideo.resolution, AE_RENDER_RESOLUTION);
  assert.equal(result.render.finalVideo.codec, AE_RENDER_CODEC);
  assert.equal(result.render.finalVideo.contentType, "video/mp4");
  assert.match(result.render.finalVideo.sha256, /^[0-9a-f]{64}$/);
  assert.match(result.render.thumbnail.sha256, /^[0-9a-f]{64}$/);
  assert.match(result.render.captions.sha256, /^[0-9a-f]{64}$/);
});

test("renderAeVideo refuses a non-simulator worker mode so no unbound worker call escapes V0", () => {
  const result = renderAeVideo({ AE_WORKER_MODE: "live" }, {
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30,
    capabilityVersion: CAP
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AE_RENDER_FAILED");
});

test("renderAeVideo capability_drift reports a worker capability that does not match the plan", () => {
  const result = renderAeVideo({ V0_C2_SIMULATOR_MODE: "capability_drift" }, {
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30,
    capabilityVersion: CAP
  });
  assert.equal(result.ok, true);
  assert.notEqual(result.render.workerCapabilityVersion, CAP);
});

test("renderAeVideo bad_output reports a final-video hash that does not match the golden hash", () => {
  const result = renderAeVideo({ V0_C2_SIMULATOR_MODE: "bad_output" }, {
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30,
    capabilityVersion: CAP
  });
  assert.equal(result.ok, true);
  assert.notEqual(result.render.finalVideo.sha256, goldenRenderHash(PLAN_HASH, 30));
});

test("validateAeRenderOutput accepts a descriptor that matches the plan", () => {
  const descriptor = validDescriptor();
  const result = validateAeRenderOutput(descriptor, {
    capabilityVersion: CAP,
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30
  });
  assert.equal(result.ok, true);
});

test("validateAeRenderOutput classifies capability drift as AE_CAPABILITY_UNAVAILABLE with priority", () => {
  const descriptor = validDescriptor({ workerCapabilityVersion: "ae.local.9" });
  const result = validateAeRenderOutput(descriptor, {
    capabilityVersion: CAP,
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AE_CAPABILITY_UNAVAILABLE");
  assert.equal(result.status, 409);
});

test("validateAeRenderOutput classifies an input hash mismatch as AE_RENDER_FAILED", () => {
  const descriptor = validDescriptor({ inputHash: "d".repeat(64) });
  const result = validateAeRenderOutput(descriptor, {
    capabilityVersion: CAP,
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AE_RENDER_FAILED");
  assert.equal(result.status, 422);
});

test("validateAeRenderOutput classifies a codec, resolution or duration mismatch as AE_RENDER_FAILED", () => {
  const codecMismatch = validDescriptor({
    finalVideo: { ...renderAeVideo({ V0_C2_SIMULATOR_MODE: "success" }, { planCanonicalHash: PLAN_HASH, durationSeconds: 30, capabilityVersion: CAP }).render.finalVideo, codec: "vp9" }
  });
  const result = validateAeRenderOutput(codecMismatch, {
    capabilityVersion: CAP,
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AE_RENDER_FAILED");
});

test("validateAeRenderOutput classifies a non-golden output hash as AE_RENDER_FAILED", () => {
  const badHash = validDescriptor({
    finalVideo: { ...renderAeVideo({ V0_C2_SIMULATOR_MODE: "success" }, { planCanonicalHash: PLAN_HASH, durationSeconds: 30, capabilityVersion: CAP }).render.finalVideo, sha256: "e".repeat(64) }
  });
  const result = validateAeRenderOutput(badHash, {
    capabilityVersion: CAP,
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AE_RENDER_FAILED");
  assert.equal(result.status, 422);
});

test("validateAeRenderOutput rejects a missing descriptor with AE_RENDER_FAILED", () => {
  const result = validateAeRenderOutput(null, {
    capabilityVersion: CAP,
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AE_RENDER_FAILED");
});

test("validateAeRenderOutput priority: capability drift ranks above an output hash mismatch", () => {
  const descriptor = validDescriptor({
    workerCapabilityVersion: "ae.local.9",
    finalVideo: { ...renderAeVideo({ V0_C2_SIMULATOR_MODE: "success" }, { planCanonicalHash: PLAN_HASH, durationSeconds: 30, capabilityVersion: CAP }).render.finalVideo, sha256: "f".repeat(64) }
  });
  const result = validateAeRenderOutput(descriptor, {
    capabilityVersion: CAP,
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AE_CAPABILITY_UNAVAILABLE");
});

test("renderAeVideo never returns a transient URL, signed URL, secret or raw worker payload", () => {
  const result = renderAeVideo({ V0_C2_SIMULATOR_MODE: "success" }, {
    planCanonicalHash: PLAN_HASH,
    durationSeconds: 30,
    capabilityVersion: CAP
  });
  const serialized = JSON.stringify(result);
  assert.equal(/https?:\/\//i.test(serialized), false);
  assert.equal(/secret|api[_-]?key|signature|token/i.test(serialized), false);
});
