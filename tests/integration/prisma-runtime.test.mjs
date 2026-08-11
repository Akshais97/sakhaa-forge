import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { loadApiEnv } from "../helpers/env.mjs";
import { uploadInitiatedArtifact, withApiServer } from "../helpers/server.mjs";
import { prepareReadyTournament, prepareApprovedBrand } from "../helpers/script-tournament-fixtures.mjs";
import { prepareRenderedFinalVideo, prepareApprovedFinalVideo } from "../helpers/review-fixtures.mjs";
import { prepareCompleteApprovedFinalVideo } from "../helpers/lineage-fixtures.mjs";
import { runReferenceJourney } from "../helpers/reference-journey-fixtures.mjs";
import {
  AE_PLAN_SCHEMA_VERSION,
  DEFAULT_AE_CAPABILITY_VERSION
} from "../../apps/api/src/ae-capability-registry.mjs";
import { AE_RENDER_SCHEMA_VERSION } from "../../apps/api/src/ae-render-provider.mjs";

const jwtSecret = "test-supabase-jwt-secret";

test("prisma runtime persists workspace and idempotency records in Supabase", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime write proof.");
  }

  const userId = randomUUID();
  const workspaceName = `Runtime Proof ${Date.now()}`;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const otherClient = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });

      const created = await client.createWorkspace(
        { name: workspaceName },
        { idempotencyKey: `runtime-workspace-${userId}` }
      );
      const replayed = await client.createWorkspace(
        { name: workspaceName },
        { idempotencyKey: `runtime-workspace-${userId}` }
      );
      const conflicted = await client.createWorkspace(
        { name: `${workspaceName} changed` },
        { idempotencyKey: `runtime-workspace-${userId}` }
      );
      const listed = await client.listWorkspaces();

      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(replayed.status, 201);
      assert.deepEqual(replayed.body, created.body);
      assert.equal(conflicted.status, 409);
      assert.equal(conflicted.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
      assert.equal(listed.status, 200);
      assert.deepEqual(
        listed.body.workspaces.map((workspace) => workspace.name),
        [workspaceName]
      );

      const persisted = queryScalar(
        env.DIRECT_DATABASE_URL || env.DATABASE_URL,
        `
          SELECT count(*)
          FROM users u
          JOIN memberships m ON m.user_id = u.id
          JOIN workspaces w ON w.id = m.workspace_id
          JOIN idempotency_records ir ON ir.actor_user_id = u.id
          WHERE u.id = '${userId}'::uuid
            AND w.name = '${workspaceName.replaceAll("'", "''")}'
            AND ir.operation = 'workspace.create'
        `
      );

      assert.equal(persisted, "1");

      const artifactBytes = `runtime-artifact-${userId}`;
      const hash = sha256(artifactBytes);
      const initiated = await client.initiateBrandAssetUpload(
        {
          workspaceId: created.body.workspace.id,
          fileName: "runtime-logo.png",
          contentType: "image/png",
          byteSize: Buffer.byteLength(artifactBytes),
          sha256: hash
        },
        { idempotencyKey: `runtime-artifact-${userId}` }
      );
      await uploadInitiatedArtifact(baseUrl, initiated, artifactBytes);
      const completed = await client.completeBrandAssetUpload(initiated.body.artifact.id, {
        workspaceId: created.body.workspace.id,
        byteSize: Buffer.byteLength(artifactBytes),
        sha256: hash
      });
      const download = await client.createArtifactDownload(initiated.body.artifact.id, {
        workspaceId: created.body.workspace.id
      });
      const crossTenant = await otherClient.createArtifactDownload(initiated.body.artifact.id, {
        workspaceId: created.body.workspace.id
      });
      const artifactState = queryScalar(
        env.DIRECT_DATABASE_URL || env.DATABASE_URL,
        `
          SELECT status::text || ':' || retention_class
          FROM artifacts
          WHERE id = '${initiated.body.artifact.id}'::uuid
            AND workspace_id = '${created.body.workspace.id}'::uuid
        `
      );

      assert.equal(initiated.status, 201);
      assert.equal(completed.status, 200);
      assert.equal(download.status, 200);
      assert.equal(crossTenant.status, 404);
      assert.equal(crossTenant.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(artifactState, "CLEAN:clean-media");

      const worker = new V0Client({ baseUrl, internalWorkerToken: "runtime-worker-token" });
      const startedJob = await client.startSimulatedMediaProcessing(
        {
          workspaceId: created.body.workspace.id,
          inputArtifactId: initiated.body.artifact.id,
          outputFileName: "runtime-processed.mp4"
        },
        { idempotencyKey: `runtime-job-${userId}` }
      );
      assert.equal(startedJob.status, 202, JSON.stringify(startedJob.body));
      const relayLoss = await worker.relayOutbox({ mode: "redis_unavailable" });
      const relayRecovered = await worker.relayOutbox({ mode: "ok" });
      const claimedJob = await worker.claimJob(startedJob.body.job.id, { resourceClass: "CPU" });
      const heartbeat = await worker.heartbeatJob(startedJob.body.job.id, {
        leaseToken: claimedJob.body.attempt.leaseToken
      });
      const completedJob = await worker.completeJob(startedJob.body.job.id, {
        leaseToken: claimedJob.body.attempt.leaseToken,
        workspaceId: created.body.workspace.id,
        fileName: "runtime-processed.mp4",
        contentType: "video/mp4",
        byteSize: 40,
        sha256: sha256(`runtime-processed-${userId}`),
        objectKey: `clean-media/${created.body.workspace.id}/runtime-processed.mp4`,
        schemaVersion: "simulated.media.output.v1"
      });
      const jobEvidence = queryScalar(
        env.DIRECT_DATABASE_URL || env.DATABASE_URL,
        `
          SELECT j.status::text || ':' || count(DISTINCT je.id)::text || ':' || count(DISTINCT o.id)::text
          FROM jobs j
          LEFT JOIN job_events je ON je.job_id = j.id
          LEFT JOIN outbox_events o ON o.aggregate_id = j.id AND o.status = 'PUBLISHED'
          WHERE j.id = '${startedJob.body.job.id}'::uuid
          GROUP BY j.status
        `
      );

      assert.equal(relayLoss.status, 503);
      assert.equal(relayRecovered.status, 200);
      assert.equal(claimedJob.status, 200);
      assert.equal(heartbeat.status, 200);
      assert.equal(completedJob.status, 200, JSON.stringify(completedJob.body));
      assert.match(jobEvidence, /^SUCCEEDED:[1-9][0-9]*:1$/);
    }
  );
});

test("prisma runtime persists S1 script tournament and S2 selected script and is concurrency-safe", {
  timeout: 60000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime S1/S2 write proof.");
  }

  const userId = randomUUID();

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const ready = await prepareReadyTournament(client, "Runtime S1S2", { variantCount: 12 });

      // S1 persistence: tournament, variants and evaluations are retained under Prisma.
      const tournamentState = queryScalar(
        env.DIRECT_DATABASE_URL || env.DATABASE_URL,
        `
          SELECT status::text || ':' || valid_variant_count::text
          FROM script_tournaments
          WHERE id = '${ready.tournamentId}'::uuid
            AND workspace_id = '${ready.workspaceId}'::uuid
            AND created_by_user_id = '${userId}'::uuid
        `
      );
      assert.equal(tournamentState, "ready_for_selection:12");

      const variantEvaluationCounts = queryScalar(
        env.DIRECT_DATABASE_URL || env.DATABASE_URL,
        `
          SELECT count(DISTINCT v.id)::text || ':' || count(DISTINCT e.id)::text
          FROM script_variants v
          LEFT JOIN script_evaluations e ON e.variant_id = v.id
          WHERE v.tournament_id = '${ready.tournamentId}'::uuid
            AND v.workspace_id = '${ready.workspaceId}'::uuid
        `
      );
      assert.match(variantEvaluationCounts, /^12:12$/);

      const target = ready.variants[0];
      const selection = await client.selectScriptVariant(
        ready.tournamentId,
        {
          workspaceId: ready.workspaceId,
          tournamentId: ready.tournamentId,
          variantId: target.id,
          optimisticTournamentVersion: ready.optimisticTournamentVersion,
          humanOverride: false
        },
        { idempotencyKey: `runtime-s2-select-${userId}` }
      );
      assert.equal(selection.status, 200, JSON.stringify(selection.body));
      assert.equal(selection.body.selectedScript.approverUserId, userId);
      assert.equal(selection.body.selectedScript.immutable, true);

      // S2 persistence: one immutable selected_script with approver lineage and a
      // tournament advanced to selected. The approver FK to users(id) is enforced.
      const selectedEvidence = queryScalar(
        env.DIRECT_DATABASE_URL || env.DATABASE_URL,
        `
          SELECT ss.version::text || ':' || ss.human_override::text || ':' || st.status::text || ':' || count(*)::text
          FROM selected_scripts ss
          JOIN script_tournaments st ON st.id = ss.tournament_id
          WHERE ss.tournament_id = '${ready.tournamentId}'::uuid
            AND ss.workspace_id = '${ready.workspaceId}'::uuid
            AND ss.approver_user_id = '${userId}'::uuid
            AND ss.variant_id = '${target.id}'::uuid
          GROUP BY ss.version, ss.human_override, st.status
        `
      );
      assert.equal(selectedEvidence, "1:false:selected:1");

      // Concurrency proof: two reviewers select the same ready tournament at the
      // same time with different idempotency keys. The atomic claim keeps exactly
      // one selected_scripts row; the loser receives SCRIPT_ALREADY_SELECTED, not
      // a 500 or a duplicate.
      const raced = await prepareReadyTournament(client, "Runtime race", { variantCount: 10 });
      const raceBody = {
        workspaceId: raced.workspaceId,
        tournamentId: raced.tournamentId,
        variantId: raced.variants[0].id,
        optimisticTournamentVersion: raced.optimisticTournamentVersion
      };
      const [first, second] = await Promise.all([
        client.selectScriptVariant(raced.tournamentId, raceBody, { idempotencyKey: `runtime-race-a-${randomUUID()}` }),
        client.selectScriptVariant(raced.tournamentId, raceBody, { idempotencyKey: `runtime-race-b-${randomUUID()}` })
      ]);
      const statuses = [first.status, second.status].sort();
      assert.deepEqual(statuses, [200, 409], JSON.stringify([first.body, second.body]));
      const failed = first.status === 409 ? first : second;
      assert.equal(failed.body.code, "SCRIPT_ALREADY_SELECTED");

      const raceSelectedCount = queryScalar(
        env.DIRECT_DATABASE_URL || env.DATABASE_URL,
        `SELECT count(*)::text FROM selected_scripts WHERE tournament_id = '${raced.tournamentId}'::uuid`
      );
      assert.equal(raceSelectedCount, "1");
    }
  );
});

test("prisma runtime materializes V0-G1 avatar catalogue with derived consent eligibility", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G1 write proof.");
  }

  const userId = randomUUID();

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime G1");

      const listed = await client.listAvatars({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 50
      });
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      assert.ok(listed.body.items.length >= 5);
      // Consent evidence never reaches the public response.
      assert.equal(/evidence_ref|evidenceRef/i.test(JSON.stringify(listed.body)), false);

      const reasons = new Set(listed.body.items.map((avatar) => avatar.eligibility.reason));
      assert.ok(reasons.has("eligible"));
      assert.ok(reasons.has("consent_expired"));
      assert.ok(reasons.has("consent_revoked"));
      assert.ok(reasons.has("consent_required"));
      assert.ok(reasons.has("service_pending"));

      // Avatar profiles and consents are persisted under RLS with the workspace.
      // Six avatars materialize; five carry a consent record (the missing-evidence
      // avatar has none).
      const avatarState = queryScalar(
        env.DIRECT_DATABASE_URL || env.DATABASE_URL,
        `
          SELECT count(*)::text || ':' || count(c.id)::text
          FROM avatar_profiles p
          LEFT JOIN avatar_consents c ON c.avatar_profile_id = p.id
          WHERE p.workspace_id = '${prepared.workspaceId}'::uuid
            AND p.brand_profile_id = '${prepared.brandProfileId}'::uuid
        `
      );
      assert.equal(avatarState, "6:5");

      // A cross-workspace brand profile hides existence behind the same 404.
      const other = await prepareApprovedBrand(client, "Runtime G1 other");
      const cross = await client.listAvatars({
        workspaceId: prepared.workspaceId,
        brandProfileId: other.brandProfileId
      });
      assert.equal(cross.status, 404);
      assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    }
  );
});

test("prisma runtime enforces V0-G1 avatar consent at the generation estimate boundary and retains selection audit", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G1 estimate guard proof.");
  }

  const userId = randomUUID();

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime G1 estimate guard");

      const listed = await client.listAvatars({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 50
      });
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      const revoked = listed.body.items.find((avatar) => avatar.eligibility.reason === "consent_revoked");
      const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
      assert.ok(revoked, "expected a revoked-consent avatar");
      assert.ok(eligible, "expected an eligible avatar");

      // A revoked avatar cannot enter a generation estimate.
      const rejected = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: "31000000-0000-4000-8000-000000000001",
        avatarProfileId: revoked.id
      });
      assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
      assert.equal(rejected.body.code, "AVATAR_CONSENT_REVOKED");

      // An eligible avatar is accepted and binds a durable avatar.selected audit.
      const accepted = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: "31000000-0000-4000-8000-000000000001",
        avatarProfileId: eligible.id
      });
      assert.equal(accepted.status, 202, JSON.stringify(accepted.body));
      assert.equal(accepted.body.estimate.avatarProfileId, eligible.id);
      assert.equal(accepted.body.audit.eventType, "avatar.selected");
      assert.equal(accepted.body.audit.targetId, eligible.id);

      const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
      const eligibleAudit = queryScalar(
        db,
        `
          SELECT count(*)
          FROM audit_events
          WHERE workspace_id = '${prepared.workspaceId}'::uuid
            AND event_type = 'avatar.selected'
            AND target_id = '${eligible.id}'::uuid
        `
      );
      assert.equal(eligibleAudit, "1", "expected one selection audit row for the eligible avatar");

      // No audit row is retained for the rejected avatar.
      const rejectedAudit = queryScalar(
        db,
        `
          SELECT count(*)
          FROM audit_events
          WHERE workspace_id = '${prepared.workspaceId}'::uuid
            AND target_id = '${revoked.id}'::uuid
        `
      );
      assert.equal(rejectedAudit, "0", "no audit must be written for a rejected avatar");
    }
  );
});

test("prisma runtime persists V0-G2 verified credit purchase, append-only ledger and Owner adjustment under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G2 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });

      const created = await client.createWorkspace(
        { name: `Runtime G2 ${Date.now()}` },
        { idempotencyKey: `runtime-g2-ws-${userId}` }
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const workspaceId = created.body.workspace.id;

      const purchase = await client.createCreditPurchase(
        { workspaceId, provider: "razorpay", currency: "INR", amountMinor: 50000 },
        { idempotencyKey: `runtime-g2-purchase-${userId}` }
      );
      assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
      const walletId = purchase.body.wallet.id;

      // The simulator-signed callback transitions the purchase and writes the
      // PURCHASE ledger entry. The signing secret never appears in the response.
      const paid = await client.postRazorpayCallback(
        purchase.body.checkout.envelope,
        purchase.body.checkout.signature
      );
      assert.equal(paid.status, 200, JSON.stringify(paid.body));
      assert.equal(paid.body.purchase.status, "succeeded");
      assert.equal(paid.body.ledgerEntry.type, "PURCHASE");
      assert.equal(paid.body.wallet.balanceMinor, 50000);
      assert.equal(/secret|signature|card|cvv|pan/i.test(JSON.stringify(paid.body)), false);

      // Prisma persistence under RLS: wallet balance, succeeded purchase and one
      // PURCHASE ledger row are retained for this workspace.
      const walletBalance = queryScalar(
        db,
        `SELECT balance_minor::text FROM credit_wallets WHERE id = '${walletId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(walletBalance, "50000");

      const purchaseState = queryScalar(
        db,
        `SELECT status::text || ':' || amount_minor::text FROM credit_purchases WHERE workspace_id = '${workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid`
      );
      assert.equal(purchaseState, "SUCCEEDED:50000");

      const ledgerPurchase = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid AND type = 'PURCHASE'`
      );
      assert.equal(ledgerPurchase, "1");

      // A forged callback is rejected with PAYMENT_SIGNATURE_INVALID and writes no
      // ledger row; the second purchase stays initiated.
      const forgedPurchase = await client.createCreditPurchase(
        { workspaceId, provider: "razorpay", currency: "INR", amountMinor: 10000 },
        { idempotencyKey: `runtime-g2-forged-${userId}` }
      );
      const forged = await client.postRazorpayCallback(
        forgedPurchase.body.checkout.envelope,
        "deadbeef"
      );
      assert.equal(forged.status, 401);
      assert.equal(forged.body.code, "PAYMENT_SIGNATURE_INVALID");
      const ledgerAfterForgery = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid`
      );
      assert.equal(ledgerAfterForgery, "1", "a forged callback must not append a ledger row");

      // An Owner adjustment is a compensating append-only ADJUSTMENT entry that
      // debits the wallet. History is never edited.
      const adjustment = await client.createCreditAdjustment(
        walletId,
        { workspaceId, direction: "debit", amountMinor: 2000, currency: "INR", reason: "runtime over-credit correction" },
        { idempotencyKey: `runtime-g2-adj-${userId}` }
      );
      assert.equal(adjustment.status, 200, JSON.stringify(adjustment.body));
      assert.equal(adjustment.body.ledgerEntry.type, "ADJUSTMENT");
      assert.equal(adjustment.body.ledgerEntry.amountMinor, -2000);
      assert.equal(adjustment.body.wallet.balanceMinor, 48000);

      const ledgerOrder = queryScalar(
        db,
        `SELECT string_agg(type::text, ':' ORDER BY effective_at, id) FROM credit_ledger_entries WHERE workspace_id = '${workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid`
      );
      assert.equal(ledgerOrder, "PURCHASE:ADJUSTMENT", "ledger is append-only in effective order");
      const adjustedBalance = queryScalar(
        db,
        `SELECT balance_minor::text FROM credit_wallets WHERE id = '${walletId}'::uuid`
      );
      assert.equal(adjustedBalance, "48000");

      // A cross-workspace wallet ledger hides existence behind the same 404 and the
      // other workspace id never leaks.
      const otherCreated = await other.createWorkspace(
        { name: `Runtime G2 other ${Date.now()}` },
        { idempotencyKey: `runtime-g2-ws-other-${userId}` }
      );
      const otherWorkspaceId = otherCreated.body.workspace.id;
      const cross = await client.getWalletLedger(walletId, { workspaceId: otherWorkspaceId, limit: 50 });
      assert.equal(cross.status, 404);
      assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(cross.body).includes(workspaceId), false);
    }
  );
});

