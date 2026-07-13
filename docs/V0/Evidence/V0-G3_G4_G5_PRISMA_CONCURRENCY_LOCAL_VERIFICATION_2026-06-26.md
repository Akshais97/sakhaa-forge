# V0-G3/G4/G5 Prisma Concurrency Hardening Local Verification — 2026-06-26

## Slice

V0-G3 (Versioned Estimate And Atomic Reservation), V0-G4 (Exactly-Once HeyGen Submission)
and V0-G5 (Retained Generated Media And Settled Credits) — paid/provider path concurrency
hardening under the Prisma runtime store (`V0_RUNTIME_DB=prisma`).

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_HEYGEN_INTEGRATION.md`
- `docs/V0/V0_HEYGEN_COST_MODEL.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS_SECURITY.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAIL_JOBS_AND_WORKERS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Problem verified

The green G3/G4/G5 verification proved the happy path and the single-call crash-recovery
path, but it did not exercise two concurrent caller actions against the same Prisma row
set. Under PostgreSQL `READ COMMITTED` (the Prisma default), a concurrent `INSERT` against
a unique index blocks until the first transaction commits or rolls back, then raises a
Prisma `P2002` (unique-constraint violation) or `P2034` (transaction write conflict).
Before this change, those conflicts escaped the store as a raw `500 RUNTIME_DB_WRITE_FAILED`
on the G4 submit and G5 settle paths, and the G3 confirm path could double-reserve credits
because two concurrent confirmations both read the same `awaiting_confirmation` estimate
and both wrote a job, a reservation and a `RESERVE` ledger entry.

## Behaviour verified after the fix

- **G3 confirmation is atomic and single-reserving.** `confirmGenerationEstimate` (Prisma
  path) now claims the estimate with a conditional `updateMany` keyed on
  `id, workspaceId, status: "awaiting_confirmation", version, inputHash` and requires
  `count === 1` before creating the job, reservation or `RESERVE` ledger entry. The wallet
  debit is conditional and atomic: `updateMany({ where: { id, balanceMinor: { gte:
  maximumAuthorizedMinor } }, data: { balanceMinor: { decrement: maximumAuthorizedMinor } } })`,
  mapped to `CREDIT_BALANCE_INSUFFICIENT` (409) when `count !== 1`. A losing concurrent
  confirmation either fails the conditional claim (re-read and classified to
  `WORKSPACE_ACCESS_DENIED` / `CREDIT_RESERVATION_CONFLICT` / `RESOURCE_VERSION_STALE` /
  `ESTIMATE_INPUT_CHANGED`) or raises `P2002`/`P2034`, which the outer `try/catch` maps to
  `CREDIT_RESERVATION_CONFLICT` (409). A concurrent double-reserve is now impossible: one
  estimate becomes `credits_reserved` once, one job is created, one `ACTIVE` reservation is
  written, one `RESERVE` ledger entry is written, and the wallet is debited once.
- **G4 submission normalizes unique collisions.** `submitGenerationJob` (Prisma path) wraps
  its first short transaction in a `try/catch`. On `P2002`/`P2034` it calls
  `reconcilePrismaSubmitRace`, which re-reads the provider operation by idempotency key and
  by job. A same-key collision returns a replay (`replay: true`); a different-key collision
  returns `IDEMPOTENCY_INPUT_CONFLICT` (409); a non-queued job returns
  `GENERATION_JOB_NOT_SUBMITTABLE` (409). The provider-operation unique indexes
  (`unique(workspace_id, idempotency_key)` and `unique(generation_job_id)`) make submission
  exactly-once per job; a raw DB failure is never leaked.
- **G5 settlement normalizes unique collisions to a replay or a recovery.**
  `settleGenerationJob` (Prisma path) wraps both its short transactions in `try/catch`.
  The first (retain/release/replay) transaction, on `P2002`/`P2034`, calls
  `reconcilePrismaSettleRace`: a `CAPTURED`/`RELEASED` reservation is replayed; an `ACTIVE`
  reservation with a committed segment is recovered into the capture phase; anything else is
  `GENERATION_JOB_NOT_SUBMITTABLE` (409); a cross-workspace settle hides behind
  `WORKSPACE_ACCESS_DENIED` (404). The second (capture) transaction now returns `replay:
  true` without writing when the `g5-capture-{jobId}` ledger entry already exists, and its
  outer `try/catch` maps a capture-key `P2002`/`P2034` to a replay after re-reading the
  reservation. One captured settlement (`replay: false`) and one replay (`replay: true`) is
  the only outcome under concurrency: one segment, one versioned asset, one creative lineage
  row, one `CAPTURE` ledger entry, and the wallet settled exactly once.
- The crash-window `crash_after_retain` recovery path is unchanged and remains sequential:
  the first call retains media and returns `DEPENDENCY_UNAVAILABLE` (503); the second call
  detects the committed segment, completes the `CAPTURE` ledger once, and never re-retains.
  The concurrency `try/catch` wrappers do not fire in that sequential mode.
- No new error code is introduced. The fixes reuse `CREDIT_RESERVATION_CONFLICT`,
  `CREDIT_BALANCE_INSUFFICIENT`, `IDEMPOTENCY_INPUT_CONFLICT`, `GENERATION_JOB_NOT_SUBMITTABLE`,
  `RESOURCE_VERSION_STALE`, `ESTIMATE_INPUT_CHANGED` and `WORKSPACE_ACCESS_DENIED` from the
  V0 error catalog. Provider payloads, secrets, signed URLs and the HeyGen webhook secret
  are never returned; cross-tenant existence never leaks; money stays integer minor units.

## Red evidence

Commands (run with `V0_RUNTIME_DB_PROOF=1` so the gated runtime tests execute against the
real Supabase PostgreSQL):

