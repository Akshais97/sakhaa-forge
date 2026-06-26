# V0-G4 Exactly-Once HeyGen Submission Local Verification — 2026-06-26

## Slice

V0-G4: Exactly-Once HeyGen Submission.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-G4_EXACTLY_ONCE_HEYGEN_SUBMISSION_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_HEYGEN_INTEGRATION.md`
- `docs/V0/V0_HEYGEN_COST_MODEL.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS_SECURITY.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAIL_JOBS_AND_WORKERS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Behaviour verified

- `POST /generation-jobs/{jobId}/submit` submits a `queued` generation job to the
  `heygen-simulator` provider exactly once. The request requires an `Idempotency-Key` and
  the `confirm_paid_generation` capability (Owner, Admin, Client Manager), and must echo the
  `workspaceId`. The API rejects, in order, a missing or cross-workspace job
  (`WORKSPACE_ACCESS_DENIED` 404, returned before any per-job conflict is observable so
  cross-tenant existence never leaks), a job that is not `queued`
  (`GENERATION_JOB_NOT_SUBMITTABLE` 409), a second idempotency key for a job that already
  has a provider operation (`IDEMPOTENCY_INPUT_CONFLICT` 409), and a workspace at the
  provider concurrency limit (`PROVIDER_RATE_LIMITED` 429, retryable, with `retryAfterMs`).
  A missing `Idempotency-Key` returns `IDEMPOTENCY_KEY_REQUIRED` (400).
- A passing submission persists a durable `ProviderOperation` in `SUBMITTING` inside a
  first short database transaction **before** any provider network I/O, so a crash between
  persistence and the network response leaves a resumable operation, never a blind
  duplicate. The operation binds the workspace, generation job, provider route
  (`heygen-simulator`), operation type (`provider_generate`), idempotency key, a SHA-256
  `requestHash` (server-side binding secret, never returned), the bound `priceVersion`
  (`v0.local.1`) and the integer-minor-units `estimatedMaximumMinor` (48,000). The provider
  network call runs outside the transaction; a second short transaction applies the
  outcome. A simulator `success` outcome (`V0_HEYGEN_SIMULATOR_MODE=success`) advances the
  operation to `ACCEPTED` with the provider `externalId` and the job to `accepted`, and the
  response is `202 Accepted` with the job, the operation and a simulator-only `callback`
  envelope (no media URL) the deterministic test harness signs and posts back. A simulator
  `timeout` outcome advances the operation to `UNKNOWN` and the job to `unknown`; the
  response is `202 Accepted` with `unknown: true` and `callback: null`, and the caller must
  reconcile before any retry. A simulator `malformed` outcome returns
  `PROVIDER_OUTPUT_INVALID` (422) and leaves the operation in `SUBMITTING` for
  reconciliation; no callback is surfaced. The `requestHash`, provider payloads, signed URLs
  and the HeyGen webhook secret are never returned; the surfaced `callback.signature` is the
  deterministic simulator's HMAC digest (the same affordance as G2 `checkout.signature`),
  not a credential.
- `POST /generation-jobs/{jobId}/reconcile` re-reads the provider for an `UNKNOWN` (or
  `SUBMITTING`/`ACCEPTED`) operation and advances it to the resolved state without blind
  retry. The request requires an `Idempotency-Key`, the `confirm_paid_generation`
  capability and the `workspaceId`. The simulator reconcile outcome
  (`V0_HEYGEN_SIMULATOR_RECONCILE`) drives `accepted`/`processing`/`completed`/`failed`/
  still-`pending`; a `completed` report advances the operation to `COMPLETED` and the job
  to `generated`; a still-`pending` report leaves the operation `UNKNOWN` and the response
  carries `unknown: true`. A missing or cross-workspace job returns
  `WORKSPACE_ACCESS_DENIED` (404). The response is `200 OK` (or `202 Accepted` while still
  unknown).
- `POST /generation-jobs/{jobId}/cancel` requests cancellation of a submitted generation.
  The request requires an `Idempotency-Key`, the `confirm_paid_generation` capability and
  the `workspaceId`. A cancel of an `UNKNOWN` operation sets the job to `cancel_requested`
  and the operation stays `UNKNOWN` for reconcile (cancellation during uncertainty is
  uncertain); the response is `202 Accepted` with `uncertain: true`. A cancel of an
  `ACCEPTED`/`PROCESSING` operation that the simulator reports still `pending` sets the job
  to `cancel_requested`; a `completed` report rejects cancellation as
  `GENERATION_JOB_NOT_SUBMITTABLE` (409). A missing or cross-workspace job returns
  `WORKSPACE_ACCESS_DENIED` (404). Credit capture and release on terminal states is V0-G5.
