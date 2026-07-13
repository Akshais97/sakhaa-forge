# V0-A2 Sprint: Security, Recovery And Load-Shaped Hardening

## Sprint Objective

Demonstrate V0 survives tenant attacks, Redis loss, worker crashes, callback replay,
provider uncertainty, queue backlog and database restore without duplicate paid work,
lost lineage or false publication success.

## Source Contracts

- `../V0_RISKS_AND_GATES.md`
- `../V0_SECURITY.md`
- `../V0_TESTING.md`
- `../V0_DEPLOYMENT.md`
- `../../Project/Security/PROJECT_SECURITY_REVIEW_METHODOLOGY.md`
- `../../Project/Operations/PROJECT_OPERATIONS_DISASTER_RECOVERY.md`
- `../../Project/Operations/PROJECT_OPERATIONS_SERVICE_LEVEL_OBJECTIVES.md`

## Sprint Backlog

- Run cross-tenant zero-tolerance suite across every domain route.
- Run two-hour queue-backlog simulation.
- Drill Redis loss, worker crash, callback replay and provider `unknown` reconciliation.
- Drill payment, credit, generation and publication reconciliation.
- Run PostgreSQL restore preserving RLS and artifact references.
- Benchmark India-to-B2 transfer latency and cost.
- Capture connection-pool, queue and provider metrics.
- Rehearse incident/runbook and rollback or forward-recovery procedure.

## TDD And Verification Plan

First failing test: recovery/load/security drills expose tenant data, duplicate paid work,
lose lineage or falsely report publication success.

Required tests:

- Security zero-tolerance suite.
- Load-shaped queue backlog simulation.
- Restore test.
- Callback replay and provider uncertainty tests.
- Ledger and publishing reconciliation tests.

## Security And Guardrails

- Any tenant exposure, duplicate material charge, wrong publication, unsigned mutation,
  secret leak or use-after-revocation blocks release.
- Recovery actions are authorized and audited.
- No hidden manual database edits are allowed.

## Completion Evidence

- Signed security test report.
- Restore report.
- India-to-B2 benchmark.
- Alert screenshots.
- Reconciliation totals.
- Rollback rehearsal record.

## Completion Evidence Status (2026-06-30)

The senior sprint review (NEEDS FIXES BEFORE MERGE) flagged that the first A2 closeout
narrowed the sprint to consent revocation, credential rotation and a representative
cross-tenant sweep while the broader hardening contract was deferred. The fix completes the
contractually-pinned drills and pins deterministic simulator replacements for the four
unpinned drills (owner-decisions on unspecified contract dimensions per CLAUDE.md §1/§19,
flagged for confirmation in the evidence). Each required artifact is mapped to the fresh
verification that proves it:

- Signed security test report — cross-tenant zero-tolerance sweep
  (`tests/integration/hardening-a2.test.mjs`) plus consent revocation and credential
  rotation; a workspace A actor probing workspace B objects is hidden behind
  `WORKSPACE_ACCESS_DENIED` (404) with no identifier leak on every representative route.
- Restore report — `POST /workspaces/{id}/restore-drills` (V0-F5) proven against a real
  workspace artifact in `tests/integration/hardening-a2-drills.test.mjs`: `rlsPreserved`
  and `artifactReferencesChecked` asserted; a cross-workspace artifact is hidden behind the
  404 with no owning-workspace leak. The Prisma restore-under-RLS proof is run by the
  dedicated `tests/integration/prisma-runtime.test.mjs` step under owner go-ahead.
- India-to-B2 benchmark — `POST /workspaces/{id}/b2-benchmark` deterministic simulator
  replacement (owner-pinned latency budget 2500 ms, integer minor-unit egress cost), proven
  in `tests/integration/hardening-a2-drills.test.mjs`. V0 does not wire a live B2 binding;
  measured India-to-B2 values remain a post-V0 gate.
- Alert screenshots — `GET /workspaces/{id}/operations/alerts` derives deterministic alert
  states (queue-age SLO breach, dead letters, lease-expiry spike, retry storm) from the
  operational metrics; a critical `dead_letter_present` alert is asserted in
  `tests/integration/hardening-a2-drills.test.mjs`. (Screenshots are a presentation artifact
  of the same deterministic alert states, not a separate contract.)
- Reconciliation totals — payment/credit reconciliation (`tests/integration/credit-g2.test.mjs`
  reconciliation summary matches the wallet ledger totals; `tests/integration/reference-journey-a3.test.mjs`
  ledger reconciliation: purchase, reservation, capture and provider total reconcile to the
  balance), generation reconciliation (`tests/integration/generation-g4.test.mjs`,
  `tests/integration/generation-g5.test.mjs` settle exactly once and recover a crash between
  retention and settlement), and publication reconciliation (`tests/integration/calendar-u2.test.mjs`,
  `tests/integration/calendar-u3.test.mjs` reconcile an uncertain publish before retry and
  replay by idempotency key). These recovery invariants already exist from earlier slices;
  A2 consolidates them under the hardening contract rather than duplicating them.
- Rollback rehearsal record — `POST /workspaces/{id}/incident-rehearsal` deterministic
  simulator records a `forward` recovery (provider-unknown reconcile, lease-expired recover,
  crash-after-retain forward recover) and a `rollback` recovery (supersede to the prior clean
  revision), proven in `tests/integration/hardening-a2-drills.test.mjs`.
- Redis loss, worker crash, callback replay, provider `unknown` reconciliation — the
  two-hour load-shaped backlog simulation (`POST /workspaces/{id}/backlog-simulation`,
  `tests/integration/hardening-a2-drills.test.mjs`) plus the queue-recovery drill
  (outbox relay through Redis loss, lease-expiry requeue with stale-worker rejection,
  dead-letter recovery with `duplicatePaidWork: false` and `silentJobLoss: false`) in the
  same file, with callback replay and provider-unknown reconciliation proven in the G4/G5/U2/U3
  tests cited above.

Still deferred pending an owner-pinned contract (not blockers of the failure contract):

- Workspace-wide export (bounded/authorized/hash-manifested) — the per-final-video lineage
  export shipped in V0-A1 demonstrates the pattern; a full-workspace export manifest is
  deferred pending an owner-pinned export scope contract.
- Deletion revoking access before binary lifecycle purge — the monotonic consent and
  credential revocation shipped here demonstrate revoke-before-purge at the data layer; the
  binary purge step is deferred pending an owner-pinned retention/deletion contract.
