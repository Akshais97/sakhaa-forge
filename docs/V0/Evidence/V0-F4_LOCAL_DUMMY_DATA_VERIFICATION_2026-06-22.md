# V0-F4 local dummy-data verification — 2026-06-22

## Slice

`V0-F4: Durable Job, Outbox And Private Worker Round Trip`

## Behaviours verified

- A workspace user starts deterministic simulated media processing. The API returns `202`
  with a canonical job and outbox event.
- An authenticated private worker claims the job, heartbeats it to `RUNNING`, completes it
  with validated output metadata, and duplicate completion delivery replays the retained
  artifact instead of creating a second completion.
- Redis-loss relay returns `DEPENDENCY_UNAVAILABLE` without losing canonical job/outbox
  state; later relay publishes the same pending outbox row once.
- Lease expiry requeues work, rejects stale worker completion and allows a new lease to
  complete the job.
- Exhausted worker failure records `last_error_code`, emits `job.dead_lettered` and remains
  visible through the dead-letter list.
- Supabase runtime proof persists job, outbox, job event and retained artifact evidence.

## Source contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-F4_DURABLE_JOB_OUTBOX_AND_PRIVATE_WORKER_ROUND_TRIP_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Red evidence

Command:

```text
pnpm test:integration -- --test-name-pattern "simulated media job"
```

Expected failure:

```text
TypeError: client.startSimulatedMediaProcessing is not a function
```

Additional red evidence:

```text
TypeError: worker.relayOutbox is not a function
TypeError: worker.expireJobLeases is not a function
TypeError: worker.failJob is not a function
P2021
```

## Green evidence

Commands:

```text
pnpm test:integration
pnpm test:unit
pnpm test:contract
pnpm db:generate
pnpm db:validate
pnpm verify
```

Observed outcomes:

- Integration: `pass 14`, `fail 0`, `skipped 1`.
- Unit: `pass 20`, `fail 0`.
- Contract: `pass 2`, `fail 0`.
- Full local test suite: `pass 42`, `fail 0`, `skipped 1`.
- Prisma client generation completed from `packages/db/prisma/schema.prisma`.
- Idempotent migration runner skipped already-applied F1-F4 migrations during final
  `pnpm verify`.
- Database validation reported: `Database contract valid for V0-F4 identity, idempotency, artifacts, jobs, outbox and RLS.`
- Full verification reported: `V0-F0/F1/F2/F3/F4 local verification passed.`
- Supabase F4 runtime proof reported `pass 15`, `fail 0` for `pnpm test:integration -- --test-name-pattern "prisma runtime"` with `V0_RUNTIME_DB_PROOF=1`.

## Evidence retained

- `tests/integration/jobs.test.mjs`
- `tests/unit/db-schema.test.mjs`
- `tests/contract/openapi-generation.test.mjs`
- `packages/db/prisma/migrations/0004_v0_f4_jobs_outbox/migration.sql`
- `packages/db/prisma/migrations/0005_v0_f4_job_dead_letter_error_code/migration.sql`
- `packages/contracts/generated/openapi.v0.json`
- `packages/contracts/generated/v0-client.mjs`

## Limits

This is deterministic local and Supabase-runtime verification. BullMQ is represented by
the F4 opaque wake-up relay contract; Redis-loss behavior is simulated at that boundary
because paid/provider and worker boundaries use deterministic simulators by default in V0
foundation slices.
