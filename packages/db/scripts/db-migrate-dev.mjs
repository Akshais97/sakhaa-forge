import { spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

loadApiEnv();

const migrations = [
  {
    path: "packages/db/prisma/migrations/0001_v0_f1_identity_rls/migration.sql",
    sentinel: "SELECT to_regclass('public.users') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0002_v0_f2_idempotency_records/migration.sql",
    sentinel: "SELECT to_regclass('public.idempotency_records') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0003_v0_f3_artifacts_inbox_events/migration.sql",
    sentinel: "SELECT to_regclass('public.artifacts') IS NOT NULL AND to_regclass('public.inbox_events') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0004_v0_f4_jobs_outbox/migration.sql",
    sentinel: "SELECT to_regclass('public.jobs') IS NOT NULL AND to_regclass('public.outbox_events') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0005_v0_f4_job_dead_letter_error_code/migration.sql",
    sentinel: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'last_error_code')"
  },
  {
    path: "packages/db/prisma/migrations/0006_v0_f5_workspace_capabilities/migration.sql",
    sentinel: "SELECT to_regclass('public.workspace_capabilities') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0007_v0_f5_service_credentials/migration.sql",
    sentinel: "SELECT to_regclass('public.service_credentials') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0008_v0_b1_safe_brand_intake/migration.sql",
    sentinel: "SELECT to_regclass('public.brand_crawl_runs') IS NOT NULL AND to_regclass('public.brand_assets') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0009_v0_b2_brand_candidate_extraction/migration.sql",
    sentinel: "SELECT to_regclass('public.brand_candidates') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0010_v0_b3_brand_memory/migration.sql",
    sentinel: "SELECT to_regclass('public.brand_profiles') IS NOT NULL AND to_regclass('public.brand_approvals') IS NOT NULL AND to_regclass('public.brand_rules') IS NOT NULL AND to_regclass('public.generation_estimates') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0011_v0_p1_blueprint_path_selection/migration.sql",
    sentinel: "SELECT to_regclass('public.blueprint_library_entries') IS NOT NULL AND to_regclass('public.blueprint_requests') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0012_v0_p2_viral_candidate_metrics/migration.sql",
    sentinel: "SELECT to_regclass('public.viral_candidates') IS NOT NULL AND to_regclass('public.metric_snapshots') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0013_v0_p3_media_acquisition_thumbnail_blueprint/migration.sql",
    sentinel: "SELECT to_regclass('public.media_acquisitions') IS NOT NULL AND to_regclass('public.thumbnail_blueprints') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0014_v0_p4_scene_blueprints/migration.sql",
    sentinel: "SELECT to_regclass('public.video_blueprints') IS NOT NULL AND to_regclass('public.blueprint_scenes') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0015_v0_p5_ready_blueprint_formula_prompt/migration.sql",
    sentinel: "SELECT to_regclass('public.formula_derivations') IS NOT NULL AND to_regclass('public.director_prompts') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0016_v0_s1_script_tournament/migration.sql",
    sentinel: "SELECT to_regclass('public.script_tournaments') IS NOT NULL AND to_regclass('public.script_variants') IS NOT NULL AND to_regclass('public.script_evaluations') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0017_v0_s2_selected_script/migration.sql",
    sentinel: "SELECT to_regclass('public.selected_scripts') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0018_v0_s2_selected_script_approver_fk/migration.sql",
    sentinel: "SELECT COUNT(*) > 0 FROM pg_constraint WHERE conname = 'selected_scripts_approver_user_id_fkey'"
  },
  {
    path: "packages/db/prisma/migrations/0019_v0_g1_consent_safe_avatar_selection/migration.sql",
    sentinel: "SELECT to_regclass('public.avatar_profiles') IS NOT NULL AND to_regclass('public.avatar_consents') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0020_v0_g2_creator_wallet_verified_credit_purchase/migration.sql",
    sentinel: "SELECT to_regclass('public.credit_wallets') IS NOT NULL AND to_regclass('public.credit_purchases') IS NOT NULL AND to_regclass('public.credit_ledger_entries') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0021_v0_g3_versioned_generation_estimate_and_atomic_reservation/migration.sql",
    sentinel: "SELECT to_regclass('public.generation_jobs') IS NOT NULL AND to_regclass('public.credit_reservations') IS NOT NULL AND to_regclass('public.provider_price_versions') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0022_v0_g4_exactly_once_heygen_submission/migration.sql",
    sentinel: "SELECT to_regclass('public.provider_operations') IS NOT NULL AND to_regtype('public.provider_operation_status') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0023_v0_g5_retained_generated_media_and_settled_credits/migration.sql",
    sentinel:
      "SELECT to_regclass('public.generated_segments') IS NOT NULL AND to_regclass('public.generated_assets') IS NOT NULL AND to_regclass('public.creative_lineage') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0024_v0_c1_validated_composition_intent_and_ae_plan/migration.sql",
    sentinel:
      "SELECT to_regclass('public.composition_instructions') IS NOT NULL AND to_regclass('public.ae_plans') IS NOT NULL AND to_regtype('public.composition_status') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0025_v0_c2_reproducible_final_branded_render/migration.sql",
    sentinel:
      "SELECT to_regclass('public.render_attempts') IS NOT NULL AND to_regclass('public.final_videos') IS NOT NULL AND to_regtype('public.render_attempt_status') IS NOT NULL AND to_regtype('public.final_video_status') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0026_v0_c2_render_level_lineage_and_input_bound_idempotency/migration.sql",
    sentinel:
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'creative_lineage' AND column_name = 'final_video_id') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'render_attempts' AND column_name = 'idempotency_input_hash')"
  },
  {
    path: "packages/db/prisma/migrations/0027_v0_r1_exact_version_review_and_comments/migration.sql",
    sentinel:
      "SELECT to_regclass('public.review_items') IS NOT NULL AND to_regclass('public.review_comments') IS NOT NULL AND to_regclass('public.notifications') IS NOT NULL AND to_regtype('public.review_item_status') IS NOT NULL AND to_regtype('public.notification_status') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0028_v0_r2_auditable_approval_bound_to_final_media/migration.sql",
    sentinel:
      "SELECT to_regclass('public.review_decisions') IS NOT NULL AND to_regtype('public.approval_decision') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0029_v0_u1_approved_calendar_and_manual_export_fallback/migration.sql",
    sentinel:
      "SELECT to_regclass('public.calendar_posts') IS NOT NULL AND to_regtype('public.publish_status') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0030_v0_u2_idempotent_meta_publication/migration.sql",
    sentinel:
      "SELECT to_regclass('public.publish_operations') IS NOT NULL AND to_regtype('public.publish_operation_status') IS NOT NULL"
  },
  {
    path: "packages/db/prisma/migrations/0031_v0_r2_nullable_approval_token_only_on_approve/migration.sql",
    sentinel:
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'review_decisions' AND column_name = 'approval_token' AND is_nullable = 'YES')"
  },
  {
    path: "packages/db/prisma/migrations/0032_v0_u4_audience_facing_verification_and_one_completion_notification/migration.sql",
    sentinel:
      "SELECT to_regclass('public.post_verifications') IS NOT NULL AND to_regclass('public.performance_snapshots') IS NOT NULL AND to_regtype('public.verification_status') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'calendar_post_id')"
  },
  {
    path: "packages/db/prisma/migrations/0033_v0_branding_profile_context_and_artifact_refs/migration.sql",
    sentinel:
      "SELECT to_regclass('public.user_profiles') IS NOT NULL AND to_regclass('public.brand_contexts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brand_crawl_runs' AND column_name = 'asset_pack_artifact_id')"
  }
];

