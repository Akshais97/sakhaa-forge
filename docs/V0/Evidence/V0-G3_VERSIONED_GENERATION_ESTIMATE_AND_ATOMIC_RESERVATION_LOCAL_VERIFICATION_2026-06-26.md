# V0-G3 Versioned Generation Estimate And Atomic Reservation Local Verification — 2026-06-26

## Slice

V0-G3: Versioned Generation Estimate And Atomic Reservation.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-G3_VERSIONED_GENERATION_ESTIMATE_AND_ATOMIC_RESERVATION_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_HEYGEN_COST_MODEL.md`
- `docs/V0/V0_HEYGEN_INTEGRATION.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS_SECURITY.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Behaviour verified

- `POST /generation-estimates` (extended in V0-G3) binds the estimate to an active
  `ProviderPriceVersion` for the `heygen-simulator` route and INR currency, records a
  SHA-256 `inputHash` over the selected script, avatar and duration, sets an `expiresAt`
  from `V0_ESTIMATE_TTL_MS` (default 15 minutes, overridable for deterministic expiry
  tests) and an optimistic `version` of 1, and returns the price version
  (`v0.local.1`), the integer-minor-units `maximumAuthorizedMinor` (48,000 for the
  30-second pilot cap), the `durationSeconds` and the expiry. The estimate starts in
  `awaiting_confirmation`. The `inputHash` is a server-side validation secret and is
  never returned. Reservation does not imply provider submission (that is V0-G4).
- `POST /generation-estimates/{estimateId}/confirm` is the atomic credit reservation. The
  request requires an `Idempotency-Key` and the `confirm_paid_generation` capability
  (Owner, Admin, Client Manager), and must echo the `workspaceId`, estimate `version`,
  `selectedScriptId`, `avatarProfileId` and `durationSeconds` the user saw. The API
  rejects, in order, an estimate that is no longer `awaiting_confirmation`
  (`CREDIT_RESERVATION_CONFLICT` 409), an optimistic-version mismatch
  (`RESOURCE_VERSION_STALE` 409), a changed script/avatar/duration
  (`ESTIMATE_INPUT_CHANGED` 409, retryable), an expired estimate (`ESTIMATE_EXPIRED` 409,
  retryable) and a wallet balance below the authorized maximum
  (`CREDIT_BALANCE_INSUFFICIENT` 409). A passing confirmation creates exactly one
  `GenerationJob` in the `queued` state, one active `CreditReservation` for the
  authorized maximum, and exactly one `RESERVE` ledger entry that debits the wallet in
  integer minor units, all inside one short database transaction and before any provider
  network I/O. The estimate transitions to `credits_reserved` with a `confirmedAt`
  timestamp, and a durable `generation.confirmed` audit row (target type `GenerationJob`)
  is retained. The response is `202 Accepted` with the estimate, job, reservation, ledger
  entry and updated wallet. A replay with the same `Idempotency-Key` returns the original
  confirmation and never reserves a second time; a replay with different details returns
  `IDEMPOTENCY_INPUT_CONFLICT` (409). A missing `Idempotency-Key` returns
  `IDEMPOTENCY_KEY_REQUIRED` (400).
- Double-click and concurrent confirmation of the same estimate are guarded by the
  estimate status check in the in-memory store and by the partial unique index
  `credit_reservations_one_active_per_job_idx` (`status = 'ACTIVE'`) in Postgres, so
  credits cannot be reserved twice for one job. Two concurrent confirmations with
  different idempotency keys resolve to one `202` and one `409`
  `CREDIT_RESERVATION_CONFLICT`; an idempotent replay of the winning key returns the same
  generation job and the wallet ledger shows exactly one `RESERVE` debit.
- `GET /generation-jobs/{jobId}` returns the queued generation job and its active
  reservation for the workspace. The endpoint requires the `confirm_paid_generation`
  capability. A missing or cross-workspace estimate or job is hidden behind
  `WORKSPACE_ACCESS_DENIED` (404), never a 409 that leaks existence, and the other
  workspace id never appears in the error body.
- Money is integer minor units everywhere (BigInt in Prisma, Number in the in-memory
  store and public mappers via `Number()`); floating point is never used for storage,
  math or display. The `RESERVE` ledger entry is a negative signed debit
  (`-maximumAuthorizedMinor`) that binds the `generationJobId`. The public estimate, job
  and reservation statuses are normalized to the lowercase `V0_STATUS_ENUMS.md` contract
  (`awaiting_confirmation`, `credits_reserved`, `queued`, `active`) at the mapper
  boundary; the Prisma `CreditReservationStatus` DB enum is uppercase (`ACTIVE` etc.) and
  the `GenerationJob.status` column stores the lowercase Generation enum as a string
  (authoritative over the `JobStatus` placeholder) so provider-specific raw states map in
  without merge or rename. The ledger `type` is uppercase (`RESERVE`).
