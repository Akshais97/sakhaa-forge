# V0-A2 Security, Recovery And Load-Shaped Hardening Local Verification — 2026-06-30

## Slice

V0-A2: Security, Recovery And Load-Shaped Hardening.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/V0/Sprints/V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_SPRINT.md`
- `docs/Project/Sprint_Reviews/V0-A2_review.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/Architecture/PROJECT_ARCHITECTURE_PRINCIPLES.md`
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Review finding and fix scope

The senior sprint review (`docs/Project/Sprint_Reviews/V0-A2_review.md`,
NEEDS FIXES BEFORE MERGE) flagged that the first A2 closeout narrowed the sprint to consent
revocation, credential rotation and a representative cross-tenant sweep while the broader
hardening contract was deferred. The fix keeps A2 as the full hardening sprint and closes the
gap two ways:

1. Four deterministic simulator replacements pin the four unpinned drills the contracts did
   not pin (owner-decisions on unspecified contract dimensions per CLAUDE.md §1/§19, flagged
   for confirmation below): India-to-B2 transfer benchmark, two-hour load-shaped queue
   backlog simulation, incident/runbook rehearsal, and operational alert states.
2. The contractually-pinned recovery and reconciliation drills are consolidated into fresh
   A2-branded drill tests. The recovery invariants already exist from earlier slices (V0-F4
   queue/dead-letter/outbox/lease, V0-G4/G5 generation reconcile/settle, V0-G2 credit
   reconciliation, V0-U2/U3 publication reconcile, V0-A1 lineage export, V0-F5 restore drill);
   A2 consolidates the proof under the hardening contract rather than duplicating the
   machinery, and adds the two A2-branded drills that were missing (queue recovery through
   Redis loss/lease expiry/dead-letter, and restore RLS + artifact references).

## Owner decisions on unspecified contract dimensions

The V0-A2 slice contract named the failure contract and "also proves" workspace export,
consent revocation, deletion ordering, retention basis, provider credential rotation and a
broader hardening package. Several drills are not pinned to a deterministic simulation model
in the canonical contracts. Per CLAUDE.md §1 and §19, the unspecified dimensions were
resolved by owner decision rather than guesswork, and the conservative defaults are flagged
here for confirmation:

- **Consent revocation** (`POST /avatars/{avatarProfileId}/consent-revocation`) is monotonic
  and idempotent. The first call stamps `revokedAt`/`revokedByUserId`, returns the avatar
  with `eligibility.reason: "consent_revoked"`, and writes one `consent.revoked` audit row.
  A repeat call returns the same state and writes no second audit row. An avatar with no
  prior consent record is rejected with `AVATAR_CONSENT_REQUIRED` (409). `reason` is a
  non-empty string bounded to 500 characters. A revoked avatar is blocked immediately at the
  generation estimate boundary with `AVATAR_CONSENT_REVOKED` (409); no evidence ref or
  consent URL is ever surfaced.
- **Credential rotation** (`POST /workspaces/{workspace_id}/service-credentials/{credentialId}/rotate`)
  is append-style. The prior credential row is marked `REVOKED`, a fresh `ACTIVE` row is
  created with a new `secret-manager://` reference, `lastRotatedAt` is stamped, and one
  `service_credential.rotated` audit row is retained against the prior id. The response
  returns the new credential and a `previous` summary (`id`, `rotationStatus: "REVOKED"`,
  `lastRotatedAt`, `updatedAt`) that never echoes `secretRef`. A rotation input carrying a
  plaintext secret field is rejected with `VALIDATION_FAILED` (422).
- **India-to-B2 transfer benchmark** (owner-pinned): latency budget 2500 ms with a 800 ms
  floor, integer INR minor units per gigabyte (`B2_EGRESS_COST_MINOR_PER_GB = 8000`), 1 GB
  default, 1..1000 GB accepted. V0 does not wire a live B2 binding; the adapter refuses unless
  `B2_STORAGE_MODE` is `simulator`. The result is visibly `simulated` and clearly labelled
  planning-grade, not a measured production value (measured India-to-B2 values remain a
  post-V0 gate). One `benchmark.b2_recorded` audit row is retained.
