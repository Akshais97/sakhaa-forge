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
const s1Migration = await readFile(
  "packages/db/prisma/migrations/0016_v0_s1_script_tournament/migration.sql",
  "utf8"
);
const s2Migration = await readFile(
  "packages/db/prisma/migrations/0017_v0_s2_selected_script/migration.sql",
  "utf8"
);
const s2ApproverFkMigration = await readFile(
  "packages/db/prisma/migrations/0018_v0_s2_selected_script_approver_fk/migration.sql",
  "utf8"
);
const g1Migration = await readFile(
  "packages/db/prisma/migrations/0019_v0_g1_consent_safe_avatar_selection/migration.sql",
  "utf8"
);
const g2Migration = await readFile(
  "packages/db/prisma/migrations/0020_v0_g2_creator_wallet_verified_credit_purchase/migration.sql",
  "utf8"
);
const g3Migration = await readFile(
  "packages/db/prisma/migrations/0021_v0_g3_versioned_generation_estimate_and_atomic_reservation/migration.sql",
  "utf8"
);
const g4Migration = await readFile(
  "packages/db/prisma/migrations/0022_v0_g4_exactly_once_heygen_submission/migration.sql",
  "utf8"
);
const g5Migration = await readFile(
  "packages/db/prisma/migrations/0023_v0_g5_retained_generated_media_and_settled_credits/migration.sql",
  "utf8"
);
const c1Migration = await readFile(
  "packages/db/prisma/migrations/0024_v0_c1_validated_composition_intent_and_ae_plan/migration.sql",
  "utf8"
);
const c2Migration = await readFile(
  "packages/db/prisma/migrations/0025_v0_c2_reproducible_final_branded_render/migration.sql",
  "utf8"
);
const c2FixMigration = await readFile(
  "packages/db/prisma/migrations/0026_v0_c2_render_level_lineage_and_input_bound_idempotency/migration.sql",
  "utf8"
);
const r1Migration = await readFile(
  "packages/db/prisma/migrations/0027_v0_r1_exact_version_review_and_comments/migration.sql",
  "utf8"
);
const r2Migration = await readFile(
  "packages/db/prisma/migrations/0028_v0_r2_auditable_approval_bound_to_final_media/migration.sql",
  "utf8"
);
const u1Migration = await readFile(
  "packages/db/prisma/migrations/0029_v0_u1_approved_calendar_and_manual_export_fallback/migration.sql",
  "utf8"
);
const u2Migration = await readFile(
  "packages/db/prisma/migrations/0030_v0_u2_idempotent_meta_publication/migration.sql",
  "utf8"
);
const r2FixMigration = await readFile(
  "packages/db/prisma/migrations/0031_v0_r2_nullable_approval_token_only_on_approve/migration.sql",
  "utf8"
);
const u4Migration = await readFile(
  "packages/db/prisma/migrations/0032_v0_u4_audience_facing_verification_and_one_completion_notification/migration.sql",
  "utf8"
);
const brandingProfileMigration = await readFile(
  "packages/db/prisma/migrations/0033_v0_branding_profile_context_and_artifact_refs/migration.sql",
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
  "model UserProfile",
  "model BrandContext",
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
  "model DirectorPrompt",
  "model ScriptTournament",
  "model ScriptVariant",
  "model ScriptEvaluation",
  "model SelectedScript",
  "model AvatarProfile",
  "model AvatarConsent",
  "model CreditWallet",
  "model CreditPurchase",
  "model CreditLedgerEntry",
  "enum CreditPurchaseStatus",
  "enum CreditLedgerType",
  "model GenerationJob",
  "model CreditReservation",
  "model ProviderPriceVersion",
  "enum CreditReservationStatus",
  "model ProviderOperation",
  "enum ProviderOperationStatus",
  "model GeneratedSegment",
  "model GeneratedAsset",
  "model CreativeLineage",
  "enum CompositionStatus",
  "model CompositionInstruction",
  "model AePlan",
  "enum RenderAttemptStatus",
  "enum FinalVideoStatus",
  "model RenderAttempt",
  "model FinalVideo",
  "model PublishOperation",
  "enum PublishOperationStatus",
  "enum VerificationStatus",
  "model PostVerification",
  "model PerformanceSnapshot"
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

for (const required of [
  "model UserProfile",
  "model BrandContext",
  "onboardingSkipped",
  "targetPlatforms",
  "crawlPlanArtifactId",
  "readinessReportArtifactId"
]) {
  if (!schema.includes(required)) {
    throw new Error(`Missing required branding profile/context schema contract: ${required}`);
  }
}

for (const required of [
  "CREATE TABLE user_profiles",
  "CREATE TABLE brand_contexts",
  "ALTER TABLE brand_crawl_runs ADD COLUMN crawl_plan_artifact_id UUID",
  "ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE brand_contexts ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY user_profiles_user_isolation",
  "CREATE POLICY brand_contexts_workspace_isolation",
  "brand_contexts_workspace_user_unique",
  "brand_crawl_runs_crawl_plan_artifact_fk"
]) {
  if (!brandingProfileMigration.includes(required)) {
    throw new Error(`Missing required branding profile/context migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${brandingProfileMigration}`)) {
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

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE IF NOT EXISTS script_tournaments",
  "CREATE TABLE IF NOT EXISTS script_variants",
  "CREATE TABLE IF NOT EXISTS script_evaluations",
  "ALTER TABLE script_tournaments ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE script_variants ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE script_evaluations ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY script_tournaments_workspace_isolation",
  "CREATE POLICY script_variants_workspace_isolation",
  "CREATE POLICY script_evaluations_workspace_isolation",
  "script_tournaments_status_check",
  "script_variants_status_check",
  "script_evaluations_status_check",
  "script_tournaments_variant_count_check"
]) {
  if (!s1Migration.includes(required)) {
    throw new Error(`Missing required S1 script tournament migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE IF NOT EXISTS selected_scripts",
  "ALTER TABLE selected_scripts ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY selected_scripts_workspace_isolation",
  "selected_scripts_version_check"
]) {
  if (!s2Migration.includes(required)) {
    throw new Error(`Missing required S2 selected script migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "ALTER TABLE selected_scripts",
  "ADD CONSTRAINT selected_scripts_approver_user_id_fkey",
  "FOREIGN KEY (approver_user_id) REFERENCES users(id)"
]) {
  if (!s2ApproverFkMigration.includes(required)) {
    throw new Error(`Missing required S2 approver FK migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}\n${s2ApproverFkMigration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TABLE IF NOT EXISTS avatar_profiles",
  "CREATE TABLE IF NOT EXISTS avatar_consents",
  "evidence_ref VARCHAR(300) NOT NULL",
  "ALTER TABLE avatar_profiles ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE avatar_consents ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY avatar_profiles_workspace_isolation",
  "CREATE POLICY avatar_consents_workspace_isolation",
  "avatar_profiles_kind_check",
  "avatar_consents_evidence_ref_check"
]) {
  if (!g1Migration.includes(required)) {
    throw new Error(`Missing required G1 consent-safe avatar migration statement: ${required}`);
  }
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}\n${s2ApproverFkMigration}\n${g1Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TYPE credit_purchase_status",
  "CREATE TYPE credit_ledger_type",
  "CREATE TABLE IF NOT EXISTS credit_wallets",
  "CREATE TABLE IF NOT EXISTS credit_purchases",
  "CREATE TABLE IF NOT EXISTS credit_ledger_entries",
  "ALTER TABLE credit_wallets ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE credit_ledger_entries ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY credit_wallets_workspace_isolation",
  "CREATE POLICY credit_purchases_workspace_isolation",
  "CREATE POLICY credit_ledger_entries_workspace_isolation",
  "credit_purchases_provider_check",
  "credit_purchases_amount_check"
]) {
  if (!g2Migration.includes(required)) {
    throw new Error(`Missing required G2 creator wallet migration statement: ${required}`);
  }
}

if (/card|cvv|pan|expiry_year|instrument_number/i.test(`${schema}\n${g2Migration}`)) {
  throw new Error("Credit schema must not store payment instrument details.");
}

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}\n${s2ApproverFkMigration}\n${g1Migration}\n${g2Migration}`)) {
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

for (const required of [
  "CREATE TYPE credit_reservation_status",
  "ALTER TABLE generation_estimates",
  "ADD COLUMN IF NOT EXISTS input_hash CHAR(64)",
  "ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ(6)",
  "ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1",
  "ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ(6)",
  "ADD COLUMN IF NOT EXISTS duration_seconds INT NOT NULL DEFAULT 30",
  "CREATE TABLE IF NOT EXISTS provider_price_versions",
  "CREATE TABLE IF NOT EXISTS generation_jobs",
  "CREATE TABLE IF NOT EXISTS credit_reservations",
  "CREATE UNIQUE INDEX IF NOT EXISTS credit_reservations_one_active_per_job_idx",
  "WHERE status = 'ACTIVE'",
  "ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY generation_jobs_workspace_isolation",
  "CREATE POLICY credit_reservations_workspace_isolation",
  "generation_jobs_status_check",
  "credit_reservations_amount_check"
]) {
  if (!g3Migration.includes(required)) {
    throw new Error(`Missing required G3 versioned estimate and reservation migration statement: ${required}`);
  }
}

// The generation estimate input hash is a server-side validation secret. It is
// retained in the schema for confirmation integrity (schema.prisma declares
// inputHash) but the public mapper omits it; see apps/api/src/workspace-store.mjs
// publicGenerationEstimate. The integration tests assert it never leaks.

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}\n${s2ApproverFkMigration}\n${g1Migration}\n${g2Migration}\n${g3Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TYPE provider_operation_status",
  "CREATE TABLE IF NOT EXISTS provider_operations",
  "request_hash CHAR(64) NOT NULL",
  "estimated_maximum_minor BIGINT NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS provider_operations_workspace_idem_idx",
  "CREATE UNIQUE INDEX IF NOT EXISTS provider_operations_one_per_job_idx",
  "CREATE UNIQUE INDEX IF NOT EXISTS provider_operations_provider_external_idx",
  "WHERE external_id IS NOT NULL",
  "ALTER TABLE provider_operations ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY provider_operations_workspace_isolation",
  "provider_operations_status_check",
  "provider_operations_estimated_maximum_check"
]) {
  if (!g4Migration.includes(required)) {
    throw new Error(`Missing required G4 exactly-once HeyGen submission migration statement: ${required}`);
  }
}

// The provider operation request hash is a server-side binding secret (it binds
// the submission to the exact job/script/avatar/duration/price version/provider).
// schema.prisma declares requestHash but the public mapper omits it; the
// integration tests assert it never leaks.

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}\n${s2ApproverFkMigration}\n${g1Migration}\n${g2Migration}\n${g3Migration}\n${g4Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "ADD COLUMN IF NOT EXISTS provider_total_minor BIGINT",
  "ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ(6)",
  "CREATE TABLE IF NOT EXISTS generated_segments",
  "CREATE TABLE IF NOT EXISTS generated_assets",
  "CREATE TABLE IF NOT EXISTS creative_lineage",
  "CREATE UNIQUE INDEX IF NOT EXISTS generated_segments_workspace_job_index_idx",
  "CREATE UNIQUE INDEX IF NOT EXISTS generated_assets_workspace_job_version_idx",
  "CREATE UNIQUE INDEX IF NOT EXISTS creative_lineage_workspace_job_idx",
  "ALTER TABLE generated_segments ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE generated_assets ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE creative_lineage ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY generated_segments_workspace_isolation",
  "CREATE POLICY generated_assets_workspace_isolation",
  "CREATE POLICY creative_lineage_workspace_isolation",
  "generated_assets_status_check"
]) {
  if (!g5Migration.includes(required)) {
    throw new Error(`Missing required G5 retained media and settled credits migration statement: ${required}`);
  }
}

