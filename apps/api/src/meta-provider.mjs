// V0-U2 Meta provider adapter. The domain store calls this module; the domain never
// imports a provider SDK. V0 runs against the deterministic simulator only; META_MODE=api
// is reserved for a future provider integration and is not wired in V0. Provider
// payloads stay adapter-private: the adapter returns only the resolved external id,
// status and error code, never raw provider response bodies, account ids, tokens,
// signed URLs or secrets. The public post URL is the audience-facing URL and is derived
// deterministically from the external post id; it is stored on the operation only once
// the post is live. Sources: docs/V0/V0_API.md, docs/V0/V0_STATUS_ENUMS.md,
// docs/V0/V0_JOBS.md, docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md.

export const META_PROVIDER = "meta-simulator";
export const META_OPERATION_TYPE = "publish_post";

// Simulator modes for deterministic publication tests. The domain resolves the mode
// from a per-request override (test harness) or V0_META_SIMULATOR_MODE, defaulting
// to the happy path.
const META_MODES = new Set(["success", "timeout", "malformed", "duplicate"]);

// Reconciliation outcomes for an unknown operation. "pending" means the provider is
// still uncertain, so the caller must not resubmit and must keep reconciling.
const META_RECONCILE_OUTCOMES = new Set(["accepted", "processing", "completed", "failed", "pending"]);

export function resolveMetaMode(env = process.env, request = {}) {
  const fromRequest = typeof request.mode === "string" ? request.mode : "";
  if (META_MODES.has(fromRequest)) {
    return fromRequest;
  }
  const fromEnv = typeof env.V0_META_SIMULATOR_MODE === "string" ? env.V0_META_SIMULATOR_MODE : "";
  if (META_MODES.has(fromEnv)) {
    return fromEnv;
  }
  return "success";
}

export function resolveMetaReconcileOutcome(env = process.env, request = {}) {
  const fromRequest = typeof request.reconcileOutcome === "string" ? request.reconcileOutcome : "";
  if (META_RECONCILE_OUTCOMES.has(fromRequest)) {
    return fromRequest;
  }
  const fromEnv = typeof env.V0_META_SIMULATOR_RECONCILE === "string" ? env.V0_META_SIMULATOR_RECONCILE : "";
  if (META_RECONCILE_OUTCOMES.has(fromEnv)) {
    return fromEnv;
  }
  return "completed";
}

// Deterministic public post URL for a Meta external post id. This is the audience-facing
// URL and the only URL surfaced; it is stored on the PublishOperation only once the post
// is live (completed) and never at submit/accepted time. Derived from the external id so
// it is stable across a crash-window retry and a callback replay.
export function metaPublicUrl(externalId) {
  return `https://meta.example.test/p/${String(externalId)}`;
}

// Submit a calendar post to the Meta provider. The adapter persists nothing; the
// domain persists the PublishOperation BEFORE calling this. A timeout after possible
// acceptance is returned as kind "timeout" so the domain marks the operation unknown and
// reconciles before any retry; it never blindly resubmits. A malformed provider response
// is returned as kind "malformed" so the domain fails the operation with
// PROVIDER_OUTPUT_INVALID. A duplicate tells the domain the provider already accepted
// this idempotency identity, so the domain binds the existing external id without a
// second publish. The public post URL is NOT returned here; it is bound only once the
// post is live (via the callback or reconciliation).
export function submitMetaPost(env = process.env, request = {}) {
  const mode = resolveMetaMode(env, request);
  if (env.META_MODE && env.META_MODE !== "simulator") {
    // V0 does not wire the live Meta API; the adapter refuses so no unbound provider
    // call can escape the simulator boundary.
    return { ok: false, kind: "unavailable", errorCode: "PROVIDER_UNAVAILABLE" };
  }
  if (mode === "timeout") {
    return { ok: false, kind: "timeout" };
  }
  if (mode === "malformed") {
    return { ok: false, kind: "malformed", errorCode: "PROVIDER_OUTPUT_INVALID" };
  }
  const slug = String(request.operationId ?? "op").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  if (mode === "duplicate") {
    return {
      ok: true,
      accepted: true,
      duplicate: true,
      externalId: `meta_dup_${String(request.requestHash ?? "unknown").slice(0, 12)}`
    };
  }
  // success: the provider accepts and assigns an external post id. The transient
  // provider URLs and raw response stay inside the adapter and are never returned.
  return {
    ok: true,
    accepted: true,
    externalId: `meta_${slug}`
  };
}

// Reconcile an unknown publish operation by asking the provider for the authoritative
// outcome. The adapter never resubmits; it only queries. "pending" means still
// uncertain. The external id and public post URL are returned when the provider now
// knows them.
export function reconcileMetaOperation(env = process.env, request = {}) {
  const outcome = resolveMetaReconcileOutcome(env, request);
  if (outcome === "pending") {
    return { ok: true, status: "pending" };
  }
  const externalId = request.externalId ?? `meta_rec_${String(request.requestHash ?? "unknown").slice(0, 12)}`;
  return {
    ok: true,
    status: outcome,
    externalId,
    publicUrl: metaPublicUrl(externalId)
  };
}