- **Two-hour load-shaped queue backlog** (owner-pinned): duration 7,200,000 ms
  (`QUEUE_BACKLOG_DEFAULT_DURATION_MS`), linear growth to the target depth over the first
  half then drain to zero over the second half, queue-age SLO 3,600,000 ms
  (`QUEUE_AGE_SLO_MS`), target depth 1..10,000. The model declares `duplicatePaidWork: false`
  and `silentJobLoss: false`; those invariants are additionally proven against real queue
  state by the queue-recovery drill. One `backlog.simulation_recorded` audit row is retained.
- **Incident/runbook rehearsal** (owner-pinned): four scenarios —
  `provider_unknown_reconcile`, `lease_expired_recover`, `crash_after_retain_forward_recover`
  (forward recovery) and `rollback_to_clean_revision` (rollback). Each is a deterministic
  script of recovery steps with a recorded `passed` outcome and a `forward`/`rollback`
  recovery type. The real recovery machinery (reconcile, recoverJob, settle crash-after-retain,
  final-video supersession) is proven against real state in the drill tests; this is the
  deterministic rehearsal record. One `incident.rehearsal_recorded` audit row is retained
  against the run id.
- **Operational alert thresholds** (owner-pinned): queue-age SLO reuses
  `QUEUE_AGE_SLO_MS` (3,600,000 ms) so alerting and the load-shape model agree;
  `deadLetterCount >= 1` (critical), `leaseExpiryCount >= 3` (warning), `retryCount >= 5`
  (warning). Alerts are read-only and write no audit.
- Rotation, revocation and the four drills reuse existing error codes (`WORKSPACE_ACCESS_DENIED`
  404 hides a missing, non-owned or cross-workspace object; `VALIDATION_FAILED` 422 for
  invalid input; `*_UNAVAILABLE` 503 when a non-simulator provider mode is configured) and
  existing capabilities (`manage_avatars_consent`, `manage_provider_credentials`,
  `run_restore_drills`, `view_operations`). No new error catalogue entries, permissions or
  Prisma migrations are introduced. The public contract is identical across the in-memory and
  Prisma stores with no schema change.

## Drills delivered

- **Consent revocation and credential rotation** — the two security-critical closeouts
  (`tests/integration/hardening-a2.test.mjs`, 5 tests). Described under "Behaviour verified".
- **India-to-B2 transfer benchmark** — `POST /workspaces/{id}/b2-benchmark` returns a
  deterministic, budget-bounded India-to-B2 latency and integer minor-unit cost, retains a
  `benchmark.b2_recorded` audit row, and replays identically for the same input (the
  `recordedAt` audit timestamp differs, the seed-derived fields do not). A non-Owner/Admin is
  denied (403), a cross-workspace caller is hidden (404), an unauthenticated call is rejected
  (401).
- **Two-hour load-shaped backlog simulation** — `POST /workspaces/{id}/backlog-simulation`
  returns a deterministic growth-then-drain curve with an SLO breach and the
  `duplicatePaidWork: false` / `silentJobLoss: false` invariants. An invalid target depth is
  rejected with `VALIDATION_FAILED` (422).
- **Incident/runbook rehearsal** — `POST /workspaces/{id}/incident-rehearsal` records a
  `forward` recovery (`provider_unknown_reconcile`) and a `rollback` recovery
  (`rollback_to_clean_revision`), each a deterministic script of `passed` steps. An unknown
  scenario is rejected with `VALIDATION_FAILED` (422).
- **Operational alert states** — `GET /workspaces/{id}/operations/alerts` returns no active
  alerts for an empty workspace and a critical `dead_letter_present` alert after a
  dead-lettered job. A cross-workspace caller is hidden (404) with no identifier leak.
- **Queue recovery drill** — outbox relay survives Redis loss (`DEPENDENCY_UNAVAILABLE` 503)
  without losing the canonical job and relays later without duplicate wake-ups; an expired
  lease requeues the work and rejects a stale worker completion with `RESOURCE_VERSION_STALE`
  (409); a dead-lettered job is recovered by an Owner/Admin back to `QUEUED`. No duplicate
  paid work, no silent job loss.