test("prisma runtime persists V0-G3 versioned estimate, atomic reservation and one RESERVE ledger entry under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G3 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });
      const prepared = await prepareApprovedBrand(client, "Runtime G3");

      // Fund the wallet with 50,000 minor units; the v0.local.1 maximum for a
      // 30-second generation is 48,000.
      const purchase = await client.createCreditPurchase(
        { workspaceId: prepared.workspaceId, provider: "razorpay", currency: "INR", amountMinor: 50000 },
        { idempotencyKey: `runtime-g3-purchase-${userId}` }
      );
      assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
      const walletId = purchase.body.wallet.id;
      const paid = await client.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);
      assert.equal(paid.status, 200, JSON.stringify(paid.body));

      const listed = await client.listAvatars({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 50
      });
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
      assert.ok(eligible, "expected an eligible avatar for the estimate");

      const estimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: eligible.id,
        durationSeconds: 30
      });
      assert.equal(estimate.status, 202, JSON.stringify(estimate.body));
      const estimateId = estimate.body.estimate.id;
      // The input hash is a server-side validation secret; it is retained but
      // never returned, and never exposed in the API response.
      assert.equal("inputHash" in estimate.body.estimate, false);

      const confirmed = await client.confirmGenerationEstimate(
        estimateId,
        {
          workspaceId: prepared.workspaceId,
          version: estimate.body.estimate.version,
          selectedScriptId: SCRIPT_ID,
          avatarProfileId: eligible.id,
          durationSeconds: 30
        },
        { idempotencyKey: `runtime-g3-confirm-${userId}` }
      );
      assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
      assert.equal(confirmed.body.job.status, "queued");
      assert.equal(confirmed.body.reservation.status, "active");
      assert.equal(confirmed.body.ledgerEntry.type, "RESERVE");
      assert.equal(confirmed.body.ledgerEntry.amountMinor, -48000);
      const jobId = confirmed.body.job.id;
      const reservationId = confirmed.body.reservation.id;

      // Prisma persistence under RLS: the estimate advanced to credits_reserved,
      // the wallet was debited by the authorized maximum, exactly one RESERVE
      // ledger row, one generation job and one active reservation were written.
      const estimateStateDb = queryScalar(
        db,
        `SELECT status || ':' || (input_hash IS NOT NULL)::text || ':' || version::text FROM generation_estimates WHERE id = '${estimateId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(estimateStateDb, "credits_reserved:true:1");

      const walletBalance = queryScalar(
        db,
        `SELECT balance_minor::text FROM credit_wallets WHERE id = '${walletId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(walletBalance, "2000", "wallet debited by the authorized maximum");

      const reserveCount = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${prepared.workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid AND type = 'RESERVE' AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(reserveCount, "1", "exactly one RESERVE ledger entry per confirmed estimate");

      const jobState = queryScalar(
        db,
        `SELECT count(*)::text || ':' || status FROM generation_jobs WHERE id = '${jobId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid AND estimate_id = '${estimateId}'::uuid GROUP BY status`
      );
      assert.equal(jobState, "1:queued");

      const reservationStateDb = queryScalar(
        db,
        `SELECT count(*)::text || ':' || status::text FROM credit_reservations WHERE id = '${reservationId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid GROUP BY status`
      );
      assert.equal(reservationStateDb, "1:ACTIVE");

      // Concurrency proof: a second concurrent confirmation against the same
      // already-reserved estimate is rejected as a conflict and writes no second
      // RESERVE ledger row, reservation or job. The partial unique index on
      // active reservations per job is the database-side guard.
      const second = await client.confirmGenerationEstimate(
        estimateId,
        {
          workspaceId: prepared.workspaceId,
          version: estimate.body.estimate.version,
          selectedScriptId: SCRIPT_ID,
          avatarProfileId: eligible.id,
          durationSeconds: 30
        },
        { idempotencyKey: `runtime-g3-conflict-${userId}` }
      );
      assert.equal(second.status, 409, JSON.stringify(second.body));
      assert.equal(second.body.code, "CREDIT_RESERVATION_CONFLICT");

      const reserveCountAfterConflict = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${prepared.workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid AND type = 'RESERVE'`
      );
      assert.equal(reserveCountAfterConflict, "1", "a conflicting confirmation must not append a second debit");
      const activeReservationCount = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_reservations WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid AND status = 'ACTIVE'`
      );
      assert.equal(activeReservationCount, "1", "only one active reservation exists per job");

      // A cross-workspace generation job hides existence behind the same 404 and
      // the other workspace id never leaks.
      const otherCreated = await other.createWorkspace(
        { name: `Runtime G3 other ${Date.now()}` },
        { idempotencyKey: `runtime-g3-ws-other-${userId}` }
      );
      const cross = await other.getGenerationJob(jobId, { workspaceId: otherCreated.body.workspace.id });
      assert.equal(cross.status, 404);
      assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(cross.body).includes(prepared.workspaceId), false);
    }
  );
});

test("prisma runtime persists V0-G4 exactly-once provider operation and verified callback under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G4 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";
  const heygenSecret = "runtime-heygen-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: heygenSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });
      const prepared = await prepareApprovedBrand(client, "Runtime G4");

      const purchase = await client.createCreditPurchase(
        { workspaceId: prepared.workspaceId, provider: "razorpay", currency: "INR", amountMinor: 50000 },
        { idempotencyKey: `runtime-g4-purchase-${userId}` }
      );
      assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
      const walletId = purchase.body.wallet.id;
      const paid = await client.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);
      assert.equal(paid.status, 200, JSON.stringify(paid.body));

      const listed = await client.listAvatars({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 50
      });
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
      assert.ok(eligible, "expected an eligible avatar for the estimate");

      const estimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: eligible.id,
        durationSeconds: 30
      });
      assert.equal(estimate.status, 202, JSON.stringify(estimate.body));

      const confirmed = await client.confirmGenerationEstimate(
        estimate.body.estimate.id,
        {
          workspaceId: prepared.workspaceId,
          version: estimate.body.estimate.version,
          selectedScriptId: SCRIPT_ID,
          avatarProfileId: eligible.id,
          durationSeconds: 30
        },
        { idempotencyKey: `runtime-g4-confirm-${userId}` }
      );
      assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
      const jobId = confirmed.body.job.id;

      // Submit exactly once: a durable ProviderOperation is persisted in SUBMITTING
      // before network I/O, then advanced to ACCEPTED with the provider external id.
      const submitted = await client.submitGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-g4-submit-${userId}` }
      );
      assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
      assert.equal(submitted.body.operation.status, "accepted");
      assert.ok(submitted.body.operation.externalId);
      const operationId = submitted.body.operation.id;
      // The request hash is a server-side binding secret and must not leak, and
      // the HeyGen webhook secret value never appears in the response. The
      // surfaced callback signature is the deterministic simulator's HMAC digest
      // (the same affordance as G2 checkout.signature), not a credential.
      assert.equal("requestHash" in submitted.body.operation, false);
      assert.equal(/request_hash|requestHash/.test(JSON.stringify(submitted.body)), false);
      assert.equal(JSON.stringify(submitted.body).includes(heygenSecret), false);

      // Prisma persistence under RLS: one ACCEPTED operation bound to the job with
      // an external id, a request hash and the estimated maximum; the job advanced
      // to accepted. The request hash is retained but never returned.
      const operationState = queryScalar(
        db,
        `SELECT count(*)::text || ':' || status::text || ':' || (external_id IS NOT NULL)::text || ':' || (request_hash IS NOT NULL)::text || ':' || estimated_maximum_minor::text FROM provider_operations WHERE id = '${operationId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid GROUP BY status, external_id, request_hash, estimated_maximum_minor`
      );
      assert.equal(operationState, "1:ACCEPTED:true:true:48000", JSON.stringify(submitted.body));

      const jobAccepted = queryScalar(
        db,
        `SELECT status FROM generation_jobs WHERE id = '${jobId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(jobAccepted, "accepted");

      // A replay with the same idempotency key returns the existing operation and
      // never creates a second provider operation.
      const replay = await client.submitGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-g4-submit-${userId}` }
      );
      assert.equal(replay.status, 202);
      assert.equal(replay.body.replay, true);
      const operationCount = queryScalar(
        db,
        `SELECT count(*)::text FROM provider_operations WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(operationCount, "1", "exactly one provider operation per job");

      // A verified callback drives the operation to COMPLETED and the job to
      // generated exactly once; a replay is deduplicated.
      const callback = submitted.body.callback;
      const acknowledged = await client.postHeygenCallback(callback.envelope, callback.signature);
      assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
      assert.equal(acknowledged.body.operation.status, "completed");
      assert.equal(acknowledged.body.job.status, "generated");

      const completedState = queryScalar(
        db,
        `SELECT status::text || ':' || (completed_at IS NOT NULL)::text FROM provider_operations WHERE id = '${operationId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(completedState, "COMPLETED:true");

      const jobGenerated = queryScalar(
        db,
        `SELECT status FROM generation_jobs WHERE id = '${jobId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(jobGenerated, "generated");

      const replayCallback = await client.postHeygenCallback(callback.envelope, callback.signature);
      assert.equal(replayCallback.status, 200);
      assert.equal(replayCallback.body.duplicate, true);
      const inboxCount = queryScalar(
        db,
        `SELECT count(*)::text FROM inbox_events WHERE workspace_id = '${prepared.workspaceId}'::uuid AND source = 'heygen' AND idempotency_key = '${callback.envelope.eventId}'`
      );
      assert.equal(inboxCount, "1", "a replayed callback is deduplicated to one inbox event");

      // A cross-workspace submission hides existence behind the same 404 and the
      // other workspace id never leaks.
      const otherCreated = await other.createWorkspace(
        { name: `Runtime G4 other ${Date.now()}` },
        { idempotencyKey: `runtime-g4-ws-other-${userId}` }
      );
      const cross = await other.submitGenerationJob(
        jobId,
        { workspaceId: otherCreated.body.workspace.id },
        { idempotencyKey: `runtime-g4-cross-${userId}` }
      );
      assert.equal(cross.status, 404);
      assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(cross.body).includes(prepared.workspaceId), false);
    }
  );
});

test("prisma runtime persists V0-G5 retained media, settled credits and crash recovery under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G5 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";
  const heygenSecret = "runtime-heygen-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: heygenSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });
      const prepared = await prepareApprovedBrand(client, "Runtime G5");

      const purchase = await client.createCreditPurchase(
        { workspaceId: prepared.workspaceId, provider: "razorpay", currency: "INR", amountMinor: 50000 },
        { idempotencyKey: `runtime-g5-purchase-${userId}` }
      );
      assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
      const walletId = purchase.body.wallet.id;
      const paid = await client.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);
      assert.equal(paid.status, 200, JSON.stringify(paid.body));

      const listed = await client.listAvatars({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 50
      });
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
      assert.ok(eligible, "expected an eligible avatar for the estimate");

      const estimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: eligible.id,
        durationSeconds: 30
      });
      assert.equal(estimate.status, 202, JSON.stringify(estimate.body));

      const confirmed = await client.confirmGenerationEstimate(
        estimate.body.estimate.id,
        {
          workspaceId: prepared.workspaceId,
          version: estimate.body.estimate.version,
          selectedScriptId: SCRIPT_ID,
          avatarProfileId: eligible.id,
          durationSeconds: 30
        },
        { idempotencyKey: `runtime-g5-confirm-${userId}` }
      );
      assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
      const jobId = confirmed.body.job.id;

      // Drive the provider operation to COMPLETED via a verified callback.
      const submitted = await client.submitGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-g5-submit-${userId}` }
      );
      assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
      const acknowledged = await client.postHeygenCallback(
        submitted.body.callback.envelope,
        submitted.body.callback.signature
      );
      assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
      assert.equal(acknowledged.body.operation.status, "completed");
      const operationId = submitted.body.operation.id;

      // Settle: completed media is retained, validated clean and bound to a segment,
      // versioned asset and lineage row; credits are captured once. The actual provider
      // total equals the authorized maximum, so the unused return is 0 and the wallet
      // balance stays at 2,000. The transient provider URL never appears.
      const settled = await client.settleGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-g5-settle-${userId}` }
      );
      assert.equal(settled.status, 202, JSON.stringify(settled.body));
      assert.equal(settled.body.outcome, "captured");
      assert.equal(settled.body.replay, false);
      assert.equal(settled.body.artifact.status, "CLEAN");
      assert.equal(settled.body.segment.durationSeconds, 30);
      assert.equal(settled.body.asset.version, 1);
      assert.equal(settled.body.lineage.generationJobId, jobId);
      assert.equal(settled.body.ledgerEntry.type, "CAPTURE");
      assert.equal(settled.body.reservation.status, "captured");
      assert.equal(settled.body.wallet.balanceMinor, 2000);
      assert.equal(/https?:\/\//i.test(JSON.stringify(settled.body)), false);
      assert.equal(/transient|provider[_-]?url|heygen\.com/i.test(JSON.stringify(settled.body)), false);

      // Prisma persistence under RLS: one retained segment, one versioned asset and one
      // lineage row bound to the job and the clean artifact; the operation carries the
      // reconciled provider total and settlement timestamp; the reservation is CAPTURED
      // and exactly one CAPTURE ledger entry was written.
      const segmentCount = queryScalar(
        db,
        `SELECT count(*)::text FROM generated_segments WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(segmentCount, "1", "exactly one retained segment");
      const assetCount = queryScalar(
        db,
        `SELECT count(*)::text FROM generated_assets WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid AND status = 'CLEAN'`
      );
      assert.equal(assetCount, "1", "exactly one clean versioned asset");
      const lineageCount = queryScalar(
        db,
        `SELECT count(*)::text FROM creative_lineage WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(lineageCount, "1", "exactly one creative lineage row");
      const operationSettled = queryScalar(
        db,
        `SELECT (provider_total_minor IS NOT NULL)::text || ':' || (settled_at IS NOT NULL)::text || ':' || provider_total_minor::text FROM provider_operations WHERE id = '${operationId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(operationSettled, "true:true:48000", JSON.stringify(settled.body));
      const reservationStatus = queryScalar(
        db,
        `SELECT status::text FROM credit_reservations WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(reservationStatus, "CAPTURED");
      const captureCount = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${prepared.workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid AND type = 'CAPTURE' AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(captureCount, "1", "exactly one CAPTURE ledger entry");

      // A replay returns the original settlement and never writes a second CAPTURE.
      const replay = await client.settleGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-g5-settle-replay-${userId}` }
      );
      assert.equal(replay.status, 202);
      assert.equal(replay.body.replay, true);
      assert.equal(replay.body.outcome, "captured");
      const captureCountAfterReplay = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${prepared.workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid AND type = 'CAPTURE' AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(captureCountAfterReplay, "1", "replay never captures a second time");

      // A cross-workspace settlement hides existence behind the same 404 and the other
      // workspace id never leaks.
      const otherCreated = await other.createWorkspace(
        { name: `Runtime G5 other ${Date.now()}` },
        { idempotencyKey: `runtime-g5-ws-other-${userId}` }
      );
      const cross = await other.settleGenerationJob(
        jobId,
        { workspaceId: otherCreated.body.workspace.id },
        { idempotencyKey: `runtime-g5-cross-${userId}` }
      );
      assert.equal(cross.status, 404);
      assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(cross.body).includes(prepared.workspaceId), false);
    }
  );
});

test("prisma runtime recovers a V0-G5 crash between media retention and ledger settlement", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G5 crash proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";
  const heygenSecret = "runtime-heygen-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: heygenSecret,
      V0_G5_SIMULATOR_MODE: "crash_after_retain"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime G5 crash");

      const purchase = await client.createCreditPurchase(
        { workspaceId: prepared.workspaceId, provider: "razorpay", currency: "INR", amountMinor: 50000 },
        { idempotencyKey: `runtime-g5crash-purchase-${userId}` }
      );
      assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
      const walletId = purchase.body.wallet.id;
      await client.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);

      const listed = await client.listAvatars({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 50
      });
      const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
      const estimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: eligible.id,
        durationSeconds: 30
      });
      const confirmed = await client.confirmGenerationEstimate(
        estimate.body.estimate.id,
        {
          workspaceId: prepared.workspaceId,
          version: estimate.body.estimate.version,
          selectedScriptId: SCRIPT_ID,
          avatarProfileId: eligible.id,
          durationSeconds: 30
        },
        { idempotencyKey: `runtime-g5crash-confirm-${userId}` }
      );
      const jobId = confirmed.body.job.id;

      const submitted = await client.submitGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-g5crash-submit-${userId}` }
      );
      await client.postHeygenCallback(submitted.body.callback.envelope, submitted.body.callback.signature);

      // First settle retains the media and commits, then is interrupted before the
      // ledger settlement. Media is retained but no CAPTURE is written.
      const interrupted = await client.settleGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-g5crash-settle-1-${userId}` }
      );
      assert.equal(interrupted.status, 503, JSON.stringify(interrupted.body));
      assert.equal(interrupted.body.code, "DEPENDENCY_UNAVAILABLE");
      const segmentRetained = queryScalar(
        db,
        `SELECT count(*)::text FROM generated_segments WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(segmentRetained, "1", "media was retained before the crash");
      const captureBefore = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${prepared.workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid AND type = 'CAPTURE' AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(captureBefore, "0", "no capture before recovery");

      // A second settle recovers: the retained segment is detected, retain is skipped
      // and the ledger is settled exactly once.
      const recovered = await client.settleGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-g5crash-settle-2-${userId}` }
      );
      assert.equal(recovered.status, 202, JSON.stringify(recovered.body));
      assert.equal(recovered.body.outcome, "captured");
      assert.equal(recovered.body.reservation.status, "captured");
      assert.equal(recovered.body.wallet.balanceMinor, 2000);
      const captureAfter = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${prepared.workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid AND type = 'CAPTURE' AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(captureAfter, "1", "exactly one CAPTURE after crash recovery");
    }
  );
});

test("prisma runtime rejects a concurrent G3 confirmation against the same fresh estimate under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G3 concurrency proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime G3 concurrent");
      const walletId = await fundWallet(client, prepared, userId, 50000, "g3conc");
      const eligible = await firstEligibleAvatar(client, prepared);

      const estimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: eligible.id,
        durationSeconds: 30
      });
      assert.equal(estimate.status, 202, JSON.stringify(estimate.body));
      const estimateId = estimate.body.estimate.id;
      const confirmInput = {
        workspaceId: prepared.workspaceId,
        version: estimate.body.estimate.version,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: eligible.id,
        durationSeconds: 30
      };

      // Two simultaneous confirmations with different idempotency keys against the
      // SAME fresh awaiting_confirmation estimate. Exactly one must win: one 202, one
      // 409 CREDIT_RESERVATION_CONFLICT, one job, one active reservation, one RESERVE
      // ledger entry and a wallet debited once to 2,000. No raw 500.
      const [a, b] = await Promise.all([
        client.confirmGenerationEstimate(estimateId, confirmInput, { idempotencyKey: `runtime-g3conc-a-${userId}` }),
        client.confirmGenerationEstimate(estimateId, confirmInput, { idempotencyKey: `runtime-g3conc-b-${userId}` })
      ]);
      const results = [a, b].sort((x, y) => x.status - y.status);
      assert.equal(results[0].status, 202, JSON.stringify([a.body, b.body]));
      assert.equal(results[1].status, 409, JSON.stringify([a.body, b.body]));
      assert.equal(results[1].body.code, "CREDIT_RESERVATION_CONFLICT");
      assert.equal([a.status, b.status].includes(500), false, "concurrent confirmation must not surface a raw 500");

      const jobCount = queryScalar(
        db,
        `SELECT count(*)::text FROM generation_jobs WHERE workspace_id = '${prepared.workspaceId}'::uuid AND estimate_id = '${estimateId}'::uuid`
      );
      assert.equal(jobCount, "1", "exactly one generation job per estimate under concurrency");
      const reserveCount = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${prepared.workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid AND type = 'RESERVE'`
      );
      assert.equal(reserveCount, "1", "exactly one RESERVE ledger entry under concurrency");
      const activeReservationCount = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_reservations WHERE workspace_id = '${prepared.workspaceId}'::uuid AND status = 'ACTIVE'`
      );
      assert.equal(activeReservationCount, "1", "exactly one active reservation under concurrency");
      const balance = queryScalar(
        db,
        `SELECT balance_minor::text FROM credit_wallets WHERE id = '${walletId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(balance, "2000", "wallet debited exactly once by the authorized maximum");
    }
  );
});

test("prisma runtime maps a concurrent G4 submission for the same job to a stable conflict, not a 500", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G4 concurrency proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";
  const heygenSecret = "runtime-heygen-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: heygenSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime G4 concurrent");
      await fundWallet(client, prepared, userId, 50000, "g4conc");
      const jobId = await createConfirmedJob(client, prepared, userId, "g4conc");

      // Two simultaneous submissions with different idempotency keys for the SAME
      // queued job. Exactly one provider operation is created; the other caller
      // receives a controlled 409 IDEMPOTENCY_INPUT_CONFLICT (or a replay), never a
      // raw 500.
      const [a, b] = await Promise.all([
        client.submitGenerationJob(jobId, { workspaceId: prepared.workspaceId }, { idempotencyKey: `runtime-g4conc-a-${userId}` }),
        client.submitGenerationJob(jobId, { workspaceId: prepared.workspaceId }, { idempotencyKey: `runtime-g4conc-b-${userId}` })
      ]);
      const statuses = [a.status, b.status];
      assert.equal(statuses.includes(500), false, "concurrent submission must not surface a raw 500");
      const accepted = [a, b].find((r) => r.status === 202);
      const rejected = [a, b].find((r) => r.status !== 202);
      assert.ok(accepted, "one submission must succeed with 202");
      assert.ok(rejected, "the other submission must receive a controlled response");
      // The controlled response is a stable conflict (409) or a replay (202); never a
      // raw DB failure.
      assert.ok(
        rejected.status === 409 || (rejected.status === 202 && rejected.body.replay === true),
        JSON.stringify([a.body, b.body])
      );
      if (rejected.status === 409) {
        assert.equal(rejected.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
      }

      const operationCount = queryScalar(
        db,
        `SELECT count(*)::text FROM provider_operations WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(operationCount, "1", "exactly one provider operation per job under concurrency");
    }
  );
});

