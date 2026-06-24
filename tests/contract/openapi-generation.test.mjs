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
  assert.ok(openapi.paths["/brands/assets/uploads"].post);
  assert.ok(openapi.paths["/brands/assets/uploads/{artifact_id}/complete"].post);
  assert.ok(openapi.paths["/artifacts/{artifact_id}/downloads"].post);
  assert.ok(openapi.paths["/jobs/simulated-media-processing"].post);
  assert.ok(openapi.paths["/jobs/dead-letter"].post);
  assert.ok(openapi.paths["/jobs/{job_id}"].get);
  assert.ok(openapi.paths["/jobs/{job_id}/events"].get);
  assert.ok(openapi.paths["/internal/outbox/relay"].post);
  assert.ok(openapi.paths["/internal/jobs/leases/expire"].post);
  assert.ok(openapi.paths["/internal/jobs/{job_id}/claim"].post);
  assert.ok(openapi.paths["/internal/jobs/{job_id}/heartbeat"].post);
  assert.ok(openapi.paths["/internal/jobs/{job_id}/complete"].post);
  assert.ok(openapi.paths["/internal/jobs/{job_id}/fail"].post);
});

test("generated client has F0-F4 public and internal worker methods", async () => {
  const client = await readFile("packages/contracts/generated/v0-client.mjs", "utf8");

  assert.match(client, /getHealth/);
  assert.match(client, /getReadiness/);
  assert.match(client, /getVersion/);
  assert.match(client, /createWorkspace/);
  assert.match(client, /idempotencyKey/);
  assert.match(client, /listWorkspaces/);
  assert.match(client, /getWorkspace/);
  assert.match(client, /initiateBrandAssetUpload/);
  assert.match(client, /completeBrandAssetUpload/);
  assert.match(client, /createArtifactDownload/);
  assert.match(client, /startSimulatedMediaProcessing/);
  assert.match(client, /listDeadLetterJobs/);
  assert.match(client, /getJob/);
  assert.match(client, /listJobEvents/);
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
