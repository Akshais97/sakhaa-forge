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
});

test("generated client has the F0 public methods", async () => {
  const client = await readFile("packages/contracts/generated/v0-client.mjs", "utf8");

  assert.match(client, /getHealth/);
  assert.match(client, /getReadiness/);
  assert.match(client, /getVersion/);
  assert.match(client, /GENERATED from packages\/contracts\/src\/openapi\.v0\.json/);
});
