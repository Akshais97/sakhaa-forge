import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("db migrate script loads API env and applies all retained migrations in order", async () => {
  const script = await readFile("packages/db/scripts/db-migrate-dev.mjs", "utf8");

  assert.match(script, /loadEnvFile\("apps\/api\/\.env"\)/);
  assert.match(script, /DIRECT_DATABASE_URL/);
  assert.match(script, /DATABASE_URL/);

  const f1 = script.indexOf("0001_v0_f1_identity_rls");
  const f2 = script.indexOf("0002_v0_f2_idempotency_records");
  const f3 = script.indexOf("0003_v0_f3_artifacts_inbox_events");
  const f4 = script.indexOf("0004_v0_f4_jobs_outbox");
  const f5 = script.indexOf("0005_v0_f4_job_dead_letter_error_code");
  const p4 = script.indexOf("0014_v0_p4_scene_blueprints");
  const p5 = script.indexOf("0015_v0_p5_ready_blueprint_formula_prompt");

  assert.notEqual(f1, -1);
  assert.notEqual(f2, -1);
  assert.notEqual(f3, -1);
  assert.notEqual(f4, -1);
  assert.notEqual(f5, -1);
  assert.notEqual(p4, -1);
  assert.notEqual(p5, -1);
  assert.ok(f1 < f2);
  assert.ok(f2 < f3);
  assert.ok(f3 < f4);
  assert.ok(f4 < f5);
  assert.ok(p4 < p5);
});

test("db migrate script checks psql before passing secret database URLs", async () => {
  const script = await readFile("packages/db/scripts/db-migrate-dev.mjs", "utf8");

  assert.match(script, /resolvePsqlCommand/);
  assert.match(script, /PSQL_PATH/);
  assert.match(script, /PostgreSQL\/17\/bin\/psql\.exe/);
  const resolver = script.slice(script.indexOf("function resolvePsqlCommand"));
  assert.ok(resolver.indexOf("C:/Program Files/PostgreSQL/17/bin/psql.exe") < resolver.indexOf('"psql"'));

  const preflightIndex = script.indexOf('spawnSync(psqlCommand, ["--version"]');
  const migrateIndex = script.indexOf('spawnSync("psql", [databaseUrl');

  assert.notEqual(preflightIndex, -1);
  assert.equal(migrateIndex, -1);
});

test("db migrate script skips migrations whose sentinel table already exists", async () => {
  const script = await readFile("packages/db/scripts/db-migrate-dev.mjs", "utf8");

  assert.match(script, /to_regclass\('public\.users'\)/);
  assert.match(script, /to_regclass\('public\.jobs'\)/);
  assert.match(script, /to_regclass\('public\.formula_derivations'\)/);
  assert.match(script, /Skipping already applied migration/);
});
