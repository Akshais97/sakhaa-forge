import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

test("simulated media job completes once across duplicate worker completion delivery", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const client = new V0Client({ baseUrl, authToken: signJwt("user-a") });
      const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
      const created = await client.createWorkspace(
        { name: "Aster Heights" },
        { idempotencyKey: "f4-create-aster" }
      );
      const workspaceId = created.body.workspace.id;
      const sourceHash = sha256("source-video");
      const source = await client.initiateBrandAssetUpload(
        {
          workspaceId,
          fileName: "source.mp4",
          contentType: "video/mp4",
          byteSize: 12,
          sha256: sourceHash
        },
        { idempotencyKey: "f4-source-video" }
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
          outputFileName: "processed.mp4"
        },
        { idempotencyKey: "f4-simulated-processing" }
      );
      const claimed = await worker.claimJob(started.body.job.id, { resourceClass: "CPU" });
      const heartbeat = await worker.heartbeatJob(started.body.job.id, {
        leaseToken: claimed.body.attempt.leaseToken
      });
      const output = {
        leaseToken: claimed.body.attempt.leaseToken,
        workspaceId,
        fileName: "processed.mp4",
        contentType: "video/mp4",
        byteSize: 20,
        sha256: sha256("processed-video-bytes"),
        objectKey: `clean-media/${workspaceId}/processed.mp4`,
        schemaVersion: "simulated.media.output.v1"
      };
      const completed = await worker.completeJob(started.body.job.id, output);
      const replayed = await worker.completeJob(started.body.job.id, output);
      const job = await client.getJob(started.body.job.id);
      const events = await client.listJobEvents(started.body.job.id);

      assert.equal(started.status, 202);
      assert.equal(started.body.job.status, "QUEUED");
      assert.equal(claimed.status, 200);
      assert.equal(claimed.body.job.status, "LEASED");
      assert.equal(heartbeat.status, 200);
      assert.equal(heartbeat.body.job.status, "RUNNING");
      assert.equal(completed.status, 200);
      assert.equal(completed.body.job.status, "SUCCEEDED");
      assert.equal(replayed.status, 200);
      assert.equal(replayed.body.artifact.id, completed.body.artifact.id);
      assert.equal(job.body.job.status, "SUCCEEDED");
      assert.equal(events.body.events.some((event) => event.eventType === "job.completed"), true);
      assert.equal(
        events.body.events.filter((event) => event.eventType === "artifact.retained").length,
        1
      );
    }
  );
});

test("outbox relay preserves canonical job through Redis loss and duplicate wake-ups", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const { client, worker, workspaceId, jobId } = await createCleanSourceAndJob(baseUrl, {
        idSuffix: "relay"
      });

      const redisLoss = await worker.relayOutbox({ mode: "redis_unavailable" });
      const afterLoss = await client.getJob(jobId);
      const recovered = await worker.relayOutbox({ mode: "ok" });
      const duplicate = await worker.relayOutbox({ mode: "ok" });
      const events = await client.listJobEvents(jobId);

      assert.equal(redisLoss.status, 503);
      assert.equal(redisLoss.body.code, "DEPENDENCY_UNAVAILABLE");
      assert.equal(afterLoss.body.job.status, "QUEUED");
      assert.equal(recovered.status, 200);
      assert.equal(recovered.body.relayed.some((event) => event.aggregateId === jobId), true);
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.relayed.some((event) => event.aggregateId === jobId), false);
      assert.equal(
        events.body.events.filter((event) => event.eventType === "job.wakeup_relayed").length,
        1
      );
      assert.equal(events.body.events.every((event) => event.workspaceId === workspaceId), true);
    }
  );
});

test("expired lease requeues work and rejects stale worker completion", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const { client, worker, workspaceId, jobId } = await createCleanSourceAndJob(baseUrl, {
        idSuffix: "expiry"
      });
      const firstClaim = await worker.claimJob(jobId, { resourceClass: "CPU" });

      const expired = await worker.expireJobLeases({ maxHeartbeatAgeMs: 0 });
      const staleCompletion = await worker.completeJob(jobId, outputFor(firstClaim, workspaceId));
      const secondClaim = await worker.claimJob(jobId, { resourceClass: "CPU" });
      const completed = await worker.completeJob(jobId, outputFor(secondClaim, workspaceId));
      const events = await client.listJobEvents(jobId);

      assert.equal(expired.status, 200);
      assert.equal(expired.body.expired.some((job) => job.id === jobId), true);
      assert.equal(staleCompletion.status, 409);
      assert.equal(staleCompletion.body.code, "RESOURCE_VERSION_STALE");
      assert.equal(secondClaim.status, 200);
      assert.equal(secondClaim.body.attempt.attemptNumber, 2);
      assert.equal(completed.status, 200);
      assert.equal(completed.body.job.status, "SUCCEEDED");
      assert.equal(events.body.events.some((event) => event.eventType === "job.lease_expired"), true);
    }
  );
});

test("failed job exhausts attempts and remains visible in dead-letter list", async () => {
  await withApiServer(
    {
      APP_ENV: "test",
      APP_VERSION: "test",
      SUPABASE_JWT_SECRET: jwtSecret,
      V0_INTERNAL_WORKER_TOKEN: workerToken
    },
    async ({ baseUrl }) => {
      const { client, worker, workspaceId, jobId } = await createCleanSourceAndJob(baseUrl, {
        idSuffix: "dead-letter",
        maxAttempts: 1
      });
      const claimed = await worker.claimJob(jobId, { resourceClass: "CPU" });

      const failed = await worker.failJob(jobId, {
        leaseToken: claimed.body.attempt.leaseToken,
        errorCode: "SIMULATED_WORKER_CRASH",
        retryable: true
      });
      const deadLetters = await client.listDeadLetterJobs(workspaceId);
      const events = await client.listJobEvents(jobId);

      assert.equal(failed.status, 200);
      assert.equal(failed.body.job.status, "FAILED");
      assert.equal(deadLetters.status, 200);
      assert.equal(deadLetters.body.jobs.some((job) => job.id === jobId), true);
      assert.equal(deadLetters.body.jobs.find((job) => job.id === jobId).lastErrorCode, "SIMULATED_WORKER_CRASH");
      assert.equal(events.body.events.some((event) => event.eventType === "job.dead_lettered"), true);
    }
  );
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createCleanSourceAndJob(baseUrl, { idSuffix, maxAttempts = undefined }) {
  const client = new V0Client({ baseUrl, authToken: signJwt(`user-${idSuffix}`) });
  const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
  const created = await client.createWorkspace(
    { name: `Aster Heights ${idSuffix}` },
    { idempotencyKey: `f4-create-${idSuffix}` }
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
    { idempotencyKey: `f4-source-${idSuffix}` }
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
    { idempotencyKey: `f4-processing-${idSuffix}` }
  );
  assert.equal(started.status, 202, JSON.stringify(started.body));
  return { client, worker, workspaceId, jobId: started.body.job.id };
}

function outputFor(claimed, workspaceId) {
  return {
    leaseToken: claimed.body.attempt.leaseToken,
    workspaceId,
    fileName: "processed.mp4",
    contentType: "video/mp4",
    byteSize: 20,
    sha256: sha256(`processed-video-bytes-${claimed.body.attempt.attemptNumber}`),
    objectKey: `clean-media/${workspaceId}/processed-${claimed.body.attempt.attemptNumber}.mp4`,
    schemaVersion: "simulated.media.output.v1"
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
