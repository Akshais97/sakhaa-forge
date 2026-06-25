import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("P2 searches and ranks viral candidates with immutable metric snapshots", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p2-manager") });
      const prepared = await prepareDiscoveryRequest(client);

      const first = await client.searchViralCandidates({
        workspaceId: prepared.workspaceId,
        blueprintRequestId: prepared.blueprintRequestId,
        niche: "Bengaluru real-estate site visit",
        market: "Bengaluru",
        objectiveType: "site_visit",
        providerMode: "fixture_success",
        limit: 3
      });
      assert.equal(first.status, 202, JSON.stringify(first.body));
      assert.equal(first.body.search.provider, "xpoz-simulator");
      assert.equal(first.body.search.status, "ready");
      assert.equal(first.body.candidates.length, 3);
      assert.deepEqual(first.body.candidates.map((candidate) => candidate.rank), [1, 2, 3]);
      assert.deepEqual(first.body.candidates.map((candidate) => candidate.sourceIdentity), [
        "xpoz:site-visit-proof-01",
        "xpoz:walkthrough-offer-02",
        "xpoz:amenity-hook-03"
      ]);

      for (const candidate of first.body.candidates) {
        assert.equal(candidate.workspaceId, prepared.workspaceId);
        assert.equal(candidate.blueprintRequestId, prepared.blueprintRequestId);
        assert.equal(candidate.selectionState, "available");
        assert.equal(candidate.metrics.length, 1);
        assert.equal(candidate.metrics[0].immutable, true);
        assert.match(candidate.metrics[0].observedAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.match(candidate.metrics[0].sourceHash, /^[a-f0-9]{64}$/);
        assert.ok(candidate.rightsWarnings.length > 0);
      }

      const repeated = await client.searchViralCandidates({
        workspaceId: prepared.workspaceId,
        blueprintRequestId: prepared.blueprintRequestId,
        niche: "Bengaluru real-estate site visit",
        market: "Bengaluru",
        objectiveType: "site_visit",
        providerMode: "fixture_success",
        limit: 3
      });
      assert.equal(repeated.status, 202, JSON.stringify(repeated.body));
      assert.deepEqual(
        repeated.body.candidates.map((candidate) => [candidate.sourceIdentity, candidate.rank, candidate.metrics[0].sourceHash]),
        first.body.candidates.map((candidate) => [candidate.sourceIdentity, candidate.rank, candidate.metrics[0].sourceHash])
      );
      assert.deepEqual(
        repeated.body.candidates.map((candidate) => candidate.metrics[0].id),
        first.body.candidates.map((candidate) => candidate.metrics[0].id)
      );
    }
  );
});

test("P2 provider outage does not fabricate candidates and manual fallback keeps provenance", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p2-outage") });
      const prepared = await prepareDiscoveryRequest(client);

      const outage = await client.searchViralCandidates({
        workspaceId: prepared.workspaceId,
        blueprintRequestId: prepared.blueprintRequestId,
        niche: "Bengaluru real-estate site visit",
        market: "Bengaluru",
        objectiveType: "site_visit",
        providerMode: "timeout",
        limit: 5
      });
      assert.equal(outage.status, 503, JSON.stringify(outage.body));
      assert.equal(outage.body.code, "DISCOVERY_PROVIDER_UNAVAILABLE");
      assert.equal(outage.body.providerResult, "timeout");
      assert.deepEqual(outage.body.candidates, []);

      const manual = await client.searchViralCandidates({
        workspaceId: prepared.workspaceId,
        blueprintRequestId: prepared.blueprintRequestId,
        niche: "Bengaluru real-estate site visit",
        market: "Bengaluru",
        objectiveType: "site_visit",
        providerMode: "manual_fallback",
        manualCandidate: {
          sourceUrl: "https://social.example.test/reels/manual-site-visit",
          sourceIdentity: "manual:site-visit-2026-06-24",
          title: "Manual site visit proof reel",
          creatorHandle: "@manual_estate",
          rightsBasis: "public-link-review-only",
          metrics: { views: 12500, likes: 640, comments: 38, shares: 96 }
        },
        limit: 5
      });
      assert.equal(manual.status, 202, JSON.stringify(manual.body));
      assert.equal(manual.body.search.manualFallbackUsed, true);
      assert.equal(manual.body.candidates.length, 1);
      assert.equal(manual.body.candidates[0].provider, "manual");
      assert.equal(manual.body.candidates[0].provenance.type, "manual");
      assert.equal(manual.body.candidates[0].provenance.actorUserId, "p2-outage");
      assert.equal(manual.body.candidates[0].metrics[0].immutable, true);
    }
  );
});

async function prepareDiscoveryRequest(client) {
  const created = await client.createWorkspace(
    { name: `P2 ${randomUUID().slice(0, 8)}` },
    { idempotencyKey: `p2-workspace-${randomUUID()}` }
  );
  const workspaceId = created.body.workspace.id;
  const crawl = await client.createBrandCrawlRun(
    {
      workspaceId,
      websiteUrl: "https://aster.example.com/projects/",
      rightsAcknowledged: true,
      crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
    },
    { idempotencyKey: `p2-crawl-${randomUUID()}` }
  );
  const approved = await client.approveBrandProfile(randomUUID(), approvalPayload(workspaceId, crawl.body.crawlRun.id, 0));
  const request = await client.createBlueprintRequest({
    workspaceId,
    brandProfileId: approved.body.profile.id,
    brandProfileVersion: approved.body.profile.version,
    path: "new_discovery",
    objectiveType: "site_visit",
    objective: "Create a site-visit short for Aster Heights."
  });
  assert.equal(request.status, 202, JSON.stringify(request.body));
  return {
    workspaceId,
    blueprintRequestId: request.body.request.id
  };
}

function approvalPayload(workspaceId, crawlRunId, optimisticVersion) {
  return {
    workspaceId,
    crawlRunId,
    decision: "approve",
    optimisticVersion,
    profile: {
      publicName: "Aster Heights",
      industry: "real_estate",
      markets: ["Bengaluru"],
      positioningStatement: "Premium, practical homes for urban professionals and families.",
      products: [{ name: "Aster Heights", category: "residential_project", status: "active" }],
      audiences: [{ name: "Urban professionals and families", geography: ["Bengaluru"] }],
      callsToAction: [{ label: "Book a site visit", actionType: "lead_form" }],
      voice: {
        attributes: ["calm", "premium", "direct", "informative"],
        avoid: ["hype", "guaranteed return", "pressure selling"],
        formality: "balanced",
        languages: ["en-IN"]
      },
      rightsAttestation: true
    },
    rules: [
      { type: "prohibited_claim", value: "Guaranteed appreciation", severity: "critical", rationale: "Unsupported real-estate performance claim." }
    ]
  };
}

function signJwt(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: `${userId}@example.test`,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