test("prisma runtime maps a concurrent G5 settlement for the same job to a replay, not a 500", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime G5 concurrency proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";
  const heygenSecret = "runtime-heygen-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: heygenSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime G5 concurrent");
      const walletId = await fundWallet(client, prepared, userId, 50000, "g5conc");
      const jobId = await createCompletedJob(client, prepared, userId, "g5conc");

      // Two simultaneous settlements with different idempotency keys for the SAME
      // completed job. Exactly one captures; the other returns a replay (or a stable
      // conflict), never a raw 500. One CAPTURE, one segment, one asset, one lineage.
      const [a, b] = await Promise.all([
        client.settleGenerationJob(jobId, { workspaceId: prepared.workspaceId }, { idempotencyKey: `runtime-g5conc-a-${userId}` }),
        client.settleGenerationJob(jobId, { workspaceId: prepared.workspaceId }, { idempotencyKey: `runtime-g5conc-b-${userId}` })
      ]);
      const statuses = [a.status, b.status];
      assert.equal(statuses.includes(500), false, "concurrent settlement must not surface a raw 500");
      const captured = [a, b].find((r) => r.status === 202 && r.body.outcome === "captured" && r.body.replay === false);
      const other = [a, b].find((r) => r !== captured);
      assert.ok(captured, "one settlement must capture with replay=false");
      assert.ok(other, "the other settlement must receive a controlled response");
      assert.ok(
        other.status === 202 && (other.body.replay === true || other.body.outcome === "captured"),
        JSON.stringify([a.body, b.body])
      );

      const segmentCount = queryScalar(
        db,
        `SELECT count(*)::text FROM generated_segments WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(segmentCount, "1", "exactly one retained segment under concurrency");
      const assetCount = queryScalar(
        db,
        `SELECT count(*)::text FROM generated_assets WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(assetCount, "1", "exactly one versioned asset under concurrency");
      const lineageCount = queryScalar(
        db,
        `SELECT count(*)::text FROM creative_lineage WHERE workspace_id = '${prepared.workspaceId}'::uuid AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(lineageCount, "1", "exactly one creative lineage row under concurrency");
      const captureCount = queryScalar(
        db,
        `SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '${prepared.workspaceId}'::uuid AND wallet_id = '${walletId}'::uuid AND type = 'CAPTURE' AND generation_job_id = '${jobId}'::uuid`
      );
      assert.equal(captureCount, "1", "exactly one CAPTURE ledger entry under concurrency");
      const balance = queryScalar(
        db,
        `SELECT balance_minor::text FROM credit_wallets WHERE id = '${walletId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(balance, "2000", "wallet settled exactly once");
    }
  );
});

test("prisma runtime persists V0-C1 validated composition instruction, AE plan and CLEAN plan artifact under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime C1 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";
  const heygenSecret = "runtime-heygen-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: heygenSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime C1");
      await fundWallet(client, prepared, userId, 50000, "c1");

      const listed = await client.listAvatars({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 50
      });
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
      assert.ok(eligible, "expected an eligible avatar for the estimate");

      const estimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: SCRIPT_ID,
        avatarProfileId: eligible.id,
        durationSeconds: 30
      });
      assert.equal(estimate.status, 202, JSON.stringify(estimate.body));
      const confirmed = await client.confirmGenerationEstimate(
        estimate.body.estimate.id,
        {
          workspaceId: prepared.workspaceId,
          version: estimate.body.estimate.version,
          selectedScriptId: SCRIPT_ID,
          avatarProfileId: eligible.id,
          durationSeconds: 30
        },
        { idempotencyKey: `runtime-c1-confirm-${userId}` }
      );
      assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
      const jobId = confirmed.body.job.id;

      const submitted = await client.submitGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-c1-submit-${userId}` }
      );
      assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
      const acknowledged = await client.postHeygenCallback(
        submitted.body.callback.envelope,
        submitted.body.callback.signature
      );
      assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
      assert.equal(acknowledged.body.operation.status, "completed");

      const settled = await client.settleGenerationJob(
        jobId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-c1-settle-${userId}` }
      );
      assert.equal(settled.status, 202, JSON.stringify(settled.body));
      assert.equal(settled.body.outcome, "captured");
      const assetId = settled.body.asset.id;

      // C1 valid plan: the composition instruction, AE plan and CLEAN plan artifact are
      // retained under RLS; the audit records composition.plan_validated. The plan artifact
      // sha256, timeline JSON and asset id never appear in the response.
      const created = await client.createCompositionPlan({
        workspaceId: prepared.workspaceId,
        generationAssetId: assetId,
        inputMode: "structured",
        rawDirection: "9:16 reel with a lower-third caption and a zoom-in intro",
        timeline: validTimeline(assetId)
      });
      assert.equal(created.status, 202, JSON.stringify(created.body));
      assert.equal(created.body.composition.status, "validated");
      assert.equal(created.body.composition.generationAssetId, assetId);
      assert.equal(created.body.plan.status, "validated");
      assert.equal(created.body.plan.capabilityVersion, DEFAULT_AE_CAPABILITY_VERSION);
      assert.equal(created.body.plan.schemaVersion, AE_PLAN_SCHEMA_VERSION);
      assert.equal(created.body.plan.unsupportedItems.length, 0);
      assert.equal(created.body.artifact.status, "CLEAN");
      assert.equal(created.body.artifact.contentType, "application/json");
      assert.equal(created.body.artifact.retentionClass, "plan-artifact");
      assert.equal(created.body.audit.eventType, "composition.plan_validated");
      assert.equal(/https?:\/\//i.test(JSON.stringify(created.body)), false);
      assert.equal(/secret|api[_-]?key|signature/i.test(JSON.stringify(created.body)), false);

      const instructionId = created.body.composition.id;
      const planId = created.body.plan.id;
      const planArtifactId = created.body.plan.planArtifactId;

      // Prisma persistence under RLS: one composition instruction validated, one ae_plans
      // row validated bound to a CLEAN plan artifact, and a composition.plan_validated audit.
      const instructionEvidence = queryScalar(
        db,
        `SELECT status::text || ':' || input_mode::text FROM composition_instructions WHERE id = '${instructionId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid AND generation_asset_id = '${assetId}'::uuid`
      );
      assert.equal(instructionEvidence, "VALIDATED:structured", "composition instruction retained under RLS");

      const planEvidence = queryScalar(
        db,
        `SELECT status::text || ':' || capability_version::text FROM ae_plans WHERE id = '${planId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid AND composition_instruction_id = '${instructionId}'::uuid AND plan_artifact_id = '${planArtifactId}'::uuid AND validated_at IS NOT NULL`
      );
      assert.equal(planEvidence, `VALIDATED:${DEFAULT_AE_CAPABILITY_VERSION}`, "AE plan retained and bound to plan artifact under RLS");

      const planArtifactEvidence = queryScalar(
        db,
        `SELECT status::text || ':' || retention_class::text FROM artifacts WHERE id = '${planArtifactId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid AND producer = 'composition:${instructionId}' AND schema_version = '${AE_PLAN_SCHEMA_VERSION}'`
      );
      assert.equal(planArtifactEvidence, "CLEAN:plan-artifact", "CLEAN plan artifact retained under RLS");

      const validatedAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${prepared.workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'composition.plan_validated' AND target_type = 'CompositionInstruction' AND target_id = '${instructionId}'::uuid`
      );
      assert.equal(validatedAudit, "1", "composition.plan_validated audit retained");

      // C1 invalid plan: an invented asset is retained as validation_failed under RLS with a
      // composition.validation_failed audit. No plan artifact is retained.
      const invented = randomUUID();
      const failed = await client.createCompositionPlan({
        workspaceId: prepared.workspaceId,
        generationAssetId: invented,
        inputMode: "structured",
        rawDirection: "reference a non-existent asset",
        timeline: validTimeline(invented)
      });
      assert.equal(failed.status, 422, JSON.stringify(failed.body));
      assert.equal(failed.body.code, "AE_ASSET_MISSING");
      assert.equal(failed.body.planStatus, "validation_failed");

      const failedInstructionId = failed.body.compositionId;
      const failedPlanId = failed.body.planId;
      const failedEvidence = queryScalar(
        db,
        `SELECT status::text FROM composition_instructions WHERE id = '${failedInstructionId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(failedEvidence, "VALIDATION_FAILED", "failed composition instruction retained under RLS");
      const failedPlanEvidence = queryScalar(
        db,
        `SELECT status::text || ':' || COALESCE(plan_artifact_id::text, 'null') FROM ae_plans WHERE id = '${failedPlanId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(failedPlanEvidence, "VALIDATION_FAILED:null", "failed AE plan retained with no plan artifact");
      const failedAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${prepared.workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'composition.validation_failed' AND target_id = '${failedInstructionId}'::uuid`
      );
      assert.equal(failedAudit, "1", "composition.validation_failed audit retained");
    }
  );
});

test("prisma runtime persists V0-C2 render attempt, versioned final video and CLEAN final media under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime C2 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: "runtime-heygen-simulator-secret",
      V0_C2_SIMULATOR_MODE: "success"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime C2");
      await fundWallet(client, prepared, userId, 50000, "c2");
      const { compositionPlanId, assetId } = await prepareRuntimeValidatedPlan(client, prepared, userId);

      const rendered = await client.renderCompositionPlan(
        compositionPlanId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-c2-render-${userId}` }
      );
      assert.equal(rendered.status, 202, JSON.stringify(rendered.body));
      assert.equal(rendered.body.attempt.status, "succeeded");
      assert.equal(rendered.body.attempt.compositionInstructionId, compositionPlanId);
      assert.equal(rendered.body.attempt.outputHash, rendered.body.finalVideo.sha256);
      assert.equal(rendered.body.finalVideo.status, "current");
      assert.equal(rendered.body.finalVideo.version, 1);
      assert.equal(rendered.body.finalVideo.resolution, "1080x1920");
      assert.equal(rendered.body.finalVideo.codec, "h264");
      assert.equal(rendered.body.finalVideo.capabilityVersion, DEFAULT_AE_CAPABILITY_VERSION);
      assert.equal(rendered.body.finalVideo.schemaVersion, AE_RENDER_SCHEMA_VERSION);
      assert.equal(rendered.body.composition.status, "rendered");
      assert.equal(rendered.body.audit.eventType, "composition.render_succeeded");
      assert.equal(rendered.body.artifacts.finalVideo.status, "CLEAN");
      assert.equal(rendered.body.artifacts.finalVideo.retentionClass, "final-video");
      assert.equal(rendered.body.artifacts.thumbnail.retentionClass, "final-thumbnail");
      assert.equal(rendered.body.artifacts.captions.retentionClass, "final-captions");
      assert.equal(rendered.body.artifacts.logs.retentionClass, "render-logs");
      assert.equal(/https?:\/\//i.test(JSON.stringify(rendered.body)), false);
      assert.equal(/secret|api[_-]?key|signature/i.test(JSON.stringify(rendered.body)), false);

      const attemptId = rendered.body.attempt.id;
      const finalVideoId = rendered.body.finalVideo.id;
      const finalVideoArtifactId = rendered.body.artifacts.finalVideo.id;
      const thumbnailArtifactId = rendered.body.artifacts.thumbnail.id;
      const captionsArtifactId = rendered.body.artifacts.captions.id;
      const logsArtifactId = rendered.body.artifacts.logs.id;

      // Render attempt persisted SUCCEEDED with the golden output hash under RLS.
      const attemptEvidence = queryScalar(
        db,
        `SELECT status::text || ':' || COALESCE(output_hash, 'null') FROM render_attempts WHERE id = '${attemptId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid AND composition_instruction_id = '${compositionPlanId}'::uuid AND idempotency_key = 'runtime-c2-render-${userId}' AND logs_artifact_id = '${logsArtifactId}'::uuid`
      );
      assert.equal(
        attemptEvidence,
        `SUCCEEDED:${rendered.body.finalVideo.sha256}`,
        "render attempt retained SUCCEEDED with golden output hash under RLS"
      );

      // Final video persisted CURRENT version 1 with the deterministic golden sha256, bound to
      // the retained CLEAN final-video, thumbnail and captions artifacts.
      const finalVideoEvidence = queryScalar(
        db,
        `SELECT status::text || ':' || version::text || ':' || final_video_artifact_id::text FROM final_videos WHERE id = '${finalVideoId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid AND composition_instruction_id = '${compositionPlanId}'::uuid AND render_attempt_id = '${attemptId}'::uuid AND final_video_artifact_id = '${finalVideoArtifactId}'::uuid AND thumbnail_artifact_id = '${thumbnailArtifactId}'::uuid AND captions_artifact_id = '${captionsArtifactId}'::uuid AND sha256 = '${rendered.body.finalVideo.sha256}' AND schema_version = '${AE_RENDER_SCHEMA_VERSION}'`
      );
      assert.equal(finalVideoEvidence, `CURRENT:1:${finalVideoArtifactId}`, "versioned CURRENT final video retained under RLS");

      // Four CLEAN artifacts retained: final-video, final-thumbnail, final-captions, render-logs.
      const artifactEvidence = queryScalar(
        db,
        `SELECT string_agg(retention_class, ',' ORDER BY retention_class) FROM artifacts WHERE workspace_id = '${prepared.workspaceId}'::uuid AND id IN ('${finalVideoArtifactId}'::uuid, '${thumbnailArtifactId}'::uuid, '${captionsArtifactId}'::uuid, '${logsArtifactId}'::uuid) AND status = 'CLEAN'`
      );
      assert.equal(artifactEvidence, "final-captions,final-thumbnail,final-video,render-logs", "four CLEAN final media artifacts retained under RLS");

      // Composition instruction moved to RENDERED; render_succeeded audit retained.
      const compositionEvidence = queryScalar(
        db,
        `SELECT status::text FROM composition_instructions WHERE id = '${compositionPlanId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid`
      );
      assert.equal(compositionEvidence, "RENDERED", "composition instruction moved to RENDERED under RLS");
      const successAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${prepared.workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'composition.render_succeeded' AND target_type = 'CompositionInstruction' AND target_id = '${compositionPlanId}'::uuid`
      );
      assert.equal(successAudit, "1", "composition.render_succeeded audit retained");

      // Idempotent replay: a second call with the same key replays the same final video.
      const replay = await client.renderCompositionPlan(
        compositionPlanId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-c2-render-${userId}` }
      );
      assert.equal(replay.status, 202, JSON.stringify(replay.body));
      assert.equal(replay.body.finalVideo.id, finalVideoId);
      assert.equal(replay.body.attempt.id, attemptId);
    }
  );
});

test("prisma runtime recovers a V0-C2 worker crash and renders exactly once under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime C2 crash proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: "runtime-heygen-simulator-secret",
      V0_C2_SIMULATOR_MODE: "crash"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime C2 crash");
      await fundWallet(client, prepared, userId, 50000, "c2crash");
      const { compositionPlanId } = await prepareRuntimeValidatedPlan(client, prepared, userId);

      const first = await client.renderCompositionPlan(
        compositionPlanId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-c2-crash-${userId}` }
      );
      assert.equal(first.status, 503, JSON.stringify(first.body));
      assert.equal(first.body.code, "DEPENDENCY_UNAVAILABLE");
      const attemptId = first.body.attemptId;

      // The RUNNING attempt is persisted under RLS before the worker runs.
      const runningEvidence = queryScalar(
        db,
        `SELECT status::text FROM render_attempts WHERE id = '${attemptId}'::uuid AND workspace_id = '${prepared.workspaceId}'::uuid AND idempotency_key = 'runtime-c2-crash-${userId}'`
      );
      assert.equal(runningEvidence, "RUNNING", "RUNNING render attempt persisted before worker completion");

      const second = await client.renderCompositionPlan(
        compositionPlanId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-c2-crash-${userId}` }
      );
      assert.equal(second.status, 202, JSON.stringify(second.body));
      assert.equal(second.body.attempt.status, "succeeded");
      assert.equal(second.body.attempt.id, attemptId);
      assert.equal(second.body.finalVideo.version, 1);

      const replay = await client.renderCompositionPlan(
        compositionPlanId,
        { workspaceId: prepared.workspaceId },
        { idempotencyKey: `runtime-c2-crash-${userId}` }
      );
      assert.equal(replay.status, 202, JSON.stringify(replay.body));
      assert.equal(replay.body.finalVideo.id, second.body.finalVideo.id);
    }
  );
});

test("prisma runtime rejects a V0-C2 idempotency-key replay against a different composition under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime C2 idempotency conflict proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: "runtime-heygen-simulator-secret",
      V0_C2_SIMULATOR_MODE: "success"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime C2 conflict");
      await fundWallet(client, prepared, userId, 50000, "c2conflict");
      const planA = await prepareRuntimeValidatedPlan(client, prepared, userId);
      const compositionPlanIdA = planA.compositionPlanId;
      const workspaceId = prepared.workspaceId;

      // A second, distinct composition plan in the same workspace (same retained asset, different
      // overlay text) is a different render operation input.
      const planB = await client.createCompositionPlan({
        workspaceId,
        generationAssetId: planA.assetId,
        inputMode: "structured",
        rawDirection: "9:16 reel with an intro caption and a zoom-in outro",
        timeline: {
          ...validTimeline(planA.assetId),
          overlays: [
            { id: "o1", kind: "caption", text: "Aster Heights — Book a site visit", startSeconds: 0, endSeconds: 5, safeZone: "lower_third" }
          ]
        }
      });
      assert.equal(planB.status, 202, JSON.stringify(planB.body));
      const compositionPlanIdB = planB.body.composition.id;

      const idemKey = `runtime-c2-conflict-${userId}`;
      const renderA = await client.renderCompositionPlan(
        compositionPlanIdA,
        { workspaceId },
        { idempotencyKey: idemKey }
      );
      assert.equal(renderA.status, 202, JSON.stringify(renderA.body));
      assert.ok(renderA.body.lineage, "composition A render retains render-level lineage");

      // Replaying the same key against composition B is a conflict, never a replay of A's video.
      const renderB = await client.renderCompositionPlan(
        compositionPlanIdB,
        { workspaceId },
        { idempotencyKey: idemKey }
      );
      assert.equal(renderB.status, 409, JSON.stringify(renderB.body));
      assert.equal(renderB.body.code, "IDEMPOTENCY_INPUT_CONFLICT");

      // Exactly one render_attempts row for the idempotency key (composition A's), with the input
      // hash bound; composition B was never rendered and has no render-level lineage.
      const attemptCount = queryScalar(
        db,
        `SELECT count(*)::text FROM render_attempts WHERE workspace_id = '${workspaceId}'::uuid AND idempotency_key = '${idemKey}'`
      );
      assert.equal(attemptCount, "1", "one input-bound render attempt for the idempotency key");
      const bStatus = queryScalar(
        db,
        `SELECT status::text FROM composition_instructions WHERE id = '${compositionPlanIdB}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(bStatus, "VALIDATED", "composition B was never rendered");
      const bLineage = queryScalar(
        db,
        `SELECT count(*)::text FROM creative_lineage WHERE workspace_id = '${workspaceId}'::uuid AND composition_instruction_id = '${compositionPlanIdB}'::uuid`
      );
      assert.equal(bLineage, "0", "no render-level lineage for composition B");
    }
  );
});

test("prisma runtime retains V0-C2 render-level creative lineage and preserves prior lineage on revision under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime C2 lineage proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: "runtime-heygen-simulator-secret",
      V0_C2_SIMULATOR_MODE: "success"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const prepared = await prepareApprovedBrand(client, "Runtime C2 lineage");
      await fundWallet(client, prepared, userId, 50000, "c2lineage");
      const { compositionPlanId, assetId } = await prepareRuntimeValidatedPlan(client, prepared, userId);
      const workspaceId = prepared.workspaceId;

      const first = await client.renderCompositionPlan(
        compositionPlanId,
        { workspaceId },
        { idempotencyKey: `runtime-c2-lineage-1-${userId}` }
      );
      assert.equal(first.status, 202, JSON.stringify(first.body));
      assert.ok(first.body.lineage, "render retains render-level lineage");
      const v1FinalVideoId = first.body.finalVideo.id;
      const lineage1Id = first.body.lineage.id;
      const attempt1Id = first.body.attempt.id;
      const aePlanId = first.body.attempt.aePlanId;

      // The render-level lineage row binds the final video, composition instruction, AE plan,
      // render attempt and generated asset, copying the G5 ancestry; generation_job_id is NULL.
      const lineage1Evidence = queryScalar(
        db,
        `SELECT final_video_id::text FROM creative_lineage WHERE id = '${lineage1Id}'::uuid AND workspace_id = '${workspaceId}'::uuid AND generation_job_id IS NULL AND composition_instruction_id = '${compositionPlanId}'::uuid AND ae_plan_id = '${aePlanId}'::uuid AND render_attempt_id = '${attempt1Id}'::uuid AND generated_asset_id = '${assetId}'::uuid`
      );
      assert.equal(lineage1Evidence, v1FinalVideoId, "render-level lineage binds the final video and ancestry under RLS");

      // A revision creates a new current final video and a new immutable lineage row for it.
      const second = await client.renderCompositionPlan(
        compositionPlanId,
        { workspaceId },
        { idempotencyKey: `runtime-c2-lineage-2-${userId}` }
      );
      assert.equal(second.status, 202, JSON.stringify(second.body));
      assert.ok(second.body.lineage);
      assert.notEqual(second.body.lineage.id, lineage1Id);
      assert.notEqual(second.body.finalVideo.id, v1FinalVideoId);

      // The prior revision's lineage is preserved immutably: its final_video_id is still v1, and a
      // second render-level lineage row now exists for v2.
      const lineage1Still = queryScalar(
        db,
        `SELECT final_video_id::text FROM creative_lineage WHERE id = '${lineage1Id}'::uuid`
      );
      assert.equal(lineage1Still, v1FinalVideoId, "prior render-level lineage is immutable");
      const lineage2Evidence = queryScalar(
        db,
        `SELECT final_video_id::text FROM creative_lineage WHERE id = '${second.body.lineage.id}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(lineage2Evidence, second.body.finalVideo.id, "revision render-level lineage binds v2");
      const lineageCount = queryScalar(
        db,
        `SELECT count(*)::text FROM creative_lineage WHERE workspace_id = '${workspaceId}'::uuid AND composition_instruction_id = '${compositionPlanId}'::uuid AND final_video_id IS NOT NULL`
      );
      assert.equal(lineageCount, "2", "two immutable render-level lineage rows after a revision");

      // Replay the first key: it returns the original (now superseded) final video and lineage.
      const replayFirst = await client.renderCompositionPlan(
        compositionPlanId,
        { workspaceId },
        { idempotencyKey: `runtime-c2-lineage-1-${userId}` }
      );
      assert.equal(replayFirst.status, 202, JSON.stringify(replayFirst.body));
      assert.equal(replayFirst.body.finalVideo.id, v1FinalVideoId);
      assert.equal(replayFirst.body.lineage.id, lineage1Id);
      assert.equal(replayFirst.body.lineage.finalVideoId, v1FinalVideoId);
    }
  );
});

