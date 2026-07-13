# V0-G5 Retained Generated Media And Settled Credits Local Verification — 2026-06-26

## Slice

V0-G5: Retained Generated Media And Settled Credits.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-G5_RETAINED_GENERATED_MEDIA_AND_SETTLED_CREDITS_SPRINT.md`
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

- `POST /generation-jobs/{jobId}/settle` settles a terminal paid generation by retaining the
  completed provider media into private V0 storage through the adapter only, validating and
  hashing it, binding it to `GeneratedSegment`/`GeneratedAsset`/`Artifact`/`CreativeLineage`,
  and capturing or releasing the reserved credits exactly once. The request requires an
  `Idempotency-Key`, the `confirm_paid_generation` capability (Owner, Admin, Client Manager)
  and the `workspaceId`. The API rejects, in order, a missing or cross-workspace job
  (`WORKSPACE_ACCESS_DENIED` 404, returned before any per-job state is observable so
  cross-tenant existence never leaks), a job whose provider operation is not terminal
  (`GENERATION_JOB_NOT_SUBMITTABLE` 409), and a missing `Idempotency-Key`
  (`IDEMPOTENCY_KEY_REQUIRED` 400). Settlement never changes the generation job status: the
  job stays `generated`/`failed`; settlement changes the reservation, the ledger and the
  retained media. The response is `202 Accepted`.
- For a `completed` provider operation the store fetches the provider media through the
  HeyGen adapter only (`apps/api/src/heygen-provider.mjs`). The transient provider URL is
  never retained: the adapter returns only `{ externalId, sha256, durationSeconds,
  contentType, byteSize, resolution, providerTotalMinor }`, and raw provider payloads stay
  adapter-private. The media is quarantined into a `QUARANTINED` `Artifact`, validated (SHA-256
  hash, non-zero byte size, positive duration, supported content type, non-negative provider
  total), then promoted to `CLEAN` with retention class `clean-media`, producer
  `job:{jobId}` and schema version `artifact.generated.v1`. A `GeneratedSegment` (clean
  artifact, provider external id, duration, hash), a versioned `GeneratedAsset` (version 1,
  kind `provider_video`, status `CLEAN`) and a `CreativeLineage` row (approved brand profile,
  selected script, consent-safe avatar, estimate, provider operation, price version
  `v0.local.1`) are created. The reconciled `providerTotalMinor` is written onto the provider
  operation. The simulator `success` mode (`V0_G5_SIMULATOR_MODE=success`) returns media whose
  provider total equals the authorized maximum (30 s × 1,600 = 48,000 = `estimatedMaximumMinor`).
- The provider total is reconciled against the authorized maximum before any credit capture.
  If `providerTotalMinor > estimatedMaximumMinor` the settlement is refused with
  `PROVIDER_COST_EXCEEDS_AUTHORIZATION` (409) and no capture or release is written; the
  reservation stays `active` and the wallet is untouched. If the provider media is unreadable
  or fails validation the settlement is refused with `ASSET_MEDIA_MALFORMED` (422) and no
  capture is written. Media is not clean until artifact validation passes.
- Credit settlement is idempotent and append-only. On success a single `CAPTURE` ledger entry
  is written with amount `(estimatedMaximumMinor - providerTotalMinor)` in integer minor units,
  which is `0` when the actual provider total equals the maximum (deterministic `v0.local.1`
  success case); the reservation moves to `captured`. On failure (`failed`/`rejected`/`cancelled`
  operation) a single `RELEASE` ledger entry is written with the full reservation amount, the
  wallet is restored, and the reservation moves to `released`; no media is retained for a
  failed operation. The CAPTURE/RELEASE ledger entries carry job-derived idempotency keys
  (`g5-capture-{jobId}` / `g5-release-{jobId}`) so a crash recovery re-uses the same key and
  the store checks for an existing entry before writing, preventing orphaned capture or
  duplicate release. Replay is detected by reservation status (`captured`/`released`), not by
  the caller's `Idempotency-Key`, so a replay with a different key still returns `replay: true`
  and never settles a second time.
- A crash between media retention and ledger settlement is recovered once. In the
  `crash_after_retain` simulator mode the first settle call retains the media (commits the
  segment/asset/lineage/artifact and writes `providerTotalMinor`) then returns
  `DEPENDENCY_UNAVAILABLE` (503) before the ledger entry; the second call detects the existing
  segment, completes the CAPTURE ledger exactly once, moves the reservation to `captured`, and
  never re-retains or double-captures. The provider total is set at retain time so recovery
  reads it without re-fetching the provider.
- The HeyGen adapter lives behind the provider boundary and refuses network calls when
  `HEYGEN_MODE !== "simulator"`; domain modules import no provider SDK. The `requestHash`,
  provider payloads, transient media URLs, signed URLs and the HeyGen webhook secret are never
  returned; the retained segment `externalId` is the bound provider id, not a URL. Money is
  integer minor units everywhere (BigInt in Prisma, Number in the in-memory store and public
  mappers via `Number()`); floating point is never used. The public artifact trust status is
  returned UPPERCASE (`CLEAN`/`REJECTED`) per the V0-F3 AssetTrustStatus contract; the credit
  reservation status is returned lowercase (`active`/`captured`/`released`) per
  `V0_STATUS_ENUMS.md`; the ledger `type` is UPPERCASE (`CAPTURE`/`RELEASE`). Unknown is
  preserved as a real state, never collapsed to success or failure.
- The web shell implements the generation settlement workflow at
  `apps/web/src/generation-settlement-workflow.mjs` with pure, DOM-agnostic state functions
  unit tested in Node and a browser glue that wires the generated
  `V0Client.settleGenerationJob`. Settlement is a billing action on an already-authorized
  reservation, so the workflow is never optimistic: it shows loading, calls the API, and
  renders the committed settlement or a calm error. Empty, loading, captured, released,
  replay, cost-exceeds, media-malformed, dependency-unavailable, not-submittable,
  idempotency-required, forbidden and blocked-hidden states render as `data-state`
  attributes. The provider external id renders as "Provider reference: retained"; the
  provider URL, raw hash, signature, secret and signed URL never appear in the rendered
  markup.
- Prisma schema and migration `0023_v0_g5_retained_generated_media_and_settled_credits` add
  `provider_total_minor BIGINT` and `settled_at TIMESTAMPTZ` to `provider_operations`, and
  create `generated_segments`, `generated_assets` and `creative_lineage`. Each table has FKs
  to `workspaces` and its owning rows, CHECK constraints (`provider` non-empty, duration and
  byte size positive, version positive, `generated_assets_status_check` listing
  `CLEAN`/`REJECTED`/`SUPERSEDED`), `unique(workspace_id, generation_job_id, ...)` indexes
  for exactly-once retention per job, and RLS + `*_workspace_isolation` policies keyed on
  `app.current_workspace_id`. No BYPASSRLS is granted. The schema comment uses "covers" not
  "spans" to keep the `db-validate` secret/credential regex clean.

## Red evidence

Command:

```text
node --test tests\integration\generation-g5.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.settleGenerationJob is not a function
```

All eight G5 integration tests failed before `settleGenerationJob` existed on the generated
client or the store/routes, and before the `GeneratedSegment`, `GeneratedAsset` and
`CreativeLineage` models and the `provider_operations.provider_total_minor`/`settled_at`
columns existed in the Prisma client.

## Green evidence

Command:

```text
node --test tests\integration\generation-g5.test.mjs
```

Outcome:

```text
✔ G5 settles a completed generation by retaining validated media and capturing credits once
✔ G5 releases the full reservation once when the provider operation failed
✔ G5 blocks settlement when the provider total exceeds the authorized maximum
✔ G5 rejects corrupt provider media and never captures credits
✔ G5 recovers a crash between media retention and ledger settlement without orphaned capture or duplicate release
✔ G5 settles exactly once: an idempotent replay returns the original settlement and never captures twice
✔ G5 hides a cross-workspace settlement behind WORKSPACE_ACCESS_DENIED
✔ G5 refuses to settle a generation whose provider operation is not terminal
tests 8
pass 8
fail 0
```

Required sprint tests and outcomes:

- Success capture test — pass. A completed generation retains a `CLEAN` artifact (SHA-256
  matched), a segment (30 s, bound artifact), a version-1 `CLEAN` asset and a lineage row
  bound to the job, writes one `CAPTURE` ledger entry, moves the reservation to `captured`,
  and leaves the wallet at 2,000 (the unused return is 0 because the actual provider total
  equals the 48,000 maximum).
- Failure release test — pass. A failed provider operation writes one `RELEASE` ledger entry,
  returns the full 48,000 reservation, restores the wallet to 50,000, moves the reservation
  to `released`, and retains no media.
- Provider total mismatch classification — pass. With `V0_G5_SIMULATOR_MODE=cost_mismatch`
  the provider total exceeds the authorization; settlement returns
  `PROVIDER_COST_EXCEEDS_AUTHORIZATION` (409) and writes no capture or release.
- Crash-window reconciliation — pass. With `V0_G5_SIMULATOR_MODE=crash_after_retain` the
  first settle retains media then returns `DEPENDENCY_UNAVAILABLE` (503) with no capture; the
  second call recovers, completes the CAPTURE ledger exactly once, and leaves the wallet at
  2,000 with one capture.
- Corrupt/missing media rejection — pass. With `V0_G5_SIMULATOR_MODE=malformed_media`
  settlement returns `ASSET_MEDIA_MALFORMED` (422) and writes no capture.
- Exactly-once replay — pass. A replay with a different `Idempotency-Key` returns
  `replay: true`, the same operation id and the captured outcome, and never writes a second
  capture.
- Cross-workspace denial — pass. A cross-workspace settle hides behind
  `WORKSPACE_ACCESS_DENIED` (404) with no workspace id leak.
- Non-terminal operation refusal — pass. A job whose operation is still `ACCEPTED` (no
  callback posted) returns `GENERATION_JOB_NOT_SUBMITTABLE` (409) and writes no capture.

Unit test command and outcome:

```text
node --test tests\unit\generation-settlement-workflow.test.mjs
tests 7
pass 7
fail 0
```

The unit suite asserts the reservation/outcome status mapping (unknown preserved), every
V0-G5 settlement guard code mapped to a calm banner, the empty/loading/captured/released/
replay/error phases, that the media section is omitted for a released settlement, and that
the rendered markup carries `data-state` attributes and never leaks the provider external
id, raw hash, signature, secret, signed URL or transient URL (the provider reference renders
as "retained").

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome:

```text
tests 203
pass 194
fail 0
skipped 9