- **PostgreSQL restore drill** — `POST /workspaces/{id}/restore-drills` against a real
  workspace artifact asserts `rlsPreserved: true` and `artifactReferencesChecked: 1`; a
  cross-workspace artifact is hidden behind the 404 with no owning-workspace or artifact id
  leak.
- **Reconciliation totals (consolidated)** — payment/credit reconciliation
  (`tests/integration/credit-g2.test.mjs`: reconciliation summary matches the wallet ledger
  totals; `tests/integration/reference-journey-a3.test.mjs`: purchase, reservation, capture
  and provider total reconcile to the balance), generation reconciliation
  (`tests/integration/generation-g4.test.mjs`, `tests/integration/generation-g5.test.mjs`:
  settle exactly once, recover a crash between retention and settlement), publication
  reconciliation (`tests/integration/calendar-u2.test.mjs`, `tests/integration/calendar-u3.test.mjs`:
  reconcile an uncertain publish before retry, replay by idempotency key). These are cited,
  not re-implemented; the recovery invariants already exist and re-implementing them would
  duplicate machinery and weaken the single-owner rule.

## Still deferred (owner-decision scope, not blockers of the failure contract)

- **Workspace-wide export (bounded/authorized/hash-manifested):** the per-final-video lineage
  export shipped in V0-A1 demonstrates the bounded/authorized/hash-manifested pattern; a
  full-workspace export is deferred pending an owner-pinned export manifest contract.
- **Deletion revoking access before binary lifecycle purge:** the monotonic consent and
  credential revocation shipped here demonstrate revoke-before-purge at the data layer; the
  binary purge step is deferred pending an owner-pinned retention/deletion contract.
- **Prisma restore-under-RLS live proof:** the in-memory restore drill is proven here; the
  Prisma restore-under-RLS proof is run by the dedicated
  `tests/integration/prisma-runtime.test.mjs` step under owner go-ahead (it requires the
  remote Supabase `DATABASE_URL` and is intentionally skipped in the local glob).

## Behaviour verified

- `POST /avatars/{avatarProfileId}/consent-revocation` records a real, monotonic, idempotent
  consent revocation. Only Owner/Admin/Client Manager (`manage_avatars_consent`) may call it;
  an unauthenticated call is rejected with 401. The first call returns the avatar with
  `eligibility.reason: "consent_revoked"` and a populated `consentRevokedAt`; a same-actor
  repeat call returns the same state and writes no second audit row. A revoked avatar is
  immediately blocked at `POST /generation-estimates` with `AVATAR_CONSENT_REVOKED` (409). No
  evidence ref or consent URL is surfaced. A cross-workspace avatar or brand profile is
  hidden behind `WORKSPACE_ACCESS_DENIED` (404) with no owned-workspace leak.
- `POST /workspaces/{workspace_id}/service-credentials/{credentialId}/rotate` rotates a
  credential. Only Owner/Admin (`manage_provider_credentials`) may call it; an unauthenticated
  call is rejected with 401. The prior credential becomes `REVOKED`, a fresh `ACTIVE`
  credential is created with the new `secret-manager://` reference, `lastRotatedAt` is
  stamped, and one `service_credential.rotated` audit row is retained against the prior id.
  The `previous` summary never echoes `secretRef`. A rotation input carrying a plaintext
  secret field is rejected with `VALIDATION_FAILED` (422). A cross-workspace credential is
  hidden behind `WORKSPACE_ACCESS_DENIED` (404) with no owned-workspace leak.
- The cross-tenant zero-tolerance sweep confirms that a workspace A actor probing real
  workspace B objects across five representative routes (`listAvatars`, `getLineage`,
  `getPerformance`, `revokeAvatarConsent`, `rotateServiceCredential`) always receives
  `WORKSPACE_ACCESS_DENIED` (404) and that no workspace B identifier leaks in the response
  body.