test("prisma runtime persists V0-R1 exact-version review item, append-only comments and collapsed notifications under RLS", {
  timeout: 30000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime R1 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: "runtime-heygen-simulator-secret",
      V0_C2_SIMULATOR_MODE: "success"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });
      const rendered = await prepareRenderedFinalVideo(client, "Runtime R1");
      const workspaceId = rendered.workspaceId;

      // R1 open: one review item is bound to the exact final-video version under RLS, with a
      // review.created audit. A second open with a fresh key replays the same review item (one
      // review item per exact final-video version).
      const created = await client.createReviewItem(
        { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
        { idempotencyKey: `runtime-r1-open-${userId}` }
      );
      assert.equal(created.status, 202, JSON.stringify(created.body));
      assert.equal(created.body.reviewItem.status, "internal_review");
      assert.equal(created.body.reviewItem.finalVideoVersion, rendered.finalVideoVersion);
      assert.equal(created.body.reviewItem.finalVideoSha256, rendered.finalVideoSha256);
      const reviewItemId = created.body.reviewItem.id;

      const replay = await client.createReviewItem(
        { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
        { idempotencyKey: `runtime-r1-open-replay-${userId}` }
      );
      assert.equal(replay.status, 202, JSON.stringify(replay.body));
      assert.equal(replay.body.reviewItem.id, reviewItemId);

      const itemEvidence = queryScalar(
        db,
        `SELECT status::text || ':' || review_stage::text || ':' || final_video_version::text || ':' || final_video_sha256 FROM review_items WHERE id = '${reviewItemId}'::uuid AND workspace_id = '${workspaceId}'::uuid AND final_video_id = '${rendered.finalVideoId}'::uuid AND composition_instruction_id = '${rendered.compositionPlanId}'::uuid AND created_by_user_id = '${userId}'::uuid`
      );
      assert.equal(
        itemEvidence,
        `INTERNAL_REVIEW:INTERNAL_REVIEW:${rendered.finalVideoVersion}:${rendered.finalVideoSha256}`,
        "one review item bound to the exact final-video version under RLS"
      );

      const itemCount = queryScalar(
        db,
        `SELECT count(*)::text FROM review_items WHERE workspace_id = '${workspaceId}'::uuid AND final_video_id = '${rendered.finalVideoId}'::uuid`
      );
      assert.equal(itemCount, "1", "exactly one review item per exact final-video version");

      const createdAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'review.created' AND target_type = 'ReviewItem' AND target_id = '${reviewItemId}'::uuid`
      );
      assert.equal(createdAudit, "1", "review.created audit retained once");

      // R1 open idempotency is key-bound (input-bound), not just the one-review-item-per-final-video
      // unique index. A second independent current final video B in the same workspace, opened with
      // A's idempotency key, returns IDEMPOTENCY_INPUT_CONFLICT (409) and writes no second review
      // item and no second idempotency record. The review response carries no workspace/artifact/job
      // id, so the idempotency record's workspace_id is null; the proof filters by actor + operation
      // + key instead.
      const planB = await client.createCompositionPlan({
        workspaceId,
        generationAssetId: rendered.assetId,
        inputMode: "structured",
        rawDirection: "9:16 reel with a lower-third caption and a zoom-in intro",
        timeline: validTimeline(rendered.assetId)
      });
      assert.equal(planB.status, 202, JSON.stringify(planB.body));
      const renderedB = await client.renderCompositionPlan(
        planB.body.composition.id,
        { workspaceId },
        { idempotencyKey: `runtime-r1-render-b-${userId}` }
      );
      assert.equal(renderedB.status, 202, JSON.stringify(renderedB.body));
      const finalVideoBId = renderedB.body.finalVideo.id;
      assert.notEqual(finalVideoBId, rendered.finalVideoId);

      const conflict = await client.createReviewItem(
        { workspaceId, finalVideoId: finalVideoBId, reviewStage: "internal_review" },
        { idempotencyKey: `runtime-r1-open-${userId}` }
      );
      assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
      assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");

      const bItemCount = queryScalar(
        db,
        `SELECT count(*)::text FROM review_items WHERE workspace_id = '${workspaceId}'::uuid AND final_video_id = '${finalVideoBId}'::uuid`
      );
      assert.equal(bItemCount, "0", "no review item created for the conflicting final video");

      const openIdempotencyRecordCount = queryScalar(
        db,
        `SELECT count(*)::text FROM idempotency_records WHERE actor_user_id = '${userId}'::uuid AND operation = 'review.item.create' AND idempotency_key = 'runtime-r1-open-${userId}'`
      );
      assert.equal(
        openIdempotencyRecordCount,
        "1",
        "one idempotency record for the original open; the conflicting open stored none"
      );

      // A fresh key for B does open a review item for B under RLS (the conflict was key-bound, not a
      // block on B). Exactly one review item exists per exact final-video version.
      const openB = await client.createReviewItem(
        { workspaceId, finalVideoId: finalVideoBId, reviewStage: "internal_review" },
        { idempotencyKey: `runtime-r1-open-b-fresh-${userId}` }
      );
      assert.equal(openB.status, 202, JSON.stringify(openB.body));
      assert.equal(openB.body.reviewItem.finalVideoId, finalVideoBId);
      const bItemCountAfterFresh = queryScalar(
        db,
        `SELECT count(*)::text FROM review_items WHERE workspace_id = '${workspaceId}'::uuid AND final_video_id = '${finalVideoBId}'::uuid`
      );
      assert.equal(bItemCountAfterFresh, "1", "exactly one review item per exact final-video version for B");

      // R1 comment: append-only timestamped comments are retained; the first creates one logical
      // notification (duplicateCollapsed=false), the second distinct comment collapses to the
      // same notification (duplicateCollapsed=true) and writes no second notification row. One
      // review.comment_added audit is written per comment.
      const commentA = await client.addReviewComment(
        reviewItemId,
        { workspaceId, body: "Tighten the lower-third at 0:12.", timestampMs: 12000, threadId: null },
        { idempotencyKey: `runtime-r1-comment-a-${userId}` }
      );
      assert.equal(commentA.status, 202, JSON.stringify(commentA.body));
      assert.equal(commentA.body.notification.duplicateCollapsed, false);
      const notificationId = commentA.body.notification.id;

      const commentB = await client.addReviewComment(
        reviewItemId,
        { workspaceId, body: "Also slow the zoom.", timestampMs: 15000, threadId: null },
        { idempotencyKey: `runtime-r1-comment-b-${userId}` }
      );
      assert.equal(commentB.status, 202, JSON.stringify(commentB.body));
      assert.equal(commentB.body.notification.duplicateCollapsed, true);
      assert.equal(commentB.body.notification.id, notificationId);

      const commentEvidence = queryScalar(
        db,
        `SELECT count(*)::text FROM review_comments WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${reviewItemId}'::uuid AND author_user_id = '${userId}'::uuid`
      );
      assert.equal(commentEvidence, "2", "two append-only comments retained under RLS");

      const notificationEvidence = queryScalar(
        db,
        `SELECT count(*)::text || ':' || status::text FROM notifications WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${reviewItemId}'::uuid AND notification_type = 'review_comment_added' AND recipient_user_id = '${userId}'::uuid GROUP BY status`
      );
      assert.equal(notificationEvidence, "1:SENT", "exactly one logical notification collapsed under RLS");

      const commentAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'review.comment_added' AND target_type = 'ReviewItem' AND target_id = '${reviewItemId}'::uuid`
      );
      assert.equal(commentAudit, "2", "one review.comment_added audit per comment");

      // No signed URL, secret, recipient payload hash or transient provider URL leaks.
      assert.equal(/https?:\/\//i.test(JSON.stringify(commentA.body)), false);
      assert.equal(/secret|api[_-]?key|signature|payload[_-]?hash|object[_-]?key/i.test(JSON.stringify(commentA.body)), false);

      // R1 supersede: a second render creates v2; a comment against the v1-bound review item is
      // rejected with REVIEW_VERSION_STALE and the review item is archived. Prior comments are
      // preserved and the stale comment is not appended.
      const revised = await client.renderCompositionPlan(
        rendered.compositionPlanId,
        { workspaceId },
        { idempotencyKey: `runtime-r1-supersede-${userId}` }
      );
      assert.equal(revised.status, 202, JSON.stringify(revised.body));
      assert.equal(revised.body.finalVideo.version, 2);

      const stale = await client.addReviewComment(
        reviewItemId,
        { workspaceId, body: "Comment after supersede.", timestampMs: 5000, threadId: null },
        { idempotencyKey: `runtime-r1-stale-${userId}` }
      );
      assert.equal(stale.status, 409, JSON.stringify(stale.body));
      assert.equal(stale.body.code, "REVIEW_VERSION_STALE");

      const archivedEvidence = queryScalar(
        db,
        `SELECT status::text FROM review_items WHERE id = '${reviewItemId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(archivedEvidence, "ARCHIVED", "superseded review item is archived under RLS");

      const preservedComments = queryScalar(
        db,
        `SELECT count(*)::text FROM review_comments WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${reviewItemId}'::uuid`
      );
      assert.equal(preservedComments, "2", "prior comments are preserved after archive");

      const staleCommentCount = queryScalar(
        db,
        `SELECT count(*)::text FROM review_comments WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${reviewItemId}'::uuid AND body = 'Comment after supersede.'`
      );
      assert.equal(staleCommentCount, "0", "a stale comment is not appended");

      // R1 cross-workspace: another workspace cannot open a review item for this final video,
      // comment on this review item, or fetch it; existence is hidden behind the same 404 and the
      // owning workspace id never leaks.
      const otherCreated = await other.createWorkspace(
        { name: `Runtime R1 other ${Date.now()}` },
        { idempotencyKey: `runtime-r1-ws-other-${userId}` }
      );
      const otherWorkspaceId = otherCreated.body.workspace.id;

      const crossOpen = await other.createReviewItem(
        { workspaceId: otherWorkspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
        { idempotencyKey: `runtime-r1-cross-open-${userId}` }
      );
      assert.equal(crossOpen.status, 404);
      assert.equal(crossOpen.body.code, "WORKSPACE_ACCESS_DENIED");

      const crossComment = await other.addReviewComment(
        reviewItemId,
        { workspaceId: otherWorkspaceId, body: "Cross comment.", timestampMs: 0, threadId: null },
        { idempotencyKey: `runtime-r1-cross-comment-${userId}` }
      );
      assert.equal(crossComment.status, 404);
      assert.equal(crossComment.body.code, "WORKSPACE_ACCESS_DENIED");

      const crossGet = await other.getReviewItem(reviewItemId, { workspaceId: otherWorkspaceId });
      assert.equal(crossGet.status, 404);
      assert.equal(crossGet.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(crossGet.body).includes(workspaceId), false);
    }
  );
});

