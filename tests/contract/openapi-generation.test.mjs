import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("generated OpenAPI exposes F0 health, readiness and version operations", async () => {
  const openapi = JSON.parse(await readFile("packages/contracts/generated/openapi.v0.json", "utf8"));

  assert.equal(openapi.openapi, "3.1.0");
  assert.equal(openapi.info.title, "Sakhaa Forge V0 API");
  assert.ok(openapi.paths["/health"].get);
  assert.ok(openapi.paths["/ready"].get);
  assert.ok(openapi.paths["/version"].get);
  assert.ok(openapi.paths["/workspaces"].post);
  assert.equal(
    openapi.paths["/workspaces"].post.parameters.some((parameter) => parameter.name === "Idempotency-Key"),
    true
  );
  assert.ok(openapi.paths["/workspaces"].get);
  assert.ok(openapi.paths["/workspaces/{workspace_id}"].get);
  assert.ok(openapi.paths["/workspaces/{workspace_id}/capabilities"].post);
  assert.ok(openapi.paths["/brands/assets/uploads"].post);
  assert.ok(openapi.paths["/brands/assets/uploads/{artifact_id}/complete"].post);
  assert.ok(openapi.paths["/artifacts/{artifact_id}/downloads"].post);
  assert.ok(openapi.paths["/jobs/simulated-media-processing"].post);
  assert.ok(openapi.paths["/jobs/dead-letter"].post);
  assert.ok(openapi.paths["/jobs/{job_id}"].get);
  assert.ok(openapi.paths["/jobs/{job_id}/events"].get);
  assert.ok(openapi.paths["/jobs/{job_id}/trace"].get);
  assert.ok(openapi.paths["/jobs/{job_id}/recover"].post);
  assert.ok(openapi.paths["/workspaces/{workspace_id}/operations/metrics"].get);
  assert.ok(openapi.paths["/workspaces/{workspace_id}/service-credentials"].post);
  assert.ok(openapi.paths["/workspaces/{workspace_id}/simulator-mode"].post);
  assert.ok(openapi.paths["/workspaces/{workspace_id}/restore-drills"].post);
  assert.ok(openapi.paths["/workspaces/{workspace_id}/redaction-scan"].post);
  assert.ok(openapi.paths["/brands/crawl-runs"].post);
  assert.ok(openapi.paths["/brands/crawl-runs/{crawl_run_id}/candidates"].get);
  assert.ok(openapi.paths["/brands/{brand_id}/approvals"].post);
  assert.ok(openapi.paths["/generation-estimates"].post);
  assert.ok(openapi.paths["/blueprints"].get);
  assert.ok(openapi.paths["/blueprints/library-entries"].post);
  assert.ok(openapi.paths["/blueprint-requests"].post);
  assert.ok(openapi.paths["/blueprint-requests/{blueprint_request_id}/ready-blueprint"].post);
  assert.ok(openapi.paths["/viral-candidates/search"].post);
  assert.ok(openapi.paths["/viral-candidates/{candidate_id}/extract-blueprint"].post);
  assert.ok(openapi.paths["/viral-candidates/{candidate_id}/scene-blueprint"].post);
  assert.ok(openapi.paths["/internal/outbox/relay"].post);
  assert.ok(openapi.paths["/internal/jobs/leases/expire"].post);
  assert.ok(openapi.paths["/internal/jobs/{job_id}/claim"].post);
  assert.ok(openapi.paths["/internal/jobs/{job_id}/heartbeat"].post);
  assert.ok(openapi.paths["/internal/jobs/{job_id}/complete"].post);
  assert.ok(openapi.paths["/internal/jobs/{job_id}/fail"].post);
});

test("generated client has V0 public and internal worker methods through P5", async () => {
  const client = await readFile("packages/contracts/generated/v0-client.mjs", "utf8");

  assert.match(client, /getHealth/);
  assert.match(client, /getReadiness/);
  assert.match(client, /getVersion/);
  assert.match(client, /createWorkspace/);
  assert.match(client, /idempotencyKey/);
  assert.match(client, /listWorkspaces/);
  assert.match(client, /getWorkspace/);
  assert.match(client, /setWorkspaceCapability/);
  assert.match(client, /initiateBrandAssetUpload/);
  assert.match(client, /completeBrandAssetUpload/);
  assert.match(client, /createArtifactDownload/);
  assert.match(client, /startSimulatedMediaProcessing/);
  assert.match(client, /listDeadLetterJobs/);
  assert.match(client, /getJob/);
  assert.match(client, /listJobEvents/);
  assert.match(client, /getJobTrace/);
  assert.match(client, /recoverJob/);
  assert.match(client, /getWorkspaceOperationalMetrics/);
  assert.match(client, /createServiceCredential/);
  assert.match(client, /setSimulatorMode/);
  assert.match(client, /recordRestoreDrill/);
  assert.match(client, /runRedactionScan/);
  assert.match(client, /createBrandCrawlRun/);
  assert.match(client, /listBrandCandidates/);
  assert.match(client, /approveBrandProfile/);
  assert.match(client, /createGenerationEstimate/);
  assert.match(client, /listBlueprints/);
  assert.match(client, /seedBlueprintLibraryEntry/);
  assert.match(client, /createBlueprintRequest/);
  assert.match(client, /createReadyBlueprint/);
  assert.match(client, /searchViralCandidates/);
  assert.match(client, /extractViralCandidateBlueprint/);
  assert.match(client, /createSceneBlueprint/);
  assert.match(client, /relayOutbox/);
  assert.match(client, /expireJobLeases/);
  assert.match(client, /claimJob/);
  assert.match(client, /heartbeatJob/);
  assert.match(client, /completeJob/);
  assert.match(client, /failJob/);
  assert.match(client, /x-v0-worker-token/);
  assert.match(client, /authorization/);
  assert.match(client, /GENERATED from packages\/contracts\/src\/openapi\.v0\.json/);
});
