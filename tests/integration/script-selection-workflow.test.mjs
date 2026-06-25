import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareReadyTournament } from "../helpers/script-tournament-fixtures.mjs";
import { deriveWorkflowState } from "../../apps/web/src/script-tournament-workflow.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

// The web workflow module is DOM-agnostic, so it can be driven against the real
// API the same way the browser glue drives it. These tests prove the workflow
// produces the right empty/ready/success/stale/invalid/already-selected states
// from real API responses, not just from hand-built fixtures.

test("workflow renders 10-20 ready variants from a real tournament and marks refused variants disabled", async () => {
  await withApiServer(
    { APP_ENV: "test", APP_VERSION: "test", SUPABASE_JWT_SECRET: jwtSecret, V0_INTERNAL_WORKER_TOKEN: workerToken },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("workflow-ready") });
      const ready = await prepareReadyTournament(client, "Workflow ready", { variantCount: 12 });

      const state = deriveWorkflowState({
        phase: "ready",
        tournament: ready.tournament.body.tournament,
        variants: ready.tournament.body.variants,
        evaluations: ready.tournament.body.evaluations
      });
      assert.equal(state.banner.state, "ready");
      assert.ok(state.variants.length >= 10 && state.variants.length <= 20);
      assert.ok(state.variants.every((card) => card.eligibility === "eligible"));

      const mixed = await prepareReadyTournament(client, "Workflow mixed", { variantCount: 12, simulatorMode: "mixed_valid" });
      const mixedState = deriveWorkflowState({
        phase: "ready",
        tournament: mixed.tournament.body.tournament,
        variants: mixed.tournament.body.variants,
        evaluations: mixed.tournament.body.evaluations
      });
      assert.ok(mixedState.variants.some((card) => card.eligibility === "disabled"), "expected refused variants to be disabled");
    }
  );
});

test("workflow renders success from a real selection and never implies generation approval", async () => {
  await withApiServer(
    { APP_ENV: "test", APP_VERSION: "test", SUPABASE_JWT_SECRET: jwtSecret, V0_INTERNAL_WORKER_TOKEN: workerToken },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("workflow-select") });
      const ready = await prepareReadyTournament(client, "Workflow select", { variantCount: 10 });
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
        { idempotencyKey: `workflow-select-${randomUUID()}` }
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));

      const state = deriveWorkflowState({
        phase: "selected",
        tournament: response.body.tournament,
        variants: ready.variants,
        evaluations: ready.evaluations,
        selectionResponse: response.body
      });
      assert.equal(state.banner.state, "success");
      assert.equal(state.selectedScript.immutable, true);
      assert.equal(state.selectedScript.variantId, target.id);
      assert.ok(!/generation approval|credit reservation/i.test(state.banner.text), "selection must not imply generation approval");
    }
  );
});

test("workflow renders stale, invalid and already-selected from real selection failures", async () => {
  await withApiServer(
    { APP_ENV: "test", APP_VERSION: "test", SUPABASE_JWT_SECRET: jwtSecret, V0_INTERNAL_WORKER_TOKEN: workerToken },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("workflow-failures") });
      const ready = await prepareReadyTournament(client, "Workflow failures", { variantCount: 12, simulatorMode: "mixed_valid" });

      const staleResponse = await client.selectScriptVariant(
        ready.tournamentId,
        {
          workspaceId: ready.workspaceId,
          tournamentId: ready.tournamentId,
          variantId: ready.variants[0].id,
          optimisticTournamentVersion: "stale-version-token"
        },
        { idempotencyKey: `workflow-stale-${randomUUID()}` }
      );
      assert.equal(staleResponse.body.code, "RESOURCE_VERSION_STALE");
      assert.equal(
        deriveWorkflowState({ phase: "selection-error", tournament: ready.tournament.body.tournament, variants: ready.variants, evaluations: ready.evaluations, error: staleResponse.body }).banner.state,
        "stale"
      );

      const refused = ready.variants.find((variant) => variant.status === "policy_refused");
      assert.ok(refused, "expected a policy-refused variant");
      const invalidResponse = await client.selectScriptVariant(
        ready.tournamentId,
        {
          workspaceId: ready.workspaceId,
          tournamentId: ready.tournamentId,
          variantId: refused.id,
          optimisticTournamentVersion: ready.optimisticTournamentVersion
        },
        { idempotencyKey: `workflow-invalid-${randomUUID()}` }
      );
      assert.equal(invalidResponse.body.code, "SCRIPT_SELECTION_INVALID");
      assert.equal(
        deriveWorkflowState({ phase: "selection-error", tournament: ready.tournament.body.tournament, variants: ready.variants, evaluations: ready.evaluations, error: invalidResponse.body }).banner.state,
        "invalid"
      );

      const eligible = ready.variants.find((variant) => variant.status === "generated");
      assert.ok(eligible, "expected a generated variant for the success selection");
      const first = await client.selectScriptVariant(
        ready.tournamentId,
        {
          workspaceId: ready.workspaceId,
          tournamentId: ready.tournamentId,
          variantId: eligible.id,
          optimisticTournamentVersion: ready.optimisticTournamentVersion
        },
        { idempotencyKey: `workflow-first-${randomUUID()}` }
      );
      assert.equal(first.status, 200, JSON.stringify(first.body));
      const second = await client.selectScriptVariant(
        ready.tournamentId,
        {
          workspaceId: ready.workspaceId,
          tournamentId: ready.tournamentId,
          variantId: eligible.id,
          optimisticTournamentVersion: ready.optimisticTournamentVersion
        },
        { idempotencyKey: `workflow-second-${randomUUID()}` }
      );
      assert.equal(second.body.code, "SCRIPT_ALREADY_SELECTED");
      assert.equal(
        deriveWorkflowState({ phase: "selection-error", tournament: ready.tournament.body.tournament, variants: ready.variants, evaluations: ready.evaluations, error: second.body }).banner.state,
        "already-selected"
      );
    }
  );
});

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
