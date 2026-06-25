import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("Owner traces failed job, sees metrics and safely requeues dead-lettered work", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const { client, worker, workspaceId, jobId } = await createCleanSourceAndJob(baseUrl, {
        idSuffix: "trace",
        maxAttempts: 1
      });
      const claimed = await worker.claimJob(jobId, { resourceClass: "CPU" });
      const failed = await worker.failJob(jobId, {
        leaseToken: claimed.body.attempt.leaseToken,
        errorCode: "SIMULATED_WORKER_CRASH",
        retryable: true
      });

      const trace = await client.getJobTrace(jobId);
      const metrics = await client.getWorkspaceOperationalMetrics(workspaceId);
      const recovered = await client.recoverJob(jobId, {
        action: "retry_dead_letter",
        reason: "F5 recovery proof"
      });
      const afterRecovery = await client.getJob(jobId);

      assert.equal(failed.body.job.status, "FAILED");
      assert.equal(trace.status, 200);
      assert.equal(trace.body.trace.job.id, jobId);
      assert.match(trace.body.trace.requestId, /^[0-9a-f-]{36}$/i);
      assert.equal(trace.body.trace.outbox.some((event) => event.payload.requestId === trace.body.trace.requestId), true);
      assert.equal(trace.body.trace.events.some((event) => event.payload.requestId === trace.body.trace.requestId), true);
      assert.equal(metrics.status, 200);
      assert.equal(metrics.body.metrics.deadLetterCount, 1);
      assert.equal(metrics.body.metrics.retryCount, 0);
      assert.equal(recovered.status, 200);
      assert.equal(recovered.body.job.status, "QUEUED");
      assert.equal(afterRecovery.body.job.status, "QUEUED");
    }
  );
});

test("service credential stores metadata and rejects plaintext secret fields", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("credential-owner") });
      const created = await client.createWorkspace(
        { name: "Credential Aster" },
        { idempotencyKey: "f5-credential-workspace" }
      );
      const workspaceId = created.body.workspace.id;

      const stored = await client.createServiceCredential(workspaceId, {
        provider: "heygen",
        purpose: "generation",
        environment: "staging",
        secretRef: "secret-manager://sakhaa/staging/heygen",
        rotationStatus: "ACTIVE"
      });
      const rejected = await client.createServiceCredential(workspaceId, {
        provider: "heygen",
        purpose: "generation",
        environment: "staging",
        secretRef: "secret-manager://sakhaa/staging/heygen",
        rotationStatus: "ACTIVE",
        secretValue: "must-not-store"
      });

      assert.equal(stored.status, 201);
      assert.equal(stored.body.credential.secretRef, "secret-manager://sakhaa/staging/heygen");
      assert.equal(Object.hasOwn(stored.body.credential, "secretValue"), false);
      assert.equal(rejected.status, 422);
      assert.equal(rejected.body.code, "VALIDATION_FAILED");
    }
  );
});

test("simulator mode, restore drill and redaction scan are protected local operations", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("ops-owner") });
      const created = await client.createWorkspace(
        { name: "Ops Aster" },
        { idempotencyKey: "f5-ops-workspace" }
      );
      const workspaceId = created.body.workspace.id;
      const sourceHash = sha256("ops-source");
      const source = await client.initiateBrandAssetUpload(
        {
          workspaceId,
          fileName: "ops.mp4",
          contentType: "video/mp4",
          byteSize: 9,
          sha256: sourceHash
        },
        { idempotencyKey: "f5-ops-source" }
      );
      await client.completeBrandAssetUpload(source.body.artifact.id, {
        workspaceId,
        byteSize: 9,
        sha256: sourceHash
      });

      const simulator = await client.setSimulatorMode(workspaceId, {
        boundary: "provider",
        mode: "timeout"
      });
      const restore = await client.recordRestoreDrill(workspaceId, {
        artifactId: source.body.artifact.id,
        reason: "F5 restore proof"
      });
      const scan = await client.runRedactionScan(workspaceId, {
        sample: `apiKey=sk_test_123 https://signed.example.test/file?${"X-Amz-Signature"}=abc`
      });

      assert.equal(simulator.status, 200);
      assert.equal(simulator.body.simulator.mode, "timeout");
      assert.equal(restore.status, 200);
      assert.equal(restore.body.restore.rlsPreserved, true);
      assert.equal(restore.body.restore.artifactReferencesChecked, 1);
      assert.equal(scan.status, 200);
      assert.equal(scan.body.scan.leakCount, 0);
      assert.doesNotMatch(scan.body.scan.redactedSample, /sk_test_123|X-Amz-Signature=abc/);
    }
  );
});

async function createCleanSourceAndJob(baseUrl, { idSuffix, maxAttempts = undefined }) {
  const client = new V0Client({ baseUrl, authToken: signJwt(`user-${idSuffix}`) });
  const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
  const created = await client.createWorkspace(
    { name: `Aster Heights ${idSuffix}` },
    { idempotencyKey: `f5-create-${idSuffix}` }
  );
  const workspaceId = created.body.workspace.id;
  const sourceHash = sha256(`source-video-${idSuffix}`);
  const source = await client.initiateBrandAssetUpload(
    {
      workspaceId,
      fileName: `source-${idSuffix}.mp4`,
      contentType: "video/mp4",
      byteSize: 12,
      sha256: sourceHash
    },
    { idempotencyKey: `f5-source-${idSuffix}` }
  );
  await client.completeBrandAssetUpload(source.body.artifact.id, {
    workspaceId,
    byteSize: 12,
    sha256: sourceHash
  });
  const started = await client.startSimulatedMediaProcessing(
    {
      workspaceId,
      inputArtifactId: source.body.artifact.id,
      outputFileName: `processed-${idSuffix}.mp4`,
      ...(maxAttempts ? { maxAttempts } : {})
    },
    { idempotencyKey: `f5-processing-${idSuffix}` }
  );
  assert.equal(started.status, 202, JSON.stringify(started.body));
  return { client, worker, workspaceId, jobId: started.body.job.id };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