prisma runtime persists V0-G5 retained media, settled credits and crash recovery under RLS
prisma runtime recovers a V0-G5 crash between media retention and ledger settlement
tests 9
pass 9
fail 0

Database contract valid for V0-F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5 ... retained
generated segments/assets and creative lineage with reconciled provider total and settled
credits, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5 local verification passed.
```

The nine skipped tests in the broad test glob are the runtime-proof tests intentionally
skipped there and run by the dedicated verification step immediately after, including the two
new G5 retained media, settled credits and crash recovery runtime proofs against Supabase.

## Migration evidence

`node scripts/verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0023_v0_g5_retained_generated_media_and_settled_credits/migration.sql
ALTER TABLE
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
```

The migration adds `provider_total_minor BIGINT` and `settled_at TIMESTAMPTZ` to
`provider_operations`, and creates `generated_segments` (clean retained artifact, provider
external id, duration, SHA-256, with `unique(workspace_id, generation_job_id, segment_index)`),
`generated_assets` (versioned, `unique(workspace_id, generation_job_id, version)`,
`generated_assets_status_check` over `CLEAN`/`REJECTED`/`SUPERSEDED`) and `creative_lineage`
(`unique(workspace_id, generation_job_id)` for one lineage row per job). Each table enables
RLS with a `*_workspace_isolation` policy keyed on `app.current_workspace_id`. No BYPASSRLS
is granted. The transient provider URL is never stored.

The runtime-proof test confirms persistence under RLS:

```text
SELECT count(*)::text FROM generated_segments WHERE generation_job_id = '<job>' AND workspace_id = '<ws>'
-- result: 1
SELECT status FROM generated_assets WHERE generation_job_id = '<job>' AND workspace_id = '<ws>'
-- result: CLEAN
SELECT count(*)::text FROM creative_lineage WHERE generation_job_id = '<job>' AND workspace_id = '<ws>'
-- result: 1
SELECT provider_total_minor::text || ':' || (settled_at IS NOT NULL)::text
       FROM provider_operations WHERE generation_job_id = '<job>' AND workspace_id = '<ws>'
