# Implemented changes: V0-F4 durable job, outbox and private worker round trip

## Slice

`V0-F4: Durable Job, Outbox And Private Worker Round Trip`

## Behaviour implemented

- Added a deterministic simulated media-processing API route that returns `202 Accepted`
  with a canonical job and outbox event.
- Added workspace-scoped job read and event-list routes.
- Added authenticated internal worker claim, heartbeat and complete routes.
- Added output validation for worker hash, object key, byte size and schema version.
- Made duplicate completion delivery idempotently return the retained artifact instead of
  creating another artifact completion.
- Added Prisma schema and migration coverage for `Job`, `JobAttempt`, `JobDependency`,
  `JobEvent` and `OutboxEvent` with RLS and one-active-lease migration SQL.
- Added outbox relay recovery for Redis-loss simulation and duplicate wake-up replay.
- Added lease expiry recovery, stale lease rejection and re-claim.
- Added worker fail endpoint, retry/exhaustion logic, `last_error_code` and dead-letter
  visibility.
- Added Supabase runtime proof for job, outbox, event and retained artifact round trip.

## Files changed

- `apps/api/src/server.mjs`
- `apps/api/src/workspace-store.mjs`
- `packages/contracts/src/openapi.v0.json`
- `packages/contracts/generated/openapi.v0.json`
- `packages/contracts/generated/v0-client.mjs`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/0004_v0_f4_jobs_outbox/migration.sql`
- `packages/db/prisma/migrations/0005_v0_f4_job_dead_letter_error_code/migration.sql`
- `packages/db/scripts/db-migrate-dev.mjs`
- `packages/db/scripts/db-validate.mjs`
- `scripts/generate-contracts.mjs`
- `scripts/verify.mjs`
- `tests/integration/jobs.test.mjs`
- `tests/unit/db-schema.test.mjs`
- `tests/unit/db-migrate-script.test.mjs`
- `tests/unit/verify-script.test.mjs`
- `tests/contract/openapi-generation.test.mjs`
- `docs/V0/V0_API.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/Evidence/V0-F4_LOCAL_DUMMY_DATA_VERIFICATION_2026-06-22.md`

## Verification

- `pnpm test:integration`
- `pnpm test:unit`
- `pnpm test:contract`
- `pnpm db:generate`
- `pnpm db:validate`
- `pnpm db:migrate:dev`
- `V0_RUNTIME_DB_PROOF=1 pnpm test:integration -- --test-name-pattern "prisma runtime"`
- `pnpm verify`

## Remaining F4 evidence

No F4 sprint evidence remains open. F5 owns trace, recovery controls, restore drill and
capability controls.
