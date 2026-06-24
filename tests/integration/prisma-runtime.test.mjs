import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { loadApiEnv } from "../helpers/env.mjs";
import { withApiServer } from "../helpers/server.mjs";

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
