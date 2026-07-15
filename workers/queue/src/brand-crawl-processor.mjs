import { V0Client } from "../../../packages/contracts/generated/v0-client.mjs";
import { runFirecrawlBrandExtraction, validateFirecrawlConfiguration } from "../../../apps/api/src/firecrawl-provider.mjs";
import { retainCrawlAssets } from "./brand-asset-acquisition.mjs";
import { createObjectStorage } from "../../../packages/config/src/storage.mjs";

export async function processBrandCrawlJob(jobId, {
  apiBaseUrl = process.env.API_BASE_URL || "http://localhost:3001/api/v0",
  workerToken = process.env.WORKER_AUTH_TOKEN,
  env = process.env,
  apiFetchImpl = globalThis.fetch,
  providerFetchImpl = globalThis.fetch,
  assetFetchImpl = globalThis.fetch,
  storageRoot = env.LOCAL_STORAGE_ROOT || ".local/storage",
  objectStorage = createObjectStorage(env)
} = {}) {
  if (typeof jobId !== "string" || !jobId.trim() || typeof workerToken !== "string" || !workerToken.trim()) {
    return { ok: false, problem: { code: "DEPENDENCY_UNAVAILABLE", status: 503, detail: "The brand crawl worker is not configured." } };
  }
  const configuration = validateFirecrawlConfiguration(env);
  if (!configuration.ok || configuration.mode !== "firecrawl") return configuration.ok
    ? { ok: false, problem: { code: "DEPENDENCY_UNAVAILABLE", status: 503, detail: "Firecrawl provider is disabled." } }
    : configuration;
  const client = new V0Client({ baseUrl: apiBaseUrl, fetchImpl: apiFetchImpl, internalWorkerToken: workerToken });
  const claimed = await client.claimJob(jobId, { resourceClass: "CPU" });
  if (claimed.status >= 400 || !claimed.body?.attempt?.leaseToken || !claimed.body?.input) {
    return { ok: false, problem: claimed.body };
  }
  const { input, attempt } = claimed.body;
  await client.heartbeatJob(jobId, { leaseToken: attempt.leaseToken });
  const providerResult = await runFirecrawlBrandExtraction(
    {
      id: input.brandCrawlRunId,
      normalizedUrl: input.normalizedUrl,
      crawlScope: input.crawlScope,
      selectedBrandType: input.selectedBrandType
    },
    { env, fetchImpl: providerFetchImpl }
  );
  if (!providerResult.ok) {
    await client.failJob(jobId, {
      leaseToken: attempt.leaseToken,
      errorCode: providerResult.problem?.code ?? "DEPENDENCY_UNAVAILABLE",
      retryable: providerResult.problem?.retryable === true
    });
    return providerResult;
  }
  const acquisition = await retainCrawlAssets(providerResult.output.assets, {
    workspaceId: claimed.body.job.workspaceId,
    crawlRunId: input.brandCrawlRunId,
    objectStorage,
    storageRoot,
    fetchImpl: assetFetchImpl
  });
  const completed = await client.completeJob(jobId, {
    leaseToken: attempt.leaseToken,
    workspaceId: claimed.body.job.workspaceId,
    ...providerResult.output,
    retainedAssets: acquisition.retainedAssets,
    assetWarnings: acquisition.skippedAssets
  });
  if (completed.status >= 400) {
    return { ok: false, problem: completed.body };
  }
  return { ok: true, output: providerResult.output, acquisition, completion: completed.body };
}

export async function processQueueWakeUp(wakeUp, options = {}) {
  const jobId = typeof wakeUp === "string" ? wakeUp : wakeUp?.id ?? wakeUp?.jobId;
  return processBrandCrawlJob(jobId, options);
}
