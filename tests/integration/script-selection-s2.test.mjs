import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

// V0-S2 first failing behaviour: a stale, unevaluated, rejected, superseded or
// cross-workspace variant can be selected for generation.

test("S2 selects one immutable script version and exposes audit and bucketed analytics", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s2-select") });
      const ready = await prepareReadyTournament(client, "S2 select", { variantCount: 12 });

      const target = ready.variants[0];
      const response = await client.selectScriptVariant(
        ready.tournamentId,
        {
          workspaceId: ready.workspaceId,
          tournamentId: ready.tournamentId,
          variantId: target.id,
          optimisticTournamentVersion: ready.optimisticTournamentVersion,
          humanOverride: false
        },
        { idempotencyKey: `s2-select-${randomUUID()}` }
      );

      assert.equal(response.status, 200, JSON.stringify(response.body));
      const selected = response.body.selectedScript;
      assert.ok(selected.id);
      assert.equal(selected.workspaceId, ready.workspaceId);
      assert.equal(selected.tournamentId, ready.tournamentId);
      assert.equal(selected.variantId, target.id);
      assert.equal(selected.approverUserId, "s2-select");
      assert.equal(selected.version, 1);
      assert.equal(selected.humanOverride, false);
      assert.ok(selected.createdAt);
      assert.equal(selected.immutable, true);

      assert.equal(response.body.tournament.id, ready.tournamentId);
      assert.equal(response.body.tournament.status, "selected");
      assert.equal(response.body.tournament.result, "ready_for_selection");
      assert.equal(response.body.variant.id, target.id);
      assert.equal(response.body.evaluation.variantId, target.id);

      assert.equal(response.body.audit.eventType, "script.selected");
      assert.equal(response.body.audit.targetType, "SelectedScript");
      assert.equal(response.body.audit.targetId, selected.id);
      assert.equal(response.body.audit.actorUserId, "s2-select");

      assert.equal(response.body.analytics.length, 1);
      assert.equal(response.body.analytics[0].eventType, "script_selected");
      assert.ok(response.body.analytics[0].properties.variant_rank_bucket);
      assert.equal(typeof response.body.analytics[0].properties.human_overrode_top_score, "boolean");

      // Selection never implies generation approval or credit reservation.
      const json = JSON.stringify(response.body);
      assert.ok(!/credit reservation/i.test(json), "selection must not imply credit reservation");
      assert.ok(!/generation approved/i.test(json), "selection must not imply generation approval");

      // Raw script text never enters analytics.
      assert.ok(!JSON.stringify(response.body.analytics).includes(target.body), "raw script body leaked into analytics");
    }
  );
});

test("S2 rejects a stale comparison tab with an optimistic-version guard", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s2-stale") });
      const ready = await prepareReadyTournament(client, "S2 stale", { variantCount: 10 });

      const stale = await client.selectScriptVariant(
        ready.tournamentId,
        {
          workspaceId: ready.workspaceId,
          tournamentId: ready.tournamentId,
          variantId: ready.variants[0].id,
          optimisticTournamentVersion: "stale-version-token"
        },
        { idempotencyKey: `s2-stale-${randomUUID()}` }
      );
      assert.equal(stale.status, 409, JSON.stringify(stale.body));
      assert.equal(stale.body.code, "RESOURCE_VERSION_STALE");
    }
  );
});

test("S2 rejects an unevaluated, refused or superseded variant within a ready tournament", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s2-refused") });
      // mixed_valid keeps >=10 valid variants but retains two policy-refused variants,
      // so the tournament reaches ready_for_selection with rejected variants still present.
      const ready = await prepareReadyTournament(client, "S2 refused", { variantCount: 12, simulatorMode: "mixed_valid" });
      const refused = ready.variants.find((variant) => variant.status === "policy_refused");
      assert.ok(refused, "expected a policy-refused variant in the ready tournament");

      const response = await client.selectScriptVariant(
        ready.tournamentId,
        {
          workspaceId: ready.workspaceId,
          tournamentId: ready.tournamentId,
          variantId: refused.id,
          optimisticTournamentVersion: ready.optimisticTournamentVersion
        },
        { idempotencyKey: `s2-refused-${randomUUID()}` }
      );
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.code, "SCRIPT_SELECTION_INVALID");

      // A variant that does not belong to this tournament is superseded/foreign.
      const foreign = await client.selectScriptVariant(
        ready.tournamentId,
        {
          workspaceId: ready.workspaceId,
          tournamentId: ready.tournamentId,
          variantId: randomUUID(),
          optimisticTournamentVersion: ready.optimisticTournamentVersion
        },
        { idempotencyKey: `s2-foreign-${randomUUID()}` }
      );
      assert.equal(foreign.status, 409, JSON.stringify(foreign.body));
      assert.equal(foreign.body.code, "SCRIPT_SELECTION_INVALID");
    }
  );
});