-- result: 48000:true
SELECT status FROM credit_reservations WHERE generation_job_id = '<job>' AND workspace_id = '<ws>'
-- result: CAPTURED
SELECT count(*)::text FROM credit_ledger_entries WHERE wallet_id = '<wallet>' AND workspace_id = '<ws>' AND type = 'CAPTURE'
-- result: 1
```

The crash-recovery runtime proof confirms that a `crash_after_retain` first call retains the
segment (count `1`) and writes no capture (`0`), and the second call completes the CAPTURE
ledger once (`1`) and leaves the wallet at `2,000`. A cross-workspace settle returns
`WORKSPACE_ACCESS_DENIED` (404) with no workspace id leak. The `requestHash` and HeyGen
webhook secret never appear in any response; the retained `externalId` is the bound provider
id, not a URL.

## Downstream contract reference

`docs/V0/V0_API.md`, `docs/V0/V0_DATA_MODELS.md`, `docs/V0/V0_PRISMA_SCHEMA.md`,
`docs/V0/V0_STATUS_ENUMS.md`, `docs/V0/V0_JOBS.md`, `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
and `docs/V0/V0_ERROR_CATALOG.md` record that V0-G5 writes the `GeneratedSegment`,
`GeneratedAsset` and `CreativeLineage` models, the `provider_operations.provider_total_minor`
and `settled_at` columns, the `POST /generation-jobs/{jobId}/settle` endpoint, the
`generation.settled` audit row, the `CAPTURE`/`RELEASE` settlement ledger types and the
`captured`/`released` reservation states. The settlement error surface reuses existing V0
error codes — `ASSET_MEDIA_MALFORMED`, `PROVIDER_COST_EXCEEDS_AUTHORIZATION`,
`DEPENDENCY_UNAVAILABLE`, `GENERATION_JOB_NOT_SUBMITTABLE`, `WORKSPACE_ACCESS_DENIED`,
`PERMISSION_DENIED` and `IDEMPOTENCY_KEY_REQUIRED` — so no new error code is introduced.
Retained generated media quarantine, validation, hashing and crash-window credit
reconciliation are owned by V0-G5 and were not implemented in V0-G4.

