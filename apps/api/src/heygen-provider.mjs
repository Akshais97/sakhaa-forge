// V0-G4 HeyGen provider adapter. The domain store calls this module; the domain
// never imports a provider SDK. V0 runs against the deterministic simulator only;
// HEYGEN_MODE=api is reserved for a future provider integration and is not wired in
// V0. Provider payloads stay adapter-private: the adapter returns only the
// resolved external id, status and error code, never raw provider response bodies,
// account ids, tokens, signed URLs or secrets. Sources: docs/V0/V0_HEYGEN_INTEGRATION.md,
// docs/V0/V0_JOBS.md, docs/V0/V0_HEYGEN_COST_MODEL.md,
// docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md.

import { createHash } from "node:crypto";

export const HEYGEN_PROVIDER = "heygen-simulator";
export const HEYGEN_OPERATION_TYPE = "provider_generate";

// Simulator modes for deterministic submission tests. The domain resolves the mode
// from a per-request override (test harness) or V0_HEYGEN_SIMULATOR_MODE, defaulting
// to the happy path.
const HEYGEN_MODES = new Set(["success", "timeout", "malformed", "duplicate"]);

// Reconciliation outcomes for an unknown operation. "pending" means the provider
// is still uncertain, so the caller must not resubmit and must keep reconciling.
const HEYGEN_RECONCILE_OUTCOMES = new Set(["accepted", "processing", "completed", "failed", "pending"]);

export function resolveHeygenMode(env = process.env, request = {}) {
  const fromRequest = typeof request.mode === "string" ? request.mode : "";
  if (HEYGEN_MODES.has(fromRequest)) {
    return fromRequest;
  }
  const fromEnv = typeof env.V0_HEYGEN_SIMULATOR_MODE === "string" ? env.V0_HEYGEN_SIMULATOR_MODE : "";
  if (HEYGEN_MODES.has(fromEnv)) {
    return fromEnv;
  }
  return "success";
}

export function resolveHeygenReconcileOutcome(env = process.env, request = {}) {
  const fromRequest = typeof request.reconcileOutcome === "string" ? request.reconcileOutcome : "";
  if (HEYGEN_RECONCILE_OUTCOMES.has(fromRequest)) {
    return fromRequest;
  }
  const fromEnv = typeof env.V0_HEYGEN_SIMULATOR_RECONCILE === "string" ? env.V0_HEYGEN_SIMULATOR_RECONCILE : "";
  if (HEYGEN_RECONCILE_OUTCOMES.has(fromEnv)) {
    return fromEnv;
  }
  return "completed";
}

export function heygenConcurrencyLimit(env = process.env) {
  const parsed = Number(env.V0_HEYGEN_CONCURRENCY_LIMIT);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 10) {
    return parsed;
  }
  return 10;
}

// Submit a generation video to the provider. The adapter persists nothing; the
// domain persists the ProviderOperation BEFORE calling this. A timeout after
// possible acceptance is returned as kind "timeout" so the domain marks the
// operation unknown and reconciles before any retry; it never blindly resubmits.
// A malformed provider response is returned as kind "malformed" so the domain
// fails the operation with PROVIDER_OUTPUT_INVALID. A duplicate tells the domain
// the provider already accepted this idempotency identity, so the domain binds the
// existing external id without a second paid operation.
export function submitHeygenVideo(env = process.env, request = {}) {
  const mode = resolveHeygenMode(env, request);
  if (env.HEYGEN_MODE && env.HEYGEN_MODE !== "simulator") {
    // V0 does not wire the live HeyGen API; the adapter refuses so no unpaid,
    // unbound provider call can escape the simulator boundary.
    return { ok: false, kind: "unavailable", errorCode: "PROVIDER_UNAVAILABLE" };
  }
  if (mode === "timeout") {
    return { ok: false, kind: "timeout" };
  }
  if (mode === "malformed") {
    return { ok: false, kind: "malformed", errorCode: "PROVIDER_OUTPUT_INVALID" };
  }
  if (mode === "duplicate") {
    return {
      ok: true,
      accepted: true,
      duplicate: true,
      externalId: `hg_dup_${String(request.requestHash ?? "unknown").slice(0, 12)}`
    };
  }
  // success: the provider accepts and assigns an external video id. The transient
  // provider URLs and raw response stay inside the adapter and are never returned.
  return {
    ok: true,
    accepted: true,
    externalId: `hg_${String(request.operationId ?? "op").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`
  };
}

