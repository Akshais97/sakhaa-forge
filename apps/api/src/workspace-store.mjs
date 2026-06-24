import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "../../../packages/db/generated/client/index.js";

export function createStore(env = process.env) {
  if (env.V0_RUNTIME_DB === "prisma") {
    return createPrismaWorkspaceStore(env);
  }
  return createWorkspaceStore();
}

export function createWorkspaceStore() {
  const users = new Map();
  const workspaces = new Map();
  const memberships = new Map();
  const audits = [];
  const idempotencyRecords = new Map();
  const artifacts = new Map();
  const uploadTokens = new Map();
  const downloadTokens = new Map();
  const jobs = new Map();
  const jobAttempts = new Map();
  const jobEvents = new Map();
  const outboxEvents = new Map();

  function ensureUser(actor) {
    if (!users.has(actor.userId)) {
      users.set(actor.userId, {
        id: actor.userId,
        email: actor.email,
        createdAt: new Date().toISOString()
      });
    }
    return users.get(actor.userId);
  }

  function createWorkspace(actor, input) {
    ensureUser(actor);
    const now = new Date().toISOString();
    const workspace = {
      id: randomUUID(),
      name: input.name.trim(),
      slug: slugify(input.name),
      createdAt: now,
      updatedAt: now
    };
    const membership = {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: actor.userId,
      role: "OWNER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now
    };
    const audit = {
      id: randomUUID(),
      workspaceId: workspace.id,
      actorUserId: actor.userId,
      eventType: "workspace.created",
      occurredAt: now
    };

    workspaces.set(workspace.id, workspace);
    memberships.set(membership.id, membership);
    audits.push(audit);
    return { workspace, membership, audit };
  }

  function listWorkspaces(actor) {
    return [...memberships.values()]
      .filter((membership) => membership.userId === actor.userId && membership.status === "ACTIVE")
      .map((membership) => ({
        ...workspaces.get(membership.workspaceId),
        membership: {
          role: membership.role,
          status: membership.status
        }
      }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  function getWorkspaceForActor(actor, workspaceId) {
    const membership = [...memberships.values()].find(
      (candidate) =>
        candidate.userId === actor.userId &&
        candidate.workspaceId === workspaceId &&
        candidate.status === "ACTIVE"
    );
    if (!membership) {
      return null;
    }
    const workspace = workspaces.get(workspaceId);
    if (!workspace) {
      return null;
    }
    return {
      workspace,
      membership: {
        role: membership.role,
        status: membership.status
      }
    };
  }

  function initiateArtifactUpload(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateUploadInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }

    const now = new Date().toISOString();
    const artifact = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      fileName: input.fileName.trim(),
      contentType: input.contentType.trim().toLowerCase(),
      byteSize: input.byteSize,
      sha256: input.sha256.trim().toLowerCase(),
      status: "QUARANTINED",
      retentionClass: "quarantine",
      producer: "browser-upload",
      schemaVersion: "artifact.upload.v1",
      objectKey: `quarantine/${input.workspaceId}/${randomUUID()}`,
      createdAt: now,
      updatedAt: now
    };
    const upload = signedContract("PUT", artifact.id);
    artifacts.set(artifact.id, artifact);
    uploadTokens.set(upload.token, {
      artifactId: artifact.id,
      workspaceId: artifact.workspaceId,
      expiresAt: upload.expiresAt
    });
    audits.push({
      id: randomUUID(),
      workspaceId: artifact.workspaceId,
      actorUserId: actor.userId,
      eventType: "artifact.upload_initiated",
      targetType: "Artifact",
      targetId: artifact.id,
      occurredAt: now
    });

    return {
      ok: true,
      response: {
        artifact: publicArtifact(artifact),
        upload
      }
    };
  }

  function completeArtifactUpload(actor, artifactId, input) {
    const artifact = artifacts.get(artifactId);
    if (!artifact || !getWorkspaceForActor(actor, artifact.workspaceId) || input.workspaceId !== artifact.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (!isSha256(input.sha256) || !Number.isInteger(input.byteSize) || input.byteSize <= 0) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }

    if (input.sha256.toLowerCase() !== artifact.sha256 || input.byteSize !== artifact.byteSize) {
      const rejected = rejectArtifact(artifact, "artifact.hash_mismatch");
      return {
        ok: false,
        problem: {
          ...problem(
            "ARTIFACT_HASH_MISMATCH",
            409,
            "Artifact hash mismatch",
            "The file did not match the expected content. It was not accepted."
          ),
          artifact: publicArtifact(rejected)
        }
      };
    }

    if (!supportedContentTypes.has(artifact.contentType)) {
      const rejected = rejectArtifact(artifact, "artifact.type_unsupported");
      return {
        ok: false,
        problem: {
          ...problem(
            "ASSET_TYPE_UNSUPPORTED",
            415,
            "Asset type unsupported",
            "This file type is not supported."
          ),
          artifact: publicArtifact(rejected)
        }
      };
    }

    artifact.status = "CLEAN";
    artifact.retentionClass = "clean-media";
    artifact.updatedAt = new Date().toISOString();
    return {
      ok: true,
      response: {
        artifact: publicArtifact(artifact)
      }
    };
  }

  function createArtifactDownload(actor, artifactId, input) {
    const artifact = artifacts.get(artifactId);
    if (
      !artifact ||
      artifact.workspaceId !== input.workspaceId ||
      !getWorkspaceForActor(actor, artifact.workspaceId) ||
      artifact.status !== "CLEAN"
    ) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const download = signedContract("GET", artifact.id);
    downloadTokens.set(download.token, {
      artifactId: artifact.id,
      workspaceId: artifact.workspaceId,
      expiresAt: download.expiresAt
    });

    return {
      ok: true,
      response: {
        artifact: publicArtifact(artifact),
        download
      }
    };
  }

  function startSimulatedMediaProcessing(actor, input) {
    const workspaceAccess = getWorkspaceForActor(actor, input.workspaceId);
    const inputArtifact = artifacts.get(input.inputArtifactId);
    if (
      !workspaceAccess ||
      !inputArtifact ||
      inputArtifact.workspaceId !== input.workspaceId ||
      inputArtifact.status !== "CLEAN"
    ) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (
      typeof input.outputFileName !== "string" ||
      input.outputFileName.trim().length === 0 ||
      (input.maxAttempts !== undefined && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1))
    ) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }

    const now = new Date().toISOString();
    const job = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      type: "simulated_media_processing",
      resourceClass: "CPU",
      status: "QUEUED",
      priority: 0,
      inputHash: hashRequest({
        inputArtifactId: input.inputArtifactId,
        outputFileName: input.outputFileName
      }),
      input: {
        inputArtifactId: input.inputArtifactId,
        inputArtifactSha256: inputArtifact.sha256,
        outputFileName: input.outputFileName
      },
      maxAttempts: input.maxAttempts ?? 5,
      createdAt: now,
      updatedAt: now
    };
    const outbox = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      eventType: "job.wakeup_requested",
      aggregateType: "Job",
      aggregateId: job.id,
      payload: { jobId: job.id },
      status: "PENDING",
      createdAt: now
    };
    jobs.set(job.id, job);
    outboxEvents.set(outbox.id, outbox);
    appendJobEvent(jobEvents, job, "job.created", { inputArtifactId: input.inputArtifactId });
    appendJobEvent(jobEvents, job, "job.queued", { outboxEventId: outbox.id });
    return { ok: true, response: { job: publicJob(job), outboxEvent: publicOutboxEvent(outbox) } };
  }

  function getJobForActor(actor, jobId) {
    const job = jobs.get(jobId);
    if (!job || !getWorkspaceForActor(actor, job.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return { ok: true, response: { job: publicJob(job) } };
  }

  function listJobEventsForActor(actor, jobId) {
    const job = jobs.get(jobId);
    if (!job || !getWorkspaceForActor(actor, job.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return {
      ok: true,
      response: { events: (jobEvents.get(jobId) ?? []).map(publicJobEvent) }
    };
  }

  function listDeadLetterJobs(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return {
      ok: true,
      response: {
        jobs: [...jobs.values()]
          .filter((job) => job.workspaceId === input.workspaceId && job.status === "FAILED")
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map(publicJob)
      }
    };
  }

  function claimJob(jobId, input) {
    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (input.resourceClass && input.resourceClass !== job.resourceClass) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    if (!["QUEUED", "EXPIRED", "RETRY_WAIT"].includes(job.status)) {
      return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
    }
    const now = new Date().toISOString();
    const attempt = {
      id: randomUUID(),
      jobId: job.id,
      workspaceId: job.workspaceId,
      attemptNumber: [...jobAttempts.values()].filter((candidate) => candidate.jobId === job.id).length + 1,
      leaseToken: randomUUID(),
      status: "LEASED",
      leasedAt: now,
      heartbeatAt: now,
      createdAt: now,
      updatedAt: now
    };
    job.status = "LEASED";
    job.updatedAt = now;
    jobAttempts.set(attempt.id, attempt);
    appendJobEvent(jobEvents, job, "job.leased", { attemptId: attempt.id });
    return { ok: true, response: { job: publicJob(job), attempt: publicJobAttempt(attempt), input: job.input } };
  }

  function heartbeatJob(jobId, input) {
    const leased = findActiveAttempt(jobAttempts, jobId, input.leaseToken);
    if (!leased) {
      return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
    }
    const job = jobs.get(jobId);
    const now = new Date().toISOString();
    leased.status = "RUNNING";
    leased.heartbeatAt = now;
    leased.updatedAt = now;
    job.status = "RUNNING";
    job.updatedAt = now;
    appendJobEvent(jobEvents, job, "job.running", { attemptId: leased.id });
    return { ok: true, response: { job: publicJob(job), attempt: publicJobAttempt(leased) } };
  }

  function completeJob(jobId, input) {
    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const existingArtifact = [...artifacts.values()].find(
      (artifact) => artifact.producer === `job:${job.id}` && artifact.status === "CLEAN"
    );
    if (job.status === "SUCCEEDED" && existingArtifact) {
      return { ok: true, response: { job: publicJob(job), artifact: publicArtifact(existingArtifact) } };
    }
    const leased = findActiveAttempt(jobAttempts, jobId, input.leaseToken);
    if (!leased) {
      return {
        ok: false,
        problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
      };
    }
    if (!isValidWorkerOutput(job, input)) {
      return {
        ok: false,
        problem: problem(
          "PROVIDER_OUTPUT_INVALID",
          422,
          "Provider output invalid",
          "The generated media failed validation and was not accepted."
        )
      };
    }

    const now = new Date().toISOString();
    const artifact = {
      id: randomUUID(),
      workspaceId: job.workspaceId,
      fileName: input.fileName.trim(),
      contentType: input.contentType.trim().toLowerCase(),
      byteSize: input.byteSize,
      sha256: input.sha256.trim().toLowerCase(),
      status: "CLEAN",
      retentionClass: "clean-media",
      producer: `job:${job.id}`,
      schemaVersion: input.schemaVersion,
      objectKey: input.objectKey,
      createdAt: now,
      updatedAt: now
    };
    artifacts.set(artifact.id, artifact);
    leased.status = "SUCCEEDED";
    leased.completedAt = now;
    leased.updatedAt = now;
    job.status = "SUCCEEDED";
    job.outputArtifactId = artifact.id;
    job.updatedAt = now;
    appendJobEvent(jobEvents, job, "artifact.retained", { artifactId: artifact.id, sha256: artifact.sha256 });
    appendJobEvent(jobEvents, job, "job.completed", { attemptId: leased.id });
    return { ok: true, response: { job: publicJob(job), artifact: publicArtifact(artifact) } };
  }

  function failJob(jobId, input) {
    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const leased = findActiveAttempt(jobAttempts, jobId, input.leaseToken);
    if (!leased) {
      return {
        ok: false,
        problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
      };
    }
    const now = new Date().toISOString();
    leased.status = "FAILED";
    leased.errorCode = input.errorCode || "WORKER_FAILED";
    leased.completedAt = now;
    leased.updatedAt = now;
    job.lastErrorCode = leased.errorCode;
    if (input.retryable === true && leased.attemptNumber < job.maxAttempts) {
      job.status = "RETRY_WAIT";
      job.nextRunAt = now;
      appendJobEvent(jobEvents, job, "job.retry_scheduled", { attemptId: leased.id, errorCode: leased.errorCode });
      job.status = "QUEUED";
      appendJobEvent(jobEvents, job, "job.queued", { reason: "retry" });
    } else {
      job.status = "FAILED";
      appendJobEvent(jobEvents, job, "job.failed", { attemptId: leased.id, errorCode: leased.errorCode });
      appendJobEvent(jobEvents, job, "job.dead_lettered", { attemptId: leased.id, errorCode: leased.errorCode });
    }
    job.updatedAt = now;
    return { ok: true, response: { job: publicJob(job), attempt: publicJobAttempt(leased) } };
  }

  function expireJobLeases(input) {
    const maxHeartbeatAgeMs = Number.isInteger(input.maxHeartbeatAgeMs) ? input.maxHeartbeatAgeMs : 300000;
    const nowMs = Date.now();
    const expired = [];
    for (const attempt of jobAttempts.values()) {
      if (!["LEASED", "RUNNING"].includes(attempt.status)) {
        continue;
      }
      if (nowMs - new Date(attempt.heartbeatAt).getTime() < maxHeartbeatAgeMs) {
        continue;
      }
      const job = jobs.get(attempt.jobId);
      if (!job || ["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) {
        continue;
      }
      const now = new Date().toISOString();
      attempt.status = "EXPIRED";
      attempt.updatedAt = now;
      job.status = "QUEUED";
      job.updatedAt = now;
      appendJobEvent(jobEvents, job, "job.lease_expired", { attemptId: attempt.id });
      appendJobEvent(jobEvents, job, "job.queued", { reason: "lease_expired" });
      expired.push(publicJob(job));
    }
    return { ok: true, response: { expired } };
  }

  function relayOutbox(input) {
    if (input.mode === "redis_unavailable") {
      return {
        ok: false,
        problem: problem("DEPENDENCY_UNAVAILABLE", 503, "Dependency unavailable", "This service is temporarily unavailable.", true)
      };
    }
    const relayed = [];
    for (const event of outboxEvents.values()) {
      if (event.status !== "PENDING") {
        continue;
      }
      const job = jobs.get(event.aggregateId);
      if (!job) {
        continue;
      }
      event.status = "PUBLISHED";
      event.publishedAt = new Date().toISOString();
      appendJobEvent(jobEvents, job, "job.wakeup_relayed", { outboxEventId: event.id, queue: job.resourceClass });
      relayed.push(publicOutboxEvent(event));
    }
    return { ok: true, response: { relayed } };
  }

  async function runIdempotent({ actor, operation, idempotencyKey, input }, createResponse) {
    const scope = `${actor.userId}:${operation}:${idempotencyKey}`;
    const requestHash = hashRequest(input);
    const existing = idempotencyRecords.get(scope);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        return {
          ok: false,
          problem: problem(
            "IDEMPOTENCY_INPUT_CONFLICT",
            409,
            "Idempotency input conflict",
            "This request identity was already used with different details."
          )
        };
      }
      return {
        ok: true,
        response: structuredClone(existing.response)
      };
    }

    const response = await createResponse();
    idempotencyRecords.set(scope, {
      actorUserId: actor.userId,
      operation,
      idempotencyKey,
      requestHash,
      response: structuredClone(response),
      createdAt: new Date().toISOString()
    });

    return {
      ok: true,
      response
    };
  }

  return {
    createWorkspace,
    listWorkspaces,
    getWorkspaceForActor,
    runIdempotent,
    initiateArtifactUpload,
    completeArtifactUpload,
    createArtifactDownload,
    startSimulatedMediaProcessing,
    getJobForActor,
    listJobEventsForActor,
    listDeadLetterJobs,
    claimJob,
    heartbeatJob,
    completeJob,
    failJob,
    expireJobLeases,
    relayOutbox,
    disconnect: () => {}
  };
}

export function createPrismaWorkspaceStore(env = process.env) {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL
      }
    }
  });

  async function withActor(actor, fn, workspaceId = "") {
    return prisma.$transaction(async (tx) => {
      await setActorContext(tx, actor.userId, workspaceId);
      return fn(tx);
    });
  }

  async function ensureUser(tx, actor) {
    await tx.user.upsert({
      where: { id: actor.userId },
      update: {
        email: actor.email
      },
      create: {
        id: actor.userId,
        email: actor.email
      }
    });
  }

  async function createWorkspace(actor, input, tx = prisma) {
    const workspaceId = randomUUID();
    await setActorContext(tx, actor.userId, workspaceId);
    await ensureUser(tx, actor);

    const workspace = await tx.workspace.create({
      data: {
        id: workspaceId,
        name: input.name.trim(),
        slug: `${slugify(input.name)}-${workspaceId.slice(0, 8)}`
      }
    });
    const membership = await tx.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: actor.userId,
        role: "OWNER"
      }
    });
    const audit = await tx.auditEvent.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        eventType: "workspace.created"
      }
    });

    return {
      workspace: publicWorkspace(workspace),
      membership: publicMembership(membership),
      audit: publicAudit(audit)
    };
  }

  async function listWorkspaces(actor) {
    return withActor(actor, async (tx) => {
      const memberships = await tx.membership.findMany({
        where: {
          userId: actor.userId,
          status: "ACTIVE"
        },
        include: {
          workspace: true
        },
        orderBy: {
          createdAt: "asc"
        }
      });
      return memberships.map((membership) => ({
        ...publicWorkspace(membership.workspace),
        membership: {
          role: membership.role,
          status: membership.status
        }
      }));
    });
  }

  async function getWorkspaceForActor(actor, workspaceId) {
    return withActor(
      actor,
      async (tx) => {
        const membership = await tx.membership.findFirst({
          where: {
            workspaceId,
            userId: actor.userId,
            status: "ACTIVE"
          },
          include: {
            workspace: true
          }
        });
        if (!membership) {
          return null;
        }
        return {
          workspace: publicWorkspace(membership.workspace),
          membership: {
            role: membership.role,
            status: membership.status
          }
        };
      },
      workspaceId
    );
  }

  async function runIdempotent({ actor, operation, idempotencyKey, input }, createResponse) {
    const requestHash = hashRequest(input);
    return withActor(actor, async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({
        where: {
          actorUserId_operation_idempotencyKey: {
            actorUserId: actor.userId,
            operation,
            idempotencyKey
          }
        }
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          return {
            ok: false,
            problem: problem(
              "IDEMPOTENCY_INPUT_CONFLICT",
              409,
              "Idempotency input conflict",
              "This request identity was already used with different details."
            )
          };
        }
        return {
          ok: true,
          response: existing.responseBody
        };
      }

      const response = await createResponse(tx);
      await tx.idempotencyRecord.create({
        data: {
          actorUserId: actor.userId,
          workspaceId: response.workspace?.id ?? response.artifact?.workspaceId ?? response.job?.workspaceId ?? null,
          operation,
          idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseBody: response
        }
      });

      return {
        ok: true,
        response
      };
    });
  }

  async function initiateArtifactUpload(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateUploadInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }

    return withActor(
      actor,
      async (tx) => {
        const artifact = await tx.artifact.create({
          data: {
            workspaceId: input.workspaceId,
            fileName: input.fileName.trim(),
            contentType: input.contentType.trim().toLowerCase(),
            byteSize: input.byteSize,
            sha256: input.sha256.trim().toLowerCase(),
            status: "QUARANTINED",
            retentionClass: "quarantine",
            producer: "browser-upload",
            schemaVersion: "artifact.upload.v1",
            objectKey: `quarantine/${input.workspaceId}/${randomUUID()}`
          }
        });
        await tx.auditEvent.create({
          data: {
            workspaceId: artifact.workspaceId,
            actorUserId: actor.userId,
            eventType: "artifact.upload_initiated",
            targetType: "Artifact",
            targetId: artifact.id
          }
        });

        return {
          ok: true,
          response: {
            artifact: publicArtifact(artifact),
            upload: signedContract("PUT", artifact.id)
          }
        };
      },
      input.workspaceId
    );
  }

  async function completeArtifactUpload(actor, artifactId, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return withActor(
      actor,
      async (tx) => {
        const artifact = await tx.artifact.findFirst({
          where: {
            id: artifactId,
            workspaceId: input.workspaceId
          }
        });
        if (!artifact) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        if (!isSha256(input.sha256) || !Number.isInteger(input.byteSize) || input.byteSize <= 0) {
          return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
        }

        if (input.sha256.toLowerCase() !== artifact.sha256 || input.byteSize !== artifact.byteSize) {
          const rejected = await tx.artifact.update({
            where: { id: artifact.id },
            data: {
              status: "REJECTED",
              retentionClass: "quarantine"
            }
          });
          return {
            ok: false,
            problem: {
              ...problem(
                "ARTIFACT_HASH_MISMATCH",
                409,
                "Artifact hash mismatch",
                "The file did not match the expected content. It was not accepted."
              ),
              artifact: publicArtifact(rejected)
            }
          };
        }

        if (!supportedContentTypes.has(artifact.contentType)) {
          const rejected = await tx.artifact.update({
            where: { id: artifact.id },
            data: {
              status: "REJECTED",
              retentionClass: "quarantine"
            }
          });
          return {
            ok: false,
            problem: {
              ...problem("ASSET_TYPE_UNSUPPORTED", 415, "Asset type unsupported", "This file type is not supported."),
              artifact: publicArtifact(rejected)
            }
          };
        }

        const clean = await tx.artifact.update({
          where: { id: artifact.id },
          data: {
            status: "CLEAN",
            retentionClass: "clean-media"
          }
        });
        return {
          ok: true,
          response: {
            artifact: publicArtifact(clean)
          }
        };
      },
      input.workspaceId
    );
  }

  async function createArtifactDownload(actor, artifactId, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return withActor(
      actor,
      async (tx) => {
        const artifact = await tx.artifact.findFirst({
          where: {
            id: artifactId,
            workspaceId: input.workspaceId,
            status: "CLEAN"
          }
        });
        if (!artifact) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        return {
          ok: true,
          response: {
            artifact: publicArtifact(artifact),
            download: signedContract("GET", artifact.id)
          }
        };
      },
      input.workspaceId
    );
  }

  async function startSimulatedMediaProcessing(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (
      typeof input.outputFileName !== "string" ||
      input.outputFileName.trim().length === 0 ||
      (input.maxAttempts !== undefined && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1))
    ) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }

    return withActor(
      actor,
      async (tx) => {
        const inputArtifact = await tx.artifact.findFirst({
          where: {
            id: input.inputArtifactId,
            workspaceId: input.workspaceId,
            status: "CLEAN"
          }
        });
        if (!inputArtifact) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const job = await tx.job.create({
          data: {
            workspaceId: input.workspaceId,
            type: "simulated_media_processing",
            resourceClass: "CPU",
            status: "QUEUED",
            inputHash: hashRequest({
              inputArtifactId: input.inputArtifactId,
              outputFileName: input.outputFileName
            }),
            input: {
              inputArtifactId: input.inputArtifactId,
              inputArtifactSha256: inputArtifact.sha256,
              outputFileName: input.outputFileName
            },
            maxAttempts: input.maxAttempts ?? 5
          }
        });
        const outbox = await tx.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            eventType: "job.wakeup_requested",
            aggregateType: "Job",
            aggregateId: job.id,
            payload: { jobId: job.id },
            status: "PENDING"
          }
        });
        await tx.jobEvent.createMany({
          data: [
            {
              workspaceId: job.workspaceId,
              jobId: job.id,
              eventType: "job.created",
              payload: { inputArtifactId: input.inputArtifactId }
            },
            {
              workspaceId: job.workspaceId,
              jobId: job.id,
              eventType: "job.queued",
              payload: { outboxEventId: outbox.id }
            }
          ]
        });
        return { ok: true, response: { job: publicJob(job), outboxEvent: publicOutboxEvent(outbox) } };
      },
      input.workspaceId
    );
  }

  async function getJobForActor(actor, jobId) {
    return withActor(actor, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId } });
      if (!job) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      return { ok: true, response: { job: publicJob(job) } };
    });
  }

  async function listJobEventsForActor(actor, jobId) {
    return withActor(actor, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId } });
      if (!job) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      const events = await tx.jobEvent.findMany({
        where: { jobId },
        orderBy: { createdAt: "asc" }
      });
      return { ok: true, response: { events: events.map(publicJobEvent) } };
    });
  }

  async function listDeadLetterJobs(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return withActor(
      actor,
      async (tx) => {
        const jobs = await tx.job.findMany({
          where: { workspaceId: input.workspaceId, status: "FAILED" },
          orderBy: { updatedAt: "desc" }
        });
        return { ok: true, response: { jobs: jobs.map(publicJob) } };
      },
      input.workspaceId
    );
  }

  async function claimJob(jobId, input) {
    return prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      if (input.resourceClass && input.resourceClass !== job.resourceClass) {
        return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
      }
      if (!["QUEUED", "EXPIRED", "RETRY_WAIT"].includes(job.status)) {
        return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
      }
      const attemptNumber = await tx.jobAttempt.count({ where: { jobId } }) + 1;
      const attempt = await tx.jobAttempt.create({
        data: {
          workspaceId: job.workspaceId,
          jobId,
          attemptNumber,
          leaseToken: randomUUID(),
          status: "LEASED"
        }
      });
      const updated = await tx.job.update({
        where: { id: jobId },
        data: { status: "LEASED" }
      });
      await tx.jobEvent.create({
        data: {
          workspaceId: job.workspaceId,
          jobId,
          eventType: "job.leased",
          payload: { attemptId: attempt.id }
        }
      });
      return { ok: true, response: { job: publicJob(updated), attempt: publicJobAttempt(attempt), input: job.input } };
    });
  }

  async function heartbeatJob(jobId, input) {
    return prisma.$transaction(async (tx) => {
      const attempt = await tx.jobAttempt.findFirst({
        where: { jobId, leaseToken: input.leaseToken, status: { in: ["LEASED", "RUNNING"] } }
      });
      if (!attempt) {
        return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
      }
      const heartbeatAt = new Date();
      const updatedAttempt = await tx.jobAttempt.update({
        where: { id: attempt.id },
        data: { status: "RUNNING", heartbeatAt }
      });
      const job = await tx.job.update({
        where: { id: jobId },
        data: { status: "RUNNING" }
      });
      await tx.jobEvent.create({
        data: {
          workspaceId: job.workspaceId,
          jobId,
          eventType: "job.running",
          payload: { attemptId: attempt.id }
        }
      });
      return { ok: true, response: { job: publicJob(job), attempt: publicJobAttempt(updatedAttempt) } };
    });
  }

  async function completeJob(jobId, input) {
    return prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      const existingArtifact = await tx.artifact.findFirst({
        where: { workspaceId: job.workspaceId, producer: `job:${job.id}`, status: "CLEAN" }
      });
      if (job.status === "SUCCEEDED" && existingArtifact) {
        return { ok: true, response: { job: publicJob(job), artifact: publicArtifact(existingArtifact) } };
      }
      const attempt = await tx.jobAttempt.findFirst({
        where: { jobId, leaseToken: input.leaseToken, status: { in: ["LEASED", "RUNNING"] } }
      });
      if (!attempt) {
        return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
      }
      if (!isValidWorkerOutput(job, input)) {
        return {
          ok: false,
          problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "The generated media failed validation and was not accepted.")
        };
      }
      const artifact = await tx.artifact.create({
        data: {
          workspaceId: job.workspaceId,
          fileName: input.fileName.trim(),
          contentType: input.contentType.trim().toLowerCase(),
          byteSize: input.byteSize,
          sha256: input.sha256.trim().toLowerCase(),
          status: "CLEAN",
          retentionClass: "clean-media",
          producer: `job:${job.id}`,
          schemaVersion: input.schemaVersion,
          objectKey: input.objectKey
        }
      });
      const updatedAttempt = await tx.jobAttempt.update({
        where: { id: attempt.id },
        data: { status: "SUCCEEDED", completedAt: new Date() }
      });
      const updatedJob = await tx.job.update({
        where: { id: job.id },
        data: { status: "SUCCEEDED", outputArtifactId: artifact.id }
      });
      await tx.jobEvent.createMany({
        data: [
          {
            workspaceId: job.workspaceId,
            jobId: job.id,
            eventType: "artifact.retained",
            payload: { artifactId: artifact.id, sha256: artifact.sha256 }
          },
          {
            workspaceId: job.workspaceId,
            jobId: job.id,
            eventType: "job.completed",
            payload: { attemptId: updatedAttempt.id }
          }
        ]
      });
      return { ok: true, response: { job: publicJob(updatedJob), artifact: publicArtifact(artifact) } };
    });
  }

  async function failJob(jobId, input) {
    return prisma.$transaction(async (tx) => {
      const attempt = await tx.jobAttempt.findFirst({
        where: { jobId, leaseToken: input.leaseToken, status: { in: ["LEASED", "RUNNING"] } }
      });
      if (!attempt) {
        return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
      }
      const job = await tx.job.findUnique({ where: { id: jobId } });
      const errorCode = input.errorCode || "WORKER_FAILED";
      const updatedAttempt = await tx.jobAttempt.update({
        where: { id: attempt.id },
        data: { status: "FAILED", errorCode, completedAt: new Date() }
      });
      let updatedJob;
      if (input.retryable === true && attempt.attemptNumber < job.maxAttempts) {
        await tx.jobEvent.create({
          data: { workspaceId: job.workspaceId, jobId, eventType: "job.retry_scheduled", payload: { attemptId: attempt.id, errorCode } }
        });
        updatedJob = await tx.job.update({ where: { id: jobId }, data: { status: "QUEUED", lastErrorCode: errorCode } });
        await tx.jobEvent.create({
          data: { workspaceId: job.workspaceId, jobId, eventType: "job.queued", payload: { reason: "retry" } }
        });
      } else {
        updatedJob = await tx.job.update({ where: { id: jobId }, data: { status: "FAILED", lastErrorCode: errorCode } });
        await tx.jobEvent.createMany({
          data: [
            { workspaceId: job.workspaceId, jobId, eventType: "job.failed", payload: { attemptId: attempt.id, errorCode } },
            { workspaceId: job.workspaceId, jobId, eventType: "job.dead_lettered", payload: { attemptId: attempt.id, errorCode } }
          ]
        });
      }
      return { ok: true, response: { job: publicJob(updatedJob), attempt: publicJobAttempt(updatedAttempt) } };
    });
  }

  async function expireJobLeases(input) {
    const maxHeartbeatAgeMs = Number.isInteger(input.maxHeartbeatAgeMs) ? input.maxHeartbeatAgeMs : 300000;
    return prisma.$transaction(async (tx) => {
      const activeAttempts = await tx.jobAttempt.findMany({
        where: { status: { in: ["LEASED", "RUNNING"] } }
      });
      const expired = [];
      const nowMs = Date.now();
      for (const attempt of activeAttempts) {
        if (nowMs - new Date(attempt.heartbeatAt).getTime() < maxHeartbeatAgeMs) {
          continue;
        }
        const job = await tx.job.findUnique({ where: { id: attempt.jobId } });
        if (!job || ["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) {
          continue;
        }
        await tx.jobAttempt.update({ where: { id: attempt.id }, data: { status: "EXPIRED" } });
        const updatedJob = await tx.job.update({ where: { id: job.id }, data: { status: "QUEUED" } });
        await tx.jobEvent.createMany({
          data: [
            { workspaceId: job.workspaceId, jobId: job.id, eventType: "job.lease_expired", payload: { attemptId: attempt.id } },
            { workspaceId: job.workspaceId, jobId: job.id, eventType: "job.queued", payload: { reason: "lease_expired" } }
          ]
        });
        expired.push(publicJob(updatedJob));
      }
      return { ok: true, response: { expired } };
    });
  }

  async function relayOutbox(input) {
    if (input.mode === "redis_unavailable") {
      return {
        ok: false,
        problem: problem("DEPENDENCY_UNAVAILABLE", 503, "Dependency unavailable", "This service is temporarily unavailable.", true)
      };
    }
    return prisma.$transaction(async (tx) => {
      const pending = await tx.outboxEvent.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" }
      });
      const relayed = [];
      for (const event of pending) {
        const job = await tx.job.findUnique({ where: { id: event.aggregateId } });
        if (!job) {
          continue;
        }
        const updated = await tx.outboxEvent.update({
          where: { id: event.id },
          data: { status: "PUBLISHED", publishedAt: new Date() }
        });
        await tx.jobEvent.create({
          data: {
            workspaceId: job.workspaceId,
            jobId: job.id,
            eventType: "job.wakeup_relayed",
            payload: { outboxEventId: event.id, queue: job.resourceClass }
          }
        });
        relayed.push(publicOutboxEvent(updated));
      }
      return { ok: true, response: { relayed } };
    });
  }

  return {
    createWorkspace,
    listWorkspaces,
    getWorkspaceForActor,
    runIdempotent,
    initiateArtifactUpload,
    completeArtifactUpload,
    createArtifactDownload,
    startSimulatedMediaProcessing,
    getJobForActor,
    listJobEventsForActor,
    listDeadLetterJobs,
    claimJob,
    heartbeatJob,
    completeJob,
    failJob,
    expireJobLeases,
    relayOutbox,
    disconnect: () => prisma.$disconnect()
  };
}