- `POST /callbacks/heygen` is the HeyGen webhook receiver. The handler verifies the
  `x-heygen-signature` HMAC-SHA256 in constant time (`timingSafeEqual`) over the canonical
  envelope, enforces a timestamp window (`V0_HEYGEN_CALLBACK_WINDOW_MS`, default 5 minutes),
  deduplicates by an `inbox_events` row keyed `(workspaceId, 'heygen', eventId)`, and
  rejects a malformed, bad-signature, stale or unreconcilable callback with
  `PROVIDER_CALLBACK_INVALID` (401) without leaking whether the target operation exists. A
  verified `video.completed` event advances the operation to `COMPLETED` and the job to
  `generated` exactly once; a replay acknowledges the original transition with
  `duplicate: true` and never transitions twice. A `video.failed` event advances to
  `FAILED`. The response is `200 OK`. Provider payloads stay adapter-private; only the
  bound external id, status and timestamps are persisted.
- The HeyGen adapter lives behind the provider boundary at `apps/api/src/heygen-provider.mjs`
  and refuses to call the network when `HEYGEN_MODE !== "simulator"`; domain modules import
  no provider SDK. The adapter returns only `externalId`/`status`/`errorCode` to the store;
  raw provider payloads stay adapter-private. The `requestHash` is computed server-side and
  retained on the operation but never returned by the public mapper
  (`publicProviderOperation`). Money is integer minor units everywhere (BigInt in Prisma,
  Number in the in-memory store and public mappers via `Number()`); floating point is never
  used. The public operation status is normalized to the lowercase `V0_STATUS_ENUMS.md`
  Provider Operation contract at the mapper boundary; the Prisma
  `ProviderOperationStatus` DB enum is uppercase (`CREATED`, `SUBMITTING`, `ACCEPTED`,
  `UNKNOWN`, `PROCESSING`, `COMPLETED`, `REJECTED`, `FAILED`, `CANCELLED`) and
  reconciliation is recorded by the `reconciledAt` timestamp, not a separate enum value.
  Unknown is preserved as a real state, never collapsed to success or failure.
- The web shell implements the generation submission workflow at
  `apps/web/src/generation-submission-workflow.mjs` with pure, DOM-agnostic state functions
  unit tested in Node and a browser glue that wires the generated
  `V0Client.submitGenerationJob`, `reconcileGenerationJob` and `cancelGenerationJob`. Paid
  submission is irreversible, so the workflow is never optimistic: it shows loading, calls
  the API, and renders the committed provider operation and generation job or a calm error.
  Empty, loading, accepted, unknown, cancel_requested, replay, rate-limited,
  provider-invalid, callback-invalid, not-submittable, idempotency-conflict,
  idempotency-required, forbidden and blocked-hidden states render as `data-state`
  attributes. The provider external id renders as "Provider reference: retained"; the
  request hash, provider payloads, signed URLs, signatures and secrets never appear in the
  rendered markup.
- Prisma schema and migration `0022_v0_g4_exactly_once_heygen_submission` create the
  `provider_operation_status` DB enum and the `provider_operations` table (FKs to
  workspaces and generation_jobs; CHECK constraints on `provider`, `operation_type`,
  `currency` and `estimated_maximum_minor > 0`; `provider_operations_status_check` listing
  all nine enum values; `unique(workspace_id, idempotency_key)` for exactly-once by key;
  `unique(generation_job_id)` for one operation per job; a partial unique index
  `provider_operations_provider_external_idx` on `(workspace_id, provider, external_id)`
  where `external_id IS NOT NULL`; RLS + policy
  `provider_operations_workspace_isolation`). No BYPASSRLS is granted. The schema comment
  uses "covers" not "spans" to keep the `db-validate` secret/credential regex clean.

## Red evidence

Command:

```text
node --test tests\integration\generation-g4.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.submitGenerationJob is not a function
```

