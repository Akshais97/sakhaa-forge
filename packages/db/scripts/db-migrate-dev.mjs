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
  }
];

for (const migration of migrations) {
  const sql = await readFile(migration.path, "utf8");
  if (!sql.includes("ENABLE ROW LEVEL SECURITY") && !sql.includes("ALTER TABLE jobs")) {
    throw new Error(`${migration.path} must enable RLS or extend an already RLS-protected table before it can run.`);
  }
}

const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    "V0-F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5 db:migrate:dev dry-run: DIRECT_DATABASE_URL and DATABASE_URL are not set; migration SQL validated but not applied."
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

console.log("V0-F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5 migrations applied.");

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
