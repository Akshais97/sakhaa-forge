// V0-C2 deterministic AE render worker adapter. The domain store calls this module; the
// domain never imports an AE worker SDK. V0 runs against the deterministic simulator only;
// a live licensed AE worker is reserved for a future integration and is not wired in V0.
// Worker payloads stay adapter-private: the adapter returns only the resolved render
// descriptor (capability version, input hash, golden output hash, final video / thumbnail /
// captions descriptors), never raw worker response bodies, account ids, tokens, signed URLs
// or secrets. Sources: docs/V0/V0_VERTICAL_OUTCOME_SLICES.md (V0-C2),
// docs/V0/Sprints/V0-C2_REPRODUCIBLE_FINAL_BRANDED_RENDER_SPRINT.md, docs/V0/V0_JOBS.md,
// docs/V0/V0_ERROR_CATALOG.md, docs/V0/V0_DATA_MODELS.md,
// docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md.

import { createHash } from "node:crypto";

export const AE_RENDER_SCHEMA_VERSION = "ae.render.v1";
export const AE_RENDER_RESOURCE_CLASS = "AE";
export const AE_RENDER_JOB_TYPE = "ae_render";
export const AE_RENDER_RESOLUTION = "1080x1920";
export const AE_RENDER_CODEC = "h264";

// Simulator modes for deterministic render tests. The domain resolves the mode from
// V0_C2_SIMULATOR_MODE, defaulting to the happy path. "success" produces a valid render
// whose output hash matches the deterministic golden hash; "capability_drift" makes the
// worker report a capability version that does not match the plan; "bad_output" makes the
// worker report an output hash that does not match the deterministic golden hash; "crash"
// is a domain-level crash window (the simulator still returns a valid descriptor, but the
// domain persists the running attempt and returns DEPENDENCY_UNAVAILABLE before retaining
// the final media, so a second call recovers once).
const AE_RENDER_MODES = new Set(["success", "crash", "bad_output", "capability_drift"]);

export function resolveAeRenderMode(env = process.env) {
  const fromEnv = typeof env.V0_C2_SIMULATOR_MODE === "string" ? env.V0_C2_SIMULATOR_MODE : "";
  if (AE_RENDER_MODES.has(fromEnv)) {
    return fromEnv;
  }
  return "success";
}

