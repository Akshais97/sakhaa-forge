# Senior Engineer Sprint Review

## Verdict

PASS WITH MINOR FIXES

The original A2 hardening blocker is closed by deterministic drill routes, A2-branded tests and cited recovery/reconciliation tests. The remaining issue is documentation governance: `V0_VERTICAL_OUTCOME_SLICES.md` still says A2 also proves workspace-wide export and deletion-before-binary-purge, while the sprint/evidence now defer those pending owner-pinned contracts.

## Intended Outcome

V0-A2 should prove that V0 survives tenant attacks, Redis loss, worker crashes, callback replay, provider uncertainty, queue backlog and database restore without duplicate paid work, lost lineage or false publication success. It should retain evidence for security drills, restore drills, India-to-B2 benchmark, reconciliation totals, alerts and rollback or forward-recovery rehearsal.

## Implementation Map

- `docs/V0/Sprints/V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_SPRINT.md`: sprint objective, backlog, completion-evidence mapping and remaining owner-decision deferrals.
- `docs/V0/Evidence/V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_LOCAL_VERIFICATION_2026-06-30.md`: updated evidence with commands, outcomes and deferred owner-decision notes.
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`: A2 acceptance row and still-unreconciled "also proves" export/deletion text.
- `docs/V0/V0_API.md`, `V0_PERMISSIONS.md`, `V0_DATA_MODELS.md`, `V0_ANALYTICS_EVENT_TAXONOMY.md`, `V0_JOBS.md`: updated route, permission, audit and drill contracts.
- `apps/api/src/b2-transfer-benchmark-provider.mjs`: deterministic India-to-B2 transfer benchmark provider.
- `apps/api/src/queue-backlog-provider.mjs`: deterministic two-hour backlog simulation provider.
- `apps/api/src/incident-rehearsal-provider.mjs`: deterministic incident/runbook rehearsal provider.
- `apps/api/src/server.mjs`: A2 routes and server-side permission checks.
- `apps/api/src/workspace-store.mjs`: in-memory and Prisma implementations for B2 benchmark, backlog simulation, incident rehearsal, operational alerts, restore, credential rotation and consent revocation.
- `packages/contracts/generated/v0-client.mjs`: generated client methods for A2 drill routes.
- `tests/integration/hardening-a2-drills.test.mjs`: A2 drill integration tests.
- `tests/integration/hardening-a2.test.mjs`: consent revocation, credential rotation and cross-tenant sweep.
- Cited owner tests: `credit-g2`, `generation-g4`, `generation-g5`, `calendar-u2`, `calendar-u3`, `jobs-f4`, `operations-f5`, `reference-journey-a3`.

## User Flow

1. Owner/Admin runs the B2 benchmark for a workspace.
2. API authorizes with `run_restore_drills`, uses the deterministic simulator, returns visibly simulated India-to-B2 latency/cost and retains `benchmark.b2_recorded`.
3. Owner/Admin runs the backlog simulation.
4. API returns a two-hour growth/drain curve with SLO breach and no duplicate paid work/silent job loss flags, retaining `backlog.simulation_recorded`.
5. Owner/Admin runs incident rehearsal.
6. API records deterministic forward-recovery or rollback steps and retains `incident.rehearsal_recorded`.
7. Owner/Admin reads operational alerts through `view_operations`.
8. API derives queue-age/dead-letter/lease/retry alerts and hides cross-workspace reads.
9. Existing A2 behaviours still block future use after avatar consent revocation, rotate credentials without exposing secrets and hide cross-tenant targets.

The hardening user journey now exists through generated contracts and server-side permission checks.

## Critical Issues

None open for the original A2 hardening review blocker.

The prior blocker was that A2 deferred most of the hardening contract. That is now addressed by:

- `POST /workspaces/{id}/b2-benchmark`;
- `POST /workspaces/{id}/backlog-simulation`;
- `POST /workspaces/{id}/incident-rehearsal`;
- `GET /workspaces/{id}/operations/alerts`;
- `tests/integration/hardening-a2-drills.test.mjs`;
- cited recovery and reconciliation tests across F4/F5/G2/G4/G5/U2/U3/A3.

## Non-Blocking Issues

- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md` still says A2 also proves workspace export is bounded/authorized/hash-manifested and deletion revokes access before binary lifecycle purge. The A2 sprint and evidence now defer full workspace export and binary purge pending owner-pinned contracts. Reconcile the vertical-slice document or add explicit owner governance acceptance before calling those two points closed.
- The Prisma-runtime live proof is registered but skipped in local runs unless `V0_RUNTIME_DB_PROOF=1` is set. I did not execute it because it touches the configured Supabase database.
- The B2 benchmark is deterministic and simulated, not a measured live Backblaze transfer. The evidence labels it as a simulator replacement, which is acceptable for local V0 proof if the owner accepts that scope.