## Browser state evidence

The web shell renders the generation settlement contract at
`data-testid="generation-settlement-contract"` with `empty`, `loading`, `captured`,
`released`, `replay`, `cost-exceeds`, `media-malformed`, `dependency-unavailable`,
`not-submittable`, `idempotency-required`, `forbidden` and `blocked-hidden` states. The
`generation-settlement-workflow` unit suite asserts the rendered copy, the reservation/outcome
state mapping (unknown preserved as a real state), the calm error banners for every V0-G5
settlement guard code, the omitted media section for a released settlement, and that no
provider external id, raw hash, signature, secret, signed URL or transient URL appears in the
markup (the provider reference renders as "retained"). This is the deterministic V0
browser-state evidence for the sprint; no live browser screenshot is captured in local
verification.

## Scope note

This is local deterministic simulator evidence for V0-G5. It does not claim production
HeyGen readiness, real provider media retention, real credit settlement or full V0
acceptance. The `heygen-simulator` route, its `v0.local.1` price version, the surfaced
`callback` envelope and the `V0_G5_SIMULATOR_MODE` media modes are deterministic local
affordances; real HeyGen media quarantine, B2 clean-media retention, real Razorpay credit
capture/release and publication are deferred to later hardening. Settlement is not
publication, and no claim of audience-facing verification, scheduling or publication is made
before the owning sprints' verification passes. No credit is captured before the provider
total is reconciled, and no release is written twice.