test("prisma runtime persists V0-R2 auditable approval bound to final media under RLS", {
  timeout: 60000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime R2 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: "runtime-heygen-simulator-secret",
      V0_C2_SIMULATOR_MODE: "success"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });
      const rendered = await prepareRenderedFinalVideo(client, "Runtime R2");
      const workspaceId = rendered.workspaceId;

      // R2 approve: one terminal decision is recorded against a review item bound to the exact
      // final-video version, capturing the actor, reason, timestamp and the bound final-media
      // fingerprint. An approve persists a deterministic approval token and moves the review item
      // to APPROVED; one review.decision_recorded audit is retained.
      const created = await client.createReviewItem(
        { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "client_review" },
        { idempotencyKey: `runtime-r2-open-${userId}` }
      );
      assert.equal(created.status, 202, JSON.stringify(created.body));
      const reviewItemId = created.body.reviewItem.id;

      const approved = await client.recordReviewDecision(
        reviewItemId,
        { workspaceId, decision: "approve", reason: "Approved for scheduling.", expectedFinalVideoVersion: rendered.finalVideoVersion },
        { idempotencyKey: `runtime-r2-approve-${userId}` }
      );
      assert.equal(approved.status, 202, JSON.stringify(approved.body));
      assert.equal(approved.body.decision.decision, "approve");
      assert.equal(approved.body.decision.finalVideoSha256, rendered.finalVideoSha256);
      assert.equal(approved.body.decision.finalVideoVersion, rendered.finalVideoVersion);
      assert.equal(approved.body.reviewItem.status, "approved");
      assert.ok(approved.body.approvalReference, "approve must produce an approval reference");
      const approvalToken = approved.body.approvalReference.token;

      const decisionEvidence = queryScalar(
        db,
        `SELECT decision::text || ':' || final_video_version::text || ':' || final_video_sha256 || ':' || approval_token FROM review_decisions WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${reviewItemId}'::uuid AND final_video_id = '${rendered.finalVideoId}'::uuid AND decided_by_user_id = '${userId}'::uuid`
      );
      assert.equal(
        decisionEvidence,
        `APPROVE:${rendered.finalVideoVersion}:${rendered.finalVideoSha256}:${approvalToken}`,
        "one approve decision bound to the exact final-video version under RLS"
      );

      const decisionCount = queryScalar(
        db,
        `SELECT count(*)::text FROM review_decisions WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${reviewItemId}'::uuid`
      );
      assert.equal(decisionCount, "1", "exactly one terminal decision per review item");

      const statusEvidence = queryScalar(
        db,
        `SELECT status::text FROM review_items WHERE id = '${reviewItemId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(statusEvidence, "APPROVED", "approved review item is APPROVED under RLS");

      const decisionAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'review.decision_recorded' AND target_type = 'ReviewItem' AND target_id = '${reviewItemId}'::uuid`
      );
      assert.equal(decisionAudit, "1", "review.decision_recorded audit retained once");

      // R2 replay: the same idempotency key with the same input returns the original decision and
      // approval token (no second decision row, no second audit).
      const replay = await client.recordReviewDecision(
        reviewItemId,
        { workspaceId, decision: "approve", reason: "Approved for scheduling.", expectedFinalVideoVersion: rendered.finalVideoVersion },
        { idempotencyKey: `runtime-r2-approve-${userId}` }
      );
      assert.equal(replay.status, 202, JSON.stringify(replay.body));
      assert.equal(replay.body.decision.id, approved.body.decision.id);
      assert.equal(replay.body.approvalReference.token, approvalToken);

      // R2 idempotency conflict: the same key with different input is a conflict, never a second
      // decision.
      const conflict = await client.recordReviewDecision(
        reviewItemId,
        { workspaceId, decision: "reject", reason: "Changed my mind.", expectedFinalVideoVersion: rendered.finalVideoVersion },
        { idempotencyKey: `runtime-r2-approve-${userId}` }
      );
      assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
      assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");

      // R2 already recorded: a fresh key for the same review item/version is rejected.
      const second = await client.recordReviewDecision(
        reviewItemId,
        { workspaceId, decision: "reject", reason: "Second attempt.", expectedFinalVideoVersion: rendered.finalVideoVersion },
        { idempotencyKey: `runtime-r2-second-${userId}` }
      );
      assert.equal(second.status, 409, JSON.stringify(second.body));
      assert.equal(second.body.code, "REVIEW_DECISION_ALREADY_RECORDED");

      const stillOneDecision = queryScalar(
        db,
        `SELECT count(*)::text FROM review_decisions WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${reviewItemId}'::uuid`
      );
      assert.equal(stillOneDecision, "1", "a rejected second attempt writes no second decision");

      // R2 reject: a new revision gets its own review item; a reject moves it to REJECTED and
      // produces no approval token.
      const revised2 = await client.renderCompositionPlan(
        rendered.compositionPlanId,
        { workspaceId },
        { idempotencyKey: `runtime-r2-rev2-${userId}` }
      );
      assert.equal(revised2.status, 202, JSON.stringify(revised2.body));
      const itemB = await client.createReviewItem(
        { workspaceId, finalVideoId: revised2.body.finalVideo.id, reviewStage: "internal_review" },
        { idempotencyKey: `runtime-r2-open-b-${userId}` }
      );
      const rejected = await client.recordReviewDecision(
        itemB.body.reviewItem.id,
        { workspaceId, decision: "reject", reason: "Brand colour is off.", expectedFinalVideoVersion: 2 },
        { idempotencyKey: `runtime-r2-reject-${userId}` }
      );
      assert.equal(rejected.status, 202, JSON.stringify(rejected.body));
      assert.equal(rejected.body.decision.decision, "reject");
      assert.equal(rejected.body.reviewItem.status, "rejected");
      assert.equal(rejected.body.approvalReference, null);

      // The persisted reject decision stores no approval token: the token is minted only on
      // approve, so the system of record never carries approval evidence for a rejection.
      const rejectTokenEvidence = queryScalar(
        db,
        `SELECT approval_token IS NULL FROM review_decisions WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${itemB.body.reviewItem.id}'::uuid`
      );
      assert.equal(rejectTokenEvidence, "t", "a reject decision stores no approval token (NULL)");

      // R2 request_changes: a third revision gets its own review item; request_changes moves it
      // to CHANGE_REQUESTED and produces no approval token. Then a fourth revision supersedes it,
      // and a decision against the now-superseded bound version is rejected (REVIEW_VERSION_STALE)
      // and the review item is archived.
      const revised3 = await client.renderCompositionPlan(
        rendered.compositionPlanId,
        { workspaceId },
        { idempotencyKey: `runtime-r2-rev3-${userId}` }
      );
      const itemC = await client.createReviewItem(
        { workspaceId, finalVideoId: revised3.body.finalVideo.id, reviewStage: "client_review" },
        { idempotencyKey: `runtime-r2-open-c-${userId}` }
      );
      const changes = await client.recordReviewDecision(
        itemC.body.reviewItem.id,
        { workspaceId, decision: "request_changes", reason: "Tighten the lower-third.", expectedFinalVideoVersion: 3 },
        { idempotencyKey: `runtime-r2-changes-${userId}` }
      );
      assert.equal(changes.status, 202, JSON.stringify(changes.body));
      assert.equal(changes.body.decision.decision, "request_changes");
      assert.equal(changes.body.reviewItem.status, "change_requested");
      assert.equal(changes.body.approvalReference, null);

      // The persisted request_changes decision stores no approval token, mirroring reject.
      const changesTokenEvidence = queryScalar(
        db,
        `SELECT approval_token IS NULL FROM review_decisions WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${itemC.body.reviewItem.id}'::uuid`
      );
      assert.equal(changesTokenEvidence, "t", "a request_changes decision stores no approval token (NULL)");

      const revised4 = await client.renderCompositionPlan(
        rendered.compositionPlanId,
        { workspaceId },
        { idempotencyKey: `runtime-r2-rev4-${userId}` }
      );
      assert.equal(revised4.status, 202, JSON.stringify(revised4.body));

      const stale = await client.recordReviewDecision(
        itemC.body.reviewItem.id,
        { workspaceId, decision: "approve", reason: "Stale approve.", expectedFinalVideoVersion: 3 },
        { idempotencyKey: `runtime-r2-stale-${userId}` }
      );
      assert.equal(stale.status, 409, JSON.stringify(stale.body));
      assert.equal(stale.body.code, "REVIEW_VERSION_STALE");

      const archivedEvidence = queryScalar(
        db,
        `SELECT status::text FROM review_items WHERE id = '${itemC.body.reviewItem.id}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(archivedEvidence, "ARCHIVED", "superseded review item is archived under RLS");

      const noStaleDecision = queryScalar(
        db,
        `SELECT count(*)::text FROM review_decisions WHERE workspace_id = '${workspaceId}'::uuid AND review_item_id = '${itemC.body.reviewItem.id}'::uuid AND decision = 'APPROVE'`
      );
      assert.equal(noStaleDecision, "0", "a stale approve writes no decision");

      // No signed URL, secret or provider payload leaks from any decision response.
      assert.equal(/https?:\/\//i.test(JSON.stringify(approved.body)), false);
      assert.equal(/secret|api[_-]?key|signature|payload[_-]?hash|object[_-]?key/i.test(JSON.stringify(approved.body)), false);

      // R2 cross-workspace: another workspace cannot record a decision against this review item;
      // existence is hidden behind the same 404 and the owning workspace id never leaks.
      const otherCreated = await other.createWorkspace(
        { name: `Runtime R2 other ${Date.now()}` },
        { idempotencyKey: `runtime-r2-ws-other-${userId}` }
      );
      const otherWorkspaceId = otherCreated.body.workspace.id;

      const crossDecision = await other.recordReviewDecision(
        reviewItemId,
        { workspaceId: otherWorkspaceId, decision: "approve", reason: "Cross approve.", expectedFinalVideoVersion: rendered.finalVideoVersion },
        { idempotencyKey: `runtime-r2-cross-${userId}` }
      );
      assert.equal(crossDecision.status, 404, JSON.stringify(crossDecision.body));
      assert.equal(crossDecision.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(crossDecision.body).includes(workspaceId), false);
    }
  );
});

test("prisma runtime persists V0-U1 approved calendar and manual export fallback under RLS", {
  timeout: 60000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime U1 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: "runtime-heygen-simulator-secret",
      V0_C2_SIMULATOR_MODE: "success"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });
      const approved = await prepareApprovedFinalVideo(client, "Runtime U1");
      const workspaceId = approved.workspaceId;
      const approvalToken = approved.approvalToken;

      // U1 schedule: a scheduled post is created SCHEDULED, bound to the exact approved version, with
      // the IST offset respected, manual_live_url null and no export artifact.
      const scheduled = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken,
          platform: "meta",
          account: "sunrise-estates",
          caption: "New launch at Sunrise Estates.",
          scheduledAt: "2999-01-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u1-schedule-${userId}` }
      );
      assert.equal(scheduled.status, 202, JSON.stringify(scheduled.body));
      assert.equal(scheduled.body.calendarPost.status, "scheduled");
      assert.equal(scheduled.body.calendarPost.finalVideoVersion, approved.finalVideoVersion);
      assert.equal(scheduled.body.calendarPost.finalVideoSha256, approved.finalVideoSha256);
      assert.equal(scheduled.body.calendarPost.approvalToken, approvalToken);
      assert.equal(scheduled.body.calendarPost.manualLiveUrl, null);
      assert.equal(scheduled.body.calendarPost.exportArtifactId, null);
      assert.match(scheduled.body.calendarPost.scheduledAt, /^2999-01-01T03:30:00/);
      const calendarPostId = scheduled.body.calendarPost.id;

      const scheduledEvidence = queryScalar(
        db,
        `SELECT status::text || ':' || final_video_version::text || ':' || final_video_sha256 || ':' || approval_token || ':' || coalesce(manual_live_url, 'null') || ':' || coalesce(export_artifact_id::text, 'null') FROM calendar_posts WHERE id = '${calendarPostId}'::uuid AND workspace_id = '${workspaceId}'::uuid AND created_by_user_id = '${userId}'::uuid`
      );
      assert.equal(
        scheduledEvidence,
        `SCHEDULED:${approved.finalVideoVersion}:${approved.finalVideoSha256}:${approvalToken}:null:null`,
        "one scheduled calendar post bound to the exact approved version under RLS"
      );

      const scheduledAtEvidence = queryScalar(
        db,
        `SELECT scheduled_at::text FROM calendar_posts WHERE id = '${calendarPostId}'::uuid`
      );
      assert.match(scheduledAtEvidence, /^2999-01-01 03:30:00/, "IST offset respected in stored scheduled_at");

      const scheduleAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'calendar.post_created' AND target_type = 'CalendarPost' AND target_id = '${calendarPostId}'::uuid AND reason = 'scheduled'`
      );
      assert.equal(scheduleAudit, "1", "calendar.post_created (scheduled) audit retained once");

      // U1 replay: the same idempotency key with the same input returns the same post (no second row).
      const replay = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken,
          platform: "meta",
          account: "sunrise-estates",
          caption: "New launch at Sunrise Estates.",
          scheduledAt: "2999-01-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u1-schedule-${userId}` }
      );
      assert.equal(replay.status, 202, JSON.stringify(replay.body));
      assert.equal(replay.body.calendarPost.id, calendarPostId);

      // U1 idempotency conflict: the same key with different input is a conflict, never a second post.
      const conflict = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken,
          platform: "meta",
          account: "sunrise-estates",
          caption: "Different caption.",
          scheduledAt: "2999-01-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u1-schedule-${userId}` }
      );
      assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
      assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");

      const stillOneScheduled = queryScalar(
        db,
        `SELECT count(*)::text FROM calendar_posts WHERE workspace_id = '${workspaceId}'::uuid AND platform = 'meta' AND account = 'sunrise-estates'`
      );
      assert.equal(stillOneScheduled, "1", "a rejected idempotency conflict writes no second post");

      // U1 schedule conflict: a second scheduled post for the same workspace + platform + account
      // within the conflict window is rejected (PUBLISH_SCHEDULE_INVALID).
      const scheduleConflict = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken,
          platform: "meta",
          account: "sunrise-estates",
          caption: "Conflict caption.",
          scheduledAt: "2999-01-01T09:00:30+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u1-conflict-${userId}` }
      );
      assert.equal(scheduleConflict.status, 422, JSON.stringify(scheduleConflict.body));
      assert.equal(scheduleConflict.body.code, "PUBLISH_SCHEDULE_INVALID");

      // U1 edit (V0-U1 fix): an editable pre-submit scheduled post can be edited via PATCH with
      // optimistic concurrency; the version bumps, the audit is retained and the DB row updates.
      const editRes = await client.updateCalendarPost(
        calendarPostId,
        {
          workspaceId,
          calendarPostId,
          expectedVersion: 1,
          caption: "Edited launch caption."
        },
        { idempotencyKey: `runtime-u1-edit-${userId}` }
      );
      assert.equal(editRes.status, 202, JSON.stringify(editRes.body));
      assert.equal(editRes.body.calendarPost.id, calendarPostId);
      assert.equal(editRes.body.calendarPost.version, 2);
      assert.equal(editRes.body.calendarPost.caption, "Edited launch caption.");
      assert.equal(editRes.body.calendarPost.status, "scheduled");

      const editEvidence = queryScalar(
        db,
        `SELECT version::text || ':' || caption || ':' || status::text FROM calendar_posts WHERE id = '${calendarPostId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(editEvidence, "2:Edited launch caption.:SCHEDULED", "edit bumped version and updated the row under RLS");

      const editAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'calendar.post_updated' AND target_type = 'CalendarPost' AND target_id = '${calendarPostId}'::uuid`
      );
      assert.equal(editAudit, "1", "calendar.post_updated audit retained once");

      // U1 stale version: an edit with a stale expectedVersion is rejected (RESOURCE_VERSION_STALE)
      // and writes no second version bump.
      const staleVersion = await client.updateCalendarPost(
        calendarPostId,
        {
          workspaceId,
          calendarPostId,
          expectedVersion: 1,
          caption: "Stale edit caption."
        },
        { idempotencyKey: `runtime-u1-edit-stale-${userId}` }
      );
      assert.equal(staleVersion.status, 409, JSON.stringify(staleVersion.body));
      assert.equal(staleVersion.body.code, "RESOURCE_VERSION_STALE");

      const staleVersionEvidence = queryScalar(
        db,
        `SELECT version::text FROM calendar_posts WHERE id = '${calendarPostId}'::uuid`
      );
      assert.equal(staleVersionEvidence, "2", "a stale-version edit writes no further version bump");

      // U1 concurrent schedule conflict (V0-U1 fix): N concurrent creates for the same fresh
      // account and 60-second window, each with a distinct idempotency key, must produce exactly
      // one scheduled post. The transaction-scoped advisory lock serialises the concurrent creates
      // so the app-level window check is authoritative under concurrency.
      const concurrentAccount = "sunrise-estates-concurrent";
      const concurrentScheduledAt = "2999-07-01T09:00:00+05:30";
      const concurrentCount = 6;
      const concurrentResults = await Promise.all(
        Array.from({ length: concurrentCount }, (_, i) =>
          client.createCalendarPost(
            {
              workspaceId,
              finalVideoId: approved.finalVideoId,
              approvalToken,
              platform: "meta",
              account: concurrentAccount,
              caption: `Concurrent ${i}.`,
              scheduledAt: concurrentScheduledAt,
              timezone: "Asia/Kolkata",
              manualExport: false
            },
            { idempotencyKey: `runtime-u1-concurrent-${userId}-${i}` }
          )
        )
      );
      const concurrentAccepted = concurrentResults.filter((r) => r.status === 202);
      const concurrentConflicts = concurrentResults.filter(
        (r) => r.status === 422 && r.body.code === "PUBLISH_SCHEDULE_INVALID"
      );
      assert.equal(
        concurrentAccepted.length,
        1,
        `exactly one concurrent create accepted: ${JSON.stringify(concurrentResults.map((r) => r.status))}`
      );
      assert.equal(concurrentConflicts.length, concurrentCount - 1, "the rest are schedule conflicts");
      const concurrentDbCount = queryScalar(
        db,
        `SELECT count(*)::text FROM calendar_posts WHERE workspace_id = '${workspaceId}'::uuid AND platform = 'meta' AND account = '${concurrentAccount}'`
      );
      assert.equal(concurrentDbCount, "1", "concurrent creates for the same window persisted exactly one post");

      // U1 manual export: a manual-export post is created APPROVED with no scheduled time and a
      // retained manual-export Artifact whose sha256 is the deterministic package hash.
      const manualCaption = "Manual export for Sunrise Estates.";
      const manual = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken,
          platform: "manual",
          account: "sunrise-estates-manual",
          caption: manualCaption,
          scheduledAt: null,
          timezone: "Asia/Kolkata",
          manualExport: true
        },
        { idempotencyKey: `runtime-u1-manual-${userId}` }
      );
      assert.equal(manual.status, 202, JSON.stringify(manual.body));
      assert.equal(manual.body.calendarPost.status, "approved");
      assert.equal(manual.body.calendarPost.scheduledAt, null);
      assert.equal(manual.body.calendarPost.manualLiveUrl, null);
      assert.ok(manual.body.exportArtifact, "manual export produces an export artifact");
      assert.equal(manual.body.exportArtifact.retentionClass, "manual-export");
      assert.equal(manual.body.exportArtifact.schemaVersion, "calendar.manual_export.v1");
      const exportArtifactId = manual.body.exportArtifact.id;
      const expectedPackageHash = createHash("sha256")
        .update(
          `manual-export:${workspaceId}:${approved.finalVideoId}:${approved.finalVideoVersion}:${approvalToken}:manual:sunrise-estates-manual:${manualCaption}`
        )
        .digest("hex");
      assert.equal(manual.body.exportArtifact.sha256, expectedPackageHash);

      const manualEvidence = queryScalar(
        db,
        `SELECT status::text || ':' || coalesce(scheduled_at::text, 'null') || ':' || coalesce(manual_live_url, 'null') || ':' || coalesce(export_artifact_id::text, 'null') FROM calendar_posts WHERE id = '${manual.body.calendarPost.id}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(
        manualEvidence,
        `APPROVED:null:null:${exportArtifactId}`,
        "one manual-export calendar post APPROVED with no schedule and a bound export artifact"
      );

      const artifactEvidence = queryScalar(
        db,
        `SELECT sha256 || ':' || retention_class || ':' || schema_version || ':' || status::text FROM artifacts WHERE id = '${exportArtifactId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(
        artifactEvidence,
        `${expectedPackageHash}:manual-export:calendar.manual_export.v1:CLEAN`,
        "manual-export artifact retained CLEAN with the deterministic package hash"
      );

      const manualAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'calendar.post_created' AND target_type = 'CalendarPost' AND target_id = '${manual.body.calendarPost.id}'::uuid AND reason = 'manual_export'`
      );
      assert.equal(manualAudit, "1", "calendar.post_created (manual_export) audit retained once");

      // U1 superseded media: a new revision supersedes the bound version; scheduling the old version
      // is rejected (PUBLISH_MEDIA_STALE) and writes no post.
      const revised = await client.renderCompositionPlan(
        approved.compositionPlanId,
        { workspaceId },
        { idempotencyKey: `runtime-u1-rev-${userId}` }
      );
      assert.equal(revised.status, 202, JSON.stringify(revised.body));

      const stale = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken,
          platform: "meta",
          account: "sunrise-estates-stale",
          caption: "Stale post.",
          scheduledAt: "2999-04-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u1-stale-${userId}` }
      );
      assert.equal(stale.status, 409, JSON.stringify(stale.body));
      assert.equal(stale.body.code, "PUBLISH_MEDIA_STALE");

      const noStalePost = queryScalar(
        db,
        `SELECT count(*)::text FROM calendar_posts WHERE workspace_id = '${workspaceId}'::uuid AND platform = 'meta' AND account = 'sunrise-estates-stale'`
      );
      assert.equal(noStalePost, "0", "a stale scheduling writes no post");

      // No signed URL, secret or provider payload leaks from any calendar response.
      assert.equal(/https?:\/\//i.test(JSON.stringify(scheduled.body)), false);
      assert.equal(/secret|api[_-]?key|signature|payload[_-]?hash|object[_-]?key/i.test(JSON.stringify(scheduled.body)), false);
      assert.equal(/https?:\/\//i.test(JSON.stringify(manual.body)), false);
      assert.equal(/secret|api[_-]?key|signature|payload[_-]?hash|object[_-]?key/i.test(JSON.stringify(manual.body)), false);

      // U1 cross-workspace: another workspace cannot schedule this workspace's approved final
      // video; existence is hidden behind the same 404 and the owning workspace id never leaks.
      const otherCreated = await other.createWorkspace(
        { name: `Runtime U1 other ${Date.now()}` },
        { idempotencyKey: `runtime-u1-ws-other-${userId}` }
      );
      const otherWorkspaceId = otherCreated.body.workspace.id;

      const cross = await other.createCalendarPost(
        {
          workspaceId: otherWorkspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken,
          platform: "meta",
          account: "sunrise-estates-cross",
          caption: "Cross post.",
          scheduledAt: "2999-05-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u1-cross-${userId}` }
      );
      assert.equal(cross.status, 404, JSON.stringify(cross.body));
      assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(cross.body).includes(workspaceId), false);
    }
  );
});

test("prisma runtime serializes two concurrent V0-U1 edits to one post into one success and one RESOURCE_VERSION_STALE under RLS", {
  timeout: 60000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime U1 concurrent-edit proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_HEYGEN_SIMULATOR_SECRET: "runtime-heygen-simulator-secret",
      V0_C2_SIMULATOR_MODE: "success"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const approved = await prepareApprovedFinalVideo(client, "Runtime U1 concurrent edit");
      const workspaceId = approved.workspaceId;

      const scheduled = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken: approved.approvalToken,
          platform: "meta",
          account: "sunrise-estates-edit-race",
          caption: "Concurrent edit race caption.",
          scheduledAt: "2999-08-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u1-edit-race-create-${userId}` }
      );
      assert.equal(scheduled.status, 202, JSON.stringify(scheduled.body));
      assert.equal(scheduled.body.calendarPost.version, 1);
      const calendarPostId = scheduled.body.calendarPost.id;

      // Two simultaneous edits with the SAME expectedVersion (1) and distinct idempotency keys. The
      // post-scoped transaction advisory lock (pg_advisory_xact_lock(hashtext(calendarPostId)),
      // acquired inside the RLS tx before the authoritative version re-read) serialises them: the
      // first commit bumps version to 2; the second re-reads under the lock, sees version 2 vs
      // expectedVersion 1 and returns RESOURCE_VERSION_STALE. The outcome is stable whether the
      // requests overlap or run back-to-back.
      const edits = await Promise.all([
        client.updateCalendarPost(
          calendarPostId,
          { workspaceId, calendarPostId, expectedVersion: 1, caption: "Concurrent edit A." },
          { idempotencyKey: `runtime-u1-edit-race-a-${userId}` }
        ),
        client.updateCalendarPost(
          calendarPostId,
          { workspaceId, calendarPostId, expectedVersion: 1, caption: "Concurrent edit B." },
          { idempotencyKey: `runtime-u1-edit-race-b-${userId}` }
        )
      ]);

      const successes = edits.filter((r) => r.status === 202);
      const stales = edits.filter((r) => r.status === 409 && r.body.code === "RESOURCE_VERSION_STALE");
      assert.equal(
        successes.length,
        1,
        `exactly one concurrent edit succeeds: ${JSON.stringify(edits.map((r) => r.status))}`
      );
      assert.equal(stales.length, 1, "exactly one concurrent edit is rejected as RESOURCE_VERSION_STALE");
      assert.equal(successes[0].body.calendarPost.version, 2, "the winning edit increments the version once to 2");

      // The winner is nondeterministic, so assert against whichever caption actually won.
      const winningCaption = successes[0].body.calendarPost.caption;
      const versionEvidence = queryScalar(
        db,
        `SELECT version::text || ':' || caption FROM calendar_posts WHERE id = '${calendarPostId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(
        versionEvidence,
        `2:${winningCaption}`,
        "the DB row holds version 2 (incremented exactly once) and the winning caption"
      );

      // Exactly one calendar.post_updated audit row is retained under RLS — the stale edit writes none.
      const editAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'calendar.post_updated' AND target_type = 'CalendarPost' AND target_id = '${calendarPostId}'::uuid`
      );
      assert.equal(editAudit, "1", "calendar.post_updated audit retained exactly once for the concurrent edits");

      // No public URL surfaces from a pre-publish edit success body (the success body has no
      // RFC 9457 problem detail; the 409 stale body's only https:// is the contract error-namespace
      // `type` URI, which is public by design, so the https scan is scoped to the success body).
      const successBody = JSON.stringify(successes[0].body);
      assert.equal(/https?:\/\//i.test(successBody), false, "no public URL surfaces from a pre-publish edit");
      // No secret, signed URL, object key or provider payload leaks from either edit response.
      for (const edit of edits) {
        assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(edit.body)), false);
      }
    }
  );
});

