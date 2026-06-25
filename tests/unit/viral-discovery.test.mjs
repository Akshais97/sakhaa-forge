import test from "node:test";
import assert from "node:assert/strict";
import { candidateSourceHash, searchXpozCandidates } from "../../apps/api/src/viral-discovery.mjs";

test("P2 Xpoz simulator fixture ranks candidates deterministically and preserves rights warnings", () => {
  const first = searchXpozCandidates({ providerMode: "fixture_success" }, "actor-1");
  const second = searchXpozCandidates({ providerMode: "fixture_success" }, "actor-1");

  assert.equal(first.ok, true);
  assert.deepEqual(first.candidates.map((candidate) => candidate.sourceIdentity), [
    "xpoz:site-visit-proof-01",
    "xpoz:walkthrough-offer-02",
    "xpoz:amenity-hook-03"
  ]);
  assert.deepEqual(
    first.candidates.map(candidateSourceHash),
    second.candidates.map(candidateSourceHash)
  );
  assert.ok(first.candidates.every((candidate) => candidate.rightsWarnings.length > 0));
});

test("P2 Xpoz simulator failures return no candidates", () => {
  for (const providerMode of ["timeout", "outage", "empty", "malformed"]) {
    const result = searchXpozCandidates({ providerMode }, "actor-1");
    assert.equal(result.ok, false);
    assert.equal(result.problemCode, "DISCOVERY_PROVIDER_UNAVAILABLE");
  }
});
