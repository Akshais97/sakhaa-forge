import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

const env = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken
};

// No secret, signed URL, object key, raw provider payload or cross-workspace
// reference may appear in any hardening-drill response.
const FORBIDDEN = /secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|sk_live_[A-Za-z0-9]+|bearer\s+\S+/i;

// V0-A2 India-to-Backblaze-B2 transfer benchmark. Owner/Admin (run_restore_drills)
// runs a deterministic, budget-bounded India-to-B2 transfer benchmark and retains
// a benchmark.b2_recorded audit row. The result is visibly simulated, integer
// minor-unit cost, latency within the owner-pinned budget. A non-Owner/Admin is
// denied (403); a cross-workspace caller is hidden (404); an unauthenticated call
// is rejected (401).
test("A2 B2 benchmark records a deterministic India-to-B2 latency and cost within the pinned budget", async () => {
  await withApiServer(env, async ({ baseUrl, store }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a2-b2") });
    const created = await client.createWorkspace(
      { name: "A2 B2 benchmark workspace" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const workspaceId = created.body.workspace.id;

    const first = await client.runB2Benchmark(workspaceId, { bytesRequestedGb: 2, reason: "Quarterly B2 benchmark." });
    const second = await client.runB2Benchmark(workspaceId, { bytesRequestedGb: 2, reason: "Quarterly B2 benchmark." });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.benchmark.observation, "simulated");
    assert.equal(first.body.benchmark.region, "india-to-b2");
    assert.equal(first.body.benchmark.bytesTransferredBytes, 2_000_000_000);
    assert.ok(first.body.benchmark.simulatedLatencyMs >= 800);
    assert.ok(first.body.benchmark.simulatedLatencyMs <= first.body.benchmark.egressBudgetMs);
    assert.equal(first.body.benchmark.estimatedCostMinor, 2 * 8000);
    assert.match(first.body.benchmark.determinismSeed, /^[0-9a-f]{64}$/);
    // Deterministic: same input replays the same benchmark. recordedAt is an
    // audit timestamp, not a seed-derived field, so it is compared separately.
    const { recordedAt: firstAt, ...firstCore } = first.body.benchmark;
    const { recordedAt: secondAt, ...secondCore } = second.body.benchmark;
    assert.deepEqual(secondCore, firstCore);
    assert.ok(Math.abs(new Date(secondAt) - new Date(firstAt)) < 5000);
    assert.equal(FORBIDDEN.test(JSON.stringify(first.body)), false);

    // A non-Owner/Admin (Client Manager) is denied the drill capability.
    store.addMembershipRoleForTest({ workspaceId, userId: "a2-b2-cm", role: "CLIENT_MANAGER" });
    const cm = new V0Client({ baseUrl, authToken: signJwt("a2-b2-cm") });
    const denied = await cm.runB2Benchmark(workspaceId, { bytesRequestedGb: 1 });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, "PERMISSION_DENIED");

    // A cross-workspace caller is hidden behind the existence-hiding 404.
    const other = new V0Client({ baseUrl, authToken: signJwt("a2-b2-other") });
    const otherWorkspace = await other.createWorkspace(
      { name: "A2 B2 other workspace" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const cross = await other.runB2Benchmark(workspaceId, { bytesRequestedGb: 1 });
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(workspaceId), false);

    // An unauthenticated call is rejected before any benchmark work.
    const anonymous = new V0Client({ baseUrl });
    const unauth = await anonymous.runB2Benchmark(workspaceId, { bytesRequestedGb: 1 });
    assert.equal(unauth.status, 401);
  });
});

// V0-A2 load-shaped queue backlog simulation. Owner/Admin (run_restore_drills)
// runs a deterministic two-hour growth-then-drain backlog curve with an SLO
// breach and the no-duplicate-paid-work / no-silent-job-loss invariants. The
// recovery invariants are proven against real queue state in the queue-recovery
// drill below; this endpoint is the deterministic load-shape model.
test("A2 backlog simulation models a two-hour growth-then-drain curve with an SLO breach and no duplicate paid work", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a2-backlog") });
    const created = await client.createWorkspace(
      { name: "A2 backlog workspace" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const workspaceId = created.body.workspace.id;

    const result = await client.runBacklogSimulation(workspaceId, { targetDepth: 50, reason: "Two-hour backlog drill." });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const backlog = result.body.backlog;
    assert.equal(backlog.observation, "simulated");
    assert.equal(backlog.simulatedDurationMs, 7_200_000);
    assert.equal(backlog.peakDepth, 50);
    assert.equal(backlog.growthCurve[0].depth, 0);
    assert.equal(backlog.growthCurve.at(-1).depth, 50);
    assert.equal(backlog.drainCurve.at(-1).depth, 0);
    assert.ok(backlog.sloBreachedAtMs > 0);
    assert.ok(backlog.oldestQueueAgeMs > 3_600_000, "expected the backlog to breach the queue-age SLO");
    assert.equal(backlog.duplicatePaidWork, false);
    assert.equal(backlog.silentJobLoss, false);
    assert.equal(backlog.recoveredOperations, 50);
    assert.equal(FORBIDDEN.test(JSON.stringify(result.body)), false);

    // An invalid target depth is rejected at the transport boundary.
    const invalid = await client.runBacklogSimulation(workspaceId, { targetDepth: 100_000 });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.code, "VALIDATION_FAILED");
  });
});

