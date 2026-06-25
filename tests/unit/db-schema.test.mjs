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

test("F5 Prisma schema and migration define workspace capability controls with RLS", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0006_v0_f5_workspace_capabilities/migration.sql",
    "utf8"
  );

  assert.match(schema, /model WorkspaceCapability \{/);
  assert.match(schema, /capability\s+String\s+@db\.VarChar\(120\)/);
  assert.match(schema, /enabled\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /disabledReason\s+String\?\s+@map\("disabled_reason"\) @db\.VarChar\(500\)/);
  assert.match(schema, /@@unique\(\[workspaceId, capability\]\)/);
  assert.match(migration, /CREATE TABLE workspace_capabilities/);
  assert.match(migration, /ALTER TABLE workspace_capabilities ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY workspace_capabilities_workspace_isolation/);
  assert.match(migration, /CREATE INDEX workspace_capabilities_workspace_enabled_idx/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("F5 Prisma schema and migration define service credential metadata without secret values", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0007_v0_f5_service_credentials/migration.sql",
    "utf8"
  );

  assert.match(schema, /model ServiceCredential \{/);
  assert.match(schema, /secretRef\s+String\s+@map\("secret_ref"\) @db\.VarChar\(300\)/);
  assert.match(schema, /rotationStatus\s+String\s+@map\("rotation_status"\) @db\.VarChar\(80\)/);
  assert.doesNotMatch(schema, /secretValue|apiKey|plaintext/i);
  assert.match(migration, /CREATE TABLE service_credentials/);
  assert.match(migration, /secret_ref VARCHAR\(300\) NOT NULL/);
  assert.doesNotMatch(migration, /secret_value|api_key|plaintext/i);
  assert.match(migration, /ALTER TABLE service_credentials ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY service_credentials_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("B1 Prisma schema and migration define brand crawl runs and brand asset rights with RLS", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0008_v0_b1_safe_brand_intake/migration.sql",
    "utf8"
  );

  assert.match(schema, /model BrandCrawlRun \{/);
  assert.match(schema, /model BrandAsset \{/);
  assert.match(schema, /normalizedUrl\s+String\s+@map\("normalized_url"\) @db\.VarChar\(500\)/);
  assert.match(schema, /rightsAcknowledged\s+Boolean\s+@map\("rights_acknowledged"\)/);
  assert.match(schema, /rightsBasis\s+String\s+@map\("rights_basis"\) @db\.VarChar\(240\)/);
  assert.match(migration, /CREATE TABLE brand_crawl_runs/);
  assert.match(migration, /CREATE TABLE brand_assets/);
  assert.match(migration, /ALTER TABLE brand_crawl_runs ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY brand_crawl_runs_workspace_isolation/);
  assert.match(migration, /CREATE POLICY brand_assets_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("B2 Prisma schema and migration define evidence-backed brand candidates with RLS", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0009_v0_b2_brand_candidate_extraction/migration.sql",
    "utf8"
  );

  assert.match(schema, /model BrandCandidate \{/);
  assert.match(schema, /fieldType\s+String\s+@map\("field_type"\) @db\.VarChar\(120\)/);
  assert.match(schema, /confidence\s+Decimal\s+@db\.Decimal\(4, 3\)/);
  assert.match(schema, /sourceEvidence\s+Json\s+@map\("source_evidence"\)/);
  assert.match(schema, /extractionState\s+String\s+@map\("extraction_state"\) @db\.VarChar\(80\)/);
  assert.match(migration, /CREATE TABLE brand_candidates/);
  assert.match(migration, /source_evidence JSONB NOT NULL/);
  assert.match(migration, /ALTER TABLE brand_candidates ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY brand_candidates_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("B3 Prisma schema and migration define versioned brand memory with active profile constraint", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0010_v0_b3_brand_memory/migration.sql",
    "utf8"
  );

  assert.match(schema, /model BrandProfile \{/);
  assert.match(schema, /model BrandApproval \{/);
  assert.match(schema, /model BrandRule \{/);
  assert.match(schema, /model GenerationEstimate \{/);
  assert.match(schema, /@@unique\(\[workspaceId, brandId, version\]\)/);
  assert.match(migration, /CREATE TABLE brand_profiles/);
  assert.match(migration, /CREATE TABLE brand_approvals/);
  assert.match(migration, /CREATE TABLE brand_rules/);
  assert.match(migration, /CREATE TABLE generation_estimates/);
  assert.match(migration, /CREATE UNIQUE INDEX brand_profiles_one_active_approved/);
  assert.match(migration, /ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY brand_profiles_workspace_isolation/);
  assert.match(migration, /CREATE POLICY brand_approvals_workspace_isolation/);
  assert.match(migration, /CREATE POLICY brand_rules_workspace_isolation/);
  assert.match(migration, /CREATE POLICY generation_estimates_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("P1 Prisma schema and migration define blueprint library entries and requests with RLS", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0011_v0_p1_blueprint_path_selection/migration.sql",
    "utf8"
  );

  assert.match(schema, /model BlueprintLibraryEntry \{/);
  assert.match(schema, /model BlueprintRequest \{/);
  assert.match(schema, /compatibility\s+Json/);
  assert.match(schema, /brandProfileVersion\s+Int\s+@map\("brand_profile_version"\)/);
  assert.match(migration, /CREATE TABLE blueprint_library_entries/);
  assert.match(migration, /CREATE TABLE blueprint_requests/);
  assert.match(migration, /blueprint_requests_existing_entry_check/);
  assert.match(migration, /ALTER TABLE blueprint_library_entries ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE blueprint_requests ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY blueprint_library_entries_workspace_isolation/);
  assert.match(migration, /CREATE POLICY blueprint_requests_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("P2 Prisma schema and migration define viral candidates and immutable metric snapshots with RLS", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0012_v0_p2_viral_candidate_metrics/migration.sql",
    "utf8"
  );

  assert.match(schema, /model ViralCandidate \{/);
  assert.match(schema, /model MetricSnapshot \{/);
  assert.match(schema, /sourceHash\s+String\s+@map\("source_hash"\) @db\.Char\(64\)/);
  assert.match(schema, /immutable\s+Boolean\s+@default\(true\)/);
  assert.match(migration, /CREATE TABLE viral_candidates/);
  assert.match(migration, /CREATE TABLE metric_snapshots/);
  assert.match(migration, /metric_snapshots_immutable_check/);
  assert.match(migration, /ALTER TABLE viral_candidates ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE metric_snapshots ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY viral_candidates_workspace_isolation/);
  assert.match(migration, /CREATE POLICY metric_snapshots_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("P3 Prisma schema and migration define media acquisitions and thumbnail blueprints with RLS", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0013_v0_p3_media_acquisition_thumbnail_blueprint/migration.sql",
    "utf8"
  );

  assert.match(schema, /model MediaAcquisition \{/);
  assert.match(schema, /model ThumbnailBlueprint \{/);
  assert.match(schema, /rightsDecision\s+Json\s+@map\("rights_decision"\)/);
  assert.match(schema, /directorGuidance\s+Json\s+@map\("director_guidance"\)/);
  assert.match(migration, /CREATE TABLE media_acquisitions/);
  assert.match(migration, /CREATE TABLE thumbnail_blueprints/);
  assert.match(migration, /media_acquisitions_blocked_artifact_check/);
  assert.match(migration, /ALTER TABLE media_acquisitions ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE thumbnail_blueprints ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY media_acquisitions_workspace_isolation/);
  assert.match(migration, /CREATE POLICY thumbnail_blueprints_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("P4 Prisma schema and migration define video blueprints and scenes with RLS", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0014_v0_p4_scene_blueprints/migration.sql",
    "utf8"
  );

  assert.match(schema, /model VideoBlueprint \{/);
  assert.match(schema, /model BlueprintScene \{/);
  assert.match(schema, /stageStates\s+Json\s+@map\("stage_states"\)/);
  assert.match(schema, /stageArtifactIds\s+Json\s+@map\("stage_artifact_ids"\)/);
  assert.match(schema, /formulaSlot\s+String\s+@map\("formula_slot"\) @db\.VarChar\(80\)/);
  assert.match(migration, /CREATE TABLE video_blueprints/);
  assert.match(migration, /CREATE TABLE blueprint_scenes/);
  assert.match(migration, /video_blueprints_status_check/);
  assert.match(migration, /blueprint_scenes_time_check/);
  assert.match(migration, /ALTER TABLE video_blueprints ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE blueprint_scenes ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY video_blueprints_workspace_isolation/);
  assert.match(migration, /CREATE POLICY blueprint_scenes_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});

test("P5 Prisma schema and migration define formula derivations and director prompts with RLS", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
  const migration = await readFile(
    "packages/db/prisma/migrations/0015_v0_p5_ready_blueprint_formula_prompt/migration.sql",
    "utf8"
  );

  assert.match(schema, /model FormulaDerivation \{/);
  assert.match(schema, /@@map\("formula_derivations"\)/);
  assert.match(schema, /model DirectorPrompt \{/);
  assert.match(schema, /@@map\("director_prompts"\)/);
  assert.match(schema, /replacementInstructions Json\s+@map\("replacement_instructions"\)/);
  assert.match(schema, /promptVersion\s+String\s+@map\("prompt_version"\) @db\.VarChar\(80\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS formula_derivations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS director_prompts/);
  assert.match(migration, /formula_derivations_status_check/);
  assert.match(migration, /director_prompts_status_check/);
  assert.match(migration, /ALTER TABLE formula_derivations ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE director_prompts ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY formula_derivations_workspace_isolation/);
  assert.match(migration, /CREATE POLICY director_prompts_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});
