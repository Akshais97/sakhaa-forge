// V0-U3 YouTube Shorts provider adapter. Mirrors the V0-U2 Meta adapter so the domain store uses
// the SAME internal publication contract for both providers; the domain never imports a provider
// SDK. V0 runs against the deterministic simulator only; YOUTUBE_MODE=api is reserved for a
// future provider integration and is not wired in V0. Provider payloads stay adapter-private: the
// adapter returns only the resolved external id, status and error code, never raw provider
// response bodies, account ids, tokens, signed URLs or secrets. The public short URL is the
// audience-facing URL and is derived deterministically from the external post id; it is stored on
// the operation only once the post is live. YouTube uploads are quota-bound (3 uploads/day per
// client per docs/V0/Source_Notes/V0_SOURCE_CALENDAR_INTEGRATIONS.md); quota exhaustion is a
// pre-flight refusal, not a submit outcome, so it never creates a duplicate operation. An upload
// is accepted then processed: the adapter returns a processing flag so the domain moves the
// operation ACCEPTED -> PROCESSING while the post stays accepted, and a verified callback or
// reconciliation drives it to completed. Sources: docs/V0/V0_API.md, docs/V0/V0_STATUS_ENUMS.md,
// docs/V0/V0_JOBS.md, docs/V0/Sprints/V0-U3_IDEMPOTENT_YOUTUBE_SHORTS_PUBLICATION_SPRINT.md,
// docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md.

export const YOUTUBE_PROVIDER = "youtube-simulator";
export const YOUTUBE_OPERATION_TYPE = "publish_post";

// Simulator modes for deterministic publication tests. "processing" models the YouTube upload
// delayed-processing state: the upload is accepted but the provider is still processing the
// short. The domain resolves the mode from a per-request override (test harness) or
// V0_YOUTUBE_SIMULATOR_MODE, defaulting to the happy path. Quota exhaustion is NOT a submit mode;
// it is a pre-flight gate (see checkYouTubeQuota) so it never persists an operation.
const YOUTUBE_MODES = new Set(["success", "timeout", "malformed", "duplicate", "processing"]);

// Reconciliation outcomes for an unknown/processing operation. "pending" means the provider is
// still uncertain, so the caller must not resubmit and must keep reconciling.
const YOUTUBE_RECONCILE_OUTCOMES = new Set(["accepted", "processing", "completed", "failed", "pending"]);

export function resolveYouTubeMode(env = process.env, request = {}) {
  const fromRequest = typeof request.mode === "string" ? request.mode : "";
  if (YOUTUBE_MODES.has(fromRequest)) {
    return fromRequest;
  }
  const fromEnv = typeof env.V0_YOUTUBE_SIMULATOR_MODE === "string" ? env.V0_YOUTUBE_SIMULATOR_MODE : "";
  if (YOUTUBE_MODES.has(fromEnv)) {
    return fromEnv;
  }
  return "success";
}

export function resolveYouTubeReconcileOutcome(env = process.env, request = {}) {
  const fromRequest = typeof request.reconcileOutcome === "string" ? request.reconcileOutcome : "";
  if (YOUTUBE_RECONCILE_OUTCOMES.has(fromRequest)) {
    return fromRequest;
  }
  const fromEnv = typeof env.V0_YOUTUBE_SIMULATOR_RECONCILE === "string" ? env.V0_YOUTUBE_SIMULATOR_RECONCILE : "";
  if (YOUTUBE_RECONCILE_OUTCOMES.has(fromEnv)) {
    return fromEnv;
  }
  return "completed";
}

// Deterministic public short URL for a YouTube external post id. This is the audience-facing URL
// and the only URL surfaced; it is stored on the PublishOperation only once the post is live
// (completed) and never at submit/accepted/processing time. Derived from the external id so it is
// stable across a crash-window retry and a callback replay.
export function youtubePublicUrl(externalId) {
  return `https://youtube.example.test/shorts/${String(externalId)}`;
}

// Pre-flight upload-quota gate. YouTube allows 3 uploads/day per client; when the daily quota is
// exhausted the adapter refuses submission BEFORE any network I/O, so the domain writes no
// PublishOperation row and returns PUBLISH_QUOTA_EXHAUSTED (429) with a retry-after pointing at the
// next quota window. This keeps quota failure explicit (never hidden as generic failure) and
// non-corrupting (no duplicate operation, no second post). The simulator forces exhaustion via
// V0_YOUTUBE_SIMULATOR_QUOTA=exhausted; the real 3/day rule is the production contract.
export function checkYouTubeQuota(env = process.env, request = {}) {
  if (env.V0_YOUTUBE_SIMULATOR_QUOTA === "exhausted") {
    // Retry after one daily quota window. The caller surfaces this to the user; the user retries
    // or exports manually.
    return { ok: false, kind: "quota_exhausted", errorCode: "PUBLISH_QUOTA_EXHAUSTED", retryAfterMs: 24 * 60 * 60 * 1000 };
  }
  return { ok: true };
}

// Submit a calendar post to the YouTube Shorts provider. The adapter persists nothing; the
// domain persists the PublishOperation BEFORE calling this. A timeout after possible acceptance
// is returned as kind "timeout" so the domain marks the operation unknown and reconciles before
// any retry; it never blindly resubmits. A malformed provider response is returned as kind
// "malformed" so the domain fails the operation with PROVIDER_OUTPUT_INVALID. A duplicate tells
// the domain the provider already accepted this idempotency identity, so the domain binds the
// existing external id without a second publish. The "processing" mode returns a processing flag
// so the domain moves the operation to PROCESSING while the post stays accepted, modelling the
// YouTube upload delayed-processing state; a callback or reconciliation later drives it to
// completed. The public short URL is NOT returned here; it is bound only once the post is live.
export function submitYouTubePost(env = process.env, request = {}) {
  const mode = resolveYouTubeMode(env, request);
  if (env.YOUTUBE_MODE && env.YOUTUBE_MODE !== "simulator") {
    // V0 does not wire the live YouTube API; the adapter refuses so no unbound provider call can
    // escape the simulator boundary.
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
      externalId: `yt_dup_${String(request.requestHash ?? "unknown").slice(0, 12)}`
    };
  }
  if (mode === "processing") {
    return {
      ok: true,
      accepted: true,
      processing: true,
      externalId: `yt_${slug}`
    };
  }
  // success: the provider accepts the upload and assigns an external post id. The transient
  // provider URLs and raw response stay inside the adapter and are never returned.
  return {
    ok: true,
    accepted: true,
    externalId: `yt_${slug}`
  };
}

// Reconcile an unknown/processing publish operation by asking the provider for the authoritative
// outcome. The adapter never resubmits; it only queries. "pending" means still uncertain. The
// external id and public short URL are returned when the provider now knows them.
export function reconcileYouTubeOperation(env = process.env, request = {}) {
  const outcome = resolveYouTubeReconcileOutcome(env, request);
  if (outcome === "pending") {
    return { ok: true, status: "pending" };
  }
  const externalId = request.externalId ?? `yt_rec_${String(request.requestHash ?? "unknown").slice(0, 12)}`;
  return {
    ok: true,
    status: outcome,
    externalId,
    publicUrl: youtubePublicUrl(externalId)
  };
}
