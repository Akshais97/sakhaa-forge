# Senior Engineer Sprint Review

## Verdict

PASS WITH MINOR FIXES

The A1 blocker from the prior review is fixed in local/API proof: real retained hash mismatches now block lineage exports, and Reviewer-role denial is directly tested. The only remaining caveat is that the Prisma-runtime DB proof is registered but was not executed in this review session.

## Intended Outcome

V0-A1 should expose a complete creative lineage export and observed performance snapshot flow after audience-facing verification. The lineage export must include complete ancestry, stable manifests, retained evidence, cost/ledger context, and must honestly mark missing ancestry or hash mismatch as incomplete or blocked. Performance snapshots must be immutable, observed-only, tenant-isolated and idempotent.

## Implementation Map

- `docs/V0/Sprints/V0-A1_COMPLETE_CREATIVE_LINEAGE_AND_PERFORMANCE_SNAPSHOT_SPRINT.md`: sprint objective, backlog and completion evidence.
- `docs/V0/Evidence/V0-A1_COMPLETE_CREATIVE_LINEAGE_AND_PERFORMANCE_SNAPSHOT_LOCAL_VERIFICATION_2026-06-29.md`: updated evidence, including red/green notes and skipped runtime DB proof note.
- `apps/api/src/workspace-store.mjs`: existing lineage mismatch logic plus test-only in-memory fault-injection hooks gated to `APP_ENV === "test"`.
- `apps/api/src/server.mjs`: `getTestStore(app)` WeakMap side channel populated only in `APP_ENV === "test"`.
- `tests/helpers/server.mjs`: returns `{ baseUrl, store }` for in-process tests; existing callers that only use `baseUrl` remain compatible.
- `tests/integration/lineage-a1.test.mjs`: public API tests for complete lineage, performance, cross-workspace hiding, retained hash mismatch and Reviewer denial.
- `tests/integration/prisma-runtime.test.mjs`: registered skipped runtime DB proof for persisted hash mismatch under RLS.
- `tests/unit/lineage-workflow.test.mjs`, `tests/unit/performance-workflow.test.mjs`, `tests/unit/permissions.test.mjs`: UI state and permission coverage.

## User Flow

1. User completes the publication and audience-verification journey for a final video.
2. User opens lineage for the verified final video.
3. API builds ancestry across brand, script, avatar, estimate, provider, composition, render, final video, review, calendar, publication, verification and initial performance snapshot.
4. API returns a stable manifest with public hashes and no object keys or secrets.
5. If retained final-video sha256 and render-attempt output hash diverge, the public lineage endpoint returns `status: "blocked"` and `mismatches: ["final_video"]`.
6. User can collect and read observed performance snapshots only through authorised Owner/Admin/Client Manager capabilities.
7. A Reviewer receives `PERMISSION_DENIED` for lineage and performance reads.
8. Cross-workspace lineage or performance reads remain hidden.

The user-facing A1 flow is now covered at the API boundary for the prior missing negative cases.

## Critical Issues

None open for the A1 fixes reviewed here.

The prior blocker was:

- missing real hash-mismatch proof.

That is now covered by:

- `A1 blocks lineage when a retained final-video sha256 no longer matches the render attempt output hash`;
- `A1 blocks lineage when the retained render attempt output hash no longer matches the final video`;
- `prisma runtime blocks lineage on a real persisted final-video / render-attempt hash mismatch under RLS` registered in the runtime proof suite.

## Non-Blocking Issues

- The Prisma-runtime DB proof is skipped unless `V0_RUNTIME_DB_PROOF=1` is set. I did not execute it in this session, so I am not claiming the persisted Supabase proof passed fresh here.
- The in-memory fault-injection hooks are acceptable because they are gated to `APP_ENV === "test"` and are not attached to the returned store outside test mode. Keep them out of public routes and generated contracts.

## Second-Order Risks

- If `APP_ENV=test` is ever used against shared or production-like infrastructure, the test store exposure would be available in-process. That is a test-environment hygiene issue, not a public API exposure.
- The runtime DB proof mutates retained hashes directly and restores them. It should continue to run only against approved proof databases, not an uncontrolled remote system of record.
- A1 still depends on U4 initial performance snapshot semantics. U4 exactly-once concerns remain separate from this A1 fix.

## Test Review

Covered:

- Complete lineage export with stable manifest.
- Observed performance snapshot collection.
- Rejection before audience verification.
- Idempotency replay and conflict.
- Cross-workspace lineage and performance hiding.
- Real retained final-video hash mismatch via public lineage endpoint.
- Real retained render-attempt hash mismatch via public lineage endpoint.
- Reviewer denial for lineage and performance reads.
- Permission matrix for `view_lineage_and_performance`.
- UI mapping for complete, incomplete, blocked and hidden states.

Missing:

- Fresh execution of the Prisma-runtime hash-mismatch proof in this review session.

## Commands Run

- `node --test tests\integration\lineage-a1.test.mjs tests\unit\lineage-workflow.test.mjs tests\unit\performance-workflow.test.mjs tests\unit\permissions.test.mjs` -> pass, 26 tests.
- `node --test tests/**/*.test.mjs` -> pass, 395 passed, 28 skipped, 0 failed. Skipped tests are runtime DB proofs gated by `V0_RUNTIME_DB_PROOF=1`.
- `node scripts\check-format.mjs` -> pass, 345 text files.
- `node scripts\lint.mjs` -> pass after rerun outside the Windows sandbox because the sandbox failed to launch the process.
- `node scripts\typecheck.mjs` -> pass after rerun outside the Windows sandbox because the sandbox failed to launch the process.
- `node scripts\generate-contracts.mjs` -> generated V0 OpenAPI document and client successfully.
- `rg -n "corruptRetainedHashForTest|addMembershipRoleForTest|getTestStore|WeakMap|APP_ENV|Reviewer|REVIEWER|view_lineage" apps\api\src\workspace-store.mjs apps\api\src\server.mjs tests\helpers\server.mjs tests\integration\lineage-a1.test.mjs tests\integration\prisma-runtime.test.mjs tests\unit\permissions.test.mjs docs\V0\Evidence\V0-A1_COMPLETE_CREATIVE_LINEAGE_AND_PERFORMANCE_SNAPSHOT_LOCAL_VERIFICATION_2026-06-29.md` -> confirmed hooks, tests and evidence references.

## Fix Plan for Coding Agent

1. No A1 code blocker remains from the prior review.
2. Before claiming persisted Prisma/Supabase proof, run the registered runtime test with `V0_RUNTIME_DB_PROOF=1` against an approved proof database.
3. Keep `corruptRetainedHashForTest`, `addMembershipRoleForTest` and `getTestStore` test-only; do not expose them through public routes, OpenAPI, workers or production helpers.
4. If the branch proceeds to merge, include the updated A1 evidence and this updated review artifact.