test("prisma runtime persists V0-U2 idempotent Meta publication, verified callback and reconcile under RLS", {
  timeout: 60000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime U2 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const metaSecret = "runtime-meta-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_META_SIMULATOR_SECRET: metaSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });
      const approved = await prepareApprovedFinalVideo(client, "Runtime U2");
      const workspaceId = approved.workspaceId;

      // U2 schedule: an approved scheduled post bound to the exact approved version and the
      // sunrise-estates account.
      const scheduled = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken: approved.approvalToken,
          platform: "meta",
          account: "sunrise-estates",
          caption: "New launch at Sunrise Estates.",
          scheduledAt: "2999-01-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u2-schedule-${userId}` }
      );
      assert.equal(scheduled.status, 202, JSON.stringify(scheduled.body));
      assert.equal(scheduled.body.calendarPost.status, "scheduled");
      const calendarPostId = scheduled.body.calendarPost.id;

      // U2 publish exactly once: a durable PublishOperation is persisted in SUBMITTING before
      // the Meta network I/O, then advanced to ACCEPTED with the external post id. The request
      // hash is a server-side binding secret and must not leak; the public post URL is null
      // until the post is live.
      const published = await client.publishCalendarPost(
        calendarPostId,
        { workspaceId, account: "sunrise-estates" },
        { idempotencyKey: `runtime-u2-publish-${userId}` }
      );
      assert.equal(published.status, 202, JSON.stringify(published.body));
      assert.equal(published.body.calendarPost.status, "accepted");
      assert.equal(published.body.operation.status, "accepted");
      assert.equal(published.body.operation.provider, "meta-simulator");
      assert.equal(published.body.operation.calendarPostId, calendarPostId);
      assert.ok(published.body.operation.externalId, "meta external post id is bound");
      assert.equal(published.body.operation.publicUrl, null, "public URL is not known until the post is live");
      assert.equal("requestHash" in published.body.operation, false);
      assert.equal(/request_hash|requestHash/.test(JSON.stringify(published.body)), false);
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|credential/i.test(JSON.stringify(published.body)), false);
      assert.equal(JSON.stringify(published.body).includes(metaSecret), false);
      const operationId = published.body.operation.id;

      // Prisma persistence under RLS: one ACCEPTED publish operation bound to the calendar
      // post with an external id and a retained request hash; the calendar post advanced to
      // ACCEPTED. The request hash is retained but never returned.
      const operationState = queryScalar(
        db,
        `SELECT count(*)::text || ':' || status::text || ':' || (external_id IS NOT NULL)::text || ':' || (request_hash IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text || ':' || (accepted_at IS NOT NULL)::text FROM publish_operations WHERE id = '${operationId}'::uuid AND workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid AND provider = 'meta-simulator' AND operation_type = 'publish_post' GROUP BY status, external_id, request_hash, public_url, accepted_at`
      );
      assert.equal(operationState, "1:ACCEPTED:true:true:false:true", JSON.stringify(published.body));

      const postAccepted = queryScalar(
        db,
        `SELECT status FROM calendar_posts WHERE id = '${calendarPostId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(postAccepted, "ACCEPTED", "calendar_posts.status is the uppercase Postgres enum label");

      const publishAudit = queryScalar(
        db,
        `SELECT count(*)::text FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND event_type = 'publish.state_changed' AND target_type = 'CalendarPost' AND target_id = '${calendarPostId}'::uuid AND reason = 'accepted'`
      );
      assert.equal(publishAudit, "1", "publish.state_changed (accepted) audit retained once");

      // U2 replay: the same idempotency key returns the existing operation and never creates a
      // second publish operation for this calendar post.
      const replay = await client.publishCalendarPost(
        calendarPostId,
        { workspaceId, account: "sunrise-estates" },
        { idempotencyKey: `runtime-u2-publish-${userId}` }
      );
      assert.equal(replay.status, 202, JSON.stringify(replay.body));
      assert.equal(replay.body.replay, true);
      assert.equal(replay.body.operation.id, operationId);
      const operationCount = queryScalar(
        db,
        `SELECT count(*)::text FROM publish_operations WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid`
      );
      assert.equal(operationCount, "1", "exactly one publish operation per calendar post");

      // U2 callback: a verified callback drives the operation to COMPLETED and the calendar
      // post to published_unverified exactly once; the public post URL is bound only here. A
      // replay is deduplicated to one inbox event.
      const callback = published.body.callback;
      assert.ok(callback?.envelope, "simulator surfaces a callback envelope");
      assert.ok(callback?.signature, "simulator surfaces a callback signature");
      assert.ok(callback.envelope.publicUrl, "the callback carries the public post URL");

      const acknowledged = await client.postPublishingCallback("meta", callback.envelope, callback.signature);
      assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
      assert.equal(acknowledged.body.operation.status, "completed");
      assert.equal(acknowledged.body.calendarPost.status, "published_unverified");
      assert.ok(acknowledged.body.operation.publicUrl, "public post URL is bound once the post is live");
      assert.ok(acknowledged.body.operation.completedAt, "completedAt is recorded");
      assert.equal(acknowledged.body.duplicate, false);

      const completedState = queryScalar(
        db,
        `SELECT status::text || ':' || (completed_at IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text FROM publish_operations WHERE id = '${operationId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(completedState, "COMPLETED:true:true");

      const postPublished = queryScalar(
        db,
        `SELECT status FROM calendar_posts WHERE id = '${calendarPostId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(postPublished, "PUBLISHED_UNVERIFIED", "calendar_posts.status is the uppercase Postgres enum label");

      const replayCallback = await client.postPublishingCallback("meta", callback.envelope, callback.signature);
      assert.equal(replayCallback.status, 200);
      assert.equal(replayCallback.body.duplicate, true);
      const inboxCount = queryScalar(
        db,
        `SELECT count(*)::text FROM inbox_events WHERE workspace_id = '${workspaceId}'::uuid AND source = 'meta' AND idempotency_key = '${callback.envelope.eventId}'`
      );
      assert.equal(inboxCount, "1", "a replayed callback is deduplicated to one inbox event");

      // No signed URL, secret or provider payload leaks from the publish or callback response.
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|credential/i.test(JSON.stringify(acknowledged.body)), false);
      assert.equal(JSON.stringify(acknowledged.body).includes(metaSecret), false);

      // U2 wrong account: a publish whose body account does not match the calendar post's
      // bound account is rejected (PUBLISH_ACCOUNT_MISMATCH) and never calls the provider. A
      // fresh post is used so no prior operation interferes.
      const accountPost = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken: approved.approvalToken,
          platform: "meta",
          account: "sunrise-estates-account",
          caption: "Account post.",
          scheduledAt: "2999-02-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u2-schedule-account-${userId}` }
      );
      assert.equal(accountPost.status, 202, JSON.stringify(accountPost.body));
      const wrong = await client.publishCalendarPost(
        accountPost.body.calendarPost.id,
        { workspaceId, account: "sunrise-estates-wrong" },
        { idempotencyKey: `runtime-u2-wrong-account-${userId}` }
      );
      assert.equal(wrong.status, 409, JSON.stringify(wrong.body));
      assert.equal(wrong.body.code, "PUBLISH_ACCOUNT_MISMATCH");
      const noWrongOp = queryScalar(
        db,
        `SELECT count(*)::text FROM publish_operations WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${accountPost.body.calendarPost.id}'::uuid`
      );
      assert.equal(noWrongOp, "0", "a rejected wrong-account publish writes no operation");
      const correct = await client.publishCalendarPost(
        accountPost.body.calendarPost.id,
        { workspaceId, account: "sunrise-estates-account" },
        { idempotencyKey: `runtime-u2-correct-account-${userId}` }
      );
      assert.equal(correct.status, 202, JSON.stringify(correct.body));
      assert.equal(correct.body.operation.status, "accepted");

      // U2 manual export: a manual-export post cannot be submitted to a provider
      // (PUBLISH_NOT_SUBMITTABLE).
      const manual = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken: approved.approvalToken,
          platform: "manual",
          account: "sunrise-estates-manual",
          caption: "Manual export.",
          scheduledAt: null,
          timezone: "Asia/Kolkata",
          manualExport: true
        },
        { idempotencyKey: `runtime-u2-manual-${userId}` }
      );
      assert.equal(manual.status, 202, JSON.stringify(manual.body));
      const manualPublish = await client.publishCalendarPost(
        manual.body.calendarPost.id,
        { workspaceId, account: "sunrise-estates-manual" },
        { idempotencyKey: `runtime-u2-manual-publish-${userId}` }
      );
      assert.equal(manualPublish.status, 409, JSON.stringify(manualPublish.body));
      assert.equal(manualPublish.body.code, "PUBLISH_NOT_SUBMITTABLE");
      const noManualOp = queryScalar(
        db,
        `SELECT count(*)::text FROM publish_operations WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${manual.body.calendarPost.id}'::uuid`
      );
      assert.equal(noManualOp, "0", "a rejected manual-export publish writes no operation");

      // U2 timeout: a timeout after possible acceptance is unknown; the calendar post stays
      // submitting. Reconciliation resolves it to completed without resubmitting, advancing
      // the post to published_unverified and recording reconciledAt.
      const timeoutEnv = { ...env, V0_META_SIMULATOR_MODE: "timeout" };
      await withApiServer(
        {
          ...timeoutEnv,
          APP_ENV: "test",
          APP_VERSION: "test",
          V0_RUNTIME_DB: "prisma",
          V0_EXPOSE_TEST_ERRORS: "1",
          V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
          SUPABASE_JWT_SECRET: jwtSecret,
          V0_META_SIMULATOR_SECRET: metaSecret
        },
        async ({ baseUrl: timeoutBaseUrl }) => {
          const timeoutClient = new V0Client({ baseUrl: timeoutBaseUrl, authToken: signJwt(userId) });
          const timeoutApproved = await prepareApprovedFinalVideo(timeoutClient, "Runtime U2 timeout");
          const timeoutWorkspaceId = timeoutApproved.workspaceId;
          const timeoutPost = await timeoutClient.createCalendarPost(
            {
              workspaceId: timeoutWorkspaceId,
              finalVideoId: timeoutApproved.finalVideoId,
              approvalToken: timeoutApproved.approvalToken,
              platform: "meta",
              account: "sunrise-estates-timeout",
              caption: "Timeout post.",
              scheduledAt: "2999-03-01T09:00:00+05:30",
              timezone: "Asia/Kolkata",
              manualExport: false
            },
            { idempotencyKey: `runtime-u2-schedule-timeout-${userId}` }
          );
          assert.equal(timeoutPost.status, 202, JSON.stringify(timeoutPost.body));
          const timeoutPostId = timeoutPost.body.calendarPost.id;

          const unknown = await timeoutClient.publishCalendarPost(
            timeoutPostId,
            { workspaceId: timeoutWorkspaceId, account: "sunrise-estates-timeout" },
            { idempotencyKey: `runtime-u2-publish-timeout-${userId}` }
          );
          assert.equal(unknown.status, 202, JSON.stringify(unknown.body));
          assert.equal(unknown.body.unknown, true);
          assert.equal(unknown.body.operation.status, "unknown");
          assert.equal(unknown.body.calendarPost.status, "submitting");
          assert.equal(unknown.body.callback, undefined, "no callback is surfaced for an unknown operation");

          const unknownState = queryScalar(
            db,
            `SELECT status::text || ':' || (external_id IS NULL)::text FROM publish_operations WHERE id = '${unknown.body.operation.id}'::uuid AND workspace_id = '${timeoutWorkspaceId}'::uuid AND calendar_post_id = '${timeoutPostId}'::uuid`
          );
          assert.equal(unknownState, "UNKNOWN:true");

          const reconciled = await timeoutClient.reconcilePublishOperation(
            timeoutPostId,
            { workspaceId: timeoutWorkspaceId, reconcileOutcome: "completed" },
            { idempotencyKey: `runtime-u2-reconcile-timeout-${userId}` }
          );
          assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
          assert.equal(reconciled.body.operation.status, "completed");
          assert.equal(reconciled.body.calendarPost.status, "published_unverified");
          assert.ok(reconciled.body.operation.reconciledAt, "reconciledAt is recorded");
          assert.ok(reconciled.body.operation.publicUrl, "public URL is bound on reconciliation");

          const reconciledState = queryScalar(
            db,
            `SELECT status::text || ':' || (reconciled_at IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text FROM publish_operations WHERE id = '${unknown.body.operation.id}'::uuid AND workspace_id = '${timeoutWorkspaceId}'::uuid`
          );
          assert.equal(reconciledState, "COMPLETED:true:true");

          // Re-reconciliation is a replay (terminal operation).
          const rereconcile = await timeoutClient.reconcilePublishOperation(
            timeoutPostId,
            { workspaceId: timeoutWorkspaceId },
            { idempotencyKey: `runtime-u2-reconcile-timeout-2-${userId}` }
          );
          assert.equal(rereconcile.status, 200);
          assert.equal(rereconcile.body.replay, true);
        }
      );

      // U2 cross-workspace: another workspace cannot publish this workspace's calendar post;
      // existence is hidden behind the same 404 and the owning workspace id never leaks.
      const otherCreated = await other.createWorkspace(
        { name: `Runtime U2 other ${Date.now()}` },
        { idempotencyKey: `runtime-u2-ws-other-${userId}` }
      );
      const cross = await other.publishCalendarPost(
        calendarPostId,
        { workspaceId: otherCreated.body.workspace.id, account: "sunrise-estates" },
        { idempotencyKey: `runtime-u2-cross-${userId}` }
      );
      assert.equal(cross.status, 404, JSON.stringify(cross.body));
      assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(cross.body).includes(workspaceId), false);
    }
  );
});

test("prisma runtime persists V0-U3 idempotent YouTube Shorts publication, quota, processing and reconcile under RLS", {
  timeout: 60000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime U3 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const youtubeSecret = "runtime-youtube-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_YOUTUBE_SIMULATOR_SECRET: youtubeSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const approved = await prepareApprovedFinalVideo(client, "Runtime U3");
      const workspaceId = approved.workspaceId;

      // U3 schedule: an approved scheduled YouTube Shorts post bound to the exact approved version
      // and the sunrise-estates-yt account.
      const scheduled = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken: approved.approvalToken,
          platform: "youtube-shorts",
          account: "sunrise-estates-yt",
          caption: "New launch at Sunrise Estates. #shorts",
          scheduledAt: "2999-01-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u3-schedule-${userId}` }
      );
      assert.equal(scheduled.status, 202, JSON.stringify(scheduled.body));
      assert.equal(scheduled.body.calendarPost.status, "scheduled");
      const calendarPostId = scheduled.body.calendarPost.id;

      // U3 publish exactly once: the provider is derived server-side from the platform
      // (youtube-shorts -> youtube-simulator). A durable PublishOperation is persisted SUBMITTING
      // before the YouTube network I/O, then advanced to ACCEPTED with the external post id. The
      // request hash is a server-side binding secret and must not leak; the public short URL is
      // null until the post is live.
      const published = await client.publishCalendarPost(
        calendarPostId,
        { workspaceId, account: "sunrise-estates-yt" },
        { idempotencyKey: `runtime-u3-publish-${userId}` }
      );
      assert.equal(published.status, 202, JSON.stringify(published.body));
      assert.equal(published.body.calendarPost.status, "accepted");
      assert.equal(published.body.operation.status, "accepted");
      assert.equal(published.body.operation.provider, "youtube-simulator");
      assert.equal(published.body.operation.calendarPostId, calendarPostId);
      assert.ok(published.body.operation.externalId, "youtube external post id is bound");
      assert.equal(published.body.operation.publicUrl, null, "public short URL is not known until the post is live");
      assert.equal("requestHash" in published.body.operation, false);
      assert.equal(/request_hash|requestHash/.test(JSON.stringify(published.body)), false);
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|credential/i.test(JSON.stringify(published.body)), false);
      assert.equal(JSON.stringify(published.body).includes(youtubeSecret), false);
      const operationId = published.body.operation.id;

      // Prisma persistence under RLS: one ACCEPTED publish operation bound to the calendar post
      // for the youtube-simulator provider; the calendar post advanced to ACCEPTED. The request
      // hash is retained but never returned.
      const operationState = queryScalar(
        db,
        `SELECT count(*)::text || ':' || status::text || ':' || (external_id IS NOT NULL)::text || ':' || (request_hash IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text || ':' || (accepted_at IS NOT NULL)::text FROM publish_operations WHERE id = '${operationId}'::uuid AND workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid AND provider = 'youtube-simulator' AND operation_type = 'publish_post' GROUP BY status, external_id, request_hash, public_url, accepted_at`
      );
      assert.equal(operationState, "1:ACCEPTED:true:true:false:true", JSON.stringify(published.body));

      const postAccepted = queryScalar(
        db,
        `SELECT status FROM calendar_posts WHERE id = '${calendarPostId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(postAccepted, "ACCEPTED", "calendar_posts.status is the uppercase Postgres enum label");

      // U3 callback: a verified YouTube callback (x-youtube-signature) drives the operation to
      // COMPLETED and the calendar post to published_unverified exactly once; the public short URL
      // is bound only here. A replay is deduplicated to one inbox event with source 'youtube'.
      const callback = published.body.callback;
      assert.ok(callback?.envelope, "simulator surfaces a callback envelope");
      assert.ok(callback?.signature, "simulator surfaces a callback signature");
      assert.ok(callback.envelope.publicUrl, "the callback carries the public short URL");

      const acknowledged = await client.postPublishingCallback("youtube", callback.envelope, callback.signature);
      assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
      assert.equal(acknowledged.body.operation.status, "completed");
      assert.equal(acknowledged.body.calendarPost.status, "published_unverified");
      assert.ok(acknowledged.body.operation.publicUrl, "public short URL is bound once the post is live");
      assert.ok(acknowledged.body.operation.publicUrl.startsWith("https://youtube.example.test/shorts/"), "youtube public URL format");
      assert.ok(acknowledged.body.operation.completedAt, "completedAt is recorded");
      assert.equal(acknowledged.body.duplicate, false);

      const completedState = queryScalar(
        db,
        `SELECT status::text || ':' || (completed_at IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text FROM publish_operations WHERE id = '${operationId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(completedState, "COMPLETED:true:true");

      const replayCallback = await client.postPublishingCallback("youtube", callback.envelope, callback.signature);
      assert.equal(replayCallback.status, 200);
      assert.equal(replayCallback.body.duplicate, true);
      const inboxCount = queryScalar(
        db,
        `SELECT count(*)::text FROM inbox_events WHERE workspace_id = '${workspaceId}'::uuid AND source = 'youtube' AND idempotency_key = '${callback.envelope.eventId}'`
      );
      assert.equal(inboxCount, "1", "a replayed YouTube callback is deduplicated to one inbox event");

      // No signed URL, secret or provider payload leaks from the publish or callback response.
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|credential/i.test(JSON.stringify(acknowledged.body)), false);
      assert.equal(JSON.stringify(acknowledged.body).includes(youtubeSecret), false);

      // U3 quota exhaustion: an exhausted YouTube upload quota is a pre-flight refusal (429) with
      // a retry-after, runs before any network I/O and writes no operation row. A fresh server with
      // V0_YOUTUBE_SIMULATOR_QUOTA=exhausted is used so the happy-path server is not disturbed.
      const quotaEnv = { ...env, V0_YOUTUBE_SIMULATOR_QUOTA: "exhausted" };
      await withApiServer(
        {
          ...quotaEnv,
          APP_ENV: "test",
          APP_VERSION: "test",
          V0_RUNTIME_DB: "prisma",
          V0_EXPOSE_TEST_ERRORS: "1",
          V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
          SUPABASE_JWT_SECRET: jwtSecret,
          V0_YOUTUBE_SIMULATOR_SECRET: youtubeSecret
        },
        async ({ baseUrl: quotaBaseUrl }) => {
          const quotaClient = new V0Client({ baseUrl: quotaBaseUrl, authToken: signJwt(userId) });
          const quotaApproved = await prepareApprovedFinalVideo(quotaClient, "Runtime U3 quota");
          const quotaWorkspaceId = quotaApproved.workspaceId;
          const quotaPost = await quotaClient.createCalendarPost(
            {
              workspaceId: quotaWorkspaceId,
              finalVideoId: quotaApproved.finalVideoId,
              approvalToken: quotaApproved.approvalToken,
              platform: "youtube-shorts",
              account: "sunrise-estates-yt-quota",
              caption: "Quota post.",
              scheduledAt: "2999-04-01T09:00:00+05:30",
              timezone: "Asia/Kolkata",
              manualExport: false
            },
            { idempotencyKey: `runtime-u3-schedule-quota-${userId}` }
          );
          assert.equal(quotaPost.status, 202, JSON.stringify(quotaPost.body));
          const exhausted = await quotaClient.publishCalendarPost(
            quotaPost.body.calendarPost.id,
            { workspaceId: quotaWorkspaceId, account: "sunrise-estates-yt-quota" },
            { idempotencyKey: `runtime-u3-publish-quota-${userId}` }
          );
          assert.equal(exhausted.status, 429, JSON.stringify(exhausted.body));
          assert.equal(exhausted.body.code, "PUBLISH_QUOTA_EXHAUSTED");
          assert.ok(exhausted.body.retryAfterMs && exhausted.body.retryAfterMs > 0, "a retry-after is surfaced");
          const noQuotaOp = queryScalar(
            db,
            `SELECT count(*)::text FROM publish_operations WHERE workspace_id = '${quotaWorkspaceId}'::uuid AND calendar_post_id = '${quotaPost.body.calendarPost.id}'::uuid`
          );
          assert.equal(noQuotaOp, "0", "a pre-flight quota refusal writes no operation");
        }
      );

      // U3 processing: a YouTube upload accepted but still processing moves the operation to
      // PROCESSING while the post stays ACCEPTED; a publish.processing callback keeps it
      // processing, then reconciliation drives it to completed with the public short URL bound.
      const processingEnv = { ...env, V0_YOUTUBE_SIMULATOR_MODE: "processing" };
      await withApiServer(
        {
          ...processingEnv,
          APP_ENV: "test",
          APP_VERSION: "test",
          V0_RUNTIME_DB: "prisma",
          V0_EXPOSE_TEST_ERRORS: "1",
          V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
          SUPABASE_JWT_SECRET: jwtSecret,
          V0_YOUTUBE_SIMULATOR_SECRET: youtubeSecret
        },
        async ({ baseUrl: processingBaseUrl }) => {
          const processingClient = new V0Client({ baseUrl: processingBaseUrl, authToken: signJwt(userId) });
          const processingApproved = await prepareApprovedFinalVideo(processingClient, "Runtime U3 processing");
          const processingWorkspaceId = processingApproved.workspaceId;
          const processingPost = await processingClient.createCalendarPost(
            {
              workspaceId: processingWorkspaceId,
              finalVideoId: processingApproved.finalVideoId,
              approvalToken: processingApproved.approvalToken,
              platform: "youtube-shorts",
              account: "sunrise-estates-yt-processing",
              caption: "Processing post.",
              scheduledAt: "2999-05-01T09:00:00+05:30",
              timezone: "Asia/Kolkata",
              manualExport: false
            },
            { idempotencyKey: `runtime-u3-schedule-processing-${userId}` }
          );
          assert.equal(processingPost.status, 202, JSON.stringify(processingPost.body));
          const processingPostId = processingPost.body.calendarPost.id;

          const processingPublish = await processingClient.publishCalendarPost(
            processingPostId,
            { workspaceId: processingWorkspaceId, account: "sunrise-estates-yt-processing" },
            { idempotencyKey: `runtime-u3-publish-processing-${userId}` }
          );
          assert.equal(processingPublish.status, 202, JSON.stringify(processingPublish.body));
          assert.equal(processingPublish.body.operation.status, "processing");
          assert.equal(processingPublish.body.calendarPost.status, "accepted");
          assert.ok(processingPublish.body.operation.externalId, "external id is bound on acceptance");
          assert.ok(processingPublish.body.operation.acceptedAt, "acceptedAt is recorded on acceptance");
          assert.equal(processingPublish.body.operation.publicUrl, null, "no public URL while processing");
          const processingOperationId = processingPublish.body.operation.id;

          const processingState = queryScalar(
            db,
            `SELECT status::text || ':' || (external_id IS NOT NULL)::text || ':' || (accepted_at IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text FROM publish_operations WHERE id = '${processingOperationId}'::uuid AND workspace_id = '${processingWorkspaceId}'::uuid AND provider = 'youtube-simulator'`
          );
          assert.equal(processingState, "PROCESSING:true:true:false");

          // A publish.processing callback keeps the operation processing and the post accepted.
          const processingCallback = processingPublish.body.callback;
          assert.equal(processingCallback.envelope.eventType, "publish.processing");
          const processingAck = await processingClient.postPublishingCallback(
            "youtube",
            processingCallback.envelope,
            processingCallback.signature
          );
          assert.equal(processingAck.status, 200, JSON.stringify(processingAck.body));
          assert.equal(processingAck.body.operation.status, "processing");
          assert.equal(processingAck.body.calendarPost.status, "accepted");
          assert.equal(processingAck.body.operation.publicUrl, null, "still no public URL while processing");

          // Reconciliation resolves the processing operation to completed without resubmitting;
          // the public short URL is bound and the post advances to published_unverified.
          const reconciled = await processingClient.reconcilePublishOperation(
            processingPostId,
            { workspaceId: processingWorkspaceId, reconcileOutcome: "completed" },
            { idempotencyKey: `runtime-u3-reconcile-processing-${userId}` }
          );
          assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
          assert.equal(reconciled.body.operation.status, "completed");
          assert.equal(reconciled.body.calendarPost.status, "published_unverified");
          assert.ok(reconciled.body.operation.reconciledAt, "reconciledAt is recorded");
          assert.ok(reconciled.body.operation.publicUrl, "public short URL is bound on reconciliation");

          const reconciledState = queryScalar(
            db,
            `SELECT status::text || ':' || (reconciled_at IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text FROM publish_operations WHERE id = '${processingOperationId}'::uuid AND workspace_id = '${processingWorkspaceId}'::uuid`
          );
          assert.equal(reconciledState, "COMPLETED:true:true");
        }
      );

      // U3 unsupported platform: a platform with no V0 publish adapter (tiktok; Direct Post is
      // out of scope) is rejected with PUBLISH_PLATFORM_UNSUPPORTED before any network I/O and
      // writes no operation row. The platform is a free VarChar(40) at create time, so the post is
      // creatable but not publishable.
      const platformPost = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken: approved.approvalToken,
          platform: "tiktok",
          account: "sunrise-estates-tiktok",
          caption: "TikTok post.",
          scheduledAt: "2999-06-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u3-schedule-platform-${userId}` }
      );
      assert.equal(platformPost.status, 202, JSON.stringify(platformPost.body));
      const unsupported = await client.publishCalendarPost(
        platformPost.body.calendarPost.id,
        { workspaceId, account: "sunrise-estates-tiktok" },
        { idempotencyKey: `runtime-u3-publish-platform-${userId}` }
      );
      assert.equal(unsupported.status, 409, JSON.stringify(unsupported.body));
      assert.equal(unsupported.body.code, "PUBLISH_PLATFORM_UNSUPPORTED");
      const noPlatformOp = queryScalar(
        db,
        `SELECT count(*)::text FROM publish_operations WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${platformPost.body.calendarPost.id}'::uuid`
      );
      assert.equal(noPlatformOp, "0", "a rejected unsupported-platform publish writes no operation");
    }
  );
});