for (const migration of migrations) {
  const sql = await readFile(migration.path, "utf8");
  if (
    !sql.includes("ENABLE ROW LEVEL SECURITY") &&
    !sql.includes("ALTER TABLE jobs") &&
    !sql.includes("ALTER TABLE selected_scripts")
  ) {
    throw new Error(`${migration.path} must enable RLS or extend an already RLS-protected table before it can run.`);
  }
}

const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    "V0-F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/U4 db:migrate:dev dry-run: DIRECT_DATABASE_URL and DATABASE_URL are not set; migration SQL validated but not applied."
  );
  process.exit(0);
}

const psqlCommand = resolvePsqlCommand();
const psqlCheck = spawnSync(psqlCommand, ["--version"], {
  stdio: "ignore"
});

if (psqlCheck.error) {
  console.error("psql is not available; install PostgreSQL client tools before applying migrations.");
  process.exit(1);
}

for (const migration of migrations) {
  if (isMigrationApplied(psqlCommand, databaseUrl, migration.sentinel)) {
    console.log(`Skipping already applied migration ${migration.path}`);
    continue;
  }

  console.log(`Applying ${migration.path}`);
  const result = spawnSync(psqlCommand, [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", migration.path], {
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("V0-F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1/R2/U1/U2/U4 migrations applied.");

function isMigrationApplied(psqlCommand, databaseUrl, sentinel) {
  const result = spawnSync(psqlCommand, [databaseUrl, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sentinel], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return false;
  }
  return result.stdout.trim() === "t";
}

function loadApiEnv() {
  try {
    loadEnvFile("apps/api/.env");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function resolvePsqlCommand() {
  const candidates = [
    process.env.PSQL_PATH,
    "C:/Program Files/PostgreSQL/17/bin/psql.exe",
    "C:/Program Files/PostgreSQL/16/bin/psql.exe",
    "C:/Program Files/PostgreSQL/15/bin/psql.exe",
    "psql"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "psql" || existsSync(candidate)) {
      return candidate;
    }
  }

  return "psql";
}