// The transient provider URL is never retained as production source; the retained
// segment stores only the hash, duration, content type and byte size. The provider
// external id is retained for lineage reconciliation but the public mapper never
// surfaces a transient URL. The integration tests assert no URL leaks.

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}\n${s2ApproverFkMigration}\n${g1Migration}\n${g2Migration}\n${g3Migration}\n${g4Migration}\n${g5Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TYPE composition_status",
  "CREATE TABLE IF NOT EXISTS composition_instructions",
  "CREATE TABLE IF NOT EXISTS ae_plans",
  "generation_asset_id UUID NOT NULL",
  "composition_instruction_id UUID NOT NULL REFERENCES composition_instructions(id)",
  "plan_artifact_id UUID REFERENCES artifacts(id)",
  "timeline JSONB NOT NULL",
  "unsupported_items JSONB NOT NULL DEFAULT '[]'::jsonb",
  "CREATE INDEX IF NOT EXISTS composition_instructions_workspace_status_created_idx",
  "CREATE INDEX IF NOT EXISTS ae_plans_workspace_instruction_version_idx",
  "ALTER TABLE composition_instructions ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE ae_plans ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY composition_instructions_workspace_isolation",
  "CREATE POLICY ae_plans_workspace_isolation"
]) {
  if (!c1Migration.includes(required)) {
    throw new Error(`Missing required C1 validated composition intent and AE plan migration statement: ${required}`);
  }
}

