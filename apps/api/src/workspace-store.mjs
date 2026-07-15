import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "../../../packages/db/generated/client/index.js";
import { createObjectStorage } from "../../../packages/config/src/storage.mjs";
import { canPerform } from "./permissions.mjs";
import {
  aeCapabilityRegistry,
  validateAePlan,
  AE_PLAN_SCHEMA_VERSION,
  DEFAULT_AE_CAPABILITY_VERSION
} from "./ae-capability-registry.mjs";
import {
  AE_RENDER_SCHEMA_VERSION,
  AE_RENDER_RESOURCE_CLASS,
  AE_RENDER_RESOLUTION,
  AE_RENDER_CODEC,
  goldenRenderHash,
  renderAeVideo,
  validateAeRenderOutput,
  resolveAeRenderMode
} from "./ae-render-provider.mjs";
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
  META_PROVIDER,
  META_OPERATION_TYPE,
  submitMetaPost,
  reconcileMetaOperation,
  metaPublicUrl
} from "./meta-provider.mjs";
import {
  YOUTUBE_PROVIDER,
  YOUTUBE_OPERATION_TYPE,
  submitYouTubePost,
  reconcileYouTubeOperation,
  youtubePublicUrl,
  checkYouTubeQuota
} from "./youtube-provider.mjs";
import {
  VERIFY_PROVIDER,
  verifyAudiencePost,
  verifyEvidenceSha256,
  resolveVerifyMode,
  resolveVerifyMaxAttempts,
  VERIFY_PROCESSING_RETRY_AFTER_MS
} from "./verify-provider.mjs";
import {
  PERFORMANCE_PROVIDER,
  collectPerformanceObservation,
  PERFORMANCE_PROCESSING_RETRY_AFTER_MS
} from "./performance-provider.mjs";
import {
  benchmarkB2Transfer,
  B2_TRANSFER_PROVIDER,
  B2_LATENCY_BUDGET_MS,
  B2_EGRESS_COST_MINOR_PER_GB
} from "./b2-transfer-benchmark-provider.mjs";
import {
  simulateQueueBacklog,
  QUEUE_BACKLOG_PROVIDER,
  QUEUE_BACKLOG_DEFAULT_DURATION_MS,
  QUEUE_AGE_SLO_MS
} from "./queue-backlog-provider.mjs";
import {
  rehearseIncident,
  INCIDENT_REHEARSAL_PROVIDER,
  INCIDENT_REHEARSAL_SCENARIOS
} from "./incident-rehearsal-provider.mjs";
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

// The deterministic AE render log retained alongside every RenderAttempt. The
// simulator produces this exact payload, so its byte length is a stable positive
// integer that satisfies the artifacts `byte_size > 0` check across revisions.
const RENDER_LOG_PAYLOAD = JSON.stringify({
  renderer: "ae-render-simulator",
  status: "clean",
  events: ["plan_validated", "render_started", "render_completed"]
});
const RENDER_LOG_BYTE_SIZE = Buffer.byteLength(RENDER_LOG_PAYLOAD, "utf8");

// V0-C2 render idempotency is input-bound: an idempotency key is scoped to the exact render
// operation input — the composition instruction, AE plan, plan canonical timeline hash, referenced
// generated-asset sha256s and worker capability version. The same key replayed against a
// different composition (or a different plan/timeline/capability) is a conflict
// (IDEMPOTENCY_INPUT_CONFLICT), never a silent replay of the wrong final video. The hash is
// retained on RenderAttempt.idempotencyInputHash and compared on lookup.
function computeRenderIdempotencyInputHash({
  compositionInstructionId,
  aePlanId,
  planCanonicalHash,
  inputAssetHashes,
  capabilityVersion
}) {
  const canonical = JSON.stringify({
    compositionInstructionId,
    aePlanId,
    planCanonicalHash,
    inputAssetHashes,
    capabilityVersion
  });
  return createHash("sha256").update(canonical).digest("hex");
}

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

export function createStore(env = process.env, dependencies = {}) {
  if (env.V0_RUNTIME_DB === "prisma") {
    return createPrismaWorkspaceStore(env, dependencies);
  }
  if (!["test", "development", "local"].includes(String(env.APP_ENV ?? "development").toLowerCase())) {
    throw new Error("V0_RUNTIME_DB=prisma is required outside local and test environments");
  }
  return createWorkspaceStore(env, dependencies);
}

