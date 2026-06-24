import { readFile } from "node:fs/promises";

const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
const f1Migration = await readFile(
  "packages/db/prisma/migrations/0001_v0_f1_identity_rls/migration.sql",
  "utf8"
);
const f2Migration = await readFile(
  "packages/db/prisma/migrations/0002_v0_f2_idempotency_records/migration.sql",
  "utf8"
);
const f3Migration = await readFile(
  "packages/db/prisma/migrations/0003_v0_f3_artifacts_inbox_events/migration.sql",
  "utf8"
);
const f4Migration = await readFile(
  "packages/db/prisma/migrations/0004_v0_f4_jobs_outbox/migration.sql",
  "utf8"
);
const f5Migration = await readFile(
  "packages/db/prisma/migrations/0005_v0_f4_job_dead_letter_error_code/migration.sql",
  "utf8"
);

if (!schema.includes("provider = \"postgresql\"")) {
  throw new Error("Prisma datasource must use PostgreSQL.");
}

for (const required of [
  "model User",
  "model Workspace",
  "model Membership",
  "model AuditEvent",
  "model IdempotencyRecord",
  "model Artifact",
  "model InboxEvent",
  "enum AssetTrustStatus",
  "enum JobStatus",
  "model Job",
  "model JobAttempt",
  "model JobDependency",
  "model JobEvent",
  "model OutboxEvent"
]) {
  if (!schema.includes(required)) {
    throw new Error(`Missing required schema block: ${required}`);
  }
}

for (const required of [
  "ALTER TABLE users ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;",
  "FORCE ROW LEVEL SECURITY",
  "membership_select_own_workspace"
]) {
  if (!f1Migration.includes(required)) {
    throw new Error(`Missing required F1 RLS migration statement: ${required}`);
  }
}

for (const required of [
  "CREATE TABLE idempotency_records",
  "request_hash CHAR(64) NOT NULL",
  "UNIQUE (workspace_id, operation, idempotency_key)",
  "UNIQUE (actor_user_id, operation, idempotency_key)",
  "ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY idempotency_records_workspace_isolation"
]) {
  if (!f2Migration.includes(required)) {
    throw new Error(`Missing required F2 idempotency migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TYPE asset_trust_status",
  "CREATE TABLE artifacts",
  "CREATE TABLE inbox_events",
  "ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE inbox_events ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY artifacts_workspace_isolation",
  "CREATE POLICY inbox_events_workspace_isolation"
]) {
  if (!f3Migration.includes(required)) {
    throw new Error(`Missing required F3 artifact migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TYPE job_status",
  "CREATE TABLE jobs",
  "CREATE TABLE job_attempts",
  "CREATE TABLE job_dependencies",
  "CREATE TABLE job_events",
  "CREATE TABLE outbox_events",
  "CREATE UNIQUE INDEX job_attempts_one_active_lease",
  "ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY jobs_workspace_isolation"
]) {
  if (!f4Migration.includes(required)) {
    throw new Error(`Missing required F4 job/outbox migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "ADD COLUMN last_error_code",
  "CREATE INDEX jobs_workspace_failed_updated_idx"
]) {
  if (!f5Migration.includes(required)) {
    throw new Error(`Missing required F4 dead-letter migration statement: ${required}`);
  }
}

console.log("Database contract valid for V0-F4 identity, idempotency, artifacts, jobs, outbox and RLS.");