// The deterministic golden render hash for a plan input hash and duration. The same plan
// always renders to the same final-video hash, independent of the revision version, so a
// golden-video comparison is reproducible across revisions. The hash is derived from the
// plan canonical timeline hash (the input hash) and the duration; it never depends on the
// workspace, actor or revision version.
export function goldenRenderHash(planCanonicalHash, durationSeconds) {
  const data = `ae-render-final:${planCanonicalHash}:${Number(durationSeconds)}`;
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function deterministicDescriptorHash(prefix, planCanonicalHash, durationSeconds) {
  return createHash("sha256").update(`${prefix}:${planCanonicalHash}:${Number(durationSeconds)}`, "utf8").digest("hex");
}

// Run the AE render through the adapter only. The domain persists the RenderAttempt BEFORE
// calling this (persist external side-effect operation before the work). The adapter returns
// a render descriptor carrying the worker capability version, the input hash the worker
// rendered from, the golden final-video hash and the thumbnail/captions descriptors. The
// domain validates the descriptor against the plan (capability version, input hash, codec,
// resolution, duration, output hash) before retaining any final media. "capability_drift"
// returns a worker capability version that does not match the plan;
// "bad_output" returns a final-video hash that does not match the deterministic golden hash
// so the domain rejects the output. "crash" returns a valid descriptor (the domain decides
// the crash window). The transient worker URLs and raw responses stay inside the adapter
// and are never returned.
export function renderAeVideo(env = process.env, request = {}) {
  if (env.AE_WORKER_MODE && env.AE_WORKER_MODE !== "simulator") {
    // V0 does not wire the live licensed AE worker; the adapter refuses so no unbound
    // worker call can escape the simulator boundary.
    return { ok: false, kind: "unavailable", errorCode: "AE_RENDER_FAILED" };
  }
  const mode = resolveAeRenderMode(env);
  const planCanonicalHash = String(request.planCanonicalHash ?? "unknown");
  const durationSeconds = Number(request.durationSeconds) || 30;
  const capabilityVersion = String(request.capabilityVersion ?? "ae.local.1");

  const workerCapabilityVersion = mode === "capability_drift" ? "ae.local.9" : capabilityVersion;
  const goldenHash = goldenRenderHash(planCanonicalHash, durationSeconds);
  // bad_output reports a final-video hash that does not match the deterministic golden hash
  // so the domain's output-hash validation rejects it.
  const finalVideoHash = mode === "bad_output" ? deterministicDescriptorHash("ae-render-bad", planCanonicalHash, durationSeconds) : goldenHash;

  return {
    ok: true,
    render: {
      workerCapabilityVersion,
      inputHash: planCanonicalHash,
      finalVideo: {
        sha256: finalVideoHash,
        durationSeconds,
        resolution: AE_RENDER_RESOLUTION,
        codec: AE_RENDER_CODEC,
        contentType: "video/mp4",
        byteSize: 1024 + (durationSeconds * 64)
      },
      thumbnail: {
        sha256: deterministicDescriptorHash("ae-render-thumb", planCanonicalHash, durationSeconds),
        contentType: "image/jpeg",
        byteSize: 2048
      },
      captions: {
        sha256: deterministicDescriptorHash("ae-render-captions", planCanonicalHash, durationSeconds),
        contentType: "text/vtt",
        byteSize: 512
      }
    }
  };
}

const CAP_CODE = "AE_CAPABILITY_UNAVAILABLE";
const RENDER_CODE = "AE_RENDER_FAILED";

// Validate a worker render descriptor against the plan before retaining any final media.
// `expected` carries the plan capability version, the plan canonical timeline hash (the
// expected input hash) and the plan duration. The worker output must match the expected
// capability version and input hash, and the final-video hash must match the deterministic
// golden hash for the plan. Priority: capability drift (AE_CAPABILITY_UNAVAILABLE) ranks
// above output/input/hash failures (AE_RENDER_FAILED) because an incompatible worker is the
// root cause the operator must fix first. Returns { ok: true } or { ok: false, code,
// status, detail }.
export function validateAeRenderOutput(descriptor, expected) {
  if (!descriptor || typeof descriptor !== "object" || !descriptor.finalVideo) {
    return { ok: false, code: RENDER_CODE, status: 422, detail: "The AE worker returned no render output." };
  }
  if (descriptor.workerCapabilityVersion !== expected.capabilityVersion) {
    return {
      ok: false,
      code: CAP_CODE,
      status: 409,
      detail: `Worker capability ${descriptor.workerCapabilityVersion} does not match the plan capability ${expected.capabilityVersion}.`
    };
  }
  if (descriptor.inputHash !== expected.planCanonicalHash) {
    return {
      ok: false,
      code: RENDER_CODE,
      status: 422,
      detail: "The render output does not match the expected plan input hash."
    };
  }
  const fv = descriptor.finalVideo;
  if (fv.codec !== AE_RENDER_CODEC || fv.resolution !== AE_RENDER_RESOLUTION || Number(fv.durationSeconds) !== Number(expected.durationSeconds)) {
    return {
      ok: false,
      code: RENDER_CODE,
      status: 422,
      detail: "The render output codec, resolution or duration does not match the plan."
    };
  }
  if (!/^[0-9a-f]{64}$/.test(String(fv.sha256)) || !/^[0-9a-f]{64}$/.test(String(descriptor.thumbnail?.sha256)) || !/^[0-9a-f]{64}$/.test(String(descriptor.captions?.sha256))) {
    return { ok: false, code: RENDER_CODE, status: 422, detail: "The render output is missing a required media hash." };
  }
  const expectedHash = goldenRenderHash(expected.planCanonicalHash, expected.durationSeconds);
  if (fv.sha256 !== expectedHash) {
    return {
      ok: false,
      code: RENDER_CODE,
      status: 422,
      detail: "The render output hash does not match the deterministic golden render for this plan."
    };
  }
  return { ok: true };
}
