import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

// V0-S1 first failing behaviour: the tournament advances with fewer than 10 valid
// scripts, prohibited claims, schema-invalid output or missing evaluations.

test("S1 generates 10-20 evaluated variants and exposes provenance, telemetry and bucketed analytics", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s1-manager") });
      const ready = await prepareReadyBlueprint(client, "S1 journey");

      const response = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          variantCount: 12,
          simulatorMode: "fixture_success"
        },
        { idempotencyKey: `s1-journey-${randomUUID()}` }
      );

      assert.equal(response.status, 202, JSON.stringify(response.body));
      const tournament = response.body.tournament;
      assert.equal(tournament.status, "ready_for_selection");
      assert.equal(tournament.result, "ready_for_selection");
      assert.equal(tournament.requestedVariantCount, 12);
      assert.equal(tournament.validVariantCount, 12);
      assert.equal(tournament.brandProfileId, ready.brandProfileId);
      assert.equal(tournament.brandProfileVersion, ready.brandProfileVersion);
      assert.equal(tournament.blueprintRequestId, ready.blueprintRequestId);
      assert.ok(tournament.blueprintLibraryEntryId);
      assert.ok(tournament.formulaDerivationId);
      assert.ok(tournament.directorPromptId);
      assert.equal(tournament.promptVersion, "v0.director-prompt.1");
      assert.equal(tournament.modelVersion, "v0.script-model.1");
      assert.ok(tournament.telemetry.tokenBucket);
      assert.ok(tournament.telemetry.costBucket);

      assert.equal(response.body.variants.length, 12);
      assert.equal(response.body.evaluations.length, 12);
      for (const variant of response.body.variants) {
        assert.ok(variant.id);
        assert.ok(["generated"].includes(variant.status), variant.status);
        assert.ok(variant.hookType);
        assert.ok(variant.hook.length > 0);
        assert.ok(variant.body.length > 0);
        assert.ok(variant.cta.length > 0);
        assert.ok(variant.captions.length > 0);
        assert.ok(Array.isArray(variant.claims));
        assert.ok(variant.cadence);
        assert.deepEqual(variant.formulaSlots.sort(), ["cta", "hook", "offer", "proof"]);
        assert.equal(variant.provenance.promptVersion, "v0.director-prompt.1");
        assert.equal(variant.provenance.modelVersion, "v0.script-model.1");
        assert.match(variant.provenance.sourceHash, /^[0-9a-f]{64}$/);
      }
      for (const evaluation of response.body.evaluations) {
        assert.equal(evaluation.status, "evaluated");
        assert.ok(evaluation.hookStrength);
        assert.ok(evaluation.timing);
        assert.ok(evaluation.patternInterrupts);
        assert.ok(evaluation.cta);
        assert.ok(evaluation.claims);
        assert.ok(evaluation.captions);
        assert.ok(evaluation.tone);
        assert.ok(Array.isArray(evaluation.formulaChecks));
        assert.ok(Array.isArray(evaluation.policyChecks));
        assert.ok(Array.isArray(evaluation.brandRuleChecks));
        assert.equal(typeof evaluation.modelScore, "number");
        assert.equal(evaluation.humanScore, null);
        assert.ok(evaluation.explanation.length > 0);
      }

      assert.deepEqual(
        response.body.jobs.map((job) => job.type),
        ["script_tournament"]
      );
      assert.equal(response.body.jobs[0].status, "SUCCEEDED");
      assert.equal(response.body.audit.eventType, "script.tournament.created");

      // Analytics exposes buckets only; raw prompts and script text never enter analytics.
      const analytics = response.body.analytics;
      assert.equal(analytics[0].eventType, "script_tournament_started");
      assert.equal(analytics[0].properties.requestedVariantBucket, "10-12");
      assert.ok(analytics[0].properties.objectiveCategory);
      assert.equal(analytics[1].eventType, "script_tournament_completed");
      assert.equal(analytics[1].properties.validVariantCountBucket, "10-12");
      assert.equal(analytics[1].properties.result, "ready_for_selection");
      assert.ok(analytics[1].properties.durationBucket);
      const analyticsJson = JSON.stringify(analytics);
      for (const variant of response.body.variants) {
        assert.ok(!analyticsJson.includes(variant.body), "raw script body leaked into analytics");
        assert.ok(!analyticsJson.includes(variant.hook), "raw hook leaked into analytics");
      }
      assert.ok(!analyticsJson.includes(ready.directorPrompt), "raw director prompt leaked into analytics");
    }
  );
});