// Reconcile an unknown operation by asking the provider for the authoritative
// outcome. The adapter never resubmits; it only queries. "pending" means still
// uncertain. The external id is returned when the provider now knows it.
export function reconcileHeygenOperation(env = process.env, request = {}) {
  const outcome = resolveHeygenReconcileOutcome(env, request);
  if (outcome === "pending") {
    return { ok: true, status: "pending" };
  }
  return {
    ok: true,
    status: outcome,
    externalId: request.externalId ?? `hg_rec_${String(request.requestHash ?? "unknown").slice(0, 12)}`
  };
}

// V0-G5 media retention modes for deterministic settlement tests. "success" fetches
// valid media whose provider total equals the authorized maximum; "malformed_media"
// returns unreadable media (ASSET_MEDIA_MALFORMED); "cost_mismatch" returns valid media
// whose provider total exceeds the authorized maximum
// (PROVIDER_COST_EXCEEDS_AUTHORIZATION); "crash_after_retain" fetches valid media but the
// settlement flow is interrupted after media retention and before ledger settlement, so a
// second settle call recovers. The transient provider URL never leaves the adapter.
const HEYGEN_MEDIA_MODES = new Set(["success", "malformed_media", "cost_mismatch", "crash_after_retain"]);

export function resolveHeygenMediaMode(env = process.env) {
  const fromEnv = typeof env.V0_G5_SIMULATOR_MODE === "string" ? env.V0_G5_SIMULATOR_MODE : "";
  if (HEYGEN_MEDIA_MODES.has(fromEnv)) {
    return fromEnv;
  }
  return "success";
}

// Deterministic simulator rate for v0.local.1 INR (1,600 minor per second), matching the
// seeded ProviderPriceVersion. The adapter reports the provider total so the domain can
// reconcile it against the authorized maximum without trusting a provider URL.
const HEYGEN_SIMULATOR_RATE_MINOR_PER_SECOND = 1600;

function deterministicMediaBytes(operationId, durationSeconds) {
  return Buffer.from(`v0-g5-media:${operationId}:${durationSeconds}`, "utf8");
}

// Fetch the completed provider media through the adapter only. The transient provider
// URL and raw provider response stay adapter-private; the adapter returns only the
// retained-media descriptor (hash, duration, content type, byte size, resolution) and the
// reconciled provider total in integer minor units. A malformed result is returned as
// kind "malformed" so the domain rejects the artifact without capturing credits. A
// cost-mismatch result carries a provider total above the authorized maximum so the
// domain blocks settlement. The hash is derived from the operation id so it is stable
// across a crash-window retry.
export function fetchHeygenMedia(env = process.env, request = {}) {
  if (env.HEYGEN_MODE && env.HEYGEN_MODE !== "simulator") {
    return { ok: false, kind: "unavailable", errorCode: "PROVIDER_UNAVAILABLE" };
  }
  const mode = resolveHeygenMediaMode(env);
  if (mode === "malformed_media") {
    return { ok: false, kind: "malformed", errorCode: "ASSET_MEDIA_MALFORMED" };
  }
  const durationSeconds = Number(request.durationSeconds) || 30;
  let providerTotalMinor = durationSeconds * HEYGEN_SIMULATOR_RATE_MINOR_PER_SECOND;
  if (mode === "cost_mismatch") {
    const authorized = Number(request.estimatedMaximumMinor) || providerTotalMinor;
    providerTotalMinor = authorized + 1000;
  }
  const operationId = String(request.operationId ?? "op");
  const externalId = String(request.externalId ?? `hg_${operationId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`);
  const mediaBytes = deterministicMediaBytes(operationId, durationSeconds);
  const sha256 = createHash("sha256").update(mediaBytes).digest("hex");
  return {
    ok: true,
    media: {
      externalId,
      sha256,
      durationSeconds,
      contentType: "video/mp4",
      byteSize: mediaBytes.length,
      resolution: { width: 1280, height: 720 },
      providerTotalMinor
    }
  };
}