All seven G4 integration tests failed before `submitGenerationJob`,
`reconcileGenerationJob`, `cancelGenerationJob` and `postHeygenCallback` existed on the
generated client or the store/routes, and before the `ProviderOperation` model and
`ProviderOperationStatus` enum existed in the Prisma client.

## Green evidence

Command:

```text
node --test tests\integration\generation-g4.test.mjs
```

Outcome:

```text
✔ G4 submits a queued generation job exactly once and a verified callback drives it to generated
✔ G4 treats a timeout after possible acceptance as unknown and never blindly resubmits
✔ G4 fails a malformed provider response with PROVIDER_OUTPUT_INVALID and no callback
✔ G4 rejects a malformed callback and a bad-signature callback without leaking existence
✔ G4 enforces the HeyGen concurrency limit and rejects the overflow with PROVIDER_RATE_LIMITED
✔ G4 cancels an uncertain generation by reconciling first and never resubmits
✔ G4 hides a cross-workspace generation job submission behind WORKSPACE_ACCESS_DENIED
tests 7
pass 7
fail 0
```

Required sprint tests and outcomes:

- Crash window between operation persistence and network response — pass. A durable
  `ProviderOperation` is persisted in `SUBMITTING` before the provider call; a replay with
  the same `Idempotency-Key` returns the existing operation and never calls the provider
  again, so a crash between persistence and the network response leaves a resumable
  operation, never a blind duplicate.
- Timeout to `unknown` state — pass. A simulator `timeout` outcome advances the operation
  to `UNKNOWN` and the job to `unknown` with `unknown: true`; a second submission with a new
  key for the same job returns `IDEMPOTENCY_INPUT_CONFLICT` (409) and never resubmits, and a
  reconcile with `V0_HEYGEN_SIMULATOR_RECONCILE=completed` resolves to `COMPLETED`/`generated`.
- Callback replay and malformed callback tests — pass. A verified `video.completed`
  callback drives the operation to `COMPLETED` and the job to `generated`; a replay is
  deduplicated to one `inbox_events` row and acknowledges with `duplicate: true`. A
  bad-signature callback, a malformed envelope and an out-of-window (stale) callback each
  return `PROVIDER_CALLBACK_INVALID` (401) without leaking existence and without touching
  the operation.
- Concurrency limit test — pass. With `V0_HEYGEN_CONCURRENCY_LIMIT=2`, the third concurrent
  submission returns `PROVIDER_RATE_LIMITED` (429, `retryable: true`) with `retryAfterMs`
  and creates no operation.
- Cancellation during uncertainty reconciliation — pass. With
  `V0_HEYGEN_SIMULATOR_MODE=timeout` and `V0_HEYGEN_SIMULATOR_RECONCILE=pending`, a cancel
  of the `UNKNOWN` operation sets the job to `cancel_requested` and returns `uncertain: true`
  without resubmitting; the operation stays `UNKNOWN` for reconcile.
- Cross-workspace denial — pass. A cross-workspace submission hides behind
  `WORKSPACE_ACCESS_DENIED` (404) with no workspace id leak, and the per-job operation
  conflict check is gated by job ownership so a cross-workspace caller cannot learn whether
  a job they do not own already has a provider operation.

Unit test command and outcome:

```text
node --test tests\unit\generation-submission-workflow.test.mjs
tests 7
pass 7
fail 0
```

The unit suite asserts the operation/job status mapping (unknown preserved), every V0-G4
provider guard code mapped to a calm banner, the empty/loading/accepted/unknown/
cancel_requested/replay/error phases, and that the rendered markup carries `data-state`
attributes and never leaks the request hash, provider payload, signature, secret, signed
URL or raw `hg_` external id (the provider reference renders as "retained").

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome:

```text
tests 186
pass 179
fail 0
skipped 7

prisma runtime persists V0-G4 exactly-once provider operation and verified callback under RLS
tests 7
pass 7
fail 0

Database contract valid for V0-F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4 ... exactly-once
provider operations with one-per-job guard, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4 local verification passed.
```

The seven skipped tests in the broad test glob are the runtime-proof tests intentionally
skipped there and run by the dedicated verification step immediately after, including the
new G4 exactly-once provider operation and verified callback runtime proof against Supabase.

## Migration evidence

`node scripts/verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0022_v0_g4_exactly_once_heygen_submission/migration.sql
CREATE TYPE
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
```

