import { createHash } from "node:crypto";

const fixtureObservedAt = "2026-06-24T09:00:00.000Z";

const fixtureCandidates = [
  {
    sourceIdentity: "xpoz:site-visit-proof-01",
    sourceUrl: "https://social.example.test/reels/site-visit-proof-01",
    title: "Site visit proof before price discussion",
    creatorHandle: "@blr_property_studio",
    metrics: { views: 128000, likes: 6400, comments: 312, shares: 980 },
    rightsWarnings: ["Source is third-party social content. Use for analysis only until acquisition rights are recorded."],
    metadata: { durationSeconds: 42, language: "en-IN", hookType: "proof-first" }
  },
  {
    sourceIdentity: "xpoz:walkthrough-offer-02",
    sourceUrl: "https://social.example.test/reels/walkthrough-offer-02",
    title: "Walkthrough framed around site visit CTA",
    creatorHandle: "@urban_home_notes",
    metrics: { views: 84000, likes: 5200, comments: 144, shares: 640 },
    rightsWarnings: ["Creator and platform rights must be reviewed before media acquisition."],
    metadata: { durationSeconds: 38, language: "en-IN", hookType: "walkthrough" }
  },
  {
    sourceIdentity: "xpoz:amenity-hook-03",
    sourceUrl: "https://social.example.test/reels/amenity-hook-03",
    title: "Amenity hook with family decision-maker angle",
    creatorHandle: "@south_city_spaces",
    metrics: { views: 61000, likes: 4100, comments: 130, shares: 355 },
    rightsWarnings: ["Observed metrics do not grant reuse rights."],
    metadata: { durationSeconds: 31, language: "en-IN", hookType: "amenity" }
  }
];

export function searchXpozCandidates(input, actorUserId) {
  if (["timeout", "outage", "empty", "malformed"].includes(input.providerMode)) {
    return {
      ok: false,
      providerResult: input.providerMode,
      problemCode: "DISCOVERY_PROVIDER_UNAVAILABLE",
      retryable: input.providerMode !== "malformed"
    };
  }
  if (input.providerMode === "manual_fallback") {
    const manual = normaliseManualCandidate(input.manualCandidate, actorUserId);
    if (!manual) {
      return { ok: false, providerResult: "manual_invalid", problemCode: "VALIDATION_FAILED", retryable: false };
    }
    return { ok: true, provider: "manual", providerResult: "manual_fallback", manualFallbackUsed: true, candidates: [manual] };
  }

  const ranked = fixtureCandidates
    .map((candidate) => normaliseProviderCandidate(candidate))
    .sort((left, right) => rankScore(right.metrics) - rankScore(left.metrics));
  return { ok: true, provider: "xpoz-simulator", providerResult: "success", manualFallbackUsed: false, candidates: ranked };
}

export function candidateSourceHash(candidate) {
  return createHash("sha256")
    .update(stableJson({
      sourceIdentity: candidate.sourceIdentity,
      sourceUrl: candidate.sourceUrl,
      metrics: candidate.metrics,
      observedAt: candidate.observedAt
    }))
    .digest("hex");
}

function normaliseProviderCandidate(candidate) {
  return {
    provider: "xpoz-simulator",
    sourceIdentity: candidate.sourceIdentity,
    sourceUrl: candidate.sourceUrl,
    title: candidate.title,
    creatorHandle: candidate.creatorHandle,
    metrics: candidate.metrics,
    observedAt: fixtureObservedAt,
    rightsWarnings: candidate.rightsWarnings,
    metadata: candidate.metadata,
    provenance: { type: "provider_fixture", provider: "xpoz-simulator" }
  };
}

function normaliseManualCandidate(candidate, actorUserId) {
  if (
    !candidate ||
    typeof candidate.sourceUrl !== "string" ||
    typeof candidate.sourceIdentity !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.creatorHandle !== "string" ||
    typeof candidate.rightsBasis !== "string" ||
    !isMetrics(candidate.metrics)
  ) {
    return null;
  }
  return {
    provider: "manual",
    sourceIdentity: candidate.sourceIdentity.trim(),
    sourceUrl: candidate.sourceUrl.trim(),
    title: candidate.title.trim(),
    creatorHandle: candidate.creatorHandle.trim(),
    metrics: candidate.metrics,
    observedAt: fixtureObservedAt,
    rightsWarnings: [`Manual candidate rights basis: ${candidate.rightsBasis.trim()}`],
    metadata: { durationSeconds: null, language: "unknown", hookType: "manual" },
    provenance: { type: "manual", actorUserId, rightsBasis: candidate.rightsBasis.trim() }
  };
}

function isMetrics(metrics) {
  return metrics && ["views", "likes", "comments", "shares"].every((key) => Number.isInteger(metrics[key]) && metrics[key] >= 0);
}

function rankScore(metrics) {
  return metrics.views + metrics.likes * 8 + metrics.comments * 20 + metrics.shares * 35;
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