// The composition plan timeline JSON, plan artifact sha256 and referenced asset ids are
// retained server-side only; the public mappers (publicCompositionInstruction, publicAePlan)
// omit the timeline, raw direction and sha256. The integration tests assert no URL, secret or
// asset id leaks. Composition planning is not a paid or externally visible mutation, so no
// idempotency key or credit ledger entry is required.

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}\n${s2ApproverFkMigration}\n${g1Migration}\n${g2Migration}\n${g3Migration}\n${g4Migration}\n${g5Migration}\n${c1Migration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

for (const required of [
  "CREATE TYPE render_attempt_status",
  "CREATE TYPE final_video_status",
  "CREATE TABLE IF NOT EXISTS render_attempts",
  "CREATE TABLE IF NOT EXISTS final_videos",
  "composition_instruction_id UUID NOT NULL REFERENCES composition_instructions(id)",
  "ae_plan_id UUID NOT NULL REFERENCES ae_plans(id)",
  "render_attempt_id UUID NOT NULL REFERENCES render_attempts(id)",
  "input_hash CHAR(64) NOT NULL",
  "input_asset_hashes JSONB NOT NULL",
  "output_hash CHAR(64)",
  "final_video_artifact_id UUID NOT NULL REFERENCES artifacts(id)",
  "thumbnail_artifact_id UUID NOT NULL REFERENCES artifacts(id)",
  "captions_artifact_id UUID NOT NULL REFERENCES artifacts(id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS render_attempts_workspace_idem_idx",
  "CREATE UNIQUE INDEX IF NOT EXISTS render_attempts_one_active_per_instruction_idx",
  "WHERE status = 'RUNNING'",
  "CREATE UNIQUE INDEX IF NOT EXISTS final_videos_workspace_instruction_version_idx",
  "CREATE UNIQUE INDEX IF NOT EXISTS final_videos_one_current_per_instruction_idx",
  "WHERE status = 'CURRENT'",
  "ALTER TABLE render_attempts ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE final_videos ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY render_attempts_workspace_isolation",
  "CREATE POLICY final_videos_workspace_isolation"
]) {
  if (!c2Migration.includes(required)) {
    throw new Error(`Missing required C2 reproducible final branded render migration statement: ${required}`);
  }
}

for (const required of [
  "ALTER TABLE creative_lineage ALTER COLUMN generation_job_id DROP NOT NULL",
  "ADD COLUMN IF NOT EXISTS composition_instruction_id UUID REFERENCES composition_instructions(id)",
  "ADD COLUMN IF NOT EXISTS ae_plan_id UUID REFERENCES ae_plans(id)",
  "ADD COLUMN IF NOT EXISTS render_attempt_id UUID REFERENCES render_attempts(id)",
  "ADD COLUMN IF NOT EXISTS final_video_id UUID REFERENCES final_videos(id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS creative_lineage_one_final_video_idx",
  "ON creative_lineage(workspace_id, final_video_id)",
  "ADD COLUMN IF NOT EXISTS idempotency_input_hash CHAR(64)",
  "ALTER TABLE creative_lineage ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE render_attempts ENABLE ROW LEVEL SECURITY;"
]) {
  if (!c2FixMigration.includes(required)) {
    throw new Error(`Missing required C2 render-level lineage and input-bound idempotency migration statement: ${required}`);
  }
}

for (const required of [
  "CREATE TYPE review_stage",
  "CREATE TYPE review_item_status",
  "CREATE TYPE notification_status",
  "CREATE TABLE review_items",
  "final_video_sha256 char(64) NOT NULL",
  "final_video_version integer NOT NULL",
  "review_stage review_stage NOT NULL",
  "status review_item_status NOT NULL",
  "CREATE UNIQUE INDEX review_items_one_per_final_video_idx",
  "CREATE TABLE review_comments",
  "body varchar(2000) NOT NULL",
  "timestamp_ms integer NOT NULL DEFAULT 0",
  "thread_id uuid",
  "CREATE INDEX review_comments_workspace_item_created_idx",
  "CREATE TABLE notifications",
  "payload_hash char(64) NOT NULL",
  "status notification_status NOT NULL DEFAULT 'PENDING'",
  "CREATE UNIQUE INDEX notifications_one_logical_per_payload_idx",
  "ALTER TABLE review_items ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY review_items_workspace_isolation",
  "CREATE POLICY review_comments_workspace_isolation",
  "CREATE POLICY notifications_workspace_isolation"
]) {
  if (!r1Migration.includes(required)) {
    throw new Error(`Missing required R1 exact-version review and comments migration statement: ${required}`);
  }
}

for (const required of [
  "CREATE TYPE approval_decision",
  "CREATE TABLE review_decisions",
  "final_video_sha256 char(64) NOT NULL",
  "final_video_version integer NOT NULL",
  "decision approval_decision NOT NULL",
  "reason varchar(2000) NOT NULL",
  "approval_token char(64) NOT NULL",
  "CREATE UNIQUE INDEX review_decisions_one_per_review_item_idx",
  "CREATE UNIQUE INDEX review_decisions_one_approval_token_idx",
  "CREATE INDEX review_decisions_workspace_decision_created_idx",
  "ALTER TABLE review_decisions ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY review_decisions_workspace_isolation"
]) {
  if (!r2Migration.includes(required)) {
    throw new Error(`Missing required R2 auditable approval bound to final media migration statement: ${required}`);
  }
}

for (const required of [
  "ALTER TABLE review_decisions ALTER COLUMN approval_token DROP NOT NULL",
  "DROP INDEX IF EXISTS review_decisions_one_approval_token_idx",
  "CREATE UNIQUE INDEX review_decisions_one_approval_token_idx",
  "WHERE approval_token IS NOT NULL",
  "ALTER TABLE review_decisions ENABLE ROW LEVEL SECURITY;"
]) {
  if (!r2FixMigration.includes(required)) {
    throw new Error(`Missing required R2 nullable approval token fix migration statement: ${required}`);
  }
}

for (const required of [
  "CREATE TYPE publish_status",
  "CREATE TABLE calendar_posts",
  "platform varchar(40) NOT NULL",
  "account varchar(240) NOT NULL",
  "caption varchar(2000) NOT NULL",
  "final_video_id uuid NOT NULL REFERENCES final_videos(id)",
  "final_video_sha256 char(64) NOT NULL",
  "final_video_version integer NOT NULL",
  "approval_token char(64) NOT NULL",
  "scheduled_at timestamptz(6)",
  "timezone varchar(60) NOT NULL",
  "manual_export boolean NOT NULL DEFAULT false",
  "manual_live_url varchar(500)",
  "manual_url_provided_at timestamptz(6)",
  "export_artifact_id uuid REFERENCES artifacts(id)",
  "status publish_status NOT NULL DEFAULT 'APPROVED'",
  "created_by_user_id uuid NOT NULL",
  "CREATE INDEX calendar_posts_workspace_status_created_idx",
  "CREATE INDEX calendar_posts_workspace_scheduled_idx",
  "CREATE INDEX calendar_posts_workspace_platform_account_scheduled_idx",
  "ALTER TABLE calendar_posts ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY calendar_posts_workspace_isolation"
]) {
  if (!u1Migration.includes(required)) {
    throw new Error(`Missing required U1 approved calendar and manual export fallback migration statement: ${required}`);
  }
}

for (const required of [
  "CREATE TYPE publish_operation_status",
  "CREATE TABLE publish_operations",
  "workspace_id uuid NOT NULL REFERENCES workspaces(id)",
  "calendar_post_id uuid NOT NULL REFERENCES calendar_posts(id)",
  "provider varchar(40) NOT NULL",
  "operation_type varchar(40) NOT NULL",
  "status publish_operation_status NOT NULL DEFAULT 'CREATED'",
  "idempotency_key varchar(200) NOT NULL",
  "request_hash char(64) NOT NULL",
  "external_id varchar(200)",
  "public_url varchar(500)",
  "last_error_code varchar(80)",
  "submitted_at timestamptz(6)",
  "accepted_at timestamptz(6)",
  "completed_at timestamptz(6)",
  "reconciled_at timestamptz(6)",
  "cancelled_at timestamptz(6)",
  "CONSTRAINT publish_operations_status_check",
  "CREATE UNIQUE INDEX publish_operations_workspace_idem_idx",
  "CREATE UNIQUE INDEX publish_operations_one_per_post_idx",
  "CREATE UNIQUE INDEX publish_operations_provider_external_idx",
  "CREATE INDEX publish_operations_workspace_status_updated_idx",
  "CREATE INDEX publish_operations_workspace_post_status_idx",
  "ALTER TABLE publish_operations ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY publish_operations_workspace_isolation"
]) {
  if (!u2Migration.includes(required)) {
    throw new Error(`Missing required U2 idempotent Meta publication migration statement: ${required}`);
  }
}

for (const required of [
  "CREATE TYPE verification_status",
  "CREATE TABLE post_verifications",
  "calendar_post_id uuid NOT NULL REFERENCES calendar_posts(id)",
  "evidence_artifact_id uuid REFERENCES artifacts(id)",
  "provider varchar(40) NOT NULL",
  "status verification_status NOT NULL DEFAULT 'PENDING'",
  "attempts integer NOT NULL DEFAULT 0",
  "account_matched boolean",
  "media_sha256_matched boolean",
  "caption_matched boolean",
  "observed_media_sha256 char(64)",
  "observed_published_at timestamptz(6)",
  "propagation_delay_ms integer",
  "verified_at timestamptz(6)",
  "CREATE UNIQUE INDEX post_verifications_one_per_post_idx",
  "CREATE INDEX post_verifications_workspace_status_updated_idx",
  "CREATE INDEX post_verifications_workspace_post_status_idx",
  "CREATE TABLE performance_snapshots",
  "observation_window_start timestamptz(6) NOT NULL",
  "observation_window_end timestamptz(6) NOT NULL",
  "metrics jsonb NOT NULL DEFAULT '{}'::jsonb",
  "source_hash char(64) NOT NULL",
  "CREATE INDEX performance_snapshots_workspace_post_created_idx",
  "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS calendar_post_id uuid REFERENCES calendar_posts(id)",
  "CREATE INDEX IF NOT EXISTS notifications_workspace_post_created_idx",
  "ALTER TABLE post_verifications ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY post_verifications_workspace_isolation",
  "CREATE POLICY performance_snapshots_workspace_isolation"
]) {
  if (!u4Migration.includes(required)) {
    throw new Error(`Missing required U4 audience-facing verification migration statement: ${required}`);
  }
}

// V0-R2 records one terminal decision (approve/reject/request_changes) per review item, bound to
// the exact final-video version (finalVideoId + captured finalVideoSha256 + finalVideoVersion) so
// a decision can never silently apply to another version. One decision per review item
// (unique(workspaceId, reviewItemId)): a second fresh-key attempt is rejected
// (REVIEW_DECISION_ALREADY_RECORDED); a same-key idempotent replay returns the original decision.
// An approve persists a deterministic approval token (unique per workspace) bound to the exact
// version that scheduling may later consume; reject/request_changes persist a token only for
// approve. A decision against a superseded bound version is rejected (REVIEW_VERSION_STALE) and
// the review item is archived. review_decisions are append-only (no update/delete path). The new
// table inherits workspace-isolation RLS keyed on app.current_workspace_id; no role is granted an
// RLS bypass. The public mappers (publicReviewDecision, publicApprovalReference) lowercase the
// decision enum; signed URLs, secrets and artifact object keys never reach the browser. The
// integration tests assert no URL, secret or provider payload leaks.

// V0-R1 pins each review item to one exact final-video version (finalVideoId + captured
// finalVideoSha256 + finalVideoVersion) so a comment can never silently attach to another
// version; a comment against a superseded version returns REVIEW_VERSION_STALE and the review
// item is archived. review_comments are append-only (no update/delete path). One logical
// notification per workspace+payloadHash collapses repeated comment activity on a review item
// to a single notification (duplicateCollapsed), never a duplicate send. The new tables inherit
// workspace-isolation RLS keyed on app.current_workspace_id; no role is granted an RLS bypass.
// The public mappers (publicReviewItem, publicReviewComment, publicNotification) lowercase the
// enums and preserve unknown; signed URLs, secrets and artifact object keys never reach the
// browser. The integration tests assert no URL, secret or provider payload leaks.

// The render-level lineage row is identified by final_video_id (one per final video, NULL for G5
// rows) and the G5 lineage row stays identified by generation_job_id (one per generation job, NULL
// for render-level rows); both unique constraints skip NULLs because SQL treats NULLs as distinct.
// render_attempts.idempotency_input_hash binds the idempotency key to the exact render operation
// input so the same key replayed against a different composition is a conflict, never a silent
// replay of the wrong final video. The new columns inherit the existing workspace-isolation RLS
// policies; no BYPASSRLS is granted.

// The render attempt input hash, input asset hashes, output hash and final-video sha256 are
// server-side validation bindings and never reach the browser; the public mappers
// (publicRenderAttempt, publicFinalVideo) omit the input hash, asset hashes and the
// final-video sha256 unless explicitly surfaced as the golden render fingerprint. The render
// logs artifact and retained media artifacts are CLEAN. Render is a costly mutation producing
// retained artifacts, so an idempotency key is required and the RenderAttempt is persisted
// RUNNING before the AE worker runs. No transient worker URL, signed URL, secret or raw
// provider payload is retained or returned. The integration tests assert no URL, secret or
// provider payload leaks.

if (/BYPASSRLS/i.test(`${f1Migration}\n${f2Migration}\n${f3Migration}\n${f4Migration}\n${f6Migration}\n${f7Migration}\n${b1Migration}\n${b2Migration}\n${b3Migration}\n${p1Migration}\n${p2Migration}\n${p3Migration}\n${p4Migration}\n${p5Migration}\n${s1Migration}\n${s2Migration}\n${s2ApproverFkMigration}\n${g1Migration}\n${g2Migration}\n${g3Migration}\n${g4Migration}\n${g5Migration}\n${c1Migration}\n${c2Migration}\n${c2FixMigration}\n${r1Migration}\n${r2Migration}\n${u1Migration}\n${u2Migration}\n${r2FixMigration}\n${u4Migration}\n${brandingProfileMigration}`)) {
  throw new Error("Runtime roles must not receive BYPASSRLS.");
}

console.log("Database contract valid for V0-F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1/R2/U1/U2/U3 identity, idempotency, artifacts, jobs, outbox, capability controls, service credentials, branding profile/context records, brand intake, brand candidates, brand crawl artifact references, brand memory, blueprint path selection, viral candidate metrics, media acquisition, thumbnail blueprints, scene blueprints, formula derivations, director prompts, script tournaments, selected scripts, selected-script approver lineage FK, consent-safe avatar profiles and consents, creator wallets, verified credit purchases, append-only credit ledger, versioned generation estimates with input hash and expiry, atomic credit reservations with one-active-per-job guard, provider price versions, exactly-once provider operations with one-per-job guard, retained generated segments/assets and creative lineage with reconciled provider total and settled credits, validated composition instructions and AE plans with deterministic capability registry validation and CLEAN plan artifacts, reproducible final branded render attempts and versioned final videos with immutable revision lineage and deterministic golden render hash, render-level creative lineage binding composition instruction, AE plan, render attempt and final video with input-bound render idempotency, exact-version review items bound to one final-video version with append-only timestamped comments and one-logical-notification dedupe, auditable approval decisions bound to one exact final-video version with one-decision-per-review-item guard and a deterministic approval token minted only on approve (nullable, NULL on reject/request_changes, unique over non-null tokens) for scheduling, approved calendar posts bound to one approved exact final-video version with scheduled or manual-export fallback and a retained manual-export artifact, idempotent Meta and YouTube Shorts publication with one publish operation per calendar post, a pre-network durable row, a server-side request hash, a public post URL stored only once live, signature-verified windowed deduplicated callbacks and unknown-after-timeout reconciliation, audience-facing verification with one PostVerification per calendar post, a deterministic verifier simulator, account/media/caption/visibility/publish-time checks, bounded attempts, an immutable audience evidence artifact, a manual live URL journey, one deduplicated completion notification bound to the calendar post, an initial immutable PerformanceSnapshot anchoring the observation window, and RLS.");
