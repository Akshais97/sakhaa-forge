import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("P1 existing, discovery and default paths create one downstream blueprint request contract", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p1-manager") });
      const prepared = await prepareApprovedBrand(client);

      const empty = await client.listBlueprints({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 10
      });
      assert.equal(empty.status, 200, JSON.stringify(empty.body));
      assert.deepEqual(empty.body.items, []);
      assert.equal(empty.body.emptyState.action, "choose_new_discovery_or_default");

      const seeded = await client.seedBlueprintLibraryEntry({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        title: "Site visit proof structure",
        status: "ready",
        compatibility: {
          industry: "real_estate",
          markets: ["Bengaluru"],
          objectiveTypes: ["site_visit"],
          brandProfileVersions: [prepared.brandProfileVersion]
        }
      });
      assert.equal(seeded.status, 201, JSON.stringify(seeded.body));

      const listed = await client.listBlueprints({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 10
      });
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      assert.equal(listed.body.items.length, 1);
      assert.equal(listed.body.items[0].compatibility.compatible, true);

      const common = {
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        brandProfileVersion: prepared.brandProfileVersion,
        objectiveType: "site_visit",
        objective: "Create a site-visit short for Aster Heights."
      };
      const discovery = await client.createBlueprintRequest({
        ...common,
        path: "new_discovery"
      });
      const defaultPath = await client.createBlueprintRequest({
        ...common,
        path: "default_formula"
      });
      const existing = await client.createBlueprintRequest({
        ...common,
        path: "existing_blueprint",
        blueprintLibraryEntryId: seeded.body.entry.id
      });

      for (const response of [discovery, defaultPath, existing]) {
        assert.equal(response.status, 202, JSON.stringify(response.body));
        assert.equal(response.body.request.workspaceId, prepared.workspaceId);
        assert.equal(response.body.request.brandProfileId, prepared.brandProfileId);
        assert.equal(response.body.request.brandProfileVersion, prepared.brandProfileVersion);
        assert.match(response.body.request.id, /^[0-9a-f-]{36}$/);
        assert.equal(response.body.audit.eventType, "blueprint.request.created");
      }
      assert.deepEqual(
        [discovery.body.request.path, defaultPath.body.request.path, existing.body.request.path].sort(),
        ["default_formula", "existing_blueprint", "new_discovery"]
      );
    }
  );
});

test("P1 rejects stale, archived, incompatible and cross-workspace blueprint selections", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("p1-stale") });
      const prepared = await prepareApprovedBrand(client);
      const other = await prepareApprovedBrand(client);
      const archived = await client.seedBlueprintLibraryEntry({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        title: "Archived structure",
        status: "archived",
        compatibility: {
          industry: "real_estate",
          markets: ["Bengaluru"],
          objectiveTypes: ["site_visit"],
          brandProfileVersions: [prepared.brandProfileVersion]
        }
      });
      const incompatible = await client.seedBlueprintLibraryEntry({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        title: "Retail launch structure",
        status: "ready",
        compatibility: {
          industry: "retail",
          markets: ["Mumbai"],
          objectiveTypes: ["launch"],
          brandProfileVersions: [prepared.brandProfileVersion]
        }
      });
      const crossWorkspace = await client.seedBlueprintLibraryEntry({
        workspaceId: other.workspaceId,
        brandProfileId: other.brandProfileId,
        title: "Other workspace structure",
        status: "ready",
        compatibility: {
          industry: "real_estate",
          markets: ["Bengaluru"],
          objectiveTypes: ["site_visit"],
          brandProfileVersions: [other.brandProfileVersion]
        }
      });

      const baseInput = {
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        brandProfileVersion: prepared.brandProfileVersion,
        path: "existing_blueprint",
        objectiveType: "site_visit",
        objective: "Create a site-visit short for Aster Heights."
      };
      const staleBrand = await client.createBlueprintRequest({
        ...baseInput,
        brandProfileVersion: prepared.brandProfileVersion - 1,
        blueprintLibraryEntryId: incompatible.body.entry.id
      });
      const archivedSelection = await client.createBlueprintRequest({
        ...baseInput,
        blueprintLibraryEntryId: archived.body.entry.id
      });
      const incompatibleSelection = await client.createBlueprintRequest({
        ...baseInput,
        blueprintLibraryEntryId: incompatible.body.entry.id
      });
      const crossWorkspaceSelection = await client.createBlueprintRequest({
        ...baseInput,
        blueprintLibraryEntryId: crossWorkspace.body.entry.id
      });

      assert.equal(staleBrand.status, 409);
      assert.equal(staleBrand.body.code, "RESOURCE_VERSION_STALE");
      assert.equal(archivedSelection.status, 409);
      assert.equal(archivedSelection.body.code, "BLUEPRINT_INCOMPATIBLE");
      assert.equal(incompatibleSelection.status, 409);
      assert.equal(incompatibleSelection.body.code, "BLUEPRINT_INCOMPATIBLE");
      assert.equal(crossWorkspaceSelection.status, 404);
      assert.equal(crossWorkspaceSelection.body.code, "WORKSPACE_ACCESS_DENIED");
    }
  );
});

async function prepareApprovedBrand(client) {
  const created = await client.createWorkspace(
    { name: `P1 ${randomUUID().slice(0, 8)}` },
    { idempotencyKey: `p1-workspace-${randomUUID()}` }
  );
  const workspaceId = created.body.workspace.id;
  const crawl = await client.createBrandCrawlRun(
    {
      workspaceId,
      websiteUrl: "https://aster.example.com/projects/",
      rightsAcknowledged: true,
      crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
    },
    { idempotencyKey: `p1-crawl-${randomUUID()}` }
  );
  const approved = await client.approveBrandProfile(randomUUID(), approvalPayload(workspaceId, crawl.body.crawlRun.id, 0));
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
  return {
    workspaceId,
    brandProfileId: approved.body.profile.id,
    brandProfileVersion: approved.body.profile.version
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