test("prisma runtime persists V0-U4 audience-facing verification, one notification and initial performance snapshot under RLS", {
  timeout: 60000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime U4 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const metaSecret = "runtime-meta-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_META_SIMULATOR_SECRET: metaSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const approved = await prepareApprovedFinalVideo(client, "Runtime U4");
      const workspaceId = approved.workspaceId;

      // U4 schedule + publish + verified callback to drive the post to published_unverified (live).
      const scheduled = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken: approved.approvalToken,
          platform: "meta",
          account: "sunrise-estates",
          caption: "New launch at Sunrise Estates.",
          scheduledAt: "2999-01-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-u4-schedule-${userId}` }
      );
      assert.equal(scheduled.status, 202, JSON.stringify(scheduled.body));
      const calendarPostId = scheduled.body.calendarPost.id;

      const published = await client.publishCalendarPost(
        calendarPostId,
        { workspaceId, account: "sunrise-estates" },
        { idempotencyKey: `runtime-u4-publish-${userId}` }
      );
      assert.equal(published.status, 202, JSON.stringify(published.body));
      const callback = published.body.callback;
      const acknowledged = await client.postPublishingCallback("meta", callback.envelope, callback.signature);
      assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
      assert.equal(acknowledged.body.calendarPost.status, "published_unverified");

      // U4 verify: the audience-facing live post is independently verified and the post advances to
      // published_verified. One PostVerification, one deduplicated completion notification, one
      // initial PerformanceSnapshot and one immutable audience evidence artifact are retained.
      const verified = await client.verifyCalendarPost(calendarPostId, { workspaceId });
      assert.equal(verified.status, 200, JSON.stringify(verified.body));
      assert.equal(verified.body.calendarPost.status, "published_verified");
      assert.equal(verified.body.replay, false);
      assert.equal(verified.body.verification.status, "verified");
      assert.equal(verified.body.verification.provider, "verify-simulator");
      assert.equal(verified.body.verification.accountMatched, true);
      assert.equal(verified.body.verification.mediaSha256Matched, true);
      assert.equal(verified.body.verification.captionMatched, true);
      assert.equal(verified.body.verification.visibility, "public");
      assert.ok(verified.body.verification.evidenceArtifactId, "evidence artifact is bound");
      assert.equal(verified.body.evidenceArtifact.sha256.length, 64, "evidence sha256 is a 64-char hex digest");
      assert.equal(verified.body.evidenceArtifact.objectKey, undefined, "the evidence object key never reaches the browser");
      assert.equal(verified.body.evidenceArtifact.schemaVersion, "calendar.verify_evidence.v1");
      assert.equal(verified.body.evidenceArtifact.retentionClass, "audience-evidence");
      assert.equal(verified.body.evidenceArtifact.status, "CLEAN");
      assert.equal(verified.body.notification.notificationType, "publish_completed");
      assert.equal(verified.body.notification.duplicateCollapsed, false);
      assert.equal("recipientUserId" in verified.body.notification, false, "recipient user id never leaks");
      assert.equal("payloadHash" in verified.body.notification, false, "payload hash never leaks");
      assert.ok(verified.body.performanceSnapshot.id, "an initial performance snapshot is retained");
      assert.equal(verified.body.performanceSnapshot.calendarPostId, calendarPostId);

      // No secret, signed URL, object key, recipient user id, payload hash or raw provider payload.
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(verified.body)), false);
      assert.equal(JSON.stringify(verified.body).includes(metaSecret), false);

      const verificationId = verified.body.verification.id;
      const notificationId = verified.body.notification.id;
      const evidenceArtifactId = verified.body.verification.evidenceArtifactId;

      // Prisma persistence under RLS: the calendar post advanced to PUBLISHED_VERIFIED; one
      // PostVerification row (VERIFIED, attempts 1, account/media matched, evidence bound) per
      // calendar post; one completion notification bound to the calendar post; one initial
      // PerformanceSnapshot; one CLEAN audience-evidence artifact. The uppercase Postgres enum
      // labels are the stored truth; the public mapper lowercases them.
      const postStatus = queryScalar(
        db,
        `SELECT status FROM calendar_posts WHERE id = '${calendarPostId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(postStatus, "PUBLISHED_VERIFIED", "calendar_posts.status is the uppercase Postgres enum label");

      const verificationState = queryScalar(
        db,
        `SELECT count(*)::text || ':' || status::text || ':' || attempts::text || ':' || (evidence_artifact_id IS NOT NULL)::text || ':' || account_matched::text || ':' || media_sha256_matched::text || ':' || caption_matched::text || ':' || visibility FROM post_verifications WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid GROUP BY status, attempts, evidence_artifact_id, account_matched, media_sha256_matched, caption_matched, visibility`
      );
      assert.equal(verificationState, "1:VERIFIED:1:true:true:true:true:public", JSON.stringify(verified.body));

      const notificationCount = queryScalar(
        db,
        `SELECT count(*)::text FROM notifications WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid AND notification_type = 'publish_completed'`
      );
      assert.equal(notificationCount, "1", "exactly one completion notification is bound to the calendar post");

      const snapshotCount = queryScalar(
        db,
        `SELECT count(*)::text FROM performance_snapshots WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid`
      );
      assert.equal(snapshotCount, "1", "exactly one initial performance snapshot is retained");

      const evidenceState = queryScalar(
        db,
        `SELECT retention_class || ':' || schema_version || ':' || status || ':' || (object_key IS NOT NULL)::text FROM artifacts WHERE id = '${evidenceArtifactId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(evidenceState, "audience-evidence:calendar.verify_evidence.v1:CLEAN:true", "the evidence artifact is retained server-side with its object key; only the public mapper omits it");

      // U4 replay: a second successful verify is a no-op replay. The same PostVerification and the
      // same logical notification (duplicateCollapsed) are surfaced; no second row is written.
      const replay = await client.verifyCalendarPost(calendarPostId, { workspaceId });
      assert.equal(replay.status, 200, JSON.stringify(replay.body));
      assert.equal(replay.body.replay, true);
      assert.equal(replay.body.verification.id, verificationId, "one PostVerification per calendar post");
      assert.equal(replay.body.notification.id, notificationId, "one logical notification per payload");
      assert.equal(replay.body.notification.duplicateCollapsed, true);

      const replayVerificationCount = queryScalar(
        db,
        `SELECT count(*)::text FROM post_verifications WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid`
      );
      assert.equal(replayVerificationCount, "1", "a replay never writes a second PostVerification");

      const replayNotificationCount = queryScalar(
        db,
        `SELECT count(*)::text FROM notifications WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid AND notification_type = 'publish_completed'`
      );
      assert.equal(replayNotificationCount, "1", "a replay never sends a second completion notification");

      // U4 cross-workspace isolation: a caller from another workspace cannot verify (or learn of the
      // existence of) this workspace's calendar post; the owning workspace id never leaks.
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });
      const otherWorkspace = await other.createWorkspace(
        { name: "Runtime U4 other" },
        { idempotencyKey: `runtime-u4-other-${userId}` }
      );
      const otherWorkspaceId = otherWorkspace.body.workspace.id;
      const cross = await other.verifyCalendarPost(calendarPostId, { workspaceId: otherWorkspaceId });
      assert.equal(cross.status, 404, JSON.stringify(cross.body));
      assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(cross.body).includes(workspaceId), false, "the owning workspace id never leaks");
    }
  );
});

test("prisma runtime persists V0-A1 complete creative lineage, immutable performance snapshots and idempotent collect under RLS", {
  timeout: 90000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime A1 write proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const metaSecret = "runtime-meta-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_META_SIMULATOR_SECRET: metaSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(randomUUID()) });

      // A1 complete ancestry: drive the real script tournament and select a variant so the retained
      // SelectedScript record exists and the CreativeLineage selectedScriptId resolves; the lineage
      // export is genuinely complete (not honestly incomplete on a placeholder script id).
      const approved = await prepareCompleteApprovedFinalVideo(client, "Runtime A1");
      const workspaceId = approved.workspaceId;

      const scheduled = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: approved.finalVideoId,
          approvalToken: approved.approvalToken,
          platform: "meta",
          account: "sunrise-estates",
          caption: "New launch at Sunrise Estates.",
          scheduledAt: "2999-01-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-a1-schedule-${userId}` }
      );
      assert.equal(scheduled.status, 202, JSON.stringify(scheduled.body));
      const calendarPostId = scheduled.body.calendarPost.id;

      const published = await client.publishCalendarPost(
        calendarPostId,
        { workspaceId, account: "sunrise-estates" },
        { idempotencyKey: `runtime-a1-publish-${userId}` }
      );
      assert.equal(published.status, 202, JSON.stringify(published.body));
      const ackPublish = await client.postPublishingCallback("meta", published.body.callback.envelope, published.body.callback.signature);
      assert.equal(ackPublish.status, 200, JSON.stringify(ackPublish.body));
      assert.equal(ackPublish.body.calendarPost.status, "published_unverified");

      const verified = await client.verifyCalendarPost(calendarPostId, { workspaceId });
      assert.equal(verified.status, 200, JSON.stringify(verified.body));
      assert.equal(verified.body.calendarPost.status, "published_verified");
      assert.ok(verified.body.performanceSnapshot.id, "an initial performance snapshot is retained");

      // A1 lineage export: the full ancestry is complete, hash-manifested and redacted. Cost
      // attribution and provider timestamps surface as observations; the object key never surfaces.
      const lineage = await client.getLineage(approved.finalVideoId, { workspaceId });
      assert.equal(lineage.status, 200, JSON.stringify(lineage.body));
      assert.equal(lineage.body.status, "complete");
      assert.equal(lineage.body.finalVideoId, approved.finalVideoId);
      const kinds = new Set(lineage.body.entries.map((entry) => entry.kind));
      for (const kind of [
        "brand_profile", "selected_script", "avatar_profile", "estimate", "provider_operation",
        "generated_asset", "composition_instruction", "ae_plan", "render_attempt", "final_video",
        "calendar_post", "post_verification", "performance_snapshot_initial"
      ]) {
        assert.ok(kinds.has(kind), `lineage missing ${kind}`);
      }
      assert.equal(typeof lineage.body.cost.providerTotalMinor, "number");
      assert.equal(lineage.body.cost.providerTotalMinor, 48000);
      assert.equal(lineage.body.cost.currency, "INR");
      assert.ok(lineage.body.providerTimestamps.submittedAt, "provider submittedAt is recorded");
      assert.ok(typeof lineage.body.manifestSha256 === "string" && lineage.body.manifestSha256.length === 64);
      for (const entry of lineage.body.entries) {
        if (entry.artifact) {
          assert.ok(typeof entry.artifact.sha256 === "string" && entry.artifact.sha256.length === 64);
          assert.equal("objectKey" in entry.artifact, false, "object key must not surface");
        }
      }
      // No secret, signed URL, object key, raw provider payload, request hash or recipient user id leaks.
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|request[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(lineage.body)), false);

      // Prisma persistence under RLS: one CreativeLineage row bound to the job and final video,
      // carrying the selected script, avatar, estimate, provider operation, generated asset,
      // composition instruction, AE plan, render attempt and final video; one initial PerformanceSnapshot.
      const lineageEvidence = queryScalar(
        db,
        `SELECT count(*)::text || ':' || MAX((selected_script_id IS NOT NULL)::int)::text || ':' || MAX((avatar_profile_id IS NOT NULL)::int)::text || ':' || MAX((composition_instruction_id IS NOT NULL)::int)::text || ':' || MAX((ae_plan_id IS NOT NULL)::int)::text || ':' || MAX((render_attempt_id IS NOT NULL)::int)::text || ':' || MAX((final_video_id IS NOT NULL)::int)::text FROM creative_lineage WHERE workspace_id = '${workspaceId}'::uuid AND final_video_id = '${approved.finalVideoId}'::uuid`
      );
      assert.equal(lineageEvidence, "1:1:1:1:1:1:1", "one complete creative lineage row under RLS");

      const initialSnapshotCount = queryScalar(
        db,
        `SELECT count(*)::text FROM performance_snapshots WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid`
      );
      assert.equal(initialSnapshotCount, "1", "exactly one initial performance snapshot is retained");

      // A1 collect: a fresh immutable PerformanceSnapshot of observed (simulated) metrics is retained.
      // The initial snapshot is never mutated. Idempotency is durable: a same-key replay returns the
      // same snapshot and writes no second row.
      const collected = await client.collectPerformance(
        calendarPostId,
        { workspaceId },
        { idempotencyKey: `runtime-a1-collect-${userId}` }
      );
      assert.equal(collected.status, 200, JSON.stringify(collected.body));
      assert.equal(collected.body.replay, false);
      const snapshot = collected.body.performanceSnapshot;
      assert.equal(snapshot.source, "performance_collect_simulator");
      assert.equal(snapshot.observation, "simulated");
      assert.ok(Object.keys(snapshot.metrics).length > 0, "observed metrics are populated");
      assert.notEqual(snapshot.id, verified.body.performanceSnapshot.id, "a fresh row, never a mutation of the initial");
      // No secret, signed URL, object key, source hash or predictive claim (reach/virality/conversion) leaks.
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|source[_-]?hash|virality|reach|conversion/i.test(JSON.stringify(collected.body)), false);

      const snapshotCountAfterCollect = queryScalar(
        db,
        `SELECT count(*)::text FROM performance_snapshots WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid`
      );
      assert.equal(snapshotCountAfterCollect, "2", "the initial and collected snapshots are both retained");

      const collectIdempotency = queryScalar(
        db,
        `SELECT count(*)::text || ':' || MAX(response_status)::text FROM idempotency_records WHERE workspace_id = '${workspaceId}'::uuid AND actor_user_id = '${userId}'::uuid AND operation = 'calendar.performance_collect' AND idempotency_key = 'runtime-a1-collect-${userId}'`
      );
      assert.equal(collectIdempotency, "1:200", "the collect is durably idempotent under RLS");

      // A replay returns the same snapshot and writes no third row.
      const replay = await client.collectPerformance(
        calendarPostId,
        { workspaceId },
        { idempotencyKey: `runtime-a1-collect-${userId}` }
      );
      assert.equal(replay.status, 200, JSON.stringify(replay.body));
      assert.equal(replay.body.replay, true);
      assert.equal(replay.body.performanceSnapshot.id, snapshot.id);
      const snapshotCountAfterReplay = queryScalar(
        db,
        `SELECT count(*)::text FROM performance_snapshots WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid`
      );
      assert.equal(snapshotCountAfterReplay, "2", "a replay never writes a second collected snapshot");

      // A1 read: both snapshots are returned for the verified post; neither is stale; the initial
      // metrics are still empty.
      const read = await client.getPerformance(calendarPostId, { workspaceId });
      assert.equal(read.status, 200, JSON.stringify(read.body));
      assert.equal(read.body.calendarPost.status, "published_verified");
      assert.ok(read.body.snapshots.length >= 2, "the initial and collected snapshots are both returned");
      const initialRow = read.body.snapshots.find((s) => s.source === "audience_verification_initial");
      assert.deepEqual(initialRow.metrics, {}, "the initial snapshot metrics are never mutated");
      assert.equal(read.body.snapshots.every((s) => s.stale === false), true, "no snapshot is stale while the post is verified");
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|source[_-]?hash|virality|reach|conversion/i.test(JSON.stringify(read.body)), false);

      // A1 cross-workspace isolation: a caller from another workspace cannot export this workspace's
      // lineage, collect performance, or read performance; the owning workspace id never leaks.
      const otherCreated = await other.createWorkspace(
        { name: `Runtime A1 other ${Date.now()}` },
        { idempotencyKey: `runtime-a1-other-${userId}` }
      );
      const otherWorkspaceId = otherCreated.body.workspace.id;

      const crossLineage = await other.getLineage(approved.finalVideoId, { workspaceId: otherWorkspaceId });
      assert.equal(crossLineage.status, 404, JSON.stringify(crossLineage.body));
      assert.equal(crossLineage.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(crossLineage.body).includes(workspaceId), false, "the owning workspace id never leaks");

      const crossCollect = await other.collectPerformance(
        calendarPostId,
        { workspaceId: otherWorkspaceId },
        { idempotencyKey: `runtime-a1-cross-collect-${userId}` }
      );
      assert.equal(crossCollect.status, 404, JSON.stringify(crossCollect.body));
      assert.equal(crossCollect.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(crossCollect.body).includes(workspaceId), false);

      const crossRead = await other.getPerformance(calendarPostId, { workspaceId: otherWorkspaceId });
      assert.equal(crossRead.status, 404, JSON.stringify(crossRead.body));
      assert.equal(crossRead.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(crossRead.body).includes(workspaceId), false);

      // No third collected snapshot was written for the cross-workspace attempt.
      const snapshotCountAfterCross = queryScalar(
        db,
        `SELECT count(*)::text FROM performance_snapshots WHERE workspace_id = '${workspaceId}'::uuid AND calendar_post_id = '${calendarPostId}'::uuid`
      );
      assert.equal(snapshotCountAfterCross, "2", "a cross-workspace collect never writes a snapshot");
    }
  );
});