export function createWorkspaceStore(env = process.env, dependencies = {}) {
  const objectStorage = dependencies.objectStorage ?? createObjectStorage(env);
  const users = new Map();
  const workspaces = new Map();
  const memberships = new Map();
  const audits = [];
  const idempotencyRecords = new Map();
  const artifacts = new Map();
  const brands = new Map();
  const brandCrawlRuns = new Map();
  const brandAssets = new Map();
  const brandCandidates = new Map();
  const brandProfiles = new Map();
  const userProfiles = new Map();
  const brandContexts = new Map();
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
  // V0-C1 validated composition intent and AE plan. The composition instruction holds
  // the user direction bound to a retained generated asset; the AE plan holds the
  // versioned timeline JSON and the validation outcome. The plan artifact is a retained
  // Artifact row whose sha256 is the canonical timeline hash.
  const compositionInstructions = new Map();
  const aePlans = new Map();
  // V0-C2 reproducible final branded render. A render attempt is persisted RUNNING before the
  // AE worker runs, then SUCCEEDED with the retained final-video output hash or FAILED for
  // capability drift, incompatible output or an unrecovered crash. The final video is the
  // versioned, immutable production object; a new revision supersedes the prior current row
  // without overwriting it. The render attempt logs and final media are retained CLEAN
  // Artifacts. The input hash, asset hashes and sha256 are server-side validation bindings.
  const renderAttempts = new Map();
  const finalVideos = new Map();
  // V0-R1 exact-version review and comments. A review item is bound to one exact final-video
  // version (finalVideoId + captured finalVideoSha256 + finalVideoVersion); comments are
  // append-only and timestamped; a comment against a superseded version is rejected
  // (REVIEW_VERSION_STALE) and archives the review item without rewriting prior comments;
  // repeated comment activity on one review item collapses to one logical notification.
  const reviewItems = new Map();
  const reviewComments = new Map();
  const notifications = new Map();
  const reviewDecisions = new Map();
  // V0-U1 approved calendar and manual export fallback. A calendar post is bound to one approved
  // exact final-video version (finalVideoId + captured finalVideoSha256 + finalVideoVersion + the
  // R2 approval_token). A scheduled post (manualExport false) requires a valid future scheduledAt
  // and is created SCHEDULED; a manual-export post (manualExport true) is created APPROVED with no
  // scheduledAt and produces a retained manual-export Artifact, leaving manualLiveUrl null. A
  // schedule conflict (same workspace + platform + account within the conflict window) is rejected.
  const calendarPosts = new Map();
  // V0-U2 idempotent Meta publication. One PublishOperation per calendar post, persisted
  // BEFORE the Meta network I/O so a crash between persistence and the network response
  // leaves a resumable operation, never a blind duplicate. The request hash is a
  // server-side binding secret and is never surfaced; the public post URL is stored only
  // once the post is live.
  const publishOperations = new Map();
  // V0-U4 audience-facing verification. One PostVerification per calendar post records the
  // independent audience-facing checks, bounded attempts, observed live identity, final result
  // and retained evidence artifact. An initial immutable PerformanceSnapshot anchors the
  // observation window at verification time. Provider acknowledgement alone never becomes
  // success; only a verified result advances the post to published_verified and sends one
  // completion notification.
  const postVerifications = new Map();
  const performanceSnapshots = new Map();
  // V0-A1 performance_collect idempotency: one collected snapshot per (workspaceId, idempotencyKey).
  // A same-key replay returns the retained snapshot with replay:true; a same key with different
  // details is an input conflict. Later collects with fresh keys create new immutable snapshots.
  const performanceCollectRecords = new Map();
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

  async function initiateArtifactUpload(actor, input) {
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
    const targetBrand = input.brandId ? brands.get(input.brandId) : null;
    if (input.brandId && (!targetBrand || targetBrand.workspaceId !== input.workspaceId || targetBrand.status !== "ACTIVE")) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
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
    upload.url = objectStorage.provider === "b2"
      ? await objectStorage.createSignedUploadUrl({ area: "quarantine", key: artifact.objectKey, contentType: artifact.contentType })
      : `/api/v0/brands/assets/uploads/${artifact.id}/content?token=${encodeURIComponent(upload.token)}`;
    upload.headers = { "content-type": artifact.contentType };
    artifacts.set(artifact.id, artifact);
    let brandAsset = null;
    if (targetBrand) {
      brandAsset = {
        id: randomUUID(), workspaceId: input.workspaceId, brandId: targetBrand.id, crawlRunId: null,
        artifactId: artifact.id, rightsBasis: input.rightsBasis.trim(), permittedUse: input.permittedUse.trim(),
        status: "ACTIVE", createdAt: now, updatedAt: now
      };
      brandAssets.set(brandAsset.id, brandAsset);
    }
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
        brandAsset: brandAsset ? publicBrandAsset(brandAsset, artifact) : null,
        upload
      }
    };
  }

  async function putArtifactUpload(token, artifactId, body, contentType) {
    const grant = uploadTokens.get(token);
    const artifact = artifacts.get(artifactId);
    if (!grant || grant.artifactId !== artifactId || !artifact || artifact.status !== "QUARANTINED" || Date.parse(grant.expiresAt) <= Date.now()) {
      return { ok: false, problem: problem("UPLOAD_URL_EXPIRED", 403, "Upload URL expired", "Request a new upload URL and try again.") };
    }
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > artifact.byteSize || contentType !== artifact.contentType) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "The uploaded file did not match the initiated upload.") };
    }
    await objectStorage.putObject({ area: "quarantine", key: artifact.objectKey, body, contentType, sha256: artifact.sha256 });
    return { ok: true, response: { uploaded: true } };
  }

  async function completeArtifactUpload(actor, artifactId, input) {
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
    if (artifact.status === "CLEAN") {
      if (input.sha256.toLowerCase() === artifact.sha256 && input.byteSize === artifact.byteSize) {
        return { ok: true, response: { artifact: publicArtifact(artifact) } };
      }
      return { ok: false, problem: { ...problem("ARTIFACT_HASH_MISMATCH", 409, "Artifact hash mismatch", "The file did not match the retained asset."), artifact: publicArtifact(artifact) } };
    }

    let bytes;
    try {
      bytes = await objectStorage.getObject({ area: "quarantine", key: artifact.objectKey });
    } catch {
      return { ok: false, problem: problem("UPLOAD_URL_EXPIRED", 409, "Upload is incomplete", "Upload the file before completing this asset.") };
    }
    const retainedHash = createHash("sha256").update(bytes).digest("hex");
    if (input.sha256.toLowerCase() !== artifact.sha256 || input.byteSize !== artifact.byteSize || bytes.length !== artifact.byteSize || retainedHash !== artifact.sha256) {
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

    const cleanObjectKey = artifact.objectKey.replace(/^quarantine\//, "clean-media/");
    try {
      await objectStorage.copyObject({
        sourceArea: "quarantine", sourceKey: artifact.objectKey,
        destinationArea: "clean-media", destinationKey: cleanObjectKey,
        contentType: artifact.contentType, sha256: artifact.sha256
      });
      const promoted = await objectStorage.headObject({ area: "clean-media", key: cleanObjectKey });
      if (promoted.byteSize !== artifact.byteSize) throw new Error("ARTIFACT_STORAGE_VERIFICATION_FAILED");
    } catch {
      return { ok: false, problem: problem("DEPENDENCY_UNAVAILABLE", 503, "Storage unavailable", "The asset remains quarantined. Try completion again.", true) };
    }
    const quarantineObjectKey = artifact.objectKey;
    artifact.objectKey = cleanObjectKey;
    artifact.status = "CLEAN";
    artifact.retentionClass = "clean-media";
    artifact.updatedAt = new Date().toISOString();
    await objectStorage.deleteObject({ area: "quarantine", key: quarantineObjectKey }).catch(() => undefined);
    return {
      ok: true,
      response: {
        artifact: publicArtifact(artifact)
      }
    };
  }

  async function createArtifactDownload(actor, artifactId, input) {
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
    download.url = await objectStorage.createSignedDownloadUrl({ area: "clean-media", key: artifact.objectKey });
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
    const normalizedDomain = new URL(validation.normalizedUrl).hostname.toLowerCase();
    let brand = [...brands.values()].find(
      (candidate) => candidate.workspaceId === input.workspaceId && candidate.normalizedDomain === normalizedDomain
    );
    const claimedByAnotherBrand = validation.assets.some((assetInput) =>
      [...brandAssets.values()].some((asset) => asset.artifactId === assetInput.artifactId && (!brand || asset.brandId !== brand.id))
    );
    if (claimedByAnotherBrand) {
      return { ok: false, problem: problem("BRAND_ASSET_NOT_APPROVED", 409, "Brand asset not approved", "This asset belongs to a different brand.") };
    }
    if (!brand) {
      const requestedName = optionalString(input.brandName);
      brand = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        name: requestedName ?? recognizableBrandName(normalizedDomain),
        slug: uniqueBrandSlug(brands, input.workspaceId, requestedName ?? normalizedDomain),
        websiteUrl: validation.normalizedUrl,
        normalizedDomain,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now
      };
      brands.set(brand.id, brand);
    } else if (optionalString(input.brandName) && brand.name !== input.brandName.trim()) {
      brand.name = input.brandName.trim();
      brand.updatedAt = now;
    }
    const crawlRun = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      brandId: brand.id,
      sourceUrl: input.websiteUrl.trim(),
      normalizedUrl: validation.normalizedUrl,
      status: "QUEUED",
      rightsAcknowledged: true,
      crawlScope: validation.crawlScope,
      selectedBrandType: validation.selectedBrandType,
      detectedBrandType: null,
      extractionSchemaVersion: null,
      providerCreditTelemetry: null,
      robotsPolicy: { status: "pending" },
      crawlProvider: resolveCrawlProviderStatus(env),
      createdAt: now,
      updatedAt: now
    };
    const retainedAssets = validation.assets.map((assetInput) => ({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      brandId: brand.id,
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
        selectedBrandType: validation.selectedBrandType,
        brandAssetIds: retainedAssets.map((asset) => asset.id)
      }),
      input: {
        requestId,
        traceId,
        brandCrawlRunId: crawlRun.id,
        brandId: brand.id,
        normalizedUrl: crawlRun.normalizedUrl,
        crawlScope: crawlRun.crawlScope,
        selectedBrandType: validation.selectedBrandType,
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
        brand: publicBrand(brand),
        crawlRun: publicBrandCrawlRun(crawlRun),
        brandAssets: retainedAssets.map((asset) => publicBrandAsset(asset, artifacts.get(asset.artifactId))),
        job: publicJob(job),
        outboxEvent: publicOutboxEvent(outbox)
      }
    };
  }

  function listBrands(actor, workspaceId) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    return {
      ok: true,
      response: {
        brands: [...brands.values()]
          .filter((brand) => brand.workspaceId === workspaceId && brand.status === "ACTIVE")
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map(publicBrand)
      }
    };
  }

  function listBrandAssets(actor, brandId) {
    const brand = brands.get(brandId);
    if (!brand || !getWorkspaceForActor(actor, brand.workspaceId)) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    return {
      ok: true,
      response: {
        brand: publicBrand(brand),
        assets: [...brandAssets.values()]
          .filter((asset) => asset.brandId === brandId && asset.status === "ACTIVE" && artifacts.get(asset.artifactId)?.status === "CLEAN")
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map((asset) => publicBrandAsset(asset, artifacts.get(asset.artifactId)))
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

  function updateBrandCandidateDecision(actor, crawlRunId, candidateId, decision) {
    const crawlRun = brandCrawlRuns.get(crawlRunId);
    if (!crawlRun || !getWorkspaceForActor(actor, crawlRun.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const candidate = brandCandidates.get(candidateId);
    if (!candidate || candidate.crawlRunId !== crawlRunId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    candidate.decision = decision;
    brandCandidates.set(candidateId, candidate);
    return {
      ok: true,
      response: { success: true, candidate: publicBrandCandidate(candidate) }
    };
  }

  function getBrandCrawlRun(actor, crawlRunId) {
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
        brandAssets: [...brandAssets.values()]
          .filter((asset) => asset.crawlRunId === crawlRun.id)
          .map((asset) => publicBrandAsset(asset, artifacts.get(asset.artifactId))),
        candidates: [...brandCandidates.values()].filter((candidate) => candidate.crawlRunId === crawlRun.id).map(publicBrandCandidate)
      }
    };
  }

  function getBrandAssetPack(actor, crawlRunId) {
    const detail = getBrandCrawlRun(actor, crawlRunId);
    if (!detail.ok) return detail;
    const candidates = detail.response.candidates;
    const byGroup = (types) => candidates.filter((candidate) => types.includes(candidate.fieldType));
    return {
      ok: true,
      response: {
        crawlRun: detail.response.crawlRun,
        assetPack: {
          identity: byGroup(["identity", "summary", "color", "font", "logo", "media_asset"]),
          messaging: byGroup(["copy_messaging", "usp", "cta", "audience", "tone", "positioning"]),
          offers: byGroup(["offer", "pricing", "product", "service"]),
          trustProof: byGroup(["social_proof", "testimonial", "rating", "certification", "award", "case_study", "metric"]),
          vertical: byGroup(["vertical_conflict", "product_service", "claim", "metadata"]),
          mediaInventory: byGroup(["visual_identity", "color", "font", "logo", "media_asset"]),
          voice: byGroup(["voice", "tone", "audience"]),
          publishingSocial: byGroup(["publishing_social"]),
          complianceRights: byGroup(["prohibited_claim", "regulated_claim", "rights_warning", "disclaimer", "rights_asset"]),
          missingAssets: byGroup(["missing_asset"]),
          readiness: {
            score: calculateBrandCandidateReadiness(candidates),
            status: candidates.length > 0 ? "approval_required" : "missing_assets"
          }
        }
      }
    };
  }

  function getUserProfile(actor) {
    return { ok: true, response: { profile: publicUserProfile(userProfiles.get(actor.userId) ?? defaultUserProfile(actor)) } };
  }

  function updateUserProfile(actor, input) {
    const now = new Date().toISOString();
    const existing = userProfiles.get(actor.userId) ?? defaultUserProfile(actor, now);
    const profile = {
      ...existing,
      name: optionalString(input.name),
      contactEmail: optionalString(input.contactEmail) ?? actor.email ?? null,
      websiteUrl: optionalString(input.websiteUrl),
      industry: optionalString(input.industry),
      primaryMarket: optionalString(input.primaryMarket),
      language: optionalString(input.language) ?? "en-IN",
      onboardingSkipped: Boolean(input.onboardingSkipped),
      updatedAt: now
    };
    userProfiles.set(actor.userId, profile);
    return { ok: true, response: { profile: publicUserProfile(profile) } };
  }

  function getOnboardingBrandContext(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    return { ok: true, response: { brandContext: publicBrandContext(brandContexts.get(`${input.workspaceId}:${actor.userId}`) ?? null) } };
  }

  function saveOnboardingBrandContext(actor, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    if (typeof input.brandName !== "string" || input.brandName.trim().length === 0) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    const now = new Date().toISOString();
    const id = `${input.workspaceId}:${actor.userId}`;
    const existing = brandContexts.get(id);
    const brandContext = {
      id: existing?.id ?? randomUUID(),
      workspaceId: input.workspaceId,
      userId: actor.userId,
      brandName: input.brandName.trim(),
      websiteUrl: optionalString(input.websiteUrl),
      industry: optionalString(input.industry),
      videoGoal: optionalString(input.videoGoal),
      primaryMarket: optionalString(input.primaryMarket) ?? "India",
      language: optionalString(input.language) ?? "en-IN",
      targetPlatforms: Array.isArray(input.targetPlatforms) ? input.targetPlatforms.filter((value) => typeof value === "string") : [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    brandContexts.set(id, brandContext);
    return { ok: true, response: { brandContext: publicBrandContext(brandContext) } };
  }

  function approveBrandProfile(actor, brandId, input) {
    const crawlRun = brandCrawlRuns.get(input.crawlRunId);
    if (!crawlRun || crawlRun.workspaceId !== input.workspaceId || crawlRun.brandId !== brandId || !getWorkspaceForActor(actor, input.workspaceId)) {
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

  // V0-C1: validate a composition intent and AE plan against the deterministic capability
  // registry. Composition planning is not a paid or externally visible mutation, so no
  // idempotency key is required and no credit ledger entry is written. The plan is
  // retained in both outcomes: a valid plan becomes `validated` with a CLEAN plan artifact;
  // a malformed plan or capability mismatch becomes `validation_failed` with every
  // unsupported item explained. A referenced asset that is missing, cross-workspace or not
  // clean is reported as AE_ASSET_MISSING so cross-workspace existence never leaks.
  async function createCompositionPlan(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const registry = aeCapabilityRegistry(env);
    const now = new Date().toISOString();

    // resolveAsset looks up a retained CLEAN generated asset in the caller's workspace.
    // A cross-workspace asset id is not in this workspace's generatedAssets map, so it
    // resolves to null and is reported as AE_ASSET_MISSING without leaking the other
    // workspace's asset id.
    const resolveAsset = async (assetId) => {
      const asset = generatedAssets.get(assetId);
      if (!asset || asset.workspaceId !== workspaceId) {
        return null;
      }
      return { id: asset.id, status: String(asset.status || "").toUpperCase() };
    };

    const validation = await validateAePlan(input.timeline, registry, resolveAsset);

    const instructionId = randomUUID();
    const planId = randomUUID();
    const instruction = {
      id: instructionId,
      workspaceId,
      actorUserId: actor.userId,
      generationAssetId: input.generationAssetId,
      inputMode: input.inputMode,
      rawDirection: input.rawDirection ?? null,
      status: "planning",
      version: 1,
      createdAt: now,
      updatedAt: now
    };

    // Canonical timeline JSON: a stable key order makes the plan artifact sha256
    // reproducible across retries. The hash is retained server-side only; it never
    // reaches the browser response.
    const canonicalTimeline = JSON.stringify(
      {
        schemaVersion: input.timeline?.schemaVersion ?? null,
        capabilityVersion: input.timeline?.capabilityVersion ?? null,
        durationSeconds: input.timeline?.durationSeconds ?? null,
        resolution: input.timeline?.resolution ?? null,
        tracks: input.timeline?.tracks ?? [],
        overlays: input.timeline?.overlays ?? [],
        effects: input.timeline?.effects ?? [],
        fonts: input.timeline?.fonts ?? [],
        plugins: input.timeline?.plugins ?? [],
        templates: input.timeline?.templates ?? []
      },
      null,
      0
    );
    const planArtifactSha256 = createHash("sha256").update(canonicalTimeline).digest("hex");

    let planArtifact = null;
    const persistPlan = (status, unsupportedItems) => {
      const plan = {
        id: planId,
        workspaceId,
        compositionInstructionId: instructionId,
        version: 1,
        capabilityVersion: registry.capabilityVersion,
        schemaVersion: AE_PLAN_SCHEMA_VERSION,
        timeline: input.timeline ?? null,
        status,
        unsupportedItems,
        planArtifactId: null,
        validatedAt: status === "validated" ? now : null,
        createdAt: now,
        updatedAt: now
      };
      aePlans.set(planId, plan);
      return plan;
    };

    if (validation.ok) {
      instruction.status = "validated";
      instruction.updatedAt = now;
      compositionInstructions.set(instructionId, instruction);
      const plan = persistPlan("validated", []);
      planArtifact = {
        id: randomUUID(),
        workspaceId,
        fileName: `composition-plan-${instructionId}.json`,
        contentType: "application/json",
        byteSize: Buffer.byteLength(canonicalTimeline, "utf8"),
        sha256: planArtifactSha256,
        status: "CLEAN",
        retentionClass: "plan-artifact",
        producer: `composition:${instructionId}`,
        schemaVersion: AE_PLAN_SCHEMA_VERSION,
        objectKey: `plan-artifacts/${workspaceId}/${randomUUID()}.json`,
        createdAt: now,
        updatedAt: now
      };
      artifacts.set(planArtifact.id, planArtifact);
      plan.planArtifactId = planArtifact.id;
      plan.updatedAt = now;
      aePlans.set(planId, plan);
      const audit = {
        id: randomUUID(),
        workspaceId,
        actorUserId: actor.userId,
        eventType: "composition.plan_validated",
        targetType: "CompositionInstruction",
        targetId: instructionId,
        reason: "validated",
        occurredAt: now
      };
      audits.push(audit);
      return {
        ok: true,
        response: {
          composition: publicCompositionInstruction(instruction),
          plan: publicAePlan(plan),
          artifact: publicArtifact(planArtifact),
          audit: publicAudit(audit)
        }
      };
    }

    // Validation failed: retain the instruction and plan as validation_failed with every
    // unsupported item explained. No plan artifact is retained for a failed plan.
    instruction.status = "validation_failed";
    instruction.updatedAt = now;
    compositionInstructions.set(instructionId, instruction);
    const plan = persistPlan("validation_failed", validation.unsupported);
    const audit = {
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "composition.validation_failed",
      targetType: "CompositionInstruction",
      targetId: instructionId,
      reason: validation.primary.code,
      occurredAt: now
    };
    audits.push(audit);
    const problemDetail = problem(
      validation.primary.code,
      validation.primary.status,
      "Composition plan validation failed",
      validation.primary.detail
    );
    problemDetail.planStatus = "validation_failed";
    problemDetail.compositionId = instructionId;
    problemDetail.planId = planId;
    problemDetail.unsupported = validation.unsupported;
    return { ok: false, problem: problemDetail };
  }

  // V0-C2: render a validated composition plan into one retained 9:16 final MP4, thumbnail
  // and captions through the deterministic AE worker simulator. Render is a costly mutation
  // producing retained artifacts, so an Idempotency-Key is required and the RenderAttempt is
  // persisted RUNNING (with the CLEAN render-logs artifact and a render_started audit) BEFORE
  // the AE worker runs — persist external side-effect operation before the work. The worker
  // output is validated against the plan (capability version, input hash, codec, resolution,
  // duration, golden output hash) before any final media is retained. A succeeded render
  // retains a versioned FinalVideo (CURRENT) and supersedes the prior CURRENT final video
  // (set to SUPERSEDED) without overwriting it, preserving the immutable revision lineage;
  // the final-video sha256 is the deterministic golden render hash, so the same plan renders
  // to the same hash across revisions. A worker crash is recovered once: the first call
  // persists RUNNING and returns DEPENDENCY_UNAVAILABLE; a second call with the same
  // idempotency key resumes the RUNNING attempt and completes. Capability drift and
  // incompatible worker output are classified (AE_CAPABILITY_UNAVAILABLE / AE_RENDER_FAILED)
  // and never retain a final video. Cross-workspace existence never leaks.
  async function renderCompositionPlan(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const instruction = compositionInstructions.get(input.compositionInstructionId);
    if (!instruction || instruction.workspaceId !== workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    // Only a validated plan can be rendered. The plan is loaded by composition instruction;
    // a validation_failed plan has no renderable timeline.
    const plan = [...aePlans.values()].find(
      (candidate) =>
        candidate.compositionInstructionId === instruction.id &&
        candidate.workspaceId === workspaceId &&
        candidate.status === "validated"
    );
    if (!plan) {
      const problemDetail = problem(
        "AE_PLAN_SCHEMA_INVALID",
        422,
        "Composition plan not renderable",
        "Only a validated composition plan can be rendered."
      );
      problemDetail.compositionId = instruction.id;
      return { ok: false, problem: problemDetail };
    }

    const now = new Date().toISOString();
    const canonicalTimeline = JSON.stringify(
      {
        schemaVersion: plan.timeline?.schemaVersion ?? null,
        capabilityVersion: plan.timeline?.capabilityVersion ?? null,
        durationSeconds: plan.timeline?.durationSeconds ?? null,
        resolution: plan.timeline?.resolution ?? null,
        tracks: plan.timeline?.tracks ?? [],
        overlays: plan.timeline?.overlays ?? [],
        effects: plan.timeline?.effects ?? [],
        fonts: plan.timeline?.fonts ?? [],
        plugins: plan.timeline?.plugins ?? [],
        templates: plan.timeline?.templates ?? []
      },
      null,
      0
    );
    const planCanonicalHash = createHash("sha256").update(canonicalTimeline).digest("hex");
    const durationSeconds = Number(plan.timeline?.durationSeconds) || 30;
    const expectedCapabilityVersion = plan.capabilityVersion;

    // inputAssetHashes: the sha256s of the retained CLEAN generated assets referenced by the
    // plan tracks, in the caller's workspace. A cross-workspace asset id is not in this
    // workspace's generatedAssets map and is omitted; the binding is server-side only.
    const inputAssetHashes = [];
    for (const track of plan.timeline?.tracks ?? []) {
      if (!track?.assetId) continue;
      const asset = generatedAssets.get(track.assetId);
      if (asset && asset.workspaceId === workspaceId) {
        inputAssetHashes.push(asset.sha256);
      }
    }

    // V0-C2 render idempotency is input-bound: the idempotency key is scoped to the exact render
    // operation input (composition instruction, AE plan, plan canonical hash, input asset hashes,
    // capability version). The same key replayed against a different composition is a conflict,
    // never a silent replay of the wrong final video.
    const idempotencyInputHash = computeRenderIdempotencyInputHash({
      compositionInstructionId: instruction.id,
      aePlanId: plan.id,
      planCanonicalHash,
      inputAssetHashes,
      capabilityVersion: expectedCapabilityVersion
    });

    // Idempotency: an existing attempt by (workspaceId, idempotencyKey) is replayed or resumed.
    const existing = [...renderAttempts.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId && candidate.idempotencyKey === input.idempotencyKey
    );

    // The same key used with a different render operation input is a conflict. Legacy rows with
    // no input hash (null) skip this check and replay as before.
    if (existing && existing.idempotencyInputHash && existing.idempotencyInputHash !== idempotencyInputHash) {
      return {
        ok: false,
        problem: problem(
          "IDEMPOTENCY_INPUT_CONFLICT",
          409,
          "Idempotency input conflict",
          "This request identity was already used with different render details."
        )
      };
    }

    if (existing && existing.status === "succeeded") {
      const finalVideo = [...finalVideos.values()].find(
        (candidate) => candidate.workspaceId === workspaceId && candidate.renderAttemptId === existing.id
      ) ?? null;
      const replayLineage = finalVideo
        ? [...creativeLineages.values()].find(
            (candidate) => candidate.workspaceId === workspaceId && candidate.finalVideoId === finalVideo.id
          ) ?? null
        : null;
      const refreshedInstruction = compositionInstructions.get(instruction.id);
      const successAudit = [...audits].find(
        (audit) =>
          audit.workspaceId === workspaceId &&
          audit.eventType === "composition.render_succeeded" &&
          audit.targetId === instruction.id
      ) || null;
      return {
        ok: true,
        response: buildRenderSuccessResponse(existing, finalVideo, refreshedInstruction, successAudit, {
          lineage: replayLineage
        })
      };
    }
    if (existing && existing.status === "failed") {
      return {
        ok: false,
        problem: buildRenderFailureProblem(existing, instruction.id)
      };
    }

    // No terminal attempt for this idempotency key. If a RUNNING attempt exists (crash
    // window), resume it; otherwise persist a new RUNNING attempt before the worker runs.
    let attempt = existing;
    if (!attempt) {
      const attemptId = randomUUID();
      const logsArtifact = {
        id: randomUUID(),
        workspaceId,
        fileName: `render-logs-${attemptId}.json`,
        contentType: "application/json",
        byteSize: RENDER_LOG_BYTE_SIZE,
        sha256: createHash("sha256").update(`render-logs:${attemptId}`).digest("hex"),
        status: "CLEAN",
        retentionClass: "render-logs",
        producer: `render:${attemptId}:logs`,
        schemaVersion: AE_RENDER_SCHEMA_VERSION,
        objectKey: `render-logs/${workspaceId}/${attemptId}.json`,
        createdAt: now,
        updatedAt: now
      };
      artifacts.set(logsArtifact.id, logsArtifact);
      attempt = {
        id: attemptId,
        workspaceId,
        compositionInstructionId: instruction.id,
        aePlanId: plan.id,
        version: 1,
        renderer: "ae-render-simulator",
        inputHash: planCanonicalHash,
        inputAssetHashes,
        workerCapabilityVersion: expectedCapabilityVersion,
        idempotencyInputHash,
        outputHash: null,
        status: "running",
        logsArtifactId: logsArtifact.id,
        costMinor: 0,
        idempotencyKey: input.idempotencyKey,
        startedAt: now,
        completedAt: null,
        failureCode: null,
        failureDetail: null,
        createdAt: now,
        updatedAt: now
      };
      renderAttempts.set(attemptId, attempt);
      audits.push({
        id: randomUUID(),
        workspaceId,
        actorUserId: actor.userId,
        eventType: "composition.render_started",
        targetType: "CompositionInstruction",
        targetId: instruction.id,
        reason: "render_started",
        occurredAt: now
      });

      // Crash window: the worker accepted the job but the domain lost the worker before any
      // final media was retained. The RUNNING attempt stays; a second call resumes it.
      if (resolveAeRenderMode(env) === "crash") {
        const problemDetail = problem(
          "DEPENDENCY_UNAVAILABLE",
          503,
          "Render worker unavailable",
          "The render worker is unavailable; retry with the same idempotency key to resume."
        );
        problemDetail.attemptStatus = "running";
        problemDetail.compositionId = instruction.id;
        problemDetail.attemptId = attempt.id;
        problemDetail.retryable = true;
        return { ok: false, problem: problemDetail };
      }
    }

    // Run the AE worker through the adapter only. The adapter returns the render descriptor;
    // transient worker URLs and raw responses stay inside the adapter and never reach here.
    const workerResult = renderAeVideo(env, {
      planCanonicalHash,
      durationSeconds,
      capabilityVersion: expectedCapabilityVersion
    });
    if (!workerResult.ok) {
      return failRenderAttempt(attempt, instruction, actor, "AE_RENDER_FAILED", 422, "The AE worker is not available.");
    }

    const validation = validateAeRenderOutput(workerResult.render, {
      capabilityVersion: expectedCapabilityVersion,
      planCanonicalHash,
      durationSeconds
    });
    if (!validation.ok) {
      return failRenderAttempt(attempt, instruction, actor, validation.code, validation.status, validation.detail);
    }

    // The worker output is valid. Retain the CLEAN final video, thumbnail and captions
    // artifacts, bind them to a new CURRENT FinalVideo, and supersede the prior current.
    const render = workerResult.render;
    const attemptId = attempt.id;
    const finalVideoArtifact = {
      id: randomUUID(),
      workspaceId,
      fileName: `final-video-${attemptId}.mp4`,
      contentType: render.finalVideo.contentType,
      byteSize: render.finalVideo.byteSize,
      sha256: render.finalVideo.sha256,
      status: "CLEAN",
      retentionClass: "final-video",
      producer: `render:${attemptId}:final-video`,
      schemaVersion: AE_RENDER_SCHEMA_VERSION,
      objectKey: `final-videos/${workspaceId}/${attemptId}.mp4`,
      createdAt: now,
      updatedAt: now
    };
    const thumbnailArtifact = {
      id: randomUUID(),
      workspaceId,
      fileName: `final-thumbnail-${attemptId}.jpg`,
      contentType: render.thumbnail.contentType,
      byteSize: render.thumbnail.byteSize,
      sha256: render.thumbnail.sha256,
      status: "CLEAN",
      retentionClass: "final-thumbnail",
      producer: `render:${attemptId}:thumbnail`,
      schemaVersion: AE_RENDER_SCHEMA_VERSION,
      objectKey: `final-thumbnails/${workspaceId}/${attemptId}.jpg`,
      createdAt: now,
      updatedAt: now
    };
    const captionsArtifact = {
      id: randomUUID(),
      workspaceId,
      fileName: `final-captions-${attemptId}.vtt`,
      contentType: render.captions.contentType,
      byteSize: render.captions.byteSize,
      sha256: render.captions.sha256,
      status: "CLEAN",
      retentionClass: "final-captions",
      producer: `render:${attemptId}:captions`,
      schemaVersion: AE_RENDER_SCHEMA_VERSION,
      objectKey: `final-captions/${workspaceId}/${attemptId}.vtt`,
      createdAt: now,
      updatedAt: now
    };
    artifacts.set(finalVideoArtifact.id, finalVideoArtifact);
    artifacts.set(thumbnailArtifact.id, thumbnailArtifact);
    artifacts.set(captionsArtifact.id, captionsArtifact);

    const priorCurrent = [...finalVideos.values()].find(
      (candidate) =>
        candidate.compositionInstructionId === instruction.id &&
        candidate.workspaceId === workspaceId &&
        candidate.status === "current"
    );
    const nextVersion = priorCurrent ? Number(priorCurrent.version) + 1 : 1;
    const finalVideo = {
      id: randomUUID(),
      workspaceId,
      compositionInstructionId: instruction.id,
      renderAttemptId: attemptId,
      version: nextVersion,
      status: "current",
      finalVideoArtifactId: finalVideoArtifact.id,
      thumbnailArtifactId: thumbnailArtifact.id,
      captionsArtifactId: captionsArtifact.id,
      durationSeconds,
      resolution: render.finalVideo.resolution,
      codec: render.finalVideo.codec,
      sha256: render.finalVideo.sha256,
      byteSize: render.finalVideo.byteSize,
      capabilityVersion: expectedCapabilityVersion,
      schemaVersion: AE_RENDER_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    };
    finalVideos.set(finalVideo.id, finalVideo);

    let supersededFinalVideo = null;
    let supersededAudit = null;
    if (priorCurrent) {
      priorCurrent.status = "superseded";
      priorCurrent.updatedAt = now;
      finalVideos.set(priorCurrent.id, priorCurrent);
      supersededFinalVideo = priorCurrent;
      supersededAudit = {
        id: randomUUID(),
        workspaceId,
        actorUserId: actor.userId,
        eventType: "composition.video_superseded",
        targetType: "CompositionInstruction",
        targetId: instruction.id,
        reason: "superseded",
        occurredAt: now
      };
      audits.push(supersededAudit);
    }

    // Mark the attempt SUCCEEDED with the retained output hash and complete the composition.
    attempt.status = "succeeded";
    attempt.outputHash = render.finalVideo.sha256;
    attempt.workerCapabilityVersion = render.workerCapabilityVersion;
    attempt.completedAt = now;
    attempt.updatedAt = now;
    renderAttempts.set(attempt.id, attempt);

    instruction.status = "rendered";
    instruction.updatedAt = now;
    compositionInstructions.set(instruction.id, instruction);

    // V0-C2 render-level lineage: an immutable CreativeLineage row tying the retained final video
    // back through the composition instruction, AE plan and render attempt, copying the G5
    // generated-asset ancestry in-row. A revision creates a new lineage row for the new final
    // video and never overwrites the prior row.
    const g5Lineage = [...creativeLineages.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId && candidate.generatedAssetId === instruction.generationAssetId
    ) ?? null;
    const renderLineage = {
      id: randomUUID(),
      workspaceId,
      generationJobId: null,
      brandProfileId: g5Lineage ? g5Lineage.brandProfileId : null,
      selectedScriptId: g5Lineage ? g5Lineage.selectedScriptId ?? null : null,
      avatarProfileId: g5Lineage ? g5Lineage.avatarProfileId ?? null : null,
      estimateId: g5Lineage ? g5Lineage.estimateId : null,
      provider: g5Lineage ? g5Lineage.provider : null,
      providerOperationId: g5Lineage ? g5Lineage.providerOperationId : null,
      priceVersion: g5Lineage ? g5Lineage.priceVersion : null,
      generatedAssetId: instruction.generationAssetId,
      compositionInstructionId: instruction.id,
      aePlanId: plan.id,
      renderAttemptId: attemptId,
      finalVideoId: finalVideo.id,
      createdAt: now,
      updatedAt: now
    };
    creativeLineages.set(renderLineage.id, renderLineage);

    const successAudit = {
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "composition.render_succeeded",
      targetType: "CompositionInstruction",
      targetId: instruction.id,
      reason: "render_succeeded",
      occurredAt: now
    };
    audits.push(successAudit);

    return {
      ok: true,
      response: buildRenderSuccessResponse(attempt, finalVideo, instruction, successAudit, {
        finalVideoArtifact,
        thumbnailArtifact,
        captionsArtifact,
        supersededFinalVideo,
        supersededAudit,
        lineage: renderLineage
      })
    };
  }

  // Mark a render attempt FAILED and return the classified problem. The attempt was already
  // persisted RUNNING with a render-logs artifact; a failure completes it without retaining
  // any final media. The failure code and detail are retained on the attempt so an
  // idempotency-key replay reconstructs the same problem without re-running the worker.
  function failRenderAttempt(attempt, instruction, actor, code, status, detail) {
    const now = new Date().toISOString();
    attempt.status = "failed";
    attempt.completedAt = now;
    attempt.updatedAt = now;
    attempt.failureCode = code;
    attempt.failureDetail = detail;
    renderAttempts.set(attempt.id, attempt);
    audits.push({
      id: randomUUID(),
      workspaceId: attempt.workspaceId,
      actorUserId: actor.userId,
      eventType: "composition.render_failed",
      targetType: "CompositionInstruction",
      targetId: instruction.id,
      reason: code,
      occurredAt: now
    });
    const problemDetail = problem(code, status, "Composition render failed", detail);
    problemDetail.attemptStatus = "failed";
    problemDetail.compositionId = instruction.id;
    problemDetail.attemptId = attempt.id;
    return { ok: false, problem: problemDetail };
  }

  function buildRenderFailureProblem(attempt, instructionId) {
    const status = attempt.failureCode === "AE_CAPABILITY_UNAVAILABLE" ? 409 : 422;
    const problemDetail = problem(
      attempt.failureCode || "AE_RENDER_FAILED",
      status,
      "Composition render failed",
      attempt.failureDetail || "The render attempt failed previously."
    );
    problemDetail.attemptStatus = "failed";
    problemDetail.compositionId = instructionId;
    problemDetail.attemptId = attempt.id;
    return problemDetail;
  }

  function buildRenderSuccessResponse(attempt, finalVideo, instruction, successAudit, retained = {}) {
    const logsArtifact = attempt.logsArtifactId ? artifacts.get(attempt.logsArtifactId) : null;
    const response = {
      attempt: publicRenderAttempt(attempt),
      finalVideo: publicFinalVideo(finalVideo),
      composition: publicCompositionInstruction(instruction),
      audit: successAudit ? publicAudit(successAudit) : null,
      artifacts: {
        finalVideo: retained.finalVideoArtifact
          ? publicArtifact(retained.finalVideoArtifact)
          : (finalVideo ? publicArtifact(artifacts.get(finalVideo.finalVideoArtifactId)) : null),
        thumbnail: retained.thumbnailArtifact
          ? publicArtifact(retained.thumbnailArtifact)
          : (finalVideo ? publicArtifact(artifacts.get(finalVideo.thumbnailArtifactId)) : null),
        captions: retained.captionsArtifact
          ? publicArtifact(retained.captionsArtifact)
          : (finalVideo ? publicArtifact(artifacts.get(finalVideo.captionsArtifactId)) : null),
        logs: logsArtifact ? publicArtifact(logsArtifact) : null
      }
    };
    if (retained.supersededFinalVideo) {
      response.supersededFinalVideo = publicFinalVideo(retained.supersededFinalVideo);
    }
    if (retained.supersededAudit) {
      response.supersededAudit = publicAudit(retained.supersededAudit);
    }
    if (retained.lineage) {
      response.lineage = publicCreativeLineage(retained.lineage);
    }
    return response;
  }

  // V0-R1: open a review item bound to one exact final-video version. The opener must be a
  // production role (Owner/Admin/Client Manager). One review item exists per exact final-video
  // version: a second open for the same final video (with any idempotency key) replays the same
  // review item, never a second item. Opening a review item for an already-superseded final video
  // is rejected (REVIEW_VERSION_STALE). A cross-workspace final-video id is not in this
  // workspace and is hidden behind the same existence-hiding 404.
  async function createReviewItem(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const finalVideo = [...finalVideos.values()].find(
      (candidate) => candidate.id === input.finalVideoId && candidate.workspaceId === workspaceId
    );
    if (!finalVideo) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (String(finalVideo.status || "").toLowerCase() !== "current") {
      return {
        ok: false,
        problem: problem(
          "REVIEW_VERSION_STALE",
          409,
          "Review version stale",
          "This final-video version is no longer current. Open a review item for the latest version."
        )
      };
    }
    const reviewStage = normalizeReviewStage(input.reviewStage);
    if (!reviewStage) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Review stage must be internal_review or client_review.")
      };
    }
    // One review item per exact final-video version: replay the existing item.
    const existing = [...reviewItems.values()].find(
      (candidate) => candidate.workspaceId === workspaceId && candidate.finalVideoId === finalVideo.id
    );
    if (existing) {
      const existingAudit =
        audits.find(
          (audit) =>
            audit.workspaceId === workspaceId &&
            audit.eventType === "review.created" &&
            audit.targetId === existing.id
        ) ?? null;
      return {
        ok: true,
        response: {
          reviewItem: publicReviewItem(existing),
          audit: existingAudit ? publicAudit(existingAudit) : null
        }
      };
    }
    const now = new Date().toISOString();
    const reviewItem = {
      id: randomUUID(),
      workspaceId,
      compositionInstructionId: finalVideo.compositionInstructionId,
      finalVideoId: finalVideo.id,
      finalVideoSha256: finalVideo.sha256,
      finalVideoVersion: Number(finalVideo.version),
      reviewStage,
      status: reviewStage,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now
    };
    reviewItems.set(reviewItem.id, reviewItem);
    const audit = {
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "review.created",
      targetType: "ReviewItem",
      targetId: reviewItem.id,
      reason: "review_opened",
      occurredAt: now
    };
    audits.push(audit);
    return {
      ok: true,
      response: {
        reviewItem: publicReviewItem(reviewItem),
        audit: publicAudit(audit)
      }
    };
  }

  // V0-R1: add a timestamped append-only comment to a review item. Comment-capable roles
  // (including Reviewer) may comment. A comment against a review item whose bound final video is
  // no longer current is rejected (REVIEW_VERSION_STALE) and the review item is archived; prior
  // comments are preserved. Repeated comment activity on one review item collapses to one
  // logical notification (one row per workspace + payload hash). A cross-workspace review item
  // is hidden behind the same existence-hiding 404. The idempotency-key replay is handled by the
  // store.runIdempotent wrapper in the controller; this method performs the write only.
  async function addReviewComment(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const reviewItem = [...reviewItems.values()].find(
      (candidate) => candidate.id === input.reviewItemId && candidate.workspaceId === workspaceId
    );
    if (!reviewItem) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (body.length === 0 || body.length > 2000) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Comment body must be 1 to 2000 characters.")
      };
    }
    const timestampMs = Number.isInteger(input.timestampMs) ? input.timestampMs : 0;
    if (timestampMs < 0) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Comment timestamp must be zero or positive.")
      };
    }
    // Cross-version guard: the bound final video must still be current. A superseded version
    // archives the review item (idempotent) and rejects the comment; prior comments are kept.
    const finalVideo = finalVideos.get(reviewItem.finalVideoId);
    if (!finalVideo || String(finalVideo.status || "").toLowerCase() !== "current") {
      if (String(reviewItem.status || "").toLowerCase() !== "archived") {
        const archivedAt = new Date().toISOString();
        reviewItem.status = "ARCHIVED";
        reviewItem.updatedAt = archivedAt;
        reviewItems.set(reviewItem.id, reviewItem);
      }
      return {
        ok: false,
        problem: problem(
          "REVIEW_VERSION_STALE",
          409,
          "Review version stale",
          "This review item is bound to a final-video version that has been superseded. Open a review item for the latest version."
        )
      };
    }
    const now = new Date().toISOString();
    const comment = {
      id: randomUUID(),
      workspaceId,
      reviewItemId: reviewItem.id,
      authorUserId: actor.userId,
      body,
      timestampMs,
      threadId: input.threadId ?? null,
      createdAt: now
    };
    reviewComments.set(comment.id, comment);
    // One logical notification per workspace + payload hash. The recipient is the review-item
    // opener (createdByUserId); every comment on one review item collapses to one notification.
    const recipientUserId = reviewItem.createdByUserId;
    const payloadHash = createHash("sha256")
      .update(
        stableJson({
          workspaceId,
          reviewItemId: reviewItem.id,
          notificationType: "review_comment_added",
          recipientUserId
        })
      )
      .digest("hex");
    const existingNotification = [...notifications.values()].find(
      (candidate) => candidate.workspaceId === workspaceId && candidate.payloadHash === payloadHash
    );
    let notification;
    let duplicateCollapsed = false;
    if (existingNotification) {
      duplicateCollapsed = true;
      notification = existingNotification;
    } else {
      notification = {
        id: randomUUID(),
        workspaceId,
        reviewItemId: reviewItem.id,
        notificationType: "review_comment_added",
        channel: "in_app",
        recipientUserId,
        payloadHash,
        status: "SENT",
        createdAt: now,
        sentAt: now
      };
      notifications.set(notification.id, notification);
    }
    const audit = {
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "review.comment_added",
      targetType: "ReviewItem",
      targetId: reviewItem.id,
      reason: "comment_added",
      occurredAt: now
    };
    audits.push(audit);
    return {
      ok: true,
      response: {
        comment: publicReviewComment(comment),
        reviewItem: publicReviewItem(reviewItem),
        notification: publicNotification(notification, duplicateCollapsed),
        audit: publicAudit(audit)
      }
    };
  }

  // V0-R1: read one review item with its preserved comments and a preview of the bound final
  // video and artifacts. No signed URL, secret or object key is surfaced.
  async function getReviewItem(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const reviewItem = [...reviewItems.values()].find(
      (candidate) => candidate.id === input.reviewItemId && candidate.workspaceId === workspaceId
    );
    if (!reviewItem) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const finalVideo = finalVideos.get(reviewItem.finalVideoId) ?? null;
    const comments = [...reviewComments.values()]
      .filter((comment) => comment.reviewItemId === reviewItem.id)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
      .map(publicReviewComment);
    const artifactsPreview = finalVideo
      ? {
          finalVideo: publicArtifact(artifacts.get(finalVideo.finalVideoArtifactId)),
          thumbnail: publicArtifact(artifacts.get(finalVideo.thumbnailArtifactId)),
          captions: publicArtifact(artifacts.get(finalVideo.captionsArtifactId))
        }
      : { finalVideo: null, thumbnail: null, captions: null };
    return {
      ok: true,
      response: {
        reviewItem: publicReviewItem(reviewItem),
        finalVideo: finalVideo ? publicFinalVideo(finalVideo) : null,
        artifacts: artifactsPreview,
        comments
      }
    };
  }

  // V0-R1: list review items for one workspace with cursor pagination, newest first.
  async function listReviewItems(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const limit = normalizeLimit(input.limit);
    const rows = [...reviewItems.values()]
      .filter((item) => item.workspaceId === workspaceId)
      .sort((left, right) => {
        const cmp = String(right.createdAt).localeCompare(String(left.createdAt));
        return cmp !== 0 ? cmp : String(right.id).localeCompare(String(left.id));
      });
    const startIndex = input.cursor ? rows.findIndex((row) => row.id === input.cursor) + 1 : 0;
    const page = rows.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < rows.length ? page[page.length - 1].id : null;
    return {
      ok: true,
      response: {
        items: page.map(publicReviewItem),
        page: { limit, nextCursor }
      }
    };
  }

  // V0-R1: list the append-only comments on one review item in creation order.
  async function listReviewComments(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const reviewItem = [...reviewItems.values()].find(
      (candidate) => candidate.id === input.reviewItemId && candidate.workspaceId === workspaceId
    );
    if (!reviewItem) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const limit = normalizeLimit(input.limit);
    const rows = [...reviewComments.values()]
      .filter((comment) => comment.reviewItemId === reviewItem.id)
      .sort((left, right) => {
        const cmp = String(left.createdAt).localeCompare(String(right.createdAt));
        return cmp !== 0 ? cmp : String(left.id).localeCompare(String(right.id));
      });
    const startIndex = input.cursor ? rows.findIndex((row) => row.id === input.cursor) + 1 : 0;
    const page = rows.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < rows.length ? page[page.length - 1].id : null;
    return {
      ok: true,
      response: {
        items: page.map(publicReviewComment),
        page: { limit, nextCursor }
      }
    };
  }

  // V0-R2: record one terminal review decision (approve/reject/request_changes) against a review
  // item bound to one exact final-video version. The decider must hold approve_reject_final_video
  // (Owner/Admin/Client Manager; enforced in the controller). The decision records the actor,
  // reason, timestamp and the bound final-media fingerprint (finalVideoSha256 + finalVideoVersion).
  // An optimistic version check rejects a stale tab; a superseded bound version is rejected
  // (REVIEW_VERSION_STALE) and the review item is archived. One terminal decision per review
  // item/version: a second attempt is rejected (REVIEW_DECISION_ALREADY_RECORDED). An approve
  // produces a downstream approval reference (token) bound to the exact version that scheduling may
  // later consume; reject/request_changes produce none. A cross-workspace review item is hidden
  // behind the same existence-hiding 404. The idempotency-key replay is handled by the
  // store.runIdempotent wrapper in the controller; this method performs the write only.
  async function recordReviewDecision(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const decisionValue = normalizeApprovalDecision(input.decision);
    if (!decisionValue) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Decision must be approve, reject or request_changes.")
      };
    }
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (reason.length > 2000) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Decision reason must be 2000 characters or fewer.")
      };
    }
    const reviewItem = [...reviewItems.values()].find(
      (candidate) => candidate.id === input.reviewItemId && candidate.workspaceId === workspaceId
    );
    if (!reviewItem) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    // Optimistic version check: the reviewer's tab must be bound to the same exact version. A
    // mismatch means the tab is stale (a newer version exists for the composition).
    if (
      Number.isInteger(input.expectedFinalVideoVersion) &&
      input.expectedFinalVideoVersion !== Number(reviewItem.finalVideoVersion)
    ) {
      return {
        ok: false,
        problem: problem(
          "REVIEW_VERSION_STALE",
          409,
          "Review version stale",
          "Your review tab is bound to a different final-video version. Open a review item for the latest version."
        )
      };
    }
    // Superseded media: the bound final video must still be current. A superseded version archives
    // the review item (idempotent) and rejects the decision; prior comments are kept.
    const finalVideo = finalVideos.get(reviewItem.finalVideoId);
    if (!finalVideo || String(finalVideo.status || "").toLowerCase() !== "current") {
      if (String(reviewItem.status || "").toLowerCase() !== "archived") {
        const archivedAt = new Date().toISOString();
        reviewItem.status = "ARCHIVED";
        reviewItem.updatedAt = archivedAt;
        reviewItems.set(reviewItem.id, reviewItem);
      }
      return {
        ok: false,
        problem: problem(
          "REVIEW_VERSION_STALE",
          409,
          "Review version stale",
          "This review item is bound to a final-video version that has been superseded. Open a review item for the latest version."
        )
      };
    }
    // One terminal decision per review item/version.
    const existingDecision = [...reviewDecisions.values()].find(
      (candidate) => candidate.reviewItemId === reviewItem.id && candidate.workspaceId === workspaceId
    );
    if (existingDecision) {
      return {
        ok: false,
        problem: problem(
          "REVIEW_DECISION_ALREADY_RECORDED",
          409,
          "Review decision already recorded",
          "A decision is already recorded for this review version."
        )
      };
    }
    const now = new Date().toISOString();
    // The deterministic approval token is minted only on approve. Reject and request_changes store
    // no token so the persisted system of record never carries approval evidence for a non-approve
    // decision; the unique-per-workspace token guard applies only to real (non-null) tokens.
    const approvalToken =
      decisionValue === "APPROVE"
        ? createHash("sha256")
            .update(`review-approval:${workspaceId}:${reviewItem.id}:${reviewItem.finalVideoId}:${reviewItem.finalVideoVersion}`)
            .digest("hex")
        : null;
    const decision = {
      id: randomUUID(),
      workspaceId,
      reviewItemId: reviewItem.id,
      finalVideoId: reviewItem.finalVideoId,
      finalVideoSha256: reviewItem.finalVideoSha256,
      finalVideoVersion: Number(reviewItem.finalVideoVersion),
      decision: decisionValue,
      reason,
      decidedByUserId: actor.userId,
      approvalToken,
      createdAt: now
    };
    reviewDecisions.set(decision.id, decision);
    // Move the review item to the terminal status for this decision.
    const statusByDecision = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      REQUEST_CHANGES: "CHANGE_REQUESTED"
    };
    reviewItem.status = statusByDecision[decisionValue];
    reviewItem.updatedAt = now;
    reviewItems.set(reviewItem.id, reviewItem);
    const audit = {
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "review.decision_recorded",
      targetType: "ReviewItem",
      targetId: reviewItem.id,
      reason: decisionValue.toLowerCase(),
      occurredAt: now
    };
    audits.push(audit);
    const approvalReference =
      decisionValue === "APPROVE"
        ? publicApprovalReference(decision)
        : null;
    return {
      ok: true,
      response: {
        decision: publicReviewDecision(decision),
        reviewItem: publicReviewItem(reviewItem),
        approvalReference,
        audit: publicAudit(audit)
      }
    };
  }

  // V0-U1: create one calendar post bound to one approved exact final-video version. An
  // API-scheduled post (manualExport false) requires a valid future scheduledAt with an explicit
  // UTC offset and is created SCHEDULED; a manual-export post (manualExport true) is created
  // APPROVED with no scheduledAt and produces a retained manual-export Artifact whose sha256 is the
  // deterministic manual-export package hash, leaving manualLiveUrl null for later verification.
  // The bound final video must be current and carry a matching approval token; unapproved media is
  // REVIEW_APPROVAL_REQUIRED, superseded media is PUBLISH_MEDIA_STALE, a past/invalid schedule or a
  // schedule conflict (same workspace + platform + account within the conflict window) is
  // PUBLISH_SCHEDULE_INVALID. A cross-workspace final-video id is hidden behind the same
  // existence-hiding 404. The idempotency-key replay is handled by the store.runIdempotent wrapper
  // in the controller; this method performs the write only.
  async function createCalendarPost(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const platform = typeof input.platform === "string" ? input.platform.trim() : "";
    if (!platform || platform.length > 40) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Platform must be 1 to 40 characters.")
      };
    }
    const account = typeof input.account === "string" ? input.account.trim() : "";
    if (!account || account.length > 240) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Account must be 1 to 240 characters.")
      };
    }
    const caption = typeof input.caption === "string" ? input.caption : "";
    if (caption.length > 2000) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Caption must be 2000 characters or fewer.")
      };
    }
    const timezone =
      typeof input.timezone === "string" && input.timezone.trim().length > 0 ? input.timezone.trim() : "Asia/Kolkata";
    if (timezone.length > 60) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Timezone must be 60 characters or fewer.")
      };
    }
    const manualExport = input.manualExport === true;
    if (manualExport && input.scheduledAt != null && String(input.scheduledAt).trim() !== "") {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_SCHEDULE_INVALID",
          422,
          "Publish schedule invalid",
          "A manual export takes no scheduled time."
        )
      };
    }
    const approvalToken = typeof input.approvalToken === "string" ? input.approvalToken : "";
    if (!/^[a-f0-9]{64}$/.test(approvalToken)) {
      return {
        ok: false,
        problem: problem(
          "REVIEW_APPROVAL_REQUIRED",
          409,
          "Review approval required",
          "This media has no recorded approval for this version."
        )
      };
    }
    let scheduledAtInstant = null;
    if (!manualExport) {
      const parsed = parseScheduledAt(input.scheduledAt);
      if (!parsed) {
        return {
          ok: false,
          problem: problem(
            "PUBLISH_SCHEDULE_INVALID",
            422,
            "Publish schedule invalid",
            "Scheduled time must be an ISO-8601 instant with a UTC offset."
          )
        };
      }
      if (parsed.getTime() <= Date.now()) {
        return {
          ok: false,
          problem: problem(
            "PUBLISH_SCHEDULE_INVALID",
            422,
            "Publish schedule invalid",
            "Scheduled time must be in the future."
          )
        };
      }
      scheduledAtInstant = parsed;
    }
    const finalVideo = [...finalVideos.values()].find(
      (candidate) => candidate.id === input.finalVideoId && candidate.workspaceId === workspaceId
    );
    if (!finalVideo) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (String(finalVideo.status || "").toLowerCase() !== "current") {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_MEDIA_STALE",
          409,
          "Publish media stale",
          "This final-video version has been superseded. Schedule the latest version."
        )
      };
    }
    const approval = [...reviewDecisions.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.finalVideoId === finalVideo.id &&
        candidate.decision === "APPROVE" &&
        candidate.approvalToken === approvalToken
    );
    if (!approval) {
      return {
        ok: false,
        problem: problem(
          "REVIEW_APPROVAL_REQUIRED",
          409,
          "Review approval required",
          "This media has no recorded approval for this version."
        )
      };
    }
    if (!manualExport && scheduledAtInstant) {
      const target = scheduledAtInstant.getTime();
      const conflict = [...calendarPosts.values()].some((candidate) => {
        if (candidate.workspaceId !== workspaceId || candidate.manualExport) {
          return false;
        }
        const candidateStatus = String(candidate.status || "").toLowerCase();
        if (candidateStatus === "cancelled" || candidateStatus === "failed") {
          return false;
        }
        if (candidate.platform !== platform || candidate.account !== account) {
          return false;
        }
        if (!candidate.scheduledAt) {
          return false;
        }
        const existing = new Date(candidate.scheduledAt).getTime();
        return Math.abs(existing - target) < SCHEDULE_CONFLICT_WINDOW_MS;
      });
      if (conflict) {
        return {
          ok: false,
          problem: problem(
            "PUBLISH_SCHEDULE_INVALID",
            422,
            "Publish schedule invalid",
            "A post is already scheduled for this account near that time."
          )
        };
      }
    }
    const now = new Date().toISOString();
    const status = manualExport ? "APPROVED" : "SCHEDULED";
    const calendarPostId = randomUUID();
    let exportArtifact = null;
    let exportArtifactId = null;
    if (manualExport) {
      const packageHash = createHash("sha256")
        .update(
          `manual-export:${workspaceId}:${finalVideo.id}:${finalVideo.version}:${approvalToken}:${platform}:${account}:${caption}`
        )
        .digest("hex");
      exportArtifact = {
        id: randomUUID(),
        workspaceId,
        fileName: `manual-export-${calendarPostId}.json`,
        contentType: "application/json",
        byteSize: Buffer.byteLength(packageHash, "utf8"),
        sha256: packageHash,
        status: "CLEAN",
        retentionClass: "manual-export",
        producer: `calendar:${calendarPostId}`,
        schemaVersion: "calendar.manual_export.v1",
        objectKey: `manual-exports/${workspaceId}/${calendarPostId}.json`,
        createdAt: now,
        updatedAt: now
      };
      artifacts.set(exportArtifact.id, exportArtifact);
      exportArtifactId = exportArtifact.id;
    }
    const calendarPost = {
      id: calendarPostId,
      workspaceId,
      platform,
      account,
      caption,
      finalVideoId: finalVideo.id,
      finalVideoSha256: finalVideo.sha256,
      finalVideoVersion: Number(finalVideo.version),
      approvalToken,
      scheduledAt: scheduledAtInstant ? scheduledAtInstant.toISOString() : null,
      timezone,
      manualExport,
      manualLiveUrl: null,
      manualUrlProvidedAt: null,
      exportArtifactId,
      status,
      createdByUserId: actor.userId,
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    calendarPosts.set(calendarPostId, calendarPost);
    const audit = {
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "calendar.post_created",
      targetType: "CalendarPost",
      targetId: calendarPostId,
      reason: manualExport ? "manual_export" : "scheduled",
      occurredAt: now
    };
    audits.push(audit);
    return {
      ok: true,
      response: {
        calendarPost: publicCalendarPost(calendarPost),
        exportArtifact: exportArtifact ? publicArtifact(exportArtifact) : null,
        audit: publicAudit(audit)
      }
    };
  }

  // V0-U1: edit a calendar post that has not yet been published. An authorised production role
  // corrects the caption, account, platform, schedule, timezone and/or manualExport choice. The
  // bound media identity (finalVideoId/approvalToken/sha256/version) is immutable on edit and is
  // only re-checked for currentness: a superseded bound version returns PUBLISH_MEDIA_STALE. An
  // optimistic expectedVersion mismatch returns RESOURCE_VERSION_STALE; a successful edit bumps
  // version. An edit is blocked once a PublishOperation exists, a manual live URL is set, or the
  // post is terminal (PUBLISH_POST_LOCKED). An edited schedule that conflicts with another active
  // post for the same workspace + platform + account within the conflict window returns
  // PUBLISH_SCHEDULE_INVALID. A manual-export result regenerates the deterministic manual-export
  // Artifact (a new retained row; the prior package is preserved). A calendar.post_updated audit
  // records the changed fields and never rewrites the R2 approval truth. The idempotency-key replay
  // is handled by the store.runIdempotent wrapper in the controller; this method performs the write
  // only and returns a problem (never a thrown HttpException) so the caller commits cleanly.
  async function updateCalendarPost(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const post = [...calendarPosts.values()].find(
      (candidate) => candidate.id === input.calendarPostId && candidate.workspaceId === workspaceId
    );
    if (!post) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    // Lock: an edit is only allowed on an editable pre-publish post. A PublishOperation, a supplied
    // manual live URL, or a terminal/processing status means the post has progressed past the
    // editable stage and is locked.
    const statusNorm = String(post.status || "").toLowerCase();
    const editableStatus = statusNorm === "scheduled" || statusNorm === "approved";
    if (findPublishOperationByCalendarPost(post.id) || post.manualLiveUrl || !editableStatus) {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_POST_LOCKED",
          409,
          "Publish post locked",
          "This calendar post can no longer be edited."
        )
      };
    }
    if (!Number.isInteger(input.expectedVersion)) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "expectedVersion must be an integer.")
      };
    }
    if (input.expectedVersion !== post.version) {
      return {
        ok: false,
        problem: problem(
          "RESOURCE_VERSION_STALE",
          409,
          "Resource version stale",
          "This calendar post changed after you opened it. Review the latest version."
        )
      };
    }
    // The bound media is immutable on edit; only re-check it is still the current version.
    const finalVideo = [...finalVideos.values()].find(
      (candidate) => candidate.id === post.finalVideoId && candidate.workspaceId === workspaceId
    );
    if (!finalVideo || String(finalVideo.status || "").toLowerCase() !== "current") {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_MEDIA_STALE",
          409,
          "Publish media stale",
          "This final-video version has been superseded. Schedule the latest version."
        )
      };
    }
    // Merge the editable patch and validate the resulting full state with the same rules as create.
    const caption = typeof input.caption === "string" ? input.caption : post.caption;
    if (caption.length > 2000) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Caption must be 2000 characters or fewer.")
      };
    }
    const platform =
      typeof input.platform === "string" && input.platform !== undefined
        ? input.platform.trim()
        : input.platform === undefined
          ? post.platform
          : post.platform;
    if (!platform || platform.length > 40) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Platform must be 1 to 40 characters.")
      };
    }
    const account =
      typeof input.account === "string" ? input.account.trim() : input.account === undefined ? post.account : post.account;
    if (!account || account.length > 240) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Account must be 1 to 240 characters.")
      };
    }
    let timezone = post.timezone;
    if (input.timezone !== undefined) {
      timezone =
        typeof input.timezone === "string" && input.timezone.trim().length > 0 ? input.timezone.trim() : "Asia/Kolkata";
    }
    if (timezone.length > 60) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Timezone must be 60 characters or fewer.")
      };
    }
    const manualExport = input.manualExport !== undefined ? input.manualExport === true : post.manualExport;
    if (manualExport && input.scheduledAt != null && String(input.scheduledAt).trim() !== "") {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_SCHEDULE_INVALID",
          422,
          "Publish schedule invalid",
          "A manual export takes no scheduled time."
        )
      };
    }
    let scheduledAtInstant = null;
    if (!manualExport) {
      const scheduledAtInput = input.scheduledAt !== undefined ? input.scheduledAt : post.scheduledAt;
      const parsed = parseScheduledAt(scheduledAtInput);
      if (!parsed) {
        return {
          ok: false,
          problem: problem(
            "PUBLISH_SCHEDULE_INVALID",
            422,
            "Publish schedule invalid",
            "Scheduled time must be an ISO-8601 instant with a UTC offset."
          )
        };
      }
      if (parsed.getTime() <= Date.now()) {
        return {
          ok: false,
          problem: problem(
            "PUBLISH_SCHEDULE_INVALID",
            422,
            "Publish schedule invalid",
            "Scheduled time must be in the future."
          )
        };
      }
      scheduledAtInstant = parsed;
    }
    if (!manualExport && scheduledAtInstant) {
      const target = scheduledAtInstant.getTime();
      const conflict = [...calendarPosts.values()].some((candidate) => {
        if (candidate.id === post.id) {
          return false;
        }
        if (candidate.workspaceId !== workspaceId || candidate.manualExport) {
          return false;
        }
        const candidateStatus = String(candidate.status || "").toLowerCase();
        if (candidateStatus === "cancelled" || candidateStatus === "failed") {
          return false;
        }
        if (candidate.platform !== platform || candidate.account !== account) {
          return false;
        }
        if (!candidate.scheduledAt) {
          return false;
        }
        const existing = new Date(candidate.scheduledAt).getTime();
        return Math.abs(existing - target) < SCHEDULE_CONFLICT_WINDOW_MS;
      });
      if (conflict) {
        return {
          ok: false,
          problem: problem(
            "PUBLISH_SCHEDULE_INVALID",
            422,
            "Publish schedule invalid",
            "A post is already scheduled for this account near that time."
          )
        };
      }
    }
    const now = new Date().toISOString();
    const nextVersion = Number(post.version) + 1;
    const nextStatus = manualExport ? "APPROVED" : "SCHEDULED";
    let exportArtifact = null;
    let exportArtifactId = null;
    if (manualExport) {
      const packageHash = createHash("sha256")
        .update(
          `manual-export:${workspaceId}:${post.finalVideoId}:${post.finalVideoVersion}:${post.approvalToken}:${platform}:${account}:${caption}`
        )
        .digest("hex");
      exportArtifact = {
        id: randomUUID(),
        workspaceId,
        fileName: `manual-export-${post.id}.v${nextVersion}.json`,
        contentType: "application/json",
        byteSize: Buffer.byteLength(packageHash, "utf8"),
        sha256: packageHash,
        status: "CLEAN",
        retentionClass: "manual-export",
        producer: `calendar:${post.id}`,
        schemaVersion: "calendar.manual_export.v1",
        objectKey: `manual-exports/${workspaceId}/${post.id}.v${nextVersion}.json`,
        createdAt: now,
        updatedAt: now
      };
      artifacts.set(exportArtifact.id, exportArtifact);
      exportArtifactId = exportArtifact.id;
    } else {
      // Switching to (or staying) scheduled clears the manual-export link; any prior export
      // artifact row is retained as evidence.
      exportArtifactId = null;
    }
    const changed = [];
    if (caption !== post.caption) changed.push("caption");
    if (account !== post.account) changed.push("account");
    if (platform !== post.platform) changed.push("platform");
    if (manualExport !== post.manualExport) changed.push("manual_export");
    if (timezone !== post.timezone) changed.push("timezone");
    const nextScheduledAt = scheduledAtInstant ? scheduledAtInstant.toISOString() : null;
    if (nextScheduledAt !== (post.scheduledAt ?? null)) changed.push("scheduled_at");
    const updatedPost = {
      ...post,
      platform,
      account,
      caption,
      manualExport,
      scheduledAt: nextScheduledAt,
      timezone,
      status: nextStatus,
      version: nextVersion,
      exportArtifactId,
      updatedAt: now
    };
    calendarPosts.set(post.id, updatedPost);
    const audit = {
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "calendar.post_updated",
      targetType: "CalendarPost",
      targetId: post.id,
      reason: changed.length > 0 ? changed.join(",") : "no_change",
      occurredAt: now
    };
    audits.push(audit);
    return {
      ok: true,
      response: {
        calendarPost: publicCalendarPost(updatedPost),
        exportArtifact: exportArtifact ? publicArtifact(exportArtifact) : null,
        audit: publicAudit(audit)
      }
    };
  }

  // V0-U2 helpers for idempotent Meta publication.
  function findPublishOperationByIdempotencyKey(workspaceId, idempotencyKey) {
    return (
      [...publishOperations.values()].find(
        (op) => op.workspaceId === workspaceId && op.idempotencyKey === idempotencyKey
      ) ?? null
    );
  }

  function findPublishOperationByCalendarPost(calendarPostId) {
    return [...publishOperations.values()].find((op) => op.calendarPostId === calendarPostId) ?? null;
  }

  // Apply a reconciled/callback publish outcome to the operation and the calendar post. The
  // post-level PublishStatus has no processing/unknown; while Meta processes the post stays
  // accepted, and on completion the post advances to published_unverified and the public post
  // URL is bound. Reconciliation records reconciledAt.
  function applyPublishOutcome(operation, post, outcome, now, reconciled, publicUrlFn) {
    if (outcome.externalId && !operation.externalId) {
      operation.externalId = outcome.externalId;
    }
    if (outcome.status === "accepted") {
      operation.status = "accepted";
      operation.acceptedAt = operation.acceptedAt || now;
      post.status = "accepted";
    } else if (outcome.status === "processing") {
      operation.status = "processing";
      // An upload that is processing was accepted; record acceptedAt if it is not already set.
      operation.acceptedAt = operation.acceptedAt || now;
      post.status = "accepted";
    } else if (outcome.status === "completed") {
      operation.status = "completed";
      operation.completedAt = now;
      operation.publicUrl = outcome.publicUrl || publicUrlFn(operation.externalId);
      post.status = "published_unverified";
    } else if (outcome.status === "failed") {
      operation.status = "failed";
      operation.lastErrorCode = operation.lastErrorCode || "PROVIDER_OUTPUT_INVALID";
      post.status = "failed";
    }
    if (reconciled) {
      operation.reconciledAt = now;
    }
    operation.updatedAt = now;
    post.updatedAt = now;
  }

  // V0-U2: publish an approved scheduled calendar post to the Meta simulator exactly once.
  // A durable PublishOperation is persisted in CREATED -> SUBMITTING BEFORE the provider
  // network I/O, so a crash between persistence and the network response leaves a resumable
  // operation, never a blind duplicate. The operation binds the workspace, calendar post,
  // Meta provider route, idempotency key and a server-side request hash, and stores the
  // external post id and public post URL only once the provider identity is known. A timeout
  // after possible acceptance marks the operation unknown; the caller reconciles before any
  // retry. The wrong-account check rejects a body account that does not match the calendar
  // post's bound account; a manual-export post cannot be submitted. The request hash is a
  // server-side binding secret and is never surfaced. Provider payloads stay adapter-private.
  function submitPublishOperation(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const post = calendarPosts.get(input.calendarPostId);
    if (!post || post.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    // Exactly-once by idempotency key: a replay returns the existing operation and never
    // calls the provider again. The same key with a different post or a different account is
    // a conflict.
    const existingByKey = findPublishOperationByIdempotencyKey(input.workspaceId, input.idempotencyKey);
    if (existingByKey) {
      const existingPost = calendarPosts.get(existingByKey.calendarPostId);
      if (
        existingByKey.calendarPostId !== input.calendarPostId ||
        !existingPost ||
        existingPost.account !== input.account
      ) {
        return {
          ok: false,
          problem: problem(
            "IDEMPOTENCY_INPUT_CONFLICT",
            409,
            "Idempotency input conflict",
            "This calendar post was already published with a different request identity."
          )
        };
      }
      return {
        ok: true,
        response: {
          calendarPost: publicCalendarPost(post),
          operation: publicPublishOperation(existingByKey),
          replay: true
        }
      };
    }
    // One publish operation per calendar post: a second submission for the same post is
    // rejected, preventing duplicate posts under retry, callback replay or worker crash.
    const existingForPost = findPublishOperationByCalendarPost(post.id);
    if (existingForPost) {
      return {
        ok: false,
        problem: problem(
          "IDEMPOTENCY_INPUT_CONFLICT",
          409,
          "Idempotency input conflict",
          "This calendar post was already published with a different request identity."
        )
      };
    }
    if (post.manualExport) {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_NOT_SUBMITTABLE",
          409,
          "Publish not submittable",
          "This manual-export calendar post cannot be submitted to a provider."
        )
      };
    }
    if (input.account !== post.account) {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_ACCOUNT_MISMATCH",
          409,
          "Publish account mismatch",
          "The account in the request does not match the calendar post's bound account."
        )
      };
    }
    const adapter = resolvePublishAdapter(post.platform);
    if (!adapter) {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_PLATFORM_UNSUPPORTED",
          409,
          "Publish platform unsupported",
          "This platform is not supported for direct publication in V0. Export manually."
        )
      };
    }
    // Pre-flight quota gate (YouTube: 3 uploads/day per client). Quota exhaustion refuses
    // submission BEFORE any network I/O and writes no operation row, so quota failure is explicit
    // and never creates a duplicate or corrupts the Meta/manual paths. The retry-after points at
    // the next quota window.
    if (adapter.checkQuota) {
      const quota = adapter.checkQuota(env, { workspaceId: input.workspaceId, account: input.account });
      if (!quota.ok) {
        return {
          ok: false,
          problem: {
            ...problem(
              quota.errorCode,
              429,
              "Publish quota exhausted",
              "The platform quota is exhausted. Choose the shown retry time or export manually.",
              true
            ),
            retryAfterMs: quota.retryAfterMs
          }
        };
      }
    }
    const requestHash = computePublishRequestHash(post, input.account, adapter.provider);
    const now = new Date().toISOString();
    // Persist the operation BEFORE network I/O. SUBMITTING spans the network call. A crash
    // here leaves SUBMITTING and the caller reconciles.
    const operation = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      calendarPostId: post.id,
      provider: adapter.provider,
      operationType: adapter.operationType,
      status: "submitting",
      idempotencyKey: input.idempotencyKey,
      requestHash,
      externalId: null,
      publicUrl: null,
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
    publishOperations.set(operation.id, operation);
    post.status = "submitting";
    post.updatedAt = now;
    calendarPosts.set(post.id, post);
    const providerResult = adapter.submit(env, {
      operationId: operation.id,
      requestHash,
      mode: input.mode
    });
    if (!providerResult.ok) {
      if (providerResult.kind === "timeout") {
        // Timeout after possible acceptance: unknown, never success or failure. The
        // caller reconciles before any retry; blind resubmission is prohibited. The
        // post stays submitting (PublishStatus has no unknown); the operation carries
        // the precise uncertain truth.
        operation.status = "unknown";
        operation.updatedAt = new Date().toISOString();
        publishOperations.set(operation.id, operation);
        post.updatedAt = operation.updatedAt;
        calendarPosts.set(post.id, post);
        return {
          ok: true,
          response: {
            calendarPost: publicCalendarPost(post),
            operation: publicPublishOperation(operation),
            unknown: true
          }
        };
      }
      // malformed / unavailable: the provider output failed validation.
      operation.status = "failed";
      operation.lastErrorCode = providerResult.errorCode || "PROVIDER_OUTPUT_INVALID";
      operation.updatedAt = new Date().toISOString();
      publishOperations.set(operation.id, operation);
      post.status = "failed";
      post.updatedAt = operation.updatedAt;
      calendarPosts.set(post.id, post);
      return {
        ok: false,
        problem: problem(
          operation.lastErrorCode,
          422,
          "Provider output invalid",
          "The publish failed validation and was not accepted."
        )
      };
    }
    // success / duplicate / processing: the provider accepted and assigned an external post id.
    // The public post URL is not known until the post is live and stays null here. A processing
    // upload keeps the operation in processing while the post stays accepted (the post-level enum
    // has no processing); a callback or reconciliation later drives it to completed.
    const isProcessing = providerResult.processing === true;
    operation.status = isProcessing ? "processing" : "accepted";
    operation.externalId = providerResult.externalId;
    operation.acceptedAt = new Date().toISOString();
    operation.updatedAt = operation.acceptedAt;
    publishOperations.set(operation.id, operation);
    post.status = "accepted";
    post.updatedAt = operation.acceptedAt;
    calendarPosts.set(post.id, post);
    audits.push({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "publish.state_changed",
      targetType: "CalendarPost",
      targetId: post.id,
      reason: "accepted",
      occurredAt: operation.acceptedAt
    });
    const response = {
      calendarPost: publicCalendarPost(post),
      operation: publicPublishOperation(operation)
    };
    // Simulator-only: surface the signed callback envelope so the deterministic test can post the
    // webhook back, exactly as the HeyGen/Razorpay simulators do. The signing secret never leaves
    // the simulator. A processing upload surfaces a publish.processing event (no public URL yet);
    // a completed upload surfaces publish.completed with the public post URL.
    if (env[adapter.liveApiModeEnv] !== "api") {
      const callbackEventType = isProcessing ? "publish.processing" : "publish.completed";
      const callbackPublicUrl = isProcessing ? "" : adapter.publicUrl(operation.externalId);
      const envelope = {
        workspaceId: input.workspaceId,
        calendarPostId: post.id,
        operationId: operation.id,
        externalId: operation.externalId,
        publicUrl: callbackPublicUrl,
        eventType: callbackEventType,
        eventId: `evt_${operation.id}`,
        timestamp: Date.now()
      };
      response.callback = {
        envelope,
        signature: adapter.sign(envelope, adapter.secret(env))
      };
    }
    return { ok: true, response };
  }

  // V0-U2: reconcile an uncertain publish operation by querying the provider for the
  // authoritative outcome. Reconciliation never resubmits; it only resolves unknown/
  // submitting/accepted/processing to a terminal state and records reconciledAt. A replay
  // is a no-op once the operation is terminal. On completion the post advances to
  // published_unverified and the public post URL is bound.
  function reconcilePublishOperation(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const post = calendarPosts.get(input.calendarPostId);
    if (!post || post.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const operation = findPublishOperationByCalendarPost(post.id);
    if (!operation) {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_NOT_SUBMITTABLE",
          409,
          "Publish not submittable",
          "This calendar post has no publish operation to reconcile."
        )
      };
    }
    const terminal = new Set(["completed", "failed", "rejected", "cancelled"]);
    if (terminal.has(operation.status)) {
      return {
        ok: true,
        response: {
          calendarPost: publicCalendarPost(post),
          operation: publicPublishOperation(operation),
          replay: true
        }
      };
    }
    const adapter = resolvePublishAdapter(post.platform);
    if (!adapter) {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_PLATFORM_UNSUPPORTED",
          409,
          "Publish platform unsupported",
          "This platform is not supported for direct publication in V0. Export manually."
        )
      };
    }
    const outcome = adapter.reconcile(env, {
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
          calendarPost: publicCalendarPost(post),
          operation: publicPublishOperation(operation),
          pending: true
        }
      };
    }
    applyPublishOutcome(operation, post, outcome, now, true, adapter.publicUrl);
    publishOperations.set(operation.id, operation);
    calendarPosts.set(post.id, post);
    return {
      ok: true,
      response: {
        calendarPost: publicCalendarPost(post),
        operation: publicPublishOperation(operation)
      }
    };
  }

  // V0-U2: process a signed publishing callback. The signature is verified in constant
  // time, the timestamp must be within the callback window, and the event is deduplicated
  // by (workspace, source, eventId) so a replay never transitions a second time. Malformed
  // callbacks are rejected. The calendar post advances in lockstep with the operation.
  // Provider payloads stay private; the public post URL is the only URL carried and is
  // bound only on completion.
  function processPublishingCallback(provider, envelope, signature) {
    const adapter = resolvePublishCallbackAdapter(provider);
    if (!adapter) {
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
    if (!adapter.verify(envelope, signature, adapter.secret(env))) {
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
      typeof envelope.calendarPostId !== "string" ||
      typeof envelope.operationId !== "string" ||
      typeof envelope.externalId !== "string" ||
      typeof envelope.publicUrl !== "string" ||
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
    const inboxKey = `${envelope.workspaceId}:${adapter.source}:${envelope.eventId}`;
    const duplicate = inboxEvents.get(inboxKey);
    if (duplicate) {
      return { ok: true, response: { ...duplicate.response, duplicate: true } };
    }
    if (Math.abs(Date.now() - envelope.timestamp) > adapter.callbackWindowMs) {
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
    const operation = [...publishOperations.values()].find(
      (candidate) =>
        candidate.workspaceId === envelope.workspaceId && candidate.id === envelope.operationId
    );
    if (!operation) {
      // A signed callback that cannot be reconciled to an operation in this workspace
      // does not leak whether the operation exists elsewhere.
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
    const post = calendarPosts.get(operation.calendarPostId);
    if (!post || post.workspaceId !== envelope.workspaceId) {
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
      "publish.accepted",
      "publish.processing",
      "publish.completed",
      "publish.failed"
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
      "publish.accepted": "accepted",
      "publish.processing": "processing",
      "publish.completed": "completed",
      "publish.failed": "failed"
    };
    // Idempotent transition: a repeat terminal event is a no-op, never a second transition.
    const terminalOp = new Set(["completed", "failed", "rejected", "cancelled"]);
    if (terminalOp.has(operation.status)) {
      const response = { calendarPost: publicCalendarPost(post), operation: publicPublishOperation(operation) };
      inboxEvents.set(inboxKey, { response });
      return { ok: true, response: { ...response, duplicate: false } };
    }
    applyPublishOutcome(operation, post, { status: outcomeMap[envelope.eventType], externalId: envelope.externalId, publicUrl: envelope.publicUrl }, now, false, adapter.publicUrl);
    publishOperations.set(operation.id, operation);
    calendarPosts.set(post.id, post);
    const response = { calendarPost: publicCalendarPost(post), operation: publicPublishOperation(operation) };
    inboxEvents.set(inboxKey, { response });
    return { ok: true, response: { ...response, duplicate: false } };
  }

  // V0-U4: find the one audience-facing verification record for a calendar post (one per post).
  function findPostVerificationByCalendarPost(calendarPostId) {
    return [...postVerifications.values()].find((v) => v.calendarPostId === calendarPostId) ?? null;
  }

  // V0-U4: independently verify the audience-facing live post against the approved calendar post.
  // Provider acknowledgement alone never becomes success: a post that is only accepted (not yet
  // live) is not verifiable. Only a live provider post (published_unverified) or a manual-export
  // post with a supplied live URL is verifiable. The deterministic verifier simulator checks the
  // target account, media identity (the approved final-video sha256), caption, visibility and
  // publish time. Only a verified result advances the post to published_verified and sends one
  // completion notification (deduplicated by workspace + payload hash). Wrong media/account
  // (identity_mismatch) or restricted visibility (visibility_restricted) is an explicit non-success
  // and sends no notification; a still-processing platform (processing_wait) is checked again. One
  // PostVerification per calendar post: a second successful verify is a replay and never sends a
  // second notification. The audience evidence artifact is retained (public sha256, object key
  // omitted); an initial immutable PerformanceSnapshot anchors the observation window. No
  // idempotency key is required: exactly-once is enforced by the one-verification-per-post row.
  function verifyCalendarPost(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const post = calendarPosts.get(input.calendarPostId);
    if (!post || post.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const now = new Date().toISOString();

    // One verification per post: an already-verified post replays the existing verification and
    // never sends a second notification. The verifier is not called again.
    const existingVerification = findPostVerificationByCalendarPost(post.id);
    if (post.status === "published_verified" && existingVerification && existingVerification.status === "verified") {
      const notification = [...notifications.values()].find(
        (candidate) =>
          candidate.workspaceId === input.workspaceId &&
          candidate.calendarPostId === post.id &&
          candidate.notificationType === "publish_completed"
      );
      const evidenceArtifact = existingVerification.evidenceArtifactId
        ? artifacts.get(existingVerification.evidenceArtifactId)
        : null;
      const snapshot = [...performanceSnapshots.values()].find(
        (candidate) => candidate.workspaceId === input.workspaceId && candidate.calendarPostId === post.id
      );
      return {
        ok: true,
        response: {
          calendarPost: publicCalendarPost(post),
          verification: publicPostVerification(existingVerification),
          evidenceArtifact: publicArtifact(evidenceArtifact),
          notification: publicNotification(notification, true),
          performanceSnapshot: snapshot ? publicPerformanceSnapshot(snapshot) : null,
          replay: true
        }
      };
    }

    // Resolve the live URL to verify against. A provider post must be live (published_unverified):
    // the audience-facing URL is the bound publish operation public URL. A manual-export post is
    // verifiable once a live URL is supplied (in the request or already stored).
    let liveUrl = null;
    let eligible = false;
    if (post.manualExport) {
      const suppliedUrl = typeof input.manualLiveUrl === "string" ? input.manualLiveUrl.trim() : "";
      if (suppliedUrl.length > 0 && /^https?:\/\//i.test(suppliedUrl) && suppliedUrl.length <= 500) {
        post.manualLiveUrl = suppliedUrl;
        post.manualUrlProvidedAt = now;
        post.updatedAt = now;
        calendarPosts.set(post.id, post);
        liveUrl = suppliedUrl;
        eligible = true;
      } else if (post.manualLiveUrl) {
        liveUrl = post.manualLiveUrl;
        eligible = true;
      } else {
        return {
          ok: false,
          problem: problem(
            "VERIFY_MANUAL_URL_REQUIRED",
            409,
            "Manual URL required",
            "Add the live post URL before verification."
          )
        };
      }
    } else if (post.status === "published_unverified") {
      const operation = findPublishOperationByCalendarPost(post.id);
      liveUrl = operation?.publicUrl ?? null;
      eligible = true;
    } else {
      // The post is not yet live (accepted/submitting/processing) or is terminal-failed/cancelled
      // without a live URL. Provider acknowledgement alone never becomes success: there is no
      // audience-facing post to verify yet, so the caller checks again. No verification record is
      // created because no audience observation was made.
      return {
        ok: true,
        response: {
          code: "VERIFY_PROCESSING_WAIT",
          message: "The platform is still processing the post. We will check again.",
          calendarPost: publicCalendarPost(post),
          retryAfterMs: VERIFY_PROCESSING_RETRY_AFTER_MS
        },
        status: 202
      };
    }

    // Eligible: observe the audience-facing live post. The adapter is behind the deterministic
    // verifier simulator; raw provider payloads stay adapter-private.
    const observation = verifyAudiencePost(env, {
      mode: input.mode,
      account: post.account,
      finalVideoSha256: post.finalVideoSha256,
      caption: post.caption,
      liveUrl
    });
    if (!observation.ok) {
      return {
        ok: false,
        problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "The verifier could not read the live post.")
      };
    }

    const attempts = (existingVerification?.attempts ?? 0) + 1;
    const accountMatched = observation.observedAccount === post.account;
    const mediaSha256Matched = observation.observedMediaSha256 === post.finalVideoSha256;
    const captionMatched = observation.observedCaption === post.caption;

    if (observation.result === "processing_wait") {
      const verification = existingVerification ?? {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        calendarPostId: post.id,
        evidenceArtifactId: null,
        provider: VERIFY_PROVIDER,
        status: "processing_wait",
        attempts: 0,
        accountMatched: null,
        mediaSha256Matched: null,
        captionMatched: null,
        visibility: null,
        observedAccount: null,
        observedMediaSha256: null,
        observedCaption: null,
        observedPublishedAt: null,
        propagationDelayMs: null,
        lastErrorCode: null,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now
      };
      verification.status = "processing_wait";
      verification.attempts = attempts;
      verification.accountMatched = null;
      verification.mediaSha256Matched = null;
      verification.captionMatched = null;
      verification.visibility = null;
      verification.observedPublishedAt = observation.observedPublishedAt ?? null;
      verification.verifiedAt = null;
      verification.updatedAt = now;
      postVerifications.set(verification.id, verification);
      return {
        ok: true,
        response: {
          code: "VERIFY_PROCESSING_WAIT",
          message: "The platform is still processing the post. We will check again.",
          calendarPost: publicCalendarPost(post),
          verification: publicPostVerification(verification),
          retryAfterMs: observation.retryAfterMs ?? VERIFY_PROCESSING_RETRY_AFTER_MS
        },
        status: 202
      };
    }

    // Retain the audience evidence artifact for an observed result (verified, identity_mismatch or
    // visibility_restricted). The sha256 is a public content fingerprint; the object key is omitted
    // by publicArtifact.
    const evidenceSha256 = verifyEvidenceSha256({
      workspaceId: input.workspaceId,
      calendarPostId: post.id,
      finalVideoSha256: post.finalVideoSha256,
      finalVideoVersion: post.finalVideoVersion,
      liveUrl,
      result: observation.result,
      observedMediaSha256: observation.observedMediaSha256,
      observedAccount: observation.observedAccount,
      observedPublishedAt: observation.observedPublishedAt
    });
    const evidenceArtifact = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      fileName: `verify-evidence-${post.id}.json`,
      contentType: "application/json",
      byteSize: Buffer.byteLength(evidenceSha256, "utf8"),
      sha256: evidenceSha256,
      status: "CLEAN",
      retentionClass: "audience-evidence",
      producer: `calendar-verify:${post.id}`,
      schemaVersion: "calendar.verify_evidence.v1",
      objectKey: `verify-evidence/${input.workspaceId}/${post.id}.json`,
      createdAt: now,
      updatedAt: now
    };
    artifacts.set(evidenceArtifact.id, evidenceArtifact);

    if (observation.result === "identity_mismatch") {
      const verification = existingVerification ?? {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        calendarPostId: post.id,
        evidenceArtifactId: null,
        provider: VERIFY_PROVIDER,
        status: "identity_mismatch",
        attempts: 0,
        accountMatched: null,
        mediaSha256Matched: null,
        captionMatched: null,
        visibility: null,
        observedAccount: null,
        observedMediaSha256: null,
        observedCaption: null,
        observedPublishedAt: null,
        propagationDelayMs: null,
        lastErrorCode: null,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now
      };
      verification.status = "identity_mismatch";
      verification.attempts = attempts;
      verification.accountMatched = accountMatched;
      verification.mediaSha256Matched = mediaSha256Matched;
      verification.captionMatched = captionMatched;
      verification.visibility = observation.observedVisibility ?? null;
      verification.observedPublishedAt = observation.observedPublishedAt ?? null;
      verification.evidenceArtifactId = evidenceArtifact.id;
      verification.lastErrorCode = "VERIFY_IDENTITY_MISMATCH";
      verification.verifiedAt = null;
      verification.updatedAt = now;
      postVerifications.set(verification.id, verification);
      audits.push({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        actorUserId: actor.userId,
        eventType: "calendar.verification_failed",
        targetType: "CalendarPost",
        targetId: post.id,
        reason: "identity_mismatch",
        occurredAt: now
      });
      return {
        ok: false,
        problem: problem(
          "VERIFY_IDENTITY_MISMATCH",
          409,
          "Identity mismatch",
          "The live post does not match the approved account or media."
        )
      };
    }

    if (observation.result === "visibility_restricted") {
      const verification = existingVerification ?? {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        calendarPostId: post.id,
        evidenceArtifactId: null,
        provider: VERIFY_PROVIDER,
        status: "visibility_restricted",
        attempts: 0,
        accountMatched: null,
        mediaSha256Matched: null,
        captionMatched: null,
        visibility: null,
        observedAccount: null,
        observedMediaSha256: null,
        observedCaption: null,
        observedPublishedAt: null,
        propagationDelayMs: null,
        lastErrorCode: null,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now
      };
      verification.status = "visibility_restricted";
      verification.attempts = attempts;
      verification.accountMatched = accountMatched;
      verification.mediaSha256Matched = mediaSha256Matched;
      verification.captionMatched = captionMatched;
      verification.visibility = observation.observedVisibility ?? null;
      verification.observedPublishedAt = observation.observedPublishedAt ?? null;
      verification.evidenceArtifactId = evidenceArtifact.id;
      verification.lastErrorCode = "VERIFY_VISIBILITY_RESTRICTED";
      verification.verifiedAt = null;
      verification.updatedAt = now;
      postVerifications.set(verification.id, verification);
      audits.push({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        actorUserId: actor.userId,
        eventType: "calendar.verification_failed",
        targetType: "CalendarPost",
        targetId: post.id,
        reason: "visibility_restricted",
        occurredAt: now
      });
      return {
        ok: false,
        problem: problem(
          "VERIFY_VISIBILITY_RESTRICTED",
          409,
          "Visibility restricted",
          "The post is not visible to the required audience."
        )
      };
    }

    // verified: advance the post to published_verified, retain the evidence, send one deduplicated
    // completion notification and anchor an initial immutable PerformanceSnapshot.
    const verification = existingVerification ?? {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      calendarPostId: post.id,
      evidenceArtifactId: null,
      provider: VERIFY_PROVIDER,
      status: "verified",
      attempts: 0,
      accountMatched: null,
      mediaSha256Matched: null,
      captionMatched: null,
      visibility: null,
      observedAccount: null,
      observedMediaSha256: null,
      observedCaption: null,
      observedPublishedAt: null,
      propagationDelayMs: null,
      lastErrorCode: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now
    };
    verification.status = "verified";
    verification.attempts = attempts;
    verification.accountMatched = accountMatched;
    verification.mediaSha256Matched = mediaSha256Matched;
    verification.captionMatched = captionMatched;
    verification.visibility = observation.observedVisibility ?? "public";
    verification.observedPublishedAt = observation.observedPublishedAt ?? now;
    verification.evidenceArtifactId = evidenceArtifact.id;
    verification.lastErrorCode = null;
    verification.verifiedAt = now;
    verification.updatedAt = now;
    postVerifications.set(verification.id, verification);

    post.status = "published_verified";
    post.updatedAt = now;
    calendarPosts.set(post.id, post);

    // One logical completion notification per workspace + payload hash. The recipient is the
    // production user who created the calendar post. A second verify collapses into the existing
    // notification and never sends a duplicate.
    const recipientUserId = post.createdByUserId;
    const payloadHash = createHash("sha256")
      .update(
        stableJson({
          workspaceId: input.workspaceId,
          calendarPostId: post.id,
          notificationType: "publish_completed",
          recipientUserId
        })
      )
      .digest("hex");
    const existingNotification = [...notifications.values()].find(
      (candidate) => candidate.workspaceId === input.workspaceId && candidate.payloadHash === payloadHash
    );
    let notification;
    let duplicateCollapsed = false;
    if (existingNotification) {
      duplicateCollapsed = true;
      notification = existingNotification;
    } else {
      notification = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        reviewItemId: null,
        calendarPostId: post.id,
        notificationType: "publish_completed",
        channel: "in_app",
        recipientUserId,
        payloadHash,
        status: "SENT",
        createdAt: now,
        sentAt: now
      };
      notifications.set(notification.id, notification);
    }

    // Initial immutable PerformanceSnapshot anchoring the observation window at verification time.
    // V0-A1 owns the full performance_collect job; the initial snapshot carries an empty metrics
    // object and a zero-width window bounded by the verification instant.
    const sourceHash = createHash("sha256")
      .update(stableJson({ workspaceId: input.workspaceId, calendarPostId: post.id, platform: post.platform, verifiedAt: now }))
      .digest("hex");
    const performanceSnapshot = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      calendarPostId: post.id,
      platform: post.platform,
      source: "audience_verification_initial",
      observationWindowStart: now,
      observationWindowEnd: now,
      metrics: {},
      sourceHash,
      createdAt: now
    };
    performanceSnapshots.set(performanceSnapshot.id, performanceSnapshot);

    audits.push({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "calendar.verification_completed",
      targetType: "CalendarPost",
      targetId: post.id,
      reason: "verified",
      occurredAt: now
    });

    return {
      ok: true,
      response: {
        calendarPost: publicCalendarPost(post),
        verification: publicPostVerification(verification),
        evidenceArtifact: publicArtifact(evidenceArtifact),
        notification: publicNotification(notification, duplicateCollapsed),
        performanceSnapshot: publicPerformanceSnapshot(performanceSnapshot),
        replay: false
      }
    };
  }

  // V0-A1: build a redacted, hash-manifested creative lineage export for one final video. The
  // export anchors on the immutable CreativeLineage row (workspaceId, finalVideoId) and traverses
  // the full ancestry from approved brand and blueprint through script, avatar, estimate, provider
  // operation, generated media, composition instruction, AE plan, render attempt, final video,
  // calendar post, audience verification and the initial performance observation. Missing ancestry
  // makes the export incomplete; a final-video sha256 mismatch with the render attempt output hash
  // makes it blocked; a cross-workspace or missing reference is denied behind the same
  // WORKSPACE_ACCESS_DENIED (404) so existence never leaks. Cost attribution, source and provider
  // timestamps are surfaced as observations. No secret, signed URL, object key, raw provider
  // payload, external id, request hash, idempotency key, source hash or cross-workspace reference
  // surfaces. The manifest sha256 binds the canonical ancestry and is stable across reads.
  function getLineageForActor(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const lineage = [...creativeLineages.values()].find(
      (candidate) =>
        candidate.workspaceId === input.workspaceId && candidate.finalVideoId === input.finalVideoId
    );
    if (!lineage) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }

    const entries = [];
    const missing = [];
    const mismatches = [];

    const brandProfile = lineage.brandProfileId ? brandProfiles.get(lineage.brandProfileId) : null;
    if (brandProfile) {
      entries.push({
        kind: "brand_profile",
        id: brandProfile.id,
        status: brandProfile.status,
        version: Number(brandProfile.version),
        createdAt: toIso(brandProfile.createdAt)
      });
    } else {
      missing.push("brand_profile");
    }

    const selectedScript = lineage.selectedScriptId ? selectedScripts.get(lineage.selectedScriptId) : null;
    if (selectedScript) {
      entries.push({
        kind: "selected_script",
        id: selectedScript.id,
        variantId: selectedScript.variantId,
        version: Number(selectedScript.version),
        humanOverride: Boolean(selectedScript.humanOverride),
        createdAt: toIso(selectedScript.createdAt)
      });
    } else {
      missing.push("selected_script");
    }

    const avatarProfile = lineage.avatarProfileId ? avatarProfiles.get(lineage.avatarProfileId) : null;
    if (avatarProfile) {
      entries.push({
        kind: "avatar_profile",
        id: avatarProfile.id,
        displayName: avatarProfile.displayName,
        avatarKind: avatarProfile.kind,
        createdAt: toIso(avatarProfile.createdAt)
      });
    } else {
      missing.push("avatar_profile");
    }

    const estimate = lineage.estimateId ? generationEstimates.get(lineage.estimateId) : null;
    if (estimate) {
      entries.push({
        kind: "estimate",
        id: estimate.id,
        estimatedMaximumMinor: Number(estimate.estimatedMaximumMinor ?? estimate.maximumAuthorizedMinor ?? 0),
        currency: estimate.currency,
        priceVersion: estimate.priceVersion,
        createdAt: toIso(estimate.createdAt)
      });
    } else {
      missing.push("estimate");
    }

    const operation = lineage.providerOperationId ? providerOperations.get(lineage.providerOperationId) : null;
    if (operation) {
      entries.push({
        kind: "provider_operation",
        id: operation.id,
        provider: operation.provider,
        status: String(operation.status || "").toLowerCase(),
        priceVersion: operation.priceVersion,
        createdAt: toIso(operation.createdAt)
      });
    } else {
      missing.push("provider_operation");
    }

    const generatedAsset = lineage.generatedAssetId ? generatedAssets.get(lineage.generatedAssetId) : null;
    if (generatedAsset) {
      entries.push({
        kind: "generated_asset",
        id: generatedAsset.id,
        status: String(generatedAsset.status || "").toLowerCase(),
        durationSeconds: Number(generatedAsset.durationSeconds ?? 0),
        artifact: {
          sha256: generatedAsset.sha256,
          contentType: generatedAsset.contentType,
          version: Number(generatedAsset.version ?? 0)
        },
        createdAt: toIso(generatedAsset.createdAt)
      });
    } else {
      missing.push("generated_asset");
    }

    const compositionInstruction = lineage.compositionInstructionId
      ? compositionInstructions.get(lineage.compositionInstructionId)
      : null;
    if (compositionInstruction) {
      entries.push({
        kind: "composition_instruction",
        id: compositionInstruction.id,
        status: String(compositionInstruction.status || "").toLowerCase(),
        createdAt: toIso(compositionInstruction.createdAt)
      });
    } else {
      missing.push("composition_instruction");
    }

    const aePlan = lineage.aePlanId ? aePlans.get(lineage.aePlanId) : null;
    if (aePlan) {
      entries.push({
        kind: "ae_plan",
        id: aePlan.id,
        schemaVersion: aePlan.schemaVersion,
        capabilityVersion: aePlan.capabilityVersion,
        status: String(aePlan.status || "").toLowerCase(),
        createdAt: toIso(aePlan.createdAt)
      });
    } else {
      missing.push("ae_plan");
    }

    const renderAttempt = lineage.renderAttemptId ? renderAttempts.get(lineage.renderAttemptId) : null;
    if (renderAttempt) {
      entries.push({
        kind: "render_attempt",
        id: renderAttempt.id,
        status: String(renderAttempt.status || "").toLowerCase(),
        outputSha256: renderAttempt.outputHash ?? null,
        workerCapabilityVersion: renderAttempt.workerCapabilityVersion ?? null,
        createdAt: toIso(renderAttempt.createdAt)
      });
    } else {
      missing.push("render_attempt");
    }

    const finalVideo = lineage.finalVideoId ? finalVideos.get(lineage.finalVideoId) : null;
    if (finalVideo) {
      entries.push({
        kind: "final_video",
        id: finalVideo.id,
        version: Number(finalVideo.version),
        durationSeconds: Number(finalVideo.durationSeconds ?? 0),
        resolution: finalVideo.resolution,
        codec: finalVideo.codec,
        capabilityVersion: finalVideo.capabilityVersion,
        schemaVersion: finalVideo.schemaVersion,
        artifact: {
          sha256: finalVideo.sha256,
          byteSize: Number(finalVideo.byteSize ?? 0)
        },
        createdAt: toIso(finalVideo.createdAt)
      });
    } else {
      missing.push("final_video");
    }

    const calendarPost = [...calendarPosts.values()]
      .filter((candidate) => candidate.workspaceId === input.workspaceId && candidate.finalVideoId === lineage.finalVideoId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (calendarPost) {
      entries.push({
        kind: "calendar_post",
        id: calendarPost.id,
        platform: calendarPost.platform,
        account: calendarPost.account,
        status: String(calendarPost.status || "").toLowerCase(),
        createdAt: toIso(calendarPost.createdAt)
      });
    } else {
      missing.push("calendar_post");
    }

    const postVerification = calendarPost ? findPostVerificationByCalendarPost(calendarPost.id) : null;
    if (postVerification) {
      entries.push({
        kind: "post_verification",
        id: postVerification.id,
        provider: postVerification.provider,
        status: String(postVerification.status || "").toLowerCase(),
        attempts: Number(postVerification.attempts),
        accountMatched: Boolean(postVerification.accountMatched),
        mediaSha256Matched: Boolean(postVerification.mediaSha256Matched),
        captionMatched: Boolean(postVerification.captionMatched),
        visibility: postVerification.visibility,
        verifiedAt: postVerification.verifiedAt ? toIso(postVerification.verifiedAt) : null,
        createdAt: toIso(postVerification.createdAt)
      });
    } else {
      missing.push("post_verification");
    }

    const initialSnapshot = [...performanceSnapshots.values()].find(
      (candidate) =>
        candidate.workspaceId === input.workspaceId &&
        candidate.calendarPostId === (calendarPost ? calendarPost.id : null) &&
        candidate.source === "audience_verification_initial"
    );
    if (initialSnapshot) {
      entries.push({
        kind: "performance_snapshot_initial",
        id: initialSnapshot.id,
        source: initialSnapshot.source,
        observationWindowStart: toIso(initialSnapshot.observationWindowStart),
        observationWindowEnd: toIso(initialSnapshot.observationWindowEnd),
        createdAt: toIso(initialSnapshot.createdAt)
      });
    } else {
      missing.push("performance_snapshot_initial");
    }

    // A final-video sha256 that no longer matches the retained render attempt output hash is a
    // blocked lineage: the audience-facing media cannot be trusted as the approved render.
    if (finalVideo && renderAttempt && finalVideo.sha256 !== renderAttempt.outputHash) {
      mismatches.push("final_video");
    }

    const status = mismatches.length > 0 ? "blocked" : missing.length > 0 ? "incomplete" : "complete";

    const cost = operation
      ? {
          providerTotalMinor: Number(operation.providerTotalMinor ?? 0),
          estimatedMaximumMinor: Number(operation.estimatedMaximumMinor ?? 0),
          currency: operation.currency,
          priceVersion: operation.priceVersion
        }
      : null;

    const providerTimestamps = operation
      ? {
          submittedAt: operation.submittedAt ? toIso(operation.submittedAt) : null,
          acceptedAt: operation.acceptedAt ? toIso(operation.acceptedAt) : null,
          completedAt: operation.completedAt ? toIso(operation.completedAt) : null
        }
      : null;

    // Canonical, stable manifest over the ancestry only. Entries are sorted by kind then id so the
    // sha256 is independent of traversal order and stable across reads. generatedAt is not part of
    // the manifest: it is the export instant, not ancestry.
    const manifestEntries = entries
      .map((entry) => ({ kind: entry.kind, id: entry.id }))
      .sort((a, b) => (a.kind === b.kind ? String(a.id).localeCompare(String(b.id)) : a.kind.localeCompare(b.kind)));
    const manifestSha256 = createHash("sha256").update(stableJson(manifestEntries)).digest("hex");

    return {
      ok: true,
      response: {
        workspaceId: input.workspaceId,
        finalVideoId: lineage.finalVideoId,
        status,
        missing,
        mismatches,
        entries,
        cost,
        providerTimestamps,
        manifestSha256,
        generatedAt: new Date().toISOString()
      }
    };
  }

  // V0-A1: collect a fresh immutable PerformanceSnapshot of observed (simulated, never predictive)
  // platform metrics for one verified audience-facing post. Exactly-once is one collected snapshot
  // per (workspaceId, idempotencyKey): a same-key replay returns the retained snapshot with
  // replay:true, a same key with different details is an input conflict, and a fresh key creates a
  // new immutable observation that never mutates the initial snapshot. The post must be
  // published_verified to be observable. No secret, signed URL, object key, raw provider payload
  // or account id leaks; metrics are observations of past platform state only.
  function collectPerformanceForActor(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const post = calendarPosts.get(input.calendarPostId);
    if (!post || post.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (post.status !== "published_verified") {
      return {
        ok: false,
        problem: problem(
          "PERFORMANCE_NOT_OBSERVABLE",
          409,
          "Performance not observable",
          "Platform metrics can only be observed for a verified audience-facing post."
        )
      };
    }

    const scope = `${input.workspaceId}:${input.idempotencyKey}`;
    const requestHash = hashRequest({ workspaceId: input.workspaceId, calendarPostId: input.calendarPostId });
    const existing = performanceCollectRecords.get(scope);
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
      const replaySnapshot = performanceSnapshots.get(existing.snapshotId);
      return {
        ok: true,
        response: {
          calendarPost: publicCalendarPost(post),
          performanceSnapshot: publicPerformanceSnapshot(replaySnapshot),
          replay: true
        }
      };
    }

    // The new observation window starts where the prior snapshot ended (the initial zero-width
    // window for the first collect) and ends now. The collect sequence seeds the deterministic
    // simulator counts so later collects produce different observations.
    const priorSnapshots = [...performanceSnapshots.values()]
      .filter((candidate) => candidate.workspaceId === input.workspaceId && candidate.calendarPostId === post.id)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const collectSequence = priorSnapshots.filter((candidate) => candidate.source === "performance_collect_simulator").length;
    const windowStart = priorSnapshots.length > 0 ? priorSnapshots[priorSnapshots.length - 1].observationWindowEnd : null;
    const now = new Date().toISOString();
    const observation = collectPerformanceObservation(env, {
      calendarPostId: post.id,
      platform: post.platform,
      collectSequence
    });
    if (!observation.ok) {
      return {
        ok: false,
        problem: problem(
          observation.errorCode ?? "PERFORMANCE_PROVIDER_UNAVAILABLE",
          503,
          "Performance provider unavailable",
          "The performance provider is not available. Try again shortly.",
          true
        )
      };
    }
    if (observation.result === "processing_wait") {
      return {
        ok: true,
        status: 202,
        response: {
          code: "PERFORMANCE_PROCESSING_WAIT",
          calendarPost: publicCalendarPost(post),
          retryAfterMs: observation.retryAfterMs ?? PERFORMANCE_PROCESSING_RETRY_AFTER_MS
        }
      };
    }

    const snapshot = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      calendarPostId: post.id,
      platform: post.platform,
      source: "performance_collect_simulator",
      observation: observation.observation ?? "simulated",
      observationWindowStart: windowStart ?? now,
      observationWindowEnd: now,
      metrics: observation.metrics ?? {},
      sourceHash: createHash("sha256")
        .update(stableJson({ workspaceId: input.workspaceId, calendarPostId: post.id, platform: post.platform, sequence: collectSequence, collectedAt: now }))
        .digest("hex"),
      createdAt: now
    };
    performanceSnapshots.set(snapshot.id, snapshot);
    performanceCollectRecords.set(scope, {
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      snapshotId: snapshot.id,
      createdAt: now
    });

    audits.push({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorUserId: actor.userId,
      eventType: "calendar.performance_collected",
      targetType: "CalendarPost",
      targetId: post.id,
      reason: "observed",
      occurredAt: now
    });

    return {
      ok: true,
      response: {
        calendarPost: publicCalendarPost(post),
        performanceSnapshot: publicPerformanceSnapshot(snapshot),
        replay: false
      }
    };
  }

  // V0-A1: read every immutable PerformanceSnapshot for one calendar post (the initial
  // verification snapshot plus all later performance_collect observations). A snapshot is flagged
  // stale when the post is no longer published_verified (the observation no longer reflects a live
  // verified post). Snapshots are append-only; the initial snapshot is never mutated. No secret,
  // signed URL, object key, raw provider payload, account id or source hash leaks; metrics are
  // observations only.
  function getPerformanceForActor(actor, input) {
    const access = getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const post = calendarPosts.get(input.calendarPostId);
    if (!post || post.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const stale = post.status !== "published_verified";
    const snapshots = [...performanceSnapshots.values()]
      .filter((candidate) => candidate.workspaceId === input.workspaceId && candidate.calendarPostId === post.id)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((candidate) => ({ ...publicPerformanceSnapshot(candidate), stale }));
    return {
      ok: true,
      response: {
        calendarPost: publicCalendarPost(post),
        snapshots
      }
    };
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

  // V0-A2 consent revocation. A monotonic governance toggle: revoking sets
  // consent.revokedAt and revokedByUserId, so deriveAvatarEligibility blocks the
  // avatar at the generation estimate boundary immediately. Revoking an already
  // revoked consent converges to the same state with no second audit row. A
  // missing or cross-workspace avatar/brand profile hides behind the same
  // existence-hiding 404 as every other cross-workspace read. Consent evidence
  // (evidenceRef) never reaches the response; publicAvatar exposes only derived
  // eligibility and non-sensitive timing.
  function revokeAvatarConsent(actor, avatarProfileId, input) {
    if (!getWorkspaceForActor(actor, input.workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const profile = brandProfiles.get(input.brandProfileId);
    if (!profile || profile.workspaceId !== input.workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    ensureAvatarCatalog(input.workspaceId, input.brandProfileId);
    const avatar = avatarProfiles.get(avatarProfileId);
    if (!avatar || avatar.workspaceId !== input.workspaceId || avatar.brandProfileId !== input.brandProfileId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const consent = avatarConsents.get(avatarProfileId) ?? null;
    if (!consent) {
      return { ok: false, problem: avatarConsentProblem("consent_required") };
    }
    const now = new Date().toISOString();
    if (!consent.revokedAt) {
      consent.revokedAt = now;
      consent.revokedByUserId = actor.userId;
      consent.updatedAt = now;
      avatar.updatedAt = now;
      audits.push({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        actorUserId: actor.userId,
        eventType: "consent.revoked",
        targetType: "AvatarProfile",
        targetId: avatarProfileId,
        reason: typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : null,
        occurredAt: now
      });
    }
    return { ok: true, response: { avatar: publicAvatar(avatar, consent, Date.now()) } };
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
    if (input.workspaceId !== job.workspaceId || !isValidBrandExtractionOutput(input)) {
      return { ok: false, problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "The generated media failed validation and was not accepted.") };
    }
    const crawlRun = brandCrawlRuns.get(job.input.brandCrawlRunId);
    if (!crawlRun) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    const extracted = buildBrandExtractionCandidates({
      crawlRunId: crawlRun.id,
      workspaceId: job.workspaceId,
      brandId: crawlRun.brandId,
      scrape: normalizeBrandExtractionScrape(input),
      schemaVersion: input.schemaVersion,
      universal: input.universal,
      vertical: input.vertical,
      assets: input.assets,
      selectedBrandType: crawlRun.selectedBrandType ?? job.input.selectedBrandType ?? null,
      detectedBrandType: input.vertical?.detectedBrandType ?? null
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
    const retainedBrandAssets = [];
    for (const assetInput of Array.isArray(input.retainedAssets) ? input.retainedAssets : []) {
      if (!isValidRetainedCrawlAsset(assetInput, job.workspaceId)) {
        return { ok: false, problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "A retained crawl asset failed validation.") };
      }
      const artifact = {
        id: randomUUID(),
        workspaceId: job.workspaceId,
        fileName: assetInput.fileName.trim(),
        contentType: assetInput.contentType.trim().toLowerCase(),
        byteSize: assetInput.byteSize,
        sha256: assetInput.sha256.trim().toLowerCase(),
        status: "CLEAN",
        retentionClass: "clean-media",
        producer: `job:${job.id}`,
        schemaVersion: "brand.crawl.asset.v1",
        objectKey: assetInput.objectKey,
        createdAt: now,
        updatedAt: now
      };
      const brandAsset = {
        id: randomUUID(),
        workspaceId: job.workspaceId,
        brandId: crawlRun.brandId,
        crawlRunId: crawlRun.id,
        artifactId: artifact.id,
        rightsBasis: assetInput.rightsBasis.trim(),
        permittedUse: assetInput.permittedUse.trim(),
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now
      };
      artifacts.set(artifact.id, artifact);
      brandAssets.set(brandAsset.id, brandAsset);
      retainedBrandAssets.push(publicBrandAsset(brandAsset, artifact));
    }
    leased.status = "SUCCEEDED";
    leased.completedAt = now;
    leased.updatedAt = now;
    job.status = "SUCCEEDED";
    job.updatedAt = now;
    crawlRun.status = "SUCCEEDED";
    crawlRun.selectedBrandType = input.vertical?.selectedBrandType ?? crawlRun.selectedBrandType ?? job.input.selectedBrandType ?? null;
    crawlRun.detectedBrandType = input.vertical?.detectedBrandType ?? crawlRun.detectedBrandType ?? null;
    crawlRun.extractionSchemaVersion = input.schemaVersion;
    crawlRun.providerCreditTelemetry = normalizeProviderCreditTelemetry(input.creditUsage);
    crawlRun.crawlScope = enrichCrawlScopeWithBrandMetadata(crawlRun.crawlScope, {
      selectedBrandType: crawlRun.selectedBrandType,
      detectedBrandType: crawlRun.detectedBrandType,
      extractionSchemaVersion: crawlRun.extractionSchemaVersion,
      providerCreditTelemetry: crawlRun.providerCreditTelemetry
    });
    crawlRun.updatedAt = now;
    if (extracted.promptInputIsolated) {
      appendJobEvent(jobEvents, job, "brand.extraction.prompt_input_isolated", { requestId: job.input.requestId, traceId: job.input.traceId });
    }
    appendJobEvent(jobEvents, job, "brand.candidates.extracted", { candidateCount: retained.length, requestId: job.input.requestId, traceId: job.input.traceId });
    appendJobEvent(jobEvents, job, "job.completed", { attemptId: leased.id, requestId: job.input.requestId, traceId: job.input.traceId });
    return { ok: true, response: { job: publicJob(job), candidates: retained.map(publicBrandCandidate), brandAssets: retainedBrandAssets } };
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

  // V0-A2 provider credential rotation. Rotation creates a new ACTIVE
  // credential row with the new secret-manager reference and stamps
  // lastRotatedAt/updatedByUserId, then marks the prior row REVOKED (immutable
  // lineage: the prior row is retained, never overwritten). The prior secretRef
  // is never echoed back; only the prior id, status and timing are public. A
  // plaintext secret field on the request is rejected at the transport boundary.
  // A missing or cross-workspace credential hides behind the existence-hiding
  // 404.
  function rotateServiceCredential(actor, workspaceId, credentialId, input) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateServiceCredentialRotationInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    const existing = serviceCredentials.get(credentialId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const now = new Date().toISOString();
    existing.rotationStatus = "REVOKED";
    existing.updatedAt = now;
    serviceCredentials.set(credentialId, existing);
    const fresh = {
      id: randomUUID(),
      workspaceId,
      provider: existing.provider,
      purpose: existing.purpose,
      environment: existing.environment,
      secretRef: input.secretRef,
      rotationStatus: "ACTIVE",
      updatedByUserId: actor.userId,
      lastRotatedAt: now,
      createdAt: now,
      updatedAt: now
    };
    serviceCredentials.set(fresh.id, fresh);
    audits.push({
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "service_credential.rotated",
      targetType: "ServiceCredential",
      targetId: credentialId,
      reason: typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : null,
      occurredAt: now
    });
    return {
      ok: true,
      response: {
        credential: publicServiceCredential(fresh),
        previous: {
          id: existing.id,
          rotationStatus: existing.rotationStatus,
          lastRotatedAt: existing.lastRotatedAt ? toIso(existing.lastRotatedAt) : null,
          updatedAt: toIso(existing.updatedAt)
        }
      }
    };
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

  // V0-A2 India-to-Backblaze-B2 transfer benchmark. Owner/Admin
  // (run_restore_drills). Deterministic simulator derives a representative
  // India-to-B2 transfer latency and egress cost from a sha256 seed, bounded by
  // owner-pinned budgets, clearly simulated. One benchmark.b2_recorded audit
  // row is retained. The live B2 binding is not wired in V0; a non-simulator
  // storage mode refuses (DEPENDENCY_UNAVAILABLE).
  function runB2Benchmark(actor, workspaceId, input) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const benchmark = benchmarkB2Transfer(env, {
      workspaceId,
      bytesRequestedGb: input.bytesRequestedGb,
      region: input.region
    });
    if (!benchmark.ok) {
      if (benchmark.kind === "unavailable") {
        return {
          ok: false,
          problem: problem("B2_BENCHMARK_UNAVAILABLE", 503, "B2 benchmark unavailable", "The B2 benchmark provider is not available. Try again shortly.", true)
        };
      }
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    const now = new Date().toISOString();
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : null;
    audits.push({
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "benchmark.b2_recorded",
      targetType: "Workspace",
      targetId: workspaceId,
      reason,
      occurredAt: now
    });
    return {
      ok: true,
      response: {
        benchmark: {
          workspaceId,
          observation: benchmark.observation,
          region: benchmark.region,
          bytesTransferredBytes: benchmark.bytesTransferredBytes,
          simulatedLatencyMs: benchmark.simulatedLatencyMs,
          egressBudgetMs: benchmark.egressBudgetMs,
          estimatedCostMinor: benchmark.estimatedCostMinor,
          determinismSeed: benchmark.determinismSeed,
          reason,
          recordedAt: now
        }
      }
    };
  }

  // V0-A2 load-shaped queue backlog simulation. Owner/Admin (run_restore_drills).
  // Deterministic simulator models a two-hour growth-then-drain backlog curve with
  // an SLO breach. The no-duplicate-paid-work and no-silent-job-loss invariants are
  // declared here and proven against real queue state in the A2 drill tests. One
  // backlog.simulation_recorded audit row is retained.
  function runBacklogSimulation(actor, workspaceId, input) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const backlog = simulateQueueBacklog(env, {
      workspaceId,
      targetDepth: input.targetDepth,
      simulatedDurationMs: input.simulatedDurationMs
    });
    if (!backlog.ok) {
      if (backlog.kind === "unavailable") {
        return {
          ok: false,
          problem: problem("QUEUE_BACKLOG_UNAVAILABLE", 503, "Queue backlog unavailable", "The queue backlog provider is not available. Try again shortly.", true)
        };
      }
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    const now = new Date().toISOString();
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : null;
    audits.push({
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "backlog.simulation_recorded",
      targetType: "Workspace",
      targetId: workspaceId,
      reason,
      occurredAt: now
    });
    return {
      ok: true,
      response: {
        backlog: {
          workspaceId,
          observation: backlog.observation,
          targetDepth: backlog.targetDepth,
          simulatedDurationMs: backlog.simulatedDurationMs,
          peakDepth: backlog.peakDepth,
          growthCurve: backlog.growthCurve,
          drainCurve: backlog.drainCurve,
          sloBreachedAtMs: backlog.sloBreachedAtMs,
          oldestQueueAgeMs: backlog.oldestQueueAgeMs,
          duplicatePaidWork: backlog.duplicatePaidWork,
          silentJobLoss: backlog.silentJobLoss,
          recoveredOperations: backlog.recoveredOperations,
          determinismSeed: backlog.determinismSeed,
          reason,
          recordedAt: now
        }
      }
    };
  }

  // V0-A2 incident/runbook rehearsal and rollback or forward-recovery record.
  // Owner/Admin (run_restore_drills). Deterministic simulator records a scripted
  // rehearsal of one owner-pinned scenario with its recovery type. The real
  // recovery machinery is proven against real state in the A2 drill tests. One
  // incident.rehearsal_recorded audit row is retained against the run id.
  function runIncidentRehearsal(actor, workspaceId, input) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const rehearsal = rehearseIncident(env, {
      workspaceId,
      scenario: input.scenario,
      runId: input.runId
    });
    if (!rehearsal.ok) {
      if (rehearsal.kind === "unavailable") {
        return {
          ok: false,
          problem: problem("INCIDENT_REHEARSAL_UNAVAILABLE", 503, "Incident rehearsal unavailable", "The incident rehearsal provider is not available. Try again shortly.", true)
        };
      }
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    const now = new Date().toISOString();
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : rehearsal.scenario;
    audits.push({
      id: randomUUID(),
      workspaceId,
      actorUserId: actor.userId,
      eventType: "incident.rehearsal_recorded",
      targetType: "IncidentRehearsal",
      targetId: rehearsal.runId,
      reason,
      occurredAt: now
    });
    return {
      ok: true,
      response: {
        rehearsal: {
          workspaceId,
          observation: rehearsal.observation,
          runId: rehearsal.runId,
          scenario: rehearsal.scenario,
          steps: rehearsal.steps,
          outcome: rehearsal.outcome,
          recoveryType: rehearsal.recoveryType,
          recoveredEntityIds: rehearsal.recoveredEntityIds,
          determinismSeed: rehearsal.determinismSeed,
          reason,
          recordedAt: now
        }
      }
    };
  }

  // V0-A2 operational alert states. Owner/Admin (view_operations). Derives
  // deterministic alert states from the operational metrics against owner-pinned
  // thresholds so operators see queue-age SLO breaches, dead letters, lease
  // expiry spikes and retry storms before the user-facing SLO is breached. Read
  // only; no audit row.
  function getWorkspaceOperationalAlerts(actor, workspaceId) {
    if (!getWorkspaceForActor(actor, workspaceId)) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const metrics = operationalMetrics(
      workspaceId,
      [...jobs.values()],
      [...jobAttempts.values()],
      [...artifacts.values()],
      flattenJobEvents(jobEvents)
    );
    return {
      ok: true,
      response: { alerts: { workspaceId, active: operationalAlerts(metrics), evaluatedAt: new Date().toISOString() } }
    };
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

  // V0-A1 test-only fault injection. A retained final-video sha256 that no longer matches the
  // render attempt output hash is an integrity threat the lineage export must report as blocked.
  // No public happy-path behaviour can produce that mismatch: the AE render validator rejects a
  // non-golden output before any final video is retained, so the two hashes are always equal in
  // retained state. The proof therefore mutates the retained row directly and re-reads through
  // the public lineage endpoint. Gated to APP_ENV=test so the affordance can never exist in
  // production. The mutation only touches rows owned by the named workspace; a missing or
  // cross-workspace reference returns the same WORKSPACE_ACCESS_DENIED (404) so existence never
  // leaks. addMembershipRoleForTest seeds a second active membership (e.g. REVIEWER) so the
  // permission-denial proof exercises the real server-side role check at the API boundary.
  function corruptRetainedHashForTest(input) {
    if (env.APP_ENV !== "test") {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    const lineage = [...creativeLineages.values()].find(
      (candidate) => candidate.workspaceId === input.workspaceId && candidate.finalVideoId === input.finalVideoId
    );
    if (!lineage) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    const tamperedSha256 = "0".repeat(64);
    if (input.target === "render_attempt") {
      const attempt = renderAttempts.get(lineage.renderAttemptId);
      if (!attempt) {
        return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
      }
      attempt.outputHash = tamperedSha256;
    } else {
      const finalVideo = finalVideos.get(lineage.finalVideoId);
      if (!finalVideo) {
        return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
      }
      finalVideo.sha256 = tamperedSha256;
    }
    return { ok: true, response: { tamperedSha256 } };
  }

  function addMembershipRoleForTest(input) {
    if (env.APP_ENV !== "test") {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    const workspace = workspaces.get(input.workspaceId);
    if (!workspace) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    ensureUser({ userId: input.userId, email: input.email ?? `${input.userId}@example.test` });
    const now = new Date().toISOString();
    const membership = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now
    };
    memberships.set(membership.id, membership);
    return { ok: true, response: { membership } };
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
    rotateServiceCredential,
    setSimulatorMode,
    recordRestoreDrill,
    runRedactionScan,
    runB2Benchmark,
    runBacklogSimulation,
    runIncidentRehearsal,
    getWorkspaceOperationalAlerts,
    runIdempotent,
    initiateArtifactUpload,
    putArtifactUpload,
    completeArtifactUpload,
    createArtifactDownload,
    createBrandCrawlRun,
    listBrands,
    listBrandAssets,
    getBrandCrawlRun,
    getBrandAssetPack,
    getUserProfile,
    updateUserProfile,
    getOnboardingBrandContext,
    saveOnboardingBrandContext,
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
    updateBrandCandidateDecision,
    listDeadLetterJobs,
    claimJob,
    heartbeatJob,
    completeJob,
    failJob,
    expireJobLeases,
    relayOutbox,
    listAvatars,
    revokeAvatarConsent,
    createCreditPurchase,
    processPaymentCallback,
    listWalletLedger,
    createCreditAdjustment,
    createCompositionPlan,
    renderCompositionPlan,
    createReviewItem,
    addReviewComment,
    getReviewItem,
    listReviewItems,
    listReviewComments,
    recordReviewDecision,
    createCalendarPost,
    updateCalendarPost,
    submitPublishOperation,
    reconcilePublishOperation,
    processPublishingCallback,
    verifyCalendarPost,
    getLineageForActor,
    collectPerformanceForActor,
    getPerformanceForActor,
    ...(env.APP_ENV === "test"
      ? { corruptRetainedHashForTest, addMembershipRoleForTest }
      : {}),
    disconnect: () => {}
  };
}

export function createPrismaWorkspaceStore(env = process.env, dependencies = {}) {
  const objectStorage = dependencies.objectStorage ?? createObjectStorage(env);
  const uploadTokens = new Map();
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
        const targetBrand = input.brandId ? await tx.brand.findFirst({
          where: { id: input.brandId, workspaceId: input.workspaceId, status: "ACTIVE" }
        }) : null;
        if (input.brandId && !targetBrand) {
          return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
        }
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
        const brandAsset = targetBrand ? await tx.brandAsset.create({
          data: {
            workspaceId: input.workspaceId, brandId: targetBrand.id, crawlRunId: null,
            artifactId: artifact.id, rightsBasis: input.rightsBasis.trim(), permittedUse: input.permittedUse.trim(), status: "ACTIVE"
          }
        }) : null;

        const upload = signedContract("PUT", artifact.id);
        upload.url = objectStorage.provider === "b2"
          ? await objectStorage.createSignedUploadUrl({ area: "quarantine", key: artifact.objectKey, contentType: artifact.contentType })
          : `/api/v0/brands/assets/uploads/${artifact.id}/content?token=${encodeURIComponent(upload.token)}`;
        upload.headers = { "content-type": artifact.contentType };
        uploadTokens.set(upload.token, {
          artifactId: artifact.id,
          workspaceId: artifact.workspaceId,
          userId: actor.userId,
          expiresAt: upload.expiresAt
        });
        return {
          ok: true,
          response: {
            artifact: publicArtifact(artifact),
            brandAsset: brandAsset ? publicBrandAsset(brandAsset, artifact) : null,
            upload
          }
        };
      },
      input.workspaceId
    );
  }

  async function putArtifactUpload(token, artifactId, body, contentType) {
    const grant = uploadTokens.get(token);
    if (!grant || grant.artifactId !== artifactId || Date.parse(grant.expiresAt) <= Date.now()) {
      return { ok: false, problem: problem("UPLOAD_URL_EXPIRED", 403, "Upload URL expired", "Request a new upload URL and try again.") };
    }
    const actor = { userId: grant.userId };
    const artifact = await withActor(actor, (tx) => tx.artifact.findFirst({
      where: { id: artifactId, workspaceId: grant.workspaceId, status: "QUARANTINED" }
    }), grant.workspaceId);
    if (!artifact) return { ok: false, problem: problem("UPLOAD_URL_EXPIRED", 403, "Upload URL expired", "Request a new upload URL and try again.") };
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > artifact.byteSize || contentType !== artifact.contentType) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "The uploaded file did not match the initiated upload.") };
    }
    await objectStorage.putObject({ area: "quarantine", key: artifact.objectKey, body, contentType, sha256: artifact.sha256 });
    return { ok: true, response: { uploaded: true } };
  }

  async function completeArtifactUpload(actor, artifactId, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    const artifact = await withActor(actor, (tx) => tx.artifact.findFirst({
      where: { id: artifactId, workspaceId: input.workspaceId }
    }), input.workspaceId);
    if (!artifact) return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    if (!isSha256(input.sha256) || !Number.isInteger(input.byteSize) || input.byteSize <= 0) {
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    if (artifact.status === "CLEAN") {
      if (input.sha256.toLowerCase() === artifact.sha256 && input.byteSize === artifact.byteSize) {
        return { ok: true, response: { artifact: publicArtifact(artifact) } };
      }
      return { ok: false, problem: { ...problem("ARTIFACT_HASH_MISMATCH", 409, "Artifact hash mismatch", "The file did not match the retained asset."), artifact: publicArtifact(artifact) } };
    }
    let bytes;
    try {
      bytes = await objectStorage.getObject({ area: "quarantine", key: artifact.objectKey });
    } catch {
      return { ok: false, problem: problem("UPLOAD_URL_EXPIRED", 409, "Upload is incomplete", "Upload the file before completing this asset.") };
    }
    const retainedHash = createHash("sha256").update(bytes).digest("hex");
    if (input.sha256.toLowerCase() !== artifact.sha256 || input.byteSize !== artifact.byteSize || bytes.length !== artifact.byteSize || retainedHash !== artifact.sha256) {
      const rejected = await withActor(actor, (tx) => tx.artifact.update({ where: { id: artifact.id }, data: { status: "REJECTED", retentionClass: "quarantine" } }), input.workspaceId);
      return { ok: false, problem: { ...problem("ARTIFACT_HASH_MISMATCH", 409, "Artifact hash mismatch", "The file did not match the expected content. It was not accepted."), artifact: publicArtifact(rejected) } };
    }
    if (!supportedContentTypes.has(artifact.contentType)) {
      const rejected = await withActor(actor, (tx) => tx.artifact.update({ where: { id: artifact.id }, data: { status: "REJECTED", retentionClass: "quarantine" } }), input.workspaceId);
      return { ok: false, problem: { ...problem("ASSET_TYPE_UNSUPPORTED", 415, "Asset type unsupported", "This file type is not supported."), artifact: publicArtifact(rejected) } };
    }
    const cleanObjectKey = artifact.objectKey.replace(/^quarantine\//, "clean-media/");
    try {
      await objectStorage.copyObject({ sourceArea: "quarantine", sourceKey: artifact.objectKey, destinationArea: "clean-media", destinationKey: cleanObjectKey, contentType: artifact.contentType, sha256: artifact.sha256 });
      const promoted = await objectStorage.headObject({ area: "clean-media", key: cleanObjectKey });
      if (promoted.byteSize !== artifact.byteSize) throw new Error("ARTIFACT_STORAGE_VERIFICATION_FAILED");
    } catch {
      return { ok: false, problem: problem("DEPENDENCY_UNAVAILABLE", 503, "Storage unavailable", "The asset remains quarantined. Try completion again.", true) };
    }
    const clean = await withActor(actor, (tx) => tx.artifact.update({
      where: { id: artifact.id }, data: { status: "CLEAN", retentionClass: "clean-media", objectKey: cleanObjectKey }
    }), input.workspaceId);
    await objectStorage.deleteObject({ area: "quarantine", key: artifact.objectKey }).catch(() => undefined);
    return { ok: true, response: { artifact: publicArtifact(clean) } };
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
        const download = signedContract("GET", artifact.id);
        download.url = await objectStorage.createSignedDownloadUrl({ area: "clean-media", key: artifact.objectKey });
        return {
          ok: true,
          response: {
            artifact: publicArtifact(artifact),
            download
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
        const normalizedDomain = new URL(validation.normalizedUrl).hostname.toLowerCase();
        let brand = await tx.brand.findFirst({
          where: { workspaceId: input.workspaceId, normalizedDomain, status: "ACTIVE" },
          orderBy: { createdAt: "asc" }
        });
        const claimedAsset = validation.assets.length > 0 ? await tx.brandAsset.findFirst({
          where: {
            workspaceId: input.workspaceId,
            artifactId: { in: validation.assets.map((asset) => asset.artifactId) },
            ...(brand ? { brandId: { not: brand.id } } : {})
          }
        }) : null;
        if (claimedAsset) {
          return { ok: false, problem: problem("BRAND_ASSET_NOT_APPROVED", 409, "Brand asset not approved", "This asset belongs to a different brand.") };
        }
        if (!brand) {
          const requestedName = optionalString(input.brandName);
          const domainHash = createHash("sha256").update(normalizedDomain).digest("hex").slice(0, 10);
          const identitySlug = `${slugify(normalizedDomain) || "brand"}-${domainHash}`;
          brand = await tx.brand.upsert({
            where: { workspaceId_slug: { workspaceId: input.workspaceId, slug: identitySlug } },
            create: {
              workspaceId: input.workspaceId,
              name: requestedName ?? recognizableBrandName(normalizedDomain),
              slug: identitySlug,
              websiteUrl: validation.normalizedUrl,
              normalizedDomain,
              status: "ACTIVE"
            },
            update: {}
          });
        } else if (optionalString(input.brandName) && brand.name !== input.brandName.trim()) {
          brand = await tx.brand.update({ where: { id: brand.id }, data: { name: input.brandName.trim() } });
        }
        const crawlRun = await tx.brandCrawlRun.create({
          data: {
            workspaceId: input.workspaceId,
            brandId: brand.id,
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
                brandId: brand.id,
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
              selectedBrandType: validation.selectedBrandType,
              brandAssetIds: retainedAssets.map((asset) => asset.id)
            }),
            input: {
              requestId,
              traceId,
              brandCrawlRunId: crawlRun.id,
              brandId: brand.id,
              normalizedUrl: crawlRun.normalizedUrl,
              crawlScope: crawlRun.crawlScope,
              selectedBrandType: validation.selectedBrandType,
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
            brand: publicBrand(brand),
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

  async function listBrands(actor, workspaceId) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    return withActor(actor, async (tx) => ({
      ok: true,
      response: {
        brands: (await tx.brand.findMany({
          where: { workspaceId, status: "ACTIVE" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 100
        })).map(publicBrand)
      }
    }), workspaceId);
  }

  async function listBrandAssets(actor, brandId) {
    const accessibleWorkspaces = await listWorkspaces(actor);
    for (const workspace of accessibleWorkspaces) {
      const result = await withActor(actor, async (tx) => {
        const brand = await tx.brand.findFirst({ where: { id: brandId, workspaceId: workspace.id, status: "ACTIVE" } });
        if (!brand) return null;
        const assets = await tx.brandAsset.findMany({
          where: { workspaceId: workspace.id, brandId, status: "ACTIVE", artifact: { status: "CLEAN" } },
          include: { artifact: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 200
        });
        return {
          ok: true,
          response: { brand: publicBrand(brand), assets: assets.map((asset) => publicBrandAsset(asset, asset.artifact)) }
        };
      }, workspace.id);
      if (result) return result;
    }
    return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
  }

  async function getBrandCrawlRun(actor, crawlRunId) {
    const accessibleWorkspaces = await listWorkspaces(actor);
    for (const workspace of accessibleWorkspaces) {
      const detail = await withActor(actor, async (tx) => {
        const crawlRun = await tx.brandCrawlRun.findFirst({ where: { id: crawlRunId, workspaceId: workspace.id } });
        if (!crawlRun) return null;
        const [assets, candidates] = await Promise.all([
          tx.brandAsset.findMany({ where: { workspaceId: workspace.id, crawlRunId }, include: { artifact: true }, orderBy: { createdAt: "asc" } }),
          tx.brandCandidate.findMany({ where: { workspaceId: workspace.id, crawlRunId }, orderBy: { createdAt: "asc" } })
        ]);
        return {
          ok: true,
          response: {
            crawlRun: publicBrandCrawlRun(crawlRun),
            brandAssets: assets.map((asset) => publicBrandAsset(asset, asset.artifact)),
            candidates: candidates.map(publicBrandCandidate)
          }
        };
      }, workspace.id);
      if (detail) return detail;
    }
    return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
  }

  async function getBrandAssetPack(actor, crawlRunId) {
    const detail = await getBrandCrawlRun(actor, crawlRunId);
    if (!detail.ok) return detail;
    const candidates = detail.response.candidates;
    const byGroup = (types) => candidates.filter((candidate) => types.includes(candidate.fieldType));
    return {
      ok: true,
      response: {
        crawlRun: detail.response.crawlRun,
        assetPack: {
          identity: byGroup(["identity", "summary", "color", "font", "logo", "media_asset"]),
          messaging: byGroup(["copy_messaging", "usp", "cta", "audience", "tone", "positioning"]),
          offers: byGroup(["offer", "pricing", "product", "service"]),
          trustProof: byGroup(["social_proof", "testimonial", "rating", "certification", "award", "case_study", "metric"]),
          vertical: byGroup(["vertical_conflict", "product_service", "claim", "metadata"]),
          mediaInventory: byGroup(["visual_identity", "color", "font", "logo", "media_asset"]),
          voice: byGroup(["voice", "tone", "audience"]),
          publishingSocial: byGroup(["publishing_social"]),
          complianceRights: byGroup(["prohibited_claim", "regulated_claim", "rights_warning", "disclaimer", "rights_asset"]),
          missingAssets: byGroup(["missing_asset"]),
          readiness: {
            score: calculateBrandCandidateReadiness(candidates),
            status: candidates.length > 0 ? "approval_required" : "missing_assets"
          }
        }
      }
    };
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

  async function updateBrandCandidateDecision(actor, crawlRunId, candidateId, decision) {
    return withActor(actor, async (tx) => {
      const crawlRun = await tx.brandCrawlRun.findFirst({ where: { id: crawlRunId } });
      if (!crawlRun) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      const candidate = await tx.brandCandidate.findFirst({
        where: { id: candidateId, crawlRunId, workspaceId: crawlRun.workspaceId }
      });
      if (!candidate) {
        return {
          ok: false,
          problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
        };
      }
      const updated = await tx.brandCandidate.update({
        where: { id: candidateId },
        data: { decision }
      });
      return {
        ok: true,
        response: { success: true, candidate: publicBrandCandidate(updated) }
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
        if (!crawlRun || crawlRun.brandId !== brandId) {
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

  // V0-A2 consent revocation (Prisma). Monotonic governance toggle under a short
  // withActor transaction: a missing or cross-workspace avatar/brand profile hides
  // behind the existence-hiding 404 (RLS plus the tenant-leading predicate), an
  // avatar with no consent record returns AVATAR_CONSENT_REQUIRED, and a
  // not-yet-revoked consent is stamped revokedAt/revokedByUserId with an
  // immutable audit row. An already-revoked consent converges to the same state
  // with no second write. Consent evidence never reaches the response.
  async function revokeAvatarConsent(actor, avatarProfileId, input) {
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
          where: { id: input.brandProfileId, workspaceId: input.workspaceId }
        });
        if (!profile) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        await ensurePrismaAvatarCatalog(tx, input.workspaceId, input.brandProfileId);
        const avatar = await tx.avatarProfile.findFirst({
          where: {
            id: avatarProfileId,
            workspaceId: input.workspaceId,
            brandProfileId: input.brandProfileId
          },
          include: { consent: true }
        });
        if (!avatar) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        if (!avatar.consent) {
          return { ok: false, problem: avatarConsentProblem("consent_required") };
        }
        if (!avatar.consent.revokedAt) {
          const now = new Date();
          await tx.avatarConsent.update({
            where: { avatarProfileId },
            data: { revokedAt: now, revokedByUserId: actor.userId, updatedAt: now }
          });
          await tx.avatarProfile.update({
            where: { id: avatarProfileId },
            data: { updatedAt: now }
          });
          await tx.auditEvent.create({
            data: {
              workspaceId: input.workspaceId,
              actorUserId: actor.userId,
              eventType: "consent.revoked",
              targetType: "AvatarProfile",
              targetId: avatarProfileId,
              reason: typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : null
            }
          });
        }
        const refreshed = await tx.avatarProfile.findUnique({
          where: { id: avatarProfileId },
          include: { consent: true }
        });
        return { ok: true, response: { avatar: publicAvatar(refreshed, refreshed.consent, Date.now()) } };
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
  async function createCompositionPlan(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const registry = aeCapabilityRegistry(env);

    // resolveAsset looks up a retained CLEAN generated asset in the caller's workspace.
    // A cross-workspace asset id resolves to null (RLS hides it) and is reported as
    // AE_ASSET_MISSING without leaking that the asset exists elsewhere.
    const resolveAsset = async (assetId) => {
      const asset = await prisma.generatedAsset.findFirst({
        where: { id: assetId, workspaceId }
      });
      if (!asset) {
        return null;
      }
      return { id: asset.id, status: String(asset.status || "").toUpperCase() };
    };

    const validation = await validateAePlan(input.timeline, registry, resolveAsset);

    // Canonical timeline JSON: a stable key order makes the plan artifact sha256
    // reproducible across retries. The hash is retained server-side only.
    const canonicalTimeline = JSON.stringify(
      {
        schemaVersion: input.timeline?.schemaVersion ?? null,
        capabilityVersion: input.timeline?.capabilityVersion ?? null,
        durationSeconds: input.timeline?.durationSeconds ?? null,
        resolution: input.timeline?.resolution ?? null,
        tracks: input.timeline?.tracks ?? [],
        overlays: input.timeline?.overlays ?? [],
        effects: input.timeline?.effects ?? [],
        fonts: input.timeline?.fonts ?? [],
        plugins: input.timeline?.plugins ?? [],
        templates: input.timeline?.templates ?? []
      },
      null,
      0
    );
    const planArtifactSha256 = createHash("sha256").update(canonicalTimeline).digest("hex");

    const result = await withActor(
      actor,
      async (tx) => {
        const now = new Date();
        const instruction = await tx.compositionInstruction.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            generationAssetId: input.generationAssetId,
            inputMode: input.inputMode,
            rawDirection: input.rawDirection ?? null,
            status: validation.ok ? "VALIDATED" : "VALIDATION_FAILED",
            version: 1
          }
        });

        if (validation.ok) {
          const planArtifact = await tx.artifact.create({
            data: {
              workspaceId,
              fileName: `composition-plan-${instruction.id}.json`,
              contentType: "application/json",
              byteSize: Buffer.byteLength(canonicalTimeline, "utf8"),
              sha256: planArtifactSha256,
              status: "CLEAN",
              retentionClass: "plan-artifact",
              producer: `composition:${instruction.id}`,
              schemaVersion: AE_PLAN_SCHEMA_VERSION,
              objectKey: `plan-artifacts/${workspaceId}/${randomUUID()}.json`
            }
          });
          const plan = await tx.aePlan.create({
            data: {
              workspaceId,
              compositionInstructionId: instruction.id,
              version: 1,
              capabilityVersion: registry.capabilityVersion,
              schemaVersion: AE_PLAN_SCHEMA_VERSION,
              timeline: input.timeline ?? {},
              status: "VALIDATED",
              unsupportedItems: [],
              planArtifactId: planArtifact.id,
              validatedAt: now
            }
          });
          const audit = await tx.auditEvent.create({
            data: {
              workspaceId,
              actorUserId: actor.userId,
              eventType: "composition.plan_validated",
              targetType: "CompositionInstruction",
              targetId: instruction.id
            }
          });
          return {
            ok: true,
            response: {
              composition: publicCompositionInstruction(instruction),
              plan: publicAePlan(plan),
              artifact: publicArtifact(planArtifact),
              audit: publicAudit(audit)
            }
          };
        }

        const plan = await tx.aePlan.create({
          data: {
            workspaceId,
            compositionInstructionId: instruction.id,
            version: 1,
            capabilityVersion: registry.capabilityVersion,
            schemaVersion: AE_PLAN_SCHEMA_VERSION,
            timeline: input.timeline ?? {},
            status: "VALIDATION_FAILED",
            unsupportedItems: validation.unsupported
          }
        });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "composition.validation_failed",
            targetType: "CompositionInstruction",
            targetId: instruction.id
          }
        });
        const problemDetail = problem(
          validation.primary.code,
          validation.primary.status,
          "Composition plan validation failed",
          validation.primary.detail
        );
        problemDetail.planStatus = "validation_failed";
        problemDetail.compositionId = instruction.id;
        problemDetail.planId = plan.id;
        problemDetail.unsupported = validation.unsupported;
        return { ok: false, problem: problemDetail, audit: publicAudit(audit) };
      },
      workspaceId
    );

    if (!result.ok) {
      return { ok: false, problem: result.problem };
    }
    return { ok: true, response: result.response };
  }

  // V0-C2 Prisma: render a validated composition plan into one retained 9:16 final MP4,
  // thumbnail and captions through the deterministic AE worker. The RenderAttempt is
  // persisted RUNNING (with the CLEAN render-logs artifact and a render_started audit) in a
  // first short transaction BEFORE the worker runs — persist external side-effect operation
  // before the work — so a crash after persist is recovered by a second call with the same
  // idempotency key. The worker output is validated against the plan before any final media
  // is retained in a second short transaction. A succeeded render retains a versioned
  // FinalVideo (CURRENT) and supersedes the prior CURRENT final video (SUPERSEDED) without
  // overwriting it. The partial unique indexes (one RUNNING attempt per instruction, one
  // CURRENT final video per instruction) turn a concurrent render into a P2002/P2034 that is
  // normalized below into a replay or a recoverable 503, never a raw 500. Cross-workspace
  // existence never leaks (RLS hides the instruction/plan/final video).
  async function renderCompositionPlan(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;

    const instruction = await prisma.compositionInstruction.findFirst({
      where: { id: input.compositionInstructionId, workspaceId }
    });
    if (!instruction) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const plan = await prisma.aePlan.findFirst({
      where: { compositionInstructionId: instruction.id, workspaceId, status: "VALIDATED" }
    });
    if (!plan) {
      const problemDetail = problem(
        "AE_PLAN_SCHEMA_INVALID",
        422,
        "Composition plan not renderable",
        "Only a validated composition plan can be rendered."
      );
      problemDetail.compositionId = instruction.id;
      return { ok: false, problem: problemDetail };
    }

    const canonicalTimeline = JSON.stringify(
      {
        schemaVersion: plan.timeline?.schemaVersion ?? null,
        capabilityVersion: plan.timeline?.capabilityVersion ?? null,
        durationSeconds: plan.timeline?.durationSeconds ?? null,
        resolution: plan.timeline?.resolution ?? null,
        tracks: plan.timeline?.tracks ?? [],
        overlays: plan.timeline?.overlays ?? [],
        effects: plan.timeline?.effects ?? [],
        fonts: plan.timeline?.fonts ?? [],
        plugins: plan.timeline?.plugins ?? [],
        templates: plan.timeline?.templates ?? []
      },
      null,
      0
    );
    const planCanonicalHash = createHash("sha256").update(canonicalTimeline).digest("hex");
    const durationSeconds = Number(plan.timeline?.durationSeconds) || 30;
    const expectedCapabilityVersion = plan.capabilityVersion;

    const trackAssetIds = [
      ...new Set((plan.timeline?.tracks ?? []).map((track) => track?.assetId).filter(Boolean))
    ];
    const assets = trackAssetIds.length
      ? await prisma.generatedAsset.findMany({
          where: { id: { in: trackAssetIds }, workspaceId },
          select: { id: true, sha256: true }
        })
      : [];
    const inputAssetHashes = assets.map((asset) => asset.sha256);

    // V0-C2 render idempotency is input-bound: the idempotency key is scoped to the exact render
    // operation input (composition instruction, AE plan, plan canonical hash, input asset hashes,
    // capability version). The same key replayed against a different composition is a conflict,
    // never a silent replay of the wrong final video.
    const idempotencyInputHash = computeRenderIdempotencyInputHash({
      compositionInstructionId: instruction.id,
      aePlanId: plan.id,
      planCanonicalHash,
      inputAssetHashes,
      capabilityVersion: expectedCapabilityVersion
    });

    // Idempotency: an existing attempt by (workspaceId, idempotencyKey) is replayed or resumed.
    const existing = await prisma.renderAttempt.findFirst({
      where: { workspaceId, idempotencyKey: input.idempotencyKey }
    });
    // The same key used with a different render operation input is a conflict. Legacy rows with
    // no input hash (null) skip this check and replay as before.
    if (existing && existing.idempotencyInputHash && existing.idempotencyInputHash !== idempotencyInputHash) {
      return {
        ok: false,
        problem: problem(
          "IDEMPOTENCY_INPUT_CONFLICT",
          409,
          "Idempotency input conflict",
          "This request identity was already used with different render details."
        )
      };
    }
    if (existing && existing.status === "SUCCEEDED") {
      const finalVideo = await prisma.finalVideo.findFirst({
        where: { renderAttemptId: existing.id, workspaceId }
      });
      const replayLineage = finalVideo
        ? await prisma.creativeLineage.findFirst({
            where: { workspaceId, finalVideoId: finalVideo.id }
          })
        : null;
      const refreshedInstruction = await prisma.compositionInstruction.findUnique({
        where: { id: instruction.id }
      });
      const successAudit = await prisma.auditEvent.findFirst({
        where: { workspaceId, eventType: "composition.render_succeeded", targetId: instruction.id }
      });
      return {
        ok: true,
        response: await buildPrismaRenderSuccessResponse(existing, finalVideo, refreshedInstruction, successAudit, {
          lineage: replayLineage
        })
      };
    }
    if (existing && existing.status === "FAILED") {
      return { ok: false, problem: await buildPrismaRenderFailureProblem(existing, instruction.id, workspaceId) };
    }

    // Persist the RUNNING attempt before the worker runs. A new attempt creates the CLEAN
    // render-logs artifact and a render_started audit. A resume (existing RUNNING) skips this.
    let attempt = existing;
    if (!attempt) {
      try {
        attempt = await withActor(
          actor,
          async (tx) => {
            const logsArtifact = await tx.artifact.create({
              data: {
                workspaceId,
                fileName: `render-logs-${input.idempotencyKey}.json`,
                contentType: "application/json",
                byteSize: RENDER_LOG_BYTE_SIZE,
                sha256: createHash("sha256").update(`render-logs:${input.idempotencyKey}`).digest("hex"),
                status: "CLEAN",
                retentionClass: "render-logs",
                producer: `render-logs:${input.idempotencyKey}`,
                schemaVersion: AE_RENDER_SCHEMA_VERSION,
                objectKey: `render-logs/${workspaceId}/${randomUUID()}.json`
              }
            });
            const created = await tx.renderAttempt.create({
              data: {
                workspaceId,
                compositionInstructionId: instruction.id,
                aePlanId: plan.id,
                version: 1,
                renderer: "ae-render-simulator",
                inputHash: planCanonicalHash,
                inputAssetHashes,
                workerCapabilityVersion: expectedCapabilityVersion,
                idempotencyInputHash,
                status: "RUNNING",
                logsArtifactId: logsArtifact.id,
                costMinor: 0,
                idempotencyKey: input.idempotencyKey
              }
            });
            await tx.auditEvent.create({
              data: {
                workspaceId,
                actorUserId: actor.userId,
                eventType: "composition.render_started",
                targetType: "CompositionInstruction",
                targetId: instruction.id,
                reason: "render_started"
              }
            });
            return created;
          },
          workspaceId
        );
      } catch (error) {
        if (isPrismaConflictError(error)) {
          // A concurrent render already holds the one-active-per-instruction slot. Tell the
          // caller to retry; never surface a raw 500 and never blindly retry the worker.
          const problemDetail = problem(
            "DEPENDENCY_UNAVAILABLE",
            503,
            "Render already in progress",
            "A render is already in progress for this composition plan. Retry shortly."
          );
          problemDetail.attemptStatus = "running";
          problemDetail.compositionId = instruction.id;
          problemDetail.retryable = true;
          return { ok: false, problem: problemDetail };
        }
        throw error;
      }

      // Crash window: the RUNNING attempt is committed, but the worker is unavailable before
      // any final media is retained. A second call with the same idempotency key resumes.
      if (resolveAeRenderMode(env) === "crash") {
        const problemDetail = problem(
          "DEPENDENCY_UNAVAILABLE",
          503,
          "Render worker unavailable",
          "The render worker is unavailable; retry with the same idempotency key to resume."
        );
        problemDetail.attemptStatus = "running";
        problemDetail.compositionId = instruction.id;
        problemDetail.attemptId = attempt.id;
        problemDetail.retryable = true;
        return { ok: false, problem: problemDetail };
      }
    }

    // Run the AE worker through the adapter only. Transient worker URLs and raw responses
    // stay inside the adapter and never reach here.
    const workerResult = renderAeVideo(env, {
      planCanonicalHash,
      durationSeconds,
      capabilityVersion: expectedCapabilityVersion
    });
    if (!workerResult.ok) {
      return await failPrismaRenderAttempt(actor, attempt, instruction, "AE_RENDER_FAILED", 422, "The AE worker is not available.", workspaceId);
    }
    const validation = validateAeRenderOutput(workerResult.render, {
      capabilityVersion: expectedCapabilityVersion,
      planCanonicalHash,
      durationSeconds
    });
    if (!validation.ok) {
      return await failPrismaRenderAttempt(actor, attempt, instruction, validation.code, validation.status, validation.detail, workspaceId);
    }

    // Second short transaction: retain the CLEAN final media, bind a new CURRENT FinalVideo,
    // supersede the prior current, mark the attempt SUCCEEDED and the composition RENDERED.
    const render = workerResult.render;
    let completed;
    try {
      completed = await withActor(
        actor,
        async (tx) => {
          const now = new Date();
          const finalVideoArtifact = await tx.artifact.create({
            data: {
              workspaceId,
              fileName: `final-video-${attempt.id}.mp4`,
              contentType: render.finalVideo.contentType,
              byteSize: render.finalVideo.byteSize,
              sha256: render.finalVideo.sha256,
              status: "CLEAN",
              retentionClass: "final-video",
              producer: `render:${attempt.id}:final-video`,
              schemaVersion: AE_RENDER_SCHEMA_VERSION,
              objectKey: `final-videos/${workspaceId}/${attempt.id}.mp4`
            }
          });
          const thumbnailArtifact = await tx.artifact.create({
            data: {
              workspaceId,
              fileName: `final-thumbnail-${attempt.id}.jpg`,
              contentType: render.thumbnail.contentType,
              byteSize: render.thumbnail.byteSize,
              sha256: render.thumbnail.sha256,
              status: "CLEAN",
              retentionClass: "final-thumbnail",
              producer: `render:${attempt.id}:thumbnail`,
              schemaVersion: AE_RENDER_SCHEMA_VERSION,
              objectKey: `final-thumbnails/${workspaceId}/${attempt.id}.jpg`
            }
          });
          const captionsArtifact = await tx.artifact.create({
            data: {
              workspaceId,
              fileName: `final-captions-${attempt.id}.vtt`,
              contentType: render.captions.contentType,
              byteSize: render.captions.byteSize,
              sha256: render.captions.sha256,
              status: "CLEAN",
              retentionClass: "final-captions",
              producer: `render:${attempt.id}:captions`,
              schemaVersion: AE_RENDER_SCHEMA_VERSION,
              objectKey: `final-captions/${workspaceId}/${attempt.id}.vtt`
            }
          });

          const priorCurrent = await tx.finalVideo.findFirst({
            where: { compositionInstructionId: instruction.id, workspaceId, status: "CURRENT" }
          });
          let supersededFinalVideo = null;
          let supersededAudit = null;
          if (priorCurrent) {
            supersededFinalVideo = await tx.finalVideo.update({
              where: { id: priorCurrent.id },
              data: { status: "SUPERSEDED" }
            });
            supersededAudit = await tx.auditEvent.create({
              data: {
                workspaceId,
                actorUserId: actor.userId,
                eventType: "composition.video_superseded",
                targetType: "CompositionInstruction",
                targetId: instruction.id,
                reason: "superseded"
              }
            });
          }
          const nextVersion = priorCurrent ? Number(priorCurrent.version) + 1 : 1;
          const finalVideo = await tx.finalVideo.create({
            data: {
              workspaceId,
              compositionInstructionId: instruction.id,
              renderAttemptId: attempt.id,
              version: nextVersion,
              status: "CURRENT",
              finalVideoArtifactId: finalVideoArtifact.id,
              thumbnailArtifactId: thumbnailArtifact.id,
              captionsArtifactId: captionsArtifact.id,
              durationSeconds,
              resolution: render.finalVideo.resolution,
              codec: render.finalVideo.codec,
              sha256: render.finalVideo.sha256,
              byteSize: render.finalVideo.byteSize,
              capabilityVersion: expectedCapabilityVersion,
              schemaVersion: AE_RENDER_SCHEMA_VERSION
            }
          });

          // V0-C2 render-level lineage: an immutable CreativeLineage row tying the retained final
          // video back through the composition instruction, AE plan and render attempt, copying
          // the G5 generated-asset ancestry in-row. A revision creates a new lineage row for the
          // new final video and never overwrites the prior row.
          const g5Lineage = await tx.creativeLineage.findFirst({
            where: { workspaceId, generatedAssetId: instruction.generationAssetId }
          });
          const renderLineage = await tx.creativeLineage.create({
            data: {
              workspaceId,
              generationJobId: null,
              brandProfileId: g5Lineage?.brandProfileId ?? undefined,
              selectedScriptId: g5Lineage?.selectedScriptId ?? undefined,
              avatarProfileId: g5Lineage?.avatarProfileId ?? undefined,
              estimateId: g5Lineage?.estimateId ?? undefined,
              provider: g5Lineage?.provider ?? undefined,
              providerOperationId: g5Lineage?.providerOperationId ?? undefined,
              priceVersion: g5Lineage?.priceVersion ?? undefined,
              generatedAssetId: instruction.generationAssetId,
              compositionInstructionId: instruction.id,
              aePlanId: plan.id,
              renderAttemptId: attempt.id,
              finalVideoId: finalVideo.id
            }
          });

          const updatedAttempt = await tx.renderAttempt.update({
            where: { id: attempt.id },
            data: {
              status: "SUCCEEDED",
              outputHash: render.finalVideo.sha256,
              workerCapabilityVersion: render.workerCapabilityVersion,
              completedAt: now
            }
          });
          const updatedInstruction = await tx.compositionInstruction.update({
            where: { id: instruction.id },
            data: { status: "RENDERED" }
          });
          const successAudit = await tx.auditEvent.create({
            data: {
              workspaceId,
              actorUserId: actor.userId,
              eventType: "composition.render_succeeded",
              targetType: "CompositionInstruction",
              targetId: instruction.id,
              reason: "render_succeeded"
            }
          });
          return {
            attempt: updatedAttempt,
            finalVideo,
            instruction: updatedInstruction,
            successAudit,
            finalVideoArtifact,
            thumbnailArtifact,
            captionsArtifact,
            supersededFinalVideo,
            supersededAudit,
            lineage: renderLineage
          };
        },
        workspaceId
      );
    } catch (error) {
      if (isPrismaConflictError(error)) {
        // A concurrent completion already retained the current final video for this
        // instruction. Re-read and replay the succeeded render, never a raw 500.
        const replayed = await reconcilePrismaRenderRace(actor, input, attempt.id, workspaceId);
        if (replayed.problem) {
          return { ok: false, problem: replayed.problem };
        }
        return { ok: true, response: replayed.response };
      }
      throw error;
    }

    return {
      ok: true,
      response: buildPrismaRenderSuccessResponse(
        completed.attempt,
        completed.finalVideo,
        completed.instruction,
        completed.successAudit,
        {
          finalVideoArtifact: completed.finalVideoArtifact,
          thumbnailArtifact: completed.thumbnailArtifact,
          captionsArtifact: completed.captionsArtifact,
          supersededFinalVideo: completed.supersededFinalVideo,
          supersededAudit: completed.supersededAudit,
          lineage: completed.lineage
        }
      )
    };
  }

  // Mark a Prisma render attempt FAILED and return the classified problem. The failure code
  // is retained on the render_failed audit reason so an idempotency-key replay reconstructs
  // the same problem without re-running the worker. No final media is retained.
  async function failPrismaRenderAttempt(actor, attempt, instruction, code, status, detail, workspaceId) {
    await withActor(
      actor,
      async (tx) => {
        await tx.renderAttempt.update({
          where: { id: attempt.id },
          data: { status: "FAILED", completedAt: new Date() }
        });
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "composition.render_failed",
            targetType: "CompositionInstruction",
            targetId: instruction.id,
            reason: code
          }
        });
      },
      workspaceId
    );
    const problemDetail = problem(code, status, "Composition render failed", detail);
    problemDetail.attemptStatus = "failed";
    problemDetail.compositionId = instruction.id;
    problemDetail.attemptId = attempt.id;
    return { ok: false, problem: problemDetail };
  }

  // Reconstruct a failure problem for a FAILED attempt replay. The failure code is read from
  // the most recent render_failed audit for the instruction (the audit reason).
  async function buildPrismaRenderFailureProblem(attempt, instructionId, workspaceId) {
    const failureAudit = await prisma.auditEvent.findFirst({
      where: { workspaceId, eventType: "composition.render_failed", targetId: instructionId },
      orderBy: { occurredAt: "desc" }
    });
    const code = failureAudit?.reason || "AE_RENDER_FAILED";
    const status = code === "AE_CAPABILITY_UNAVAILABLE" ? 409 : 422;
    const problemDetail = problem(code, status, "Composition render failed", "The render attempt failed previously.");
    problemDetail.attemptStatus = "failed";
    problemDetail.compositionId = instructionId;
    problemDetail.attemptId = attempt.id;
    return problemDetail;
  }

  // Re-read the render state after a Prisma unique-constraint (P2002) or write conflict
  // (P2034) during the completion transaction. A concurrent completion that already retained
  // the current final video and marked the attempt SUCCEEDED is replayed; a still-RUNNING
  // attempt means a concurrent completion is in flight and the caller should retry. Never
  // throws a raw DB failure and never blindly retries the worker.
  async function reconcilePrismaRenderRace(actor, input, attemptId, workspaceId) {
    const attempt = await prisma.renderAttempt.findUnique({ where: { id: attemptId } });
    if (attempt && attempt.status === "SUCCEEDED") {
      const finalVideo = await prisma.finalVideo.findFirst({
        where: { renderAttemptId: attemptId, workspaceId }
      });
      const replayLineage = finalVideo
        ? await prisma.creativeLineage.findFirst({
            where: { workspaceId, finalVideoId: finalVideo.id }
          })
        : null;
      const instruction = await prisma.compositionInstruction.findFirst({
        where: { id: attempt.compositionInstructionId, workspaceId }
      });
      const successAudit = await prisma.auditEvent.findFirst({
        where: { workspaceId, eventType: "composition.render_succeeded", targetId: attempt.compositionInstructionId }
      });
      return {
        response: await buildPrismaRenderSuccessResponse(attempt, finalVideo, instruction, successAudit, {
          lineage: replayLineage
        })
      };
    }
    const problemDetail = problem(
      "DEPENDENCY_UNAVAILABLE",
      503,
      "Render completion in progress",
      "A render completion is in progress for this composition plan. Retry shortly."
    );
    problemDetail.attemptStatus = attempt ? String(attempt.status).toLowerCase() : "running";
    problemDetail.compositionId = attempt?.compositionInstructionId ?? null;
    problemDetail.retryable = true;
    return { problem: problemDetail };
  }

  // Build the public render success response from Prisma rows. The artifact rows are
  // re-read by id when this is a replay (no retained artifacts passed in).
  async function buildPrismaRenderSuccessResponse(attempt, finalVideo, instruction, successAudit, retained = {}) {
    const logsArtifact = attempt.logsArtifactId
      ? await prisma.artifact.findUnique({ where: { id: attempt.logsArtifactId } })
      : null;
    const finalVideoArtifact = retained.finalVideoArtifact
      ? retained.finalVideoArtifact
      : finalVideo
        ? await prisma.artifact.findUnique({ where: { id: finalVideo.finalVideoArtifactId } })
        : null;
    const thumbnailArtifact = retained.thumbnailArtifact
      ? retained.thumbnailArtifact
      : finalVideo
        ? await prisma.artifact.findUnique({ where: { id: finalVideo.thumbnailArtifactId } })
        : null;
    const captionsArtifact = retained.captionsArtifact
      ? retained.captionsArtifact
      : finalVideo
        ? await prisma.artifact.findUnique({ where: { id: finalVideo.captionsArtifactId } })
        : null;
    const response = {
      attempt: publicRenderAttempt(attempt),
      finalVideo: finalVideo ? publicFinalVideo(finalVideo) : null,
      composition: instruction ? publicCompositionInstruction(instruction) : null,
      audit: successAudit ? publicAudit(successAudit) : null,
      artifacts: {
        finalVideo: finalVideoArtifact ? publicArtifact(finalVideoArtifact) : null,
        thumbnail: thumbnailArtifact ? publicArtifact(thumbnailArtifact) : null,
        captions: captionsArtifact ? publicArtifact(captionsArtifact) : null,
        logs: logsArtifact ? publicArtifact(logsArtifact) : null
      }
    };
    if (retained.supersededFinalVideo) {
      response.supersededFinalVideo = publicFinalVideo(retained.supersededFinalVideo);
    }
    if (retained.supersededAudit) {
      response.supersededAudit = publicAudit(retained.supersededAudit);
    }
    if (retained.lineage) {
      response.lineage = publicCreativeLineage(retained.lineage);
    }
    return response;
  }

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
    if (input.workspaceId !== job.workspaceId || !isValidBrandExtractionOutput(input)) {
      return { ok: false, problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "The generated media failed validation and was not accepted.") };
    }
    const crawlRun = await tx.brandCrawlRun.findFirst({ where: { id: job.input.brandCrawlRunId, workspaceId: job.workspaceId } });
    if (!crawlRun) {
      return { ok: false, problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.") };
    }
    const extracted = buildBrandExtractionCandidates({
      crawlRunId: crawlRun.id,
      workspaceId: job.workspaceId,
      brandId: crawlRun.brandId,
      scrape: normalizeBrandExtractionScrape(input),
      schemaVersion: input.schemaVersion,
      universal: input.universal,
      vertical: input.vertical,
      assets: input.assets,
      selectedBrandType: brandCrawlRunMetadata(crawlRun).selectedBrandType ?? job.input.selectedBrandType ?? null,
      detectedBrandType: input.vertical?.detectedBrandType ?? null
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
            brandId: crawlRun.brandId,
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
    const retainedBrandAssets = [];
    for (const assetInput of Array.isArray(input.retainedAssets) ? input.retainedAssets : []) {
      if (!isValidRetainedCrawlAsset(assetInput, job.workspaceId)) {
        return { ok: false, problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "A retained crawl asset failed validation.") };
      }
      const artifact = await tx.artifact.create({
        data: {
          workspaceId: job.workspaceId,
          fileName: assetInput.fileName.trim(),
          contentType: assetInput.contentType.trim().toLowerCase(),
          byteSize: assetInput.byteSize,
          sha256: assetInput.sha256.trim().toLowerCase(),
          status: "CLEAN",
          retentionClass: "clean-media",
          producer: `job:${job.id}`,
          schemaVersion: "brand.crawl.asset.v1",
          objectKey: assetInput.objectKey
        }
      });
      const brandAsset = await tx.brandAsset.create({
        data: {
          workspaceId: job.workspaceId,
          brandId: crawlRun.brandId,
          crawlRunId: crawlRun.id,
          artifactId: artifact.id,
          rightsBasis: assetInput.rightsBasis.trim(),
          permittedUse: assetInput.permittedUse.trim(),
          status: "ACTIVE"
        }
      });
      retainedBrandAssets.push(publicBrandAsset(brandAsset, artifact));
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
      data: {
        status: "SUCCEEDED",
        crawlScope: enrichCrawlScopeWithBrandMetadata(crawlRun.crawlScope, {
          selectedBrandType: input.vertical?.selectedBrandType ?? brandCrawlRunMetadata(crawlRun).selectedBrandType ?? job.input.selectedBrandType ?? null,
          detectedBrandType: input.vertical?.detectedBrandType ?? null,
          extractionSchemaVersion: input.schemaVersion,
          providerCreditTelemetry: normalizeProviderCreditTelemetry(input.creditUsage)
        })
      }
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
    return { ok: true, response: { job: publicJob(updatedJob), candidates: retained.map(publicBrandCandidate), brandAssets: retainedBrandAssets } };
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

  // V0-A2 provider credential rotation (Prisma). Under a short withActor
  // transaction the prior row is marked REVOKED and a new ACTIVE row is created
  // with the new secret-manager reference, lastRotatedAt and updatedByUserId; an
  // immutable audit row records the rotation. A missing or cross-workspace
  // credential hides behind the existence-hiding 404. The prior secretRef is
  // never echoed; only the prior id, status and timing are public.
  async function rotateServiceCredential(actor, workspaceId, credentialId, input) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const validation = validateServiceCredentialRotationInput(input);
    if (validation) {
      return { ok: false, problem: validation };
    }
    return withActor(
      actor,
      async (tx) => {
        const existing = await tx.serviceCredential.findFirst({
          where: { id: credentialId, workspaceId }
        });
        if (!existing) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const now = new Date();
        await tx.serviceCredential.update({
          where: { id: credentialId },
          data: { rotationStatus: "REVOKED", updatedAt: now }
        });
        const fresh = await tx.serviceCredential.create({
          data: {
            workspaceId,
            provider: existing.provider,
            purpose: existing.purpose,
            environment: existing.environment,
            secretRef: input.secretRef,
            rotationStatus: "ACTIVE",
            updatedByUserId: actor.userId,
            lastRotatedAt: now
          }
        });
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "service_credential.rotated",
            targetType: "ServiceCredential",
            targetId: credentialId,
            reason: typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : null
          }
        });
        return {
          ok: true,
          response: {
            credential: publicServiceCredential(fresh),
            previous: {
              id: existing.id,
              rotationStatus: "REVOKED",
              lastRotatedAt: existing.lastRotatedAt ? toIso(existing.lastRotatedAt) : null,
              updatedAt: toIso(now)
            }
          }
        };
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

  // V0-A2 Prisma: India-to-B2 transfer benchmark. Mirrors the in-memory drill:
  // deterministic simulator derives the benchmark, one benchmark.b2_recorded
  // audit row is retained under withActor (RLS context). No table is added; the
  // audit event is the retained evidence. A non-simulator storage mode refuses.
  async function runB2Benchmark(actor, workspaceId, input) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const benchmark = benchmarkB2Transfer(env, {
      workspaceId,
      bytesRequestedGb: input.bytesRequestedGb,
      region: input.region
    });
    if (!benchmark.ok) {
      if (benchmark.kind === "unavailable") {
        return {
          ok: false,
          problem: problem("B2_BENCHMARK_UNAVAILABLE", 503, "B2 benchmark unavailable", "The B2 benchmark provider is not available. Try again shortly.", true)
        };
      }
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : null;
    const recordedAt = new Date().toISOString();
    return withActor(
      actor,
      async (tx) => {
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "benchmark.b2_recorded",
            targetType: "Workspace",
            targetId: workspaceId,
            reason
          }
        });
        return {
          ok: true,
          response: {
            benchmark: {
              workspaceId,
              observation: benchmark.observation,
              region: benchmark.region,
              bytesTransferredBytes: benchmark.bytesTransferredBytes,
              simulatedLatencyMs: benchmark.simulatedLatencyMs,
              egressBudgetMs: benchmark.egressBudgetMs,
              estimatedCostMinor: benchmark.estimatedCostMinor,
              determinismSeed: benchmark.determinismSeed,
              reason,
              recordedAt
            }
          }
        };
      },
      workspaceId
    );
  }

  // V0-A2 Prisma: load-shaped queue backlog simulation. Mirrors the in-memory
  // drill; one backlog.simulation_recorded audit row retained under withActor.
  async function runBacklogSimulation(actor, workspaceId, input) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const backlog = simulateQueueBacklog(env, {
      workspaceId,
      targetDepth: input.targetDepth,
      simulatedDurationMs: input.simulatedDurationMs
    });
    if (!backlog.ok) {
      if (backlog.kind === "unavailable") {
        return {
          ok: false,
          problem: problem("QUEUE_BACKLOG_UNAVAILABLE", 503, "Queue backlog unavailable", "The queue backlog provider is not available. Try again shortly.", true)
        };
      }
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : null;
    const recordedAt = new Date().toISOString();
    return withActor(
      actor,
      async (tx) => {
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "backlog.simulation_recorded",
            targetType: "Workspace",
            targetId: workspaceId,
            reason
          }
        });
        return {
          ok: true,
          response: {
            backlog: {
              workspaceId,
              observation: backlog.observation,
              targetDepth: backlog.targetDepth,
              simulatedDurationMs: backlog.simulatedDurationMs,
              peakDepth: backlog.peakDepth,
              growthCurve: backlog.growthCurve,
              drainCurve: backlog.drainCurve,
              sloBreachedAtMs: backlog.sloBreachedAtMs,
              oldestQueueAgeMs: backlog.oldestQueueAgeMs,
              duplicatePaidWork: backlog.duplicatePaidWork,
              silentJobLoss: backlog.silentJobLoss,
              recoveredOperations: backlog.recoveredOperations,
              determinismSeed: backlog.determinismSeed,
              reason,
              recordedAt
            }
          }
        };
      },
      workspaceId
    );
  }

  // V0-A2 Prisma: incident/runbook rehearsal and rollback or forward-recovery
  // record. Mirrors the in-memory drill; one incident.rehearsal_recorded audit
  // row retained against the run id under withActor.
  async function runIncidentRehearsal(actor, workspaceId, input) {
    const access = await getWorkspaceForActor(actor, workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const rehearsal = rehearseIncident(env, {
      workspaceId,
      scenario: input.scenario,
      runId: input.runId
    });
    if (!rehearsal.ok) {
      if (rehearsal.kind === "unavailable") {
        return {
          ok: false,
          problem: problem("INCIDENT_REHEARSAL_UNAVAILABLE", 503, "Incident rehearsal unavailable", "The incident rehearsal provider is not available. Try again shortly.", true)
        };
      }
      return { ok: false, problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
    }
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : rehearsal.scenario;
    const recordedAt = new Date().toISOString();
    return withActor(
      actor,
      async (tx) => {
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "incident.rehearsal_recorded",
            targetType: "IncidentRehearsal",
            targetId: rehearsal.runId,
            reason
          }
        });
        return {
          ok: true,
          response: {
            rehearsal: {
              workspaceId,
              observation: rehearsal.observation,
              runId: rehearsal.runId,
              scenario: rehearsal.scenario,
              steps: rehearsal.steps,
              outcome: rehearsal.outcome,
              recoveryType: rehearsal.recoveryType,
              recoveredEntityIds: rehearsal.recoveredEntityIds,
              determinismSeed: rehearsal.determinismSeed,
              reason,
              recordedAt
            }
          }
        };
      },
      workspaceId
    );
  }

  // V0-A2 Prisma: operational alert states. Reads metrics under withActor (RLS)
  // and derives deterministic alert states against the owner-pinned thresholds.
  async function getWorkspaceOperationalAlerts(actor, workspaceId) {
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
        const metrics = operationalMetrics(workspaceId, jobsForWorkspace, attempts, artifactsForWorkspace, events);
        return {
          ok: true,
          response: { alerts: { workspaceId, active: operationalAlerts(metrics), evaluatedAt: new Date().toISOString() } }
        };
      },
      workspaceId
    );
  }

  // V0-R1 Prisma: open a review item bound to one exact final-video version. One review item per
  // (workspaceId, finalVideoId); the partial unique index turns a second open into a P2002 that
  // is normalized into a replay of the existing item. A superseded final video is rejected
  // (REVIEW_VERSION_STALE). RLS hides a cross-workspace final video behind the same 404.
  async function createReviewItem(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const reviewStage = normalizeReviewStage(input.reviewStage);
    if (!reviewStage) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Review stage must be internal_review or client_review.")
      };
    }
    const finalVideo = await prisma.finalVideo.findFirst({
      where: { id: input.finalVideoId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        compositionInstructionId: true,
        version: true,
        status: true,
        sha256: true,
        finalVideoArtifactId: true,
        thumbnailArtifactId: true,
        captionsArtifactId: true
      }
    });
    if (!finalVideo) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (String(finalVideo.status || "").toLowerCase() !== "current") {
      return {
        ok: false,
        problem: problem(
          "REVIEW_VERSION_STALE",
          409,
          "Review version stale",
          "This final-video version is no longer current. Open a review item for the latest version."
        )
      };
    }
    try {
      return await withActor(
        actor,
        async (tx) => {
          const now = new Date();
          const reviewItem = await tx.reviewItem.create({
            data: {
              workspaceId,
              compositionInstructionId: finalVideo.compositionInstructionId,
              finalVideoId: finalVideo.id,
              finalVideoSha256: finalVideo.sha256,
              finalVideoVersion: Number(finalVideo.version),
              reviewStage,
              status: reviewStage,
              createdByUserId: actor.userId,
              updatedAt: now
            }
          });
          const audit = await tx.auditEvent.create({
            data: {
              workspaceId,
              actorUserId: actor.userId,
              eventType: "review.created",
              targetType: "ReviewItem",
              targetId: reviewItem.id,
              reason: "review_opened"
            }
          });
          return {
            ok: true,
            response: {
              reviewItem: publicReviewItem(reviewItem),
              audit: publicAudit(audit)
            }
          };
        },
        workspaceId
      );
    } catch (error) {
      // A second open for the same exact final-video version hits the partial unique index.
      if (isPrismaConflictError(error)) {
        const existing = await prisma.reviewItem.findFirst({
          where: { workspaceId, finalVideoId: finalVideo.id }
        });
        if (existing) {
          const existingAudit = await prisma.auditEvent.findFirst({
            where: { workspaceId, eventType: "review.created", targetId: existing.id }
          });
          return {
            ok: true,
            response: {
              reviewItem: publicReviewItem(existing),
              audit: existingAudit ? publicAudit(existingAudit) : null
            }
          };
        }
      }
      throw error;
    }
  }

  // V0-R1 Prisma: add a timestamped append-only comment. A superseded bound final video archives
  // the review item (idempotent) and rejects the comment (REVIEW_VERSION_STALE). The notification
  // unique index (workspaceId, payloadHash) collapses repeated comment activity into one logical
  // notification; a concurrent duplicate is a P2002 normalized into duplicateCollapsed. The
  // idempotency-key replay is handled by the store.runIdempotent wrapper in the controller.
  async function addReviewComment(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (body.length === 0 || body.length > 2000) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Comment body must be 1 to 2000 characters.")
      };
    }
    const timestampMs = Number.isInteger(input.timestampMs) ? input.timestampMs : 0;
    if (timestampMs < 0) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Comment timestamp must be zero or positive.")
      };
    }
    const reviewItem = await prisma.reviewItem.findFirst({
      where: { id: input.reviewItemId, workspaceId }
    });
    if (!reviewItem) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const finalVideo = await prisma.finalVideo.findFirst({
      where: { id: reviewItem.finalVideoId, workspaceId },
      select: { status: true }
    });
    if (!finalVideo || String(finalVideo.status || "").toLowerCase() !== "current") {
      // Archive the superseded review item under RLS so the side-effect persists even though
      // the comment is rejected. The update is idempotent: a retry re-runs and re-archives. It
      // runs outside runIdempotent (the 409 problem is not stored), so the idempotency record is
      // never set for the stale path and a retry re-evaluates the (now-archived) version honestly.
      if (String(reviewItem.status || "").toLowerCase() !== "archived") {
        await withActor(
          actor,
          async (tx) => {
            await tx.reviewItem.update({
              where: { id: reviewItem.id },
              data: { status: "ARCHIVED", updatedAt: new Date() }
            });
          },
          workspaceId
        );
      }
      return {
        ok: false,
        problem: problem(
          "REVIEW_VERSION_STALE",
          409,
          "Review version stale",
          "This review item is bound to a final-video version that has been superseded. Open a review item for the latest version."
        )
      };
    }
    const recipientUserId = reviewItem.createdByUserId;
    const payloadHash = createHash("sha256")
      .update(
        stableJson({
          workspaceId,
          reviewItemId: reviewItem.id,
          notificationType: "review_comment_added",
          recipientUserId
        })
      )
      .digest("hex");
    return withActor(
      actor,
      async (tx) => {
        const comment = await tx.reviewComment.create({
          data: {
            workspaceId,
            reviewItemId: reviewItem.id,
            authorUserId: actor.userId,
            body,
            timestampMs,
            threadId: input.threadId ?? null
          }
        });
        // One logical notification per workspace + payloadHash. A pre-find under RLS collapses
        // repeated comment activity on one review item to the same notification without aborting
        // the interactive transaction (a create-then-catch P2002 would leave the Postgres tx in an
        // aborted 25P02 state, so the subsequent findFirst and audit create would fail). The
        // runIdempotent layer above handles same-key replays; the unique index is the database-side
        // guard for the rare concurrent different-key race.
        const existingNotification = await tx.notification.findFirst({
          where: { workspaceId, payloadHash }
        });
        const duplicateCollapsed = existingNotification !== null;
        const notification = existingNotification
          ? existingNotification
          : await tx.notification.create({
              data: {
                workspaceId,
                reviewItemId: reviewItem.id,
                notificationType: "review_comment_added",
                channel: "in_app",
                recipientUserId,
                payloadHash,
                status: "SENT",
                sentAt: new Date()
              }
            });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "review.comment_added",
            targetType: "ReviewItem",
            targetId: reviewItem.id,
            reason: "comment_added"
          }
        });
        const refreshedReviewItem = await tx.reviewItem.findUnique({ where: { id: reviewItem.id } });
        return {
          ok: true,
          response: {
            comment: publicReviewComment(comment),
            reviewItem: publicReviewItem(refreshedReviewItem),
            notification: publicNotification(notification, duplicateCollapsed),
            audit: publicAudit(audit)
          }
        };
      },
      workspaceId
    );
  }

  // V0-R1 Prisma: read one review item with preserved comments and a preview of the bound final
  // video and artifacts. No signed URL, object key or secret is surfaced.
  async function getReviewItem(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const reviewItem = await prisma.reviewItem.findFirst({
      where: { id: input.reviewItemId, workspaceId }
    });
    if (!reviewItem) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const finalVideo = await prisma.finalVideo.findFirst({
      where: { id: reviewItem.finalVideoId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        compositionInstructionId: true,
        renderAttemptId: true,
        version: true,
        status: true,
        durationSeconds: true,
        resolution: true,
        codec: true,
        sha256: true,
        byteSize: true,
        capabilityVersion: true,
        schemaVersion: true,
        finalVideoArtifactId: true,
        thumbnailArtifactId: true,
        captionsArtifactId: true,
        createdAt: true,
        updatedAt: true
      }
    });
    const comments = await prisma.reviewComment.findMany({
      where: { reviewItemId: reviewItem.id, workspaceId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const artifactIds = finalVideo
      ? [finalVideo.finalVideoArtifactId, finalVideo.thumbnailArtifactId, finalVideo.captionsArtifactId].filter(Boolean)
      : [];
    const artifactRows = artifactIds.length
      ? await prisma.artifact.findMany({
          where: { id: { in: artifactIds }, workspaceId }
        })
      : [];
    const artifactById = new Map(artifactRows.map((row) => [row.id, row]));
    const artifactsPreview = finalVideo
      ? {
          finalVideo: publicArtifact(artifactById.get(finalVideo.finalVideoArtifactId) ?? null),
          thumbnail: publicArtifact(artifactById.get(finalVideo.thumbnailArtifactId) ?? null),
          captions: publicArtifact(artifactById.get(finalVideo.captionsArtifactId) ?? null)
        }
      : { finalVideo: null, thumbnail: null, captions: null };
    return {
      ok: true,
      response: {
        reviewItem: publicReviewItem(reviewItem),
        finalVideo: finalVideo ? publicFinalVideo(finalVideo) : null,
        artifacts: artifactsPreview,
        comments: comments.map(publicReviewComment)
      }
    };
  }

  // V0-R1 Prisma: list review items for one workspace with cursor pagination, newest first.
  async function listReviewItems(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const limit = normalizeLimit(input.limit);
    return withActor(
      actor,
      async (tx) => {
        const items = await tx.reviewItem.findMany({
          where: { workspaceId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
        });
        const pageItems = items.slice(0, limit);
        return {
          ok: true,
          response: {
            items: pageItems.map(publicReviewItem),
            page: { limit, nextCursor: items.length > limit ? items[limit].id : null }
          }
        };
      },
      workspaceId
    );
  }

  // V0-R1 Prisma: list the append-only comments on one review item in creation order.
  async function listReviewComments(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const reviewItem = await prisma.reviewItem.findFirst({
      where: { id: input.reviewItemId, workspaceId }
    });
    if (!reviewItem) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const limit = normalizeLimit(input.limit);
    return withActor(
      actor,
      async (tx) => {
        const items = await tx.reviewComment.findMany({
          where: { reviewItemId: reviewItem.id, workspaceId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: limit + 1,
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
        });
        const pageItems = items.slice(0, limit);
        return {
          ok: true,
          response: {
            items: pageItems.map(publicReviewComment),
            page: { limit, nextCursor: items.length > limit ? items[limit].id : null }
          }
        };
      },
      workspaceId
    );
  }

  // V0-R2 Prisma: record one terminal review decision against a review item bound to one exact
  // final-video version. The decider must hold approve_reject_final_video (enforced in the
  // controller). An optimistic version mismatch or a superseded bound final video is rejected
  // (REVIEW_VERSION_STALE); the superseded review item is archived under RLS (idempotent). One
  // terminal decision per review item: a pre-find under RLS collapses a concurrent race to
  // REVIEW_DECISION_ALREADY_RECORDED without aborting the interactive transaction (a
  // create-then-catch P2002 would leave the Postgres tx in an aborted 25P02 state). An approve
  // persists a deterministic approval token bound to the exact version. The idempotency-key replay
  // is handled by the store.runIdempotent wrapper in the controller.
  async function recordReviewDecision(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const decisionValue = normalizeApprovalDecision(input.decision);
    if (!decisionValue) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Decision must be approve, reject or request_changes.")
      };
    }
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (reason.length > 2000) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Decision reason must be 2000 characters or fewer.")
      };
    }
    const reviewItem = await prisma.reviewItem.findFirst({
      where: { id: input.reviewItemId, workspaceId }
    });
    if (!reviewItem) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (
      Number.isInteger(input.expectedFinalVideoVersion) &&
      input.expectedFinalVideoVersion !== Number(reviewItem.finalVideoVersion)
    ) {
      return {
        ok: false,
        problem: problem(
          "REVIEW_VERSION_STALE",
          409,
          "Review version stale",
          "Your review tab is bound to a different final-video version. Open a review item for the latest version."
        )
      };
    }
    const finalVideo = await prisma.finalVideo.findFirst({
      where: { id: reviewItem.finalVideoId, workspaceId },
      select: { status: true }
    });
    if (!finalVideo || String(finalVideo.status || "").toLowerCase() !== "current") {
      // Archive the superseded review item under RLS so the side-effect persists even though the
      // decision is rejected. The update is idempotent. It runs outside runIdempotent (the 409
      // problem is not stored), so the idempotency record is never set for the stale path.
      if (String(reviewItem.status || "").toLowerCase() !== "archived") {
        await withActor(
          actor,
          async (tx) => {
            await tx.reviewItem.update({
              where: { id: reviewItem.id },
              data: { status: "ARCHIVED", updatedAt: new Date() }
            });
          },
          workspaceId
        );
      }
      return {
        ok: false,
        problem: problem(
          "REVIEW_VERSION_STALE",
          409,
          "Review version stale",
          "This review item is bound to a final-video version that has been superseded. Open a review item for the latest version."
        )
      };
    }
    // The deterministic approval token is minted only on approve; reject and request_changes store
    // NULL so the persisted row never carries approval evidence for a non-approve decision. The
    // partial unique index review_decisions_one_approval_token_idx guards only non-null tokens.
    const approvalToken =
      decisionValue === "APPROVE"
        ? createHash("sha256")
            .update(`review-approval:${workspaceId}:${reviewItem.id}:${reviewItem.finalVideoId}:${reviewItem.finalVideoVersion}`)
            .digest("hex")
        : null;
    const statusByDecision = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      REQUEST_CHANGES: "CHANGE_REQUESTED"
    };
    return withActor(
      actor,
      async (tx) => {
        // One terminal decision per review item: pre-find under RLS collapses a concurrent race to
        // REVIEW_DECISION_ALREADY_RECORDED without aborting the interactive transaction (a
        // create-then-catch P2002 would leave the Postgres tx in an aborted 25P02 state, so the
        // subsequent audit create would fail). Returning the problem (rather than throwing) lets
        // the transaction commit cleanly with no writes; the controller's createResponse then
        // surfaces the 409 and the runIdempotent layer stores no idempotency record for the
        // conflict, so a fresh-key second attempt honestly re-evaluates the recorded decision.
        const existingDecision = await tx.reviewDecision.findFirst({
          where: { workspaceId, reviewItemId: reviewItem.id }
        });
        if (existingDecision) {
          return {
            ok: false,
            problem: problem(
              "REVIEW_DECISION_ALREADY_RECORDED",
              409,
              "Review decision already recorded",
              "A decision is already recorded for this review version."
            )
          };
        }
        const decision = await tx.reviewDecision.create({
          data: {
            workspaceId,
            reviewItemId: reviewItem.id,
            finalVideoId: reviewItem.finalVideoId,
            finalVideoSha256: reviewItem.finalVideoSha256,
            finalVideoVersion: Number(reviewItem.finalVideoVersion),
            decision: decisionValue,
            reason,
            decidedByUserId: actor.userId,
            approvalToken
          }
        });
        const updatedReviewItem = await tx.reviewItem.update({
          where: { id: reviewItem.id },
          data: { status: statusByDecision[decisionValue], updatedAt: new Date() }
        });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "review.decision_recorded",
            targetType: "ReviewItem",
            targetId: reviewItem.id,
            reason: decisionValue.toLowerCase()
          }
        });
        const approvalReference =
          decisionValue === "APPROVE" ? publicApprovalReference(decision) : null;
        return {
          ok: true,
          response: {
            decision: publicReviewDecision(decision),
            reviewItem: publicReviewItem(updatedReviewItem),
            approvalReference,
            audit: publicAudit(audit)
          }
        };
      },
      workspaceId
    );
  }

  // V0-U1: create one calendar post bound to one approved exact final-video version. Mirrors the
  // in-memory createCalendarPost. Pure validation runs first (no DB writes); the bound final
  // video, the matching approve decision and any schedule conflict are read with tenant-leading
  // predicates; the manual-export Artifact (if any), the calendar post and the audit are written
  // under RLS in one short transaction. A returned problem (never a thrown HttpException) lets the
  // transaction commit cleanly with no writes; the controller surfaces the problem and runIdempotent
  // stores no idempotency record for the rejected path.
  async function createCalendarPost(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    const platform = typeof input.platform === "string" ? input.platform.trim() : "";
    if (!platform || platform.length > 40) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Platform must be 1 to 40 characters.")
      };
    }
    const account = typeof input.account === "string" ? input.account.trim() : "";
    if (!account || account.length > 240) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Account must be 1 to 240 characters.")
      };
    }
    const caption = typeof input.caption === "string" ? input.caption : "";
    if (caption.length > 2000) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Caption must be 2000 characters or fewer.")
      };
    }
    const timezone =
      typeof input.timezone === "string" && input.timezone.trim().length > 0 ? input.timezone.trim() : "Asia/Kolkata";
    if (timezone.length > 60) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Timezone must be 60 characters or fewer.")
      };
    }
    const manualExport = input.manualExport === true;
    if (manualExport && input.scheduledAt != null && String(input.scheduledAt).trim() !== "") {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_SCHEDULE_INVALID",
          422,
          "Publish schedule invalid",
          "A manual export takes no scheduled time."
        )
      };
    }
    const approvalToken = typeof input.approvalToken === "string" ? input.approvalToken : "";
    if (!/^[a-f0-9]{64}$/.test(approvalToken)) {
      return {
        ok: false,
        problem: problem(
          "REVIEW_APPROVAL_REQUIRED",
          409,
          "Review approval required",
          "This media has no recorded approval for this version."
        )
      };
    }
    let scheduledAtInstant = null;
    if (!manualExport) {
      const parsed = parseScheduledAt(input.scheduledAt);
      if (!parsed) {
        return {
          ok: false,
          problem: problem(
            "PUBLISH_SCHEDULE_INVALID",
            422,
            "Publish schedule invalid",
            "Scheduled time must be an ISO-8601 instant with a UTC offset."
          )
        };
      }
      if (parsed.getTime() <= Date.now()) {
        return {
          ok: false,
          problem: problem(
            "PUBLISH_SCHEDULE_INVALID",
            422,
            "Publish schedule invalid",
            "Scheduled time must be in the future."
          )
        };
      }
      scheduledAtInstant = parsed;
    }
    const finalVideo = await prisma.finalVideo.findFirst({
      where: { id: input.finalVideoId, workspaceId },
      select: { id: true, sha256: true, version: true, status: true }
    });
    if (!finalVideo) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (String(finalVideo.status || "").toLowerCase() !== "current") {
      return {
        ok: false,
        problem: problem(
          "PUBLISH_MEDIA_STALE",
          409,
          "Publish media stale",
          "This final-video version has been superseded. Schedule the latest version."
        )
      };
    }
    const approval = await prisma.reviewDecision.findFirst({
      where: { workspaceId, finalVideoId: finalVideo.id, decision: "APPROVE", approvalToken }
    });
    if (!approval) {
      return {
        ok: false,
        problem: problem(
          "REVIEW_APPROVAL_REQUIRED",
          409,
          "Review approval required",
          "This media has no recorded approval for this version."
        )
      };
    }
    const calendarPostId = randomUUID();
    const status = manualExport ? "APPROVED" : "SCHEDULED";
    let packageHash = null;
    if (manualExport) {
      packageHash = createHash("sha256")
        .update(
          `manual-export:${workspaceId}:${finalVideo.id}:${finalVideo.version}:${approvalToken}:${platform}:${account}:${caption}`
        )
        .digest("hex");
    }
    return withActor(
      actor,
      async (tx) => {
        if (!manualExport && scheduledAtInstant) {
          // V0-U1 fix: serialize concurrent creates for the same workspace/platform/account
          // so the 60-second schedule-conflict window check is authoritative under
          // concurrency. The advisory lock is transaction-scoped (released on commit or
          // rollback) and never persisted. hashtext collisions across unrelated keys only
          // cause harmless false serialisation; a real conflict always shares the key.
          const lockKey = `${workspaceId}:${platform}:${account}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
          const target = scheduledAtInstant.getTime();
          const candidates = await tx.calendarPost.findMany({
            where: {
              workspaceId,
              platform,
              account,
              manualExport: false,
              scheduledAt: { not: null },
              status: { notIn: ["CANCELLED", "FAILED"] }
            },
            select: { scheduledAt: true }
          });
          const conflict = candidates.some((candidate) => {
            if (!candidate.scheduledAt) {
              return false;
            }
            return Math.abs(new Date(candidate.scheduledAt).getTime() - target) < SCHEDULE_CONFLICT_WINDOW_MS;
          });
          if (conflict) {
            return {
              ok: false,
              problem: problem(
                "PUBLISH_SCHEDULE_INVALID",
                422,
                "Publish schedule invalid",
                "A post is already scheduled for this account near that time."
              )
            };
          }
        }
        let exportArtifact = null;
        let exportArtifactId = null;
        if (manualExport) {
          exportArtifact = await tx.artifact.create({
            data: {
              workspaceId,
              fileName: `manual-export-${calendarPostId}.json`,
              contentType: "application/json",
              byteSize: Buffer.byteLength(packageHash, "utf8"),
              sha256: packageHash,
              status: "CLEAN",
              retentionClass: "manual-export",
              producer: `calendar:${calendarPostId}`,
              schemaVersion: "calendar.manual_export.v1",
              objectKey: `manual-exports/${workspaceId}/${calendarPostId}.json`
            }
          });
          exportArtifactId = exportArtifact.id;
        }
        const calendarPost = await tx.calendarPost.create({
          data: {
            id: calendarPostId,
            workspaceId,
            platform,
            account,
            caption,
            finalVideoId: finalVideo.id,
            finalVideoSha256: finalVideo.sha256,
            finalVideoVersion: Number(finalVideo.version),
            approvalToken,
            scheduledAt: scheduledAtInstant,
            timezone,
            manualExport,
            manualLiveUrl: null,
            manualUrlProvidedAt: null,
            exportArtifactId,
            status,
            createdByUserId: actor.userId,
            version: 1
          }
        });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "calendar.post_created",
            targetType: "CalendarPost",
            targetId: calendarPost.id,
            reason: manualExport ? "manual_export" : "scheduled"
          }
        });
        return {
          ok: true,
          response: {
            calendarPost: publicCalendarPost(calendarPost),
            exportArtifact: exportArtifact ? publicArtifact(exportArtifact) : null,
            audit: publicAudit(audit)
          }
        };
      },
      workspaceId
    );
  }

  // V0-U1 fix (prisma): edit an existing CalendarPost. Reuses create-equivalent validation and
  // enforces optimistic concurrency via `version` plus a post-scoped advisory lock so the
  // version check is authoritative under concurrency, and a (workspace,platform,account)-scoped
  // advisory lock so the 60-second schedule-conflict window check is authoritative under
  // concurrency. All authoritative checks run inside the RLS transaction.
  async function updateCalendarPost(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    const workspaceId = input.workspaceId;
    // Fast-fail existence check outside the tx; the authoritative load happens inside under the
    // post lock so the version check cannot race a concurrent edit.
    const existing = await prisma.calendarPost.findFirst({
      where: { id: input.calendarPostId, workspaceId },
      select: { id: true }
    });
    if (!existing) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    if (!Number.isInteger(input.expectedVersion)) {
      return {
        ok: false,
        problem: problem("VALIDATION_FAILED", 422, "Validation failed", "expectedVersion must be an integer.")
      };
    }
    return withActor(
      actor,
      async (tx) => {
        // Serialize concurrent edits to this post; transaction-scoped, never persisted.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.calendarPostId}))`;
        const post = await tx.calendarPost.findFirst({
          where: { id: input.calendarPostId, workspaceId }
        });
        if (!post) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const statusNorm = String(post.status || "").toLowerCase();
        const editableStatus = statusNorm === "scheduled" || statusNorm === "approved";
        const publishOp = await tx.publishOperation.findFirst({
          where: { calendarPostId: post.id, workspaceId },
          select: { id: true }
        });
        if (publishOp || post.manualLiveUrl || !editableStatus) {
          return {
            ok: false,
            problem: problem(
              "PUBLISH_POST_LOCKED",
              409,
              "Publish post locked",
              "This calendar post can no longer be edited."
            )
          };
        }
        if (input.expectedVersion !== post.version) {
          return {
            ok: false,
            problem: problem(
              "RESOURCE_VERSION_STALE",
              409,
              "Resource version stale",
              "This calendar post changed after you opened it. Review the latest version."
            )
          };
        }
        const finalVideo = await tx.finalVideo.findFirst({
          where: { id: post.finalVideoId, workspaceId },
          select: { id: true, sha256: true, version: true, status: true }
        });
        if (!finalVideo || String(finalVideo.status || "").toLowerCase() !== "current") {
          return {
            ok: false,
            problem: problem(
              "PUBLISH_MEDIA_STALE",
              409,
              "Publish media stale",
              "This final-video version has been superseded. Schedule the latest version."
            )
          };
        }
        // Merge the editable patch and validate the resulting full state with the same rules as create.
        const caption = typeof input.caption === "string" ? input.caption : post.caption;
        if (caption.length > 2000) {
          return {
            ok: false,
            problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Caption must be 2000 characters or fewer.")
          };
        }
        const platform =
          typeof input.platform === "string" && input.platform !== undefined
            ? input.platform.trim()
            : input.platform === undefined
              ? post.platform
              : post.platform;
        if (!platform || platform.length > 40) {
          return {
            ok: false,
            problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Platform must be 1 to 40 characters.")
          };
        }
        const account =
          typeof input.account === "string" ? input.account.trim() : input.account === undefined ? post.account : post.account;
        if (!account || account.length > 240) {
          return {
            ok: false,
            problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Account must be 1 to 240 characters.")
          };
        }
        let timezone = post.timezone;
        if (input.timezone !== undefined) {
          timezone =
            typeof input.timezone === "string" && input.timezone.trim().length > 0 ? input.timezone.trim() : "Asia/Kolkata";
        }
        if (timezone.length > 60) {
          return {
            ok: false,
            problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Timezone must be 60 characters or fewer.")
          };
        }
        const manualExport = input.manualExport !== undefined ? input.manualExport === true : post.manualExport;
        if (manualExport && input.scheduledAt != null && String(input.scheduledAt).trim() !== "") {
          return {
            ok: false,
            problem: problem(
              "PUBLISH_SCHEDULE_INVALID",
              422,
              "Publish schedule invalid",
              "A manual export takes no scheduled time."
            )
          };
        }
        let scheduledAtInstant = null;
        if (!manualExport) {
          if (input.scheduledAt !== undefined) {
            const parsed = parseScheduledAt(input.scheduledAt);
            if (!parsed) {
              return {
                ok: false,
                problem: problem(
                  "PUBLISH_SCHEDULE_INVALID",
                  422,
                  "Publish schedule invalid",
                  "Scheduled time must be an ISO-8601 instant with a UTC offset."
                )
              };
            }
            if (parsed.getTime() <= Date.now()) {
              return {
                ok: false,
                problem: problem(
                  "PUBLISH_SCHEDULE_INVALID",
                  422,
                  "Publish schedule invalid",
                  "Scheduled time must be in the future."
                )
              };
            }
            scheduledAtInstant = parsed;
          } else {
            // No schedule change: reuse the stored instant (a Prisma Date, already a valid future
            // instant) and re-check it is still in the future. A post switched to scheduled without
            // a supplied time has no stored instant and is rejected with the same schedule-invalid
            // code; the stored Date is never fed back through the ISO-string parser.
            if (!post.scheduledAt) {
              return {
                ok: false,
                problem: problem(
                  "PUBLISH_SCHEDULE_INVALID",
                  422,
                  "Publish schedule invalid",
                  "Scheduled time must be an ISO-8601 instant with a UTC offset."
                )
              };
            }
            scheduledAtInstant = new Date(post.scheduledAt);
            if (scheduledAtInstant.getTime() <= Date.now()) {
              return {
                ok: false,
                problem: problem(
                  "PUBLISH_SCHEDULE_INVALID",
                  422,
                  "Publish schedule invalid",
                  "Scheduled time must be in the future."
                )
              };
            }
          }
        }
        if (!manualExport && scheduledAtInstant) {
          // Serialize the conflict window for the target account so the 60-second check is
          // authoritative under concurrency; transaction-scoped, never persisted.
          const conflictKey = `${workspaceId}:${platform}:${account}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${conflictKey}))`;
          const target = scheduledAtInstant.getTime();
          const candidates = await tx.calendarPost.findMany({
            where: {
              workspaceId,
              platform,
              account,
              manualExport: false,
              scheduledAt: { not: null },
              status: { notIn: ["CANCELLED", "FAILED"] }
            },
            select: { id: true, scheduledAt: true }
          });
          const conflict = candidates.some((candidate) => {
            if (candidate.id === post.id) {
              return false;
            }
            if (!candidate.scheduledAt) {
              return false;
            }
            return Math.abs(new Date(candidate.scheduledAt).getTime() - target) < SCHEDULE_CONFLICT_WINDOW_MS;
          });
          if (conflict) {
            return {
              ok: false,
              problem: problem(
                "PUBLISH_SCHEDULE_INVALID",
                422,
                "Publish schedule invalid",
                "A post is already scheduled for this account near that time."
              )
            };
          }
        }
        const nextVersion = Number(post.version) + 1;
        const nextStatus = manualExport ? "APPROVED" : "SCHEDULED";
        const nextScheduledAt = scheduledAtInstant;
        let exportArtifact = null;
        let exportArtifactId = null;
        if (manualExport) {
          const packageHash = createHash("sha256")
            .update(
              `manual-export:${workspaceId}:${post.finalVideoId}:${post.finalVideoVersion}:${post.approvalToken}:${platform}:${account}:${caption}`
            )
            .digest("hex");
          exportArtifact = await tx.artifact.create({
            data: {
              workspaceId,
              fileName: `manual-export-${post.id}.v${nextVersion}.json`,
              contentType: "application/json",
              byteSize: Buffer.byteLength(packageHash, "utf8"),
              sha256: packageHash,
              status: "CLEAN",
              retentionClass: "manual-export",
              producer: `calendar:${post.id}`,
              schemaVersion: "calendar.manual_export.v1",
              objectKey: `manual-exports/${workspaceId}/${post.id}.v${nextVersion}.json`
            }
          });
          exportArtifactId = exportArtifact.id;
        } else {
          // Switching to (or staying) scheduled clears the manual-export link; any prior export
          // artifact row is retained as evidence.
          exportArtifactId = null;
        }
        const changed = [];
        if (caption !== post.caption) changed.push("caption");
        if (account !== post.account) changed.push("account");
        if (platform !== post.platform) changed.push("platform");
        if (manualExport !== post.manualExport) changed.push("manual_export");
        if (timezone !== post.timezone) changed.push("timezone");
        const priorScheduledAt = post.scheduledAt ? new Date(post.scheduledAt).toISOString() : null;
        if ((nextScheduledAt ? nextScheduledAt.toISOString() : null) !== priorScheduledAt) {
          changed.push("scheduled_at");
        }
        const updatedPost = await tx.calendarPost.update({
          where: { id: post.id },
          data: {
            platform,
            account,
            caption,
            manualExport,
            scheduledAt: nextScheduledAt,
            timezone,
            status: nextStatus,
            version: nextVersion,
            exportArtifactId
          }
        });
        const audit = await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: actor.userId,
            eventType: "calendar.post_updated",
            targetType: "CalendarPost",
            targetId: post.id,
            reason: changed.length > 0 ? changed.join(",") : "no_change"
          }
        });
        return {
          ok: true,
          response: {
            calendarPost: publicCalendarPost(updatedPost),
            exportArtifact: exportArtifact ? publicArtifact(exportArtifact) : null,
            audit: publicAudit(audit)
          }
        };
      },
      workspaceId
    );
  }

  // V0-U2 prisma: map a reconciled/callback publish outcome to prisma update payloads. The
  // post-level PublishStatus has no processing/unknown; while Meta processes the post stays
  // accepted, and on completion the post advances to PUBLISHED_UNVERIFIED and the public post
  // URL is bound. Reconciliation records reconciledAt.
  function applyPrismaPublishOutcome(operation, post, outcome, reconciled, publicUrlFn) {
    const now = new Date();
    const operationUpdate = { updatedAt: now };
    const postUpdate = { updatedAt: now };
    if (outcome.externalId && !operation.externalId) {
      operationUpdate.externalId = outcome.externalId;
    }
    if (outcome.status === "accepted") {
      operationUpdate.status = "ACCEPTED";
      if (!operation.acceptedAt) operationUpdate.acceptedAt = now;
      postUpdate.status = "ACCEPTED";
    } else if (outcome.status === "processing") {
      operationUpdate.status = "PROCESSING";
      // An upload that is processing was accepted; record acceptedAt if it is not already set.
      if (!operation.acceptedAt) operationUpdate.acceptedAt = now;
      postUpdate.status = "ACCEPTED";
    } else if (outcome.status === "completed") {
      operationUpdate.status = "COMPLETED";
      operationUpdate.completedAt = now;
      if (!operation.publicUrl) {
        operationUpdate.publicUrl = outcome.publicUrl || publicUrlFn(operation.externalId);
      }
      postUpdate.status = "PUBLISHED_UNVERIFIED";
    } else if (outcome.status === "failed") {
      operationUpdate.status = "FAILED";
      if (!operation.lastErrorCode) operationUpdate.lastErrorCode = "PROVIDER_OUTPUT_INVALID";
      postUpdate.status = "FAILED";
    }
    if (reconciled) {
      operationUpdate.reconciledAt = now;
    }
    return { operation: operationUpdate, post: postUpdate };
  }

  // V0-U2 prisma: publish an approved scheduled calendar post to the configured provider
  // exactly once. Two short transactions: (1) exactly-once validation + durable pre-network
  // row, (2) apply the provider outcome. A concurrent create that loses the
  // one-operation-per-post unique race throws P2002 and is reconciled to a replay or stable
  // conflict. A timeout after possible acceptance is unknown; the caller reconciles before
  // retry. The request hash is a server-side binding secret and is never surfaced. Provider
  // payloads stay adapter-private. V0-U3: the provider is derived server-side from the
  // calendar post's platform via the PUBLISH_PLATFORMS registry; an unknown platform is a
  // 409 contract error and quota exhaustion is a pre-flight refusal before any network I/O,
  // so no duplicate operation is ever written.
  async function submitPublishOperation(actor, input) {
    const access = await getWorkspaceForActor(actor, input.workspaceId);
    if (!access) {
      return {
        ok: false,
        problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
      };
    }
    let prepared;
    try {
      prepared = await withActor(
        actor,
        async (tx) => {
          const existingByKey = await tx.publishOperation.findUnique({
            where: {
              workspaceId_idempotencyKey: {
                workspaceId: input.workspaceId,
                idempotencyKey: input.idempotencyKey
              }
            }
          });
          if (existingByKey) {
            const existingPost = await tx.calendarPost.findFirst({
              where: { id: existingByKey.calendarPostId, workspaceId: input.workspaceId }
            });
            // Same key, same post + account -> replay; same key, different post or account
            // -> conflict. Cross-workspace existence stays hidden behind the 404 path below
            // for a key the caller never used.
            if (
              existingByKey.calendarPostId !== input.calendarPostId ||
              !existingPost ||
              existingPost.account !== input.account
            ) {
              return {
                conflict: true,
                problem: problem(
                  "IDEMPOTENCY_INPUT_CONFLICT",
                  409,
                  "Idempotency input conflict",
                  "This calendar post was already published with a different request identity."
                )
              };
            }
            return { replay: true, operation: existingByKey, post: existingPost };
          }
          // Calendar post ownership gates the per-post operation check so a cross-workspace
          // caller cannot learn whether a post they do not own already has a publish
          // operation. The existence-hiding 404 is returned before any per-post conflict is
          // observable.
          const post = await tx.calendarPost.findFirst({
            where: { id: input.calendarPostId, workspaceId: input.workspaceId }
          });
          if (!post) {
            return {
              problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
            };
          }
          const existingForPost = await tx.publishOperation.findUnique({
            where: { calendarPostId: post.id }
          });
          if (existingForPost) {
            return {
              conflict: true,
              problem: problem(
                "IDEMPOTENCY_INPUT_CONFLICT",
                409,
                "Idempotency input conflict",
                "This calendar post was already published with a different request identity."
              )
            };
          }
          if (post.manualExport) {
            return {
              problem: problem(
                "PUBLISH_NOT_SUBMITTABLE",
                409,
                "Publish not submittable",
                "This manual-export calendar post cannot be submitted to a provider."
              )
            };
          }
          if (input.account !== post.account) {
            return {
              problem: problem(
                "PUBLISH_ACCOUNT_MISMATCH",
                409,
                "Publish account mismatch",
                "The account in the request does not match the calendar post's bound account."
              )
            };
          }
          const adapter = resolvePublishAdapter(post.platform);
          if (!adapter) {
            return {
              problem: problem(
                "PUBLISH_PLATFORM_UNSUPPORTED",
                409,
                "Publish platform unsupported",
                "This platform is not supported for direct publication in V0. Export manually."
              )
            };
          }
          // Pre-flight quota gate (YouTube: 3 uploads/day per client). Quota exhaustion refuses
          // submission BEFORE any network I/O and writes no operation row, so quota failure is
          // explicit and never creates a duplicate or corrupts the Meta/manual paths. Returning
          // {ok:false,problem} from inside withActor commits the empty tx cleanly with no writes.
          if (adapter.checkQuota) {
            const quota = adapter.checkQuota(env, { workspaceId: input.workspaceId, account: input.account });
            if (!quota.ok) {
              return {
                problem: {
                  ...problem(
                    quota.errorCode,
                    429,
                    "Publish quota exhausted",
                    "The platform quota is exhausted. Choose the shown retry time or export manually.",
                    true
                  ),
                  retryAfterMs: quota.retryAfterMs
                }
              };
            }
          }
          const requestHash = computePublishRequestHash(post, input.account, adapter.provider);
          const operation = await tx.publishOperation.create({
            data: {
              workspaceId: input.workspaceId,
              calendarPostId: post.id,
              provider: adapter.provider,
              operationType: adapter.operationType,
              status: "SUBMITTING",
              idempotencyKey: input.idempotencyKey,
              requestHash,
              submittedAt: new Date()
            }
          });
          await tx.calendarPost.update({
            where: { id: post.id },
            data: { status: "SUBMITTING" }
          });
          return { operation, post, requestHash, adapter };
        },
        input.workspaceId
      );
    } catch (error) {
      if (isPrismaConflictError(error)) {
        prepared = await reconcilePrismaPublishRace(actor, input);
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
          calendarPost: publicCalendarPost(prepared.post),
          operation: publicPublishOperation(prepared.operation),
          replay: true
        }
      };
    }
    // Provider network I/O outside the transaction. A timeout after possible acceptance is
    // unknown; the caller reconciles before any retry.
    const adapter = prepared.adapter;
    const providerResult = adapter.submit(env, {
      operationId: prepared.operation.id,
      requestHash: prepared.requestHash,
      mode: input.mode
    });
    // Second short transaction: apply the provider outcome.
    return withActor(
      actor,
      async (tx) => {
        const operation = await tx.publishOperation.findUnique({
          where: { id: prepared.operation.id }
        });
        const post = await tx.calendarPost.findUnique({ where: { id: prepared.operation.calendarPostId } });
        if (!operation || !post) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        if (!providerResult.ok) {
          if (providerResult.kind === "timeout") {
            await tx.publishOperation.update({
              where: { id: operation.id },
              data: { status: "UNKNOWN", updatedAt: new Date() }
            });
            await tx.calendarPost.update({
              where: { id: post.id },
              data: { status: "SUBMITTING" }
            });
            return {
              ok: true,
              response: {
                calendarPost: publicCalendarPost({ ...post, status: "SUBMITTING" }),
                operation: publicPublishOperation({ ...operation, status: "UNKNOWN" }),
                unknown: true
              }
            };
          }
          const errorCode = providerResult.errorCode || "PROVIDER_OUTPUT_INVALID";
          await tx.publishOperation.update({
            where: { id: operation.id },
            data: { status: "FAILED", lastErrorCode: errorCode, updatedAt: new Date() }
          });
          await tx.calendarPost.update({
            where: { id: post.id },
            data: { status: "FAILED" }
          });
          return {
            ok: false,
            problem: problem(
              errorCode,
              422,
              "Provider output invalid",
              "The publish failed validation and was not accepted."
            )
          };
        }
        const now = new Date();
        // success / duplicate / processing: the provider accepted and assigned an external post id.
        // A processing upload moves the operation to PROCESSING while the post stays ACCEPTED (the
        // post-level enum has no processing); a callback or reconciliation later drives it to
        // completed and binds the public URL.
        const isProcessing = providerResult.processing === true;
        const operationStatus = isProcessing ? "PROCESSING" : "ACCEPTED";
        await tx.publishOperation.update({
          where: { id: operation.id },
          data: { status: operationStatus, externalId: providerResult.externalId, acceptedAt: now, updatedAt: now }
        });
        await tx.calendarPost.update({
          where: { id: post.id },
          data: { status: "ACCEPTED" }
        });
        await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "publish.state_changed",
            targetType: "CalendarPost",
            targetId: post.id,
            reason: "accepted"
          }
        });
        const response = {
          calendarPost: publicCalendarPost({ ...post, status: "ACCEPTED" }),
          operation: publicPublishOperation({ ...operation, status: operationStatus, externalId: providerResult.externalId, acceptedAt: now })
        };
        // Simulator-only: surface the signed callback envelope so the deterministic test can post
        // the webhook back. The signing secret never leaves the simulator. A processing upload
        // surfaces publish.processing (no public URL yet); a completed upload surfaces
        // publish.completed with the public post URL.
        if (env[adapter.liveApiModeEnv] !== "api") {
          const callbackEventType = isProcessing ? "publish.processing" : "publish.completed";
          const callbackPublicUrl = isProcessing ? "" : adapter.publicUrl(providerResult.externalId);
          const envelope = {
            workspaceId: input.workspaceId,
            calendarPostId: post.id,
            operationId: operation.id,
            externalId: providerResult.externalId,
            publicUrl: callbackPublicUrl,
            eventType: callbackEventType,
            eventId: `evt_${operation.id}`,
            timestamp: Date.now()
          };
          response.callback = {
            envelope,
            signature: adapter.sign(envelope, adapter.secret(env))
          };
        }
        return { ok: true, response };
      },
      input.workspaceId
    );
  }

  // Reconcile a concurrent publish race: a P2002 on the one-operation-per-post (or
  // one-operation-per-key) unique index means another caller won the create. Re-read the
  // committed operation and return a replay when the caller's key matches, or a stable
  // IDEMPOTENCY_INPUT_CONFLICT when a different key already published this post. Cross-
  // workspace existence stays hidden behind the 404. Never surfaces a raw 500.
  async function reconcilePrismaPublishRace(actor, input) {
    return withActor(
      actor,
      async (tx) => {
        const existingByKey = await tx.publishOperation.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: input.workspaceId,
              idempotencyKey: input.idempotencyKey
            }
          }
        });
        if (existingByKey) {
          const existingPost = await tx.calendarPost.findFirst({
            where: { id: existingByKey.calendarPostId, workspaceId: input.workspaceId }
          });
          if (
            existingByKey.calendarPostId !== input.calendarPostId ||
            !existingPost ||
            existingPost.account !== input.account
          ) {
            return {
              conflict: true,
              problem: problem(
                "IDEMPOTENCY_INPUT_CONFLICT",
                409,
                "Idempotency input conflict",
                "This calendar post was already published with a different request identity."
              )
            };
          }
          return { replay: true, operation: existingByKey, post: existingPost };
        }
        const post = await tx.calendarPost.findFirst({
          where: { id: input.calendarPostId, workspaceId: input.workspaceId }
        });
        if (!post) {
          return {
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const existingForPost = await tx.publishOperation.findUnique({
          where: { calendarPostId: post.id }
        });
        if (existingForPost) {
          return {
            conflict: true,
            problem: problem(
              "IDEMPOTENCY_INPUT_CONFLICT",
              409,
              "Idempotency input conflict",
              "This calendar post was already published with a different request identity."
            )
          };
        }
        if (post.manualExport) {
          return {
            problem: problem(
              "PUBLISH_NOT_SUBMITTABLE",
              409,
              "Publish not submittable",
              "This manual-export calendar post cannot be submitted to a provider."
            )
          };
        }
        if (input.account !== post.account) {
          return {
            problem: problem(
              "PUBLISH_ACCOUNT_MISMATCH",
              409,
              "Publish account mismatch",
              "The account in the request does not match the calendar post's bound account."
            )
          };
        }
        return {
          conflict: true,
          problem: problem(
            "IDEMPOTENCY_INPUT_CONFLICT",
            409,
            "Idempotency input conflict",
            "This calendar post was already published with a different request identity."
          )
        };
      },
      input.workspaceId
    );
  }

  // V0-U2 prisma: reconcile an uncertain publish operation. Never resubmits; resolves
  // unknown/submitting/accepted/processing to a terminal state and records reconciledAt. A
  // replay is a no-op once terminal. On completion the post advances to PUBLISHED_UNVERIFIED
  // and the public post URL is bound.
  async function reconcilePublishOperation(actor, input) {
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
        const post = await tx.calendarPost.findFirst({
          where: { id: input.calendarPostId, workspaceId: input.workspaceId }
        });
        if (!post) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const operation = await tx.publishOperation.findUnique({
          where: { calendarPostId: post.id }
        });
        if (!operation) {
          return {
            ok: false,
            problem: problem(
              "PUBLISH_NOT_SUBMITTABLE",
              409,
              "Publish not submittable",
              "This calendar post has no publish operation to reconcile."
            )
          };
        }
        if (["COMPLETED", "FAILED", "REJECTED", "CANCELLED"].includes(operation.status)) {
          return {
            ok: true,
            response: { calendarPost: publicCalendarPost(post), operation: publicPublishOperation(operation), replay: true }
          };
        }
        const adapter = resolvePublishAdapter(post.platform);
        if (!adapter) {
          return {
            ok: false,
            problem: problem(
              "PUBLISH_PLATFORM_UNSUPPORTED",
              409,
              "Publish platform unsupported",
              "This platform is not supported for direct publication in V0. Export manually."
            )
          };
        }
        const outcome = adapter.reconcile(env, {
          operationId: operation.id,
          requestHash: operation.requestHash,
          externalId: operation.externalId,
          reconcileOutcome: input.reconcileOutcome
        });
        if (outcome.status === "pending") {
          return {
            ok: true,
            response: { calendarPost: publicCalendarPost(post), operation: publicPublishOperation(operation), pending: true }
          };
        }
        const next = applyPrismaPublishOutcome(operation, post, outcome, true, adapter.publicUrl);
        const updatedOperation = await tx.publishOperation.update({ where: { id: operation.id }, data: next.operation });
        const updatedPost = await tx.calendarPost.update({ where: { id: post.id }, data: next.post });
        return {
          ok: true,
          response: {
            calendarPost: publicCalendarPost(updatedPost),
            operation: publicPublishOperation(updatedOperation)
          }
        };
      },
      input.workspaceId
    );
  }

  // V0-U2 prisma: process a signed publishing callback. Signature verified in constant
  // time, timestamp windowed, deduplicated by (workspace, source, eventId) via inbox_events.
  // Malformed callbacks are rejected. The calendar post advances in lockstep with the
  // operation; the public post URL is bound only on completion. Provider payloads stay
  // private.
  async function processPublishingCallback(provider, envelope, signature) {
    const adapter = resolvePublishCallbackAdapter(provider);
    if (!adapter) {
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
    if (!adapter.verify(envelope, signature, adapter.secret(env))) {
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
      typeof envelope.calendarPostId !== "string" ||
      typeof envelope.operationId !== "string" ||
      typeof envelope.externalId !== "string" ||
      typeof envelope.publicUrl !== "string" ||
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
            source: adapter.source,
            idempotencyKey: envelope.eventId
          }
        }
      });
      if (existing) {
        return { ok: true, response: { ...existing.payload.response, duplicate: true } };
      }
      if (Math.abs(Date.now() - envelope.timestamp) > adapter.callbackWindowMs) {
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
      const operation = await tx.publishOperation.findFirst({
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
      const post = await tx.calendarPost.findFirst({
        where: { id: operation.calendarPostId, workspaceId: envelope.workspaceId }
      });
      if (!post) {
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
        "publish.accepted": "accepted",
        "publish.processing": "processing",
        "publish.completed": "completed",
        "publish.failed": "failed"
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
      const response = { calendarPost: publicCalendarPost(post), operation: publicPublishOperation(operation) };
      if (["COMPLETED", "FAILED", "REJECTED", "CANCELLED"].includes(operation.status)) {
        await tx.inboxEvent.create({
          data: {
            workspaceId: envelope.workspaceId,
            source: adapter.source,
            eventType: envelope.eventType,
            idempotencyKey: envelope.eventId,
            payloadHash: createHash("sha256").update(stableJson(envelope)).digest("hex"),
            payload: { response },
            consumedAt: now
          }
        });
        return { ok: true, response: { ...response, duplicate: false } };
      }
      const next = applyPrismaPublishOutcome(operation, post, { status: outcomeMap[envelope.eventType], externalId: envelope.externalId, publicUrl: envelope.publicUrl }, false, adapter.publicUrl);
      const updatedOperation = await tx.publishOperation.update({ where: { id: operation.id }, data: next.operation });
      const updatedPost = await tx.calendarPost.update({ where: { id: post.id }, data: next.post });
      const finalResponse = { calendarPost: publicCalendarPost(updatedPost), operation: publicPublishOperation(updatedOperation) };
      await tx.inboxEvent.create({
        data: {
          workspaceId: envelope.workspaceId,
          source: adapter.source,
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

  // V0-U4 prisma: independently verify the audience-facing live post against the approved calendar
  // post. Mirrors the in-memory verifyCalendarPost eligibility, evidence, notification dedupe and
  // initial PerformanceSnapshot logic, but persists each row under RLS inside one short
  // transaction. One PostVerification per calendar post is enforced by the unique(calendarPostId)
  // index; an upsert against that key is the atomic create-or-update so a concurrent retry never
  // throws P2002 inside the interactive transaction (a create-then-catch would leave Postgres in an
  // aborted 25P02 state). The completion notification is deduplicated by a pre-find on
  // (workspaceId, payloadHash) under RLS, matching the review-comment notification pattern. The
  // deterministic verifier simulator runs synchronously (no provider network I/O outside the tx).
  // No secret, signed URL, object key, recipient user id, payload hash or raw provider payload is
  // surfaced.
  async function verifyCalendarPost(actor, input) {
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
        let post = await tx.calendarPost.findFirst({
          where: { id: input.calendarPostId, workspaceId: input.workspaceId }
        });
        if (!post) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const now = new Date();

        // One verification per post: an already-verified post replays the existing verification and
        // never sends a second notification. The verifier is not called again.
        const existingVerification = await tx.postVerification.findUnique({
          where: { calendarPostId: post.id }
        });
        if (post.status === "PUBLISHED_VERIFIED" && existingVerification && existingVerification.status === "VERIFIED") {
          const notification = await tx.notification.findFirst({
            where: {
              workspaceId: input.workspaceId,
              calendarPostId: post.id,
              notificationType: "publish_completed"
            }
          });
          const evidenceArtifact = existingVerification.evidenceArtifactId
            ? await tx.artifact.findUnique({ where: { id: existingVerification.evidenceArtifactId } })
            : null;
          const snapshot = await tx.performanceSnapshot.findFirst({
            where: { workspaceId: input.workspaceId, calendarPostId: post.id }
          });
          return {
            ok: true,
            response: {
              calendarPost: publicCalendarPost(post),
              verification: publicPostVerification(existingVerification),
              evidenceArtifact: publicArtifact(evidenceArtifact),
              notification: publicNotification(notification, true),
              performanceSnapshot: snapshot ? publicPerformanceSnapshot(snapshot) : null,
              replay: true
            }
          };
        }

        // Resolve the live URL. A provider post must be live (PUBLISHED_UNVERIFIED); a manual-export
        // post is verifiable once a live URL is supplied (in the request or already stored).
        let liveUrl = null;
        let manualUrlUpdate = null;
        if (post.manualExport) {
          const suppliedUrl = typeof input.manualLiveUrl === "string" ? input.manualLiveUrl.trim() : "";
          if (suppliedUrl.length > 0 && /^https?:\/\//i.test(suppliedUrl) && suppliedUrl.length <= 500) {
            manualUrlUpdate = { manualLiveUrl: suppliedUrl, manualUrlProvidedAt: now };
            liveUrl = suppliedUrl;
          } else if (post.manualLiveUrl) {
            liveUrl = post.manualLiveUrl;
          } else {
            return {
              ok: false,
              problem: problem(
                "VERIFY_MANUAL_URL_REQUIRED",
                409,
                "Manual URL required",
                "Add the live post URL before verification."
              )
            };
          }
        } else if (post.status === "PUBLISHED_UNVERIFIED") {
          const operation = await tx.publishOperation.findUnique({ where: { calendarPostId: post.id } });
          liveUrl = operation?.publicUrl ?? null;
        } else {
          // Not yet live (accepted/submitting/processing) or terminal without a live URL: provider
          // acknowledgement alone never becomes success. No audience observation was made, so no
          // verification record is created.
          return {
            ok: true,
            response: {
              code: "VERIFY_PROCESSING_WAIT",
              message: "The platform is still processing the post. We will check again.",
              calendarPost: publicCalendarPost(post),
              retryAfterMs: VERIFY_PROCESSING_RETRY_AFTER_MS
            },
            status: 202
          };
        }

        // Bind a newly supplied manual live URL before the verifier runs so the URL is retained
        // regardless of the verification result (matching the in-memory store). Re-read so every
        // response surfaces the bound URL.
        if (manualUrlUpdate) {
          await tx.calendarPost.update({
            where: { id: post.id },
            data: { ...manualUrlUpdate, updatedAt: now }
          });
          post = await tx.calendarPost.findFirst({
            where: { id: post.id, workspaceId: input.workspaceId }
          });
        }

        const observation = verifyAudiencePost(env, {
          mode: input.mode,
          account: post.account,
          finalVideoSha256: post.finalVideoSha256,
          caption: post.caption,
          liveUrl
        });
        if (!observation.ok) {
          return {
            ok: false,
            problem: problem("PROVIDER_OUTPUT_INVALID", 422, "Provider output invalid", "The verifier could not read the live post.")
          };
        }

        const nextAttempts = Number(existingVerification?.attempts ?? 0) + 1;
        const accountMatched = observation.observedAccount === post.account;
        const mediaSha256Matched = observation.observedMediaSha256 === post.finalVideoSha256;
        const captionMatched = observation.observedCaption === post.caption;
        const observedPublishedAt = observation.observedPublishedAt ? new Date(observation.observedPublishedAt) : null;

        if (observation.result === "processing_wait") {
          const updateData = {
            status: "PROCESSING_WAIT",
            attempts: nextAttempts,
            accountMatched: null,
            mediaSha256Matched: null,
            captionMatched: null,
            visibility: null,
            observedPublishedAt,
            lastErrorCode: null,
            verifiedAt: null
          };
          const verification = await tx.postVerification.upsert({
            where: { calendarPostId: post.id },
            update: updateData,
            create: {
              workspaceId: input.workspaceId,
              calendarPostId: post.id,
              provider: VERIFY_PROVIDER,
              evidenceArtifactId: null,
              observedAccount: null,
              observedMediaSha256: null,
              observedCaption: null,
              propagationDelayMs: null,
              ...updateData
            }
          });
          return {
            ok: true,
            response: {
              code: "VERIFY_PROCESSING_WAIT",
              message: "The platform is still processing the post. We will check again.",
              calendarPost: publicCalendarPost(post),
              verification: publicPostVerification(verification),
              retryAfterMs: observation.retryAfterMs ?? VERIFY_PROCESSING_RETRY_AFTER_MS
            },
            status: 202
          };
        }

        // Retain the audience evidence artifact for an observed result. The sha256 is a public
        // content fingerprint; the object key is omitted by publicArtifact.
        const evidenceSha256 = verifyEvidenceSha256({
          workspaceId: input.workspaceId,
          calendarPostId: post.id,
          finalVideoSha256: post.finalVideoSha256,
          finalVideoVersion: post.finalVideoVersion,
          liveUrl,
          result: observation.result,
          observedMediaSha256: observation.observedMediaSha256,
          observedAccount: observation.observedAccount,
          observedPublishedAt: observation.observedPublishedAt
        });
        const evidenceArtifact = await tx.artifact.create({
          data: {
            workspaceId: input.workspaceId,
            fileName: `verify-evidence-${post.id}.json`,
            contentType: "application/json",
            byteSize: Buffer.byteLength(evidenceSha256, "utf8"),
            sha256: evidenceSha256,
            status: "CLEAN",
            retentionClass: "audience-evidence",
            producer: `calendar-verify:${post.id}`,
            schemaVersion: "calendar.verify_evidence.v1",
            objectKey: `verify-evidence/${input.workspaceId}/${post.id}.json`
          }
        });

        if (observation.result === "identity_mismatch") {
          const updateData = {
            status: "IDENTITY_MISMATCH",
            attempts: nextAttempts,
            accountMatched,
            mediaSha256Matched,
            captionMatched,
            visibility: observation.observedVisibility ?? null,
            observedAccount: observation.observedAccount,
            observedMediaSha256: observation.observedMediaSha256,
            observedCaption: observation.observedCaption,
            observedPublishedAt,
            evidenceArtifactId: evidenceArtifact.id,
            lastErrorCode: "VERIFY_IDENTITY_MISMATCH",
            verifiedAt: null
          };
          await tx.postVerification.upsert({
            where: { calendarPostId: post.id },
            update: updateData,
            create: {
              workspaceId: input.workspaceId,
              calendarPostId: post.id,
              provider: VERIFY_PROVIDER,
              propagationDelayMs: null,
              ...updateData
            }
          });
          await tx.auditEvent.create({
            data: {
              workspaceId: input.workspaceId,
              actorUserId: actor.userId,
              eventType: "calendar.verification_failed",
              targetType: "CalendarPost",
              targetId: post.id,
              reason: "identity_mismatch"
            }
          });
          return {
            ok: false,
            problem: problem(
              "VERIFY_IDENTITY_MISMATCH",
              409,
              "Identity mismatch",
              "The live post does not match the approved account or media."
            )
          };
        }

        if (observation.result === "visibility_restricted") {
          const updateData = {
            status: "VISIBILITY_RESTRICTED",
            attempts: nextAttempts,
            accountMatched,
            mediaSha256Matched,
            captionMatched,
            visibility: observation.observedVisibility ?? null,
            observedAccount: observation.observedAccount,
            observedMediaSha256: observation.observedMediaSha256,
            observedCaption: observation.observedCaption,
            observedPublishedAt,
            evidenceArtifactId: evidenceArtifact.id,
            lastErrorCode: "VERIFY_VISIBILITY_RESTRICTED",
            verifiedAt: null
          };
          await tx.postVerification.upsert({
            where: { calendarPostId: post.id },
            update: updateData,
            create: {
              workspaceId: input.workspaceId,
              calendarPostId: post.id,
              provider: VERIFY_PROVIDER,
              propagationDelayMs: null,
              ...updateData
            }
          });
          await tx.auditEvent.create({
            data: {
              workspaceId: input.workspaceId,
              actorUserId: actor.userId,
              eventType: "calendar.verification_failed",
              targetType: "CalendarPost",
              targetId: post.id,
              reason: "visibility_restricted"
            }
          });
          return {
            ok: false,
            problem: problem(
              "VERIFY_VISIBILITY_RESTRICTED",
              409,
              "Visibility restricted",
              "The post is not visible to the required audience."
            )
          };
        }

        // verified: advance the post, retain evidence, send one deduplicated notification and anchor
        // the initial immutable PerformanceSnapshot.
        const updateData = {
          status: "VERIFIED",
          attempts: nextAttempts,
          accountMatched,
          mediaSha256Matched,
          captionMatched,
          visibility: observation.observedVisibility ?? "public",
          observedAccount: observation.observedAccount,
          observedMediaSha256: observation.observedMediaSha256,
          observedCaption: observation.observedCaption,
          observedPublishedAt: observedPublishedAt ?? now,
          evidenceArtifactId: evidenceArtifact.id,
          lastErrorCode: null,
          verifiedAt: now
        };
        const verification = await tx.postVerification.upsert({
          where: { calendarPostId: post.id },
          update: updateData,
          create: {
            workspaceId: input.workspaceId,
            calendarPostId: post.id,
            provider: VERIFY_PROVIDER,
            propagationDelayMs: null,
            ...updateData
          }
        });
        const updatedPost = await tx.calendarPost.update({
          where: { id: post.id },
          data: { status: "PUBLISHED_VERIFIED", updatedAt: now }
        });

        // One logical completion notification per workspace + payload hash. Pre-find under RLS so a
        // repeated verify collapses to the existing notification without aborting the transaction.
        const recipientUserId = post.createdByUserId;
        const payloadHash = createHash("sha256")
          .update(
            stableJson({
              workspaceId: input.workspaceId,
              calendarPostId: post.id,
              notificationType: "publish_completed",
              recipientUserId
            })
          )
          .digest("hex");
        const existingNotification = await tx.notification.findFirst({
          where: { workspaceId: input.workspaceId, payloadHash }
        });
        const duplicateCollapsed = existingNotification !== null;
        const notification = existingNotification
          ? existingNotification
          : await tx.notification.create({
              data: {
                workspaceId: input.workspaceId,
                calendarPostId: post.id,
                notificationType: "publish_completed",
                channel: "in_app",
                recipientUserId,
                payloadHash,
                status: "SENT",
                sentAt: now
              }
            });

        // Initial immutable PerformanceSnapshot anchoring the observation window at verification
        // time. V0-A1 owns the full performance_collect job that later widens the window.
        const sourceHash = createHash("sha256")
          .update(
            stableJson({
              workspaceId: input.workspaceId,
              calendarPostId: post.id,
              platform: post.platform,
              verifiedAt: now.toISOString()
            })
          )
          .digest("hex");
        const performanceSnapshot = await tx.performanceSnapshot.create({
          data: {
            workspaceId: input.workspaceId,
            calendarPostId: post.id,
            platform: post.platform,
            source: "audience_verification_initial",
            observationWindowStart: now,
            observationWindowEnd: now,
            metrics: {},
            sourceHash
          }
        });

        await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "calendar.verification_completed",
            targetType: "CalendarPost",
            targetId: post.id,
            reason: "verified"
          }
        });

        return {
          ok: true,
          response: {
            calendarPost: publicCalendarPost(updatedPost),
            verification: publicPostVerification(verification),
            evidenceArtifact: publicArtifact(evidenceArtifact),
            notification: publicNotification(notification, duplicateCollapsed),
            performanceSnapshot: publicPerformanceSnapshot(performanceSnapshot),
            replay: false
          }
        };
      },
      input.workspaceId
    );
  }

  // V0-A1: Prisma creative lineage export. Mirrors the in-memory getLineageForActor: anchor on the
  // immutable CreativeLineage row (workspaceId, finalVideoId), traverse the full ancestry, surface
  // a bounded, redacted, hash-manifested export. Missing ancestry is incomplete, a final-video
  // sha256 mismatch with the render attempt output hash is blocked, and a missing or
  // cross-workspace reference is denied behind the same WORKSPACE_ACCESS_DENIED (404). No secret,
  // signed URL, object key, raw provider payload, external id, request hash, idempotency key or
  // source hash surfaces. The manifest sha256 binds the canonical ancestry and is stable across
  // reads. BigInt money fields are surfaced as numbers.
  async function getLineageForActor(actor, input) {
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
        const lineage = await tx.creativeLineage.findFirst({
          where: { workspaceId: input.workspaceId, finalVideoId: input.finalVideoId }
        });
        if (!lineage) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }

        const entries = [];
        const missing = [];
        const mismatches = [];
        const ws = input.workspaceId;

        const brandProfile = lineage.brandProfileId
          ? await tx.brandProfile.findFirst({ where: { id: lineage.brandProfileId, workspaceId: ws } })
          : null;
        if (brandProfile) {
          entries.push({
            kind: "brand_profile",
            id: brandProfile.id,
            status: brandProfile.status,
            version: Number(brandProfile.version),
            createdAt: toIso(brandProfile.createdAt)
          });
        } else {
          missing.push("brand_profile");
        }

        const selectedScript = lineage.selectedScriptId
          ? await tx.selectedScript.findFirst({ where: { id: lineage.selectedScriptId, workspaceId: ws } })
          : null;
        if (selectedScript) {
          entries.push({
            kind: "selected_script",
            id: selectedScript.id,
            variantId: selectedScript.variantId,
            version: Number(selectedScript.version),
            humanOverride: Boolean(selectedScript.humanOverride),
            createdAt: toIso(selectedScript.createdAt)
          });
        } else {
          missing.push("selected_script");
        }

        const avatarProfile = lineage.avatarProfileId
          ? await tx.avatarProfile.findFirst({ where: { id: lineage.avatarProfileId, workspaceId: ws } })
          : null;
        if (avatarProfile) {
          entries.push({
            kind: "avatar_profile",
            id: avatarProfile.id,
            displayName: avatarProfile.displayName,
            avatarKind: avatarProfile.kind,
            createdAt: toIso(avatarProfile.createdAt)
          });
        } else {
          missing.push("avatar_profile");
        }

        const estimate = lineage.estimateId
          ? await tx.generationEstimate.findFirst({ where: { id: lineage.estimateId, workspaceId: ws } })
          : null;
        if (estimate) {
          entries.push({
            kind: "estimate",
            id: estimate.id,
            estimatedMaximumMinor: Number(estimate.maximumAuthorizedMinor),
            currency: estimate.currency,
            priceVersion: estimate.priceVersion,
            createdAt: toIso(estimate.createdAt)
          });
        } else {
          missing.push("estimate");
        }

        const operation = lineage.providerOperationId
          ? await tx.providerOperation.findFirst({ where: { id: lineage.providerOperationId, workspaceId: ws } })
          : null;
        if (operation) {
          entries.push({
            kind: "provider_operation",
            id: operation.id,
            provider: operation.provider,
            status: String(operation.status || "").toLowerCase(),
            priceVersion: operation.priceVersion,
            createdAt: toIso(operation.createdAt)
          });
        } else {
          missing.push("provider_operation");
        }

        const generatedAsset = lineage.generatedAssetId
          ? await tx.generatedAsset.findFirst({ where: { id: lineage.generatedAssetId, workspaceId: ws } })
          : null;
        if (generatedAsset) {
          entries.push({
            kind: "generated_asset",
            id: generatedAsset.id,
            status: String(generatedAsset.status || "").toLowerCase(),
            durationSeconds: Number(generatedAsset.durationSeconds ?? 0),
            artifact: {
              sha256: generatedAsset.sha256,
              contentType: generatedAsset.contentType,
              version: Number(generatedAsset.version ?? 0)
            },
            createdAt: toIso(generatedAsset.createdAt)
          });
        } else {
          missing.push("generated_asset");
        }

        const compositionInstruction = lineage.compositionInstructionId
          ? await tx.compositionInstruction.findFirst({ where: { id: lineage.compositionInstructionId, workspaceId: ws } })
          : null;
        if (compositionInstruction) {
          entries.push({
            kind: "composition_instruction",
            id: compositionInstruction.id,
            status: String(compositionInstruction.status || "").toLowerCase(),
            createdAt: toIso(compositionInstruction.createdAt)
          });
        } else {
          missing.push("composition_instruction");
        }

        const aePlan = lineage.aePlanId
          ? await tx.aePlan.findFirst({ where: { id: lineage.aePlanId, workspaceId: ws } })
          : null;
        if (aePlan) {
          entries.push({
            kind: "ae_plan",
            id: aePlan.id,
            schemaVersion: aePlan.schemaVersion,
            capabilityVersion: aePlan.capabilityVersion,
            status: String(aePlan.status || "").toLowerCase(),
            createdAt: toIso(aePlan.createdAt)
          });
        } else {
          missing.push("ae_plan");
        }

        const renderAttempt = lineage.renderAttemptId
          ? await tx.renderAttempt.findFirst({ where: { id: lineage.renderAttemptId, workspaceId: ws } })
          : null;
        if (renderAttempt) {
          entries.push({
            kind: "render_attempt",
            id: renderAttempt.id,
            status: String(renderAttempt.status || "").toLowerCase(),
            outputSha256: renderAttempt.outputHash,
            workerCapabilityVersion: renderAttempt.workerCapabilityVersion,
            createdAt: toIso(renderAttempt.createdAt)
          });
        } else {
          missing.push("render_attempt");
        }

        const finalVideo = lineage.finalVideoId
          ? await tx.finalVideo.findFirst({ where: { id: lineage.finalVideoId, workspaceId: ws } })
          : null;
        if (finalVideo) {
          entries.push({
            kind: "final_video",
            id: finalVideo.id,
            version: Number(finalVideo.version),
            durationSeconds: Number(finalVideo.durationSeconds ?? 0),
            resolution: finalVideo.resolution,
            codec: finalVideo.codec,
            capabilityVersion: finalVideo.capabilityVersion,
            schemaVersion: finalVideo.schemaVersion,
            artifact: {
              sha256: finalVideo.sha256,
              byteSize: Number(finalVideo.byteSize ?? 0)
            },
            createdAt: toIso(finalVideo.createdAt)
          });
        } else {
          missing.push("final_video");
        }

        const calendarPost = await tx.calendarPost.findFirst({
          where: { workspaceId: ws, finalVideoId: lineage.finalVideoId },
          orderBy: { updatedAt: "desc" }
        });
        if (calendarPost) {
          entries.push({
            kind: "calendar_post",
            id: calendarPost.id,
            platform: calendarPost.platform,
            account: calendarPost.account,
            status: String(calendarPost.status || "").toLowerCase(),
            createdAt: toIso(calendarPost.createdAt)
          });
        } else {
          missing.push("calendar_post");
        }

        const postVerification = calendarPost
          ? await tx.postVerification.findUnique({ where: { calendarPostId: calendarPost.id } })
          : null;
        if (postVerification) {
          entries.push({
            kind: "post_verification",
            id: postVerification.id,
            provider: postVerification.provider,
            status: String(postVerification.status || "").toLowerCase(),
            attempts: Number(postVerification.attempts),
            accountMatched: Boolean(postVerification.accountMatched),
            mediaSha256Matched: Boolean(postVerification.mediaSha256Matched),
            captionMatched: Boolean(postVerification.captionMatched),
            visibility: postVerification.visibility,
            verifiedAt: postVerification.verifiedAt ? toIso(postVerification.verifiedAt) : null,
            createdAt: toIso(postVerification.createdAt)
          });
        } else {
          missing.push("post_verification");
        }

        const initialSnapshot = calendarPost
          ? await tx.performanceSnapshot.findFirst({
              where: { workspaceId: ws, calendarPostId: calendarPost.id, source: "audience_verification_initial" }
            })
          : null;
        if (initialSnapshot) {
          entries.push({
            kind: "performance_snapshot_initial",
            id: initialSnapshot.id,
            source: initialSnapshot.source,
            observationWindowStart: toIso(initialSnapshot.observationWindowStart),
            observationWindowEnd: toIso(initialSnapshot.observationWindowEnd),
            createdAt: toIso(initialSnapshot.createdAt)
          });
        } else {
          missing.push("performance_snapshot_initial");
        }

        if (finalVideo && renderAttempt && finalVideo.sha256 !== renderAttempt.outputHash) {
          mismatches.push("final_video");
        }

        const status = mismatches.length > 0 ? "blocked" : missing.length > 0 ? "incomplete" : "complete";

        const cost = operation
          ? {
              providerTotalMinor: Number(operation.providerTotalMinor ?? 0),
              estimatedMaximumMinor: Number(operation.estimatedMaximumMinor ?? 0),
              currency: operation.currency,
              priceVersion: operation.priceVersion
            }
          : null;

        const providerTimestamps = operation
          ? {
              submittedAt: operation.submittedAt ? toIso(operation.submittedAt) : null,
              acceptedAt: operation.acceptedAt ? toIso(operation.acceptedAt) : null,
              completedAt: operation.completedAt ? toIso(operation.completedAt) : null
            }
          : null;

        const manifestEntries = entries
          .map((entry) => ({ kind: entry.kind, id: entry.id }))
          .sort((a, b) => (a.kind === b.kind ? String(a.id).localeCompare(String(b.id)) : a.kind.localeCompare(b.kind)));
        const manifestSha256 = createHash("sha256").update(stableJson(manifestEntries)).digest("hex");

        return {
          ok: true,
          response: {
            workspaceId: input.workspaceId,
            finalVideoId: lineage.finalVideoId,
            status,
            missing,
            mismatches,
            entries,
            cost,
            providerTimestamps,
            manifestSha256,
            generatedAt: new Date().toISOString()
          }
        };
      },
      input.workspaceId
    );
  }

  // V0-A1: Prisma performance_collect. Mirrors the in-memory collectPerformanceForActor: a fresh
  // immutable observed PerformanceSnapshot per (actor, idempotency key); a same-key replay returns
  // the retained snapshot with replay true, a same key with different details is an input conflict.
  // The post must be PUBLISHED_VERIFIED to be observable. Idempotency is recorded in the
  // idempotency_records table so a crash-window retry recovers the same snapshot. No secret, signed
  // URL, object key, raw provider payload or account id leaks; metrics are observations only.
  async function collectPerformanceForActor(actor, input) {
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
        const post = await tx.calendarPost.findFirst({
          where: { id: input.calendarPostId, workspaceId: input.workspaceId }
        });
        if (!post) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        if (post.status !== "PUBLISHED_VERIFIED") {
          return {
            ok: false,
            problem: problem(
              "PERFORMANCE_NOT_OBSERVABLE",
              409,
              "Performance not observable",
              "Platform metrics can only be observed for a verified audience-facing post."
            )
          };
        }

        const operation = "calendar.performance_collect";
        const requestHash = hashRequest({ workspaceId: input.workspaceId, calendarPostId: input.calendarPostId });
        const existing = await tx.idempotencyRecord.findUnique({
          where: {
            actorUserId_operation_idempotencyKey: {
              actorUserId: actor.userId,
              operation,
              idempotencyKey: input.idempotencyKey
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
          const replaySnapshot = await tx.performanceSnapshot.findUnique({
            where: { id: existing.responseBody.performanceSnapshotId }
          });
          return {
            ok: true,
            response: {
              calendarPost: publicCalendarPost(post),
              performanceSnapshot: publicPerformanceSnapshot(replaySnapshot),
              replay: true
            }
          };
        }

        const priorSnapshots = await tx.performanceSnapshot.findMany({
          where: { workspaceId: input.workspaceId, calendarPostId: post.id },
          orderBy: { createdAt: "asc" }
        });
        const collectSequence = priorSnapshots.filter((candidate) => candidate.source === "performance_collect_simulator").length;
        const windowStart = priorSnapshots.length > 0 ? priorSnapshots[priorSnapshots.length - 1].observationWindowEnd : null;
        const now = new Date();
        const observation = collectPerformanceObservation(env, {
          calendarPostId: post.id,
          platform: post.platform,
          collectSequence
        });
        if (!observation.ok) {
          return {
            ok: false,
            problem: problem(
              observation.errorCode ?? "PERFORMANCE_PROVIDER_UNAVAILABLE",
              503,
              "Performance provider unavailable",
              "The performance provider is not available. Try again shortly.",
              true
            )
          };
        }
        if (observation.result === "processing_wait") {
          return {
            ok: true,
            status: 202,
            response: {
              code: "PERFORMANCE_PROCESSING_WAIT",
              calendarPost: publicCalendarPost(post),
              retryAfterMs: observation.retryAfterMs ?? PERFORMANCE_PROCESSING_RETRY_AFTER_MS
            }
          };
        }

        const sourceHash = createHash("sha256")
          .update(
            stableJson({
              workspaceId: input.workspaceId,
              calendarPostId: post.id,
              platform: post.platform,
              sequence: collectSequence,
              collectedAt: now.toISOString()
            })
          )
          .digest("hex");
        const snapshot = await tx.performanceSnapshot.create({
          data: {
            workspaceId: input.workspaceId,
            calendarPostId: post.id,
            platform: post.platform,
            source: "performance_collect_simulator",
            observationWindowStart: windowStart ?? now,
            observationWindowEnd: now,
            metrics: observation.metrics ?? {},
            sourceHash
          }
        });

        await tx.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: actor.userId,
            eventType: "calendar.performance_collected",
            targetType: "CalendarPost",
            targetId: post.id,
            reason: "observed"
          }
        });
        await tx.idempotencyRecord.create({
          data: {
            actorUserId: actor.userId,
            workspaceId: input.workspaceId,
            operation,
            idempotencyKey: input.idempotencyKey,
            requestHash,
            responseStatus: 200,
            responseBody: { performanceSnapshotId: snapshot.id }
          }
        });

        return {
          ok: true,
          response: {
            calendarPost: publicCalendarPost(post),
            performanceSnapshot: publicPerformanceSnapshot(snapshot),
            replay: false
          }
        };
      },
      input.workspaceId
    );
  }

  // V0-A1: Prisma performance read. Mirrors the in-memory getPerformanceForActor: every immutable
  // PerformanceSnapshot for one calendar post (initial plus collected), append-only, with a stale
  // flag when the post is no longer PUBLISHED_VERIFIED. A missing or cross-workspace post is denied
  // behind the same WORKSPACE_ACCESS_DENIED (404). No secret, signed URL, object key, raw provider
  // payload, account id or source hash leaks; metrics are observations only.
  async function getPerformanceForActor(actor, input) {
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
        const post = await tx.calendarPost.findFirst({
          where: { id: input.calendarPostId, workspaceId: input.workspaceId }
        });
        if (!post) {
          return {
            ok: false,
            problem: problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item.")
          };
        }
        const stale = post.status !== "PUBLISHED_VERIFIED";
        const rows = await tx.performanceSnapshot.findMany({
          where: { workspaceId: input.workspaceId, calendarPostId: post.id },
          orderBy: { createdAt: "asc" }
        });
        const snapshots = rows.map((candidate) => ({ ...publicPerformanceSnapshot(candidate), stale }));
        return {
          ok: true,
          response: {
            calendarPost: publicCalendarPost(post),
            snapshots
          }
        };
      },
      input.workspaceId
    );
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
    rotateServiceCredential,
    setSimulatorMode,
    recordRestoreDrill,
    runRedactionScan,
    runB2Benchmark,
    runBacklogSimulation,
    runIncidentRehearsal,
    getWorkspaceOperationalAlerts,
    runIdempotent,
    initiateArtifactUpload,
    putArtifactUpload,
    completeArtifactUpload,
    createArtifactDownload,
    createBrandCrawlRun,
    listBrands,
    listBrandAssets,
    getBrandCrawlRun,
    getBrandAssetPack,
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
    updateBrandCandidateDecision,
    listDeadLetterJobs,
    claimJob,
    heartbeatJob,
    completeJob,
    failJob,
    expireJobLeases,
    relayOutbox,
    listAvatars,
    revokeAvatarConsent,
    createCreditPurchase,
    processPaymentCallback,
    listWalletLedger,
    createCreditAdjustment,
    createCompositionPlan,
    renderCompositionPlan,
    createReviewItem,
    addReviewComment,
    getReviewItem,
    listReviewItems,
    listReviewComments,
    recordReviewDecision,
    createCalendarPost,
    updateCalendarPost,
    submitPublishOperation,
    reconcilePublishOperation,
    processPublishingCallback,
    verifyCalendarPost,
    getLineageForActor,
    collectPerformanceForActor,
    getPerformanceForActor,
    disconnect: () => prisma.$disconnect()
  };
}

const supportedContentTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "video/mp4"]);
const supportedWorkspaceCapabilities = new Set(["media_processing"]);
const supportedCredentialRotationStatuses = new Set(["ACTIVE", "ROTATION_DUE", "REVOKED"]);
const supportedSimulatorBoundaries = new Set(["provider", "payment", "publishing", "worker"]);
const supportedSimulatorModes = new Set(["success", "timeout", "duplicate", "malformed", "bad_signature"]);
const supportedBrandTypes = new Set([
  "d2c_ecommerce",
  "b2b_saas",
  "real_estate",
  "healthcare",
  "education",
  "financial_services",
  "restaurant_fb",
  "fitness_wellness",
  "automotive",
  "legal_professional",
  "travel_hospitality",
  "home_services"
]);
const supportedBrandExtractionSchemas = new Set([
  "brand.extraction.output.v1",
  "brand.extraction.output.v2",
  "brand.extraction.output.v3"
]);
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
  if (input.brandId && (!optionalString(input.rightsBasis) || !optionalString(input.permittedUse))) {
    return problem("SOURCE_RIGHTS_REQUIRED", 409, "Source rights required", "Record the rights basis and permitted use for this brand asset.");
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

// V0-A2 rotation input. The new secret is supplied as a secret-manager reference
// only; any plaintext secret field is rejected. The provider/purpose/environment
// are inherited from the prior credential, so the rotation body carries only the
// new reference and an optional reason.
function validateServiceCredentialRotationInput(input) {
  if (
    Object.hasOwn(input, "secretValue") ||
    Object.hasOwn(input, "apiKey") ||
    Object.hasOwn(input, "plaintext")
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (
    typeof input.secretRef !== "string" ||
    !input.secretRef.startsWith("secret-manager://")
  ) {
    return problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.");
  }
  if (input.reason !== undefined && (typeof input.reason !== "string" || input.reason.length > 500)) {
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
  const selectedBrandType = normalizeBrandType(input.brandType);
  if (selectedBrandType.problem) {
    return selectedBrandType;
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
  return {
    normalizedUrl: normalized.normalizedUrl,
    crawlScope: enrichCrawlScopeWithBrandMetadata(crawlScope.crawlScope, {
      selectedBrandType: selectedBrandType.brandType
    }),
    selectedBrandType: selectedBrandType.brandType,
    assets: validatedAssets
  };
}

function normalizeBrandType(value) {
  if (value === undefined || value === null || value === "") {
    return { brandType: null };
  }
  if (typeof value !== "string" || !supportedBrandTypes.has(value.trim())) {
    return { problem: problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields.") };
  }
  return { brandType: value.trim() };
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
  if (!artifact) {
    return null;
  }
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
  const brandMetadata = brandCrawlRunMetadata(crawlRun);
  return {
    id: crawlRun.id,
    workspaceId: crawlRun.workspaceId,
    brandId: crawlRun.brandId,
    sourceUrl: crawlRun.sourceUrl,
    normalizedUrl: crawlRun.normalizedUrl,
    status: crawlRun.status,
    rightsAcknowledged: crawlRun.rightsAcknowledged,
    crawlScope: crawlRun.crawlScope,
    selectedBrandType: brandMetadata.selectedBrandType,
    detectedBrandType: brandMetadata.detectedBrandType,
    extractionSchemaVersion: brandMetadata.extractionSchemaVersion,
    providerCreditTelemetry: brandMetadata.providerCreditTelemetry,
    robotsPolicy: crawlRun.robotsPolicy ?? null,
    crawlProvider: crawlRun.crawlProvider ?? null,
    jobId: crawlRun.jobId ?? null,
    createdAt: toIso(crawlRun.createdAt),
    updatedAt: toIso(crawlRun.updatedAt)
  };
}

function resolveCrawlProviderStatus(env) {
  const mode = env?.BRAND_CRAWL_MODE || (env?.FIRECRAWL_API_KEY ? "firecrawl" : "simulator");
  return { mode, configured: mode === "firecrawl" && typeof env?.FIRECRAWL_API_KEY === "string" && env.FIRECRAWL_API_KEY.trim().length > 0 };
}

function calculateBrandCandidateReadiness(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return 0;
  const groups = [
    ["identity", "summary"],
    ["visual_identity", "logo", "color", "font", "rights_asset", "media_asset"],
    ["copy_messaging", "usp", "cta", "positioning"],
    ["audience"],
    ["voice", "tone"],
    ["product_service", "product", "service"],
    ["social_proof", "testimonial", "rating", "certification", "award", "case_study", "metric"],
    ["claim", "regulated_claim", "prohibited_claim", "disclaimer"]
  ];
  const present = new Set(candidates.map((candidate) => candidate.fieldType));
  return Math.round((groups.filter((group) => group.some((fieldType) => present.has(fieldType))).length / groups.length) * 100);
}

function brandCrawlRunMetadata(crawlRun) {
  const scope = crawlRun?.crawlScope && typeof crawlRun.crawlScope === "object" ? crawlRun.crawlScope : {};
  const metadata = scope.brandExtraction && typeof scope.brandExtraction === "object" ? scope.brandExtraction : {};
  return {
    selectedBrandType: crawlRun.selectedBrandType ?? metadata.selectedBrandType ?? null,
    detectedBrandType: crawlRun.detectedBrandType ?? metadata.detectedBrandType ?? null,
    extractionSchemaVersion: crawlRun.extractionSchemaVersion ?? metadata.extractionSchemaVersion ?? null,
    providerCreditTelemetry: crawlRun.providerCreditTelemetry ?? metadata.providerCreditTelemetry ?? null
  };
}

function enrichCrawlScopeWithBrandMetadata(crawlScope, metadata) {
  const current = crawlScope && typeof crawlScope === "object" ? crawlScope : {};
  const currentMetadata = current.brandExtraction && typeof current.brandExtraction === "object" ? current.brandExtraction : {};
  const nextMetadata = { ...currentMetadata };
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      nextMetadata[key] = value;
    }
  }
  return { ...current, brandExtraction: nextMetadata };
}

function normalizeProviderCreditTelemetry(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const telemetry = {};
  if (Number.isFinite(value.estimatedCredits)) {
    telemetry.estimatedCredits = value.estimatedCredits;
  }
  if (Number.isFinite(value.observedCredits)) {
    telemetry.observedCredits = value.observedCredits;
  }
  return Object.keys(telemetry).length > 0 ? telemetry : null;
}

function normalizeBrandExtractionScrape(input) {
  if (input.scrape) {
    return input.scrape;
  }
  return { pages: Array.isArray(input.pages) ? input.pages : [] };
}

function isValidBrandExtractionOutput(input) {
  if (!supportedBrandExtractionSchemas.has(input.schemaVersion)) {
    return false;
  }
  if (input.schemaVersion !== "brand.extraction.output.v3") {
    return Boolean(input.scrape);
  }
  const provider = input.provider ?? "simulator";
  const universalProfile = input.universal?.profile;
  const verticalAssets = input.vertical?.assets;
  return (
    ["firecrawl", "simulator"].includes(provider) &&
    input.universal?.sourceGuide === "docs/V0/Features/Firecrawl/brand-crawl-universal.md" &&
    input.vertical?.sourceGuide === "docs/V0/Features/Firecrawl/brand-crawl-verticals.md" &&
    universalProfile &&
    typeof universalProfile === "object" &&
    universalProfile.visual_identity &&
    universalProfile.copy_messaging &&
    universalProfile.social_proof &&
    universalProfile.brand_personality &&
    universalProfile.metadata &&
    universalProfile.raw_pages &&
    verticalAssets &&
    typeof verticalAssets === "object" &&
    typeof verticalAssets.detected_vertical === "string" &&
    typeof verticalAssets.vertical_label === "string" &&
    Array.isArray(verticalAssets.products_or_services) &&
    verticalAssets.visual_assets &&
    verticalAssets.copy_assets &&
    verticalAssets.raw_vertical_data &&
    Array.isArray(input.pages) &&
    input.pages.length > 0
  );
}

function isValidRetainedCrawlAsset(asset, workspaceId) {
  return Boolean(
    asset &&
    typeof asset.fileName === "string" && asset.fileName.trim() &&
    typeof asset.contentType === "string" && supportedContentTypes.has(asset.contentType.trim().toLowerCase()) &&
    Number.isInteger(asset.byteSize) && asset.byteSize > 0 && asset.byteSize <= 10 * 1024 * 1024 &&
    isSha256(asset.sha256) &&
    typeof asset.objectKey === "string" && asset.objectKey.startsWith(`clean-media/${workspaceId}/brand-crawl/`) &&
    typeof asset.rightsBasis === "string" && asset.rightsBasis.trim() &&
    typeof asset.permittedUse === "string" && asset.permittedUse.trim()
  );
}

function publicBrandAsset(asset, artifact = null) {
  return {
    id: asset.id,
    workspaceId: asset.workspaceId,
    brandId: asset.brandId,
    crawlRunId: asset.crawlRunId,
    artifactId: asset.artifactId,
    locator: `artifact:${asset.artifactId}`,
    name: artifact?.fileName ?? "Uploaded brand asset",
    category: artifact ? brandAssetCategoryFromContentType(artifact.contentType) : "Uploaded brand asset",
    rightsBasis: asset.rightsBasis,
    permittedUse: asset.permittedUse,
    status: asset.status,
    createdAt: toIso(asset.createdAt),
    updatedAt: toIso(asset.updatedAt)
  };
}

function publicBrand(brand) {
  return {
    id: brand.id,
    workspaceId: brand.workspaceId,
    name: brand.name,
    slug: brand.slug,
    websiteUrl: brand.websiteUrl,
    normalizedDomain: brand.normalizedDomain,
    status: brand.status,
    createdAt: toIso(brand.createdAt),
    updatedAt: toIso(brand.updatedAt)
  };
}

function recognizableBrandName(domain) {
  const label = String(domain).split(".")[0] || "Brand";
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Brand";
}

function uniqueBrandSlug(brands, workspaceId, value) {
  const base = slugify(value) || "brand";
  const occupied = new Set(
    [...brands.values()].filter((brand) => brand.workspaceId === workspaceId).map((brand) => brand.slug)
  );
  if (!occupied.has(base)) return base;
  let suffix = 2;
  while (occupied.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function brandAssetCategoryFromContentType(contentType) {
  if (typeof contentType !== "string") return "Uploaded brand asset";
  if (contentType.startsWith("image/svg")) return "Uploaded logo or vector";
  if (contentType.startsWith("image/")) return "Uploaded image";
  if (contentType === "application/pdf") return "Uploaded document";
  if (contentType.startsWith("video/")) return "Uploaded video";
  return "Uploaded brand asset";
}

function publicBrandCandidate(candidate) {
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    brandId: candidate.brandId,
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

function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function defaultUserProfile(actor, now = new Date().toISOString()) {
  return {
    id: actor.userId,
    userId: actor.userId,
    name: null,
    contactEmail: actor.email ?? null,
    websiteUrl: null,
    industry: null,
    primaryMarket: "India",
    language: "en-IN",
    onboardingSkipped: false,
    createdAt: now,
    updatedAt: now
  };
}

function publicUserProfile(profile) {
  return profile ? {
    id: profile.id,
    userId: profile.userId,
    name: profile.name,
    contactEmail: profile.contactEmail,
    websiteUrl: profile.websiteUrl,
    industry: profile.industry,
    primaryMarket: profile.primaryMarket,
    language: profile.language,
    onboardingSkipped: profile.onboardingSkipped,
    createdAt: toIso(profile.createdAt),
    updatedAt: toIso(profile.updatedAt)
  } : null;
}

function publicBrandContext(context) {
  return context ? {
    id: context.id,
    workspaceId: context.workspaceId,
    userId: context.userId,
    brandName: context.brandName,
    websiteUrl: context.websiteUrl,
    industry: context.industry,
    videoGoal: context.videoGoal,
    primaryMarket: context.primaryMarket,
    language: context.language,
    targetPlatforms: context.targetPlatforms,
    createdAt: toIso(context.createdAt),
    updatedAt: toIso(context.updatedAt)
  } : null;
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

// V0-U2 Meta callback signing. Mirrors the HeyGen simulator: the simulator signs the
// callback envelope and the store verifies it in constant time. The secret never leaves
// the simulator. META_WEBHOOK_SECRET is the configured production secret;
// V0_META_SIMULATOR_SECRET is the deterministic local secret.
const META_CALLBACK_WINDOW_MS = 5 * 60 * 1000;

function metaSimulatorSecret(env = process.env) {
  return env.V0_META_SIMULATOR_SECRET || env.META_WEBHOOK_SECRET || "v0-local-meta-secret";
}

function signMetaEnvelope(envelope, secret) {
  return createHmac("sha256", secret).update(stableJson(envelope)).digest("hex");
}

function verifyMetaSignature(envelope, signature, secret) {
  if (typeof signature !== "string" || signature.length === 0) {
    return false;
  }
  const expected = signMetaEnvelope(envelope, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

// V0-U3 YouTube callback signing. Mirrors the Meta simulator: the simulator signs the callback
// envelope and the store verifies it in constant time. The secret never leaves the simulator.
// YOUTUBE_WEBHOOK_SECRET is the configured production secret; V0_YOUTUBE_SIMULATOR_SECRET is the
// deterministic local secret.
const YOUTUBE_CALLBACK_WINDOW_MS = 5 * 60 * 1000;

function youtubeSimulatorSecret(env = process.env) {
  return env.V0_YOUTUBE_SIMULATOR_SECRET || env.YOUTUBE_WEBHOOK_SECRET || "v0-local-youtube-secret";
}

function signYouTubeEnvelope(envelope, secret) {
  return createHmac("sha256", secret).update(stableJson(envelope)).digest("hex");
}

function verifyYouTubeSignature(envelope, signature, secret) {
  if (typeof signature !== "string" || signature.length === 0) {
    return false;
  }
  const expected = signYouTubeEnvelope(envelope, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

// V0-U3 publish adapter registry. The internal publication contract is shared across providers
// (V0-U2 Meta, V0-U3 YouTube Shorts); the calendar post's platform selects the adapter. Each
// adapter carries its provider name (written to PublishOperation.provider), its callback source
// (the {provider} path param and inbox_events.source), its signature header, its signing/verify
// helpers, its public-URL helper, its callback window, its live-API-mode env guard and an optional
// pre-flight quota gate. A platform without an adapter resolves to null and the store rejects with
// PUBLISH_PLATFORM_UNSUPPORTED so an unknown platform fails honestly and never silently publishes.
const PUBLISH_PLATFORMS = {
  meta: {
    provider: META_PROVIDER,
    source: "meta",
    operationType: META_OPERATION_TYPE,
    signatureHeader: "x-meta-signature",
    liveApiModeEnv: "META_MODE",
    callbackWindowMs: META_CALLBACK_WINDOW_MS,
    submit: submitMetaPost,
    reconcile: reconcileMetaOperation,
    publicUrl: metaPublicUrl,
    secret: metaSimulatorSecret,
    sign: signMetaEnvelope,
    verify: verifyMetaSignature,
    checkQuota: null
  },
  "youtube-shorts": {
    provider: YOUTUBE_PROVIDER,
    source: "youtube",
    operationType: YOUTUBE_OPERATION_TYPE,
    signatureHeader: "x-youtube-signature",
    liveApiModeEnv: "YOUTUBE_MODE",
    callbackWindowMs: YOUTUBE_CALLBACK_WINDOW_MS,
    submit: submitYouTubePost,
    reconcile: reconcileYouTubeOperation,
    publicUrl: youtubePublicUrl,
    secret: youtubeSimulatorSecret,
    sign: signYouTubeEnvelope,
    verify: verifyYouTubeSignature,
    checkQuota: checkYouTubeQuota
  }
};

function resolvePublishAdapter(platform) {
  return PUBLISH_PLATFORMS[platform] ?? null;
}

// Resolve the callback adapter from the {provider} path param (the inbox source string). A
// callback for a source with no adapter is rejected as an unverified update.
export function resolvePublishCallbackAdapter(provider) {
  return Object.values(PUBLISH_PLATFORMS).find((adapter) => adapter.source === provider) ?? null;
}

// V0-U2/V0-U3 publish request hash: binds the publication to the exact calendar post, bound final
// video version, platform, account and provider so a changed request is detectable and the
// operation is exactly-once per calendar post. The provider in the hash is the actual adapter
// provider (not a constant), so a YouTube publish to the same post+account as a Meta publish is
// distinguishable. Server-side binding; never exposed publicly.
function computePublishRequestHash(post, account, provider) {
  return createHash("sha256")
    .update(
      stableJson({
        calendarPostId: post.id,
        finalVideoId: post.finalVideoId,
        finalVideoSha256: post.finalVideoSha256,
        finalVideoVersion: Number(post.finalVideoVersion),
        platform: post.platform,
        account,
        provider: provider
      })
    )
    .digest("hex");
}

// V0-U2 public publish operation mapper. The request hash is a server-side binding secret and
// is never surfaced; the public post URL is the audience-facing URL and is included only once
// the post is live. The post-level PublishStatus has no unknown; the operation carries the
// precise uncertain truth while the post stays submitting.
function publicPublishOperation(operation) {
  return {
    id: operation.id,
    workspaceId: operation.workspaceId,
    calendarPostId: operation.calendarPostId,
    provider: operation.provider,
    operationType: operation.operationType,
    status: String(operation.status).toLowerCase(),
    idempotencyKey: operation.idempotencyKey,
    externalId: operation.externalId ?? null,
    publicUrl: operation.publicUrl ?? null,
    retryAfterMs: operation.retryAfterMs ?? null,
    lastErrorCode: operation.lastErrorCode ?? null,
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

// V0-C1 composition instruction public mapper. Composition status is lowercase per
// V0_STATUS_ENUMS.md. The raw direction is internal context, never returned to the
// browser; the public surface carries status, input mode and the bound generated asset.
function publicCompositionInstruction(instruction) {
  return {
    id: instruction.id,
    workspaceId: instruction.workspaceId,
    generationAssetId: instruction.generationAssetId,
    inputMode: instruction.inputMode,
    status: String(instruction.status || "").toLowerCase(),
    version: Number(instruction.version),
    createdAt: toIso(instruction.createdAt),
    updatedAt: toIso(instruction.updatedAt)
  };
}

// V0-C1 AE plan public mapper. The timeline JSON, plan artifact sha256 and asset ids are
// retained server-side only; the public surface carries status, capability version, schema
// version, plan version, the plan artifact id and the explained unsupported items.
function publicAePlan(plan) {
  return {
    id: plan.id,
    compositionInstructionId: plan.compositionInstructionId,
    version: Number(plan.version),
    capabilityVersion: plan.capabilityVersion,
    schemaVersion: plan.schemaVersion,
    status: String(plan.status || "").toLowerCase(),
    unsupportedItems: Array.isArray(plan.unsupportedItems) ? plan.unsupportedItems : [],
    planArtifactId: plan.planArtifactId ?? null,
    validatedAt: plan.validatedAt ? toIso(plan.validatedAt) : null,
    createdAt: toIso(plan.createdAt),
    updatedAt: toIso(plan.updatedAt)
  };
}

// V0-C2 render attempt public mapper. Render attempt status is lowercase per
// V0_STATUS_ENUMS.md. The input hash and input asset hashes are server-side validation
// bindings and never reach the browser; the public surface carries the output hash (the
// retained final-video sha256), the worker capability version and the completion timestamps.
function publicRenderAttempt(attempt) {
  return {
    id: attempt.id,
    workspaceId: attempt.workspaceId,
    compositionInstructionId: attempt.compositionInstructionId,
    aePlanId: attempt.aePlanId,
    version: Number(attempt.version),
    renderer: attempt.renderer,
    workerCapabilityVersion: attempt.workerCapabilityVersion,
    outputHash: attempt.outputHash ?? null,
    status: String(attempt.status || "").toLowerCase(),
    startedAt: toIso(attempt.startedAt),
    completedAt: attempt.completedAt ? toIso(attempt.completedAt) : null,
    createdAt: toIso(attempt.createdAt),
    updatedAt: toIso(attempt.updatedAt)
  };
}

// V0-C2 final video public mapper. Final video status is lowercase per V0_STATUS_ENUMS.md.
// The sha256 is the deterministic golden render fingerprint (a public content hash, not a
// secret); the artifact ids are server-side bindings and are omitted. The public surface
// carries the version, status, duration, resolution, codec, capability/schema versions and
// the golden render hash.
function publicFinalVideo(finalVideo) {
  return {
    id: finalVideo.id,
    workspaceId: finalVideo.workspaceId,
    compositionInstructionId: finalVideo.compositionInstructionId,
    renderAttemptId: finalVideo.renderAttemptId,
    version: Number(finalVideo.version),
    status: String(finalVideo.status || "").toLowerCase(),
    durationSeconds: Number(finalVideo.durationSeconds),
    resolution: finalVideo.resolution,
    codec: finalVideo.codec,
    sha256: finalVideo.sha256,
    byteSize: Number(finalVideo.byteSize),
    capabilityVersion: finalVideo.capabilityVersion,
    schemaVersion: finalVideo.schemaVersion,
    createdAt: toIso(finalVideo.createdAt),
    updatedAt: toIso(finalVideo.updatedAt)
  };
}

function publicCreativeLineage(lineage) {
  return {
    id: lineage.id,
    workspaceId: lineage.workspaceId,
    generationJobId: lineage.generationJobId ?? null,
    brandProfileId: lineage.brandProfileId,
    selectedScriptId: lineage.selectedScriptId ?? null,
    avatarProfileId: lineage.avatarProfileId ?? null,
    estimateId: lineage.estimateId,
    provider: lineage.provider,
    providerOperationId: lineage.providerOperationId,
    priceVersion: lineage.priceVersion,
    generatedAssetId: lineage.generatedAssetId,
    compositionInstructionId: lineage.compositionInstructionId ?? null,
    aePlanId: lineage.aePlanId ?? null,
    renderAttemptId: lineage.renderAttemptId ?? null,
    finalVideoId: lineage.finalVideoId ?? null,
    createdAt: toIso(lineage.createdAt),
    updatedAt: toIso(lineage.updatedAt)
  };
}

// V0-R1 review-stage normalization. Stored UPPERCASE per the Prisma enum; surfaced lowercase.
function normalizeReviewStage(value) {
  const stage = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (stage === "INTERNAL_REVIEW" || stage === "CLIENT_REVIEW") {
    return stage;
  }
  return null;
}

// V0-R1 review item public mapper. The status and review stage are lowercase per
// V0_STATUS_ENUMS.md. The captured final-video sha256 is a public content hash (not a secret);
// the bound final-video id and composition instruction id are surfaced so the caller can
// reconcile the exact version. No signed URL, object key or secret is surfaced.
function publicReviewItem(item) {
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    compositionInstructionId: item.compositionInstructionId,
    finalVideoId: item.finalVideoId,
    finalVideoSha256: item.finalVideoSha256,
    finalVideoVersion: Number(item.finalVideoVersion),
    reviewStage: String(item.reviewStage || "").toLowerCase(),
    status: String(item.status || "").toLowerCase(),
    createdByUserId: item.createdByUserId,
    createdAt: toIso(item.createdAt),
    updatedAt: toIso(item.updatedAt)
  };
}

// V0-R1 review comment public mapper. Comments are append-only; the createdAt timestamp
// orders the thread. The threadId is nullable.
function publicReviewComment(comment) {
  return {
    id: comment.id,
    reviewItemId: comment.reviewItemId,
    authorUserId: comment.authorUserId,
    body: comment.body,
    timestampMs: Number(comment.timestampMs),
    threadId: comment.threadId ?? null,
    createdAt: toIso(comment.createdAt)
  };
}

// V0-R1 notification public mapper. Notification status is lowercase per V0_STATUS_ENUMS.md.
// The recipient user id, payload hash, object key and any signed URL are server-side only and
// never surfaced. duplicateCollapsed is reported per-request (true when this comment collapsed
// into the existing logical notification).
function publicNotification(notification, duplicateCollapsed = false) {
  return {
    id: notification.id,
    notificationType: notification.notificationType,
    channel: notification.channel,
    status: String(notification.status || "").toLowerCase(),
    duplicateCollapsed,
    createdAt: toIso(notification.createdAt)
  };
}

// V0-R2 approval decision normalization. Stored UPPERCASE per the Prisma enum; surfaced lowercase.
function normalizeApprovalDecision(value) {
  const decision = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (decision === "APPROVE" || decision === "REJECT" || decision === "REQUEST_CHANGES") {
    return decision;
  }
  return null;
}

// V0-R2 review decision public mapper. The decision is lowercase per V0_STATUS_ENUMS.md. The
// captured final-video sha256 is a public content hash (not a secret); the bound final-video id
// is surfaced so the caller can reconcile the exact version. The approval token is a stable public
// downstream reference (not a secret). No signed URL, object key or secret is surfaced.
function publicReviewDecision(decision) {
  return {
    id: decision.id,
    reviewItemId: decision.reviewItemId,
    decision: String(decision.decision || "").toLowerCase(),
    finalVideoId: decision.finalVideoId,
    finalVideoSha256: decision.finalVideoSha256,
    finalVideoVersion: Number(decision.finalVideoVersion),
    reason: decision.reason,
    decidedByUserId: decision.decidedByUserId,
    createdAt: toIso(decision.createdAt)
  };
}

// V0-R2 approval reference public mapper. The approval token binds the approved review item to one
// exact final-video version so downstream scheduling can present it as proof of approval. The
// token is a stable public reference (deterministic over the exact version), never a secret.
function publicApprovalReference(decision) {
  return {
    token: decision.approvalToken,
    reviewItemId: decision.reviewItemId,
    finalVideoId: decision.finalVideoId,
    finalVideoSha256: decision.finalVideoSha256,
    finalVideoVersion: Number(decision.finalVideoVersion),
    decidedByUserId: decision.decidedByUserId,
    decidedAt: toIso(decision.createdAt)
  };
}

// V0-U1 calendar post public mapper. The approval token is the bound R2 approval reference (a
// stable public reference, not a secret). The manual live URL is null until the later verification
// path supplies it. The export artifact object key is never surfaced (publicArtifact omits it).
function publicCalendarPost(post) {
  return {
    id: post.id,
    workspaceId: post.workspaceId,
    platform: post.platform,
    account: post.account,
    caption: post.caption,
    finalVideoId: post.finalVideoId,
    finalVideoSha256: post.finalVideoSha256,
    finalVideoVersion: Number(post.finalVideoVersion),
    approvalToken: post.approvalToken,
    scheduledAt: post.scheduledAt ? toIso(post.scheduledAt) : null,
    timezone: post.timezone,
    manualExport: post.manualExport,
    manualLiveUrl: post.manualLiveUrl,
    manualUrlProvidedAt: post.manualUrlProvidedAt ? toIso(post.manualUrlProvidedAt) : null,
    exportArtifactId: post.exportArtifactId,
    status: String(post.status || "").toLowerCase(),
    createdByUserId: post.createdByUserId,
    version: Number(post.version),
    createdAt: toIso(post.createdAt),
    updatedAt: toIso(post.updatedAt)
  };
}

// V0-U4 audience-facing verification public mapper. Verification status is lowercase per
// V0_STATUS_ENUMS.md. The match flags, visibility and bound evidence artifact id are the public
// truth; the raw observed account/media/caption/publish-time values and the internal last error
// code stay server-side (the evidence artifact sha256 already binds them). One verification per
// calendar post; a replay surfaces the same id.
function publicPostVerification(verification) {
  return {
    id: verification.id,
    calendarPostId: verification.calendarPostId,
    provider: verification.provider,
    status: String(verification.status || "").toLowerCase(),
    attempts: Number(verification.attempts),
    accountMatched: verification.accountMatched,
    mediaSha256Matched: verification.mediaSha256Matched,
    captionMatched: verification.captionMatched,
    visibility: verification.visibility,
    evidenceArtifactId: verification.evidenceArtifactId,
    verifiedAt: verification.verifiedAt ? toIso(verification.verifiedAt) : null,
    createdAt: toIso(verification.createdAt),
    updatedAt: toIso(verification.updatedAt)
  };
}

// V0-A1 performance snapshot public mapper. The initial snapshot anchors the observation window at
// verification time with an empty metrics object; later performance_collect snapshots carry
// observed (simulated, never predictive) platform counts and an explicit observation label. The
// internal source hash is retained server-side; the public surface carries the window bounds,
// source, observation label and observed metrics. No raw provider payload, account id, signed URL
// or secret is surfaced. Metrics are observations of past platform state, never a forecast.
function publicPerformanceSnapshot(snapshot) {
  // The observation label is derived from the source so the public contract is identical across
  // the in-memory and Prisma stores without an extra column: a collected simulator snapshot is
  // explicitly "simulated"; the initial verification snapshot carries no observation label.
  const observation = snapshot.source === "performance_collect_simulator" ? "simulated" : null;
  return {
    id: snapshot.id,
    calendarPostId: snapshot.calendarPostId,
    platform: snapshot.platform,
    source: snapshot.source,
    observation,
    observationWindowStart: toIso(snapshot.observationWindowStart),
    observationWindowEnd: toIso(snapshot.observationWindowEnd),
    metrics: snapshot.metrics ?? {},
    createdAt: toIso(snapshot.createdAt)
  };
}

// V0-U1 schedule conflict window. Two scheduled posts for the same workspace + platform + account
// whose scheduledAt instants fall within this window are treated as one conflict and rejected. The
// canonical contract does not name a value; 60 seconds is a conservative, clearly-documented
// convention flagged in the U1 evidence scope note for owner confirmation.
const SCHEDULE_CONFLICT_WINDOW_MS = 60_000;

// V0-U1 scheduledAt parser. Accepts an ISO-8601 calendar time with an explicit UTC offset (Z or
// ±hh:mm) and returns the absolute Date instant, or null when the value is missing, malformed or
// carries no offset. A date-only or offset-less value is rejected so the stored instant is never
// silently interpreted as UTC.
function parseScheduledAt(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
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

// V0-A2 owner-pinned operational alert thresholds (owner-decision on an unpinned
// contract dimension, flagged for confirmation in the A2 evidence). The queue-age
// SLO reuses the backlog simulator's SLO so alerting and the load-shape model agree.
const OPERATIONAL_ALERT_THRESHOLDS = {
  queueAgeSloMs: QUEUE_AGE_SLO_MS,
  deadLetterCount: 1,
  leaseExpiryCount: 3,
  retryCount: 5
};

// Derive deterministic alert states from operational metrics. Critical alerts
// surface user-impacting failures (SLO breach, dead letters); warning alerts
// surface recovery pressure (lease expiry spikes, retry storms). Read only.
function operationalAlerts(metrics) {
  const active = [];
  if (metrics.oldestQueueAgeMs > OPERATIONAL_ALERT_THRESHOLDS.queueAgeSloMs) {
    active.push({
      code: "queue_age_slo_breach",
      severity: "critical",
      metric: "oldestQueueAgeMs",
      observed: metrics.oldestQueueAgeMs,
      threshold: OPERATIONAL_ALERT_THRESHOLDS.queueAgeSloMs
    });
  }
  if (metrics.deadLetterCount >= OPERATIONAL_ALERT_THRESHOLDS.deadLetterCount) {
    active.push({
      code: "dead_letter_present",
      severity: "critical",
      metric: "deadLetterCount",
      observed: metrics.deadLetterCount,
      threshold: OPERATIONAL_ALERT_THRESHOLDS.deadLetterCount
    });
  }
  if (metrics.leaseExpiryCount >= OPERATIONAL_ALERT_THRESHOLDS.leaseExpiryCount) {
    active.push({
      code: "lease_expiry_spike",
      severity: "warning",
      metric: "leaseExpiryCount",
      observed: metrics.leaseExpiryCount,
      threshold: OPERATIONAL_ALERT_THRESHOLDS.leaseExpiryCount
    });
  }
  if (metrics.retryCount >= OPERATIONAL_ALERT_THRESHOLDS.retryCount) {
    active.push({
      code: "retry_storm",
      severity: "warning",
      metric: "retryCount",
      observed: metrics.retryCount,
      threshold: OPERATIONAL_ALERT_THRESHOLDS.retryCount
    });
  }
  return active;
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
    lastRotatedAt: credential.lastRotatedAt ? toIso(credential.lastRotatedAt) : null,
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