const supportedContentTypes = new Set(["image/png", "image/jpeg", "video/mp4"]);

function signedContract(method, artifactId) {
  return {
    method,
    token: randomUUID(),
    artifactId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  };
}

function validateUploadInput(input) {
  if (
    typeof input.workspaceId !== "string" ||
    typeof input.fileName !== "string" ||
    input.fileName.trim().length === 0 ||
    typeof input.contentType !== "string" ||
    !Number.isInteger(input.byteSize) ||
    input.byteSize <= 0 ||
    !isSha256(input.sha256)
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.byteSize > 104857600) {
    return problem("ASSET_TOO_LARGE", 413, "Asset too large", "This file is larger than the allowed limit.");
  }
  return null;
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function rejectArtifact(artifact, eventType) {
  artifact.status = "REJECTED";
  artifact.retentionClass = "quarantine";
  artifact.updatedAt = new Date().toISOString();
  artifact.rejectedReason = eventType;
  return artifact;
}

function publicArtifact(artifact) {
  return {
    id: artifact.id,
    workspaceId: artifact.workspaceId,
    fileName: artifact.fileName,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
    status: artifact.status,
    retentionClass: artifact.retentionClass,
    producer: artifact.producer,
    schemaVersion: artifact.schemaVersion,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt
  };
}

function appendJobEvent(jobEvents, job, eventType, payload) {
  const now = new Date().toISOString();
  const events = jobEvents.get(job.id) ?? [];
  const event = {
    id: randomUUID(),
    workspaceId: job.workspaceId,
    jobId: job.id,
    eventType,
    payload,
    createdAt: now
  };
  events.push(event);
  jobEvents.set(job.id, events);
  return event;
}

function findActiveAttempt(jobAttempts, jobId, leaseToken) {
  if (typeof leaseToken !== "string" || leaseToken.length === 0) {
    return null;
  }
  return [...jobAttempts.values()].find(
    (attempt) =>
      attempt.jobId === jobId &&
      attempt.leaseToken === leaseToken &&
      ["LEASED", "RUNNING"].includes(attempt.status)
  ) ?? null;
}

function isValidWorkerOutput(job, input) {
  return (
    input.workspaceId === job.workspaceId &&
    typeof input.fileName === "string" &&
    input.fileName.trim().length > 0 &&
    input.contentType === "video/mp4" &&
    Number.isInteger(input.byteSize) &&
    input.byteSize > 0 &&
    isSha256(input.sha256) &&
    input.schemaVersion === "simulated.media.output.v1" &&
    typeof input.objectKey === "string" &&
    input.objectKey.startsWith(`clean-media/${job.workspaceId}/`)
  );
}

function publicJob(job) {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    type: job.type,
    resourceClass: job.resourceClass,
    status: job.status,
    priority: job.priority,
    inputHash: job.inputHash,
    outputArtifactId: job.outputArtifactId ?? null,
    nextRunAt: toIso(job.nextRunAt) ?? null,
    lastErrorCode: job.lastErrorCode ?? null,
    createdAt: toIso(job.createdAt),
    updatedAt: toIso(job.updatedAt)
  };
}

