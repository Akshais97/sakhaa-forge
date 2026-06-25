import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("B3 approval creates one active immutable brand profile and blocks stale concurrent approval", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("b3-owner") });
      const prepared = await prepareCandidates(client);
      const brandId = "20000000-0000-4000-8000-000000000001";
      const approvalInput = approvalPayload(prepared.workspaceId, prepared.crawlRunId, 0);

      const [first, second] = await Promise.all([
        client.approveBrandProfile(brandId, approvalInput),
        client.approveBrandProfile(brandId, approvalInput)
      ]);
      const responses = [first, second].sort((left, right) => left.status - right.status);

      assert.equal(responses[0].status, 201, JSON.stringify(responses[0].body));
      assert.equal(responses[0].body.profile.status, "approved");
      assert.equal(responses[0].body.profile.active, true);
      assert.equal(responses[0].body.profile.version, 1);
      assert.equal(responses[0].body.approval.decision, "approve");
      assert.equal(responses[0].body.audit.eventType, "brand.profile.approved");
      assert.equal(responses[0].body.rules.some((rule) => rule.type === "prohibited_claim"), true);
      assert.equal(responses[1].status, 409);
      assert.equal(responses[1].body.code, "RESOURCE_VERSION_STALE");
    }
  );
});

test("B3 downstream production rejects draft or superseded brand profile versions", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("b3-manager") });
      const prepared = await prepareCandidates(client);
      const brandId = "20000000-0000-4000-8000-000000000002";
      const draftEstimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: "21000000-0000-4000-8000-000000000099",
        selectedScriptId: "31000000-0000-4000-8000-000000000001",
        avatarProfileId: "41000000-0000-4000-8000-000000000001"
      });

      const versionOne = await client.approveBrandProfile(brandId, approvalPayload(prepared.workspaceId, prepared.crawlRunId, 0));
      const versionTwo = await client.approveBrandProfile(
        brandId,
        approvalPayload(prepared.workspaceId, prepared.crawlRunId, 1, {
          positioningStatement: "Premium homes with transparent site visit support."
        })
      );
      const staleEstimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: versionOne.body.profile.id,
        selectedScriptId: "31000000-0000-4000-8000-000000000001",
        avatarProfileId: "41000000-0000-4000-8000-000000000001"
      });
      const activeEstimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: versionTwo.body.profile.id,
        selectedScriptId: "31000000-0000-4000-8000-000000000001",
        avatarProfileId: "41000000-0000-4000-8000-000000000001"
      });

      assert.equal(draftEstimate.status, 409);
      assert.equal(draftEstimate.body.code, "BRAND_PROFILE_NOT_APPROVED");
      assert.equal(versionOne.status, 201, JSON.stringify(versionOne.body));
      assert.equal(versionTwo.status, 201, JSON.stringify(versionTwo.body));
      assert.equal(staleEstimate.status, 409);
      assert.equal(staleEstimate.body.code, "BRAND_PROFILE_NOT_APPROVED");
      assert.equal(activeEstimate.status, 202, JSON.stringify(activeEstimate.body));
      assert.equal(activeEstimate.body.estimate.brandProfileId, versionTwo.body.profile.id);
      assert.equal(activeEstimate.body.estimate.status, "awaiting_confirmation");
    }
  );
});

async function prepareCandidates(client) {
  const created = await client.createWorkspace(
    { name: `B3 ${randomUUID().slice(0, 8)}` },
    { idempotencyKey: `b3-workspace-${randomUUID()}` }
  );
  const workspaceId = created.body.workspace.id;
  const crawl = await client.createBrandCrawlRun(
    {
      workspaceId,
      websiteUrl: "https://aster.example.com/projects/",
      rightsAcknowledged: true,
      crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
    },
    { idempotencyKey: `b3-crawl-${randomUUID()}` }
  );
  return { workspaceId, crawlRunId: crawl.body.crawlRun.id };
}

function approvalPayload(workspaceId, crawlRunId, optimisticVersion, overrides = {}) {
  return {
    workspaceId,
    crawlRunId,
    decision: "approve",
    optimisticVersion,
    profile: {
      publicName: "Aster Heights",
      industry: "real_estate",
      markets: ["Bengaluru"],
      positioningStatement: overrides.positioningStatement ?? "Premium, practical homes for urban professionals and families.",
      products: [{ name: "Aster Heights", category: "residential_project", status: "active" }],
      audiences: [{ name: "Urban professionals and families", geography: ["Bengaluru"] }],
      callsToAction: [{ label: "Book a site visit", actionType: "lead_form" }],
      voice: {
        attributes: ["calm", "premium", "direct", "informative"],
        avoid: ["hype", "guaranteed return", "pressure selling"],
        formality: "balanced",
        languages: ["en-IN"]
      },
      visualIdentity: {
        logoDecision: "no-logo",
        colourDecision: "flexible-colour",
        colors: [{ role: "primary", value: "#173B57" }]
      },
      claims: [{ text: "Guaranteed appreciation", status: "prohibited" }],
      rightsAttestation: true
    },
    rules: [
      { type: "prohibited_claim", value: "Guaranteed appreciation", severity: "critical", rationale: "Unsupported real-estate performance claim." },
      { type: "required_phrase", value: "Terms and availability apply", severity: "warning", rationale: "Required offer disclosure." }
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
