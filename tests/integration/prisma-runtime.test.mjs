import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { loadApiEnv } from "../helpers/env.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareReadyTournament, prepareApprovedBrand } from "../helpers/script-tournament-fixtures.mjs";

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

      const hash = sha256(`runtime-artifact-${userId}`);
      const initiated = await client.initiateBrandAssetUpload(
        {
          workspaceId: created.body.workspace.id,
          fileName: "runtime-logo.png",
          contentType: "image/png",
          byteSize: 32,
          sha256: hash
        },
        { idempotencyKey: `runtime-artifact-${userId}` }
      );
      const completed = await client.completeBrandAssetUpload(initiated.body.artifact.id, {
        workspaceId: created.body.workspace.id,
        byteSize: 32,
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
