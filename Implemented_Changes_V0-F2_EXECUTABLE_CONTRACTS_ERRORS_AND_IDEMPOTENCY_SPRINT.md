# Implemented changes: V0-F2 executable contracts, errors and idempotency

## Slice and behaviour

- Slice: `V0-F2: Executable Contracts, Errors And Idempotency`.
- Behaviour changed: `POST /api/v0/workspaces` now requires `Idempotency-Key`.
- Dummy-data decision: runtime idempotency records are in-memory until Supabase PostgreSQL is
  introduced in a later sprint. The Prisma schema and migration contract are present.

## Source contracts

- `docs/V0/Sprints/V0-F2_EXECUTABLE_CONTRACTS_ERRORS_AND_IDEMPOTENCY_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAIL_API_CALLS.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAIL_TDD.md`

## Evidence

- Red: `node --test tests/integration/idempotency.test.mjs` failed because duplicate input
  created a second workspace and missing `Idempotency-Key` returned `201`.
- Red: `node --test tests/unit/db-schema.test.mjs` failed because `IdempotencyRecord` and
  migration `0002_v0_f2_idempotency_records` were absent.
- Green: `node --test tests/integration/idempotency.test.mjs` passed.
- Green: `node --test tests/unit/db-schema.test.mjs` passed.
- Nearby: contract, integration, e2e and unit suites passed.

## Contract, security and tenant impact

- Generated client accepts `{ idempotencyKey }` for `createWorkspace`.
- Same actor, operation and key with the same request hash replays the original response.
- Same actor, operation and key with different input returns `IDEMPOTENCY_INPUT_CONFLICT`.
- Missing key returns `IDEMPOTENCY_KEY_REQUIRED`.
- Validation still happens before workspace state is created.
- No provider payloads, secrets, signed URLs or cross-tenant existence are exposed.

## 2026-06-17

Slice: `V0-F2`

Behaviour: local dummy-data idempotency evidence retained.

Changes made:

- Added retained evidence file `docs/V0/Evidence/V0-F2_LOCAL_DUMMY_DATA_VERIFICATION_2026-06-17.md`.
- Kept runtime idempotency in local dummy data by project-owner decision.
- Added formatter discovery test for `.claude/` and `graphify-out/` exclusions so `pnpm verify` can run on this workspace.

Verification:

- `node --test tests\unit\file-list.test.mjs` passed: 1 test.
- `node --test tests\integration\idempotency.test.mjs` remains covered by nearby suite evidence.

Caveat:

- Durable PostgreSQL-backed idempotency remains deferred.