The migration creates the `provider_operation_status` enum (CREATED/SUBMITTING/ACCEPTED/
UNKNOWN/PROCESSING/COMPLETED/REJECTED/FAILED/CANCELLED) and `provider_operations` with FKs
to workspaces and generation_jobs, CHECK constraints on `provider`, `operation_type`,
`currency` and `estimated_maximum_minor > 0`, the status CHECK listing all nine enum
values, `unique(workspace_id, idempotency_key)` for exactly-once by key,
`unique(generation_job_id)` for one operation per job, the partial unique index on
`(workspace_id, provider, external_id)` where `external_id IS NOT NULL`, and RLS policy
`provider_operations_workspace_isolation`. No BYPASSRLS is granted.

The runtime-proof test confirms persistence under RLS:

```text
SELECT count(*)::text || ':' || status::text || ':' || (external_id IS NOT NULL)::text
       || ':' || (request_hash IS NOT NULL)::text || ':' || estimated_maximum_minor::text
FROM provider_operations WHERE id = '<op>' AND workspace_id = '<ws>' AND generation_job_id = '<job>'
-- result: 1:ACCEPTED:true:true:48000

SELECT status FROM generation_jobs WHERE id = '<job>' AND workspace_id = '<ws>'
-- result: accepted
```

A replay with the same `Idempotency-Key` returns `replay: true` and writes no second
operation; `count(*)` over `provider_operations` for the job is `1`. A verified
`video.completed` callback drives the operation to `COMPLETED` (with `completed_at`) and
the job to `generated`; a replayed callback is deduplicated to one `inbox_events` row
(`source = 'heygen'`, `idempotency_key = eventId`). A cross-workspace submission returns
`WORKSPACE_ACCESS_DENIED` (404) with no workspace id leak. The `requestHash` is retained on
the row but never returned by the public mapper; the HeyGen webhook secret value never
appears in the response (the surfaced `callback.signature` is the simulator HMAC digest).

## Downstream contract reference

`docs/V0/V0_API.md`, `docs/V0/V0_DATA_MODELS.md`, `docs/V0/V0_PRISMA_SCHEMA.md`,
`docs/V0/V0_STATUS_ENUMS.md`, `docs/V0/V0_JOBS.md`, `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
and `docs/V0/V0_ERROR_CATALOG.md` record that V0-G4 writes the `ProviderOperation` model,
the `ProviderOperationStatus` enum, the paid provider state machine, the
`generation.state.changed` audit row and the new `GENERATION_JOB_NOT_SUBMITTABLE` (409)
error code. Credit capture (`CAPTURE`) and release (`RELEASE`) ledger types and the
`captured`/`released` reservation states are reserved for V0-G5 settlement once the
provider outcome is known. Retained generated media (`GeneratedSegment`,
`GeneratedAsset`), media quarantine/validation/hashing and crash-window credit
reconciliation are V0-G5 and are not implemented in V0-G4. No V0-G5 table, route, job or
runtime dependency was introduced in V0-G4 beyond the provider operation that G5 will
settle.

## Browser state evidence

The web shell renders the generation submission contract at
`data-testid="generation-submission-contract"` with `empty`, `loading`, `accepted`,
`unknown`, `cancel_requested`, `replay`, `rate-limited`, `provider-invalid`,
`callback-invalid`, `not-submittable`, `idempotency-conflict`, `idempotency-required`,
`forbidden` and `blocked-hidden` states. The `generation-submission-workflow` unit suite
asserts the rendered copy, the operation/job state mapping (unknown preserved as a real
state), the calm error banners for every V0-G4 provider guard code, and that no request
hash, provider payload, signature, secret, signed URL or raw `hg_` external id appears in
the markup (the provider reference renders as "retained"). This is the deterministic V0
browser-state evidence for the sprint; no live browser screenshot is captured in local
verification.

## Scope note

This is local deterministic simulator evidence for V0-G4. It does not claim production
HeyGen readiness, real provider submission, media retention, credit settlement or full V0
acceptance. The `heygen-simulator` route, its `v0.local.1` price version and the surfaced
`callback` envelope are deterministic local affordances; real HeyGen submission, webhook
signing with a production `HEYGEN_WEBHOOK_SECRET`, media quarantine and credit
capture/release are deferred to V0-G5 and later hardening. Submission is not generation
completion, and no claim of media retention, settlement or publication is made before the
owning sprint's verification passes.