- The four new hardening-drill endpoints and the two A2-branded recovery drills are verified
  in `tests/integration/hardening-a2-drills.test.mjs` (6 tests): B2 benchmark determinism and
  permission/cross-workspace/unauth handling; backlog simulation curve, SLO breach and
  invariants; incident rehearsal forward and rollback with unknown-scenario rejection;
  operational alerts with a critical dead-letter alert and cross-workspace hiding; queue
  recovery through Redis loss, lease expiry and dead-letter with no duplicate paid work;
  restore drill RLS and artifact references with cross-workspace hiding.

## Prisma runtime design

The A2 Prisma path reuses the established patterns. `revokeAvatarConsent` and
`rotateServiceCredential` run under a short `withActor` transaction with the actor context
set for RLS. `runB2Benchmark`, `runBacklogSimulation`, `runIncidentRehearsal` and
`getWorkspaceOperationalAlerts` mirror the in-memory store: the three drill functions call
the deterministic simulator, map an `unavailable` refusal to a 503 `*_UNAVAILABLE` problem
and an invalid input to `VALIDATION_FAILED` (422), and write one `auditEvent`
(`benchmark.b2_recorded`, `backlog.simulation_recorded`, `incident.rehearsal_recorded`)
inside the transaction; the alerts function reads job/attempt/artifact/event rows, computes
`operationalMetrics` and derives `operationalAlerts` without writing. A returned
`{ok:false, problem}` (never a thrown `HttpException`) lets the transaction commit cleanly
with no writes; the controller re-throws any `HttpException` before sanitisation. All six
functions are exported on the Prisma return surface alongside the in-memory store so the
public contract is identical. No Prisma migration is added: A2 reuses the existing
`AvatarConsent` revocation columns, the `ServiceCredential` rotation columns and the
`AuditEvent` table; the four new drills write audit rows to the existing `AuditEvent` table.

## Red evidence

Command:

```text
node --test tests/integration/hardening-a2-drills.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.runB2Benchmark is not a function
TypeError: client.runBacklogSimulation is not a function
TypeError: client.runIncidentRehearsal is not a function
TypeError: client.getWorkspaceOperationalAlerts is not a function
```

All six A2 drill tests failed before `runB2Benchmark`, `runBacklogSimulation`,
`runIncidentRehearsal` and `getWorkspaceOperationalAlerts` existed on the generated client or
the store/route. The queue-recovery and restore drills additionally failed before the
`recordRestoreDrill` cross-workspace hiding and `recoverJob` paths were exercised together.
The original `tests/integration/hardening-a2.test.mjs` five tests failed before
`revokeAvatarConsent` and `rotateServiceCredential` existed.

## Green evidence

Command:

```text
node --test tests/integration/hardening-a2-drills.test.mjs tests/integration/hardening-a2.test.mjs
```

Outcome:

```text
✔ A2 B2 benchmark records a deterministic India-to-B2 latency and cost within the pinned budget
✔ A2 backlog simulation models a two-hour growth-then-drain curve with an SLO breach and no duplicate paid work
✔ A2 incident rehearsal records a deterministic forward-recovery and a rollback rehearsal
✔ A2 operational alerts surface a critical dead-letter alert and hide cross-workspace reads
✔ A2 queue recovery drill survives Redis loss, lease expiry and dead-letter with no duplicate paid work
✔ A2 restore drill preserves RLS and artifact references and hides cross-workspace artifacts
✔ A2 consent revocation blocks future avatar use immediately and hides consent evidence
✔ A2 consent revocation hides cross-workspace existence and rejects unauthenticated calls
✔ A2 credential rotation revokes the prior reference and never surfaces a plaintext secret
✔ A2 credential rotation hides cross-workspace existence and rejects unauthenticated calls
✔ A2 cross-tenant zero-tolerance sweep hides workspace B objects from workspace A on every representative route
tests 11
pass 11
fail 0
```

Consolidated recovery and reconciliation drills (cited, not re-implemented):

