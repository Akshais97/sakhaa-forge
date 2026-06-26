import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "../../../packages/db/generated/client/index.js";
import { canPerform } from "./permissions.mjs";
import { buildBrandExtractionCandidates } from "./brand-extraction.mjs";
import { candidateSourceHash, searchXpozCandidates } from "./viral-discovery.mjs";
import {
  HEYGEN_PROVIDER,
  HEYGEN_OPERATION_TYPE,
  heygenConcurrencyLimit,
  submitHeygenVideo,
  reconcileHeygenOperation,
  fetchHeygenMedia,
  resolveHeygenMediaMode
} from "./heygen-provider.mjs";
import {
  generateScriptVariants,
  evaluateScriptVariant,
  requestedVariantBucket,
  validVariantCountBucket,
  durationBucket,
  tokenBucket,
  costBucket,
  objectiveCategory,
  variantRankBucket,
  SCRIPT_PROMPT_VERSION,
  SCRIPT_MODEL_VERSION,
  supportedScriptSimulatorModes
} from "./script-generation.mjs";

// A Prisma unique-constraint violation (P2002) or transaction write conflict
// (P2034) from a concurrent mutation must be normalized into a stable domain
// outcome or replay, never surfaced as a raw 500. Both carry a string `code`.
function isPrismaConflictError(error) {
  return (
    error != null &&
    typeof error.code === "string" &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export function createStore(env = process.env) {
  if (env.V0_RUNTIME_DB === "prisma") {
    return createPrismaWorkspaceStore(env);
  }
  return createWorkspaceStore(env);
}

export function createWorkspaceStore(env = process.env) {
  const users = new Map();
  const workspaces = new Map();
  const memberships = new Map();
  const audits = [];
  const idempotencyRecords = new Map();
  const artifacts = new Map();
  const brandCrawlRuns = new Map();
  const brandAssets = new Map();
  const brandCandidates = new Map();
  const brandProfiles = new Map();
  const brandApprovals = new Map();
  const brandRules = new Map();
  const generationEstimates = new Map();
  const blueprintLibraryEntries = new Map();
  const blueprintRequests = new Map();
  const formulaDerivations = new Map();
  const directorPrompts = new Map();
  const scriptTournaments = new Map();
  const scriptVariants = new Map();
  const scriptEvaluations = new Map();
  const selectedScripts = new Map();
  const avatarProfiles = new Map();
  const avatarConsents = new Map();
  const avatarCatalogsMaterialized = new Set();
  const creditWallets = new Map();
  const creditPurchases = new Map();
  const creditLedgerEntries = new Map();
  // V0-G3 versioned generation estimate and atomic reservation.
  const generationJobs = new Map();
  const creditReservations = new Map();
  const providerPriceVersions = new Map();
  // V0-G4 exactly-once provider operations. One operation per generation job.
  const providerOperations = new Map();
  // V0-G5 retained generated media and settled credits.
  const generatedSegments = new Map();
  const generatedAssets = new Map();
  const creativeLineages = new Map();
  // Global provider price reference, seeded with the deterministic simulator
  // rate (v0.local.1). Mirrors the migration-seeded provider_price_versions row.
  providerPriceVersions.set("heygen-simulator:v0.local.1", {
    id: randomUUID(),
    provider: "heygen-simulator",
    priceVersion: "v0.local.1",
    currency: "INR",
    rateMinorPerSecond: 1600,
    source: "deterministic_simulator",
    validFrom: "2000-01-01T00:00:00.000Z",
    validUntil: "2100-01-01T00:00:00.000Z",
    createdAt: "2000-01-01T00:00:00.000Z",
    updatedAt: "2000-01-01T00:00:00.000Z"
  });
  const inboxEvents = new Map();
  const viralCandidates = new Map();
  const metricSnapshots = new Map();
  const mediaAcquisitions = new Map();
  const thumbnailBlueprints = new Map();
  const videoBlueprints = new Map();
  const blueprintScenes = new Map();
  const jobDependencies = new Map();
  const workspaceCapabilities = new Map();
  const serviceCredentials = new Map();
  const simulatorModes = new Map();
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

  async function createBrandCrawlRun(actor, input) {
    const workspaceAccess = getWorkspaceForActor(actor, input.workspaceId);
    if (!workspaceAccess) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = await validateBrandCrawlRunInput(input, (artifactId) => artifacts.get(artifactId));
    if (validation.problem) {
      return { ok: false, problem: validation.problem };
    }

    const now = new Date().toISOString();
    const requestId = randomUUID();
    const traceId = randomUUID();
    const crawlRun = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      sourceUrl: input.websiteUrl.trim(),
      normalizedUrl: validation.normalizedUrl,
      status: "QUEUED",
      rightsAcknowledged: true,
      crawlScope: validation.crawlScope,
      robotsPolicy: { status: "pending" },
      createdAt: now,
      updatedAt: now
    };
    const retainedAssets = validation.assets.map((assetInput) => ({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      crawlRunId: crawlRun.id,
      artifactId: assetInput.artifactId,
      rightsBasis: assetInput.rightsBasis.trim(),
      permittedUse: assetInput.permittedUse.trim(),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now
    }));
    const job = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      type: "brand_crawl",
      resourceClass: "CPU",
      status: "QUEUED",
      priority: 0,
      inputHash: hashRequest({
        normalizedUrl: crawlRun.normalizedUrl,
        crawlScope: crawlRun.crawlScope,
        brandAssetIds: retainedAssets.map((asset) => asset.id)
      }),
      input: {
        requestId,
        traceId,
        brandCrawlRunId: crawlRun.id,
        normalizedUrl: crawlRun.normalizedUrl,
        crawlScope: crawlRun.crawlScope,
        brandAssetIds: retainedAssets.map((asset) => asset.id)
      },
      maxAttempts: 5,
      createdAt: now,
      updatedAt: now
    };
    crawlRun.jobId = job.id;
    const outbox = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      eventType: "job.wakeup_requested",
      aggregateType: "Job",
      aggregateId: job.id,
      payload: { jobId: job.id, requestId, traceId },
      status: "PENDING",
      createdAt: now
    };
    brandCrawlRuns.set(crawlRun.id, crawlRun);
    for (const asset of retainedAssets) {
      brandAssets.set(asset.id, asset);
    }
    jobs.set(job.id, job);
    outboxEvents.set(outbox.id, outbox);
    appendJobEvent(jobEvents, job, "job.created", { brandCrawlRunId: crawlRun.id, requestId, traceId });
    appendJobEvent(jobEvents, job, "job.queued", { outboxEventId: outbox.id, requestId, traceId });
    return {
      ok: true,
      response: {
        crawlRun: publicBrandCrawlRun(crawlRun),
        brandAssets: retainedAssets.map(publicBrandAsset),
        job: publicJob(job),
        outboxEvent: publicOutboxEvent(outbox)
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
    if (!isWorkspaceCapabilityEnabled(input.workspaceId, "media_processing")) {
      return {
        ok: false,
        problem: problem("CAPABILITY_DISABLED", 404, "Capability disabled", "We could not find that page.")
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
    const requestId = randomUUID();
    const traceId = randomUUID();
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
        requestId,
        traceId,
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
      payload: { jobId: job.id, requestId, traceId },
      status: "PENDING",
      createdAt: now
    };
    jobs.set(job.id, job);
    outboxEvents.set(outbox.id, outbox);
    appendJobEvent(jobEvents, job, "job.created", { inputArtifactId: input.inputArtifactId, requestId, traceId });
    appendJobEvent(jobEvents, job, "job.queued", { outboxEventId: outbox.id, requestId, traceId });
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

  function listBrandCandidates(actor, crawlRunId) {
    const crawlRun = brandCrawlRuns.get(crawlRunId);
    if (!crawlRun || !getWorkspaceForActor(actor, crawlRun.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return {
      ok: true,
      response: {
        crawlRun: publicBrandCrawlRun(crawlRun),
        candidates: [...brandCandidates.values()]
          .filter((candidate) => candidate.crawlRunId === crawlRunId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map(publicBrandCandidate)
      }
    };
  }

  function approveBrandProfile(actor, brandId, input) {
    const crawlRun = brandCrawlRuns.get(input.crawlRunId);
    if (!crawlRun || crawlRun.workspaceId !== input.workspaceId || !getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateBrandApprovalInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const existingProfiles = [...brandProfiles.values()].filter(
      (profile) => profile.workspaceId === input.workspaceId && profile.brandId === brandId
    );
    const currentVersion = existingProfiles.reduce((highest, profile) => Math.max(highest, profile.version), 0);
    if (input.optimisticVersion !== currentVersion) {
      return {
        ok: false,
        problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
      };
    }

    const now = new Date().toISOString();
    for (const profile of existingProfiles) {
      if (profile.active && profile.status === "approved") {
        profile.active = false;
        profile.status = "superseded";
        profile.updatedAt = now;
      }
    }
    const profile = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      brandId,
      crawlRunId: input.crawlRunId,
      schemaVersion: "v0.brand-profile.1",
      version: currentVersion + 1,
      status: "approved",
      active: true,
      profile: normalizeBrandProfile(input.profile, actor.userId, now),
      sourceSummary: {
        candidateCount: [...brandCandidates.values()].filter((candidate) => candidate.crawlRunId === input.crawlRunId).length,
        crawlRunId: input.crawlRunId
      },
      approvedByUserId: actor.userId,
      approvedAt: now,
      createdAt: now,
      updatedAt: now
    };
    const approval = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      brandProfileId: profile.id,
      brandId,
      actorUserId: actor.userId,
      decision: "approve",
      reason: input.reason ?? null,
      createdAt: now
    };
    const retainedRules = input.rules.map((rule) => ({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      brandProfileId: profile.id,
      brandId,
      type: rule.type,
      value: rule.value.trim(),
      severity: rule.severity,
      rationale: rule.rationale.trim(),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now
    }));
    const audit = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "brand.profile.approved",
      targetType: "BrandProfile",
      targetId: profile.id,
      reason: input.reason ?? null,
      occurredAt: now
    };
    brandProfiles.set(profile.id, profile);
    brandApprovals.set(approval.id, approval);
    for (const rule of retainedRules) {
      brandRules.set(rule.id, rule);
    }
    audits.push(audit);
    return {
      ok: true,
      response: {
        profile: publicBrandProfile(profile),
        approval: publicBrandApproval(approval),
        rules: retainedRules.map(publicBrandRule),
        audit: publicAudit(audit)
      }
    };
  }

  function createGenerationEstimate(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const profile = brandProfiles.get(input.brandProfileId);
    if (!profile || profile.workspaceId !== input.workspaceId || profile.status !== "approved" || profile.active !== true) {
      return {
        ok: false,
        problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
      };
    }
    const now = new Date().toISOString();
    // V0-G1: when an avatar is supplied, enforce consent-safe eligibility at the
    // backend boundary that consumes avatar selection. The catalogue is
    // materialized for the active approved brand profile so the supplied
    // avatarProfileId resolves to a real, workspace+brand-bound profile; the UI
    // disabled state is never trusted. A missing or cross-workspace avatar is
    // hidden behind the same existence-hiding 404 as every cross-workspace read.
    let avatarAudit = null;
    if (input.avatarProfileId) {
      ensureAvatarCatalog(input.workspaceId, profile.id);
      const avatar = avatarProfiles.get(input.avatarProfileId);
      if (!avatar || avatar.workspaceId !== input.workspaceId || avatar.brandProfileId !== profile.id) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      const eligibility = deriveAvatarEligibility(avatar, avatarConsents.get(avatar.id) ?? null, Date.now());
      if (!eligibility.eligible) {
        return { ok: false, problem: avatarConsentProblem(eligibility.reason) };
      }
      // Durable avatar-selection lineage: an eligible avatar that enters a
      // generation estimate writes an avatar.selected audit row. Ineligible
      // attempts are rejected above and write no audit.
      avatarAudit = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        actorUserId: actor.userId,
        eventType: "avatar.selected",
        targetType: "AvatarProfile",
        targetId: avatar.id,
        reason: null,
        occurredAt: now
      };
      audits.push(avatarAudit);
    }
    // V0-G3: bind an active provider price version for the route/currency. The
    // estimate records the price version, an input hash over the exact
    // script/avatar/duration the user saw, an expiry and an optimistic version
    // so confirmation can reject stale, changed or replayed inputs cleanly. The
    // 30s pilot cap and 48,000 minor-unit authorized maximum are the
    // deterministic simulator policy; the price version row is the reference.
    const priceVersion = activePriceVersion("heygen-simulator", "INR", Date.now());
    if (!priceVersion) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "No active provider price version is available for this route.")
      };
    }
    const durationSeconds = normalizeDurationSeconds(input.durationSeconds);
    const estimate = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      brandProfileId: profile.id,
      status: "awaiting_confirmation",
      provider: "heygen-simulator",
      priceVersion: priceVersion.priceVersion,
      maximumAuthorizedMinor: 48000,
      currency: "INR",
      selectedScriptId: input.selectedScriptId,
      avatarProfileId: input.avatarProfileId,
      inputHash: computeGenerationInputHash(input),
      expiresAt: new Date(Date.now() + estimateTtlMs(env)).toISOString(),
      version: 1,
      confirmedAt: null,
      durationSeconds,
      createdAt: now,
      updatedAt: now
    };
    generationEstimates.set(estimate.id, estimate);
    return {
      ok: true,
      response: {
        estimate: publicGenerationEstimate(estimate),
        ...(avatarAudit ? { audit: publicAudit(avatarAudit) } : {})
      }
    };
  }

  // V0-G3: confirm a versioned estimate and atomically reserve credits for one
  // generation. The estimate must still be awaiting confirmation, the
  // optimistic version and input hash must match, the estimate must not have
  // expired, and the workspace wallet must hold at least the authorized maximum
  // in integer minor units. Confirmation creates exactly one GenerationJob, one
  // active CreditReservation and one RESERVE ledger entry that debits the
  // wallet, all before any provider network I/O. Reservation does not imply
  // provider submission. Double-click, replay and concurrent confirmation of
  // the same estimate fall to CREDIT_RESERVATION_CONFLICT after the first
  // confirmation transitions the estimate to credits_reserved.
  function confirmGenerationEstimate(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const estimate = generationEstimates.get(input.estimateId);
    if (!estimate || estimate.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (estimate.status !== "awaiting_confirmation") {
      return {
        ok: false,
        problem: problem("CREDIT_RESERVATION_CONFLICT", 409, "Credit reservation conflict", "Credits are already reserved for this generation.")
      };
    }
    if (Number(input.version) !== estimate.version) {
      return {
        ok: false,
        problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
      };
    }
    const confirmHash = computeGenerationInputHash(input);
    if (confirmHash !== estimate.inputHash) {
      return {
        ok: false,
        problem: problem("ESTIMATE_INPUT_CHANGED", 409, "Estimate input changed", "The script, avatar or settings changed. Request a new estimate.", true)
      };
    }
    if (Date.now() > Date.parse(estimate.expiresAt)) {
      return {
        ok: false,
        problem: problem("ESTIMATE_EXPIRED", 409, "Estimate expired", "This estimate expired. Request a new estimate.", true)
      };
    }
    const wallet = ensureCreditWallet(input.workspaceId, estimate.currency, new Date().toISOString());
    if (wallet.balanceMinor < estimate.maximumAuthorizedMinor) {
      return {
        ok: false,
        problem: problem("CREDIT_BALANCE_INSUFFICIENT", 409, "Credit balance insufficient", "Add creator credits before generating this video.")
      };
    }
    const now = new Date().toISOString();
    const job = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      estimateId: estimate.id,
      brandProfileId: estimate.brandProfileId,
      selectedScriptId: estimate.selectedScriptId,
      avatarProfileId: estimate.avatarProfileId,
      status: "queued",
      idempotencyKey: input.idempotencyKey,
      inputHash: estimate.inputHash,
      version: estimate.version,
      durationSeconds: estimate.durationSeconds,
      maximumAuthorizedMinor: estimate.maximumAuthorizedMinor,
      currency: estimate.currency,
      priceVersion: estimate.priceVersion,
      createdAt: now,
      updatedAt: now
    };
    generationJobs.set(job.id, job);
    const reservation = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      generationJobId: job.id,
      walletId: wallet.id,
      status: "active",
      amountMinor: estimate.maximumAuthorizedMinor,
      currency: estimate.currency,
      idempotencyKey: input.idempotencyKey,
      expiresAt: estimate.expiresAt,
      createdAt: now,
      updatedAt: now
    };
    creditReservations.set(reservation.id, reservation);
    // The RESERVE ledger entry is the negative debit that proves the hold; the
    // reservation row is the active hold itself. Both carry the generation job
    // id so G5 settlement can capture or release against the same job.
    const reserveEntry = writeLedgerEntry(
      { workspaceId: input.workspaceId, walletId: wallet.id, currency: wallet.currency },
      "RESERVE",
      -estimate.maximumAuthorizedMinor,
      input.idempotencyKey,
      "generation reservation",
      now
    );
    reserveEntry.generationJobId = job.id;
    estimate.status = "credits_reserved";
    estimate.confirmedAt = now;
    estimate.updatedAt = now;
    generationEstimates.set(estimate.id, estimate);
    audits.push({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "generation.confirmed",
      targetType: "GenerationJob",
      targetId: job.id,
      reason: null,
      occurredAt: now
    });
    return {
      ok: true,
      response: {
        estimate: publicGenerationEstimate(estimate),
        job: publicGenerationJob(job),
        reservation: publicCreditReservation(reservation),
        ledgerEntry: publicCreditLedgerEntry(reserveEntry),
        wallet: publicCreditWallet(creditWallets.get(wallet.id))
      }
    };
  }

  function getGenerationJob(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const job = generationJobs.get(input.jobId);
    if (!job || job.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const reservation = [...creditReservations.values()].find(
      (candidate) => candidate.generationJobId === job.id && candidate.status === "active"
    );
    return {
      ok: true,
      response: {
        job: publicGenerationJob(job),
        ...(reservation ? { reservation: publicCreditReservation(reservation) } : {})
      }
    };
  }

  function activePriceVersion(provider, currency, nowMs) {
    return (
      [...providerPriceVersions.values()].find(
        (version) =>
          version.provider === provider &&
          version.currency === currency &&
          Date.parse(version.validFrom) <= nowMs &&
          nowMs <= Date.parse(version.validUntil)
      ) ?? null
    );
  }

  // V0-G4: the active provider operation statuses that count against the
  // pay-as-you-go concurrency limit. A terminal operation frees its slot.
  function countActiveProviderOperations(workspaceId) {
    const active = new Set(["submitting", "accepted", "unknown", "processing"]);
    return [...providerOperations.values()].filter(
      (op) => op.workspaceId === workspaceId && active.has(op.status)
    ).length;
  }

  function findOperationByJob(jobId) {
    return [...providerOperations.values()].find((op) => op.generationJobId === jobId) ?? null;
  }

  function findOperationByIdempotencyKey(workspaceId, idempotencyKey) {
    return (
      [...providerOperations.values()].find(
        (op) => op.workspaceId === workspaceId && op.idempotencyKey === idempotencyKey
      ) ?? null
    );
  }

  // V0-G4: submit a queued generation job to the HeyGen simulator exactly once.
  // A durable ProviderOperation is persisted in CREATED -> SUBMITTING BEFORE the
  // provider network I/O, so a crash between persistence and the network response
  // leaves a resumable operation, never a blind duplicate. The operation binds the
  // workspace, generation job, provider route, idempotency key and request hash,
  // and stores the provider external id, bound price version and estimated maximum
  // cost. A timeout after possible acceptance marks the operation unknown; the
  // caller must reconcile before any retry. Provider payloads stay adapter-private.
  // Credit capture/release is V0-G5.
  function submitGenerationJob(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const job = generationJobs.get(input.jobId);
    if (!job || job.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    // Exactly-once by idempotency key: a replay returns the existing operation and
    // never calls the provider again. A second key for the same job is a conflict.
    const existingByKey = findOperationByIdempotencyKey(input.workspaceId, input.idempotencyKey);
    if (existingByKey) {
      return {
        ok: true,
        response: {
          job: publicGenerationJob(job),
          operation: publicProviderOperation(existingByKey),
          replay: true
        }
      };
    }
    const existingForJob = findOperationByJob(job.id);
    if (existingForJob) {
      return {
        ok: false,
        problem: problem(
          "IDEMPOTENCY_INPUT_CONFLICT",
          409,
          "Idempotency input conflict",
          "This generation was already submitted with a different request identity."
        )
      };
    }
    if (job.status !== "queued") {
      return {
        ok: false,
        problem: problem(
          "GENERATION_JOB_NOT_SUBMITTABLE",
          409,
          "Generation job not submittable",
          "This generation cannot be submitted in its current state."
        )
      };
    }
    if (countActiveProviderOperations(input.workspaceId) >= heygenConcurrencyLimit(env)) {
      return {
        ok: false,
        problem: problem(
          "PROVIDER_RATE_LIMITED",
          429,
          "Provider rate limited",
          "The provider is busy. This job will retry at the shown time.",
          true
        )
      };
    }
    const requestHash = computeProviderRequestHash(job);
    const now = new Date().toISOString();
    // Persist the operation BEFORE network I/O. CREATED is the durable pre-network
    // row; SUBMITTING spans the network call. A crash here leaves SUBMITTING.
    const operation = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      generationJobId: job.id,
      provider: HEYGEN_PROVIDER,
      operationType: HEYGEN_OPERATION_TYPE,
      status: "submitting",
      idempotencyKey: input.idempotencyKey,
      requestHash,
      externalId: null,
      priceVersion: job.priceVersion,
      estimatedMaximumMinor: job.maximumAuthorizedMinor,
      currency: job.currency,
      retryAfterMs: null,
      lastErrorCode: null,
      submittedAt: now,
      acceptedAt: null,
      completedAt: null,
      reconciledAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now
    };
    providerOperations.set(operation.id, operation);
    job.status = "submitting";
    job.updatedAt = now;
    generationJobs.set(job.id, job);
    const providerResult = submitHeygenVideo(env, {
      operationId: operation.id,
      requestHash,
      mode: input.mode
    });
    if (!providerResult.ok) {
      if (providerResult.kind === "timeout") {
        // Timeout after possible acceptance: unknown, never success or failure. The
        // caller reconciles before any retry; blind resubmission is prohibited.
        operation.status = "unknown";
        operation.updatedAt = new Date().toISOString();
        providerOperations.set(operation.id, operation);
        job.status = "unknown";
        job.updatedAt = operation.updatedAt;
        generationJobs.set(job.id, job);
        return {
          ok: true,
          response: {
            job: publicGenerationJob(job),
            operation: publicProviderOperation(operation),
            unknown: true
          }
        };
      }
      // malformed / unavailable: the provider output failed validation.
      operation.status = "failed";
      operation.lastErrorCode = providerResult.errorCode || "PROVIDER_OUTPUT_INVALID";
      operation.updatedAt = new Date().toISOString();
      providerOperations.set(operation.id, operation);
      job.status = "failed";
      job.updatedAt = operation.updatedAt;
      generationJobs.set(job.id, job);
      return {
        ok: false,
        problem: problem(
          operation.lastErrorCode,
          422,
          "Provider output invalid",
          "The generated media failed validation and was not accepted."
        )
      };
    }
    // success / duplicate: the provider accepted and assigned an external id.
    operation.status = "accepted";
    operation.externalId = providerResult.externalId;
    operation.acceptedAt = new Date().toISOString();
    operation.updatedAt = operation.acceptedAt;
    providerOperations.set(operation.id, operation);
    job.status = "accepted";
    job.updatedAt = operation.acceptedAt;
    generationJobs.set(job.id, job);
    audits.push({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "generation.state_changed",
      targetType: "GenerationJob",
      targetId: job.id,
      reason: "accepted",
      occurredAt: operation.acceptedAt
    });
    const response = {
      job: publicGenerationJob(job),
      operation: publicProviderOperation(operation)
    };
    // Simulator-only: surface the signed callback envelope so the deterministic
    // test can post the webhook back, exactly as the Razorpay simulator does. The
    // signing secret never leaves the simulator and the envelope carries no media
    // URL (media retention is V0-G5).
    if (env.HEYGEN_MODE !== "api") {
      const envelope = {
        workspaceId: input.workspaceId,
        jobId: job.id,
        operationId: operation.id,
        externalId: operation.externalId,
        eventType: "generation.completed",
        eventId: `evt_${operation.id}`,
        timestamp: Date.now()
      };
      response.callback = {
        envelope,
        signature: signHeygenEnvelope(envelope, heygenSimulatorSecret(env))
      };
    }
    return { ok: true, response };
  }

  // V0-G4: reconcile an uncertain provider operation by querying the provider for
  // the authoritative outcome. Reconciliation never resubmits; it only resolves
  // unknown/submitting to a terminal state and records reconciledAt. A replay is a
  // no-op once the operation is terminal.
  function reconcileGenerationJob(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const job = generationJobs.get(input.jobId);
    if (!job || job.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const operation = findOperationByJob(job.id);
    if (!operation) {
      return {
        ok: false,
        problem: problem(
          "GENERATION_JOB_NOT_SUBMITTABLE",
          409,
          "Generation job not submittable",
          "This generation has no provider operation to reconcile."
        )
      };
    }
    const terminal = new Set(["completed", "failed", "rejected", "cancelled"]);
    if (terminal.has(operation.status)) {
      return {
        ok: true,
        response: {
          job: publicGenerationJob(job),
          operation: publicProviderOperation(operation),
          replay: true
        }
      };
    }
    const outcome = reconcileHeygenOperation(env, {
      operationId: operation.id,
      requestHash: operation.requestHash,
      externalId: operation.externalId,
      reconcileOutcome: input.reconcileOutcome
    });
    const now = new Date().toISOString();
    if (outcome.status === "pending") {
      return {
        ok: true,
        response: {
          job: publicGenerationJob(job),
          operation: publicProviderOperation(operation),
          pending: true
        }
      };
    }
    applyProviderOutcome(operation, job, outcome, now, true);
    providerOperations.set(operation.id, operation);
    generationJobs.set(job.id, job);
    return {
      ok: true,
      response: {
        job: publicGenerationJob(job),
        operation: publicProviderOperation(operation)
      }
    };
  }

  // V0-G4: cancel a generation. Cancellation stops new children; uncertain provider
  // operations reconcile first. If reconciliation still cannot resolve, the job is
  // cancel_requested and the caller is told we are checking (GENERATION_CANCEL_UNCERTAIN).
  // A generation that already completed cannot be cancelled. Credit release is V0-G5.
  function cancelGenerationJob(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const job = generationJobs.get(input.jobId);
    if (!job || job.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (job.status === "cancelled") {
      return {
        ok: true,
        response: { job: publicGenerationJob(job), replay: true }
      };
    }
    if (job.status === "generated" || job.status === "failed") {
      return {
        ok: false,
        problem: problem(
          "GENERATION_JOB_NOT_SUBMITTABLE",
          409,
          "Generation job not submittable",
          "This generation cannot be cancelled in its current state."
        )
      };
    }
    const operation = findOperationByJob(job.id);
    const now = new Date().toISOString();
    if (!operation) {
      // Queued, never submitted: cancel directly. Reservation release is V0-G5.
      job.status = "cancelled";
      job.updatedAt = now;
      generationJobs.set(job.id, job);
      return { ok: true, response: { job: publicGenerationJob(job) } };
    }
    const uncertain = new Set(["submitting", "accepted", "unknown", "processing"]);
    if (uncertain.has(operation.status)) {
      const outcome = reconcileHeygenOperation(env, {
        operationId: operation.id,
        requestHash: operation.requestHash,
        externalId: operation.externalId,
        reconcileOutcome: input.reconcileOutcome
      });
      if (outcome.status === "pending") {
        job.status = "cancel_requested";
        job.updatedAt = now;
        generationJobs.set(job.id, job);
        return {
          ok: true,
          response: {
            job: publicGenerationJob(job),
            operation: publicProviderOperation(operation),
            uncertain: true
          }
        };
      }
      if (outcome.status === "completed") {
        // The provider completed the generation; cancellation can no longer undo it.
        applyProviderOutcome(operation, job, outcome, now, false);
        providerOperations.set(operation.id, operation);
        generationJobs.set(job.id, job);
        return {
          ok: false,
          problem: problem(
            "GENERATION_JOB_NOT_SUBMITTABLE",
            409,
            "Generation job not submittable",
            "This generation cannot be cancelled in its current state."
          )
        };
      }
      // accepted/processing/failed -> the operation is no longer active; cancel it.
      operation.status = "cancelled";
      operation.cancelledAt = now;
      operation.updatedAt = now;
      providerOperations.set(operation.id, operation);
      job.status = "cancelled";
      job.updatedAt = now;
      generationJobs.set(job.id, job);
      return { ok: true, response: { job: publicGenerationJob(job), operation: publicProviderOperation(operation) } };
    }
    // Operation already terminal-failed: cancel the job.
    operation.status = "cancelled";
    operation.cancelledAt = now;
    operation.updatedAt = now;
    providerOperations.set(operation.id, operation);
    job.status = "cancelled";
    job.updatedAt = now;
    generationJobs.set(job.id, job);
    return { ok: true, response: { job: publicGenerationJob(job), operation: publicProviderOperation(operation) } };
  }

  // Apply a reconciled provider outcome to an operation and its job. When
  // `reconciled` is true the operation records reconciledAt (it came from unknown).
  function applyProviderOutcome(operation, job, outcome, now, reconciled) {
    if (outcome.externalId && !operation.externalId) {
      operation.externalId = outcome.externalId;
    }
    if (outcome.status === "accepted") {
      operation.status = "accepted";
      operation.acceptedAt = operation.acceptedAt || now;
      job.status = "accepted";
    } else if (outcome.status === "processing") {
      operation.status = "processing";
      job.status = "generating";
    } else if (outcome.status === "completed") {
      operation.status = "completed";
      operation.completedAt = now;
      job.status = "generated";
    } else if (outcome.status === "failed") {
      operation.status = "failed";
      operation.lastErrorCode = operation.lastErrorCode || "PROVIDER_OUTPUT_INVALID";
      job.status = "failed";
    }
    if (reconciled) {
      operation.reconciledAt = now;
    }
    operation.updatedAt = now;
    job.updatedAt = now;
  }

  // V0-G4: process a signed HeyGen callback. The signature is verified in constant
  // time, the timestamp must be within the callback window, and the event is
  // deduplicated by (workspace, source, eventId) so a replay never transitions a
  // second time. Malformed callbacks are rejected. Provider payloads stay private.
  function processHeygenCallback(envelope, signature) {
    if (!verifyHeygenSignature(envelope, signature, heygenSimulatorSecret(env))) {
      return {
        ok: false,
        problem: problem(
          "PROVIDER_CALLBACK_INVALID",
          401,
          "Provider callback invalid",
          "The provider update could not be verified."
        )
      };
    }
    if (
      !envelope ||
      typeof envelope.workspaceId !== "string" ||
      typeof envelope.jobId !== "string" ||
      typeof envelope.operationId !== "string" ||
      typeof envelope.eventType !== "string" ||
      typeof envelope.eventId !== "string" ||
      typeof envelope.timestamp !== "number"
    ) {
      return {
        ok: false,
        problem: problem(
          "PROVIDER_OUTPUT_INVALID",
          422,
          "Provider output invalid",
          "The provider update was malformed and was not accepted."
        )
      };
    }
    const inboxKey = `${envelope.workspaceId}:heygen:${envelope.eventId}`;
    const duplicate = inboxEvents.get(inboxKey);
    if (duplicate) {
      return { ok: true, response: { ...duplicate.response, duplicate: true } };
    }
    if (Math.abs(Date.now() - envelope.timestamp) > HEYGEN_CALLBACK_WINDOW_MS) {
      return {
        ok: false,
        problem: problem(
          "PROVIDER_CALLBACK_INVALID",
          401,
          "Provider callback invalid",
          "The provider update could not be verified."
        )
      };
    }
    const operation = [...providerOperations.values()].find(
      (candidate) =>
        candidate.workspaceId === envelope.workspaceId && candidate.id === envelope.operationId
    );
    if (!operation) {
      // A signed callback that cannot be reconciled to an operation in this
      // workspace does not leak whether the operation exists elsewhere.
      return {
        ok: false,
        problem: problem(
          "PROVIDER_CALLBACK_INVALID",
          401,
          "Provider callback invalid",
          "The provider update could not be verified."
        )
      };
    }
    const job = generationJobs.get(operation.generationJobId);
    if (!job || job.workspaceId !== envelope.workspaceId) {
      return {
        ok: false,
        problem: problem(
          "PROVIDER_CALLBACK_INVALID",
          401,
          "Provider callback invalid",
          "The provider update could not be verified."
        )
      };
    }
    const validEvents = new Set([
      "generation.accepted",
      "generation.processing",
      "generation.completed",
      "generation.failed"
    ]);
    if (!validEvents.has(envelope.eventType)) {
      return {
        ok: false,
        problem: problem(
          "PROVIDER_OUTPUT_INVALID",
          422,
          "Provider output invalid",
          "The provider update was malformed and was not accepted."
        )
      };
    }
    const now = new Date().toISOString();
    const outcomeMap = {
      "generation.accepted": "accepted",
      "generation.processing": "processing",
      "generation.completed": "completed",
      "generation.failed": "failed"
    };
    // Idempotent transition: a repeat terminal event is a no-op, never a second
    // transition or a second ledger entry (settlement is V0-G5).
    const terminalOp = new Set(["completed", "failed", "rejected", "cancelled"]);
    if (terminalOp.has(operation.status)) {
      const response = { job: publicGenerationJob(job), operation: publicProviderOperation(operation) };
      inboxEvents.set(inboxKey, { response });
      return { ok: true, response: { ...response, duplicate: false } };
    }
    applyProviderOutcome(operation, job, { status: outcomeMap[envelope.eventType], externalId: envelope.externalId }, now, false);
    providerOperations.set(operation.id, operation);
    generationJobs.set(job.id, job);
    const response = { job: publicGenerationJob(job), operation: publicProviderOperation(operation) };
    inboxEvents.set(inboxKey, { response });
    return { ok: true, response: { ...response, duplicate: false } };
  }

  // V0-G5: settle a terminal provider operation. Completed media is copied into
  // private V0 storage through the adapter only, quarantined, validated and hashed,
  // then bound to a GeneratedSegment, a versioned GeneratedAsset and a CreativeLineage
  // row. The reconciled provider total is compared with the authorized maximum; credits
  // are captured once on success (the unused remainder is returned) or released once on
  // failure (the full reservation is returned). Settlement is idempotent and append-only:
  // the CAPTURE/RELEASE ledger entry carries a job-derived idempotency key so a crash
  // between media retention and ledger settlement is recovered without orphaned capture
  // or duplicate release. The transient provider URL is never retained as production
  // source; media is not clean until artifact validation passes. Settlement does not
  // change the generation job status (it stays generated/failed); it settles the
  // reservation and the ledger.
  function settleGenerationJob(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const job = generationJobs.get(input.jobId);
    if (!job || job.workspaceId !== input.workspaceId) {
      // A cross-workspace caller must not learn whether the job exists elsewhere.
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const operation = findOperationByJob(job.id);
    if (!operation) {
      return {
        ok: false,
        problem: problem(
          "GENERATION_JOB_NOT_SUBMITTABLE",
          409,
          "Generation job not submittable",
          "This generation has no provider operation to settle."
        )
      };
    }
    const terminal = new Set(["completed", "failed", "rejected", "cancelled"]);
    if (!terminal.has(operation.status)) {
      return {
        ok: false,
        problem: problem(
          "GENERATION_JOB_NOT_SUBMITTABLE",
          409,
          "Generation job not submittable",
          "This generation cannot be settled in its current state."
        )
      };
    }
    const reservation = [...creditReservations.values()].find(
      (candidate) => candidate.generationJobId === job.id
    );
    if (!reservation) {
      return {
        ok: false,
        problem: problem(
          "GENERATION_JOB_NOT_SUBMITTABLE",
          409,
          "Generation job not submittable",
          "This generation has no credit reservation to settle."
        )
      };
    }
    const wallet = creditWallets.get(reservation.walletId);

    // Idempotent replay: once the reservation is captured or released the settlement
    // is final. A replay (even with a new idempotency key) returns the original
    // settlement and never writes a second ledger entry. Detection is by reservation
    // state, not by the caller's idempotency key, so a crash-recovered second call and
    // an explicit replay both converge without double capture.
    if (reservation.status === "captured" || reservation.status === "released") {
      return {
        ok: true,
        response: buildSettlementReplay(operation, job, reservation, wallet)
      };
    }

    const failureOutcomes = new Set(["failed", "rejected", "cancelled"]);
    if (failureOutcomes.has(operation.status)) {
      return settleRelease(actor, operation, job, reservation, wallet);
    }
    return settleCapture(actor, operation, job, reservation, wallet);
  }

  // Release the full reservation once when the provider operation failed. The wallet is
  // restored by the +max RELEASE ledger entry; the reservation becomes released. No media
  // is retained for a failed operation. The RELEASE entry idempotency key is job-derived
  // so a crash between reservation release and the ledger write is recovered once.
  function settleRelease(actor, operation, job, reservation, wallet) {
    const now = new Date().toISOString();
    const releaseKey = `g5-release-${job.id}`;
    const existing = [...creditLedgerEntries.values()].find(
      (entry) => entry.walletId === wallet.id && entry.idempotencyKey === releaseKey
    );
    let entry = existing;
    if (!entry) {
      entry = writeLedgerEntry(
        { workspaceId: job.workspaceId, walletId: wallet.id, currency: wallet.currency },
        "RELEASE",
        Number(reservation.amountMinor),
        releaseKey,
        "generation release",
        now
      );
      entry.generationJobId = job.id;
      creditLedgerEntries.set(entry.id, entry);
    }
    reservation.status = "released";
    reservation.updatedAt = now;
    creditReservations.set(reservation.id, reservation);
    operation.settledAt = now;
    operation.updatedAt = now;
    providerOperations.set(operation.id, operation);
    audits.push({
      id: randomUUID(),
      workspaceId: job.workspaceId,
      actorUserId: actor.userId,
      eventType: "generation.settled",
      targetType: "GenerationJob",
      targetId: job.id,
      reason: "released",
      occurredAt: now
    });
    return {
      ok: true,
      response: {
        outcome: "released",
        replay: false,
        operation: publicProviderOperation(operation),
        job: publicGenerationJob(job),
        artifact: null,
        segment: null,
        asset: null,
        lineage: null,
        ledgerEntry: publicCreditLedgerEntry(entry),
        reservation: publicCreditReservation(reservation),
        wallet: publicCreditWallet(creditWallets.get(wallet.id))
      }
    };
  }

  // Capture credits once when the provider operation completed. Completed media is
  // fetched through the adapter only, quarantined, validated, hashed and bound to a
  // GeneratedSegment, a versioned GeneratedAsset and a CreativeLineage row. The
  // reconciled provider total is compared with the authorized maximum; the unused
  // remainder is returned to the wallet through the CAPTURE ledger entry. A crash after
  // media retention and before the ledger write is recovered on the next call: the
  // retained segment is detected, retain is skipped and the ledger is settled once.
  function settleCapture(actor, operation, job, reservation, wallet) {
    const existingSegment = [...generatedSegments.values()].find(
      (candidate) => candidate.generationJobId === job.id
    );
    const now = new Date().toISOString();
    let segment;
    let asset;
    let lineage;
    let artifact;
    if (existingSegment) {
      // Crash-window recovery: media was retained before the crash. Re-bind the
      // existing retained records and settle the ledger exactly once without
      // re-retaining or double-capturing.
      segment = existingSegment;
      artifact = artifacts.get(segment.artifactId);
      asset = [...generatedAssets.values()].find((candidate) => candidate.generationJobId === job.id);
      lineage = [...creativeLineages.values()].find((candidate) => candidate.generationJobId === job.id);
    } else {
      // Fetch the completed media through the adapter only. The transient provider
      // URL and raw provider response stay adapter-private; the adapter returns only
      // the retained-media descriptor and the reconciled provider total.
      const mediaResult = fetchHeygenMedia(env, {
        operationId: operation.id,
        externalId: operation.externalId,
        durationSeconds: job.durationSeconds,
        estimatedMaximumMinor: operation.estimatedMaximumMinor
      });
      if (!mediaResult.ok) {
        if (mediaResult.kind === "unavailable") {
          return {
            ok: false,
            problem: problem(
              "DEPENDENCY_UNAVAILABLE",
              503,
              "Dependency unavailable",
              "The provider could not be reached. Try again."
            )
          };
        }
        // malformed media: the artifact is rejected and no credits are captured.
        return {
          ok: false,
          problem: problem(
            mediaResult.errorCode || "ASSET_MEDIA_MALFORMED",
            422,
            "Asset media malformed",
            "The generated media failed validation and was not accepted."
          )
        };
      }
      const media = mediaResult.media;
      // Validate the retained media descriptor before accepting it as clean.
      if (
        !isSha256(media.sha256) ||
        !Number.isInteger(media.byteSize) ||
        media.byteSize <= 0 ||
        !Number.isInteger(media.durationSeconds) ||
        media.durationSeconds <= 0 ||
        !supportedContentTypes.has(media.contentType) ||
        !Number.isInteger(media.providerTotalMinor) ||
        media.providerTotalMinor < 0
      ) {
        return {
          ok: false,
          problem: problem(
            "ASSET_MEDIA_MALFORMED",
            422,
            "Asset media malformed",
            "The generated media failed validation and was not accepted."
          )
        };
      }
      // Reconcile the provider total against the authorized maximum. A provider total
      // above the authorization blocks settlement: no media is retained and no credits
      // are captured or released.
      const authorized = Number(operation.estimatedMaximumMinor);
      if (media.providerTotalMinor > authorized) {
        return {
          ok: false,
          problem: problem(
            "PROVIDER_COST_EXCEEDS_AUTHORIZATION",
            409,
            "Provider cost exceeds authorization",
            "The provider cost exceeded the authorized maximum and was not settled."
          )
        };
      }
      // Retain the media into private V0 storage through the adapter only. The
      // artifact starts quarantined and is promoted to CLEAN once validation passes;
      // media is not clean until that promotion. The transient provider URL is never
      // stored; only the hash, duration, content type and byte size are retained.
      artifact = {
        id: randomUUID(),
        workspaceId: job.workspaceId,
        fileName: `generated-${job.id}.mp4`,
        contentType: media.contentType,
        byteSize: media.byteSize,
        sha256: media.sha256,
        status: "QUARANTINED",
        retentionClass: "quarantine",
        producer: `job:${job.id}`,
        schemaVersion: "artifact.generated.v1",
        objectKey: `clean-media/${job.workspaceId}/${randomUUID()}`,
        createdAt: now,
        updatedAt: now
      };
      artifacts.set(artifact.id, artifact);
      // Media validation passes: the retained artifact is promoted to CLEAN. The
      // segment, versioned asset and immutable lineage row bind the retained artifact
      // to the provider operation, estimate, brand profile, selected script, avatar
      // and bound price version.
      artifact.status = "CLEAN";
      artifact.retentionClass = "clean-media";
      artifact.updatedAt = now;
      artifacts.set(artifact.id, artifact);
      segment = {
        id: randomUUID(),
        workspaceId: job.workspaceId,
        generationJobId: job.id,
        providerOperationId: operation.id,
        provider: HEYGEN_PROVIDER,
        externalId: media.externalId,
        segmentIndex: 0,
        durationSeconds: media.durationSeconds,
        contentType: media.contentType,
        byteSize: media.byteSize,
        sha256: media.sha256,
        artifactId: artifact.id,
        sourceFetchedAt: now,
        createdAt: now,
        updatedAt: now
      };
      generatedSegments.set(segment.id, segment);
      asset = {
        id: randomUUID(),
        workspaceId: job.workspaceId,
        generationJobId: job.id,
        segmentId: segment.id,
        artifactId: artifact.id,
        version: 1,
        kind: "provider_video",
        durationSeconds: media.durationSeconds,
        contentType: media.contentType,
        sha256: media.sha256,
        status: "CLEAN",
        createdAt: now,
        updatedAt: now
      };
      generatedAssets.set(asset.id, asset);
      lineage = {
        id: randomUUID(),
        workspaceId: job.workspaceId,
        generationJobId: job.id,
        brandProfileId: job.brandProfileId,
        selectedScriptId: job.selectedScriptId ?? null,
        avatarProfileId: job.avatarProfileId ?? null,
        estimateId: job.estimateId,
        provider: HEYGEN_PROVIDER,
        providerOperationId: operation.id,
        priceVersion: job.priceVersion,
        generatedAssetId: asset.id,
        createdAt: now,
        updatedAt: now
      };
      creativeLineages.set(lineage.id, lineage);
      // Record the reconciled provider total on the operation at retain time so a
      // crash-window recovery reads the same total without re-fetching. settledAt is
      // set later, at ledger settlement.
      operation.providerTotalMinor = media.providerTotalMinor;
      operation.updatedAt = now;
      providerOperations.set(operation.id, operation);
      // Crash-window simulator: media was retained before the crash, but the ledger
      // settlement did not happen. Return DEPENDENCY_UNAVAILABLE so the caller retries;
      // the next call detects the retained segment and settles the ledger once.
      if (resolveHeygenMediaMode(env) === "crash_after_retain") {
        return {
          ok: false,
          problem: problem(
            "DEPENDENCY_UNAVAILABLE",
            503,
            "Dependency unavailable",
            "Settlement was interrupted after media retention. Try again."
          )
        };
      }
    }
    // Settle the ledger exactly once. The CAPTURE entry returns the unused remainder
    // (authorized maximum minus reconciled actual); when the actual equals the maximum
    // the return is 0 and the wallet balance is unchanged. The job-derived idempotency
    // key makes capture exactly-once across the crash window.
    const captureKey = `g5-capture-${job.id}`;
    const existingCapture = [...creditLedgerEntries.values()].find(
      (entry) => entry.walletId === wallet.id && entry.idempotencyKey === captureKey
    );
    const actual = Number(operation.providerTotalMinor);
    const captureAmount = Number(operation.estimatedMaximumMinor) - actual;
    let entry = existingCapture;
    if (!entry) {
      entry = writeLedgerEntry(
        { workspaceId: job.workspaceId, walletId: wallet.id, currency: wallet.currency },
        "CAPTURE",
        captureAmount,
        captureKey,
        "generation capture",
        now
      );
      entry.generationJobId = job.id;
      creditLedgerEntries.set(entry.id, entry);
    }
    // Record the settlement timestamp on the operation. The provider total was
    // reconciled at retain time; settledAt marks the ledger settlement.
    operation.settledAt = now;
    operation.updatedAt = now;
    providerOperations.set(operation.id, operation);
    reservation.status = "captured";
    reservation.updatedAt = now;
    creditReservations.set(reservation.id, reservation);
    audits.push({
      id: randomUUID(),
      workspaceId: job.workspaceId,
      actorUserId: actor.userId,
      eventType: "generation.settled",
      targetType: "GenerationJob",
      targetId: job.id,
      reason: "captured",
      occurredAt: now
    });
    return {
      ok: true,
      response: {
        outcome: "captured",
        replay: false,
        operation: publicProviderOperation(operation),
        job: publicGenerationJob(job),
        artifact: publicArtifact(artifact),
        segment: publicGeneratedSegment(segment),
        asset: publicGeneratedAsset(asset),
        lineage: publicCreativeLineage(lineage),
        ledgerEntry: publicCreditLedgerEntry(entry),
        reservation: publicCreditReservation(reservation),
        wallet: publicCreditWallet(creditWallets.get(wallet.id))
      }
    };
  }

  // Reconstruct a settlement replay from the retained records. A captured settlement
  // returns the retained media; a released settlement returns null media.
  function buildSettlementReplay(operation, job, reservation, wallet) {
    if (reservation.status === "released") {
      const releaseKey = `g5-release-${job.id}`;
      const entry = [...creditLedgerEntries.values()].find(
        (candidate) => candidate.walletId === wallet.id && candidate.idempotencyKey === releaseKey
      );
      return {
        outcome: "released",
        replay: true,
        operation: publicProviderOperation(operation),
        job: publicGenerationJob(job),
        artifact: null,
        segment: null,
        asset: null,
        lineage: null,
        ledgerEntry: entry ? publicCreditLedgerEntry(entry) : null,
        reservation: publicCreditReservation(reservation),
        wallet: publicCreditWallet(creditWallets.get(wallet.id))
      };
    }
    const segment = [...generatedSegments.values()].find((candidate) => candidate.generationJobId === job.id);
    const asset = [...generatedAssets.values()].find((candidate) => candidate.generationJobId === job.id);
    const lineage = [...creativeLineages.values()].find((candidate) => candidate.generationJobId === job.id);
    const artifact = segment ? artifacts.get(segment.artifactId) : null;
    const captureKey = `g5-capture-${job.id}`;
    const entry = [...creditLedgerEntries.values()].find(
      (candidate) => candidate.walletId === wallet.id && candidate.idempotencyKey === captureKey
    );
    return {
      outcome: "captured",
      replay: true,
      operation: publicProviderOperation(operation),
      job: publicGenerationJob(job),
      artifact: artifact ? publicArtifact(artifact) : null,
      segment: segment ? publicGeneratedSegment(segment) : null,
      asset: asset ? publicGeneratedAsset(asset) : null,
      lineage: lineage ? publicCreativeLineage(lineage) : null,
      ledgerEntry: entry ? publicCreditLedgerEntry(entry) : null,
      reservation: publicCreditReservation(reservation),
      wallet: publicCreditWallet(creditWallets.get(wallet.id))
    };
  }

  function listBlueprints(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const profile = brandProfiles.get(input.brandProfileId);
    if (!isActiveApprovedProfile(profile, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
      };
    }
    const limit = normalizeLimit(input.limit);
    const entries = [...blueprintLibraryEntries.values()]
      .filter((entry) => entry.workspaceId === input.workspaceId)
      .sort((left, right) => `${right.createdAt}:${right.id}`.localeCompare(`${left.createdAt}:${left.id}`));
    const start = input.cursor ? entries.findIndex((entry) => entry.id === input.cursor) + 1 : 0;
    const offset = Math.max(start, 0);
    const items = entries.slice(offset, offset + limit).map((entry) => publicBlueprintLibraryEntry(entry, profile));
    return {
      ok: true,
      response: {
        items,
        page: { limit, nextCursor: entries[offset + limit]?.id ?? null },
        emptyState: items.length === 0 ? { action: "choose_new_discovery_or_default" } : null
      }
    };
  }

  function listAvatars(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    // A brand profile that is missing or belongs to another workspace is hidden
    // behind the same existence-hiding 404 used for all cross-workspace reads.
    const profile = brandProfiles.get(input.brandProfileId);
    if (!profile || profile.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (!isActiveApprovedProfile(profile, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
      };
    }
    ensureAvatarCatalog(input.workspaceId, input.brandProfileId);
    const limit = normalizeLimit(input.limit);
    const entries = [...avatarProfiles.values()]
      .filter((avatar) => avatar.workspaceId === input.workspaceId && avatar.brandProfileId === input.brandProfileId)
      .sort((left, right) => `${right.createdAt}:${right.id}`.localeCompare(`${left.createdAt}:${left.id}`));
    const start = input.cursor ? entries.findIndex((avatar) => avatar.id === input.cursor) + 1 : 0;
    const offset = Math.max(start, 0);
    const now = Date.now();
    const items = entries.slice(offset, offset + limit).map((avatar) => publicAvatar(avatar, avatarConsents.get(avatar.id), now));
    const hasMore = entries.length > offset + limit;
    return {
      ok: true,
      response: {
        items,
        page: { limit, nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null },
        emptyState: items.length === 0 ? { action: "await_brand_or_consent_setup" } : null
      }
    };
  }

  function ensureAvatarCatalog(workspaceId, brandProfileId) {
    const key = `${workspaceId}:${brandProfileId}`;
    if (avatarCatalogsMaterialized.has(key)) {
      return;
    }
    const seed = buildAvatarCatalogSeed(workspaceId, brandProfileId, Date.now());
    for (const entry of seed) {
      avatarProfiles.set(entry.profile.id, entry.profile);
      if (entry.consent) {
        avatarConsents.set(entry.profile.id, entry.consent);
      }
    }
    avatarCatalogsMaterialized.add(key);
  }

  // V0-G2 creator wallet and verified credit purchase. Money is integer minor
  // units only. The deterministic Razorpay (India, INR) and Stripe
  // (international) simulators sign the callback envelope; the handler verifies
  // the signature over the canonical envelope, enforces a timestamp window,
  // deduplicates by provider event id, reconciles amount/currency/provider/
  // workspace, then transitions the purchase and writes an append-only ledger
  // entry. Payment instrument details are never stored.
  function ensureCreditWallet(workspaceId, currency, now) {
    const existing = [...creditWallets.values()].find(
      (wallet) => wallet.workspaceId === workspaceId && wallet.currency === currency
    );
    if (existing) {
      return existing;
    }
    const wallet = {
      id: randomUUID(),
      workspaceId,
      currency,
      balanceMinor: 0,
      createdAt: now,
      updatedAt: now
    };
    creditWallets.set(wallet.id, wallet);
    return wallet;
  }

  function createCreditPurchase(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateCreditPurchaseInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const now = new Date().toISOString();
    const wallet = ensureCreditWallet(input.workspaceId, input.currency, now);
    const purchase = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      walletId: wallet.id,
      provider: input.provider,
      providerReference: `sim_${input.provider}_${randomUUID()}`,
      status: "initiated",
      amountMinor: input.amountMinor,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now
    };
    creditPurchases.set(purchase.id, purchase);
    // The simulator returns the signed callback envelope exactly as the provider
    // would deliver it, so the test can post the webhook back. The signing
    // secret never leaves the simulator.
    const envelope = {
      workspaceId: input.workspaceId,
      purchaseId: purchase.id,
      walletId: wallet.id,
      provider: input.provider,
      providerReference: purchase.providerReference,
      amountMinor: input.amountMinor,
      currency: input.currency,
      eventType: "payment.success",
      eventId: `evt_${purchase.id}`,
      timestamp: Date.now()
    };
    const signature = signPaymentEnvelope(envelope, paymentSimulatorSecret(env));
    return {
      ok: true,
      response: {
        purchase: publicCreditPurchase(purchase),
        wallet: publicCreditWallet(wallet),
        checkout: {
          provider: input.provider,
          providerReference: purchase.providerReference,
          envelope,
          signature
        }
      }
    };
  }

  function processPaymentCallback(source, envelope, signature) {
    if (!verifyPaymentSignature(envelope, signature, paymentSimulatorSecret(env))) {
      return {
        ok: false,
        problem: problem(
          "PAYMENT_SIGNATURE_INVALID",
          401,
          "Payment signature invalid",
          "The payment update could not be verified."
        )
      };
    }
    const inboxKey = `${envelope.workspaceId}:${source}:${envelope.eventId}`;
    const duplicate = inboxEvents.get(inboxKey);
    if (duplicate) {
      // A replayed callback acknowledges with the original transition; it never
      // creates a second ledger entry or a second credit.
      return { ok: true, response: { ...duplicate.response, duplicate: true } };
    }
    // Timestamp tolerance is part of signature verification: an out-of-window
    // envelope fails verification rather than being replayed as fresh.
    if (Math.abs(Date.now() - envelope.timestamp) > PAYMENT_CALLBACK_WINDOW_MS) {
      return {
        ok: false,
        problem: problem(
          "PAYMENT_SIGNATURE_INVALID",
          401,
          "Payment signature invalid",
          "The payment update could not be verified."
        )
      };
    }
    const purchase = [...creditPurchases.values()].find(
      (candidate) =>
        candidate.workspaceId === envelope.workspaceId &&
        candidate.provider === source &&
        candidate.providerReference === envelope.providerReference
    );
    if (!purchase) {
      // A signed callback that cannot be reconciled to a purchase in this
      // workspace is a provider/ledger mismatch; it does not leak whether the
      // purchase exists in another workspace.
      return {
        ok: false,
        problem: problem(
          "PAYMENT_AMOUNT_MISMATCH",
          409,
          "Payment amount mismatch",
          "The payment amount or currency did not match the purchase."
        )
      };
    }
    if (
      purchase.amountMinor !== envelope.amountMinor ||
      purchase.currency !== envelope.currency
    ) {
      return {
        ok: false,
        problem: problem(
          "PAYMENT_AMOUNT_MISMATCH",
          409,
          "Payment amount mismatch",
          "The payment amount or currency did not match the purchase."
        )
      };
    }
    const transition = applyPurchaseTransition(purchase, envelope, source);
    if (!transition.ok) {
      return transition;
    }
    const response = transition.response;
    inboxEvents.set(inboxKey, { response });
    return { ok: true, response: { ...response, duplicate: false } };
  }

  function applyPurchaseTransition(purchase, envelope, source) {
    const now = new Date().toISOString();
    if (envelope.eventType === "payment.pending") {
      purchase.status = "pending";
      purchase.updatedAt = now;
      creditPurchases.set(purchase.id, purchase);
      return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: null, wallet: publicCreditWallet(creditWallets.get(purchase.walletId)) } };
    }
    if (envelope.eventType === "payment.success") {
      if (purchase.status === "succeeded") {
        // Already credited; a repeat success event is a no-op, never a second credit.
        return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: null, wallet: publicCreditWallet(creditWallets.get(purchase.walletId)) } };
      }
      const entry = writeLedgerEntry(purchase, "PURCHASE", purchase.amountMinor, envelope.eventId, null, now);
      purchase.status = "succeeded";
      purchase.updatedAt = now;
      creditPurchases.set(purchase.id, purchase);
      return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: publicCreditLedgerEntry(entry), wallet: publicCreditWallet(creditWallets.get(purchase.walletId)) } };
    }
    if (envelope.eventType === "payment.refunded") {
      if (purchase.status === "refunded") {
        return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: null, wallet: publicCreditWallet(creditWallets.get(purchase.walletId)) } };
      }
      const entry = writeLedgerEntry(purchase, "REFUND", -purchase.amountMinor, envelope.eventId, "provider refund", now);
      purchase.status = "refunded";
      purchase.updatedAt = now;
      creditPurchases.set(purchase.id, purchase);
      return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: publicCreditLedgerEntry(entry), wallet: publicCreditWallet(creditWallets.get(purchase.walletId)) } };
    }
    if (envelope.eventType === "payment.disputed") {
      if (purchase.status === "disputed" || purchase.status === "refunded") {
        return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: null, wallet: publicCreditWallet(creditWallets.get(purchase.walletId)) } };
      }
      const entry = writeLedgerEntry(purchase, "REFUND", -purchase.amountMinor, envelope.eventId, "provider dispute reversal", now);
      purchase.status = "disputed";
      purchase.updatedAt = now;
      creditPurchases.set(purchase.id, purchase);
      return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: publicCreditLedgerEntry(entry), wallet: publicCreditWallet(creditWallets.get(purchase.walletId)) } };
    }
    return {
      ok: false,
      problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Unsupported payment event type.")
    };
  }

  function writeLedgerEntry(purchase, type, amountMinor, idempotencyKey, reason, now) {
    const entry = {
      id: randomUUID(),
      workspaceId: purchase.workspaceId,
      walletId: purchase.walletId,
      generationJobId: null,
      type,
      amountMinor,
      currency: purchase.currency,
      idempotencyKey,
      reason,
      effectiveAt: now,
      createdAt: now
    };
    creditLedgerEntries.set(entry.id, entry);
    const wallet = creditWallets.get(purchase.walletId);
    wallet.balanceMinor += amountMinor;
    wallet.updatedAt = now;
    creditWallets.set(wallet.id, wallet);
    return entry;
  }

  function listWalletLedger(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const wallet = creditWallets.get(input.walletId);
    if (!wallet || wallet.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const limit = normalizeLimit(input.limit);
    const all = [...creditLedgerEntries.values()]
      .filter((entry) => entry.walletId === wallet.id)
      .sort((left, right) => `${left.effectiveAt}:${left.id}`.localeCompare(`${right.effectiveAt}:${right.id}`));
    let running = 0;
    const withRunning = all.map((entry) => {
      running += entry.amountMinor;
      return { entry, runningBalanceMinor: running };
    });
    const start = input.cursor ? withRunning.findIndex((row) => row.entry.id === input.cursor) + 1 : 0;
    const offset = Math.max(start, 0);
    const pageRows = withRunning.slice(offset, offset + limit);
    const entries = pageRows.map((row) => publicCreditLedgerEntry(row.entry, row.runningBalanceMinor));
    const nextCursor = pageRows.length > 0 && offset + limit < withRunning.length ? pageRows[pageRows.length - 1].entry.id : null;
    return {
      ok: true,
      response: {
        wallet: publicCreditWallet(wallet),
        entries,
        page: { limit, nextCursor },
        reconciliation: canPerform(access.membership.role, "view_provider_financial_reconciliation")
          ? creditReconciliation(wallet)
          : null
      }
    };
  }

  function creditReconciliation(wallet) {
    const entries = [...creditLedgerEntries.values()].filter((entry) => entry.walletId === wallet.id);
    const ledgerPurchaseMinor = entries
      .filter((entry) => entry.type === "PURCHASE")
      .reduce((sum, entry) => sum + entry.amountMinor, 0);
    const ledgerRefundMinor = entries
      .filter((entry) => entry.type === "REFUND")
      .reduce((sum, entry) => sum + (-entry.amountMinor), 0);
    const simulatorPaidMinor = [...creditPurchases.values()]
      .filter((purchase) => purchase.walletId === wallet.id && purchase.status === "succeeded")
      .reduce((sum, purchase) => sum + purchase.amountMinor, 0);
    return {
      currency: wallet.currency,
      ledgerPurchaseMinor,
      ledgerRefundMinor,
      simulatorPaidMinor,
      matched: ledgerPurchaseMinor === simulatorPaidMinor
    };
  }

  function createCreditAdjustment(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (!canPerform(access.membership.role, "adjust_credits")) {
      return { ok: false, problem: problem("PERMISSION_DENIED", 403, "Permission denied", "Your role cannot perform this action.") };
    }
    const wallet = creditWallets.get(input.walletId);
    if (!wallet || wallet.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateCreditAdjustmentInput(input, wallet.currency);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const now = new Date().toISOString();
    const signedAmount = input.direction === "credit" ? input.amountMinor : -input.amountMinor;
    const purchase = { workspaceId: input.workspaceId, walletId: wallet.id, currency: wallet.currency };
    const entry = writeLedgerEntry(purchase, "ADJUSTMENT", signedAmount, input.idempotencyKey, input.reason, now);
    audits.push({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "credit.adjustment.recorded",
      targetType: "CreditLedgerEntry",
      targetId: entry.id,
      reason: input.reason,
      occurredAt: now
    });
    return {
      ok: true,
      response: {
        ledgerEntry: publicCreditLedgerEntry(entry),
        wallet: publicCreditWallet(creditWallets.get(wallet.id))
      }
    };
  }

  function seedBlueprintLibraryEntry(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const profile = brandProfiles.get(input.brandProfileId);
    if (!isActiveApprovedProfile(profile, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
      };
    }
    const validation = validateBlueprintLibraryEntryInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const now = new Date().toISOString();
    const entry = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      brandProfileId: input.brandProfileId,
      title: input.title.trim(),
      status: input.status,
      compatibility: normalizeBlueprintCompatibility(input.compatibility),
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now
    };
    blueprintLibraryEntries.set(entry.id, entry);
    return { ok: true, response: { entry: publicBlueprintLibraryEntry(entry, profile) } };
  }

  function createBlueprintRequest(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateBlueprintRequestInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const profile = brandProfiles.get(input.brandProfileId);
    if (!isActiveApprovedProfile(profile, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
      };
    }
    if (input.brandProfileVersion !== profile.version) {
      return {
        ok: false,
        problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
      };
    }
    let selectedEntry = null;
    if (input.path === "existing_blueprint") {
      selectedEntry = blueprintLibraryEntries.get(input.blueprintLibraryEntryId);
      if (!selectedEntry || selectedEntry.workspaceId !== input.workspaceId) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      if (!isBlueprintCompatible(selectedEntry, profile, input.objectiveType)) {
        return {
          ok: false,
          problem: problem("BLUEPRINT_INCOMPATIBLE", 409, "Blueprint incompatible", "This blueprint is not compatible with the selected brand or objective.")
        };
      }
    }
    const now = new Date().toISOString();
    const request = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      path: input.path,
      brandProfileId: profile.id,
      brandProfileVersion: profile.version,
      blueprintLibraryEntryId: selectedEntry?.id ?? null,
      objectiveType: input.objectiveType.trim(),
      objective: input.objective.trim(),
      status: "pending",
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now
    };
    const audit = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "blueprint.request.created",
      targetType: "BlueprintRequest",
      targetId: request.id,
      reason: input.path,
      occurredAt: now
    };
    blueprintRequests.set(request.id, request);
    audits.push(audit);
    return { ok: true, response: { request: publicBlueprintRequest(request), audit: publicAudit(audit) } };
  }

  async function createReadyBlueprint(actor, blueprintRequestId, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateReadyBlueprintInput(blueprintRequestId, input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const request = blueprintRequests.get(blueprintRequestId);
    if (!request || request.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (request.status === "ready") {
      return {
        ok: false,
        problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
      };
    }
    const profile = brandProfiles.get(request.brandProfileId);
    if (!isActiveApprovedProfile(profile, input.workspaceId) || profile.version !== request.brandProfileVersion) {
      return {
        ok: false,
        problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
      };
    }
    const source = await readyBlueprintSource(input, request, {
      getVideoBlueprint: (id) => videoBlueprints.get(id),
      listScenes: (id) => [...blueprintScenes.values()].filter((scene) => scene.videoBlueprintId === id).sort((left, right) => left.index - right.index),
      getLibraryEntry: (id) => blueprintLibraryEntries.get(id)
    });
    if (!source.ok) {
      return { ok: false, problem: source.problem };
    }
    const now = new Date().toISOString();
    const entry = readyBlueprintEntry(input.workspaceId, request, profile, source, actor.userId, now);
    const formula = formulaDerivationFor(entry, request, source, input.overrideFormulaSlots, now);
    if (!formula.ok) {
      return { ok: false, problem: formula.problem };
    }
    const directorPrompt = directorPromptFor(entry, request, profile, formula.record, source, now);
    const readyJobs = readyBlueprintJobs(input.workspaceId, request, entry, formula.record, directorPrompt, source, now);
    const audit = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "blueprint.ready.created",
      targetType: "BlueprintLibraryEntry",
      targetId: entry.id,
      reason: input.sourceType,
      occurredAt: now
    };
    request.status = "ready";
    request.updatedAt = now;
    blueprintLibraryEntries.set(entry.id, entry);
    formulaDerivations.set(formula.record.id, formula.record);
    directorPrompts.set(directorPrompt.id, directorPrompt);
    for (const job of readyJobs) {
      jobs.set(job.id, job);
      appendJobEvent(jobEvents, job, "job.created", { blueprintRequestId: request.id });
      appendJobEvent(jobEvents, job, "job.succeeded", { blueprintLibraryEntryId: entry.id });
    }
    audits.push(audit);
    return {
      ok: true,
      response: readyBlueprintResponse(entry, formula.record, directorPrompt, request, audit, readyJobs)
    };
  }

  async function createScriptTournament(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateScriptTournamentInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const request = blueprintRequests.get(input.blueprintRequestId);
    if (!request || request.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (request.status !== "ready") {
      return {
        ok: false,
        problem: problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages.")
      };
    }
    const formula = [...formulaDerivations.values()].find((record) => record.blueprintRequestId === request.id);
    const directorPrompt = [...directorPrompts.values()].find((record) => record.blueprintRequestId === request.id);
    if (!formula || !directorPrompt) {
      return {
        ok: false,
        problem: problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages.")
      };
    }
    const entry = blueprintLibraryEntries.get(formula.blueprintLibraryEntryId);
    if (!entry || entry.status !== "ready") {
      return {
        ok: false,
        problem: problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages.")
      };
    }
    const profile = brandProfiles.get(request.brandProfileId);
    if (!isActiveApprovedProfile(profile, input.workspaceId) || profile.version !== request.brandProfileVersion) {
      return {
        ok: false,
        problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
      };
    }
    const rulesForProfile = [...brandRules.values()].filter((rule) => rule.brandProfileId === profile.id);
    const variantCount = input.variantCount ?? 10;
    const simulatorMode = input.simulatorMode ?? "fixture_success";
    const now = new Date().toISOString();
    const tournamentId = randomUUID();
    const generated = generateScriptVariants({
      tournamentId,
      workspaceId: input.workspaceId,
      objectiveType: request.objectiveType,
      objective: request.objective,
      brandProfile: profile,
      brandRules: rulesForProfile,
      formula,
      directorPrompt,
      variantCount,
      simulatorMode
    });

    let validCount = 0;
    let result;
    let tournamentStatus;
    const variants = [];
    const evaluations = [];
    if (!generated.ok) {
      result = generated.problemCode === "AI_REQUEST_REFUSED" ? "ai_request_refused" : "schema_invalid";
      tournamentStatus = "failed";
    } else {
      for (const variant of generated.variants) {
        const outcome = evaluateScriptVariant(variant, rulesForProfile, formula);
        const variantRecord = {
          id: randomUUID(),
          workspaceId: input.workspaceId,
          tournamentId,
          index: variant.index,
          status: outcome.variantStatus,
          hookType: variant.hookType,
          hook: variant.hook,
          body: variant.body,
          cta: variant.cta,
          captions: variant.captions,
          claims: variant.claims,
          cadence: variant.cadence,
          formulaSlots: variant.formulaSlots,
          provenance: variant.provenance,
          createdAt: now
        };
        const evaluationRecord = {
          id: randomUUID(),
          workspaceId: input.workspaceId,
          tournamentId,
          variantId: variantRecord.id,
          ...outcome.evaluation,
          createdAt: now
        };
        variants.push(variantRecord);
        evaluations.push(evaluationRecord);
        if (outcome.variantStatus === "generated") {
          validCount += 1;
        }
      }
      if (validCount >= 10) {
        result = "ready_for_selection";
        tournamentStatus = "ready_for_selection";
      } else {
        result = "insufficient_valid";
        tournamentStatus = "failed";
      }
    }

    const manifestArtifact = scriptTournamentManifestArtifact(input.workspaceId, tournamentId, variantCount, now);
    artifacts.set(manifestArtifact.id, manifestArtifact);
    const job = scriptTournamentJob(
      input.workspaceId,
      tournamentId,
      request,
      entry,
      formula,
      directorPrompt,
      manifestArtifact.id,
      tournamentStatus === "ready_for_selection" ? "SUCCEEDED" : "FAILED",
      now
    );
    jobs.set(job.id, job);
    appendJobEvent(jobEvents, job, "job.created", { tournamentId });
    appendJobEvent(jobEvents, job, tournamentStatus === "ready_for_selection" ? "job.succeeded" : "job.failed", { tournamentId, result });
    const outboxEventsList = scriptTournamentOutboxEvents(input.workspaceId, tournamentId, request, variantCount, validCount, result, now);
    for (const outbox of outboxEventsList) {
      outboxEvents.set(outbox.id, outbox);
    }
    const audit = scriptTournamentAudit(input.workspaceId, tournamentId, actor.userId, result, now);
    audits.push(audit);
    const tournament = scriptTournamentRecord({
      tournamentId,
      workspaceId: input.workspaceId,
      request,
      entry,
      formula,
      directorPrompt,
      profile,
      variantCount,
      validCount,
      status: tournamentStatus,
      result,
      now,
      actorUserId: actor.userId,
      manifestArtifactId: manifestArtifact.id,
      jobId: job.id
    });
    scriptTournaments.set(tournamentId, tournament);
    for (const variantRecord of variants) {
      scriptVariants.set(variantRecord.id, variantRecord);
    }
    for (const evaluationRecord of evaluations) {
      scriptEvaluations.set(evaluationRecord.id, evaluationRecord);
    }

    const body = scriptTournamentResponseBody(tournament, variants, evaluations, job, outboxEventsList, audit);
    if (tournamentStatus === "ready_for_selection") {
      return { ok: true, response: body };
    }
    const failureCode = result === "insufficient_valid" ? "SCRIPT_VARIANT_COUNT_INSUFFICIENT" : result === "ai_request_refused" ? "AI_REQUEST_REFUSED" : "AI_OUTPUT_SCHEMA_INVALID";
    const failureStatus = failureCode === "SCRIPT_VARIANT_COUNT_INSUFFICIENT" ? 409 : 422;
    const failureTitle = failureCode === "SCRIPT_VARIANT_COUNT_INSUFFICIENT"
      ? "Script variant count insufficient"
      : failureCode === "AI_REQUEST_REFUSED"
        ? "AI request refused"
        : "AI output schema invalid";
    const failureDetail = failureCode === "SCRIPT_VARIANT_COUNT_INSUFFICIENT"
      ? "There are not enough valid scripts to compare."
      : failureCode === "AI_REQUEST_REFUSED"
        ? "The requested content could not be generated under the current policy."
        : "The AI result did not match the required structure.";
    return {
      ok: false,
      problem: {
        ...problem(failureCode, failureStatus, failureTitle, failureDetail),
        ...body
      }
    };
  }

  async function selectScriptVariant(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateScriptSelectionInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const tournament = scriptTournaments.get(input.tournamentId);
    if (!tournament || tournament.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    // An already-selected tournament refuses any new genuine selection before the
    // stale-version guard so a retried comparison tab never overwrites a selection.
    if (tournament.status === "selected") {
      return {
        ok: false,
        problem: problem("SCRIPT_ALREADY_SELECTED", 409, "Script already selected", "This tournament already has a selected script.")
      };
    }
    // Optimistic-version guard: a stale comparison tab captured an older tournament
    // state and must reload the latest variants before selecting.
    if (input.optimisticTournamentVersion !== toIso(tournament.updatedAt)) {
      return {
        ok: false,
        problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
      };
    }
    if (tournament.status !== "ready_for_selection") {
      return {
        ok: false,
        problem: problem("SCRIPT_SELECTION_INVALID", 409, "Script selection invalid", "Select an evaluated, eligible script.")
      };
    }
    const variant = scriptVariants.get(input.variantId);
    if (!variant || variant.tournamentId !== tournament.id || variant.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("SCRIPT_SELECTION_INVALID", 409, "Script selection invalid", "Select an evaluated, eligible script.")
      };
    }
    if (variant.status !== "generated") {
      return {
        ok: false,
        problem: problem("SCRIPT_SELECTION_INVALID", 409, "Script selection invalid", "Select an evaluated, eligible script.")
      };
    }
    const evaluation = [...scriptEvaluations.values()].find((record) => record.variantId === variant.id);
    if (!evaluation || evaluation.status !== "evaluated") {
      return {
        ok: false,
        problem: problem("SCRIPT_SELECTION_INVALID", 409, "Script selection invalid", "Select an evaluated, eligible script.")
      };
    }

    const now = new Date().toISOString();
    const selectedScriptId = randomUUID();
    const validVariants = [...scriptVariants.values()].filter(
      (record) => record.tournamentId === tournament.id && record.workspaceId === input.workspaceId && record.status === "generated"
    );
    const tournamentEvaluations = [...scriptEvaluations.values()].filter(
      (record) => record.tournamentId === tournament.id && record.workspaceId === input.workspaceId
    );
    const rank = computeVariantRank(validVariants, tournamentEvaluations, variant.id);
    const humanOverride = input.humanOverride === true;
    const selectedScript = selectedScriptRecord({
      selectedScriptId,
      workspaceId: input.workspaceId,
      tournamentId: tournament.id,
      variantId: variant.id,
      actorUserId: actor.userId,
      humanOverride,
      now
    });
    selectedScripts.set(selectedScript.id, selectedScript);
    // Selection flips the lifecycle status but does not alter the compared variant
    // set, so the tournament content version remains the ready_for_selection state.
    tournament.status = "selected";
    tournament.updatedAt = now;
    scriptTournaments.set(tournament.id, tournament);
    const outbox = selectedScriptOutboxEvent(input.workspaceId, tournament.id, selectedScript.id, rank, now);
    outboxEvents.set(outbox.id, outbox);
    const audit = selectedScriptAudit(input.workspaceId, selectedScript.id, tournament.id, actor.userId, now);
    audits.push(audit);
    return {
      ok: true,
      response: selectedScriptResponseBody(selectedScript, tournament, variant, evaluation, [outbox], audit)
    };
  }

  function searchViralCandidates(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateViralCandidateSearchInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const request = blueprintRequests.get(input.blueprintRequestId);
    if (!request || request.workspaceId !== input.workspaceId || request.path !== "new_discovery") {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const providerResult = searchXpozCandidates(input, actor.userId);
    if (!providerResult.ok) {
      return {
        ok: false,
        problem: {
          ...problem("DISCOVERY_PROVIDER_UNAVAILABLE", 503, "Discovery provider unavailable", "Viral discovery is unavailable. Add a candidate manually or try later."),
          retryable: providerResult.retryable,
          providerResult: providerResult.providerResult,
          candidates: []
        }
      };
    }
    const now = new Date().toISOString();
    const requestId = randomUUID();
    const traceId = randomUUID();
    const retained = providerResult.candidates.slice(0, normalizeLimit(input.limit)).map((candidate, index) => {
      const sourceHash = candidateSourceHash(candidate);
      const existing = [...viralCandidates.values()].find(
        (stored) => stored.workspaceId === input.workspaceId && stored.blueprintRequestId === input.blueprintRequestId && stored.sourceHash === sourceHash
      );
      if (existing) {
        return existing;
      }
      const stored = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        blueprintRequestId: input.blueprintRequestId,
        provider: candidate.provider,
        sourceIdentity: candidate.sourceIdentity,
        sourceUrl: candidate.sourceUrl,
        title: candidate.title,
        creatorHandle: candidate.creatorHandle,
        niche: input.niche.trim(),
        market: input.market.trim(),
        objectiveType: input.objectiveType.trim(),
        rank: index + 1,
        score: candidate.metrics.views + candidate.metrics.likes * 8 + candidate.metrics.comments * 20 + candidate.metrics.shares * 35,
        selectionState: "available",
        rightsWarnings: candidate.rightsWarnings,
        metadata: candidate.metadata,
        provenance: candidate.provenance,
        sourceHash,
        createdAt: now,
        updatedAt: now
      };
      const snapshot = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        viralCandidateId: stored.id,
        provider: candidate.provider,
        observedAt: candidate.observedAt,
        metrics: candidate.metrics,
        sourceHash,
        immutable: true,
        createdAt: now
      };
      viralCandidates.set(stored.id, stored);
      metricSnapshots.set(snapshot.id, snapshot);
      return stored;
    });
    const job = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      type: "viral_candidate_search",
      resourceClass: "CPU",
      status: "SUCCEEDED",
      priority: 0,
      inputHash: hashRequest({
        blueprintRequestId: input.blueprintRequestId,
        niche: input.niche,
        market: input.market,
        objectiveType: input.objectiveType,
        providerMode: input.providerMode
      }),
      input: { requestId, traceId, blueprintRequestId: input.blueprintRequestId },
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now
    };
    const outbox = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      eventType: "viral_candidate_search.completed",
      aggregateType: "BlueprintRequest",
      aggregateId: input.blueprintRequestId,
      payload: { requestId, traceId, resultCount: retained.length, providerResult: providerResult.providerResult },
      status: "PUBLISHED",
      createdAt: now,
      publishedAt: now
    };
    const audit = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "viral.candidate_search.completed",
      targetType: "BlueprintRequest",
      targetId: input.blueprintRequestId,
      reason: providerResult.manualFallbackUsed ? "manual_fallback" : "provider_fixture",
      occurredAt: now
    };
    jobs.set(job.id, job);
    outboxEvents.set(outbox.id, outbox);
    audits.push(audit);
    return {
      ok: true,
      response: {
        search: {
          id: job.id,
          workspaceId: input.workspaceId,
          blueprintRequestId: input.blueprintRequestId,
          provider: providerResult.provider,
          status: "ready",
          providerResult: providerResult.providerResult,
          manualFallbackUsed: providerResult.manualFallbackUsed,
          observedAt: retained[0] ? publicMetricSnapshot([...metricSnapshots.values()].find((snapshot) => snapshot.viralCandidateId === retained[0].id)).observedAt : null
        },
        candidates: retained.map((candidate) => publicViralCandidate(candidate, metricSnapshots)),
        job: publicJob(job),
        audit: publicAudit(audit)
      }
    };
  }

  function extractViralCandidateBlueprint(actor, candidateId, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateMediaAcquisitionInput(candidateId, input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const candidate = viralCandidates.get(candidateId);
    if (!candidate || candidate.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const now = new Date().toISOString();
    const blocked = buildBlockedAcquisition(candidate, input, actor.userId, now);
    if (blocked) {
      mediaAcquisitions.set(blocked.acquisition.id, blocked.acquisition);
      if (blocked.thumbnailBlueprint) {
        thumbnailBlueprints.set(blocked.thumbnailBlueprint.id, blocked.thumbnailBlueprint);
      }
      return { ok: false, problem: blocked.problem };
    }
    const requestId = randomUUID();
    const traceId = randomUUID();
    const artifact = analysisArtifact(input.workspaceId, candidate, now);
    const acquisition = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      viralCandidateId: candidate.id,
      artifactId: artifact.id,
      status: "media_acquired",
      retrievalPolicy: input.retrievalPolicy,
      acquisitionMode: input.acquisitionMode,
      rightsDecision: normalizeRightsDecision(input.rightsDecision, actor.userId),
      sourceHash: candidate.sourceHash,
      blockedReason: null,
      createdAt: now,
      updatedAt: now
    };
    const thumbnailBlueprint = thumbnailBlueprintFor(candidate, acquisition, artifact, input.acquisitionMode, now);
    const job = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      type: "media_acquire",
      resourceClass: "CPU",
      status: "SUCCEEDED",
      priority: 0,
      inputHash: hashRequest({ candidateId, expectedSourceHash: input.expectedSourceHash, acquisitionMode: input.acquisitionMode }),
      input: { requestId, traceId, viralCandidateId: candidate.id },
      outputArtifactId: artifact.id,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now
    };
    const outbox = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      eventType: "media_acquisition.completed",
      aggregateType: "ViralCandidate",
      aggregateId: candidate.id,
      payload: { requestId, traceId, mediaAcquisitionId: acquisition.id, thumbnailBlueprintId: thumbnailBlueprint.id },
      status: "PUBLISHED",
      createdAt: now,
      publishedAt: now
    };
    const audit = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "media.acquisition.completed",
      targetType: "ViralCandidate",
      targetId: candidate.id,
      reason: "rights_authorised",
      occurredAt: now
    };
    artifacts.set(artifact.id, artifact);
    mediaAcquisitions.set(acquisition.id, acquisition);
    thumbnailBlueprints.set(thumbnailBlueprint.id, thumbnailBlueprint);
    jobs.set(job.id, job);
    outboxEvents.set(outbox.id, outbox);
    audits.push(audit);
    return {
      ok: true,
      response: {
        acquisition: publicMediaAcquisition(acquisition),
        analysisArtifact: publicArtifact(artifact),
        thumbnailBlueprint: publicThumbnailBlueprint(thumbnailBlueprint),
        job: publicJob(job),
        audit: publicAudit(audit)
      }
    };
  }

  function createSceneBlueprint(actor, candidateId, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateSceneBlueprintInput(candidateId, input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const candidate = viralCandidates.get(candidateId);
    const acquisition = mediaAcquisitions.get(input.mediaAcquisitionId);
    const thumbnailBlueprint = thumbnailBlueprints.get(input.thumbnailBlueprintId);
    if (
      !candidate ||
      candidate.workspaceId !== input.workspaceId ||
      candidate.sourceHash !== input.expectedSourceHash ||
      !acquisition ||
      acquisition.workspaceId !== input.workspaceId ||
      acquisition.viralCandidateId !== candidate.id ||
      acquisition.status !== "media_acquired" ||
      !thumbnailBlueprint ||
      thumbnailBlueprint.workspaceId !== input.workspaceId ||
      thumbnailBlueprint.viralCandidateId !== candidate.id ||
      thumbnailBlueprint.mediaAcquisitionId !== acquisition.id ||
      thumbnailBlueprint.status !== "thumbnail_deciphered"
    ) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }

    const now = new Date().toISOString();
    const requestId = randomUUID();
    const traceId = randomUUID();
    const stageSet = buildSceneStageSet(input.workspaceId, candidate, input, requestId, traceId, now);
    const videoBlueprint = videoBlueprintFor(candidate, acquisition, thumbnailBlueprint, stageSet, input.simulatorMode, now);
    const scenes = sceneSetFor(videoBlueprint, input.simulatorMode, now);
    const outbox = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      eventType: "video_blueprint.stages_completed",
      aggregateType: "VideoBlueprint",
      aggregateId: videoBlueprint.id,
      payload: { requestId, traceId, videoBlueprintId: videoBlueprint.id, stageJobIds: stageSet.jobs.map((job) => job.id) },
      status: "PUBLISHED",
      createdAt: now,
      publishedAt: now
    };
    const audit = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "video.blueprint.stages_completed",
      targetType: "VideoBlueprint",
      targetId: videoBlueprint.id,
      reason: input.simulatorMode,
      occurredAt: now
    };

    for (const artifact of stageSet.artifacts) artifacts.set(artifact.id, artifact);
    for (const job of stageSet.jobs) {
      jobs.set(job.id, job);
      appendJobEvent(jobEvents, job, "job.created", { requestId, traceId, videoBlueprintId: videoBlueprint.id });
      appendJobEvent(jobEvents, job, job.status === "SUCCEEDED" ? "job.succeeded" : "job.failed", { errorCode: job.lastErrorCode ?? null });
    }
    for (const dependency of stageSet.dependencies) jobDependencies.set(dependency.id, dependency);
    videoBlueprints.set(videoBlueprint.id, videoBlueprint);
    for (const scene of scenes) blueprintScenes.set(scene.id, scene);
    outboxEvents.set(outbox.id, outbox);
    audits.push(audit);

    const response = sceneBlueprintResponse(videoBlueprint, scenes, stageSet, outbox, audit);
    const failure = stageFailureFor(input.simulatorMode, response);
    if (failure) {
      return { ok: false, problem: failure };
    }
    return { ok: true, response };
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
    appendJobEvent(jobEvents, job, "job.leased", { attemptId: attempt.id, requestId: job.input.requestId, traceId: job.input.traceId });
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
    appendJobEvent(jobEvents, job, "job.running", { attemptId: leased.id, requestId: job.input.requestId, traceId: job.input.traceId });
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
    if (job.status === "SUCCEEDED" && job.type === "brand_crawl") {
      return {
        ok: true,
        response: {
          job: publicJob(job),
          candidates: [...brandCandidates.values()]
            .filter((candidate) => candidate.crawlRunId === job.input.brandCrawlRunId)
            .map(publicBrandCandidate)
        }
      };
    }
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
    if (job.type === "brand_crawl") {
      return completeBrandCrawlJob(job, leased, input);
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
    appendJobEvent(jobEvents, job, "artifact.retained", { artifactId: artifact.id, sha256: artifact.sha256, requestId: job.input.requestId, traceId: job.input.traceId });
    appendJobEvent(jobEvents, job, "job.completed", { attemptId: leased.id, requestId: job.input.requestId, traceId: job.input.traceId });
    return { ok: true, response: { job: publicJob(job), artifact: publicArtifact(artifact) } };
  }

  function completeBrandCrawlJob(job, leased, input) {
    if (input.workspaceId !== job.workspaceId || input.schemaVersion !== "brand.extraction.output.v1") {
      return { ok: false, problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "The generated media failed validation and was not accepted.") };
    }
    const crawlRun = brandCrawlRuns.get(job.input.brandCrawlRunId);
    if (!crawlRun) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    const extracted = buildBrandExtractionCandidates({
      crawlRunId: crawlRun.id,
      workspaceId: job.workspaceId,
      scrape: input.scrape
    });
    if (!extracted.ok) {
      appendJobEvent(jobEvents, job, "brand.extraction.rejected", { reason: extracted.reason, requestId: job.input.requestId, traceId: job.input.traceId });
      return { ok: false, problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "The generated media failed validation and was not accepted.") };
    }
    const now = new Date().toISOString();
    const retained = extracted.candidates.map((candidate) => ({
      ...candidate,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    }));
    for (const candidate of retained) {
      brandCandidates.set(candidate.id, candidate);
    }
    leased.status = "SUCCEEDED";
    leased.completedAt = now;
    leased.updatedAt = now;
    job.status = "SUCCEEDED";
    job.updatedAt = now;
    crawlRun.status = "SUCCEEDED";
    crawlRun.updatedAt = now;
    if (extracted.promptInputIsolated) {
      appendJobEvent(jobEvents, job, "brand.extraction.prompt_input_isolated", { requestId: job.input.requestId, traceId: job.input.traceId });
    }
    appendJobEvent(jobEvents, job, "brand.candidates.extracted", { candidateCount: retained.length, requestId: job.input.requestId, traceId: job.input.traceId });
    appendJobEvent(jobEvents, job, "job.completed", { attemptId: leased.id, requestId: job.input.requestId, traceId: job.input.traceId });
    return { ok: true, response: { job: publicJob(job), candidates: retained.map(publicBrandCandidate) } };
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
      appendJobEvent(jobEvents, job, "job.retry_scheduled", { attemptId: leased.id, errorCode: leased.errorCode, requestId: job.input.requestId, traceId: job.input.traceId });
      job.status = "QUEUED";
      appendJobEvent(jobEvents, job, "job.queued", { reason: "retry", requestId: job.input.requestId, traceId: job.input.traceId });
    } else {
      job.status = "FAILED";
      appendJobEvent(jobEvents, job, "job.failed", { attemptId: leased.id, errorCode: leased.errorCode, requestId: job.input.requestId, traceId: job.input.traceId });
      appendJobEvent(jobEvents, job, "job.dead_lettered", { attemptId: leased.id, errorCode: leased.errorCode, requestId: job.input.requestId, traceId: job.input.traceId });
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
      appendJobEvent(jobEvents, job, "job.lease_expired", { attemptId: attempt.id, requestId: job.input.requestId, traceId: job.input.traceId });
      appendJobEvent(jobEvents, job, "job.queued", { reason: "lease_expired", requestId: job.input.requestId, traceId: job.input.traceId });
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
      appendJobEvent(jobEvents, job, "job.wakeup_relayed", { outboxEventId: event.id, queue: job.resourceClass, requestId: job.input.requestId, traceId: job.input.traceId });
      relayed.push(publicOutboxEvent(event));
    }
    return { ok: true, response: { relayed } };
  }

  function setWorkspaceCapability(actor, workspaceId, input) {
    const workspaceAccess = getWorkspaceForActor(actor, workspaceId);
    if (!workspaceAccess) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateCapabilityInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const key = capabilityKey(workspaceId, input.capability);
    const previous = workspaceCapabilities.get(key);
    const now = new Date().toISOString();
    const capability = {
      id: previous?.id ?? randomUUID(),
      workspaceId,
      capability: input.capability,
      enabled: input.enabled,
      disabledReason: input.enabled ? null : input.reason.trim(),
      updatedByUserId: actor.userId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    workspaceCapabilities.set(key, capability);
    audits.push({
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: input.enabled ? "capability.enabled" : "capability.disabled",
      targetType: "WorkspaceCapability",
      targetId: capability.id,
      reason: capability.disabledReason,
      occurredAt: now
    });
    return { ok: true, response: { capability: publicWorkspaceCapability(capability) } };
  }

  function isWorkspaceCapabilityEnabled(workspaceId, capability) {
    return workspaceCapabilities.get(capabilityKey(workspaceId, capability))?.enabled !== false;
  }

  function getJobTraceForActor(actor, jobId) {
    const job = jobs.get(jobId);
    if (!job || !getWorkspaceForActor(actor, job.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return {
      ok: true,
      response: {
        trace: publicJobTrace(
          job,
          [...outboxEvents.values()].filter((event) => event.aggregateId === job.id),
          [...jobAttempts.values()].filter((attempt) => attempt.jobId === job.id),
          jobEvents.get(job.id) ?? [],
          [...artifacts.values()].filter((artifact) => artifact.producer === `job:${job.id}`)
        )
      }
    };
  }

  function getWorkspaceOperationalMetrics(actor, workspaceId) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return { ok: true, response: { metrics: operationalMetrics(workspaceId, [...jobs.values()], [...jobAttempts.values()], [...artifacts.values()], flattenJobEvents(jobEvents)) } };
  }

  function recoverJob(actor, jobId, input) {
    const job = jobs.get(jobId);
    if (!job || !getWorkspaceForActor(actor, job.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (input.action !== "retry_dead_letter" || typeof input.reason !== "string" || input.reason.trim().length === 0) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    if (job.status !== "FAILED" || job.outputArtifactId) {
      return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
    }
    job.status = "QUEUED";
    job.nextRunAt = new Date().toISOString();
    job.updatedAt = job.nextRunAt;
    appendJobEvent(jobEvents, job, "job.recovery_requested", { reason: input.reason.trim(), requestId: job.input.requestId, traceId: job.input.traceId });
    appendJobEvent(jobEvents, job, "job.queued", { reason: "admin_recovery", requestId: job.input.requestId, traceId: job.input.traceId });
    return { ok: true, response: { job: publicJob(job) } };
  }

  function createServiceCredential(actor, workspaceId, input) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateServiceCredentialInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const now = new Date().toISOString();
    const credential = {
      id: randomUUID(),
      workspaceId,
      provider: input.provider,
      purpose: input.purpose,
      environment: input.environment,
      secretRef: input.secretRef,
      rotationStatus: input.rotationStatus,
      createdAt: now,
      updatedAt: now
    };
    serviceCredentials.set(credential.id, credential);
    return { ok: true, response: { credential: publicServiceCredential(credential) } };
  }

  function setSimulatorMode(actor, workspaceId, input) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateSimulatorModeInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const simulator = {
      workspaceId,
      boundary: input.boundary,
      mode: input.mode,
      updatedByUserId: actor.userId,
      updatedAt: new Date().toISOString()
    };
    simulatorModes.set(`${workspaceId}:${input.boundary}`, simulator);
    return { ok: true, response: { simulator } };
  }

  function recordRestoreDrill(actor, workspaceId, input) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const artifact = artifacts.get(input.artifactId);
    if (!artifact || artifact.workspaceId !== workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return {
      ok: true,
      response: {
        restore: {
          workspaceId,
          rlsPreserved: true,
          artifactReferencesChecked: 1,
          artifactId: artifact.id,
          reason: input.reason ?? null,
          recordedAt: new Date().toISOString()
        }
      }
    };
  }

  function runRedactionScan(actor, workspaceId, input) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (typeof input.sample !== "string") {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    return { ok: true, response: { scan: redactionScan(input.sample) } };
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
    setWorkspaceCapability,
    getJobTraceForActor,
    getWorkspaceOperationalMetrics,
    recoverJob,
    createServiceCredential,
    setSimulatorMode,
    recordRestoreDrill,
    runRedactionScan,
    runIdempotent,
    initiateArtifactUpload,
    completeArtifactUpload,
    createArtifactDownload,
    createBrandCrawlRun,
    approveBrandProfile,
    createGenerationEstimate,
    confirmGenerationEstimate,
    getGenerationJob,
    submitGenerationJob,
    reconcileGenerationJob,
    cancelGenerationJob,
    processHeygenCallback,
    settleGenerationJob,
    listBlueprints,
    seedBlueprintLibraryEntry,
    createBlueprintRequest,
    createReadyBlueprint,
    createScriptTournament,
    selectScriptVariant,
    searchViralCandidates,
    extractViralCandidateBlueprint,
    createSceneBlueprint,
    startSimulatedMediaProcessing,
    getJobForActor,
    listJobEventsForActor,
    listBrandCandidates,
    listDeadLetterJobs,
    claimJob,
    heartbeatJob,
    completeJob,
    failJob,
    expireJobLeases,
    relayOutbox,
    listAvatars,
    createCreditPurchase,
    processPaymentCallback,
    listWalletLedger,
    createCreditAdjustment,
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

  async function createBrandCrawlRun(actor, input) {
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
        const validation = await validateBrandCrawlRunInput(input, (artifactId) =>
          tx.artifact.findFirst({ where: { id: artifactId, workspaceId: input.workspaceId } })
        );
        if (validation.problem) {
          return { ok: false, problem: validation.problem };
        }
        const requestId = randomUUID();
        const traceId = randomUUID();
        const crawlRun = await tx.brandCrawlRun.create({
          data: {
            workspaceId: input.workspaceId,
            sourceUrl: input.websiteUrl.trim(),
            normalizedUrl: validation.normalizedUrl,
            status: "QUEUED",
            rightsAcknowledged: true,
            crawlScope: validation.crawlScope,
            robotsPolicy: { status: "pending" }
          }
        });
        const retainedAssets = [];
        for (const assetInput of validation.assets) {
          retainedAssets.push(
            await tx.brandAsset.create({
              data: {
                workspaceId: input.workspaceId,
                crawlRunId: crawlRun.id,
                artifactId: assetInput.artifactId,
                rightsBasis: assetInput.rightsBasis.trim(),
                permittedUse: assetInput.permittedUse.trim(),
                status: "ACTIVE"
              }
            })
          );
        }
        const job = await tx.job.create({
          data: {
            workspaceId: input.workspaceId,
            type: "brand_crawl",
            resourceClass: "CPU",
            status: "QUEUED",
            priority: 0,
            inputHash: hashRequest({
              normalizedUrl: crawlRun.normalizedUrl,
              crawlScope: crawlRun.crawlScope,
              brandAssetIds: retainedAssets.map((asset) => asset.id)
            }),
            input: {
              requestId,
              traceId,
              brandCrawlRunId: crawlRun.id,
              normalizedUrl: crawlRun.normalizedUrl,
              crawlScope: crawlRun.crawlScope,
              brandAssetIds: retainedAssets.map((asset) => asset.id)
            },
            maxAttempts: 5
          }
        });
        const updatedRun = await tx.brandCrawlRun.update({
          where: { id: crawlRun.id },
          data: { jobId: job.id }
        });
        const outbox = await tx.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            eventType: "job.wakeup_requested",
            aggregateType: "Job",
            aggregateId: job.id,
            payload: { jobId: job.id, requestId, traceId },
            status: "PENDING"
          }
        });
        await tx.jobEvent.createMany({
          data: [
            { workspaceId: input.workspaceId, jobId: job.id, eventType: "job.created", payload: { brandCrawlRunId: crawlRun.id, requestId, traceId } },
            { workspaceId: input.workspaceId, jobId: job.id, eventType: "job.queued", payload: { outboxEventId: outbox.id, requestId, traceId } }
          ]
        });
        return {
          ok: true,
          response: {
            crawlRun: publicBrandCrawlRun(updatedRun),
            brandAssets: retainedAssets.map(publicBrandAsset),
            job: publicJob(job),
            outboxEvent: publicOutboxEvent(outbox)
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
    if (!(await isWorkspaceCapabilityEnabled(input.workspaceId, "media_processing"))) {
      return {
        ok: false,
        problem: problem("CAPABILITY_DISABLED", 404, "Capability disabled", "We could not find that page.")
      };
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
        const requestId = randomUUID();
        const traceId = randomUUID();
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
              requestId,
              traceId,
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
            payload: { jobId: job.id, requestId, traceId },
            status: "PENDING"
          }
        });
        await tx.jobEvent.createMany({
          data: [
            {
              workspaceId: job.workspaceId,
              jobId: job.id,
              eventType: "job.created",
              payload: { inputArtifactId: input.inputArtifactId, requestId, traceId }
            },
            {
              workspaceId: job.workspaceId,
              jobId: job.id,
              eventType: "job.queued",
              payload: { outboxEventId: outbox.id, requestId, traceId }
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

  async function listBrandCandidates(actor, crawlRunId) {
    return withActor(actor, async (tx) => {
      const crawlRun = await tx.brandCrawlRun.findFirst({ where: { id: crawlRunId } });
      if (!crawlRun) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      const candidates = await tx.brandCandidate.findMany({
        where: { workspaceId: crawlRun.workspaceId, crawlRunId },
        orderBy: { createdAt: "asc" }
      });
      return {
        ok: true,
        response: {
          crawlRun: publicBrandCrawlRun(crawlRun),
          candidates: candidates.map(publicBrandCandidate)
        }
      };
    });
  }

  async function approveBrandProfile(actor, brandId, input) {
    const validation = validateBrandApprovalInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const crawlRun = await tx.brandCrawlRun.findFirst({
          where: { id: input.crawlRunId, workspaceId: input.workspaceId }
        });
        if (!crawlRun) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const current = await tx.brandProfile.aggregate({
          where: { workspaceId: input.workspaceId, brandId },
          _max: { version: true }
        });
        const currentVersion = current._max.version ?? 0;
        if (input.optimisticVersion !== currentVersion) {
          return {
            ok: false,
            problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
          };
        }
        const now = new Date();
        await tx.brandProfile.updateMany({
          where: { workspaceId: input.workspaceId, brandId, active: true, status: "approved" },
          data: { active: false, status: "superseded" }
        });
        const candidateCount = await tx.brandCandidate.count({
          where: { workspaceId: input.workspaceId, crawlRunId: input.crawlRunId }
        });
        const profile = await tx.brandProfile.create({
          data: {
            workspaceId: input.workspaceId,
            brandId,
            crawlRunId: input.crawlRunId,
            schemaVersion: "v0.brand-profile.1",
            version: currentVersion + 1,
            status: "approved",
            active: true,
            profile: normalizeBrandProfile(input.profile, actor.userId, now.toISOString()),
            sourceSummary: { candidateCount, crawlRunId: input.crawlRunId },
            approvedByUserId: actor.userId,
            approvedAt: now
          }
        });
        const approval = await tx.brandApproval.create({
          data: {
            workspaceId: input.workspaceId,
            brandProfileId: profile.id,
            brandId,
            actorUserId: actor.userId,
            decision: "approve",
            reason: input.reason ?? null
          }
        });
        const rules = [];
        for (const rule of input.rules) {
          rules.push(await tx.brandRule.create({
            data: {
              workspaceId: input.workspaceId,
              brandProfileId: profile.id,
              brandId,
              type: rule.type,
              value: rule.value.trim(),
              severity: rule.severity,
              rationale: rule.rationale.trim()
            }
          }));
        }
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "brand.profile.approved",
            targetType: "BrandProfile",
            targetId: profile.id,
            reason: input.reason ?? null
          }
        });
        return {
          ok: true,
          response: {
            profile: publicBrandProfile(profile),
            approval: publicBrandApproval(approval),
            rules: rules.map(publicBrandRule),
            audit: publicAudit(audit)
          }
        };
      },
      input.workspaceId
    );
  }

  async function createGenerationEstimate(actor, input) {
    return withActor(
      actor,
      async (tx) => {
        const profile = await tx.brandProfile.findFirst({
          where: {
            id: input.brandProfileId,
            workspaceId: input.workspaceId,
            status: "approved",
            active: true
          }
        });
        if (!profile) {
          return {
            ok: false,
            problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
          };
        }
        // V0-G1: enforce consent-safe avatar eligibility at the estimate
        // boundary. The catalogue is materialized for the brand profile so the
        // supplied avatarProfileId resolves to a real, workspace+brand-bound
        // profile. A missing or cross-workspace avatar is hidden behind the
        // existence-hiding 404; an ineligible avatar returns the stable consent
        // code. An eligible avatar binds a durable avatar.selected audit row.
        let avatarAudit = null;
        if (input.avatarProfileId) {
          await ensurePrismaAvatarCatalog(tx, input.workspaceId, profile.id);
          const avatar = await tx.avatarProfile.findFirst({
            where: {
              id: input.avatarProfileId,
              workspaceId: input.workspaceId,
              brandProfileId: profile.id
            },
            include: { consent: true }
          });
          if (!avatar) {
            return {
              ok: false,
              problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
            };
          }
          const eligibility = deriveAvatarEligibility(avatar, avatar.consent, Date.now());
          if (!eligibility.eligible) {
            return { ok: false, problem: avatarConsentProblem(eligibility.reason) };
          }
          avatarAudit = await tx.auditEvent.create({
            data: {
              workspaceId: input.workspaceId,
              actorUserId: actor.userId,
              eventType: "avatar.selected",
              targetType: "AvatarProfile",
              targetId: avatar.id
            }
          });
        }
        // V0-G3: bind an active provider price version and record the input
        // hash, expiry and optimistic version so confirmation can reject stale,
        // changed or replayed inputs. The 30s pilot cap and 48,000 minor-unit
        // authorized maximum are the deterministic simulator policy.
        const nowDate = new Date();
        const priceVersion = await tx.providerPriceVersion.findFirst({
          where: {
            provider: "heygen-simulator",
            currency: "INR",
            validFrom: { lte: nowDate },
            validUntil: { gte: nowDate }
          }
        });
        if (!priceVersion) {
          return {
            ok: false,
            problem: problem("VALIDATION_FAILED", 422, "Validation failed", "No active provider price version is available for this route.")
          };
        }
        const durationSeconds = normalizeDurationSeconds(input.durationSeconds);
        const estimate = await tx.generationEstimate.create({
          data: {
            workspaceId: input.workspaceId,
            brandProfileId: profile.id,
            status: "awaiting_confirmation",
            provider: "heygen-simulator",
            priceVersion: priceVersion.priceVersion,
            maximumAuthorizedMinor: 48000n,
            currency: "INR",
            selectedScriptId: input.selectedScriptId,
            avatarProfileId: input.avatarProfileId,
            inputHash: computeGenerationInputHash(input),
            expiresAt: new Date(nowDate.getTime() + estimateTtlMs(env)),
            version: 1,
            durationSeconds
          }
        });
        return {
          ok: true,
          response: {
            estimate: publicGenerationEstimate(estimate),
            ...(avatarAudit ? { audit: publicAudit(avatarAudit) } : {})
          }
        };
      },
      input.workspaceId
    );
  }

  // V0-G3 Prisma: confirm a versioned estimate and atomically reserve credits
  // for one generation job inside a single short database transaction. The
  // estimate must still be awaiting confirmation, the optimistic version and
  // input hash must match, the estimate must not have expired, and the wallet
  // must hold at least the authorized maximum. Confirmation creates the
  // GenerationJob, the active CreditReservation and the RESERVE ledger entry
  // that debits the wallet, then transitions the estimate to credits_reserved.
  // The partial unique index credit_reservations_one_active_per_job_idx is the
  // database-side guard against a second active reservation for the same job
  // under concurrent confirmation, retry or worker crash; a collision surfaces
  // as CREDIT_RESERVATION_CONFLICT. Reservation does not imply provider
  // submission.
  async function confirmGenerationEstimate(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    try {
      return await withActor(
        actor,
        async (tx) => {
          const estimate = await tx.generationEstimate.findFirst({
            where: { id: input.estimateId, workspaceId: input.workspaceId }
          });
          if (!estimate) {
            return {
              ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        if (estimate.status !== "awaiting_confirmation") {
          return {
            ok: false,
            problem: problem("CREDIT_RESERVATION_CONFLICT", 409, "Credit reservation conflict", "Credits are already reserved for this generation.")
          };
        }
        if (Number(input.version) !== estimate.version) {
          return {
            ok: false,
            problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
          };
        }
        const confirmHash = computeGenerationInputHash(input);
        if (confirmHash !== estimate.inputHash) {
          return {
            ok: false,
            problem: problem("ESTIMATE_INPUT_CHANGED", 409, "Estimate input changed", "The script, avatar or settings changed. Request a new estimate.", true)
          };
        }
        if (Date.now() > estimate.expiresAt.getTime()) {
          return {
            ok: false,
            problem: problem("ESTIMATE_EXPIRED", 409, "Estimate expired", "This estimate expired. Request a new estimate.", true)
          };
        }
        // Atomic estimate claim: only one concurrent confirmation can transition
        // awaiting_confirmation -> credits_reserved. The conditional updateMany
        // row-locks the estimate; a racing caller's update sees the new status and
        // its WHERE clause fails (count 0), so it cannot create a second job or
        // debit a second reservation. This is the exactly-once guard that the
        // check-then-write sequence alone cannot provide.
        const claimed = await tx.generationEstimate.updateMany({
          where: {
            id: estimate.id,
            workspaceId: input.workspaceId,
            status: "awaiting_confirmation",
            version: estimate.version,
            inputHash: estimate.inputHash
          },
          data: { status: "credits_reserved", confirmedAt: new Date() }
        });
        if (claimed.count !== 1) {
          const current = await tx.generationEstimate.findFirst({
            where: { id: input.estimateId, workspaceId: input.workspaceId }
          });
          if (!current) {
            return {
              ok: false,
              problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
            };
          }
          if (current.status !== "awaiting_confirmation") {
            return {
              ok: false,
              problem: problem("CREDIT_RESERVATION_CONFLICT", 409, "Credit reservation conflict", "Credits are already reserved for this generation.")
            };
          }
          if (Number(input.version) !== current.version) {
            return {
              ok: false,
              problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
            };
          }
          if (confirmHash !== current.inputHash) {
            return {
              ok: false,
              problem: problem("ESTIMATE_INPUT_CHANGED", 409, "Estimate input changed", "The script, avatar or settings changed. Request a new estimate.", true)
            };
          }
          return {
            ok: false,
            problem: problem("CREDIT_RESERVATION_CONFLICT", 409, "Credit reservation conflict", "Credits are already reserved for this generation.")
          };
        }
        const updatedEstimate = await tx.generationEstimate.findFirst({
          where: { id: estimate.id, workspaceId: input.workspaceId }
        });
        const wallet = await ensurePrismaCreditWallet(tx, input.workspaceId, estimate.currency);
        // Conditional atomic debit: the wallet is debited only when its balance is
        // at least the authorized maximum. If a concurrent reservation dropped the
        // balance below the maximum, count is 0 and the transaction rolls back the
        // estimate claim, so no partial confirmation survives.
        const debited = await tx.creditWallet.updateMany({
          where: { id: wallet.id, balanceMinor: { gte: estimate.maximumAuthorizedMinor } },
          data: { balanceMinor: { decrement: estimate.maximumAuthorizedMinor } }
        });
        if (debited.count !== 1) {
          return {
            ok: false,
            problem: problem("CREDIT_BALANCE_INSUFFICIENT", 409, "Credit balance insufficient", "Add creator credits before generating this video.")
          };
        }
        const job = await tx.generationJob.create({
          data: {
            workspaceId: input.workspaceId,
            estimateId: estimate.id,
            brandProfileId: estimate.brandProfileId,
            selectedScriptId: estimate.selectedScriptId,
            avatarProfileId: estimate.avatarProfileId,
            status: "queued",
            idempotencyKey: input.idempotencyKey,
            inputHash: estimate.inputHash,
            version: estimate.version,
            durationSeconds: estimate.durationSeconds,
            maximumAuthorizedMinor: estimate.maximumAuthorizedMinor,
            currency: estimate.currency,
            priceVersion: estimate.priceVersion
          }
        });
        const reservation = await tx.creditReservation.create({
          data: {
            workspaceId: input.workspaceId,
            generationJobId: job.id,
            walletId: wallet.id,
            status: "ACTIVE",
            amountMinor: estimate.maximumAuthorizedMinor,
            currency: estimate.currency,
            idempotencyKey: input.idempotencyKey,
            expiresAt: estimate.expiresAt
          }
        });
        const reserveEntry = await tx.creditLedgerEntry.create({
          data: {
            workspaceId: input.workspaceId,
            walletId: wallet.id,
            generationJobId: job.id,
            type: "RESERVE",
            amountMinor: -estimate.maximumAuthorizedMinor,
            currency: estimate.currency,
            idempotencyKey: input.idempotencyKey,
            reason: "generation reservation"
          }
        });
        const updatedWallet = await tx.creditWallet.findUnique({ where: { id: wallet.id } });
        await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "generation.confirmed",
            targetType: "GenerationJob",
            targetId: job.id
          }
        });
        return {
          ok: true,
          response: {
            estimate: publicGenerationEstimate(updatedEstimate),
            job: publicGenerationJob(job),
            reservation: publicCreditReservation(reservation),
            ledgerEntry: publicCreditLedgerEntry(reserveEntry),
            wallet: publicCreditWallet(updatedWallet)
          }
        };
      },
      input.workspaceId
    );
    } catch (error) {
      // A unique-constraint or write-conflict collision (e.g. the one-active
      // reservation per job partial index) means a concurrent confirmation won the
      // race; surface a stable conflict, never a raw 500.
      if (isPrismaConflictError(error)) {
        return {
          ok: false,
          problem: problem("CREDIT_RESERVATION_CONFLICT", 409, "Credit reservation conflict", "Credits are already reserved for this generation.")
        };
      }
      throw error;
    }
  }

  async function getGenerationJob(actor, input) {
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
        const job = await tx.generationJob.findFirst({
          where: { id: input.jobId, workspaceId: input.workspaceId }
        });
        if (!job) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const reservation = await tx.creditReservation.findFirst({
          where: { generationJobId: job.id, status: "ACTIVE" }
        });
        return {
          ok: true,
          response: {
            job: publicGenerationJob(job),
            ...(reservation ? { reservation: publicCreditReservation(reservation) } : {})
          }
        };
      },
      input.workspaceId
    );
  }

  // V0-G4 prisma: exactly-once HeyGen submission. The operation is persisted in
  // SUBMITTING and the job advanced to submitting inside one short transaction
  // BEFORE the provider network I/O; the provider outcome is applied in a second
  // short transaction after the call. A crash between the two leaves a resumable
  // SUBMITTING operation, never a blind duplicate. Provider payloads stay
  // adapter-private; credit capture/release is V0-G5.
  async function submitGenerationJob(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    // First short transaction: exactly-once validation + durable pre-network row.
    // A concurrent create that loses the one-operation-per-job unique race throws
    // P2002; reconcile it to a replay or stable conflict instead of a raw 500.
    let prepared;
    try {
      prepared = await withActor(
        actor,
        async (tx) => {
          const existingByKey = await tx.providerOperation.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: input.workspaceId,
              idempotencyKey: input.idempotencyKey
            }
          }
        });
        if (existingByKey) {
          const job = await tx.generationJob.findFirst({
            where: { id: existingByKey.generationJobId, workspaceId: input.workspaceId }
          });
          return {
            replay: true,
            operation: existingByKey,
            job
          };
        }
        // Job ownership gates the per-job operation check so a cross-workspace
        // caller cannot learn whether a job they do not own already has a provider
        // operation. The existence-hiding 404 is returned before any per-job
        // conflict is observable.
        const job = await tx.generationJob.findFirst({
          where: { id: input.jobId, workspaceId: input.workspaceId }
        });
        if (!job) {
          return {
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const existingForJob = await tx.providerOperation.findUnique({
          where: { generationJobId: job.id }
        });
        if (existingForJob) {
          return {
            conflict: true,
            problem: problem(
              "IDEMPOTENCY_INPUT_CONFLICT",
              409,
              "Idempotency input conflict",
              "This generation was already submitted with a different request identity."
            )
          };
        }
        if (job.status !== "queued") {
          return {
            problem: problem(
              "GENERATION_JOB_NOT_SUBMITTABLE",
              409,
              "Generation job not submittable",
              "This generation cannot be submitted in its current state."
            )
          };
        }
        const activeCount = await tx.providerOperation.count({
          where: {
            workspaceId: input.workspaceId,
            status: { in: ["SUBMITTING", "ACCEPTED", "UNKNOWN", "PROCESSING"] }
          }
        });
        if (activeCount >= heygenConcurrencyLimit(env)) {
          return {
            problem: problem(
              "PROVIDER_RATE_LIMITED",
              429,
              "Provider rate limited",
              "The provider is busy. This job will retry at the shown time.",
              true
            )
          };
        }
        const requestHash = computeProviderRequestHash(job);
        const operation = await tx.providerOperation.create({
          data: {
            workspaceId: input.workspaceId,
            generationJobId: job.id,
            provider: HEYGEN_PROVIDER,
            operationType: HEYGEN_OPERATION_TYPE,
            status: "SUBMITTING",
            idempotencyKey: input.idempotencyKey,
            requestHash,
            priceVersion: job.priceVersion,
            estimatedMaximumMinor: job.maximumAuthorizedMinor,
            currency: job.currency,
            submittedAt: new Date()
          }
        });
        await tx.generationJob.update({
          where: { id: job.id },
          data: { status: "submitting" }
        });
        return { operation, job, requestHash };
      },
      input.workspaceId
    );
    } catch (error) {
      if (isPrismaConflictError(error)) {
        prepared = await reconcilePrismaSubmitRace(actor, input);
      } else {
        throw error;
      }
    }
    if (prepared.problem) {
      return { ok: false, problem: prepared.problem };
    }
    if (prepared.replay) {
      return {
        ok: true,
        response: {
          job: publicGenerationJob(prepared.job),
          operation: publicProviderOperation(prepared.operation),
          replay: true
        }
      };
    }
    // Provider network I/O outside the transaction. A timeout after possible
    // acceptance is unknown; the caller reconciles before any retry.
    const providerResult = submitHeygenVideo(env, {
      operationId: prepared.operation.id,
      requestHash: prepared.requestHash,
      mode: input.mode
    });
    // Second short transaction: apply the provider outcome.
    return withActor(
      actor,
      async (tx) => {
        const operation = await tx.providerOperation.findUnique({
          where: { id: prepared.operation.id }
        });
        const job = await tx.generationJob.findUnique({ where: { id: prepared.operation.generationJobId } });
        if (!operation || !job) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        if (!providerResult.ok) {
          if (providerResult.kind === "timeout") {
            await tx.providerOperation.update({
              where: { id: operation.id },
              data: { status: "UNKNOWN", updatedAt: new Date() }
            });
            await tx.generationJob.update({
              where: { id: job.id },
              data: { status: "unknown" }
            });
            return {
              ok: true,
              response: {
                job: publicGenerationJob({ ...job, status: "unknown" }),
                operation: publicProviderOperation({ ...operation, status: "UNKNOWN" }),
                unknown: true
              }
            };
          }
          const errorCode = providerResult.errorCode || "PROVIDER_OUTPUT_INVALID";
          await tx.providerOperation.update({
            where: { id: operation.id },
            data: { status: "FAILED", lastErrorCode: errorCode, updatedAt: new Date() }
          });
          await tx.generationJob.update({
            where: { id: job.id },
            data: { status: "failed" }
          });
          return {
            ok: false,
            problem: problem(
              errorCode,
              422,
              "Provider output invalid",
              "The generated media failed validation and was not accepted."
            )
          };
        }
        const now = new Date();
        await tx.providerOperation.update({
          where: { id: operation.id },
          data: { status: "ACCEPTED", externalId: providerResult.externalId, acceptedAt: now, updatedAt: now }
        });
        await tx.generationJob.update({
          where: { id: job.id },
          data: { status: "accepted" }
        });
        await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "generation.state_changed",
            targetType: "GenerationJob",
            targetId: job.id,
            reason: "accepted"
          }
        });
        const response = {
          job: publicGenerationJob({ ...job, status: "accepted" }),
          operation: publicProviderOperation({ ...operation, status: "ACCEPTED", externalId: providerResult.externalId, acceptedAt: now })
        };
        if (env.HEYGEN_MODE !== "api") {
          const envelope = {
            workspaceId: input.workspaceId,
            jobId: job.id,
            operationId: operation.id,
            externalId: providerResult.externalId,
            eventType: "generation.completed",
            eventId: `evt_${operation.id}`,
            timestamp: Date.now()
          };
          response.callback = {
            envelope,
            signature: signHeygenEnvelope(envelope, heygenSimulatorSecret(env))
          };
        }
        return { ok: true, response };
      },
      input.workspaceId
    );
  }

  // Reconcile a concurrent submit race: a P2002 on the one-operation-per-job
  // (or one-operation-per-key) unique index means another caller won the create.
  // Re-read the committed operation and return a replay when the caller's key
  // matches, or a stable IDEMPOTENCY_INPUT_CONFLICT when a different key already
  // submitted this job. Cross-workspace existence stays hidden behind the 404.
  // Never surfaces a raw 500.
  async function reconcilePrismaSubmitRace(actor, input) {
    return withActor(
      actor,
      async (tx) => {
        const existingByKey = await tx.providerOperation.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: input.workspaceId,
              idempotencyKey: input.idempotencyKey
            }
          }
        });
        if (existingByKey) {
          const job = await tx.generationJob.findFirst({
            where: { id: existingByKey.generationJobId, workspaceId: input.workspaceId }
          });
          return { replay: true, operation: existingByKey, job };
        }
        const job = await tx.generationJob.findFirst({
          where: { id: input.jobId, workspaceId: input.workspaceId }
        });
        if (!job) {
          return {
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const existingForJob = await tx.providerOperation.findUnique({
          where: { generationJobId: job.id }
        });
        if (existingForJob) {
          return {
            conflict: true,
            problem: problem(
              "IDEMPOTENCY_INPUT_CONFLICT",
              409,
              "Idempotency input conflict",
              "This generation was already submitted with a different request identity."
            )
          };
        }
        if (job.status !== "queued") {
          return {
            problem: problem(
              "GENERATION_JOB_NOT_SUBMITTABLE",
              409,
              "Generation job not submittable",
              "This generation cannot be submitted in its current state."
            )
          };
        }
        return {
          conflict: true,
          problem: problem(
            "IDEMPOTENCY_INPUT_CONFLICT",
            409,
            "Idempotency input conflict",
            "This generation was already submitted with a different request identity."
          )
        };
      },
      input.workspaceId
    );
  }

  async function reconcileGenerationJob(actor, input) {
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
        const job = await tx.generationJob.findFirst({
          where: { id: input.jobId, workspaceId: input.workspaceId }
        });
        if (!job) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const operation = await tx.providerOperation.findUnique({
          where: { generationJobId: job.id }
        });
        if (!operation) {
          return {
            ok: false,
            problem: problem(
              "GENERATION_JOB_NOT_SUBMITTABLE",
              409,
              "Generation job not submittable",
              "This generation has no provider operation to reconcile."
            )
          };
        }
        if (["COMPLETED", "FAILED", "REJECTED", "CANCELLED"].includes(operation.status)) {
          return {
            ok: true,
            response: { job: publicGenerationJob(job), operation: publicProviderOperation(operation), replay: true }
          };
        }
        const outcome = reconcileHeygenOperation(env, {
          operationId: operation.id,
          requestHash: operation.requestHash,
          externalId: operation.externalId,
          reconcileOutcome: input.reconcileOutcome
        });
        if (outcome.status === "pending") {
          return {
            ok: true,
            response: { job: publicGenerationJob(job), operation: publicProviderOperation(operation), pending: true }
          };
        }
        const next = applyPrismaProviderOutcome(operation, job, outcome, true);
        await tx.providerOperation.update({ where: { id: operation.id }, data: next.operation });
        await tx.generationJob.update({ where: { id: job.id }, data: next.job });
        return {
          ok: true,
          response: {
            job: publicGenerationJob({ ...job, ...next.job }),
            operation: publicProviderOperation({ ...operation, ...next.operation })
          }
        };
      },
      input.workspaceId
    );
  }

  async function cancelGenerationJob(actor, input) {
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
        const job = await tx.generationJob.findFirst({
          where: { id: input.jobId, workspaceId: input.workspaceId }
        });
        if (!job) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        if (job.status === "cancelled") {
          return { ok: true, response: { job: publicGenerationJob(job), replay: true } };
        }
        if (job.status === "generated" || job.status === "failed") {
          return {
            ok: false,
            problem: problem(
              "GENERATION_JOB_NOT_SUBMITTABLE",
              409,
              "Generation job not submittable",
              "This generation cannot be cancelled in its current state."
            )
          };
        }
        const operation = await tx.providerOperation.findUnique({ where: { generationJobId: job.id } });
        const now = new Date();
        if (!operation) {
          await tx.generationJob.update({ where: { id: job.id }, data: { status: "cancelled" } });
          return { ok: true, response: { job: publicGenerationJob({ ...job, status: "cancelled" }) } };
        }
        if (["SUBMITTING", "ACCEPTED", "UNKNOWN", "PROCESSING"].includes(operation.status)) {
          const outcome = reconcileHeygenOperation(env, {
            operationId: operation.id,
            requestHash: operation.requestHash,
            externalId: operation.externalId,
            reconcileOutcome: input.reconcileOutcome
          });
          if (outcome.status === "pending") {
            await tx.generationJob.update({ where: { id: job.id }, data: { status: "cancel_requested" } });
            return {
              ok: true,
              response: {
                job: publicGenerationJob({ ...job, status: "cancel_requested" }),
                operation: publicProviderOperation(operation),
                uncertain: true
              }
            };
          }
          if (outcome.status === "completed") {
            const next = applyPrismaProviderOutcome(operation, job, outcome, false);
            await tx.providerOperation.update({ where: { id: operation.id }, data: next.operation });
            await tx.generationJob.update({ where: { id: job.id }, data: next.job });
            return {
              ok: false,
              problem: problem(
                "GENERATION_JOB_NOT_SUBMITTABLE",
                409,
                "Generation job not submittable",
                "This generation cannot be cancelled in its current state."
              )
            };
          }
          await tx.providerOperation.update({
            where: { id: operation.id },
            data: { status: "CANCELLED", cancelledAt: now, updatedAt: now }
          });
          await tx.generationJob.update({ where: { id: job.id }, data: { status: "cancelled" } });
          return {
            ok: true,
            response: {
              job: publicGenerationJob({ ...job, status: "cancelled" }),
              operation: publicProviderOperation({ ...operation, status: "CANCELLED", cancelledAt: now })
            }
          };
        }
        await tx.providerOperation.update({
          where: { id: operation.id },
          data: { status: "CANCELLED", cancelledAt: now, updatedAt: now }
        });
        await tx.generationJob.update({ where: { id: job.id }, data: { status: "cancelled" } });
        return {
          ok: true,
          response: {
            job: publicGenerationJob({ ...job, status: "cancelled" }),
            operation: publicProviderOperation({ ...operation, status: "CANCELLED", cancelledAt: now })
          }
        };
      },
      input.workspaceId
    );
  }

  // Map a reconciled provider outcome to prisma update payloads. Returns the
  // partial update objects for the operation and the job.
  function applyPrismaProviderOutcome(operation, job, outcome, reconciled) {
    const now = new Date();
    const operationUpdate = { updatedAt: now };
    const jobUpdate = { updatedAt: now };
    if (outcome.externalId && !operation.externalId) {
      operationUpdate.externalId = outcome.externalId;
    }
    if (outcome.status === "accepted") {
      operationUpdate.status = "ACCEPTED";
      if (!operation.acceptedAt) operationUpdate.acceptedAt = now;
      jobUpdate.status = "accepted";
    } else if (outcome.status === "processing") {
      operationUpdate.status = "PROCESSING";
      jobUpdate.status = "generating";
    } else if (outcome.status === "completed") {
      operationUpdate.status = "COMPLETED";
      operationUpdate.completedAt = now;
      jobUpdate.status = "generated";
    } else if (outcome.status === "failed") {
      operationUpdate.status = "FAILED";
      if (!operation.lastErrorCode) operationUpdate.lastErrorCode = "PROVIDER_OUTPUT_INVALID";
      jobUpdate.status = "failed";
    }
    if (reconciled) {
      operationUpdate.reconciledAt = now;
    }
    return { operation: operationUpdate, job: jobUpdate };
  }

  async function listBlueprints(actor, input) {
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
        const profile = await tx.brandProfile.findFirst({
          where: { id: input.brandProfileId, workspaceId: input.workspaceId, status: "approved", active: true }
        });
        if (!profile) {
          return {
            ok: false,
            problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
          };
        }
        const limit = normalizeLimit(input.limit);
        const where = { workspaceId: input.workspaceId };
        const entries = await tx.blueprintLibraryEntry.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
        });
        const pageItems = entries.slice(0, limit);
        return {
          ok: true,
          response: {
            items: pageItems.map((entry) => publicBlueprintLibraryEntry(entry, profile)),
            page: { limit, nextCursor: entries.length > limit ? entries[limit].id : null },
            emptyState: pageItems.length === 0 ? { action: "choose_new_discovery_or_default" } : null
          }
        };
      },
      input.workspaceId
    );
  }

  async function listAvatars(actor, input) {
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
        // RLS plus the workspaceId predicate hide a missing or cross-workspace
        // brand profile behind the same existence-hiding 404.
        const profile = await tx.brandProfile.findFirst({
          where: { id: input.brandProfileId, workspaceId: input.workspaceId }
        });
        if (!profile) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        if (profile.status !== "approved" || profile.active !== true) {
          return {
            ok: false,
            problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
          };
        }
        await ensurePrismaAvatarCatalog(tx, input.workspaceId, input.brandProfileId);
        const limit = normalizeLimit(input.limit);
        const where = { workspaceId: input.workspaceId, brandProfileId: input.brandProfileId };
        const entries = await tx.avatarProfile.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          include: { consent: true },
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
        });
        const pageItems = entries.slice(0, limit);
        const hasMore = entries.length > limit;
        const now = Date.now();
        return {
          ok: true,
          response: {
            items: pageItems.map((avatar) => publicAvatar(avatar, avatar.consent, now)),
            page: { limit, nextCursor: hasMore && pageItems.length > 0 ? pageItems[pageItems.length - 1].id : null },
            emptyState: pageItems.length === 0 ? { action: "await_brand_or_consent_setup" } : null
          }
        };
      },
      input.workspaceId
    );
  }

  async function ensurePrismaAvatarCatalog(tx, workspaceId, brandProfileId) {
    const existing = await tx.avatarProfile.count({ where: { workspaceId, brandProfileId } });
    if (existing > 0) {
      return;
    }
    const seed = buildAvatarCatalogSeed(workspaceId, brandProfileId, Date.now());
    for (const entry of seed) {
      await tx.avatarProfile.create({
        data: {
          id: entry.profile.id,
          workspaceId,
          brandProfileId,
          kind: entry.profile.kind,
          displayName: entry.profile.displayName,
          likenessScope: entry.profile.likenessScope,
          voiceScope: entry.profile.voiceScope,
          serviceFulfillmentState: entry.profile.serviceFulfillmentState
        }
      });
      if (entry.consent) {
        await tx.avatarConsent.create({
          data: {
            id: entry.consent.id,
            workspaceId,
            avatarProfileId: entry.profile.id,
            evidenceRef: entry.consent.evidenceRef,
            likenessScope: entry.consent.likenessScope,
            voiceScope: entry.consent.voiceScope,
            expiresAt: entry.consent.expiresAt,
            revokedAt: entry.consent.revokedAt,
            revokedByUserId: entry.consent.revokedByUserId
          }
        });
      }
    }
  }

  // V0-G2 Prisma creator wallet and verified credit purchase. Money is integer
  // minor units (BigInt). The deterministic payment simulator signs the
  // callback envelope; the handler verifies the signature over the canonical
  // envelope, enforces a timestamp window, deduplicates via inbox_events,
  // reconciles amount/currency/provider/workspace, then transitions the
  // purchase and writes an append-only ledger entry under RLS.
  async function ensurePrismaCreditWallet(tx, workspaceId, currency) {
    const existing = await tx.creditWallet.findUnique({
      where: { workspaceId_currency: { workspaceId, currency } }
    });
    if (existing) {
      return existing;
    }
    return tx.creditWallet.create({
      data: { workspaceId, currency, balanceMinor: 0n }
    });
  }

  async function createCreditPurchase(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateCreditPurchaseInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const wallet = await ensurePrismaCreditWallet(tx, input.workspaceId, input.currency);
        const purchase = await tx.creditPurchase.create({
          data: {
            workspaceId: input.workspaceId,
            walletId: wallet.id,
            provider: input.provider,
            providerReference: `sim_${input.provider}_${randomUUID()}`,
            status: "INITIATED",
            amountMinor: BigInt(input.amountMinor),
            currency: input.currency,
            idempotencyKey: input.idempotencyKey
          }
        });
        const envelope = {
          workspaceId: input.workspaceId,
          purchaseId: purchase.id,
          walletId: wallet.id,
          provider: input.provider,
          providerReference: purchase.providerReference,
          amountMinor: input.amountMinor,
          currency: input.currency,
          eventType: "payment.success",
          eventId: `evt_${purchase.id}`,
          timestamp: Date.now()
        };
        const signature = signPaymentEnvelope(envelope, paymentSimulatorSecret(env));
        return {
          ok: true,
          response: {
            purchase: publicCreditPurchase(purchase),
            wallet: publicCreditWallet(wallet),
            checkout: {
              provider: input.provider,
              providerReference: purchase.providerReference,
              envelope,
              signature
            }
          }
        };
      },
      input.workspaceId
    );
  }

  async function withCallbackWorkspace(workspaceId, fn) {
    return prisma.$transaction(async (tx) => {
      await setActorContext(tx, "00000000-0000-0000-0000-000000000000", workspaceId);
      return fn(tx);
    });
  }

  // V0-G4 prisma: process a signed HeyGen callback. Signature verified in constant
  // time, timestamp windowed, deduplicated by (workspace, source, eventId) via
  // inbox_events. Malformed callbacks are rejected. Provider payloads stay private.
  async function processHeygenCallback(envelope, signature) {
    if (!verifyHeygenSignature(envelope, signature, heygenSimulatorSecret(env))) {
      return {
        ok: false,
        problem: problem(
          "PROVIDER_CALLBACK_INVALID",
          401,
          "Provider callback invalid",
          "The provider update could not be verified."
        )
      };
    }
    if (
      !envelope ||
      typeof envelope.workspaceId !== "string" ||
      typeof envelope.jobId !== "string" ||
      typeof envelope.operationId !== "string" ||
      typeof envelope.eventType !== "string" ||
      typeof envelope.eventId !== "string" ||
      typeof envelope.timestamp !== "number"
    ) {
      return {
        ok: false,
        problem: problem(
          "PROVIDER_OUTPUT_INVALID",
          422,
          "Provider output invalid",
          "The provider update was malformed and was not accepted."
        )
      };
    }
    return withCallbackWorkspace(envelope.workspaceId, async (tx) => {
      const existing = await tx.inboxEvent.findUnique({
        where: {
          workspaceId_source_idempotencyKey: {
            workspaceId: envelope.workspaceId,
            source: "heygen",
            idempotencyKey: envelope.eventId
          }
        }
      });
      if (existing) {
        return { ok: true, response: { ...existing.payload.response, duplicate: true } };
      }
      if (Math.abs(Date.now() - envelope.timestamp) > HEYGEN_CALLBACK_WINDOW_MS) {
        return {
          ok: false,
          problem: problem(
            "PROVIDER_CALLBACK_INVALID",
            401,
            "Provider callback invalid",
            "The provider update could not be verified."
          )
        };
      }
      const operation = await tx.providerOperation.findFirst({
        where: { id: envelope.operationId, workspaceId: envelope.workspaceId }
      });
      if (!operation) {
        return {
          ok: false,
          problem: problem(
            "PROVIDER_CALLBACK_INVALID",
            401,
            "Provider callback invalid",
            "The provider update could not be verified."
          )
        };
      }
      const job = await tx.generationJob.findFirst({
        where: { id: operation.generationJobId, workspaceId: envelope.workspaceId }
      });
      if (!job) {
        return {
          ok: false,
          problem: problem(
            "PROVIDER_CALLBACK_INVALID",
            401,
            "Provider callback invalid",
            "The provider update could not be verified."
          )
        };
      }
      const outcomeMap = {
        "generation.accepted": "accepted",
        "generation.processing": "processing",
        "generation.completed": "completed",
        "generation.failed": "failed"
      };
      if (!(envelope.eventType in outcomeMap)) {
        return {
          ok: false,
          problem: problem(
            "PROVIDER_OUTPUT_INVALID",
            422,
            "Provider output invalid",
            "The provider update was malformed and was not accepted."
          )
        };
      }
      const now = new Date();
      const response = { job: publicGenerationJob(job), operation: publicProviderOperation(operation) };
      if (["COMPLETED", "FAILED", "REJECTED", "CANCELLED"].includes(operation.status)) {
        await tx.inboxEvent.create({
          data: {
            workspaceId: envelope.workspaceId,
            source: "heygen",
            eventType: envelope.eventType,
            idempotencyKey: envelope.eventId,
            payloadHash: createHash("sha256").update(stableJson(envelope)).digest("hex"),
            payload: { response },
            consumedAt: now
          }
        });
        return { ok: true, response: { ...response, duplicate: false } };
      }
      const next = applyPrismaProviderOutcome(operation, job, { status: outcomeMap[envelope.eventType], externalId: envelope.externalId }, false);
      const updatedOperation = await tx.providerOperation.update({ where: { id: operation.id }, data: next.operation });
      const updatedJob = await tx.generationJob.update({ where: { id: job.id }, data: next.job });
      const finalResponse = { job: publicGenerationJob(updatedJob), operation: publicProviderOperation(updatedOperation) };
      await tx.inboxEvent.create({
        data: {
          workspaceId: envelope.workspaceId,
          source: "heygen",
          eventType: envelope.eventType,
          idempotencyKey: envelope.eventId,
          payloadHash: createHash("sha256").update(stableJson(envelope)).digest("hex"),
          payload: { response: finalResponse },
          consumedAt: now
        }
      });
      return { ok: true, response: { ...finalResponse, duplicate: false } };
    });
  }

  // V0-G5: settle a terminal provider operation against Prisma. Completed media is
  // copied into private V0 storage through the adapter only, quarantined, validated,
  // hashed and bound to a GeneratedSegment, a versioned GeneratedAsset and a
  // CreativeLineage row; the reconciled provider total is recorded on the operation.
  // The ledger is settled in a second short transaction so a crash between media
  // retention and ledger settlement is recovered on the next call: the retained
  // segment is detected, retain is skipped and the CAPTURE/RELEASE entry is written
  // exactly once via its job-derived idempotency key. The transient provider URL is
  // never retained; media is not clean until artifact validation passes.
  async function settleGenerationJob(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    // First short transaction: load the job, operation and reservation, serve an
    // idempotent replay, release on failure, or retain completed media. Returning a
    // problem from inside the transaction rolls back any partial retain. A concurrent
    // retain on the same job raises a Prisma unique-constraint conflict (P2002) on the
    // generated_segments/generated_assets/creative_lineage indexes or a write conflict
    // (P2034); those are normalized below into a replay or a recovery, never a raw 500.
    let prepared;
    try {
      prepared = await withActor(
        actor,
        async (tx) => {
          const job = await tx.generationJob.findFirst({
            where: { id: input.jobId, workspaceId: input.workspaceId }
          });
          if (!job) {
            return {
              problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
            };
          }
          const operation = await tx.providerOperation.findUnique({
            where: { generationJobId: job.id }
          });
          if (!operation) {
            return {
              problem: problem(
                "GENERATION_JOB_NOT_SUBMITTABLE",
                409,
                "Generation job not submittable",
                "This generation has no provider operation to settle."
              )
            };
          }
          const terminal = new Set(["COMPLETED", "FAILED", "REJECTED", "CANCELLED"]);
          if (!terminal.has(operation.status)) {
            return {
              problem: problem(
                "GENERATION_JOB_NOT_SUBMITTABLE",
                409,
                "Generation job not submittable",
                "This generation cannot be settled in its current state."
              )
            };
          }
          const reservation = await tx.creditReservation.findFirst({
            where: { generationJobId: job.id, workspaceId: input.workspaceId }
          });
          if (!reservation) {
            return {
              problem: problem(
                "GENERATION_JOB_NOT_SUBMITTABLE",
                409,
                "Generation job not submittable",
                "This generation has no credit reservation to settle."
              )
            };
          }
          const wallet = await tx.creditWallet.findUnique({
            where: { id: reservation.walletId }
          });

          // Idempotent replay: once the reservation is captured or released the
          // settlement is final. A replay returns the original settlement and never
          // writes a second ledger entry.
          if (reservation.status === "CAPTURED" || reservation.status === "RELEASED") {
            return { replay: true, operation, job, reservation, wallet };
          }

          const failureOutcomes = new Set(["FAILED", "REJECTED", "CANCELLED"]);
          if (failureOutcomes.has(operation.status)) {
            return settlePrismaRelease(tx, actor, operation, job, reservation, wallet);
          }
          return settlePrismaRetain(tx, actor, operation, job, reservation, wallet);
        },
        input.workspaceId
      );
    } catch (error) {
      if (isPrismaConflictError(error)) {
        prepared = await reconcilePrismaSettleRace(actor, input);
      } else {
        throw error;
      }
    }
    if (prepared.problem) {
      return { ok: false, problem: prepared.problem };
    }
    if (prepared.replay) {
      return { ok: true, response: await buildPrismaSettlementReplay(actor, prepared, input.workspaceId) };
    }
    if (prepared.released) {
      return { ok: true, response: prepared.response };
    }
    // Crash-window simulator: media was retained and committed, but the ledger
    // settlement did not happen. Return DEPENDENCY_UNAVAILABLE so the caller retries;
    // the next call detects the retained segment and settles the ledger once.
    if (!prepared.recovered && resolveHeygenMediaMode(env) === "crash_after_retain") {
      return {
        ok: false,
        problem: problem(
          "DEPENDENCY_UNAVAILABLE",
          503,
          "Dependency unavailable",
          "Settlement was interrupted after media retention. Try again."
        )
      };
    }
    // Second short transaction: settle the CAPTURE ledger exactly once, mark the
    // reservation captured and record the settlement timestamp. If a concurrent
    // settlement already captured (the CAPTURE ledger entry exists), replay it without
    // writing. A unique-constraint conflict on the capture key (P2002) or a write
    // conflict (P2034) is normalized by the outer catch into a replay after re-reading
    // the reservation, never a raw 500.
    let settled;
    try {
      settled = await withActor(
        actor,
        async (tx) => {
          const operation = await tx.providerOperation.findUnique({
            where: { id: prepared.operation.id }
          });
          const job = await tx.generationJob.findUnique({ where: { id: prepared.job.id } });
          const reservation = await tx.creditReservation.findFirst({
            where: { generationJobId: job.id, workspaceId: input.workspaceId }
          });
          const wallet = await tx.creditWallet.findUnique({ where: { id: reservation.walletId } });
          const captureKey = `g5-capture-${job.id}`;
          const existing = await tx.creditLedgerEntry.findFirst({
            where: { walletId: wallet.id, idempotencyKey: captureKey }
          });
          if (existing) {
            // A concurrent settlement already captured this reservation. Replay the
            // retained media and the existing ledger entry without writing a second
            // capture, a second wallet move or a second audit row.
            const segment = await tx.generatedSegment.findFirst({
              where: { generationJobId: job.id, workspaceId: input.workspaceId }
            });
            const asset = await tx.generatedAsset.findFirst({
              where: { generationJobId: job.id, workspaceId: input.workspaceId }
            });
            const lineage = await tx.creativeLineage.findFirst({
              where: { generationJobId: job.id, workspaceId: input.workspaceId }
            });
            const artifact = await tx.artifact.findUnique({ where: { id: segment.artifactId } });
            const replayWallet = await tx.creditWallet.findUnique({ where: { id: wallet.id } });
            return {
              ok: true,
              response: {
                outcome: "captured",
                replay: true,
                operation: publicProviderOperation(operation),
                job: publicGenerationJob(job),
                artifact: publicArtifact(artifact),
                segment: publicGeneratedSegment(segment),
                asset: publicGeneratedAsset(asset),
                lineage: publicCreativeLineage(lineage),
                ledgerEntry: publicCreditLedgerEntry(existing),
                reservation: publicCreditReservation(reservation),
                wallet: publicCreditWallet(replayWallet)
              }
            };
          }
          const actual = operation.providerTotalMinor;
          const captureAmount = operation.estimatedMaximumMinor - actual;
          const entry = await tx.creditLedgerEntry.create({
            data: {
              workspaceId: input.workspaceId,
              walletId: wallet.id,
              generationJobId: job.id,
              type: "CAPTURE",
              amountMinor: captureAmount,
              currency: wallet.currency,
              idempotencyKey: captureKey,
              reason: "generation capture"
            }
          });
          await tx.creditWallet.update({
            where: { id: wallet.id },
            data: { balanceMinor: { increment: captureAmount } }
          });
          const updatedOperation = await tx.providerOperation.update({
            where: { id: operation.id },
            data: { settledAt: new Date() }
          });
          const updatedReservation = await tx.creditReservation.update({
            where: { id: reservation.id },
            data: { status: "CAPTURED" }
          });
          const updatedWallet = await tx.creditWallet.findUnique({ where: { id: wallet.id } });
          await tx.auditEvent.create({
            data: {
              workspaceId: input.workspaceId,
              actorUserId: actor.userId,
              eventType: "generation.settled",
              targetType: "GenerationJob",
              targetId: job.id,
              reason: "captured"
            }
          });
          const segment = await tx.generatedSegment.findFirst({
            where: { generationJobId: job.id, workspaceId: input.workspaceId }
          });
          const asset = await tx.generatedAsset.findFirst({
            where: { generationJobId: job.id, workspaceId: input.workspaceId }
          });
          const lineage = await tx.creativeLineage.findFirst({
            where: { generationJobId: job.id, workspaceId: input.workspaceId }
          });
          const artifact = await tx.artifact.findUnique({ where: { id: segment.artifactId } });
          return {
            ok: true,
            response: {
              outcome: "captured",
              replay: false,
              operation: publicProviderOperation(updatedOperation),
              job: publicGenerationJob(job),
              artifact: publicArtifact(artifact),
              segment: publicGeneratedSegment(segment),
              asset: publicGeneratedAsset(asset),
              lineage: publicCreativeLineage(lineage),
              ledgerEntry: publicCreditLedgerEntry(entry),
              reservation: publicCreditReservation(updatedReservation),
              wallet: publicCreditWallet(updatedWallet)
            }
          };
        },
        input.workspaceId
      );
    } catch (error) {
      if (isPrismaConflictError(error)) {
        const reprepared = await reconcilePrismaSettleRace(actor, input);
        if (reprepared.problem) {
          return { ok: false, problem: reprepared.problem };
        }
        return { ok: true, response: await buildPrismaSettlementReplay(actor, reprepared, input.workspaceId) };
      }
      throw error;
    }
    return settled;
  }

  // Re-read the settlement state after a Prisma unique-constraint (P2002) or write
  // conflict (P2034) during settle. A concurrent settle that already captured or
  // released the reservation is replayed; a concurrent retain that committed media but
  // has not yet captured is recovered into the capture phase; anything else is a stable
  // GENERATION_JOB_NOT_SUBMITTABLE. Cross-workspace access hides behind
  // WORKSPACE_ACCESS_DENIED. Never throws a raw DB failure.
  async function reconcilePrismaSettleRace(actor, input) {
    return withActor(
      actor,
      async (tx) => {
        const job = await tx.generationJob.findFirst({
          where: { id: input.jobId, workspaceId: input.workspaceId }
        });
        if (!job) {
          return {
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const operation = await tx.providerOperation.findUnique({
          where: { generationJobId: job.id }
        });
        if (!operation) {
          return {
            problem: problem(
              "GENERATION_JOB_NOT_SUBMITTABLE",
              409,
              "Generation job not submittable",
              "This generation has no provider operation to settle."
            )
          };
        }
        const terminal = new Set(["COMPLETED", "FAILED", "REJECTED", "CANCELLED"]);
        if (!terminal.has(operation.status)) {
          return {
            problem: problem(
              "GENERATION_JOB_NOT_SUBMITTABLE",
              409,
              "Generation job not submittable",
              "This generation cannot be settled in its current state."
            )
          };
        }
        const reservation = await tx.creditReservation.findFirst({
          where: { generationJobId: job.id, workspaceId: input.workspaceId }
        });
        if (!reservation) {
          return {
            problem: problem(
              "GENERATION_JOB_NOT_SUBMITTABLE",
              409,
              "Generation job not submittable",
              "This generation has no credit reservation to settle."
            )
          };
        }
        const wallet = await tx.creditWallet.findUnique({ where: { id: reservation.walletId } });
        if (reservation.status === "CAPTURED" || reservation.status === "RELEASED") {
          return { replay: true, operation, job, reservation, wallet };
        }
        // Reservation still active: a concurrent retain may have committed the retained
        // media but not yet captured. A committed segment means recovery into the
        // capture phase is safe; otherwise the operation is not settleable right now.
        const segment = await tx.generatedSegment.findFirst({
          where: { generationJobId: job.id, workspaceId: input.workspaceId }
        });
        if (segment) {
          return { recovered: true, operation, job, reservation, wallet };
        }
        return {
          problem: problem(
            "GENERATION_JOB_NOT_SUBMITTABLE",
            409,
            "Generation job not submittable",
            "This generation cannot be settled in its current state."
          )
        };
      },
      input.workspaceId
    );
  }

  // Release the full reservation once when the provider operation failed. The wallet
  // is restored by the +max RELEASE ledger entry; the reservation becomes RELEASED.
  // No media is retained for a failed operation.
  async function settlePrismaRelease(tx, actor, operation, job, reservation, wallet) {
    const now = new Date();
    const releaseKey = `g5-release-${job.id}`;
    let entry = await tx.creditLedgerEntry.findFirst({
      where: { walletId: wallet.id, idempotencyKey: releaseKey }
    });
    if (!entry) {
      entry = await tx.creditLedgerEntry.create({
        data: {
          workspaceId: job.workspaceId,
          walletId: wallet.id,
          generationJobId: job.id,
          type: "RELEASE",
          amountMinor: reservation.amountMinor,
          currency: wallet.currency,
          idempotencyKey: releaseKey,
          reason: "generation release"
        }
      });
      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: { balanceMinor: { increment: reservation.amountMinor } }
      });
    }
    const updatedOperation = await tx.providerOperation.update({
      where: { id: operation.id },
      data: { settledAt: now }
    });
    const updatedReservation = await tx.creditReservation.update({
      where: { id: reservation.id },
      data: { status: "RELEASED" }
    });
    const updatedWallet = await tx.creditWallet.findUnique({ where: { id: wallet.id } });
    await tx.auditEvent.create({
      data: {
        workspaceId: job.workspaceId,
        actorUserId: actor.userId,
        eventType: "generation.settled",
        targetType: "GenerationJob",
        targetId: job.id,
        reason: "released"
      }
    });
    return {
      released: true,
      response: {
        outcome: "released",
        replay: false,
        operation: publicProviderOperation(updatedOperation),
        job: publicGenerationJob(job),
        artifact: null,
        segment: null,
        asset: null,
        lineage: null,
        ledgerEntry: publicCreditLedgerEntry(entry),
        reservation: publicCreditReservation(updatedReservation),
        wallet: publicCreditWallet(updatedWallet)
      }
    };
  }

  // Retain completed media: fetch through the adapter, validate, reconcile the
  // provider total against the authorization, then create the artifact, segment,
  // versioned asset and lineage row. A crash-window recovery detects an existing
  // segment and skips retain. Returns the retained records and a recovered flag.
  async function settlePrismaRetain(tx, actor, operation, job, reservation, wallet) {
    const existingSegment = await tx.generatedSegment.findFirst({
      where: { generationJobId: job.id, workspaceId: job.workspaceId }
    });
    if (existingSegment) {
      const asset = await tx.generatedAsset.findFirst({
        where: { generationJobId: job.id, workspaceId: job.workspaceId }
      });
      const lineage = await tx.creativeLineage.findFirst({
        where: { generationJobId: job.id, workspaceId: job.workspaceId }
      });
      return { recovered: true, operation, job, reservation, wallet };
    }
    const mediaResult = fetchHeygenMedia(env, {
      operationId: operation.id,
      externalId: operation.externalId,
      durationSeconds: job.durationSeconds,
      estimatedMaximumMinor: operation.estimatedMaximumMinor
    });
    if (!mediaResult.ok) {
      if (mediaResult.kind === "unavailable") {
        return {
          problem: problem(
            "DEPENDENCY_UNAVAILABLE",
            503,
            "Dependency unavailable",
            "The provider could not be reached. Try again."
          )
        };
      }
      return {
        problem: problem(
          mediaResult.errorCode || "ASSET_MEDIA_MALFORMED",
          422,
          "Asset media malformed",
          "The generated media failed validation and was not accepted."
        )
      };
    }
    const media = mediaResult.media;
    if (
      !isSha256(media.sha256) ||
      !Number.isInteger(media.byteSize) ||
      media.byteSize <= 0 ||
      !Number.isInteger(media.durationSeconds) ||
      media.durationSeconds <= 0 ||
      !supportedContentTypes.has(media.contentType) ||
      !Number.isInteger(media.providerTotalMinor) ||
      media.providerTotalMinor < 0
    ) {
      return {
        problem: problem(
          "ASSET_MEDIA_MALFORMED",
          422,
          "Asset media malformed",
          "The generated media failed validation and was not accepted."
        )
      };
    }
    if (BigInt(media.providerTotalMinor) > operation.estimatedMaximumMinor) {
      return {
        problem: problem(
          "PROVIDER_COST_EXCEEDS_AUTHORIZATION",
          409,
          "Provider cost exceeds authorization",
          "The provider cost exceeded the authorized maximum and was not settled."
        )
      };
    }
    const now = new Date();
    const artifact = await tx.artifact.create({
      data: {
        workspaceId: job.workspaceId,
        fileName: `generated-${job.id}.mp4`,
        contentType: media.contentType,
        byteSize: media.byteSize,
        sha256: media.sha256,
        status: "CLEAN",
        retentionClass: "clean-media",
        producer: `job:${job.id}`,
        schemaVersion: "artifact.generated.v1",
        objectKey: `clean-media/${job.workspaceId}/${randomUUID()}`
      }
    });
    const segment = await tx.generatedSegment.create({
      data: {
        workspaceId: job.workspaceId,
        generationJobId: job.id,
        providerOperationId: operation.id,
        provider: HEYGEN_PROVIDER,
        externalId: media.externalId,
        segmentIndex: 0,
        durationSeconds: media.durationSeconds,
        contentType: media.contentType,
        byteSize: media.byteSize,
        sha256: media.sha256,
        artifactId: artifact.id
      }
    });
    const asset = await tx.generatedAsset.create({
      data: {
        workspaceId: job.workspaceId,
        generationJobId: job.id,
        segmentId: segment.id,
        artifactId: artifact.id,
        version: 1,
        kind: "provider_video",
        durationSeconds: media.durationSeconds,
        contentType: media.contentType,
        sha256: media.sha256,
        status: "CLEAN"
      }
    });
    await tx.creativeLineage.create({
      data: {
        workspaceId: job.workspaceId,
        generationJobId: job.id,
        brandProfileId: job.brandProfileId,
        selectedScriptId: job.selectedScriptId ?? undefined,
        avatarProfileId: job.avatarProfileId ?? undefined,
        estimateId: job.estimateId,
        provider: HEYGEN_PROVIDER,
        providerOperationId: operation.id,
        priceVersion: job.priceVersion,
        generatedAssetId: asset.id
      }
    });
    await tx.providerOperation.update({
      where: { id: operation.id },
      data: { providerTotalMinor: BigInt(media.providerTotalMinor), updatedAt: now }
    });
    return { recovered: false, operation, job, reservation, wallet };
  }

  // Reconstruct a settlement replay from the retained records. A captured settlement
  // returns the retained media; a released settlement returns null media.
  async function buildPrismaSettlementReplay(actor, prepared, workspaceId) {
    return withActor(
      actor,
      async (tx) => {
        const operation = await tx.providerOperation.findUnique({
          where: { id: prepared.operation.id }
        });
        const job = await tx.generationJob.findUnique({ where: { id: prepared.job.id } });
        const reservation = await tx.creditReservation.findFirst({
          where: { generationJobId: job.id, workspaceId }
        });
        const wallet = await tx.creditWallet.findUnique({ where: { id: reservation.walletId } });
        if (reservation.status === "RELEASED") {
          const releaseKey = `g5-release-${job.id}`;
          const entry = await tx.creditLedgerEntry.findFirst({
            where: { walletId: wallet.id, idempotencyKey: releaseKey }
          });
          return {
            outcome: "released",
            replay: true,
            operation: publicProviderOperation(operation),
            job: publicGenerationJob(job),
            artifact: null,
            segment: null,
            asset: null,
            lineage: null,
            ledgerEntry: entry ? publicCreditLedgerEntry(entry) : null,
            reservation: publicCreditReservation(reservation),
            wallet: publicCreditWallet(wallet)
          };
        }
        const segment = await tx.generatedSegment.findFirst({
          where: { generationJobId: job.id, workspaceId }
        });
        const asset = await tx.generatedAsset.findFirst({
          where: { generationJobId: job.id, workspaceId }
        });
        const lineage = await tx.creativeLineage.findFirst({
          where: { generationJobId: job.id, workspaceId }
        });
        const artifact = segment ? await tx.artifact.findUnique({ where: { id: segment.artifactId } }) : null;
        const captureKey = `g5-capture-${job.id}`;
        const entry = await tx.creditLedgerEntry.findFirst({
          where: { walletId: wallet.id, idempotencyKey: captureKey }
        });
        return {
          outcome: "captured",
          replay: true,
          operation: publicProviderOperation(operation),
          job: publicGenerationJob(job),
          artifact: artifact ? publicArtifact(artifact) : null,
          segment: segment ? publicGeneratedSegment(segment) : null,
          asset: asset ? publicGeneratedAsset(asset) : null,
          lineage: lineage ? publicCreativeLineage(lineage) : null,
          ledgerEntry: entry ? publicCreditLedgerEntry(entry) : null,
          reservation: publicCreditReservation(reservation),
          wallet: publicCreditWallet(wallet)
        };
      },
      workspaceId
    );
  }

  async function processPaymentCallback(source, envelope, signature) {
    if (!verifyPaymentSignature(envelope, signature, paymentSimulatorSecret(env))) {
      return {
        ok: false,
        problem: problem(
          "PAYMENT_SIGNATURE_INVALID",
          401,
          "Payment signature invalid",
          "The payment update could not be verified."
        )
      };
    }
    return withCallbackWorkspace(envelope.workspaceId, async (tx) => {
      const existing = await tx.inboxEvent.findUnique({
        where: {
          workspaceId_source_idempotencyKey: {
            workspaceId: envelope.workspaceId,
            source,
            idempotencyKey: envelope.eventId
          }
        }
      });
      if (existing) {
        return { ok: true, response: { ...existing.payload.response, duplicate: true } };
      }
      if (Math.abs(Date.now() - envelope.timestamp) > PAYMENT_CALLBACK_WINDOW_MS) {
        return {
          ok: false,
          problem: problem(
            "PAYMENT_SIGNATURE_INVALID",
            401,
            "Payment signature invalid",
            "The payment update could not be verified."
          )
        };
      }
      const purchase = await tx.creditPurchase.findFirst({
        where: {
          workspaceId: envelope.workspaceId,
          provider: source,
          providerReference: envelope.providerReference
        }
      });
      if (!purchase) {
        return {
          ok: false,
          problem: problem(
            "PAYMENT_AMOUNT_MISMATCH",
            409,
            "Payment amount mismatch",
            "The payment amount or currency did not match the purchase."
          )
        };
      }
      if (purchase.amountMinor !== BigInt(envelope.amountMinor) || purchase.currency !== envelope.currency) {
        return {
          ok: false,
          problem: problem(
            "PAYMENT_AMOUNT_MISMATCH",
            409,
            "Payment amount mismatch",
            "The payment amount or currency did not match the purchase."
          )
        };
      }
      const transition = await applyPrismaPurchaseTransition(tx, purchase, envelope);
      if (!transition.ok) {
        return transition;
      }
      const response = transition.response;
      await tx.inboxEvent.create({
        data: {
          workspaceId: envelope.workspaceId,
          source,
          eventType: envelope.eventType,
          idempotencyKey: envelope.eventId,
          payloadHash: createHash("sha256").update(stableJson(envelope)).digest("hex"),
          payload: { response },
          consumedAt: new Date()
        }
      });
      return { ok: true, response: { ...response, duplicate: false } };
    });
  }

  async function applyPrismaPurchaseTransition(tx, purchase, envelope) {
    const walletId = purchase.walletId;
    const workspaceId = purchase.workspaceId;
    if (envelope.eventType === "payment.pending") {
      const updated = await tx.creditPurchase.update({
        where: { id: purchase.id },
        data: { status: "PENDING" }
      });
      const wallet = await tx.creditWallet.findUnique({ where: { id: walletId } });
      return { ok: true, response: { purchase: publicCreditPurchase(updated), ledgerEntry: null, wallet: publicCreditWallet(wallet) } };
    }
    if (envelope.eventType === "payment.success") {
      if (purchase.status === "SUCCEEDED") {
        const wallet = await tx.creditWallet.findUnique({ where: { id: walletId } });
        return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: null, wallet: publicCreditWallet(wallet) } };
      }
      const entry = await tx.creditLedgerEntry.create({
        data: {
          workspaceId,
          walletId,
          type: "PURCHASE",
          amountMinor: purchase.amountMinor,
          currency: purchase.currency,
          idempotencyKey: envelope.eventId
        }
      });
      const updated = await tx.creditPurchase.update({
        where: { id: purchase.id },
        data: { status: "SUCCEEDED" }
      });
      const wallet = await tx.creditWallet.update({
        where: { id: walletId },
        data: { balanceMinor: { increment: purchase.amountMinor } }
      });
      return { ok: true, response: { purchase: publicCreditPurchase(updated), ledgerEntry: publicCreditLedgerEntry(entry), wallet: publicCreditWallet(wallet) } };
    }
    if (envelope.eventType === "payment.refunded") {
      if (purchase.status === "REFUNDED") {
        const wallet = await tx.creditWallet.findUnique({ where: { id: walletId } });
        return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: null, wallet: publicCreditWallet(wallet) } };
      }
      const entry = await tx.creditLedgerEntry.create({
        data: {
          workspaceId,
          walletId,
          type: "REFUND",
          amountMinor: -purchase.amountMinor,
          currency: purchase.currency,
          idempotencyKey: envelope.eventId,
          reason: "provider refund"
        }
      });
      const updated = await tx.creditPurchase.update({
        where: { id: purchase.id },
        data: { status: "REFUNDED" }
      });
      const wallet = await tx.creditWallet.update({
        where: { id: walletId },
        data: { balanceMinor: { decrement: purchase.amountMinor } }
      });
      return { ok: true, response: { purchase: publicCreditPurchase(updated), ledgerEntry: publicCreditLedgerEntry(entry), wallet: publicCreditWallet(wallet) } };
    }
    if (envelope.eventType === "payment.disputed") {
      if (purchase.status === "DISPUTED" || purchase.status === "REFUNDED") {
        const wallet = await tx.creditWallet.findUnique({ where: { id: walletId } });
        return { ok: true, response: { purchase: publicCreditPurchase(purchase), ledgerEntry: null, wallet: publicCreditWallet(wallet) } };
      }
      const entry = await tx.creditLedgerEntry.create({
        data: {
          workspaceId,
          walletId,
          type: "REFUND",
          amountMinor: -purchase.amountMinor,
          currency: purchase.currency,
          idempotencyKey: envelope.eventId,
          reason: "provider dispute reversal"
        }
      });
      const updated = await tx.creditPurchase.update({
        where: { id: purchase.id },
        data: { status: "DISPUTED" }
      });
      const wallet = await tx.creditWallet.update({
        where: { id: walletId },
        data: { balanceMinor: { decrement: purchase.amountMinor } }
      });
      return { ok: true, response: { purchase: publicCreditPurchase(updated), ledgerEntry: publicCreditLedgerEntry(entry), wallet: publicCreditWallet(wallet) } };
    }
    return {
      ok: false,
      problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Unsupported payment event type.")
    };
  }

  async function listWalletLedger(actor, input) {
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
        const wallet = await tx.creditWallet.findFirst({
          where: { id: input.walletId, workspaceId: input.workspaceId }
        });
        if (!wallet) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const limit = normalizeLimit(input.limit);
        const entries = await tx.creditLedgerEntry.findMany({
          where: { walletId: wallet.id },
          orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
          take: limit + 1,
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
        });
        // Running balance is derived in chronological order over the full
        // ledger so the displayed balance is correct regardless of page.
        const all = await tx.creditLedgerEntry.findMany({
          where: { walletId: wallet.id },
          orderBy: [{ effectiveAt: "asc" }, { id: "asc" }]
        });
        const runningById = new Map();
        let running = 0n;
        for (const row of all) {
          running += row.amountMinor;
          runningById.set(row.id, running);
        }
        const pageRows = entries.slice(0, limit);
        const items = pageRows.map((entry) => publicCreditLedgerEntry(entry, runningById.get(entry.id)));
        const nextCursor = entries.length > limit ? pageRows[pageRows.length - 1].id : null;
        const reconciliation = canPerform(access.membership.role, "view_provider_financial_reconciliation")
          ? await prismaCreditReconciliation(tx, wallet)
          : null;
        return {
          ok: true,
          response: {
            wallet: publicCreditWallet(wallet),
            entries: items,
            page: { limit, nextCursor },
            reconciliation
          }
        };
      },
      input.workspaceId
    );
  }

  async function prismaCreditReconciliation(tx, wallet) {
    const ledger = await tx.creditLedgerEntry.findMany({ where: { walletId: wallet.id } });
    const ledgerPurchaseMinor = ledger
      .filter((entry) => entry.type === "PURCHASE")
      .reduce((sum, entry) => sum + entry.amountMinor, 0n);
    const ledgerRefundMinor = ledger
      .filter((entry) => entry.type === "REFUND")
      .reduce((sum, entry) => sum + (-entry.amountMinor), 0n);
    const purchases = await tx.creditPurchase.findMany({
      where: { walletId: wallet.id, status: "SUCCEEDED" }
    });
    const simulatorPaidMinor = purchases.reduce((sum, purchase) => sum + purchase.amountMinor, 0n);
    return {
      currency: wallet.currency,
      ledgerPurchaseMinor: Number(ledgerPurchaseMinor),
      ledgerRefundMinor: Number(ledgerRefundMinor),
      simulatorPaidMinor: Number(simulatorPaidMinor),
      matched: ledgerPurchaseMinor === simulatorPaidMinor
    };
  }

  async function createCreditAdjustment(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (!canPerform(access.membership.role, "adjust_credits")) {
      return { ok: false, problem: problem("PERMISSION_DENIED", 403, "Permission denied", "Your role cannot perform this action.") };
    }
    return withActor(
      actor,
      async (tx) => {
        const wallet = await tx.creditWallet.findFirst({
          where: { id: input.walletId, workspaceId: input.workspaceId }
        });
        if (!wallet) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const validation = validateCreditAdjustmentInput(input, wallet.currency);
        if (validation) {
          return { ok: false, problem: validation };
        }
        const signedAmount = input.direction === "credit" ? BigInt(input.amountMinor) : -BigInt(input.amountMinor);
        const entry = await tx.creditLedgerEntry.create({
          data: {
            workspaceId: input.workspaceId,
            walletId: wallet.id,
            type: "ADJUSTMENT",
            amountMinor: signedAmount,
            currency: wallet.currency,
            idempotencyKey: input.idempotencyKey,
            reason: input.reason
          }
        });
        const updatedWallet = await tx.creditWallet.update({
          where: { id: wallet.id },
          data: { balanceMinor: { increment: signedAmount } }
        });
        await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "credit.adjustment.recorded",
            targetType: "CreditLedgerEntry",
            targetId: entry.id,
            reason: input.reason
          }
        });
        return {
          ok: true,
          response: {
            ledgerEntry: publicCreditLedgerEntry(entry),
            wallet: publicCreditWallet(updatedWallet)
          }
        };
      },
      input.workspaceId
    );
  }

  async function seedBlueprintLibraryEntry(actor, input) {
    const validation = validateBlueprintLibraryEntryInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const profile = await tx.brandProfile.findFirst({
          where: { id: input.brandProfileId, workspaceId: input.workspaceId, status: "approved", active: true }
        });
        if (!profile) {
          return {
            ok: false,
            problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
          };
        }
        const entry = await tx.blueprintLibraryEntry.create({
          data: {
            workspaceId: input.workspaceId,
            brandProfileId: input.brandProfileId,
            title: input.title.trim(),
            status: input.status,
            compatibility: normalizeBlueprintCompatibility(input.compatibility),
            createdByUserId: actor.userId
          }
        });
        return { ok: true, response: { entry: publicBlueprintLibraryEntry(entry, profile) } };
      },
      input.workspaceId
    );
  }

  async function createBlueprintRequest(actor, input) {
    const validation = validateBlueprintRequestInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const profile = await tx.brandProfile.findFirst({
          where: { id: input.brandProfileId, workspaceId: input.workspaceId, status: "approved", active: true }
        });
        if (!profile) {
          return {
            ok: false,
            problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
          };
        }
        if (input.brandProfileVersion !== profile.version) {
          return {
            ok: false,
            problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
          };
        }
        let selectedEntry = null;
        if (input.path === "existing_blueprint") {
          selectedEntry = await tx.blueprintLibraryEntry.findUnique({ where: { id: input.blueprintLibraryEntryId } });
          if (!selectedEntry || selectedEntry.workspaceId !== input.workspaceId) {
            return {
              ok: false,
              problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
            };
          }
          if (!isBlueprintCompatible(selectedEntry, profile, input.objectiveType)) {
            return {
              ok: false,
              problem: problem("BLUEPRINT_INCOMPATIBLE", 409, "Blueprint incompatible", "This blueprint is not compatible with the selected brand or objective.")
            };
          }
        }
        const request = await tx.blueprintRequest.create({
          data: {
            workspaceId: input.workspaceId,
            path: input.path,
            brandProfileId: profile.id,
            brandProfileVersion: profile.version,
            blueprintLibraryEntryId: selectedEntry?.id ?? null,
            objectiveType: input.objectiveType.trim(),
            objective: input.objective.trim(),
            status: "pending",
            createdByUserId: actor.userId
          }
        });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "blueprint.request.created",
            targetType: "BlueprintRequest",
            targetId: request.id,
            reason: input.path
          }
        });
        return { ok: true, response: { request: publicBlueprintRequest(request), audit: publicAudit(audit) } };
      },
      input.workspaceId
    );
  }

  async function createReadyBlueprint(actor, blueprintRequestId, input) {
    const validation = validateReadyBlueprintInput(blueprintRequestId, input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const request = await tx.blueprintRequest.findFirst({ where: { id: blueprintRequestId, workspaceId: input.workspaceId } });
        if (!request) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        if (request.status === "ready") {
          return {
            ok: false,
            problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.")
          };
        }
        const profile = await tx.brandProfile.findFirst({
          where: { id: request.brandProfileId, workspaceId: input.workspaceId, status: "approved", active: true }
        });
        if (!profile || profile.version !== request.brandProfileVersion) {
          return {
            ok: false,
            problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.")
          };
        }
        const resolvedSource = await readyBlueprintSource(input, request, {
          getVideoBlueprint: (id) => tx.videoBlueprint.findFirst({ where: { id, workspaceId: input.workspaceId } }),
          listScenes: (id) => tx.blueprintScene.findMany({ where: { workspaceId: input.workspaceId, videoBlueprintId: id }, orderBy: { index: "asc" } }),
          getLibraryEntry: (id) => tx.blueprintLibraryEntry.findFirst({ where: { id, workspaceId: input.workspaceId } })
        });
        if (!resolvedSource.ok) {
          return { ok: false, problem: resolvedSource.problem };
        }
        const now = new Date();
        const nowIso = now.toISOString();
        const entryInput = readyBlueprintEntry(input.workspaceId, request, profile, resolvedSource, actor.userId, nowIso);
        const formula = formulaDerivationFor(entryInput, request, resolvedSource, input.overrideFormulaSlots, nowIso);
        if (!formula.ok) {
          return { ok: false, problem: formula.problem };
        }
        const entry = await tx.blueprintLibraryEntry.create({
          data: {
            workspaceId: entryInput.workspaceId,
            brandProfileId: entryInput.brandProfileId,
            title: entryInput.title,
            status: entryInput.status,
            compatibility: entryInput.compatibility,
            createdByUserId: entryInput.createdByUserId
          }
        });
        const formulaRecord = await tx.formulaDerivation.create({
          data: prismaFormulaDerivation({ ...formula.record, blueprintLibraryEntryId: entry.id })
        });
        const directorPrompt = await tx.directorPrompt.create({
          data: prismaDirectorPrompt(directorPromptFor(entry, request, profile, formulaRecord, resolvedSource, nowIso))
        });
        const readyJobs = [];
        for (const jobInput of readyBlueprintJobs(input.workspaceId, request, entry, formulaRecord, directorPrompt, resolvedSource, nowIso)) {
          const job = await tx.job.create({
            data: {
              workspaceId: jobInput.workspaceId,
              type: jobInput.type,
              resourceClass: jobInput.resourceClass,
              status: jobInput.status,
              priority: jobInput.priority,
              inputHash: jobInput.inputHash,
              input: jobInput.input,
              outputArtifactId: null,
              lastErrorCode: null,
              maxAttempts: jobInput.maxAttempts
            }
          });
          await tx.jobEvent.create({
            data: {
              workspaceId: job.workspaceId,
              jobId: job.id,
              eventType: "job.created",
              payload: { blueprintRequestId: request.id }
            }
          });
          await tx.jobEvent.create({
            data: {
              workspaceId: job.workspaceId,
              jobId: job.id,
              eventType: "job.succeeded",
              payload: { blueprintLibraryEntryId: entry.id }
            }
          });
          readyJobs.push(job);
        }
        const updatedRequest = await tx.blueprintRequest.update({ where: { id: request.id }, data: { status: "ready" } });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "blueprint.ready.created",
            targetType: "BlueprintLibraryEntry",
            targetId: entry.id,
            reason: input.sourceType
          }
        });
        return {
          ok: true,
          response: readyBlueprintResponse(entry, formulaRecord, directorPrompt, updatedRequest, audit, readyJobs)
        };
      },
      input.workspaceId
    );
  }

  async function createScriptTournament(actor, input) {
    const validation = validateScriptTournamentInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const request = await tx.blueprintRequest.findFirst({ where: { id: input.blueprintRequestId, workspaceId: input.workspaceId } });
        if (!request) {
          return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
        }
        if (request.status !== "ready") {
          return { ok: false, problem: problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages.") };
        }
        const formula = await tx.formulaDerivation.findFirst({ where: { blueprintRequestId: request.id, workspaceId: input.workspaceId } });
        const directorPrompt = await tx.directorPrompt.findFirst({ where: { blueprintRequestId: request.id, workspaceId: input.workspaceId } });
        if (!formula || !directorPrompt) {
          return { ok: false, problem: problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages.") };
        }
        const entry = await tx.blueprintLibraryEntry.findFirst({ where: { id: formula.blueprintLibraryEntryId, workspaceId: input.workspaceId } });
        if (!entry || entry.status !== "ready") {
          return { ok: false, problem: problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages.") };
        }
        const profile = await tx.brandProfile.findFirst({ where: { id: request.brandProfileId, workspaceId: input.workspaceId, status: "approved", active: true } });
        if (!profile || profile.version !== request.brandProfileVersion) {
          return { ok: false, problem: problem("BRAND_PROFILE_NOT_APPROVED", 409, "Brand profile not approved", "Approve the current brand profile before using it for production.") };
        }
        const brandRules = await tx.brandRule.findMany({ where: { brandProfileId: profile.id, workspaceId: input.workspaceId } });
        const rulesForProfile = brandRules.map((rule) => ({ id: rule.id, type: rule.type, value: rule.value, severity: rule.severity }));
        const variantCount = input.variantCount ?? 10;
        const simulatorMode = input.simulatorMode ?? "fixture_success";
        const now = new Date();
        const nowIso = now.toISOString();
        const tournamentId = randomUUID();
        const generated = generateScriptVariants({
          tournamentId,
          workspaceId: input.workspaceId,
          objectiveType: request.objectiveType,
          objective: request.objective,
          brandProfile: { profile: profile.profile },
          brandRules: rulesForProfile,
          formula,
          directorPrompt,
          variantCount,
          simulatorMode
        });

        let validCount = 0;
        let result;
        let tournamentStatus;
        const variants = [];
        const evaluations = [];
        if (!generated.ok) {
          result = generated.problemCode === "AI_REQUEST_REFUSED" ? "ai_request_refused" : "schema_invalid";
          tournamentStatus = "failed";
        } else {
          for (const variant of generated.variants) {
            const outcome = evaluateScriptVariant(variant, rulesForProfile, formula);
            const variantRecord = {
              id: randomUUID(),
              workspaceId: input.workspaceId,
              tournamentId,
              index: variant.index,
              status: outcome.variantStatus,
              hookType: variant.hookType,
              hook: variant.hook,
              body: variant.body,
              cta: variant.cta,
              captions: variant.captions,
              claims: variant.claims,
              cadence: variant.cadence,
              formulaSlots: variant.formulaSlots,
              provenance: variant.provenance,
              createdAt: nowIso
            };
            const evaluationRecord = {
              id: randomUUID(),
              workspaceId: input.workspaceId,
              tournamentId,
              variantId: variantRecord.id,
              ...outcome.evaluation,
              createdAt: nowIso
            };
            variants.push(variantRecord);
            evaluations.push(evaluationRecord);
            if (outcome.variantStatus === "generated") {
              validCount += 1;
            }
          }
          if (validCount >= 10) {
            result = "ready_for_selection";
            tournamentStatus = "ready_for_selection";
          } else {
            result = "insufficient_valid";
            tournamentStatus = "failed";
          }
        }

        const manifestArtifactInput = scriptTournamentManifestArtifact(input.workspaceId, tournamentId, variantCount, nowIso);
        const dbArtifact = await tx.artifact.create({ data: { id: manifestArtifactInput.id, ...prismaArtifact(manifestArtifactInput) } });
        const manifestArtifactId = dbArtifact.id;
        const jobInput = scriptTournamentJob(
          input.workspaceId,
          tournamentId,
          request,
          entry,
          formula,
          directorPrompt,
          manifestArtifactId,
          tournamentStatus === "ready_for_selection" ? "SUCCEEDED" : "FAILED",
          nowIso
        );
        await tx.job.create({
          data: {
            id: jobInput.id,
            workspaceId: jobInput.workspaceId,
            type: jobInput.type,
            resourceClass: jobInput.resourceClass,
            status: jobInput.status,
            priority: jobInput.priority,
            inputHash: jobInput.inputHash,
            input: jobInput.input,
            outputArtifactId: jobInput.outputArtifactId,
            lastErrorCode: jobInput.lastErrorCode,
            maxAttempts: jobInput.maxAttempts
          }
        });
        await tx.jobEvent.create({ data: { workspaceId: input.workspaceId, jobId: jobInput.id, eventType: "job.created", payload: { tournamentId } } });
        await tx.jobEvent.create({ data: { workspaceId: input.workspaceId, jobId: jobInput.id, eventType: tournamentStatus === "ready_for_selection" ? "job.succeeded" : "job.failed", payload: { tournamentId, result } } });

        const tournament = scriptTournamentRecord({
          tournamentId,
          workspaceId: input.workspaceId,
          request,
          entry,
          formula,
          directorPrompt,
          profile: { id: profile.id },
          variantCount,
          validCount,
          status: tournamentStatus,
          result,
          now: nowIso,
          actorUserId: actor.userId,
          manifestArtifactId,
          jobId: jobInput.id
        });
        await tx.scriptTournament.create({ data: { id: tournament.id, ...prismaScriptTournament(tournament) } });
        for (const variantRecord of variants) {
          await tx.scriptVariant.create({ data: { id: variantRecord.id, ...prismaScriptVariant(variantRecord) } });
        }
        for (const evaluationRecord of evaluations) {
          await tx.scriptEvaluation.create({ data: { id: evaluationRecord.id, ...prismaScriptEvaluation(evaluationRecord) } });
        }
        const outboxEventsList = scriptTournamentOutboxEvents(input.workspaceId, tournamentId, request, variantCount, validCount, result, nowIso);
        for (const outbox of outboxEventsList) {
          await tx.outboxEvent.create({
            data: {
              id: outbox.id,
              workspaceId: outbox.workspaceId,
              eventType: outbox.eventType,
              aggregateType: outbox.aggregateType,
              aggregateId: outbox.aggregateId,
              payload: outbox.payload,
              status: outbox.status,
              publishedAt: now
            }
          });
        }
        const audit = scriptTournamentAudit(input.workspaceId, tournamentId, actor.userId, result, nowIso);
        await tx.auditEvent.create({
          data: {
            workspaceId: audit.workspaceId,
            actorUserId: audit.actorUserId,
            eventType: audit.eventType,
            targetType: audit.targetType,
            targetId: audit.targetId,
            reason: audit.reason
          }
        });

        // The response must carry the database's authoritative updatedAt so a later
        // optimistic-version guard on selection compares like-for-like. Prisma's
        // @updatedAt sets the row timestamp at create time, which can differ from
        // the in-memory now captured above, so re-fetch and align the record.
        const persistedTournament = await tx.scriptTournament.findUnique({ where: { id: tournament.id } });
        const body = scriptTournamentResponseBody(
          { ...tournament, updatedAt: persistedTournament.updatedAt, createdAt: persistedTournament.createdAt },
          variants,
          evaluations,
          jobInput,
          outboxEventsList,
          audit
        );
        if (tournamentStatus === "ready_for_selection") {
          return { ok: true, response: body };
        }
        const failureCode = result === "insufficient_valid" ? "SCRIPT_VARIANT_COUNT_INSUFFICIENT" : result === "ai_request_refused" ? "AI_REQUEST_REFUSED" : "AI_OUTPUT_SCHEMA_INVALID";
        const failureStatus = failureCode === "SCRIPT_VARIANT_COUNT_INSUFFICIENT" ? 409 : 422;
        const failureTitle = failureCode === "SCRIPT_VARIANT_COUNT_INSUFFICIENT"
          ? "Script variant count insufficient"
          : failureCode === "AI_REQUEST_REFUSED"
            ? "AI request refused"
            : "AI output schema invalid";
        const failureDetail = failureCode === "SCRIPT_VARIANT_COUNT_INSUFFICIENT"
          ? "There are not enough valid scripts to compare."
          : failureCode === "AI_REQUEST_REFUSED"
            ? "The requested content could not be generated under the current policy."
            : "The AI result did not match the required structure.";
        return {
          ok: false,
          problem: {
            ...problem(failureCode, failureStatus, failureTitle, failureDetail),
            ...body
          }
        };
      },
      input.workspaceId
    );
  }

  async function selectScriptVariant(actor, input) {
    const validation = validateScriptSelectionInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const tournament = await tx.scriptTournament.findFirst({
          where: { id: input.tournamentId, workspaceId: input.workspaceId }
        });
        if (!tournament) {
          return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
        }
        if (tournament.status === "selected") {
          return { ok: false, problem: problem("SCRIPT_ALREADY_SELECTED", 409, "Script already selected", "This tournament already has a selected script.") };
        }
        if (input.optimisticTournamentVersion !== toIso(tournament.updatedAt)) {
          return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
        }
        if (tournament.status !== "ready_for_selection") {
          return { ok: false, problem: problem("SCRIPT_SELECTION_INVALID", 409, "Script selection invalid", "Select an evaluated, eligible script.") };
        }
        const variant = await tx.scriptVariant.findFirst({
          where: { id: input.variantId, workspaceId: input.workspaceId }
        });
        if (!variant || variant.tournamentId !== tournament.id) {
          return { ok: false, problem: problem("SCRIPT_SELECTION_INVALID", 409, "Script selection invalid", "Select an evaluated, eligible script.") };
        }
        if (variant.status !== "generated") {
          return { ok: false, problem: problem("SCRIPT_SELECTION_INVALID", 409, "Script selection invalid", "Select an evaluated, eligible script.") };
        }
        const evaluation = await tx.scriptEvaluation.findFirst({
          where: { variantId: variant.id, workspaceId: input.workspaceId }
        });
        if (!evaluation || evaluation.status !== "evaluated") {
          return { ok: false, problem: problem("SCRIPT_SELECTION_INVALID", 409, "Script selection invalid", "Select an evaluated, eligible script.") };
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const selectedScriptId = randomUUID();
        // Concurrency-safe claim: atomically advance the tournament from
        // ready_for_selection to selected. Two concurrent selections cannot
        // both win — the UPDATE locks the row, so the loser sees zero rows
        // updated and receives SCRIPT_ALREADY_SELECTED without writing a
        // selected_script row or risking a unique-constraint violation.
        const claimed = await tx.scriptTournament.updateMany({
          where: { id: tournament.id, workspaceId: input.workspaceId, status: "ready_for_selection" },
          data: { status: "selected" }
        });
        if (claimed.count === 0) {
          return { ok: false, problem: problem("SCRIPT_ALREADY_SELECTED", 409, "Script already selected", "This tournament already has a selected script.") };
        }
        const validVariants = await tx.scriptVariant.findMany({
          where: { tournamentId: tournament.id, workspaceId: input.workspaceId, status: "generated" }
        });
        const tournamentEvaluations = await tx.scriptEvaluation.findMany({
          where: { tournamentId: tournament.id, workspaceId: input.workspaceId }
        });
        const rank = computeVariantRank(validVariants, tournamentEvaluations, variant.id);
        const humanOverride = input.humanOverride === true;
        const selectedScript = selectedScriptRecord({
          selectedScriptId,
          workspaceId: input.workspaceId,
          tournamentId: tournament.id,
          variantId: variant.id,
          actorUserId: actor.userId,
          humanOverride,
          now: nowIso
        });
        await tx.selectedScript.create({ data: { id: selectedScript.id, ...prismaSelectedScript(selectedScript) } });
        const updatedTournament = await tx.scriptTournament.findUnique({ where: { id: tournament.id } });
        const outbox = selectedScriptOutboxEvent(input.workspaceId, tournament.id, selectedScript.id, rank, nowIso);
        await tx.outboxEvent.create({
          data: {
            id: outbox.id,
            workspaceId: outbox.workspaceId,
            eventType: outbox.eventType,
            aggregateType: outbox.aggregateType,
            aggregateId: outbox.aggregateId,
            payload: outbox.payload,
            status: outbox.status,
            publishedAt: now
          }
        });
        const audit = selectedScriptAudit(input.workspaceId, selectedScript.id, tournament.id, actor.userId, nowIso);
        await tx.auditEvent.create({
          data: {
            workspaceId: audit.workspaceId,
            actorUserId: audit.actorUserId,
            eventType: audit.eventType,
            targetType: audit.targetType,
            targetId: audit.targetId,
            reason: audit.reason
          }
        });
        return {
          ok: true,
          response: selectedScriptResponseBody(selectedScript, updatedTournament, variant, evaluation, [outbox], audit)
        };
      },
      input.workspaceId
    );
  }

  async function searchViralCandidates(actor, input) {
    const validation = validateViralCandidateSearchInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const providerResult = searchXpozCandidates(input, actor.userId);
    if (!providerResult.ok) {
      return {
        ok: false,
        problem: {
          ...problem("DISCOVERY_PROVIDER_UNAVAILABLE", 503, "Discovery provider unavailable", "Viral discovery is unavailable. Add a candidate manually or try later."),
          retryable: providerResult.retryable,
          providerResult: providerResult.providerResult,
          candidates: []
        }
      };
    }
    return withActor(
      actor,
      async (tx) => {
        const request = await tx.blueprintRequest.findFirst({
          where: { id: input.blueprintRequestId, workspaceId: input.workspaceId, path: "new_discovery" }
        });
        if (!request) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const requestId = randomUUID();
        const traceId = randomUUID();
        const retained = [];
        for (const [index, candidate] of providerResult.candidates.slice(0, normalizeLimit(input.limit)).entries()) {
          const sourceHash = candidateSourceHash(candidate);
          let stored = await tx.viralCandidate.findFirst({
            where: { workspaceId: input.workspaceId, blueprintRequestId: input.blueprintRequestId, sourceHash }
          });
          if (!stored) {
            stored = await tx.viralCandidate.create({
              data: {
                workspaceId: input.workspaceId,
                blueprintRequestId: input.blueprintRequestId,
                provider: candidate.provider,
                sourceIdentity: candidate.sourceIdentity,
                sourceUrl: candidate.sourceUrl,
                title: candidate.title,
                creatorHandle: candidate.creatorHandle,
                niche: input.niche.trim(),
                market: input.market.trim(),
                objectiveType: input.objectiveType.trim(),
                rank: index + 1,
                score: candidate.metrics.views + candidate.metrics.likes * 8 + candidate.metrics.comments * 20 + candidate.metrics.shares * 35,
                selectionState: "available",
                rightsWarnings: candidate.rightsWarnings,
                metadata: candidate.metadata,
                provenance: candidate.provenance,
                sourceHash
              }
            });
            await tx.metricSnapshot.create({
              data: {
                workspaceId: input.workspaceId,
                viralCandidateId: stored.id,
                provider: candidate.provider,
                observedAt: new Date(candidate.observedAt),
                metrics: candidate.metrics,
                sourceHash,
                immutable: true
              }
            });
          }
          retained.push(stored);
        }
        const job = await tx.job.create({
          data: {
            workspaceId: input.workspaceId,
            type: "viral_candidate_search",
            resourceClass: "CPU",
            status: "SUCCEEDED",
            inputHash: hashRequest({
              blueprintRequestId: input.blueprintRequestId,
              niche: input.niche,
              market: input.market,
              objectiveType: input.objectiveType,
              providerMode: input.providerMode
            }),
            input: { requestId, traceId, blueprintRequestId: input.blueprintRequestId },
            maxAttempts: 3
          }
        });
        await tx.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            eventType: "viral_candidate_search.completed",
            aggregateType: "BlueprintRequest",
            aggregateId: input.blueprintRequestId,
            payload: { requestId, traceId, resultCount: retained.length, providerResult: providerResult.providerResult },
            status: "PUBLISHED",
            publishedAt: new Date()
          }
        });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "viral.candidate_search.completed",
            targetType: "BlueprintRequest",
            targetId: input.blueprintRequestId,
            reason: providerResult.manualFallbackUsed ? "manual_fallback" : "provider_fixture"
          }
        });
        const metrics = await tx.metricSnapshot.findMany({
          where: { workspaceId: input.workspaceId, viralCandidateId: { in: retained.map((candidate) => candidate.id) } },
          orderBy: { createdAt: "asc" }
        });
        return {
          ok: true,
          response: {
            search: {
              id: job.id,
              workspaceId: input.workspaceId,
              blueprintRequestId: input.blueprintRequestId,
              provider: providerResult.provider,
              status: "ready",
              providerResult: providerResult.providerResult,
              manualFallbackUsed: providerResult.manualFallbackUsed,
              observedAt: metrics[0] ? publicMetricSnapshot(metrics[0]).observedAt : null
            },
            candidates: retained.map((candidate) => publicViralCandidate(candidate, metrics)),
            job: publicJob(job),
            audit: publicAudit(audit)
          }
        };
      },
      input.workspaceId
    );
  }

  async function extractViralCandidateBlueprint(actor, candidateId, input) {
    const validation = validateMediaAcquisitionInput(candidateId, input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const candidate = await tx.viralCandidate.findFirst({ where: { id: candidateId, workspaceId: input.workspaceId } });
        if (!candidate) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const now = new Date();
        const nowIso = now.toISOString();
        const blocked = buildBlockedAcquisition(candidate, input, actor.userId, nowIso);
        if (blocked) {
          const acquisition = await tx.mediaAcquisition.create({ data: prismaMediaAcquisition(blocked.acquisition) });
          let thumbnailBlueprint = null;
          if (blocked.thumbnailBlueprint) {
            thumbnailBlueprint = await tx.thumbnailBlueprint.create({ data: prismaThumbnailBlueprint(blocked.thumbnailBlueprint) });
          }
          return {
            ok: false,
            problem: {
              ...blocked.problem,
              acquisition: publicMediaAcquisition(acquisition),
              thumbnailBlueprint: thumbnailBlueprint ? publicThumbnailBlueprint(thumbnailBlueprint) : null
            }
          };
        }
        const requestId = randomUUID();
        const traceId = randomUUID();
        const artifactInput = analysisArtifact(input.workspaceId, candidate, nowIso);
        const artifact = await tx.artifact.create({ data: prismaArtifact(artifactInput) });
        const acquisition = await tx.mediaAcquisition.create({
          data: {
            workspaceId: input.workspaceId,
            viralCandidateId: candidate.id,
            artifactId: artifact.id,
            status: "media_acquired",
            retrievalPolicy: input.retrievalPolicy,
            acquisitionMode: input.acquisitionMode,
            rightsDecision: normalizeRightsDecision(input.rightsDecision, actor.userId),
            sourceHash: candidate.sourceHash,
            blockedReason: null
          }
        });
        const thumbnailInput = thumbnailBlueprintFor(candidate, acquisition, artifact, input.acquisitionMode, nowIso);
        const thumbnailBlueprint = await tx.thumbnailBlueprint.create({ data: prismaThumbnailBlueprint(thumbnailInput) });
        const job = await tx.job.create({
          data: {
            workspaceId: input.workspaceId,
            type: "media_acquire",
            resourceClass: "CPU",
            status: "SUCCEEDED",
            inputHash: hashRequest({ candidateId, expectedSourceHash: input.expectedSourceHash, acquisitionMode: input.acquisitionMode }),
            input: { requestId, traceId, viralCandidateId: candidate.id },
            outputArtifactId: artifact.id,
            maxAttempts: 3
          }
        });
        await tx.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            eventType: "media_acquisition.completed",
            aggregateType: "ViralCandidate",
            aggregateId: candidate.id,
            payload: { requestId, traceId, mediaAcquisitionId: acquisition.id, thumbnailBlueprintId: thumbnailBlueprint.id },
            status: "PUBLISHED",
            publishedAt: now
          }
        });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "media.acquisition.completed",
            targetType: "ViralCandidate",
            targetId: candidate.id,
            reason: "rights_authorised"
          }
        });
        return {
          ok: true,
          response: {
            acquisition: publicMediaAcquisition(acquisition),
            analysisArtifact: publicArtifact(artifact),
            thumbnailBlueprint: publicThumbnailBlueprint(thumbnailBlueprint),
            job: publicJob(job),
            audit: publicAudit(audit)
          }
        };
      },
      input.workspaceId
    );
  }

  async function createSceneBlueprint(actor, candidateId, input) {
    const validation = validateSceneBlueprintInput(candidateId, input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const candidate = await tx.viralCandidate.findFirst({ where: { id: candidateId, workspaceId: input.workspaceId } });
        const acquisition = await tx.mediaAcquisition.findFirst({ where: { id: input.mediaAcquisitionId, workspaceId: input.workspaceId } });
        const thumbnailBlueprint = await tx.thumbnailBlueprint.findFirst({ where: { id: input.thumbnailBlueprintId, workspaceId: input.workspaceId } });
        if (
          !candidate ||
          candidate.sourceHash !== input.expectedSourceHash ||
          !acquisition ||
          acquisition.viralCandidateId !== candidate.id ||
          acquisition.status !== "media_acquired" ||
          !thumbnailBlueprint ||
          thumbnailBlueprint.viralCandidateId !== candidate.id ||
          thumbnailBlueprint.mediaAcquisitionId !== acquisition.id ||
          thumbnailBlueprint.status !== "thumbnail_deciphered"
        ) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const requestId = randomUUID();
        const traceId = randomUUID();
        const stageSet = buildSceneStageSet(input.workspaceId, candidate, input, requestId, traceId, nowIso);
        const persistedArtifacts = [];
        for (const artifactInput of stageSet.artifacts) {
          persistedArtifacts.push(await tx.artifact.create({ data: prismaArtifact(artifactInput) }));
        }
        const persistedJobs = [];
        for (const jobInput of stageSet.jobs) {
          const stageArtifact = persistedArtifacts.find((artifact) => artifact.schemaVersion === jobInput.input.stageArtifactSchema);
          const job = await tx.job.create({
            data: {
              workspaceId: jobInput.workspaceId,
              type: jobInput.type,
              resourceClass: jobInput.resourceClass,
              status: jobInput.status,
              priority: jobInput.priority,
              inputHash: jobInput.inputHash,
              input: jobInput.input,
              outputArtifactId: stageArtifact?.id ?? null,
              lastErrorCode: jobInput.lastErrorCode ?? null,
              maxAttempts: jobInput.maxAttempts
            }
          });
          await tx.jobEvent.create({
            data: {
              workspaceId: job.workspaceId,
              jobId: job.id,
              eventType: "job.created",
              payload: { requestId, traceId }
            }
          });
          await tx.jobEvent.create({
            data: {
              workspaceId: job.workspaceId,
              jobId: job.id,
              eventType: job.status === "SUCCEEDED" ? "job.succeeded" : "job.failed",
              payload: { errorCode: job.lastErrorCode ?? null }
            }
          });
          persistedJobs.push(job);
        }
        const persistedDependencies = [];
        for (const dependencyInput of stageSet.dependencies) {
          const parent = persistedJobs.find((job) => job.type === dependencyInput.parentType);
          const child = persistedJobs.find((job) => job.type === dependencyInput.childType);
          const dependency = await tx.jobDependency.create({ data: { parentJobId: parent.id, childJobId: child.id } });
          persistedDependencies.push({ ...dependency, parentType: parent.type, childType: child.type });
        }
        const stageSetWithPersisted = { jobs: persistedJobs, artifacts: persistedArtifacts, dependencies: persistedDependencies, stageStates: stageSet.stageStates };
        const videoBlueprintInput = videoBlueprintFor(candidate, acquisition, thumbnailBlueprint, stageSetWithPersisted, input.simulatorMode, nowIso);
        const videoBlueprint = await tx.videoBlueprint.create({ data: prismaVideoBlueprint(videoBlueprintInput) });
        const sceneInputs = sceneSetFor(videoBlueprint, input.simulatorMode, nowIso);
        const scenes = [];
        for (const sceneInput of sceneInputs) {
          scenes.push(await tx.blueprintScene.create({ data: prismaBlueprintScene(sceneInput) }));
        }
        const outbox = await tx.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            eventType: "video_blueprint.stages_completed",
            aggregateType: "VideoBlueprint",
            aggregateId: videoBlueprint.id,
            payload: { requestId, traceId, videoBlueprintId: videoBlueprint.id, stageJobIds: persistedJobs.map((job) => job.id) },
            status: "PUBLISHED",
            publishedAt: now
          }
        });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "video.blueprint.stages_completed",
            targetType: "VideoBlueprint",
            targetId: videoBlueprint.id,
            reason: input.simulatorMode
          }
        });
        const response = sceneBlueprintResponse(videoBlueprint, scenes, stageSetWithPersisted, outbox, audit);
        const failure = stageFailureFor(input.simulatorMode, response);
        if (failure) {
          return { ok: false, problem: failure };
        }
        return { ok: true, response };
      },
      input.workspaceId
    );
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
          payload: { attemptId: attempt.id, requestId: job.input.requestId, traceId: job.input.traceId }
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
          payload: { attemptId: attempt.id, requestId: job.input.requestId, traceId: job.input.traceId }
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
      if (job.status === "SUCCEEDED" && job.type === "brand_crawl") {
        const candidates = await tx.brandCandidate.findMany({
          where: { workspaceId: job.workspaceId, crawlRunId: job.input.brandCrawlRunId },
          orderBy: { createdAt: "asc" }
        });
        return { ok: true, response: { job: publicJob(job), candidates: candidates.map(publicBrandCandidate) } };
      }
      if (job.status === "SUCCEEDED" && existingArtifact) {
        return { ok: true, response: { job: publicJob(job), artifact: publicArtifact(existingArtifact) } };
      }
      const attempt = await tx.jobAttempt.findFirst({
        where: { jobId, leaseToken: input.leaseToken, status: { in: ["LEASED", "RUNNING"] } }
      });
      if (!attempt) {
        return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
      }
      if (job.type === "brand_crawl") {
        return completeBrandCrawlJob(tx, job, attempt, input);
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
            payload: { artifactId: artifact.id, sha256: artifact.sha256, requestId: job.input.requestId, traceId: job.input.traceId }
          },
          {
            workspaceId: job.workspaceId,
            jobId: job.id,
            eventType: "job.completed",
            payload: { attemptId: updatedAttempt.id, requestId: job.input.requestId, traceId: job.input.traceId }
          }
        ]
      });
      return { ok: true, response: { job: publicJob(updatedJob), artifact: publicArtifact(artifact) } };
    });
  }

  async function completeBrandCrawlJob(tx, job, attempt, input) {
    if (input.workspaceId !== job.workspaceId || input.schemaVersion !== "brand.extraction.output.v1") {
      return { ok: false, problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "The generated media failed validation and was not accepted.") };
    }
    const crawlRun = await tx.brandCrawlRun.findFirst({ where: { id: job.input.brandCrawlRunId, workspaceId: job.workspaceId } });
    if (!crawlRun) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    const extracted = buildBrandExtractionCandidates({
      crawlRunId: crawlRun.id,
      workspaceId: job.workspaceId,
      scrape: input.scrape
    });
    if (!extracted.ok) {
      await tx.jobEvent.create({
        data: {
          workspaceId: job.workspaceId,
          jobId: job.id,
          eventType: "brand.extraction.rejected",
          payload: { reason: extracted.reason, requestId: job.input.requestId, traceId: job.input.traceId }
        }
      });
      return { ok: false, problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "The generated media failed validation and was not accepted.") };
    }
    const retained = [];
    for (const candidate of extracted.candidates) {
      retained.push(
        await tx.brandCandidate.create({
          data: {
            workspaceId: job.workspaceId,
            crawlRunId: crawlRun.id,
            fieldType: candidate.fieldType,
            value: candidate.value,
            confidence: candidate.confidence,
            decision: candidate.decision,
            extractionState: candidate.extractionState,
            sourceEvidence: candidate.sourceEvidence,
            conflict: candidate.conflict,
            sourceFingerprint: candidate.sourceFingerprint
          }
        })
      );
    }
    const updatedAttempt = await tx.jobAttempt.update({
      where: { id: attempt.id },
      data: { status: "SUCCEEDED", completedAt: new Date() }
    });
    void updatedAttempt;
    const updatedJob = await tx.job.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED" }
    });
    await tx.brandCrawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "SUCCEEDED" }
    });
    const events = [
      ...(extracted.promptInputIsolated
        ? [
            {
              workspaceId: job.workspaceId,
              jobId: job.id,
              eventType: "brand.extraction.prompt_input_isolated",
              payload: { requestId: job.input.requestId, traceId: job.input.traceId }
            }
          ]
        : []),
      {
        workspaceId: job.workspaceId,
        jobId: job.id,
        eventType: "brand.candidates.extracted",
        payload: { candidateCount: retained.length, requestId: job.input.requestId, traceId: job.input.traceId }
      },
      {
        workspaceId: job.workspaceId,
        jobId: job.id,
        eventType: "job.completed",
        payload: { attemptId: attempt.id, requestId: job.input.requestId, traceId: job.input.traceId }
      }
    ];
    await tx.jobEvent.createMany({ data: events });
    return { ok: true, response: { job: publicJob(updatedJob), candidates: retained.map(publicBrandCandidate) } };
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
          data: { workspaceId: job.workspaceId, jobId, eventType: "job.retry_scheduled", payload: { attemptId: attempt.id, errorCode, requestId: job.input.requestId, traceId: job.input.traceId } }
        });
        updatedJob = await tx.job.update({ where: { id: jobId }, data: { status: "QUEUED", lastErrorCode: errorCode } });
        await tx.jobEvent.create({
          data: { workspaceId: job.workspaceId, jobId, eventType: "job.queued", payload: { reason: "retry", requestId: job.input.requestId, traceId: job.input.traceId } }
        });
      } else {
        updatedJob = await tx.job.update({ where: { id: jobId }, data: { status: "FAILED", lastErrorCode: errorCode } });
        await tx.jobEvent.createMany({
          data: [
            { workspaceId: job.workspaceId, jobId, eventType: "job.failed", payload: { attemptId: attempt.id, errorCode, requestId: job.input.requestId, traceId: job.input.traceId } },
            { workspaceId: job.workspaceId, jobId, eventType: "job.dead_lettered", payload: { attemptId: attempt.id, errorCode, requestId: job.input.requestId, traceId: job.input.traceId } }
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
            { workspaceId: job.workspaceId, jobId: job.id, eventType: "job.lease_expired", payload: { attemptId: attempt.id, requestId: job.input.requestId, traceId: job.input.traceId } },
            { workspaceId: job.workspaceId, jobId: job.id, eventType: "job.queued", payload: { reason: "lease_expired", requestId: job.input.requestId, traceId: job.input.traceId } }
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
            payload: { outboxEventId: event.id, queue: job.resourceClass, requestId: job.input.requestId, traceId: job.input.traceId }
          }
        });
        relayed.push(publicOutboxEvent(updated));
      }
      return { ok: true, response: { relayed } };
    });
  }

  async function setWorkspaceCapability(actor, workspaceId, input) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateCapabilityInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const capability = await tx.workspaceCapability.upsert({
          where: { workspaceId_capability: { workspaceId, capability: input.capability } },
          create: {
            workspaceId,
            capability: input.capability,
            enabled: input.enabled,
            disabledReason: input.enabled ? null : input.reason.trim(),
            updatedByUserId: actor.userId
          },
          update: {
            enabled: input.enabled,
            disabledReason: input.enabled ? null : input.reason.trim(),
            updatedByUserId: actor.userId
          }
        });
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: input.enabled ? "capability.enabled" : "capability.disabled",
            targetType: "WorkspaceCapability",
            targetId: capability.id,
            reason: capability.disabledReason
          }
        });
        return { ok: true, response: { capability: publicWorkspaceCapability(capability) } };
      },
      workspaceId
    );
  }

  async function isWorkspaceCapabilityEnabled(workspaceId, capability) {
    const record = await prisma.workspaceCapability.findUnique({
      where: { workspaceId_capability: { workspaceId, capability } }
    });
    return record?.enabled !== false;
  }

  async function getJobTraceForActor(actor, jobId) {
    return withActor(actor, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId } });
      if (!job) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      const [outbox, attempts, events, artifactsForJob] = await Promise.all([
        tx.outboxEvent.findMany({ where: { aggregateId: job.id }, orderBy: { createdAt: "asc" } }),
        tx.jobAttempt.findMany({ where: { jobId: job.id }, orderBy: { attemptNumber: "asc" } }),
        tx.jobEvent.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "asc" } }),
        tx.artifact.findMany({ where: { workspaceId: job.workspaceId, producer: `job:${job.id}` }, orderBy: { createdAt: "asc" } })
      ]);
      return { ok: true, response: { trace: publicJobTrace(job, outbox, attempts, events, artifactsForJob) } };
    });
  }

  async function getWorkspaceOperationalMetrics(actor, workspaceId) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return withActor(
      actor,
      async (tx) => {
        const [jobsForWorkspace, attempts, artifactsForWorkspace, events] = await Promise.all([
          tx.job.findMany({ where: { workspaceId } }),
          tx.jobAttempt.findMany({ where: { workspaceId } }),
          tx.artifact.findMany({ where: { workspaceId } }),
          tx.jobEvent.findMany({ where: { workspaceId } })
        ]);
        return { ok: true, response: { metrics: operationalMetrics(workspaceId, jobsForWorkspace, attempts, artifactsForWorkspace, events) } };
      },
      workspaceId
    );
  }

  async function recoverJob(actor, jobId, input) {
    if (input.action !== "retry_dead_letter" || typeof input.reason !== "string" || input.reason.trim().length === 0) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    return prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      if (job.status !== "FAILED" || job.outputArtifactId) {
        return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", "This item changed after you opened it. Review the latest version.") };
      }
      await setActorContext(tx, actor.userId, job.workspaceId);
      const updated = await tx.job.update({ where: { id: jobId }, data: { status: "QUEUED", nextRunAt: new Date() } });
      await tx.jobEvent.createMany({
        data: [
          { workspaceId: job.workspaceId, jobId, eventType: "job.recovery_requested", payload: { reason: input.reason.trim(), requestId: job.input.requestId, traceId: job.input.traceId } },
          { workspaceId: job.workspaceId, jobId, eventType: "job.queued", payload: { reason: "admin_recovery", requestId: job.input.requestId, traceId: job.input.traceId } }
        ]
      });
      return { ok: true, response: { job: publicJob(updated) } };
    });
  }

  async function createServiceCredential(actor, workspaceId, input) {
    const validation = validateServiceCredentialInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const credential = await tx.serviceCredential.create({
          data: {
            workspaceId,
            provider: input.provider,
            purpose: input.purpose,
            environment: input.environment,
            secretRef: input.secretRef,
            rotationStatus: input.rotationStatus
          }
        });
        return { ok: true, response: { credential: publicServiceCredential(credential) } };
      },
      workspaceId
    );
  }

  async function setSimulatorMode(actor, workspaceId, input) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateSimulatorModeInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return {
      ok: true,
      response: {
        simulator: {
          workspaceId,
          boundary: input.boundary,
          mode: input.mode,
          updatedByUserId: actor.userId,
          updatedAt: new Date().toISOString()
        }
      }
    };
  }

  async function recordRestoreDrill(actor, workspaceId, input) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    return withActor(
      actor,
      async (tx) => {
        const artifact = await tx.artifact.findFirst({ where: { id: input.artifactId, workspaceId } });
        if (!artifact) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "restore.drill_recorded",
            targetType: "Artifact",
            targetId: artifact.id,
            reason: input.reason ?? null
          }
        });
        return {
          ok: true,
          response: {
            restore: {
              workspaceId,
              rlsPreserved: true,
              artifactReferencesChecked: 1,
              artifactId: artifact.id,
              reason: input.reason ?? null,
              recordedAt: new Date().toISOString()
            }
          }
        };
      },
      workspaceId
    );
  }

  async function runRedactionScan(actor, workspaceId, input) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (typeof input.sample !== "string") {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    return { ok: true, response: { scan: redactionScan(input.sample) } };
  }

  return {
    createWorkspace,
    listWorkspaces,
    getWorkspaceForActor,
    setWorkspaceCapability,
    getJobTraceForActor,
    getWorkspaceOperationalMetrics,
    recoverJob,
    createServiceCredential,
    setSimulatorMode,
    recordRestoreDrill,
    runRedactionScan,
    runIdempotent,
    initiateArtifactUpload,
    completeArtifactUpload,
    createArtifactDownload,
    createBrandCrawlRun,
    approveBrandProfile,
    createGenerationEstimate,
    confirmGenerationEstimate,
    getGenerationJob,
    submitGenerationJob,
    reconcileGenerationJob,
    cancelGenerationJob,
    processHeygenCallback,
    settleGenerationJob,
    listBlueprints,
    seedBlueprintLibraryEntry,
    createBlueprintRequest,
    createReadyBlueprint,
    createScriptTournament,
    selectScriptVariant,
    searchViralCandidates,
    extractViralCandidateBlueprint,
    createSceneBlueprint,
    startSimulatedMediaProcessing,
    getJobForActor,
    listJobEventsForActor,
    listBrandCandidates,
    listDeadLetterJobs,
    claimJob,
    heartbeatJob,
    completeJob,
    failJob,
    expireJobLeases,
    relayOutbox,
    listAvatars,
    createCreditPurchase,
    processPaymentCallback,
    listWalletLedger,
    createCreditAdjustment,
    disconnect: () => prisma.$disconnect()
  };
}