test("prisma runtime blocks lineage on a real persisted final-video / render-attempt hash mismatch under RLS", {
  timeout: 90000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime A1 hash-mismatch proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const tampered = "0".repeat(64);

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_META_SIMULATOR_SECRET: "runtime-meta-simulator-secret"
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });

      // Drive a complete, audience-verified journey so the retained final video and render attempt
      // exist in the system of record under RLS.
      const approved = await prepareCompleteApprovedFinalVideo(client, "Runtime A1 mismatch");
      const workspaceId = approved.workspaceId;
      const finalVideoId = approved.finalVideoId;
      const scheduled = await client.createCalendarPost(
        {
          workspaceId,
          finalVideoId,
          approvalToken: approved.approvalToken,
          platform: "meta",
          account: "sunrise-estates",
          caption: "New launch at Sunrise Estates.",
          scheduledAt: "2999-01-01T09:00:00+05:30",
          timezone: "Asia/Kolkata",
          manualExport: false
        },
        { idempotencyKey: `runtime-a1mm-schedule-${userId}` }
      );
      assert.equal(scheduled.status, 202, JSON.stringify(scheduled.body));
      const calendarPostId = scheduled.body.calendarPost.id;
      const published = await client.publishCalendarPost(
        calendarPostId,
        { workspaceId, account: "sunrise-estates" },
        { idempotencyKey: `runtime-a1mm-publish-${userId}` }
      );
      assert.equal(published.status, 202, JSON.stringify(published.body));
      const ackPublish = await client.postPublishingCallback("meta", published.body.callback.envelope, published.body.callback.signature);
      assert.equal(ackPublish.status, 200, JSON.stringify(ackPublish.body));
      const verified = await client.verifyCalendarPost(calendarPostId, { workspaceId });
      assert.equal(verified.status, 200, JSON.stringify(verified.body));
      assert.equal(verified.body.calendarPost.status, "published_verified");

      // Baseline: the persisted hashes match, so the export is complete and carries no mismatches.
      const clean = await client.getLineage(finalVideoId, { workspaceId });
      assert.equal(clean.status, 200, JSON.stringify(clean.body));
      assert.equal(clean.body.status, "complete");
      assert.deepEqual(clean.body.mismatches, []);

      // The retained final-video sha256 and render attempt output hash are bound in the system of
      // record; capture them so each corruption is restored and the proof leaves no lasting damage.
      const fvOriginal = queryScalar(
        db,
        `SELECT sha256 FROM final_videos WHERE id = '${finalVideoId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      const renderAttemptId = queryScalar(
        db,
        `SELECT render_attempt_id FROM creative_lineage WHERE workspace_id = '${workspaceId}'::uuid AND final_video_id = '${finalVideoId}'::uuid`
      );
      const raOriginal = queryScalar(
        db,
        `SELECT COALESCE(output_hash, '') FROM render_attempts WHERE id = '${renderAttemptId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.ok(/^[0-9a-f]{64}$/.test(fvOriginal), "the retained final-video sha256 is a real 64-hex hash");
      assert.equal(fvOriginal, raOriginal, "the retained final-video sha256 matches the render attempt output hash");

      // Corrupt the persisted final-video sha256 (the audience-facing media integrity threat) and
      // re-read through the public lineage endpoint against the Prisma-backed store.
      const updateFv = queryScalar(
        db,
        `UPDATE final_videos SET sha256 = '${tampered}' WHERE id = '${finalVideoId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(updateFv, "UPDATE 1", "exactly one retained final-video row was mutated");

      const blockedFv = await client.getLineage(finalVideoId, { workspaceId });
      assert.equal(blockedFv.status, 200, JSON.stringify(blockedFv.body));
      assert.equal(blockedFv.body.status, "blocked", "a persisted final-video hash mismatch makes the export blocked");
      assert.deepEqual(blockedFv.body.mismatches, ["final_video"]);
      assert.equal(blockedFv.body.missing.length, 0, "blocked lineage does not claim missing ancestry");
      assert.notEqual(blockedFv.body.status, "complete", "the manifest never claims complete ancestry under a mismatch");
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|request[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(blockedFv.body)), false);

      // Restoring the retained sha256 returns the export to complete — the guard is data-driven.
      queryScalar(db, `UPDATE final_videos SET sha256 = '${fvOriginal}' WHERE id = '${finalVideoId}'::uuid AND workspace_id = '${workspaceId}'::uuid`);
      const restoredFv = await client.getLineage(finalVideoId, { workspaceId });
      assert.equal(restoredFv.body.status, "complete");
      assert.deepEqual(restoredFv.body.mismatches, []);

      // Corrupt the other side of the binding — the retained render attempt output hash — and
      // re-read. The export is blocked for the same reason; the threat is symmetric.
      const updateRa = queryScalar(
        db,
        `UPDATE render_attempts SET output_hash = '${tampered}' WHERE id = '${renderAttemptId}'::uuid AND workspace_id = '${workspaceId}'::uuid`
      );
      assert.equal(updateRa, "UPDATE 1", "exactly one retained render attempt row was mutated");

      const blockedRa = await client.getLineage(finalVideoId, { workspaceId });
      assert.equal(blockedRa.status, 200, JSON.stringify(blockedRa.body));
      assert.equal(blockedRa.body.status, "blocked");
      assert.deepEqual(blockedRa.body.mismatches, ["final_video"]);
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|request[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(blockedRa.body)), false);

      // Restore the render attempt output hash so the proof leaves the system of record intact.
      queryScalar(db, `UPDATE render_attempts SET output_hash = '${raOriginal}' WHERE id = '${renderAttemptId}'::uuid AND workspace_id = '${workspaceId}'::uuid`);
      const restoredRa = await client.getLineage(finalVideoId, { workspaceId });
      assert.equal(restoredRa.body.status, "complete");
      assert.deepEqual(restoredRa.body.mismatches, []);
    }
  );
});

test("prisma runtime persists V0-A2 consent revocation and credential rotation under RLS without secret leak", {
  timeout: 90000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime A2 write proof.");
  }

  const userId = randomUUID();
  const otherUserId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });
      const other = new V0Client({ baseUrl, authToken: signJwt(otherUserId) });

      const prepared = await prepareApprovedBrand(client, "Runtime A2 consent");
      const workspaceId = prepared.workspaceId;
      const listed = await client.listAvatars({
        workspaceId,
        brandProfileId: prepared.brandProfileId,
        limit: 50
      });
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      const ambassador = listed.body.items.find(
        (avatar) => avatar.kind === "brand_ambassador" && avatar.eligibility.eligible === true
      );
      assert.ok(ambassador, "expected an eligible brand ambassador to revoke");
      assert.equal(ambassador.eligibility.consentRevokedAt, null);

      // V0-A2 consent revocation: monotonic, immediate, audited.
      const revoked = await client.revokeAvatarConsent(ambassador.id, {
        workspaceId,
        brandProfileId: prepared.brandProfileId,
        reason: "Runtime talent withdrew consent."
      });
      assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
      assert.equal(revoked.body.avatar.eligibility.reason, "consent_revoked");
      assert.ok(revoked.body.avatar.eligibility.consentRevokedAt);
      assert.equal(/evidence_ref|evidenceRef|consent:\/\//i.test(JSON.stringify(revoked.body)), false);

      const consentRevoked = queryScalar(
        db,
        `SELECT count(*) FROM avatar_consents WHERE avatar_profile_id = '${ambassador.id}'::uuid AND revoked_at IS NOT NULL`
      );
      assert.equal(consentRevoked, "1", "consent revoked_at must be persisted");

      const consentAudit = queryScalar(
        db,
        `SELECT count(*) FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND event_type = 'consent.revoked' AND target_id = '${ambassador.id}'::uuid`
      );
      assert.equal(consentAudit, "1", "consent.revoked audit row must be retained");

      // Use-after-revocation is blocked at the generation estimate boundary.
      const estimate = await client.createGenerationEstimate({
        workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: "31000000-0000-4000-8000-000000000001",
        avatarProfileId: ambassador.id
      });
      assert.equal(estimate.status, 409, JSON.stringify(estimate.body));
      assert.equal(estimate.body.code, "AVATAR_CONSENT_REVOKED");

      // Idempotent re-revoke writes no second audit row.
      const replay = await client.revokeAvatarConsent(ambassador.id, {
        workspaceId,
        brandProfileId: prepared.brandProfileId,
        reason: "Runtime repeated revocation."
      });
      assert.equal(replay.status, 200, JSON.stringify(replay.body));
      assert.equal(replay.body.avatar.eligibility.reason, "consent_revoked");
      const consentAuditAfterReplay = queryScalar(
        db,
        `SELECT count(*) FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND event_type = 'consent.revoked' AND target_id = '${ambassador.id}'::uuid`
      );
      assert.equal(consentAuditAfterReplay, "1", "idempotent re-revoke writes no second audit row");

      // V0-A2 credential rotation: new ACTIVE row, prior REVOKED, lastRotatedAt
      // stamped, audit retained, no plaintext secret surfaced.
      const stored = await client.createServiceCredential(workspaceId, {
        provider: "heygen",
        purpose: "generation",
        environment: "staging",
        secretRef: "secret-manager://sakhaa/staging/heygen-v1",
        rotationStatus: "ACTIVE"
      });
      assert.equal(stored.status, 201, JSON.stringify(stored.body));
      const oldCredentialId = stored.body.credential.id;

      const rotated = await client.rotateServiceCredential(workspaceId, oldCredentialId, {
        secretRef: "secret-manager://sakhaa/staging/heygen-v2",
        reason: "Runtime quarterly rotation."
      });
      assert.equal(rotated.status, 200, JSON.stringify(rotated.body));
      const fresh = rotated.body.credential;
      assert.equal(fresh.rotationStatus, "ACTIVE");
      assert.equal(fresh.secretRef, "secret-manager://sakhaa/staging/heygen-v2");
      assert.notEqual(fresh.id, oldCredentialId);
      assert.ok(fresh.lastRotatedAt);
      assert.equal(rotated.body.previous.id, oldCredentialId);
      assert.equal(rotated.body.previous.rotationStatus, "REVOKED");
      assert.equal(Object.hasOwn(rotated.body.previous, "secretRef"), false);
      const PLAINTEXT = /\b(secretValue|apiKey|plaintext|password|accessToken|accessKey|privateKey|clientSecret|sk_live_[A-Za-z0-9]+)\b/i;
      assert.equal(PLAINTEXT.test(JSON.stringify(rotated.body)), false);

      const priorRevoked = queryScalar(
        db,
        `SELECT count(*) FROM service_credentials WHERE id = '${oldCredentialId}'::uuid AND rotation_status = 'REVOKED'`
      );
      assert.equal(priorRevoked, "1", "prior credential must be REVOKED");

      const freshActive = queryScalar(
        db,
        `SELECT count(*) FROM service_credentials WHERE id = '${fresh.id}'::uuid AND rotation_status = 'ACTIVE' AND last_rotated_at IS NOT NULL`
      );
      assert.equal(freshActive, "1", "new credential must be ACTIVE with lastRotatedAt");

      const rotateAudit = queryScalar(
        db,
        `SELECT count(*) FROM audit_events WHERE workspace_id = '${workspaceId}'::uuid AND event_type = 'service_credential.rotated' AND target_id = '${oldCredentialId}'::uuid`
      );
      assert.equal(rotateAudit, "1", "service_credential.rotated audit row must be retained");

      // A rotation attempt carrying a plaintext secret field is rejected.
      const leaked = await client.rotateServiceCredential(workspaceId, fresh.id, {
        secretRef: "secret-manager://sakhaa/staging/heygen-v3",
        reason: "Leaked.",
        secretValue: "sk_live_must_not_be_accepted"
      });
      assert.equal(leaked.status, 422);
      assert.equal(leaked.body.code, "VALIDATION_FAILED");

      // Cross-tenant: another workspace's actor cannot revoke this workspace's
      // avatar or rotate its credential; both hide behind WORKSPACE_ACCESS_DENIED
      // with no owning-workspace leak.
      const otherPrepared = await prepareApprovedBrand(other, "Runtime A2 other");
      const crossRevoke = await other.revokeAvatarConsent(ambassador.id, {
        workspaceId: otherPrepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        reason: "Cross-tenant."
      });
      assert.equal(crossRevoke.status, 404);
      assert.equal(crossRevoke.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(crossRevoke.body).includes(workspaceId), false);

      const crossRotate = await other.rotateServiceCredential(otherPrepared.workspaceId, oldCredentialId, {
        secretRef: "secret-manager://sakhaa/staging/heygen-cross",
        reason: "Cross-tenant."
      });
      assert.equal(crossRotate.status, 404);
      assert.equal(crossRotate.body.code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(JSON.stringify(crossRotate.body).includes(workspaceId), false);

      // The failed cross-tenant attempts mutated nothing.
      const priorStillRevoked = queryScalar(
        db,
        `SELECT count(*) FROM service_credentials WHERE id = '${oldCredentialId}'::uuid AND rotation_status = 'REVOKED'`
      );
      assert.equal(priorStillRevoked, "1");
      const freshStillActive = queryScalar(
        db,
        `SELECT count(*) FROM service_credentials WHERE id = '${fresh.id}'::uuid AND rotation_status = 'ACTIVE'`
      );
      assert.equal(freshStillActive, "1");
    }
  );
});

test("prisma runtime persists the V0-A3 standalone real-estate reference journey under RLS with a complete lineage and reconciled ledger", {
  timeout: 120000,
  skip: process.env.V0_RUNTIME_DB_PROOF === "1" ? false : "Run through pnpm verify runtime proof step."
}, async () => {
  const env = loadApiEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for prisma runtime A3 reference journey proof.");
  }

  const userId = randomUUID();
  const db = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  const metaSecret = "runtime-meta-simulator-secret";

  await withApiServer(
    {
      ...env,
      APP_ENV: "test",
      APP_VERSION: "test",
      V0_RUNTIME_DB: "prisma",
      V0_EXPOSE_TEST_ERRORS: "1",
      V0_INTERNAL_WORKER_TOKEN: "runtime-worker-token",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_META_SIMULATOR_SECRET: metaSecret
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt(userId) });

      // The full production-shaped journey runs end-to-end against the Prisma store under RLS,
      // driven through the generated V0Client only — no manual database edits, no hidden retries,
      // no V1/V2 calls, no evidence gaps.
      const journey = await runReferenceJourney(client, "Runtime A3");

      // The complete creative lineage export is genuinely complete under RLS.
      const lineage = await client.getLineage(journey.finalVideoId, { workspaceId: journey.workspaceId });
      assert.equal(lineage.status, 200, JSON.stringify(lineage.body));
      assert.equal(lineage.body.status, "complete", "the reference journey leaves no missing ancestry under RLS");
      assert.equal(lineage.body.missing.length, 0, "no missing lineage kinds under RLS");
      assert.equal(lineage.body.mismatches.length, 0, "no hash mismatches under RLS");
      assert.match(lineage.body.manifestSha256, /^[0-9a-f]{64}$/);

      // A creative_lineage row is retained for the final video under RLS.
      const lineageRowCount = queryScalar(
        db,
        `SELECT count(*) FROM creative_lineage WHERE workspace_id = '${journey.workspaceId}'::uuid AND final_video_id = '${journey.finalVideoId}'::uuid`
      );
      assert.equal(lineageRowCount, "1", "exactly one creative_lineage row binds the final video under RLS");

      // The wallet ledger reconciles: the append-only entries sum to the wallet balance, and the
      // balance equals the purchase minus the captured provider total.
      const ledger = await client.getWalletLedger(journey.walletId, { workspaceId: journey.workspaceId, limit: 100 });
      assert.equal(ledger.status, 200, JSON.stringify(ledger.body));
      const ledgerSum = ledger.body.entries.reduce((sum, entry) => sum + entry.amountMinor, 0);
      assert.equal(ledgerSum, ledger.body.wallet.balanceMinor, "the ledger is the truth of the wallet balance under RLS");
      const providerTotalMinor = lineage.body.cost.providerTotalMinor;
      const purchase = ledger.body.entries.find((entry) => entry.type === "PURCHASE");
      assert.ok(providerTotalMinor <= journey.maximumAuthorizedMinor, "the provider total never exceeds the authorized maximum under RLS");
      assert.equal(
        ledger.body.wallet.balanceMinor,
        purchase.amountMinor - providerTotalMinor,
        "the wallet balance equals the purchase minus the captured provider total under RLS"
      );

      // The credit ledger rows are retained under RLS: one PURCHASE, one RESERVE, one CAPTURE.
      const ledgerEntryCount = queryScalar(
        db,
        `SELECT count(*) FROM credit_ledger_entries WHERE workspace_id = '${journey.workspaceId}'::uuid AND wallet_id = '${journey.walletId}'::uuid`
      );
      assert.ok(Number(ledgerEntryCount) >= 3, "the purchase, reserve and capture ledger rows are retained under RLS");

      // The audience-facing verification and the audience-evidence artifact are retained under RLS.
      const verificationCount = queryScalar(
        db,
        `SELECT count(*) FROM post_verifications WHERE workspace_id = '${journey.workspaceId}'::uuid AND calendar_post_id = '${journey.postId}'::uuid AND status = 'VERIFIED'`
      );
      assert.equal(verificationCount, "1", "exactly one verified PostVerification is retained under RLS");

      // No secret, signed URL, object key, raw provider payload or cross-workspace reference leaks from
      // the journey, the lineage export or the ledger.
      const leakScan = JSON.stringify({ journey, lineage: lineage.body, ledger: ledger.body });
      assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user/i.test(leakScan), false);
      const recordScan = JSON.stringify({ journey, lineage: lineage.body, ledger: ledger.body });
      assert.equal(/virality|guaranteed.*reach|conversion|causal/i.test(recordScan), false, "no predictive claim surfaces in the journey records");
    }
  );
});

async function prepareRuntimeValidatedPlan(client, prepared, userId) {
  const jobId = await createCompletedJob(client, prepared, userId, "c2plan");
  const settled = await client.settleGenerationJob(
    jobId,
    { workspaceId: prepared.workspaceId },
    { idempotencyKey: `runtime-c2-settle-${userId}` }
  );
  assert.equal(settled.status, 202, JSON.stringify(settled.body));
  const assetId = settled.body.asset.id;
  const created = await client.createCompositionPlan({
    workspaceId: prepared.workspaceId,
    generationAssetId: assetId,
    inputMode: "structured",
    rawDirection: "9:16 reel with a lower-third caption and a zoom-in intro",
    timeline: validTimeline(assetId)
  });
  assert.equal(created.status, 202, JSON.stringify(created.body));
  assert.equal(created.body.composition.status, "validated");
  return { compositionPlanId: created.body.composition.id, assetId };
}

function validTimeline(assetId) {
  return {
    schemaVersion: AE_PLAN_SCHEMA_VERSION,
    capabilityVersion: DEFAULT_AE_CAPABILITY_VERSION,
    durationSeconds: 30,
    resolution: "1080x1920",
    tracks: [
      { id: "t1", kind: "video", assetId, startSeconds: 0, endSeconds: 30, safeZone: "center" }
    ],
    overlays: [
      { id: "o1", kind: "caption", text: "Sunrise Estates", startSeconds: 0, endSeconds: 5, safeZone: "lower_third" }
    ],
    effects: [{ name: "zoom_in", plugin: "ae_builtin" }],
    fonts: [{ name: "Satoshi" }],
    plugins: [{ name: "ae_builtin" }],
    templates: [{ name: "realestate_listing" }]
  };
}

async function fundWallet(client, prepared, userId, amountMinor, tag) {
  const purchase = await client.createCreditPurchase(
    { workspaceId: prepared.workspaceId, provider: "razorpay", currency: "INR", amountMinor },
    { idempotencyKey: `runtime-${tag}-purchase-${userId}` }
  );
  assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
  const paid = await client.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  return purchase.body.wallet.id;
}

async function firstEligibleAvatar(client, prepared) {
  const listed = await client.listAvatars({
    workspaceId: prepared.workspaceId,
    brandProfileId: prepared.brandProfileId,
    limit: 50
  });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
  assert.ok(eligible, "expected an eligible avatar for the estimate");
  return eligible;
}

async function createConfirmedJob(client, prepared, userId, tag) {
  const SCRIPT_ID = "31000000-0000-4000-8000-000000000001";
  const eligible = await firstEligibleAvatar(client, prepared);
  const estimate = await client.createGenerationEstimate({
    workspaceId: prepared.workspaceId,
    brandProfileId: prepared.brandProfileId,
    selectedScriptId: SCRIPT_ID,
    avatarProfileId: eligible.id,
    durationSeconds: 30
  });
  assert.equal(estimate.status, 202, JSON.stringify(estimate.body));
  const confirmed = await client.confirmGenerationEstimate(
    estimate.body.estimate.id,
    {
      workspaceId: prepared.workspaceId,
      version: estimate.body.estimate.version,
      selectedScriptId: SCRIPT_ID,
      avatarProfileId: eligible.id,
      durationSeconds: 30
    },
    { idempotencyKey: `runtime-${tag}-confirm-${userId}` }
  );
  assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
  return confirmed.body.job.id;
}

async function createCompletedJob(client, prepared, userId, tag) {
  const jobId = await createConfirmedJob(client, prepared, userId, tag);
  const submitted = await client.submitGenerationJob(
    jobId,
    { workspaceId: prepared.workspaceId },
    { idempotencyKey: `runtime-${tag}-submit-${userId}` }
  );
  assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
  const acknowledged = await client.postHeygenCallback(
    submitted.body.callback.envelope,
    submitted.body.callback.signature
  );
  assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
  assert.equal(acknowledged.body.operation.status, "completed");
  return jobId;
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function queryScalar(databaseUrl, sql) {
  const psql = resolvePsqlCommand();
  const result = spawnSync(psql, [databaseUrl, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`psql query failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function resolvePsqlCommand() {
  for (const candidate of [
    process.env.PSQL_PATH,
    "C:/Program Files/PostgreSQL/17/bin/psql.exe",
    "C:/Program Files/PostgreSQL/16/bin/psql.exe",
    "C:/Program Files/PostgreSQL/15/bin/psql.exe",
    "psql"
  ].filter(Boolean)) {
    if (candidate === "psql" || existsSync(candidate)) {
      return candidate;
    }
  }
  return "psql";
}