function publicJobAttempt(attempt) {
  return {
    id: attempt.id,
    jobId: attempt.jobId,
    attemptNumber: attempt.attemptNumber,
    leaseToken: attempt.leaseToken,
    status: attempt.status,
    leasedAt: toIso(attempt.leasedAt),
    heartbeatAt: toIso(attempt.heartbeatAt),
    completedAt: toIso(attempt.completedAt) ?? null,
    createdAt: toIso(attempt.createdAt),
    updatedAt: toIso(attempt.updatedAt)
  };
}

function publicJobEvent(event) {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    jobId: event.jobId,
    eventType: event.eventType,
    payload: event.payload,
    createdAt: toIso(event.createdAt)
  };
}

function publicOutboxEvent(event) {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    status: event.status,
    createdAt: toIso(event.createdAt)
  };
}

function publicWorkspace(workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    createdAt: toIso(workspace.createdAt),
    updatedAt: toIso(workspace.updatedAt)
  };
}

function publicMembership(membership) {
  return {
    id: membership.id,
    workspaceId: membership.workspaceId,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    createdAt: toIso(membership.createdAt),
    updatedAt: toIso(membership.updatedAt)
  };
}

function publicAudit(audit) {
  return {
    id: audit.id,
    workspaceId: audit.workspaceId,
    actorUserId: audit.actorUserId,
    eventType: audit.eventType,
    targetType: audit.targetType,
    targetId: audit.targetId,
    reason: audit.reason,
    occurredAt: toIso(audit.occurredAt)
  };
}

async function setActorContext(tx, userId, workspaceId = "") {
  await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.current_workspace_id', ${workspaceId}, true)`;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
}


function slugify(value) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "workspace";
}

function hashRequest(input) {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function problem(code, status, title, detail) {
  return {
    type: `https://errors.sakhaa-forge.invalid/v0/${code}`,
    title,
    status,
    code,
    detail,
    trace_id: "v0-local-trace",
    retryable: code === "IDEMPOTENCY_KEY_REQUIRED" || code === "DEPENDENCY_UNAVAILABLE"
  };
}
