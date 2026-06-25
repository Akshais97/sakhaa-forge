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
const f6Migration = await readFile(
  "packages/db/prisma/migrations/0006_v0_f5_workspace_capabilities/migration.sql",
  "utf8"
);
const f7Migration = await readFile(
  "packages/db/prisma/migrations/0007_v0_f5_service_credentials/migration.sql",
  "utf8"
);
const b1Migration = await readFile(
  "packages/db/prisma/migrations/0008_v0_b1_safe_brand_intake/migration.sql",
  "utf8"
);
const b2Migration = await readFile(
  "packages/db/prisma/migrations/0009_v0_b2_brand_candidate_extraction/migration.sql",
  "utf8"
);
const b3Migration = await readFile(
  "packages/db/prisma/migrations/0010_v0_b3_brand_memory/migration.sql",
  "utf8"
);
const p1Migration = await readFile(
  "packages/db/prisma/migrations/0011_v0_p1_blueprint_path_selection/migration.sql",
  "utf8"
);
const p2Migration = await readFile(
  "packages/db/prisma/migrations/0012_v0_p2_viral_candidate_metrics/migration.sql",
  "utf8"
);
const p3Migration = await readFile(
  "packages/db/prisma/migrations/0013_v0_p3_media_acquisition_thumbnail_blueprint/migration.sql",
  "utf8"
);
const p4Migration = await readFile(
  "packages/db/prisma/migrations/0014_v0_p4_scene_blueprints/migration.sql",
  "utf8"
);
const p5Migration = await readFile(
  "packages/db/prisma/migrations/0015_v0_p5_ready_blueprint_formula_prompt/migration.sql",
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
  "model OutboxEvent",
  "model WorkspaceCapability",
  "model ServiceCredential",
  "model BrandCrawlRun",
  "model BrandAsset",
  "model BrandCandidate",
  "model BrandProfile",
  "model BrandApproval",
  "model BrandRule",
  "model GenerationEstimate",
  "model BlueprintLibraryEntry",
  "model BlueprintRequest",
  "model ViralCandidate",
  "model MetricSnapshot",
  "model MediaAcquisition",
  "model ThumbnailBlueprint",
  "model VideoBlueprint",
  "model BlueprintScene",
  "model FormulaDerivation",
  "model DirectorPrompt"
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
  "CREATE TABLE workspace_capabilities",
  "ALTER TABLE workspace_capabilities ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY workspace_capabilities_workspace_isolation",
  "CREATE INDEX workspace_capabilities_workspace_enabled_idx"
]) {
  if (!f6Migration.includes(required)) {
    throw new Error(`Missing required F5 workspace capability migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE service_credentials",
  "secret_ref VARCHAR(300) NOT NULL",
  "ALTER TABLE service_credentials ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY service_credentials_workspace_isolation"
]) {
  if (!f7Migration.includes(required)) {
    throw new Error(`Missing required F5 service credential migration statement: ${required}`);
  }
}

if (/secret_value|api_key|plaintext/i.test(`${schema}\n${f7Migration}`)) {
  throw new Error("Service credential schema must not store plaintext secret values.");
}

for (const required of [
  "normalizedUrl",
  "rightsAcknowledged",
  "rightsBasis",
  "permittedUse"
]) {
  if (!schema.includes(required)) {
    throw new Error(`Missing required B1 brand intake schema contract: ${required}`);
  }
}

for (const required of [
  "CREATE TABLE brand_crawl_runs",
  "CREATE TABLE brand_assets",
  "rights_acknowledged BOOLEAN NOT NULL",
  "rights_basis VARCHAR(240) NOT NULL",
  "ALTER TABLE brand_crawl_runs ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY brand_crawl_runs_workspace_isolation",
  "CREATE POLICY brand_assets_workspace_isolation"
]) {
  if (!b1Migration.includes(required)) {
    throw new Error(`Missing required B1 brand intake migration statement: ${required}`);
  }
}

for (const required of [
  "fieldType",
  "confidence",
  "sourceEvidence",
  "extractionState",
  "sourceFingerprint"
]) {
  if (!schema.includes(required)) {
    throw new Error(`Missing required B2 brand candidate schema contract: ${required}`);
  }
}

for (const required of [
  "CREATE TABLE brand_candidates",
  "source_evidence JSONB NOT NULL",
  "confidence DECIMAL(4, 3) NOT NULL",
  "ALTER TABLE brand_candidates ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY brand_candidates_workspace_isolation"
]) {
  if (!b2Migration.includes(required)) {
    throw new Error(`Missing required B2 brand candidate migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE brand_profiles",
  "CREATE TABLE brand_approvals",
  "CREATE TABLE brand_rules",
  "CREATE TABLE generation_estimates",
  "CREATE UNIQUE INDEX brand_profiles_one_active_approved",
  "ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE brand_approvals ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE brand_rules ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE generation_estimates ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY brand_profiles_workspace_isolation",
  "CREATE POLICY brand_approvals_workspace_isolation",
  "CREATE POLICY brand_rules_workspace_isolation",
  "CREATE POLICY generation_estimates_workspace_isolation"
]) {
  if (!b3Migration.includes(required)) {
    throw new Error(`Missing required B3 brand memory migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE blueprint_library_entries",
  "CREATE TABLE blueprint_requests",
  "ALTER TABLE blueprint_library_entries ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE blueprint_requests ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY blueprint_library_entries_workspace_isolation",
  "CREATE POLICY blueprint_requests_workspace_isolation",
  "blueprint_requests_existing_entry_check"
]) {
  if (!p1Migration.includes(required)) {
    throw new Error(`Missing required P1 blueprint path migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE viral_candidates",
  "CREATE TABLE metric_snapshots",
  "ALTER TABLE viral_candidates ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE metric_snapshots ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY viral_candidates_workspace_isolation",
  "CREATE POLICY metric_snapshots_workspace_isolation",
  "metric_snapshots_immutable_check"
]) {
  if (!p2Migration.includes(required)) {
    throw new Error(`Missing required P2 viral candidate migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE media_acquisitions",
  "CREATE TABLE thumbnail_blueprints",
  "ALTER TABLE media_acquisitions ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE thumbnail_blueprints ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY media_acquisitions_workspace_isolation",
  "CREATE POLICY thumbnail_blueprints_workspace_isolation",
  "media_acquisitions_blocked_artifact_check"
]) {
  if (!p3Migration.includes(required)) {
    throw new Error(`Missing required P3 media acquisition migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE video_blueprints",
  "CREATE TABLE blueprint_scenes",
  "ALTER TABLE video_blueprints ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE blueprint_scenes ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY video_blueprints_workspace_isolation",
  "CREATE POLICY blueprint_scenes_workspace_isolation",
  "video_blueprints_status_check",
  "blueprint_scenes_time_check"
]) {
  if (!p4Migration.includes(required)) {
    throw new Error(`Missing required P4 scene blueprint migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE IF NOT EXISTS formula_derivations",
  "CREATE TABLE IF NOT EXISTS director_prompts",
  "ALTER TABLE formula_derivations ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE director_prompts ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY formula_derivations_workspace_isolation",
  "CREATE POLICY director_prompts_workspace_isolation",
  "formula_derivations_status_check",
  "director_prompts_status_check"
]) {
  if (!p5Migration.includes(required)) {
    throw new Error(`Missing required P5 ready blueprint migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}`)) {
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

console.log("Database contract valid for V0-F5/B1/B2/B3/P1/P2/P3/P4/P5 identity, idempotency, artifacts, jobs, outbox, capability controls, service credentials, brand intake, brand candidates, brand memory, blueprint path selection, viral candidate metrics, media acquisition, thumbnail blueprints, scene blueprints, formula derivations, director prompts and RLS.");