test("S2 is idempotent: retries return the same immutable selection", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s2-idem") });
      const ready = await prepareReadyTournament(client, "S2 idem", { variantCount: 10 });
      const idempotencyKey = `s2-idem-${randomUUID()}`;
      const body = {
        workspaceId: ready.workspaceId,
        tournamentId: ready.tournamentId,
        variantId: ready.variants[0].id,
        optimisticTournamentVersion: ready.optimisticTournamentVersion
      };

      const first = await client.selectScriptVariant(ready.tournamentId, body, { idempotencyKey });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      const repeat = await client.selectScriptVariant(ready.tournamentId, body, { idempotencyKey });
      assert.equal(repeat.status, 200, JSON.stringify(repeat.body));
      assert.equal(repeat.body.selectedScript.id, first.body.selectedScript.id);
      assert.equal(repeat.body.selectedScript.version, 1);
    }
  );
});

test("S2 refuses a second genuine selection attempt with SCRIPT_ALREADY_SELECTED", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s2-already") });
      const ready = await prepareReadyTournament(client, "S2 already", { variantCount: 10 });
      const body = {
        workspaceId: ready.workspaceId,
        tournamentId: ready.tournamentId,
        variantId: ready.variants[0].id,
        optimisticTournamentVersion: ready.optimisticTournamentVersion
      };

      const first = await client.selectScriptVariant(ready.tournamentId, body, { idempotencyKey: `s2-already-1-${randomUUID()}` });
      assert.equal(first.status, 200, JSON.stringify(first.body));

      const second = await client.selectScriptVariant(ready.tournamentId, body, { idempotencyKey: `s2-already-2-${randomUUID()}` });
      assert.equal(second.status, 409, JSON.stringify(second.body));
      assert.equal(second.body.code, "SCRIPT_ALREADY_SELECTED");
    }
  );
});

test("S2 hides cross-workspace selection behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const ownerClient = new V0Client({ baseUrl, authToken: signJwt("s2-owner") });
      const owner = await prepareReadyTournament(ownerClient, "S2 owner", { variantCount: 10 });

      const foreignClient = new V0Client({ baseUrl, authToken: signJwt("s2-foreign") });
      const foreignWorkspace = await foreignClient.createWorkspace(
        { name: `S2 foreign ${randomUUID().slice(0, 8)}` },
        { idempotencyKey: `s2-foreign-ws-${randomUUID()}` }
      );
      assert.equal(foreignWorkspace.status, 201, JSON.stringify(foreignWorkspace.body));

      const response = await foreignClient.selectScriptVariant(
        owner.tournamentId,
        {
          workspaceId: foreignWorkspace.body.workspace.id,
          tournamentId: owner.tournamentId,
          variantId: owner.variants[0].id,
          optimisticTournamentVersion: owner.optimisticTournamentVersion
        },
        { idempotencyKey: `s2-cross-${randomUUID()}` }
      );
      assert.equal(response.status, 404, JSON.stringify(response.body));
      assert.equal(response.body.code, "WORKSPACE_ACCESS_DENIED");
    }
  );
});

test("S2 requires an idempotency key for selection", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s2-key") });
      const ready = await prepareReadyTournament(client, "S2 key", { variantCount: 10 });

      const missing = await client.selectScriptVariant(ready.tournamentId, {
        workspaceId: ready.workspaceId,
        tournamentId: ready.tournamentId,
        variantId: ready.variants[0].id,
        optimisticTournamentVersion: ready.optimisticTournamentVersion
      });
      assert.equal(missing.status, 400, JSON.stringify(missing.body));
      assert.equal(missing.body.code, "IDEMPOTENCY_KEY_REQUIRED");
    }
  );
});

async function prepareReadyTournament(client, label, { variantCount = 10, simulatorMode = "fixture_success" } = {}) {
  const approved = await prepareApprovedBrand(client, label);
  const request = await client.createBlueprintRequest({
    workspaceId: approved.workspaceId,
    brandProfileId: approved.brandProfileId,
    brandProfileVersion: approved.brandProfileVersion,
    path: "default_formula",
    objectiveType: "site_visit",
    objective: "Create a site-visit short for Aster Heights."
  });
  assert.equal(request.status, 202, JSON.stringify(request.body));
  const readyBlueprint = await client.createReadyBlueprint(request.body.request.id, {
    workspaceId: approved.workspaceId,
    sourceType: "default_formula"
  });
  assert.equal(readyBlueprint.status, 202, JSON.stringify(readyBlueprint.body));
  const tournament = await client.createScriptTournament(
    {
      workspaceId: approved.workspaceId,
      blueprintRequestId: request.body.request.id,
      variantCount,
      simulatorMode
    },
    { idempotencyKey: `s2-tournament-${randomUUID()}` }
  );
  assert.equal(tournament.status, 202, JSON.stringify(tournament.body));
  assert.equal(tournament.body.tournament.status, "ready_for_selection");
  return {
    workspaceId: approved.workspaceId,
    tournamentId: tournament.body.tournament.id,
    optimisticTournamentVersion: tournament.body.tournament.updatedAt,
    variants: tournament.body.variants
  };
}

async function prepareApprovedBrand(client, label) {
  const created = await client.createWorkspace(
    { name: `${label} ${randomUUID().slice(0, 8)}` },
    { idempotencyKey: `s2-workspace-${randomUUID()}` }
  );
  const workspaceId = created.body.workspace.id;
  const crawl = await client.createBrandCrawlRun(
    {
      workspaceId,
      websiteUrl: "https://aster.example.com/projects/",
      rightsAcknowledged: true,
      crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
    },
    { idempotencyKey: `s2-crawl-${randomUUID()}` }
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
