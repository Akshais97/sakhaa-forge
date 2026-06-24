# V0-F2 Local Dummy-Data Verification Evidence - 2026-06-17

## Scope

Slice: `V0-F2` executable contracts, errors and idempotency.

Behaviour verified:

- generated client calls `/api/v0`;
- `POST /workspaces` requires `Idempotency-Key`;
- duplicate same-input request replays original response;
- duplicate different-input request returns `IDEMPOTENCY_INPUT_CONFLICT`;
- missing idempotency key returns `IDEMPOTENCY_KEY_REQUIRED` before workspace state is
  created;
- generated OpenAPI and generated client include workspace and idempotency surfaces;
- Prisma schema and migration text define `IdempotencyRecord` and RLS policy.

## Decision

Runtime idempotency remains local dummy data for now by project-owner decision on
2026-06-17. Durable PostgreSQL-backed idempotency remains deferred. This file does not
claim production durable idempotency acceptance.

## Red Evidence

Recorded earlier in `Implemented_Changes_V0-F2_EXECUTABLE_CONTRACTS_ERRORS_AND_IDEMPOTENCY_SPRINT.md`:

```text
node --test tests/integration/idempotency.test.mjs
failed because duplicate input created a second workspace and missing Idempotency-Key returned 201
```

```text
node --test tests/unit/db-schema.test.mjs
failed because IdempotencyRecord and migration 0002_v0_f2_idempotency_records were absent
```

## Green Evidence

```text
node --test tests\integration\idempotency.test.mjs
tests 2
pass 2
```

```text
node --test tests\contract\openapi-generation.test.mjs tests\e2e\generated-client-smoke.test.mjs tests\unit\db-schema.test.mjs
tests 8
pass 8
```

```text
.\pnpm.cmd test:rls
tests 2
pass 2
```

```text
.\pnpm.cmd verify
Format check passed for 197 text files.
Lint passed: no obvious secrets, signed URLs or unsafe SQL patterns.
tests 29
pass 29
Database contract valid for V0-F2 identity, idempotency and RLS.
V0-F0/F1/F2 local verification passed.
```

## Remaining Gaps

- Runtime idempotency record is not persisted in PostgreSQL.
- Contract-diff CI is represented locally by generation/tests; CI evidence is not retained.
- Browser field-level validation demonstration is not retained as screenshot evidence.