// V0-A2 incident/runbook rehearsal and rollback or forward-recovery record.
// Owner/Admin (run_restore_drills) records a deterministic rehearsal of one
// owner-pinned scenario with its recovery type. An unknown scenario is rejected.
test("A2 incident rehearsal records a deterministic forward-recovery and a rollback rehearsal", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a2-rehearsal") });
    const created = await client.createWorkspace(
      { name: "A2 rehearsal workspace" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const workspaceId = created.body.workspace.id;

    const forward = await client.runIncidentRehearsal(workspaceId, {
      scenario: "provider_unknown_reconcile",
      runId: "rehearsal-1",
      reason: "Quarterly incident rehearsal."
    });
    assert.equal(forward.status, 200, JSON.stringify(forward.body));
    assert.equal(forward.body.rehearsal.scenario, "provider_unknown_reconcile");
    assert.equal(forward.body.rehearsal.outcome, "passed");
    assert.equal(forward.body.rehearsal.recoveryType, "forward");
    assert.ok(forward.body.rehearsal.steps.length >= 2);
    for (const step of forward.body.rehearsal.steps) {
      assert.equal(step.outcome, "passed");
    }
    assert.ok(Array.isArray(forward.body.rehearsal.recoveredEntityIds));

    const rollback = await client.runIncidentRehearsal(workspaceId, { scenario: "rollback_to_clean_revision" });
    assert.equal(rollback.status, 200);
    assert.equal(rollback.body.rehearsal.recoveryType, "rollback");
    assert.ok(rollback.body.rehearsal.steps.some((step) => /revision|supersede/i.test(step.name)));
    assert.equal(FORBIDDEN.test(JSON.stringify(forward.body) + JSON.stringify(rollback.body)), false);

    // An unknown scenario is rejected.
    const unknown = await client.runIncidentRehearsal(workspaceId, { scenario: "bogus" });
    assert.equal(unknown.status, 422);
    assert.equal(unknown.body.code, "VALIDATION_FAILED");
  });
});