```text
V0_RUNTIME_DB_PROOF=1 node --test --test-name-pattern="concurrent G3 confirmation" tests/integration/prisma-runtime.test.mjs
V0_RUNTIME_DB_PROOF=1 node --test --test-name-pattern="concurrent G4 submission" tests/integration/prisma-runtime.test.mjs
V0_RUNTIME_DB_PROOF=1 node --test --test-name-pattern="concurrent G5 settlement" tests/integration/prisma-runtime.test.mjs
```

Observed failures before the fix (two concurrent caller actions against the same fresh
estimate / queued job / completed job, different idempotency keys):

- G3: both confirmations returned `202`, two generation jobs were created for one estimate,
  two `RESERVE` ledger entries were written, and the wallet was debited twice (balance
  `−46,000` instead of `2,000`).
- G4: one submission returned a raw `500 RUNTIME_DB_WRITE_FAILED` from the
  `provider_operations` unique-constraint collision.
- G5: one settlement returned a raw `500 RUNTIME_DB_WRITE_FAILED` from the
  `generated_segments` / `credit_ledger_entries` unique-constraint collision.

## Green evidence

Commands:

```text
V0_RUNTIME_DB_PROOF=1 node --test tests/integration/prisma-runtime.test.mjs
```

Outcome:

```text
✔ prisma runtime rejects a concurrent G3 confirmation against the same fresh estimate under RLS
✔ prisma runtime maps a concurrent G4 submission for the same job to a stable conflict, not a 500
✔ prisma runtime maps a concurrent G5 settlement for the same job to a replay, not a 500
tests 12
pass 12
fail 0
skipped 0
```

Required concurrent proofs and outcomes:

- **G3 concurrent confirmation** — pass. Two `Promise.all` confirmations with different
  idempotency keys against the same fresh estimate yield statuses `[202, 409]`; the 409
  carries `CREDIT_RESERVATION_CONFLICT`; no `500` is surfaced; exactly one generation job
  exists for the estimate; exactly one `ACTIVE` reservation; exactly one `RESERVE` ledger
  entry; the wallet balance is `2,000` (50,000 − 48,000 reserved once).
- **G4 concurrent submission** — pass. Two `Promise.all` submissions with different
  idempotency keys against one queued job yield no `500`; one returns `202` and the other
  returns `409 IDEMPOTENCY_INPUT_CONFLICT` (or a `202` replay); exactly one provider
  operation exists for the job.
- **G5 concurrent settlement** — pass. Two `Promise.all` settlements with different
  idempotency keys against one completed job yield no `500`; one captures with
  `replay: false`; the other returns `202` with `replay: true` (or a controlled captured
  response); exactly one retained segment, one versioned asset, one creative lineage row,
  one `CAPTURE` ledger entry; the wallet balance is `2,000`.

## Full verification

Command:

```text
node scripts/verify.mjs
```

Outcome:

```text
tests 206
pass 194
fail 0
skipped 12

prisma runtime rejects a concurrent G3 confirmation against the same fresh estimate under RLS
prisma runtime maps a concurrent G4 submission for the same job to a stable conflict, not a 500
prisma runtime maps a concurrent G5 settlement for the same job to a replay, not a 500
tests 12
pass 12
fail 0
skipped 0

Database contract valid for V0-F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5 ... retained
generated segments/assets and creative lineage with reconciled provider total and settled
credits, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5 local verification passed.
```

The twelve skipped tests in the broad test glob are the runtime-proof tests intentionally
skipped there and run by the dedicated verification step immediately after, including the
three new G3/G4/G5 concurrency proofs against Supabase.

## Migration evidence

No migration is required. The concurrency hardening reuses the existing unique indexes
already created by the G3/G4/G5 migrations: `credit_reservations.unique(workspace_id,
generation_job_id)` with the one-active-per-job guard, `provider_operations.unique(
workspace_id, idempotency_key)` and `unique(generation_job_id)`,
`generated_segments.unique(workspace_id, generation_job_id, segment_index)`,
`generated_assets.unique(workspace_id, generation_job_id, version)`,
`creative_lineage.unique(workspace_id, generation_job_id)`, and
`credit_ledger_entries.unique(workspace_id, idempotency_key)`. No schema, RLS or enum
changed; `db-validate` remains green for V0-F0 through V0-G5.

## Downstream contract reference

This is a hardening of the existing G3/G4/G5 exactly-once, single-reserve and
single-settle contracts. It introduces no new route, model, status, error code, permission
or migration. `docs/V0/V0_API.md`, `docs/V0/V0_DATA_MODELS.md`, `docs/V0/V0_PRISMA_SCHEMA.md`,
`docs/V0/V0_STATUS_ENUMS.md`, `docs/V0/V0_JOBS.md` and `docs/V0/V0_ERROR_CATALOG.md` remain
accurate; the `CREDIT_RESERVATION_CONFLICT`, `CREDIT_BALANCE_INSUFFICIENT`,
`IDEMPOTENCY_INPUT_CONFLICT` and `GENERATION_JOB_NOT_SUBMITTABLE` entries already describe
the controlled outcomes now produced under concurrency.

## Scope note

This is local deterministic simulator evidence for the G3/G4/G5 paid/provider concurrency
guarantees against a real Supabase PostgreSQL instance. It does not claim production
HeyGen, Razorpay or publication readiness, and it does not change the V0 contract surface.
The concurrency proofs use the deterministic `heygen-simulator` and `razorpay` simulator
adapters and the `v0.local.1` price version. No credit is double-reserved, no provider
operation is double-submitted, no media is double-retained, and no capture or release is
written twice under concurrent caller actions.