- The web shell implements the generation confirmation workflow at
  `apps/web/src/generation-confirmation-workflow.mjs` with pure, DOM-agnostic state
  functions unit tested in Node and a browser glue that wires the generated
  `V0Client.confirmGenerationEstimate` and `V0Client.getGenerationJob`. Paid confirmation
  is irreversible, so the workflow is never optimistic: it shows loading, calls the API,
  and renders the committed confirmation or a calm error. Empty, loading, awaiting,
  reserved, insufficient, expired, input-changed, stale, conflict, idempotency-required,
  forbidden and blocked-hidden states render as `data-state` attributes. Money renders
  from integer minor units with integer math; no input hash, signed URL, provider
  payload or secret ever appears in the rendered markup.
- Prisma schema and migration `0021_v0_g3_versioned_generation_estimate_and_atomic_reservation`
  create the `credit_reservation_status` DB enum; extend `generation_estimates` with
  `input_hash`, `expires_at`, `version`, `confirmed_at` and `duration_seconds`; create
  `provider_price_versions` (global, no `workspace_id`, no RLS, seeded with the
  deterministic `heygen-simulator` `v0.local.1` INR rate) with
  `unique(provider, price_version)`; create `generation_jobs` (FKs to workspaces,
  generation_estimates and brand_profiles, `generation_jobs_status_check` listing all 13
  Generation enum values, `unique(workspace_id, idempotency_key)`, RLS + policy
  `generation_jobs_workspace_isolation`); and create `credit_reservations` (FKs,
  `credit_reservations_amount_check` (`amount_minor > 0`),
  `unique(workspace_id, idempotency_key)`, the partial unique index
  `credit_reservations_one_active_per_job_idx` on `(generation_job_id) WHERE status =
  'ACTIVE'`, RLS + policy `credit_reservations_workspace_isolation`). No BYPASSRLS is
  granted. The `RESERVE`, `CAPTURE` and `RELEASE` ledger types and the nullable
  `credit_ledger_entries.generation_job_id` column already exist from migration 0020; G3
  binds the reservation to a generation job.

## Red evidence

Command:

```text
node --test tests\integration\generation-g3.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.confirmGenerationEstimate is not a function
```

All nine G3 integration tests failed before `confirmGenerationEstimate` and
`getGenerationJob` existed on the generated client or the store/routes, and before the
`GenerationJob`, `CreditReservation` and `ProviderPriceVersion` models existed in the
Prisma client.

## Green evidence

Command:

```text
node --test tests\integration\generation-g3.test.mjs
```

Outcome:

```text
✔ G3 confirms a versioned estimate and atomically reserves credits with one RESERVE ledger entry
✔ G3 blocks confirmation when the wallet balance is below the authorized maximum
✔ G3 rejects a changed script at confirmation with ESTIMATE_INPUT_CHANGED
✔ G3 rejects a stale estimate with ESTIMATE_EXPIRED
✔ G3 rejects an optimistic-version mismatch with RESOURCE_VERSION_STALE
✔ G3 prevents double-click and concurrent over-reservation and deduplicates idempotent replays
✔ G3 requires an idempotency key to confirm a paid generation
✔ G3 hides a cross-workspace estimate confirmation behind WORKSPACE_ACCESS_DENIED
✔ G3 hides a cross-workspace generation job behind WORKSPACE_ACCESS_DENIED
tests 9
pass 9
fail 0
```

Required sprint tests and outcomes:

- Concurrent reservation — pass. Two concurrent confirmations resolve to one `202` and
  one `409` `CREDIT_RESERVATION_CONFLICT`; an idempotent replay returns the same job and
  the wallet ledger shows exactly one `RESERVE` debit.
- Stale estimate rejection — pass. An expired estimate (1ms TTL) returns
  `ESTIMATE_EXPIRED` (409) and reserves nothing.
- Insufficient balance — pass. A wallet funded below the authorized maximum returns
  `CREDIT_BALANCE_INSUFFICIENT` (409) and creates no job, reservation or debit.
- Input hash mismatch rejection — pass. A changed `selectedScriptId` at confirmation
  returns `ESTIMATE_INPUT_CHANGED` (409).
- One-reservation ledger proof — pass. One `RESERVE` ledger entry, one active
  reservation and one `queued` generation job are written; the wallet is debited from
  50,000 to 2,000 minor units.
- Idempotency key required — pass. A confirmation without an `Idempotency-Key` returns
  `IDEMPOTENCY_KEY_REQUIRED` (400).
- Cross-workspace denial — pass. A cross-workspace estimate confirmation and a
  cross-workspace generation job read both hide behind `WORKSPACE_ACCESS_DENIED` (404)
  with no workspace id leak.

Unit test command and outcome:

```text
node --test tests\unit\generation-confirmation-workflow.test.mjs
tests 9
pass 9
fail 0
```

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome:

```text
tests 171
pass 165
fail 0
skipped 6

prisma runtime persists V0-G3 versioned estimate, atomic reservation and one RESERVE ledger entry under RLS
tests 6
pass 6
fail 0

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3 local verification passed.
```

