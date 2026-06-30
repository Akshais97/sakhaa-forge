// V0-U4 audience-facing verification adapter. The domain store calls this module; the domain
// never imports a provider SDK and never trusts provider acknowledgement as success. V0 runs
// against the deterministic verifier simulator only; the live verifier integration is not wired
// in V0. The adapter independently observes the audience-facing live post and reports whether
// the target account, media identity (the approved final-video sha256), caption, visibility and
// publish time match the approved calendar post. Provider payloads stay adapter-private: the
// adapter returns only the resolved verification result and the observed identity fingerprint,
// never raw provider response bodies, account ids, tokens, signed URLs or secrets. The
// audience evidence sha256 is a deterministic public content fingerprint derived from the
// observation. Sources: docs/V0/V0_API.md, docs/V0/V0_STATUS_ENUMS.md, docs/V0/V0_JOBS.md,
// docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md.

import { createHash } from "node:crypto";

export const VERIFY_PROVIDER = "verify-simulator";

// Simulator modes for deterministic audience-verification tests. The domain resolves the mode
// from V0_VERIFY_SIMULATOR_MODE, defaulting to the happy path (the live post matches the
// approved post and is public).
const VERIFY_MODES = new Set(["success", "processing", "identity_mismatch", "visibility_restricted"]);

export function resolveVerifyMode(env = process.env, request = {}) {
  const fromRequest = typeof request.mode === "string" ? request.mode : "";
  if (VERIFY_MODES.has(fromRequest)) {
    return fromRequest;
  }
  const fromEnv = typeof env.V0_VERIFY_SIMULATOR_MODE === "string" ? env.V0_VERIFY_SIMULATOR_MODE : "";
  if (VERIFY_MODES.has(fromEnv)) {
    return fromEnv;
  }
  return "success";
}

// Bounded retries for the automatic verify_post job. The manual verify endpoint records each
// attempt; the job (V0-A1 territory) drives the bounded automatic retry. The default is
// conservative and clearly documented; the contract does not name a value.
export function resolveVerifyMaxAttempts(env = process.env) {
  const parsed = Number.parseInt(env.V0_VERIFY_MAX_ATTEMPTS ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 5;
}

// Retry-after for a still-processing platform, in milliseconds. The caller checks again after
// the shown interval. Conservative default; the contract does not name a value.
export const VERIFY_PROCESSING_RETRY_AFTER_MS = 60_000;

// Deterministic audience-facing evidence fingerprint for one verification observation. The
// sha256 binds the observation to the exact calendar post, approved media identity, the live
// URL, the result and the observed identity, so a changed live post or a different result
// produces a different evidence fingerprint. It is a public content hash (not a secret) and is
// the audience evidence reference retained as an immutable Artifact.
export function verifyEvidenceSha256(input = {}) {
  return createHash("sha256")
    .update(
      [
        "calendar.verify_evidence.v1",
        input.workspaceId ?? "",
        input.calendarPostId ?? "",
        input.finalVideoSha256 ?? "",
        String(input.finalVideoVersion ?? ""),
        input.liveUrl ?? "",
        input.result ?? "",
        input.observedMediaSha256 ?? "",
        input.observedAccount ?? "",
        String(input.observedPublishedAt ?? "")
      ].join(":")
    )
    .digest("hex");
}

// Independently observe the audience-facing live post and verify it against the approved
// calendar post. The adapter persists nothing; the domain persists the PostVerification and
// evidence Artifact. A "processing" result means the platform has not propagated the live post
// yet (delayed propagation): the post is not yet verifiable and the caller checks again. An
// "identity_mismatch" result means the live post's account or media does not match the approved
// post (a wrong-publication incident). A "visibility_restricted" result means the post is not
// visible to the required audience. A "verified" result means every check passed. The observed
// media sha256 equals the approved final-video sha256 on a verified result and differs on an
// identity mismatch so the evidence fingerprint is stable and auditable.
export function verifyAudiencePost(env = process.env, request = {}) {
  const mode = resolveVerifyMode(env, request);
  if (env.VERIFY_MODE && env.VERIFY_MODE !== "simulator") {
    // V0 does not wire a live verifier; the adapter refuses so no unbound provider call can
    // escape the simulator boundary.
    return { ok: false, kind: "unavailable", errorCode: "PROVIDER_UNAVAILABLE" };
  }

  const expectedAccount = String(request.account ?? "");
  const expectedMediaSha256 = String(request.finalVideoSha256 ?? "");
  const expectedCaption = String(request.caption ?? "");
  const liveUrl = String(request.liveUrl ?? "");
  const observedPublishedAt = String(request.observedPublishedAt ?? new Date().toISOString());

  if (mode === "processing") {
    return {
      ok: true,
      result: "processing_wait",
      retryAfterMs: VERIFY_PROCESSING_RETRY_AFTER_MS
    };
  }

  if (mode === "identity_mismatch") {
    // The live post was published to the wrong account and/or with the wrong media. The
    // observed media sha256 differs from the approved golden render hash so the evidence
    // fingerprint captures the wrong-publication incident.
    const wrongMediaSha256 = createHash("sha256").update(`${expectedMediaSha256}:wrong`).digest("hex");
    return {
      ok: true,
      result: "identity_mismatch",
      observedAccount: `${expectedAccount}_wrong`,
      observedMediaSha256: wrongMediaSha256,
      observedCaption: expectedCaption,
      observedVisibility: "public",
      observedPublishedAt
    };
  }

  if (mode === "visibility_restricted") {
    return {
      ok: true,
      result: "visibility_restricted",
      observedAccount: expectedAccount,
      observedMediaSha256: expectedMediaSha256,
      observedCaption: expectedCaption,
      observedVisibility: "restricted",
      observedPublishedAt
    };
  }

  // success: the live post matches the approved account, media, caption and visibility, and is
  // published. The observed media sha256 equals the approved final-video sha256 (the golden
  // render hash), so the audience-facing post is the approved media.
  return {
    ok: true,
    result: "verified",
    observedAccount: expectedAccount,
    observedMediaSha256: expectedMediaSha256,
    observedCaption: expectedCaption,
    observedVisibility: "public",
    observedPublishedAt
  };
}