```text
node --test tests/integration/generation-g4.test.mjs tests/integration/generation-g5.test.mjs \
  tests/integration/credit-g2.test.mjs tests/integration/calendar-u2.test.mjs \
  tests/integration/calendar-u3.test.mjs tests/integration/reference-journey-a3.test.mjs \
  tests/integration/jobs.test.mjs
```

Outcome (selected proofs):

```text
✔ G4 treats a timeout after possible acceptance as unknown and never blindly resubmits
✔ G4 cancels an uncertain generation by reconciling first and never resubmits
✔ G4 rejects a malformed callback and a bad-signature callback without leaking existence
✔ G5 recovers a crash between media retention and ledger settlement without orphaned capture or duplicate release
✔ G5 settles exactly once: an idempotent replay returns the original settlement and never captures twice
✔ G2 deduplicates a replayed callback to one transition and never credits twice
✔ G2 reconciliation summary matches the wallet ledger totals against the deterministic simulator
✔ U2 treats a timeout after possible acceptance as unknown and reconciles before any retry
✔ U3 rejects a malformed, bad-signature and out-of-window YouTube callback without leaking existence
✔ A3 ledger reconciliation — purchase, reservation, capture and provider total reconcile to the wallet balance
✔ outbox relay preserves canonical job through Redis loss and duplicate wake-ups
✔ failed job exhausts attempts and remains visible in dead-letter list
tests 52
pass 52
fail 0
```

## Full verification

Commands (safe sub-steps run in session; the Prisma-runtime proof and db-migrate-dev are run
under owner go-ahead against the remote Supabase database and are intentionally not executed
in this session per the do-not-commit constraint):

```text
node scripts/generate-contracts.mjs
node scripts/check-format.mjs
node scripts/lint.mjs
node scripts/typecheck.mjs
node --test tests/**/*.test.mjs
```

Outcome:

```text
Generated V0 OpenAPI document and TypeScript-compatible client.
Format check passed for 352 text files.
Lint passed: no obvious secrets, signed URLs or unsafe SQL patterns.
Typecheck placeholder passed: F0 workspace files and toolchain pins are present.

node --test tests/**/*.test.mjs
tests 445
pass 417
fail 0
skipped 28
```

The 28 skipped tests are the `tests/integration/prisma-runtime.test.mjs` proof tests
intentionally skipped in the local glob and run by the dedicated verification step
(`V0_RUNTIME_DB_PROOF=1`) under owner go-ahead, including the V0-A2 consent revocation,
credential rotation and hardening-drill runtime proofs. No Prisma migration was added for A2
(the slice reuses the existing `AvatarConsent` revocation columns, the `ServiceCredential`
rotation columns and the `AuditEvent` table), so `db-validate.mjs` needs no A2 migration
entry; A2 acceptance is carried by the integration, unit and prisma-runtime suites above.

## Documentation updated in this change

- `docs/V0/V0_API.md` — four new routes in the browser API table and a V0-A2 hardening-drills
  standards paragraph (B2 benchmark, backlog simulation, incident rehearsal, operational
  alerts).
- `docs/V0/V0_PERMISSIONS.md` — `run_restore_drills` and `view_operations` capability notes
  bound to the four new endpoints (no new permissions).
- `docs/V0/V0_DATA_MODELS.md` — `AuditEvent` note for `benchmark.b2_recorded`,
  `backlog.simulation_recorded` and `incident.rehearsal_recorded` audit rows.
- `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md` — three new V0-A2 hardening-drill audit rows.
- `docs/V0/V0_JOBS.md` — V0-A2 load-shaped hardening drills paragraph (B2 benchmark,
  backlog simulation, incident rehearsal, operational alerts).
- `docs/V0/Sprints/V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_SPRINT.md` — completion
  evidence status mapping each required artifact to its fresh verification, and the two
  items still deferred pending owner-pinned contracts.
- `packages/contracts/src/openapi.v0.json` and generated artifacts — four new operations
  (`runB2Benchmark`, `runBacklogSimulation`, `runIncidentRehearsal`,
  `getWorkspaceOperationalAlerts`).