The six skipped tests in the broad test glob are the runtime-proof tests intentionally
skipped there and run by the dedicated verification step immediately after, including the
new G3 versioned estimate and atomic reservation runtime proof against Supabase.

## Migration evidence

`node scripts/verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0021_v0_g3_versioned_generation_estimate_and_atomic_reservation/migration.sql
CREATE TYPE
ALTER TABLE
CREATE TABLE
CREATE INDEX
INSERT 0 1
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
```

The migration creates the `credit_reservation_status` enum (ACTIVE/CAPTURED/RELEASED/
EXPIRED/ADJUSTED), extends `generation_estimates` with the versioned-estimate guard
columns (backfilled to version 1 and a 30s duration for existing rows), creates
`provider_price_versions` (global, seeded with the deterministic simulator rate), creates
`generation_jobs` with the status CHECK, exactly-once idempotency unique index and RLS
policy, and creates `credit_reservations` with the amount CHECK, exactly-once idempotency
unique index, the partial unique index `credit_reservations_one_active_per_job_idx`
(`status = 'ACTIVE'`) and RLS policy. No BYPASSRLS is granted.

The runtime-proof test confirms persistence under RLS:

```text
SELECT status || ':' || (input_hash IS NOT NULL)::text || ':' || version::text FROM generation_estimates WHERE id = '<estimate>'
-- result: credits_reserved:true:1

SELECT balance_minor::text FROM credit_wallets WHERE id = '<wallet>' AND workspace_id = '<ws>'
-- result: 2000

SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '<ws>' AND wallet_id = '<wallet>' AND type = 'RESERVE' AND generation_job_id = '<job>'
-- result: 1

SELECT count(*)::text || ':' || status FROM generation_jobs WHERE id = '<job>' AND workspace_id = '<ws>' AND estimate_id = '<estimate>' GROUP BY status
-- result: 1:queued

SELECT count(*)::text || ':' || status::text FROM credit_reservations WHERE id = '<reservation>' AND workspace_id = '<ws>' AND generation_job_id = '<job>' GROUP BY status
-- result: 1:ACTIVE
```

A 50,000 minor-unit (INR 500.00) wallet funds a 48,000 minor-unit (INR 480.00) authorized
maximum for a 30-second `v0.local.1` estimate; confirmation debits the wallet to 2,000
minor units with one `RESERVE` ledger entry, one `queued` generation job and one `ACTIVE`
reservation. A second concurrent confirmation of the same estimate returns
`CREDIT_RESERVATION_CONFLICT` (409) and writes no second debit; the partial unique index
holds the one-active-reservation-per-job invariant. A cross-workspace generation job read
returns `WORKSPACE_ACCESS_DENIED` (404) with no workspace id leak. The public API returns
the estimate, job and reservation statuses as lowercase per the `V0_STATUS_ENUMS.md`
contract while the DB stores `credits_reserved`, `queued` and `ACTIVE`.

## Downstream contract reference

`docs/V0/V0_API.md`, `docs/V0/V0_DATA_MODELS.md`, `docs/V0/V0_PRISMA_SCHEMA.md`,
`docs/V0/V0_STATUS_ENUMS.md` and `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md` record that
V0-G3 writes the `RESERVE` ledger type and binds the reservation to a `GenerationJob`.
The `CAPTURE` and `RELEASE` ledger types and the `captured`/`released` reservation states
are reserved for V0-G5 settlement once the provider outcome is known. Provider submission
(`submitting`, `accepted`, `unknown`, `generating`, `generated`), the `ProviderOperation`
model, HeyGen callbacks and cancellation are V0-G4 and are not implemented in V0-G3; the
`generation_jobs/{id}/cancel` route is documented for V0-G4 and is not yet wired. No
V0-G4 or V0-G5 table, route, job or runtime dependency was introduced in V0-G3 beyond the
queued generation job and active reservation that G4 will submit.

## Browser state evidence

The web shell renders the generation confirmation contract at
`data-testid="generation-confirmation-contract"` with `empty`, `loading`, `awaiting`,
`reserved`, `insufficient`, `expired`, `input-changed`, `stale`, `conflict`,
`idempotency-required`, `forbidden` and `blocked-hidden` states. The
`generation-confirmation-workflow` unit suite asserts the rendered copy, the
integer-minor-units money formatting (no floating point), the estimate price version and
maximum authorization display, the reservation/ledger state mapping, and that no input
hash, signed URL, provider payload or secret appears in the markup. This is the
deterministic V0 browser-state evidence for the sprint, including the insufficient-credit
state; no live browser screenshot is captured in local verification.

## Scope note

This is local deterministic simulator evidence for V0-G3. It does not claim production
HeyGen readiness, provider submission, media retention, credit settlement or full V0
acceptance. The `heygen-simulator` `v0.local.1` price version is a deterministic
reference rate; real HeyGen price versions, provider submission, callbacks, media
quarantine and credit capture/release are deferred to V0-G4 and V0-G5. Reservation is not
provider submission, and no claim of generation, settlement or publication is made before
the owning sprint's verification passes.