test("S1 enforces the 10-20 variant-count boundary", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s1-boundary") });
      const ready = await prepareReadyBlueprint(client, "S1 boundary");

      const upper = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          variantCount: 20,
          simulatorMode: "fixture_success"
        },
        { idempotencyKey: `s1-upper-${randomUUID()}` }
      );
      assert.equal(upper.status, 202, JSON.stringify(upper.body));
      assert.equal(upper.body.tournament.requestedVariantCount, 20);
      assert.equal(upper.body.variants.length, 20);

      const tooFew = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          variantCount: 9,
          simulatorMode: "fixture_success"
        },
        { idempotencyKey: `s1-few-${randomUUID()}` }
      );
      assert.equal(tooFew.status, 422, JSON.stringify(tooFew.body));
      assert.equal(tooFew.body.code, "VALIDATION_FAILED");

      const tooMany = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          variantCount: 21,
          simulatorMode: "fixture_success"
        },
        { idempotencyKey: `s1-many-${randomUUID()}` }
      );
      assert.equal(tooMany.status, 422, JSON.stringify(tooMany.body));
      assert.equal(tooMany.body.code, "VALIDATION_FAILED");

      const defaulted = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          simulatorMode: "fixture_success"
        },
        { idempotencyKey: `s1-default-${randomUUID()}` }
      );
      assert.equal(defaulted.status, 202, JSON.stringify(defaulted.body));
      assert.equal(defaulted.body.tournament.requestedVariantCount, 10);
      assert.equal(defaulted.body.variants.length, 10);
    }
  );
});

test("S1 does not advance when fewer than 10 valid scripts remain after prohibited claims", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s1-claims") });
      const ready = await prepareReadyBlueprint(client, "S1 claims");

      const response = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          variantCount: 12,
          simulatorMode: "insufficient_valid"
        },
        { idempotencyKey: `s1-claims-${randomUUID()}` }
      );

      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.code, "SCRIPT_VARIANT_COUNT_INSUFFICIENT");
      assert.equal(response.body.tournamentId, response.body.tournamentId);
      assert.ok(response.body.validVariantCount < 10, response.body.validVariantCount);
      assert.equal(response.body.result, "insufficient_valid");
      assert.ok(Array.isArray(response.body.variants));
      assert.ok(response.body.variants.some((variant) => variant.status === "policy_refused"));
      for (const variant of response.body.variants) {
        if (variant.status === "policy_refused") {
          assert.ok(variant.claims.some((claim) => /guaranteed appreciation/i.test(claim)), JSON.stringify(variant.claims));
        }
      }
    }
  );
});

test("S1 refuses to advance on AI request refusal and schema-invalid simulator output", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s1-refused") });
      const ready = await prepareReadyBlueprint(client, "S1 refused");

      const refused = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          variantCount: 10,
          simulatorMode: "ai_refused"
        },
        { idempotencyKey: `s1-refused-${randomUUID()}` }
      );
      assert.equal(refused.status, 422, JSON.stringify(refused.body));
      assert.equal(refused.body.code, "AI_REQUEST_REFUSED");
      assert.equal(refused.body.result, "ai_request_refused");
      assert.equal(refused.body.validVariantCount, 0);

      const malformed = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          variantCount: 10,
          simulatorMode: "malformed"
        },
        { idempotencyKey: `s1-malformed-${randomUUID()}` }
      );
      assert.equal(malformed.status, 422, JSON.stringify(malformed.body));
      assert.equal(malformed.body.code, "AI_OUTPUT_SCHEMA_INVALID");
      assert.equal(malformed.body.result, "schema_invalid");
      assert.equal(malformed.body.validVariantCount, 0);
    }
  );
});