## Second-Order Risks

- A2 now relies on cited owner tests for callback replay, provider unknown reconciliation and ledger/publication reconciliation. That is a reasonable single-owner approach, but future review should keep those cited tests in the verification bundle.
- If workspace-wide export/deletion remain in the vertical slice while sprint evidence defers them, A3/Product V0 closure can overclaim readiness.
- Operational alerts are deterministic local states. Production alerting still needs environment-specific wiring before external launch.

## Test Review

Covered:

- Consent revocation blocks future avatar use and hides consent evidence.
- Credential rotation revokes prior credential and never surfaces plaintext secrets.
- Representative cross-tenant sweep.
- Deterministic B2 benchmark, including budget and cost output.
- Two-hour backlog simulation and no duplicate paid work/silent job loss flags.
- Incident rehearsal forward-recovery and rollback scenarios.
- Operational alerts and cross-workspace hiding.
- Queue recovery through Redis loss, lease expiry, stale-worker rejection, dead-letter and recovery.
- Restore drill preserving RLS and artifact references.
- Cited payment, generation, publication and ledger reconciliation tests.
- Contract generation and generated client route coverage.

Missing:

- Fresh Prisma-runtime DB proof in this review session.
- Governance reconciliation for workspace-wide export and binary purge deferrals.

## Commands Run

- `node --test tests\integration\hardening-a2-drills.test.mjs tests\integration\hardening-a2.test.mjs` -> pass, 11 tests.
- `node --test tests\unit\b2-transfer-benchmark-provider.test.mjs tests\unit\queue-backlog-provider.test.mjs tests\unit\incident-rehearsal-provider.test.mjs tests\unit\permissions.test.mjs` -> pass, 21 tests.
- `node --test tests\integration\credit-g2.test.mjs tests\integration\generation-g4.test.mjs tests\integration\generation-g5.test.mjs tests\integration\calendar-u2.test.mjs tests\integration\calendar-u3.test.mjs tests\integration\reference-journey-a3.test.mjs tests\integration\jobs-f4.test.mjs tests\integration\operations-f5.test.mjs` -> pass, 51 tests.
- `node --test tests\contract\openapi-generation.test.mjs` -> pass, 2 tests.
- `node scripts\check-format.mjs` -> pass, 352 text files.
- `node scripts\generate-contracts.mjs` -> generated V0 OpenAPI document and TypeScript-compatible client.
- `node scripts\lint.mjs` -> pass after rerun outside the Windows sandbox because sandbox launch failed with `CreateProcessAsUserW`.
- `node scripts\typecheck.mjs` -> pass after rerun outside the Windows sandbox because sandbox launch failed with `CreateProcessAsUserW`.
- `rg -n "b2-benchmark|backlog-simulation|incident-rehearsal|operations/alerts|hardening-a2-drills|benchmark.b2_recorded|backlog.simulation_recorded|incident.rehearsal_recorded|full-workspace export|deletion|binary-purge|Redis loss|worker crash|provider unknown|reconciliation|restore" docs\V0 apps\api\src tests packages\contracts packages\db\prisma\schema.prisma` -> traced routes, docs, tests and evidence.
- `rg -n -C 4 "deletion revokes access|Workspace-wide export|V0-A2|Outcome.*Operators demonstrate" docs\V0\V0_VERTICAL_OUTCOME_SLICES.md docs\V0\Sprints\V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_SPRINT.md docs\V0\Evidence\V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_LOCAL_VERIFICATION_2026-06-30.md` -> confirmed remaining vertical-slice deferral tension.

## Fix Plan for Coding Agent

1. No code blocker remains from the original A2 hardening review.
2. Reconcile `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md` with the A2 sprint/evidence deferral for full workspace export and binary purge, or add explicit owner governance acceptance.
3. Before claiming live DB proof, run the registered Prisma-runtime tests with `V0_RUNTIME_DB_PROOF=1` against an approved proof database.
4. Keep the cited reconciliation/recovery owner tests in the A2 verification bundle.