// V0-A2 operational alert states. Owner/Admin (view_operations) reads deterministic
// alert states derived from the operational metrics against owner-pinned thresholds.
// An empty workspace has no active alerts; a dead-lettered job raises a critical
// dead_letter_present alert. A cross-workspace caller is hidden (404).
test("A2 operational alerts surface a critical dead-letter alert and hide cross-workspace reads", async () => {
  await withApiServer(env, async ({ baseUrl, store }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a2-alerts") });
    const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
    const created = await client.createWorkspace(
      { name: "A2 alerts workspace" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const workspaceId = created.body.workspace.id;

    const empty = await client.getWorkspaceOperationalAlerts(workspaceId);
    assert.equal(empty.status, 200, JSON.stringify(empty.body));
    assert.equal(empty.body.alerts.workspaceId, workspaceId);
    assert.equal(empty.body.alerts.active.length, 0);

    // Seed a dead-lettered job to raise a critical dead_letter_present alert.
    const sourceHash = sha256("a2-alerts-source");
    const source = await client.initiateBrandAssetUpload(
      { workspaceId, fileName: "source.mp4", contentType: "video/mp4", byteSize: 12, sha256: sourceHash },
      { idempotencyKey: `a2-alerts-source-${randomUUID()}` }
    );
    await client.completeBrandAssetUpload(source.body.artifact.id, { workspaceId, byteSize: 12, sha256: sourceHash });
    const started = await client.startSimulatedMediaProcessing(
      { workspaceId, inputArtifactId: source.body.artifact.id, outputFileName: "processed.mp4", maxAttempts: 1 },
      { idempotencyKey: `a2-alerts-processing-${randomUUID()}` }
    );
    const claimed = await worker.claimJob(started.body.job.id, { resourceClass: "CPU" });
    await worker.failJob(started.body.job.id, {
      leaseToken: claimed.body.attempt.leaseToken,
      errorCode: "SIMULATED_WORKER_CRASH",
      retryable: true
    });

    const alerted = await client.getWorkspaceOperationalAlerts(workspaceId);
    assert.equal(alerted.status, 200);
    const dead = alerted.body.alerts.active.find((alert) => alert.code === "dead_letter_present");
    assert.ok(dead, "expected a dead_letter_present alert");
    assert.equal(dead.severity, "critical");
    assert.ok(dead.observed >= 1);
    assert.equal(FORBIDDEN.test(JSON.stringify(alerted.body)), false);

    // A cross-workspace caller is hidden behind the existence-hiding 404.
    const other = new V0Client({ baseUrl, authToken: signJwt("a2-alerts-other") });
    const cross = await other.getWorkspaceOperationalAlerts(workspaceId);
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(workspaceId), false);
  });
});

// V0-A2 queue recovery drill: the deterministic core of the load-shaped backlog
// promise. Outbox relay survives Redis loss without losing the canonical job;
// an expired lease requeues the work and rejects a stale worker; a dead-lettered
// job is recovered by an Owner/Admin. No duplicate paid work, no silent job loss.
test("A2 queue recovery drill survives Redis loss, lease expiry and dead-letter with no duplicate paid work", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const { client, worker, workspaceId, jobId } = await createCleanSourceAndJob(baseUrl, {
      idSuffix: "a2-queue",
      maxAttempts: 1
    });

    // Outbox relay preserves the canonical job through Redis loss and recovers.
    const redisLoss = await worker.relayOutbox({ mode: "redis_unavailable" });
    const afterLoss = await client.getJob(jobId);
    const recovered = await worker.relayOutbox({ mode: "ok" });
    const duplicate = await worker.relayOutbox({ mode: "ok" });
    assert.equal(redisLoss.status, 503);
    assert.equal(redisLoss.body.code, "DEPENDENCY_UNAVAILABLE");
    assert.equal(afterLoss.body.job.status, "QUEUED");
    assert.equal(recovered.status, 200);
    assert.equal(duplicate.body.relayed.some((event) => event.aggregateId === jobId), false);

    // An expired lease requeues the work and rejects a stale worker completion.
    const firstClaim = await worker.claimJob(jobId, { resourceClass: "CPU" });
    const expired = await worker.expireJobLeases({ maxHeartbeatAgeMs: 0 });
    const staleCompletion = await worker.completeJob(jobId, outputFor(firstClaim, workspaceId));
    const secondClaim = await worker.claimJob(jobId, { resourceClass: "CPU" });
    assert.equal(expired.body.expired.some((job) => job.id === jobId), true);
    assert.equal(staleCompletion.status, 409);
    assert.equal(staleCompletion.body.code, "RESOURCE_VERSION_STALE");
    assert.equal(secondClaim.body.attempt.attemptNumber, 2);

    // A second lease expiry + a failing claim moves the job to dead-letter, then
    // an Owner/Admin safely recovers it. No silent job loss: the job returns to
    // QUEUED and is visible for reclaim.
    const secondExpiry = await worker.expireJobLeases({ maxHeartbeatAgeMs: 0 });
    assert.equal(secondExpiry.body.expired.some((job) => job.id === jobId), true);
    const deadLetterClaim = await worker.claimJob(jobId, { resourceClass: "CPU" });
    const failed = await worker.failJob(jobId, {
      leaseToken: deadLetterClaim.body.attempt.leaseToken,
      errorCode: "SIMULATED_WORKER_CRASH",
      retryable: true
    });
    assert.equal(failed.body.job.status, "FAILED");
    const deadLetters = await client.listDeadLetterJobs(workspaceId);
    assert.equal(deadLetters.body.jobs.some((job) => job.id === jobId), true);

    const recoveredJob = await client.recoverJob(jobId, { action: "retry_dead_letter", reason: "A2 dead-letter recovery drill." });
    assert.equal(recoveredJob.status, 200);
    assert.equal(recoveredJob.body.job.status, "QUEUED");
  });
});