test("S1 blocks unapproved brand profiles and draft blueprints from script generation", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s1-guard") });
      const approved = await prepareApprovedBrand(client, "S1 guard");
      const draftRequest = await client.createBlueprintRequest({
        workspaceId: approved.workspaceId,
        brandProfileId: approved.brandProfileId,
        brandProfileVersion: approved.brandProfileVersion,
        path: "default_formula",
        objectiveType: "site_visit",
        objective: "Create a site-visit short for Aster Heights."
      });
      assert.equal(draftRequest.status, 202, JSON.stringify(draftRequest.body));

      const draftTournament = await client.createScriptTournament(
        {
          workspaceId: approved.workspaceId,
          blueprintRequestId: draftRequest.body.request.id,
          variantCount: 10,
          simulatorMode: "fixture_success"
        },
        { idempotencyKey: `s1-draft-${randomUUID()}` }
      );
      assert.equal(draftTournament.status, 409, JSON.stringify(draftTournament.body));
      assert.equal(draftTournament.body.code, "BLUEPRINT_STAGE_INCOMPLETE");

      const foreign = await client.createScriptTournament(
        {
          workspaceId: approved.workspaceId,
          blueprintRequestId: randomUUID(),
          variantCount: 10,
          simulatorMode: "fixture_success"
        },
        { idempotencyKey: `s1-foreign-${randomUUID()}` }
      );
      assert.equal(foreign.status, 404, JSON.stringify(foreign.body));
      assert.equal(foreign.body.code, "WORKSPACE_ACCESS_DENIED");
    }
  );
});

test("S1 requires an idempotency key and deduplicates tournament creation", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("s1-idem") });
      const ready = await prepareReadyBlueprint(client, "S1 idem");

      const missingKey = await client.createScriptTournament({
        workspaceId: ready.workspaceId,
        blueprintRequestId: ready.blueprintRequestId,
        variantCount: 10,
        simulatorMode: "fixture_success"
      });
      assert.equal(missingKey.status, 400, JSON.stringify(missingKey.body));
      assert.equal(missingKey.body.code, "IDEMPOTENCY_KEY_REQUIRED");

      const idempotencyKey = `s1-idem-${randomUUID()}`;
      const first = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          variantCount: 10,
          simulatorMode: "fixture_success"
        },
        { idempotencyKey }
      );
      assert.equal(first.status, 202, JSON.stringify(first.body));
      const repeat = await client.createScriptTournament(
        {
          workspaceId: ready.workspaceId,
          blueprintRequestId: ready.blueprintRequestId,
          variantCount: 10,
          simulatorMode: "fixture_success"
        },
        { idempotencyKey }
      );
      assert.equal(repeat.status, 202, JSON.stringify(repeat.body));
      assert.equal(repeat.body.tournament.id, first.body.tournament.id);
    }
  );
});

async function prepareReadyBlueprint(client, label) {
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
  return {
    ...approved,
    blueprintRequestId: request.body.request.id,
    directorPrompt: readyBlueprint.body.directorPrompt.prompt
  };
}

async function prepareApprovedBrand(client, label) {
  const created = await client.createWorkspace(
    { name: `${label} ${randomUUID().slice(0, 8)}` },
    { idempotencyKey: `s1-workspace-${randomUUID()}` }
  );
  const workspaceId = created.body.workspace.id;
  const crawl = await client.createBrandCrawlRun(
    {
      workspaceId,
      websiteUrl: "https://aster.example.com/projects/",
      rightsAcknowledged: true,
      crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
    },
    { idempotencyKey: `s1-crawl-${randomUUID()}` }
  );
  const approved = await client.approveBrandProfile(crawl.body.brand.id, approvalPayload(workspaceId, crawl.body.crawlRun.id, 0));
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
