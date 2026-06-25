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