// V0-A2 PostgreSQL restore drill: RLS and artifact references are preserved. An
// Owner/Admin records a restore drill against a real workspace artifact and the
// response asserts rlsPreserved and artifactReferencesChecked. A cross-workspace
// artifact is hidden behind the existence-hiding 404 and never leaks the owning
// workspace id.
test("A2 restore drill preserves RLS and artifact references and hides cross-workspace artifacts", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a2-restore") });
    const created = await client.createWorkspace(
      { name: "A2 restore workspace" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const workspaceId = created.body.workspace.id;
    const sourceHash = sha256("a2-restore-source");
    const source = await client.initiateBrandAssetUpload(
      { workspaceId, fileName: "source.mp4", contentType: "video/mp4", byteSize: 12, sha256: sourceHash },
      { idempotencyKey: `a2-restore-source-${randomUUID()}` }
    );
    await client.completeBrandAssetUpload(source.body.artifact.id, { workspaceId, byteSize: 12, sha256: sourceHash });
    const artifactId = source.body.artifact.id;

    const restore = await client.recordRestoreDrill(workspaceId, { artifactId, reason: "A2 restore drill." });
    assert.equal(restore.status, 200, JSON.stringify(restore.body));
    assert.equal(restore.body.restore.rlsPreserved, true);
    assert.equal(restore.body.restore.artifactReferencesChecked, 1);
    assert.equal(restore.body.restore.artifactId, artifactId);

    // A cross-workspace caller probing the artifact is hidden behind the 404.
    const other = new V0Client({ baseUrl, authToken: signJwt("a2-restore-other") });
    const otherWorkspace = await other.createWorkspace(
      { name: "A2 restore other" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const cross = await other.recordRestoreDrill(otherWorkspace.body.workspace.id, { artifactId, reason: "Cross-tenant probe." });
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(workspaceId), false);
    assert.equal(JSON.stringify(cross.body).includes(artifactId), false);
  });
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createCleanSourceAndJob(baseUrl, { idSuffix, maxAttempts = undefined }) {
  const client = new V0Client({ baseUrl, authToken: signJwt(`user-${idSuffix}`) });
  const worker = new V0Client({ baseUrl, internalWorkerToken: workerToken });
  const created = await client.createWorkspace(
    { name: `Aster Heights ${idSuffix}` },
    { idempotencyKey: `a2-create-${idSuffix}` }
  );
  const workspaceId = created.body.workspace.id;
  const sourceHash = sha256(`source-video-${idSuffix}`);
  const source = await client.initiateBrandAssetUpload(
    { workspaceId, fileName: `source-${idSuffix}.mp4`, contentType: "video/mp4", byteSize: 12, sha256: sourceHash },
    { idempotencyKey: `a2-source-${idSuffix}` }
  );
  await client.completeBrandAssetUpload(source.body.artifact.id, { workspaceId, byteSize: 12, sha256: sourceHash });
  const started = await client.startSimulatedMediaProcessing(
    {
      workspaceId,
      inputArtifactId: source.body.artifact.id,
      outputFileName: `processed-${idSuffix}.mp4`,
      ...(maxAttempts ? { maxAttempts } : {})
    },
    { idempotencyKey: `a2-processing-${idSuffix}` }
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
