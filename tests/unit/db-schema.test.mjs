import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("F1 Prisma schema defines identity models and consolidated membership enum", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");

  assert.match(schema, /enum MembershipRole \{\s*OWNER\s+ADMIN\s+CLIENT_MANAGER\s+REVIEWER\s+@@map\("membership_role"\)\s*\}/);
  assert.match(schema, /model User \{/);
  assert.match(schema, /model Workspace \{/);
  assert.match(schema, /model Membership \{/);
  assert.match(schema, /model AuditEvent \{/);
});

test("F1 RLS migration enables row level security and rejects bypass grants", async () => {
  const migration = await readFile(
    "packages/db/prisma/migrations/0001_v0_f1_identity_rls/migration.sql",
    "utf8"
  );

  assert.match(migration, /ALTER TABLE users ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY membership_select_own_workspace/);
  assert.match(migration, /CREATE POLICY workspace_insert_current_creation/);
  assert.match(migration, /CREATE POLICY membership_insert_creator_owner/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("F2 Prisma schema defines idempotency records with request-hash conflict keys", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");

  assert.match(schema, /model IdempotencyRecord \{/);
  assert.match(schema, /workspaceId\s+String\?\s+@map\("workspace_id"\) @db\.Uuid/);
  assert.match(schema, /operation\s+String\s+@db\.VarChar\(120\)/);
  assert.match(schema, /idempotencyKey\s+String\s+@map\("idempotency_key"\) @db\.VarChar\(200\)/);
  assert.match(schema, /requestHash\s+String\s+@map\("request_hash"\) @db\.Char\(64\)/);
  assert.match(schema, /responseStatus\s+Int\s+@map\("response_status"\)/);
  assert.match(schema, /responseBody\s+Json\s+@map\("response_body"\)/);
  assert.match(schema, /@@unique\(\[workspaceId, operation, idempotencyKey\]\)/);
});

test("F2 RLS migration protects idempotency records", async () => {
  const migration = await readFile(
    "packages/db/prisma/migrations/0002_v0_f2_idempotency_records/migration.sql",
    "utf8"
  );

  assert.match(migration, /CREATE TABLE idempotency_records/);
  assert.match(migration, /request_hash CHAR\(64\) NOT NULL/);
  assert.match(migration, /UNIQUE \(workspace_id, operation, idempotency_key\)/);
  assert.match(migration, /ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY idempotency_records_workspace_isolation/);
});

test("F4 Prisma schema and migration define durable jobs, attempts, dependencies, events and outbox RLS", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0004_v0_f4_jobs_outbox/migration.sql",
    "utf8"
  );
  const deadLetterMigration = await readFile(
    "packages/db/prisma/migrations/0005_v0_f4_job_dead_letter_error_code/migration.sql",
    "utf8"
  );

  for (const block of ["enum JobStatus", "model Job", "model JobAttempt", "model JobDependency", "model JobEvent", "model OutboxEvent"]) {
    assert.match(schema, new RegExp(block));
  }
  assert.match(schema, /resourceClass\s+String\s+@map\("resource_class"\) @db\.VarChar\(40\)/);
  assert.match(schema, /lastErrorCode\s+String\?\s+@map\("last_error_code"\) @db\.VarChar\(120\)/);
  assert.match(schema, /@@index\(\[workspaceId, status, nextRunAt\]\)/);
  assert.match(migration, /CREATE TYPE job_status/);
  assert.match(migration, /CREATE TABLE jobs/);
  assert.match(migration, /CREATE TABLE job_attempts/);
  assert.match(migration, /CREATE TABLE job_dependencies/);
  assert.match(migration, /CREATE TABLE job_events/);
  assert.match(migration, /CREATE TABLE outbox_events/);
  assert.match(migration, /CREATE UNIQUE INDEX job_attempts_one_active_lease/);
  assert.match(migration, /ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY jobs_workspace_isolation/);
  assert.match(deadLetterMigration, /ADD COLUMN last_error_code/);
  assert.match(deadLetterMigration, /CREATE INDEX jobs_workspace_failed_updated_idx/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});