const supportedContentTypes = new Set(["image/png", "image/jpeg", "video/mp4"]);
const supportedWorkspaceCapabilities = new Set(["media_processing"]);
const supportedCredentialRotationStatuses = new Set(["ACTIVE", "ROTATION_DUE", "REVOKED"]);
const supportedSimulatorBoundaries = new Set(["provider", "payment", "publishing", "worker"]);
const supportedSimulatorModes = new Set(["success", "timeout", "duplicate", "malformed", "bad_signature"]);
const brandRuleTypes = new Set([
  "required_phrase",
  "prohibited_phrase",
  "required_disclosure",
  "prohibited_claim",
  "visual_required",
  "visual_prohibited",
  "competitor_reference",
  "channel_restriction",
  "avatar_restriction"
]);

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

function validateCapabilityInput(input) {
  if (
    typeof input.capability !== "string" ||
    !supportedWorkspaceCapabilities.has(input.capability) ||
    typeof input.enabled !== "boolean" ||
    (input.reason !== undefined && (typeof input.reason !== "string" || input.reason.length > 500))
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.enabled === false && (!input.reason || input.reason.trim().length === 0)) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

function validateServiceCredentialInput(input) {
  if (
    Object.hasOwn(input, "secretValue") ||
    Object.hasOwn(input, "apiKey") ||
    Object.hasOwn(input, "plaintext")
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (
    typeof input.provider !== "string" ||
    input.provider.trim().length === 0 ||
    typeof input.purpose !== "string" ||
    input.purpose.trim().length === 0 ||
    typeof input.environment !== "string" ||
    input.environment.trim().length === 0 ||
    typeof input.secretRef !== "string" ||
    !input.secretRef.startsWith("secret-manager://") ||
    !supportedCredentialRotationStatuses.has(input.rotationStatus)
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

function validateSimulatorModeInput(input) {
  if (!supportedSimulatorBoundaries.has(input.boundary) || !supportedSimulatorModes.has(input.mode)) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

async function validateBrandCrawlRunInput(input, findArtifact) {
  if (
    typeof input.workspaceId !== "string" ||
    typeof input.websiteUrl !== "string" ||
    input.websiteUrl.trim().length === 0
  ) {
    return { problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
  }
  if (input.rightsAcknowledged !== true) {
    return {
      problem: problem(
        "SOURCE_RIGHTS_REQUIRED",
        409,
        "Source rights required",
        "Acknowledge rights before using brand source material."
      )
    };
  }
  const normalized = normalizeCrawlUrl(input.websiteUrl);
  if (normalized.problem) {
    return normalized;
  }
  const crawlScope = normalizeCrawlScope(input.crawlScope);
  if (crawlScope.problem) {
    return crawlScope;
  }
  const assets = Array.isArray(input.assets) ? input.assets : [];
  const validatedAssets = [];
  for (const asset of assets) {
    if (
      !asset ||
      typeof asset.artifactId !== "string" ||
      typeof asset.rightsBasis !== "string" ||
      asset.rightsBasis.trim().length === 0 ||
      typeof asset.permittedUse !== "string" ||
      asset.permittedUse.trim().length === 0
    ) {
      return {
        problem: problem(
          "SOURCE_RIGHTS_REQUIRED",
          409,
          "Source rights required",
          "Each attached brand asset needs retained rights basis and permitted use."
        )
      };
    }
    const artifact = await findArtifact(asset.artifactId);
    if (!artifact || artifact.workspaceId !== input.workspaceId || artifact.status !== "CLEAN") {
      return {
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    validatedAssets.push(asset);
  }
  return { normalizedUrl: normalized.normalizedUrl, crawlScope: crawlScope.crawlScope, assets: validatedAssets };
}

function normalizeCrawlScope(scope) {
  const maxPages = scope?.maxPages ?? 5;
  const permittedPathPrefixes = scope?.permittedPathPrefixes ?? ["/"];
  if (
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 50 ||
    !Array.isArray(permittedPathPrefixes) ||
    permittedPathPrefixes.length === 0 ||
    permittedPathPrefixes.some((prefix) => typeof prefix !== "string" || !prefix.startsWith("/"))
  ) {
    return { problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
  }
  return {
    crawlScope: {
      maxPages,
      permittedPathPrefixes: permittedPathPrefixes.map((prefix) => collapsePath(prefix))
    }
  };
}

function normalizeCrawlUrl(value) {
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { problem: problem("CRAWL_URL_INVALID", 422, "Crawl URL invalid", "Enter a valid public website URL.") };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { problem: problem("CRAWL_URL_INVALID", 422, "Crawl URL invalid", "Enter a valid public website URL.") };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (isBlockedCrawlHost(hostname)) {
    return { problem: problem("CRAWL_SSRF_BLOCKED", 422, "Crawl URL blocked", "Use a public brand website URL.") };
  }
  parsed.hostname = hostname;
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = collapsePath(parsed.pathname || "/");
  if (!parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname}/`;
  }
  return { normalizedUrl: parsed.toString() };
}

function collapsePath(pathname) {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  return collapsed.length === 0 ? "/" : collapsed;
}

function isBlockedCrawlHost(hostname) {
  if (["localhost", "metadata.google.internal"].includes(hostname) || hostname.endsWith(".localhost")) {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const [first, second] = hostname.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  return hostname === "::1" || hostname.startsWith("fe80:");
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

function publicBrandCrawlRun(crawlRun) {
  return {
    id: crawlRun.id,
    workspaceId: crawlRun.workspaceId,
    sourceUrl: crawlRun.sourceUrl,
    normalizedUrl: crawlRun.normalizedUrl,
    status: crawlRun.status,
    rightsAcknowledged: crawlRun.rightsAcknowledged,
    crawlScope: crawlRun.crawlScope,
    robotsPolicy: crawlRun.robotsPolicy ?? null,
    jobId: crawlRun.jobId ?? null,
    createdAt: toIso(crawlRun.createdAt),
    updatedAt: toIso(crawlRun.updatedAt)
  };
}

function publicBrandAsset(asset) {
  return {
    id: asset.id,
    workspaceId: asset.workspaceId,
    crawlRunId: asset.crawlRunId,
    artifactId: asset.artifactId,
    rightsBasis: asset.rightsBasis,
    permittedUse: asset.permittedUse,
    status: asset.status,
    createdAt: toIso(asset.createdAt),
    updatedAt: toIso(asset.updatedAt)
  };
}

function publicBrandCandidate(candidate) {
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    crawlRunId: candidate.crawlRunId,
    fieldType: candidate.fieldType,
    value: candidate.value,
    confidence: Number(candidate.confidence),
    decision: candidate.decision,
    extractionState: candidate.extractionState,
    sourceEvidence: candidate.sourceEvidence,
    conflict: candidate.conflict,
    sourceFingerprint: candidate.sourceFingerprint,
    createdAt: toIso(candidate.createdAt),
    updatedAt: toIso(candidate.updatedAt)
  };
}

function publicBrandProfile(profile) {
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    brandId: profile.brandId,
    crawlRunId: profile.crawlRunId,
    schemaVersion: profile.schemaVersion,
    version: profile.version,
    status: profile.status,
    active: profile.active,
    profile: profile.profile,
    sourceSummary: profile.sourceSummary,
    approvedByUserId: profile.approvedByUserId,
    approvedAt: toIso(profile.approvedAt),
    createdAt: toIso(profile.createdAt),
    updatedAt: toIso(profile.updatedAt)
  };
}

function publicBrandApproval(approval) {
  return {
    id: approval.id,
    workspaceId: approval.workspaceId,
    brandProfileId: approval.brandProfileId,
    brandId: approval.brandId,
    actorUserId: approval.actorUserId,
    decision: approval.decision,
    reason: approval.reason ?? null,
    createdAt: toIso(approval.createdAt)
  };
}

function publicBrandRule(rule) {
  return {
    id: rule.id,
    workspaceId: rule.workspaceId,
    brandProfileId: rule.brandProfileId,
    brandId: rule.brandId,
    type: rule.type,
    value: rule.value,
    severity: rule.severity,
    rationale: rule.rationale,
    status: rule.status,
    createdAt: toIso(rule.createdAt),
    updatedAt: toIso(rule.updatedAt)
  };
}

function publicGenerationEstimate(estimate) {
  return {
    id: estimate.id,
    workspaceId: estimate.workspaceId,
    brandProfileId: estimate.brandProfileId,
    status: estimate.status,
    provider: estimate.provider,
    priceVersion: estimate.priceVersion,
    maximumAuthorizedMinor: Number(estimate.maximumAuthorizedMinor),
    currency: estimate.currency,
    selectedScriptId: estimate.selectedScriptId,
    avatarProfileId: estimate.avatarProfileId,
    // V0-G3: version and expiry are returned so the client can present staleness
    // and echo the version back on confirmation. The input hash is a server-side
    // validation secret and is never exposed.
    version: Number(estimate.version),
    durationSeconds: Number(estimate.durationSeconds),
    expiresAt: toIso(estimate.expiresAt),
    confirmedAt: toIso(estimate.confirmedAt),
    createdAt: toIso(estimate.createdAt),
    updatedAt: toIso(estimate.updatedAt)
  };
}

function publicGenerationJob(job) {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    estimateId: job.estimateId,
    brandProfileId: job.brandProfileId,
    selectedScriptId: job.selectedScriptId ?? null,
    avatarProfileId: job.avatarProfileId ?? null,
    status: String(job.status),
    idempotencyKey: job.idempotencyKey,
    version: Number(job.version),
    durationSeconds: Number(job.durationSeconds),
    maximumAuthorizedMinor: Number(job.maximumAuthorizedMinor),
    currency: job.currency,
    priceVersion: job.priceVersion,
    createdAt: toIso(job.createdAt),
    updatedAt: toIso(job.updatedAt)
  };
}

function publicCreditReservation(reservation) {
  return {
    id: reservation.id,
    workspaceId: reservation.workspaceId,
    generationJobId: reservation.generationJobId,
    walletId: reservation.walletId,
    status: String(reservation.status).toLowerCase(),
    amountMinor: Number(reservation.amountMinor),
    currency: reservation.currency,
    idempotencyKey: reservation.idempotencyKey,
    expiresAt: toIso(reservation.expiresAt),
    createdAt: toIso(reservation.createdAt),
    updatedAt: toIso(reservation.updatedAt)
  };
}

function publicProviderPriceVersion(version) {
  return {
    id: version.id,
    provider: version.provider,
    priceVersion: version.priceVersion,
    currency: version.currency,
    rateMinorPerSecond: Number(version.rateMinorPerSecond),
    source: version.source,
    validFrom: toIso(version.validFrom),
    validUntil: toIso(version.validUntil)
  };
}

function publicBlueprintLibraryEntry(entry, profile) {
  const compatible = isBlueprintCompatible(entry, profile, entry.compatibility.objectiveTypes?.[0] ?? "");
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    brandProfileId: entry.brandProfileId,
    title: entry.title,
    status: entry.status,
    compatibility: {
      ...entry.compatibility,
      compatible
    },
    createdByUserId: entry.createdByUserId,
    createdAt: toIso(entry.createdAt),
    updatedAt: toIso(entry.updatedAt)
  };
}

function publicBlueprintRequest(request) {
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    path: request.path,
    brandProfileId: request.brandProfileId,
    brandProfileVersion: request.brandProfileVersion,
    blueprintLibraryEntryId: request.blueprintLibraryEntryId ?? null,
    objectiveType: request.objectiveType,
    objective: request.objective,
    status: request.status,
    createdByUserId: request.createdByUserId,
    createdAt: toIso(request.createdAt),
    updatedAt: toIso(request.updatedAt)
  };
}

function publicReadyBlueprint(entry, request) {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    brandProfileId: entry.brandProfileId,
    brandProfileVersion: request.brandProfileVersion,
    title: entry.title,
    status: entry.status,
    compatibility: entry.compatibility,
    createdByUserId: entry.createdByUserId,
    createdAt: toIso(entry.createdAt),
    updatedAt: toIso(entry.updatedAt)
  };
}

function publicFormulaDerivation(formula) {
  return {
    id: formula.id,
    workspaceId: formula.workspaceId,
    blueprintLibraryEntryId: formula.blueprintLibraryEntryId,
    blueprintRequestId: formula.blueprintRequestId,
    status: formula.status,
    formulaVersion: formula.formulaVersion,
    slots: formula.slots,
    replacementInstructions: formula.replacementInstructions,
    lineage: formula.lineage,
    createdAt: toIso(formula.createdAt),
    updatedAt: toIso(formula.updatedAt)
  };
}

function publicDirectorPrompt(prompt) {
  return {
    id: prompt.id,
    workspaceId: prompt.workspaceId,
    blueprintLibraryEntryId: prompt.blueprintLibraryEntryId,
    formulaDerivationId: prompt.formulaDerivationId,
    blueprintRequestId: prompt.blueprintRequestId,
    status: prompt.status,
    promptVersion: prompt.promptVersion,
    replacementSlots: prompt.replacementSlots,
    prompt: prompt.prompt,
    lineage: prompt.lineage,
    createdAt: toIso(prompt.createdAt),
    updatedAt: toIso(prompt.updatedAt)
  };
}

function publicViralCandidate(candidate, metricStoreOrList) {
  const metrics = Array.isArray(metricStoreOrList)
    ? metricStoreOrList.filter((snapshot) => snapshot.viralCandidateId === candidate.id)
    : [...metricStoreOrList.values()].filter((snapshot) => snapshot.viralCandidateId === candidate.id);
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    blueprintRequestId: candidate.blueprintRequestId,
    provider: candidate.provider,
    sourceIdentity: candidate.sourceIdentity,
    sourceUrl: candidate.sourceUrl,
    title: candidate.title,
    creatorHandle: candidate.creatorHandle,
    niche: candidate.niche,
    market: candidate.market,
    objectiveType: candidate.objectiveType,
    rank: candidate.rank,
    score: Number(candidate.score),
    selectionState: candidate.selectionState,
    rightsWarnings: candidate.rightsWarnings,
    metadata: candidate.metadata,
    provenance: candidate.provenance,
    sourceHash: candidate.sourceHash,
    metrics: metrics.map(publicMetricSnapshot),
    createdAt: toIso(candidate.createdAt),
    updatedAt: toIso(candidate.updatedAt)
  };
}

function publicMetricSnapshot(snapshot) {
  return {
    id: snapshot.id,
    workspaceId: snapshot.workspaceId,
    viralCandidateId: snapshot.viralCandidateId,
    provider: snapshot.provider,
    observedAt: toIso(snapshot.observedAt),
    metrics: snapshot.metrics,
    sourceHash: snapshot.sourceHash,
    immutable: snapshot.immutable,
    createdAt: toIso(snapshot.createdAt)
  };
}

function publicMediaAcquisition(acquisition) {
  return {
    id: acquisition.id,
    workspaceId: acquisition.workspaceId,
    viralCandidateId: acquisition.viralCandidateId,
    artifactId: acquisition.artifactId ?? null,
    status: acquisition.status,
    retrievalPolicy: acquisition.retrievalPolicy,
    acquisitionMode: acquisition.acquisitionMode,
    rightsDecision: acquisition.rightsDecision,
    sourceHash: acquisition.sourceHash,
    blockedReason: acquisition.blockedReason ?? null,
    createdAt: toIso(acquisition.createdAt),
    updatedAt: toIso(acquisition.updatedAt)
  };
}

function publicThumbnailBlueprint(blueprint) {
  return {
    id: blueprint.id,
    workspaceId: blueprint.workspaceId,
    viralCandidateId: blueprint.viralCandidateId,
    mediaAcquisitionId: blueprint.mediaAcquisitionId,
    artifactId: blueprint.artifactId ?? null,
    status: blueprint.status,
    ocr: blueprint.ocr,
    composition: blueprint.composition,
    hookHypothesis: blueprint.hookHypothesis,
    directorGuidance: blueprint.directorGuidance,
    quality: blueprint.quality,
    sourceHash: blueprint.sourceHash,
    createdAt: toIso(blueprint.createdAt),
    updatedAt: toIso(blueprint.updatedAt)
  };
}

function publicVideoBlueprint(blueprint) {
  return {
    id: blueprint.id,
    workspaceId: blueprint.workspaceId,
    viralCandidateId: blueprint.viralCandidateId,
    mediaAcquisitionId: blueprint.mediaAcquisitionId,
    thumbnailBlueprintId: blueprint.thumbnailBlueprintId,
    status: blueprint.status,
    durationMs: blueprint.durationMs,
    stageStates: blueprint.stageStates,
    stageArtifactIds: blueprint.stageArtifactIds,
    sourceHash: blueprint.sourceHash,
    createdAt: toIso(blueprint.createdAt),
    updatedAt: toIso(blueprint.updatedAt)
  };
}

function publicBlueprintScene(scene) {
  return {
    id: scene.id,
    workspaceId: scene.workspaceId,
    videoBlueprintId: scene.videoBlueprintId,
    index: scene.index,
    startMs: scene.startMs,
    endMs: scene.endMs,
    formulaSlot: scene.formulaSlot,
    shot: scene.shot,
    motion: scene.motion,
    transcript: scene.transcript,
    ocr: scene.ocr,
    onScreenText: scene.ocr?.text ?? [],
    replacements: scene.replacements,
    createdAt: toIso(scene.createdAt),
    updatedAt: toIso(scene.updatedAt)
  };
}

function publicJobDependency(dependency) {
  return {
    id: dependency.id,
    parentJobId: dependency.parentJobId,
    childJobId: dependency.childJobId,
    parentType: dependency.parentType,
    childType: dependency.childType,
    createdAt: toIso(dependency.createdAt)
  };
}

function sceneBlueprintResponse(videoBlueprint, scenes, stageSet, outbox, audit) {
  return {
    videoBlueprint: publicVideoBlueprint(videoBlueprint),
    scenes: scenes.map(publicBlueprintScene),
    stageJobs: stageSet.jobs.map(publicJob),
    stageArtifacts: stageSet.artifacts.map(publicArtifact),
    dependencies: stageSet.dependencies.map(publicJobDependency),
    stageStates: stageSet.stageStates,
    outboxEvent: publicOutboxEvent(outbox),
    audit: publicAudit(audit)
  };
}

function stageFailureFor(simulatorMode, response) {
  if (simulatorMode === "empty_transcript") {
    return {
      ...problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages."),
      videoBlueprint: response.videoBlueprint,
      stageStates: response.stageStates,
      stageJobs: response.stageJobs
    };
  }
  if (simulatorMode === "malformed_model_json") {
    return {
      ...problem("AI_OUTPUT_SCHEMA_INVALID", 422, "AI output schema invalid", "The AI result did not match the required structure."),
      videoBlueprint: response.videoBlueprint,
      stageStates: response.stageStates,
      stageJobs: response.stageJobs
    };
  }
  if (simulatorMode === "worker_timeout" || simulatorMode === "worker_oom") {
    return {
      ...problem("BLUEPRINT_STAGE_FAILED", 422, "Blueprint stage failed", "A blueprint stage failed. Review the stage evidence before retrying."),
      videoBlueprint: response.videoBlueprint,
      stageStates: response.stageStates,
      stageJobs: response.stageJobs
    };
  }
  return null;
}

function isActiveApprovedProfile(profile, workspaceId) {
  return profile?.workspaceId === workspaceId && profile.status === "approved" && profile.active === true;
}

// V0-G1 consent-safe avatar selection. The deterministic consent simulator
// materializes one brand-bound catalog per approved brand profile: an eligible
// generic avatar, an eligible brand ambassador, and real-person avatars that are
// expired, revoked, missing consent evidence or pending service fulfillment.
// Eligibility is derived from consent fields and fulfillment state; consent
// evidence never reaches the public response or analytics.
function buildAvatarCatalogSeed(workspaceId, brandProfileId, nowMs) {
  const day = 24 * 60 * 60 * 1000;
  const createdAt = new Date(nowMs).toISOString();
  const profileId = (suffix) => deterministicUuid(`${workspaceId}:${brandProfileId}:${suffix}`);
  const consentId = (avatarId) => deterministicUuid(`${avatarId}:consent`);
  const consent = (avatarId, evidenceRef, likenessScope, voiceScope, expiresAtMs, revokedAtMs) => ({
    id: consentId(avatarId),
    workspaceId,
    avatarProfileId: avatarId,
    evidenceRef,
    likenessScope,
    voiceScope,
    expiresAt: expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(),
    revokedAt: revokedAtMs === null ? null : new Date(revokedAtMs).toISOString(),
    revokedByUserId: null,
    createdAt,
    updatedAt: createdAt
  });
  const profile = (suffix, kind, displayName, likenessScope, voiceScope, serviceFulfillmentState) => ({
    id: profileId(suffix),
    workspaceId,
    brandProfileId,
    kind,
    displayName,
    likenessScope,
    voiceScope,
    serviceFulfillmentState,
    createdAt,
    updatedAt: createdAt
  });

  const generic = profile("generic", "generic", "Forge Studio Presenter", "campaign", "campaign", "not_required");
  const ambassador = profile(
    "ambassador",
    "brand_ambassador",
    "Aster Heights Ambassador",
    "campaign",
    "campaign",
    "fulfilled"
  );
  const expired = profile("real-expired", "real_person", "Customer Story Host - Priya", "campaign", "campaign", "fulfilled");
  const revoked = profile("real-revoked", "real_person", "Customer Voice - Arjun", "campaign", "limited", "fulfilled");
  const missing = profile("real-missing", "real_person", "Pending Talent - Meera", "campaign", "campaign", "fulfilled");
  const customPending = profile(
    "custom-pending",
    "real_person",
    "Custom Avatar - Builder Series",
    "campaign",
    "campaign",
    "pending"
  );

  return [
    {
      profile: generic,
      consent: consent(generic.id, "consent://generic-library-license/forge-studio-presenter", "campaign", "campaign", null, null)
    },
    {
      profile: ambassador,
      consent: consent(ambassador.id, "consent://ambassador/aster-heights", "campaign", "campaign", nowMs + 365 * day, null)
    },
    {
      profile: expired,
      consent: consent(expired.id, "consent://real-person/priya", "campaign", "campaign", nowMs - 30 * day, null)
    },
    {
      profile: revoked,
      consent: consent(revoked.id, "consent://real-person/arjun", "campaign", "limited", nowMs + 180 * day, nowMs - 2 * day)
    },
    { profile: missing, consent: null },
    {
      profile: customPending,
      consent: consent(customPending.id, "consent://real-person/builder-series", "campaign", "campaign", nowMs + 90 * day, null)
    }
  ];
}

// Eligibility is derived, never stored as a separate enum. Revocation blocks
// first, then missing evidence, then expiry, then service-fulfillment state.
function deriveAvatarEligibility(avatar, consent, nowMs) {
  if (consent && consent.revokedAt) {
    return {
      eligible: false,
      reason: "consent_revoked",
      consentExpiresAt: toIso(consent.expiresAt),
      consentRevokedAt: toIso(consent.revokedAt)
    };
  }
  if (!consent || !consent.evidenceRef || String(consent.evidenceRef).trim() === "") {
    return {
      eligible: false,
      reason: "consent_required",
      consentExpiresAt: null,
      consentRevokedAt: null
    };
  }
  if (consent.expiresAt && new Date(consent.expiresAt).getTime() < nowMs) {
    return {
      eligible: false,
      reason: "consent_expired",
      consentExpiresAt: toIso(consent.expiresAt),
      consentRevokedAt: null
    };
  }
  if (avatar.serviceFulfillmentState === "pending") {
    return {
      eligible: false,
      reason: "service_pending",
      consentExpiresAt: toIso(consent.expiresAt),
      consentRevokedAt: null
    };
  }
  return {
    eligible: true,
    reason: "eligible",
    consentExpiresAt: toIso(consent.expiresAt),
    consentRevokedAt: null
  };
}

// Public avatar contract. Consent evidence (evidenceRef) is never included; only
// the derived eligibility and the non-sensitive consent timing are exposed.
function publicAvatar(avatar, consent, nowMs) {
  return {
    id: avatar.id,
    workspaceId: avatar.workspaceId,
    brandProfileId: avatar.brandProfileId,
    kind: avatar.kind,
    displayName: avatar.displayName,
    likenessScope: avatar.likenessScope,
    voiceScope: avatar.voiceScope,
    serviceFulfillmentState: avatar.serviceFulfillmentState,
    eligibility: deriveAvatarEligibility(avatar, consent, nowMs),
    createdAt: toIso(avatar.createdAt),
    updatedAt: toIso(avatar.updatedAt)
  };
}

function deterministicUuid(seed) {
  const hash = createHash("sha256").update(seed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

// V0-G1 backend guard: map a derived avatar eligibility reason to the stable
// consent problem from the V0 error catalog. The catalog defines
// AVATAR_CONSENT_REQUIRED, AVATAR_CONSENT_EXPIRED and AVATAR_CONSENT_REVOKED.
// It defines no dedicated service-pending code, so a custom avatar whose
// service fulfillment is still pending surfaces as AVATAR_CONSENT_REQUIRED:
// valid likeness/voice consent is not yet in place. This mapping is documented
// in docs/V0/V0_API.md. A missing or cross-workspace avatar is handled by the
// caller with the existence-hiding WORKSPACE_ACCESS_DENIED 404, never here.
function avatarConsentProblem(reason) {
  if (reason === "consent_revoked") {
    return problem("AVATAR_CONSENT_REVOKED", 409, "Avatar consent revoked", "This avatar can no longer be used.");
  }
  if (reason === "consent_expired") {
    return problem("AVATAR_CONSENT_EXPIRED", 409, "Avatar consent expired", "This avatar consent expired. Renew it before generation.");
  }
  return problem("AVATAR_CONSENT_REQUIRED", 409, "Avatar consent required", "Valid likeness and voice consent is required.");
}

// V0-G2 deterministic payment simulator helpers. The simulator signs the
// canonical callback envelope with an HMAC-SHA256 over the stable canonical
// form; the handler verifies the same canonical form. Production providers
// verify over raw bytes; V0 uses the deterministic canonical form so the
// simulator is reproducible without raw-body capture. The secret is held only
// by the simulator and the handler, never returned to clients.
const PAYMENT_CALLBACK_WINDOW_MS = 5 * 60 * 1000;

function paymentSimulatorSecret(env = process.env) {
  return env.V0_PAYMENT_SIMULATOR_SECRET || "v0-local-payment-secret";
}

function signPaymentEnvelope(envelope, secret) {
  return createHmac("sha256", secret).update(stableJson(envelope)).digest("hex");
}

function verifyPaymentSignature(envelope, signature, secret) {
  if (typeof signature !== "string" || signature.length === 0) {
    return false;
  }
  const expected = signPaymentEnvelope(envelope, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

const HEYGEN_CALLBACK_WINDOW_MS = 5 * 60 * 1000;

// V0-G4 HeyGen callback signing. Mirrors the Razorpay simulator: the simulator
// signs the callback envelope and the store verifies it in constant time. The
// secret never leaves the simulator. HEYGEN_WEBHOOK_SECRET is the configured
// production secret; V0_HEYGEN_SIMULATOR_SECRET is the deterministic local secret.
function heygenSimulatorSecret(env = process.env) {
  return env.V0_HEYGEN_SIMULATOR_SECRET || env.HEYGEN_WEBHOOK_SECRET || "v0-local-heygen-secret";
}

function signHeygenEnvelope(envelope, secret) {
  return createHmac("sha256", secret).update(stableJson(envelope)).digest("hex");
}

function verifyHeygenSignature(envelope, signature, secret) {
  if (typeof signature !== "string" || signature.length === 0) {
    return false;
  }
  const expected = signHeygenEnvelope(envelope, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

// V0-G4 provider request hash: binds the submission to the exact job, script,
// avatar, duration, price version and provider route so a changed request is
// detectable and the operation is exactly-once per job. Server-side binding; never
// exposed publicly.
function computeProviderRequestHash(job) {
  return createHash("sha256")
    .update(
      stableJson({
        jobId: job.id,
        selectedScriptId: job.selectedScriptId ?? null,
        avatarProfileId: job.avatarProfileId ?? null,
        durationSeconds: Number(job.durationSeconds),
        priceVersion: job.priceVersion,
        provider: HEYGEN_PROVIDER
      })
    )
    .digest("hex");
}

function publicProviderOperation(operation) {
  return {
    id: operation.id,
    workspaceId: operation.workspaceId,
    generationJobId: operation.generationJobId,
    provider: operation.provider,
    operationType: operation.operationType,
    status: String(operation.status).toLowerCase(),
    idempotencyKey: operation.idempotencyKey,
    externalId: operation.externalId ?? null,
    priceVersion: operation.priceVersion,
    estimatedMaximumMinor: Number(operation.estimatedMaximumMinor),
    currency: operation.currency,
    retryAfterMs: operation.retryAfterMs ?? null,
    lastErrorCode: operation.lastErrorCode ?? null,
    providerTotalMinor: operation.providerTotalMinor == null ? null : Number(operation.providerTotalMinor),
    settledAt: toIso(operation.settledAt),
    submittedAt: toIso(operation.submittedAt),
    acceptedAt: toIso(operation.acceptedAt),
    completedAt: toIso(operation.completedAt),
    reconciledAt: toIso(operation.reconciledAt),
    cancelledAt: toIso(operation.cancelledAt),
    createdAt: toIso(operation.createdAt),
    updatedAt: toIso(operation.updatedAt)
  };
}

function publicGeneratedSegment(segment) {
  return {
    id: segment.id,
    workspaceId: segment.workspaceId,
    generationJobId: segment.generationJobId,
    providerOperationId: segment.providerOperationId,
    provider: segment.provider,
    externalId: segment.externalId ?? null,
    segmentIndex: Number(segment.segmentIndex),
    durationSeconds: Number(segment.durationSeconds),
    contentType: segment.contentType,
    byteSize: Number(segment.byteSize),
    sha256: segment.sha256,
    artifactId: segment.artifactId,
    sourceFetchedAt: toIso(segment.sourceFetchedAt),
    createdAt: toIso(segment.createdAt),
    updatedAt: toIso(segment.updatedAt)
  };
}

function publicGeneratedAsset(asset) {
  return {
    id: asset.id,
    workspaceId: asset.workspaceId,
    generationJobId: asset.generationJobId,
    segmentId: asset.segmentId,
    artifactId: asset.artifactId,
    version: Number(asset.version),
    kind: asset.kind,
    durationSeconds: Number(asset.durationSeconds),
    contentType: asset.contentType,
    sha256: asset.sha256,
    status: asset.status,
    createdAt: toIso(asset.createdAt),
    updatedAt: toIso(asset.updatedAt)
  };
}

function publicCreativeLineage(lineage) {
  return {
    id: lineage.id,
    workspaceId: lineage.workspaceId,
    generationJobId: lineage.generationJobId,
    brandProfileId: lineage.brandProfileId,
    selectedScriptId: lineage.selectedScriptId ?? null,
    avatarProfileId: lineage.avatarProfileId ?? null,
    estimateId: lineage.estimateId,
    provider: lineage.provider,
    providerOperationId: lineage.providerOperationId,
    priceVersion: lineage.priceVersion,
    generatedAssetId: lineage.generatedAssetId,
    createdAt: toIso(lineage.createdAt),
    updatedAt: toIso(lineage.updatedAt)
  };
}

function validateCreditPurchaseInput(input) {
  const currency = typeof input.currency === "string" ? input.currency.toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Currency must be a 3-letter ISO code.");
  }
  let provider = typeof input.provider === "string" ? input.provider : "";
  if (provider === "") {
    provider = currency === "INR" ? "razorpay" : "stripe";
  }
  if (!["razorpay", "stripe"].includes(provider)) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Provider must be razorpay or stripe.");
  }
  if (provider === "razorpay" && currency !== "INR") {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Razorpay is the India provider and requires INR.");
  }
  if (provider === "stripe" && currency === "INR") {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Stripe is the international provider and cannot be used for INR.");
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Amount must be a positive integer in minor units.");
  }
  return null;
}

function validateCreditAdjustmentInput(input, walletCurrency) {
  if (!["credit", "debit"].includes(input.direction)) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Direction must be credit or debit.");
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Amount must be a positive integer in minor units.");
  }
  const currency = typeof input.currency === "string" ? input.currency.toUpperCase() : "";
  if (currency !== walletCurrency) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Adjustment currency must match the wallet currency.");
  }
  if (typeof input.reason !== "string" || input.reason.trim().length === 0 || input.reason.length > 500) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "A non-empty reason is required for a compensating adjustment.");
  }
  return null;
}

function publicCreditWallet(wallet) {
  return {
    id: wallet.id,
    workspaceId: wallet.workspaceId,
    currency: wallet.currency,
    balanceMinor: Number(wallet.balanceMinor),
    createdAt: toIso(wallet.createdAt),
    updatedAt: toIso(wallet.updatedAt)
  };
}

function publicCreditPurchase(purchase) {
  return {
    id: purchase.id,
    workspaceId: purchase.workspaceId,
    walletId: purchase.walletId,
    provider: purchase.provider,
    providerReference: purchase.providerReference,
    status: String(purchase.status).toLowerCase(),
    amountMinor: Number(purchase.amountMinor),
    currency: purchase.currency,
    idempotencyKey: purchase.idempotencyKey,
    createdAt: toIso(purchase.createdAt),
    updatedAt: toIso(purchase.updatedAt)
  };
}

function publicCreditLedgerEntry(entry, runningBalanceMinor) {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    walletId: entry.walletId,
    generationJobId: entry.generationJobId ?? null,
    type: entry.type,
    amountMinor: Number(entry.amountMinor),
    currency: entry.currency,
    idempotencyKey: entry.idempotencyKey,
    reason: entry.reason ?? null,
    effectiveAt: toIso(entry.effectiveAt),
    createdAt: toIso(entry.createdAt),
    ...(runningBalanceMinor !== undefined ? { runningBalanceMinor: Number(runningBalanceMinor) } : {})
  };
}

function isBlueprintCompatible(entry, profile, objectiveType) {
  if (!entry || entry.status !== "ready" || !isActiveApprovedProfile(profile, entry.workspaceId)) {
    return false;
  }
  const compatibility = entry.compatibility ?? {};
  const brand = profile.profile ?? {};
  const industry = brand.industry;
  const markets = (brand.markets ?? []).map((market) => String(market?.value ?? market));
  const industryMatches = !compatibility.industry || compatibility.industry === industry;
  const marketMatches = !Array.isArray(compatibility.markets) || compatibility.markets.length === 0 || compatibility.markets.some((market) => markets.includes(market));
  const objectiveMatches = !Array.isArray(compatibility.objectiveTypes) || compatibility.objectiveTypes.length === 0 || compatibility.objectiveTypes.includes(objectiveType);
  const versionMatches = !Array.isArray(compatibility.brandProfileVersions) || compatibility.brandProfileVersions.length === 0 || compatibility.brandProfileVersions.includes(profile.version);
  return industryMatches && marketMatches && objectiveMatches && versionMatches;
}

function normalizeLimit(value) {
  if (!Number.isInteger(value)) {
    return 20;
  }
  return Math.min(Math.max(value, 1), 50);
}

function validateBlueprintLibraryEntryInput(input) {
  if (
    typeof input.workspaceId !== "string" ||
    typeof input.brandProfileId !== "string" ||
    typeof input.title !== "string" ||
    input.title.trim().length === 0 ||
    !["ready", "archived"].includes(input.status) ||
    !input.compatibility ||
    typeof input.compatibility.industry !== "string" ||
    !Array.isArray(input.compatibility.markets) ||
    !Array.isArray(input.compatibility.objectiveTypes) ||
    !Array.isArray(input.compatibility.brandProfileVersions)
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

function normalizeBlueprintCompatibility(compatibility) {
  return {
    industry: compatibility.industry,
    markets: compatibility.markets.map(String),
    objectiveTypes: compatibility.objectiveTypes.map(String),
    brandProfileVersions: compatibility.brandProfileVersions.map(Number)
  };
}

function validateBlueprintRequestInput(input) {
  const validPath = ["existing_blueprint", "new_discovery", "default_formula"].includes(input.path);
  if (
    typeof input.workspaceId !== "string" ||
    typeof input.brandProfileId !== "string" ||
    !Number.isInteger(input.brandProfileVersion) ||
    !validPath ||
    typeof input.objectiveType !== "string" ||
    input.objectiveType.trim().length === 0 ||
    typeof input.objective !== "string" ||
    input.objective.trim().length === 0
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.path === "existing_blueprint" && typeof input.blueprintLibraryEntryId !== "string") {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.path !== "existing_blueprint" && input.blueprintLibraryEntryId !== undefined) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

function validateViralCandidateSearchInput(input) {
  if (
    typeof input.workspaceId !== "string" ||
    typeof input.blueprintRequestId !== "string" ||
    typeof input.niche !== "string" ||
    input.niche.trim().length === 0 ||
    typeof input.market !== "string" ||
    input.market.trim().length === 0 ||
    typeof input.objectiveType !== "string" ||
    input.objectiveType.trim().length === 0 ||
    !["fixture_success", "manual_fallback", "timeout", "outage", "empty", "malformed"].includes(input.providerMode) ||
    (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20))
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.providerMode === "manual_fallback" && !input.manualCandidate) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

function validateMediaAcquisitionInput(candidateId, input) {
  if (
    typeof candidateId !== "string" ||
    typeof input.workspaceId !== "string" ||
    !["retained_analysis_copy", "reference_only"].includes(input.retrievalPolicy) ||
    !["fixture_authorized", "hash_mismatch", "low_confidence_ocr", "unsupported_retrieval"].includes(input.acquisitionMode) ||
    !isSha256(input.expectedSourceHash) ||
    !input.rightsDecision ||
    typeof input.rightsDecision.rightsBasis !== "string" ||
    input.rightsDecision.rightsBasis.trim().length === 0 ||
    typeof input.rightsDecision.permittedUse !== "string" ||
    input.rightsDecision.permittedUse.trim().length === 0 ||
    typeof input.rightsDecision.sourceOwner !== "string" ||
    input.rightsDecision.sourceOwner.trim().length === 0 ||
    typeof input.rightsDecision.retainedCopyAllowed !== "boolean" ||
    typeof input.rightsDecision.reviewedAt !== "string"
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

function validateSceneBlueprintInput(candidateId, input) {
  if (
    typeof candidateId !== "string" ||
    typeof input.workspaceId !== "string" ||
    typeof input.mediaAcquisitionId !== "string" ||
    typeof input.thumbnailBlueprintId !== "string" ||
    !isSha256(input.expectedSourceHash) ||
    !["fixture_success", "empty_transcript", "malformed_model_json", "worker_timeout", "worker_oom"].includes(input.simulatorMode)
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

function validateReadyBlueprintInput(blueprintRequestId, input) {
  if (
    typeof blueprintRequestId !== "string" ||
    typeof input.workspaceId !== "string" ||
    !["extracted_blueprint", "default_formula", "existing_blueprint"].includes(input.sourceType)
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.sourceType === "extracted_blueprint" && typeof input.videoBlueprintId !== "string") {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.overrideFormulaSlots !== undefined && (!Array.isArray(input.overrideFormulaSlots) || input.overrideFormulaSlots.length === 0)) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

async function readyBlueprintSource(input, request, readers) {
  if (input.sourceType === "default_formula") {
    if (request.path !== "default_formula") {
      return {
        ok: false,
        problem: problem("BLUEPRINT_INCOMPATIBLE", 409, "Blueprint incompatible", "This blueprint is not compatible with the selected brand or objective.")
      };
    }
    return {
      ok: true,
      sourceType: "default_formula",
      sourceId: request.id,
      durationMs: 42000,
      slots: defaultFormulaSlots(),
      lineage: { blueprintRequestId: request.id, sourceType: "default_formula" }
    };
  }
  if (input.sourceType === "existing_blueprint") {
    const entry = await readers.getLibraryEntry(request.blueprintLibraryEntryId);
    if (request.path !== "existing_blueprint" || !entry || entry.status !== "ready") {
      return {
        ok: false,
        problem: problem("BLUEPRINT_INCOMPATIBLE", 409, "Blueprint incompatible", "This blueprint is not compatible with the selected brand or objective.")
      };
    }
    return {
      ok: true,
      sourceType: "existing_blueprint",
      sourceId: entry.id,
      durationMs: 42000,
      slots: defaultFormulaSlots(),
      lineage: { blueprintRequestId: request.id, sourceType: "existing_blueprint", blueprintLibraryEntryId: entry.id }
    };
  }
  if (request.path !== "new_discovery") {
    return {
      ok: false,
      problem: problem("BLUEPRINT_INCOMPATIBLE", 409, "Blueprint incompatible", "This blueprint is not compatible with the selected brand or objective.")
    };
  }
  const videoBlueprint = await readers.getVideoBlueprint(input.videoBlueprintId);
  if (!videoBlueprint || videoBlueprint.workspaceId !== input.workspaceId || videoBlueprint.status !== "ocr_done") {
    return {
      ok: false,
      problem: problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages.")
    };
  }
  const stageStates = videoBlueprint.stageStates ?? {};
  const requiredStages = ["scene_detect", "transcribe", "keyframe_extract", "vision_analyze", "ocr_extract"];
  if (!requiredStages.every((stage) => stageStates[stage]?.status === "succeeded")) {
    return {
      ok: false,
      problem: problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages.")
    };
  }
  const scenes = await readers.listScenes(videoBlueprint.id);
  if (scenes.length === 0) {
    return {
      ok: false,
      problem: problem("BLUEPRINT_STAGE_INCOMPLETE", 409, "Blueprint stage incomplete", "The blueprint is not ready. Review the incomplete stages.")
    };
  }
  return {
    ok: true,
    sourceType: "extracted_blueprint",
    sourceId: videoBlueprint.id,
    durationMs: videoBlueprint.durationMs,
    slots: normalizeFormulaSlots(scenes.map((scene) => scene.formulaSlot)),
    scenes: scenes.map(publicBlueprintScene),
    lineage: {
      blueprintRequestId: request.id,
      sourceType: "extracted_blueprint",
      videoBlueprintId: videoBlueprint.id,
      sourceHash: videoBlueprint.sourceHash
    }
  };
}

function readyBlueprintEntry(workspaceId, request, profile, source, actorUserId, now) {
  return {
    id: randomUUID(),
    workspaceId,
    brandProfileId: profile.id,
    title: `${request.objectiveType.replace(/_/g, " ")} ready blueprint`,
    status: "ready",
    compatibility: {
      industry: profile.profile?.industry ?? "unknown",
      markets: (profile.profile?.markets ?? []).map((market) => market.value ?? market),
      objectiveTypes: [request.objectiveType],
      brandProfileVersions: [request.brandProfileVersion],
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      immutable: true
    },
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now
  };
}

function formulaDerivationFor(entry, request, source, overrideFormulaSlots, now) {
  const slots = overrideFormulaSlots ?? source.slots;
  const invalidSlot = slots.find((slot) => !allowedFormulaSlots.has(slot));
  if (invalidSlot || !requiredFormulaSlots.every((slot) => slots.includes(slot))) {
    return {
      ok: false,
      problem: problem("BLUEPRINT_FORMULA_INVALID", 422, "Blueprint formula invalid", "The blueprint formula is incomplete or inconsistent.")
    };
  }
  const uniqueSlots = [...new Set(slots)];
  return {
    ok: true,
    record: {
      id: randomUUID(),
      workspaceId: entry.workspaceId,
      blueprintLibraryEntryId: entry.id,
      blueprintRequestId: request.id,
      status: "formula_done",
      formulaVersion: "v0.formula.1",
      slots: uniqueSlots,
      replacementInstructions: uniqueSlots.map((slot) => ({
        slot,
        instruction: replacementInstructionFor(slot)
      })),
      lineage: source.lineage,
      createdAt: now,
      updatedAt: now
    }
  };
}

function directorPromptFor(entry, request, profile, formula, source, now) {
  return {
    id: randomUUID(),
    workspaceId: entry.workspaceId,
    blueprintLibraryEntryId: entry.id,
    formulaDerivationId: formula.id,
    blueprintRequestId: request.id,
    status: "director_prompt_done",
    promptVersion: "v0.director-prompt.1",
    replacementSlots: ["brand_public_name", "primary_cta", ...formula.slots],
    prompt: [
      "Create a 9:16 short-form real-estate video using provider-neutral direction.",
      `Use approved brand profile ${profile.id} version ${request.brandProfileVersion}.`,
      "Replace source identities, creator marks, music, captions and claims with approved brand assets and rules.",
      `Objective: ${request.objective}`
    ].join(" "),
    lineage: {
      ...source.lineage,
      formulaDerivationId: formula.id,
      blueprintLibraryEntryId: entry.id
    },
    createdAt: now,
    updatedAt: now
  };
}

function readyBlueprintJobs(workspaceId, request, entry, formula, directorPrompt, source, now) {
  const baseInput = {
    blueprintRequestId: request.id,
    blueprintLibraryEntryId: entry.id,
    formulaDerivationId: formula.id,
    directorPromptId: directorPrompt.id,
    sourceType: source.sourceType,
    sourceId: source.sourceId
  };
  return ["blueprint_merge", "formula_derive", "director_prompt_generate"].map((type) => ({
    id: randomUUID(),
    workspaceId,
    type,
    resourceClass: "CPU",
    status: "SUCCEEDED",
    priority: 0,
    inputHash: hashRequest({ type, ...baseInput }),
    input: { type, ...baseInput },
    outputArtifactId: null,
    lastErrorCode: null,
    maxAttempts: 1,
    createdAt: now,
    updatedAt: now
  }));
}

function readyBlueprintResponse(entry, formula, directorPrompt, request, audit, readyJobs) {
  return {
    readyBlueprint: publicReadyBlueprint(entry, request),
    formula: publicFormulaDerivation(formula),
    directorPrompt: publicDirectorPrompt(directorPrompt),
    scriptInputContract: {
      schemaVersion: "v0.script-input.1",
      workspaceId: entry.workspaceId,
      brandProfileId: entry.brandProfileId,
      brandProfileVersion: request.brandProfileVersion,
      blueprintLibraryEntryId: entry.id,
      formulaDerivationId: formula.id,
      directorPromptId: directorPrompt.id,
      objectiveType: request.objectiveType,
      objective: request.objective
    },
    jobs: readyJobs.map(publicJob),
    audit: publicAudit(audit)
  };
}

function defaultFormulaSlots() {
  return ["hook", "proof", "offer", "cta"];
}

function normalizeFormulaSlots(slots) {
  const mapped = slots.flatMap((slot) => {
    if (slot === "proof_hook") return ["hook", "proof"];
    if (slot === "cta_reveal") return ["cta"];
    return [slot];
  });
  const unique = [...new Set(mapped)];
  if (requiredFormulaSlots.every((slot) => unique.includes(slot)) && !unique.includes("offer")) {
    unique.splice(unique.indexOf("cta"), 0, "offer");
  }
  return unique;
}

const requiredFormulaSlots = ["hook", "proof", "cta"];
const allowedFormulaSlots = new Set(["hook", "proof", "offer", "cta", "pattern_interrupt", "attention_keeper", "problem_contrast"]);

function replacementInstructionFor(slot) {
  const instructions = {
    hook: "Open with approved brand proof, not a copied creator hook.",
    proof: "Use retained project evidence and approved facts.",
    offer: "Use only approved offer language from the brand profile.",
    cta: "End with the approved call to action.",
    pattern_interrupt: "Use a brand-safe visual change without unsupported claims.",
    attention_keeper: "Maintain pace with approved captions and owned media.",
    problem_contrast: "Frame the buyer problem without fear or guaranteed outcome claims."
  };
  return instructions[slot];
}

function validateScriptTournamentInput(input) {
  if (typeof input.workspaceId !== "string" || typeof input.blueprintRequestId !== "string") {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.variantCount !== undefined && (!Number.isInteger(input.variantCount) || input.variantCount < 10 || input.variantCount > 20)) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.simulatorMode !== undefined && !supportedScriptSimulatorModes().includes(input.simulatorMode)) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

function scriptTournamentRecord({ tournamentId, workspaceId, request, entry, formula, directorPrompt, profile, variantCount, validCount, status, result, now, actorUserId, manifestArtifactId, jobId }) {
  return {
    id: tournamentId,
    workspaceId,
    blueprintRequestId: request.id,
    blueprintLibraryEntryId: entry.id,
    formulaDerivationId: formula.id,
    directorPromptId: directorPrompt.id,
    brandProfileId: profile.id,
    brandProfileVersion: request.brandProfileVersion,
    objectiveType: request.objectiveType,
    objective: request.objective,
    requestedVariantCount: variantCount,
    validVariantCount: validCount,
    status,
    result,
    promptVersion: SCRIPT_PROMPT_VERSION,
    modelVersion: SCRIPT_MODEL_VERSION,
    telemetry: {
      tokenBucket: tokenBucket(variantCount),
      costBucket: costBucket(variantCount)
    },
    manifestArtifactId,
    jobId,
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now
  };
}

function scriptTournamentJob(workspaceId, tournamentId, request, entry, formula, directorPrompt, manifestArtifactId, status, now) {
  const baseInput = {
    tournamentId,
    blueprintRequestId: request.id,
    blueprintLibraryEntryId: entry.id,
    formulaDerivationId: formula.id,
    directorPromptId: directorPrompt.id
  };
  return {
    id: randomUUID(),
    workspaceId,
    type: "script_tournament",
    resourceClass: "AI",
    status,
    priority: 0,
    inputHash: hashRequest({ type: "script_tournament", ...baseInput }),
    input: { type: "script_tournament", ...baseInput },
    outputArtifactId: manifestArtifactId,
    lastErrorCode: status === "FAILED" ? "TOURNAMENT_INSUFFICIENT" : null,
    nextRunAt: null,
    maxAttempts: 1,
    createdAt: now,
    updatedAt: now
  };
}

function scriptTournamentManifestArtifact(workspaceId, tournamentId, variantCount, now) {
  const sha256 = createHash("sha256").update(`script-tournament:${tournamentId}:${variantCount}`).digest("hex");
  return {
    id: randomUUID(),
    workspaceId,
    fileName: `script-tournament-${tournamentId}.json`,
    contentType: "application/json",
    byteSize: 4096,
    sha256,
    status: "CLEAN",
    retentionClass: "private-artifact",
    producer: "script-tournament-simulator",
    schemaVersion: "v0.script-tournament.manifest.1",
    objectKey: `private-artifacts/${workspaceId}/script-tournament/${tournamentId}/manifest.json`,
    createdAt: now,
    updatedAt: now
  };
}

function scriptTournamentOutboxEvents(workspaceId, tournamentId, request, variantCount, validCount, result, now) {
  return [
    {
      id: randomUUID(),
      workspaceId,
      eventType: "script_tournament_started",
      aggregateType: "ScriptTournament",
      aggregateId: tournamentId,
      payload: {
        requestedVariantBucket: requestedVariantBucket(variantCount),
        objectiveCategory: objectiveCategory(request.objectiveType)
      },
      status: "PUBLISHED",
      createdAt: now,
      publishedAt: now
    },
    {
      id: randomUUID(),
      workspaceId,
      eventType: "script_tournament_completed",
      aggregateType: "ScriptTournament",
      aggregateId: tournamentId,
      payload: {
        validVariantCountBucket: validVariantCountBucket(validCount),
        result,
        durationBucket: durationBucket(variantCount)
      },
      status: "PUBLISHED",
      createdAt: now,
      publishedAt: now
    }
  ];
}

function scriptTournamentAudit(workspaceId, tournamentId, actorUserId, result, now) {
  return {
    id: randomUUID(),
    workspaceId,
    actorUserId,
    eventType: "script.tournament.created",
    targetType: "ScriptTournament",
    targetId: tournamentId,
    reason: result,
    occurredAt: now
  };
}

function scriptTournamentResponseBody(tournament, variants, evaluations, job, outboxEventsList, audit) {
  return {
    tournament: publicScriptTournament(tournament),
    variants: variants.map(publicScriptVariant),
    evaluations: evaluations.map(publicScriptEvaluation),
    jobs: [publicJob(job)],
    analytics: outboxEventsList.map((event) => ({ eventType: event.eventType, properties: event.payload })),
    audit: publicAudit(audit),
    tournamentId: tournament.id,
    validVariantCount: tournament.validVariantCount,
    requestedVariantCount: tournament.requestedVariantCount,
    result: tournament.result
  };
}

function publicScriptTournament(tournament) {
  return {
    id: tournament.id,
    workspaceId: tournament.workspaceId,
    blueprintRequestId: tournament.blueprintRequestId,
    blueprintLibraryEntryId: tournament.blueprintLibraryEntryId,
    formulaDerivationId: tournament.formulaDerivationId,
    directorPromptId: tournament.directorPromptId,
    brandProfileId: tournament.brandProfileId,
    brandProfileVersion: tournament.brandProfileVersion,
    objectiveType: tournament.objectiveType,
    objective: tournament.objective,
    requestedVariantCount: tournament.requestedVariantCount,
    validVariantCount: tournament.validVariantCount,
    status: tournament.status,
    result: tournament.result,
    promptVersion: tournament.promptVersion,
    modelVersion: tournament.modelVersion,
    telemetry: tournament.telemetry,
    manifestArtifactId: tournament.manifestArtifactId,
    jobId: tournament.jobId,
    createdByUserId: tournament.createdByUserId,
    createdAt: toIso(tournament.createdAt),
    updatedAt: toIso(tournament.updatedAt)
  };
}

function publicScriptVariant(variant) {
  return {
    id: variant.id,
    workspaceId: variant.workspaceId,
    tournamentId: variant.tournamentId,
    index: variant.index,
    status: variant.status,
    hookType: variant.hookType,
    hook: variant.hook,
    body: variant.body,
    cta: variant.cta,
    captions: variant.captions,
    claims: variant.claims,
    cadence: variant.cadence,
    formulaSlots: variant.formulaSlots,
    provenance: variant.provenance,
    createdAt: toIso(variant.createdAt)
  };
}

function publicScriptEvaluation(evaluation) {
  return {
    id: evaluation.id,
    workspaceId: evaluation.workspaceId,
    tournamentId: evaluation.tournamentId,
    variantId: evaluation.variantId,
    status: evaluation.status,
    hookStrength: evaluation.hookStrength,
    timing: evaluation.timing,
    patternInterrupts: evaluation.patternInterrupts,
    cta: evaluation.cta,
    claims: evaluation.claims,
    captions: evaluation.captions,
    tone: evaluation.tone,
    formulaChecks: evaluation.formulaChecks,
    policyChecks: evaluation.policyChecks,
    brandRuleChecks: evaluation.brandRuleChecks,
    modelScore: evaluation.modelScore,
    humanScore: evaluation.humanScore,
    explanation: evaluation.explanation,
    createdAt: toIso(evaluation.createdAt)
  };
}

function prismaScriptTournament(tournament) {
  return {
    workspaceId: tournament.workspaceId,
    blueprintRequestId: tournament.blueprintRequestId,
    blueprintLibraryEntryId: tournament.blueprintLibraryEntryId,
    formulaDerivationId: tournament.formulaDerivationId,
    directorPromptId: tournament.directorPromptId,
    brandProfileId: tournament.brandProfileId,
    brandProfileVersion: tournament.brandProfileVersion,
    objectiveType: tournament.objectiveType,
    objective: tournament.objective,
    requestedVariantCount: tournament.requestedVariantCount,
    validVariantCount: tournament.validVariantCount,
    status: tournament.status,
    result: tournament.result,
    promptVersion: tournament.promptVersion,
    modelVersion: tournament.modelVersion,
    telemetry: tournament.telemetry,
    manifestArtifactId: tournament.manifestArtifactId,
    jobId: tournament.jobId,
    createdByUserId: tournament.createdByUserId
  };
}

function prismaScriptVariant(variant) {
  return {
    workspaceId: variant.workspaceId,
    tournamentId: variant.tournamentId,
    index: variant.index,
    status: variant.status,
    hookType: variant.hookType,
    hook: variant.hook,
    body: variant.body,
    cta: variant.cta,
    captions: variant.captions,
    claims: variant.claims,
    cadence: variant.cadence,
    formulaSlots: variant.formulaSlots,
    provenance: variant.provenance
  };
}

function prismaScriptEvaluation(evaluation) {
  return {
    workspaceId: evaluation.workspaceId,
    tournamentId: evaluation.tournamentId,
    variantId: evaluation.variantId,
    status: evaluation.status,
    hookStrength: evaluation.hookStrength,
    timing: evaluation.timing,
    patternInterrupts: evaluation.patternInterrupts,
    cta: evaluation.cta,
    claims: evaluation.claims,
    captions: evaluation.captions,
    tone: evaluation.tone,
    formulaChecks: evaluation.formulaChecks,
    policyChecks: evaluation.policyChecks,
    brandRuleChecks: evaluation.brandRuleChecks,
    modelScore: evaluation.modelScore,
    humanScore: evaluation.humanScore,
    explanation: evaluation.explanation
  };
}

// V0-S2 immutable selected-script helpers. Selection is a synchronous durable
// decision: one canonical, immutable SelectedScript per tournament, retained
// with an audit record and a bucketed script_selected analytics event. Selection
// never implies generation approval or credit reservation.

function validateScriptSelectionInput(input) {
  if (
    typeof input.workspaceId !== "string" ||
    typeof input.tournamentId !== "string" ||
    typeof input.variantId !== "string" ||
    typeof input.optimisticTournamentVersion !== "string"
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.humanOverride !== undefined && typeof input.humanOverride !== "boolean") {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  return null;
}

function selectedScriptRecord({ selectedScriptId, workspaceId, tournamentId, variantId, actorUserId, humanOverride, now }) {
  return {
    id: selectedScriptId,
    workspaceId,
    tournamentId,
    variantId,
    approverUserId: actorUserId,
    version: 1,
    humanOverride,
    createdAt: now,
    updatedAt: now
  };
}

// The selected variant's 1-based rank among valid variants sorted by model score
// descending. Ties break on variant index so the rank is deterministic across
// stores. The rank feeds a coarse analytics bucket only; the variant id, score
// and script text never enter analytics.
function computeVariantRank(validVariants, tournamentEvaluations, selectedVariantId) {
  const scored = validVariants.map((variant) => {
    const evaluation = tournamentEvaluations.find((record) => record.variantId === variant.id);
    return { id: variant.id, index: variant.index, score: evaluation ? evaluation.modelScore : 0 };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.findIndex((entry) => entry.id === selectedVariantId) + 1;
}

function selectedScriptOutboxEvent(workspaceId, tournamentId, selectedScriptId, rank, now) {
  return {
    id: randomUUID(),
    workspaceId,
    eventType: "script_selected",
    aggregateType: "SelectedScript",
    aggregateId: selectedScriptId,
    payload: {
      variant_rank_bucket: variantRankBucket(rank),
      human_overrode_top_score: rank !== 1
    },
    status: "PUBLISHED",
    createdAt: now,
    publishedAt: now
  };
}

function selectedScriptAudit(workspaceId, selectedScriptId, tournamentId, actorUserId, now) {
  return {
    id: randomUUID(),
    workspaceId,
    actorUserId,
    eventType: "script.selected",
    targetType: "SelectedScript",
    targetId: selectedScriptId,
    reason: "selected",
    occurredAt: now
  };
}

function publicSelectedScript(selectedScript) {
  return {
    id: selectedScript.id,
    workspaceId: selectedScript.workspaceId,
    tournamentId: selectedScript.tournamentId,
    variantId: selectedScript.variantId,
    approverUserId: selectedScript.approverUserId,
    version: selectedScript.version,
    humanOverride: selectedScript.humanOverride,
    immutable: true,
    createdAt: toIso(selectedScript.createdAt),
    updatedAt: toIso(selectedScript.updatedAt)
  };
}

function selectedScriptResponseBody(selectedScript, tournament, variant, evaluation, outboxEventsList, audit) {
  return {
    selectedScript: publicSelectedScript(selectedScript),
    tournament: publicScriptTournament(tournament),
    variant: publicScriptVariant(variant),
    evaluation: publicScriptEvaluation(evaluation),
    jobs: [],
    analytics: outboxEventsList.map((event) => ({ eventType: event.eventType, properties: event.payload })),
    audit: publicAudit(audit),
    tournamentId: tournament.id,
    variantId: variant.id,
    selectedScriptId: selectedScript.id
  };
}

function prismaSelectedScript(selectedScript) {
  return {
    workspaceId: selectedScript.workspaceId,
    tournamentId: selectedScript.tournamentId,
    variantId: selectedScript.variantId,
    approverUserId: selectedScript.approverUserId,
    version: selectedScript.version,
    humanOverride: selectedScript.humanOverride
  };
}

function buildSceneStageSet(workspaceId, candidate, input, requestId, traceId, now) {
  const stageTypes = ["scene_detect", "transcribe", "keyframe_extract", "vision_analyze", "ocr_extract"];
  const stageSchemas = {
    scene_detect: "v0.scene-detect.stage.1",
    transcribe: "v0.transcript.stage.1",
    keyframe_extract: "v0.keyframe.stage.1",
    vision_analyze: "v0.vision.stage.1",
    ocr_extract: "v0.ocr.stage.1"
  };
  const stageStates = sceneStageStates(input.simulatorMode);
  const artifacts = stageTypes.map((stageType) => sceneStageArtifact(workspaceId, candidate, stageType, stageSchemas[stageType], now));
  const jobs = stageTypes.map((stageType) =>
    sceneStageJob(workspaceId, candidate, input, stageType, stageSchemas[stageType], stageStates[stageType], requestId, traceId, artifacts, now)
  );
  const jobByType = new Map(jobs.map((job) => [job.type, job]));
  const dependencies = [
    { parentType: "scene_detect", childType: "transcribe" },
    { parentType: "scene_detect", childType: "keyframe_extract" },
    { parentType: "keyframe_extract", childType: "vision_analyze" },
    { parentType: "keyframe_extract", childType: "ocr_extract" }
  ].map((edge) => ({
    id: randomUUID(),
    parentJobId: jobByType.get(edge.parentType).id,
    childJobId: jobByType.get(edge.childType).id,
    parentType: edge.parentType,
    childType: edge.childType,
    createdAt: now
  }));
  return { jobs, artifacts, dependencies, stageStates };
}

function sceneStageStates(simulatorMode) {
  const states = {
    scene_detect: { status: "succeeded", confidence: 0.94, errorCode: null },
    transcribe: { status: "succeeded", confidence: 0.91, errorCode: null },
    keyframe_extract: { status: "succeeded", confidence: 0.9, errorCode: null },
    vision_analyze: { status: "succeeded", confidence: 0.88, errorCode: null },
    ocr_extract: { status: "succeeded", confidence: 0.86, errorCode: null }
  };
  if (simulatorMode === "empty_transcript") {
    states.transcribe = { status: "blocked", confidence: 0, errorCode: "AI_OUTPUT_EMPTY" };
  }
  if (simulatorMode === "malformed_model_json") {
    states.vision_analyze = { status: "failed", confidence: 0, errorCode: "AI_OUTPUT_SCHEMA_INVALID" };
  }
  if (simulatorMode === "worker_timeout") {
    states.keyframe_extract = { status: "failed", confidence: 0, errorCode: "WORKER_TIMEOUT" };
  }
  if (simulatorMode === "worker_oom") {
    states.vision_analyze = { status: "failed", confidence: 0, errorCode: "WORKER_OOM" };
  }
  return states;
}

function sceneStageArtifact(workspaceId, candidate, stageType, schemaVersion, now) {
  const sha256 = createHash("sha256").update(`${candidate.id}:${candidate.sourceHash}:${stageType}`).digest("hex");
  return {
    id: randomUUID(),
    workspaceId,
    fileName: `${stageType}.json`,
    contentType: "application/json",
    byteSize: 2048,
    sha256,
    status: "CLEAN",
    retentionClass: "private-artifact",
    producer: "scene-blueprint-simulator",
    schemaVersion,
    objectKey: `private-artifacts/${workspaceId}/scene-blueprint/${candidate.id}/${stageType}.json`,
    createdAt: now,
    updatedAt: now
  };
}

function sceneStageJob(workspaceId, candidate, input, stageType, schemaVersion, stageState, requestId, traceId, artifacts, now) {
  const artifact = artifacts.find((item) => item.schemaVersion === schemaVersion);
  return {
    id: randomUUID(),
    workspaceId,
    type: stageType,
    resourceClass: stageType === "vision_analyze" ? "GPU" : "CPU",
    status: stageState.status === "succeeded" ? "SUCCEEDED" : "FAILED",
    priority: stageType === "scene_detect" ? 10 : 5,
    inputHash: hashRequest({
      viralCandidateId: candidate.id,
      mediaAcquisitionId: input.mediaAcquisitionId,
      thumbnailBlueprintId: input.thumbnailBlueprintId,
      stageType,
      expectedSourceHash: input.expectedSourceHash
    }),
    input: {
      requestId,
      traceId,
      viralCandidateId: candidate.id,
      mediaAcquisitionId: input.mediaAcquisitionId,
      thumbnailBlueprintId: input.thumbnailBlueprintId,
      expectedSourceHash: input.expectedSourceHash,
      stageArtifactSchema: schemaVersion
    },
    outputArtifactId: artifact.id,
    lastErrorCode: stageState.errorCode,
    maxAttempts: 2,
    createdAt: now,
    updatedAt: now
  };
}

function videoBlueprintFor(candidate, acquisition, thumbnailBlueprint, stageSet, simulatorMode, now) {
  const blocked = simulatorMode !== "fixture_success";
  return {
    id: randomUUID(),
    workspaceId: acquisition.workspaceId,
    viralCandidateId: candidate.id,
    mediaAcquisitionId: acquisition.id,
    thumbnailBlueprintId: thumbnailBlueprint.id,
    status: blocked ? "blocked" : "ocr_done",
    durationMs: 11000,
    stageStates: stageSet.stageStates,
    stageArtifactIds: stageSet.artifacts.map((artifact) => artifact.id),
    sourceHash: candidate.sourceHash,
    createdAt: now,
    updatedAt: now
  };
}

function sceneSetFor(videoBlueprint, simulatorMode, now) {
  if (simulatorMode === "empty_transcript") {
    return [
      blueprintScene(videoBlueprint, 0, 0, 5000, "hook", {
        text: "",
        confidence: 0,
        words: []
      }, now)
    ];
  }
  return [
    blueprintScene(videoBlueprint, 0, 0, 5000, "proof_hook", {
      text: "Start with the site entrance and commute proof.",
      confidence: 0.91,
      words: [
        { startMs: 400, endMs: 1100, text: "Start" },
        { startMs: 1200, endMs: 1900, text: "site entrance" }
      ]
    }, now),
    blueprintScene(videoBlueprint, 1, 5000, 11000, "cta_reveal", {
      text: "Close with the approved visit call to action.",
      confidence: 0.89,
      words: [
        { startMs: 5600, endMs: 6400, text: "Book" },
        { startMs: 6500, endMs: 7600, text: "site visit" }
      ]
    }, now)
  ];
}

function blueprintScene(videoBlueprint, index, startMs, endMs, formulaSlot, transcript, now) {
  return {
    id: randomUUID(),
    workspaceId: videoBlueprint.workspaceId,
    videoBlueprintId: videoBlueprint.id,
    index,
    startMs,
    endMs,
    formulaSlot,
    shot: index === 0
      ? { type: "wide_site_establishing", subject: "project entrance", framing: "vertical safe centre" }
      : { type: "medium_walkthrough", subject: "amenity corridor", framing: "CTA space lower third" },
    motion: index === 0
      ? { camera: "slow_push_in", subjectMotion: "pedestrian movement", pace: "measured" }
      : { camera: "left_to_right_pan", subjectMotion: "guide points to feature", pace: "steady" },
    transcript,
    ocr: {
      confidence: transcript.text ? 0.86 : 0,
      text: transcript.text ? [{ text: index === 0 ? "2 min to metro" : "Book a site visit", startMs, endMs }] : []
    },
    replacements: [
      { source: "creator location proof", guidance: "Use approved project location evidence and avoid unsupported investment claims." },
      { source: "creator CTA", guidance: "Replace with approved brand CTA: Book a site visit." }
    ],
    createdAt: now,
    updatedAt: now
  };
}

function buildBlockedAcquisition(candidate, input, actorUserId, now) {
  let code = null;
  let status = 409;
  let detail = "This source media cannot be acquired under the current policy.";
  let blockedReason = null;
  let thumbnailBlueprint = null;
  if (input.expectedSourceHash !== candidate.sourceHash || input.acquisitionMode === "hash_mismatch") {
    code = "ARTIFACT_HASH_MISMATCH";
    detail = "The file did not match the expected content. It was not accepted.";
    blockedReason = "source_hash_mismatch";
  } else if (input.acquisitionMode === "unsupported_retrieval") {
    code = "MEDIA_ACQUISITION_BLOCKED";
    blockedReason = "unsupported_retrieval";
  } else if (input.retrievalPolicy === "retained_analysis_copy" && input.rightsDecision.retainedCopyAllowed !== true) {
    code = "MEDIA_ACQUISITION_BLOCKED";
    blockedReason = "rights_do_not_allow_retained_copy";
  } else if (input.acquisitionMode === "low_confidence_ocr") {
    code = "BLUEPRINT_STAGE_INCOMPLETE";
    detail = "The blueprint is not ready. Review the incomplete stages.";
    blockedReason = "low_confidence_ocr";
  }
  if (!code) {
    return null;
  }
  const acquisition = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    viralCandidateId: candidate.id,
    artifactId: null,
    status: "blocked",
    retrievalPolicy: input.retrievalPolicy,
    acquisitionMode: input.acquisitionMode,
    rightsDecision: normalizeRightsDecision(input.rightsDecision, actorUserId),
    sourceHash: candidate.sourceHash,
    blockedReason,
    createdAt: now,
    updatedAt: now
  };
  if (blockedReason === "low_confidence_ocr") {
    thumbnailBlueprint = thumbnailBlueprintFor(candidate, acquisition, null, input.acquisitionMode, now);
  }
  return {
    acquisition,
    thumbnailBlueprint,
    problem: {
      ...problem(code, status, code === "ARTIFACT_HASH_MISMATCH" ? "Artifact hash mismatch" : "Media acquisition blocked", detail),
      acquisition: publicMediaAcquisition(acquisition),
      thumbnailBlueprint: thumbnailBlueprint ? publicThumbnailBlueprint(thumbnailBlueprint) : null
    }
  };
}

function normalizeRightsDecision(rightsDecision, actorUserId) {
  return {
    rightsBasis: rightsDecision.rightsBasis.trim(),
    permittedUse: rightsDecision.permittedUse.trim(),
    sourceOwner: rightsDecision.sourceOwner.trim(),
    retainedCopyAllowed: rightsDecision.retainedCopyAllowed,
    reviewedAt: rightsDecision.reviewedAt,
    reviewedByUserId: actorUserId
  };
}

function analysisArtifact(workspaceId, candidate, now) {
  const sha256 = createHash("sha256").update(`${candidate.id}:${candidate.sourceHash}:analysis-copy`).digest("hex");
  return {
    id: randomUUID(),
    workspaceId,
    fileName: "candidate-analysis-copy.mp4",
    contentType: "video/mp4",
    byteSize: 5242880,
    sha256,
    status: "CLEAN",
    retentionClass: "private-artifact",
    producer: "media-acquire-simulator",
    schemaVersion: "v0.media-acquisition.analysis-copy.1",
    objectKey: `private-artifacts/${workspaceId}/media-acquisition/${candidate.id}.mp4`,
    createdAt: now,
    updatedAt: now
  };
}

function thumbnailBlueprintFor(candidate, acquisition, artifact, acquisitionMode, now) {
  const lowConfidence = acquisitionMode === "low_confidence_ocr";
  return {
    id: randomUUID(),
    workspaceId: acquisition.workspaceId,
    viralCandidateId: candidate.id,
    mediaAcquisitionId: acquisition.id,
    artifactId: artifact?.id ?? null,
    status: lowConfidence ? "blocked" : "thumbnail_deciphered",
    ocr: {
      text: lowConfidence ? [""] : ["Book your site visit", "Metro-connected homes"],
      confidence: lowConfidence ? 0.42 : 0.91,
      language: "en-IN"
    },
    composition: {
      layout: "headline-over-site-visual",
      focalPoints: ["property entrance", "CTA band"],
      safeZones: { top: 0.12, bottom: 0.16 }
    },
    hookHypothesis: "Lead with visible site proof before price or offer details.",
    directorGuidance: {
      replacements: [
        { sourceElement: "creator headline", guidance: "Replace with approved brand CTA and current project name." },
        { sourceElement: "property visual", guidance: "Use owned site footage or approved project renders." }
      ],
      prohibited: ["Do not copy creator branding, music, watermark or unsupported claims."]
    },
    quality: {
      schemaVersion: "v0.thumbnail-blueprint.1",
      confidence: lowConfidence ? 0.58 : 0.88,
      blockingReasons: lowConfidence ? ["low_confidence_ocr"] : []
    },
    sourceHash: candidate.sourceHash,
    createdAt: now,
    updatedAt: now
  };
}

function prismaArtifact(artifact) {
  return {
    workspaceId: artifact.workspaceId,
    fileName: artifact.fileName,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
    status: artifact.status,
    retentionClass: artifact.retentionClass,
    producer: artifact.producer,
    schemaVersion: artifact.schemaVersion,
    objectKey: artifact.objectKey
  };
}

function prismaMediaAcquisition(acquisition) {
  return {
    workspaceId: acquisition.workspaceId,
    viralCandidateId: acquisition.viralCandidateId,
    artifactId: acquisition.artifactId,
    status: acquisition.status,
    retrievalPolicy: acquisition.retrievalPolicy,
    acquisitionMode: acquisition.acquisitionMode,
    rightsDecision: acquisition.rightsDecision,
    sourceHash: acquisition.sourceHash,
    blockedReason: acquisition.blockedReason
  };
}

function prismaThumbnailBlueprint(blueprint) {
  return {
    workspaceId: blueprint.workspaceId,
    viralCandidateId: blueprint.viralCandidateId,
    mediaAcquisitionId: blueprint.mediaAcquisitionId,
    artifactId: blueprint.artifactId,
    status: blueprint.status,
    ocr: blueprint.ocr,
    composition: blueprint.composition,
    hookHypothesis: blueprint.hookHypothesis,
    directorGuidance: blueprint.directorGuidance,
    quality: blueprint.quality,
    sourceHash: blueprint.sourceHash
  };
}

function prismaVideoBlueprint(blueprint) {
  return {
    workspaceId: blueprint.workspaceId,
    viralCandidateId: blueprint.viralCandidateId,
    mediaAcquisitionId: blueprint.mediaAcquisitionId,
    thumbnailBlueprintId: blueprint.thumbnailBlueprintId,
    status: blueprint.status,
    durationMs: blueprint.durationMs,
    stageStates: blueprint.stageStates,
    stageArtifactIds: blueprint.stageArtifactIds,
    sourceHash: blueprint.sourceHash
  };
}

function prismaBlueprintScene(scene) {
  return {
    workspaceId: scene.workspaceId,
    videoBlueprintId: scene.videoBlueprintId,
    index: scene.index,
    startMs: scene.startMs,
    endMs: scene.endMs,
    formulaSlot: scene.formulaSlot,
    shot: scene.shot,
    motion: scene.motion,
    transcript: scene.transcript,
    ocr: scene.ocr,
    replacements: scene.replacements
  };
}

function prismaFormulaDerivation(formula) {
  return {
    workspaceId: formula.workspaceId,
    blueprintLibraryEntryId: formula.blueprintLibraryEntryId,
    blueprintRequestId: formula.blueprintRequestId,
    status: formula.status,
    formulaVersion: formula.formulaVersion,
    slots: formula.slots,
    replacementInstructions: formula.replacementInstructions,
    lineage: formula.lineage
  };
}

function prismaDirectorPrompt(prompt) {
  return {
    workspaceId: prompt.workspaceId,
    blueprintLibraryEntryId: prompt.blueprintLibraryEntryId,
    formulaDerivationId: prompt.formulaDerivationId,
    blueprintRequestId: prompt.blueprintRequestId,
    status: prompt.status,
    promptVersion: prompt.promptVersion,
    replacementSlots: prompt.replacementSlots,
    prompt: prompt.prompt,
    lineage: prompt.lineage
  };
}

function validateBrandApprovalInput(input) {
  if (
    typeof input.workspaceId !== "string" ||
    typeof input.crawlRunId !== "string" ||
    input.decision !== "approve" ||
    !Number.isInteger(input.optimisticVersion) ||
    input.optimisticVersion < 0 ||
    !input.profile ||
    input.profile.rightsAttestation !== true ||
    typeof input.profile.publicName !== "string" ||
    input.profile.publicName.trim().length === 0 ||
    typeof input.profile.industry !== "string" ||
    input.profile.industry.trim().length === 0 ||
    !Array.isArray(input.profile.markets) ||
    input.profile.markets.length === 0 ||
    typeof input.profile.positioningStatement !== "string" ||
    input.profile.positioningStatement.trim().length === 0 ||
    !Array.isArray(input.profile.products) ||
    input.profile.products.length === 0 ||
    !Array.isArray(input.profile.audiences) ||
    input.profile.audiences.length === 0 ||
    !Array.isArray(input.profile.callsToAction) ||
    input.profile.callsToAction.length === 0 ||
    !input.profile.voice ||
    !Array.isArray(input.profile.voice.attributes) ||
    input.profile.voice.attributes.length === 0 ||
    !Array.isArray(input.rules)
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  for (const rule of input.rules) {
    if (
      !rule ||
      typeof rule.type !== "string" ||
      !brandRuleTypes.has(rule.type) ||
      typeof rule.value !== "string" ||
      rule.value.trim().length === 0 ||
      typeof rule.rationale !== "string" ||
      rule.rationale.trim().length === 0 ||
      !["critical", "warning"].includes(rule.severity)
    ) {
      return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
    }
  }
  return null;
}

function normalizeBrandProfile(profile, actorUserId, approvedAt) {
  return {
    schema_version: "v0.brand-profile.1",
    name: {
      public: evidenceValue(profile.publicName.trim(), actorUserId, approvedAt)
    },
    industry: profile.industry,
    markets: profile.markets.map((value) => evidenceValue(String(value).trim(), actorUserId, approvedAt)),
    positioning: {
      statement: evidenceValue(profile.positioningStatement.trim(), actorUserId, approvedAt)
    },
    visual_identity: profile.visualIdentity ?? {},
    voice: profile.voice,
    products: profile.products,
    audiences: profile.audiences,
    calls_to_action: profile.callsToAction,
    claims: profile.claims ?? [],
    rights_attestation: true
  };
}

function evidenceValue(value, actorUserId, approvedAt) {
  return {
    value,
    confidence: 1,
    decision: "approved",
    sources: [{ source_type: "manual", artifact_id: null, locator: "brand-approval" }],
    approved_by: actorUserId,
    approved_at: approvedAt
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
    payload: event.payload,
    status: event.status,
    createdAt: toIso(event.createdAt)
  };
}

function publicJobTrace(job, outbox, attempts, events, artifactsForJob) {
  return {
    requestId: job.input?.requestId ?? null,
    traceId: job.input?.traceId ?? null,
    workspaceId: job.workspaceId,
    job: publicJob(job),
    outbox: outbox.map(publicOutboxEvent),
    attempts: attempts.map(publicJobAttempt),
    events: events.map(publicJobEvent),
    artifacts: artifactsForJob.map(publicArtifact)
  };
}

function operationalMetrics(workspaceId, jobsForWorkspace, attempts, artifactsForWorkspace, events) {
  const queuedJobs = jobsForWorkspace.filter((job) => job.workspaceId === workspaceId && job.status === "QUEUED");
  const now = Date.now();
  const oldestQueuedAt = queuedJobs
    .map((job) => new Date(job.createdAt).getTime())
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0];
  return {
    workspaceId,
    queuedCount: queuedJobs.length,
    oldestQueueAgeMs: oldestQueuedAt ? now - oldestQueuedAt : 0,
    retryCount: events.filter((event) => event.eventType === "job.retry_scheduled").length,
    leaseExpiryCount: events.filter((event) => event.eventType === "job.lease_expired").length,
    deadLetterCount: jobsForWorkspace.filter((job) => job.workspaceId === workspaceId && job.status === "FAILED").length,
    artifactValidationCount: artifactsForWorkspace.filter((artifact) => artifact.workspaceId === workspaceId).length
  };
}

function flattenJobEvents(jobEvents) {
  return [...jobEvents.values()].flat();
}

function publicWorkspaceCapability(capability) {
  return {
    id: capability.id,
    workspaceId: capability.workspaceId,
    capability: capability.capability,
    enabled: capability.enabled,
    disabledReason: capability.disabledReason ?? null,
    updatedByUserId: capability.updatedByUserId,
    createdAt: toIso(capability.createdAt),
    updatedAt: toIso(capability.updatedAt)
  };
}

function publicServiceCredential(credential) {
  return {
    id: credential.id,
    workspaceId: credential.workspaceId,
    provider: credential.provider,
    purpose: credential.purpose,
    environment: credential.environment,
    secretRef: credential.secretRef,
    rotationStatus: credential.rotationStatus,
    createdAt: toIso(credential.createdAt),
    updatedAt: toIso(credential.updatedAt)
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

function capabilityKey(workspaceId, capability) {
  return `${workspaceId}:${capability}`;
}

function redactionScan(sample) {
  const redactedSample = sample
    .replace(/(apiKey=)[^\s]+/gi, "$1[redacted]")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(X-Amz-Signature=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(sk_(?:test|live)_[A-Za-z0-9_]+)/g, "[redacted]");
  const leakPattern = /(sk_(?:test|live)_[A-Za-z0-9_]+|X-Amz-Signature=(?!\[redacted\])[^&\s]+|apiKey=(?!\[redacted\])[^\s]+)/i;
  return {
    leakCount: leakPattern.test(redactedSample) ? 1 : 0,
    redactedSample
  };
}

function hashRequest(input) {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

// V0-G3: the input hash binds the exact script, avatar and duration the user
// saw at estimate time. Confirmation recomputes this over the confirm body and
// compares it to the stored hash so a changed script, avatar or duration
// surfaces as ESTIMATE_INPUT_CHANGED rather than a silent re-price.
function computeGenerationInputHash(input) {
  const durationSeconds = normalizeDurationSeconds(input.durationSeconds);
  return createHash("sha256")
    .update(
      stableJson({
        selectedScriptId: input.selectedScriptId ?? null,
        avatarProfileId: input.avatarProfileId ?? null,
        durationSeconds
      })
    )
    .digest("hex");
}

function normalizeDurationSeconds(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 30;
  }
  // The V0 pilot caps generation at 30 seconds; longer requests are clamped,
  // never rejected, so the authorized maximum stays the deterministic cap.
  return Math.min(parsed, 30);
}

function estimateTtlMs(env = process.env) {
  const parsed = Number(env.V0_ESTIMATE_TTL_MS);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return 15 * 60 * 1000;
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

function problem(code, status, title, detail, retryable) {
  return {
    type: `https://errors.sakhaa-forge.invalid/v0/${code}`,
    title,
    status,
    code,
    detail,
    trace_id: "v0-local-trace",
    retryable:
      typeof retryable === "boolean"
        ? retryable
        : code === "IDEMPOTENCY_KEY_REQUIRED" ||
          code === "DEPENDENCY_UNAVAILABLE" ||
          code === "ESTIMATE_EXPIRED" ||
          code === "ESTIMATE_INPUT_CHANGED" ||
          code === "PROVIDER_RATE_LIMITED"
  };
}
